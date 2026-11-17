# -*- coding: utf-8 -*-
"""LÁI CHROME QUA CDP — tách khỏi `probe_live.py` ngày 2026-09-12 để **mỗi PHIÊN một browser**.

Vì sao phải tách (đo trên chính bản cũ, không suy đoán):

  · `probe_live.Chrome.__init__` chạy `pkill -f remote-debugging-port=9333` **ngay khi khởi
    động**. Mở phiên thứ hai là GIẾT CHẾT Chrome của phiên thứ nhất — và phiên 1 không chết
    ngay chỗ đó mà chết ở lệnh CDP kế tiếp, nên lỗi hiện ra dưới dạng "Chrome ngắt kết nối"
    ở một chỗ chẳng liên quan. Đúng lớp lỗi im lặng đang phải bịt.
  · `PROF` (user-data-dir) là MỘT thư mục dùng chung `/tmp/qa-chrome-probe`. Đó chính là kho
    cookie/localStorage của Chrome ⇒ hai phiên dùng chung là **đè trạng thái đăng nhập của
    nhau**: đăng nhập tài khoản B xong thì phiên A thành tài khoản B mà không báo gì.
  · `close()` cũng `pkill` theo cổng ⇒ phiên nào xong trước là dọn sạch phiên còn lại.

Cách chữa: `Chrome` nhận `port` + `profile`; phiên nào cũng có cổng riêng và thư mục profile
riêng. Dọn tiến trình bằng **`killpg` đúng nhóm tiến trình của chính mình**
(`start_new_session=True` khi bật), không giết theo mẫu.

Ba thứ sửa tiếp ngày 2026-09-14 (xem ghi chú tại chỗ ở mục 0 · 1 · 2):

  · **cổng** — cách cũ (`bind(0)` → `close()` → đưa số cho Chrome) có khe hở để tiến trình
    khác chiếm mất cổng, mà Chrome mất cổng **vẫn chạy tiếp** ⇒ `/json/version` ở cổng đó vẫn
    có người trả lời: **Chrome của phiên khác**. Cả lượt soi chạy trên cookie của phiên đó,
    không một dòng lỗi. Nay hai đường, hai cách chứng minh:
      - `port='auto'` (đường PHIÊN): chạy `--remote-debugging-port=0` rồi đọc cổng THẬT ở
        `<user-data-dir>/DevToolsActivePort` — file do chính Chrome đó ghi vào chính profile
        của phiên đó, không còn khe hở nào để tranh.
      - cổng CỐ ĐỊNH (đường cũ, `QA_CDP_PORT`): Chrome **không** ghi `DevToolsActivePort` khi
        cổng khác 0 (đo trên Chrome 150), nên hỏi thẳng kernel *ai đang nghe cổng này*
        (`_chu_cong()` — `/proc/net/tcp` + inode của fd) và đối chiếu với cây tiến trình của
        mình; là của người khác thì DỪNG, không tra được thì không kết luận.
  · **WebSocket** — đọc đúng RFC 6455 (phân mảnh · ping/pong · close), có hạn giờ cho mỗi lệnh
    CDP, mọi lỗi kèm tên lệnh.
  · **đính kèm** — `dinh_kem=<cổng>` dùng LẠI Chrome mà lượt `--hien` trước còn giữ, thay vì
    mở cái thứ hai trên cùng `user-data-dir` (Chrome thứ hai sẽ tự thoát, và lượt mới chết
    bằng một câu lỗi chẳng liên quan).

GIỮ NGUYÊN HÀNH VI CŨ: gọi `Chrome()` không tham số thì vẫn là cổng `QA_CDP_PORT` (9333),
profile `QA_CDP_PROFILE` (`/tmp/qa-chrome-probe`) và vẫn `pkill` theo cổng như trước —
`probe_live.py <url>` không đổi một nét nào.

Không cần `pip install`: WebSocket viết bằng thư viện chuẩn (giữ cam kết "Python 3 thuần").
"""
import base64
import collections
import errno
import json
import os
import re
import signal
import socket
import struct
import subprocess
import threading
import shutil
import time
import urllib.request

try:
    import fcntl                       # POSIX: khoá cổng liên tiến trình
except ImportError:                    # Windows — chỉ mất lớp cảnh báo cổng, phần còn lại chạy
    fcntl = None

PORT = int(os.environ.get('QA_CDP_PORT', '9333'))
PROF = os.environ.get('QA_CDP_PROFILE') or '/tmp/qa-chrome-probe'
# Tên lệnh Chrome KHÁC nhau theo bản phân phối (`google-chrome` trên Debian/Ubuntu,
# `chromium` trên Arch/Fedora, `chromium-browser` trên bản cũ, đường dẫn .app trên macOS).
# Chốt cứng một tên thì trên máy khác lượt chạy chết ngay ở bước mở trình duyệt. Vẫn giữ
# `google-chrome` làm giá trị cuối để thông báo lỗi không đổi khi máy KHÔNG có trình duyệt nào.
_UNG_VIEN = ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
             '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')


def _tim_chrome():
    for c in _UNG_VIEN:
        if os.path.isabs(c):
            if os.path.isfile(c) and os.access(c, os.X_OK):
                return c
        elif shutil.which(c):
            return c
    return 'google-chrome'


CHROME = os.environ.get('QA_CHROME') or _tim_chrome()


def die(msg):
    raise SystemExit('LỖI: ' + msg)


# ══════════════════════════════════════════════════════════════════════════════
# 0. CỔNG CDP  (nhiều phiên chạy SONG SONG, kể cả ở nhiều TIẾN TRÌNH khác nhau)
# ══════════════════════════════════════════════════════════════════════════════
# Cách cũ — `bind(('127.0.0.1', 0))` lấy số cổng, `close()`, rồi mới truyền số đó cho Chrome —
# có một khe hở KHÔNG bịt được từ phía Python: giữa `close()` và lúc Chrome bind, bất kỳ tiến
# trình nào trên máy cũng có thể chiếm cổng ấy. Sổ `_DA_PHAT` chỉ chặn trùng trong CÙNG một
# tiến trình Python, nên hai lượt `probe_live.py` chạy song song vẫn bốc trúng nhau như thường.
# Và hậu quả thì im lặng: Chrome không bind được cổng gỡ lỗi vẫn CHẠY TIẾP, nên `/json/version`
# ở cổng đó vẫn có người trả lời — Chrome của **phiên khác**.
#
# Từ 2026-09-14 đường PHIÊN (`port='auto'`) không xin cổng nữa mà chạy `--remote-debugging-port=0`
# rồi đọc cổng THẬT ở `<user-data-dir>/DevToolsActivePort` — file do chính Chrome đó ghi vào
# chính profile của phiên đó. Không còn khe hở để tranh, và cổng đọc được chắc chắn là của nó.
# `cong_trong()` giữ lại cho chỗ nào đang gọi (API cũ), không còn nằm trên đường chạy chính.
_DA_PHAT = set()
_KHOA_CONG = threading.Lock()


def cong_trong():
    """(API cũ) Một cổng TCP còn trống trên 127.0.0.1 — xem ghi chú trên về khe hở."""
    with _KHOA_CONG:
        for _ in range(60):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                s.bind(('127.0.0.1', 0))
                p = s.getsockname()[1]
            finally:
                s.close()
            if p not in _DA_PHAT:
                _DA_PHAT.add(p)
                return p
    die('không xin được cổng CDP trống sau 60 lần thử')


# ══════════════════════════════════════════════════════════════════════════════
# 1. CLIENT WEBSOCKET  (đủ để nói CDP — RFC 6455: phân mảnh · ping/pong · close)
# ══════════════════════════════════════════════════════════════════════════════
# Vá 2026-09-14. Bản trước chỉ biết **một** thứ: khung text không phân mảnh (`(b0&0x0f)==1`),
# mọi khung khác bị ĂN IM LẶNG trong vòng `while True`. Bốn hậu quả đo được, đều thuộc lớp
# "tool báo chạy được nhưng thực ra sai":
#   · **ping** (0x9) không được pong lại ⇒ Chrome coi client chết và đóng kết nối giữa chừng;
#     lỗi hiện ra ở lệnh CDP kế tiếp, chẳng liên quan gì chỗ hỏng.
#   · **close** (0x8) bị bỏ qua ⇒ `call()` quay vòng đến hết 60 giây rồi `die()` bằng câu
#     "CDP không trả lời" — sai nguyên nhân (Chrome đã chủ động đóng, không phải chậm).
#   · **phân mảnh**: khung text FIN=0 vẫn khớp `opcode==1` nên `json.loads` ăn nửa payload ⇒
#     `JSONDecodeError` bung giữa lượt soi. Khung nối tiếp (opcode 0) thì bị bỏ luôn.
#   · **hết giờ**: `socket.create_connection(timeout=25)` đặt timeout cho MỌI `recv`, nên
#     vòng chờ 60 giây của `call()` không bao giờ chạy hết — `socket.timeout` bung trước ở
#     giây 25 với câu "timed out" trống rỗng.
# Nay: đọc đúng khung theo RFC 6455, ghép mảnh, tự pong, dịch mọi lỗi mạng thành câu có
# nghĩa **kèm tên lệnh CDP**, và một hạn mức thời gian DUY NHẤT cho cả lượt gọi.
GIO_CDP = int(os.environ.get('QA_CDP_TIMEOUT', '60'))       # hạn mức một lệnh CDP (giây)
_TXT, _BIN, _CONT, _CLOSE, _PING, _PONG = 0x1, 0x2, 0x0, 0x8, 0x9, 0xA


def _gon_su_kien(ev):
    """Giữ lại ĐÚNG phần cần cho sổ mạng, bỏ mọi thứ mang bí mật — ngay lúc bắt được sự kiện.

    `Network.requestWillBeSent` mang cả `request.headers` (có `Authorization`, `Cookie`) và
    `request.postData` (có mật khẩu lúc đăng nhập). Giữ nguyên rồi mới lọc lúc ghi ra đĩa là
    để bí mật nằm trong bộ nhớ tiến trình suốt lượt chạy, và chỉ cần một traceback in `repr`
    của hàng đợi là lộ. Cắt ở đây thì **không có đường nào** để chúng đi tiếp.

    Phần che URL (token nằm trong query/path) là LUẬT dùng chung -> `qalib.che_url`, không làm
    ở đây; chỗ này chỉ cắt cấu trúc.
    """
    p = (ev or {}).get('params') or {}
    rq = p.get('request')
    if not isinstance(rq, dict):
        return None                    # không phải một REQUEST -> không có chỗ trong sổ mạng
    return {'method': ev.get('method'),
            'params': {'requestId': p.get('requestId'),
                       'type': p.get('type'),
                       'timestamp': p.get('timestamp'),
                       'wallTime': p.get('wallTime'),
                       'request': {'method': rq.get('method'),
                                   'url': (rq.get('url') or '')[:2000],
                                   'has_post_data': bool(rq.get('postData')
                                                         or rq.get('hasPostData'))}}}


def _gon_chan(ev):
    """Giữ ĐÚNG phần cần để TRẢ LỜI một `Fetch.requestPaused`, bỏ mọi thứ mang bí mật.

    Cùng luật với `_gon_su_kien`: `request.headers` của sự kiện này mang `Authorization` +
    `Cookie` của phiên đang đăng nhập, `postData` mang mật khẩu lúc đăng nhập. Chúng bị cắt
    NGAY TẠI ĐÂY nên không có đường nào đi tiếp vào evidence hay log.

    `networkId` là thứ buộc một request bị chặn với chính bản ghi của nó trong SỔ MẠNG
    (`Network.requestWillBeSent.requestId`). Không có nó thì không chứng minh được "request
    ghi này đã bị giữ lại tại trình duyệt, chưa từng tới máy chủ" — xem `qalib` §4e.
    """
    p = (ev or {}).get('params') or {}
    rq = p.get('request') or {}
    if not p.get('requestId'):
        return None
    return {'requestId': p.get('requestId'),
            'networkId': p.get('networkId'),
            'method': (rq.get('method') or '').upper(),
            'url': (rq.get('url') or '')[:2000],
            'tai_nguyen': (p.get('resourceType') or '')[:20],
            'ma_tt': p.get('responseStatusCode'),
            'pha': 'Response' if p.get('responseStatusCode') is not None else 'Request'}


class LoiCDP(RuntimeError):
    """Chrome trả `error` cho một lệnh CDP (lỗi NGHIỆP VỤ, kết nối vẫn tốt)."""


class MatKetNoi(ConnectionError):
    """Kết nối CDP đứt / Chrome đóng / socket hỏng — KHÔNG bao giờ treo vô hạn."""


class WS:
    def __init__(self, url, timeout=25):
        m = re.match(r'ws://([^:/]+):(\d+)(/.*)', url)
        if not m:
            die('URL WebSocket lạ: %s' % url)
        host, port, path = m.group(1), int(m.group(2)), m.group(3)
        self.url = url
        self.dong = False
        self.s = socket.create_connection((host, port), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(('GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\n'
                        'Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n'
                        'Sec-WebSocket-Version: 13\r\n\r\n' % (path, host, port, key)).encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            try:
                d = self.s.recv(4096)
            except (socket.timeout, OSError) as e:
                self.close()
                die('không bắt tay được WebSocket với Chrome (%s)' % (e,))
            if not d:
                self.close()
                die('Chrome đóng kết nối khi bắt tay WebSocket')
            buf += d
        if b'101' not in buf.split(b'\r\n')[0]:
            self.close()
            die('bắt tay WebSocket thất bại: %s' % buf[:120])
        self.buf = buf.split(b'\r\n\r\n', 1)[1]
        self.i = 0
        # ── SỔ SỰ KIỆN (thêm 2026-09-15 cho lớp B — chạy case).  MẶC ĐỊNH TẮT ⇒ đường chạy
        # của `probe_live` không đổi một nét. Bật lên thì mọi thông điệp CDP KHÔNG có `id`
        # (= sự kiện) có `method` khớp `loc_su_kien` được giữ lại tại đây thay vì bị bỏ đi
        # trong `call()`. Dùng để CHỨNG MINH "lượt chạy chỉ phát sinh GET": chặn ở tầng ý
        # định (không bấm nút Lưu) là lời hứa của script, còn đây là bằng chứng đọc từ
        # chính Chrome. Vẫn KHÔNG nhận sự kiện làm phản hồi của lệnh — phép kiểm ② của
        # `tu_kiem/kiem_ws.py` đo đúng chỗ đó.
        self.su_kien = collections.deque(maxlen=int(os.environ.get('QA_CDP_EVENTS', '4000')))
        self.loc_su_kien = ()          # () = không ghi gì; ('Network.requestWillBeSent',) …
        # `deque(maxlen=)` vứt bản ghi CŨ NHẤT **không nói một lời** khi đầy. Với một cái sổ
        # dùng làm BẰNG CHỨNG thì đó là lỗ tệ nhất: request `DELETE` có thể là đúng cái bị
        # vứt, và lượt chạy vẫn báo "0 WRITE". Đếm ở đây (2026-09-15, PHẦN 5) để chỗ nào đọc
        # sổ cũng biết mình đang đọc một cái sổ THIẾU, và `chay_live.kiem_so_mang` fail-closed.
        self.su_kien_bo = 0
        # ── SỔ CHẶN (thêm 2026-09-16 cho lớp mô phỏng mạng `mock_live.py`).  Cũng MẶC ĐỊNH
        # TẮT. Để RIÊNG chứ không dùng chung `su_kien` vì hai sổ có hai vai trò trái nhau:
        # `su_kien` là BẰNG CHỨNG (không được mất bản ghi nào), còn sổ này là HÀNG ĐỢI VIỆC
        # (mỗi `Fetch.requestPaused` phải được trả lời đúng một lần rồi bỏ đi). Trộn chúng
        # thì một lần `lay_mang()` xoá hàng đợi là trang treo vĩnh viễn vì không ai trả lời
        # request đang bị giữ.
        self.su_kien_chan = collections.deque(maxlen=int(os.environ.get('QA_CDP_CHAN', '2000')))
        self.loc_chan = ()             # () = không chặn; ('Fetch.requestPaused',) khi bật mock
        self.su_kien_chan_bo = 0

    # ── gửi ──────────────────────────────────────────────────────────────────────
    def _khung(self, opcode, payload=b''):
        """Một khung CÓ MASK (RFC 6455 §5.3 — khung client->server bắt buộc mask)."""
        n, mask = len(payload), os.urandom(4)
        h = bytes([0x80 | opcode])
        if n < 126:
            h += bytes([0x80 | n])
        elif n < 65536:
            h += bytes([0x80 | 126]) + struct.pack('>H', n)
        else:
            h += bytes([0x80 | 127]) + struct.pack('>Q', n)
        return h + mask + bytes(b ^ mask[j % 4] for j, b in enumerate(payload))

    def _gui(self, opcode, payload=b''):
        try:
            self.s.sendall(self._khung(opcode, payload))
        except OSError as e:
            self.dong = True
            raise MatKetNoi('không gửi được sang Chrome: %s' % e)

    def _send(self, obj):
        self._gui(_TXT, json.dumps(obj).encode())

    # ── nhận ─────────────────────────────────────────────────────────────────────
    def _need(self, n, han):
        """Đọc cho đủ `n` byte, KHÔNG vượt mốc thời gian `han` (giây tuyệt đối)."""
        while len(self.buf) < n:
            con = han - time.time()
            if con <= 0:
                raise TimeoutError('hết giờ chờ dữ liệu từ Chrome')
            try:
                self.s.settimeout(min(con, 5.0))
                d = self.s.recv(1 << 16)
            except socket.timeout:
                continue                      # chưa tới hạn chung -> chờ tiếp
            except OSError as e:              # socket đã đóng (watchdog giết Chrome) …
                self.dong = True
                raise MatKetNoi('kết nối tới Chrome hỏng: %s' % e)
            if not d:
                self.dong = True
                raise MatKetNoi('Chrome ngắt kết nối')
            self.buf += d

    def _doc_khung(self, han):
        """Một khung thô -> (fin, opcode, payload). Hiểu cả khung server lỡ mask."""
        self._need(2, han)
        b0, b1 = self.buf[0], self.buf[1]
        fin, op, co_mask, ln, off = b0 & 0x80, b0 & 0x0f, b1 & 0x80, b1 & 0x7f, 2
        if ln == 126:
            self._need(4, han)
            ln = struct.unpack('>H', self.buf[2:4])[0]
            off = 4
        elif ln == 127:
            self._need(10, han)
            ln = struct.unpack('>Q', self.buf[2:10])[0]
            off = 10
        if co_mask:
            self._need(off + 4, han)
            mask = self.buf[off:off + 4]
            off += 4
        self._need(off + ln, han)
        pay, self.buf = self.buf[off:off + ln], self.buf[off + ln:]
        if co_mask:
            pay = bytes(b ^ mask[j % 4] for j, b in enumerate(pay))
        return fin, op, pay

    def _recv(self, han=None):
        """Một THÔNG ĐIỆP hoàn chỉnh dạng JSON. Khung điều khiển xử ngay tại chỗ.

        Trả `None` cho thông điệp không phải JSON-của-CDP (khung nhị phân) thay vì
        nổ — CDP không dùng khung nhị phân, nhưng nhận được cũng không được chết.
        """
        han = time.time() + GIO_CDP if han is None else han
        manh, op_dau = [], None
        while True:
            fin, op, pay = self._doc_khung(han)
            if op == _CLOSE:                      # Chrome chủ động đóng -> nói đúng nguyên nhân
                ma = struct.unpack('>H', pay[:2])[0] if len(pay) >= 2 else 0
                ly_do = pay[2:].decode('utf-8', 'replace')[:120]
                self.dong = True
                try:
                    self._gui(_CLOSE, pay[:2])    # đáp lễ rồi mới đóng (RFC 6455 §5.5.1)
                except Exception:
                    pass
                raise MatKetNoi('Chrome đóng kết nối WebSocket (mã %d%s)'
                                % (ma, ' — ' + ly_do if ly_do else ''))
            if op == _PING:                       # KHÔNG pong = Chrome coi client chết
                self._gui(_PONG, pay)
                continue
            if op == _PONG:
                continue
            if op == _CONT:
                if op_dau is None:                # mảnh nối mà chưa có mảnh đầu -> khung rác
                    raise MatKetNoi('khung WebSocket nối tiếp không có khung mở đầu')
                manh.append(pay)
            elif op in (_TXT, _BIN):
                if op_dau is not None:
                    raise MatKetNoi('khung WebSocket mới chen giữa lượt phân mảnh')
                op_dau, manh = op, [pay]
            else:
                continue                          # opcode dành riêng -> bỏ qua, không chết
            if not fin:
                continue
            du_lieu, op_xong, op_dau, manh = b''.join(manh), op_dau, None, []
            if op_xong != _TXT:
                return None                       # khung nhị phân: CDP không dùng
            try:
                return json.loads(du_lieu)
            except ValueError as e:
                raise MatKetNoi('khung WebSocket không phải JSON (%s)' % e)

    # ── một lệnh CDP ─────────────────────────────────────────────────────────────
    def call(self, method, giay=None, **params):
        """Gửi một lệnh CDP và chờ ĐÚNG phản hồi của nó.

        · sự kiện (không có `id`) và phản hồi của lệnh cũ (id khác) -> bỏ qua, không
          nhầm thành phản hồi của lệnh này;
        · hết `giay` (mặc định `QA_CDP_TIMEOUT`=60) -> `TimeoutError` kèm tên lệnh;
        · Chrome đứt -> `MatKetNoi` kèm tên lệnh. Không đường nào treo vô hạn.
        """
        if self.dong:
            raise MatKetNoi('%s: kết nối CDP đã đóng' % method)
        self.i += 1
        stt = self.i
        self._send({'id': stt, 'method': method, 'params': params})
        han = time.time() + (giay or GIO_CDP)
        while True:
            if time.time() >= han:
                raise TimeoutError('CDP không trả lời sau %d giây: %s'
                                   % (giay or GIO_CDP, method))
            try:
                m = self._recv(han)
            except MatKetNoi as e:
                raise MatKetNoi('%s: %s' % (method, e))
            except TimeoutError:
                raise TimeoutError('CDP không trả lời sau %d giây: %s'
                                   % (giay or GIO_CDP, method))
            if not isinstance(m, dict) or m.get('id') != stt:
                # Sự kiện (không `id`) vẫn KHÔNG được nhận làm phản hồi — chỉ được GHI SỔ khi
                # người gọi đã bật `loc_su_kien`. Không bật thì rơi đúng như trước.
                if self.loc_su_kien and isinstance(m, dict) and 'id' not in m:
                    # KHỚP ĐÚNG TÊN, không khớp tiền tố. `Network.requestWillBeSent` và
                    # `Network.requestWillBeSentExtraInfo` là HAI sự kiện khác nhau: cái sau
                    # không có `request` (nên vào sổ thành 6 dòng `UNKNOWN` giả) và lại mang
                    # `associatedCookies` + header — đúng thứ sổ mạng không được chạm tới.
                    if (m.get('method') or '') in self.loc_su_kien:
                        gon = _gon_su_kien(m)
                        if gon:
                            if self.su_kien.maxlen and len(self.su_kien) >= self.su_kien.maxlen:
                                self.su_kien_bo += 1      # sắp vứt cái cũ nhất -> ĐẾM, không im
                            self.su_kien.append(gon)
                if self.loc_chan and isinstance(m, dict) and 'id' not in m:
                    if (m.get('method') or '') in self.loc_chan:
                        gon = _gon_chan(m)
                        if gon:
                            if (self.su_kien_chan.maxlen
                                    and len(self.su_kien_chan) >= self.su_kien_chan.maxlen):
                                self.su_kien_chan_bo += 1
                            self.su_kien_chan.append(gon)
                continue                          # sự kiện / phản hồi lệnh khác
            if 'error' in m:
                raise LoiCDP('%s: %s' % (method, m['error']))
            return m.get('result', {})

    def close(self):
        self.dong = True
        try:
            self.s.close()
        except Exception:
            pass

# ══════════════════════════════════════════════════════════════════════════════
# 2. LÁI CHROME
# ══════════════════════════════════════════════════════════════════════════════
# Đặt ở cấp module, tên `_JS_*`, để `check_js.py` quét và `node --check` được như mọi đoạn JS
# khác: JS sai cú pháp thì CDP trả None KHÔNG kèm lỗi (đúng lớp lỗi im lặng đã trả giá 09/09).
_JS_STORAGE = ("""JSON.stringify((()=>{try{const g=s=>{const o={};
  for(let i=0;i<s.length;i++){const k=s.key(i);
    o[k]=String(s.getItem(k)||'').slice(0,400);}
  return o;};
  return {origin:location.origin, local:g(localStorage),
          session:g(sessionStorage)};}catch(e){return {loi:String(e)};}})())""")


class Chrome:
    """Một tiến trình Chrome + một kết nối CDP.

    port    : `None` = cổng dùng chung cũ (`QA_CDP_PORT`, giữ hành vi cũ) · `'auto'` = để
              **Chrome tự chọn** cổng rồi đọc lại cổng THẬT ở `<profile>/DevToolsActivePort`.
    profile : `None` = `QA_CDP_PROFILE` (dùng chung, hành vi cũ) · đường dẫn = kho
              cookie/localStorage RIÊNG của phiên (đây là chỗ cách ly trạng thái đăng nhập).
    diet_cu : `pkill` theo cổng trước khi mở (hành vi cũ, chỉ đúng khi cổng dùng chung).
              Phiên riêng thì để `False` và truyền `pgid_cu`/`pid_cu` — giết ĐÚNG cây tiến
              trình của lượt chạy trước của CHÍNH phiên này, không đụng phiên khác.
    dinh_kem: cổng CDP của một Chrome ĐANG SỐNG (do `--hien` của lượt trước giữ lại). Có giá
              trị này thì KHÔNG mở tiến trình mới và `close()` KHÔNG giết nó — đó là cách duy
              nhất để `--resume` không dựng Chrome thứ hai trên cùng một `user-data-dir`.
    """

    def __init__(self, hien=False, port=None, profile=None, binary=None,
                 diet_cu=True, pgid_cu=None, pid_cu=None, dinh_kem=None):
        self.profile = os.path.abspath(profile or PROF)
        self.binary = binary or CHROME
        self.hien = hien
        self.p = None
        self.pgid = None
        self.tu_mo = dinh_kem is None     # ta có phải người MỞ Chrome này không
        self.het_gio = False          # watchdog bật cờ này trước khi giết -> báo lỗi cho đúng
        self._cong_giu = None         # khoá cổng liên tiến trình (chỉ đường cổng CỐ ĐỊNH)
        if dinh_kem:
            # ── ĐÍNH KÈM Chrome có sẵn (không mở tiến trình nào) ──────────────────────
            self.port = int(dinh_kem)
            try:
                self.ver = self._http('/json/version')
                self._noi_tab()
            except SystemExit:
                raise
            except Exception as e:
                die('không đính kèm được vào Chrome đang mở ở cổng CDP %d (%s: %s). Cửa sổ đó '
                    'vừa bị đóng? Đóng hẳn nó rồi chạy lại.' % (self.port, type(e).__name__, e))
            return
        if pgid_cu or pid_cu:
            _giet_lua_truoc(pgid_cu, pid_cu, self.profile)
        os.makedirs(self.profile, exist_ok=True)
        _rieng_tu(self.profile, 0o700)    # §6 — profile là kho cookie/token, không để lộ
        tu_chon = (port == 'auto')
        self.port = 0 if tu_chon else int(port or PORT)
        if not tu_chon:
            # Cổng CỐ ĐỊNH: giữ một khoá liên tiến trình để hai tiến trình tool_v2 không cùng
            # nghĩ mình sở hữu cổng đó (khoá tự rơi khi tiến trình chết — không kẹt vĩnh viễn).
            self._cong_giu = _giu_cong(self.port)
            if diet_cu:
                subprocess.run(['pkill', '-f', 'remote-debugging-port=%d' % self.port],
                               capture_output=True)
        f_cong = os.path.join(self.profile, 'DevToolsActivePort')
        _bo_file(f_cong)          # xoá dấu vết lượt trước, nếu không sẽ đọc phải cổng CŨ
        args = [self.binary, '--no-sandbox', '--disable-gpu', '--no-first-run',
                '--remote-debugging-port=%d' % self.port, '--user-data-dir=' + self.profile,
                '--window-size=1600,1000', 'about:blank']
        if not hien:
            args.insert(1, '--headless=new')
        try:
            self.p = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                      start_new_session=True)
        except FileNotFoundError:
            self._tha_cong()
            die('không thấy %s — đặt QA_CHROME=<đường dẫn chrome>' % self.binary)
        try:
            self.pgid = os.getpgid(self.p.pid)
        except Exception:
            self.pgid = None
        # ── CỔNG THẬT: đọc ở `<profile>/DevToolsActivePort` ──────────────────────────────
        # Vì sao không dùng `bind(0)` rồi truyền số đó cho Chrome nữa (vá 2026-09-14): giữa
        # lúc `bind`/`close` trả về cổng và lúc Chrome bind, TIẾN TRÌNH KHÁC chiếm mất là
        # chuyện thật (sổ `_DA_PHAT` chỉ chặn trong cùng một tiến trình Python). Nguy hiểm ở
        # chỗ Chrome mất cổng vẫn CHẠY TIẾP, nên `/json/version` sau đó trả lời — của Chrome
        # NGƯỜI KHÁC. Cả lượt soi chạy trên browser của phiên khác mà không một dòng lỗi.
        # `DevToolsActivePort` do CHÍNH Chrome này ghi vào CHÍNH profile của phiên ⇒ cổng đọc
        # được luôn là cổng của nó, không cần đoán và không có khe hở nào để tranh.
        if tu_chon:
            self.port = self._doi_cong_that(f_cong)
        loi = ''
        for _ in range(60):
            ma = self.p.poll()
            if ma is not None:                # Chrome chết hẳn -> đừng chờ hết 30 giây
                if self.pgid:
                    _giet_nhom(self.pgid)     # dọn zygote/renderer còn sót của chính nó
                self._tha_cong()
                die('Chrome tắt ngay khi vừa mở (mã thoát %s, cổng %d, profile %s). '
                    'Thường là profile đang bị một Chrome khác giữ, hoặc cổng đã có người '
                    'chiếm.' % (ma, self.port, self.profile))
            try:
                self.ver = self._http('/json/version')
                break
            except Exception as e:
                loi = '%s: %s' % (type(e).__name__, e)
                time.sleep(0.5)
        else:
            self.close()
            die('không bật được Chrome ở cổng %d sau 30 giây (%s)' % (self.port, loi))
        if not tu_chon:
            self._kiem_chu_cong()
        try:
            self._noi_tab()
        except BaseException:
            self.close()
            raise

    def _kiem_chu_cong(self):
        """Cổng CỐ ĐỊNH: `/json/version` trả lời rồi, nhưng đó có đúng Chrome VỪA MỞ không?

        Đây là lớp lỗi im lặng nguy hiểm nhất của §2, đo được trên bản trước: Chrome không bind
        được cổng gỡ lỗi thì **vẫn chạy tiếp**, nên cổng đó vẫn có người trả lời — Chrome của
        tiến trình khác. Lượt soi chạy trọn vẹn trên cookie của phiên khác, không một dòng lỗi
        (`document.title` đọc ra đúng tab của phiên kia dù `user-data-dir` khai khác hẳn).

        `DevToolsActivePort` không dùng được ở đây: Chrome chỉ ghi file đó khi cổng là **0**.
        Nên hỏi thẳng kernel *ai đang nghe cổng này*, rồi đối chiếu với cây tiến trình của ta.
        Không tra được (không có `/proc`, thiếu quyền) thì **không kết luận** — giữ nguyên hành
        vi cũ, vì "không đo được" không phải là "sai".
        """
        chu = _chu_cong(self.port)
        if chu is None:
            return                                # không tra được -> không kết luận
        cua_ta = set(_pid_theo_profile(self.profile)) | {self.p.pid if self.p else -1}
        if chu in cua_ta:
            return
        self._giet_minh()
        self._tha_cong()
        die('cổng CDP %d đang do tiến trình %d nắm, KHÔNG phải Chrome vừa mở cho lượt này. '
            'Đi tiếp là lái nhầm browser của người khác (chung cookie, chung phiên đăng nhập) '
            '⇒ dừng. Dùng `--session <id>` để mỗi phiên một cổng riêng, hoặc đặt QA_CDP_PORT '
            'khác cho lượt này.' % (self.port, chu))

    def _noi_tab(self):
        pages = [t for t in self._http('/json/list') if t['type'] == 'page']
        if not pages:
            die('Chrome không có tab nào')
        self.ws = WS(pages[0]['webSocketDebuggerUrl'])
        self.ws.call('Page.enable')
        self.ws.call('Runtime.enable')
        self.ws2 = None               # tab thứ hai (case "2 tab"), mở theo yêu cầu

    # ── TAB THỨ HAI — cho case *"cùng lúc từ 2 tab"*  (§8 của chỉ thị 16/09 lượt 3) ──
    def mo_tab_phu(self, url='about:blank'):
        """Mở TAB THỨ HAI trên CÙNG trình duyệt. -> `TabPhu` hoặc `None`.

        Vì sao là TAB chứ không phải một Chrome thứ hai: bộ case viết đúng chữ *"từ 2 tab
        (hoặc 2 máy)"*, và tab cùng trình duyệt có ba tính chất mà hai tiến trình không có:

          ① **cùng phiên đăng nhập** — không phải đăng nhập lại, không có rủi ro hai tài
             khoản khác nhau làm hỏng ý nghĩa của phép đo tranh chấp;
          ② **MỘT SỔ MẠNG** — `bat_mang` được bật trên cả hai tab và `bom_mang()` gộp sự kiện
             của cả hai vào cùng một sổ. Một phiên ghi mà sổ mạng không nhìn thấy là đúng cái
             lỗ mà §hang_rao_an_toan sinh ra để bịt;
          ③ **một cổng an toàn** — mutation của tab 2 vẫn phải xin `Cong.ghi()` như tab 1,
             vì nó đi qua đúng `live_ui.bam_ghi` với giấy phép của cùng một cửa sổ ghi.

        Trả `None` (không ném lỗi) khi Chrome không cho mở target: case rẽ sang nhánh nói rõ
        *"không dựng được hai phiên"*, chứ không được lặng lẽ chạy một tab rồi kết luận về
        hành vi tranh chấp.
        """
        if getattr(self, 'ws2', None) is not None:
            return TabPhu(self)
        # ⚠️ Tab mở ra bằng `about:blank` rồi MỚI điều hướng — không truyền `url` thẳng vào
        # `Target.createTarget`. Lý do đo được ở bộ tự kiểm ⑨: tạo target kèm URL thì trang
        # bắt đầu tải NGAY, còn ta phải mất mấy nhịp nữa mới nối được WebSocket và bật
        # `Network.enable` ⇒ request đầu tiên của tab 2 (chính là lời gọi danh sách) đã bay
        # xong trước khi sổ mạng kịp mở. Sổ đọc ra 0 request cho một tab vừa tải cả bảng dữ
        # liệu — đúng loại "hàng rào trả lời sạch trong khi nó không quan sát được gì".
        tid = None
        try:
            b = WS(self._http('/json/version')['webSocketDebuggerUrl'])
            try:
                tid = (b.call('Target.createTarget', url='about:blank') or {}).get('targetId')
            finally:
                b.close()
        except Exception:
            tid = None
        try:
            ds = [t for t in self._http('/json/list') if t.get('type') == 'page']
            moi = [t for t in ds if t.get('id') == tid] if tid else []
            if not moi:
                # Không có `targetId` thì lấy tab page KHÁC tab đang dùng — nhưng chỉ khi
                # đúng một tab như vậy tồn tại. Nhiều tab lạ thì không đoán: đoán nhầm tab
                # là gõ phím vào một trang khác rồi kết luận về trang này.
                khac = [t for t in ds
                        if t.get('webSocketDebuggerUrl') != getattr(self.ws, 'url', None)]
                if len(khac) != 1:
                    return None
                moi = khac
            self.ws2 = WS(moi[0]['webSocketDebuggerUrl'])
            self.ws2.call('Page.enable')
            self.ws2.call('Runtime.enable')
            if self.ws.loc_su_kien:
                # CÙNG SỔ: bật `Network.enable` và dùng CHUNG bộ lọc sự kiện của tab 1.
                self.ws2.call('Network.enable')
                self.ws2.loc_su_kien = self.ws.loc_su_kien
        except Exception:
            self.dong_tab_phu()
            return None
        t = TabPhu(self)
        if url and url != 'about:blank':
            # Điều hướng SAU khi sổ đã mở — xem ghi chú ở trên.
            t.go(url)
        return t

    def dong_tab_phu(self):
        if getattr(self, 'ws2', None) is not None:
            try:
                self.ws2.close()
            except Exception:
                pass
            self.ws2 = None

    def _doi_cong_that(self, f_cong):
        """Chờ Chrome ghi `DevToolsActivePort` rồi trả cổng THẬT nó đang nghe.

        ⚠️ Chỉ dùng cho đường `--remote-debugging-port=0`: đo trên Chrome 150 thì file này
        **chỉ được ghi khi cổng là 0**; đưa cổng cố định thì Chrome không ghi gì cả. Đường cổng
        cố định vì thế phải chứng minh bằng cách khác — xem `_kiem_chu_cong()`.
        """
        for _ in range(80):                       # 40 giây — đủ cho máy chậm
            ma = self.p.poll()
            if ma is not None:
                self.pgid = None
                die('Chrome tắt trước khi mở được cổng CDP (mã thoát %s, profile %s) — '
                    'thường là `user-data-dir` đang bị một Chrome khác giữ' % (ma, self.profile))
            try:
                with open(f_cong, encoding='utf-8') as f:
                    n = int((f.readline() or '0').strip())
                if n > 0:
                    return n
            except Exception:
                pass
            time.sleep(0.5)
        self._giet_minh()
        die('Chrome không ghi %s nên không biết nó nghe cổng nào. Đặt --remote-debugging-port '
            'cố định qua QA_CDP_PORT nếu bản Chrome này quá cũ.' % f_cong)

    def _http(self, path):
        return json.load(urllib.request.urlopen(
            'http://127.0.0.1:%d%s' % (self.port, path), timeout=10))

    def js(self, expr):
        r = self.ws.call('Runtime.evaluate', expression=expr,
                         returnByValue=True, awaitPromise=True)
        return r.get('result', {}).get('value')

    def jsj(self, expr):
        """Chạy JS trả JSON -> object Python."""
        v = self.js(expr)
        try:
            return json.loads(v) if isinstance(v, str) else v
        except Exception:
            return v

    def go(self, url):
        self.ws.call('Page.navigate', url=url)

    def wait(self, expr, giay=40, moi=0.4):
        t0 = time.time()
        while time.time() - t0 < giay:
            v = self.js(expr)
            if v:
                return v
            time.sleep(moi)
        return None

    # ── BẰNG CHỨNG (mới 2026-09-12) ───────────────────────────────────────────────
    def shot(self, path):
        """Chụp màn hình ra PNG. Trả đường dẫn, hoặc None nếu chụp không được.

        Chỉ ĐỌC: `Page.captureScreenshot` không chạm gì vào trang.
        """
        try:
            r = self.ws.call('Page.captureScreenshot', format='png')
            d = r.get('data')
            if not d:
                return None
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
            with open(path, 'wb') as f:
                f.write(base64.b64decode(d))
            return path
        except Exception:
            return None

    # ── SỔ MẠNG (thêm 2026-09-15 — hàng rào an toàn của lớp B, `qalib` §4c) ──────
    def bat_mang(self):
        """Bắt đầu ghi sổ mọi request của trang. Trả True khi Chrome nhận `Network.enable`.

        Chỉ ĐỌC: `Network.enable` không chặn, không sửa, không phát sinh request nào — nó chỉ
        làm Chrome kể lại. Cố ý KHÔNG dùng `Fetch.enable` (chặn request) vì chặn là can thiệp
        vào app đang chạy; hàng rào thật nằm ở chỗ script không bấm nút ghi, còn sổ này là
        BẰNG CHỨNG để đối chiếu sau mỗi case.
        """
        try:
            self.ws.call('Network.enable')
        except Exception:
            return False
        self.ws.loc_su_kien = ('Network.requestWillBeSent',)
        self.ws.su_kien.clear()          # xoá TRƯỚC khi bắt đầu ghi — chưa có bằng chứng nào
        self.ws.su_kien_bo = 0
        self.bom_hong = 0
        return True

    def lay_mang(self, xoa=True):
        """Danh sách sự kiện request đã ghi (rồi xoá sổ để lượt/case sau đếm từ đầu).

        `xoa=True` xoá **HÀNG ĐỢI SỰ KIỆN**, không xoá bằng chứng: người gọi vừa cầm bản
        sao đầy đủ trong tay. Đây là loại A của PHẦN 6 (copy xong mới clear buffer); loại B
        — xoá thứ đã tích luỹ — không có ở đây và không được thêm vào.
        """
        ds = list(self.ws.su_kien)
        if xoa:
            self.ws.su_kien.clear()
        return ds

    def so_su_kien_bo(self):
        """Bao nhiêu sự kiện đã bị hàng đợi vứt vì đầy (0 = sổ còn nguyên vẹn).

        Cộng cả TAB PHỤ: một cái sổ thiếu ở tab 2 cũng là một cái sổ thiếu, và
        `chay_live.kiem_so_mang` phải fail-closed như nhau ở cả hai tab.
        """
        n = int(getattr(self.ws, 'su_kien_bo', 0))
        if getattr(self, 'ws2', None) is not None:
            n += int(getattr(self.ws2, 'su_kien_bo', 0))
        return n

    def bom_mang(self):
        """Bơm socket cho sự kiện đang chờ CHẢY VÀO sổ, rồi trả phần mới. -> [sự kiện]

        Vì sao phải có: `WS` chỉ đọc socket trong lúc `call()` chờ phản hồi một lệnh, nên sự
        kiện `Network.requestWillBeSent` chỉ vào sổ khi TÌNH CỜ có lệnh CDP nào đó đang chạy.
        Vòng chấm case của lớp B đọc ảnh chụp DOM sẵn có, **không gọi CDP lần nào** ⇒ không
        bơm thì `lay_mang()` trả rỗng và phép đối chiếu sau mỗi case chỉ là hình thức.

        Cách bơm là gửi **một lệnh CDP chỉ-đọc** rồi để đúng vòng nhận đã có sẵn làm việc:
        CDP trả thông điệp THEO THỨ TỰ trên một kết nối, nên khi phản hồi của lệnh này về
        tới nơi thì mọi sự kiện phát sinh trước đó đã được đọc và ghi sổ. Không thêm một
        đường phân tích khung WebSocket thứ hai (đường ấy có thể đánh rơi khung phân mảnh) —
        chỉ dùng lại đường đã có phép kiểm `kiem_ws.py` bảo chứng.

        `Network.enable` được chọn làm lệnh bơm: nó là lệnh đã dùng ở `bat_mang`, nằm hẳn ở
        phía browser (không chạy JS, không chạm DOM, không phát sinh request nào) và gọi lại
        là vô hại. Lỗi kết nối KHÔNG được ném ra ngoài: bơm hụt thì trả rỗng và bộ đếm
        `bom_hong` cho người đọc biết, chứ không làm chết một lượt chạy đang chấm dở.
        """
        if not self.ws.loc_su_kien:
            return []                     # sổ chưa bật -> không có gì để bơm
        # TAB PHỤ bơm TRƯỚC: sự kiện của nó phải vào sổ ở cùng lượt đối chiếu với tab chính,
        # nếu không thì một request ghi phát từ tab 2 chỉ lộ ra ở lần bơm SAU — tức là sau
        # khi case tiếp theo đã chạy. Bơm hụt ở tab phụ cũng tính vào `bom_hong` để lượt
        # chạy fail-closed y như tab chính.
        phu = []
        if getattr(self, 'ws2', None) is not None and self.ws2.loc_su_kien:
            try:
                self.ws2.call('Network.enable', giay=10)
            except Exception:
                self.bom_hong += 1
            phu = list(self.ws2.su_kien)
            self.ws2.su_kien.clear()
        try:
            self.ws.call('Network.enable', giay=10)
        except Exception:
            # Bơm hụt = **không quan sát được** phần mạng của case vừa chạy. Không ném ra
            # ngoài (một lượt đang chấm dở không nên chết vì một lệnh CDP lỡ nhịp), nhưng
            # cũng KHÔNG được im: đếm lại để `chay_live.kiem_so_mang` fail-closed. Sổ rỗng
            # vì không có request, và sổ rỗng vì không đọc được, đọc lên giống hệt nhau.
            self.bom_hong += 1
        return phu + self.lay_mang()

    def so_bom_hong(self):
        """Bao nhiêu lần bơm sổ mạng KHÔNG đọc được (0 = mọi lần đối chiếu đều có dữ kiện)."""
        return int(getattr(self, 'bom_hong', 0))

    # ── LỚP CHẶN REQUEST (mới 2026-09-16) — nền của `mock_live.py` ───────────────
    # `bat_mang` ở trên cố ý KHÔNG dùng `Fetch.enable` vì chặn là can thiệp vào app đang
    # chạy. Điều đó vẫn đúng cho lượt chạy thường: ba hàm dưới đây MẶC ĐỊNH TẮT và chỉ được
    # bật trong đúng một CỬA SỔ MOCK đã khai trước (`qalib.CuaSoMock`), cho những case mà
    # dữ liệu thật không dựng được (danh sách rỗng · API 500 · timeout…). Ngoài cửa sổ đó
    # không dòng nào trong tool gọi `bat_chan`.
    def bat_chan(self, mau=None):
        """Bật `Fetch.enable` để GIỮ request lại trước khi bay đi. Trả True nếu Chrome nhận.

        `mau` = danh sách `{'urlPattern':…, 'requestStage':'Request'}`. Mặc định giữ MỌI
        request ở pha Request — lọc nằm ở `mock_live`, không ở đây, để một chỗ duy nhất
        quyết định request nào được đi tiếp.
        """
        try:
            self.ws.call('Fetch.enable',
                         patterns=list(mau or [{'urlPattern': '*', 'requestStage': 'Request'}]))
        except Exception:
            return False
        self.ws.loc_chan = ('Fetch.requestPaused',)
        self.ws.su_kien_chan.clear()
        self.ws.su_kien_chan_bo = 0
        return True

    def bom_chan(self):
        """Bơm socket rồi trả về [request đang bị giữ] — và XOÁ chúng khỏi hàng đợi.

        Cùng cách bơm với `bom_mang` (một lệnh CDP chỉ-đọc rồi để đúng vòng nhận đã có sẵn
        làm việc). Khác ở chỗ: sổ này là HÀNG ĐỢI VIỆC nên lấy ra là xoá — người gọi bắt
        buộc phải trả lời từng cái, nếu không trang treo.
        """
        if not self.ws.loc_chan:
            return []
        try:
            self.ws.call('Runtime.evaluate', expression='1', returnByValue=True, giay=10)
        except Exception:
            self.bom_hong += 1
        ds = list(self.ws.su_kien_chan)
        self.ws.su_kien_chan.clear()
        return ds

    def tat_chan(self):
        """Tắt `Fetch.enable` và THẢ mọi request còn bị giữ — không để trang treo."""
        con = []
        try:
            con = self.bom_chan()
        except Exception:
            pass
        for x in con:
            try:
                self.ws.call('Fetch.continueRequest', requestId=x['requestId'], giay=10)
            except Exception:
                pass
        self.ws.loc_chan = ()
        try:
            self.ws.call('Fetch.disable')
            return True
        except Exception:
            return False

    def cookies(self):
        """Cookie của browser context này — dùng để CHỨNG MINH hai phiên không dùng chung."""
        for m in ('Storage.getCookies', 'Network.getCookies'):
            try:
                return self.ws.call(m).get('cookies') or []
            except Exception:
                continue
        return []

    def storage(self):
        """localStorage + sessionStorage của origin đang mở (cắt 400 ký tự mỗi giá trị)."""
        try:
            return self.jsj(_JS_STORAGE) or {}
        except Exception:
            return {}

    # ── DỌN ───────────────────────────────────────────────────────────────────────
    def kill(self, het_gio=False):
        """Giết ngay (watchdog gọi khi quá giờ). Lệnh CDP đang chờ sẽ bung lỗi -> phiên FAILED."""
        self.het_gio = self.het_gio or het_gio
        self.close()

    def close(self):
        """Đóng kết nối, và giết Chrome **nếu chính ta đã mở nó**.

        Vá 2026-09-14 — bỏ `pkill -f remote-debugging-port=<cổng>` ở đường PHIÊN. Cổng phiên
        do Chrome tự chọn trong dải cổng tạm, nên một phiên kết thúc muộn có thể `pkill` đúng
        số cổng mà HỆ ĐIỀU HÀNH đã cấp lại cho Chrome của phiên khác ⇒ "dọn của mình, chết của
        người". Nay giết theo ĐÚNG nhóm tiến trình / PID của chính lượt này; `pkill` chỉ còn ở
        đường CŨ dùng cổng cố định dùng chung (giữ nguyên hành vi trước đây).
        """
        self.dong_tab_phu()           # tab 2 (nếu có) đóng TRƯỚC — cùng vòng đời với tab 1
        try:
            self.ws.close()
        except Exception:
            pass
        if not self.tu_mo:            # Chrome do lượt khác giữ (`--hien`) -> KHÔNG đụng tới
            return
        self._giet_minh()
        self._tha_cong()

    def _giet_minh(self):
        if self.pgid:
            _giet_nhom(self.pgid)
        elif self.p is not None:
            try:
                self.p.terminate()
                self.p.wait(timeout=5)
            except Exception:
                try:
                    self.p.kill()
                except Exception:
                    pass
        if self._cong_giu is not None:
            # Đường CŨ (cổng cố định dùng chung): giữ nguyên lưới `pkill` theo cổng như trước.
            subprocess.run(['pkill', '-f', 'remote-debugging-port=%d' % self.port],
                           capture_output=True)

    def _tha_cong(self):
        f, self._cong_giu = self._cong_giu, None
        if f is not None:
            try:
                if fcntl is not None:
                    fcntl.flock(f, fcntl.LOCK_UN)
            except Exception:
                pass
            try:
                f.close()
            except Exception:
                pass


# ══════════════════════════════════════════════════════════════════════════════
# 3. TIỆN ÍCH TIẾN TRÌNH · CỔNG · QUYỀN FILE
# ══════════════════════════════════════════════════════════════════════════════
class TabPhu:
    """Bọc tab thứ hai để **mọi hàm của `live_ui` dùng được nguyên xi**.

    `live_ui` gọi `c.js` · `c.jsj` · `c.go` · `c.wait` · `c.ws.call`. Lớp này cung cấp đúng
    năm thứ đó, trỏ vào `ws2`. Cố ý KHÔNG cung cấp `bom_mang`/`bat_chan`: sổ mạng và lớp mô
    phỏng chỉ có MỘT chủ là đối tượng `Chrome`, hai chủ thì không ai đối chiếu được với ai.
    """

    def __init__(self, chrome):
        self._c = chrome

    @property
    def ws(self):
        return self._c.ws2

    def js(self, expr):
        r = self.ws.call('Runtime.evaluate', expression=expr,
                         returnByValue=True, awaitPromise=True)
        return r.get('result', {}).get('value')

    def jsj(self, expr):
        v = self.js(expr)
        try:
            return json.loads(v) if isinstance(v, str) else v
        except Exception:
            return v

    def go(self, url):
        self.ws.call('Page.navigate', url=url)

    def wait(self, expr, giay=40, moi=0.4):
        han = time.time() + giay
        while time.time() < han:
            try:
                if self.js(expr):
                    return True
            except Exception:
                pass
            time.sleep(moi)
        return False

    def shot(self, path):
        try:
            d = self.ws.call('Page.captureScreenshot', format='png')
            with open(path, 'wb') as f:
                f.write(base64.b64decode(d['data']))
            return path
        except Exception:
            return None


def _bo_file(p):
    try:
        os.remove(p)
    except OSError:
        pass


def _rieng_tu(p, mode):
    """`chmod` nhưng KHÔNG chết trên hệ không có quyền POSIX (Windows) — §6."""
    if os.name != 'posix':
        return False
    try:
        os.chmod(p, mode)
        return True
    except OSError:
        return False


def _giu_cong(port):
    """Khoá LIÊN TIẾN TRÌNH cho một cổng CDP cố định.

    `_DA_PHAT` chỉ là biến trong bộ nhớ của MỘT tiến trình Python, nên hai lượt `probe_live.py`
    chạy song song vẫn cùng nghĩ cổng 9333 là của mình. Khoá này là một file `flock` ⇒ kernel
    tự thả khi tiến trình chết (không có chuyện kẹt khoá vĩnh viễn). Không giữ được thì vẫn
    chạy tiếp — đây là lưới cảnh báo, không phải hàng rào cứng, và đường cổng cố định là đường
    CŨ một-phiên.
    """
    if fcntl is None:                  # không có `flock` (Windows) -> bỏ lớp khoá, vẫn chạy
        return None
    d = os.path.join(os.environ.get('TMPDIR') or '/tmp', 'qa-cdp-cong')
    try:
        os.makedirs(d, exist_ok=True)
        f = open(os.path.join(d, '%d.lock' % port), 'a+')
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        f.seek(0)
        f.truncate()
        f.write('%d\n' % os.getpid())
        f.flush()
        return f
    except OSError:
        try:
            f.seek(0)
            ai = (f.read() or '?').strip()
            f.close()
        except Exception:
            ai = '?'
        die('cổng CDP %d đang được tiến trình %s dùng. Chạy nhiều lượt cùng lúc thì mỗi lượt '
            'phải có cổng riêng: dùng `--session <id>` (cổng do Chrome tự cấp), hoặc đặt '
            'QA_CDP_PORT khác cho lượt này.' % (port, ai))
    except Exception:
        return None


def con_song(pid):
    """PID còn sống không (chỉ hỏi, không gửi tín hiệu thật)."""
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except OSError as e:
        return e.errno == errno.EPERM       # tồn tại nhưng của người khác
    except Exception:
        return False


def la_chrome_cua_ta(pid, profile):
    """PID này có đúng là Chrome mở trên `profile` của ta không.

    Vì sao phải hỏi (vá 2026-09-14): `state.json` giữ `pgid` của lượt trước. Sau khi lượt đó
    chết, HỆ ĐIỀU HÀNH cấp lại số PID/PGID đó cho tiến trình khác — `killpg(pgid)` thẳng tay là
    **giết nhầm tiến trình vô can của người dùng**. Đối chiếu dòng lệnh trước khi giết thì
    trường hợp trùng số chỉ còn là không-làm-gì, thay vì tai nạn.
    """
    if not con_song(pid):
        return False
    try:
        with open('/proc/%d/cmdline' % int(pid), 'rb') as f:
            dl = f.read().decode('utf-8', 'replace')
    except Exception:
        return False            # không đọc được -> coi như KHÔNG phải của ta (an toàn hơn)
    return ('--user-data-dir=' + os.path.abspath(profile)) in dl


def _giet_lua_truoc(pgid, pid, profile):
    """Dọn xác Chrome của lượt trước — chỉ khi CHỨNG MINH được đó đúng là Chrome của profile này.

    Trả `True` nếu có giết thứ gì. Không chứng minh được thì KHÔNG giết (thà để lại một tiến
    trình lạc còn hơn giết nhầm tiến trình vô can vì số PID/PGID đã bị cấp lại).
    """
    if pid and la_chrome_cua_ta(pid, profile):
        try:
            nhom = os.getpgid(int(pid))       # PGID THẬT của tiến trình còn sống, không tin số cũ
        except Exception:
            nhom = None
        if nhom:
            _giet_nhom(nhom)
        if con_song(pid):
            try:
                os.kill(int(pid), signal.SIGKILL)
            except Exception:
                pass
        return True
    if pgid:
        # `state.json` đời cũ chỉ có `pgid`: chỉ giết khi trong nhóm đó thật sự còn một Chrome
        # đang mở CHÍNH profile này (quét /proc, không `pkill` theo mẫu chữ).
        for q in _pid_theo_profile(profile):
            try:
                if os.getpgid(q) == int(pgid):
                    _giet_nhom(pgid)
                    return True
            except Exception:
                continue
    return False


def _inode_nghe(port):
    """Inode của socket đang LISTEN trên cổng này (đọc /proc/net/tcp).

    `None` = không tra được (không có /proc). Tập rỗng = không ai nghe.
    """
    ra = set()
    thay = False
    for f in ('/proc/net/tcp', '/proc/net/tcp6'):
        try:
            with open(f) as fh:
                dong = fh.read().splitlines()[1:]
        except Exception:
            continue
        thay = True
        for ln in dong:
            c = ln.split()
            if len(c) < 10 or c[3] != '0A':       # 0A = TCP_LISTEN
                continue
            try:
                if int(c[1].rsplit(':', 1)[1], 16) == int(port):
                    ra.add(c[9])                  # cột inode
            except (ValueError, IndexError):
                continue
    return ra if thay else None


def _chu_cong(port):
    """PID đang NGHE cổng này. `None` = không tra được (không có /proc / thiếu quyền)."""
    ino = _inode_nghe(port)
    if ino is None:
        return None
    if not ino:
        return None                               # không ai nghe -> không kết luận gì
    can = {'socket:[%s]' % x for x in ino}
    try:
        ds = os.listdir('/proc')
    except Exception:
        return None
    for x in ds:
        if not x.isdigit():
            continue
        d = '/proc/%s/fd' % x
        try:
            fds = os.listdir(d)
        except Exception:
            continue                              # tiến trình của user khác -> không đọc được
        for fd in fds:
            try:
                if os.readlink(os.path.join(d, fd)) in can:
                    return int(x)
            except OSError:
                continue
    # Có người nghe nhưng không tìm ra là ai (socket của user khác) -> KHÔNG kết luận.
    return None


def _pid_theo_profile(profile, chi_chinh=False):
    """Mọi PID đang chạy Chrome với `--user-data-dir=<profile>` (đọc /proc, không `pkill`).

    `chi_chinh=True` chỉ trả tiến trình BROWSER (bỏ renderer/gpu/zygote — chúng cũng thừa kế
    `--user-data-dir` nên đếm tất là ra một con số nhảy liên tục, không dùng để so được
    "có mở thêm browser nào không").
    """
    ra, moc = [], '--user-data-dir=' + os.path.abspath(profile)
    try:
        ten = os.listdir('/proc')
    except Exception:
        return ra
    for x in ten:
        if not x.isdigit():
            continue
        try:
            with open('/proc/%s/cmdline' % x, 'rb') as f:
                dl = f.read().decode('utf-8', 'replace')
            if moc not in dl:
                continue
            if chi_chinh and '--type=' in dl:
                continue
            ra.append(int(x))
        except Exception:
            continue
    return ra


def chrome_con_giu(cong, pid, profile):
    """Chrome mà lượt `--hien` trước giữ lại có còn dùng được không?

    Trả `'song'` (còn sống, CDP trả lời — ĐÍNH KÈM được) · `'treo'` (tiến trình còn nhưng CDP
    câm — phải người dùng đóng tay) · `''` (đã chết hẳn — mở mới thoải mái).

    Đây là chỗ chặn lỗi "hai Chrome một `user-data-dir`": Chrome thứ hai trên cùng profile sẽ
    thấy `SingletonLock`, bàn giao cho cái thứ nhất rồi TỰ THOÁT — lượt chạy mới ngồi chờ một
    cổng CDP không bao giờ mở, và trước bản vá này lỗi hiện ra là "không bật được Chrome",
    không ai nghĩ tới cửa sổ `--hien` còn mở từ lượt trước.
    """
    con = bool(pid) and la_chrome_cua_ta(pid, profile)
    if not con:
        con = bool(_pid_theo_profile(profile))
    if not con:
        return ''
    if not cong:
        return 'treo'
    try:
        json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/version' % int(cong),
                                         timeout=5))
        return 'song'
    except Exception:
        return 'treo'


def _giet_nhom(pgid):
    """SIGTERM cả nhóm tiến trình (Chrome đẻ zygote + renderer), 3 giây sau thì SIGKILL."""
    try:
        os.killpg(pgid, signal.SIGTERM)
    except Exception:
        return
    for _ in range(30):
        try:
            os.killpg(pgid, 0)
        except Exception:
            return
        time.sleep(0.1)
    try:
        os.killpg(pgid, signal.SIGKILL)
    except Exception:
        pass

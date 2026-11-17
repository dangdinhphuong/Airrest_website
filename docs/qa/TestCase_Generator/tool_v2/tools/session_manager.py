# -*- coding: utf-8 -*-
"""PHIÊN LÀM VIỆC của Live Test — mỗi phiên một thư mục, một trạng thái, một log (2026-09-12).

Bài toán: chạy nhiều phiên soi màn ĐỘC LẬP và ĐỒNG THỜI (Admin/màn A · Giáo viên/màn B · …).
Bản cũ của `probe_live.py` chỉ chạy được một phiên vì browser dùng chung cổng + chung
`user-data-dir` (xem đầu `browser_manager.py`). Module này lo phần CÒN LẠI của việc cách ly:
chỗ đặt file, trạng thái, log, khoá chống hai tiến trình cùng vào một phiên.

Bố cục một phiên (`sessions/<id>/`):

    config.json      tham số phiên (URL · role · tài khoản · hồ sơ màn …) — KHÔNG chứa mật khẩu
    state.json       vòng đời + bước đã xong (còn lại sau khi tiến trình chết ⇒ resume được)
    chrome-profile/  user-data-dir RIÊNG = kho cookie/localStorage của phiên (chỗ cách ly thật)
    cookies/         bản trích cookie + storage sau khi đăng nhập (bằng chứng cách ly)
    screenshots/     ảnh chụp màn — trùng TÊN giữa các phiên cũng không sao vì khác thư mục
    evidence/        chỗ lệch giữa hồ sơ màn và màn thật (`--spec`)
    logs/live.log    log đầy đủ của riêng phiên
    result/          `probe.json` (dữ liệu soi được) + `report.txt` (báo cáo đã in)

và một log TỔNG `sessions/live-test.log` có tiền tố `[<id>]` để đọc lúc chạy song song.

Hai chỗ dễ sai đã xử sẵn:

  · **In ra màn hình khi chạy song song.** Phần soi màn in bằng hàng trăm lệnh `print` thẳng
    `stdout`; chạy 3 luồng là ba báo cáo trộn vào nhau. Sửa từng lệnh `print` là vá 800 dòng
    và chắc chắn sót. Thay bằng một `sys.stdout` **định tuyến theo LUỒNG** (`_Ra`): luồng nào
    đang chạy phiên nào thì chữ chảy vào log của phiên đó, luồng chính vẫn in như cũ.
  · **Hai tiến trình cùng mở một phiên** (chạy lại khi lượt trước chưa chết hẳn) sẽ tranh nhau
    `chrome-profile/` và ghi đè `state.json` của nhau ⇒ khoá `flock` cấm hẳn, báo rõ PID đang giữ.
"""
import errno
import fcntl
import json
import os
import re
import shutil
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib          # noqa: E402  — dùng chung `repo_root()`, không tự đoán gốc repo

# ── vòng đời ──────────────────────────────────────────────────────────────────────────
CREATED, STARTING, LOGIN, READY = 'CREATED', 'STARTING', 'LOGIN', 'READY'
RUNNING, COMPLETED, FAILED, RESUMING = 'RUNNING', 'COMPLETED', 'FAILED', 'RESUMING'
VONG_DOI = [CREATED, STARTING, LOGIN, READY, RUNNING, COMPLETED, FAILED, RESUMING]

_ID_OK = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')


def die(msg):
    raise SystemExit('LỖI: ' + msg)


def goc_phien(d=None):
    """Thư mục chứa mọi phiên: `--session-dir` > `QA_SESSION_DIR` > `<gốc repo>/sessions`."""
    d = (d or os.environ.get('QA_SESSION_DIR') or '').strip()
    if not d:
        d = os.path.join(qalib.repo_root(), 'sessions')
    d = os.path.expanduser(d)
    return os.path.abspath(d if os.path.isabs(d) else os.path.join(qalib.repo_root(), d))


def kiem_id(sid):
    """Chặn `../` và ký tự lạ — phiên này KHÔNG được phép ghi vào thư mục của phiên khác (§7)."""
    sid = (sid or '').strip()
    if not _ID_OK.match(sid) or sid in ('.', '..'):
        die('tên phiên không hợp lệ: %r — chỉ chữ/số/`.`/`_`/`-`, tối đa 64 ký tự' % sid)
    return sid


# ══════════════════════════════════════════════════════════════════════════════
# 1. STDOUT ĐỊNH TUYẾN THEO LUỒNG
# ══════════════════════════════════════════════════════════════════════════════
_KHOA_IN = threading.Lock()


def in_ra(o, s):
    """In MỘT lần ra màn hình, không để hai luồng xé dòng của nhau.

    Nuốt `BrokenPipeError`: người dùng `probe_live.py … | head` là stdout đóng giữa chừng —
    bản đầu để lỗi đó bung lên và phiên bị ghi **FAILED** vì một cái `| head`, trong khi log
    và kết quả trên đĩa vẫn đủ. Đọc được hay không là việc của màn hình, không phải của phiên.
    """
    with _KHOA_IN:
        try:
            o.write(s)
            o.flush()
        except (BrokenPipeError, ValueError, OSError):
            pass


class _Ra:
    """`sys.stdout` thay thế: mỗi luồng có đích riêng; luồng chưa đặt đích thì in như cũ."""

    def __init__(self, that):
        self.that = that
        self._tl = threading.local()

    def dat_dich(self, f):
        self._tl.dich = f

    def _dich(self):
        return getattr(self._tl, 'dich', None)

    def write(self, s):
        f = self._dich()
        if f is None:
            return self.that.write(s)
        return f.write(s)

    def flush(self):
        f = self._dich()
        (f or self.that).flush()

    def isatty(self):
        return self.that.isatty()

    def __getattr__(self, k):
        return getattr(self.that, k)


_RA = None


def _cai_stdout():
    global _RA
    if _RA is None:
        _RA = _Ra(sys.stdout)
        sys.stdout = _RA
    return _RA


def that_stdout():
    """stdout THẬT (không bị định tuyến) — dùng cho dòng vòng đời và tổng kết."""
    return _RA.that if _RA is not None else sys.stdout


class _Tee:
    """Ghi vào log của phiên; `echo` thì in thêm ra màn hình, mỗi dòng gắn `[<id>]`."""

    def __init__(self, sid, f, echo, that):
        self.sid, self.f, self.echo, self.that, self.dem = sid, f, echo, that, ''

    def write(self, s):
        self.f.write(s)
        if not self.echo:
            return len(s)
        self.dem += s
        while '\n' in self.dem:
            dong, self.dem = self.dem.split('\n', 1)
            in_ra(self.that, '[%s] %s\n' % (self.sid, dong))
        return len(s)

    def flush(self):
        try:
            self.f.flush()
        except Exception:
            pass
        if self.echo and self.dem:
            in_ra(self.that, '[%s] %s\n' % (self.sid, self.dem))
            self.dem = ''

    def isatty(self):
        return False


# ══════════════════════════════════════════════════════════════════════════════
# 2. MỘT PHIÊN
# ══════════════════════════════════════════════════════════════════════════════
class Session:
    def __init__(self, sid, goc=None):
        self.sid = kiem_id(sid)
        self.goc = goc_phien(goc)
        self.dir = os.path.join(self.goc, self.sid)
        self.cfg = {}
        self.st = {}
        self._fd = None
        self._log = None
        self._cu = None

    # ── đường dẫn ────────────────────────────────────────────────────────────────
    @property
    def f_cfg(self):
        return os.path.join(self.dir, 'config.json')

    @property
    def f_state(self):
        return os.path.join(self.dir, 'state.json')

    @property
    def profile(self):
        return os.path.join(self.dir, 'chrome-profile')

    @property
    def d_shot(self):
        return os.path.join(self.dir, 'screenshots')

    @property
    def d_cookie(self):
        return os.path.join(self.dir, 'cookies')

    @property
    def d_evi(self):
        return os.path.join(self.dir, 'evidence')

    @property
    def d_kq(self):
        return os.path.join(self.dir, 'result')

    @property
    def f_log(self):
        return os.path.join(self.dir, 'logs', 'live.log')

    @property
    def f_log_tong(self):
        return os.path.join(self.goc, 'live-test.log')

    @property
    def co(self):
        return os.path.isdir(self.dir) and os.path.isfile(self.f_cfg)

    # ── tạo / nạp ────────────────────────────────────────────────────────────────
    def tao(self, cfg):
        for d in (self.dir, self.profile, self.d_shot, self.d_cookie, self.d_evi, self.d_kq,
                  os.path.dirname(self.f_log)):
            os.makedirs(d, exist_ok=True)
        self._khoa_bi_mat()
        self.cfg = {k: v for k, v in (cfg or {}).items() if v is not None and v != ''}
        self.cfg['session_id'] = self.sid
        self.cfg.pop('pw', None)          # §6 — mật khẩu KHÔNG bao giờ nằm trên đĩa
        self.cfg.pop('password', None)
        self.cfg.setdefault('tao_luc', _gio())
        ghi_json(self.f_cfg, self.cfg)
        self.st = {'session_id': self.sid, 'trang_thai': CREATED, 'luc': _gio(),
                   'ly_do': '', 'buoc': {}, 'lan': 0, 'lich_su': []}
        ghi_json(self.f_state, self.st)
        return self

    def nap(self):
        if not self.co:
            die('không có phiên %r trong %s (xem `--list-sessions`)' % (self.sid, self.goc))
        self.cfg = doc_json(self.f_cfg) or {}
        self.st = doc_json(self.f_state) or {'trang_thai': CREATED, 'buoc': {}, 'lich_su': []}
        self.st.setdefault('buoc', {})
        self.st.setdefault('lich_su', [])
        for d in (self.profile, self.d_shot, self.d_cookie, self.d_evi, self.d_kq,
                  os.path.dirname(self.f_log)):
            os.makedirs(d, exist_ok=True)
        self._khoa_bi_mat()
        return self

    def _khoa_bi_mat(self):
        """§6 — thư mục giữ cookie/token chỉ chủ sở hữu đọc được (`0700`).

        `chrome-profile/` là kho cookie THẬT của Chrome và `cookies/` là bản trích kèm token;
        để mặc định `0755` là mọi tài khoản trên máy đọc được phiên đăng nhập của người test.
        Đặt lại ở CẢ `tao()` lẫn `nap()` để phiên tạo từ bản cũ cũng được siết khi chạy lại.
        """
        for d in (self.dir, self.profile, self.d_cookie):
            rieng_tu(d, 0o700)
        for f in ('cookies.json', 'storage.json'):
            rieng_tu(os.path.join(self.d_cookie, f), 0o600)

    def ghi_cfg(self, **kw):
        self.cfg.update({k: v for k, v in kw.items() if v is not None})
        self.cfg.pop('pw', None)
        ghi_json(self.f_cfg, self.cfg)

    # ── khoá: một phiên chỉ được một tiến trình mở ───────────────────────────────
    def khoa(self):
        os.makedirs(self.dir, exist_ok=True)
        self._fd = open(os.path.join(self.dir, '.lock'), 'a+')
        try:
            fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as e:
            if e.errno not in (errno.EACCES, errno.EAGAIN):
                raise
            self._fd.seek(0)
            pid = (self._fd.read() or '?').strip()
            self._fd.close()
            self._fd = None
            die('SESSION BUSY — phiên %r ĐANG CHẠY ở tiến trình %s. Không mở hai lần cùng '
                'lúc: chung `chrome-profile/` là đè cookie của nhau, và hai Chrome cùng một '
                '`user-data-dir` thì cái sau tự thoát. Đợi tiến trình %s xong, hoặc dừng nó.'
                % (self.sid, pid, pid))
        self._fd.seek(0)
        self._fd.truncate()
        self._fd.write('%d\n' % os.getpid())
        self._fd.flush()
        return self

    def mo_khoa(self):
        if self._fd:
            try:
                fcntl.flock(self._fd, fcntl.LOCK_UN)
                self._fd.close()
            except Exception:
                pass
            self._fd = None

    def dang_chay(self):
        """Phiên có đang bị tiến trình khác giữ không (chỉ ĐỌC, không cướp khoá)."""
        p = os.path.join(self.dir, '.lock')
        if not os.path.isfile(p):
            return None
        try:
            with open(p, 'a+') as f:
                try:
                    fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    fcntl.flock(f, fcntl.LOCK_UN)
                    return None
                except OSError:
                    f.seek(0)
                    return (f.read() or '?').strip()
        except Exception:
            return None

    # ── vòng đời ─────────────────────────────────────────────────────────────────
    def dat(self, tt, ly_do='', **kw):
        if tt not in VONG_DOI:
            die('trạng thái lạ: %s' % tt)
        self.st['trang_thai'] = tt
        self.st['luc'] = _gio()
        if ly_do:
            self.st['ly_do'] = ly_do
        elif tt not in (FAILED,):
            self.st['ly_do'] = ''
        self.st.update(kw)
        self.st.setdefault('lich_su', []).append([_gio(), tt] + ([ly_do] if ly_do else []))
        self.st['lich_su'] = self.st['lich_su'][-60:]
        ghi_json(self.f_state, self.st)
        self.su_kien(tt + (' - ' + ly_do if ly_do else ''))
        return self

    def pha(self, ten):
        """Đánh dấu PHA đang chạy (login · soi · luồn sâu · báo cáo).

        Câu báo lỗi của một phiên trước đây chỉ có nguyên nhân gần nhất; đọc bảng tổng kết
        của 3 phiên chạy song song thì không biết phiên nào gục ở đâu (§10). `pha` được ghi
        vào `state.json` ngay, nên cả lúc tiến trình bị `kill -9` vẫn còn dấu vết.
        """
        self.st['pha'] = ten
        ghi_json(self.f_state, self.st)
        return ten

    def xong_buoc(self, ten, gia_tri=True):
        self.st.setdefault('buoc', {})[ten] = gia_tri
        ghi_json(self.f_state, self.st)

    def da_xong(self, ten):
        return bool((self.st.get('buoc') or {}).get(ten))

    @property
    def trang_thai(self):
        return self.st.get('trang_thai') or CREATED

    # ── log ──────────────────────────────────────────────────────────────────────
    def su_kien(self, msg):
        """Dòng vòng đời: vào log phiên + log TỔNG + màn hình, luôn kèm `[<id>]`."""
        dong = '%s [%s] %s' % (_gio(), self.sid, msg)
        for p in (self.f_log, self.f_log_tong):
            try:
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, 'a', encoding='utf-8') as f:
                    f.write(dong + '\n')
            except Exception:
                pass
        in_ra(that_stdout(), dong + '\n')

    def mo_log(self, echo=True):
        """Bắt mọi `print` của LUỒNG hiện tại vào log của phiên (dùng với `with`)."""
        return _BatLog(self, echo)

    def ghi_kem(self):
        """`with ss.ghi_kem() as buf:` — chữ in trong khối vẫn chảy vào log/màn hình NHƯ CŨ,
        đồng thời gom vào `buf` để cất riêng thành `result/report.txt`."""
        return _GhiKem()


class _GhiKem:
    def __enter__(self):
        import io
        ra = _cai_stdout()
        self.buf = io.StringIO()
        self.cu = ra._dich() or ra.that
        ra.dat_dich(_Doi(self.buf, self.cu))
        return self.buf

    def __exit__(self, *a):
        _RA.dat_dich(None if self.cu is _RA.that else self.cu)
        return False


class _Doi:
    """Ghi vào HAI nơi một lúc (bộ nhớ + đích đang dùng)."""

    def __init__(self, a, b):
        self.a, self.b = a, b

    def write(self, s):
        self.a.write(s)
        return self.b.write(s)

    def flush(self):
        for x in (self.a, self.b):
            try:
                x.flush()
            except Exception:
                pass

    def isatty(self):
        return False


class _BatLog:
    def __init__(self, ss, echo):
        self.ss, self.echo = ss, echo

    def __enter__(self):
        ra = _cai_stdout()
        os.makedirs(os.path.dirname(self.ss.f_log), exist_ok=True)
        self.f = open(self.ss.f_log, 'a', encoding='utf-8')
        self.tee = _Tee(self.ss.sid, self.f, self.echo, ra.that)
        self.cu = ra._dich()
        ra.dat_dich(self.tee)
        return self.tee

    def __exit__(self, *a):
        try:
            self.tee.flush()
        finally:
            _RA.dat_dich(self.cu)
            self.f.close()
        return False


# ══════════════════════════════════════════════════════════════════════════════
# 3. LIỆT KÊ · XOÁ
# ══════════════════════════════════════════════════════════════════════════════
def danh_sach(goc=None):
    g = goc_phien(goc)
    if not os.path.isdir(g):
        return []
    ra = []
    for sid in sorted(os.listdir(g)):
        d = os.path.join(g, sid)
        if not os.path.isdir(d) or not os.path.isfile(os.path.join(d, 'config.json')):
            continue
        cfg = doc_json(os.path.join(d, 'config.json')) or {}
        st = doc_json(os.path.join(d, 'state.json')) or {}
        ra.append({'id': sid, 'dir': d, 'cfg': cfg, 'st': st,
                   'trang_thai': st.get('trang_thai') or CREATED,
                   'anh': len([x for x in _ls(os.path.join(d, 'screenshots'))
                               if x.endswith('.png')])})
    return ra


def in_danh_sach(goc=None):
    ds = danh_sach(goc)
    print('THƯ MỤC PHIÊN: %s' % goc_phien(goc))
    if not ds:
        print('   (chưa có phiên nào — tạo bằng: probe_live.py <url> --session <id> --new)')
        return 0
    print('%-22s %-10s %-14s %-5s %-19s %s'
          % ('PHIÊN', 'TRẠNG THÁI', 'VAI TRÒ', 'ẢNH', 'CẬP NHẬT', 'URL'))
    for x in ds:
        print('%-22s %-10s %-14s %-5d %-19s %s'
              % (x['id'][:22], x['trang_thai'][:10], (x['cfg'].get('role') or '-')[:14],
                 x['anh'], (x['st'].get('luc') or '-')[:19], (x['cfg'].get('url') or '-')[:60]))
    print('\n%d phiên. Chi tiết: sessions/<id>/state.json · log tổng: %s'
          % (len(ds), os.path.join(goc_phien(goc), 'live-test.log')))
    return 0


def xoa(sid, goc=None, dong_y=False):
    ss = Session(sid, goc)
    if not os.path.isdir(ss.dir):
        die('không có phiên %r trong %s' % (ss.sid, ss.goc))
    pid = ss.dang_chay()
    if pid:
        die('phiên %r đang chạy ở tiến trình %s — dừng nó trước khi xoá' % (ss.sid, pid))
    n = sum(len(f) for _, _, f in os.walk(ss.dir))
    print('SẼ XOÁ HẲN: %s  (%d file)' % (ss.dir, n))
    if not dong_y:
        # ⚠️ ĐÂY LÀ CLI NGƯỜI DÙNG CHỦ ĐỘNG GỌI (`--delete-session`), KHÔNG nằm trong luồng
        # chạy case. Chỉ thị 16/09 lượt 2 §11 phân biệt rõ hai thứ: luồng live test không
        # được hỏi, còn một lệnh xoá-không-hoàn-tác thì vẫn phải hỏi khi có người ngồi trước
        # máy. Không có người (không tty) thì KHÔNG treo — dừng ngay và chỉ ra `--yes`.
        # `auto_confirm.quet_input_chan()` chừa đúng file này, và danh sách chừa là ĐÓNG.
        if not sys.stdin.isatty():
            die('xoá là KHÔNG hoàn tác được — thêm `--yes` để xác nhận '
                '(phiên không tương tác không hỏi được)')
        if (input('   Xoá phiên %r? [go/không] ' % ss.sid).strip().lower()
                not in ('go', 'y', 'yes', 'co', 'có')):
            print('   -> bỏ qua, không xoá gì')
            return 1
    shutil.rmtree(ss.dir)
    print('   -> đã xoá %s' % ss.dir)
    return 0


# ══════════════════════════════════════════════════════════════════════════════
# 4. CHẠY NHIỀU PHIÊN  (giới hạn concurrency — không bao giờ mở vô hạn browser)
# ══════════════════════════════════════════════════════════════════════════════
TRAN_SONG_SONG = int(os.environ.get('QA_MAX_PARALLEL', '6'))


def chay_nhieu(viec, ham, song_song=1):
    """`viec` = danh sách tham số · `ham(v)` -> dict kết quả. Trả list kết quả theo thứ tự vào.

    `ham` phải TỰ bắt lỗi của mình; ở đây chỉ còn lưới cuối để một phiên hỏng không kéo
    theo phiên khác (§11 của yêu cầu).
    """
    n = max(1, int(song_song or 1))
    if n > TRAN_SONG_SONG:
        print('   ⚠ --parallel %d vượt trần %d (QA_MAX_PARALLEL) — hạ xuống %d để khỏi '
              'quá tải máy và hệ thống test' % (n, TRAN_SONG_SONG, TRAN_SONG_SONG))
        n = TRAN_SONG_SONG
    n = min(n, len(viec)) or 1
    kq = [None] * len(viec)
    if n == 1:
        for i, v in enumerate(viec):
            kq[i] = _boc(ham, v)
        return kq
    with ThreadPoolExecutor(max_workers=n, thread_name_prefix='phien') as ex:
        fut = {ex.submit(_boc, ham, v): i for i, v in enumerate(viec)}
        try:
            for f, i in fut.items():        # đã submit hết -> chúng chạy SONG SONG, đây chỉ là chờ
                kq[i] = f.result()
        except KeyboardInterrupt:
            ex.shutdown(wait=False, cancel_futures=True)
            raise
    return kq


def _boc(ham, v):
    try:
        return ham(v)
    except KeyboardInterrupt:
        # ⚠️ Vá 2026-09-14. `except BaseException` bên dưới NUỐT cả Ctrl+C: chạy một phiên
        # (`--parallel 1` đi thẳng, không qua luồng) rồi bấm Ctrl+C thì người dùng nhận về
        # "phiên FAILED" như một lỗi bình thường và mã thoát 1 — không phân biệt được "tool
        # hỏng" với "tôi tự dừng". Ngắt của người dùng phải đi thẳng ra ngoài.
        raise
    except SystemExit as e:                     # `die()` trong luồng con
        return {'id': getattr(v, 'sid', '?'), 'trang_thai': FAILED, 'ly_do': str(e)}
    except BaseException as e:                  # noqa: BLE001 — một phiên hỏng KHÔNG kéo cả lô
        return {'id': getattr(v, 'sid', '?'), 'trang_thai': FAILED,
                'ly_do': '%s: %s' % (type(e).__name__, e)}


def tom_tat(kq):
    """In tổng kết + trả exit code (0 = mọi phiên xong, 1 = có phiên lỗi)."""
    o = that_stdout()
    kq = [k for k in kq if k]
    xong = [k for k in kq if k.get('trang_thai') == COMPLETED]
    hong = [k for k in kq if k.get('trang_thai') != COMPLETED]
    d = ['', 'Live Test Summary', '-' * 17,
         'Total:     %d' % len(kq), 'Completed: %d' % len(xong), 'Failed:    %d' % len(hong), '']
    for k in kq:
        tt = k.get('trang_thai') or '?'
        d.append('%s: %s%s' % (k.get('id') or '?', tt,
                               ' - ' + k['ly_do'] if k.get('ly_do') and tt != COMPLETED else ''))
    in_ra(o, '\n'.join(d) + '\n')
    return 0 if not hong else 1


# ══════════════════════════════════════════════════════════════════════════════
# 5. tiện ích
# ══════════════════════════════════════════════════════════════════════════════
def _gio():
    return time.strftime('%Y-%m-%d %H:%M:%S')


def _ls(d):
    try:
        return os.listdir(d)
    except Exception:
        return []


def rieng_tu(path, mode):
    """`chmod` mà KHÔNG chết ở nơi không có quyền POSIX (Windows) — §6. Trả True nếu đặt được."""
    if os.name != 'posix':
        return False
    try:
        os.chmod(path, mode)
        return True
    except OSError:
        return False


def khoa_thu_muc(path):
    """Thư mục chứa bí mật -> `0700` (chỉ chủ sở hữu). Không có thì tạo."""
    os.makedirs(path, exist_ok=True)
    return rieng_tu(path, 0o700)


def ghi_json(path, obj, mat=False):
    """Ghi nguyên tử: tiến trình chết giữa chừng vẫn để lại `state.json` đọc được.

    `mat=True` cho file CÓ THỂ CHỨA TOKEN (cookie, localStorage): tạo thẳng bằng `os.open`
    với `0o600` để nội dung **chưa bao giờ** nằm trên đĩa ở chế độ 644 — `chmod` sau khi ghi
    là đã muộn một nhịp. Trên Windows `mode` bị bỏ qua, đường ghi vẫn chạy bình thường (§6).
    """
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + '.tmp'
    if mat:
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        f = os.fdopen(fd, 'w', encoding='utf-8')
    else:
        f = open(tmp, 'w', encoding='utf-8')
    with f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    if mat:
        rieng_tu(path, 0o600)


def doc_json(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def doc_cau_hinh(path):
    """`sessions.json` -> danh sách dict. Nhận cả `{"sessions":[…]}` lẫn `[…]` trần."""
    d = doc_json(path)
    if d is None:
        die('không đọc được file cấu hình %s (JSON hỏng?)' % path)
    ds = d.get('sessions') if isinstance(d, dict) else d
    if not isinstance(ds, list) or not ds:
        die('%s: cần khoá "sessions" là DANH SÁCH các phiên' % path)
    ra = []
    for i, x in enumerate(ds, 1):
        if not isinstance(x, dict):
            die('%s: phiên thứ %d không phải object' % (path, i))
        if not x.get('session_id'):
            die('%s: phiên thứ %d thiếu "session_id"' % (path, i))
        ra.append(x)
    ids = [x['session_id'] for x in ra]
    trung = sorted({x for x in ids if ids.count(x) > 1})
    if trung:
        die('%s: trùng session_id %s — hai phiên cùng id là dùng chung thư mục và cookie'
            % (path, ' · '.join(trung)))
    return ra

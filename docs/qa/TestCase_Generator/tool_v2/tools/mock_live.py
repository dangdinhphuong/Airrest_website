# -*- coding: utf-8 -*-
"""MÔ PHỎNG MẠNG cho lớp chạy case — tương đương `page.route()`  (mới 2026-09-16).

Vì sao cần: một lớp case lớn chỉ hỏi *"màn cư xử thế nào khi API trả X"* — danh sách rỗng,
đang tải, 400/401/403/404/409/500, treo quá hạn, dữ liệu dài, nhiều bản ghi, payload XSS.
Dựng chúng bằng dữ liệu thật thì hoặc không dựng được (không ai cho API trả 500 theo yêu cầu),
hoặc phải phá dữ liệu thật (xoá sạch bảng để có danh sách rỗng). Cả hai lối đều dẫn về `PE` —
và `PE` ở đây có nghĩa *"tool chưa có cách"*, đúng thứ §chinh_sach_PE cấm.

Khối này giữ request lại NGAY TRONG TRÌNH DUYỆT (`Fetch.requestPaused`) rồi tự trả lời
(`Fetch.fulfillRequest`). Đây đúng là cơ chế `page.route()` của Playwright — Playwright cũng
gọi hai lệnh CDP này — nên không phải một đường quan sát thứ hai: sổ mạng vẫn thấy request,
và `qalib` §4e nhận ra nó bằng `networkId`.

Hai PHA, chọn theo kịch bản:

  · **Request** — trả lời NGAY, request không bao giờ rời trình duyệt. Dùng cho mã lỗi
    (4xx/5xx), treo, chậm. Đây là pha duy nhất được phép dùng cho request KHÁC `GET`.
  · **Response** — để request đi tới máy chủ, **đọc thân phản hồi THẬT**, biến đổi rồi mới
    trả cho trang. Dùng cho rỗng / nhiều bản ghi / dữ liệu dài / XSS: giữ đúng HÌNH DẠNG
    phản hồi của app thay vì bịa một cấu trúc JSON theo trí nhớ — bịa thì màn không render
    được và phép đo chấm F cho một lỗi do chính mình gây ra.

Ba điều khối này KHÔNG làm:

  · **không tự quyết định được mock hay không** — `CuaSoMock` phải do phép đo khai trước
    (case nào · kịch bản gì · endpoint nào), và `qalib.la_case_cam_mock` chặn hẳn lớp case
    hỏi về nghiệp vụ máy chủ;
  · **không im lặng thả request ngoài phạm vi** — request không khớp endpoint đã khai được
    `continueRequest` nguyên trạng và vẫn được ghi vào sổ của cửa sổ;
  · **không để trang treo** — thoát khỏi `với` là mọi request còn bị giữ đều được trả lời,
    kể cả khi phép đo ném lỗi giữa chừng.
"""
import base64
import json
import re
import time

import qalib

# Khoá thường gặp của một phản hồi danh sách. Dò theo thứ tự này rồi mới dò đệ quy — app
# nào cũng đặt mảng ở một trong số đó, và dò đệ quy trước thì dễ tóm nhầm mảng `filters`.
_KHOA_DS = ('data', 'items', 'content', 'records', 'rows', 'list', 'results', 'elements')
_KHOA_TONG = ('total', 'totalElements', 'totalItems', 'totalCount', 'count', 'totalRecords')

XSS_PAYLOAD = '<script>alert(1)</script>'
# Chuỗi dài dùng cho kịch bản `du_lieu_dai`. 600 ký tự: dài hơn mọi ô hiển thị của bảng danh
# sách nhưng vẫn ngắn hơn giới hạn thân phản hồi, nên đo được việc cắt chữ/xuống dòng.
CHUOI_DAI = 'Tên rất dài để kiểm tra hiển thị ' * 18


class LoiMock(RuntimeError):
    """Lớp mô phỏng mạng không dựng được trạng thái đã khai — case về CHƯA ĐO, không phải F."""


def _tim_mang(o):
    """(đường dẫn tới mảng bản ghi, mảng) trong một thân JSON. (None, None) nếu không thấy."""
    if isinstance(o, list):
        return [], o
    if not isinstance(o, dict):
        return None, None
    for k in _KHOA_DS:
        v = o.get(k)
        if isinstance(v, list):
            return [k], v
        if isinstance(v, dict):
            d, m = _tim_mang(v)
            if d is not None:
                return [k] + d, m
    for k, v in o.items():
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return [k], v
    return None, None


def _dat(o, duong, gia_tri):
    for k in duong[:-1]:
        o = o[k]
    o[duong[-1]] = gia_tri


def _dat_tong(o, n):
    """Đặt lại mọi khoá TỔNG tìm được — bỏ sót một khoá là phân trang của màn nói dối."""
    if not isinstance(o, dict):
        return
    for k in list(o.keys()):
        if k in _KHOA_TONG and isinstance(o.get(k), (int, float)):
            o[k] = n
        elif isinstance(o[k], dict):
            _dat_tong(o[k], n)


def _o_chu_dau(bg):
    """Khoá chuỗi 'nhìn thấy được' đầu tiên của một bản ghi — chỗ để nhét chuỗi dài / XSS."""
    if not isinstance(bg, dict):
        return None
    uu_tien = [k for k in bg
               if isinstance(bg.get(k), str) and re.search(r'name|ten|title|label|nhan|mo_ta',
                                                           k, re.I)]
    if uu_tien:
        return uu_tien[0]
    for k, v in bg.items():
        if isinstance(v, str) and len(v) >= 2 and not re.search(r'id$|^id$|uuid', k, re.I):
            return k
    return None


def bien_doi(than, kich_ban, so_ban_ghi=45):
    """Biến đổi THÂN PHẢN HỒI THẬT theo kịch bản. -> (thân mới dạng chuỗi, mô tả) hoặc None.

    Trả `None` khi thân không phải JSON có mảng bản ghi: khi ấy phép đo phải im (CHƯA ĐO),
    **không** được trả một thân bịa ra — màn render hỏng thì kết luận nói về lỗi của chính
    lớp mock chứ không nói về app.
    """
    try:
        o = json.loads(than)
    except Exception:
        return None
    duong, ds = _tim_mang(o)
    if duong is None:
        return None
    if kich_ban == 'rong':
        if duong:
            _dat(o, duong, [])
        else:
            o = []
        _dat_tong(o, 0)
        return json.dumps(o, ensure_ascii=False), 'mảng bản ghi bị làm RỖNG (0 bản ghi)'
    if not ds:
        return None                       # các kịch bản dưới đây cần ít nhất 1 bản ghi mẫu
    if kich_ban == 'nhieu_ban_ghi':
        moi = []
        for i in range(int(so_ban_ghi)):
            bg = json.loads(json.dumps(ds[i % len(ds)]))
            if isinstance(bg, dict):
                for k in list(bg.keys()):
                    if re.fullmatch(r'id|uuid|_id', k, re.I) and isinstance(bg[k], str):
                        bg[k] = '%s-mock%02d' % (bg[k][:24], i)
                o_chu = _o_chu_dau(bg)
                if o_chu:
                    bg[o_chu] = '%s %02d' % (str(bg[o_chu])[:40], i + 1)
            moi.append(bg)
        if duong:
            _dat(o, duong, moi)
        else:
            o = moi
        _dat_tong(o, len(moi))
        return json.dumps(o, ensure_ascii=False), 'mảng bản ghi nhân lên %d dòng' % len(moi)
    if kich_ban in ('du_lieu_dai', 'xss'):
        chuoi = CHUOI_DAI if kich_ban == 'du_lieu_dai' else XSS_PAYLOAD
        bg = ds[0]
        o_chu = _o_chu_dau(bg)
        if not o_chu:
            return None
        bg[o_chu] = chuoi
        return (json.dumps(o, ensure_ascii=False),
                'trường %r của bản ghi đầu bị thay bằng %s'
                % (o_chu, 'chuỗi %d ký tự' % len(chuoi) if kich_ban == 'du_lieu_dai'
                   else 'payload XSS'))
    return None


# ══════════════════════════════════════════════════════════════════════════════
# CỬA SỔ MOCK — dùng bằng `với`, thoát ra là trả hết request đang giữ
# ══════════════════════════════════════════════════════════════════════════════
class Mock:
    """Một lượt mô phỏng mạng, gắn với đúng một `qalib.CuaSoMock`.

        with mock_live.Mock(c, cs) as mk:
            c.go(url)
            mk.cho(\"document.querySelector('table')?1:0\", giay=20)
            ...đọc màn...

    Mọi vòng chờ phải đi qua `cho()` / `phuc_vu()` của lớp này thay vì `c.wait()`: request
    đang bị giữ chỉ được trả lời khi có ai đó bơm socket, và `c.wait()` chỉ bơm chứ không
    trả lời — trang sẽ treo cho tới hết giờ rồi phép đo kết luận sai về một màn bình thường.
    """

    # Kịch bản phải đọc phản hồi THẬT trước khi biến đổi -> chặn ở pha Response.
    PHA_RESPONSE = ('rong', 'nhieu_ban_ghi', 'du_lieu_dai', 'xss')
    # Kịch bản trả lời ngay, không chạm máy chủ.
    MA_TT = {'loi_400': 400, 'loi_401': 401, 'loi_403': 403, 'loi_404': 404,
             'loi_409': 409, 'loi_500': 500}

    def __init__(self, c, cua_so, cong=None, cham_giay=3.0, so_ban_ghi=45):
        self.c = c
        self.cs = cua_so
        self.cong = cong
        self.cham_giay = float(cham_giay)
        self.so_ban_ghi = int(so_ban_ghi)
        self.pha = 'Response' if cua_so.kich_ban in self.PHA_RESPONSE else 'Request'
        self.treo = []              # request đang CỐ Ý giữ (kịch bản dang_tai/timeout)
        self.cho_tra = {}           # requestId -> mốc thời gian (kịch bản `cham`)
        self.loi_bien_doi = []      # endpoint khớp mà thân không biến đổi được
        self.bat_dau = None

    # ── vòng đời ─────────────────────────────────────────────────────────────
    def __enter__(self):
        if self.cong is not None:
            self.cong.hanh_dong('mo_phong_mang',
                                '%s · %s' % (self.cs.kich_ban, ' · '.join(self.cs.endpoints)))
        # CHỈ giữ request dữ liệu (`XHR` + `Fetch`). Giữ `*` là giữ luôn request TÀI LIỆU của
        # chính lần điều hướng ⇒ `Page.navigate` không bao giờ trả lời và cả lượt chạy treo 60
        # giây rồi chết — đã đo được ở lần thử đầu, không phải suy đoán. Lọc theo endpoint đã
        # khai vẫn làm ở `_mot()`: `urlPattern` của CDP không hiểu chỗ trống `{id}`.
        mau = [{'urlPattern': '*', 'resourceType': t, 'requestStage': self.pha}
               for t in ('XHR', 'Fetch')]
        if not self.c.bat_chan(mau):
            raise LoiMock('Chrome không nhận `Fetch.enable` — không dựng được mô phỏng mạng')
        self.bat_dau = time.time()
        return self

    def __exit__(self, et, ev, tb):
        try:
            self.tha_het()
        finally:
            self.c.tat_chan()
            self.cs.dong()
        return False

    def tha_het(self):
        """Trả lời mọi request còn bị giữ — kể cả khi phép đo ném lỗi giữa chừng."""
        con = list(self.treo)
        self.treo = []
        for x in con:
            self._tra_loi_treo(x)
        for x in self.c.bom_chan():
            self._mot(x, cuoi=True)

    # ── bơm + trả lời ────────────────────────────────────────────────────────
    def phuc_vu(self):
        """Một nhịp: bơm socket, trả lời mọi request đang bị giữ. -> số request vừa xử."""
        n = 0
        for x in self.c.bom_chan():
            self._mot(x)
            n += 1
        # kịch bản `cham`: tới giờ thì mới thả
        for rid, moc in list(self.cho_tra.items()):
            if time.time() >= moc:
                self.cho_tra.pop(rid, None)
                self._goi('Fetch.continueRequest', requestId=rid)
        return n

    def cho(self, dieu_kien_js, giay=25, moi=0.25):
        """Như `Chrome.wait()` nhưng VỪA CHỜ VỪA PHỤC VỤ request đang bị giữ."""
        t0 = time.time()
        while time.time() - t0 < giay:
            self.phuc_vu()
            try:
                v = self.c.js(dieu_kien_js)
            except Exception:
                v = None
            if v:
                return v
            time.sleep(moi)
        self.phuc_vu()
        return None

    def nghi(self, giay):
        """Ngủ `giay` mà vẫn phục vụ — dùng khi phép đo chỉ cần để màn tự chạy một lúc."""
        t0 = time.time()
        while time.time() - t0 < giay:
            self.phuc_vu()
            time.sleep(0.15)
        return True

    # ── xử một request bị giữ ────────────────────────────────────────────────
    def _goi(self, lenh, **kw):
        try:
            self.c.ws.call(lenh, giay=15, **kw)
            return True
        except Exception:
            return False          # request đã bị trang huỷ — không phải lỗi của phép đo

    def _mot(self, x, cuoi=False):
        rid, url, me = x['requestId'], x.get('url') or '', x.get('method') or ''
        if not self.cs.khop(url):
            self._goi('Fetch.continueRequest', requestId=rid)
            return
        kb = self.cs.kich_ban
        if kb in ('dang_tai', 'timeout') and not cuoi:
            # GIỮ LẠI: đây chính là trạng thái phải đo. Ghi sổ ngay lúc giữ chứ không đợi
            # lúc thả — lượt chạy chết giữa chừng thì sổ vẫn nói được nó đã giữ cái gì.
            self.cs.ghi_chan(me, url, rid, x.get('networkId'), 'GIỮ (%s)' % kb)
            self.treo.append(x)
            return
        if kb in ('dang_tai', 'timeout') and cuoi:
            self._tra_loi_treo(x)
            return
        if kb == 'cham':
            self.cs.ghi_chan(me, url, rid, x.get('networkId'),
                             'giữ %.1fs rồi thả' % self.cham_giay)
            self.cho_tra[rid] = time.time() + self.cham_giay
            return
        if kb in self.MA_TT:
            ma = self.MA_TT[kb]
            than = json.dumps({'message': 'mock %d' % ma, 'code': ma}, ensure_ascii=False)
            self.cs.ghi_chan(me, url, rid, x.get('networkId'), 'trả %d' % ma)
            self._goi('Fetch.fulfillRequest', requestId=rid, responseCode=ma,
                      responseHeaders=[{'name': 'Content-Type',
                                        'value': 'application/json; charset=utf-8'}],
                      body=base64.b64encode(than.encode()).decode())
            return
        # ── pha Response: đọc thân THẬT rồi biến đổi ─────────────────────────
        than = None
        try:
            r = self.c.ws.call('Fetch.getResponseBody', requestId=rid, giay=15)
            than = (base64.b64decode(r['body']).decode('utf-8', 'replace')
                    if r.get('base64Encoded') else r.get('body'))
        except Exception:
            than = None
        if than is None:
            self.cs.ghi_chan(me, url, rid, x.get('networkId'), 'không đọc được thân -> thả')
            self.loi_bien_doi.append('%s %s: không đọc được thân phản hồi' % (me, url[:120]))
            self._goi('Fetch.continueRequest', requestId=rid)
            return
        kq = bien_doi(than, kb, self.so_ban_ghi)
        if kq is None:
            self.cs.ghi_chan(me, url, rid, x.get('networkId'), 'thân không biến đổi được -> thả')
            self.loi_bien_doi.append('%s %s: thân không phải JSON có mảng bản ghi'
                                     % (me, url[:120]))
            self._goi('Fetch.continueRequest', requestId=rid)
            return
        moi, mo_ta = kq
        self.cs.ghi_chan(me, url, rid, x.get('networkId'), mo_ta)
        self._goi('Fetch.fulfillRequest', requestId=rid,
                  responseCode=int(x.get('ma_tt') or 200),
                  responseHeaders=[{'name': 'Content-Type',
                                    'value': 'application/json; charset=utf-8'}],
                  body=base64.b64encode(moi.encode()).decode())

    def _tra_loi_treo(self, x):
        rid = x['requestId']
        if self.cs.kich_ban == 'timeout':
            if not self._goi('Fetch.failRequest', requestId=rid, errorReason='TimedOut'):
                self._goi('Fetch.continueRequest', requestId=rid)
        else:
            self._goi('Fetch.continueRequest', requestId=rid)

    # ── kết quả ──────────────────────────────────────────────────────────────
    @property
    def da_dung(self):
        """Mock có THẬT SỰ dựng được trạng thái không? — phép đo phải hỏi trước khi kết luận.

        Khai một cửa sổ mock rồi không giữ được request nào nghĩa là màn không gọi endpoint
        đã khai (khai sai đường dẫn, hoặc màn đọc từ cache). Kết luận trong tình huống ấy nói
        về một trạng thái CHƯA TỪNG được dựng — phải trả `None`, không được chấm F.
        """
        return bool([x for x in self.cs.da_chan if not str(x['xu_ly']).endswith('-> thả')])

    def nhan_xet(self):
        return self.cs.nhan_xet()

    def id_mang(self):
        """`networkId` của request đã bị giữ — bằng chứng luật ③ §4e cho sổ mạng."""
        return set(self.cs.id_mang)


def cua_so_cho(case_key, kich_ban, endpoints, mo_ta=''):
    """Dựng `qalib.CuaSoMock` — một chỗ duy nhất, để phép đo không tự chế tham số."""
    return qalib.CuaSoMock(case_key=case_key, kich_ban=kich_ban, endpoints=endpoints,
                           mo_ta=mo_ta)


def endpoints_doc(hs_man):
    """Endpoint ĐỌC (GET) khai ở `grounding.api` của hồ sơ màn — phạm vi mặc định của mock.

    Không suy diễn thêm: mock chỉ được phép chạm đúng những đường dẫn hồ sơ màn chứng minh
    được là màn này gọi.
    """
    ra = []
    for dong in ((hs_man or {}).get('grounding') or {}).get('api') or []:
        m = re.match(r'\s*(GET|POST)\s+(\S+)', str(dong))
        if m and m.group(1).upper() == 'GET':
            ra.append(m.group(2))
    return ra

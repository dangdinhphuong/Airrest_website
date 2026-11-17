# -*- coding: utf-8 -*-
"""BỘ PHÉP ĐO LIVE — chạy THAO TÁC THẬT rồi chấm case  (mới 2026-09-15 lượt 4).

`chay_live.py` bản trước có 5 phép đo, tất cả đều đọc một ảnh chụp DOM tĩnh: 11/297 case của
`LoaiNguon` có kết luận, 69 bị hàng rào chặn vì đòi thao tác ghi, 212 không có phép nào nhận.
Khối này là phần còn lại — **làm đúng thao tác mà cột C mô tả**, thu bằng chứng, rồi so với
cột D và `grounding.verbatim`.

Bốn luật của cả khối, không phép nào được phá:

  ① **Kỳ vọng không tự nghĩ ra.** Nguồn kỳ vọng theo thứ tự: cột D của chính case → `grounding`
     của hồ sơ màn (verbatim/hằng số — đã ground từ BA/TKCT + bundle FE) → luật cứng `qalib`
     §0a. Không có nguồn nào nói thì phép **trả `None`** (case về CHƯA ĐO), không đoán.
  ② **Không kết luận được thì im.** `None` là câu trả lời hợp lệ và hay dùng: mất một dòng
     công việc rẻ hơn nhiều so với gửi cho QA một kết luận sai.
  ③ **Mọi thao tác đổi dữ liệu đi qua `ctx.ghi()`** — nơi mở cửa sổ ghi (`qalib` §4d) và xin
     phép `Cong`. Không phép nào được gọi thẳng `live_ui.bam_ghi`.
  ④ **Chỉ đụng dữ liệu QA.** Bản ghi để sửa/xoá luôn là bản ghi do chính lượt chạy tạo ra
     (`ctx.ban_ghi(...)`), không bao giờ là bản ghi đọc được trên màn.

Phép nào cũng khai `can_ghi`: `--dry-run` nhờ đó đếm trước được lượt chạy sẽ ghi bao nhiêu bản
ghi QA, và lượt chạy KHÔNG bật `--cho-phep-ghi` biết ngay phép nào phải bỏ.
"""
import os
import re
import sys
import time

import qalib
import bo_chon
import live_ui as ui
import qa_data
import tien_dieu_kien as tdk

# Chuỗi tấn công dùng cho case XSS / SQL Injection. Cố định để lượt sau lặp lại được lượt
# trước, và **không mang ký tự điều khiển** — thứ duy nhất chúng phải làm là đi qua ô nhập.
XSS_MAU = {
    'script html': '<script>alert(1)</script>',
    'hexa dang url': '%3Cscript%3Ealert(1)%3C/script%3E',
    'hexa dang html': '&lt;script&gt;alert(1)&lt;/script&gt;',
    'alert': 'alert(1)',
}
SQL_MAU = "' OR '1'='1"

# Biểu thức JS trả về BIỂU TƯỢNG THAO TÁC ĐẦU TIÊN của một dòng dữ liệu THẬT. Dùng chung cho
# mọi phép đo chạm tới cột Hành động — một chỗ duy nhất biết "dòng thật" nghĩa là gì (dòng
# *"không có dữ liệu"* cũng là một `<tr>`, và bấm vào đó thì không có gì xảy ra mà cũng không
# có lỗi nào).
JS_ICON_DONG_DAU = (
    "(()=>{const tr=[...document.querySelectorAll('table tbody tr')].find(r=>{"
    "const td=[...r.querySelectorAll('td')];"
    "return td.length>=2 && !td.some(x=>parseInt(x.getAttribute('colspan')||'1',10)>1);});"
    "if(!tr) return null;"
    "return [...tr.querySelectorAll('button,[role=button],a')].filter(HIEN)[0]||null;})()")
VIET_CO_DAU = 'Nguồn dữ liệu Đào tạo'


# Alias cho hàm bọc chuỗi JS của `live_ui` — bốn chỗ trong file này từng gọi `_s(...)`
# trần và chết `NameError` NGAY GIỮA một case chạy thật (r16, lượt 15/09). Lỗi kiểu này
# `node --check` không bắt được vì nó là lỗi Python, không phải lỗi JS.
_s = None  # noqa: E305  — giữ tên để mọi lời gọi cũ trỏ đúng vào `ui._s`
_s = getattr(ui, '_s')


def _n(s):
    return qalib.norm(s or '')


def _co(nb, *kw):
    return all(k in nb for k in kw)


def _nhan_o(nhan):
    """Nhãn ô đã chuẩn hoá để SO KHỚP — bỏ dấu `*` bắt buộc và dấu `:` ở cuối.

    Màn thật in nhãn là `Code *` · `Chuỗi kết nối *` còn hồ sơ màn khai `Code` · `Chuỗi kết
    nối`; `live_ui.TIM` đã cắt đuôi này từ đầu, chỗ nào so khớp nhãn cũng phải cắt y hệt, nếu
    không thì tra bảng trượt và ô bắt buộc lặng lẽ không được điền.
    """
    return _n(str(nhan or '').rstrip(' *:'))


def _ke_dien(ra):
    """Bản kê ngắn `{nhãn: kết quả}` của một lượt điền biểu mẫu — để đưa vào thông báo lỗi."""
    ph = []
    for nhan, kq in (ra or {}).items():
        if isinstance(kq, dict):
            # `sau` = chữ ĐỌC LẠI được ở ô sau khi đặt; `chon` chỉ là giá trị ta YÊU CẦU.
            # Bản kê phải nói cái ô đang giữ, không nói cái ta đã gửi — hai thứ ấy khác nhau
            # đúng ở những ca cần bản kê nhất.
            gt = kq.get('sau') or kq.get('gia_tri')
            if gt is None:
                gt = kq.get('chon')
            if kq.get('ok') is False:
                gt = 'HỎNG: %s' % (kq.get('ly_do') or '?')
        else:
            gt = kq
        ph.append('%s=%s' % (nhan, 'KHÔNG THẤY Ô' if gt is None else str(gt)[:60]))
    return ' · '.join(ph) if ph else '(không điền ô nào)'


def _bat_ky(nb, *kw):
    return any(k in nb for k in kw)


# ══════════════════════════════════════════════════════════════════════════════
# BẢN GHI THỰC THI — mỗi case một bản, kể cả case không đo được  (§2 + §18)
# ══════════════════════════════════════════════════════════════════════════════
# Vì sao cần: trước bản này, một case không có kết luận chỉ để lại MỘT câu tiếng Việt
# (*"phép đo không kết luận được trên dữ kiện đọc được"*) dùng chung cho 88 case của đủ mọi
# nguyên nhân — thiếu dữ liệu, không tìm thấy control, không có phiên thứ hai, chưa có phép
# đo. Một câu như thế không dẫn tới việc gì làm tiếp được. Bản ghi này thay nó bằng dữ kiện
# rời: đã thử phép nào, dựng được trạng thái gì, đã thao tác chưa, thu được mấy mảnh bằng
# chứng, và lý do mang MÃ máy đọc được.
#
# ── MÃ LÝ DO (`reason`) ────────────────────────────────────────────────────────────────
NO_MEASUREMENT = 'NO_MEASUREMENT_IMPLEMENTED'     # chưa ai viết phép đo cho lớp case này
PHEP_TRA_NONE = 'measurement_returned_none'       # có phép đo, phép đo không kết luận được
FIXTURE_HONG = 'fixture_failed'                   # dựng trạng thái thất bại
TIEN_DK_THIEU = 'precondition_unmet'              # trạng thái case cần không dựng được
PHEP_LOI = 'measurement_error'                    # phép đo chết giữa chừng
HANG_RAO_CHAN = 'guard_blocked'                   # hàng rào an toàn từ chối
KY_VONG_CSDL = 'db_expectation'                   # kỳ vọng nằm hẳn ở CSDL (§4b)
DA_KET_LUAN = 'concluded'                         # đo xong, có P/F


def _js_loc_dang_bat(c):
    """Ô lọc nào trên thanh lọc đang MANG GIÁ TRỊ. -> ['Trạng thái=Hoạt động', …].

    Phân biệt `FILTER_HIDDEN` với `RECORD_NOT_FOUND` (§F): một bản ghi không hiện vì bộ lọc
    đang bật là chuyện sửa được (xoá lọc), còn một bản ghi không còn trên hệ thống thì phải
    tạo cái mới. Gộp hai thứ vào một chữ "không thấy" là mất đúng thông tin để quyết.
    """
    return ui._js(c, """
      const ra=[];
      for(const e of VUNG_LOC()){
        if(!LA_O_CHON(e)&&e.tagName!=='INPUT') continue;
        const t=(e.tagName==='INPUT'?(e.value||''):TXT(e)).trim();
        const q=QN(t);
        if(!t||!q) continue;
        if(/^[-\s]*chon\b/.test(q)||/^tat ca/.test(q)||/^-{2,}/.test(q)) continue;
        ra.push(((NHAN(e)||e.placeholder||'').trim()||'ô lọc')+'='+t.slice(0,40));}
      return JSON.stringify(ra.slice(0,8));""") or []


def _dau_vet_moi():
    return {'tien_dieu_kien': [], 'fixture': None, 'fixture_loai': None, 'fallback': None,
            'phep_da_thu': [], 'phep_chay': None, 'loai_phep': None, 'da_thao_tac': False,
            'so_bang_chung': 0, 'ly_do': None, 'chi_tiet_ly_do': '',
            # §C — bốn tình huống phải phân biệt được trong `result/cases.json`, mỗi tình
            # huống một trường riêng. Gộp chúng vào một chữ "chưa đo" là đúng cái đã làm 63
            # case của lượt chạy 500 không ai lần ra được nguyên nhân.
            'fixture_ten': None, 'fixture_trang_thai': None, 'thuc_thi_trang_thai': None,
            'fallback_da_thu': [], 'fallback_ket_qua': None}


def dem_bang_chung(du_kien, co_anh=False):
    """Bao nhiêu MẢNH dữ kiện đã thu được cho một case -> `evidence_count`.

    Đếm mảnh chứ không đếm byte: một khối `du_kien` có 8 khoá là 8 điều quan sát được nêu
    tên, còn một chuỗi 8 KB không nói được gì về việc đã quan sát bao nhiêu thứ. Ảnh chụp
    tính là một mảnh.
    """
    n = 1 if co_anh else 0
    if isinstance(du_kien, dict):
        for k, v in du_kien.items():
            n += len(v) if isinstance(v, (list, tuple)) and v else 1
    elif isinstance(du_kien, (list, tuple)):
        n += len(du_kien)
    elif du_kien:
        n += 1
    return n


# ══════════════════════════════════════════════════════════════════════════════
# NGỮ CẢNH — dữ kiện + quyền + sổ, truyền cho mọi phép
# ══════════════════════════════════════════════════════════════════════════════
class Ctx:
    """Ngữ cảnh một lượt chạy: trình duyệt · hồ sơ màn · sổ dữ liệu QA · cổng an toàn.

    Phép đo KHÔNG được chạm thẳng vào `cong` hay `so`: mọi đường ghi đi qua `ghi()` và
    `ban_ghi()` ở đây, để một chỗ duy nhất chịu trách nhiệm mở/đóng cửa sổ ghi và ghi sổ.
    """

    def __init__(self, c, ng, hs, so, cong, url, man, ghi_so_mang=None, anh=None,
                 cho_phep_ghi=False):
        self.c, self.ng, self.hs, self.so, self.cong = c, ng, hs, so, cong
        self.url, self.man, self.anh = url, man, anh
        self.cho_phep_ghi = bool(cho_phep_ghi)
        self._ghi_so_mang = ghi_so_mang        # callback: vét sổ mạng trong lúc cửa sổ mở
        g = (hs or {}).get('grounding') or {}
        self.verbatim = g.get('verbatim') or {}
        self.hang_so = g.get('hang_so') or {}
        self.khong_co = [str(x) for x in (g.get('khong_co') or [])]
        # `loai_control` nằm ở GỐC hồ sơ màn (không trong `grounding`) — dùng để biết một ô
        # bắt buộc là ô CHỌN hay ô NHẬP khi hộp thoại không tự khai (ô chọn dựng bằng `button`).
        self.loai_control = (hs or {}).get('loai_control') or {}
        self.endpoints = qalib.endpoints_ghi(hs)
        self.case_dang_chay = None
        self._o_form = None                    # nhãn ô của biểu mẫu, đọc một lần
        self.dau_vet = _dau_vet_moi()          # BẢN GHI THỰC THI của case đang chạy (§2)

    # ── bản ghi thực thi ─────────────────────────────────────────────────────
    def bat_dau_case(self, case):
        """Mở một BẢN GHI THỰC THI mới. Gọi trước mỗi case, kể cả case sẽ không đo được.

        §18 của chỉ thị: *"Không được finalize testcase khi chưa execute"* — và muốn chứng
        minh điều đó thì phải có chỗ ghi lại từng bước đã đi tới đâu. Bản ghi này chính là
        chỗ ấy; `chay_live` đọc nó rồi đổ vào `result/cases.json`.
        """
        self.case_dang_chay = case
        self.dau_vet = _dau_vet_moi()
        try:
            self.dau_vet['tien_dieu_kien'] = tdk.doc(case)
        except Exception:
            self.dau_vet['tien_dieu_kien'] = []
        return self.dau_vet

    def ghi_thao_tac(self, mo_ta=''):
        """Đánh dấu *"case này ĐÃ thực hiện thao tác trên app"* — nguồn của `action_executed`."""
        self.dau_vet['da_thao_tac'] = True
        if mo_ta:
            self.dau_vet.setdefault('thao_tac', []).append(str(mo_ta)[:120])

    def mo_lai_man(self, cho=2.0):
        """Mở LẠI màn từ URL gốc — dùng cho phép đo hỏi *"khi MỞ MÀN"*.

        Vì sao cần: các phép đo dùng chung một tab, nên chữ một phép trước gõ vào ô tìm kiếm
        vẫn còn đó khi phép sau đọc "giá trị mặc định". Lượt chạy 16/09 chấm **F** cho ô tìm
        kiếm của màn `LoaiLuuTru` vì nó đang chứa `zzqa_8618b3_004` — chữ do chính bước SETUP
        của một case khác gõ vào. Kết luận SAI về một chức năng đang chạy đúng, và là loại sai
        tệ nhất: nó tố cáo sản phẩm bằng rác của chính người đo.

        Chỉ ĐIỀU HƯỚNG (`Page.navigate`) — không bấm, không ghi; nằm trong danh sách thao tác
        ĐỌC của hàng rào §4c.
        """
        if not self.url:
            return False
        try:
            self.c.go(self.url)
            time.sleep(max(0.5, float(cho)))
            self.dong_hop_app()
            return True
        except Exception:
            return False

    # ── grounding ────────────────────────────────────────────────────────────
    def vb(self, *duong):
        """Chuỗi verbatim theo đường dẫn (`vb('form_them','toast_thanh_cong')`). None nếu không khai."""
        x = self.verbatim
        for k in duong:
            if not isinstance(x, dict) or k not in x:
                return None
            x = x[k]
        return x

    def hs_so(self, khoa, mac_dinh=None):
        return self.hang_so.get(khoa, mac_dinh)

    # ── trạng thái màn ───────────────────────────────────────────────────────
    def o_tim_kiem(self):
        """Nhãn ô tìm kiếm CỦA MÀN — lấy từ ảnh chụp thanh lọc trước, DOM sau.

        `probe_live.soi()` đã khoanh đúng thanh lọc của màn (vùng giữa `h1` và bảng), nên nó
        là nguồn đáng tin hơn một phép quét DOM toàn trang: app này có ô tìm kiếm toàn cục ở
        khung điều hướng, và quét toàn trang thì ô ấy đứng trước.
        """
        for x in (self.ng.d.get('thanh_loc') or []):
            if not str(x.get('the') or '').startswith('input'):
                continue
            t = _n('%s %s' % (x.get('nhan') or '', x.get('goi_y') or ''))
            if re.search(r'(^|[^a-z])(tim kiem|tim|search|tu khoa)([^a-z]|$)', t):
                return x.get('nhan') or x.get('goi_y')
        return ui._tim_o_tim_kiem(self.c)

    def dong_hop_app(self):
        """Đóng hộp thoại do CHÍNH APP tự mở sau khi nạp trang. -> [tiêu đề đã đóng].

        Gọi sau MỖI lần điều hướng. Hộp "Hướng dẫn sử dụng" của màn này mọc lại mỗi lần nạp
        trang; để nó nằm đó thì mọi phép đo phạm vi `hop` và mọi câu hỏi *"hộp đã đóng
        chưa"* đều trả lời về nhầm hộp. Ghi vào sổ an toàn để người đọc evidence biết tool
        đã bấm cái gì — đóng một hộp của app vẫn là một thao tác, không phải chuyện vô hình.
        """
        try:
            da = ui.dong_hop_chan_ngang(self.c)
        except Exception:
            return []
        if da:
            try:
                self.cong.hanh_dong('bam_nut_doc', 'đóng hộp app tự mở: %s' % ' · '.join(da))
            except Exception:
                pass
        return da

    def ve_danh_sach(self, lam_moi=False):
        """Đưa màn về danh sách sạch — và CHỨNG MINH là đã sạch. -> bool.

        ⚠️ VÁ 18/09. Bản trước nạp lại trang, chờ `table th` xuất hiện rồi coi như xong. Chờ
        có CỘT không chứng minh được bảng đã nạp DỮ LIỆU: màn kẹt ở trạng thái bảng rỗng vẫn
        có đủ cột. Hậu quả đo được, lặp lại suốt ngày 18/09:

          · phép đo đọc ra `0 dòng · tổng ?` rồi bỏ cuộc (r317);
          · `mo_hop('Thêm vị trí lưu trữ mới')` không mở được, 3 lượt liền (r471 · r472);
          · bước nghiệm thu dọn ném *"bảng rỗng cả khi bỏ lọc"* và `CLEANUP_FAILED`.

        Nay chờ tới khi bảng có DÒNG THẬT **hoặc** hiện đúng trạng thái rỗng của app; không
        đạt thì nạp lại lần nữa. Trả `False` khi vẫn không nạp được — người gọi biết mà dừng,
        thay vì đo trên một màn chưa có gì.
        """
        if ui.hop_cua_ta_con_mo(self.c):
            ui.dong_hop(self.c)
        if lam_moi:
            for lan in (1, 2, 3):
                self.c.go(self.url)
                self.c.wait("document.querySelectorAll('table th').length?1:0", 30)
                time.sleep(1.0)
                self.dong_hop_app()
                if self._bang_nap_duoc():
                    return True
                time.sleep(1.2 * lan)
            return False
        o = self.o_tim_kiem()
        if o:
            ui.dien(self.c, o, '', 'man', blur=False)
            time.sleep(max(0.8, float(self.hs_so('tim_kiem_debounce_ms', 0) or 0) / 1000.0 + 0.6))
        return True

    def hien_ban_ghi_qa(self, ma, lam_moi=False):
        """Đưa bản ghi QA vào tầm nhìn bằng chính ô tìm kiếm của màn. -> dòng, hoặc None."""
        if lam_moi:
            self.ve_danh_sach(lam_moi=True)
        ui.tim_kiem(self.c, ma, cho=self.hs_so('tim_kiem_debounce_ms'))
        return ui.doc_dong(self.c, ma)

    def con_tren_app(self, ma):
        """Bản ghi CÒN trên máy chủ không? — NẠP LẠI danh sách rồi mới trả lời.

        ⚠️ Vá sau lượt chạy thật 15/09. Màn này lọc/tìm **phía trình duyệt trên danh sách đã
        tải**, nên sau một cú Xoá thành công, dòng vừa xoá VẪN còn trong mảng của FE cho tới
        khi FE gọi lại API. Bản đầu đọc thẳng bảng ⇒ kết luận "xoá rồi mà bản ghi vẫn còn" ⇒
        `CLEANUP_FAILED` OAN, trong khi sổ mạng có `DELETE …/{id}` đi trót lọt.
        """
        return bool(self.hien_ban_ghi_qa(ma, lam_moi=True))

    # ── dữ liệu QA ───────────────────────────────────────────────────────────
    # §F — năm tình huống của một bản ghi QA mà sổ nói là CÒN SỐNG. Bản trước gộp cả năm vào
    # một chữ "không thấy", và chữ ấy không nói được nên làm gì tiếp: bản ghi bị case khác xoá
    # thì phải tạo cái mới, còn bảng chưa nạp xong thì tạo cái mới là đẻ thêm dữ liệu thừa
    # trên hệ thống thật. Tách ra mới quyết được.
    CO = 'CO'                      # còn trên app, dùng được
    BI_XOA = 'BI_XOA'              # RECORD_DELETED — sổ ghi chính tool đã xoá nó
    KHONG_THAY = 'KHONG_THAY'      # RECORD_NOT_FOUND — bảng nạp được, tìm rồi, không có
    CHUA_NAP = 'CHUA_NAP'          # RECORD_NOT_LOADED — bảng chưa nạp được, CHƯA kết luận gì
    BO_LOC_CHE = 'BO_LOC_CHE'      # FILTER_HIDDEN — bộ lọc đang bật che mất, xoá lọc là thấy
    LECH_PHIEN = 'LECH_PHIEN'      # SESSION_SCOPE_MISMATCH — mã không mang dấu của lượt này

    def kiem_ban_ghi(self, ma):
        """Bản ghi QA còn dùng được không, và nếu không thì VÌ SAO. -> {'trang_thai','dong',…}.

        ⚠️ VÁ 2026-09-17 lượt 2 (§F), truy từ 8 case `LỖI` của lượt chạy 500 case — cả 8 cùng
        một câu *"không thấy bản ghi QA zzqa_88883c_001"*. `ban_ghi()` bản trước lấy mục đầu
        tiên còn `CON_SONG` trong sổ rồi TRAO NGAY, không hỏi app một câu nào. Sổ thì chỉ biết
        những gì chính nó ghi, nên sau khi một case "xoá thành công" xoá mất bản ghi ấy, 8 case
        sau vẫn được trao đúng cái mã đã biến mất và cùng chết ở chỗ đầu tiên đụng tới nó.
        """
        m = self.so.muc.get(ma) or {}
        if m.get('trang_thai') in (qa_data.DA_XOA, qa_data.DA_DON):
            return {'trang_thai': self.BI_XOA, 'ma': ma,
                    'ly_do': 'sổ ghi bản ghi này đã bị xoá (%s)' % m.get('trang_thai')}
        if not str(ma).lower().startswith(qalib.QA_TIEN_TO):
            return {'trang_thai': self.LECH_PHIEN, 'ma': ma,
                    'ly_do': 'mã %r không mang dấu dữ liệu QA của lượt chạy' % ma}
        # ① ngay trên màn đang hiện — rẻ nhất, không đụng gì tới trạng thái màn
        dong = ui.doc_dong(self.c, ma)
        if dong:
            return {'trang_thai': self.CO, 'ma': ma, 'dong': dong, 'duong': 'man_dang_hien'}
        # ② nạp lại danh sách rồi tìm bằng chính ô tìm kiếm của màn
        co_loc = self._loc_dang_bat()
        dong = self.hien_ban_ghi_qa(ma, lam_moi=True)
        if dong:
            return {'trang_thai': self.CO, 'ma': ma, 'dong': dong,
                    'duong': 'sau_khi_nap_lai',
                    'ghi_chu': (self.BO_LOC_CHE if co_loc else '')}
        # ③ không thấy — bảng có nạp được không? Phân biệt "tìm rồi không có" với "chưa đọc
        #    được cái gì". Chỉ câu thứ nhất mới cho phép kết luận bản ghi đã mất.
        if not self._bang_nap_duoc():
            return {'trang_thai': self.CHUA_NAP, 'ma': ma,
                    'ly_do': 'bảng danh sách chưa nạp được — CHƯA kết luận bản ghi mất'}
        return {'trang_thai': self.KHONG_THAY, 'ma': ma, 'co_loc_luc_do': bool(co_loc),
                'ly_do': 'bảng nạp được, tìm theo mã, không có dòng nào'}

    def _loc_dang_bat(self):
        """Thanh lọc có ô nào đang mang giá trị không? -> [mô tả] (dùng để phân biệt §F)."""
        return _js_loc_dang_bat(self.c)

    def _bang_nap_duoc(self):
        """Bảng danh sách đã nạp xong chưa (có cột, và có dòng HOẶC có trạng thái rỗng)."""
        d = ui._js(self.c, """
          const th=document.querySelectorAll('table th').length;
          const tr=document.querySelectorAll('table tbody tr').length;
          return JSON.stringify({cot:th, dong:tr,
            bao_rong:/khong co du lieu|khong tim thay|no data/.test(
              QN((document.querySelector('table tbody')||{}).innerText||''))});""") or {}
        return bool(d.get('cot')) and (int(d.get('dong') or 0) > 0 or d.get('bao_rong'))

    def ban_ghi(self, case, moi=False, trang_thai=None):
        """Bản ghi QA để thao tác — tạo mới nếu chưa có. -> mục trong sổ, hoặc ném `ChanAnToan`.

        Đây là SETUP của vòng đời. Bản ghi được **dùng lại** trong cùng lượt chạy trừ khi phép
        đòi `moi=True` (case xoá — xoá xong thì bản ghi không còn để case sau dùng), và mỗi lần
        dùng lại đều phải qua `kiem_ban_ghi` — xem §F ở trên.
        """
        if not moi:
            for m in [x for x in self.so.con_ton() if x['trang_thai'] == qa_data.SONG]:
                k = self.kiem_ban_ghi(m['ma'])
                tt = k['trang_thai']
                if tt == self.CO:
                    # §7 đòi bản đồ **testcase → thực thể → bản ghi → hành động → trạng thái
                    # dọn**. Case DÙNG LẠI một bản ghi cũng phải có tên trong bản đồ ấy, nếu
                    # không thì nhìn sổ chỉ thấy case đã TẠO nó, còn 20 case khác từng thao tác
                    # lên nó thì không ai lần ra được.
                    self.so.ghi_hanh_dong(m['ma'], 'dung_lai',
                                          case.key if case is not None else '-', 'tái sử dụng')
                    self.dau_vet['fixture_ten'] = 'ban_ghi/dung_lai'
                    self.dau_vet['fixture_trang_thai'] = 'DUNG_LAI'
                    return m
                if tt in (self.BI_XOA, self.KHONG_THAY):
                    # Đánh dấu SẠCH: bản ghi thật sự không còn, bước dọn không phải tìm nữa.
                    self.so.danh_dau_khong_thay(
                        m['ma'], 'kiểm trước khi dùng lại: %s — %s' % (tt, k.get('ly_do') or ''))
                else:
                    # `CHUA_NAP` / `LECH_PHIEN`: KHÔNG đánh dấu sạch. Bản ghi có thể vẫn nằm
                    # trên hệ thống, và một mục bị đánh dấu sạch oan là một bản ghi QA bị bỏ
                    # lại vĩnh viễn trên môi trường thật — hỏng nặng hơn hẳn việc tạo thừa.
                    self.so.ghi_hanh_dong(m['ma'], 'kiem', case.key if case is not None else '-',
                                          tt, k.get('ly_do') or '')
        return self.tao_ban_ghi(case, trang_thai=trang_thai)

    def tao_ban_ghi(self, case, ten_rieng=None, ma_rieng=None, trang_thai=None, case_key=None):
        """SETUP: tạo một bản ghi QA mới qua biểu mẫu Thêm mới — CREATE → OBSERVE → VERIFY → REGISTER.

        ⚠️ VÁ 2026-09-17 lượt 2 (§D + §E), truy từ 18 case `LỖI` của lượt chạy 500 case. Bản
        trước đi MỘT LƯỢT thẳng: điền → bấm Lưu → thấy hộp còn mở thì ném lỗi. Hai chỗ hỏng:

          · **bấm Lưu khi ô bắt buộc chưa nhận giá trị.** Khi ô `Loại database` chọn trượt,
            bản trước vẫn bấm Lưu, và lỗi đọc được (*"ô Loại database chưa nhận giá trị"*)
            biến thành lỗi mù (*"hộp thoại còn mở"*) — mất luôn manh mối. Nay ô bắt buộc nào
            chưa verify được thì **không bấm Lưu**, đóng hộp và nói thẳng ô nào.
          · **hỏng một lượt là hỏng luôn.** Nguyên nhân gốc là danh sách tuỳ chọn vẽ lại giữa
            chừng — chuyện NGẪU NHIÊN. Nay có tạo lại (`SO_LAN_TAO` lượt).

        Tạo lại KHÔNG sinh được bản ghi trùng: cả ba lượt dùng LẠI đúng một mã `ma`, mà mã là
        trường unique của biểu mẫu. Nếu lượt trước đã tạo thật mà tool đọc hụt, thì lượt sau
        bị app từ chối với "mã đã tồn tại" — hỏng theo hướng nhìn thấy được, không phải âm
        thầm đẻ thêm dữ liệu. Trước mỗi lần tạo lại vẫn hỏi app một câu trước (`lam_moi=True`).
        """
        ma, ten = self.so.cap_ma()
        if ma_rieng:
            ma = ma_rieng
        if ten_rieng:
            ten = ten_rieng
        key = case_key or (case.key if case is not None else 'SETUP')
        self.so.khai_tao(ma, ten, key, 'dữ liệu QA cho case chạy live')
        self.dau_vet['fixture_ten'] = 'tao_ban_ghi'
        loi = []
        for lan in range(1, SO_LAN_TAO + 1):
            try:
                muc = self._tao_mot_lan(case, ma, ten, trang_thai)
                self.dau_vet['fixture_trang_thai'] = ('TAO_DUOC' if lan == 1
                                                      else 'TAO_DUOC_LUOT_%d' % lan)
                return muc
            except _TaoLai as e:
                loi.append('lượt %d: %s' % (lan, e))
                # OBSERVE trước khi thử lại: có thể bản ghi ĐÃ vào hệ thống mà tool đọc hụt
                # (danh sách chưa kịp nạp lại). Tạo lại lúc ấy là đẻ thêm dữ liệu trên môi
                # trường thật — đúng thứ hàng rào QA sinh ra để chặn.
                if self.hien_ban_ghi_qa(ma, lam_moi=True):
                    self.so.xac_nhan_tao(ma, co_tren_app=True)
                    self.dau_vet['fixture_trang_thai'] = 'TAO_DUOC_DOC_HUT'
                    return self.so.muc[ma]
                if lan < SO_LAN_TAO:
                    # ⚠️ NẠP LẠI TRANG trước khi thử lại, không chỉ đóng hộp. Lượt chạy dài
                    # tích luỹ trạng thái mà một cú đóng hộp không gỡ được: đo được 18/09 —
                    # ô chọn `Loại database` mở ra ở toạ độ x≈1996 trong khung rộng 1600, trong
                    # khi trên một trang VỪA NẠP nó luôn ở x=1196 (probe 8 lần liên tiếp, số
                    # không đổi một pixel). Dựng lại trạng thái từ đầu là việc người test làm
                    # khi màn cư xử lạ, và nó không cần biết bố cục lệch vì lý do gì.
                    try:
                        self.ve_danh_sach(lam_moi=True)
                    except Exception:
                        self.dong_hop_app()
        self.dau_vet['fixture_trang_thai'] = 'FIXTURE_HONG'
        raise LoiThaoTac('tạo bản ghi QA %s không thành công sau %d lượt || %s'
                         % (ma, SO_LAN_TAO, ' || '.join(loi)[:700]))

    def _tao_mot_lan(self, case, ma, ten, trang_thai):
        """MỘT lượt tạo. Ném `_TaoLai` cho mọi trục trặc còn thử lại được."""
        hop = ui.mo_hop(self.c, self.nut_them())
        if not hop:
            raise _TaoLai('không mở được biểu mẫu Thêm mới (%s)' % self.nut_them())
        da_dien = self.dien_form(ma=ma, ten=ten, trang_thai=trang_thai)
        chua = _o_chua_dat(da_dien)
        if chua:
            ui.dong_hop(self.c)
            # Giới hạn rộng: khối bố cục nằm ở CUỐI câu, cắt 300 ký tự là cắt đúng phần
            # dữ kiện cần để chẩn đoán (đã mất một vòng vì chuyện đó, 18/09).
            raise _TaoLai('KHÔNG bấm Lưu — ô bắt buộc chưa nhận giá trị: %s'
                          % ' · '.join(chua)[:1200])
        with self.ghi(case, 'tao', ma, mo_ta='SETUP tạo dữ liệu QA') as cs:
            ui.bam_ghi(self.c, self.nut_luu_them(), cs.giay_phep, cho=2.0)
        time.sleep(0.8)
        # Hỏi ĐÚNG hộp của mình, không hỏi "có hộp nào đang mở không" — app tự mở hộp
        # "Hướng dẫn sử dụng" sau mỗi lần nạp trang, và câu hỏi rộng kia luôn trả lời CÓ.
        tieu_de_form = self.vb('form_them', 'tieu_de')
        if ui.co_hop_thoai(self.c, tieu_de_form) if tieu_de_form else ui.co_hop_thoai(self.c):
            loi = ui.doc_loi(self.c, 'hop')
            ui.dong_hop(self.c)
            raise _TaoLai('bấm Lưu rồi mà hộp thoại còn mở: %s || đã điền: %s'
                          % (' | '.join(loi)[:200], _ke_dien(da_dien)[:400]))
        dong = self.hien_ban_ghi_qa(ma, lam_moi=True)
        self.so.xac_nhan_tao(ma, co_tren_app=bool(dong))
        if not dong:
            raise _TaoLai('bấm Lưu xong, hộp đã đóng, nhưng không thấy bản ghi %s '
                          'trên danh sách' % ma)
        return self.so.muc[ma]

    # ── nhãn nút / ô: lấy từ hồ sơ màn, không chốt cứng ──────────────────────
    def nut_them(self):
        ds = self.vb('nut_dau_man') or []
        for x in ds:
            if _bat_ky(_n(x), 'them'):
                return x
        return 'Thêm mới'

    def nut_luu_them(self):
        for x in (self.vb('form_them', 'nut') or []):
            if not qalib.chua_tu(x, 'huy', 'huy bo', 'dong'):
                return x
        return 'Lưu'

    def nut_luu_sua(self):
        for x in (self.vb('form_sua', 'nut') or []):
            if not qalib.chua_tu(x, 'huy', 'huy bo', 'dong'):
                return x
        return 'Lưu'

    def nut_huy(self, form='form_them'):
        for x in (self.vb(form, 'nut') or []):
            if qalib.chua_tu(x, 'huy', 'huy bo'):
                return x
        return 'Hủy'

    def o_form(self, form='form_them'):
        return [str(x) for x in (self.vb(form, 'nhan_o') or self.vb('form_them', 'nhan_o') or [])]

    def o_ma(self):
        """Nhãn ô MÃ (ô định danh) của biểu mẫu — ô đầu tiên khai ở hồ sơ màn."""
        ds = self.o_form()
        return ds[0] if ds else None

    def o_ten(self):
        ds = self.o_form()
        return ds[1] if len(ds) > 1 else None

    def o_bat_buoc(self, form='form_them'):
        """Nhãn các ô BẮT BUỘC của biểu mẫu, theo hồ sơ màn. [] nếu màn chưa khai.

        Rơi về `form_them` y như `o_form()`: hồ sơ màn thường chỉ tả ĐẦY ĐỦ biểu mẫu Thêm mới
        rồi ghi ở `form_sua` phần KHÁC BIỆT (ô Code bị khoá), nên hỏi thẳng `form_sua` thì ra
        rỗng và biểu mẫu Sửa lại không được điền ô bắt buộc nào.
        """
        return [str(x) for x in (self.vb(form, 'o_bat_buoc')
                                 or self.vb('form_them', 'o_bat_buoc') or [])]

    def dien_form(self, ma=None, ten=None, trang_thai=None, form='form_them'):
        """Điền biểu mẫu theo nhãn ô khai ở hồ sơ màn. Trả {nhãn: giá trị đọc lại}."""
        ra = {}
        da = set()

        def _dat(nhan, gt):
            ra[nhan] = gt
            da.add(_n(nhan))

        if ma is not None and self.o_ma():
            _dat(self.o_ma(), ui.dien(self.c, self.o_ma(), ma, 'hop'))
        if ten is not None and self.o_ten():
            _dat(self.o_ten(), ui.dien(self.c, self.o_ten(), ten, 'hop'))
        if trang_thai:
            ds = self.o_form()
            if len(ds) > 2:
                _dat(ds[2], ui.chon(self.c, ds[2], trang_thai, 'hop'))
        ra.update(self.dien_o_bat_buoc(form=form, bo_qua=da, ma=ma, ten=ten))
        return ra

    def dien_o_bat_buoc(self, form='form_them', bo_qua=(), ma='', ten=''):
        """Điền NỐT các ô bắt buộc mà `dien_form` chưa chạm tới. Trả {nhãn: kết quả}.

        VÁ 2026-09-16 — lỗ này im lặng đúng kiểu nguy nhất. Bản trước điền biểu mẫu theo VỊ
        TRÍ (ô 0 = mã, ô 1 = tên, ô 2 = trạng thái), nên màn nào có ô bắt buộc nằm ngoài ba vị
        trí ấy thì SETUP không tạo nổi bản ghi QA đầu tiên, MỌI case GHI của màn rơi về lớp
        `LỖI`, và vì `LỖI` là một lớp hợp lệ nên không bộ rà nào kêu — lượt chạy vẫn "xong".
        Đo trên `ViTriLuuTru` 16/09: `Loại database` (Selectbox) + `Chuỗi kết nối` không được
        điền ⇒ 115/115 case GHI hỏng với đúng một dòng *"Vui lòng chọn loại database"*.

        Dữ kiện lấy từ hồ sơ màn (`form_them.o_bat_buoc`), KIỂU ô đọc từ chính hộp thoại đang
        mở, còn GIÁ TRỊ là luật chung ở `qalib.gia_tri_qa_cho_o` — màn mới không phải khai thêm.
        """
        ra = {}
        bo_qua = set(bo_qua)
        can = [x for x in self.o_bat_buoc(form) if _n(x) not in bo_qua]
        if not can:
            return ra
        hop = ui.doc_hop_thoai(self.c) or {}
        theo_nhan = {}
        for o in (hop.get('o') or []):
            theo_nhan.setdefault(_nhan_o(o.get('nhan')), o)
        for nhan in can:
            o = theo_nhan.get(_nhan_o(nhan)) or {}
            if o.get('vo_hieu') or o.get('chi_doc'):
                continue
            the = str(o.get('the') or '')
            # Ô chọn: `<select>`, combobox ARIA, và cả ô KHÔNG đọc được mô tả (hộp thoại chỉ
            # liệt kê input/select/textarea/[role=combobox] — ô chọn dựng bằng `button` rơi ra
            # ngoài) nhưng hồ sơ màn đã khai là Selectbox.
            if the.startswith('select') or 'combobox' in the or (not o and self._la_o_chon(nhan)):
                ra[nhan] = self.chon_o_bat_buoc(nhan)
            else:
                ra[nhan] = ui.dien(self.c, nhan,
                                   qalib.gia_tri_qa_cho_o(nhan, o, ma or '', ten or ''), 'hop')
        return ra

    def chon_o_bat_buoc(self, nhan):
        """Đặt MỘT giá trị thật vào ô chọn bắt buộc của biểu mẫu. -> `bo_chon.KetQuaChon`.

        ⚠️ VÁ 2026-09-17 lượt 2. Bản trước tự cầm cả chuỗi mở-đọc-bấm-đọc lại ở đây, và đó là
        BẢN CHÉP TAY THỨ BA của cùng một việc (`ui.chon_dau_tien`, `ui.dat_o_chon`, chỗ này).
        Ba bản bấm ba kiểu, mỗi bản chắn một nửa số lỗi — nên 18/187 lần tạo dữ liệu QA của
        lượt chạy 500 case vẫn hỏng, tất cả cùng một câu *"chọn 'ClickHouse1' nhưng ô vẫn hiện
        'Chọn loại database'"*.

        Nay gọi `bo_chon.BoChon` — một đường duy nhất, sáu bước, có chuỗi lùi 4 cách bấm và
        **verify bắt buộc**. Kết quả trả về là `KetQuaChon`: `str()` ra chữ đọc lại được nếu
        đạt, ra `HỎNG: …` nếu không, nên bản kê `đã điền:` vẫn đọc như cũ; còn `.ok` cho phép
        người gọi chặn việc bấm Lưu khi ô chưa vào giá trị.
        """
        return bo_chon.BoChon(self.c, nhan, 'hop', self._goi_y_form(nhan),
                              _tuy_chon_o(self, nhan, 'hop')).chon(dau_tien=True)

    def _goi_y_form(self, nhan):
        """Chữ gợi ý verbatim của một ô chọn trên biểu mẫu — `''` nếu hồ sơ màn chưa khai."""
        try:
            return _goi_y_o_chon(self, nhan, 'hop')
        except Exception:
            return ''

    def _la_o_chon(self, nhan):
        """Hồ sơ màn có khai ô này là ô CHỌN không? (`loai_control`, khoá `Selectbox <nhãn>`)"""
        nb = _n(nhan)
        for k, v in (self.loai_control or {}).items():
            k = str(k)
            if _n(k).endswith(nb) and qalib.chua_tu(k, 'selectbox', 'combobox', 'o chon'):
                return True
            if _n(k) == nb and qalib.chua_tu(str(v), 'selectbox', 'combobox', 'o chon'):
                return True
        return False

    # ── cổng ghi ─────────────────────────────────────────────────────────────
    def ghi(self, case, hanh_dong, ma, so_toi_da=1, mo_ta='', so_id_toi_da=1):
        """Context manager mở CỬA SỔ GHI cho đúng một thao tác. Dùng:

            with ctx.ghi(case, 'sua', ma) as cs:
                ui.bam_ghi(c, 'Lưu thay đổi', cs.giay_phep)

        Vào: xin phép `Cong` (3 điều kiện §4c) + mở cửa sổ mạng đã khai endpoint/id.
        Ra : vét sổ mạng NGAY (lúc cửa sổ còn mở), chờ một nhịp cho request muộn, vét lần nữa,
             rồi đóng. Đóng trước khi vét là biến chính request của mình thành vi phạm.
        """
        return _CuaGhi(self, case, hanh_dong, ma, so_toi_da, mo_ta, so_id_toi_da)


class LoiThaoTac(RuntimeError):
    """Thao tác trên app không thực hiện được — case về lớp LỖI, không phải F."""


class _TaoLai(RuntimeError):
    """Trục trặc CÒN THỬ LẠI ĐƯỢC trong một lượt tạo dữ liệu QA. Không lọt ra ngoài `Ctx`."""


# Số lượt tạo dữ liệu QA (1 lượt chính + 2 lượt lại). Không để lớn hơn: mỗi lượt là một lần
# mở biểu mẫu thật trên hệ thống thật, và một fixture cần tới lượt thứ tư thì vấn đề nằm ở
# chỗ khác — kéo dài chỉ làm log dài ra chứ không tạo nổi.
SO_LAN_TAO = 3


def _o_chua_dat(da_dien):
    """Các ô mà `dien_form` BÁO THẲNG là chưa nhận được giá trị. -> ['nhãn (lý do)'].

    Chỉ tính lời báo hỏng TƯỜNG MINH (`KetQuaChon.ok == False`, hoặc chuỗi mở đầu "HỎNG"),
    KHÔNG tính ô đọc lại ra rỗng: nhiều ô của biểu mẫu thật đọc lại vốn rỗng mà vẫn lưu được
    (ô có giá trị mặc định ẩn, ô app tự điền). Coi "đọc lại rỗng" là chưa đặt thì chặn nhầm
    169 lượt tạo đang chạy đúng để chữa 18 lượt hỏng — lỗ mới to hơn lỗ cũ.
    """
    xau = []
    for nhan, v in (da_dien or {}).items():
        if isinstance(v, bo_chon.KetQuaChon):
            if not v.ok:
                # Kèm BẢN KÊ từng cách bấm đã thử và vì sao trượt. Câu "bấm không ăn" một
                # mình không sửa được gì: 18 case LỖI của lượt chạy 500 đều dừng ở câu ấy.
                b = [x for x in (v.get('buoc') or [])
                     if x.get('buoc') in ('SELECT', 'VERIFY_SELECTED') and not x.get('ok')]
                ke = ' ; '.join('%s→%s' % (x.get('cach') or '?', x.get('ly_do') or 'không đổi')
                                for x in b[-4:])
                xau.append('%s (%s%s)' % (nhan, v.get('ly_do') or 'không verify được',
                                          ' || ' + ke if ke else ''))
        elif isinstance(v, dict) and v.get('ok') is False:
            xau.append('%s (%s)' % (nhan, v.get('ly_do') or 'không verify được'))
        elif isinstance(v, str) and v.strip().startswith('HỎNG'):
            xau.append('%s (%s)' % (nhan, v.strip()[:120]))
    return xau


class _CuaGhi:
    def __init__(self, ctx, case, hanh_dong, ma, so_toi_da, mo_ta, so_id_toi_da=1):
        self.ctx, self.case, self.hanh_dong = ctx, case, hanh_dong,
        self.hanh_dong = hanh_dong
        self.ma, self.so_toi_da, self.mo_ta = ma, so_toi_da, mo_ta
        self.so_id_toi_da = so_id_toi_da
        self.cs = None
        self.giay_phep = None

    def __enter__(self):
        ctx = self.ctx
        muc = ctx.so.chung_minh(self.ma, self.hanh_dong) if self.hanh_dong != 'tao' \
            else ctx.so.muc.get(self.ma)
        if self.hanh_dong != 'tao' and not muc:
            raise qalib_chan('bản ghi %r không có trong sổ dữ liệu QA' % self.ma)
        # Cổng an toàn §4c — ba điều kiện, thiếu một là ChanAnToan.
        self.giay_phep = ctx.cong.ghi(self.ma, '%s dữ liệu QA' % self.hanh_dong, nhan=self.ma)
        ids = [str(muc['id_app'])] if (muc and muc.get('id_app')) else []
        self.cs = qalib.CuaSoGhiQA(
            case_key=(self.case.key if self.case is not None else 'SETUP'),
            hanh_dong=self.hanh_dong, thuc_the=ctx.man, ma=self.ma,
            endpoints=ctx.endpoints.get(self.hanh_dong) or [],
            ids_qa=ids, so_toi_da=self.so_toi_da, mo_ta=self.mo_ta,
            so_id_toi_da=self.so_id_toi_da)
        ctx.cong.mo_cua_so(self.cs)
        return self

    def __exit__(self, et, ev, tb):
        ctx = self.ctx
        try:
            if ctx._ghi_so_mang:
                ctx._ghi_so_mang(self.cs)       # vét lần 1 — cửa sổ CÒN MỞ
                time.sleep(0.8)
                ctx._ghi_so_mang(self.cs)       # vét lần 2 — request bay muộn
        finally:
            self.cs.dong()
            ctx.cong.dong_cua_so(self.cs)
            # id do app trả về trong URL mutation là thứ duy nhất buộc được bản ghi với hàng
            # rào mạng ở các thao tác sau -> ghi vào sổ ngay.
            for x in self.cs.da_dung:
                if x.get('id') and self.ma in ctx.so.muc:
                    try:
                        ctx.so.buoc_id(self.ma, x['id'])
                    except Exception:
                        pass
        return False


def qalib_chan(msg):
    from chay_live import ChanAnToan
    return ChanAnToan(msg)


# ══════════════════════════════════════════════════════════════════════════════
# PHÉP ĐO — mỗi phép: (tên, cần ghi?, nhận diện, chạy)
# ══════════════════════════════════════════════════════════════════════════════
# Nhận diện là hàm THUẦN trên `case` (không chạm app) để `--dry-run` đếm đúng bằng lượt thật.
PHEP = []


def phep(ten, can_ghi=False, loai='UI'):
    """Đăng ký một phép đo.

    `loai` là **measurement_type** mà §2 của chỉ thị 16/09 lượt 3 đòi ghi vào `cases.json`:
    UI · API · MOCK · MULTI_SESSION · GEOMETRY · DATA · DB. Mặc định `UI` vì phần lớn phép
    đo là thao tác trên màn; phép nào đo bằng đường khác thì khai đúng đường ấy — người đọc
    evidence cần biết một kết luận đứng trên nền nào trước khi tin nó.
    """
    def deco(f):
        PHEP.append({'ten': ten, 'can_ghi': can_ghi, 'nhan': f.nhan, 'chay': f,
                     'loai': loai})
        return f
    return deco


def loai_phep(ten):
    """measurement_type của một phép đo theo tên. 'UI' nếu phép không khai."""
    for p in PHEP:
        if p['ten'] == ten:
            return p.get('loai') or 'UI'
    return 'UI' 


def nhan_dien(f_nhan):
    def deco(f):
        f.nhan = f_nhan
        return f
    return deco


def _pv(case):
    from chay_live import pham_vi
    return pham_vi(case)


def _nhom(case):
    return case.nhom.get('sub2') or case.nhom.get('sub') or ''


# ──────────────────────────────────────────────────────────────────────────────
# A. DANH SÁCH — cột · trạng thái rỗng · đếm bản ghi · KPI
# ──────────────────────────────────────────────────────────────────────────────
@phep('tieu_de_cot')
@nhan_dien(lambda cs: _co(_n(cs.b), 'tieu de cot') and _pv(cs) in ('danh_sach', 'loc'))
def p_tieu_de_cot(case, ctx):
    """Cột bảng có đúng tên + đúng thứ tự như cột D / `verbatim.cot_bang` khai."""
    mong = [str(x) for x in (ctx.vb('cot_bang') or [])]
    if not mong:
        mong = _cot_tu_cot_d(case.d)
    if not mong:
        return None
    that = [x for x in (ui.cot_bang(ctx.c) or []) if str(x).strip()]
    if not that:
        return None
    # Cột ô tích chọn không có tiêu đề chữ -> bỏ ô rỗng trước khi so THỨ TỰ.
    tn, mn = [_n(x) for x in that], [_n(x) for x in mong]
    if tn == mn:
        return 'P', ('Bảng hiện đúng %d cột, đúng thứ tự: %s.' % (len(mong), ' · '.join(mong))), \
               {'mong': mong, 'that': that}
    thieu = [m for m, n in zip(mong, mn) if n not in tn]
    du = [t for t, n in zip(that, tn) if n not in mn]
    return 'F', ('Cột bảng LỆCH so với yêu cầu.\nYêu cầu: %s\nMàn thật: %s%s%s'
                 % (' · '.join(mong), ' · '.join(that),
                    ('\nThiếu: %s' % ' · '.join(thieu)) if thieu else '',
                    ('\nThừa: %s' % ' · '.join(du)) if du else '')), \
           {'mong': mong, 'that': that, 'thieu': thieu, 'du': du}


def _cot_tu_cot_d(d):
    """Danh sách cột rút từ cột D dạng *"đúng thứ tự: STT · Code · Tên hiển thị · …"*."""
    m = re.search(r'(?:thứ tự|thu tu)\s*:?\s*(.+)', d or '', re.I)
    if not m:
        return []
    doan = m.group(1).split('\n')[0]
    doan = re.split(r'\.\s|\.$', doan)[0]
    ra = [x.strip(' .') for x in re.split(r'·|\|', doan) if x.strip(' .')]
    return ra if len(ra) >= 3 else []


@phep('trang_thai_rong')
@nhan_dien(lambda cs: (_co(_n(cs.b), 'khong co du lieu') and _pv(cs) in ('danh_sach', 'loc')))
def p_trang_thai_rong(case, ctx):
    """Tìm một từ khoá chắc chắn không khớp -> bảng phải hiện đúng câu `rong_co_loc`/`rong_khong_du_lieu`."""
    mong = ctx.vb('rong_co_loc') or ctx.vb('rong_khong_du_lieu')
    if not mong:
        return None
    tu = 'zzzqakhongkhop%d' % int(time.time() % 100000)
    kq = ui.tim_kiem(ctx.c, tu, cho=ctx.hs_so('tim_kiem_debounce_ms'))
    if not kq:
        return None
    van = kq.get('van_ban') or ''
    so_dong = kq.get('so_dong')
    thay = [x for x in (ctx.vb('rong_co_loc'), ctx.vb('rong_khong_du_lieu')) if x and x in van]
    ctx.ve_danh_sach()
    du_kien = {'tu_khoa': tu, 'so_dong_con_lai': so_dong, 'cau_tim_thay': thay,
               'cau_mong_doi': mong}
    if so_dong:
        return 'F', ('Tìm từ khoá không khớp mà bảng vẫn còn %d dòng dữ liệu.' % so_dong), du_kien
    if thay:
        return 'P', ('Danh sách rỗng hiện đúng dòng chữ nguyên văn "%s".' % thay[0]), du_kien
    return 'F', ('Danh sách rỗng KHÔNG hiện dòng chữ nguyên văn mà hồ sơ màn khai ("%s"). '
                 'Màn chỉ còn bảng trống.' % mong), du_kien


@phep('so_ban_ghi_khop_tong')
@nhan_dien(lambda cs: _co(_n(cs.b), 'so luong ban ghi tren') and _pv(cs) in ('danh_sach', 'loc'))
def p_so_ban_ghi_khop(case, ctx):
    """Số dòng đang hiện phải khớp *"Tổng số bản ghi"* (khi tổng ≤ số bản ghi/trang)."""
    pt = ui.doc_phan_trang(ctx.c) or {}
    tong = re.sub(r'[^\d]', '', str(pt.get('tong') or ''))
    so_dong = pt.get('so_dong')
    if not tong or so_dong is None:
        return None
    tong = int(tong)
    cs_trang = int(ctx.hs_so('page_size_mac_dinh', 20) or 20)
    du_kien = {'tong_tren_man': tong, 'so_dong_hien': so_dong, 'so_ban_ghi_trang': cs_trang}
    mong = min(tong, cs_trang)
    if so_dong == mong:
        return 'P', ('Đếm %d dòng trên trang, khớp tổng số bản ghi %d (mức %d bản ghi/trang).'
                     % (so_dong, tong, cs_trang)), du_kien
    return 'F', ('Số dòng hiển thị (%d) KHÔNG khớp: tổng %d bản ghi, mức %d bản ghi/trang ⇒ '
                 'trang đầu phải có %d dòng.' % (so_dong, tong, cs_trang, mong)), du_kien


_RX_TIEN_TO_THE = re.compile(r'^\s*(th[ẻe]\s*s[ốo]\s*li[ệe]u|th[ẻe]\s*th[ốo]ng\s*k[êe]|th[ẻe])\s*',
                             re.I)


def ten_the_so_lieu(ctx, case):
    """Tên NGUYÊN VĂN của thẻ số liệu mà case nói tới. -> chuỗi.

    ⚠️ VÁ 2026-09-17 lượt 2 — gốc của 4 case thẻ số liệu nằm CHƯA ĐO. Hai phép đo đều lấy tên
    thẻ bằng `qalib.field_of(_nhom(case))`, mà `_FIELD_PREFIX` của `field_of` **không có**
    tiền tố *"Thẻ số liệu"*: nhóm `Thẻ số liệu Tổng vị trí lưu trữ` trả về NGUYÊN chuỗi ấy,
    rồi phép đi tìm trên màn một thẻ tên *"Thẻ số liệu Tổng vị trí lưu trữ"* — thẻ thật tên
    `TỔNG VỊ TRÍ LƯU TRỮ`. Không bao giờ khớp.

    Không nới `field_of` ở `qalib`: hàm ấy dùng chung cho đường SINH case, sửa nó là đổi tiêu
    đề của hàng nghìn case đã sinh. Lấy tên từ hai nguồn đã ground sẵn, theo thứ tự:
      ① cột C nêu nguyên văn trong ngoặc kép (`Đọc con số trên thẻ "TỔNG VỊ TRÍ LƯU TRỮ"`);
      ② hồ sơ màn khai `verbatim.the_so_lieu`, khớp với tên nhóm đã bóc tiền tố.
    """
    khai = [str(x) for x in (ctx.vb('the_so_lieu') or []) if str(x).strip()]
    for x in re.findall(r'"([^"]{2,60})"', case.c or ''):
        for k in khai:
            if _n(x) == _n(k):
                return k
    goc = _RX_TIEN_TO_THE.sub('', _nhom(case) or '').strip()
    for k in khai:
        if _n(k) == _n(goc):
            return k
    if goc:
        for k in khai:
            if _n(goc) in _n(k) or _n(k) in _n(goc):
                return k
    return goc or qalib.field_of(_nhom(case))


@phep('the_so_lieu_khop')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith('the so lieu')
                       and _co(_n(cs.b), 'khop du lieu trong he thong')
                       and _pv(cs) in ('danh_sach', 'loc')))
def p_the_khop(case, ctx):
    """Thẻ *Tổng …* phải khớp *Tổng số bản ghi* của bảng. Thẻ khác: không có nguồn đối chiếu -> im."""
    ten = ten_the_so_lieu(ctx, case)
    if not _bat_ky(_n(ten), 'tong'):
        return None                      # thẻ "Đang hoạt động"… cần lọc theo trạng thái -> để CHƯA ĐO
    the = [t for t in (ctx.ng.d.get('the_so_lieu') or [])
           if _n(t.get('nhan')) == _n(ten) or _n(ten) in _n(t.get('nhan'))]
    if not the:
        return None
    gt = re.sub(r'[^\d]', '', str(the[0].get('gia_tri') or ''))
    pt = ui.doc_phan_trang(ctx.c) or {}
    tong = re.sub(r'[^\d]', '', str(pt.get('tong') or ''))
    if not gt or not tong:
        return None
    du_kien = {'the': the[0].get('nhan'), 'gia_tri_the': gt, 'tong_ban_ghi': tong}
    if gt == tong:
        return 'P', ('Thẻ "%s" = %s, khớp tổng số bản ghi %s của danh sách.'
                     % (the[0].get('nhan'), gt, tong)), du_kien
    return 'F', ('Thẻ "%s" = %s nhưng danh sách báo tổng số bản ghi = %s — hai con số LỆCH.'
                 % (the[0].get('nhan'), gt, tong)), du_kien


# ──────────────────────────────────────────────────────────────────────────────
# B. Ô TÍCH CHỌN
# ──────────────────────────────────────────────────────────────────────────────
@phep('tich_chon_dong')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('checkbox', 'o tich chon'))
                       and _bat_ky(_n(cs.b), 'tich chon o tich chon cua mot ban ghi',
                                   'bo tich o tich chon cua mot ban ghi',
                                   'gia tri mac dinh cua o tich chon')
                       and _pv(cs) in ('danh_sach', 'loc')))
def p_tich_chon(case, ctx):
    """Mặc định không tích · tích được · bỏ tích được — đo trên dòng ĐẦU của bảng (thao tác đọc)."""
    nb = _n(case.b)
    bang = ui.doc_bang(ctx.c)
    if not bang:
        return None
    ma_dong = None
    for v in (bang[0].get('o') or {}).values():
        if (v or '').strip():
            ma_dong = v.strip()
            break
    if not ma_dong:
        return None
    if 'gia tri mac dinh' in nb:
        tt = ui._js(ctx.c, """
          const cb=document.querySelector('table tbody tr input[type=checkbox],'+
             'table tbody tr [role=checkbox]');
          if(!cb) return 'null';
          return JSON.stringify({tich: cb.type==='checkbox'?cb.checked
             :(cb.getAttribute('aria-checked')==='true')});""")
        if tt is None:
            return None
        if not tt.get('tich'):
            return 'P', 'Mở màn danh sách: ô tích chọn của bản ghi mặc định KHÔNG được tích.', tt
        return 'F', 'Ô tích chọn của bản ghi đang được tích sẵn khi mở màn.', tt
    bo = 'bo tich' in nb
    if bo:
        ui.tich_dong(ctx.c, ma_dong, bo=False)
        time.sleep(0.3)
    kq = ui.tich_dong(ctx.c, ma_dong, bo=bo)
    if not (kq and kq.get('ok')):
        return None
    tich = kq.get('tich')
    ui.tich_dong(ctx.c, ma_dong, bo=True)      # trả màn về trạng thái cũ
    du_kien = {'dong': ma_dong, 'sau_thao_tac': tich}
    if bool(tich) == (not bo):
        return 'P', ('%s ô tích chọn của bản ghi: trạng thái sau thao tác = %s, đúng yêu cầu.'
                     % ('Bỏ tích' if bo else 'Tích chọn', 'đã tích' if tich else 'bỏ tích')), du_kien
    return 'F', ('%s ô tích chọn nhưng trạng thái sau thao tác = %s.'
                 % ('Bỏ tích' if bo else 'Tích chọn', 'đã tích' if tich else 'bỏ tích')), du_kien


@phep('tich_chon_tat_ca')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('checkbox', 'o tich chon'))
                       and _co(_n(cs.b), 'tich chon tat ca')
                       and not _co(_n(cs.b), 'bo tich')
                       and _pv(cs) in ('danh_sach', 'loc')))
def p_tich_tat_ca(case, ctx):
    """Tích ô tiêu đề -> mọi dòng được tích + thanh thao tác hàng loạt hiện đúng chữ verbatim."""
    kq = ui._js(ctx.c, """
      const cb=document.querySelector('table thead input[type=checkbox],'+
         'table thead [role=checkbox]');
      if(!cb) return 'null';
      cb.click();
      return JSON.stringify({ok:true});""")
    if not kq:
        return None
    time.sleep(0.6)
    sau = ui._js(ctx.c, """
      const ds=[...document.querySelectorAll('table tbody tr input[type=checkbox],'+
         'table tbody tr [role=checkbox]')];
      return JSON.stringify({tong:ds.length, tich:ds.filter(cb=>cb.type==='checkbox'?cb.checked
         :(cb.getAttribute('aria-checked')==='true')).length,
         van:(document.body.innerText||'').slice(0,6000)});""")
    van = (sau or {}).get('van') or ''
    thanh = [x for x in (ctx.vb('thanh_hang_loat') or [])]
    thieu = []
    for x in thanh:
        mau = re.sub(r'\{[^}]*\}', r'\\d+', re.escape(str(x)).replace(r'\{', '{').replace(r'\}', '}'))
        mau = re.sub(r'\\\{[^}]*\\\}', r'\\d+', re.escape(str(x)))
        if not re.search(mau.replace(r'\{N\}', r'\d+'), van):
            thieu.append(x)
    ui._js(ctx.c, """
      const cb=document.querySelector('table thead input[type=checkbox],'+
         'table thead [role=checkbox]'); if(cb) cb.click(); return '1';""")
    du_kien = {'so_dong': (sau or {}).get('tong'), 'so_tich': (sau or {}).get('tich'),
               'thanh_hang_loat_khai': thanh, 'thieu': thieu}
    if not sau or sau.get('tong') != sau.get('tich'):
        return 'F', ('Tích ô tiêu đề nhưng chỉ %s/%s dòng được tích.'
                     % ((sau or {}).get('tich'), (sau or {}).get('tong'))), du_kien
    if thanh and thieu:
        return 'F', ('Mọi dòng đã được tích, nhưng thanh thao tác hàng loạt THIẾU mục: %s '
                     '(hồ sơ màn khai: %s).' % (' · '.join(thieu), ' · '.join(thanh))), du_kien
    return 'P', ('Tích ô tiêu đề: cả %d dòng của trang được tích%s.'
                 % (sau.get('tong'),
                    (' và thanh thao tác hàng loạt hiện đủ mục: %s' % ' · '.join(thanh))
                    if thanh else '')), du_kien


# ──────────────────────────────────────────────────────────────────────────────
# C. PHÂN TRANG
# ──────────────────────────────────────────────────────────────────────────────
@phep('o_so_ban_ghi_nhap')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith('textbox so ban ghi')
                       and _bat_ky(_n(cs.b), 'nhap ky tu khac so', 'nhap so am', 'nhap 0 vao',
                                   'nhap lon hon 1000')
                       and _pv(cs) in ('danh_sach', 'loc')))
def p_o_so_ban_ghi(case, ctx):
    """Ô *Số bản ghi/trang* trước dữ liệu không hợp lệ: chữ · số âm · 0 · vượt trần."""
    nb = _n(case.b)
    o = 'Số bản ghi/trang'
    # Đọc ô theo VÙNG phân trang, không theo nhãn: chữ "Số bản ghi/trang:" là một <span> cạnh
    # ô chứ không phải <label>, nên `doc_o` trả None và phép bỏ cuộc trên một ô đang hiện.
    truoc = ui.o_muc_trang(ctx.c)
    if not truoc:
        return None
    cu = (truoc.get('gia_tri') or '').strip()
    if 'nhap ky tu khac so' in nb:
        gt, mong = 'abc', 'không nhận ký tự chữ'
    elif 'nhap so am' in nb:
        gt, mong = '-5', 'không nhận số âm'
    elif 'nhap 0 vao' in nb:
        gt, mong = '0', 'trở về giá trị đang áp dụng'
    else:
        gt, mong = str(int(ctx.hs_so('page_size_toi_da', 1000) or 1000) + 1), 'báo lỗi vượt trần'
    ui.dat_muc_trang(ctx.c, gt, cho=1.2)
    sau = ui.o_muc_trang(ctx.c) or {}
    loi = ui.doc_loi(ctx.c, 'man') + ui.doc_thong_bao(ctx.c)
    gt_sau = (sau.get('gia_tri') or '').strip()
    du_kien = {'gia_tri_go': gt, 'gia_tri_sau': gt_sau, 'gia_tri_truoc': cu, 'loi': loi[:4]}
    # trả ô về mức cũ
    ui.dat_muc_trang(ctx.c, cu or str(ctx.hs_so('page_size_mac_dinh', 20)), cho=0.8)
    if 'nhap lon hon 1000' in nb:
        cau = ctx.vb('loi_page_size') or []
        cau_tran = [x for x in cau if _bat_ky(_n(x), 'toi da')]
        hit = [x for x in cau_tran if any(_n(x) in _n(l) or _n(l) in _n(x) for l in loi)]
        if hit:
            return 'P', ('Nhập %s: hệ thống báo đúng nguyên văn "%s".' % (gt, hit[0])), du_kien
        if gt_sau == gt:
            return 'F', ('Nhập %s vào ô "%s": ô nhận giá trị và KHÔNG có thông báo lỗi nào '
                         '(hồ sơ màn khai phải báo "%s").'
                         % (gt, o, (cau_tran or ['Số bản ghi/trang tối đa …'])[0])), du_kien
        return 'F', ('Nhập %s: ô tự về %r nhưng KHÔNG hiện thông báo lỗi nguyên văn "%s".'
                     % (gt, gt_sau, (cau_tran or ['…'])[0])), du_kien
    if 'nhap 0 vao' in nb:
        if gt_sau and gt_sau != '0':
            return 'P', ('Nhập 0 rồi Enter: ô tự về giá trị đang áp dụng (%s).' % gt_sau), du_kien
        return 'F', ('Nhập 0 rồi Enter: ô vẫn giữ %r, không trở về giá trị đang áp dụng.'
                     % gt_sau), du_kien
    # chữ / số âm: "Không cho phép nhập"
    con = re.sub(r'[^0-9-]', '', gt_sau)
    if gt_sau == '' or gt_sau == cu or (gt.startswith('-') and not gt_sau.startswith('-')) \
            or (gt == 'abc' and con == gt_sau and gt_sau.isdigit()):
        return 'P', ('Gõ %r vào ô "%s": ô không nhận (giá trị sau thao tác: %r) — đúng yêu cầu %s.'
                     % (gt, o, gt_sau, mong)), du_kien
    return 'F', ('Gõ %r vào ô "%s": ô NHẬN giá trị (%r), trái yêu cầu "Không cho phép nhập".'
                 % (gt, o, gt_sau)), du_kien


@phep('danh_so_thu_tu')
@nhan_dien(lambda cs: (_co(_n(cs.b), 'cach danh so cac ban ghi')
                       and _pv(cs) in ('danh_sach', 'loc')))
def p_danh_so(case, ctx):
    """Cột STT tăng dần, liên tục, bắt đầu từ 1."""
    bang = ui.doc_bang(ctx.c)
    if not bang:
        return None
    stt = []
    for r in bang:
        s = re.sub(r'[^\d]', '', (r.get('stt') or ''))
        if s:
            stt.append(int(s))
    if len(stt) < 2:
        return None
    mong = list(range(stt[0], stt[0] + len(stt)))
    du_kien = {'stt_doc_duoc': stt[:25], 'so_dong': len(bang)}
    if stt == mong and stt[0] == 1:
        return 'P', ('Cột STT của trang đầu đánh số tăng dần liên tục 1…%d.' % stt[-1]), du_kien
    return 'F', ('Cột STT KHÔNG tăng dần liên tục từ 1: đọc được %s.'
                 % ', '.join(str(x) for x in stt[:12])), du_kien


@phep('phan_trang_theo_tong')
@nhan_dien(lambda cs: (_n(_nhom(cs)) == 'phan trang'
                       and _bat_ky(_n(cs.b), 'hien thi 20 ban ghi', 'hien thi < 20 ban ghi',
                                   'hien thi 21 ban ghi')
                       and _pv(cs) in ('danh_sach', 'loc')))
def p_phan_trang_tong(case, ctx):
    """Có/không có cụm phân trang theo tổng số bản ghi so với mức/trang.

    Case viết theo dữ liệu GIẢ ĐỊNH ("đủ 21 bản ghi"). Không dựng được đúng tổng đó thì phép
    **không kết luận** — dựng dữ liệu chỉ để thoả một con số là sửa hệ thống cho khớp case.
    """
    pt = ui.doc_phan_trang(ctx.c) or {}
    tong = re.sub(r'[^\d]', '', str(pt.get('tong') or ''))
    if not tong:
        return None
    tong = int(tong)
    cs_trang = int(ctx.hs_so('page_size_mac_dinh', 20) or 20)
    nb = _n(case.b)
    muon_nhieu_trang = 'hien thi 21' in nb
    thuc_nhieu_trang = tong > cs_trang
    dung = 'trạng thái sẵn có'
    khoi_phuc = None
    if muon_nhieu_trang != thuc_nhieu_trang:
        # ⚠️ VÁ 2026-09-17 lượt 2. Case đòi màn MỘT trang, nhưng lượt chạy đã tạo hàng chục
        # bản ghi QA cho các case phân trang trước đó ⇒ điều kiện không còn đúng và phép bỏ
        # cuộc. Xoá bớt dữ liệu để chiều case là sửa hệ thống cho khớp case — cấm.
        #
        # Dựng bằng CỠ TRANG: nâng mức bản ghi/trang cho tới khi *tổng ≤ mức/trang*. Mệnh đề
        # cột D (*"không hiển thị phân trang"*) nói về đúng quan hệ ấy, nên phép so vẫn là
        # phép so của cột D, chỉ khác đường dựng — và đường dựng được ghi thẳng vào kết luận
        # để người đọc tự thẩm.
        if muon_nhieu_trang or not tong:
            return None
        moi = tong if 'hien thi 20' in nb else tong + 5
        r = ui.dat_muc_trang(ctx.c, moi)
        if not r.get('ok'):
            return None
        khoi_phuc, cs_trang, thuc_nhieu_trang = str(cs_trang), moi, False
        pt = r.get('phan_trang') or ui.doc_phan_trang(ctx.c) or {}
        dung = 'đặt %d bản ghi/trang để tổng %d bản ghi nằm gọn trong một trang' % (moi, tong)
    try:
        return _ket_phan_trang_tong(ctx, pt, tong, cs_trang, thuc_nhieu_trang, dung)
    finally:
        if khoi_phuc:
            ui.dat_muc_trang(ctx.c, khoi_phuc, cho=1.0)


def _ket_phan_trang_tong(ctx, pt, tong, cs_trang, thuc_nhieu_trang, dung):
    co_nut = ui.nhieu_trang(pt)
    du_kien = {'tong': tong, 'muc_trang': cs_trang, 'so_nut_trang': pt.get('so_nut_trang'),
               'trang_thai_da_dung': dung, 'muc_bang_chung': 'UI'}
    if thuc_nhieu_trang:
        if co_nut:
            return 'P', ('Tổng %d bản ghi > %d/trang: cụm phân trang hiện với %s nút trang.'
                         % (tong, cs_trang, pt.get('so_nut_trang'))), du_kien
        return 'F', ('Tổng %d bản ghi > %d/trang nhưng KHÔNG thấy cụm phân trang.'
                     % (tong, cs_trang)), du_kien
    if not co_nut:
        return 'P', ('Tổng %d bản ghi ≤ %d bản ghi/trang (%s): không hiện cụm phân trang — '
                     'đúng yêu cầu.' % (tong, cs_trang, dung)), du_kien
    return 'F', ('Tổng %d bản ghi ≤ %d bản ghi/trang (%s) nhưng vẫn hiện %s nút trang.'
                 % (tong, cs_trang, dung, pt.get('so_nut_trang'))), du_kien


# ──────────────────────────────────────────────────────────────────────────────
# D. TÌM KIẾM
# ──────────────────────────────────────────────────────────────────────────────
_TK = (('khop 100%', 'khop_100'), ('khop 1 phan', 'khop_mot_phan'),
       ('khong phan biet', 'hoa_thuong'), ('tieng viet co dau', 'co_dau'),
       ('tu khoa khong ton tai', 'khong_ton_tai'), ('xoa tu khoa da nhap', 'xoa_tu_khoa'))


@phep('tim_kiem', can_ghi=True)
@nhan_dien(lambda cs: (_bat_ky(_n(cs.b), *[k for k, _ in _TK])
                       and _pv(cs) in ('loc', 'danh_sach')))
def p_tim_kiem(case, ctx):
    """Tìm kiếm trên bản ghi QA — dữ liệu biết trước nên kết luận là xác định.

    Vì sao `can_ghi=True`: để kết luận *"tìm khớp 100 % thì ra ĐÚNG bản ghi đó"* phải có một
    bản ghi mà ta biết chắc nội dung. Dùng bản ghi thật của hệ thống là đo trên dữ liệu có thể
    đổi bất cứ lúc nào — và case *"từ khoá không tồn tại"* thì không có bản ghi thật nào bảo
    đảm được điều đó.
    """
    nb = _n(case.b)
    loai = next((v for k, v in _TK if k in nb), None)
    if not loai:
        return None
    min_ky_tu = int(ctx.hs_so('tim_kiem_min_ky_tu', 0) or 0)
    debounce = ctx.hs_so('tim_kiem_debounce_ms')
    m = ctx.ban_ghi(case)
    ma, ten = m['ma'], m['ten']
    if loai == 'khop_100':
        tu = ma
    elif loai == 'khop_mot_phan':
        tu = ma[4:14] if len(ma) > 14 else ma[:max(min_ky_tu, 5)]
    elif loai == 'hoa_thuong':
        tu = ma.upper()
    elif loai == 'co_dau':
        tu = 'Dữ liệu QA'
    elif loai == 'khong_ton_tai':
        tu = 'zzqakhongtontai%d' % int(time.time() % 100000)
    else:
        tu = ma
    kq = ui.tim_kiem(ctx.c, tu, cho=debounce)
    if not kq:
        return None
    dong = ui.doc_dong(ctx.c, ma)
    pt = ui.doc_phan_trang(ctx.c) or {}
    du_kien = {'tu_khoa': tu, 'ban_ghi_qa': ma, 'so_dong': pt.get('so_dong'),
               'thay_ban_ghi_qa': bool(dong), 'min_ky_tu': min_ky_tu}
    if loai == 'xoa_tu_khoa':
        truoc = pt.get('so_dong')
        ui.tim_kiem(ctx.c, '', cho=debounce)
        sau = (ui.doc_phan_trang(ctx.c) or {}).get('so_dong')
        du_kien['so_dong_sau_khi_xoa'] = sau
        if sau is not None and truoc is not None and sau >= truoc:
            return 'P', ('Xoá từ khoá: danh sách trở lại đầy đủ (%s dòng, trước đó lọc còn %s).'
                         % (sau, truoc)), du_kien
        return 'F', ('Xoá từ khoá nhưng danh sách không trở lại đầy đủ (còn %s dòng).'
                     % sau), du_kien
    ctx.ve_danh_sach()
    if loai == 'khong_ton_tai':
        if not pt.get('so_dong'):
            return 'P', ('Tìm từ khoá không tồn tại %r: danh sách không còn bản ghi nào.'
                         % tu), du_kien
        return 'F', ('Tìm từ khoá không tồn tại %r mà danh sách vẫn còn %s dòng.'
                     % (tu, pt.get('so_dong'))), du_kien
    if dong:
        return 'P', ('Tìm %r (%s): danh sách trả về đúng bản ghi QA %s (%s dòng).'
                     % (tu, loai.replace('_', ' '), ma, pt.get('so_dong'))), du_kien
    return 'F', ('Tìm %r (%s): KHÔNG thấy bản ghi QA %s trong kết quả (%s dòng).'
                 % (tu, loai.replace('_', ' '), ma, pt.get('so_dong'))), du_kien


# ──────────────────────────────────────────────────────────────────────────────
# E. GIAO DIỆN CHUNG — bàn phím · zoom
# ──────────────────────────────────────────────────────────────────────────────
@phep('tab_shift_tab')
@nhan_dien(lambda cs: _bat_ky(_n(cs.b), 'khi thuc hien tab', 'khi thuc hien shift tab'))
def p_tab(case, ctx):
    """Tab / Shift+Tab: tiêu điểm có đi qua các control theo đúng thứ tự DOM và quay lại được.

    Đo được: chuỗi tiêu điểm thật. KHÔNG đo được "trái qua phải, trên xuống dưới" theo cảm
    nhận thị giác — nên phép này chấm theo thứ tự tài liệu (chuẩn của bàn phím) và nói rõ.
    """
    nguoc = 'shift tab' in _n(case.b)
    if ui.co_hop_thoai(ctx.c):
        ui.dong_hop(ctx.c)
    ui._js(ctx.c, "document.body.focus(); if(document.activeElement)document.activeElement.blur();"
                  " return '1';")
    chuoi = []
    for _ in range(10):
        ui.go_phim(ctx.c, 'Shift+Tab' if nguoc else 'Tab')
        e = ui.phan_tu_dang_focus(ctx.c)
        chuoi.append(e)
        if e is None:
            break
    thay = [x for x in chuoi if x]
    du_kien = {'so_buoc': len(chuoi), 'chuoi_tieu_diem': [
        '%s:%s' % (x.get('the'), (x.get('nhan') or '')[:24]) for x in thay][:10]}
    if len(thay) < 3:
        return 'F', ('Bấm %s 10 lần chỉ đưa tiêu điểm tới %d phần tử — tiêu điểm không đi qua '
                     'được các control của màn.' % ('Shift+Tab' if nguoc else 'Tab', len(thay))), du_kien
    trung = len({'%s|%s' % (x.get('the'), x.get('nhan')) for x in thay})
    if trung < 3:
        return 'F', ('Tiêu điểm quẩn tại %d phần tử khi bấm %s.'
                     % (trung, 'Shift+Tab' if nguoc else 'Tab')), du_kien
    return 'P', ('Bấm %s: tiêu điểm đi qua %d control theo thứ tự tài liệu (%s).'
                 % ('Shift+Tab' if nguoc else 'Tab', len(thay),
                    ' → '.join(du_kien['chuoi_tieu_diem'][:5]))), du_kien


@phep('zoom')
@nhan_dien(lambda cs: _bat_ky(_n(cs.b), 'khi thuc hien zoom in', 'khi thuc hien zoom out'))
def p_zoom(case, ctx):
    """Zoom in/out: đo TRÀN NGANG và chồng lấn — hai thứ máy đo được của cột D."""
    vao = 'zoom in' in _n(case.b)
    ti_le = 1.5 if vao else 0.67
    goc = ui.do_tran_ngang(ctx.c)
    if not ui.dat_zoom(ctx.c, ti_le):
        return None
    time.sleep(1.0)
    sau = ui.do_tran_ngang(ctx.c)
    ui.dat_zoom(ctx.c, 1.0)
    time.sleep(0.5)
    if not sau:
        return None
    du_kien = {'ti_le': ti_le, 'truoc': goc, 'sau': sau}
    bang_cuon = ui._js(ctx.c, """
      const t=document.querySelector('table'); if(!t) return 'null';
      let p=t.parentElement; for(let k=0;k<4&&p;k++,p=p.parentElement){
        const st=getComputedStyle(p);
        if(/auto|scroll/.test(st.overflowX)) return JSON.stringify({cuon:true});}
      return JSON.stringify({cuon:false});""") or {}
    du_kien['bang_cuon_ngang'] = bang_cuon.get('cuon')
    tran = [x for x in (sau.get('tran') or []) if not x.startswith('table')]
    if not tran:
        return 'P', ('Zoom %s (%.0f %%): không phần tử nào tràn khỏi khung nhìn%s.'
                     % ('in' if vao else 'out', ti_le * 100,
                        '; bảng có vùng cuộn ngang riêng' if bang_cuon.get('cuon') else '')), du_kien
    if vao and sau.get('cuon_ngang') and bang_cuon.get('cuon'):
        return 'P', ('Zoom in (%.0f %%): phần tràn nằm trong vùng cuộn ngang của bảng — đúng '
                     'yêu cầu "bảng cuộn ngang khi cần".' % (ti_le * 100)), du_kien
    return 'F', ('Zoom %s (%.0f %%): %d phần tử tràn khỏi khung nhìn (%s) và bảng %s vùng cuộn '
                 'ngang riêng.' % ('in' if vao else 'out', ti_le * 100, len(tran),
                                   ' · '.join(tran[:4]),
                                   'CÓ' if bang_cuon.get('cuon') else 'KHÔNG có')), du_kien


@phep('tooltip_icon')
@nhan_dien(lambda cs: (_n(_nhom(cs)) == 'icon'
                       and _bat_ky(_n(cs.b), 'chu thich hien khi re chuot',
                                   'chu thich an di ngay khi bo chuot',
                                   'noi dung va chinh ta cua chu thich')))
def p_tooltip(case, ctx):
    """Rê chuột vào icon thao tác -> chú thích hiện; bỏ chuột -> ẩn."""
    tt = ui.tooltip_cua(ctx.c, JS_ICON_DONG_DAU)
    if tt is None:
        return None
    hien = [tt['txt']] if tt.get('loai') == 'dom' and tt.get('txt') else []
    ui.thoi_re_chuot(ctx.c)
    time.sleep(1.0)
    con = ui._js(ctx.c, """
      const t=[...document.querySelectorAll('[role=tooltip],[data-radix-popper-content-wrapper],'
        +'[data-state=delayed-open],[class*=tooltip i]')].filter(HIEN).map(TXT).filter(x=>x);
      return JSON.stringify(t);""") or []
    tu_title = (tt.get('txt') or '').strip() if tt.get('loai') == 'native' else ''
    tu_title = tu_title or ((tt.get('thuoc_tinh') or {}).get('aria') or '').strip()
    du_kien = {'tooltip_khi_re': hien, 'tooltip_khi_bo': con, 'title_thuoc_tinh': tu_title,
               'loai_chu_thich': tt.get('loai'), 'thuoc_tinh_nut': tt.get('thuoc_tinh')}
    nb = _n(case.b)
    if 'an di ngay khi bo chuot' in nb:
        if hien and not con:
            return 'P', 'Bỏ chuột khỏi biểu tượng: chú thích ẩn đi.', du_kien
        if not hien and not tu_title:
            return None                   # không dựng được chú thích -> im
        if con:
            return 'F', ('Bỏ chuột rồi mà chú thích vẫn hiện: %s.' % ' · '.join(con[:2])), du_kien
        return None
    if hien:
        return 'P', ('Rê chuột vào biểu tượng: hiện chú thích "%s".' % hien[0][:60]), du_kien
    if tu_title:
        return 'P', ('Biểu tượng có chú thích qua thuộc tính title/aria-label: "%s" — trình '
                     'duyệt hiện chú thích gốc khi rê chuột.' % tu_title), du_kien
    return 'F', 'Rê chuột vào biểu tượng thao tác: KHÔNG có chú thích nào hiện ra.', du_kien


@phep('mau_icon_xoa')
@nhan_dien(lambda cs: _n(_nhom(cs)) == 'icon' and _co(_n(cs.b), 'mau icon xoa'))
def p_mau_icon_xoa(case, ctx):
    """Màu icon Xóa — đo màu tính toán thật của phần tử."""
    kq = ui._js(ctx.c, """
      const tr=document.querySelector('table tbody tr'); if(!tr) return 'null';
      const b=[...tr.querySelectorAll('button,[role=button],a')].find(x=>
        /xoa|xóa|delete/i.test((x.getAttribute('title')||'')+(x.getAttribute('aria-label')||'')
          +TXT(x)));
      if(!b) return 'null';
      const st=getComputedStyle(b); const sv=b.querySelector('svg');
      const st2=sv?getComputedStyle(sv):null;
      return JSON.stringify({mau:st.color, mau_svg:st2?st2.color:'', lop:(b.className||'')+''});""")
    if not kq:
        return None
    mau = (kq.get('mau_svg') or kq.get('mau') or '')
    m = re.match(r'rgba?\((\d+),\s*(\d+),\s*(\d+)', mau)
    du_kien = dict(kq)
    if not m:
        return None
    r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
    do = r >= 150 and r - max(g, b) >= 40
    du_kien['rgb'] = [r, g, b]
    if do:
        return 'P', ('Icon Xóa dùng màu đỏ (rgb %d,%d,%d).' % (r, g, b)), du_kien
    return 'F', ('Icon Xóa KHÔNG phải màu đỏ — màu tính toán là rgb(%d,%d,%d).'
                 % (r, g, b)), du_kien


@phep('con_tro_icon')
@nhan_dien(lambda cs: (_n(_nhom(cs)) == 'icon'
                       and _bat_ky(_n(cs.b), 'con tro chuot doi hinh',
                                   'doi mau va con tro khi re chuot')))
def p_con_tro(case, ctx):
    """Con trỏ chuột đổi sang dạng bàn tay khi rê vào biểu tượng thao tác."""
    kq = ui._js(ctx.c, """
      const tr=document.querySelector('table tbody tr'); if(!tr) return 'null';
      const ds=[...tr.querySelectorAll('button,[role=button],a')].filter(HIEN);
      if(!ds.length) return 'null';
      return JSON.stringify(ds.slice(0,4).map(b=>({ten:(b.getAttribute('title')||TXT(b)||'icon'),
        con_tro:getComputedStyle(b).cursor})));""")
    if not kq:
        return None
    xau = [x for x in kq if x.get('con_tro') not in ('pointer',)]
    du_kien = {'icon': kq}
    if not xau:
        return 'P', ('Rê chuột vào %d biểu tượng thao tác: con trỏ đều đổi sang dạng bàn tay '
                     '(cursor: pointer).' % len(kq)), du_kien
    return 'F', ('Biểu tượng %s không đổi con trỏ chuột (cursor: %s).'
                 % (' · '.join(x['ten'] for x in xau[:3]), xau[0]['con_tro'])), du_kien


# ──────────────────────────────────────────────────────────────────────────────
# F. TẢI LẠI DỮ LIỆU / NGOẠI LỆ MẠNG
# ──────────────────────────────────────────────────────────────────────────────
@phep('tai_lai_du_lieu')
@nhan_dien(lambda cs: (_bat_ky(_n(cs.b), 'tai lai du lieu khi khong ap dung',
                               'tai lai du lieu khi dang co bo loc')
                       and _pv(cs) in ('danh_sach', 'loc')))
def p_tai_lai(case, ctx):
    """Nút Làm mới dữ liệu: danh sách nạp lại + thông báo nổi đúng verbatim (+ giữ bộ lọc)."""
    nut = ctx.vb('tooltip_lam_moi') or 'Làm mới dữ liệu'
    toast = ctx.vb('toast_lam_moi')
    giu_loc = 'dang co bo loc' in _n(case.b)
    tu = None
    if giu_loc:
        m = ctx.ban_ghi(case) if ctx.cho_phep_ghi else None
        tu = (m or {}).get('ma') or 'a'
        ui.tim_kiem(ctx.c, tu, cho=ctx.hs_so('tim_kiem_debounce_ms'))
    if not ui.co_nut(ctx.c, nut, 'man'):
        return None
    ui.bam(ctx.c, nut, 'man', cho=0.3)
    tb = []
    t0 = time.time()
    while time.time() - t0 < 6:
        tb = ui.doc_thong_bao(ctx.c)
        if tb:
            break
        time.sleep(0.3)
    time.sleep(0.8)
    o_tim = ctx.o_tim_kiem()
    con_tu = (ui.doc_o(ctx.c, o_tim, 'man') or {}).get('gia_tri') if o_tim else None
    du_kien = {'nut': nut, 'thong_bao': tb[:3], 'toast_khai': toast,
               'tu_khoa_truoc': tu, 'tu_khoa_sau': con_tu}
    if giu_loc:
        ctx.ve_danh_sach()
    if toast and not any(_n(toast) in _n(x) for x in tb):
        return 'F', ('Bấm "%s": KHÔNG thấy thông báo nổi nguyên văn "%s" (đọc được: %s).'
                     % (nut, toast, ' · '.join(tb[:2]) or 'không có thông báo nào')), du_kien
    if giu_loc and tu and _n(con_tu or '') != _n(tu):
        return 'F', ('Bấm "%s" khi đang lọc: từ khoá trong ô tìm kiếm bị mất (trước %r, sau %r).'
                     % (nut, tu, con_tu)), du_kien
    return 'P', ('Bấm "%s": hiện thông báo nguyên văn "%s"%s.'
                 % (nut, toast or (tb[0] if tb else ''),
                    ' và giữ nguyên từ khoá đang lọc' if giu_loc else '')), du_kien


@phep('mat_ket_noi')
@nhan_dien(lambda cs: _co(_n(cs.b), 'khi mat ket noi mang'))
def p_mat_mang(case, ctx):
    """Ngắt mạng ở tầng trình duyệt rồi bấm Làm mới -> app phải báo lỗi kết nối, không trắng bảng."""
    nut = ctx.vb('tooltip_lam_moi') or 'Làm mới dữ liệu'
    if not ui.co_nut(ctx.c, nut, 'man'):
        return None
    truoc = len(ui.doc_bang(ctx.c))
    if not ui.mang_offline(ctx.c, True):
        return None
    try:
        ui.bam(ctx.c, nut, 'man', cho=0.4)
        van, t0 = '', time.time()
        while time.time() - t0 < 10:
            van = ui.doc_van_ban(ctx.c)
            if _n('không thể kết nối') in _n(van) or ui.doc_thong_bao(ctx.c):
                break
            time.sleep(0.4)
        tb = ui.doc_thong_bao(ctx.c) + ui.doc_loi(ctx.c, 'man')
        sau = len(ui.doc_bang(ctx.c))
    finally:
        ui.mang_offline(ctx.c, False)
        time.sleep(0.8)
    mong = _cau_loi_ket_noi(case.d)
    du_kien = {'so_dong_truoc': truoc, 'so_dong_sau': sau, 'thong_bao': tb[:3],
               'cau_mong_doi': mong}
    co_bao = bool(mong and (_n(mong) in _n(van) or any(_n(mong) in _n(x) for x in tb))) or \
        any(_bat_ky(_n(x), 'ket noi', 'mang', 'network') for x in tb)
    if not co_bao:
        return 'F', ('Ngắt mạng rồi bấm "%s": KHÔNG có thông báo lỗi kết nối nào (cột D đòi '
                     'nguyên văn "%s").' % (nut, (mong or '')[:80])), du_kien
    if sau < truoc:
        return 'F', ('Có báo lỗi kết nối nhưng dữ liệu đang hiển thị bị xoá trắng (%d dòng → '
                     '%d dòng), trái yêu cầu "dữ liệu cũ không bị xoá trắng".'
                     % (truoc, sau)), du_kien
    return 'P', ('Ngắt mạng rồi bấm "%s": hệ thống báo lỗi kết nối và giữ nguyên %d dòng dữ '
                 'liệu cũ.' % (nut, sau)), du_kien


def _cau_loi_ket_noi(d):
    m = re.search(r'"([^"]{20,300})"', d or '')
    return m.group(1) if m else None


# ──────────────────────────────────────────────────────────────────────────────
# G. BIỂU MẪU — giá trị mặc định · validate · ghi
# ──────────────────────────────────────────────────────────────────────────────
def _o_cua_nhom(case):
    """Tên ô mà nhóm con của case đang nói tới (`Textbox Code` -> `Code`)."""
    nhom = case.nhom.get('sub2') or ''
    if not nhom:
        return None
    return qalib.field_of(nhom)


@phep('mac_dinh_o_bieu_mau')
@nhan_dien(lambda cs: (_co(_n(cs.b), 'gia tri mac dinh')
                       and _n(_nhom(cs)).startswith(('textbox', 'text box'))
                       and _pv(cs) == 'them'))
def p_mac_dinh_o_them(case, ctx):
    """Ô nhập của biểu mẫu Thêm mới phải trống khi mở (cột D: *"Mặc định là trống"*)."""
    o = _o_cua_nhom(case)
    if not o:
        return None
    hop = ui.mo_hop(ctx.c, ctx.nut_them())
    if not hop:
        return None
    x = ui.doc_o(ctx.c, o, 'hop')
    ui.dong_hop(ctx.c)
    if not x:
        return None
    gt = (x.get('gia_tri') or '').strip()
    du_kien = {'o': o, 'gia_tri': gt, 'goi_y': x.get('goi_y')}
    mong_trong = _bat_ky(_n(case.d), 'mac dinh la trong', 'mac dinh trong', 'de trong')
    if not mong_trong:
        return None
    if not gt:
        return 'P', ('Mở biểu mẫu Thêm mới: ô "%s" mặc định trống.' % o), du_kien
    return 'F', ('Mở biểu mẫu Thêm mới: ô "%s" KHÔNG trống, đang có sẵn %r.' % (o, gt)), du_kien


@phep('mac_dinh_o_sua', can_ghi=True)
@nhan_dien(lambda cs: (_co(_n(cs.b), 'gia tri mac dinh')
                       and _n(_nhom(cs)).startswith(('textbox', 'text box'))
                       and _pv(cs) == 'sua'))
def p_mac_dinh_o_sua(case, ctx):
    """Biểu mẫu Chỉnh sửa phải nạp đúng giá trị ĐANG LƯU của bản ghi.

    Đo trên bản ghi QA nên giá trị đang lưu là thứ ta biết chắc — mở biểu mẫu của một bản ghi
    thật thì không có gì để so ngoài chính màn hình.
    """
    o = _o_cua_nhom(case)
    if not o:
        return None
    m = ctx.ban_ghi(case)
    if not ctx.hien_ban_ghi_qa(m['ma']):
        raise LoiThaoTac('không thấy bản ghi QA %s để mở biểu mẫu Chỉnh sửa' % m['ma'])
    r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_sua(ctx))
    if not (isinstance(r, dict) and r.get('ok')):
        return None
    x = ui.doc_o(ctx.c, o, 'hop')
    ui.dong_hop(ctx.c)
    ctx.ve_danh_sach()
    if not x:
        return None
    gt = (x.get('gia_tri') or '').strip()
    mong = m['ma'] if _n(o) == _n(ctx.o_ma() or '') else m['ten']
    du_kien = {'o': o, 'gia_tri': gt, 'dang_luu': mong, 'vo_hieu': x.get('vo_hieu')}
    if _n(gt) == _n(mong):
        return 'P', ('Mở Chỉnh sửa bản ghi %s: ô "%s" nạp đúng giá trị đang lưu (%r).'
                     % (m['ma'], o, gt)), du_kien
    return 'F', ('Mở Chỉnh sửa bản ghi %s: ô "%s" hiện %r, không phải giá trị đang lưu %r.'
                 % (m['ma'], o, gt, mong)), du_kien


def _icon_sua(ctx):
    for x in (ctx.vb('icon_ban_ghi') or []):
        if _bat_ky(_n(x), 'sua', 'chinh sua', 'edit'):
            return x
    return 'Chỉnh sửa'


def _icon_xoa(ctx):
    for x in (ctx.vb('icon_ban_ghi') or []):
        if _bat_ky(_n(x), 'xoa'):
            return x
    return 'Xóa'


@phep('o_bi_khoa_khi_sua', can_ghi=True)
@nhan_dien(lambda cs: (_co(_n(cs.b), 'giu nguyen gia tri cu') and _pv(cs) == 'sua'))
def p_o_khoa(case, ctx):
    """Case *"giữ nguyên giá trị cũ"* — ô bị khoá thì gõ không vào, ô không khoá thì Hủy phải hoàn nguyên."""
    o = _o_cua_nhom(case)
    if not o:
        return None
    m = ctx.ban_ghi(case)
    if not ctx.hien_ban_ghi_qa(m['ma']):
        raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
    r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_sua(ctx))
    if not (isinstance(r, dict) and r.get('ok')):
        return None
    x = ui.doc_o(ctx.c, o, 'hop') or {}
    khoa = bool(x.get('vo_hieu') or x.get('chi_doc'))
    cu = (x.get('gia_tri') or '').strip()
    sau_go = None
    if not khoa:
        sau_go = (ui.dien(ctx.c, o, cu + 'X', 'hop') or {}).get('gia_tri')
    ui.dong_hop(ctx.c)
    time.sleep(0.6)
    dong = ctx.hien_ban_ghi_qa(m['ma'])
    ctx.ve_danh_sach()
    du_kien = {'o': o, 'vo_hieu': x.get('vo_hieu'), 'chi_doc': x.get('chi_doc'),
               'gia_tri_cu': cu, 'sau_khi_go': sau_go, 'con_tren_danh_sach': bool(dong)}
    if khoa:
        return 'P', ('Ô "%s" bị khoá trong biểu mẫu Chỉnh sửa ⇒ giá trị cũ giữ nguyên, không '
                     'sửa được.' % o), du_kien
    if dong and any(_n(cu) == _n(v) for v in (dong.get('o') or {}).values()):
        return 'P', ('Sửa ô "%s" rồi bấm Hủy: bản ghi trên danh sách vẫn giữ giá trị cũ %r.'
                     % (o, cu)), du_kien
    return 'F', ('Sửa ô "%s" rồi bấm Hủy nhưng giá trị cũ %r không còn nguyên trên danh sách.'
                 % (o, cu)), du_kien


# ── validate: nhập rồi bấm nút chốt ──────────────────────────────────────────
_VAL = (
    ('la truong bat buoc', 'bat_buoc'),
    ('nhap vuot do dai cho phep', 'vuot_do_dai'),
    ('nhap trong do dai cho phep', 'trong_do_dai'),
    ('nhap ky tu dac biet', 'ky_tu_dac_biet'),
    ('cat khoang trang hai dau', 'cat_khoang_trang'),
    ('nhap tieng viet co dau', 'tieng_viet'),
    ('nhap so', 'nhap_so'),
    ('copy du lieu dan vao o', 'copy_dan'),
    ('du lieu da ton tai', 'trung'),
)


def _loai_validate(case):
    nb = _n(case.b)
    for k, v in _VAL:
        if k in nb:
            return v
    return None


@phep('validate_o_nhap', can_ghi=True)
@nhan_dien(lambda cs: (_loai_validate(cs) is not None
                       and _n(_nhom(cs)).startswith(('textbox', 'text box'))
                       and _pv(cs) in ('them', 'sua')))
def p_validate_o(case, ctx):
    """Bộ validate một ô nhập của biểu mẫu Thêm mới / Chỉnh sửa.

    Mỗi nhánh dựng đúng dữ liệu mà cột C mô tả, bấm nút chốt khi cột C bảo bấm, rồi so với
    thông báo nguyên văn ở `grounding.verbatim.loi_validate`. Nhánh nào không có nguyên văn
    tương ứng thì **không chấm** — thông báo lỗi là thứ phải khớp từng chữ, không suy đoán.
    """
    loai = _loai_validate(case)
    o = _o_cua_nhom(case)
    if not o or not loai:
        return None
    sua = _pv(case) == 'sua'
    la_o_ma = _n(o) == _n(ctx.o_ma() or '')
    m = ctx.ban_ghi(case) if sua or loai == 'trung' else None
    hop = _mo_bieu_mau(ctx, m, sua)
    if not hop:
        return None
    try:
        return _chay_validate(case, ctx, loai, o, sua, m)
    finally:
        if ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()


def _mo_bieu_mau(ctx, m, sua):
    if sua:
        if not m:
            return None
        if not ctx.hien_ban_ghi_qa(m['ma']):
            raise LoiThaoTac('không thấy bản ghi QA %s để mở Chỉnh sửa' % m['ma'])
        r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_sua(ctx))
        return r.get('hop') if isinstance(r, dict) and r.get('ok') else None
    return ui.mo_hop(ctx.c, ctx.nut_them())


def _nguong(ctx, o, la_ma):
    """(giới hạn validate, giới hạn DOM) của một ô — lấy từ `hang_so` của hồ sơ màn."""
    if la_ma:
        return ctx.hs_so('code_max_validate'), ctx.hs_so('code_max_dom')
    return ctx.hs_so('title_max_validate'), ctx.hs_so('title_max_dom')


def _cau_loi(ctx, khoa):
    return (ctx.vb('loi_validate', khoa) or None)


def _chay_validate(case, ctx, loai, o, sua, m):
    la_ma = _n(o) == _n(ctx.o_ma() or '')
    nut = ctx.nut_luu_sua() if sua else ctx.nut_luu_them()
    gioi_han, dom_max = _nguong(ctx, o, la_ma)
    ten_khac = ctx.o_ten() if la_ma else ctx.o_ma()

    def _dien_phan_con_lai(ma_moi=None, ten_moi=None):
        if sua:
            return
        ctx.dien_form(ma=ma_moi, ten=ten_moi)

    # ① BẮT BUỘC — để trống rồi bấm chốt
    if loai == 'bat_buoc':
        cau = _cau_loi(ctx, 'code_rong' if la_ma else 'ten_rong')
        if not cau:
            return None
        ui.dien(ctx.c, o, '', 'hop')
        if not sua:
            ma2, ten2 = ctx.so.cap_ma()
            _dien_phan_con_lai(ma_moi=None if la_ma else ma2, ten_moi=None if not la_ma else ten2)
        kq = _bam_chot_khong_tao(ctx, case, nut, 'validate ô %s để trống' % o, sua, m)
        loi = ui.doc_loi(ctx.c, 'hop')
        du_kien = {'o': o, 'loi_doc_duoc': loi[:4], 'cau_verbatim': cau,
                   'hop_con_mo': ui.co_hop_thoai(ctx.c), 'mang': kq}
        if any(_n(cau) in _n(x) for x in loi):
            return 'P', ('Để trống ô "%s" rồi bấm "%s": hiện đúng thông báo nguyên văn "%s".'
                         % (o, nut, cau)), du_kien
        if not ui.hop_cua_ta_con_mo(ctx.c):
            return 'F', ('Để trống ô bắt buộc "%s" mà hệ thống VẪN chấp nhận (hộp thoại đóng, '
                         'không có thông báo lỗi).' % o), du_kien
        return 'F', ('Để trống ô "%s" rồi bấm "%s": không thấy thông báo nguyên văn "%s" '
                     '(đọc được: %s).' % (o, nut, cau, ' | '.join(loi[:2]) or 'không có')), du_kien

    # ② VƯỢT ĐỘ DÀI — dán chuỗi dài hơn ngưỡng
    if loai == 'vuot_do_dai':
        if not gioi_han:
            return None
        cau = _cau_loi(ctx, 'code_qua_dai' if la_ma else 'ten_qua_dai')
        chuoi = ('a' * (int(gioi_han) + 1)) if la_ma else ('A' * (int(gioi_han) + 1))
        x = ui.dan(ctx.c, o, chuoi, 'hop') or ui.dien(ctx.c, o, chuoi, 'hop')
        do_dai = (x or {}).get('do_dai')
        if not sua:
            ma2, ten2 = ctx.so.cap_ma()
            _dien_phan_con_lai(ma_moi=None if la_ma else ma2, ten_moi=None if not la_ma else ten2)
        du_kien = {'o': o, 'gioi_han': gioi_han, 'do_dai_o_nhan': do_dai,
                   'cau_verbatim': cau}
        if do_dai is not None and do_dai <= int(gioi_han):
            return 'P', ('Dán chuỗi %d ký tự vào ô "%s": ô chỉ nhận %d ký tự — hệ thống không '
                         'cho nhập quá giới hạn %s.'
                         % (len(chuoi), o, do_dai, gioi_han)), du_kien
        kq = _bam_chot_khong_tao(ctx, case, nut, 'validate ô %s vượt độ dài' % o, sua, m)
        loi = ui.doc_loi(ctx.c, 'hop')
        du_kien.update({'loi_doc_duoc': loi[:4], 'hop_con_mo': ui.co_hop_thoai(ctx.c), 'mang': kq})
        if cau and any(_n(cau) in _n(x) for x in loi):
            return 'P', ('Nhập %d ký tự (> %s) vào ô "%s" rồi bấm "%s": hiện đúng thông báo '
                         'nguyên văn "%s".' % (do_dai, gioi_han, o, nut, cau)), du_kien
        if not ui.hop_cua_ta_con_mo(ctx.c):
            return 'F', ('Nhập %d ký tự (> giới hạn %s) vào ô "%s" mà hệ thống VẪN lưu.'
                         % (do_dai, gioi_han, o)), du_kien
        return 'F', ('Nhập quá giới hạn %s ký tự vào ô "%s": không thấy thông báo nguyên văn '
                     '"%s" (đọc được: %s).'
                     % (gioi_han, o, cau, ' | '.join(loi[:2]) or 'không có')), du_kien

    # ③ KÝ TỰ ĐẶC BIỆT / SCRIPT — với ô có regex thì phải báo lỗi định dạng
    if loai == 'ky_tu_dac_biet':
        # ⚠️ VÁ 18/09. Bản trước chỉ kết luận khi ô là ô MÃ và hồ sơ màn có câu nguyên văn;
        # mọi ô khác rơi thẳng xuống `return None` — kể cả khi **chính cột D của case** đã nêu
        # câu lỗi nguyên văn và cột C đã nêu chuỗi phải nhập (r269 · r423, ô `Tên schema`:
        # cột D ghi rõ *"schema_name chỉ được chứa chữ thường, số, dấu gạch dưới và gạch ngang
        # (snake_case)"*). Kỳ vọng nằm sẵn trong case thì phải dùng nó, không đòi hồ sơ màn
        # khai lại.
        cau = _cau_loi(ctx, 'code_sai_dinh_dang') if la_ma else None
        cau_cot_d = None
        for x in re.findall(r'"([^"]{8,200})"', case.d or ''):
            if not _bat_ky(_n(x), 'kho <b>', 'vi du'):
                cau_cot_d = x.strip()
                break
        # Chuỗi nhập: ưu tiên NGUYÊN VĂN cột C (*'ví dụ "Kho <b>1</b>"'*), không tự chế.
        mau_c = [x for x in re.findall(r'"([^"]{2,60})"', case.c or '')
                 if re.search(r'[<>@#$%&]', x)]
        chuoi = mau_c[0] if mau_c else ('<b>a</b>@#$' if la_ma else '<b>QA</b> @#$')
        if not la_ma and cau_cot_d:
            ui.dien(ctx.c, o, chuoi, 'hop')
            if not sua:
                ma2, ten2 = ctx.so.cap_ma()
                ctx.dien_form(ma=ma2, ten=ten2)
                ui.dien(ctx.c, o, chuoi, 'hop')     # `dien_form` có thể ghi đè ô đang thử
            kq = _bam_chot_khong_tao(ctx, case, nut, 'validate ô %s ký tự đặc biệt' % o, sua, m)
            bao = ui.doc_bao_theo_loai(ctx.c) or {}
            loi = ui.doc_loi(ctx.c, 'hop')
            du_kien = {'o': o, 'nhap': chuoi, 'nguon_chuoi': 'cột C' if mau_c else 'mặc định',
                       'cau_verbatim_cot_D': cau_cot_d, 'loi_inline': loi[:4],
                       'toast': (bao.get('TOAST') or [])[:3],
                       'aria_live': (bao.get('TRO_NANG') or [])[:3],
                       'mang': kq, 'muc_bang_chung': 'UI'}
            moi = loi + list(bao.get('TOAST') or []) + list(bao.get('TRO_NANG') or [])
            if any(_n(cau_cot_d) in _n(x) for x in moi):
                return 'P', ('Nhập %r vào ô "%s" rồi bấm %r: hiện đúng thông báo nguyên văn '
                             '"%s".' % (chuoi, o, nut, cau_cot_d)), du_kien
            if not ui.hop_cua_ta_con_mo(ctx.c):
                return 'F', ('Nhập %r vào ô "%s" mà hệ thống VẪN lưu — cột D đòi báo lỗi "%s".'
                             % (chuoi, o, cau_cot_d)), du_kien
            return 'F', ('Nhập %r vào ô "%s": KHÔNG thấy thông báo nguyên văn "%s" (đọc được: '
                         '%s).' % (chuoi, o, cau_cot_d,
                                   ' | '.join(moi[:3]) or 'không có thông báo nào')), du_kien
        ui.dien(ctx.c, o, chuoi, 'hop')
        if not sua:
            ma2, ten2 = ctx.so.cap_ma()
            _dien_phan_con_lai(ma_moi=None if la_ma else ma2, ten_moi=None if not la_ma else ten2)
        if la_ma and cau:
            kq = _bam_chot_khong_tao(ctx, case, nut, 'validate ô %s ký tự đặc biệt' % o, sua, m)
            loi = ui.doc_loi(ctx.c, 'hop')
            du_kien = {'o': o, 'nhap': chuoi, 'loi_doc_duoc': loi[:4], 'cau_verbatim': cau,
                       'mang': kq}
            if any(_n(cau) in _n(x) for x in loi):
                return 'P', ('Nhập ký tự đặc biệt/thẻ HTML vào ô "%s": hiện đúng thông báo '
                             'nguyên văn "%s".' % (o, cau)), du_kien
            if not ui.hop_cua_ta_con_mo(ctx.c):
                return 'F', ('Nhập %r vào ô "%s" mà hệ thống VẪN lưu — ô này có ràng buộc định '
                             'dạng %s.' % (chuoi, o, ctx.hs_so('code_regex'))), du_kien
            return 'F', ('Nhập ký tự đặc biệt vào ô "%s": không thấy thông báo nguyên văn "%s" '
                         '(đọc được: %s).' % (o, cau, ' | '.join(loi[:2]) or 'không có')), du_kien
        return None            # ô không có ràng buộc định dạng -> xem nhánh XSS

    # ④ CẮT KHOẢNG TRẮNG HAI ĐẦU
    if loai == 'cat_khoang_trang':
        loi_ket = _luu_ban_ghi_qa(ctx, case, o, sua, m, nut,
                                  bien_doi=lambda g: '  %s  ' % g)
        if loi_ket is None:
            return None
        ok, ma, gia_tri_luu, du_kien = loi_ket
        if not ok:
            return 'F', ('Nhập giá trị có khoảng trắng hai đầu vào ô "%s" rồi bấm "%s": không '
                         'lưu được (%s).' % (o, nut, du_kien.get('loi'))), du_kien
        du_kien['gia_tri_tren_danh_sach'] = gia_tri_luu
        if gia_tri_luu is not None and gia_tri_luu == gia_tri_luu.strip():
            return 'P', ('Nhập "  %s  " vào ô "%s": bản ghi lưu lại đã cắt khoảng trắng hai đầu '
                         '(%r).' % (ma, o, gia_tri_luu)), du_kien
        return 'F', ('Nhập giá trị có khoảng trắng hai đầu vào ô "%s": giá trị lưu lại vẫn còn '
                     'khoảng trắng (%r).' % (o, gia_tri_luu)), du_kien

    # ⑤ TIẾNG VIỆT CÓ DẤU / NHẬP SỐ / COPY-DÁN — nhập rồi xem ô có giữ đúng chữ không
    if loai in ('tieng_viet', 'nhap_so', 'copy_dan'):
        if loai == 'tieng_viet':
            chuoi = VIET_CO_DAU if not la_ma else 'nguon_du_lieu'
        elif loai == 'nhap_so':
            chuoi = '123456'
        else:
            chuoi = 'ZZQA copy dán'
            if la_ma:
                chuoi = 'zzqa_copy_dan'
        x = (ui.dan(ctx.c, o, chuoi, 'hop') if loai == 'copy_dan'
             else ui.dien(ctx.c, o, chuoi, 'hop'))
        if not x:
            return None
        gt = (x.get('gia_tri') or '')
        du_kien = {'o': o, 'nhap': chuoi, 'o_giu': gt, 'chan_paste': x.get('chan_paste')}
        if loai == 'tieng_viet' and la_ma:
            # Ô mã chỉ nhận `[a-z0-9_]` -> chữ có dấu phải bị chặn/được báo lỗi. Case hỏi về
            # "tiếng Việt có dấu" nhưng ô này không nhận dấu: đó là kết luận chứ không phải lỗi.
            ui.dien(ctx.c, o, VIET_CO_DAU, 'hop')
            y = ui.doc_o(ctx.c, o, 'hop') or {}
            du_kien['o_giu'] = y.get('gia_tri')
            cau = _cau_loi(ctx, 'code_sai_dinh_dang')
            if not sua:
                ma2, ten2 = ctx.so.cap_ma()
                ctx.dien_form(ten=ten2)
            _bam_chot_khong_tao(ctx, case, nut, 'ô mã nhập tiếng Việt có dấu', sua, m)
            loi = ui.doc_loi(ctx.c, 'hop')
            du_kien['loi_doc_duoc'] = loi[:4]
            if cau and any(_n(cau) in _n(z) for z in loi):
                return 'P', ('Ô "%s" chỉ nhận %s: nhập tiếng Việt có dấu thì báo đúng nguyên '
                             'văn "%s".' % (o, ctx.hs_so('code_regex'), cau)), du_kien
            if not ui.hop_cua_ta_con_mo(ctx.c):
                return 'F', ('Ô "%s" nhận cả tiếng Việt có dấu và LƯU được, trái ràng buộc %s.'
                             % (o, ctx.hs_so('code_regex'))), du_kien
            return 'F', ('Nhập tiếng Việt có dấu vào ô "%s": không thấy thông báo nguyên văn '
                         '"%s".' % (o, cau)), du_kien
        if x.get('chan_paste'):
            return 'F', ('Ô "%s" CHẶN thao tác dán (paste) — cột D yêu cầu dán được bình thường.'
                         % o), du_kien
        if _n(gt) == _n(chuoi):
            return 'P', ('%s %r vào ô "%s": ô hiển thị đúng nguyên chuỗi, không lỗi phông.'
                         % ('Dán' if loai == 'copy_dan' else 'Nhập', chuoi, o)), du_kien
        return 'F', ('%s %r vào ô "%s" nhưng ô đang giữ %r.'
                     % ('Dán' if loai == 'copy_dan' else 'Nhập', chuoi, o, gt)), du_kien

    # ⑥ TRONG ĐỘ DÀI CHO PHÉP -> phải LƯU THÀNH CÔNG
    if loai == 'trong_do_dai':
        r = _luu_ban_ghi_qa(ctx, case, o, sua, m, nut, dai_toi_da=True)
        if r is None:
            return None
        ok, ma, gt_luu, du_kien = r
        if ok:
            return 'P', ('Nhập %s ký tự (đúng giới hạn) vào ô "%s" rồi bấm "%s": lưu thành công, '
                         'bản ghi hiện trên danh sách.'
                         % (du_kien.get('do_dai'), o, nut)), du_kien
        return 'F', ('Nhập đúng giới hạn %s ký tự vào ô "%s" mà KHÔNG lưu được: %s'
                     % (du_kien.get('gioi_han'), o, du_kien.get('loi'))), du_kien

    # ⑦ DỮ LIỆU ĐÃ TỒN TẠI
    if loai == 'trung':
        if not m:
            return None
        if sua and la_ma:
            return None                  # ô mã bị khoá khi sửa -> không dựng được ca trùng
        ui.dien(ctx.c, ctx.o_ma(), m['ma'], 'hop')
        ma2, ten2 = ctx.so.cap_ma()
        ui.dien(ctx.c, ctx.o_ten(), ten2, 'hop')
        truoc = _tong_ban_ghi(ctx)
        kq = _bam_chot_khong_tao(ctx, case, nut, 'thử tạo trùng mã %s' % m['ma'], sua, m)
        loi = ui.doc_loi(ctx.c, 'hop')
        con_mo = ui.co_hop_thoai(ctx.c)
        du_kien = {'ma_trung': m['ma'], 'loi_doc_duoc': loi[:4], 'hop_con_mo': con_mo,
                   'tong_truoc': truoc, 'mang': kq}
        if con_mo:
            ui.dong_hop(ctx.c)
        time.sleep(0.8)
        sau = _tong_ban_ghi(ctx)
        du_kien['tong_sau'] = sau
        if truoc is not None and sau is not None and sau != truoc:
            return 'F', ('Nhập mã trùng %r rồi bấm "%s": tổng số bản ghi ĐỔI (%s → %s) — hệ '
                         'thống đã tạo thêm bản ghi trùng mã.'
                         % (m['ma'], nut, truoc, sau)), du_kien
        if loi and con_mo:
            return 'P', ('Nhập mã trùng %r: hệ thống báo lỗi ("%s"), hộp thoại không đóng, tổng '
                         'số bản ghi không đổi (%s).'
                         % (m['ma'], loi[0][:90], sau)), du_kien
        if con_mo:
            return 'F', ('Nhập mã trùng %r: hộp thoại không đóng nhưng KHÔNG có dòng báo lỗi nào '
                         'để người dùng biết vì sao.' % m['ma']), du_kien
        return 'F', ('Nhập mã trùng %r: hộp thoại ĐÓNG như một lần lưu thành công (tổng số bản '
                     'ghi %s → %s) — không có thông báo lỗi.' % (m['ma'], truoc, sau)), du_kien
    return None


def _tong_ban_ghi(ctx):
    pt = ui.doc_phan_trang(ctx.c) or {}
    s = re.sub(r'[^\d]', '', str(pt.get('tong') or ''))
    return int(s) if s else None


def _bam_chot_khong_tao(ctx, case, nut, mo_ta, sua=False, m=None):
    """Bấm nút chốt trong ca KỲ VỌNG KHÔNG ghi được (validate chặn).

    Vẫn phải mở cửa sổ ghi: kỳ vọng là "không ghi", nhưng nếu app vẫn gửi request thì đó chính
    là phát hiện của case — và request ấy phải nằm trong phạm vi QA chứ không được lọt ra
    ngoài hàng rào.

    ⚠️ Hai HÀNH ĐỘNG khác nhau, không gộp được (lỗi thật, lượt chạy live 15/09): ở biểu mẫu
    **Thêm mới** nút chốt sinh `POST`, ở biểu mẫu **Chỉnh sửa** nó sinh `PUT`. Bản đầu luôn mở
    cửa sổ `tao` nên mọi case validate của khối CHỈNH SỬA làm cả lượt chạy dừng an toàn ở
    case thứ 25 của lô — hàng rào đúng, lời khai sai.
    """
    if sua:
        if not m:
            raise LoiThaoTac('ca validate trên biểu mẫu Chỉnh sửa mà không có bản ghi QA')
        with ctx.ghi(case, 'sua', m['ma'], mo_ta=mo_ta) as cs:
            ui.bam_ghi(ctx.c, nut, cs.giay_phep, cho=2.0)
        return {'so_request_ghi': len(cs.cs.da_dung)}
    ma, ten = ctx.so.cap_ma()
    ctx.so.khai_tao(ma, ten, case.key if case else 'validate', 'thử validate — kỳ vọng KHÔNG tạo')
    try:
        with ctx.ghi(case, 'tao', ma, mo_ta=mo_ta) as cs:
            ui.bam_ghi(ctx.c, nut, cs.giay_phep, cho=2.0)
        return {'so_request_ghi': len(cs.cs.da_dung)}
    finally:
        # Không tạo được gì thì bản ghi này không tồn tại -> đánh dấu ngay để bước dọn không
        # đi tìm một thứ chưa bao giờ có.
        dong = ui.doc_dong(ctx.c, ma) if not ui.hop_cua_ta_con_mo(ctx.c) else None
        if dong:
            ctx.so.xac_nhan_tao(ma, co_tren_app=True)
        else:
            ctx.so.danh_dau_khong_thay(ma, 'ca validate: bản ghi không được tạo (đúng kỳ vọng)')


def _luu_ban_ghi_qa(ctx, case, o, sua, m, nut, bien_doi=None, dai_toi_da=False):
    """Lưu một bản ghi QA với giá trị dựng theo ca. -> (ok, mã, giá trị trên danh sách, dữ kiện)."""
    la_ma = _n(o) == _n(ctx.o_ma() or '')
    gioi_han, _ = _nguong(ctx, o, la_ma)
    if sua:
        if not m:
            return None
        ma = m['ma']
        gt = m['ten']
        if dai_toi_da and gioi_han:
            gt = (m['ten'] + ' ' + 'X' * int(gioi_han))[:int(gioi_han)]
        if bien_doi:
            gt = bien_doi(gt)
        ui.dien(ctx.c, ctx.o_ten(), gt, 'hop')
        with ctx.ghi(case, 'sua', ma, mo_ta='ca %s trên ô %s' % (case.b[:40], o)) as cs:
            ui.bam_ghi(ctx.c, nut, cs.giay_phep, cho=2.0)
        du_kien = {'o': o, 'gia_tri_gui': gt, 'do_dai': len(gt), 'gioi_han': gioi_han,
                   'so_request_ghi': len(cs.cs.da_dung)}
    else:
        ma, ten = ctx.so.cap_ma()
        if la_ma and dai_toi_da and gioi_han:
            ma = (ma + '_' + 'a' * int(gioi_han))[:int(gioi_han)]
        if not la_ma and dai_toi_da and gioi_han:
            ten = (ten + ' ' + 'X' * int(gioi_han))[:int(gioi_han)]
        gt_ma, gt_ten = ma, ten
        if bien_doi:
            if la_ma:
                gt_ma = bien_doi(ma)
            else:
                gt_ten = bien_doi(ten)
        ctx.so.khai_tao(ma, ten, case.key if case else '-', 'bản ghi QA của ca %s' % o)
        ui.dien(ctx.c, ctx.o_ma(), gt_ma, 'hop')
        ui.dien(ctx.c, ctx.o_ten(), gt_ten, 'hop')
        with ctx.ghi(case, 'tao', ma, mo_ta='ca %s trên ô %s' % (case.b[:40], o)) as cs:
            ui.bam_ghi(ctx.c, nut, cs.giay_phep, cho=2.0)
        du_kien = {'o': o, 'ma': ma, 'gia_tri_gui': gt_ma if la_ma else gt_ten,
                   'do_dai': len(gt_ma if la_ma else gt_ten), 'gioi_han': gioi_han,
                   'so_request_ghi': len(cs.cs.da_dung)}
    con_mo = ui.co_hop_thoai(ctx.c)
    loi = ui.doc_loi(ctx.c, 'hop') if con_mo else []
    if con_mo:
        du_kien['loi'] = ' | '.join(loi[:2]) or 'hộp thoại không đóng, không có thông báo'
        ui.dong_hop(ctx.c)
        if not sua:
            ctx.so.danh_dau_khong_thay(ma, 'lưu không thành công')
        return False, ma, None, du_kien
    dong = ctx.hien_ban_ghi_qa(ma)
    if not sua:
        ctx.so.xac_nhan_tao(ma, co_tren_app=bool(dong))
    else:
        ctx.so.ghi_hanh_dong(ma, 'sua', case.key if case else '', 'OK' if dong else 'KHÔNG THẤY')
    gt_luu = None
    if dong:
        cot = _n(o)
        for k, v in (dong.get('o') or {}).items():
            if _n(k) == cot or cot in _n(k) or _n(k) in cot:
                gt_luu = v
                break
        if gt_luu is None:
            gt_luu = (dong.get('o') or {}).get('Code') or ma
    return bool(dong), ma, gt_luu, du_kien


# ── XSS / SQL Injection ──────────────────────────────────────────────────────
@phep('xss_sql', can_ghi=True)
@nhan_dien(lambda cs: (_bat_ky(_n(cs.b), 'xss (kiem tra loi khi nhap', 'sql injection (kiem tra',
                               'chong xss o cac truong nhap', 'xss phan chieu qua o tim kiem',
                               'sql injection qua o tim kiem')
                       and _pv(cs) in ('them', 'sua', 'danh_sach', 'loc')))
def p_xss(case, ctx):
    """XSS / SQL Injection: nhập payload rồi chốt, xem script có CHẠY không và chuỗi lưu ra sao.

    Phép đo thật nằm ở chỗ **script có được thực thi hay không** — cài bẫy `alert`/`onerror`
    trước khi nhập rồi đọc lại. Không đoán theo việc chuỗi có bị escape trong HTML hay không.
    """
    nb = _n(case.b)
    o = _o_cua_nhom(case)
    pv = _pv(case)
    if pv in ('danh_sach', 'loc') or not o:
        # Case ở khối tìm kiếm: gõ payload vào ô tìm kiếm — không ghi gì.
        return _xss_o_tim(case, ctx)
    sql = 'sql injection' in nb
    payload = SQL_MAU if sql else next(
        (v for k, v in XSS_MAU.items() if k in nb), XSS_MAU['script html'])
    sua = pv == 'sua'
    m = ctx.ban_ghi(case) if sua else None
    hop = _mo_bieu_mau(ctx, m, sua)
    if not hop:
        return None
    try:
        _bay_xss(ctx)
        la_ma = _n(o) == _n(ctx.o_ma() or '')
        ma, ten = ctx.so.cap_ma()
        if sua:
            ui.dien(ctx.c, o, payload if not la_ma else ten, 'hop')
            ma_dung = m['ma']
        else:
            ui.dien(ctx.c, ctx.o_ma(), payload if la_ma else ma, 'hop')
            ui.dien(ctx.c, ctx.o_ten(), payload if not la_ma else ten, 'hop')
            ctx.so.khai_tao(ma, ten, case.key, 'ca XSS/SQLi trên ô %s' % o)
            ma_dung = ma
        nut = ctx.nut_luu_sua() if sua else ctx.nut_luu_them()
        with ctx.ghi(case, 'sua' if sua else 'tao', ma_dung,
                     mo_ta='ca %s trên ô %s' % (case.b[:40], o)) as cs:
            ui.bam_ghi(ctx.c, nut, cs.giay_phep, cho=2.2)
        con_mo = ui.co_hop_thoai(ctx.c)
        loi = ui.doc_loi(ctx.c, 'hop') if con_mo else []
        if con_mo:
            ui.dong_hop(ctx.c)
        if not sua:
            dong = ctx.hien_ban_ghi_qa(ma)
            ctx.so.xac_nhan_tao(ma, co_tren_app=bool(dong))
        else:
            dong = ctx.hien_ban_ghi_qa(m['ma'])
        no = _doc_bay_xss(ctx)
        du_kien = {'o': o, 'payload': payload, 'script_chay': no, 'hop_con_mo': con_mo,
                   'loi': loi[:3], 'so_request_ghi': len(cs.cs.da_dung),
                   'tren_danh_sach': (dong or {}).get('txt', '')[:160]}
        if no:
            return 'F', ('Nhập %r vào ô "%s": SCRIPT ĐƯỢC THỰC THI trên màn (bẫy %s kích hoạt) '
                         '— lỗ hổng XSS.' % (payload, o, no)), du_kien
        if con_mo and loi:
            return 'P', ('Nhập %r vào ô "%s": hệ thống chặn bằng thông báo "%s", không lưu, '
                         'không thực thi script.' % (payload, o, loi[0][:90])), du_kien
        if dong:
            hien = (dong.get('o') or {})
            nguyen = any(payload in (v or '') for v in hien.values())
            du_kien['hien_nguyen_van'] = nguyen
            return 'P', ('Nhập %r vào ô "%s": chuỗi được lưu và hiển thị dưới dạng VĂN BẢN '
                         '(không thực thi). %s'
                         % (payload, o,
                            'Danh sách hiện đúng nguyên văn chuỗi đã nhập.' if nguyen
                            else 'Danh sách hiện chuỗi đã được xử lý.')), du_kien
        return 'F', ('Nhập %r vào ô "%s" rồi bấm "%s": không lưu được mà cũng KHÔNG có thông báo '
                     'lỗi nào.' % (payload, o, nut)), du_kien
    finally:
        if ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()


def _xss_o_tim(case, ctx):
    """XSS gõ vào ô tìm kiếm — không ghi dữ liệu, chỉ xem script có chạy không."""
    nb = _n(case.b)
    payload = (SQL_MAU if 'sql injection' in nb
               else next((v for k, v in XSS_MAU.items() if k in nb), XSS_MAU['script html']))
    _bay_xss(ctx)
    kq = ui.tim_kiem(ctx.c, payload, cho=ctx.hs_so('tim_kiem_debounce_ms'))
    if not kq:
        return None
    no = _doc_bay_xss(ctx)
    van = kq.get('van_ban') or ''
    ctx.ve_danh_sach()
    du_kien = {'payload': payload, 'script_chay': no, 'so_dong': kq.get('so_dong')}
    if no:
        return 'F', ('Gõ %r vào ô tìm kiếm: SCRIPT ĐƯỢC THỰC THI (bẫy %s kích hoạt) — lỗ hổng '
                     'XSS.' % (payload, no)), du_kien
    return 'P', ('Gõ %r vào ô tìm kiếm: không script nào chạy, màn chỉ coi chuỗi là từ khoá '
                 '(%s dòng kết quả).' % (payload, kq.get('so_dong'))), du_kien


def _bay_xss(ctx):
    """Cài bẫy: `alert`/`confirm`/`print` bị thay bằng hàm ghi dấu, cộng theo dõi lỗi script."""
    ui._js(ctx.c, """
      window.__qa_xss=[];
      for(const k of ['alert','confirm','prompt','print']){
        try{ window[k]=function(){window.__qa_xss.push(k); return true;}; }catch(e){}}
      return '1';""")


def _doc_bay_xss(ctx):
    v = ui._js(ctx.c, "return JSON.stringify(window.__qa_xss||[]);") or []
    return v[0] if v else None


# ── LƯU / CẬP NHẬT THÀNH CÔNG ────────────────────────────────────────────────
@phep('luu_thanh_cong', can_ghi=True)
@nhan_dien(lambda cs: (_bat_ky(_n(cs.b), 'luu thanh cong khi nhap day du',
                               'luu thanh cong khi chi nhap cac truong bat buoc',
                               'cap nhat thanh cong khi sua hop le',
                               'cap nhat thanh cong khi chi sua cac truong bat buoc')
                       and _pv(cs) in ('them', 'sua')))
def p_luu_thanh_cong(case, ctx):
    """Tạo / cập nhật bản ghi QA trọn vẹn rồi nghiệm thu trên danh sách + thông báo verbatim."""
    sua = _pv(case) == 'sua'
    toi_da = 'toi da do dai' in _n(case.b) or 'day du' in _n(case.b)
    if sua:
        m = ctx.ban_ghi(case)
        if not ctx.hien_ban_ghi_qa(m['ma']):
            raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
        r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_sua(ctx))
        if not (isinstance(r, dict) and r.get('ok')):
            return None
        ten_moi = (m['ten'] + ' SUA')[:int(ctx.hs_so('title_max_validate', 100) or 100)]
        ui.dien(ctx.c, ctx.o_ten(), ten_moi, 'hop')
        # Ô bắt buộc ngoài Mã/Tên phải điền NỐT, nếu không thì cú Lưu bị chính lớp validate của
        # biểu mẫu chặn và phép đo kết luận "dữ liệu hợp lệ mà KHÔNG lưu được" — F OAN cho sản
        # phẩm. Đo 16/09 trên `Vị trí lưu trữ`: 4 case dính, thông báo đọc được chính là
        # *"Vui lòng chọn loại database"*. Ở chế độ Sửa, ô bị khoá (Code) tự bị bỏ qua.
        ctx.dien_o_bat_buoc(form='form_sua', bo_qua={_nhan_o(ctx.o_ma()), _nhan_o(ctx.o_ten())},
                            ma=m['ma'], ten=ten_moi)
        nut = ctx.nut_luu_sua()
        with ctx.ghi(case, 'sua', m['ma'], mo_ta='cập nhật bản ghi QA') as cs:
            ui.bam_ghi(ctx.c, nut, cs.giay_phep, cho=2.2)
        toast = ctx.vb('form_sua', 'toast_thanh_cong')
    else:
        hop = ui.mo_hop(ctx.c, ctx.nut_them())
        if not hop:
            return None
        ma, ten = ctx.so.cap_ma()
        if toi_da:
            gh = int(ctx.hs_so('code_max_validate', 32) or 32)
            ma = (ma + '_' + 'a' * gh)[:gh]
            ten = (ten + ' ' + 'X' * 200)[:int(ctx.hs_so('title_max_validate', 100) or 100)]
        ctx.so.khai_tao(ma, ten, case.key, 'case lưu thành công')
        ui.dien(ctx.c, ctx.o_ma(), ma, 'hop')
        ui.dien(ctx.c, ctx.o_ten(), ten, 'hop')
        ctx.dien_o_bat_buoc(bo_qua={_nhan_o(ctx.o_ma()), _nhan_o(ctx.o_ten())}, ma=ma, ten=ten)
        nut = ctx.nut_luu_them()
        with ctx.ghi(case, 'tao', ma, mo_ta='tạo bản ghi QA') as cs:
            ui.bam_ghi(ctx.c, nut, cs.giay_phep, cho=2.2)
        toast = ctx.vb('form_them', 'toast_thanh_cong')
        m = {'ma': ma, 'ten': ten}
    tb = ui.doc_thong_bao(ctx.c)
    con_mo = ui.co_hop_thoai(ctx.c)
    loi = ui.doc_loi(ctx.c, 'hop') if con_mo else []
    if con_mo:
        ui.dong_hop(ctx.c)
    dong = ctx.hien_ban_ghi_qa(m['ma'])
    if not sua:
        ctx.so.xac_nhan_tao(m['ma'], co_tren_app=bool(dong))
    else:
        ctx.so.ghi_hanh_dong(m['ma'], 'sua', case.key, 'OK' if dong else 'KHÔNG THẤY')
    ctx.ve_danh_sach()
    du_kien = {'ma': m['ma'], 'ten': m['ten'], 'thong_bao': tb[:3], 'toast_khai': toast,
               'hop_con_mo': con_mo, 'loi': loi[:2], 'tren_danh_sach': bool(dong),
               'so_request_ghi': len(cs.cs.da_dung)}
    if con_mo or not dong:
        return 'F', ('Bấm "%s" với dữ liệu hợp lệ mà KHÔNG %s được: %s'
                     % (nut, 'cập nhật' if sua else 'lưu',
                        ' | '.join(loi[:2]) or 'hộp thoại không đóng / bản ghi không lên danh '
                                               'sách')), du_kien
    if toast and not any(_n(toast) in _n(x) for x in tb):
        return 'F', ('%s thành công (bản ghi %s có trên danh sách) nhưng KHÔNG hiện thông báo '
                     'nguyên văn "%s" (đọc được: %s).'
                     % ('Cập nhật' if sua else 'Lưu', m['ma'], toast,
                        ' · '.join(tb[:2]) or 'không có')), du_kien
    return 'P', ('%s bản ghi %s thành công: hộp thoại đóng, thông báo "%s", bản ghi hiện đúng '
                 'trên danh sách.'
                 % ('Cập nhật' if sua else 'Lưu', m['ma'],
                    toast or (tb[0] if tb else ''))), du_kien


@phep('huy_bo_bieu_mau', can_ghi=False)
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith('chuc nang huy')
                       or (_co(_n(cs.b), 'huy bo') and _pv(cs) in ('them', 'sua')))
           and _pv(cs) in ('them', 'sua'))
def p_huy_bo(case, ctx):
    """Bấm Hủy trên biểu mẫu: hộp thoại đóng, không tạo bản ghi nào, tổng số không đổi."""
    truoc = _tong_ban_ghi(ctx)
    hop = ui.mo_hop(ctx.c, ctx.nut_them())
    if not hop:
        return None
    ma, ten = ctx.so.cap_ma()
    ui.dien(ctx.c, ctx.o_ma(), ma, 'hop')
    ui.dien(ctx.c, ctx.o_ten(), ten, 'hop')
    ui.bam(ctx.c, ctx.nut_huy(), 'hop', cho=1.2)
    con_mo = ui.co_hop_thoai(ctx.c)
    if con_mo:
        ui.dong_hop(ctx.c)
    time.sleep(0.8)
    sau = _tong_ban_ghi(ctx)
    dong = ui.doc_dong(ctx.c, ma)
    du_kien = {'hop_con_mo_sau_huy': con_mo, 'tong_truoc': truoc, 'tong_sau': sau,
               'ban_ghi_bi_tao': bool(dong), 'ma_thu': ma}
    if con_mo:
        return 'F', 'Bấm "%s" nhưng hộp thoại KHÔNG đóng.' % ctx.nut_huy(), du_kien
    if dong or (truoc is not None and sau is not None and sau != truoc):
        return 'F', ('Bấm "%s" mà dữ liệu vẫn được tạo (tổng %s → %s).'
                     % (ctx.nut_huy(), truoc, sau)), du_kien
    return 'P', ('Nhập dữ liệu rồi bấm "%s": hộp thoại đóng, không tạo bản ghi nào, tổng số bản '
                 'ghi giữ nguyên (%s).' % (ctx.nut_huy(), sau)), du_kien


# ── XÓA ──────────────────────────────────────────────────────────────────────
@phep('hop_xac_nhan_xoa', can_ghi=True)
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith('hop xac nhan')
                       and _bat_ky(_n(cs.b), 'noi dung hop xac nhan', 'du lieu ban ghi hien')
                       and 'nhieu' not in _n(_nhom(cs))))
def p_hop_xoa(case, ctx):
    """Mở hộp xác nhận Xóa trên bản ghi QA rồi đối chiếu tiêu đề/mô tả/nút với verbatim.

    Mở hộp xác nhận là thao tác ĐỌC (chưa xoá gì) — nhưng chỉ mở trên bản ghi QA, vì một cú
    bấm nhầm ở đây là một bản ghi thật biến mất.
    """
    kh = ctx.vb('xoa_don_le') or {}
    if not kh:
        return None
    m = ctx.ban_ghi(case)
    if not ctx.hien_ban_ghi_qa(m['ma']):
        raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
    r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_xoa(ctx))
    if not (isinstance(r, dict) and r.get('ok')):
        return None
    hop = ui.doc_hop_thoai(ctx.c) or {}
    ui.dong_hop(ctx.c)
    ctx.ve_danh_sach()
    txt = hop.get('txt') or ''
    tieu_de = hop.get('tieu_de') or ''
    nut = [x.get('chu') for x in (hop.get('nut') or [])]
    du_kien = {'tieu_de': tieu_de, 'noi_dung': txt[:300], 'nut': nut, 'khai': kh,
               'ban_ghi': m['ma']}
    if 'du lieu ban ghi hien' in _n(case.b):
        if m['ten'] in txt or m['ma'] in txt:
            return 'P', ('Hộp xác nhận Xóa hiện đúng dữ liệu của bản ghi đang thao tác '
                         '("%s").' % (m['ten'] if m['ten'] in txt else m['ma'])), du_kien
        return 'F', ('Hộp xác nhận Xóa KHÔNG nhắc tên bản ghi đang xoá (%s) — nội dung: "%s".'
                     % (m['ten'], txt[:140])), du_kien
    thieu = []
    if kh.get('tieu_de') and _n(kh['tieu_de']) not in _n(tieu_de + ' ' + txt):
        thieu.append('tiêu đề "%s"' % kh['tieu_de'])
    mo_ta = re.sub(r'\{[^}]*\}', '', kh.get('mo_ta') or '')
    for doan in [x.strip() for x in re.split(r'[“”"]', mo_ta) if len(x.strip()) > 12]:
        if _n(doan) not in _n(txt):
            thieu.append('mô tả "%s"' % doan[:50])
    for x in (kh.get('nut') or []):
        if not any(_n(x) == _n(y) for y in nut):
            thieu.append('nút "%s"' % x)
    if thieu:
        return 'F', ('Hộp xác nhận Xóa thiếu/lệch so với bản khai của hồ sơ màn: %s. Nội dung '
                     'thật: "%s" — nút: %s.'
                     % (' · '.join(thieu[:4]), (tieu_de + ' ' + txt)[:150], ' · '.join(nut))), du_kien
    return 'P', ('Hộp xác nhận Xóa đúng nguyên văn: tiêu đề "%s", mô tả và nút %s.'
                 % (kh.get('tieu_de'), ' · '.join(kh.get('nut') or []))), du_kien


@phep('xoa_ban_ghi', can_ghi=True)
@nhan_dien(lambda cs: (_bat_ky(_n(cs.b), 'xoa thanh cong ban ghi', 'viec huy bo thao tac xoa',
                               'chon nhieu ban ghi de xoa')
                       and _pv(cs) == 'xoa'))
def p_xoa(case, ctx):
    """Xóa thật một (hoặc nhiều) bản ghi QA, hoặc huỷ thao tác xoá — trọn CREATE→DELETE→VERIFY."""
    nb = _n(case.b)
    huy = 'huy bo thao tac xoa' in nb
    nhieu = 'chon nhieu ban ghi de xoa' in nb
    if nhieu:
        return _xoa_nhieu(case, ctx)
    m = ctx.ban_ghi(case, moi=not huy)
    if not ctx.hien_ban_ghi_qa(m['ma']):
        raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
    truoc = _tong_ban_ghi(ctx)
    r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_xoa(ctx))
    if not (isinstance(r, dict) and r.get('ok')):
        return None
    kh = ctx.vb('xoa_don_le') or {}
    if huy:
        ui.bam(ctx.c, _nut_huy_trong(kh), 'hop', cho=1.2)
        con_mo = ui.co_hop_thoai(ctx.c)
        if con_mo:
            ui.dong_hop(ctx.c)
        time.sleep(0.8)
        dong = ctx.hien_ban_ghi_qa(m['ma'])
        ctx.ve_danh_sach()
        du_kien = {'ban_ghi': m['ma'], 'con_tren_danh_sach': bool(dong), 'tong_truoc': truoc,
                   'hop_con_mo': con_mo}
        if dong:
            return 'P', ('Bấm Hủy trên hộp xác nhận Xóa: hộp đóng và bản ghi %s vẫn còn nguyên '
                         'trên danh sách.' % m['ma']), du_kien
        return 'F', ('Bấm Hủy trên hộp xác nhận Xóa nhưng bản ghi %s đã biến mất khỏi danh sách.'
                     % m['ma']), du_kien
    nut_xac_nhan = _nut_xoa_trong(kh)
    dat, ly_do = hop_xoa_dung_ban_ghi(ctx, m)
    if not dat:
        ui.dong_hop(ctx.c)
        raise qalib_chan('DỪNG trước khi bấm Xóa: %s' % ly_do)
    with ctx.ghi(case, 'xoa', m['ma'], mo_ta='xoá bản ghi QA') as cs:
        ui.bam_ghi(ctx.c, nut_xac_nhan, cs.giay_phep, cho=2.2)
    tb = ui.doc_thong_bao(ctx.c)
    con_mo = ui.co_hop_thoai(ctx.c)
    if con_mo:
        ui.dong_hop(ctx.c)
    dong = ctx.con_tren_app(m['ma'])
    if dong:
        ctx.so.ghi_hanh_dong(m['ma'], 'xoa', case.key, 'BẢN GHI VẪN CÒN')
    else:
        ctx.so.ghi_xoa(m['ma'], case.key, boi_cleanup=False, thanh_cong=True, ly_do='case xoá')
    ctx.ve_danh_sach()
    sau = _tong_ban_ghi(ctx)
    toast = kh.get('toast_thanh_cong')
    du_kien = {'ban_ghi': m['ma'], 'con_tren_danh_sach': bool(dong), 'thong_bao': tb[:3],
               'toast_khai': toast, 'tong_truoc': truoc, 'tong_sau': sau,
               'so_request_ghi': len(cs.cs.da_dung)}
    if dong:
        return 'F', ('Xác nhận Xóa bản ghi %s nhưng bản ghi VẪN còn trên danh sách.'
                     % m['ma']), du_kien
    if toast and not any(_n(toast) in _n(x) for x in tb):
        return 'F', ('Xóa bản ghi %s thành công nhưng KHÔNG hiện thông báo nguyên văn "%s" '
                     '(đọc được: %s).' % (m['ma'], toast, ' · '.join(tb[:2]) or 'không có')), du_kien
    return 'P', ('Xóa bản ghi %s: biến mất khỏi danh sách, thông báo "%s", tổng số bản ghi %s → %s.'
                 % (m['ma'], toast or (tb[0] if tb else ''), truoc, sau)), du_kien


def hop_xoa_dung_ban_ghi(ctx, m):
    """LƯỚI CHẮN CUỐI trước mọi cú bấm Xoá: hộp xác nhận có đang nói về ĐÚNG bản ghi QA không?

    Ba lớp trước đó (dấu của run · sổ · vân tay) đều xét ở tầng Ý ĐỊNH, và một lớp nữa ở tầng
    mạng xét SAU khi request đã bay. Giữa hai chỗ đó còn một khe: phép tìm dòng trên DOM có
    thể trỏ nhầm (app đổi bố cục bảng, dòng bị render lại giữa lúc tìm và lúc bấm). Khe ấy
    đúng bằng khoảng cách tới một bản ghi thật bị xoá, nên bịt bằng thứ chính app vừa in ra:
    hộp xác nhận phải nhắc tên hoặc mã của bản ghi QA.

    Trả `(đạt, lý do)`. Hộp KHÔNG nêu dữ liệu nào (kiểu "Bạn chắc chắn muốn xoá?") thì không
    kết luận được — trả `(True, …)` kèm lý do, vì chặn ở đây sẽ chặn oan mọi app như vậy;
    hộp có nêu dữ liệu mà KHÁC bản ghi của ta thì CHẶN.
    """
    hop = ui.doc_hop_thoai(ctx.c) or {}
    txt = ((hop.get('tieu_de') or '') + ' ' + (hop.get('txt') or '')).strip()
    if not txt:
        return False, 'không đọc được nội dung hộp xác nhận Xóa'
    ma, ten = m.get('ma') or '', m.get('ten') or ''
    if (ma and ma in txt) or (ten and ten in txt):
        return True, 'hộp xác nhận nhắc đúng bản ghi QA'
    # Hộp có nêu một MÃ/TÊN nào đó không phải của ta -> chặn. Nhận ra "có nêu" bằng chính
    # dấu QA: hộp nhắc một bản ghi khác thì chuỗi trong ngoặc kép sẽ khác mã/tên của ta.
    trong_nhay = re.findall(r'[“"”]([^“"”]{2,80})[“"”]', txt)
    if trong_nhay:
        return False, ('hộp xác nhận đang nói về %r, KHÔNG phải bản ghi QA %r'
                       % (trong_nhay[0][:50], ma))
    return True, 'hộp xác nhận không nêu dữ liệu bản ghi nào (không đối chiếu được)'


def _nut_huy_trong(kh):
    for x in (kh.get('nut') or []):
        if qalib.chua_tu(x, 'huy', 'huy bo'):
            return x
    return 'Hủy'


def _nut_xoa_trong(kh):
    if kh.get('nut_xac_nhan'):
        return kh['nut_xac_nhan']
    for x in (kh.get('nut') or []):
        if _bat_ky(_n(x), 'xoa'):
            return x
    return 'Xóa'


def _xoa_nhieu(case, ctx):
    """Chọn nhiều bản ghi QA rồi xoá hàng loạt — cửa sổ ghi mở cho ĐÚNG số bản ghi đã chọn."""
    ds = []
    for _ in range(2):
        ds.append(ctx.tao_ban_ghi(case))
    ma_ds = [m['ma'] for m in ds]
    ui.tim_kiem(ctx.c, ctx.so.run_id.split('_')[1], cho=ctx.hs_so('tim_kiem_debounce_ms'))
    for ma in ma_ds:
        if not ui.tich_dong(ctx.c, ma, bo=False).get('ok'):
            return None
    kh = ctx.vb('xoa_hang_loat') or {}
    nut_thanh = None
    for x in (ctx.vb('thanh_hang_loat') or []):
        if _bat_ky(_n(x), 'xoa tat ca'):
            nut_thanh = x
    if not nut_thanh or not ui.co_nut(ctx.c, nut_thanh, 'man'):
        return None
    ui.bam(ctx.c, nut_thanh, 'man', cho=1.2)
    if not ui.hop_cua_ta_con_mo(ctx.c):
        return None
    # LƯỚI CHẮN trước khi xác nhận xoá hàng loạt: hộp thoại phải nói ĐÚNG số bản ghi ta đã
    # tích. Lệch số nghĩa là có dòng khác đang được chọn — dừng, không bấm.
    hop_txt = ((ui.doc_hop_thoai(ctx.c) or {}).get('tieu_de') or '') + ' ' + \
              ((ui.doc_hop_thoai(ctx.c) or {}).get('txt') or '')
    so_trong_hop = re.findall(r'\b(\d+)\b', hop_txt)
    if so_trong_hop and str(len(ma_ds)) not in so_trong_hop:
        ui.dong_hop(ctx.c)
        raise qalib_chan('DỪNG trước khi xoá hàng loạt: đã tích %d bản ghi QA nhưng hộp xác '
                         'nhận nói về %s — không bấm.' % (len(ma_ds), ' / '.join(so_trong_hop[:3])))
    with ctx.ghi(case, 'xoa', ma_ds[0], so_toi_da=len(ma_ds) + 1,
                 so_id_toi_da=len(ma_ds),
                 mo_ta='xoá hàng loạt %d bản ghi QA' % len(ma_ds)) as cs:
        cs.cs.ids_qa = {str(m['id_app']) for m in ds if m.get('id_app')}
        ui.bam_ghi(ctx.c, _nut_xoa_trong(kh), cs.giay_phep, cho=2.6)
    tb = ui.doc_thong_bao(ctx.c)
    if ui.co_hop_thoai(ctx.c):
        ui.dong_hop(ctx.c)
    con = []
    for ma in ma_ds:
        if ctx.con_tren_app(ma):
            con.append(ma)
        else:
            ctx.so.ghi_xoa(ma, case.key, boi_cleanup=False, thanh_cong=True, ly_do='xoá hàng loạt')
    ctx.ve_danh_sach()
    du_kien = {'ban_ghi': ma_ds, 'con_lai': con, 'thong_bao': tb[:3],
               'so_request_ghi': len(cs.cs.da_dung), 'toast_khai': kh.get('toast_thanh_cong')}
    if con:
        return 'F', ('Chọn %d bản ghi rồi xoá hàng loạt: còn %d bản ghi chưa bị xoá (%s).'
                     % (len(ma_ds), len(con), ' · '.join(con))), du_kien
    return 'P', ('Chọn %d bản ghi QA rồi xoá hàng loạt: cả %d biến mất khỏi danh sách, hệ thống '
                 'gửi %d request xoá (xoá lặp từng dòng đúng như hồ sơ màn khai)%s.'
                 % (len(ma_ds), len(ma_ds), len(cs.cs.da_dung),
                    (', thông báo "%s"' % tb[0]) if tb else '')), du_kien


@phep('click_lien_tuc', can_ghi=True)
@nhan_dien(lambda cs: _co(_n(cs.b), 'click lien tuc vao nut') or _co(_n(cs.b), 'click lien tuc vao button'))
def p_click_lien_tuc(case, ctx):
    """Bấm liên tục nút chốt: hệ thống chỉ được gửi MỘT request ghi (chống bấm trùng).

    Bấm bằng CHUỘT THẬT, giãn ≥ 90 ms — `el.click()` trong cùng một tick đi lọt khoá nút.
    Cửa sổ ghi mở với hạn mức 1: cú bấm thứ hai mà sinh request ghi thì chính hàng rào mạng
    tố ra, và đó đúng là kết luận của case.
    """
    nhom = _n(_nhom(case))
    pv = _pv(case)
    if pv == 'xoa' or 'xoa' in nhom:
        m = ctx.ban_ghi(case, moi=True)
        if not ctx.hien_ban_ghi_qa(m['ma']):
            raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
        r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_xoa(ctx))
        if not (isinstance(r, dict) and r.get('ok')):
            return None
        kh = ctx.vb('xoa_don_le') or {}
        nut, hanh = _nut_xoa_trong(kh), 'xoa'
        ma = m['ma']
    elif pv in ('them',):
        hop = ui.mo_hop(ctx.c, ctx.nut_them())
        if not hop:
            return None
        ma, ten = ctx.so.cap_ma()
        ctx.so.khai_tao(ma, ten, case.key, 'case click liên tục')
        # ⚠️ VÁ 18/09 — điền ĐỦ ô bắt buộc, không chỉ mã + tên. Biểu mẫu của màn còn `Loại
        # database` và `Chuỗi kết nối` bắt buộc; thiếu chúng thì cú bấm Lưu bị validate phía
        # trình duyệt chặn, KHÔNG request nào bay đi, `so_ghi == 0` và phép từ chối kết luận —
        # đúng chỗ r317 · r471 nằm lại CHƯA ĐO.
        ctx.dien_form(ma=ma, ten=ten)
        nut, hanh = ctx.nut_luu_them(), 'tao'
    elif pv in ('sua', 'hop'):
        # ⚠️ VÁ 18/09 — thiếu nhánh này làm 2 case CHƯA ĐO (r317 · r471: *"click liên tục vào
        # nút lưu"* / *"nút lưu thay đổi"*). Case thuộc phạm vi SỬA nên không rơi vào nhánh
        # `them` lẫn `xoa`, và phép rơi thẳng xuống `return None` — phép đo có, chỉ là chưa
        # bao giờ chạy tới thân của nó.
        m = ctx.ban_ghi(case)
        ma = m['ma']
        if not ctx.hien_ban_ghi_qa(ma, lam_moi=True):
            raise LoiThaoTac('không thấy bản ghi QA %s để mở Chỉnh sửa' % ma)
        r = ui.mo_hop_theo_dong(ctx.c, ma, _icon_sua(ctx))
        if not (isinstance(r, dict) and r.get('ok')):
            return None
        # Đổi một giá trị để cú Lưu có việc thật mà làm.
        o_ten = ctx.o_ten()
        if o_ten:
            ui.dien(ctx.c, o_ten, '%s sua lien tuc' % m.get('ten') or ma, 'hop')
        # ⚠️ VÁ 18/09 lượt 2. Cột C nói *"Sửa HỢP LỆ"* — chỉ đổi mỗi ô Tên là chưa hợp lệ.
        # Biểu mẫu Sửa của màn mở ra với `Chuỗi kết nối` RỖNG (máy chủ không trả lại chuỗi
        # kết nối trong GET), nên cú Lưu bị validate phía trình duyệt chặn, KHÔNG request nào
        # bay đi: đúng con số `so_request_ghi: 0` đo được ở r471/r472, và phép đo đành bỏ
        # cuộc. Điền nốt ô bắt buộc rồi mới bấm.
        ctx.dien_o_bat_buoc(form='form_sua', bo_qua={_n(o_ten)} if o_ten else (),
                            ma=ma, ten=m.get('ten') or ma)
        nut, hanh = ctx.nut_luu_sua(), 'sua'
    else:
        return None
    with ctx.ghi(case, hanh, ma, so_toi_da=1, mo_ta='bấm liên tục nút %s' % nut) as cs:
        ui.bam_ghi(ctx.c, nut, cs.giay_phep, cho=0.0, thuc=True)
        # Chụp nút NGAY SAU cú bấm ĐẦU TIÊN — cột D đòi đúng khoảnh khắc này.
        time.sleep(0.12)
        nut_sau_bam1 = trang_thai_nut(ctx.c, nut, 'hop')
        for _ in range(3):
            time.sleep(0.09)
            ui.bam_chuot(ctx.c, nut, 'hop')
        time.sleep(2.0)
        # Đọc lỗi TRƯỚC khi đóng hộp: nếu 0 request là do validate chặn thì câu lỗi nằm ngay
        # đây, còn sau `dong_hop` thì không còn gì để đọc — và phép đo lại bỏ cuộc mù.
        loi_hop = ui.doc_loi(ctx.c, 'hop')[:3]
    so_ghi = len(cs.cs.da_dung)
    if ui.co_hop_thoai(ctx.c):
        ui.dong_hop(ctx.c)
    dong = (ctx.hien_ban_ghi_qa(ma) if hanh == 'tao' else ctx.con_tren_app(ma))
    if hanh == 'tao':
        ctx.so.xac_nhan_tao(ma, co_tren_app=bool(dong))
    elif not dong:
        ctx.so.ghi_xoa(ma, case.key, boi_cleanup=False, thanh_cong=True, ly_do='case xoá')
    else:
        # Bấm xoá mà bản ghi CÒN: nó vẫn sống, phải để bước dọn xử lý. Đánh dấu "xoá hỏng" ở
        # đây là đẩy bản ghi ra khỏi danh sách còn tồn ⇒ dọn bỏ sót, và chỉ khâu nghiệm thu
        # cuối mới phát hiện (đã dính đúng ca này khi tự kiểm).
        ctx.so.ghi_hanh_dong(ma, 'xoa', case.key, 'BẢN GHI VẪN CÒN')
    ctx.ve_danh_sach()
    du_kien = {'nut': nut, 'so_cu_bam': 4, 'so_request_ghi': so_ghi,
               'con_tren_danh_sach': bool(dong),
               'nut_sau_bam_dau': nut_sau_bam1, 'loi_tren_bieu_mau': loi_hop,
               'chu_mong_doi': ctx.vb('nut_dang_luu') or 'Đang lưu...'}
    if so_ghi == 0:
        # KHÔNG kết luận. 0 request ghi nghĩa là **cú bấm không tới được nút** (toạ độ trượt,
        # nút bị che, sự kiện chuột chưa đủ, hoặc biểu mẫu bị validate chặn) — không phải
        # nghĩa là "nút có chống bấm trùng". Bản đầu chấm P ở đây, và đó là một P tô hồng.
        return bo_qua(ctx, 'bấm 4 lần mà 0 request ghi', **du_kien)
    doi_chu = bool(nut_sau_bam1 and _n(nut_sau_bam1.get('chu') or '') != _n(nut))
    vo_hieu = bool(nut_sau_bam1 and nut_sau_bam1.get('vo_hieu'))
    du_kien.update({'nut_doi_chu': doi_chu, 'nut_bi_vo_hieu': vo_hieu})
    if so_ghi == 1:
        # Cột D đòi BA điều, không phải một: đổi chữ · bị vô hiệu · chỉ 1 bản ghi. Chấm P chỉ
        # vì "1 request" là bỏ qua hai điều kia mà case nói rõ.
        if doi_chu and vo_hieu:
            return 'P', ('Bấm liên tục 4 lần vào nút "%s": ngay sau lần đầu nút đổi chữ thành '
                         '%r và bị vô hiệu; hệ thống chỉ gửi 1 request ghi.'
                         % (nut, (nut_sau_bam1 or {}).get('chu'))), du_kien
        thieu = []
        if not doi_chu:
            thieu.append('KHÔNG đổi chữ (vẫn %r)' % (nut_sau_bam1 or {}).get('chu'))
        if not vo_hieu:
            thieu.append('KHÔNG bị vô hiệu')
        return 'F', ('Bấm liên tục 4 lần vào nút "%s": hệ thống chỉ gửi 1 request ghi, nhưng '
                     'ngay sau lần bấm đầu nút %s — cột D đòi cả hai.'
                     % (nut, ' và '.join(thieu))), du_kien
    return 'F', ('Bấm liên tục 4 lần vào nút "%s": hệ thống gửi %d request ghi — không chống '
                 'bấm trùng.' % (nut, so_ghi)), du_kien


# ── NGOẠI LỆ: HẾT PHIÊN ──────────────────────────────────────────────────────
@phep('het_phien', can_ghi=True)
@nhan_dien(lambda cs: _bat_ky(_n(cs.b), 'khi het phien', 'thao tac khi het phien'))
def p_het_phien(case, ctx):
    """Xoá token của trình duyệt rồi thao tác -> app phải báo hết phiên / đá về đăng nhập.

    Thao tác trên TRÌNH DUYỆT, không gọi API đăng xuất, không đụng tài khoản. Sau khi đo phải
    **đăng nhập lại** — nếu không thì mọi case sau chạy trong trạng thái mất phiên.
    """
    mong = ctx.vb('het_phien') or ctx.vb('chua_dang_nhap')
    if not mong:
        return None
    hop = ui.mo_hop(ctx.c, ctx.nut_them())
    if not hop:
        return None
    ma, ten = ctx.so.cap_ma()
    ctx.so.khai_tao(ma, ten, case.key, 'case hết phiên — kỳ vọng KHÔNG tạo')
    ui.dien(ctx.c, ctx.o_ma(), ma, 'hop')
    ui.dien(ctx.c, ctx.o_ten(), ten, 'hop')
    ui.xoa_cookie_phien(ctx.c)
    ui.xoa_token_trong_trang(ctx.c)
    with ctx.ghi(case, 'tao', ma, mo_ta='thao tác khi hết phiên') as cs:
        ui.bam_ghi(ctx.c, ctx.nut_luu_them(), cs.giay_phep, cho=2.5)
    van = ui.doc_van_ban(ctx.c)
    tb = ui.doc_thong_bao(ctx.c) + ui.doc_loi(ctx.c, 'hop')
    url_sau = ui._js(ctx.c, "return JSON.stringify(location.pathname);") or ''
    du_kien = {'cau_mong_doi': mong, 'thong_bao': tb[:3], 'url_sau': url_sau,
               'so_request_ghi': len(cs.cs.da_dung)}
    bao = (_n(mong) in _n(van)) or any(_n(mong) in _n(x) for x in tb)
    ve_login = 'login' in (url_sau or '').lower() or 'signin' in (url_sau or '').lower()
    # ⚠️ KHÔNG đoán "bản ghi không được tạo". Bản đầu đánh dấu `KHONG_THAY` vô điều kiện; lượt
    # chạy thật 15/09 cho thấy request tạo VẪN đi và bản ghi VẪN được tạo (token của SPA nằm
    # trong bộ nhớ JS — xoá cookie/localStorage không giết được phiên) ⇒ một bản ghi thật nằm
    # lại trên hệ thống mà sổ ghi là "đã sạch". Nay ĐĂNG NHẬP LẠI rồi KIỂM, sau đó mới ghi sổ.
    _dang_nhap_lai_neu_can(ctx)
    con = ctx.con_tren_app(ma)
    du_kien['ban_ghi_co_duoc_tao'] = bool(con)
    if con:
        ctx.so.xac_nhan_tao(ma, co_tren_app=True)
    else:
        ctx.so.danh_dau_khong_thay(ma, 'case hết phiên: bản ghi không được tạo')
    if bao or ve_login:
        return 'P', ('Hết phiên rồi bấm "%s": %s Bản ghi %s được tạo.'
                     % (ctx.nut_luu_them(),
                        ('hệ thống báo đúng nguyên văn "%s".' % mong) if bao
                        else 'hệ thống đưa về trang đăng nhập (%s).' % url_sau,
                        'VẪN' if con else 'KHÔNG')), du_kien
    if con:
        # Không báo gì VÀ vẫn ghi được ⇒ phiên chưa hề hết: ta xoá được cookie/localStorage
        # nhưng token nằm trong bộ nhớ JS nên **ca "hết phiên" chưa dựng được**. Chấm F ở đây
        # là đổ cho sản phẩm một lỗi mà phép đo chưa chứng minh được.
        return None
    # Phân biệt hai ca khác hẳn nhau — bản đầu gộp chung thành một câu "KHÔNG báo hết phiên",
    # và câu ấy SAI với ca thứ hai (app có báo, chỉ là báo sai chữ). Đo trên màn thật 15/09:
    # app trả `Unauthorized - token hết hạn hoặc không để trống` — có chặn, có báo, nhưng là
    # chuỗi kỹ thuật tiếng Anh chứ không phải câu verbatim mà hồ sơ màn/BA quy định.
    co_bao_gi_do = [x for x in tb if len(x.strip()) > 3 and '*' != x.strip()]
    if co_bao_gi_do:
        return 'F', ('Hết phiên rồi bấm "%s": hệ thống CHẶN đúng (bản ghi không được tạo) nhưng '
                     'thông báo KHÔNG đúng bản verbatim.\nYêu cầu: "%s"\nMàn thật: "%s"\n'
                     'Đây là chuỗi kỹ thuật, không phải câu hướng dẫn người dùng đăng nhập lại.'
                     % (ctx.nut_luu_them(), mong, ' | '.join(co_bao_gi_do[:2]))), du_kien
    return 'F', ('Hết phiên rồi bấm "%s": bản ghi KHÔNG được tạo nhưng hệ thống KHÔNG hiện thông '
                 'báo nào và KHÔNG đưa về trang đăng nhập (đang ở %s). Yêu cầu: "%s".'
                 % (ctx.nut_luu_them(), url_sau, mong)), du_kien


def _dang_nhap_lai_neu_can(ctx):
    """Đăng nhập lại ngay trong phép đo — ca hết phiên phải đọc lại danh sách để kiểm chứng."""
    from chay_live import _dang_nhap_lai
    v = getattr(ctx, 'viec', None)
    if v is not None:
        _dang_nhap_lai(v, ctx.c, ctx.cong, ctx)


# ══════════════════════════════════════════════════════════════════════════════
# TRA CỨU
# ══════════════════════════════════════════════════════════════════════════════
def phep_cua(case, cho_phep_ghi=True):
    """Tên phép sẽ chạy cho case này (`None` nếu chưa có phép nào nhận).

    `cho_phep_ghi=False` bỏ qua phép cần ghi — để `--dry-run` và lượt chạy chỉ-đọc đếm đúng
    bằng thứ chúng sẽ thật sự làm.
    """
    for p in PHEP:
        if p['can_ghi'] and not cho_phep_ghi:
            continue
        try:
            if p['nhan'](case):
                return p['ten']
        except Exception:
            continue
    return None


def can_ghi(ten):
    for p in PHEP:
        if p['ten'] == ten:
            return p['can_ghi']
    return False


# Tối đa bao nhiêu phép được thử cho MỘT case. Có hạn mức vì mỗi phép là một chuỗi thao tác
# thật trên màn: thử vô hạn thì một case hỏng có thể ngốn cả phút và đụng biểu mẫu nhiều lần.
SO_PHEP_THU_TOI_DA = 6


def chay(case, ctx):
    """Chạy phép hợp với case -> (mark, note, dữ kiện, tên phép) hoặc None.

    ⚠️ Vá 2026-09-16. Bản trước `return None` ngay khi phép ĐẦU TIÊN khớp mà không kết luận
    được — nghĩa là một phép chuyên biệt trả `None` **chặn** mọi phép tổng quát đứng sau nó,
    và case rơi vào CHƯA ĐO dù có phép khác đo được. Đo được trên app giả: `o_so_ban_ghi_nhap`
    khớp case *"nhập số âm vào ô số bản ghi/trang"* rồi trả `None`, nên `o_page_size_nhap`
    (phép đo đúng ca ấy) không bao giờ chạy.

    Nay `None` nghĩa là *"tôi không kết luận được, mời phép sau"* — đúng nghĩa luật ② của
    §4d. Phép nào ĐÃ kết luận thì dừng ngay; danh sách vẫn xét theo thứ tự chuyên biệt ->
    tổng quát nên phép đúng nhất vẫn được hỏi trước.

    ⚠️ Vá 2026-09-16 lượt 3 (§17 + §18 của chỉ thị). Thêm hai việc TRƯỚC vòng xét phép:

      · **DỰNG TRẠNG THÁI** case đòi (`tien_dieu_kien.TrangThai`). Trước đây phép đo tự gặp
        một màn không đúng trạng thái rồi tự im — 20 case phân trang của `ViTriLuuTru` về
        CHƯA ĐO chỉ vì màn thật có 16 bản ghi mà case cần 21, trong khi lớp dữ liệu QA đã
        đủ sức tạo bù. Nay dựng trước, đo sau, và dựng bằng đúng các cổng đã có.
      · **GHI BẢN GHI THỰC THI** (`ctx.dau_vet`) cho mọi nhánh, kể cả nhánh không kết luận.
        `chay_live` đọc nó để phân biệt *"chưa có phép đo"* với *"có phép đo nhưng không
        kết luận được"* — hai thứ trước đây dùng chung một câu tiếng Việt.
    """
    dv = ctx.dau_vet if getattr(ctx, 'dau_vet', None) else ctx.bat_dau_case(case)
    hop = [p for p in PHEP if not (p['can_ghi'] and not ctx.cho_phep_ghi) and _nhan(p, case)]
    if not hop:
        dv['ly_do'] = NO_MEASUREMENT
        dv['chi_tiet_ly_do'] = 'không phép đo nào trong %d phép nhận lớp case này' % len(PHEP)
        return None
    with tdk.TrangThai(ctx, case, dv.get('tien_dieu_kien')) as tt:
        dv['fixture'] = tt.mo_ta
        dv['fixture_loai'] = tt.loai
        dv['fallback'] = tt.fallback
        dv['fixture_chi_tiet'] = tt.khoi()
        if not tt:
            # Dựng không nổi. Đây KHÔNG phải "chưa có phép đo": phép đo có, và nó sẽ chạy
            # ngay khi trạng thái dựng được. Lý do mang mã riêng để §23 đếm tách bạch.
            dv['ly_do'] = TIEN_DK_THIEU
            dv['chi_tiet_ly_do'] = tt.mo_ta
            dv['phep_da_thu'] = [p['ten'] for p in hop][:SO_PHEP_THU_TOI_DA]
            return None
        if tt.loai in (tdk.QA_DATA, tdk.MOCK):
            ctx.ghi_thao_tac('dựng trạng thái: %s' % tt.mo_ta)
        da_thu = []
        for p in hop:
            da_thu.append(p['ten'])
            dv['phep_da_thu'] = list(da_thu)
            dv['phep_chay'] = p['ten']
            dv['loai_phep'] = p.get('loai') or 'UI'
            with _DoDong() as dd:
                kq = p['chay'](case, ctx)
            if dd.cuoi:
                # Dòng mã cuối cùng phép đo chạy tới — chỉ có khi bật QA_TRACE_NONE.
                dv.setdefault('dong_bo_cuoc', {})[p['ten']] = dd.cuoi
            if kq is not None:
                mark, note, du_kien = kq
                if len(da_thu) > 1 and isinstance(du_kien, dict):
                    # Ghi lại những phép đã thử mà không kết luận — người đọc evidence cần
                    # biết kết luận này đến từ phép thứ mấy, không phải từ phép chuyên biệt
                    # nhất.
                    du_kien = dict(du_kien, phep_da_thu=da_thu)
                if isinstance(du_kien, dict) and tt.loai in (tdk.QA_DATA, tdk.MOCK):
                    du_kien = dict(du_kien, trang_thai_da_dung=tt.khoi())
                dv['ly_do'] = DA_KET_LUAN
                dv['da_thao_tac'] = True
                dv['so_bang_chung'] = dem_bang_chung(du_kien, co_anh=bool(getattr(ctx, 'anh', None)))
                return mark, note, du_kien, p['ten']
            if len(da_thu) >= SO_PHEP_THU_TOI_DA:
                break
    # Có phép đo, đã chạy, không phép nào kết luận được. Khác hẳn NO_MEASUREMENT.
    #
    # ⚠️ VÁ 2026-09-17 lượt 2 (§L). Lượt chạy 500 case để lại 63 case ở đúng nhánh này, tất cả
    # với `evidence_count: 0` — nghĩa là không case nào nói được PHÉP ĐÃ ĐỌC ĐƯỢC GÌ trước khi
    # bỏ cuộc, nên không ai lần ra nhánh nào đã bỏ cuộc và vì sao. Một case "chưa đo" mà không
    # kèm dữ kiện thì lần chạy sau cũng chỉ chưa đo đúng như thế.
    #
    # Nay chụp lại trạng thái màn NGAY TẠI CHỖ BỎ CUỘC. Đây là *bằng chứng*, không phải kết
    # luận: nó không đổi `CHƯA ĐO` thành P/F, chỉ làm cho cái CHƯA ĐO ấy truy được.
    anh = anh_trang_thai(ctx)
    dv['phep_chay'] = da_thu[-1] if da_thu else None
    dv['ly_do'] = PHEP_TRA_NONE
    dv['thuc_thi_trang_thai'] = 'MEASURED_NO_CONCLUSION'
    dv['fallback_da_thu'] = list(da_thu)
    dv['fallback_ket_qua'] = 'không phép nào kết luận'
    dv['bang_chung_khi_none'] = anh
    if dv.get('dong_bo_cuoc'):
        anh['dong_bo_cuoc'] = dv['dong_bo_cuoc']
    if dv.get('du_kien_phep'):
        anh['du_kien_phep'] = dv['du_kien_phep']
    dv['so_bang_chung'] = dem_bang_chung(anh)
    dv['chi_tiet_ly_do'] = ('đã thử %d phép (%s), không phép nào kết luận được trên dữ kiện '
                            'đọc được ở trạng thái đã dựng (%s) || màn lúc bỏ cuộc: %s'
                            % (len(da_thu), ' · '.join(da_thu), tt.mo_ta or 'không phải dựng',
                               _tom_anh(anh)))
    return None


class _DoDong:
    """Ghi lại DÒNG MÃ cuối cùng mà một phép đo chạy tới trước khi trả `None`.

    Bật bằng `QA_TRACE_NONE=1`, mặc định TẮT. Vì sao cần: một phép đo có 5–8 nhánh `return
    None`, và câu *"phép đo không kết luận được"* không nói nhánh nào. Lượt chạy 500 case để
    lại 63 case như thế; muốn sửa thì phải biết nó dừng ở điều kiện nào, mà đọc mã thì chỉ ra
    được giả thuyết chứ không ra bằng chứng.

    Không bật mặc định: `sys.settrace` gọi lại Python ở MỌI dòng, và một lượt chạy thật thì
    không cần cái giá ấy — nó chỉ cần cho lượt truy nguyên.
    """

    BAT = bool(os.environ.get('QA_TRACE_NONE'))
    _TEP = None

    def __init__(self):
        self.cuoi = None

    def __enter__(self):
        if not self.BAT:
            return self
        if _DoDong._TEP is None:
            _DoDong._TEP = {os.path.abspath(m.__file__) for m in
                            (sys.modules.get(x) for x in
                             ('phep_live', 'phep_bosung', 'truong_live', 'man_live', 'attt_live'))
                            if m is not None and getattr(m, '__file__', None)}
        self._cu = sys.gettrace()
        sys.settrace(self._theo)
        return self

    # Khung của CHÍNH bộ dò — phải loại, nếu không `__exit__` (nằm trong `phep_live.py`, tức
    # nằm trong danh sách tệp được dò) chạy sau cùng và ĐÈ `cuoi` bằng dòng của chính nó. Khi
    # ấy mọi phép đo đều báo bỏ cuộc ở cùng một dòng vô nghĩa, và cả lượt truy nguyên thành
    # rác mà nhìn vẫn như có dữ liệu.
    _KHUNG_CUA_MINH = None

    def _theo(self, frame, su_kien, _arg):
        if _DoDong._KHUNG_CUA_MINH is None:
            _DoDong._KHUNG_CUA_MINH = {_DoDong.__enter__.__code__, _DoDong.__exit__.__code__,
                                       _DoDong._theo.__code__}
        if frame.f_code in _DoDong._KHUNG_CUA_MINH:
            return None
        if su_kien == 'call':
            return self._theo if frame.f_code.co_filename in _DoDong._TEP else None
        if su_kien == 'line':
            self.cuoi = '%s:%d' % (os.path.basename(frame.f_code.co_filename), frame.f_lineno)
        return self._theo

    def __exit__(self, *a):
        if self.BAT:
            sys.settrace(self._cu)
        return False


def trang_thai_nut(c, chu, pv='hop'):
    """Chữ + trạng thái vô hiệu của một nút, đọc NGAY tại thời điểm gọi. -> dict | None.

    Cột D của nhóm case *"bấm/Enter liên tục"* nói rất cụ thể: *"nút đổi chữ thành 'Đang
    lưu...' và bị vô hiệu"*. Đếm số request KHÔNG trả lời được câu đó — một hệ thống gửi đúng
    1 request vẫn có thể chưa hề đổi chữ hay khoá nút. Phải đọc chính cái nút.
    """
    return ui._js(c, """
      const b=NUT(%s,%s); if(!b) return 'null';
      return JSON.stringify({chu:TXT(b), vo_hieu:!!b.disabled
        ||b.getAttribute('aria-disabled')==='true'
        ||(b.getAttribute('data-state')||'')==='loading',
        lop:(b.className||'').slice(0,70)});""" % (ui._s(chu), ui._s(pv)))


def bo_qua(ctx, ly_do, **du):
    """Phép đo bỏ cuộc NHƯNG giữ lại dữ kiện của chính nó. -> luôn `None`.

    ⚠️ Vì sao cần: `chay()` chụp được trạng thái MÀN lúc bỏ cuộc, nhưng `du` của chính phép
    đo — giá trị đã đọc, kết quả thao tác, con số đối chiếu — thì bị vứt cùng với `return
    None`. Hậu quả đo được nhiều lần trong tháng 9: mỗi vòng chẩn đoán chỉ biết thêm một mẩu,
    và mỗi mẩu tốn trọn một lượt chạy live. Ghi lại ngay tại chỗ rẻ hơn hẳn chạy lại.
    """
    dv = getattr(ctx, 'dau_vet', None)
    if isinstance(dv, dict):
        dv.setdefault('du_kien_phep', {})
        dv['du_kien_phep'].update({k: v for k, v in du.items()})
        if ly_do:
            dv['du_kien_phep']['ly_do_bo_qua'] = str(ly_do)[:200]
    return None


def anh_trang_thai(ctx):
    """Chụp trạng thái màn tại chỗ một phép đo bỏ cuộc. -> dict dữ kiện, không bao giờ ném.

    Chụp thứ mà MỌI phép đo đều dựa vào: phân trang · bảng · hộp thoại · bộ lọc đang bật ·
    thông báo lỗi trên màn · các control đọc được. Đủ để đọc evidence xong là biết phép đo
    thiếu cái gì, không phải chạy lại cả lượt để đoán.
    """
    ra = {}
    try:
        ra['phan_trang'] = ui.doc_phan_trang(ctx.c)
    except Exception as e:
        ra['phan_trang'] = 'đọc hỏng: %s' % str(e)[:80]
    for ten, ham in (('so_dong_bang', lambda: len(ui.doc_bang(ctx.c))),
                     ('co_hop_thoai', lambda: ui.co_hop_thoai(ctx.c)),
                     ('hop_dang_mo', lambda: ui.hop_dang_mo(ctx.c)),
                     ('loi_tren_man', lambda: ui.doc_loi(ctx.c, 'man')),
                     ('loc_dang_bat', lambda: _js_loc_dang_bat(ctx.c)),
                     ('url', lambda: ui._js(ctx.c, "return JSON.stringify(location.pathname);"))):
        try:
            ra[ten] = ham()
        except Exception as e:
            ra[ten] = 'đọc hỏng: %s' % str(e)[:80]
    return ra


def _tom_anh(anh):
    """Một dòng tóm tắt ảnh trạng thái, để nhét vào `reason_detail`."""
    pt = anh.get('phan_trang') if isinstance(anh.get('phan_trang'), dict) else {}
    return ('%s dòng · tổng %s · %s/trang · %s trang · nút số %s · lọc %s%s'
            % (anh.get('so_dong_bang'), pt.get('tong') or '?', pt.get('moi_trang') or '?',
               ui.so_trang(pt) or '?', pt.get('so_nut_trang'),
               len(anh.get('loc_dang_bat') or []),
               ' · CÓ HỘP THOẠI' if anh.get('co_hop_thoai') else ''))


def _nhan(p, case):
    try:
        return bool(p['nhan'](case))
    except Exception:
        return False


# ══════════════════════════════════════════════════════════════════════════════
# ĐỢT 2 — Ô CHỌN · Ô TÌM KIẾM · PHÂN TRANG · ATTT · GIAO DIỆN
# ══════════════════════════════════════════════════════════════════════════════
def _o_chon_cua_case(ctx, case):
    """(nhãn ô chọn, phạm vi) mà case đang nói tới — `(None, None)` nếu không khoanh được.

    ⚠️ Phạm vi đổi 2026-09-16 lượt 3 (§5). Trước đây ô chọn ngoài biểu mẫu mang phạm vi
    `'man'` (cả trang); nay là `'loc'` — **thanh lọc** của màn. Đây không phải đổi tên: app
    này có ô chọn ở khung điều hướng và ở cụm phân trang, và quét cả trang thì ô ở khung
    điều hướng đứng trước. Hai tên gọi cho hai thứ khác nhau:

        FORM_CONTROL   = `'hop'`  ô chọn trong hộp thoại Thêm mới / Chỉnh sửa
        FILTER_CONTROL = `'loc'`  ô chọn trên thanh lọc của màn danh sách
    """
    nhom = case.nhom.get('sub2') or ''
    if not _n(nhom).startswith(('selectbox', 'combobox', 'o chon')):
        return None, None
    ten = qalib.field_of(nhom)
    pv = _pv(case)
    return ten, ('hop' if pv in ('them', 'sua') else 'loc')


def _goi_y_o_chon(ctx, ten, pv):
    """Chữ gợi ý NGUYÊN VĂN mà hồ sơ màn khai cho ô chọn này — `''` nếu chưa khai.

    Đây là đường tìm CHẮC CHẮN NHẤT (không suy diễn một chữ nào): hồ sơ màn của `ViTriLuuTru`
    khai sẵn `placeholder_loc_trang_thai` = "-- Chọn trạng thái --", `placeholder_loc_loai_db`,
    `placeholder_sap_xep`, `form_them.placeholder_loai_database`. Dò theo TÊN TRƯỜNG trong
    khoá nên màn mới chỉ cần khai đúng khuôn `placeholder_*` là dùng được ngay.
    """
    nb = _n(ten)
    nguon = [ctx.verbatim]
    if pv == 'hop':
        nguon.insert(0, ctx.vb('form_them') or {})
        nguon.insert(0, ctx.vb('form_sua') or {})
    for kho in nguon:
        if not isinstance(kho, dict):
            continue
        for k, val in kho.items():
            if not isinstance(val, str) or not str(k).startswith('placeholder'):
                continue
            kn = _n(str(k).replace('_', ' '))
            vn = _n(val)
            if nb and (nb in kn or nb in vn.replace('chon ', '')):
                return val
    return ''


def _tuy_chon_o(ctx, ten, pv):
    """Các GIÁ TRỊ hồ sơ màn khai cho ô chọn này (`tuy_chon_<tên trường>`). `[]` nếu chưa khai.

    ⚠️ VÁ 2026-09-17 lượt 2 — gốc của 11 case ô chọn nằm CHƯA ĐO suốt lượt chạy 500 case.
    Năm đường tìm cũ đều giả định ô chọn hiện CHỮ GỢI Ý. Ô `Sắp xếp` của `ViTriLuuTru` thì
    hiện **giá trị đang chọn** ("Mới nhất trước"); hồ sơ màn khai `placeholder_sap_xep` =
    "-- Chọn sắp xếp --" nhưng chữ ấy chưa từng xuất hiện trên màn, nên `tim_o_chon('Sắp xếp')`
    trả `None` và 5 case `o_chon_sap_xep` + 6 case cùng ô không đo được lần nào.

    Không chốt cứng "Mới nhất trước" vào tool: hồ sơ màn đã khai sẵn `tuy_chon_sap_xep`, lấy
    từ đó. Màn mới chỉ cần khai `tuy_chon_<tên trường>` là ô không nhãn của nó cũng tìm được.
    """
    nb = _n(ten)
    nguon = [ctx.verbatim]
    if pv == 'hop':
        nguon.insert(0, ctx.vb('form_them') or {})
        nguon.insert(0, ctx.vb('form_sua') or {})
    for kho in nguon:
        if not isinstance(kho, dict):
            continue
        for k, val in kho.items():
            if not isinstance(val, (list, tuple)) or not str(k).startswith('tuy_chon'):
                continue
            kn = _n(str(k).replace('_', ' '))
            if nb and nb in kn:
                return [str(x) for x in val if str(x).strip()]
    return []


def _mo_o_chon(ctx, case, ten, pv):
    """Mở ô chọn rồi đọc danh sách lựa chọn. -> {'option':[…], 'o':{…}} hoặc None.

    Biểu mẫu Thêm mới/Chỉnh sửa phải được mở trước (và đóng bởi người gọi).

    ⚠️ Vá 2026-09-16 lượt 3 (§5). Bản trước đi qua `ui.doc_o` -> `TIM()` -> `NHAN()`, mà
    `NHAN()` của một `<button>` không đọc chữ trong nút; ô lọc của app này là `<button>` chỉ
    mang chữ gợi ý ⇒ `doc_o` trả `None` ⇒ **11 case ô lọc** về CHƯA ĐO. Nay đi qua
    `ui.mo_o_chon` với chuỗi tìm 5 đường, và **bấm chuột THẬT** thay cho `el.click()` —
    thư viện dropdown nghe `pointerdown` thì `el.click()` không mở nổi, và một ô không mở
    được đọc ra y hệt một ô không có lựa chọn nào.
    """
    tc = _tuy_chon_o(ctx, ten, pv)
    op = ui.mo_o_chon(ctx.c, ten, pv, goi_y=_goi_y_o_chon(ctx, ten, pv), tuy_chon=tc)
    if op and op.get('option'):
        return op
    if op is not None and not op.get('option'):
        # Mở được ô nhưng popup rỗng: có thể danh sách nạp bất đồng bộ. Chờ rồi đọc lại
        # MỘT lần — im ngay lần đầu là kết luận "ô không có giá trị nào" cho một ô đang tải.
        time.sleep(1.2)
        op2 = ui.mo_o_chon(ctx.c, ten, pv, goi_y=_goi_y_o_chon(ctx, ten, pv), thuc=False,
                           tuy_chon=tc)
        if op2 and op2.get('option'):
            return op2
    return op


def _doc_o_chon(ctx, ten, pv):
    """Mô tả ô chọn đang hiện (chữ trên trigger) — `{}` nếu không tìm thấy."""
    return ui.tim_o_chon(ctx.c, ten, pv, _goi_y_o_chon(ctx, ten, pv),
                        _tuy_chon_o(ctx, ten, pv)) or {}


def _dong_o_chon(ctx):
    ui.dong_o_chon(ctx.c)


def _tuy_chon_khai(ctx, case, pv):
    """Danh sách lựa chọn mà cột D / hồ sơ màn khai cho ô Trạng thái ở phạm vi này."""
    d = case.d or ''
    ds = re.findall(r'"([^"]{2,60})"', d)
    if ds and _co(_n(d), 'hien thi cac gia tri'):
        return ds
    if pv == 'hop':
        return [str(x) for x in (ctx.vb('form_them', 'tuy_chon_trang_thai') or [])]
    return []


@phep('o_chon_tuy_chon')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _bat_ky(_n(cs.b), 'cac gia tri co trong', 'cac gia tri trong')
                       # ⚠️ *"căn lề CÁC GIÁ TRỊ TRONG …"* và *"sắp xếp CÁC GIÁ TRỊ TRONG …"*
                       # chứa nguyên cụm khoá của phép này. Không loại hai cụm ấy ra thì phép
                       # liệt kê nuốt mất 6 case của hai phép khác — và nuốt trong im lặng.
                       #
                       # ⚠️ Vá 2026-09-16 lượt 3: loại trừ theo CỤM ĐẦY ĐỦ chứ không theo từ
                       # `'sap xep'` đứng bất kỳ đâu trong tiêu đề. Màn này có một ô lọc TÊN LÀ
                       # `Sắp xếp`, nên case *"Kiểm tra các giá trị có trong Sắp xếp"* bị chính
                       # lưới chắn loại ra và rơi về CHƯA ĐO — lưới chắn bắt nhầm đúng thứ nó
                       # sinh ra để bảo vệ.
                       and not _bat_ky(_n(cs.b), 'can le cac gia tri', 'sap xep cac gia tri')
                       and 'so ban ghi' not in _n(_nhom(cs))))
def p_o_chon_tuy_chon(case, ctx):
    """Danh sách lựa chọn của ô chọn phải đúng bằng bản khai ở cột D / hồ sơ màn."""
    ten, pv = _o_chon_cua_case(ctx, case)
    if not ten:
        return None
    mong = _tuy_chon_khai(ctx, case, pv)
    if not mong:
        return None
    dong_form = False
    try:
        if pv == 'hop':
            if not _mo_form_cua_case(ctx, case):
                return None
            dong_form = True
        op = _mo_o_chon(ctx, case, ten, pv)
        if not op or not op.get('option'):
            return None
        that = [x['chu'] for x in op['option'] if (x.get('chu') or '').strip()]
        that = [x for x in that if not qalib.la_o_trong(x, '')]
        _dong_o_chon(ctx)
        tn, mn = [_n(x) for x in that], [_n(x) for x in mong]
        du_kien = {'o': ten, 'pham_vi': pv, 'mong': mong, 'that': that}
        thieu = [m for m, n in zip(mong, mn) if n not in tn]
        du = [t for t, n in zip(that, tn) if n not in mn]
        if not thieu and not du:
            return 'P', ('Ô chọn "%s" hiện đúng các giá trị: %s.'
                         % (ten, ' · '.join('"%s"' % x for x in that))), du_kien
        return 'F', ('Ô chọn "%s" LỆCH bản khai.\nYêu cầu: %s\nMàn thật: %s%s%s'
                     % (ten, ' · '.join(mong), ' · '.join(that),
                        ('\nThiếu: %s' % ' · '.join(thieu)) if thieu else '',
                        ('\nThừa: %s' % ' · '.join(du)) if du else '')), du_kien
    finally:
        if dong_form and ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


def _mo_form_cua_case(ctx, case):
    """Mở đúng biểu mẫu mà phạm vi của case đòi (Thêm mới / Chỉnh sửa bản ghi QA)."""
    if _pv(case) == 'sua':
        m = ctx.ban_ghi(case)
        if not ctx.hien_ban_ghi_qa(m['ma']):
            raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
        r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_sua(ctx))
        return r.get('hop') if isinstance(r, dict) and r.get('ok') else None
    return ui.mo_hop(ctx.c, ctx.nut_them())


@phep('o_chon_can_le')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _co(_n(cs.b), 'can le cac gia tri')))
def p_o_chon_can_le(case, ctx):
    """Các giá trị trong danh sách phải căn lề trái (đo `text-align` tính toán)."""
    ten, pv = _o_chon_cua_case(ctx, case)
    if not ten:
        return None
    dong_form = False
    try:
        if pv == 'hop':
            if not _mo_form_cua_case(ctx, case):
                return None
            dong_form = True
        op = _mo_o_chon(ctx, case, ten, pv)
        if not op or not op.get('option') or op.get('the') == 'select':
            return None
        canh = [x.get('can_le') for x in op['option'] if x.get('can_le')]
        _dong_o_chon(ctx)
        if not canh:
            return None
        xau = [x for x in canh if x not in ('left', 'start')]
        du_kien = {'o': ten, 'can_le': canh[:6]}
        if not xau:
            return 'P', ('Các giá trị trong ô chọn "%s" đều căn lề trái (text-align: %s).'
                         % (ten, canh[0])), du_kien
        return 'F', ('Giá trị trong ô chọn "%s" KHÔNG căn lề trái (text-align: %s).'
                     % (ten, ' · '.join(sorted(set(xau))))), du_kien
    finally:
        if dong_form and ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


@phep('o_chon_cach_tai')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _co(_n(cs.b), 'cach tai du lieu khi danh sach')))
def p_o_chon_cach_tai(case, ctx):
    """Cách nạp dữ liệu của ô chọn: đổ hết một lần hay tải thêm theo trang.

    Cột D chỉ đặt yêu cầu *"nếu dữ liệu lớn"*. Danh sách cố định vài giá trị thì điều kiện
    không xảy ra ⇒ kết luận là "đổ hết một lần, đúng vì danh sách nhỏ", không phải F.
    """
    ten, pv = _o_chon_cua_case(ctx, case)
    if not ten:
        return None
    nguong = 20
    dong_form = False
    try:
        if pv == 'hop':
            if not _mo_form_cua_case(ctx, case):
                return None
            dong_form = True
        op = _mo_o_chon(ctx, case, ten, pv)
        if not op or not op.get('option'):
            return None
        n = len([x for x in op['option'] if (x.get('chu') or '').strip()])
        _dong_o_chon(ctx)
        du_kien = {'o': ten, 'so_lua_chon': n, 'nguong_trang': nguong}
        if n <= nguong:
            return 'P', ('Ô chọn "%s" chỉ có %d lựa chọn (≤ %d) — đổ hết một lần, không cần '
                         'tải theo trang. Điều kiện "dữ liệu lớn" của cột D không xảy ra.'
                         % (ten, n, nguong)), du_kien
        return None            # danh sách lớn: cần đo cuộn — chưa dựng được, để CHƯA ĐO
    finally:
        if dong_form and ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


@phep('o_chon_thao_tac')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _bat_ky(_n(cs.b), 'chon cac gia tri khac nhau',
                                   'tim kiem khong phan biet hoa thuong',
                                   'tim kiem tieng viet co dau',
                                   'tim kiem khop 100%', 'tim kiem khop 1 phan',
                                   'tim kiem tu khoa khong ton tai',
                                   'xoa tu khoa da nhap trong o tim kiem')
                       and 'so ban ghi' not in _n(_nhom(cs))))
def p_o_chon_thao_tac(case, ctx):
    """Thao tác trên ô chọn: chọn một giá trị · đánh dấu lựa chọn đang áp · đóng sau khi chọn.

    Bốn case mang tên *"tìm kiếm …"* đã được cột D viết lại thành quan sát cụ thể (ô chọn này
    KHÔNG có ô tìm) — phép đo theo đúng chữ ở cột D, không theo tên case.
    """
    ten, pv = _o_chon_cua_case(ctx, case)
    if not ten:
        return None
    nb, nd = _n(case.b), _n(case.d)
    dong_form = False
    try:
        if pv == 'hop':
            if not _mo_form_cua_case(ctx, case):
                return None
            dong_form = True
        op = _mo_o_chon(ctx, case, ten, pv)
        if not op or not op.get('option'):
            return None
        ds = [x for x in op['option'] if (x.get('chu') or '').strip()
              and not qalib.la_o_trong(x['chu'], '')]
        if not ds:
            return None
        du_kien = {'o': ten, 'pham_vi': pv, 'so_lua_chon': len(ds),
                   'co_o_tim': op.get('co_o_tim')}
        # ① cột D nói "không có ô tìm kiếm" -> kiểm đúng điều đó + phần "thay vào đó ghi nhận"
        if 'khong co o tim kiem' in nd:
            if op.get('co_o_tim'):
                return 'F', ('Cột D ghi ô chọn "%s" KHÔNG có ô tìm kiếm, nhưng màn thật CÓ ô '
                             'tìm trong danh sách.' % ten), du_kien
            if 'to nen nhat va in dam' in nd:
                chon = [x for x in ds if x.get('chon')]
                du_kien['lua_chon_dang_ap'] = [x['chu'] for x in chon]
                du_kien['dam'] = [x.get('dam') for x in chon]
                _dong_o_chon(ctx)
                if not chon:
                    return 'F', ('Không lựa chọn nào trong ô "%s" được đánh dấu là đang áp.'
                                 % ten), du_kien
                dam = any(str(x.get('dam') or '') in ('600', '700', 'bold', '800')
                          for x in chon)
                nen = any((x.get('nen') or '') not in ('', 'rgba(0, 0, 0, 0)', 'transparent')
                          for x in chon)
                if dam or nen:
                    return 'P', ('Lựa chọn đang áp trong ô "%s" được phân biệt bằng %s.'
                                 % (ten, ' và '.join(
                                     [x for x in (('in đậm' if dam else ''),
                                                  ('nền nhạt' if nen else '')) if x]))), du_kien
                return 'F', ('Lựa chọn đang áp trong ô "%s" không được tô nền nhạt cũng không '
                             'in đậm để phân biệt.' % ten), du_kien
            if 'danh sach dong ngay' in nd or 'bam chon xong danh sach dong' in nd:
                ui.chon_trong_o(ctx.c, ds[0]['chu'])
                con = ui._js(ctx.c, """
                  return JSON.stringify([...document.querySelectorAll('[role=option],[cmdk-item]')]
                    .filter(HIEN).length);""")
                x = _doc_o_chon(ctx, ten, pv)
                du_kien.update({'con_mo': con, 'o_sau_khi_chon': x.get('chu')})
                if con:
                    return 'F', ('Bấm chọn một giá trị ở ô "%s" nhưng danh sách KHÔNG đóng.'
                                 % ten), du_kien
                if _n(x.get('chu') or '') == _n(ds[0]['chu']):
                    return 'P', ('Bấm chọn "%s": danh sách đóng ngay và ô hiện đúng nhãn vừa '
                                 'chọn.' % ds[0]['chu']), du_kien
                return 'F', ('Bấm chọn "%s" nhưng ô đang hiện %r.'
                             % (ds[0]['chu'], x.get('chu'))), du_kien
            _dong_o_chon(ctx)
            return 'P', ('Ô chọn "%s" không có ô tìm kiếm bên trong — đúng như cột D ghi nhận '
                         '(%d lựa chọn đổ sẵn).' % (ten, len(ds))), du_kien
        # ② "chọn các giá trị khác nhau" — chọn 1, rồi chọn cái khác, ô phải hiện cái sau cùng
        if 'chon cac gia tri khac nhau' in nb:
            lan = []
            for i in range(min(2, len(ds))):
                if i:
                    op2 = _mo_o_chon(ctx, case, ten, pv)
                    if not op2:
                        break
                ui.chon_trong_o(ctx.c, ds[i]['chu'])
                lan.append({'chon': ds[i]['chu'],
                            'o_hien': _doc_o_chon(ctx, ten, pv).get('chu')})
            du_kien['lan_chon'] = lan
            if not lan:
                return None
            cuoi = lan[-1]
            if _n(cuoi['o_hien'] or '') == _n(cuoi['chon']):
                return 'P', ('Chọn lần lượt %s: ô "%s" luôn hiện giá trị chọn SAU CÙNG ("%s") — '
                             'chỉ chọn được 1.'
                             % (' → '.join('"%s"' % x['chon'] for x in lan), ten,
                                cuoi['o_hien'])), du_kien
            return 'F', ('Chọn "%s" nhưng ô "%s" đang hiện %r.'
                         % (cuoi['chon'], ten, cuoi['o_hien'])), du_kien
        # ③ "hiển thị đúng option"
        _dong_o_chon(ctx)
        return 'P', ('Mở ô chọn "%s": danh sách hiện đúng %d lựa chọn (%s).'
                     % (ten, len(ds), ' · '.join(x['chu'] for x in ds[:6]))), du_kien
    finally:
        if dong_form and ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


@phep('o_chon_qua_dai')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _bat_ky(_n(cs.b), 'khi gia tri qua dai',
                                   'hoac gia tri qua dai', 'gia tri qua dai')))
def p_o_chon_qua_dai(case, ctx):
    """Ô chọn có bề rộng cố định và cắt chữ bằng `…` khi nhãn dài."""
    ten, pv = _o_chon_cua_case(ctx, case)
    if not ten:
        return None
    dong_form = False
    try:
        if pv == 'hop':
            if not _mo_form_cua_case(ctx, case):
                return None
            dong_form = True
        if not _doc_o_chon(ctx, ten, pv):
            return None
        kq = ui._js(ctx.c, """
          const e=THEO_MOC('o-chon'); if(!e) return 'null';
          const r=e.getBoundingClientRect(); const st=getComputedStyle(e);
          const con=[...e.querySelectorAll('*')].map(x=>getComputedStyle(x).textOverflow);
          return JSON.stringify({rong:Math.round(r.width), tran:st.overflow+'/'+st.overflowX,
            cat:st.textOverflow, cat_con:con.slice(0,6),
            khong_xuong_dong:st.whiteSpace});""")
        if not kq:
            return None
        du_kien = dict(kq)
        cat = kq.get('cat') == 'ellipsis' or 'ellipsis' in (kq.get('cat_con') or [])
        if cat:
            return 'P', ('Ô chọn "%s" rộng cố định %spx và cắt nhãn dài bằng dấu … '
                         '(text-overflow: ellipsis).' % (ten, kq.get('rong'))), du_kien
        return 'F', ('Ô chọn "%s" KHÔNG cắt nhãn dài bằng dấu … (text-overflow: %s) — nhãn dài '
                     'sẽ tràn hoặc đẩy ô rộng ra.' % (ten, kq.get('cat'))), du_kien
    finally:
        if dong_form and ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


@phep('o_chon_loc_ket_qua', can_ghi=True)
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _bat_ky(_n(cs.b), 'chon 1 gia tri cua', 'tim kiem voi:')
                       and _pv(cs) in ('loc', 'danh_sach')))
def p_o_chon_loc(case, ctx):
    """Chọn một giá trị ở ô lọc -> danh sách chỉ còn bản ghi đúng giá trị đó."""
    ten, pv = _o_chon_cua_case(ctx, case)
    if not ten or pv != 'loc':
        return None
    nd = _n(case.d)
    if _co(_n(case.b), 'tim kiem voi:'):
        # ca "selectbox = -- Chọn trạng thái --": ô ở trạng thái chưa chọn -> danh sách đầy đủ
        x = _doc_o_chon(ctx, ten, 'loc')
        pt = ui.doc_phan_trang(ctx.c) or {}
        du_kien = {'o': ten, 'gia_tri': x.get('chu'), 'duong_tim': x.get('duong'),
                   'so_dong': pt.get('so_dong'), 'tong': pt.get('tong')}
        if not qalib.la_o_trong(x.get('chu') or '', x.get('goi_y') or ''):
            return None
        if pt.get('so_dong'):
            return 'P', ('Ô lọc "%s" ở trạng thái chưa chọn ("%s"): danh sách hiện đầy đủ %s '
                         'dòng theo điều kiện mặc định.'
                         % (ten, x.get('chu') or x.get('goi_y'), pt.get('so_dong'))), du_kien
        return 'F', ('Ô lọc "%s" chưa chọn giá trị nào mà danh sách KHÔNG có dòng nào.'
                     % ten), du_kien
    m = ctx.ban_ghi(case)
    op = _mo_o_chon(ctx, case, ten, 'loc')
    if not op or not op.get('option'):
        return None
    ds = [x['chu'] for x in op['option'] if (x.get('chu') or '').strip()
          and not qalib.la_o_trong(x['chu'], '')]
    if not ds:
        return None
    chon = ds[0]
    ui.chon_trong_o(ctx.c, chon)
    time.sleep(1.4)
    bang = ui.doc_bang(ctx.c)
    cot_tt = None
    for k in ((bang[0].get('o') or {}) if bang else {}):
        if _bat_ky(_n(k), 'trang thai', 'status'):
            cot_tt = k
    lech = []
    if cot_tt:
        for r in bang:
            v = (r['o'].get(cot_tt) or '').strip()
            if v and _n(chon) not in _n(v):
                lech.append(v)
    ctx.ve_danh_sach(lam_moi=True)
    du_kien = {'o': ten, 'chon': chon, 'so_dong': len(bang), 'cot_trang_thai': cot_tt,
               'dong_lech': lech[:5]}
    if cot_tt is None:
        return None
    if lech:
        return 'F', ('Lọc "%s" = "%s" nhưng danh sách còn %d dòng mang trạng thái khác (%s).'
                     % (ten, chon, len(lech), ' · '.join(lech[:3]))), du_kien
    return 'P', ('Lọc "%s" = "%s": cả %d dòng trả về đều đúng trạng thái đã chọn.'
                 % (ten, chon, len(bang))), du_kien


def _mo_chon_nhanh(ctx):
    """Mở ô CHỌN NHANH số bản ghi/trang. -> {'the', 'option'?} | None.

    Tách ra vì phép đo phải mở lại ô này sau khi dựng tiền điều kiện (tạo bù bản ghi để tổng
    bằng đúng một mức có sẵn) — chép tay hai bản là hai bản sẽ lệch nhau.
    """
    return ui._js(ctx.c, """
      const nut=[...document.querySelectorAll('button,[role=combobox],select')].filter(HIEN)
        .filter(b=>/chon nhanh|số bản ghi|ban ghi/i.test(
          (b.getAttribute('aria-label')||'')+(b.getAttribute('title')||'')+TXT(b)));
      if(!nut.length) return 'null';
      const b=nut[nut.length-1];
      if(b.tagName==='SELECT') return JSON.stringify({the:'select',
        option:[...b.options].map(o=>(o.text||'').trim())});
      b.click(); return JSON.stringify({the:'combobox'});""")


@phep('o_chon_page_size')
@nhan_dien(lambda cs: ('so ban ghi' in _n(_nhom(cs))
                       and _bat_ky(_n(cs.b), 'cac gia tri trong o chon so ban ghi',
                                   'cac gia tri co trong', 'chon so ban ghi moi trang')))
def p_page_size(case, ctx):
    """Ô chọn nhanh số bản ghi: danh sách mức + chọn một mức thì bảng đổi theo."""
    muc = [str(x) for x in (ctx.hs_so('page_size_chon_nhanh') or [])]
    if not muc:
        muc = re.findall(r'"(\d+)"', case.d or '')
    if not muc:
        return None
    op = _mo_chon_nhanh(ctx)
    if not op:
        return None
    if op.get('the') == 'combobox':
        time.sleep(0.7)
        op['option'] = ui._js(ctx.c, """
          return JSON.stringify([...document.querySelectorAll('[role=option],[role=menuitem],'+
            '[cmdk-item]')].filter(HIEN).map(TXT));""") or []
    that = [re.sub(r'[^\d]', '', x) for x in (op.get('option') or [])]
    that = [x for x in that if x]
    du_kien = {'muc_khai': muc, 'muc_that': that}
    nb = _n(case.b)
    if 'chon so ban ghi moi trang' in nb:
        pt0 = ui.doc_phan_trang(ctx.c) or {}
        tong = int(re.sub(r'[^\d]', '', str(pt0.get('tong') or '0')) or 0)
        muon = _muc_theo_case(nb, muc, tong)
        if muon is None and 'bang dung tong' in nb:
            # ⚠️ VÁ 18/09 (r94). Cột C đòi *"chọn mức BẰNG ĐÚNG Tổng số bản ghi đang hiển
            # thị"*, nhưng ô chọn nhanh chỉ có các mức cố định (20 · 50 · 100 · 200 · 500).
            # Bản trước bỏ cuộc — để case CHƯA ĐO vĩnh viễn. Không được tự đổi sang "mức lớn
            # hơn tổng" (đó là case KHÁC, r87/r88 đã đo), và cũng không được chấm bừa.
            #
            # Dựng TIỀN ĐIỀU KIỆN: tạo bù bản ghi QA cho tới khi tổng bằng ĐÚNG một mức có
            # sẵn. Khi ấy câu của cột C thực hiện được nguyên vẹn, và kỳ vọng vẫn là kỳ vọng
            # của cột D.
            so_muc = sorted(int(x) for x in muc if str(x).isdigit())
            dich = next((x for x in so_muc if x >= tong), None)
            thieu = (dich - tong) if dich else 0
            du_kien.update({'tong_truoc_khi_dung': tong, 'muc_co_san': so_muc,
                            'muc_dich': dich, 'can_tao_them': thieu})
            if not dich or not ctx.cho_phep_ghi or thieu > tdk.TRAN_MOT_CASE:
                _dong_o_chon(ctx)
                return bo_qua(ctx, 'không mức nào bằng đúng tổng %d và không dựng được '
                                   '(cần tạo %s bản ghi)' % (tong, thieu), **du_kien)
            _dong_o_chon(ctx)
            da = []
            try:
                for _ in range(thieu):
                    da.append(ctx.tao_ban_ghi(case)['ma'])
            except Exception as e:
                return bo_qua(ctx, 'tạo bù %d/%d bản ghi rồi dừng: %s'
                              % (len(da), thieu, str(e)[:120]), ban_ghi=da, **du_kien)
            ctx.ve_danh_sach(lam_moi=True)
            pt0 = ui.doc_phan_trang(ctx.c) or {}
            tong = int(re.sub(r'[^\d]', '', str(pt0.get('tong') or '0')) or 0)
            du_kien.update({'ban_ghi_tao_bu': da, 'tong_sau_khi_dung': tong,
                            'trang_thai_da_dung': 'tạo %d bản ghi QA để tổng = mức %s'
                                                  % (len(da), dich)})
            if tong != dich:
                return bo_qua(ctx, 'dựng xong mà tổng là %d, không bằng mức %s' % (tong, dich),
                              **du_kien)
            op = _mo_chon_nhanh(ctx)
            if op and op.get('the') == 'combobox':
                time.sleep(0.7)
            muon = dich
        if muon is None:
            _dong_o_chon(ctx)
            return bo_qua(ctx, 'không suy ra được mức cần chọn từ cột B/C', **du_kien)
        ui._js(ctx.c, """
          const o=[...document.querySelectorAll('[role=option],[role=menuitem],[cmdk-item]')]
            .filter(HIEN); const t=o.find(x=>TXT(x).replace(/[^0-9]/g,'')===%s);
          if(t){t.click(); return '1';} return '0';""" % ui._s(str(muon)))
        time.sleep(1.5)
        pt = ui.doc_phan_trang(ctx.c) or {}
        o_tx = ui.o_muc_trang(ctx.c) or {}
        du_kien.update({'muc_chon': muon, 'so_dong_sau': pt.get('so_dong'), 'tong': tong,
                        'o_textbox': o_tx.get('gia_tri'), 'so_nut_trang': pt.get('so_nut_trang')})
        ctx.ve_danh_sach(lam_moi=True)
        mong_dong = min(int(muon), tong) if tong else None
        if o_tx.get('gia_tri') and re.sub(r'[^\d]', '', o_tx['gia_tri']) != str(muon):
            return 'F', ('Chọn mức %s bản ghi/trang nhưng ô nhập số bản ghi/trang hiện %r.'
                         % (muon, o_tx.get('gia_tri'))), du_kien
        if mong_dong is not None and pt.get('so_dong') != mong_dong:
            return 'F', ('Chọn mức %s bản ghi/trang: bảng hiện %s dòng, chờ %s dòng (tổng %s).'
                         % (muon, pt.get('so_dong'), mong_dong, tong)), du_kien
        if int(muon) >= tong and ui.nhieu_trang(pt):
            return 'F', ('Chọn mức %s ≥ tổng %s bản ghi mà vẫn hiện %s nút trang.'
                         % (muon, tong, pt.get('so_nut_trang'))), du_kien
        return 'P', ('Chọn mức %s bản ghi/trang: bảng hiện %s dòng, ô nhập đồng bộ giá trị %s%s.'
                     % (muon, pt.get('so_dong'), o_tx.get('gia_tri'),
                        ', không còn phân trang' if int(muon) >= tong else '')), du_kien
    _dong_o_chon(ctx)
    if [x for x in muc] == that:
        return 'P', ('Ô chọn nhanh số bản ghi hiện đúng các mức: %s.' % ' · '.join(that)), du_kien
    return 'F', ('Ô chọn nhanh số bản ghi LỆCH: khai %s, màn thật %s.'
                 % (' · '.join(muc), ' · '.join(that) or 'không đọc được mức nào')), du_kien


def _muc_theo_case(nb, muc, tong):
    so = sorted(int(x) for x in muc if str(x).isdigit())
    if not so:
        return None
    if 'nho hon tong' in nb:
        ds = [x for x in so if tong and x < tong]
        return ds[0] if ds else None
    if 'bang dung tong' in nb:
        return tong if tong in so else None
    if 'lon hon hoac bang tong' in nb or 'lon hon tong' in nb:
        ds = [x for x in so if not tong or x >= tong]
        return ds[0] if ds else None
    return so[0]


# ── Ô TÌM KIẾM ───────────────────────────────────────────────────────────────
@phep('o_tim_kiem_nhap')
@nhan_dien(lambda cs: ('tim kiem theo' in _n(_nhom(cs)) or 'textbox tim kiem' in _n(_nhom(cs)))
           and _bat_ky(_n(cs.b), 'gia tri mac dinh o tim kiem', 'nhap ky tu dac biet',
                       'nhan so', 'copy noi dung du lieu', 'cat khoang trang hai dau',
                       'nhap chuoi rat dai', 'de trong o tim kiem',
                       'tim bang tieng viet khong dau', 'cac ky tu space',
                       'ky tu space o dau va cuoi', 'la cac ky tu dac biet',
                       'mot phan cua xau da ton tai', 'nhap du lieu khong gioi han'))
def p_o_tim_kiem(case, ctx):
    """Bộ case của ô tìm kiếm — nhập đủ kiểu dữ liệu rồi xem ô và danh sách phản ứng thế nào."""
    o = ctx.o_tim_kiem()
    if not o:
        return None
    nb = _n(case.b)
    debounce = ctx.hs_so('tim_kiem_debounce_ms')
    goi_y_khai = ctx.vb('placeholder_tim')

    def _go(gt, dan=False):
        x = (ui.dan(ctx.c, o, gt, 'man') if dan else ui.dien(ctx.c, o, gt, 'man', blur=False))
        time.sleep(max(0.8, float(debounce or 0) / 1000.0 + 0.8))
        pt = ui.doc_phan_trang(ctx.c) or {}
        return x or {}, pt

    try:
        if 'gia tri mac dinh' in nb:
            # "Khi mở màn" nghĩa là MÀN VỪA MỞ — phải dựng lại đúng trạng thái đó trước khi
            # đọc, không đọc tab đang mang dấu vết của phép đo trước (xem `Ctx.mo_lai_man`).
            ctx.mo_lai_man()
            o = ctx.o_tim_kiem() or o
            x = ui.doc_o(ctx.c, o, 'man') or {}
            du_kien = {'gia_tri': x.get('gia_tri'), 'goi_y': x.get('goi_y'),
                       'goi_y_khai': goi_y_khai}
            if (x.get('gia_tri') or '').strip():
                return 'F', ('Ô tìm kiếm KHÔNG trống khi mở màn, đang có %r.'
                             % x.get('gia_tri')), du_kien
            if goi_y_khai and _n(goi_y_khai) != _n(x.get('goi_y') or ''):
                return 'F', ('Ô tìm kiếm trống nhưng chữ gợi ý là %r, hồ sơ màn khai nguyên văn '
                             '"%s".' % (x.get('goi_y'), goi_y_khai)), du_kien
            return 'P', ('Ô tìm kiếm trống và hiện đúng chữ gợi ý nguyên văn "%s".'
                         % (x.get('goi_y') or goi_y_khai)), du_kien

        if 'cac ky tu space' in nb and 'o dau va cuoi' not in nb:
            x, pt = _go('   ')
            gt = x.get('gia_tri') or ''
            du_kien = {'go': '3 dấu cách', 'o_giu': repr(gt), 'so_dong': pt.get('so_dong')}
            if not gt.strip():
                if gt == '':
                    return 'P', 'Gõ toàn dấu cách vào ô tìm kiếm: ô không nhận khoảng trắng.', du_kien
                return 'F', ('Gõ toàn dấu cách: ô VẪN nhận %d khoảng trắng (cột D đòi không cho '
                             'phép nhập).' % len(gt)), du_kien
            return 'F', 'Ô tìm kiếm nhận chuỗi toàn khoảng trắng.', du_kien

        if 'cat khoang trang hai dau' in nb or 'ky tu space o dau va cuoi' in nb:
            m = ctx.ban_ghi(case) if ctx.cho_phep_ghi else None
            goc = (m or {}).get('ma')
            if not goc:
                return None
            _, pt1 = _go(goc)
            _, pt2 = _go('  %s  ' % goc)
            dong = ui.doc_dong(ctx.c, goc)
            du_kien = {'tu_khoa': goc, 'so_dong_khong_space': pt1.get('so_dong'),
                       'so_dong_co_space': pt2.get('so_dong'), 'thay_ban_ghi': bool(dong)}
            if dong and pt1.get('so_dong') == pt2.get('so_dong'):
                return 'P', ('Nhập từ khoá có khoảng trắng hai đầu: hệ thống tự cắt và trả về '
                             'đúng kết quả (%s dòng, có bản ghi %s).'
                             % (pt2.get('so_dong'), goc)), du_kien
            return 'F', ('Từ khoá "  %s  " (có khoảng trắng hai đầu) trả %s dòng, trong khi '
                         '"%s" trả %s dòng — hệ thống KHÔNG cắt khoảng trắng trước khi tìm.'
                         % (goc, pt2.get('so_dong'), goc, pt1.get('so_dong'))), du_kien

        if 'nhap chuoi rat dai' in nb or 'nhap du lieu khong gioi han' in nb:
            chuoi = 'z' * 1000
            x, pt = _go(chuoi, dan=True)
            van = ui.doc_van_ban(ctx.c)
            tran = ui.do_tran_ngang(ctx.c) or {}
            rong = ctx.vb('rong_co_loc') or ctx.vb('rong_khong_du_lieu')
            du_kien = {'do_dai_go': len(chuoi), 'o_giu': (x.get('gia_tri') or '')[:40] + '…',
                       'so_dong': pt.get('so_dong'), 'tran_ngang': tran.get('cuon_ngang'),
                       'cau_rong': rong}
            if pt.get('so_dong'):
                return 'F', ('Dán 1.000 ký tự vào ô tìm kiếm mà danh sách vẫn còn %s dòng kết quả.'
                             % pt.get('so_dong')), du_kien
            if rong and _n(rong) not in _n(van):
                return 'F', ('Dán 1.000 ký tự: danh sách rỗng nhưng KHÔNG hiện dòng chữ nguyên '
                             'văn "%s".' % rong), du_kien
            if tran.get('cuon_ngang'):
                return 'F', 'Dán 1.000 ký tự vào ô tìm kiếm làm giao diện tràn ngang.', du_kien
            return 'P', ('Dán 1.000 ký tự: hệ thống báo không tìm thấy kết quả ("%s"), giao diện '
                         'không vỡ, không lỗi hệ thống.' % rong), du_kien

        if 'de trong o tim kiem' in nb:
            m = ctx.ban_ghi(case) if ctx.cho_phep_ghi else None
            _, pt1 = _go((m or {}).get('ma') or 'zzqa')
            _, pt2 = _go('')
            du_kien = {'so_dong_khi_loc': pt1.get('so_dong'), 'so_dong_khi_trong': pt2.get('so_dong')}
            if (pt2.get('so_dong') or 0) >= (pt1.get('so_dong') or 0):
                return 'P', ('Xoá hết nội dung ô tìm kiếm: danh sách trở lại đầy đủ (%s dòng, '
                             'lúc lọc còn %s).' % (pt2.get('so_dong'), pt1.get('so_dong'))), du_kien
            return 'F', ('Xoá hết nội dung ô tìm kiếm nhưng danh sách không trở lại đầy đủ (%s '
                         'dòng).' % pt2.get('so_dong')), du_kien

        if 'tim bang tieng viet khong dau' in nb:
            m = ctx.ban_ghi(case, trang_thai=None) if ctx.cho_phep_ghi else None
            if not m:
                return None
            # bản ghi QA mang tên không dấu -> so hoa/thường (đúng phần cột D chốt được)
            _, pt1 = _go(m['ma'].lower())
            n1 = pt1.get('so_dong')
            _, pt2 = _go(m['ma'].upper())
            n2 = pt2.get('so_dong')
            du_kien = {'tu_thuong': m['ma'].lower(), 'so_dong_thuong': n1,
                       'tu_hoa': m['ma'].upper(), 'so_dong_hoa': n2}
            if n1 == n2 and n1:
                return 'P', ('Gõ hoa và gõ thường cùng cho %s dòng kết quả — tìm kiếm không phân '
                             'biệt hoa/thường.' % n1), du_kien
            return 'F', ('Gõ thường cho %s dòng, gõ HOA cho %s dòng — kết quả khác nhau.'
                         % (n1, n2)), du_kien

        if 'mot phan cua xau da ton tai' in nb:
            m = ctx.ban_ghi(case) if ctx.cho_phep_ghi else None
            if not m:
                return None
            phan = m['ma'][5:14]
            _, pt1 = _go(phan.lower())
            d1 = ui.doc_dong(ctx.c, m['ma'])
            _, pt2 = _go(phan.upper())
            d2 = ui.doc_dong(ctx.c, m['ma'])
            du_kien = {'phan': phan, 'thay_thuong': bool(d1), 'thay_hoa': bool(d2),
                       'so_dong_thuong': pt1.get('so_dong'), 'so_dong_hoa': pt2.get('so_dong')}
            if d1 and d2:
                return 'P', ('Nhập một phần của mã (%r) bằng chữ thường và chữ HOA đều trả về '
                             'bản ghi %s — tìm kiếm khớp CHỨA, không phân biệt hoa thường.'
                             % (phan, m['ma'])), du_kien
            return 'F', ('Nhập một phần %r: %s.'
                         % (phan, 'chữ thường không ra kết quả' if not d1
                            else 'chữ HOA không ra kết quả')), du_kien

        if 'la cac ky tu dac biet' in nb or 'nhap ky tu dac biet' in nb:
            ket = []
            for kt in ('%', '&', '_', '*', '\\', "'", '<b>1</b>'):
                x, pt = _go(kt)
                ket.append({'ky_tu': kt, 'o_giu': x.get('gia_tri'), 'so_dong': pt.get('so_dong'),
                            'loi': ui.doc_loi(ctx.c, 'man')[:1]})
            du_kien = {'ket_qua': ket}
            vo = [k for k in ket if k['loi']]
            if vo:
                return 'F', ('Ô tìm kiếm báo lỗi khi nhập ký tự đặc biệt %s: %s.'
                             % (vo[0]['ky_tu'], vo[0]['loi'])), du_kien
            return 'P', ('Nhập lần lượt 7 ký tự đặc biệt (%% & _ * \\ \' <b>1</b>) vào ô tìm '
                         'kiếm: không ký tự nào gây lỗi truy vấn, hệ thống trả kết quả bình '
                         'thường.'), du_kien

        if 'nhan so' in nb:
            x, pt = _go('123456')
            du_kien = {'o_giu': x.get('gia_tri'), 'so_dong': pt.get('so_dong')}
            if (x.get('gia_tri') or '') == '123456':
                return 'P', ('Ô tìm kiếm nhận chuỗi toàn chữ số bình thường (%r) và tìm theo '
                             'đúng từ khoá đã nhập.' % x.get('gia_tri')), du_kien
            return 'F', ('Nhập "123456" vào ô tìm kiếm nhưng ô đang giữ %r.'
                         % x.get('gia_tri')), du_kien

        if 'copy noi dung du lieu' in nb:
            m = ctx.ban_ghi(case) if ctx.cho_phep_ghi else None
            tu = (m or {}).get('ma') or 'zzqa'
            x, pt = _go(tu, dan=True)
            du_kien = {'dan': tu, 'o_giu': x.get('gia_tri'), 'chan_paste': x.get('chan_paste'),
                       'so_dong': pt.get('so_dong')}
            if x.get('chan_paste'):
                return 'F', 'Ô tìm kiếm CHẶN thao tác dán (paste).', du_kien
            if _n(x.get('gia_tri') or '') == _n(tu):
                return 'P', ('Dán từ khoá %r vào ô tìm kiếm: dán thành công và hệ thống tìm theo '
                             'đúng từ khoá (%s dòng).' % (tu, pt.get('so_dong'))), du_kien
            return 'F', ('Dán %r vào ô tìm kiếm nhưng ô đang giữ %r.'
                         % (tu, x.get('gia_tri'))), du_kien
        return None
    finally:
        ctx.ve_danh_sach()


# ── PHÂN TRANG: lật trang ────────────────────────────────────────────────────
@phep('lat_trang')
@nhan_dien(lambda cs: (_n(_nhom(cs)) == 'phan trang'
                       and _bat_ky(_n(cs.b), 'mo cac trang', 'icon trang tiep', 'icon trang truoc',
                                   'hien thi menu va header')))
def p_lat_trang(case, ctx):
    """Lật trang: nội dung đổi, STT nối tiếp, khung màn (menu/header) không đổi."""
    pt = ui.doc_phan_trang(ctx.c) or {}
    if not ui.nhieu_trang(pt):
        return None                      # chỉ một trang -> ca không dựng được
    t1 = ui.doc_bang(ctx.c)
    khung1 = ui._js(ctx.c, """
      return JSON.stringify({aside:TXT(document.querySelector('aside')||{}).slice(0,200),
        h1:TXT(document.querySelector('h1')||{}),
        header:TXT(document.querySelector('header')||{}).slice(0,120)});""")
    # Sang trang sau bằng CỤM PHÂN TRANG — xem ghi chú ở `ui.di_trang`. Không sang được là
    # một KẾT LUẬN (F) chứ không phải lý do bỏ đo: màn đang có nhiều trang mà không lật được
    # trang thì đó đúng là cái case này hỏi.
    di = ui.di_trang(ctx.c, 'sau')
    if not di.get('ok'):
        return 'F', ('Màn có %d trang nhưng KHÔNG mở được trang sau: %s.'
                     % (ui.so_trang(pt), di.get('ly_do') or 'không rõ')), {
            'phan_trang': pt, 'di_trang': di, 'khung_truoc': khung1, 'muc_bang_chung': 'UI'}
    t2 = ui.doc_bang(ctx.c)
    pt2 = ui.doc_phan_trang(ctx.c) or {}
    khung2 = ui._js(ctx.c, """
      return JSON.stringify({aside:TXT(document.querySelector('aside')||{}).slice(0,200),
        h1:TXT(document.querySelector('h1')||{}),
        header:TXT(document.querySelector('header')||{}).slice(0,120)});""")
    stt1 = [re.sub(r'[^\d]', '', r.get('stt') or '') for r in t1]
    stt2 = [re.sub(r'[^\d]', '', r.get('stt') or '') for r in t2]
    ctx.ve_danh_sach(lam_moi=True)
    du_kien = {'cach_sang_trang': di.get('cach'),
               'trang1_so_dong': len(t1), 'trang2_so_dong': len(t2),
               'stt_cuoi_trang1': stt1[-1] if stt1 else None,
               'stt_dau_trang2': stt2[0] if stt2 else None,
               'trang_hien_tai': pt2.get('trang_hien'), 'khung_truoc': khung1,
               'khung_sau': khung2}
    if 'hien thi menu va header' in _n(case.b):
        if khung1 == khung2:
            return 'P', ('Chuyển sang trang 2: menu, tiêu đề và header giữ nguyên, không thay '
                         'đổi.'), du_kien
        return 'F', ('Chuyển sang trang 2 thì khung màn đổi: %s → %s.'
                     % (khung1, khung2)), du_kien
    if not t2:
        return 'F', 'Bấm sang trang 2 nhưng bảng không có dòng nào.', du_kien
    if stt1 and stt2 and stt2[0].isdigit() and stt1[-1].isdigit() \
            and int(stt2[0]) == int(stt1[-1]) + 1:
        return 'P', ('Bấm sang trang 2: mở đúng trang, số thứ tự nối tiếp trang trước (%s → %s).'
                     % (stt1[-1], stt2[0])), du_kien
    return 'F', ('Bấm sang trang 2: số thứ tự KHÔNG nối tiếp — trang 1 kết thúc ở %s, trang 2 '
                 'bắt đầu từ %s.' % (stt1[-1] if stt1 else '?', stt2[0] if stt2 else '?')), du_kien


# ── ATTT: truy cập khi chưa đăng nhập ────────────────────────────────────────
@phep('truy_cap_chua_dang_nhap')
@nhan_dien(lambda cs: _co(_n(cs.b), 'truy cap man khi chua dang nhap'))
def p_chua_dang_nhap(case, ctx):
    """Xoá phiên ở trình duyệt rồi mở thẳng URL màn -> phải bị chặn + báo đúng nguyên văn.

    Sau khi đo, lượt chạy **đăng nhập lại** (người gọi lo) — nếu không thì mọi case sau chạy
    trong trạng thái mất phiên và kết luận nào cũng sai.
    """
    mong = ctx.vb('chua_dang_nhap')
    if not mong:
        return None
    ui.xoa_cookie_phien(ctx.c)
    ui.xoa_token_trong_trang(ctx.c)
    ctx.c.go(ctx.url)
    time.sleep(2.5)
    van = ui.doc_van_ban(ctx.c)
    url_sau = ui._js(ctx.c, "return JSON.stringify(location.pathname+location.search);") or ''
    co_bang = bool(ui.doc_bang(ctx.c))
    du_kien = {'cau_mong_doi': mong, 'url_sau': url_sau, 'con_thay_bang': co_bang,
               'co_cau_bao': _n(mong) in _n(van)}
    ctx.can_dang_nhap_lai = True
    ve_login = 'login' in url_sau.lower() or 'signin' in url_sau.lower()
    if co_bang and not ve_login:
        return 'F', ('Chưa đăng nhập mà mở thẳng %s vẫn vào được màn và thấy dữ liệu (không bị '
                     'chặn, không chuyển về trang đăng nhập).' % ctx.url), du_kien
    if _n(mong) in _n(van):
        return 'P', ('Chưa đăng nhập: bị chặn vào màn, chuyển về %s và báo đúng nguyên văn "%s".'
                     % (url_sau, mong)), du_kien
    if ve_login:
        return 'F', ('Chưa đăng nhập: có bị đưa về trang đăng nhập (%s) nhưng KHÔNG hiện thông '
                     'báo nguyên văn "%s".' % (url_sau, mong)), du_kien
    return 'F', ('Chưa đăng nhập: không vào được màn nhưng cũng không chuyển về trang đăng nhập '
                 '(đang ở %s) và không có thông báo nguyên văn.' % url_sau), du_kien


# ── GIAO DIỆN: căn lề + chính tả theo bản verbatim ───────────────────────────
@phep('can_le_chinh_ta_nut')
@nhan_dien(lambda cs: (_co(_n(cs.b), 'can le, chinh ta')
                       and _n(_nhom(cs)).startswith('button')))
def p_can_le_nut(case, ctx):
    """Nút: chữ căn giữa (đo `text-align`/`justify-content`) + đúng chính tả theo bản verbatim."""
    ten = qalib.field_of(case.nhom.get('sub2') or '')
    if not ten:
        return None
    pv = 'hop' if _pv(case) in ('them', 'sua') else 'man'
    dong_form = False
    try:
        if pv == 'hop':
            if not _mo_form_cua_case(ctx, case):
                return None
            dong_form = True
        kq = ui._js(ctx.c, """
          const b=NUT(%s,%s); if(!b) return 'null';
          const st=getComputedStyle(b);
          return JSON.stringify({chu:TXT(b), can:st.textAlign, canh:st.justifyContent,
            hien_thi:st.display});""" % (ui._s(ten), ui._s(pv)))
        if not kq:
            return None
        chu = (kq.get('chu') or '').strip()
        # ⚠️ VÁ 18/09 lượt 2 — chặn một F SAI. Nút chỉ-có-icon không có CHỮ nào: thứ `TXT()`
        # trả về là ký tự hình (`⏹`, `✎`, `🗑`) hoặc rỗng. Bản trước đem ký tự hình ấy đi đối
        # chiếu với bản verbatim, không khớp, rồi chốt *"Nút hiện chữ '⏹' — không khớp chuỗi
        # nào"* ⇒ **F cho một nút không hề sai chính tả**. Bộ kiểm `kiem_phep_moi` bắt được
        # đúng ca này (18/09). Không có chữ thì phép này KHÔNG kết luận — nhường cho
        # `hinh_hoc_nut`, phép đo được hình học icon và đọc chú thích để soi chính tả.
        if not qalib.co_chu(chu):
            return bo_qua(ctx, 'nút không có chữ nào để soi căn lề/chính tả — chỉ có ký tự '
                               'hình hoặc icon; nhường cho phép đo hình học icon',
                          nut=ten, txt_doc_duoc=chu, pham_vi=pv)
        giua = (kq.get('can') == 'center') or (kq.get('canh') in ('center', 'safe center'))
        kho = _moi_verbatim(ctx)
        khop = [x for x in kho if _n(x) == _n(chu)]
        du_kien = {'nut': ten, 'chu_tren_man': chu, 'can_le': kq.get('can'),
                   'justify': kq.get('canh'), 'khop_verbatim': bool(khop)}
        if not giua:
            return 'F', ('Chữ trên nút "%s" không căn giữa (text-align: %s, justify-content: %s).'
                         % (chu, kq.get('can'), kq.get('canh'))), du_kien
        if kho and not khop:
            return 'F', ('Nút hiện chữ %r — không khớp chuỗi nào trong bản verbatim của hồ sơ '
                         'màn (gần nhất: %s).'
                         % (chu, ' · '.join(x for x in kho if _n(ten) in _n(x))[:80])), du_kien
        return 'P', ('Nút "%s": chữ căn giữa và viết đúng nguyên văn bản khai của hồ sơ màn.'
                     % chu), du_kien
    finally:
        if dong_form and ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


def _moi_verbatim(ctx):
    """Mọi chuỗi verbatim của hồ sơ màn, phẳng — kho đối chiếu CHÍNH TẢ (nguồn BA/TKCT)."""
    ra = []

    def _di(x):
        if isinstance(x, str):
            ra.append(x)
        elif isinstance(x, list):
            for y in x:
                _di(y)
        elif isinstance(x, dict):
            for y in x.values():
                _di(y)
    _di(ctx.verbatim)
    return [x for x in ra if 2 < len(x) < 90]


@phep('icon_phu_hop')
@nhan_dien(lambda cs: (_n(_nhom(cs)) == 'icon'
                       and _bat_ky(_n(cs.b), 'bieu tuong thao tac phu hop',
                                   'noi dung va chinh ta cua chu thich')))
def p_icon_phu_hop(case, ctx):
    """Biểu tượng trên dòng phải đúng bằng danh sách thao tác mà hồ sơ màn khai."""
    khai = [str(x) for x in (ctx.vb('icon_ban_ghi') or [])]
    if not khai:
        return None
    that = ui._js(ctx.c, """
      const tr=document.querySelector('table tbody tr'); if(!tr) return 'null';
      return JSON.stringify([...tr.querySelectorAll('button,[role=button],a')].filter(HIEN)
        .map(b=>((b.getAttribute('title')||b.getAttribute('aria-label')||TXT(b))+'').trim())
        .filter(x=>x));""")
    if not that:
        return None
    tn, kn = [_n(x) for x in that], [_n(x) for x in khai]
    du_kien = {'khai': khai, 'that': that}
    thieu = [k for k, n in zip(khai, kn) if n not in tn]
    if not thieu:
        return 'P', ('Dòng bản ghi có đủ biểu tượng thao tác đúng tên: %s.'
                     % ' · '.join(that)), du_kien
    return 'F', ('Biểu tượng thao tác trên dòng LỆCH bản khai: thiếu %s (đọc được: %s).'
                 % (' · '.join(thieu), ' · '.join(that))), du_kien


@phep('doi_mau_khi_re_chuot')
@nhan_dien(lambda cs: (_n(_nhom(cs)) == 'icon'
                       and _bat_ky(_n(cs.b), 'bieu tuong doi mau khi re chuot',
                                   'doi mau va con tro khi re chuot')))
def p_doi_mau(case, ctx):
    """Biểu tượng đổi màu khi rê chuột — đo màu tính toán trước/sau khi đưa chuột vào."""
    vt = ui._js(ctx.c, """
      const tr=document.querySelector('table tbody tr'); if(!tr) return 'null';
      const b=[...tr.querySelectorAll('button,[role=button],a')].filter(HIEN)[0];
      if(!b) return 'null'; b.scrollIntoView({block:'center'});
      const r=b.getBoundingClientRect(); const st=getComputedStyle(b);
      return JSON.stringify({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2),
        mau:st.color, nen:st.backgroundColor, con_tro:st.cursor});""")
    if not vt:
        return None
    ctx.c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=vt['x'], y=vt['y'])
    time.sleep(0.9)
    sau = ui._js(ctx.c, """
      const tr=document.querySelector('table tbody tr');
      const b=[...tr.querySelectorAll('button,[role=button],a')].filter(HIEN)[0];
      const st=getComputedStyle(b);
      return JSON.stringify({mau:st.color, nen:st.backgroundColor, con_tro:st.cursor});""")
    ctx.c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=5, y=5)
    du_kien = {'truoc': {'mau': vt['mau'], 'nen': vt['nen']}, 'sau': sau,
               'con_tro': (sau or {}).get('con_tro')}
    if not sau:
        return None
    doi = (sau.get('mau') != vt['mau']) or (sau.get('nen') != vt['nen'])
    ct = sau.get('con_tro') == 'pointer'
    if doi and ct:
        return 'P', ('Rê chuột vào biểu tượng: màu đổi (%s → %s) và con trỏ chuyển sang dạng '
                     'bàn tay.' % (vt['mau'], sau.get('mau'))), du_kien
    if not doi:
        return 'F', ('Rê chuột vào biểu tượng: màu chữ và màu nền KHÔNG đổi (%s / %s).'
                     % (sau.get('mau'), sau.get('nen'))), du_kien
    return 'F', ('Biểu tượng đổi màu khi rê chuột nhưng con trỏ vẫn là %s, không phải dạng bàn '
                 'tay.' % sau.get('con_tro')), du_kien


@phep('dieu_huong_thao_tac', can_ghi=True)
@nhan_dien(lambda cs: _co(_n(cs.b), 'dieu huong dung trang'))
def p_dieu_huong(case, ctx):
    """Bấm thao tác ở cột hành động -> mở đúng chức năng tương ứng (tại chỗ bằng hộp thoại)."""
    m = ctx.ban_ghi(case)
    if not ctx.hien_ban_ghi_qa(m['ma']):
        raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
    ra = []
    for icon, khoa in ((_icon_sua(ctx), 'form_sua'), (_icon_xoa(ctx), 'xoa_don_le')):
        r = ui.mo_hop_theo_dong(ctx.c, m['ma'], icon)
        hop = ui.doc_hop_thoai(ctx.c) or {}
        ra.append({'icon': icon, 'tieu_de': hop.get('tieu_de'),
                   'khai': (ctx.vb(khoa, 'tieu_de') or '')})
        ui.dong_hop(ctx.c)
        time.sleep(0.4)
    ctx.ve_danh_sach()
    du_kien = {'thao_tac': ra, 'ban_ghi': m['ma']}
    hong = [x for x in ra if not x['tieu_de']]
    if hong:
        return 'F', ('Bấm thao tác "%s" trên bản ghi: không mở ra chức năng nào.'
                     % hong[0]['icon']), du_kien
    lech = [x for x in ra if x['khai']
            and _n(re.sub(r'\{[^}]*\}', '', x['khai']).strip(' :')) not in _n(x['tieu_de'])]
    if lech:
        return 'F', ('Bấm "%s" mở ra hộp thoại tiêu đề %r, hồ sơ màn khai "%s".'
                     % (lech[0]['icon'], lech[0]['tieu_de'], lech[0]['khai'])), du_kien
    return 'P', ('Bấm từng thao tác ở cột hành động: mở đúng chức năng tương ứng — %s.'
                 % ' · '.join('%s → "%s"' % (x['icon'], x['tieu_de']) for x in ra)), du_kien


@phep('do_rong_cot')
@nhan_dien(lambda cs: _bat_ky(_n(cs.b), 'do rong cac cot', 'hien thi du lieu dai',
                              'du lieu <x> hien thi dung cot', 'hien thi dung cot'))
def p_do_rong_cot(case, ctx):
    """Độ rộng cột / dữ liệu dài: đo tràn thật của ô so với cột chứa nó."""
    kq = ui._js(ctx.c, """
      const th=[...document.querySelectorAll('table thead th')];
      const tr=[...document.querySelectorAll('table tbody tr')].slice(0,30);
      const tran=[]; let max=0;
      tr.forEach(r=>[...r.querySelectorAll('td')].forEach((td,j)=>{
        const w=td.getBoundingClientRect().width;
        if(td.scrollWidth>Math.ceil(w)+2) tran.push((th[j]?TXT(th[j]):('cột '+j))+': '
           +TXT(td).slice(0,24));
        max=Math.max(max, TXT(td).length);}));
      const tb=document.querySelector('table');
      const box=tb?tb.parentElement:null;
      return JSON.stringify({so_o_tran:tran.length, vi_du:tran.slice(0,5), do_dai_max:max,
        bang_rong:tb?Math.round(tb.getBoundingClientRect().width):0,
        khung_rong:box?Math.round(box.getBoundingClientRect().width):0});""")
    if not kq:
        return None
    du_kien = dict(kq)
    if kq.get('so_o_tran'):
        return 'F', ('%d ô trong bảng bị tràn khỏi cột chứa nó (ví dụ: %s) — độ rộng cột không '
                     'phù hợp với dữ liệu.'
                     % (kq['so_o_tran'], ' · '.join(kq.get('vi_du') or [])[:120])), du_kien
    return 'P', ('Soi %s ô của bảng: không ô nào tràn khỏi cột chứa nó (chuỗi dài nhất %s ký '
                 'tự) — độ rộng cột phù hợp với dữ liệu.'
                 % ('toàn bộ', kq.get('do_dai_max'))), du_kien


@phep('du_lieu_dung_cot')
@nhan_dien(lambda cs: _co(_n(cs.b), 'hien thi dung cot'))
def p_du_lieu_dung_cot(case, ctx):
    """Dữ liệu nằm đúng cột: mỗi cột có kiểu dữ liệu nhất quán trên mọi dòng."""
    bang = ui.doc_bang(ctx.c)
    cot = ui.cot_bang(ctx.c)
    if not bang or not cot:
        return None
    lech = []
    for k in (bang[0].get('o') or {}):
        gt = [(r['o'].get(k) or '').strip() for r in bang if (r['o'].get(k) or '').strip()]
        if not gt:
            continue
        if _bat_ky(_n(k), 'ngay'):
            xau = [v for v in gt if not re.match(r'^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', v)
                   and v not in ('—', '-')]
            if xau:
                lech.append('%s: %s' % (k, xau[0][:24]))
        if _n(k) in ('stt',):
            xau = [v for v in gt if not v.isdigit()]
            if xau:
                lech.append('%s: %s' % (k, xau[0][:24]))
    du_kien = {'cot': cot, 'so_dong': len(bang), 'lech': lech[:5]}
    if lech:
        return 'F', ('Dữ liệu không đúng cột: %s.' % ' · '.join(lech[:3])), du_kien
    return 'P', ('Soi %d dòng × %d cột: dữ liệu nằm đúng cột, kiểu dữ liệu từng cột nhất quán '
                 '(%s).' % (len(bang), len(cot), ' · '.join(cot))), du_kien


@phep('o_chon_sap_xep')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _co(_n(cs.b), 'sap xep cac gia tri')))
def p_o_chon_sap_xep(case, ctx):
    """Thứ tự các giá trị trong ô chọn.

    Cột D của case này ở bộ `LoaiNguon` kết thúc bằng *"được sắp xếp theo:"* — **không nêu tiêu
    chí**. Không có tiêu chí thì không có gì để so: phép đọc thứ tự thật, ghi vào dữ kiện, rồi
    trả `None` để case về CHƯA ĐO kèm đúng lý do — tự chọn một tiêu chí (A→Z? theo nghiệp vụ?)
    là tự viết kỳ vọng thay BA, đúng thứ §12 của chỉ thị cấm.
    """
    ten, pv = _o_chon_cua_case(ctx, case)
    if not ten:
        return None
    tieu_chi = re.sub(r'^.*sắp xếp theo\s*:?\s*', '', case.d or '', flags=re.I | re.S).strip()
    if len(tieu_chi) < 3:
        return None
    dong_form = False
    try:
        if pv == 'hop':
            if not _mo_form_cua_case(ctx, case):
                return None
            dong_form = True
        op = _mo_o_chon(ctx, case, ten, pv)
        if not op or not op.get('option'):
            return None
        ds = [x['chu'] for x in op['option'] if (x.get('chu') or '').strip()
              and not qalib.la_o_trong(x['chu'], '')]
        _dong_o_chon(ctx)
        du_kien = {'o': ten, 'thu_tu_that': ds, 'tieu_chi_cot_D': tieu_chi[:120]}
        # ── Ba tiêu chí, ĐỀU đọc nguyên văn cột D. Bản trước chỉ nhận tiêu chí "A→Z" nên 5
        #    case của `ViTriLuuTru` về CHƯA ĐO trong khi cột D của chúng nói rất rõ phải so
        #    cái gì — chỉ là nói bằng hai khuôn khác.
        # ① cột D LIỆT KÊ thẳng các giá trị theo thứ tự -> so đúng danh sách ấy
        mong = [x.strip() for x in re.findall(r'"([^"]{1,60})"', tieu_chi) if x.strip()]
        if len(mong) >= 2:
            du_kien['thu_tu_cot_D'] = mong
            chung = [x for x in ds if any(_n(x) == _n(y) for y in mong)]
            if [_n(x) for x in chung] == [_n(y) for y in mong]:
                return 'P', ('Ô chọn "%s" liệt kê đúng thứ tự cột D nêu: %s.'
                             % (ten, ' · '.join(mong))), du_kien
            return 'F', ('Ô chọn "%s" đang liệt kê %s, cột D đòi thứ tự %s.'
                         % (ten, ' · '.join(ds), ' · '.join(mong))), du_kien
        # ② cột D đòi thứ tự KHÔNG ĐỔI giữa các lần mở -> mở lại và so
        if _bat_ky(_n(tieu_chi), 'giu nguyen giua cac lan mo', 'khong xao tron',
                   'giu nguyen giua nhung lan mo'):
            lan = [ds]
            for _ in range(2):
                op2 = _mo_o_chon(ctx, case, ten, pv)
                lan.append([x['chu'] for x in ((op2 or {}).get('option') or [])
                            if (x.get('chu') or '').strip()
                            and not qalib.la_o_trong(x['chu'], '')])
                _dong_o_chon(ctx)
            du_kien['thu_tu_tung_lan'] = lan
            if all(x == lan[0] for x in lan) and lan[0]:
                return 'P', ('Mở ô chọn "%s" %d lần: thứ tự giữ nguyên, không xáo trộn (%s).'
                             % (ten, len(lan), ' · '.join(lan[0]))), du_kien
            return 'F', ('Mở ô chọn "%s" %d lần thì thứ tự KHÁC nhau giữa các lần: %s.'
                         % (ten, len(lan), ' || '.join(' · '.join(x) for x in lan))), du_kien
        # ③ cột D đòi A→Z
        if not _bat_ky(_n(tieu_chi), 'a-z', 'a - z', 'alphabet', 'chu cai', 'tang dan'):
            return None
        if ds == sorted(ds, key=qalib.norm):
            return 'P', ('Giá trị trong ô chọn "%s" xếp theo thứ tự chữ cái tăng dần: %s.'
                         % (ten, ' · '.join(ds))), du_kien
        return 'F', ('Giá trị trong ô chọn "%s" KHÔNG xếp theo thứ tự chữ cái: %s.'
                     % (ten, ' · '.join(ds))), du_kien
    finally:
        if dong_form and ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


@phep('trang_thai_hien_thi_cot')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _co(_n(cs.b), 'hien thi trang thai khi')))
def p_trang_thai_cot(case, ctx):
    """Nhãn trạng thái trên bảng phải nằm trong bộ nhãn mà hồ sơ màn khai (badge_trang_thai)."""
    khai = [re.sub(r'\s*\([^)]*\)\s*$', '', str(x)).strip()
            for x in (ctx.vb('badge_trang_thai') or [])]
    if not khai:
        return None
    bang = ui.doc_bang(ctx.c)
    if not bang:
        return None
    cot = None
    for k in (bang[0].get('o') or {}):
        if _bat_ky(_n(k), 'trang thai', 'status'):
            cot = k
    if not cot:
        return None
    gt = sorted({(r['o'].get(cot) or '').strip() for r in bang if (r['o'].get(cot) or '').strip()})
    la = [x for x in gt if not any(_n(x) == _n(k) for k in khai)]
    du_kien = {'cot': cot, 'gia_tri_tren_man': gt, 'nhan_khai': khai}
    if la:
        return 'F', ('Cột "%s" hiện nhãn KHÔNG có trong bản khai: %s (bản khai: %s).'
                     % (cot, ' · '.join(la), ' · '.join(khai))), du_kien
    return 'P', ('Cột "%s" chỉ hiện các nhãn đúng bản khai: %s.'
                 % (cot, ' · '.join(gt))), du_kien


@phep('hieu_ung_loading')
@nhan_dien(lambda cs: _co(_n(cs.b), 'hieu ung loading khi bam'))
def p_loading(case, ctx):
    """Trong lúc chờ máy chủ: nút bị vô hiệu hoá; xong thì bấm lại được + có thông báo."""
    nut = ctx.vb('tooltip_lam_moi') or 'Làm mới dữ liệu'
    if not ui.co_nut(ctx.c, nut, 'man'):
        return None
    ui.bam(ctx.c, nut, 'man', cho=0.0)
    trang_thai = []
    t0 = time.time()
    while time.time() - t0 < 4:
        x = ui.co_nut(ctx.c, nut, 'man')
        if x:
            trang_thai.append(bool(x.get('vo_hieu')))
        if len(trang_thai) > 2 and not trang_thai[-1] and any(trang_thai):
            break
        time.sleep(0.12)
    time.sleep(1.2)
    cuoi = ui.co_nut(ctx.c, nut, 'man') or {}
    tb = ui.doc_thong_bao(ctx.c)
    du_kien = {'nut': nut, 'da_vo_hieu_trong_luc_cho': any(trang_thai),
               'so_lan_do': len(trang_thai), 'vo_hieu_cuoi': cuoi.get('vo_hieu'),
               'thong_bao': tb[:2]}
    if not any(trang_thai):
        return 'F', ('Bấm "%s": nút KHÔNG bị vô hiệu hoá trong lúc chờ phản hồi (đo %d lần, '
                     'cách nhau 120 ms) ⇒ bấm liên tục được.' % (nut, len(trang_thai))), du_kien
    if cuoi.get('vo_hieu'):
        return 'F', ('Bấm "%s": nút bị vô hiệu hoá lúc chờ nhưng sau khi xong VẪN không bấm lại '
                     'được.' % nut), du_kien
    return 'P', ('Bấm "%s": nút bị vô hiệu hoá trong lúc chờ phản hồi rồi bấm lại được khi '
                 'xong%s.' % (nut, (', thông báo "%s"' % tb[0]) if tb else '')), du_kien


@phep('giao_dien_tong_the')
@nhan_dien(lambda cs: _co(_n(cs.b), 'tong the giao dien man hinh'))
def p_giao_dien_tong_the(case, ctx):
    """Tổng thể giao diện — đo ba thứ máy đo được của cột D, và nói rõ đo được tới đâu.

    Cột D có ba nhóm: bố cục · font chữ · chính tả. Máy đo được: (a) trường bắt buộc có dấu
    `*`, (b) số họ font dùng trên màn, (c) chính tả nhãn — đối chiếu với bản verbatim của hồ
    sơ màn (nguồn BA/TKCT). Thứ KHÔNG đo được (màu có giống prototype không) được nêu thẳng
    trong ghi chú thay vì lặng lẽ tính là đạt.
    """
    pv = 'hop' if _pv(case) in ('them', 'sua') else 'man'
    dong_form = False
    try:
        if pv == 'hop':
            if not _mo_form_cua_case(ctx, case):
                return None
            dong_form = True
        kq = ui._js(ctx.c, """
          const g=PV(%s);
          const font=new Set(); const co=new Set();
          [...g.querySelectorAll('label,th,button,p,span,h1,h2,h3')].filter(HIEN).slice(0,400)
            .forEach(e=>{const st=getComputedStyle(e);
              font.add((st.fontFamily||'').split(',')[0].trim().replace(/["']/g,''));
              co.add(st.fontSize);});
          const bb=[...g.querySelectorAll('input,select,textarea')].filter(HIEN)
            .filter(e=>e.required).map(e=>({nhan:NHAN(e), sao:/\\*/.test(NHAN(e))}));
          const nhan=[...g.querySelectorAll('label,th,button')].filter(HIEN)
            .map(TXT).filter(x=>x&&x.length<70);
          return JSON.stringify({font:[...font].filter(x=>x), co_chu:[...co].length,
            bat_buoc:bb, nhan:nhan.slice(0,60),
            tran:(()=>{const de=document.documentElement;
              return de.scrollWidth>de.clientWidth+2;})()});""" % ui._s(pv))
        if not kq:
            return None
        kho = _moi_verbatim(ctx)
        la = []
        if kho:
            for x in (kq.get('nhan') or []):
                if len(x) < 3:
                    continue
                if not any(_n(x) == _n(k) or _n(x) in _n(k) or _n(k) in _n(x) for k in kho):
                    la.append(x)
        thieu_sao = [b['nhan'] for b in (kq.get('bat_buoc') or []) if not b['sao']]
        du_kien = {'ho_font': kq.get('font'), 'so_co_chu': kq.get('co_chu'),
                   'truong_bat_buoc': kq.get('bat_buoc'), 'thieu_dau_sao': thieu_sao,
                   'nhan_khong_co_trong_verbatim': la[:8], 'tran_ngang': kq.get('tran')}
        loi = []
        if thieu_sao:
            loi.append('trường bắt buộc KHÔNG có dấu (*): %s' % ' · '.join(thieu_sao))
        if len(kq.get('font') or []) > 2:
            loi.append('màn dùng %d họ font khác nhau (%s)'
                       % (len(kq['font']), ' · '.join(kq['font'][:4])))
        if kq.get('tran'):
            loi.append('trang bị tràn ngang ở mức phóng 100 %')
        if la:
            loi.append('%d nhãn không khớp bản verbatim của hồ sơ màn (%s)'
                       % (len(la), ' · '.join(la[:3])))
        chua_do = 'màu chữ so với prototype (không có bản prototype để đối chiếu bằng máy)'
        if loi:
            return 'F', ('Tổng thể giao diện: %s.\nPhần chưa đo được bằng máy: %s.'
                         % (' ; '.join(loi), chua_do)), du_kien
        return 'P', ('Tổng thể giao diện đạt ở các điểm đo được: %d trường bắt buộc đều có dấu '
                     '(*), màn dùng %d họ font, nhãn khớp bản verbatim của hồ sơ màn, không '
                     'tràn ngang.\nPhần chưa đo được bằng máy: %s.'
                     % (len(kq.get('bat_buoc') or []), len(kq.get('font') or []),
                        chua_do)), du_kien
    finally:
        if dong_form and ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


@phep('vi_tri_trang_sau_thao_tac', can_ghi=True)
@nhan_dien(lambda cs: _co(_n(cs.b), 'vi tri trang sau khi thuc hien'))
def p_vi_tri_trang(case, ctx):
    """Sau một thao tác (thêm/sửa/xoá) người dùng phải ở lại ĐÚNG trang đang xem.

    Chỉ chạy được khi danh sách có nhiều hơn một trang — ít hơn thì ca không tồn tại và phép
    trả `None` thay vì chấm bừa trên một trang duy nhất.
    """
    pt = ui.doc_phan_trang(ctx.c) or {}
    if not ui.nhieu_trang(pt):
        return None
    # Đi sang trang 2 bằng CỤM PHÂN TRANG. Bản trước tìm "nút có chữ đúng bằng '2'" — màn
    # thật không vẽ nút số trang nào, nên nó luôn trả '0' và phép bỏ cuộc trên một màn đang
    # có 4 trang thật.
    di = ui.di_trang(ctx.c, 'sau')
    if not di.get('ok'):
        return 'F', ('Màn có %d trang nhưng KHÔNG sang được trang sau: %s.'
                     % (ui.so_trang(pt), di.get('ly_do') or 'không rõ')), {
            'phan_trang': pt, 'di_trang': di, 'muc_bang_chung': 'UI'}
    truoc = (ui.doc_phan_trang(ctx.c) or {}).get('trang_hien')
    m = ctx.tao_ban_ghi(case)
    ctx.ve_danh_sach()
    sau = (ui.doc_phan_trang(ctx.c) or {}).get('trang_hien')
    du_kien = {'trang_truoc_thao_tac': truoc, 'trang_sau_thao_tac': sau, 'ban_ghi': m['ma'],
               'cach_sang_trang': di.get('cach')}
    if str(truoc) == str(sau):
        return 'P', ('Đang ở trang %s, thực hiện thêm mới xong vẫn ở đúng trang %s.'
                     % (truoc, sau)), du_kien
    return 'F', ('Đang ở trang %s nhưng sau khi thêm mới, màn nhảy về trang %s.'
                 % (truoc, sau)), du_kien


# ══════════════════════════════════════════════════════════════════════════════
# ĐỢT 3 — thẻ số liệu · ô tích chọn · số bản ghi so với tổng · tìm kiếm kết hợp · quyền
# ══════════════════════════════════════════════════════════════════════════════
@phep('the_so_lieu_dinh_dang')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith('the so lieu')
                       and _co(_n(cs.b), 'khi gia tri lon hoac qua dai')))
def p_the_dinh_dang(case, ctx):
    """Thẻ số liệu: số lớn có phân cách nghìn, nhãn dài không tràn khỏi thẻ."""
    kq = ui._js(ctx.c, """
      const ds=[...document.querySelectorAll('div,section,article')].filter(HIEN).filter(e=>{
        const r=e.getBoundingClientRect();
        return r.width>90&&r.width<420&&r.height>70&&r.height<260
           &&e.querySelectorAll('div,section,article').length<6
           &&/\\d/.test(TXT(e));});
      return JSON.stringify(ds.slice(0,8).map(e=>{const r=e.getBoundingClientRect();
        const tran=[...e.querySelectorAll('*')].some(x=>x.scrollWidth>Math.ceil(
          x.getBoundingClientRect().width)+2);
        return {txt:TXT(e).slice(0,60), rong:Math.round(r.width), tran:tran};}));""")
    if not kq:
        return None
    so = []
    for t in kq:
        so += re.findall(r'\d[\d.,]*', t.get('txt') or '')
    lon = [x for x in so if len(re.sub(r'[^\d]', '', x)) >= 4]
    thieu_phan_cach = [x for x in lon if not re.search(r'[.,]', x)]
    tran = [t for t in kq if t.get('tran')]
    du_kien = {'the': kq, 'so_lon': lon, 'thieu_phan_cach': thieu_phan_cach,
               'the_bi_tran': [t['txt'][:40] for t in tran]}
    if tran:
        return 'F', ('Nội dung thẻ số liệu bị tràn khỏi thẻ: %s.'
                     % ' · '.join(t['txt'][:40] for t in tran[:2])), du_kien
    if thieu_phan_cach:
        return 'F', ('Thẻ số liệu hiện số ≥ 4 chữ số mà KHÔNG có phân cách nghìn: %s.'
                     % ' · '.join(thieu_phan_cach[:3])), du_kien
    if not lon:
        return 'P', ('Các thẻ số liệu hiện số nhỏ hơn 1.000 (%s) nên chưa phát sinh phân cách '
                     'nghìn; nhãn không tràn khỏi thẻ.' % ' · '.join(so[:4])), du_kien
    return 'P', ('Thẻ số liệu: số lớn có phân cách nghìn (%s) và nhãn không tràn khỏi thẻ.'
                 % ' · '.join(lon[:3])), du_kien


@phep('the_so_lieu_rong')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith('the so lieu')
                       and _co(_n(cs.b), 'khi khong co du lieu')))
def p_the_rong(case, ctx):
    """Thẻ số liệu khi không có dữ liệu — cột D đòi bảng hiện đúng câu rỗng verbatim."""
    return p_trang_thai_rong(case, ctx)


@phep('tich_chon_bo_tat_ca')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('checkbox', 'o tich chon'))
                       and _co(_n(cs.b), 'bo tich o tich chon tat ca')))
def p_bo_tich_tat_ca(case, ctx):
    """Tích ô tiêu đề rồi bỏ tích: mọi dòng phải trở lại trạng thái không tích."""
    for _ in range(2):
        ui._js(ctx.c, """
          const cb=document.querySelector('table thead input[type=checkbox],'+
             'table thead [role=checkbox]'); if(cb) cb.click(); return '1';""")
        time.sleep(0.5)
    sau = ui._js(ctx.c, """
      const ds=[...document.querySelectorAll('table tbody tr input[type=checkbox],'+
         'table tbody tr [role=checkbox]')];
      if(!ds.length) return 'null';
      return JSON.stringify({tong:ds.length, tich:ds.filter(cb=>cb.type==='checkbox'?cb.checked
         :(cb.getAttribute('aria-checked')==='true')).length});""")
    if not sau:
        return None
    if sau.get('tich') == 0:
        return 'P', ('Tích ô tiêu đề rồi bỏ tích: cả %d dòng trở lại trạng thái không tích.'
                     % sau.get('tong')), sau
    return 'F', ('Bỏ tích ô tiêu đề nhưng còn %s/%s dòng vẫn được tích.'
                 % (sau.get('tich'), sau.get('tong'))), sau


@phep('tich_chon_qua_trang')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('checkbox', 'o tich chon'))
                       and _co(_n(cs.b), 'khi chuyen sang trang khac')))
def p_tich_qua_trang(case, ctx):
    """Tích ở trang 1 → sang trang 2 → quay lại: lựa chọn còn được giữ hay không."""
    pt = ui.doc_phan_trang(ctx.c) or {}
    if not ui.nhieu_trang(pt):
        return None
    bang = ui.doc_bang(ctx.c)
    if not bang:
        return None
    ma = next((v for v in (bang[0].get('o') or {}).values() if (v or '').strip()), None)
    if not ma:
        return None
    ui.tich_dong(ctx.c, ma, bo=False)
    time.sleep(0.4)
    for so in ('2', '1'):
        ui._js(ctx.c, """
          const nut=[...document.querySelectorAll('button,[role=button]')].filter(HIEN);
          const t=nut.find(b=>TXT(b)===%s); if(t&&!t.disabled) t.click(); return '1';""" % ui._s(so))
        time.sleep(1.4)
    con = ui._js(ctx.c, """
      const ma=QN(%s);
      const tr=[...document.querySelectorAll('table tbody tr')].find(r=>
        [...r.querySelectorAll('td')].some(td=>QN(TXT(td))===ma));
      if(!tr) return 'null';
      const cb=tr.querySelector('input[type=checkbox],[role=checkbox]');
      if(!cb) return 'null';
      return JSON.stringify({tich: cb.type==='checkbox'?cb.checked
        :(cb.getAttribute('aria-checked')==='true')});""" % ui._s(ma))
    ui.tich_dong(ctx.c, ma, bo=True)
    if con is None:
        return None
    du_kien = {'dong': ma, 'con_tich_sau_khi_quay_lai': con.get('tich')}
    if con.get('tich'):
        return 'P', ('Tích bản ghi ở trang 1, sang trang 2 rồi quay lại: ô tích chọn vẫn được '
                     'giữ.'), du_kien
    return 'F', ('Tích bản ghi ở trang 1, sang trang 2 rồi quay lại: ô tích chọn đã MẤT.'), du_kien


@phep('o_so_ban_ghi_so_voi_tong')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith('textbox so ban ghi')
                       and _bat_ky(_n(cs.b), 'nho hon tong so ban ghi', 'lon hon tong so ban ghi',
                                   'bang dung tong so ban ghi', 'nhap gia tri trung mot muc',
                                   'nhap gia tri khong trung muc nao')))
def p_so_ban_ghi_vs_tong(case, ctx):
    """Nhập số bản ghi/trang nhỏ hơn / lớn hơn / bằng tổng — bảng và cụm phân trang phải theo."""
    nb = _n(case.b)
    o = 'Số bản ghi/trang'
    x0 = ui.o_muc_trang(ctx.c)
    if not x0:
        return None
    cu = (x0.get('gia_tri') or '').strip()
    tong = _tong_ban_ghi(ctx)
    if tong is None:
        return None
    muc = [int(v) for v in (ctx.hs_so('page_size_chon_nhanh') or []) if str(v).isdigit()]
    if 'nho hon tong' in nb:
        gt = max(1, tong - 1)
    elif 'lon hon tong' in nb:
        gt = tong + 5
    elif 'bang dung tong' in nb:
        gt = tong
    elif 'nhap gia tri trung mot muc' in nb:
        gt = muc[0] if muc else 20
    else:
        gt = 37
        while gt in muc:
            gt += 1
    ui.dat_muc_trang(ctx.c, gt, cho=1.6)
    pt = ui.doc_phan_trang(ctx.c) or {}
    x1 = ui.o_muc_trang(ctx.c) or {}
    du_kien = {'tong': tong, 'nhap': gt, 'so_dong': pt.get('so_dong'),
               'so_nut_trang': pt.get('so_nut_trang'), 'o_sau': x1.get('gia_tri')}
    ui.dat_muc_trang(ctx.c, cu or str(ctx.hs_so('page_size_mac_dinh', 20)), cho=1.0)
    nhieu_trang = ui.nhieu_trang(pt)
    if re.sub(r'[^\d]', '', x1.get('gia_tri') or '') != str(gt):
        return 'F', ('Nhập %d vào ô "%s" nhưng ô đang giữ %r.'
                     % (gt, o, x1.get('gia_tri'))), du_kien
    if 'nho hon tong' in nb:
        if pt.get('so_dong') == gt and nhieu_trang:
            return 'P', ('Nhập %d (< tổng %d): bảng hiện đúng %d dòng và có cụm phân trang.'
                         % (gt, tong, gt)), du_kien
        return 'F', ('Nhập %d (< tổng %d): bảng hiện %s dòng, %s cụm phân trang.'
                     % (gt, tong, pt.get('so_dong'), 'có' if nhieu_trang else 'KHÔNG có')), du_kien
    if 'lon hon tong' in nb or 'bang dung tong' in nb:
        if pt.get('so_dong') == tong and not nhieu_trang:
            return 'P', ('Nhập %d (%s tổng %d): bảng hiện toàn bộ %d bản ghi và không hiện phân '
                         'trang.' % (gt, '≥' if gt >= tong else '=', tong, tong)), du_kien
        return 'F', ('Nhập %d (%s tổng %d): bảng hiện %s dòng, %s cụm phân trang.'
                     % (gt, '≥' if gt >= tong else '=', tong, pt.get('so_dong'),
                        'vẫn hiện' if nhieu_trang else 'không hiện')), du_kien
    mong = min(gt, tong)
    if pt.get('so_dong') == mong:
        return 'P', ('Nhập %d vào ô "%s": danh sách hiển thị đúng %s bản ghi mỗi trang.'
                     % (gt, o, pt.get('so_dong'))), du_kien
    return 'F', ('Nhập %d vào ô "%s": bảng hiện %s dòng, chờ %s.'
                 % (gt, o, pt.get('so_dong'), mong)), du_kien


@phep('tooltip_kich_thuoc')
@nhan_dien(lambda cs: (_n(_nhom(cs)) == 'icon'
                       and _bat_ky(_n(cs.b), 'chieu rong va chieu cao cua chu thich',
                                   'can le van ban tren chu thich')))
def p_tooltip_kich_thuoc(case, ctx):
    """Khung chú thích: bề rộng ôm theo độ dài chữ, văn bản căn lề trái."""
    tt = ui.tooltip_cua(ctx.c, JS_ICON_DONG_DAU)
    ui.thoi_re_chuot(ctx.c)
    if not tt:
        return None
    du_kien = dict(tt)
    if tt.get('loai') == 'native':
        # Chú thích GỐC của trình duyệt: có thật, đọc được chữ, nhưng khung do trình duyệt vẽ
        # nên KHÔNG có phần tử nào để đo. Nói đúng điều đó thay vì chấm F cho một khung không
        # tồn tại — và cũng không chấm P cho một thứ chưa đo.
        return 'PE', ('Biểu tượng dùng CHÚ THÍCH GỐC của trình duyệt (thuộc tính title = %r): '
                      'khung chú thích do trình duyệt vẽ ngoài trang nên kích thước và căn lề '
                      'KHÔNG đo được bằng DOM. Cần kiểm bằng mắt hoặc chuyển sang chú thích '
                      'dựng bằng HTML.' % (tt.get('txt') or '')[:60]), du_kien
    if tt.get('loai') != 'dom':
        return 'F', ('Rê chuột vào biểu tượng thao tác: KHÔNG có khung chú thích nào hiện ra '
                     '(cũng không có thuộc tính title) nên không có gì để đo kích thước.'), du_kien
    nb = _n(case.b)
    if 'can le van ban' in nb:
        if tt.get('can') in ('left', 'start'):
            return 'P', ('Văn bản trong khung chú thích căn lề trái (text-align: %s).'
                         % tt.get('can')), du_kien
        return 'F', ('Văn bản trong khung chú thích căn %s, không phải căn lề trái.'
                     % tt.get('can')), du_kien
    n_ky_tu = len(tt.get('txt') or '')
    co = float(re.sub(r'[^\d.]', '', tt.get('co_chu') or '14') or 14)
    uoc = n_ky_tu * co * 0.62
    du_kien['uoc_rong_theo_chu'] = round(uoc)
    if tt['rong'] <= max(uoc + 60, 120) and tt['cao'] <= co * 4:
        return 'P', ('Khung chú thích rộng %spx × cao %spx, ôm theo độ dài văn bản (%d ký tự).'
                     % (tt['rong'], tt['cao'], n_ky_tu)), du_kien
    return 'F', ('Khung chú thích rộng %spx cho %d ký tự — không ôm theo độ dài văn bản.'
                 % (tt['rong'], n_ky_tu)), du_kien


@phep('can_le_bang')
@nhan_dien(lambda cs: (_co(_n(cs.b), 'gia tri mac dinh cua') and 'danh sach' in _n(_nhom(cs))))
def p_can_le_bang(case, ctx):
    """Căn lề trong bảng: chữ trái · số phải · ngày giữa, và dòng đổi nền khi rê chuột."""
    kq = ui._js(ctx.c, """
      const th=[...document.querySelectorAll('table thead th')].map(TXT);
      const tr=document.querySelector('table tbody tr'); if(!tr) return 'null';
      const td=[...tr.querySelectorAll('td')];
      const ra=td.map((x,j)=>({cot:th[j]||('c'+j), can:getComputedStyle(x).textAlign,
        gt:TXT(x).slice(0,20)}));
      const r=tr.getBoundingClientRect();
      return JSON.stringify({o:ra, x:Math.round(r.left+40), y:Math.round(r.top+r.height/2),
        nen:getComputedStyle(tr).backgroundColor});""")
    if not kq:
        return None
    ctx.c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=kq['x'], y=kq['y'])
    time.sleep(0.8)
    nen2 = ui._js(ctx.c, """
      const tr=document.querySelector('table tbody tr');
      return JSON.stringify(getComputedStyle(tr).backgroundColor);""")
    ctx.c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=5, y=5)
    lech = []
    for o in kq['o']:
        cot, can, gt = _n(o['cot']), o['can'], (o['gt'] or '').strip()
        if not gt:
            continue
        if cot == 'stt' or re.match(r'^[\d.,]+$', gt):
            if can not in ('right', 'center', 'end'):
                lech.append('%s (số) căn %s' % (o['cot'], can))
        elif _bat_ky(cot, 'ngay'):
            if can not in ('center', 'right', 'end'):
                lech.append('%s (ngày) căn %s' % (o['cot'], can))
    du_kien = {'o': kq['o'], 'nen_truoc': kq.get('nen'), 'nen_khi_re_chuot': nen2,
               'lech': lech}
    if lech:
        return 'F', ('Căn lề trong bảng chưa đúng quy ước: %s.' % ' · '.join(lech[:3])), du_kien
    if nen2 == kq.get('nen'):
        return 'F', ('Căn lề trong bảng đúng quy ước nhưng rê chuột vào bản ghi thì màu nền '
                     'KHÔNG đổi (%s).' % nen2), du_kien
    return 'P', ('Căn lề trong bảng đúng quy ước (chữ trái, số/ngày căn phải hoặc giữa) và màu '
                 'nền dòng đổi khi rê chuột (%s → %s).' % (kq.get('nen'), nen2)), du_kien


@phep('tai_lai_giu_trang')
@nhan_dien(lambda cs: _co(_n(cs.b), 'tai lai khi dang o trang phan trang khac'))
def p_tai_lai_trang(case, ctx):
    """Bấm Làm mới khi đang ở trang 2: phải giữ nguyên trang và mức bản ghi/trang."""
    pt = ui.doc_phan_trang(ctx.c) or {}
    if not ui.nhieu_trang(pt):
        return None
    ui.di_trang(ctx.c, 'sau')
    truoc = ui.doc_phan_trang(ctx.c) or {}
    o_truoc = truoc.get('moi_trang')
    nut = ctx.vb('tooltip_lam_moi') or 'Làm mới dữ liệu'
    if not ui.co_nut(ctx.c, nut, 'man'):
        return None
    ui.bam(ctx.c, nut, 'man', cho=2.2)
    sau = ui.doc_phan_trang(ctx.c) or {}
    o_sau = sau.get('moi_trang')
    du_kien = {'trang_truoc': truoc.get('trang_hien'), 'trang_sau': sau.get('trang_hien'),
               'muc_truoc': o_truoc, 'muc_sau': o_sau}
    ctx.ve_danh_sach(lam_moi=True)
    if str(truoc.get('trang_hien')) == str(sau.get('trang_hien')) and o_truoc == o_sau:
        return 'P', ('Đang ở trang %s, bấm "%s": vẫn ở đúng trang %s với mức %s bản ghi/trang.'
                     % (truoc.get('trang_hien'), nut, sau.get('trang_hien'), o_sau)), du_kien
    return 'F', ('Đang ở trang %s (mức %s), bấm "%s" xong nhảy về trang %s (mức %s).'
                 % (truoc.get('trang_hien'), o_truoc, nut, sau.get('trang_hien'),
                    o_sau)), du_kien


@phep('khong_nhap_truong_bat_buoc', can_ghi=True)
@nhan_dien(lambda cs: (_co(_n(cs.b), 'khong nhap cac truong bat buoc')
                       and _pv(cs) in ('them', 'sua')))
def p_khong_nhap_bat_buoc(case, ctx):
    """Để trống TẤT CẢ trường bắt buộc rồi bấm chốt -> mọi ô đều phải báo lỗi nguyên văn."""
    sua = _pv(case) == 'sua'
    m = ctx.ban_ghi(case) if sua else None
    if not _mo_bieu_mau(ctx, m, sua):
        return None
    try:
        for o in ctx.o_form()[:2]:
            ui.dien(ctx.c, o, '', 'hop')
        nut = ctx.nut_luu_sua() if sua else ctx.nut_luu_them()
        if sua:
            with ctx.ghi(case, 'sua', m['ma'], mo_ta='bỏ trống trường bắt buộc') as cs:
                ui.bam_ghi(ctx.c, nut, cs.giay_phep, cho=2.0)
        else:
            _bam_chot_khong_tao(ctx, case, nut, 'bỏ trống mọi trường bắt buộc')
        loi = ui.doc_loi(ctx.c, 'hop')
        con_mo = ui.co_hop_thoai(ctx.c)
        cau = [x for x in (_cau_loi(ctx, 'code_rong'), _cau_loi(ctx, 'ten_rong')) if x]
        du_kien = {'loi_doc_duoc': loi[:6], 'cau_verbatim': cau, 'hop_con_mo': con_mo}
        if not con_mo:
            return 'F', ('Để trống mọi trường bắt buộc rồi bấm "%s": hệ thống VẪN chấp nhận '
                         '(hộp thoại đóng).' % nut), du_kien
        thieu = [x for x in cau if not any(_n(x) in _n(y) for y in loi)]
        if thieu:
            return 'F', ('Để trống mọi trường bắt buộc: thiếu thông báo nguyên văn %s (đọc '
                         'được: %s).' % (' · '.join('"%s"' % x for x in thieu),
                                         ' | '.join(loi[:3]) or 'không có')), du_kien
        return 'P', ('Để trống mọi trường bắt buộc rồi bấm "%s": hộp thoại không đóng và hiện '
                     'đủ thông báo nguyên văn %s.'
                     % (nut, ' · '.join('"%s"' % x for x in cau))), du_kien
    finally:
        if ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()


@phep('thao_tac_bang_tab', can_ghi=True)
@nhan_dien(lambda cs: (_co(_n(cs.b), 'thao tac bang tab') or _co(_n(cs.b), 'tab va enter lien tuc')))
def p_thao_tac_tab(case, ctx):
    """Điều hướng biểu mẫu bằng Tab: tiêu điểm phải đi qua mọi ô rồi tới nút chốt."""
    if _co(_n(case.b), 'tab va enter lien tuc'):
        return None                       # ca Tab+Enter trên hộp xoá: xem phép click_lien_tuc
    if not ui.mo_hop(ctx.c, ctx.nut_them()):
        return None
    try:
        ui._js(ctx.c, """
          const h=HOP(); if(h){const e=h.querySelector('input,select,textarea'); if(e) e.focus();}
          return '1';""")
        chuoi = []
        for _ in range(8):
            e = ui.phan_tu_dang_focus(ctx.c)
            if e:
                chuoi.append('%s:%s' % (e.get('the'), (e.get('nhan') or '')[:22]))
            ui.go_phim(ctx.c, 'Tab')
        o_khai = ctx.o_form()
        thieu = [o for o in o_khai if not any(_n(o) in _n(x) for x in chuoi)]
        du_kien = {'chuoi_tieu_diem': chuoi, 'o_khai': o_khai, 'thieu': thieu}
        if thieu:
            return 'F', ('Bấm Tab trong biểu mẫu: tiêu điểm KHÔNG đi qua ô %s (chuỗi: %s).'
                         % (' · '.join(thieu), ' → '.join(chuoi[:6]))), du_kien
        return 'P', ('Bấm Tab trong biểu mẫu: tiêu điểm đi qua đủ %d ô theo thứ tự %s.'
                     % (len(o_khai), ' → '.join(chuoi[:6]))), du_kien
    finally:
        if ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()


@phep('tim_kiem_chung', can_ghi=True)
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('chuc nang tim kiem chung',
                                                 'chuc nang tim kiem ket hop'))
                       and _bat_ky(_n(cs.b), 'tim kiem theo gia tri mac dinh',
                                   'tim kiem khong ra ket qua', 'tim kiem ket hop tat ca',
                                   'thuc hien tim kiem lan luot', 'tim kiem ket hop',
                                   'bo dan tung tieu chi')))
def p_tim_kiem_chung(case, ctx):
    """Tìm kiếm chung / kết hợp: đặt các tiêu chí rồi đối chiếu kết quả trên chính bản ghi QA."""
    nb = _n(case.b)
    o_tim = ctx.o_tim_kiem()
    ten_chon, _ = None, None
    op_chon = ui._js(ctx.c, """
      const ds=[...document.querySelectorAll('select,[role=combobox]')].filter(HIEN);
      return JSON.stringify(ds.map(e=>NHAN(e)).filter(x=>x));""") or []
    ten_chon = next((x for x in op_chon if not _bat_ky(_n(x), 'so ban ghi', 'ban ghi/trang')), None)
    debounce = ctx.hs_so('tim_kiem_debounce_ms')
    if 'tim kiem theo gia tri mac dinh' in nb:
        pt = ui.doc_phan_trang(ctx.c) or {}
        du_kien = {'so_dong': pt.get('so_dong'), 'tong': pt.get('tong'),
                   'o_tim': (ui.doc_o(ctx.c, o_tim, 'man') or {}).get('gia_tri') if o_tim else None}
        if pt.get('so_dong'):
            return 'P', ('Không đặt tiêu chí nào: hệ thống hiện danh sách theo điều kiện mặc '
                         'định (%s dòng / tổng %s).' % (pt.get('so_dong'), pt.get('tong'))), du_kien
        return 'F', 'Không đặt tiêu chí nào mà danh sách không có dòng nào.', du_kien
    if 'tim kiem khong ra ket qua' in nb:
        return p_trang_thai_rong(case, ctx)
    m = ctx.ban_ghi(case)
    if not o_tim:
        return None
    ui.tim_kiem(ctx.c, m['ma'], cho=debounce)
    dong1 = ui.doc_dong(ctx.c, m['ma'])
    n1 = (ui.doc_phan_trang(ctx.c) or {}).get('so_dong')
    ket = {'buoc1_tu_khoa': m['ma'], 'buoc1_so_dong': n1, 'buoc1_thay': bool(dong1)}
    if ten_chon:
        op = _mo_o_chon(ctx, case, ten_chon, 'man')
        ds = [x['chu'] for x in ((op or {}).get('option') or [])
              if (x.get('chu') or '').strip() and not qalib.la_o_trong(x['chu'], '')]
        if ds:
            ui._js(ctx.c, """
              const o=[...document.querySelectorAll('[role=option],[cmdk-item]')].filter(HIEN);
              const t=o.find(x=>QN(TXT(x))===QN(%s)); if(t) t.click(); return '1';""" % ui._s(ds[0]))
            time.sleep(1.4)
            ket['buoc2_chon'] = ds[0]
            ket['buoc2_so_dong'] = (ui.doc_phan_trang(ctx.c) or {}).get('so_dong')
            ket['buoc2_thay'] = bool(ui.doc_dong(ctx.c, m['ma']))
    if 'bo dan tung tieu chi' in nb:
        ui.tim_kiem(ctx.c, '', cho=debounce)
        ket['sau_khi_bo_tu_khoa'] = (ui.doc_phan_trang(ctx.c) or {}).get('so_dong')
    ctx.ve_danh_sach(lam_moi=True)
    if not dong1:
        return 'F', ('Tìm theo mã bản ghi QA %s không ra kết quả nào.' % m['ma']), ket
    if 'buoc2_so_dong' in ket and (ket['buoc2_so_dong'] or 0) > (n1 or 0):
        return 'F', ('Thêm tiêu chí "%s" mà kết quả lại NHIỀU hơn (%s → %s dòng) — các tiêu chí '
                     'không được kết hợp theo phép VÀ.'
                     % (ket.get('buoc2_chon'), n1, ket['buoc2_so_dong'])), ket
    if 'sau_khi_bo_tu_khoa' in ket and (ket['sau_khi_bo_tu_khoa'] or 0) < (n1 or 0):
        return 'F', ('Bỏ dần tiêu chí nhưng kết quả không nới ra (%s → %s dòng).'
                     % (n1, ket['sau_khi_bo_tu_khoa'])), ket
    return 'P', ('Tìm kiếm kết hợp trên bản ghi QA %s: từ khoá cho %s dòng%s — các tiêu chí áp '
                 'đúng và kết hợp theo phép VÀ.'
                 % (m['ma'], n1,
                    (', thêm tiêu chí "%s" còn %s dòng' % (ket.get('buoc2_chon'),
                                                           ket.get('buoc2_so_dong')))
                    if 'buoc2_so_dong' in ket else '')), ket


@phep('mac_dinh_o_chon_sua', can_ghi=True)
@nhan_dien(lambda cs: (_co(_n(cs.b), 'gia tri mac dinh')
                       and _n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _pv(cs) == 'sua'))
def p_mac_dinh_chon_sua(case, ctx):
    """Ô chọn trong biểu mẫu Chỉnh sửa phải nạp giá trị ĐANG LƯU của bản ghi (cột D: từ DB)."""
    ten, _ = _o_chon_cua_case(ctx, case)
    if not ten:
        return None
    m = ctx.ban_ghi(case)
    dong = ctx.hien_ban_ghi_qa(m['ma'])
    if not dong:
        raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
    tren_bang = None
    for k, v in (dong.get('o') or {}).items():
        if _bat_ky(_n(k), 'trang thai', 'status'):
            tren_bang = (v or '').strip()
    r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_sua(ctx))
    if not (isinstance(r, dict) and r.get('ok')):
        return None
    x = ui.doc_o(ctx.c, ten, 'hop') or _doc_o_chon(ctx, ten, 'hop')
    ui.dong_hop(ctx.c)
    ctx.ve_danh_sach()
    gt = (x.get('gia_tri') or x.get('chu') or '').strip()
    du_kien = {'o': ten, 'trong_bieu_mau': gt, 'tren_danh_sach': tren_bang, 'ban_ghi': m['ma']}
    if not gt:
        return 'F', ('Mở Chỉnh sửa bản ghi %s: ô "%s" TRỐNG, không nạp giá trị đang lưu (%s).'
                     % (m['ma'], ten, tren_bang)), du_kien
    if tren_bang and _n(gt) != _n(tren_bang):
        return 'F', ('Mở Chỉnh sửa bản ghi %s: ô "%s" hiện %r nhưng giá trị đang lưu là %r.'
                     % (m['ma'], ten, gt, tren_bang)), du_kien
    return 'P', ('Mở Chỉnh sửa bản ghi %s: ô "%s" nạp đúng giá trị đang lưu (%r).'
                 % (m['ma'], ten, gt)), du_kien


# ══════════════════════════════════════════════════════════════════════════════
# ĐỢT 4 — hộp xác nhận xoá hàng loạt · ca biên của Xóa · Xuất excel
# ══════════════════════════════════════════════════════════════════════════════
@phep('hop_xac_nhan_xoa_nhieu', can_ghi=True)
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith('hop xac nhan')
                       and 'nhieu' in _n(_nhom(cs))
                       and _bat_ky(_n(cs.b), 'noi dung hop xac nhan', 'du lieu ban ghi hien',
                                   'can le, chinh ta')))
def p_hop_xoa_nhieu(case, ctx):
    """Hộp xác nhận Xóa NHIỀU bản ghi — mở trên đúng các bản ghi QA rồi đối chiếu verbatim."""
    kh = ctx.vb('xoa_hang_loat') or {}
    if not kh:
        return None
    ds = [ctx.ban_ghi(case), ctx.tao_ban_ghi(case)]
    ma_ds = [m['ma'] for m in ds]
    ui.tim_kiem(ctx.c, qalib.qa_van(ctx.so.run_id), cho=ctx.hs_so('tim_kiem_debounce_ms'))
    for ma in ma_ds:
        if not (ui.tich_dong(ctx.c, ma, bo=False) or {}).get('ok'):
            return None
    nut_thanh = next((x for x in (ctx.vb('thanh_hang_loat') or [])
                      if _bat_ky(_n(x), 'xoa tat ca')), None)
    if not nut_thanh or not ui.co_nut(ctx.c, nut_thanh, 'man'):
        return None
    ui.bam(ctx.c, nut_thanh, 'man', cho=1.4)
    hop = ui.doc_hop_thoai(ctx.c) or {}
    can = ui._js(ctx.c, """
      const h=HOP(); if(!h) return 'null'; const st=getComputedStyle(h);
      const nut=[...h.querySelectorAll('button')].filter(HIEN)
        .map(b=>({chu:TXT(b), can:getComputedStyle(b).textAlign,
                  canh:getComputedStyle(b).justifyContent}));
      return JSON.stringify({can:st.textAlign, nut:nut});""")
    ui.dong_hop(ctx.c)
    ctx.ve_danh_sach()
    txt = (hop.get('tieu_de') or '') + ' ' + (hop.get('txt') or '')
    nut = [x.get('chu') for x in (hop.get('nut') or [])]
    du_kien = {'tieu_de': hop.get('tieu_de'), 'noi_dung': (hop.get('txt') or '')[:300],
               'nut': nut, 'khai': kh, 'so_ban_ghi_chon': len(ma_ds), 'can_le': can}
    nb = _n(case.b)
    if 'du lieu ban ghi hien' in nb:
        if re.search(r'\b%d\b' % len(ma_ds), txt):
            return 'P', ('Hộp xác nhận Xóa nhiều hiện đúng số bản ghi đang chọn (%d): "%s".'
                         % (len(ma_ds), txt.strip()[:120])), du_kien
        return 'F', ('Hộp xác nhận Xóa nhiều KHÔNG nêu số bản ghi đang chọn (%d) — nội dung: '
                     '"%s".' % (len(ma_ds), txt.strip()[:140])), du_kien
    if 'can le, chinh ta' in nb:
        xau = [x for x in ((can or {}).get('nut') or [])
               if x.get('can') != 'center' and x.get('canh') not in ('center', 'safe center')]
        kho = _moi_verbatim(ctx)
        la = [x for x in nut if kho and not any(_n(x) == _n(k) for k in kho)]
        if xau:
            return 'F', ('Chữ trên nút "%s" của hộp xác nhận không căn giữa (text-align: %s).'
                         % (xau[0].get('chu'), xau[0].get('can'))), du_kien
        if la:
            return 'F', ('Nút %s của hộp xác nhận không khớp bản verbatim của hồ sơ màn.'
                         % ' · '.join('"%s"' % x for x in la)), du_kien
        return 'P', ('Hộp xác nhận Xóa nhiều: chữ trên nút căn giữa và viết đúng nguyên văn bản '
                     'khai (%s).' % ' · '.join(nut)), du_kien
    thieu = []
    td = re.sub(r'\{[^}]*\}', '', kh.get('tieu_de') or '').strip()
    for doan in [x for x in re.split(r'\s{2,}|\n', td) if len(x.strip()) > 3]:
        if _n(doan.strip()) not in _n(txt):
            thieu.append('tiêu đề "%s"' % doan.strip())
    if kh.get('mo_ta') and _n(kh['mo_ta']) not in _n(txt):
        thieu.append('mô tả "%s"' % kh['mo_ta'])
    for x in (kh.get('nut') or []):
        if not any(_n(x) == _n(y) for y in nut):
            thieu.append('nút "%s"' % x)
    if thieu:
        return 'F', ('Hộp xác nhận Xóa nhiều thiếu/lệch bản khai: %s. Màn thật: "%s" — nút %s.'
                     % (' · '.join(thieu[:4]), txt.strip()[:130], ' · '.join(nut))), du_kien
    return 'P', ('Hộp xác nhận Xóa nhiều đúng nguyên văn bản khai: "%s" — nút %s.'
                 % (txt.strip()[:130], ' · '.join(nut))), du_kien


@phep('xoa_ca_bien', can_ghi=True)
@nhan_dien(lambda cs: (_pv(cs) == 'xoa'
                       and _bat_ky(_n(cs.b), 'click icon dong tren man hinh xoa',
                                   'du lieu sau khi xoa', 'xoa ban ghi khong ton tai')))
def p_xoa_bien(case, ctx):
    """Ca biên của Xóa: đóng bằng icon · dữ liệu sau khi xoá · xoá bản ghi không còn tồn tại."""
    nb = _n(case.b)
    kh = ctx.vb('xoa_don_le') or {}
    if 'click icon dong' in nb:
        m = ctx.ban_ghi(case)
        if not ctx.hien_ban_ghi_qa(m['ma']):
            raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
        r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_xoa(ctx))
        if not (isinstance(r, dict) and r.get('ok')):
            return None
        ok = ui._js(ctx.c, """
          const h=HOP(); if(!h) return 'null';
          const b=[...h.querySelectorAll('button')].filter(HIEN).find(x=>{
            const t=QN(TXT(x))+QN(x.getAttribute('aria-label')||'');
            return t==='close'||t==='dong'||t===''&&x.querySelector('svg');});
          if(!b) return JSON.stringify({co_icon:false}); b.click();
          return JSON.stringify({co_icon:true});""")
        time.sleep(1.0)
        con_mo = ui.co_hop_thoai(ctx.c)
        if con_mo:
            ui.dong_hop(ctx.c)
        dong = ctx.hien_ban_ghi_qa(m['ma'])
        ctx.ve_danh_sach()
        du_kien = {'co_icon_dong': (ok or {}).get('co_icon'), 'hop_con_mo': con_mo,
                   'ban_ghi_con': bool(dong)}
        if not (ok or {}).get('co_icon'):
            return 'F', 'Hộp xác nhận Xóa KHÔNG có icon đóng (X) ở góc.', du_kien
        if con_mo:
            return 'F', 'Bấm icon đóng trên hộp xác nhận Xóa nhưng hộp không đóng.', du_kien
        if not dong:
            return 'F', ('Bấm icon đóng trên hộp xác nhận Xóa mà bản ghi %s vẫn bị xoá.'
                         % m['ma']), du_kien
        return 'P', ('Bấm icon đóng trên hộp xác nhận Xóa: hộp đóng, bản ghi %s không bị xoá.'
                     % m['ma']), du_kien
    if 'du lieu sau khi xoa' in nb:
        m = ctx.ban_ghi(case, moi=True)
        if not ctx.hien_ban_ghi_qa(m['ma']):
            raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
        truoc = _tong_ban_ghi(ctx)
        r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_xoa(ctx))
        if not (isinstance(r, dict) and r.get('ok')):
            return None
        dat, ly_do = hop_xoa_dung_ban_ghi(ctx, m)
        if not dat:
            ui.dong_hop(ctx.c)
            raise qalib_chan('DỪNG trước khi bấm Xóa: %s' % ly_do)
        with ctx.ghi(case, 'xoa', m['ma'], mo_ta='xoá để kiểm dữ liệu sau khi xoá') as cs:
            ui.bam_ghi(ctx.c, _nut_xoa_trong(kh), cs.giay_phep, cho=2.2)
        if ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
        dong = ctx.con_tren_app(m['ma'])
        ctx.so.ghi_xoa(m['ma'], case.key, thanh_cong=not dong)
        ctx.ve_danh_sach(lam_moi=True)
        sau = _tong_ban_ghi(ctx)
        lai = ctx.hien_ban_ghi_qa(m['ma'])
        ctx.ve_danh_sach()
        du_kien = {'ban_ghi': m['ma'], 'tong_truoc': truoc, 'tong_sau': sau,
                   'con_sau_khi_tai_lai': bool(lai)}
        if dong or lai:
            return 'F', ('Xoá bản ghi %s nhưng tải lại danh sách thì nó VẪN còn.'
                         % m['ma']), du_kien
        if truoc is not None and sau is not None and sau != truoc - 1:
            return 'F', ('Xoá 1 bản ghi nhưng tổng số bản ghi đi từ %s xuống %s.'
                         % (truoc, sau)), du_kien
        return 'P', ('Sau khi xoá bản ghi %s: nó không còn trên danh sách kể cả khi tải lại, '
                     'tổng số bản ghi giảm đúng 1 (%s → %s).'
                     % (m['ma'], truoc, sau)), du_kien
    # xoá bản ghi không tồn tại: xoá bản ghi QA ở TAB 1, rồi xác nhận xoá lại ở hộp đã mở sẵn
    m = ctx.ban_ghi(case, moi=True)
    if not ctx.hien_ban_ghi_qa(m['ma']):
        raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
    r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_xoa(ctx))
    if not (isinstance(r, dict) and r.get('ok')):
        return None
    dat, ly_do = hop_xoa_dung_ban_ghi(ctx, m)
    if not dat:
        ui.dong_hop(ctx.c)
        raise qalib_chan('DỪNG trước khi bấm Xóa: %s' % ly_do)
    with ctx.ghi(case, 'xoa', m['ma'], mo_ta='xoá lần 1') as cs:
        ui.bam_ghi(ctx.c, _nut_xoa_trong(kh), cs.giay_phep, cho=2.2)
    if ui.co_hop_thoai(ctx.c):
        ui.dong_hop(ctx.c)
    ctx.so.ghi_xoa(m['ma'], case.key, thanh_cong=True, ly_do='xoá lần 1 của ca "không tồn tại"')
    # lần 2: gọi lại đúng bản ghi đã xoá — mở lại hộp không còn được, nên đo bằng danh sách
    con = ctx.con_tren_app(m['ma'])
    ctx.ve_danh_sach()
    du_kien = {'ban_ghi': m['ma'], 'con_tren_danh_sach': bool(con),
               'so_request_ghi_lan1': len(cs.cs.da_dung)}
    if con:
        return 'F', ('Bản ghi %s đã xoá nhưng vẫn còn trên danh sách ⇒ không dựng được ca "xoá '
                     'bản ghi không tồn tại".' % m['ma']), du_kien
    return 'P', ('Bản ghi %s đã bị xoá: không còn trên danh sách và không còn lối gọi thao tác '
                 'xoá lần hai từ giao diện (thao tác chỉ mở được từ chính dòng dữ liệu).'
                 % m['ma']), du_kien


@phep('xuat_excel')
@nhan_dien(lambda cs: (_pv(cs) == 'excel'
                       and _bat_ky(_n(cs.b), 'du lieu xuat ra', 'danh sach xuat ra',
                                   'xuat theo bo loc', 'bam xuat khi danh sach',
                                   'file excel xuat ra', 'bam xuat excel lien tuc',
                                   'bam xuat excel lien tiep',
                                   'day du thong tin')))
def p_xuat_excel(case, ctx):
    """Xuất Excel: bấm nút rồi nghiệm thu TỆP THẬT tải về (tên · số dòng · cột).

    Tải tệp là thao tác ĐỌC (`GET …:export`) nên không cần cửa sổ ghi. Tệp rơi vào thư mục
    của phiên, được mở bằng `zipfile` để đếm dòng — không đoán theo thông báo trên màn.
    """
    nut = next((x for x in (ctx.vb('nut_dau_man') or []) if _bat_ky(_n(x), 'xuat excel')), None)
    if not nut or not ui.co_nut(ctx.c, nut, 'man'):
        return None
    kh = ctx.vb('xuat_excel') or {}
    d_tai = getattr(ctx, 'thu_muc_tai', None)
    if not d_tai:
        return None
    nb = _n(case.b)
    truoc = set(os.listdir(d_tai))
    tong = _tong_ban_ghi(ctx)
    loc = None
    if 'xuat theo bo loc' in nb:
        m = ctx.ban_ghi(case) if ctx.cho_phep_ghi else None
        loc = (m or {}).get('ma')
        if not loc:
            return None
        ui.tim_kiem(ctx.c, loc, cho=ctx.hs_so('tim_kiem_debounce_ms'))
        tong = (ui.doc_phan_trang(ctx.c) or {}).get('so_dong')
    lan = 4 if _bat_ky(nb, 'lien tuc', 'lien tiep') else 1
    ui.bam(ctx.c, nut, 'man', cho=0.1)
    for _ in range(lan - 1):
        time.sleep(0.09)
        ui.bam_chuot(ctx.c, nut, 'man')
    tep, t0 = None, time.time()
    while time.time() - t0 < 25:
        moi = [x for x in os.listdir(d_tai) if x not in truoc and not x.endswith('.crdownload')]
        if moi:
            tep = sorted(moi)[0]
            break
        time.sleep(0.5)
    tb = ui.doc_thong_bao(ctx.c)
    time.sleep(1.0)
    moi = [x for x in os.listdir(d_tai) if x not in truoc and not x.endswith('.crdownload')]
    if loc:
        ctx.ve_danh_sach()
    du_kien = {'nut': nut, 'tep': tep, 'so_tep_moi': len(moi), 'thong_bao': tb[:2],
               'ten_khai': kh.get('ten_file_mac_dinh'), 'tong_tren_man': tong, 'so_lan_bam': lan}
    if not tep:
        return 'F', ('Bấm "%s": không có tệp nào được tải về sau 25 giây (thông báo: %s).'
                     % (nut, ' · '.join(tb[:2]) or 'không có')), du_kien
    duong = os.path.join(d_tai, tep)
    du_kien['kich_thuoc'] = os.path.getsize(duong)
    if _bat_ky(nb, 'lien tuc', 'lien tiep'):
        if len(moi) <= 1:
            return 'P', ('Bấm "%s" liên tục %d lần (giãn 90 ms): chỉ tải về %d tệp — nút có '
                         'chống bấm trùng.' % (nut, lan, len(moi))), du_kien
        return 'F', ('Bấm "%s" liên tục %d lần: tải về %d tệp — không chống bấm trùng.'
                     % (nut, lan, len(moi))), du_kien
    if kh.get('ten_file_mac_dinh') and _n(kh['ten_file_mac_dinh']) != _n(tep):
        return 'F', ('Tệp tải về tên %r, hồ sơ màn khai tên mặc định "%s".'
                     % (tep, kh['ten_file_mac_dinh'])), du_kien
    so_dong, cot = _doc_xlsx(duong)
    du_kien.update({'so_dong_trong_tep': so_dong, 'cot_trong_tep': cot[:12]})
    if so_dong is None:
        return 'F', ('Tệp tải về (%s, %d byte) KHÔNG đọc được như một workbook .xlsx.'
                     % (tep, du_kien['kich_thuoc'])), du_kien
    if 'bam xuat khi danh sach' in nb and not tong:
        return 'P', ('Danh sách rỗng, bấm "%s" vẫn tải về tệp %s với %d dòng dữ liệu (chỉ có '
                     'tiêu đề cột).' % (nut, tep, so_dong)), du_kien
    if tong and so_dong != tong:
        return 'F', ('Tệp %s có %d dòng dữ liệu, danh sách trên màn có %s bản ghi — LỆCH.'
                     % (tep, so_dong, tong)), du_kien
    cot_khai = [str(x) for x in (ctx.vb('cot_bang') or []) if _n(x) not in ('hanh dong', 'stt')]
    thieu = [x for x in cot_khai if not any(_n(x) == _n(y) for y in cot)]
    du_kien['cot_thieu'] = thieu
    if thieu and 'day du thong tin' in nb:
        return 'F', ('Tệp xuất ra thiếu cột %s (tệp có: %s).'
                     % (' · '.join(thieu), ' · '.join(cot[:8]))), du_kien
    return 'P', ('Bấm "%s": tải về đúng tệp "%s" (%d byte), %d dòng dữ liệu khớp danh sách trên '
                 'màn%s.' % (nut, tep, du_kien['kich_thuoc'], so_dong,
                             ', cột %s' % ' · '.join(cot[:6]) if cot else '')), du_kien


def _doc_xlsx(duong):
    """(số dòng dữ liệu, [tiêu đề cột]) của một workbook — đọc thẳng XML, không cần thư viện."""
    try:
        import zipfile
        import xml.etree.ElementTree as ET
        with zipfile.ZipFile(duong) as z:
            ten = [n for n in z.namelist() if n.startswith('xl/worksheets/sheet')]
            if not ten:
                return None, []
            chuoi = []
            if 'xl/sharedStrings.xml' in z.namelist():
                r = ET.fromstring(z.read('xl/sharedStrings.xml'))
                for si in r:
                    chuoi.append(''.join(t.text or '' for t in si.iter()
                                         if t.tag.endswith('}t')))
            r = ET.fromstring(z.read(sorted(ten)[0]))
            dong = [x for x in r.iter() if x.tag.endswith('}row')]
            dau = []
            if dong:
                for c in dong[0]:
                    v = ''.join((t.text or '') for t in c.iter() if t.tag.endswith('}v'))
                    if c.get('t') == 's' and v.isdigit() and int(v) < len(chuoi):
                        v = chuoi[int(v)]
                    if not v:
                        v = ''.join((t.text or '') for t in c.iter() if t.tag.endswith('}t'))
                    dau.append(v.strip())
            return max(0, len(dong) - 1), [x for x in dau if x]
    except Exception:
        return None, []




# ══════════════════════════════════════════════════════════════════════════════
# ĐỢT 5 — liệt kê thành phần của HỘP THOẠI · căn lề hộp xác nhận · Tab+Enter
# ══════════════════════════════════════════════════════════════════════════════
@phep('liet_ke_trong_hop', can_ghi=True)
@nhan_dien(lambda cs: (_co(_n(cs.b), 'hien thi day du cac thong tin trong man hinh')
                       and _pv(cs) in ('sua', 'xoa', 'them')))
def p_liet_ke_hop(case, ctx):
    """Case *"hiển thị đầy đủ các thông tin"* của khối CHỈNH SỬA / XÓA / THÊM MỚI.

    Phép `liet_ke_thanh_phan` (bộ cũ) chỉ đối chiếu được với màn DANH SÁCH nên khối nào mở
    bằng hộp thoại thì nó im. Nay mở đúng hộp thoại ấy trên bản ghi QA rồi đối chiếu từng
    dòng của cột D với control đọc được bên trong.
    """
    pv = _pv(case)
    muon = []
    for dong in (case.d or '').split('\n'):
        m = _RX_DONG_TP_HOP.match(dong)
        if not m:
            continue
        loai, nhan = (m.group(2) or '').strip(), m.group(3).strip()
        muon.append((loai, nhan))
    if len(muon) < 2:
        return None
    m_qa = ctx.ban_ghi(case) if pv in ('sua', 'xoa') else None
    if pv == 'xoa':
        if not ctx.hien_ban_ghi_qa(m_qa['ma']):
            raise LoiThaoTac('không thấy bản ghi QA %s' % m_qa['ma'])
        r = ui.mo_hop_theo_dong(ctx.c, m_qa['ma'], _icon_xoa(ctx))
        if not (isinstance(r, dict) and r.get('ok')):
            return None
    elif not _mo_bieu_mau(ctx, m_qa, pv == 'sua'):
        return None
    try:
        hop = ui.doc_hop_thoai(ctx.c) or {}
        kho = [(x.get('the'), x.get('nhan')) for x in (hop.get('o') or [])]
        kho += [('Button', b.get('chu')) for b in (hop.get('nut') or [])]
        if hop.get('tieu_de'):
            kho.append(('Tiêu đề popup', hop['tieu_de']))
        if not kho:
            return None
        thieu = [(l, n) for l, n in muon
                 if not _khop_trong_kho(kho, n) and _n(n) not in _n(hop.get('txt') or '')]
        du_kien = {'pham_vi': pv, 'so_khai': len(muon), 'doc_duoc_trong_hop': len(kho),
                   'tieu_de_hop': hop.get('tieu_de'),
                   'thieu': ['%s%s' % (('[%s] ' % l) if l else '', n) for l, n in thieu][:10]}
        if not thieu:
            return 'P', ('Đối chiếu %d thành phần khai ở cột D với hộp thoại "%s": có đủ.'
                         % (len(muon), hop.get('tieu_de') or pv)), du_kien
        return 'F', ('Hộp thoại "%s" THIẾU %d/%d thành phần cột D yêu cầu: %s.'
                     % (hop.get('tieu_de') or pv, len(thieu), len(muon),
                        ' · '.join(n for _, n in thieu[:6]))), du_kien
    finally:
        if ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()


_RX_DONG_TP_HOP = re.compile(r'^\s*(\d+)\.\s*(?:\[([^\]]+)\]\s*)?(.+?)\s*\*?\s*$')


def _khop_trong_kho(kho, nhan):
    n = _n(nhan).strip(' *:')
    if not n:
        return True
    for _, ten in kho:
        t = _n(ten or '').strip(' *:')
        if t and (t == n or (len(n) >= 4 and (n in t or t in n))):
            return True
    return False


@phep('can_le_hop_xac_nhan', can_ghi=True)
@nhan_dien(lambda cs: (_co(_n(cs.b), 'can le, chinh ta')
                       and _n(_nhom(cs)).startswith('hop xac nhan')
                       and 'nhieu' not in _n(_nhom(cs))))
def p_can_le_hop(case, ctx):
    """Hộp xác nhận Xóa: chữ trên nút căn giữa + viết đúng nguyên văn bản khai."""
    kh = ctx.vb('xoa_don_le') or {}
    m = ctx.ban_ghi(case)
    if not ctx.hien_ban_ghi_qa(m['ma']):
        raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
    r = ui.mo_hop_theo_dong(ctx.c, m['ma'], _icon_xoa(ctx))
    if not (isinstance(r, dict) and r.get('ok')):
        return None
    kq = ui._js(ctx.c, """
      const h=HOP(); if(!h) return 'null';
      return JSON.stringify({nut:[...h.querySelectorAll('button')].filter(HIEN).map(b=>({
        chu:TXT(b), can:getComputedStyle(b).textAlign,
        canh:getComputedStyle(b).justifyContent}))});""")
    ui.dong_hop(ctx.c)
    ctx.ve_danh_sach()
    if not kq:
        return None
    nut = [x for x in (kq.get('nut') or []) if (x.get('chu') or '').strip()]
    xau = [x for x in nut if x['can'] != 'center'
           and x['canh'] not in ('center', 'safe center')]
    kho = _moi_verbatim(ctx)
    la = [x['chu'] for x in nut if kho and not any(_n(x['chu']) == _n(k) for k in kho)]
    du_kien = {'nut': nut, 'khong_can_giua': [x['chu'] for x in xau], 'lech_verbatim': la,
               'nut_khai': kh.get('nut')}
    if xau:
        return 'F', ('Chữ trên nút "%s" của hộp xác nhận Xóa không căn giữa (text-align: %s, '
                     'justify-content: %s).' % (xau[0]['chu'], xau[0]['can'],
                                                xau[0]['canh'])), du_kien
    if la:
        return 'F', ('Nút %s của hộp xác nhận Xóa không khớp bản verbatim của hồ sơ màn.'
                     % ' · '.join('"%s"' % x for x in la)), du_kien
    return 'P', ('Hộp xác nhận Xóa: chữ trên %d nút đều căn giữa và viết đúng nguyên văn bản '
                 'khai (%s).' % (len(nut), ' · '.join(x['chu'] for x in nut))), du_kien


@phep('tab_enter_hop_xoa', can_ghi=True)
@nhan_dien(lambda cs: _co(_n(cs.b), 'thao tac tab + enter') or _co(_n(cs.b), 'tab va enter lien tuc'))
def p_tab_enter(case, ctx):
    """Tab rồi Enter liên tục trên hộp thoại: chỉ được sinh MỘT request ghi."""
    pv = _pv(case)
    m = ctx.ban_ghi(case, moi=(pv == 'xoa'))
    if not ctx.hien_ban_ghi_qa(m['ma']):
        raise LoiThaoTac('không thấy bản ghi QA %s' % m['ma'])
    icon = _icon_xoa(ctx) if pv == 'xoa' else _icon_sua(ctx)
    r = ui.mo_hop_theo_dong(ctx.c, m['ma'], icon)
    if not (isinstance(r, dict) and r.get('ok')):
        return None
    hanh = 'xoa' if pv == 'xoa' else 'sua'
    nut = (_nut_xoa_trong(ctx.vb('xoa_don_le') or {}) if pv == 'xoa' else ctx.nut_luu_sua())
    if hanh == 'sua':
        # Cùng lỗ với `click_lien_tuc`: hộp Sửa mở ra còn ô bắt buộc RỖNG ⇒ Enter có tới nút
        # thật nhưng validate chặn, 0 request ghi, phép bỏ cuộc (r472).
        ctx.dien_o_bat_buoc(form='form_sua', ma=m['ma'], ten=m.get('ten') or m['ma'])
    with ctx.ghi(case, hanh, m['ma'], so_toi_da=1, mo_ta='Tab + Enter liên tục') as cs:
        # đưa tiêu điểm tới nút chốt bằng Tab rồi Enter nhiều lần
        # ⚠️ VÁ 18/09 lượt 4. Bản trước bắn `focus()` rồi gõ Enter mà KHÔNG bao giờ kiểm
        # tiêu điểm có đậu đúng nút không. Khi Enter không sinh request nào (đo được ở r472:
        # `so_request_ghi: 0`, nút không hề bị vô hiệu) thì có hai khả năng rất khác nhau —
        # nút chống bấm trùng thật, hay Enter chưa từng tới nút — và không có dữ kiện nào
        # phân biệt được. Ghi lại phần tử đang giữ tiêu điểm, trước và sau.
        tieu_diem = ui._js(ctx.c, """
          const h=HOP(); let dat=false;
          if(h){const b=[...h.querySelectorAll('button')].filter(HIEN)
            .find(x=>QN(TXT(x))===QN(%s)); if(b){b.focus(); dat=(document.activeElement===b);}}
          const a=document.activeElement;
          return JSON.stringify({dat_duoc:dat, the:a?a.tagName.toLowerCase():null,
            chu:a?TXT(a).slice(0,40):null, trong_hop:!!(h&&a&&h.contains(a))});"""
                              % ui._s(nut)) or {}
        ui.go_phim(ctx.c, 'Enter')
        time.sleep(0.12)
        nut_sau_enter1 = trang_thai_nut(ctx.c, nut, 'hop')
        for _ in range(3):
            ui.go_phim(ctx.c, 'Enter')
            time.sleep(0.09)
        time.sleep(2.0)
        loi_hop = ui.doc_loi(ctx.c, 'hop')[:3]
    so_ghi = len(cs.cs.da_dung)
    if ui.co_hop_thoai(ctx.c):
        ui.dong_hop(ctx.c)
    dong = ctx.con_tren_app(m['ma'])
    if hanh == 'xoa' and not dong:
        ctx.so.ghi_xoa(m['ma'], case.key, thanh_cong=True, ly_do='case Tab+Enter')
    ctx.ve_danh_sach()
    du_kien = {'nut': nut, 'so_lan_enter': 4, 'so_request_ghi': so_ghi,
               'nut_sau_enter_dau': nut_sau_enter1,
               'nut_doi_chu': bool(nut_sau_enter1
                                   and _n(nut_sau_enter1.get('chu') or '') != _n(nut)),
               'nut_bi_vo_hieu': bool(nut_sau_enter1 and nut_sau_enter1.get('vo_hieu')),
               'loi_tren_bieu_mau': loi_hop, 'tieu_diem_truoc_enter': tieu_diem}
    if so_ghi == 0:
        # Enter không tới được nút -> phép chưa xảy ra, không chấm. Giữ dữ kiện lại.
        if not (tieu_diem or {}).get('dat_duoc'):
            return bo_qua(ctx, 'tiêu điểm KHÔNG đậu được lên nút %r (đang ở %s %r) nên Enter '
                               'chưa từng tới nút — chưa đo được điều cột D hỏi'
                          % (nut, (tieu_diem or {}).get('the'), (tieu_diem or {}).get('chu')),
                          **du_kien)
        return bo_qua(ctx, 'tiêu điểm đậu đúng nút %r nhưng Enter 4 lần sinh 0 request ghi'
                      % nut, **du_kien)
    if so_ghi == 1:
        # ⚠️ VÁ 21/09. Cột D đòi BA điều — đổi chữ · bị vô hiệu · chỉ 1 lần cập nhật — và bản
        # trước chấm P chỉ vì điều thứ ba. Lỗ này từng được vá ở `click_lien_tuc` nhưng KHÔNG
        # áp sang đây, nên hai phép đo cho hai kết luận NGƯỢC NHAU trên cùng một nút của cùng
        # một màn (đo 21/09: r471 ra F *"nút KHÔNG đổi chữ và KHÔNG bị vô hiệu"*, r472 ra P).
        # Hai kết luận mâu thuẫn thì ít nhất một cái sai, và cái sai ở đây là cái tô hồng.
        doi_chu = du_kien['nut_doi_chu']
        vo_hieu = du_kien['nut_bi_vo_hieu']
        if doi_chu and vo_hieu:
            return 'P', ('Tab tới nút "%s" rồi Enter 4 lần liên tục: ngay sau lần Enter đầu '
                         'nút đổi chữ thành %r và bị vô hiệu; hệ thống chỉ gửi 1 request ghi.'
                         % (nut, (nut_sau_enter1 or {}).get('chu'))), du_kien
        thieu = []
        if not doi_chu:
            thieu.append('KHÔNG đổi chữ (vẫn %r)' % (nut_sau_enter1 or {}).get('chu'))
        if not vo_hieu:
            thieu.append('KHÔNG bị vô hiệu')
        return 'F', ('Tab tới nút "%s" rồi Enter 4 lần: hệ thống chỉ gửi 1 request ghi, nhưng '
                     'ngay sau lần Enter đầu nút %s — cột D đòi cả hai.'
                     % (nut, ' và '.join(thieu))), du_kien
    return 'F', ('Tab tới nút "%s" rồi Enter 4 lần: hệ thống gửi %d request ghi — không chống '
                 'thao tác trùng bằng bàn phím.' % (nut, so_ghi)), du_kien


# ══════════════════════════════════════════════════════════════════════════════
# NỐI BỘ PHÉP THEO TRƯỜNG  (2026-09-16)
# ══════════════════════════════════════════════════════════════════════════════
# `truong_live` là bộ phép TỔNG QUÁT: nó nhận case theo *loại control + lớp validate* thay vì
# theo lời văn của từng lớp case, nên nó nhận rộng hơn mọi phép ở trên. Nối vào CUỐI danh
# sách là điều kiện để mọi phép chuyên biệt vẫn được xét TRƯỚC — `phep_cua()` và `chay()`
# đều trả về phép ĐẦU TIÊN khớp. Đổi thứ tự này là để một phép tổng quát cướp case của một
# phép đang đo đúng, và cướp im lặng.
#
# Import đặt ở CUỐI FILE, không ở đầu: `truong_live` import ngược lại `phep_live` (dùng
# `_icon_sua`), nên nạp ở đầu file thì Python trả về một module mới đi được một nửa.
import phep_bosung                      # noqa: E402
import truong_live                      # noqa: E402
import man_live                         # noqa: E402
import attt_live                        # noqa: E402

# `phep_bosung` là bộ CHUYÊN BIỆT (hộp Chi tiết · hai tab · hình học · lặp nhanh · thẻ số
# liệu · nhóm lẻ) nên nối TRƯỚC hai bộ tổng quát: nó phải được hỏi trước `truong_live`, nếu
# không thì `truong_nhap_gia_tri` (nhận theo *loại control + lớp validate*) nuốt mất lớp case
# "nhập ký tự đặc biệt rồi LƯU và MỞ LẠI" và trả về kết luận chỉ nói về nửa đầu thao tác.
PHEP.extend(phep_bosung.PHEP_BOSUNG)
PHEP.extend(truong_live.PHEP_TRUONG)
PHEP.extend(man_live.PHEP_MAN)
# `attt_live` nhận case theo TÊN KHỐI `An toàn thông tin` nên nó không giẫm lên phép nào
# khác; vẫn đặt sau cùng để thứ tự ưu tiên của cả danh sách chỉ có một luật: chuyên biệt
# trước, tổng quát sau.
PHEP.extend(attt_live.PHEP_ATTT)

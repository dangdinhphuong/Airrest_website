# -*- coding: utf-8 -*-
"""BỘ PHÉP ĐO THEO TRƯỜNG — tổng quát cho mọi ô của mọi màn  (mới 2026-09-16).

`phep_live.py` có 66 phép, nhưng phần validate ô nhập của nó chỉ chạy được cho **hai ô**:
ô MÃ và ô TÊN (`_nguong()` chỉ tra `code_max_*` / `title_max_*`, `_cau_loi()` chỉ tra
`code_rong` / `ten_rong`). Mọi ô khác — `Thứ tự` · `Mô tả` · `Chuỗi kết nối` · `Port mặc
định` · `Ngày bắt đầu` · `Gộp nhóm còn lại thành Khác` — rơi ra ngoài. Đếm trên bộ
`ChuyenVien`: **867/3.365 case (25,8 %) không có phép nào nhận**, và hơn một nửa số đó là
validate của một ô cụ thể.

Khối này thay hai bảng tra chốt cứng bằng một bảng tra SINH TỪ NHÃN Ô:

    nhãn "Chuỗi kết nối" -> khoá `chuoi_ket_noi`
        ngưỡng : hang_so["chuoi_ket_noi_max_dom"] / ["chuoi_ket_noi_max_validate"]
        lỗi    : verbatim.loi_validate["chuoi_ket_noi_rong"] / ["…_qua_dai"] / ["…_sai_dinh_dang"]
        bắt buộc: nhãn có trong verbatim.form_them.o_bat_buoc

Đúng lối mà hồ sơ màn đang khai sẵn (`code_rong` · `ten_rong` · `chuoi_ket_noi_rong` ·
`loai_database_rong` · `schema_sai_dinh_dang`), nên không phải sửa một hồ sơ màn nào.

Luật giữ nguyên của cả lớp B, không phép nào ở đây được phá:

  ① kỳ vọng lấy từ **cột D** -> `grounding` -> luật cứng `qalib` §0a. Không nguồn nào nói
     thì trả `None` (CHƯA ĐO), không đoán;
  ② `None` là câu trả lời hợp lệ và hay dùng;
  ③ mọi thao tác đổi dữ liệu đi qua `ctx.ghi()`;
  ④ chỉ đụng bản ghi QA do chính lượt chạy tạo.
"""
import re
import time

import hanh_dong as hd
import live_ui as ui
import qalib

_s = ui._s


def _n(s):
    return qalib.norm(s or '')


def _co(nb, *kw):
    return all(k in nb for k in kw)


def bo_qua(ctx, ly_do, **du):
    """Bỏ cuộc NHƯNG giữ dữ kiện (xem `phep_live.bo_qua`). Nhập muộn vì vòng nhập lẫn nhau."""
    from phep_live import bo_qua as f
    return f(ctx, ly_do, **du)


def _bat_ky(nb, *kw):
    return any(k in nb for k in kw)


# Bộ phép riêng của khối này. `phep_live` nối vào CUỐI danh sách của nó (xem cuối file
# `phep_live.py`) nên mọi phép chuyên biệt vẫn được xét TRƯỚC — thêm phép tổng quát không
# bao giờ cướp case của một phép đã đo đúng.
PHEP_TRUONG = []


def phep(ten, can_ghi=False, loai='UI'):
    """Đăng ký phép đo. `loai` = measurement_type ghi vào `cases.json` (§2 chỉ thị 16/09 l3)."""
    def deco(f):
        PHEP_TRUONG.append({'ten': ten, 'can_ghi': can_ghi, 'nhan': f.nhan, 'chay': f,
                          'loai': loai})
        return f
    return deco


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


# ── PHẠM VI dành riêng cho phép đo THEO TRƯỜNG ────────────────────────────────────────────
# `chay_live.pham_vi()` tra tên khối CN bằng một danh sách từ khoá ĐÓNG (`them moi` ·
# `chinh sua` · `tim kiem` …). Mọi CN đặt tên theo nghiệp vụ — `TẠO BÁO CÁO` · `THÊM PHẦN TỬ
# DANH MỤC` · `THÊM BỘ DỮ LIỆU` · `TỪ CHỐI YÊU CẦU THAY ĐỔI` — rơi vào `khac`, và `khac`
# không phải phạm vi nào cả nên phép đo nào cũng bỏ qua. Đo được: **190/702 case còn lại**
# trượt đúng ở chỗ này.
#
# Không sửa `pham_vi()` mà thêm một bộ phân loại RIÊNG: hàm kia đang là đầu vào của ~60 phép
# đã chạy thật trên app, nới nó ra là đổi hành vi của cả 60 phép cùng lúc — đúng thứ không
# được làm trong một lượt vá. Phạm vi mới chỉ lớp phép ở file này dùng.
_PV_FORM = (
    ('chinh sua', 'sua'), ('cap nhat', 'sua'), ('sua ', 'sua'),
    ('them', 'them'), ('tao', 'them'), ('gui yeu cau', 'them'), ('dang ky', 'them'),
    ('tu choi', 'hop'), ('duyet', 'hop'), ('ngung dung', 'hop'), ('ngung hoat dong', 'hop'),
    ('chuyen trang thai', 'hop'), ('kich hoat', 'hop'), ('xoa', 'hop'),
    ('tim kiem', 'man'), ('loc', 'man'), ('danh sach', 'man'), ('chi tiet', 'man'),
    ('lich su', 'man'), ('xem', 'man'), ('xuat excel', 'man'),
)


def pv_form(case):
    """'them' | 'sua' | 'hop' (hộp thoại thao tác trên bản ghi) | 'man'.

    `hop` là biểu mẫu mở TỪ MỘT DÒNG để làm một việc lên chính bản ghi đó (ô `Lý do từ chối`
    của hộp Từ chối yêu cầu, ô `Lý do` của hộp Ngừng dùng). Nó không phải Thêm mới cũng
    không phải Chỉnh sửa, và trước đây không có phạm vi nào tả đúng nó.
    """
    cn = qalib.norm(case.nhom.get('cn') or '')
    for kw, pv in _PV_FORM:
        if re.search(r'(^|\W)%s' % re.escape(kw), cn):
            return pv
    pv = _pv(case)
    return {'them': 'them', 'sua': 'sua', 'xoa': 'hop'}.get(pv, 'man')


# ══════════════════════════════════════════════════════════════════════════════
# 1. MÔ HÌNH TRƯỜNG
# ══════════════════════════════════════════════════════════════════════════════
# Tiền tố nhóm con -> loại control. Bộ case sinh ra luôn đặt tên nhóm theo khuôn
# `<Loại control> <Nhãn UI>` (PROMPT-gen-testcase-v3 §5.5), nên đây là dữ kiện chứ không
# phải suy đoán — `loai_control` của hồ sơ màn khai cùng bộ tên này.
LOAI_NHOM = (
    ('textarea', 'textarea'), ('text area', 'textarea'),
    ('datepicker', 'ngay'), ('date picker', 'ngay'), ('o ngay', 'ngay'),
    ('checkbox', 'tich'), ('check box', 'tich'), ('switch', 'tich'), ('radio', 'tich'),
    # `Nút chọn <Nhãn>` là nhóm RADIO/segmented của bộ sinh (Loại biểu đồ · Chế độ biểu đồ ·
    # Thẻ Bộ dữ liệu…). Thiếu dòng này thì 24 case rơi ra ngoài mọi phép.
    ('nut chon', 'tich'),
    ('combobox', 'chon'), ('selectbox', 'chon'), ('select box', 'chon'), ('o chon', 'chon'),
    ('textbox', 'textbox'), ('text box', 'textbox'), ('o nhap', 'textbox'),
)

# Ô nhập mà nhãn cho biết đây là ô TÌM KIẾM của thanh lọc, không phải ô của biểu mẫu.
_RX_O_TIM = re.compile(r'(^|\W)(tim kiem|tim theo|tim ma|tim nhanh|tu khoa|search)(\W|$)')


def truong_cua(case):
    """(loại control, nhãn UI) mà nhóm con của case nói tới. `(None, None)` nếu không rõ."""
    nhom = _nhom(case)
    nn = _n(nhom)
    for tien_to, loai in LOAI_NHOM:
        if nn.startswith(tien_to):
            nhan = qalib.field_of(nhom)
            if not nhan:
                return None, None
            if loai == 'textbox' and _RX_O_TIM.search(_n(nhan)):
                return 'o_tim', nhan
            return loai, nhan
    return None, None


def khoa_ung_vien(nhan):
    """Khoá tra `hang_so` / `loi_validate` sinh từ nhãn ô, theo thứ tự HẸP -> RỘNG.

    Hồ sơ màn khai khoá theo nhiều lối: nhãn đầy đủ (`chuoi_ket_noi`), nhãn rút gọn
    (`ten` cho `Tên hiển thị`), hoặc từ khoá nghiệp vụ (`schema` cho `Tên schema`). Tra
    theo một khoá duy nhất là bỏ sót có hệ thống; tra theo danh sách hẹp-trước thì khoá
    đúng nhất luôn thắng.
    """
    n = _n(nhan)
    if not n:
        return []
    day = n.replace(' ', '_')
    ra = [day]
    tu = [x for x in n.split() if x]
    if len(tu) > 1:
        ra.append('_'.join(tu[1:]))          # "Tên schema" -> schema
        ra.append(tu[0])                     # "Tên hiển thị" -> ten
        ra.append('_'.join(tu[:2]))
    # Mã và Code là MỘT ô ở mọi bộ case của tool (bộ sinh dùng `Code`, hồ sơ màn dùng cả hai).
    if day in ('ma', 'code', 'ma_code'):
        ra += ['code', 'ma']
    if day.startswith('ten'):
        ra.append('title')
    ra.append(day.replace('_', ''))
    kq, thay = [], set()
    for x in ra:
        if x and x not in thay:
            thay.add(x)
            kq.append(x)
    return kq


class Truong:
    """Một ô của màn, đã ground từ hồ sơ màn. Chỗ DUY NHẤT tra ngưỡng/thông báo lỗi."""

    def __init__(self, ctx, loai, nhan, pham_vi):
        self.ctx, self.loai, self.nhan, self.pv = ctx, loai, nhan, pham_vi
        self.khoa = khoa_ung_vien(nhan)
        self.form = 'form_sua' if pham_vi == 'sua' else 'form_them'
        # 'hop' = hộp thoại thao tác mở từ một dòng; DOM của nó cũng là `[role=dialog]`.
        self.trong_hop = pham_vi in ('them', 'sua', 'hop')

    # ── tra hồ sơ màn ────────────────────────────────────────────────────────
    def hang_so(self, *hau_to):
        """Hằng số đầu tiên tra được theo `<khoá>_<hậu tố>`. `None` nếu hồ sơ màn không khai."""
        for k in self.khoa:
            for h in hau_to:
                v = self.ctx.hs_so('%s_%s' % (k, h))
                if v is not None:
                    return v
        return None

    def loi(self, *hau_to):
        """Thông báo lỗi NGUYÊN VĂN cho ô này. `None` = hồ sơ màn không khai -> phép phải im."""
        for k in self.khoa:
            for h in hau_to:
                v = self.ctx.vb('loi_validate', '%s_%s' % (k, h))
                if isinstance(v, str) and v.strip():
                    return v.strip()
        return None

    @property
    def bat_buoc_theo_ho_so(self):
        """Ô này có trong danh sách bắt buộc của hồ sơ màn? `None` = hồ sơ màn không khai."""
        ds = self.ctx.vb(self.form, 'o_bat_buoc') or self.ctx.vb('form_them', 'o_bat_buoc')
        if not ds:
            return None
        return any(_n(self.nhan) == _n(x) for x in ds)

    def max_dom(self):
        v = self.hang_so('max_dom', 'maxlength')
        return int(v) if isinstance(v, (int, float)) else None

    def max_validate(self):
        v = self.hang_so('max_validate', 'max')
        return int(v) if isinstance(v, (int, float)) else None

    # ── đọc trên màn ─────────────────────────────────────────────────────────
    def doc(self):
        return hd.tim_control(self.ctx.c, self.nhan, self._pv_dom())

    def _pv_dom(self):
        return 'hop' if self.trong_hop else 'man'

    def dien(self, gia_tri, blur=True):
        return ui.dien(self.ctx.c, self.nhan, gia_tri, self._pv_dom(), blur=blur)

    def dan(self, gia_tri):
        return ui.dan(self.ctx.c, self.nhan, gia_tri, self._pv_dom())


# ══════════════════════════════════════════════════════════════════════════════
# 2. KỲ VỌNG ĐỌC TỪ CỘT D
# ══════════════════════════════════════════════════════════════════════════════
# Cột D của bộ case viết bằng lời văn, nhưng theo một số ít khuôn cố định. Đọc khuôn thì
# phép đo so được với màn thật; không đọc được khuôn nào thì phép trả `None` — luật ①.
_RX_NHAY_D = re.compile(r'["“”]([^"“”]{2,160})["“”]')


_RX_O_KHAC = re.compile(r'Kh[áa]c\s+c[áa]c\s+[^()]{0,60}?c[òo]n\s+l[ạa]i[^()]{0,40}'
                        r'\([^)]*\)', re.I)


def _bo_menh_de_o_khac(d):
    """Bỏ mệnh đề cột D nói về Ô KHÁC, không về ô đang đo. -> chuỗi đã cắt.

    ⚠️ VÁ 18/09. Cột D của r299/r453 mở đầu bằng *"Khác các ô chữ còn lại của biểu mẫu (hệ
    thống không cho nhập quá 250 ký tự), ô này không khai giới hạn nào…"*. Mệnh đề trong
    ngoặc tả CÁC Ô KHÁC, nhưng `ky_vong` đọc cả câu nên bắt được *"không cho nhập"* và chốt
    `chan=True` — tức kỳ vọng ngược hẳn với điều cột D nói về chính ô này. Hậu quả đo được:
    phép `truong_do_dai` không thấy ngưỡng nào, không thấy `khong_chan`, và bỏ cuộc câm.
    """
    return _RX_O_KHAC.sub(' ', d or '')


def ky_vong(d):
    """Cột D -> {'trong','goi_y','bao_loi','thanh_cong','khong_chan','tich',…}. Toàn `None` là
    không đọc được khuôn nào."""
    d = _bo_menh_de_o_khac(d)
    nd = _n(d)
    nhay = _RX_NHAY_D.findall(d or '')
    r = {'trong': None, 'goi_y': None, 'bao_loi': None, 'thanh_cong': None,
         'khong_chan': None, 'tich': None, 'chan': None, 'nhan_duoc': None, 'chuoi': nhay}
    if _bat_ky(nd, 'mac dinh la trong', 'mac dinh trong', 'de trong', 'la trong,', 'trong,'):
        r['trong'] = True
    if _bat_ky(nd, 'chu goi y', 'goi y', 'placeholder') and nhay:
        r['goi_y'] = nhay[-1]
    if _bat_ky(nd, 'thong bao loi', 'thong bao noi', 'canh bao', 'bao loi') and nhay:
        r['bao_loi'] = nhay[0]
    if _bat_ky(nd, 'luu thanh cong', 'thanh cong', 'gui thanh cong', 'qua duoc buoc',
               'thuc hien thanh cong'):
        r['thanh_cong'] = True
    if _bat_ky(nd, 'khong bat buoc', 'khong co thong bao loi nao', 'khong bao loi',
               'khong chan', 'khong gioi han', 'giao dien khong chan',
               # Cột D viết *"ô này KHÔNG KHAI giới hạn nào: NHẬN TRỌN 5.000 ký tự"* — cùng
               # một ý "không chặn" nhưng không lọt khuôn nào ở trên (VÁ 18/09).
               'khong khai gioi han', 'khong dat gioi han', 'khong co gioi han',
               'nhan tron', 'nhan du', 'nhan het'):
        r['khong_chan'] = True
    if _bat_ky(nd, 'khong tich chon', 'bo tich chon', 'khong duoc tich'):
        r['tich'] = False
    elif _bat_ky(nd, 'duoc tich chon', 'tich chon checkbox', 'da tich'):
        r['tich'] = True
    if _bat_ky(nd, 'khong cho nhap', 'chi nhan chu so', 'khong vao duoc o',
               'khong the nhap', 'bi chan'):
        r['chan'] = True
    if _bat_ky(nd, 'o nhan', 'nhan gia tri', 'nhan so', 'hien thi binh thuong',
               'dan thanh cong', 'nhan nhieu dong'):
        r['nhan_duoc'] = True
    return r


def _ten_form(t):
    return {'them': 'biểu mẫu Thêm mới', 'sua': 'biểu mẫu Chỉnh sửa',
            'hop': 'hộp thoại thao tác'}.get(t.pv, 'màn')


def _du_kien_chung(t, x=None):
    return {'o': t.nhan, 'loai': t.loai, 'pham_vi': t.pv, 'khoa_tra': t.khoa[:3],
            'doc_duoc': x}


# ══════════════════════════════════════════════════════════════════════════════
# 3. DỰNG BỐI CẢNH — mở đúng chỗ mà case nói tới
# ══════════════════════════════════════════════════════════════════════════════
class BoiCanh:
    """Mở biểu mẫu / màn theo đúng cột C rồi đóng lại khi xong.

        with BoiCanh(ctx, case, truong) as bc:
            if not bc.san_sang: return None
            ...

    Cột C của nhiều màn có bước riêng để vào biểu mẫu (`Bấm "Tạo báo cáo" để vào Bước 1`,
    `Mở một bộ danh mục … Bấm nút "Thêm phần tử"`). Chạy CHÍNH những bước ấy bằng
    `hanh_dong` thay vì đoán một nút `Thêm mới` chung — đoán thì mọi màn nhiều bước đều hỏng.
    """

    def __init__(self, ctx, case, truong, can_ban_ghi=False):
        self.ctx, self.case, self.t = ctx, case, truong
        self.can_ban_ghi = can_ban_ghi
        self.san_sang = False
        self.ban_ghi = None
        self.buoc_da_chay = []
        self.con_lai = []
        self.ly_do = ''

    def __enter__(self):
        ctx, t = self.ctx, self.t
        try:
            if t.trong_hop:
                self._mo_bieu_mau()
            else:
                ctx.ve_danh_sach()
                self.san_sang = True
        except Exception as e:
            self.ly_do = '%s: %s' % (type(e).__name__, str(e)[:160])
            self.san_sang = False
        return self

    def _mo_bieu_mau(self):
        ctx, t, case = self.ctx, self.t, self.case
        if t.pv in ('sua', 'hop') or self.can_ban_ghi:
            self.ban_ghi = ctx.ban_ghi(case)
        if t.pv == 'hop':
            self._mo_hop_theo_dong()
            return
        if t.pv == 'sua':
            if not ctx.hien_ban_ghi_qa(self.ban_ghi['ma']):
                self.ly_do = 'không thấy bản ghi QA trên danh sách để mở Chỉnh sửa'
                return
            from phep_live import _icon_sua
            r = ui.mo_hop_theo_dong(ctx.c, self.ban_ghi['ma'], _icon_sua(ctx))
            self.san_sang = bool(isinstance(r, dict) and r.get('ok'))
            if not self.san_sang:
                self.ly_do = 'không mở được biểu mẫu Chỉnh sửa của bản ghi QA'
            return
        # ── THÊM MỚI: chạy đúng những bước MỞ mà cột C mô tả, rồi mới rơi về nút mặc định
        ds = hd.dich(self.case.c, 'man')
        mo = [x for x in ds if x.get('loai') == 'click' and not x.get('ghi')]
        for x in mo:
            hd.thuc_thi(ctx.c, x, ctx)
            time.sleep(0.7)
            self.buoc_da_chay.append(x)
            if ui.co_hop_thoai(ctx.c):
                break
        if not ui.hop_cua_ta_con_mo(ctx.c):
            ui.mo_hop(ctx.c, ctx.nut_them())
        self.san_sang = bool(ui.co_hop_thoai(ctx.c))
        if not self.san_sang:
            self.ly_do = ('không mở được biểu mẫu Thêm mới (đã thử %d bước của cột C rồi nút %r)'
                          % (len(mo), ctx.nut_them()))

    def _mo_hop_theo_dong(self):
        """Mở hộp thoại THAO TÁC (Từ chối · Ngừng dùng · Chuyển trạng thái) của bản ghi QA.

        Nút mở nằm TRONG dòng, và phải là dòng của bản ghi QA — không bao giờ dòng đầu tiên.
        Tên nút lấy từ chính cột C (bước mở), rồi mới rơi về tên khối CN. Không đoán một tên
        chung: mỗi màn đặt một chữ khác nhau và bấm nhầm icon trong dòng là thao tác lên
        đúng bản ghi nhưng SAI việc.
        """
        ctx, case = self.ctx, self.case
        ma = self.ban_ghi['ma']
        if not ctx.hien_ban_ghi_qa(ma):
            self.ly_do = 'không thấy bản ghi QA %s trên danh sách' % ma
            return
        ten_nut = []
        for x in hd.dich(case.c, 'man'):
            if x.get('loai') == 'click' and x.get('muc_tieu'):
                ten_nut.append(x['muc_tieu'])
        cn = (case.nhom.get('cn') or '').split('\n')[0]
        cn = re.sub(r'^[A-ZĐÀ-Ỹ\s]*?(?=[A-ZĐÀ-Ỹ])', '', cn).strip()
        if cn:
            ten_nut.append(cn.title())
        for nut in ten_nut:
            r = ui.bam_trong_dong(ctx.c, ma, nut)
            if r and r.get('ok'):
                time.sleep(1.0)
                if ui.co_hop_thoai(ctx.c):
                    self.san_sang = True
                    return
        co = ui.control_trong_dong(ctx.c, 0)
        self.ly_do = ('không mở được hộp thao tác của bản ghi QA (đã thử: %s). Nút trong dòng: %s'
                      % (' · '.join(ten_nut[:4]) or 'không có tên nào trong cột C',
                         ' · '.join(x['nhan'] for x in (co or []) if x.get('nhan'))[:200]))

    def __exit__(self, et, ev, tb):
        try:
            if ui.co_hop_thoai(self.ctx.c):
                ui.dong_hop(self.ctx.c)
            self.ctx.ve_danh_sach()
        except Exception:
            pass
        return False

    def nut_chot(self):
        """Chữ trên nút chốt mà CỘT C bảo bấm; không có thì lấy nút của hồ sơ màn."""
        for x in hd.dich(self.case.c, 'hop'):
            if x.get('loai') == 'click' and x.get('ghi') and x.get('muc_tieu'):
                return x['muc_tieu']
        return (self.ctx.nut_luu_sua() if self.t.pv == 'sua' else self.ctx.nut_luu_them())

    def dien_phan_con_lai(self, tru=()):
        """Điền các ô BẮT BUỘC khác để bước chốt không trượt vì một ô khác còn trống."""
        ctx = self.ctx
        bo = {_n(x) for x in tru}
        ds = ctx.vb(self.t.form, 'o_bat_buoc') or ctx.vb('form_them', 'o_bat_buoc') or []
        ma, ten = ctx.so.cap_ma()
        ra = {}
        for i, nhan in enumerate(ds):
            if _n(nhan) in bo:
                continue
            x = hd.tim_control(ctx.c, nhan, 'hop')
            if not x:
                continue
            if str(x.get('the', '')).startswith('select') or x.get('loai') == 'combobox':
                continue                     # ô chọn: để phép chuyên biệt lo, không đoán giá trị
            ra[nhan] = ui.dien(ctx.c, nhan, (ma if i == 0 else '%s %d' % (ten, i)), 'hop')
        return ra


# ══════════════════════════════════════════════════════════════════════════════
# 4. PHÉP ĐO — Ô NHẬP CỦA BIỂU MẪU (textbox · textarea · số)
# ══════════════════════════════════════════════════════════════════════════════
_LOAI_O_NHAP = ('textbox', 'textarea')


def _la_o_nhap(cs):
    l, _ = truong_cua(cs)
    return l in _LOAI_O_NHAP and pv_form(cs) in ('them', 'sua', 'hop')


@phep('truong_mac_dinh')
@nhan_dien(lambda cs: _la_o_nhap(cs) and _co(_n(cs.b), 'gia tri mac dinh'))
def p_mac_dinh(case, ctx):
    """Ô của biểu mẫu khi vừa mở: giá trị + chữ gợi ý, so với cột D."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    kv = ky_vong(case.d)
    # ⚠️ VÁ 2026-09-17 lượt 2. Cột D dạng *"Mặc định là dữ liệu từ DB"* không nói ô phải TRỐNG
    # hay phải có chữ gợi ý nào — nó nói NGUỒN của giá trị mặc định. Giao diện đọc được giá
    # trị ấy là gì, nhưng không đọc được nó đến TỪ ĐÂU; khẳng định "đúng, lấy từ DB" bằng một
    # phép đo UI là bịa bằng chứng. Đây đúng là lớp case §4b: kết luận PE kèm giá trị quan sát
    # được, KHÔNG phải CHƯA ĐO — người chạy biết phải đối chiếu CSDL, chứ không phải đi tìm
    # xem tool thiếu gì.
    tu_db = qalib.chua_tu(case.d or '', 'du lieu tu db', 'lay tu db', 'tu database',
                          'du lieu tu database')
    if kv['trong'] is None and kv['goi_y'] is None and not tu_db:
        return None
    with BoiCanh(ctx, case, t) as bc:
        if not bc.san_sang:
            return None
        x = t.doc()
        if not x:
            return _khong_thay(t, ctx)
        gt = (x.get('gia_tri') or '').strip()
        goi = (x.get('goi_y') or '').strip()
    if kv['trong'] is None and kv['goi_y'] is None and tu_db:
        du = _du_kien_chung(t, x)
        du['muc_bang_chung'] = 'UI (giá trị) — nguồn dữ liệu cần đối chiếu CSDL'
        return 'PE', ('Mở %s: ô "%s" mặc định %r. Cột D đòi giá trị này đến TỪ CSDL — giao '
                      'diện không chứng minh được nguồn, cần đối chiếu CSDL.'
                      % (_ten_form(t), nhan, gt or '(trống)')), du
    du = _du_kien_chung(t, x)
    loi = []
    if kv['trong'] and gt:
        loi.append('ô KHÔNG trống, đang có sẵn %r' % gt[:60])
    if kv['goi_y'] and _n(kv['goi_y']) not in _n(goi):
        loi.append('chữ gợi ý là %r, cột D đòi %r' % (goi[:60], kv['goi_y'][:60]))
    if loi:
        return 'F', ('Mở %s: ô "%s" — %s.' % (_ten_form(t), nhan, ' · '.join(loi))), du
    ta = []
    if kv['trong']:
        ta.append('trống')
    if kv['goi_y']:
        ta.append('chữ gợi ý %r' % goi[:60])
    return 'P', ('Mở %s: ô "%s" đúng như cột D — %s.'
                 % (_ten_form(t), nhan, ' · '.join(ta))), du


def _khong_thay(t, ctx):
    """Không định vị được ô — NÊU RA những ô thật sự có, rồi mới kết luận (luật ③ §hanh_dong).

    Kết luận `F` ở đây là kết luận về BỘ CASE (case nói tới một ô màn không có), nên phải
    kèm danh sách ô thật; không kèm thì người đọc không phân biệt được với lỗi bộ dò.
    """
    co = hd.liet_ke_control(ctx.c, t._pv_dom())
    if not co:
        return None                 # đọc hỏng hoàn toàn -> CHƯA ĐO, không phải F
    khong = [str(x) for x in (ctx.khong_co or [])]
    if any(_n(t.nhan) in _n(x) for x in khong):
        return 'F', ('Màn KHÔNG có ô "%s" — hồ sơ màn đã ground sẵn ở `grounding.khong_co`. '
                     'Đề nghị BA sửa đặc tả, không phải lỗi đo.' % t.nhan), \
            {'o': t.nhan, 'o_that_su_co': co[:20], 'khong_co': khong[:6]}
    return 'F', ('Không thấy ô "%s" trên %s. Ô đang có: %s.'
                 % (t.nhan, 'biểu mẫu' if t.trong_hop else 'màn',
                    ' · '.join(co[:14]))), {'o': t.nhan, 'o_that_su_co': co[:20]}


@phep('truong_bat_buoc', can_ghi=True)
@nhan_dien(lambda cs: _la_o_nhap(cs) and _bat_ky(
    _n(cs.b), 'la truong bat buoc', 'khi de trong', 'khi xoa rong', 'khong nhap'))
def p_bat_buoc(case, ctx):
    """Để trống ô rồi bấm nút chốt — so với cột D (báo lỗi nguyên văn, hay vẫn qua)."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    kv = ky_vong(case.d)
    cau = kv['bao_loi'] or t.loi('rong', 'bat_buoc', 'trong')
    doi_chan = bool(cau) or kv['thanh_cong'] is not True
    if cau is None and kv['khong_chan'] is None and kv['thanh_cong'] is None:
        return None                       # cột D không nói gì đo được
    with BoiCanh(ctx, case, t, can_ban_ghi=True) as bc:
        if not bc.san_sang:
            return None
        if not t.doc():
            return _khong_thay(t, ctx)
        t.dien('')
        bc.dien_phan_con_lai(tru=[nhan])
        nut = bc.nut_chot()
        mang = _bam_chot(ctx, case, bc, nut, 'validate ô %s để trống' % nhan)
        loi = ui.doc_loi(ctx.c, 'hop')
        con_mo = ui.co_hop_thoai(ctx.c)
        tb = ui.doc_thong_bao(ctx.c)
    du = _du_kien_chung(t, {'loi_doc_duoc': loi[:4], 'thong_bao': tb[:3],
                            'hop_con_mo': con_mo, 'cau_verbatim': cau, 'mang': mang,
                            'bat_buoc_ho_so': t.bat_buoc_theo_ho_so})
    if cau:
        khop = any(_n(cau) in _n(x) for x in loi + tb)
        if khop:
            return 'P', ('Để trống ô "%s" rồi bấm "%s": hiện đúng thông báo nguyên văn "%s".'
                         % (nhan, nut, cau)), du
        if not con_mo:
            return 'F', ('Để trống ô bắt buộc "%s" mà hệ thống VẪN chấp nhận — biểu mẫu đóng, '
                         'không có thông báo lỗi nào.' % nhan), du
        return 'F', ('Để trống ô "%s" rồi bấm "%s": KHÔNG thấy thông báo nguyên văn "%s" '
                     '(đọc được: %s).' % (nhan, nut, cau, ' | '.join((loi + tb)[:2]) or 'không có')), du
    # cột D nói ô KHÔNG bắt buộc -> kỳ vọng là qua được
    if kv['khong_chan'] or kv['thanh_cong']:
        if not con_mo and not loi:
            return 'P', ('Để trống ô "%s" rồi bấm "%s": hệ thống chấp nhận, không báo lỗi — '
                         'đúng cột D (ô không bắt buộc).' % (nhan, nut)), du
        return 'F', ('Cột D nói ô "%s" KHÔNG bắt buộc, nhưng để trống rồi bấm "%s" thì %s.'
                     % (nhan, nut,
                        ('hiện lỗi: ' + ' | '.join(loi[:2])) if loi else 'biểu mẫu không đóng')), du
    return None


def _bam_chot(ctx, case, bc, nut, mo_ta):
    """Bấm nút chốt TRONG cửa sổ ghi. Trả sổ request quan sát được, hoặc `None` nếu không bấm.

    Một cú bấm nút chốt luôn là thao tác ghi — kể cả khi ta *mong* nó bị validate chặn:
    validate hỏng thì bản ghi được tạo thật. Nên đường này không có nhánh nào bỏ qua cổng.
    """
    ma = (bc.ban_ghi or {}).get('ma') if bc.ban_ghi else None
    if ma is None:
        m = ctx.ban_ghi(case)
        ma = m['ma']
        bc.ban_ghi = m
    hanh = 'tao' if bc.t.pv == 'them' else 'sua'
    try:
        with ctx.ghi(case, hanh, ma, mo_ta=mo_ta) as cs:
            ui.bam_ghi(ctx.c, nut, cs.giay_phep, 'hop', cho=2.0, thuc=True)
        return {'so_request_ghi': len(cs.cs.da_dung) if cs.cs else 0}
    except Exception as e:
        return {'loi': '%s: %s' % (type(e).__name__, str(e)[:160])}


@phep('truong_do_dai', can_ghi=True)
@nhan_dien(lambda cs: _la_o_nhap(cs) and _bat_ky(
    _n(cs.b), 'nhap vuot do dai cho phep', 'nhap trong do dai cho phep', 'vuot qua do dai',
    'nhap dung hoac duoi nguong do dai cho phep', 'duoi nguong do dai cho phep'))
def p_do_dai(case, ctx):
    """Dán chuỗi dài hơn / đúng bằng ngưỡng rồi đo ô nhận được bao nhiêu ký tự."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    vuot = _co(_n(case.b), 'vuot')
    kv = ky_vong(case.d)
    gh = t.max_validate() or t.max_dom()
    khong_gh = isinstance(t.hang_so('max_dom', 'maxlength'), str)   # hồ sơ khai "KHÔNG đặt"
    if gh is None and not khong_gh and not kv['khong_chan']:
        return bo_qua(ctx, 'không có ngưỡng độ dài nào để đo', truong=nhan, loai=loai,
                      max_validate=t.max_validate(), max_dom=t.max_dom(),
                      ho_so_khai_khong_dat=khong_gh, ky_vong_khong_chan=kv['khong_chan'])
    # ⚠️ VÁ 18/09. Cột C của case này nêu ĐÍCH DANH độ dài phải dán (*"một chuỗi 5.000 ký
    # tự"*), còn bản trước rơi về hằng số 1200 của tool khi hồ sơ màn không khai giới hạn —
    # tức đo một ca KHÁC ca mà case mô tả. Con số của case luôn thắng con số của tool.
    m_c = re.search(r'(\d[\d.,]*)\s*k[ýy]\s*t[ựu]', case.c or '')
    n_case = int(re.sub(r'[^\d]', '', m_c.group(1))) if m_c else None
    n_dai = n_case or (int(gh) + 1 if (vuot and gh) else (int(gh) if gh else 1200))
    chuoi = 'A' * n_dai
    with BoiCanh(ctx, case, t, can_ban_ghi=True) as bc:
        if not bc.san_sang:
            return bo_qua(ctx, 'không dựng được bối cảnh biểu mẫu: %s' % (bc.ly_do or '?'),
                          truong=nhan, loai=loai, pv=t.pv, so_ky_tu_se_dan=n_dai)
        if not t.doc():
            return _khong_thay(t, ctx)
        x = t.dan(chuoi) or t.dien(chuoi)
        do_dai = (x or {}).get('do_dai')
        maxlen = (x or {}).get('maxlength')
        if do_dai is None:
            return bo_qua(ctx, 'dán/điền xong nhưng không đọc lại được độ dài của ô',
                          truong=nhan, loai=loai, ket_qua_dan=x, so_ky_tu_da_dan=n_dai,
                          loi_tren_hop=ui.doc_loi(ctx.c, 'hop')[:3])
        du = _du_kien_chung(t, {'gui': len(chuoi), 'o_nhan': do_dai, 'maxlength_dom': maxlen,
                                'gioi_han_ho_so': gh, 'do_dai_cot_C': n_case,
                                'loi_tren_hop': ui.doc_loi(ctx.c, 'hop')[:3]})
        if vuot:
            if gh and do_dai <= int(gh):
                return 'P', ('Dán %d ký tự vào ô "%s": ô chỉ nhận %d — hệ thống chặn đúng '
                             'giới hạn %s.' % (len(chuoi), nhan, do_dai, gh)), du
            if kv['khong_chan']:
                return ('P', ('Dán %d ký tự vào ô "%s": ô nhận đủ %d ký tự, giao diện không '
                              'chặn — đúng cột D.' % (len(chuoi), nhan, do_dai)), du)
            if gh:
                return 'F', ('Dán %d ký tự vào ô "%s": ô nhận %d ký tự, VƯỢT giới hạn %s mà '
                             'giao diện không chặn.' % (len(chuoi), nhan, do_dai, gh)), du
            return bo_qua(ctx, 'ô nhận %d/%d ký tự nhưng không có ngưỡng nào để đối chiếu '
                               '— cột D không nói "không chặn", hồ sơ màn không khai giới hạn'
                               % (do_dai, len(chuoi)), **du)
        # ── nhập ĐÚNG BẰNG ngưỡng: phải nhận đủ rồi lưu được
        if gh and do_dai < int(gh):
            return 'F', ('Nhập đúng %d ký tự (bằng giới hạn) vào ô "%s" mà ô chỉ nhận %d.'
                         % (int(gh), nhan, do_dai)), du
        if kv['thanh_cong'] is not True:
            return 'P', ('Nhập %d ký tự (đúng giới hạn %s) vào ô "%s": ô nhận đủ.'
                         % (do_dai, gh, nhan)), du
        bc.dien_phan_con_lai(tru=[nhan])
        nut = bc.nut_chot()
        mang = _bam_chot(ctx, case, bc, nut, 'lưu với ô %s dài đúng ngưỡng' % nhan)
        loi = ui.doc_loi(ctx.c, 'hop')
        con_mo = ui.co_hop_thoai(ctx.c)
        du['sau_khi_luu'] = {'loi': loi[:3], 'hop_con_mo': con_mo, 'mang': mang}
        if not con_mo and not loi:
            return 'P', ('Nhập %d ký tự (đúng giới hạn %s) vào ô "%s" rồi bấm "%s": lưu thành '
                         'công.' % (do_dai, gh, nhan, nut)), du
        return 'F', ('Nhập đúng giới hạn %s ký tự vào ô "%s" rồi bấm "%s" mà KHÔNG lưu được '
                     '(%s).' % (gh, nhan, nut, ' | '.join(loi[:2]) or 'biểu mẫu không đóng')), du


# ── nhập giá trị đặc biệt: 0 · số âm · thập phân · quá 18 chữ số · chữ · ký tự đặc biệt ──
_GT_MAU = (
    ('nhap gia tri = 0', '0', 'giá trị 0'),
    ('nhap 0 vao', '0', 'giá trị 0'),
    ('nhap so am', '-5', 'số âm -5'),
    ('nhap so thap phan', '1.5', 'số thập phân 1.5'),
    ('nhap qua 18 chu so', '1' * 20, 'số 20 chữ số'),
    ('nhap chu va ky tu dac biet', 'abc@#$%', 'chữ và ký tự đặc biệt'),
    ('nhap ky tu khac so', 'abc@#', 'ký tự khác số'),
    ('nhap ky tu dac biet', '<b>x</b> @#$%^&*', 'ký tự đặc biệt + thẻ html'),
    ('nhap tieng viet co dau', 'Nguồn dữ liệu Đào tạo', 'tiếng Việt có dấu'),
    ('nhap so', '1234567', 'chuỗi chỉ gồm chữ số'),
    ('nhap nhieu dong', 'dòng 1\ndòng 2\ndòng 3', 'nhiều dòng'),
    ('cat khoang trang hai dau', '   giá trị QA   ', 'chuỗi có khoảng trắng hai đầu'),
    ('copy du lieu dan vao o', 'Chuỗi QA 123', 'chuỗi dán từ nơi khác'),
    ('copy noi dung du lieu, dan vao o', 'Chuỗi QA 123', 'chuỗi dán từ nơi khác'),
)


def _mau_gia_tri(case):
    nb = _n(case.b)
    for k, v, mo_ta in _GT_MAU:
        if k in nb:
            return v, mo_ta
    return None, None


@phep('truong_nhap_gia_tri', can_ghi=False)
@nhan_dien(lambda cs: _la_o_nhap(cs) and _mau_gia_tri(cs)[0] is not None)
def p_nhap_gia_tri(case, ctx):
    """Gõ/dán một giá trị mẫu vào ô rồi ĐỌC LẠI ô — đo xem giao diện nhận hay chặn.

    Không bấm nút chốt: mọi case nhóm này (cột D) chỉ nói về **ô có nhận giá trị không**.
    Case nào đòi *"lưu rồi mở lại xem"* thì phần lưu do phép `truong_luu_mo_lai` lo — tách
    ra để case chỉ-đọc không phải xin quyền ghi.
    """
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    gt, mo_ta = _mau_gia_tri(case)
    kv = ky_vong(case.d)
    if kv['nhan_duoc'] is None and kv['chan'] is None:
        return None
    dan = _bat_ky(_n(case.b), 'copy', 'dan vao o')
    with BoiCanh(ctx, case, t) as bc:
        if not bc.san_sang:
            return None
        x0 = t.doc()
        if not x0:
            return _khong_thay(t, ctx)
        t.dien('')
        x = (t.dan(gt) if dan else t.dien(gt, blur=False))
        if x is None:
            return None
        doc_lai = (x.get('gia_tri') or '')
    du = _du_kien_chung(t, {'gui': gt, 'o_giu': doc_lai, 'do_dai': x.get('do_dai'),
                            'the': x0.get('the'), 'maxlength': x0.get('maxlength')})
    giu_nguyen = doc_lai.strip() == gt.strip() or doc_lai == gt
    if kv['chan']:
        if not giu_nguyen:
            return 'P', ('Gõ %s vào ô "%s": ô KHÔNG nhận nguyên chuỗi (giữ %r) — đúng cột D.'
                         % (mo_ta, nhan, doc_lai[:60])), du
        return 'F', ('Gõ %s vào ô "%s" mà ô nhận nguyên %r — cột D đòi phải chặn.'
                     % (mo_ta, nhan, doc_lai[:60])), du
    if giu_nguyen:
        return 'P', ('%s %s vào ô "%s": ô nhận và hiển thị đúng nguyên chuỗi.'
                     % ('Dán' if dan else 'Gõ', mo_ta, nhan)), du
    # ô cắt bớt: có thể ĐÚNG (ô số chỉ nhận số) — chỉ chấm F khi cột D đòi nhận nguyên
    the = str(x0.get('the') or '')
    if 'number' in the or 'date' in the:
        return 'P', ('%s %s vào ô "%s" (ô kiểu %s): ô giữ %r — giao diện lọc theo kiểu ô.'
                     % ('Dán' if dan else 'Gõ', mo_ta, nhan, the, doc_lai[:60])), du
    return 'F', ('%s %s vào ô "%s" mà ô chỉ giữ %r — cột D đòi ô nhận và hiển thị bình thường.'
                 % ('Dán' if dan else 'Gõ', mo_ta, nhan, doc_lai[:60])), du


# ══════════════════════════════════════════════════════════════════════════════
# 5. CHECKBOX / SWITCH
# ══════════════════════════════════════════════════════════════════════════════
def _la_tich(cs):
    l, _ = truong_cua(cs)
    return l == 'tich'


@phep('o_tich_mac_dinh')
@nhan_dien(lambda cs: _la_tich(cs) and _co(_n(cs.b), 'gia tri mac dinh'))
def p_tich_mac_dinh(case, ctx):
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    kv = ky_vong(case.d)
    if kv['tich'] is None:
        return None
    with BoiCanh(ctx, case, t) as bc:
        if not bc.san_sang:
            return None
        x = hd.doc_tich(ctx.c, nhan, t._pv_dom())
        if not x:
            return _khong_thay(t, ctx)
    du = _du_kien_chung(t, x)
    if bool(x.get('tich')) == bool(kv['tich']):
        return 'P', ('Mở %s: ô "%s" mặc định %s — đúng cột D.'
                     % (_ten_form(t), nhan,
                        'ĐƯỢC tích' if kv['tich'] else 'KHÔNG tích')), du
    return 'F', ('Mở %s: ô "%s" mặc định %s, cột D đòi %s.'
                 % (_ten_form(t), nhan,
                    'ĐƯỢC tích' if x.get('tich') else 'KHÔNG tích',
                    'ĐƯỢC tích' if kv['tich'] else 'KHÔNG tích')), du


@phep('o_tich_thao_tac')
@nhan_dien(lambda cs: _la_tich(cs) and _bat_ky(
    _n(cs.b), 'tich chon', 'bo tich chon', 'click vao o hoac nhan', 'click vao o',
    'dung ban phim'))
def p_tich_thao_tac(case, ctx):
    """Tích / bỏ tích / bấm vào nhãn / bằng bàn phím — đo trạng thái TRƯỚC và SAU."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    nb = _n(case.b)
    ban_phim = _co(nb, 'ban phim')
    bam_nhan = _co(nb, 'click vao o hoac nhan') or _co(nb, 'click vao o')
    muon_bat = not _co(nb, 'bo tich')
    with BoiCanh(ctx, case, t) as bc:
        if not bc.san_sang:
            return None
        pv = t._pv_dom()
        truoc = hd.doc_tich(ctx.c, nhan, pv)
        if not truoc:
            return _khong_thay(t, ctx)
        if ban_phim:
            ok_tab = _tab_toi_o(ctx.c, nhan, pv)
            ui.go_phim(ctx.c, 'Space')
            time.sleep(0.4)
            sau = hd.doc_tich(ctx.c, nhan, pv)
            du = _du_kien_chung(t, {'truoc': truoc, 'sau': sau, 'tab_toi_duoc': ok_tab})
            if not ok_tab:
                return 'F', ('Không Tab tới được ô "%s" — ô không nhận tiêu điểm bàn phím.'
                             % nhan), du
            if bool(sau.get('tich')) != bool(truoc.get('tich')):
                return 'P', ('Tab tới ô "%s" rồi nhấn phím cách: trạng thái đổi %s -> %s.'
                             % (nhan, truoc.get('tich'), sau.get('tich'))), du
            return 'F', ('Tab tới ô "%s" rồi nhấn phím cách mà trạng thái KHÔNG đổi (vẫn %s).'
                         % (nhan, truoc.get('tich'))), du
        if bam_nhan:
            a = hd._tich(ctx.c, nhan, not bool(truoc.get('tich')), pv)
            b = _bam_nhan_chu(ctx.c, nhan, pv)
            sau = hd.doc_tich(ctx.c, nhan, pv)
            du = _du_kien_chung(t, {'truoc': truoc, 'bam_o': a, 'bam_nhan': b, 'sau': sau})
            if a and a.get('truoc') != a.get('sau'):
                if b and b.get('ok') and b.get('truoc') != b.get('sau'):
                    return 'P', ('Ô "%s": bấm vào ô vuông đổi được trạng thái, bấm vào NHÃN CHỮ '
                                 'cũng đổi được.' % nhan), du
                return 'F', ('Ô "%s": bấm vào ô vuông đổi được trạng thái nhưng bấm vào NHÃN CHỮ '
                             'thì KHÔNG (%s).' % (nhan, (b or {}).get('ly_do') or 'không đổi')), du
            return 'F', ('Ô "%s": bấm vào ô vuông KHÔNG đổi được trạng thái.' % nhan), du
        x = hd._tich(ctx.c, nhan, muon_bat, pv)
        sau = hd.doc_tich(ctx.c, nhan, pv)
    du = _du_kien_chung(t, {'truoc': truoc, 'sau': sau, 'thao_tac': x})
    if sau and bool(sau.get('tich')) == muon_bat:
        return 'P', ('%s ô "%s": trạng thái sau thao tác đúng (%s).'
                     % ('Tích chọn' if muon_bat else 'Bỏ tích', nhan,
                        'đã tích' if muon_bat else 'không tích')), du
    return 'F', ('%s ô "%s" mà trạng thái KHÔNG đổi (vẫn %s).'
                 % ('Tích chọn' if muon_bat else 'Bỏ tích', nhan,
                    (sau or {}).get('tich'))), du


def _bam_nhan_chu(c, nhan, pv='auto'):
    """Bấm vào PHẦN CHỮ của nhãn (không phải ô vuông) — case *"click vào ô hoặc nhãn"*."""
    return ui._js(c, """
      const n=QN(%s), g=PV(%s);
      const ds=[...g.querySelectorAll('input[type=checkbox],[role=checkbox],[role=switch]')]
        .filter(HIEN);
      let e=ds.find(x=>QN(NHAN(x)).includes(n))||ds[0];
      if(!e) return JSON.stringify({ok:false, ly_do:'không thấy ô tích'});
      let lb=e.id?document.querySelector('label[for="'+CSS.escape(e.id)+'"]'):null;
      if(!lb){let p=e.parentElement;
        for(let k=0;k<4&&p&&!lb;k++,p=p.parentElement) lb=p.querySelector('label');}
      if(!lb) return JSON.stringify({ok:false, ly_do:'ô không có thẻ nhãn riêng'});
      const doc=()=>e.tagName==='INPUT'?!!e.checked
        :(e.getAttribute('aria-checked')==='true'||e.getAttribute('data-state')==='checked');
      const truoc=doc(); lb.click();
      return JSON.stringify({ok:true, nhan_chu:TXT(lb), truoc:truoc, sau:doc()});"""
                  % (_s(nhan), _s(pv)))


def _tab_toi_o(c, nhan, pv='auto', toi_da=40):
    """Tab từ đầu biểu mẫu cho tới khi tiêu điểm rơi vào ô `nhan`. -> True/False."""
    ui._js(c, "const g=PV(%s); const e=g.querySelector('input,button,select,textarea');"
              "if(e) e.focus(); return JSON.stringify(1);" % _s(pv))
    n = _n(nhan)
    for _ in range(toi_da):
        ui.go_phim(c, 'Tab', nghi=0.06)
        f = ui.phan_tu_dang_focus(c)
        if f and n and n in _n(f.get('nhan') or ''):
            return True
    return False


# ══════════════════════════════════════════════════════════════════════════════
# 6. Ô NGÀY (Datepicker)
# ══════════════════════════════════════════════════════════════════════════════
def _la_ngay(cs):
    l, _ = truong_cua(cs)
    return l == 'ngay'


@phep('ngay_mac_dinh')
@nhan_dien(lambda cs: _la_ngay(cs) and _co(_n(cs.b), 'gia tri mac dinh'))
def p_ngay_mac_dinh(case, ctx):
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    kv = ky_vong(case.d)
    if kv['trong'] is None:
        return None
    with BoiCanh(ctx, case, t) as bc:
        if not bc.san_sang:
            return None
        x = t.doc()
        if not x:
            return _khong_thay(t, ctx)
    gt = (x.get('gia_tri') or '').strip()
    the = str(x.get('the') or '')
    du = _du_kien_chung(t, x)
    native = 'date' in the
    if kv['trong'] and gt:
        return 'F', ('Mở biểu mẫu: ô ngày "%s" KHÔNG trống, đang có %r.' % (nhan, gt)), du
    return 'P', ('Mở biểu mẫu: ô ngày "%s" mặc định trống%s.'
                 % (nhan, ', dùng ô ngày của trình duyệt (%s)' % the if native else '')), du


@phep('ngay_go_ky_tu')
@nhan_dien(lambda cs: _la_ngay(cs) and _bat_ky(_n(cs.b), 'go ky tu la', 'nhap ky tu la',
                                               'go chu', 'nhap sai dinh dang'))
def p_ngay_go_la(case, ctx):
    """Gõ chữ/ký tự lạ vào ô ngày — ô ngày của trình duyệt chỉ nhận chữ số."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    with BoiCanh(ctx, case, t) as bc:
        if not bc.san_sang:
            return None
        x0 = t.doc()
        if not x0:
            return _khong_thay(t, ctx)
        t.dien('')
        x = t.dien('abc@#$', blur=False)
        doc_lai = (x or {}).get('gia_tri') or ''
    du = _du_kien_chung(t, {'the': x0.get('the'), 'gui': 'abc@#$', 'o_giu': doc_lai})
    if not doc_lai.strip():
        return 'P', ('Gõ chữ và ký tự đặc biệt vào ô ngày "%s": ô không nhận, giá trị vẫn '
                     'trống.' % nhan), du
    return 'F', ('Gõ chữ và ký tự đặc biệt vào ô ngày "%s" mà ô nhận %r.'
                 % (nhan, doc_lai[:40])), du


@phep('ngay_hop_lich')
@nhan_dien(lambda cs: _la_ngay(cs) and _bat_ky(_n(cs.b), 'hop lich', 'bang lich'))
def p_ngay_hop_lich(case, ctx):
    """Ô ngày có mở được bảng lịch không — đo bằng KIỂU Ô, không bằng ảnh chụp.

    Bảng lịch NATIVE của Chrome vẽ ngoài DOM của trang: không `querySelector` nào thấy nó,
    và chụp ảnh cũng không bắt được (lớp vẽ của trình duyệt nằm ngoài `captureScreenshot`).
    Nên phép này kết luận theo dữ kiện đo được — `input[type=date]` LÀ ô có bảng lịch của
    trình duyệt — và nói thẳng phần không đo được, thay vì chấm F cho một thứ không nhìn thấy.
    """
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    nd = _n(case.d)
    doi_native = _bat_ky(nd, 'bang lich cua trinh duyet', 'lich cua trinh duyet',
                         'khuon ngay/thang/nam', 'trinh duyet')
    with BoiCanh(ctx, case, t) as bc:
        if not bc.san_sang:
            return None
        x = t.doc()
        if not x:
            return _khong_thay(t, ctx)
        the = str(x.get('the') or '')
        native = 'date' in the
        hop_tuy_chinh = None
        if not native:
            ui._js(ctx.c, "const e=TIM(%s,%s); if(e) e.click(); return JSON.stringify(1);"
                   % (_s(nhan), _s(t._pv_dom())))
            time.sleep(0.6)
            hop_tuy_chinh = ui._js(ctx.c, """
              const ds=[...document.querySelectorAll('[role=dialog] table,[role=grid],'+
                '[class*=calendar i],[class*=datepicker i],[class*=rdp i]')].filter(HIEN);
              return JSON.stringify({co:ds.length>0, so:ds.length});""")
            ui.go_phim(ctx.c, 'Escape')
    du = _du_kien_chung(t, {'the': the, 'native': native, 'hop_tuy_chinh': hop_tuy_chinh})
    if native and doi_native:
        return 'P', ('Ô "%s" là ô ngày NATIVE của trình duyệt (`%s`) — biểu tượng lịch và bảng '
                     'lịch do chính Chrome vẽ, đúng cột D. (Bảng lịch native nằm ngoài DOM và '
                     'ngoài ảnh chụp nên phần "hiện tháng hiện tại" không đo bằng máy được.)'
                     % (nhan, the)), du
    if not native and hop_tuy_chinh and hop_tuy_chinh.get('co'):
        if doi_native:
            return 'F', ('Cột D đòi bảng lịch của TRÌNH DUYỆT nhưng ô "%s" là ô tuỳ chỉnh '
                         '(`%s`) và mở ra bảng lịch riêng của app.' % (nhan, the)), du
        return 'P', ('Bấm vào ô "%s": bảng lịch mở ra (%d khối lịch đọc được trên DOM).'
                     % (nhan, hop_tuy_chinh.get('so'))), du
    if not native:
        return 'F', ('Bấm vào ô "%s" (`%s`) mà KHÔNG mở ra bảng lịch nào đọc được trên DOM.'
                     % (nhan, the)), du
    return None


@phep('ngay_chon_ngay')
@nhan_dien(lambda cs: _la_ngay(cs) and _bat_ky(_n(cs.b), 'chon ngay bang', 'chon mot ngay',
                                               'nhap ... bang ban phim', 'bang ban phim'))
def p_ngay_chon(case, ctx):
    """Đặt một ngày vào ô rồi đọc lại — đo ô có giữ đúng ngày theo khuôn của nó không."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    with BoiCanh(ctx, case, t) as bc:
        if not bc.san_sang:
            return None
        x0 = t.doc()
        if not x0:
            return _khong_thay(t, ctx)
        the = str(x0.get('the') or '')
        mau = '2026-09-16' if 'date' in the else '16/09/2026'
        x = t.dien(mau)
        doc_lai = (x or {}).get('gia_tri') or ''
    du = _du_kien_chung(t, {'the': the, 'dat': mau, 'o_giu': doc_lai})
    if doc_lai:
        return 'P', ('Đặt ngày %s vào ô "%s" (`%s`): ô giữ đúng %r.'
                     % (mau, nhan, the, doc_lai)), du
    return 'F', ('Đặt ngày %s vào ô "%s" (`%s`) mà ô KHÔNG giữ giá trị nào.'
                 % (mau, nhan, the)), du


# ══════════════════════════════════════════════════════════════════════════════
# 7. Ô TÌM KIẾM Ở MỨC TRƯỜNG  (`Textbox Tìm theo …`)
# ══════════════════════════════════════════════════════════════════════════════
def _la_o_tim(cs):
    l, _ = truong_cua(cs)
    return l == 'o_tim'


def _nhan_o_tim(ctx, nhan):
    """Nhãn thật của ô tìm kiếm trên màn — tên nhóm là nhãn RÚT GỌN, placeholder mới là thật."""
    x = hd.tim_control(ctx.c, nhan, 'man')
    if x:
        return x.get('nhan') or x.get('goi_y') or nhan
    o = ctx.o_tim_kiem()
    return o or nhan


@phep('o_tim_mac_dinh')
@nhan_dien(lambda cs: _la_o_tim(cs) and _co(_n(cs.b), 'gia tri mac dinh'))
def p_o_tim_mac_dinh(case, ctx):
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    kv = ky_vong(case.d)
    goi_y_ho_so = ctx.vb('placeholder_tim')
    if kv['trong'] is None and not (kv['goi_y'] or goi_y_ho_so):
        return None
    ctx.ve_danh_sach()
    x = hd.tim_control(ctx.c, nhan, 'man')
    if not x:
        o = ctx.o_tim_kiem()
        x = hd.tim_control(ctx.c, o, 'man') if o else None
    if not x:
        return _khong_thay(t, ctx)
    gt = (x.get('gia_tri') or '').strip()
    goi = (x.get('goi_y') or '').strip()
    mong = kv['goi_y'] or goi_y_ho_so
    du = _du_kien_chung(t, x)
    loi = []
    if gt:
        loi.append('ô KHÔNG trống, đang có %r' % gt[:50])
    if mong and _n(mong) not in _n(goi):
        loi.append('chữ gợi ý là %r, kỳ vọng %r' % (goi[:60], mong[:60]))
    if loi:
        return 'F', ('Mở màn: ô tìm kiếm "%s" — %s.' % (nhan, ' · '.join(loi))), du
    return 'P', ('Mở màn: ô tìm kiếm "%s" trống, chữ gợi ý %r — đúng kỳ vọng.'
                 % (nhan, goi[:70])), du


@phep('o_tim_nhap')
@nhan_dien(lambda cs: _la_o_tim(cs) and _bat_ky(
    _n(cs.b), 'nhap ky tu dac biet', 'nhan so', 'copy noi dung du lieu, dan vao o',
    'copy du lieu dan vao o', 'nhap tieng viet co dau', 'nhap khoang trang'))
def p_o_tim_nhap(case, ctx):
    """Gõ/dán chuỗi vào ô tìm kiếm rồi đo: ô có nhận không · màn có vỡ không · có lọc không."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    nb = _n(case.b)
    if _co(nb, 'ky tu dac biet'):
        gt, mo_ta = '<script>alert(1)</script>', 'ký tự đặc biệt + thẻ script'
    elif _co(nb, 'nhan so'):
        gt, mo_ta = '123456', 'chuỗi chỉ gồm chữ số'
    elif _co(nb, 'tieng viet'):
        gt, mo_ta = 'Nguồn dữ liệu Đào tạo', 'tiếng Việt có dấu'
    elif _co(nb, 'khoang trang'):
        gt, mo_ta = '   ', 'toàn khoảng trắng'
    else:
        gt, mo_ta = 'Chuỗi QA 123', 'chuỗi dán từ nơi khác'
    dan = _co(nb, 'copy')
    ctx.ve_danh_sach()
    o = _nhan_o_tim(ctx, nhan)
    x = (ui.dan(ctx.c, o, gt, 'man') if dan else ui.dien(ctx.c, o, gt, 'man', blur=False))
    if x is None:
        return _khong_thay(t, ctx)
    time.sleep(max(1.0, float(ctx.hs_so('tim_kiem_debounce_ms', 0) or 0) / 1000.0 + 0.7))
    tt = ui.trang_thai_tai(ctx.c)
    loi_js = ui.doc_loi(ctx.c, 'man')
    hien_tho = _hien_tho_script(ctx.c, gt)
    ctx.ve_danh_sach()
    du = _du_kien_chung(t, {'o': o, 'gui': gt, 'o_giu': x.get('gia_tri'),
                            'trang_thai': tt, 'loi_tren_man': loi_js[:3],
                            'script_thuc_thi': hien_tho})
    giu = (x.get('gia_tri') or '')
    if hien_tho:
        return 'F', ('Dán %s vào ô tìm kiếm "%s": chuỗi được TRANG THỰC THI/chèn thẳng vào DOM '
                     '— lỗ XSS.' % (mo_ta, o)), du
    if giu.strip() != gt.strip() and gt.strip():
        return 'F', ('%s %s vào ô tìm kiếm "%s" mà ô chỉ giữ %r.'
                     % ('Dán' if dan else 'Gõ', mo_ta, o, giu[:60])), du
    return 'P', ('%s %s vào ô tìm kiếm "%s": ô nhận nguyên chuỗi, màn không lỗi, '
                 'danh sách còn %s dòng.'
                 % ('Dán' if dan else 'Gõ', mo_ta, o, (tt or {}).get('so_dong'))), du


def _hien_tho_script(c, chuoi):
    """Chuỗi tấn công có bị chèn THÔ vào DOM (thẻ thật) hay chỉ là chữ? -> True nếu thô."""
    if '<' not in chuoi:
        return False
    return bool(ui._js(c, """
      const co=[...document.querySelectorAll('script')].some(s=>/alert\\(1\\)/.test(s.textContent||''));
      const b=[...document.querySelectorAll('body *')].some(
        e=>e.tagName==='B'&&/^x$/.test(TXT(e)));
      return JSON.stringify(!!(co||b));"""))


# ══════════════════════════════════════════════════════════════════════════════
# 8. COMBOBOX CÓ Ô TÌM BÊN TRONG
# ══════════════════════════════════════════════════════════════════════════════
@phep('combobox_go_tim')
@nhan_dien(lambda cs: truong_cua(cs)[0] == 'chon' and _bat_ky(
    _n(cs.b), 'go khop toan bo', 'go khop mot phan', 'tim khong phan biet chu hoa',
    'go tu khoa khong khop'))
def p_combobox_tim(case, ctx):
    """Mở ô chọn, gõ vào ô tìm BÊN TRONG rồi đếm lựa chọn còn lại."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    nb = _n(case.b)
    with BoiCanh(ctx, case, t) as bc:
        if not bc.san_sang:
            return None
        pv = t._pv_dom()
        x = hd.tim_control(ctx.c, nhan, pv)
        if not x:
            return _khong_thay(t, ctx)
        mo = _mo_va_doc(ctx.c, nhan, pv)
        if not mo or not mo.get('option'):
            return None
        goc = [o['chu'] for o in mo['option'] if o.get('chu')]
        if not goc:
            return None
        mau = goc[0]
        if _co(nb, 'go khop mot phan'):
            tu = mau.split()
            go = (tu[-1] if len(tu) > 1 else mau[: max(2, len(mau) // 2)])
        elif _co(nb, 'khong phan biet chu hoa'):
            go = mau.upper() if mau.islower() else mau.lower()
        elif _co(nb, 'khong khop'):
            go = 'zzqakhongkhop'
        else:
            go = mau
        sau = _go_trong_o_chon(ctx.c, go)
        ui.go_phim(ctx.c, 'Escape')
    du = _du_kien_chung(t, {'tuy_chon_goc': goc[:8], 'go': go, 'con_lai': (sau or {}).get('chu'),
                            'co_o_tim': mo.get('co_o_tim')})
    if sau is None or not mo.get('co_o_tim'):
        return None
    con = sau.get('chu') or []
    if _co(nb, 'khong khop'):
        rong = ctx.vb('selectbox_khong_thay')
        if not con:
            return 'P', ('Gõ %r vào ô tìm trong "%s": không còn lựa chọn nào%s.'
                         % (go, nhan, ' (hiện %r)' % rong if rong else '')), du
        return 'F', ('Gõ %r (chắc chắn không khớp) vào ô tìm trong "%s" mà vẫn còn %d lựa chọn.'
                     % (go, nhan, len(con))), du
    if any(_n(mau) == _n(y) for y in con):
        return 'P', ('Gõ %r vào ô tìm trong "%s": lọc còn %d lựa chọn, vẫn có %r.'
                     % (go, nhan, len(con), mau)), du
    return 'F', ('Gõ %r vào ô tìm trong "%s" mà lựa chọn %r KHÔNG còn trong danh sách (còn: %s).'
                 % (go, nhan, mau, ' · '.join(con[:4]) or 'không có')), du


def _mo_va_doc(c, nhan, pv):
    """Mở ô chọn rồi đọc lựa chọn — dùng chung với `phep_live._mo_o_chon` nhưng không cần ctx."""
    x = ui._js(c, "const e=TIM(%s,%s); if(!e) return 'null'; e.click();"
                  "return JSON.stringify({the:e.tagName.toLowerCase()});" % (_s(nhan), _s(pv)))
    if not x:
        return None
    time.sleep(0.7)
    return ui._js(c, """
      const ds=[...document.querySelectorAll('[role=option],[role=menuitemradio],[cmdk-item]')]
        .filter(HIEN);
      return JSON.stringify({option:ds.map(o=>({chu:TXT(o)})),
        co_o_tim:[...document.querySelectorAll('[role=listbox] input,[cmdk-input],'+
          '[role=dialog] input[placeholder*="ìm"]')].filter(HIEN).length>0});""")


def _go_trong_o_chon(c, chuoi):
    """Gõ vào ô tìm BÊN TRONG danh sách lựa chọn đang mở rồi đọc lại danh sách."""
    ok = ui._js(c, """
      const e=[...document.querySelectorAll('[role=listbox] input,[cmdk-input],'+
        '[role=dialog] input[placeholder*="ìm"]')].filter(HIEN)[0];
      if(!e) return 'null'; e.focus(); set(e,%s); return JSON.stringify(1);""" % _s(chuoi))
    if not ok:
        return None
    time.sleep(0.8)
    return ui._js(c, """
      const ds=[...document.querySelectorAll('[role=option],[role=menuitemradio],[cmdk-item]')]
        .filter(HIEN);
      return JSON.stringify({chu:ds.map(TXT).filter(Boolean)});""")


# ══════════════════════════════════════════════════════════════════════════════
# 9. BREADCRUMB
# ══════════════════════════════════════════════════════════════════════════════
def _la_breadcrumb(cs):
    return _n(_nhom(cs)).startswith('breadcrumb')


@phep('breadcrumb_hien_thi')
@nhan_dien(lambda cs: _la_breadcrumb(cs) and _bat_ky(
    _n(cs.b), 'hien thi du cap', 'cap cuoi', 'nhan cap cuoi qua dai', 'hien thi'))
def p_breadcrumb(case, ctx):
    """Breadcrumb hiện đủ cấp / cấp cuối không bấm được / nhãn dài."""
    ctx.ve_danh_sach()
    bc = ui.doc_breadcrumb(ctx.c)
    if not bc or not bc.get('chang'):
        khong = [x for x in (ctx.khong_co or []) if 'readcrumb' in _n(x) or 'duong dan' in _n(x)]
        if khong:
            return 'F', ('Màn KHÔNG có breadcrumb — `grounding.khong_co` đã ground: %s. '
                         'Đề nghị BA sửa đặc tả.' % khong[0]), {'khong_co': khong}
        return None
    chang = bc['chang']
    nb = _n(case.b)
    mong = [x for x in ((ctx.vb('breadcrumb') or []) if isinstance(ctx.vb('breadcrumb'), list)
                        else [])]
    du = {'chang': [x['chu'] for x in chang], 'mong_doi': mong, 'txt': bc.get('txt')}
    if _co(nb, 'cap cuoi') and not _co(nb, 'qua dai'):
        cuoi = chang[-1]
        if not cuoi.get('href'):
            return 'P', ('Cấp cuối của breadcrumb (%r) KHÔNG phải liên kết — đúng khuôn.'
                         % cuoi['chu']), du
        return 'F', ('Cấp cuối của breadcrumb (%r) vẫn là liên kết (href=%s) — cấp đang đứng '
                     'không nên bấm được.' % (cuoi['chu'], cuoi['href'][:60])), du
    if _co(nb, 'qua dai'):
        cuoi = chang[-1]['chu']
        x = ui._js(ctx.c, """
          const n=QN(%s);
          const e=[...document.querySelectorAll('*')].filter(x=>x.children.length===0)
            .find(x=>QN(TXT(x))===n);
          if(!e) return 'null'; const s=getComputedStyle(e);
          return JSON.stringify({tran:e.scrollWidth>e.clientWidth+1,
            cat_chu:/ellipsis|clip/.test(s.textOverflow), khong_xuong_dong:s.whiteSpace});"""
                          % _s(cuoi))
        du['do_dai_cap_cuoi'] = x
        if x is None:
            return None
        return 'P', ('Cấp cuối breadcrumb %r: %s.'
                     % (cuoi[:50],
                        'có cắt chữ bằng dấu ba chấm' if x.get('cat_chu')
                        else 'hiện đủ, không tràn' if not x.get('tran') else 'bị tràn khối')), du
    ten_man = ctx.vb('tieu_de_man') or ctx.man
    if len(chang) >= 2 and any(_n(ten_man) in _n(x['chu']) for x in chang):
        return 'P', ('Breadcrumb hiện %d cấp: %s — cấp cuối là tên màn.'
                     % (len(chang), ' > '.join(x['chu'] for x in chang))), du
    return 'F', ('Breadcrumb hiện %d cấp (%s) — không có cấp nào là tên màn %r.'
                 % (len(chang), ' > '.join(x['chu'] for x in chang), ten_man)), du


@phep('breadcrumb_bam_cap_tren')
@nhan_dien(lambda cs: _la_breadcrumb(cs) and _co(_n(cs.b), 'bam vao cap tren'))
def p_breadcrumb_bam(case, ctx):
    """Bấm cấp trên của breadcrumb -> phải điều hướng đi (case chỉ ĐỌC, không đổi dữ liệu)."""
    ctx.ve_danh_sach()
    bc = ui.doc_breadcrumb(ctx.c)
    if not bc or len(bc.get('chang') or []) < 2:
        return None
    tren = [x for x in bc['chang'][:-1] if x.get('chu')]
    if not tren:
        return None
    url0 = ctx.c.js('location.href')
    x = ui.bam(ctx.c, tren[0]['chu'], 'man', cho=1.6)
    url1 = ctx.c.js('location.href')
    du = {'chang': [y['chu'] for y in bc['chang']], 'bam': tren[0]['chu'],
          'url_truoc': qalib.che_url(url0), 'url_sau': qalib.che_url(url1)}
    ctx.ve_danh_sach(lam_moi=True)
    if not x:
        return 'F', ('Cấp trên của breadcrumb (%r) KHÔNG bấm được — không phải liên kết và '
                     'không bắt sự kiện bấm.' % tren[0]['chu']), du
    if url0 != url1:
        return 'P', ('Bấm cấp trên %r của breadcrumb: điều hướng sang %s.'
                     % (tren[0]['chu'], qalib.che_url(url1))), du
    return 'F', ('Bấm cấp trên %r của breadcrumb mà URL không đổi (vẫn %s).'
                 % (tren[0]['chu'], qalib.che_url(url1))), du


# ══════════════════════════════════════════════════════════════════════════════
# 10. TRA CỨU CHO `phep_live`
# ══════════════════════════════════════════════════════════════════════════════
def phep_cua(case, cho_phep_ghi=True):
    for p in PHEP_TRUONG:
        if p['can_ghi'] and not cho_phep_ghi:
            continue
        try:
            if p['nhan'](case):
                return p['ten']
        except Exception:
            continue
    return None


# ══════════════════════════════════════════════════════════════════════════════
# 11. Ô TÌM KIẾM — các lớp case còn lại  (2026-09-16 đợt 2)
# ══════════════════════════════════════════════════════════════════════════════
# Mọi phép dưới đây chỉ GÕ vào ô lọc rồi đọc bảng — thao tác ĐỌC, không cần quyền ghi.
# Ngưỡng ký tự và thời gian chờ lấy từ `grounding.hang_so`; không có thì phép tự im, vì
# "gõ 2 ký tự rồi kiểm ngay" là đúng cách đo SAI đã ghi ở §giao_thuc_do_luong.
def _debounce(ctx):
    return max(0.9, float(ctx.hs_so('tim_kiem_debounce_ms', 0) or 0) / 1000.0 + 0.7)


def _tim_va_doc(ctx, o, tu_khoa, enter=False):
    """Gõ vào ô lọc, chờ hết debounce (hoặc Enter), rồi đọc bảng. -> dict quan sát được."""
    ui.dien(ctx.c, o, tu_khoa, 'man', blur=False)
    if enter:
        ui.go_phim(ctx.c, 'Enter')
        time.sleep(1.1)
    else:
        time.sleep(_debounce(ctx))
    bang = ui.doc_bang(ctx.c) or []
    return {'tu_khoa': tu_khoa, 'so_dong': len(bang),
            'ma': [r['txt'][:40] for r in bang[:5]],
            'trang_thai': ui.trang_thai_tai(ctx.c),
            'loi_tren_man': (ui.doc_loi(ctx.c, 'man') or [])[:2]}


def _tu_khoa_co_that(ctx):
    """Một từ khoá CHẮC CHẮN có trên danh sách — lấy từ chính bảng đang hiện.

    Không bịa từ khoá: bịa thì mọi kết luận *"tìm không ra"* nói về từ khoá của tool chứ
    không nói về chức năng tìm kiếm.
    """
    ctx.ve_danh_sach()
    bang = ui.doc_bang(ctx.c) or []
    for r in bang:
        for v in (r.get('o') or {}).values():
            v = str(v or '').strip()
            if 3 <= len(v) <= 40 and not v.isdigit() and '—' not in v:
                return v
    return None


def _la_o_tim_man(cs):
    l, _ = truong_cua(cs)
    return l == 'o_tim'


@phep('o_tim_khong_dau')
@nhan_dien(lambda cs: _la_o_tim_man(cs) and _co(_n(cs.b), 'tieng viet khong dau'))
def p_o_tim_khong_dau(case, ctx):
    """Gõ từ khoá CÓ DẤU rồi gõ chính nó BỎ DẤU — so hai kết quả với kỳ vọng ở cột D."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    o = _nhan_o_tim(ctx, nhan)
    goc = None
    for r in (ui.doc_bang(ctx.c) or []):
        for v in (r.get('o') or {}).values():
            v = str(v or '').strip()
            if v and qalib.norm(v) != v.lower() and 3 <= len(v) <= 40:
                goc = v
                break
        if goc:
            break
    if not goc:
        return None                  # không có bản ghi nào mang dấu -> không dựng được ca
    khong_dau = qalib.norm(goc)
    a = _tim_va_doc(ctx, o, goc, enter=True)
    b = _tim_va_doc(ctx, o, khong_dau, enter=True)
    ctx.ve_danh_sach()
    du = _du_kien_chung(t, {'co_dau': a, 'bo_dau': b, 'tu_khoa_goc': goc})
    nd = _n(case.d)
    doi_khong_khop = _bat_ky(nd, 'khong tim thay', 'khong khop', 'so khop nguyen chuoi')
    if doi_khong_khop:
        if b['so_dong'] == 0:
            return 'P', ('Gõ %r (bỏ dấu của %r) vào ô "%s": không ra bản ghi nào — tìm kiếm so '
                         'khớp nguyên chuỗi, đúng cột D.' % (khong_dau, goc, o)), du
        return 'F', ('Gõ %r (bỏ dấu) vào ô "%s" mà vẫn ra %d bản ghi — cột D nói phải không '
                     'khớp.' % (khong_dau, o, b['so_dong'])), du
    if b['so_dong'] >= a['so_dong'] and a['so_dong'] > 0:
        return 'P', ('Gõ %r (bỏ dấu) vào ô "%s" ra %d bản ghi, bằng hoặc hơn lượt gõ có dấu '
                     '(%d) — tìm kiếm bỏ dấu được.' % (khong_dau, o, b['so_dong'], a['so_dong'])), du
    return 'F', ('Gõ có dấu %r ra %d bản ghi nhưng gõ bỏ dấu %r chỉ ra %d — tìm kiếm KHÔNG bỏ '
                 'dấu được như cột D đòi.' % (goc, a['so_dong'], khong_dau, b['so_dong'])), du


@phep('o_tim_khoang_trang')
@nhan_dien(lambda cs: _la_o_tim_man(cs) and _bat_ky(
    _n(cs.b), 'cat khoang trang hai dau', 'cac ky tu space', 'ky tu space o dau va cuoi'))
def p_o_tim_space(case, ctx):
    """Khoảng trắng hai đầu phải bị cắt trước khi tìm; toàn khoảng trắng = không lọc gì."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    o = _nhan_o_tim(ctx, nhan)
    nb = _n(case.b)
    toan_space = _co(nb, 'cac ky tu space') and not _co(nb, 'o dau va cuoi')
    ctx.ve_danh_sach()
    day_du = len(ui.doc_bang(ctx.c) or [])
    if toan_space:
        a = _tim_va_doc(ctx, o, '    ', enter=True)
        ctx.ve_danh_sach()
        du = _du_kien_chung(t, {'day_du': day_du, 'toan_space': a})
        if a['so_dong'] == day_du:
            return 'P', ('Gõ toàn khoảng trắng vào ô "%s": danh sách giữ nguyên %d dòng — hệ '
                         'thống cắt khoảng trắng nên không áp lọc nào.' % (o, day_du)), du
        return 'F', ('Gõ toàn khoảng trắng vào ô "%s": danh sách đổi từ %d xuống %d dòng — hệ '
                     'thống KHÔNG cắt khoảng trắng trước khi tìm.' % (o, day_du, a['so_dong'])), du
    tu = _tu_khoa_co_that(ctx)
    if not tu:
        return None
    a = _tim_va_doc(ctx, o, tu, enter=True)
    b = _tim_va_doc(ctx, o, '   %s   ' % tu, enter=True)
    ctx.ve_danh_sach()
    du = _du_kien_chung(t, {'khong_space': a, 'co_space': b, 'tu_khoa': tu})
    if a['so_dong'] == b['so_dong'] and a['ma'] == b['ma']:
        return 'P', ('Gõ %r và gõ chính nó có thêm khoảng trắng hai đầu vào ô "%s": cùng ra %d '
                     'bản ghi — hệ thống cắt khoảng trắng trước khi tìm.'
                     % (tu, o, a['so_dong'])), du
    return 'F', ('Gõ %r ra %d bản ghi, nhưng thêm khoảng trắng hai đầu chỉ ra %d — hệ thống '
                 'KHÔNG cắt khoảng trắng trước khi tìm.' % (tu, a['so_dong'], b['so_dong'])), du


@phep('o_tim_chuoi_dai')
@nhan_dien(lambda cs: _la_o_tim_man(cs) and _bat_ky(_n(cs.b), 'chuoi rat dai',
                                                    'nhap chuoi rat dai'))
def p_o_tim_dai(case, ctx):
    """Dán ~1.000 ký tự vào ô tìm: đo ô nhận bao nhiêu + màn có vỡ không."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    o = _nhan_o_tim(ctx, nhan)
    gh = ctx.hs_so('tim_kiem_max_dom') or ctx.hs_so('code_max_dom')
    m = re.search(r'toi da (\d[\d.]*) ky tu', _n(case.d))
    if m:
        gh = int(m.group(1).replace('.', ''))
    ctx.ve_danh_sach()
    chuoi = 'a' * 1000
    x = ui.dan(ctx.c, o, chuoi, 'man') or ui.dien(ctx.c, o, chuoi, 'man', blur=False)
    if x is None:
        return _khong_thay(t, ctx)
    time.sleep(_debounce(ctx))
    tt = ui.trang_thai_tai(ctx.c)
    loi = ui.doc_loi(ctx.c, 'man') or []
    ctx.ve_danh_sach()
    du = _du_kien_chung(t, {'gui': len(chuoi), 'o_nhan': x.get('do_dai'),
                            'maxlength': x.get('maxlength'), 'gioi_han_ky_vong': gh,
                            'trang_thai': tt, 'loi_tren_man': loi[:2]})
    nhan_duoc = x.get('do_dai')
    if gh and nhan_duoc is not None and nhan_duoc > int(gh):
        return 'F', ('Dán %d ký tự vào ô "%s": ô nhận %d, vượt giới hạn %s mà không bị chặn.'
                     % (len(chuoi), o, nhan_duoc, gh)), du
    if loi:
        return 'F', ('Dán %d ký tự vào ô "%s": màn báo lỗi %r.'
                     % (len(chuoi), o, loi[0][:90])), du
    return 'P', ('Dán %d ký tự vào ô "%s": ô nhận %s ký tự, danh sách còn %s dòng, giao diện '
                 'không lỗi.' % (len(chuoi), o, nhan_duoc, (tt or {}).get('so_dong'))), du


@phep('o_tim_de_trong')
@nhan_dien(lambda cs: _la_o_tim_man(cs) and _bat_ky(_n(cs.b), 'de trong o tim',
                                                    'xoa het noi dung', 'khi de trong'))
def p_o_tim_trong(case, ctx):
    """Lọc rồi xoá sạch ô tìm — danh sách phải trở lại đầy đủ."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    o = _nhan_o_tim(ctx, nhan)
    ctx.ve_danh_sach()
    day_du = len(ui.doc_bang(ctx.c) or [])
    tu = _tu_khoa_co_that(ctx)
    if not tu or not day_du:
        return None
    a = _tim_va_doc(ctx, o, tu, enter=True)
    b = _tim_va_doc(ctx, o, '', enter=True)
    du = _du_kien_chung(t, {'day_du': day_du, 'sau_khi_loc': a, 'sau_khi_xoa': b})
    if b['so_dong'] == day_du:
        return 'P', ('Lọc theo %r (còn %d dòng) rồi xoá sạch ô "%s": danh sách trở lại đủ %d '
                     'dòng.' % (tu, a['so_dong'], o, day_du)), du
    return 'F', ('Xoá sạch ô "%s" sau khi lọc: danh sách còn %d dòng, không trở lại đủ %d dòng '
                 'ban đầu.' % (o, b['so_dong'], day_du)), du


@phep('o_tim_hoa_thuong')
@nhan_dien(lambda cs: _la_o_tim_man(cs) and _bat_ky(
    _n(cs.b), 'nhap hoa, thuong', 'khong phan biet chu hoa', 'mot phan cua xau'))
def p_o_tim_hoa_thuong(case, ctx):
    """Gõ một phần từ khoá bằng chữ thường rồi chữ HOA — hai lượt phải ra cùng kết quả."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    o = _nhan_o_tim(ctx, nhan)
    tu = _tu_khoa_co_that(ctx)
    if not tu:
        return None
    mot_phan = tu[:max(3, len(tu) // 2)]
    a = _tim_va_doc(ctx, o, mot_phan.lower(), enter=True)
    b = _tim_va_doc(ctx, o, mot_phan.upper(), enter=True)
    ctx.ve_danh_sach()
    du = _du_kien_chung(t, {'chu_thuong': a, 'chu_hoa': b, 'mot_phan': mot_phan})
    if a['so_dong'] == b['so_dong'] and a['ma'] == b['ma']:
        return 'P', ('Gõ %r rồi %r vào ô "%s": cùng ra %d bản ghi — lọc không phân biệt chữ '
                     'hoa chữ thường.'
                     % (mot_phan.lower(), mot_phan.upper(), o, a['so_dong'])), du
    return 'F', ('Gõ chữ thường %r ra %d bản ghi nhưng chữ HOA %r ra %d — lọc PHÂN BIỆT chữ '
                 'hoa chữ thường.'
                 % (mot_phan.lower(), a['so_dong'], mot_phan.upper(), b['so_dong'])), du


@phep('o_tim_ky_tu_dai_dien')
@nhan_dien(lambda cs: _la_o_tim_man(cs) and _co(_n(cs.b), 'cac ky tu dac biet'))
def p_o_tim_dai_dien(case, ctx):
    """`%` `_` `*` phải là CHỮ THƯỜNG, không mang nghĩa đại diện — nếu mang thì là lỗ SQL/LIKE."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    o = _nhan_o_tim(ctx, nhan)
    ctx.ve_danh_sach()
    day_du = len(ui.doc_bang(ctx.c) or [])
    if not day_du:
        return None
    kq = {}
    for k in ('%', '_', '*', "'", '<b>1</b>'):
        kq[k] = _tim_va_doc(ctx, o, k, enter=True)
    ctx.ve_danh_sach()
    du = _du_kien_chung(t, {'day_du': day_du,
                            'ket_qua': {k: v['so_dong'] for k, v in kq.items()},
                            'loi': {k: v['loi_tren_man'] for k, v in kq.items() if v['loi_tren_man']}})
    dai_dien = [k for k in ('%', '_', '*') if kq[k]['so_dong'] >= day_du]
    if dai_dien:
        return 'F', ('Gõ %s vào ô "%s" trả về %d/%d bản ghi — ký tự này đang mang nghĩa ĐẠI '
                     'DIỆN chứ không phải chữ thường.'
                     % (' · '.join(repr(k) for k in dai_dien), o,
                        kq[dai_dien[0]]['so_dong'], day_du)), du
    co_loi = [k for k, v in kq.items() if v['loi_tren_man']]
    if co_loi:
        return 'F', ('Gõ %r vào ô "%s" làm màn báo lỗi hệ thống: %s.'
                     % (co_loi[0], o, kq[co_loi[0]]['loi_tren_man'][0][:90])), du
    return 'P', ('Gõ lần lượt %% · _ · * · nháy đơn · thẻ html vào ô "%s": không ký tự nào mang '
                 'nghĩa đại diện (kết quả %s), màn không báo lỗi.'
                 % (o, ' · '.join('%s=%d' % (k, v['so_dong']) for k, v in kq.items()))), du


@phep('o_tim_nguong_debounce')
@nhan_dien(lambda cs: _la_o_tim_man(cs) and _bat_ky(
    _n(cs.b), 'nhap du lieu khong gioi han', 'duoi nguong ky tu', 'nguong ky tu toi thieu'))
def p_o_tim_nguong(case, ctx):
    """Gõ 1 · 2 · 3 ký tự: dưới ngưỡng KHÔNG lọc; Enter áp ngay kể cả dưới ngưỡng."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    nguong = ctx.hs_so('tim_kiem_min_ky_tu')
    if not nguong:
        return None
    nguong = int(nguong)
    o = _nhan_o_tim(ctx, nhan)
    tu = _tu_khoa_co_that(ctx)
    if not tu or len(tu) < nguong:
        return None
    ctx.ve_danh_sach()
    day_du = len(ui.doc_bang(ctx.c) or [])
    duoi = [_tim_va_doc(ctx, o, tu[:i]) for i in range(1, nguong)]
    du_nguong = _tim_va_doc(ctx, o, tu[:nguong])
    enter_duoi = _tim_va_doc(ctx, o, tu[:max(1, nguong - 1)], enter=True)
    ctx.ve_danh_sach()
    du = _du_kien_chung(t, {'nguong': nguong, 'day_du': day_du,
                            'duoi_nguong': [x['so_dong'] for x in duoi],
                            'du_nguong': du_nguong['so_dong'],
                            'enter_duoi_nguong': enter_duoi['so_dong']})
    loi = []
    if any(x['so_dong'] != day_du for x in duoi):
        loi.append('gõ dưới %d ký tự đã áp lọc (%s dòng, đủ là %d)'
                   % (nguong, ' · '.join(str(x['so_dong']) for x in duoi), day_du))
    if du_nguong['so_dong'] == day_du and day_du > 1:
        loi.append('gõ đủ %d ký tự mà danh sách KHÔNG đổi' % nguong)
    nhan_enter = ctx.hs_so('tim_kiem_phim_enter')
    if nhan_enter and enter_duoi['so_dong'] == day_du and day_du > 1:
        loi.append('nhấn Enter dưới ngưỡng mà lọc KHÔNG áp ngay')
    if loi:
        return 'F', ('Ô tìm "%s": %s.' % (o, ' · '.join(loi))), du
    return 'P', ('Ô tìm "%s": dưới %d ký tự không áp lọc (giữ đủ %d dòng), đủ %d ký tự thì lọc '
                 'còn %d dòng%s.'
                 % (o, nguong, day_du, nguong, du_nguong['so_dong'],
                    ', nhấn Enter áp ngay cả khi dưới ngưỡng' if nhan_enter else '')), du


# ══════════════════════════════════════════════════════════════════════════════
# 12. Ô NGÀY TRÊN THANH LỌC
# ══════════════════════════════════════════════════════════════════════════════
def _la_ngay_loc(cs):
    l, _ = truong_cua(cs)
    return l == 'ngay' and pv_form(cs) == 'man'


def _o_ngay_khac(ctx, nhan):
    """Ô ngày còn lại của cặp Từ ngày / Đến ngày."""
    n = _n(nhan)
    doi = 'den ngay' if 'tu ngay' in n else ('tu ngay' if 'den ngay' in n else None)
    if not doi:
        return None
    for x in (ctx.ng.d.get('thanh_loc') or []):
        if doi in _n(x.get('nhan') or ''):
            return x.get('nhan')
    return 'Đến ngày' if doi == 'den ngay' else 'Từ ngày'


@phep('ngay_loc_dinh_dang')
@nhan_dien(lambda cs: _la_ngay_loc(cs) and _bat_ky(
    _n(cs.b), 'khong dung dinh dang', 'ngay khong ton tai', 'go ky tu la'))
def p_ngay_loc_dinh_dang(case, ctx):
    """Gõ chuỗi sai định dạng / ngày không tồn tại vào ô ngày của thanh lọc."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    ctx.ve_danh_sach()
    x0 = hd.tim_control(ctx.c, nhan, 'man')
    if not x0:
        return _khong_thay(t, ctx)
    the = str(x0.get('the') or '')
    truoc = (x0.get('gia_tri') or '')
    khong_ton_tai = _co(_n(case.b), 'khong ton tai')
    mau = ('2026-04-32' if khong_ton_tai else 'ab/cd@#')
    ui.dien(ctx.c, nhan, mau, 'man')
    time.sleep(0.7)
    x1 = hd.tim_control(ctx.c, nhan, 'man')
    sau = (x1 or {}).get('gia_tri') or ''
    loi = ui.doc_loi(ctx.c, 'man') or []
    ctx.ve_danh_sach()
    du = _du_kien_chung(t, {'the': the, 'truoc': truoc, 'gui': mau, 'sau': sau,
                            'loi_tren_man': loi[:2]})
    if sau == mau:
        return 'F', ('Gõ %r vào ô ngày "%s" mà ô NHẬN nguyên chuỗi — không chặn định dạng sai.'
                     % (mau, nhan)), du
    if sau in ('', truoc):
        return 'P', ('Gõ %r vào ô ngày "%s" (`%s`): ô không nhận, giữ %r — đúng cột D.'
                     % (mau, nhan, the, sau or 'trống')), du
    return 'P', ('Gõ %r vào ô ngày "%s" (`%s`): ô đẩy về giá trị hợp lệ %r.'
                 % (mau, nhan, the, sau)), du


@phep('ngay_loc_ap_dung')
@nhan_dien(lambda cs: _la_ngay_loc(cs) and _bat_ky(
    _n(cs.b), 'dinh dang hop le', 'ngay qua khu', 'ngay tuong lai', 'tu ngay = 1 gia tri',
    'den ngay = 1 gia tri', 'khi de trong'))
def p_ngay_loc_ap(case, ctx):
    """Đặt một mốc ngày vào ô lọc rồi đo danh sách có đổi không, và ô có nhận rỗng không."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, 'man')
    nb = _n(case.b)
    ctx.ve_danh_sach()
    x0 = hd.tim_control(ctx.c, nhan, 'man')
    if not x0:
        return _khong_thay(t, ctx)
    the = str(x0.get('the') or '')
    truoc_gt = (x0.get('gia_tri') or '')
    truoc_dong = len(ui.doc_bang(ctx.c) or [])
    if _co(nb, 'khi de trong'):
        ui.dien(ctx.c, nhan, '', 'man')
        time.sleep(_debounce(ctx))
        x1 = hd.tim_control(ctx.c, nhan, 'man') or {}
        sau_dong = len(ui.doc_bang(ctx.c) or [])
        loi = ui.doc_loi(ctx.c, 'man') or []
        ctx.ve_danh_sach(lam_moi=True)
        du = _du_kien_chung(t, {'gia_tri_truoc': truoc_gt, 'gia_tri_sau': x1.get('gia_tri'),
                                'dong_truoc': truoc_dong, 'dong_sau': sau_dong,
                                'loi': loi[:2]})
        giu = (x1.get('gia_tri') or '') == truoc_gt and truoc_gt != ''
        nd = _n(case.d)
        if _bat_ky(nd, 'khong nhan gia tri rong', 'gia tri cu duoc giu lai'):
            if giu:
                return 'P', ('Xoá trắng ô "%s": ô giữ lại giá trị cũ %r, danh sách không đổi '
                             '(%d dòng) — đúng cột D.' % (nhan, truoc_gt, sau_dong)), du
            return 'F', ('Xoá trắng ô "%s": ô nhận giá trị rỗng (còn %r), cột D nói phải giữ '
                         'giá trị cũ.' % (nhan, x1.get('gia_tri'))), du
        if not (x1.get('gia_tri') or '') and not loi:
            return 'P', ('Xoá trắng ô "%s": ô nhận rỗng, không báo lỗi, danh sách %d dòng.'
                         % (nhan, sau_dong)), du
        return None
    tuong_lai = _co(nb, 'ngay tuong lai')
    mau = ('2027-12-31' if tuong_lai else '2020-01-01') if 'date' in the \
        else ('31/12/2027' if tuong_lai else '01/01/2020')
    ui.dien(ctx.c, nhan, mau, 'man')
    time.sleep(_debounce(ctx))
    x1 = hd.tim_control(ctx.c, nhan, 'man') or {}
    sau_dong = len(ui.doc_bang(ctx.c) or [])
    ctx.ve_danh_sach(lam_moi=True)
    du = _du_kien_chung(t, {'the': the, 'dat': mau, 'o_giu': x1.get('gia_tri'),
                            'min': x1.get('min'), 'max': x1.get('max'),
                            'dong_truoc': truoc_dong, 'dong_sau': sau_dong})
    nd = _n(case.d)
    if tuong_lai and _bat_ky(nd, 'khong chon duoc', 'bi gioi han', 'khong cho chon'):
        if (x1.get('gia_tri') or '') != mau:
            return 'P', ('Đặt ô "%s" về mốc tương lai %s: ô không nhận (giữ %r) — bị giới hạn '
                         'sẵn, đúng cột D.' % (nhan, mau, x1.get('gia_tri'))), du
        return 'F', ('Đặt ô "%s" về mốc tương lai %s: ô NHẬN giá trị — không bị giới hạn như '
                     'cột D đòi.' % (nhan, mau)), du
    if (x1.get('gia_tri') or '') != mau:
        return None                     # ô không nhận được mốc -> không dựng được ca, im
    return 'P', ('Đặt ô "%s" về %s: ô nhận đúng, danh sách đổi từ %d xuống %d dòng — lọc áp '
                 'theo mốc ngày.' % (nhan, mau, truoc_dong, sau_dong)), du


@phep('validate_rang_buoc_ngay')
@nhan_dien(lambda cs: 'validate rang buoc' in _n(_nhom(cs)) and _bat_ky(
    _n(cs.b), 'tu ngay lon hon den ngay', 'tu ngay bang den ngay',
    'chi nhap tu ngay hoac chi nhap den ngay', 'vung chon cua den ngay'))
def p_rang_buoc_ngay(case, ctx):
    """Ràng buộc giữa Từ ngày và Đến ngày — đo bằng thuộc tính `min`/`max` THẬT của ô."""
    ctx.ve_danh_sach()
    ten = {}
    for x in (ctx.ng.d.get('thanh_loc') or []):
        n = _n(x.get('nhan') or '')
        if 'tu ngay' in n:
            ten['tu'] = x.get('nhan')
        elif 'den ngay' in n:
            ten['den'] = x.get('nhan')
    if not ten.get('tu') or not ten.get('den'):
        return None
    nb = _n(case.b)
    doc = lambda k: ui._js(ctx.c, """
        const e=TIM(%s,'man'); if(!e) return 'null';
        return JSON.stringify({gia_tri:GT(e), min:(e.min||''), max:(e.max||''),
          the:e.tagName.toLowerCase()+'['+(e.type||'')+']'});""" % _s(ten[k]))
    if _co(nb, 'vung chon cua den ngay'):
        ui.dien(ctx.c, ten['tu'], '2026-06-15', 'man')
        time.sleep(0.8)
        den = doc('den')
        ctx.ve_danh_sach(lam_moi=True)
        du = {'tu_ngay': ten['tu'], 'den_ngay': ten['den'], 'dat_tu': '2026-06-15',
              'den_sau_khi_dat': den}
        if not den:
            return None
        if (den.get('min') or '') == '2026-06-15':
            return 'P', ('Đặt "%s" = 15/06/2026: ô "%s" bị giới hạn `min` đúng bằng mốc đó — '
                         'vùng chọn thu hẹp theo Từ ngày.' % (ten['tu'], ten['den'])), du
        return 'F', ('Đặt "%s" = 15/06/2026 mà ô "%s" không bị giới hạn (min=%r) — vùng chọn '
                     'KHÔNG thu hẹp theo Từ ngày.'
                     % (ten['tu'], ten['den'], den.get('min'))), du
    if _co(nb, 'tu ngay lon hon den ngay') or _co(nb, 'tu ngay bang den ngay'):
        bang = _co(nb, 'bang')
        a, b = ('2026-06-20', '2026-06-20') if bang else ('2026-06-20', '2026-06-10')
        ui.dien(ctx.c, ten['den'], b, 'man')
        time.sleep(0.5)
        ui.dien(ctx.c, ten['tu'], a, 'man')
        time.sleep(_debounce(ctx))
        tu_sau, den_sau = doc('tu'), doc('den')
        loi = ui.doc_loi(ctx.c, 'man') or []
        dong = len(ui.doc_bang(ctx.c) or [])
        ctx.ve_danh_sach(lam_moi=True)
        du = {'dat_tu': a, 'dat_den': b, 'tu_sau': tu_sau, 'den_sau': den_sau,
              'loi': loi[:2], 'so_dong': dong}
        nhan_duoc = (tu_sau or {}).get('gia_tri') == a
        if bang:
            if nhan_duoc and not loi:
                return 'P', ('Đặt Từ ngày = Đến ngày = %s: hệ thống chấp nhận, lọc còn %d dòng, '
                             'không báo lỗi.' % (a, dong)), du
            return 'F', ('Đặt Từ ngày = Đến ngày = %s mà hệ thống %s.'
                         % (a, ('báo lỗi: ' + loi[0][:80]) if loi else 'không nhận giá trị')), du
        if not nhan_duoc or loi:
            return 'P', ('Đặt Từ ngày (%s) LỚN HƠN Đến ngày (%s): hệ thống chặn — %s.'
                         % (a, b, ('báo %r' % loi[0][:70]) if loi
                            else 'ô không nhận giá trị')), du
        return 'F', ('Đặt Từ ngày (%s) LỚN HƠN Đến ngày (%s) mà hệ thống vẫn nhận và lọc ra %d '
                     'dòng — không có ràng buộc giữa hai ô.' % (a, b, dong)), du
    # chỉ nhập một trong hai
    ui.dien(ctx.c, ten['tu'], '2020-01-01', 'man')
    time.sleep(_debounce(ctx))
    chi_tu = len(ui.doc_bang(ctx.c) or [])
    loi1 = ui.doc_loi(ctx.c, 'man') or []
    ctx.ve_danh_sach(lam_moi=True)
    ui.dien(ctx.c, ten['den'], '2027-12-31', 'man')
    time.sleep(_debounce(ctx))
    chi_den = len(ui.doc_bang(ctx.c) or [])
    loi2 = ui.doc_loi(ctx.c, 'man') or []
    ctx.ve_danh_sach(lam_moi=True)
    du = {'chi_tu_ngay': {'so_dong': chi_tu, 'loi': loi1[:2]},
          'chi_den_ngay': {'so_dong': chi_den, 'loi': loi2[:2]}}
    if not loi1 and not loi2:
        return 'P', ('Chỉ nhập Từ ngày (còn %d dòng) rồi chỉ nhập Đến ngày (còn %d dòng): cả hai '
                     'lượt đều lọc được, không bắt buộc nhập cặp.' % (chi_tu, chi_den)), du
    return 'F', ('Chỉ nhập một trong hai ô ngày thì hệ thống báo lỗi: %s.'
                 % ' | '.join((loi1 + loi2)[:2])), du


# ══════════════════════════════════════════════════════════════════════════════
# 13. XSS / SQL Ở MỘT Ô CỦA BIỂU MẪU  (2026-09-16 đợt 3)
# ══════════════════════════════════════════════════════════════════════════════
# `phep_live.xss_sql` đã có nhưng nhận theo lời văn của khối CN; các nhóm `Textbox <Nhãn>` /
# `Textarea <Nhãn>` mang tiêu đề `XSS (Kiểm tra lỗi khi nhập Script HTML…)` rơi ra ngoài.
# Phép dưới đây đo ĐÚNG hai nửa mà cột D đòi:
#   ① chuỗi tấn công có bị TRANG THỰC THI / chèn thô vào DOM không (đo ngay khi gõ);
#   ② lưu rồi MỞ LẠI: chuỗi phải hiện nguyên văn, không bị mã hoá thành `&lt;`.
# Không có quyền ghi thì chỉ kết luận được nửa ①; khi ấy phép trả `None` chứ không chấm nửa vời.
XSS_MAU_TRUONG = {
    'script html': '<script>alert(1)</script>',
    'hexa dang url': '%3Cscript%3Ealert(1)%3C/script%3E',
    'hexa dang html': '&lt;script&gt;alert(1)&lt;/script&gt;',
    'sql': "' OR '1'='1",
}


def _loai_xss(case):
    nb = _n(case.b)
    if not _bat_ky(nb, 'xss', 'script html', 'sql injection'):
        return None
    if 'hexa dang url' in nb:
        return 'hexa dang url'
    if 'hexa dang html' in nb:
        return 'hexa dang html'
    if 'sql' in nb:
        return 'sql'
    return 'script html'


@phep('truong_xss', can_ghi=True)
@nhan_dien(lambda cs: _la_o_nhap(cs) and _loai_xss(cs) is not None)
def p_truong_xss(case, ctx):
    """Nhập chuỗi tấn công vào MỘT ô của biểu mẫu, lưu, mở lại và đối chiếu."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    kieu = _loai_xss(case)
    payload = XSS_MAU_TRUONG[kieu]
    la_ma = _n(nhan) == _n(ctx.o_ma() or '')
    if la_ma:
        return None          # ô MÃ có regex riêng, `phep_live.validate_o_nhap` lo nhánh đó
    with BoiCanh(ctx, case, t, can_ban_ghi=True) as bc:
        if not bc.san_sang:
            return None
        if not t.doc():
            return _khong_thay(t, ctx)
        x = t.dien(payload, blur=False)
        if x is None:
            return None
        o_giu = (x.get('gia_tri') or '')
        thuc_thi = _hien_tho_script(ctx.c, payload)
        bc.dien_phan_con_lai(tru=[nhan])
        nut = bc.nut_chot()
        mang = _bam_chot(ctx, case, bc, nut, 'XSS vào ô %s' % nhan)
        loi = ui.doc_loi(ctx.c, 'hop')
        con_mo = ui.co_hop_thoai(ctx.c)
        if con_mo:
            ui.dong_hop(ctx.c)
        # mở lại bản ghi để xem chuỗi được lưu và hiển thị thế nào
        ma = (bc.ban_ghi or {}).get('ma')
        doc_lai = None
        if ma and not con_mo:
            if ctx.hien_ban_ghi_qa(ma, lam_moi=True):
                from phep_live import _icon_sua
                r = ui.mo_hop_theo_dong(ctx.c, ma, _icon_sua(ctx))
                if isinstance(r, dict) and r.get('ok'):
                    y = hd.tim_control(ctx.c, nhan, 'hop')
                    doc_lai = (y or {}).get('gia_tri')
                    thuc_thi = thuc_thi or _hien_tho_script(ctx.c, payload)
                    ui.dong_hop(ctx.c)
    du = _du_kien_chung(t, {'kieu': kieu, 'gui': payload, 'o_giu': o_giu,
                            'script_thuc_thi': thuc_thi, 'luu_duoc': not con_mo,
                            'doc_lai_sau_khi_luu': doc_lai, 'loi': loi[:2], 'mang': mang,
                            'muc_bang_chung': 'UI'})
    if thuc_thi:
        return 'F', ('Nhập %s (%s) vào ô "%s": chuỗi được TRANG THỰC THI hoặc chèn thô vào DOM '
                     '— lỗ XSS.' % (payload, kieu, nhan)), du
    if doc_lai is not None:
        if _n(doc_lai) == _n(payload) or payload in doc_lai:
            return 'P', ('Nhập %s vào ô "%s", lưu rồi mở lại: chuỗi hiện NGUYÊN VĂN, không bị '
                         'mã hoá, không được thực thi.' % (kieu, nhan)), du
        return 'F', ('Nhập %s vào ô "%s", lưu rồi mở lại: chuỗi đọc lại là %r — KHÁC chuỗi đã '
                     'nhập (bị mã hoá hoặc bị cắt).' % (kieu, nhan, str(doc_lai)[:80])), du
    if con_mo:
        return 'P', ('Nhập %s vào ô "%s" rồi bấm "%s": hệ thống chặn (%s), chuỗi không được '
                     'thực thi.' % (kieu, nhan, nut, ' | '.join(loi[:2]) or 'biểu mẫu không đóng')), du
    return None


# ── Ô NGÀY TRONG BIỂU MẪU: xoá rỗng · dán chuỗi · ngày không tồn tại ──────────────────────
@phep('ngay_form_bien', can_ghi=True)
@nhan_dien(lambda cs: _la_ngay(cs) and pv_form(cs) in ('them', 'sua', 'hop') and _bat_ky(
    _n(cs.b), 'khi xoa rong', 'dan chuoi ngay', 'ngay khong ton tai', 'khi de trong',
    'nhap ... bang ban phim', 'theo tung ngan'))
def p_ngay_form_bien(case, ctx):
    """Ca biên của ô ngày TRONG biểu mẫu — xoá rỗng rồi lưu, dán chuỗi, ngày không tồn tại."""
    loai, nhan = truong_cua(case)
    t = Truong(ctx, loai, nhan, pv_form(case))
    nb = _n(case.b)
    kv = ky_vong(case.d)
    cau = kv['bao_loi'] or t.loi('rong', 'bat_buoc')
    with BoiCanh(ctx, case, t, can_ban_ghi=True) as bc:
        if not bc.san_sang:
            return None
        x0 = t.doc()
        if not x0:
            return _khong_thay(t, ctx)
        the = str(x0.get('the') or '')
        if _bat_ky(nb, 'khi xoa rong', 'khi de trong'):
            t.dien('2026-06-15' if 'date' in the else '15/06/2026')
            time.sleep(0.4)
            t.dien('')
            bc.dien_phan_con_lai(tru=[nhan])
            nut = bc.nut_chot()
            mang = _bam_chot(ctx, case, bc, nut, 'ô ngày %s để rỗng' % nhan)
            loi = ui.doc_loi(ctx.c, 'hop')
            tb = ui.doc_thong_bao(ctx.c)
            con_mo = ui.co_hop_thoai(ctx.c)
            du = _du_kien_chung(t, {'the': the, 'cau_verbatim': cau, 'loi': loi[:3],
                                    'thong_bao': tb[:3], 'hop_con_mo': con_mo, 'mang': mang})
            if cau:
                if any(_n(cau) in _n(y) for y in loi + tb):
                    return 'P', ('Xoá rỗng ô ngày "%s" rồi bấm "%s": hiện đúng thông báo '
                                 'nguyên văn "%s", biểu mẫu không đóng.' % (nhan, nut, cau)), du
                return 'F', ('Xoá rỗng ô ngày "%s" rồi bấm "%s": KHÔNG thấy thông báo nguyên '
                             'văn "%s" (đọc được: %s).'
                             % (nhan, nut, cau, ' | '.join((loi + tb)[:2]) or 'không có')), du
            if kv['khong_chan'] and not con_mo:
                return 'P', ('Xoá rỗng ô ngày "%s" rồi bấm "%s": hệ thống chấp nhận — đúng cột '
                             'D (ô không bắt buộc).' % (nhan, nut)), du
            return None
        # dán chuỗi ngày / ngày không tồn tại -> đo ô có nhận không
        mau = '2026-04-32' if _co(nb, 'khong ton tai') else '15/06/2026'
        y = (t.dan(mau) if _co(nb, 'dan chuoi') else t.dien(mau, blur=False))
        giu = (y or {}).get('gia_tri') or ''
    du = _du_kien_chung(t, {'the': the, 'gui': mau, 'o_giu': giu})
    if giu == mau and _co(nb, 'khong ton tai'):
        return 'F', ('Gõ ngày không tồn tại %s vào ô "%s" mà ô NHẬN nguyên giá trị.'
                     % (mau, nhan)), du
    if not giu:
        return 'P', ('%s %r vào ô ngày "%s" (`%s`): ô không nhận — trình duyệt chỉ nhận đúng '
                     'khuôn ngày của nó.'
                     % ('Dán' if _co(nb, 'dan chuoi') else 'Gõ', mau, nhan, the)), du
    return 'P', ('%s %r vào ô ngày "%s" (`%s`): ô giữ %r.'
                 % ('Dán' if _co(nb, 'dan chuoi') else 'Gõ', mau, nhan, the, giu)), du


# ══════════════════════════════════════════════════════════════════════════════
# 14. NÚT CHỌN / THẺ  (radio · segmented · tab-thẻ)  — 2026-09-16 đợt 3
# ══════════════════════════════════════════════════════════════════════════════
# Bộ sinh đặt tên nhóm `Nút chọn <Nhãn>` cho cụm chọn-một-trong-nhiều vẽ bằng THẺ (card/tab),
# không phải `<input type=radio>`. Chúng không có `role=radio`, nên mọi bộ dò ô nhập đều trượt.
# Nhận ra bằng HÌNH DẠNG: một hàng các phần tử bấm được, nằm sát nhau, có đúng một cái đang
# được đánh dấu chọn.
def _hang_the(c, pv='man'):
    """[{'chu','chon','top'}] của cụm thẻ chọn trên màn. `None` nếu không thấy cụm nào."""
    return ui._js(c, """
      const g=PV(%s);
      const ds=[...g.querySelectorAll('button,[role=tab],[role=radio],a,div[class*=card i],'+
        'label')].filter(HIEN).filter(e=>{const t=TXT(e); return t && t.length<90;});
      /* Gom theo HÀNG: cùng toạ độ trên (lệch <= 8px) và có từ 2 phần tử trở lên. */
      const hang={};
      for(const e of ds){const r=e.getBoundingClientRect();
        const k=Math.round(r.top/8);
        (hang[k]=hang[k]||[]).push({e:e, top:Math.round(r.top), trai:Math.round(r.left)});}
      const chon_duoc=e=>(e.getAttribute('aria-selected')==='true'
        ||e.getAttribute('aria-checked')==='true'||e.getAttribute('data-state')==='active'
        ||/\\b(active|selected|chon)\\b/i.test(e.className||''));
      let tot=null;
      for(const k in hang){const h=hang[k];
        if(h.length<2) continue;
        const so_chon=h.filter(x=>chon_duoc(x.e)).length;
        const diem=h.length + (so_chon===1?10:0);
        if(!tot||diem>tot.diem) tot={diem:diem, h:h};}
      if(!tot) return 'null';
      tot.h.sort((a,b)=>a.trai-b.trai);
      return JSON.stringify({the:tot.h.map(x=>({chu:TXT(x.e), chon:chon_duoc(x.e),
        top:x.top}))});""" % _s(pv))


def _la_nut_chon(cs):
    return _n(_nhom(cs)).startswith('nut chon') or _n(_nhom(cs)).startswith('the ')


@phep('the_lua_chon')
@nhan_dien(lambda cs: _la_nut_chon(cs) and _bat_ky(
    _n(cs.b), 'cac lua chon cua', 'cac the', 'hien thi cac the'))
def p_the_lua_chon(case, ctx):
    """Cụm thẻ chọn có ĐÚNG những lựa chọn mà cột D kể ra không."""
    _, nhan = truong_cua(case)
    mong = [x.strip() for x in _RX_NHAY_D.findall(case.d or '') if 2 <= len(x.strip()) <= 70]
    if len(mong) < 2:
        return None
    pv = 'hop' if pv_form(case) in ('them', 'sua', 'hop') else 'man'
    if pv == 'man':
        ctx.ve_danh_sach(lam_moi=True)
    cum = _hang_the(ctx.c, pv)
    if not cum or not cum.get('the'):
        return None
    co = [x['chu'] for x in cum['the']]
    # Cột D hay kể cả thứ KHÔNG được có (*"Thẻ X đã được gỡ nên không còn"*). Tách hai vế
    # theo lời văn thay vì đòi khớp cả danh sách — đòi khớp cả danh sách là chấm F cho một
    # màn đúng chỉ vì cột D nhắc tên một thẻ đã bị gỡ.
    nd = _n(case.d)
    khong_con = [x for x in mong
                 if re.search(r'["“”]%s["“”][^.]{0,80}(đã được gỡ|không còn|đã bỏ)'
                              % re.escape(x), case.d or '', re.I)]
    phai_co = [x for x in mong if x not in khong_con]
    thieu = [x for x in phai_co if not any(_n(x) in _n(y) or _n(y) in _n(x) for y in co)]
    thua = [x for x in khong_con if any(_n(x) == _n(y) for y in co)]
    du = {'o': nhan, 'the_tren_man': co, 'cot_D_doi': phai_co,
          'cot_D_noi_khong_con': khong_con, 'muc_bang_chung': 'UI'}
    if thieu or thua:
        loi = []
        if thieu:
            loi.append('THIẾU %s' % ' · '.join(repr(x) for x in thieu))
        if thua:
            loi.append('vẫn CÒN %s (cột D nói đã gỡ)' % ' · '.join(repr(x) for x in thua))
        return 'F', ('Cụm thẻ "%s" trên màn có %s — %s.'
                     % (nhan, ' · '.join(repr(x) for x in co), ' · '.join(loi))), du
    return 'P', ('Cụm thẻ "%s" có đúng %d lựa chọn cột D kể: %s%s.'
                 % (nhan, len(phai_co), ' · '.join(repr(x) for x in co),
                    '; không còn %s như cột D nói' % ' · '.join(repr(x) for x in khong_con)
                    if khong_con else '')), du


@phep('the_chuyen_doi')
@nhan_dien(lambda cs: _la_nut_chon(cs) and _bat_ky(
    _n(cs.b), 'chuyen doi giua cac lua chon', 'chuyen doi giua cac the',
    'bam lan luot cac the'))
def p_the_chuyen_doi(case, ctx):
    """Bấm sang thẻ khác rồi bấm lại: nội dung phải đổi theo thẻ, đường dẫn trang KHÔNG đổi."""
    _, nhan = truong_cua(case)
    pv = 'hop' if pv_form(case) in ('them', 'sua', 'hop') else 'man'
    if pv == 'man':
        ctx.ve_danh_sach(lam_moi=True)
    cum = _hang_the(ctx.c, pv)
    if not cum or len(cum.get('the') or []) < 2:
        return None
    the = cum['the']
    dang = [x for x in the if x['chon']]
    khac = [x for x in the if not x['chon']]
    if not khac:
        return None
    url0 = ctx.c.js('location.href') or ''
    noi0 = _van_ban_vung(ctx.c)
    r1 = ui.bam(ctx.c, khac[0]['chu'], pv, cho=1.6)
    noi1 = _van_ban_vung(ctx.c)
    url1 = ctx.c.js('location.href') or ''
    cum1 = _hang_the(ctx.c, pv) or {}
    ve = None
    if dang:
        ve = ui.bam(ctx.c, dang[0]['chu'], pv, cho=1.6)
    noi2 = _van_ban_vung(ctx.c)
    if pv == 'man':
        ctx.ve_danh_sach(lam_moi=True)
    du = {'o': nhan, 'the': [x['chu'] for x in the],
          'dang_chon_ban_dau': [x['chu'] for x in dang],
          'bam_sang': khac[0]['chu'], 'noi_dung_doi': noi0 != noi1,
          've_lai_duoc': bool(ve), 'noi_dung_ve_nhu_cu': noi0 == noi2,
          'url_truoc': qalib.che_url(url0), 'url_sau': qalib.che_url(url1),
          'the_sau_khi_bam': [x['chu'] for x in (cum1.get('the') or []) if x['chon']],
          'muc_bang_chung': 'UI'}
    if not r1:
        return 'F', ('Không bấm được thẻ %r của cụm "%s".' % (khac[0]['chu'], nhan)), du
    nd = _n(case.d)
    loi = []
    if noi0 == noi1:
        loi.append('bấm sang thẻ %r mà nội dung màn KHÔNG đổi' % khac[0]['chu'])
    if _bat_ky(nd, 'duong dan trang khong doi', 'url khong doi') and url0 != url1:
        loi.append('đường dẫn trang ĐỔI (%s -> %s)' % (qalib.che_url(url0), qalib.che_url(url1)))
    if dang and not du['noi_dung_ve_nhu_cu']:
        loi.append('bấm lại thẻ %r mà nội dung KHÔNG trở về như cũ' % dang[0]['chu'])
    if loi:
        return 'F', ('Cụm thẻ "%s": %s.' % (nhan, ' · '.join(loi))), du
    return 'P', ('Cụm thẻ "%s": bấm sang %r thì nội dung đổi, bấm lại %r thì trở về như cũ, '
                 'đường dẫn trang không đổi.'
                 % (nhan, khac[0]['chu'], dang[0]['chu'] if dang else '-')), du


def _van_ban_vung(c):
    """Vân tay nội dung vùng dữ liệu — để so TRƯỚC/SAU một thao tác đổi thẻ."""
    return ui._js(c, """
      const t=document.querySelector('table');
      const s=(t?TXT(t):TXT(document.body)).slice(0,4000);
      return JSON.stringify(s.length+'|'+s.slice(0,600));""")

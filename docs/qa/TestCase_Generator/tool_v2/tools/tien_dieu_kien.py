# -*- coding: utf-8 -*-
"""TIỀN ĐIỀU KIỆN + DỰNG TRẠNG THÁI cho từng case  (mới 2026-09-16 lượt 3).

Vì sao có file này. Trước bản này, một phép đo gặp màn *không ở đúng trạng thái case cần* thì
trả `None` và case rơi về `CHƯA ĐO`. Lượt chạy `ViTriLuuTru` 16/09 để lại 113/499 case như
vậy, mà 88 trong số đó **không phải vì tool không biết đo** — nó biết; nó chỉ không dựng nổi
trạng thái. Ví dụ rõ nhất: 20 case phân trang đòi *"dữ liệu đủ 21 bản ghi"* trong khi màn thật
có 16, nên `p_phan_trang_tong` tự tắt tiếng dù lớp dữ liệu QA (`qa_data`) và lớp mô phỏng mạng
(`mock_live`) đã có sẵn từ hai đợt trước — chưa ai nối chúng vào.

    ĐỌC CASE → PHÂN TÍCH TIỀN ĐIỀU KIỆN → DỰNG FIXTURE → (phép đo chạy) → DỌN

Hai nửa, tách hẳn nhau:

  · **Phân tích** (`doc`) là hàm THUẦN trên `Case` — không chạm app, không chạm mạng. Nhờ vậy
    `--dry-run` đếm đúng bằng lượt chạy thật, và bản kê tiền điều kiện đi vào `cases.json`
    kể cả khi lượt chạy chết trước lúc mở browser.
  · **Dựng** (`dung`) mới chạm app, và luôn đi qua đúng các cổng đã có: bản ghi QA sinh bằng
    `Ctx.tao_ban_ghi` (→ `Cong.ghi()` → `CuaSoGhiQA`), mô phỏng mạng bằng `mock_live.Mock`
    (→ `CuaSoMock`). Ở đây KHÔNG có một đường ghi nào của riêng nó.

Luật của phần dựng, không nới:

  ① **Không lấy bản ghi nghiệp vụ làm đích mutation.** Mọi dữ liệu do lớp này dựng đều mang
     dấu `ZZQA_<run>_<seq>` và nằm trong sổ `qa_data` ⇒ dọn được, chứng minh được chủ.
  ② **Dựng không nổi thì nói ra, không im.** `dung()` trả một bản kê có `loai` = `KHONG_DUNG_DUOC`
     kèm lý do máy đọc được, để `chay_live` ghi `reason` đúng thay vì gộp vào một câu chung.
  ③ **Ưu tiên app thật.** Thứ tự là DỮ LIỆU QA THẬT → MÔ PHỎNG MẠNG, không bao giờ ngược lại
     (§16 của chỉ thị). Mock chỉ vào cuộc khi dữ liệu thật dựng không nổi, và khi ấy bản kê
     mang `fallback='MOCK'` để người đọc evidence biết kết luận đứng trên nền nào.
  ④ **Mock không được dùng cho case hỏi về nghiệp vụ máy chủ** — `qalib.la_case_cam_mock`
     chặn, giữ nguyên luật ① của §4e.
"""
import re

import qalib

norm = qalib.norm


# ══════════════════════════════════════════════════════════════════════════════
# 1. TÊN CỜ TIỀN ĐIỀU KIỆN  (đúng bảng §17 của chỉ thị)
# ══════════════════════════════════════════════════════════════════════════════
CAN_DU_LIEU = 'requires_data'
CAN_NHIEU_TRANG = 'requires_multiple_pages'
CAN_HOP_CHI_TIET = 'requires_modal'
CAN_VAI_TRO_B = 'requires_role_b'
CAN_HAI_PHIEN = 'requires_parallel_session'
CAN_RONG = 'requires_empty_state'
CAN_TRUNG = 'requires_duplicate'
CAN_PHU_THUOC = 'requires_dependency'
CAN_HINH_HOC = 'requires_geometry'
CAN_LAP_NHANH = 'requires_rapid_action'
CAN_MAC_DINH = 'requires_default_state'
CAN_DU_LIEU_DAI = 'requires_long_data'
CAN_KHONG_HOP_LE = 'requires_invalid_input'

MOI_CO = (CAN_DU_LIEU, CAN_NHIEU_TRANG, CAN_HOP_CHI_TIET, CAN_VAI_TRO_B, CAN_HAI_PHIEN,
          CAN_RONG, CAN_TRUNG, CAN_PHU_THUOC, CAN_HINH_HOC, CAN_LAP_NHANH, CAN_MAC_DINH,
          CAN_DU_LIEU_DAI, CAN_KHONG_HOP_LE)


# ══════════════════════════════════════════════════════════════════════════════
# 2. PHÂN TÍCH  — hàm THUẦN, không chạm app
# ══════════════════════════════════════════════════════════════════════════════
# Mỗi cụm dưới đây lấy từ chữ THẬT trong bộ case `ChuyenVien` (7 màn · 3.365 case), không
# phải từ trí nhớ về "case phân trang thường viết thế nào". Sai một cụm ở đây thì hoặc tool
# dựng thừa dữ liệu (chậm, tạo rác), hoặc case lại rơi về CHƯA ĐO — nên cụm nào cũng phải
# chỉ ra được ít nhất một dòng case có thật.
_RX_SO_TRANG = re.compile(r'trang\s+th[uứ]\s*(\d+)')
_RX_SO_BAN_GHI = re.compile(r'(?:du|co|đu|đ[uủ])\s*(\d{2,4})\s*ban ghi')

# ⚠️ MỌI cụm dưới đây được khớp theo BIÊN TỪ (`qalib.chua_tu`), KHÔNG phải `in`. Đây là cùng
# một cái bẫy đã cắn bốn lần trong lớp live và lần nào cũng im lặng — lần này đo được ngay
# trên bộ `ViTriLuuTru`:
#     'chuyen trang' ăn vào 'chuyen TRẠNG thai'  -> 14 case đổi trạng thái đòi dựng 21 bản ghi
#     'trang 2'      ăn vào 'moi TRANG 20 ban ghi' -> 3 case danh sách lựa chọn đòi phân trang
#     'trang dau'    ăn vào 'khoang TRẮNG ĐẦU'   -> 3 case cắt khoảng trắng đòi phân trang
# Cụm nào còn có thể bị cụm dài hơn nuốt thì viết dài ra, đừng dựa vào biên từ để cứu.
_KW_NHIEU_TRANG = (
    'trang 2', 'trang 3', 'trang tiep', 'trang truoc', 'next page', 'previous page',
    'nextpage', 'chuyen sang trang', 'chuyen cac trang', 'sau khi chuyen trang',
    'mo cac trang', 'lat trang', 'sang trang khac', 'trang phan trang khac',
    'trang giua', 'so trang bat ky', 'nut trang dau', 'nut trang cuoi',
    'hien thi 21 ban ghi', 'luu cache',
    'nho hon tong so ban ghi', 'lon hon tong so ban ghi', 'bang dung tong so ban ghi',
    'bang dung tong so', 'nho hon tong so', 'lon hon tong so',
    'vi tri trang sau khi thuc hien', 'header, footer sau khi chuyen trang',
    'o tich chon khi chuyen sang trang khac', 'chuyen sang trang khac',
)
_KW_HOP_CHI_TIET = ('xem chi tiet', 'chi tiet target', 'hien thi chi tiet', 'man chi tiet',
                    'mo chi tiet', 'hop thoai chi tiet', 'dong man chi tiet')
_KW_VAI_TRO_B = ('ngoai pham vi duoc phan cong', 'ngoai pham vi', 'khong thuoc pham vi',
                 'tai khoan khac vai tro', 'khong co quyen', 'yeu cau quyen',
                 'chi thay du lieu thuoc pham vi', 'vai tro khac')
_KW_HAI_PHIEN = ('2 client', 'hai client', '2 tab', 'hai tab', '2 may', 'hai may',
                 'cung luc tu 2', 'cung mot luc tu 2', 'dong thoi tu 2', 'client 1',
                 'client 2')
_KW_RONG = ('khong co du lieu', 'danh sach rong', 'chua co du lieu', 'trang thai rong',
            'khong tim thay ban ghi nao', 'khong co ban ghi nao')
_KW_TRUNG = ('da ton tai', 'trung ma', 'nhap trung', 'bi trung', 'trung du lieu',
             'trung lap', 'da co trong he thong', 'sua trung', 'xoa trung')
# ⚠️ Không có `'dang su dung'` trơn: hộp Chi tiết có một DÒNG THÔNG TIN tên *"Đang sử dụng"*,
# nên cụm trơn gắn cờ "cần dựng ràng buộc" cho mọi case đọc hộp Chi tiết. Cờ sai không làm
# sai kết luận (nó chỉ lái phần dựng fixture) nhưng nó làm BẢNG PILOT nói dối về việc nhóm
# nào đã được thử — và bảng pilot là thứ người ta dựa vào để quyết có chạy lượt đầy đủ không.
_KW_PHU_THUOC = ('ban ghi dang duoc su dung', 'dang duoc su dung', 'dang duoc dung',
                 'co rang buoc', 'chan xoa khi ban ghi')
_KW_HINH_HOC = ('can le', 'chieu rong va chieu cao', 'chieu rong', 'chieu cao',
                'do rong cot', 'can giua', 'can trai', 'can phai', 'thang hang',
                'kich thuoc')
_KW_LAP_NHANH = ('click lien tuc', 'bam lien tuc', 'tab va enter lien tuc',
                 'tab + enter lien tuc', 'nhan enter lien tuc', 'enter lien tuc',
                 'bam nhieu lan', 'lien tuc nhieu lan', 'thao tac tab va enter lien tuc')
_KW_MAC_DINH = ('gia tri mac dinh', 'mac dinh khi', 'mac dinh cua man', 'mac dinh la')
_KW_DU_LIEU_DAI = ('du lieu qua dai', 'du lieu dai', 'gia tri qua dai', 'gia tri dai nhat',
                   'vuot do dai', 'nhan dai nhat', 'chuoi 5.000', 'chuoi 5000', '250 ky tu',
                   '251 ky tu')
_KW_KHONG_HOP_LE = ('ky tu dac biet', 'the html', 'script', 'khong hop le', 'sai dinh dang',
                    'bo trong', 'de trong', 'nhap 0 vao', 'so am', 'ky tu khac so')


def _txt(case):
    return norm('%s\n%s\n%s' % (case.b or '', case.c or '', case.d or ''))


def _co(t, *kw):
    """Khớp theo BIÊN TỪ — xem ghi chú ở khối `_KW_*` phía trên về ba lần cụm ngắn ăn cụm dài."""
    return qalib.chua_tu(t, *kw)


def doc(case):
    """[cờ tiền điều kiện] của một case — hàm THUẦN, sắp xếp ổn định.

    Không chạm app, không chạm `ctx`: `--dry-run` phải in ra ĐÚNG bản kê mà lượt chạy thật
    sẽ dùng, nếu không thì con số hứa hẹn ở bước tiền kiểm lại là một con số khác.
    """
    t = _txt(case)
    nhom = norm(case.ten_nhom or '')
    ra = set()
    if _co(t, *_KW_NHIEU_TRANG) or _RX_SO_TRANG.search(t):
        ra.add(CAN_NHIEU_TRANG)
    m = _RX_SO_BAN_GHI.search(t)
    if m and int(m.group(1)) > 20:
        ra.add(CAN_NHIEU_TRANG)
    if _co(t, *_KW_HOP_CHI_TIET) or 'chi tiet' in nhom:
        ra.add(CAN_HOP_CHI_TIET)
    if _co(t, *_KW_VAI_TRO_B):
        ra.add(CAN_VAI_TRO_B)
    if _co(t, *_KW_HAI_PHIEN):
        ra.add(CAN_HAI_PHIEN)
    if _co(t, *_KW_RONG):
        ra.add(CAN_RONG)
    if _co(t, *_KW_TRUNG):
        ra.add(CAN_TRUNG)
    if _co(t, *_KW_PHU_THUOC):
        ra.add(CAN_PHU_THUOC)
    if _co(t, *_KW_HINH_HOC):
        ra.add(CAN_HINH_HOC)
    if _co(t, *_KW_LAP_NHANH):
        ra.add(CAN_LAP_NHANH)
    if _co(t, *_KW_MAC_DINH):
        ra.add(CAN_MAC_DINH)
    if _co(t, *_KW_DU_LIEU_DAI):
        ra.add(CAN_DU_LIEU_DAI)
    if _co(t, *_KW_KHONG_HOP_LE):
        ra.add(CAN_KHONG_HOP_LE)
    # Case nào đụng tới một BẢN GHI cụ thể thì cần có ít nhất một bản ghi trên màn. Suy từ
    # thao tác ghi mà `qalib.thao_tac_ghi` đã nhận ra + các cờ ở trên, không đoán thêm.
    if (getattr(case, 'thao_tac_ghi', None) or ra & {CAN_HOP_CHI_TIET, CAN_PHU_THUOC,
                                                     CAN_TRUNG, CAN_NHIEU_TRANG}):
        ra.add(CAN_DU_LIEU)
    return sorted(ra)


def so_ban_ghi_can(case, page_size=20):
    """Bao nhiêu bản ghi thì màn mới ở đúng trạng thái case mô tả. 0 = case không đòi gì thêm.

    Đọc theo THỨ TỰ CỤ THỂ → TỔNG QUÁT, và **không bao giờ tự nghĩ ra một con số**:

      ① case ghi rõ *"đủ 21 bản ghi"*        -> đúng 21
      ② case ghi rõ *"đang ở trang thứ 4"*   -> 4 trang, tức `3*page_size + 1`
      ③ case chỉ nói *"trang 2"/"trang sau"* -> vừa đủ hai trang: `page_size + 1`

    Ba mức trên đều là con số CỦA CASE, không phải của tool: §10 của chỉ thị cấm tự đặt N,
    và luật ấy áp cho cả số bản ghi.
    """
    if CAN_NHIEU_TRANG not in doc(case):
        return 0
    t = _txt(case)
    ps = max(1, int(page_size or 20))
    m = _RX_SO_BAN_GHI.search(t)
    if m and int(m.group(1)) > ps:
        return int(m.group(1))
    m = _RX_SO_TRANG.search(t)
    if m:
        so_trang = max(2, int(m.group(1)))
        return (so_trang - 1) * ps + 1
    # SÀN: case đã đòi nhiều trang thì tối thiểu phải vượt một mức/trang. Con số nhỏ hơn đọc
    # được ở đâu đó trong cột C/D (vd *"khi có 15 bản ghi"*) là một ví dụ MINH HOẠ, không
    # phải tiền điều kiện — dựng đúng 15 bản ghi là dựng ra màn MỘT trang cho một case hỏi
    # về nhiều trang.
    return ps + 1


def can_gi(case, page_size=20):
    """Bản kê đầy đủ cho `cases.json`: {'co': […], 'so_ban_ghi_can': N}."""
    co = doc(case)
    return {'co': co, 'so_ban_ghi_can': so_ban_ghi_can(case, page_size) if co else 0}


# ══════════════════════════════════════════════════════════════════════════════
# 3. DỰNG TRẠNG THÁI  — chạm app, đi qua đúng các cổng đã có
# ══════════════════════════════════════════════════════════════════════════════
KHONG_CAN = 'KHONG_CAN'          # case không đòi trạng thái nào -> chạy thẳng
DA_CO = 'DA_CO'                  # màn đã sẵn ở trạng thái case cần -> không dựng gì
QA_DATA = 'QA_DATA'              # đã tạo dữ liệu QA thật
MOCK = 'MOCK'                    # đã dựng bằng mô phỏng mạng
KHONG_DUNG_DUOC = 'KHONG_DUNG_DUOC'

# Trần số bản ghi QA mà MỘT case được phép tạo để dựng trạng thái. Van an toàn thứ hai bên
# cạnh `qa_data.TRAN_BAN_GHI` (trần của cả lượt): một case đòi 500 bản ghi vì cột C viết
# *"đủ 501 bản ghi"* sẽ ngốn cả lượt chạy và để lại 500 bản ghi thật phải dọn. Chạm trần
# thì rơi sang mock chứ không tạo tiếp.
TRAN_MOT_CASE = int(qalib.__dict__.get('QA_TRAN_MOT_CASE', 0) or 0) or 60


def _la_chan_an_toan(e):
    """Lỗi này có phải HÀNG RÀO AN TOÀN nói không? -> phải để lọt lên trên, không được nuốt.

    Nhận theo LỚP chứ không theo chữ trong thông báo: `chay_live.ChanAnToan` và
    `qa_data.LoiSoQA` đều là "máy từ chối", và cả hai đều phải dừng lượt chạy.
    """
    try:
        from chay_live import ChanAnToan
    except Exception:
        ChanAnToan = ()
    try:
        from qa_data import LoiSoQA
    except Exception:
        LoiSoQA = ()
    lop = tuple(x for x in (ChanAnToan, LoiSoQA) if isinstance(x, type))
    return bool(lop) and isinstance(e, lop)


class BanDung(dict):
    """Kết quả một lần dựng trạng thái. Dùng như dict, `bool()` = dựng được hay không."""

    def __bool__(self):
        return self.get('loai') != KHONG_DUNG_DUOC

    @property
    def fallback(self):
        return self.get('fallback')


def _kq(loai, mo_ta, **them):
    return BanDung(loai=loai, mo_ta=mo_ta, **them)


def tong_ban_ghi(ctx):
    """Tổng số bản ghi màn đang báo — `None` nếu không đọc được (KHÔNG đoán bằng số dòng)."""
    import live_ui as ui
    pt = ui.doc_phan_trang(ctx.c) or {}
    s = re.sub(r'[^\d]', '', str(pt.get('tong') or ''))
    return int(s) if s else None


def dung(ctx, case, co=None, page_size=None):
    """Dựng trạng thái mà `case` đòi. -> `BanDung`.

    KHÔNG ném lỗi cho chuyện "dựng không nổi" — đó là một KẾT QUẢ, và `chay_live` cần nó để
    ghi `reason` đúng. Chỉ để lọt lên trên những lỗi của hàng rào (`ChanAnToan`) vì chúng
    phải dừng cả lượt chạy chứ không được biến thành một case CHƯA ĐO.
    """
    co = list(co if co is not None else doc(case))
    if CAN_NHIEU_TRANG in co:
        return dung_nhieu_trang(ctx, case, page_size=page_size)
    if CAN_DU_LIEU in co:
        return dung_co_ban_ghi(ctx, case)
    return _kq(KHONG_CAN, 'case không đòi trạng thái nào phải dựng trước')


def dung_co_ban_ghi(ctx, case):
    """Bảo đảm màn có ÍT NHẤT một bản ghi thao tác được — ưu tiên bản ghi QA của lượt chạy."""
    if not ctx.cho_phep_ghi:
        n = len(__import__('live_ui').doc_bang(ctx.c) or [])
        if n:
            return _kq(DA_CO, 'màn đã có %d bản ghi (lượt chạy chỉ-đọc, không tạo thêm)' % n,
                       so_ban_ghi=n)
        return _kq(KHONG_DUNG_DUOC, 'màn không có bản ghi nào và lượt chạy đang CHỈ ĐỌC',
                   ly_do='read_only_no_data')
    try:
        m = ctx.ban_ghi(case)
    except Exception as e:
        # ⚠️ HÀNG RÀO NÓI KHÔNG thì phải để lọt lên trên. `except Exception` trơn ở đây từng
        # nuốt cả `ChanAnToan` — nghĩa là một lượt chạy đáng lẽ DỪNG lại biến thành một case
        # "không dựng được trạng thái" rồi chạy tiếp. Đó đúng là đường mà sự cố 2026-08-02
        # đi qua, chỉ khác chỗ đứng.
        if _la_chan_an_toan(e):
            raise
        return _kq(KHONG_DUNG_DUOC, 'không tạo được bản ghi QA: %s' % str(e)[:180],
                   ly_do='fixture_create_failed')
    return _kq(QA_DATA, 'dùng bản ghi QA %s' % m['ma'], ban_ghi=[m['ma']], so_ban_ghi=1)


def dung_nhieu_trang(ctx, case, page_size=None):
    """Đưa màn về trạng thái CÓ NHIỀU TRANG — dữ liệu QA thật trước, mô phỏng mạng sau.

    Đây là ca đắt nhất và cũng là ca đáng giá nhất (20 case của `ViTriLuuTru`, 18 của
    `LoaiLuuTru`). Ba nhánh, xét đúng thứ tự §16:

      ① màn đã đủ nhiều trang               -> `DA_CO`, không tạo gì
      ② tạo bù cho đủ bằng dữ liệu QA thật  -> `QA_DATA`   (đường CHÍNH)
      ③ không tạo nổi (chỉ-đọc / chạm trần / SETUP hỏng) -> mô phỏng mạng `nhieu_ban_ghi`

    Nhánh ③ **không** dùng cho case hỏi về nghiệp vụ máy chủ (`la_case_cam_mock`) — khi ấy
    trả `KHONG_DUNG_DUOC` để case ra `CHƯA ĐO` có lý do, chứ không mượn mock lấy một kết luận.
    """
    ps = int(page_size if page_size is not None else (ctx.hs_so('page_size_mac_dinh', 20) or 20))
    can = so_ban_ghi_can(case, ps)
    # ⚠️ XOÁ BỘ LỌC TRƯỚC KHI ĐẾM. Case trước có thể để lại từ khoá trong ô tìm kiếm (mọi
    # phép đo dùng chung một tab), và khi ấy "Tổng số bản ghi" là tổng CỦA KẾT QUẢ LỌC. Đọc
    # nhầm con số đó thì tool kết luận màn đang thiếu bản ghi rồi đi tạo bù hàng chục bản
    # ghi thật — sai theo hướng tốn kém nhất, và không dòng log nào kêu.
    try:
        ctx.ve_danh_sach(lam_moi=True)
    except Exception:
        pass
    tong = tong_ban_ghi(ctx)
    if tong is not None and tong >= can:
        return _kq(DA_CO, 'màn đã có %d bản ghi ≥ %d bản ghi case cần' % (tong, can),
                   so_ban_ghi=tong, can=can, muc_trang=ps)
    thieu = (can - tong) if tong is not None else can
    if ctx.cho_phep_ghi and 0 < thieu <= TRAN_MOT_CASE:
        ra = _tao_bu(ctx, case, thieu)
        if isinstance(ra, tuple):
            da, tong_sau = ra
            # §H — KIỂM LẠI SAU KHI DỰNG. Bản trước tạo xong là báo `QA_DATA` luôn, tin rằng
            # "đã tạo N bản ghi" nghĩa là "màn đã có nhiều trang". Hai câu ấy khác nhau: bản
            # ghi có thể bị bộ lọc che, app có thể đếm khác, và khi ấy phép đo phân trang chạy
            # trên một màn MỘT trang rồi trả `None` — đúng chỗ 19 case phân trang nằm lại.
            # Trạng thái chỉ được coi là dựng xong khi ĐỌC LẠI thấy đủ.
            if tong_sau is not None and tong_sau >= can:
                return _kq(QA_DATA, 'tạo %d bản ghi QA để màn có nhiều trang (tổng còn %s ≥ %d '
                                    'bản ghi case cần)' % (len(da), tong_sau, can),
                           ban_ghi=da, so_ban_ghi=tong_sau, can=can, muc_trang=ps,
                           so_tao=len(da))
            ly_do_tao = ('tạo %d bản ghi rồi mà đọc lại tổng chỉ còn %s, chưa đạt %d bản ghi '
                         'case cần' % (len(da), tong_sau, can))
        else:
            ly_do_tao = ra.get('mo_ta')
    else:
        ly_do_tao = ('lượt chạy CHỈ ĐỌC' if not ctx.cho_phep_ghi else
                     'cần tạo %d bản ghi, vượt trần %d bản ghi/case' % (thieu, TRAN_MOT_CASE))
    return _mock_nhieu_ban_ghi(ctx, case, can, ly_do_tao, tong)


def _tao_bu(ctx, case, thieu):
    """Tạo bù `thieu` bản ghi QA qua đúng biểu mẫu Thêm mới.

    -> `(ds_mã, tổng_đọc_lại)` khi tạo trót lọt · `BanDung` mang `KHONG_DUNG_DUOC` khi gãy
    giữa chừng. Người gọi phải KIỂM tổng đọc lại trước khi coi trạng thái là đã dựng (§H).
    """
    da = []
    try:
        for _ in range(int(thieu)):
            m = ctx.tao_ban_ghi(case)
            da.append(m['ma'])
    except Exception as e:
        if _la_chan_an_toan(e):
            raise                      # hàng rào nói KHÔNG -> dừng cả lượt, không nuốt
        # Tạo được một phần vẫn là một kết quả: nói rõ tạo được mấy bản ghi rồi để nhánh
        # mock quyết định. Bản ghi đã tạo nằm trong sổ nên bước DỌN vẫn dọn được chúng.
        return _kq(KHONG_DUNG_DUOC,
                   'tạo được %d/%d bản ghi rồi dừng: %s' % (len(da), thieu, str(e)[:150]),
                   ly_do='fixture_create_failed', ban_ghi=da)
    ctx.ve_danh_sach(lam_moi=True)
    tong = tong_ban_ghi(ctx)
    return da, tong


def _mock_nhieu_ban_ghi(ctx, case, can, ly_do_tao, tong):
    """Fallback §16: dựng NHIỀU BẢN GHI ở tầng phản hồi mạng, không chạm dữ liệu máy chủ."""
    if qalib.la_case_cam_mock(case.b, case.c):
        return _kq(KHONG_DUNG_DUOC,
                   'không dựng được dữ liệu thật (%s) và case này CẤM mô phỏng mạng '
                   '(hỏi về nghiệp vụ máy chủ — luật ① §4e)' % ly_do_tao,
                   ly_do='fixture_unavailable_mock_forbidden')
    import mock_live
    eps = mock_live.endpoints_doc(ctx.hs)
    if not eps:
        return _kq(KHONG_DUNG_DUOC,
                   'không dựng được dữ liệu thật (%s) và hồ sơ màn chưa khai endpoint ĐỌC '
                   '(`grounding.api`) để mô phỏng' % ly_do_tao,
                   ly_do='fixture_unavailable_no_read_endpoint')
    cs = qalib.CuaSoMock(case.key, 'nhieu_ban_ghi', eps,
                         'dựng %d bản ghi để màn có nhiều trang' % can)
    return _kq(MOCK, 'mô phỏng mạng trả %d bản ghi (dữ liệu thật chỉ có %s; %s)'
               % (can, tong if tong is not None else '?', ly_do_tao),
               fallback='MOCK', cua_so_mock=cs, so_ban_ghi=can,
               mock_so_ban_ghi=can)


# ══════════════════════════════════════════════════════════════════════════════
# 4. BỌC MỘT PHÉP ĐO TRONG TRẠNG THÁI ĐÃ DỰNG
# ══════════════════════════════════════════════════════════════════════════════
class TrangThai:
    """`with tien_dieu_kien.TrangThai(ctx, case) as tt:` — dựng vào, dọn ra.

        with TrangThai(ctx, case) as tt:
            if not tt:
                return None              # dựng không nổi -> phép đo im, lý do đã nằm trong tt
            ...đo trên màn đang ở đúng trạng thái...

    Nhánh mock giữ cửa sổ `mock_live.Mock` mở suốt khối `with` và mở lại màn để phản hồi
    đã biến đổi thật sự đi vào trang. Nhánh dữ liệu QA không cần gì thêm khi ra — bản ghi
    nằm trong sổ và được bước DỌN chung của lượt chạy dọn.
    """

    def __init__(self, ctx, case, co=None, page_size=None):
        self.ctx, self.case = ctx, case
        self.co = list(co if co is not None else doc(case))
        self.page_size = page_size
        self.ban_dung = None
        self.mk = None

    def __enter__(self):
        self.ban_dung = dung(self.ctx, self.case, self.co, self.page_size)
        if self.ban_dung.get('loai') == MOCK:
            import mock_live
            cs = self.ban_dung.get('cua_so_mock')
            self.mk = mock_live.Mock(self.ctx.c, cs, cong=self.ctx.cong,
                                     so_ban_ghi=int(self.ban_dung.get('mock_so_ban_ghi') or 45))
            self.mk.__enter__()
            try:
                self.ctx.c.go(self.ctx.url)
                self.mk.cho("document.querySelectorAll('table th').length?1:0", giay=20)
                self.mk.nghi(1.0)
            except Exception as e:
                self.ban_dung = _kq(KHONG_DUNG_DUOC,
                                    'mở lại màn dưới cửa sổ mô phỏng không thành: %s'
                                    % str(e)[:150], ly_do='fixture_mock_failed')
                return self
            if not self.mk.da_dung:
                # Cửa sổ mock không giữ được request nào = trạng thái CHƯA TỪNG được dựng.
                # Kết luận lúc này nói về một màn khác với màn case mô tả.
                self.ban_dung = _kq(KHONG_DUNG_DUOC,
                                    'cửa sổ mô phỏng không giữ được request nào (màn không gọi '
                                    'endpoint đã khai) nên trạng thái nhiều trang CHƯA được dựng',
                                    ly_do='fixture_mock_no_request')
        return self

    def __exit__(self, *a):
        if self.mk is not None:
            try:
                self.mk.__exit__(*a)
            finally:
                self.mk = None
                try:
                    self.ctx.ve_danh_sach(lam_moi=True)
                except Exception:
                    pass
        return False

    def __bool__(self):
        return bool(self.ban_dung)

    # ── bản kê cho execution record ─────────────────────────────────────────
    @property
    def loai(self):
        return (self.ban_dung or {}).get('loai')

    @property
    def mo_ta(self):
        return (self.ban_dung or {}).get('mo_ta') or ''

    @property
    def ly_do(self):
        return (self.ban_dung or {}).get('ly_do') or ''

    @property
    def fallback(self):
        return (self.ban_dung or {}).get('fallback')

    def khoi(self):
        d = dict(self.ban_dung or {})
        cs = d.pop('cua_so_mock', None)
        if cs is not None:
            d['mock'] = cs.khoi()
        return d

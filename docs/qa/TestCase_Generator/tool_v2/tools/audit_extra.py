# -*- coding: utf-8 -*-
"""4 phép rà bổ sung mà bộ audit_* cũ KHÔNG kiểm (rút từ đợt Admin 05/08/2026) — chỉ đọc.

  1. NHÓM GỘP   : một nhóm chứa nhiều control (vi phạm luật 2 — mỗi control 1 nhóm)
  2. NÚT BẮT BUỘC: CN Thêm/Sửa/Xoá phải có Button Hủy + Button <hành động> (mẫu NCC-mau)
  3. NHÓM RỖNG  : nhóm sub/sub2 không có case nào — dấu hiệu case bị chuyển đi mất khi tách
  4. TIÊU ĐỀ HỎNG (thêm 2026-09-08): case ghép từ khuôn `{f}` mà tên trường ra RỖNG
  5. RÒ CODE    (thêm 2026-09-08): cột D (Kết quả mong muốn) lọt từ ngữ CODE/FE
  6. THAO TÁC MA (thêm 2026-09-09): case nói về control của một THAO TÁC mà file KHÔNG có CN nào
 10. KHAI LOẠI CONTROL LẠC (thêm 2026-09-10): `loai_control` của hồ sơ màn trỏ vào nhãn loại
     không có trong `QUOTA`, hoặc vào một tên nhóm KHÔNG tồn tại trong bộ case — cả hai đều làm
     override RƠI IM LẶNG và bank SAI vẫn được bơm.
 18. CỤM PHÂN TRANG THIẾU CONTROL (thêm 2026-09-10, chỉ thị + 2 ảnh người đặt việc): CN có nhóm
     `Phân trang` mà thiếu control đặt số bản ghi/trang, hoặc chưa quyết có `Textbox Nhập số
     trang` hay không. Cụm phân trang gồm nhiều control rời nên mọi bộ rà cũ chỉ soi từng nhóm
     ĐÃ CÓ — nhóm thiếu hẳn thì im (đúng điểm mù §1 của luật định mức).
 11. THIẾU HẬU TỐ "nếu có" (thêm 2026-09-10): tiêu đề thuộc danh sách case BẮT BUỘC mang hậu
     tố điều kiện (`qalib.CASE_CAN_HAU_TO`) mà viết trống hậu tố ⇒ case đọc thành lời KHẲNG
     ĐỊNH màn có thao tác đó. Sửa bằng `fix_hau_to.py` (chỉ nối hậu tố, KHÔNG viết lại wording).

Vì sao có phép 4 — điểm mù #2 của README: `audit_validate_quota` chỉ **ĐẾM** đủ số case,
không soi tiêu đề. File `Testcase-Role-QuanTri-LuongDuLieu.xlsx` (nhận 08/09) qua sạch
`0·0·0·0·0·0` nhưng cả 8 case nhóm `Danh sách` mang tiêu đề *"Kiểm tra giá trị mặc định
của / lưới"* — nhóm tên `Danh sách / lưới` bị `qalib.field_of()` cắt mất tiền tố, còn trơ
`/ lưới`. Gốc đã vá ở `qalib.field_of()`; phép rà này để bắt các file ĐÃ LỠ sinh ra như thế.

Vì sao có phép 6 — đo 2026-09-09 trên màn `Danh mục trình độ ngoại ngữ`: bộ mục `ICON`
rút wording của mẫu thành *"Kiểm tra màu biểu tượng xoá"*, trong khi họ màn danh mục MOET
(`CategoryCrudPage` + `deleteAsStatus: true`) BỎ HẲN thao tác Xoá. Phép 6 suy ngược từ chính
file: nói tới *biểu tượng/nút xoá* thì file phải có một CN Xoá — không có là case ma. Lớp lỗi
này `audit_control_that.py` cũng không bắt: nó đối chiếu **TÊN NHÓM** với bundle FE, không soi
**TIÊU ĐỀ case**.

⚠️ **MIỄN TRỪ hậu tố điều kiện.** Mẫu viết NGUYÊN VĂN *"Kiểm tra màu icon xóa **nếu có**"*
(cột Kết quả *"Icon màu đỏ"*). Chính hậu tố *"nếu có"* làm case dùng được trên MỌI màn, kể cả
màn không có Xoá — nên `HAU_TO_DIEU_KIEN` bỏ qua mọi tiêu đề mang hậu tố đó. ⇒ **Phép 6 không
đòi bỏ case; nó chỉ đòi TRẢ LẠI hậu tố.**

Đo 2026-09-09 sau khi có miễn trừ: còn **3 ca THẬT** — `QuanTri/ChucVu` (×2) ·
`QuanTri/TrinhDoDaoTao` (×1) mang wording RÚT GỌN *"Kiểm tra màu biểu tượng xoá"* do bank cũ
sinh ra, mất hậu tố nên đọc thành lời KHẲNG ĐỊNH màn có nút xoá. **Cách sửa: trả về nguyên văn
mẫu** (`quota_cases.ICON` mục `mau icon xoa` đã đúng từ 09/09), KHÔNG phải xoá case.

    python3 audit_extra.py [Admin|NCC|Teacher] [tên file]
"""
import os, sys, glob, re, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, qalib  # noqa: F401
import patch_rangbuoc, quota_cases   # phép 7 dùng CHUNG luật ghép cặp của bộ bơm
import patch_giaodien
import fix_thu_tu_validate
import fix_chi_thi_0910                # phép 8 dùng CHUNG luật liệt kê của bộ bơm

def n(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

ROLE = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
ONLY = sys.argv[2] if len(sys.argv) > 2 else None
CFG  = roles.get(ROLE)
DIR, SKIP = CFG['dir'], set(CFG['skip'])

KINDS = ['textbox', 'textarea', 'selectbox', 'combobox', 'checkbox', 'radio', 'button',
         'icon', 'datepicker', 'upload', 'multiselect']
BAO   = ('validate các trường', 'chức năng tìm kiếm đơn lẻ')     # nhóm bao, không chứa case trực tiếp

# ── phép 6: control của thao tác X -> file phải có CN thao tác X
# Khoá hẹp CÓ ĐỊNH NGỮ (biểu tượng/icon/nút/button + động từ) để không bắt nhầm case mẫu
# verbatim "vị trí trang sau khi thực hiện 1 thao tác(sửa, xóa, thêm mới,...)" (§5.1).
THAO_TAC_MA = (
    ('Xoá',        (r'bieu tuong xoa', r'\bicon xoa', r'\bnut xoa', r'button xoa'),
                   (r'\bxoa\b',)),
    ('Khôi phục',  (r'bieu tuong khoi phuc', r'\bicon khoi phuc', r'\bnut khoi phuc',
                    r'button khoi phuc'), (r'khoi phuc',)),
)


# Hậu tố ĐIỀU KIỆN của mẫu — case mang những chữ này KHÔNG phải case ma: mẫu cố ý viết
# "nếu có" để dùng được trên cả màn KHÔNG có thao tác đó (chỉ thị + ảnh người đặt việc
# 2026-09-09, mẫu r… `Kiểm tra màu icon xóa nếu có` / cột Kết quả `Icon màu đỏ`).
# Trước khi có miễn trừ này, phép rà báo 3 case ĐÚNG MẪU là "thao tác ma" — báo oan.
# ⚠️ 2026-09-10: danh sách này DỜI về `qalib` — phép ⑪ và `fix_hau_to.py` dùng chung, giữ bản
# chép ở đây thì hai nơi lệch nhau lúc nào không biết (bài học `sync_gdc_zoom_steps`).
HAU_TO_DIEU_KIEN = qalib.HAU_TO_DIEU_KIEN


def thao_tac_ma(title, cn_all):
    """Tên thao tác mà case đang nói tới nhưng file KHÔNG có CN nào; None = sạch."""
    t = n(title)
    if any(k in t for k in HAU_TO_DIEU_KIEN):
        return None
    for ten, pats, cn_pats in THAO_TAC_MA:
        if not any(re.search(x, t) for x in pats):
            continue
        if not any(re.search(y, c) for c in cn_all for y in cn_pats):
            return ten
    return None


def is_merged(name):
    """Nhóm gộp THẬT: >=2 loại control khác nhau, hoặc liệt kê >=2 trường sau tên loại.
    KHÔNG tính dấu / trong tên một control (Selectbox Tỉnh/Thành, Xã/Phường, Số bản ghi/trang)."""
    nb = n(name)
    if len({k for k in KINDS if k in nb}) >= 2:
        return True
    m = re.match(r'^(textbox|textarea|selectbox|ô|combobox|\d+ ô chọn)\s+(.*)$', nb)
    if not m:
        return False
    rest = re.sub(r'\(.*?\)', '', m.group(2))
    parts = [x for x in re.split(r'\s*/\s*|\s*,\s*|\s+&\s+', rest) if x.strip()]
    # ⚠️ Vá 2026-09-10: dòng docstring trên đã kể "Số bản ghi/trang" là ca MIỄN TRỪ, nhưng
    # nhánh regex này KHÔNG thi hành nên chính tên nhóm CHUẨN của cụm phân trang
    # (`qalib.NHOM_PERPAGE` = "Textbox Số bản ghi/trang") bị báo [GỘP] oan ở MỌI màn khai đúng
    # tên chuẩn. Dấu / ở đây là "mỗi trang", không phải ranh giới giữa hai control.
    return (len(parts) >= 2
            and not re.match(r'^(tim|loc|so ban ghi|so dong|so trang)\b', rest.strip()))

# --- Phép 4: tiêu đề case hỏng vì tên trường ghép vào RỖNG ---------------------------
# Không đoán theo dấu "/" chung chung — trên bộ case thật có 297 tiêu đề dùng "/" với nghĩa
# "hoặc" hoàn toàn hợp lệ ("có dấu / không dấu", "họ tên / email", "Chọn tất cả / Bỏ chọn").
# Thay vào đó đối chiếu với CHÍNH TÊN NHÓM: tái lập phần dư mà bản `field_of()` cũ trả về,
# nếu phần dư đó mở đầu bằng ký tự không phải chữ/số thì nó là chuỗi hỏng — và tiêu đề case
# nào CHỨA đúng chuỗi đó là case đã bị ghép sai. Chính xác, không nhiễu.
SEPS = '/,;:|&+-\u2013\u2014'          # dấu phân cách — KHÔNG gồm nháy, ngoặc
TITLE_BAD = [
    # CHỈ `{f}` — chỗ trống thật của khuôn trong `quota_cases.py`. Đừng bắt `{N}`/`{X}`:
    # đó là ký hiệu cố ý trong nhãn UI ("Kiểm tra nhãn \"{N} campaign\"" — NCC-BoCaiPhanMem).
    (re.compile(r'\{f\}'), 'còn chỗ trống {f} chưa thay'),
    (re.compile(r'\(\s*\)|\[\s*\]'), 'ngoặc rỗng'),
]


def degenerate_frag(gname):
    """Phần dư sau khi cắt tiền tố loại control, KHI nó không mở đầu bằng chữ/số.

    `Danh sách / lưới` -> `/ lưới` (hỏng)   ·   `Selectbox Tỉnh/Thành` -> None (lành).
    Đây đúng là chuỗi mà `qalib.field_of()` bản trước 2026-09-08 ghép vào khuôn `{f}`.

    Chỉ tính khi ký tự đầu là DẤU PHÂN CÁCH. Nháy và ngoặc là tên trường hợp lệ:
    `Selectbox "Tất cả lớp"` -> `"Tất cả lớp"` là ĐÚNG, không phải chuỗi hỏng
    (đo 2026-09-08: bắt cả nháy thì Teacher-ChamBai báo nhầm 2 case).
    """
    f = qalib._FIELD_PREFIX.sub('', gname).strip()
    f = re.sub(r'\s*\(.*?\)\s*$', '', f).strip()
    return f if f and f[0] in SEPS else None


def bad_title(t, frag=None, gname=None):
    # Chỉ là HỎNG khi tiêu đề chứa MẢNH VỠ mà KHÔNG chứa tên nhóm đầy đủ. Nhóm đặt tên có dấu
    # gạch dài kiểu `Danh sách — chế độ Lưới (grid)` thì phần dư cũng mở đầu bằng dấu phân cách,
    # nhưng tiêu đề chép nguyên cả tên nhóm nên KHÔNG mất gì (đo 2026-09-08: 10 ca báo nhầm ở
    # `NCC-Media-mau`, chỉ lộ ra sau khi bộ rà đọc được sheet BP thứ 2-3).
    if frag and frag in t and not (gname and gname in t):
        return 'mất tên trường (ghép phải "%s" của tên nhóm)' % frag
    for rx, why in TITLE_BAD:
        if rx.search(t):
            return why
    return None


# ── Phép 5: cột D rò từ ngữ CODE ─────────────────────────────────────────────────────────
# §D của HO-SO-DU-AN: "Cột D không chứa code" — có LUẬT nhưng trước 2026-09-08 KHÔNG có phép rà
# nào. Cột D là thứ QA đọc để biết "đúng thì phải thế nào", lọt tên biến/đuôi file vào đó là
# bắt người chạy test phải đọc code mới hiểu. Đo trên bộ thật: **9 ca / 15.688 case**.
# Luật + phép rà DỜI về `qalib` 2026-09-14 để `a6_auto` CHẶN được ngay lúc ghi, không chỉ
# rà sau khi bộ case đã giao. Giữ tên cũ ở đây cho mọi chỗ đang gọi.
D_LEAK = qalib.D_LEAK
ro_code = qalib.ro_code


t_merge = t_btn = t_empty = t_title = t_leak = t_ma = t_rb = t_gd = t_zoom = 0
t_lc = t_hau = t_tt = t_tv = t_bo = t_dd = t_nut = t_bc = t_pt = t_tt_gd = 0
t_kqd = 0      # ⑳ cột D khối Validate quá chi tiết so với khuôn mẫu — MÁY CÒN RÚT ĐƯỢC
t_kqt = 0      # ⑳b cùng lỗi nhưng mọi phép cắt cơ giới đã bó tay -> NỢ NỘI DUNG, sửa tay
t_lech = 0     # ㉓ cột C/D không khớp MỤC ĐÍCH nêu ở cột B
t_mau = 0      # ㉔ cột D thiếu Ý mà bản chữ mẫu đòi
t_sx = 0       # ㉗ control sắp xếp không nằm ở CN Danh sách
t_gt = 0       # ㉘ case liệt kê giá trị chưa dùng được
t_anh = 0      # ㉙ cột C/D lẫn tiếng Anh / đường dẫn mã (chỉ thị 2026-09-14)
# Dùng `qalib.iter_role_files` thay cho `glob` + `tcfix.load` (vá 2026-09-08): bản cũ chỉ đọc
# **sheet BP ĐẦU TIÊN** nên file nhiều sheet (`NCC-KyThi` có 3) bị bỏ sót phần sau — quét tay
# thấy 9 ca rò code, bộ rà chỉ báo 7. Và một file hỏng làm chết cả đợt rà thay vì bỏ qua.
# ── phép 25 LỆCH BANK (2026-09-12) ────────────────────────────────────────────────────
# Bản chữ mẫu nằm ở HAI chỗ: `qalib.KQ_MAU_*` (bộ SỬA dùng) và `quota_cases.*` (bộ SINH MỚI
# dùng). Hai chỗ lệch nhau thì sửa bộ cũ xong vẫn đúng, mà **sinh màn mới lại ra chữ cũ** —
# đúng bài học *"vá script xong phải chạy trọn pipeline sinh mới mới gọi là vá tool"*. Đo
# 2026-09-12: 9/10 mục `ICON` của bộ sinh còn chữ cũ sau khi đã sửa xong 6 file.
# Phép này chạy MỘT LẦN mỗi đợt rà, không phụ thuộc file nào.
_t_bank = 0
for _bn, _g in (('ICON', 'Icon'),
                ('PERPAGE', 'Selectbox Số bản ghi trên trang'),
                ('PAGE_RECORDS', 'Textbox Số bản ghi trên trang'),
                ('CHECKBOX', 'Checkbox Hoạt động'),
                ('TEXTBOX', 'Textbox Mã')):
    for _row in getattr(quota_cases, _bn, []):
        if len(_row) < 4:
            continue
        _mau = qalib.kq_mau_cho(_g, _row[1])
        if _mau and '{' not in _mau and n(_mau) != n(_row[3]):
            print('   [BANK] quota_cases.%-13s %-40s <- cột D lệch bản chữ mẫu'
                  % (_bn, _row[1].replace('{f}', '')[:40]))
            _t_bank += 1
# ── phép ㉖ ĐỊNH MỨC ≠ BANK (2026-09-12) ───────────────────────────────────────────────
# `plan_quota_fill` tính `need = định mức − số case đang có` rồi `break` ⇒ **bank dài hơn định
# mức thì phần ĐUÔI không bao giờ được bơm, im lặng**. `audit_validate_quota` không bắt được:
# nó chỉ so với ĐỊNH MỨC, mà chính định mức mới là chỗ sai.
# Đã trả giá 2 lần trong 2 ngày: `Textarea` (9 vs 11 — mất `copy dữ liệu dán vào ô` và `nhập
# tiếng Việt có dấu` ở CẢ 4 nhóm) và 3 nhóm nữa phát hiện 12/09 — `File Excel` 13 vs 18,
# `Textbox tìm kiếm` 7 vs 9, `Textbox số` 10 vs 11 (tổng 14 case thiếu trong bộ ChuyenVien).
# ⚠️ Phải tra qua **`qalib.KINDSRC`** — đó là bảng `plan_quota_fill` dùng. Tra nhầm
#    `quota_cases.BY_KIND` thì ra bảng RỖNG và in "0 lệch" (số 0 giả, đã dính khi viết phép này).
_t_dm = 0
for _ten, _dm, _kw in qalib.QUOTA:
    _src = qalib.KINDSRC.get(_ten)
    if not _src:
        continue                      # nhóm cố ý không khai (bộ mục phụ thuộc ngữ cảnh)
    _bank = getattr(quota_cases, _src, None)
    if _bank is None:
        print('   [ĐỊNH MỨC] %-30s KINDSRC trỏ bank KHÔNG TỒN TẠI: %s' % (_ten, _src))
        _t_dm += 1
    elif len(_bank) != _dm:
        print('   [ĐỊNH MỨC] %-30s định mức %d ≠ bank %s %d  (%+d case %s)'
              % (_ten, _dm, _src, len(_bank), len(_bank) - _dm,
                 'bị CẮT im lặng' if len(_bank) > _dm else 'bank thiếu'))
        _t_dm += 1
# ㉖b `BY_KIND` phải TRÙNG `KINDSRC` — hai bảng cùng một việc (tra bank theo loại nhóm), lệch
# thì hai đường bơm ra hai bộ case khác nhau. Tài liệu dự án đã đòi *"khai đủ 4 chỗ: QUOTA ·
# KINDSRC · bank · BY_KIND"* nhưng không có gì thi hành. Đo 2026-09-12: lệch 3 chỗ, trong đó
# `Upload file` trỏ nhầm sang bank **UPLOAD_IMG** (bank ảnh) — lỗi chép dán, không ai thấy.
for _k, _v in quota_cases.BY_KIND.items():
    _src = qalib.KINDSRC.get(_k)
    if _src and getattr(quota_cases, _src, None) is not _v:
        print('   [ĐỊNH MỨC] BY_KIND[%-24s] khác KINDSRC -> %s' % (_k, _src))
        _t_dm += 1
if _t_dm:
    print('   => sửa `qalib.QUOTA` cho bằng `len()` của bank, rồi chạy lại `patch_quota`.')

# ㉕b BANK VI PHẠM CHÍNH LUẬT ⑳/㉑ (2026-09-12). Phần trên chỉ so bank với BẢN CHỮ MẪU; phép
# này soi bank có vi phạm luật *cột D quá chi tiết* / *không ghi số liệu đếm* không. Đo lần
# đầu: **139/388 mục bank vi phạm** (108 mục dính dấu `;`) ⇒ sinh màn mới ra 36 case bị cờ
# trong khi bộ đã gọt chỉ 12. Sửa bộ case mà không sửa bank thì màn sau lại sai y như cũ.
# ⚠️ MIỄN TRỪ các bank chép VERBATIM từ mẫu: mẫu có vài câu dài hơn ngưỡng ⑳ (lưới *giá trị
#    mặc định* 531 ký tự, khối xuất excel…) — không thể vừa bắt chép y mẫu vừa báo đỏ chính nó.
_BANK_VERBATIM_MAU = ('DANHSACH_YCHANG', 'PAGING_YCHANG', 'SEARCH_COMMON', 'EXPORT_GDC',
                      '_EXPORT_GDC_TPL', 'LIST', 'PERPAGE', 'SEARCH_SINGLE_TEXT',
                      'SELECTBOX_MULTI')
for _bn in dir(quota_cases):
    if _bn in _BANK_VERBATIM_MAU or _bn.startswith('__'):
        continue
    _v = getattr(quota_cases, _bn)
    if not (isinstance(_v, list) and _v and isinstance(_v[0], tuple)):
        continue
    for _row in _v:
        if len(_row) < 4 or not isinstance(_row[3], str):
            continue
        _l = qalib.kq_qua_chi_tiet(_row[3]) + qalib.kq_co_so_lieu(_row[3])
        if _l:
            print('   [BANK] quota_cases.%-13s %-36s <- %s'
                  % (_bn, _row[1].replace('{f}', '')[:36], ', '.join(_l)))
            _t_bank += 1
if _t_bank:
    print('   => sinh màn MỚI sẽ ra chữ cũ/chữ dài. Đồng bộ `quota_cases` theo `qalib.KQ_MAU_*`')
    print('      và chạy `rut_gon_kq`/`bo_so_lieu_kq` lên cột D của bank.')

for _sh in qalib.iter_role_files(ROLE, ONLY):
    tc, nm = _sh.tc, (_sh.name + ('/' + _sh.bp if _sh.multi else ''))
    rows = [r for r in tc.order if r >= 12]
    # Lượt quét TRƯỚC: gom mọi tên CN của file — phép 6 cần biết file có CN nào rồi mới xét case.
    cn_all = [n((tc.c(r, 'B') or '').split('\n')[0]) for r in rows if tc.lvl(r) == 'cn']
    out = []
    # ── phép 8 GIAO DIỆN CHUNG (2026-09-09): case `hiển thị đầy đủ các thông tin` mà cột C
    #    KHÔNG liệt kê thành phần nào (chép verbatim file nền: cột C lặp lại tiêu đề, cột D chỉ
    #    "… như thiết kế (như hình)"). Chỉ xét CN CÓ nhóm control — CN Xuất excel không có.
    for _r, _cn, _g, _ds in patch_giaodien.quet(tc):
        # Cột D, không phải cột C: từ 2026-09-11 danh sách thành phần chỉ nằm ở cột
        # *Kết quả mong muốn* (chỉ thị người đặt việc) — soi cột C thì phép này báo thiếu ở MỌI
        # CN của mọi file vừa ghi đúng.
        if _g and not patch_giaodien.da_liet_ke(tc.c(_r, 'D')):
            out.append(('GIAO DIỆN', _cn[:44],
                        'case liệt kê thành phần chưa nêu trường nào (%d nhóm control)' % len(_g)))
            t_gd += 1
    # ── phép 12 THỨ TỰ LIỆT KÊ (2026-09-10): danh sách thành phần ở case `hiển thị đầy đủ`
    #    phải xếp theo THỨ TỰ TRÊN MÀN (Trái→Phải, Trên→Dưới) = thứ tự `cn[].controls` của hồ
    #    sơ màn, KHÔNG theo thứ tự nhóm nằm trong file. Chỉ thị người đặt việc 2026-09-10;
    #    đo trên `LoaiNguon`: `Button Bỏ chọn` / `Button Xóa tất cả` thuộc thanh hàng loạt nằm
    #    TRÊN bảng nhưng bị liệt kê sau `Danh sách` và sau hộp xác nhận. Không có hồ sơ màn
    #    (hoặc CN không khai `controls`) thì `sap_theo_bo_cuc` trả y nguyên ⇒ phép này im.
    _spec = patch_giaodien.ho_so_man(getattr(tc, 'path', None))
    # Tập chuỗi ĐÃ GROUND — phép ĐO ⑳ phải che đúng những gì phép CẮT che (vá 2026-09-14).
    _giu = qalib.giu_nguyen_cua(_spec or {})
    for _r, _cn, _g, _ds in patch_giaodien.quet(tc):
        if not _g or not patch_giaodien.da_liet_ke(tc.c(_r, 'D')):
            continue
        _dung = qalib.sap_theo_bo_cuc(_g, _spec, _cn)
        _txt = tc.c(_r, 'D') or ''
        # Khuôn CŨ (`- <tên>`, bản 09/09) coi như CHƯA đạt: chỉ thị 2026-09-10 đòi khuôn
        # `N. [<Nhãn loại>] <Nhãn UI>`. Không bắt ở đây thì bộ case cũ im lặng giữ khuôn cũ.
        if '\n- ' in _txt:
            out.append(('THỨ TỰ', _cn[:44],
                        'còn khuôn liệt kê CŨ `- <tên>`; chạy patch_giaodien --force'))
            t_tt += 1
            continue
        _dang = patch_giaodien.doc_liet_ke(_txt)
        _mong = [qalib.nhan_va_ten(g)[1] for g in _dung]
        if _dang and [qalib.norm(x) for x in _dang] != [qalib.norm(x) for x in _mong]:
            out.append(('THỨ TỰ', _cn[:44],
                        'liệt kê KHÔNG theo thứ tự trên màn (đúng: %s…)'
                        % ' | '.join(_mong[:3])))
            t_tt += 1
    # ── phép 13 THỨ TỰ KHỐI VALIDATE (2026-09-10): chính các nhóm control trong khối
    #    `Validate các trường thông tin` cũng phải xếp theo bố cục màn — chỉ thị người đặt
    #    việc ngay sau phép ⑫: *"Các mục validate cũng phải theo thứ tự từ Trái→Phải,
    #    Trên→Dưới"*. Phép ⑫ chỉ đo CHỮ ở cột C/D của case liệt kê; sửa mỗi chữ thì cây nhóm
    #    bên trái vẫn nhảy cóc. Cùng nguồn thứ tự (`qalib.sap_theo_bo_cuc`) nên hai phép không
    #    bao giờ đòi hai thứ tự khác nhau.
    for _cn, _cu, _moi, _nh in fix_thu_tu_validate.viec_cua_file(tc, _spec):
        out.append(('T.TỰ VLD', _cn[:44],
                    'khối Validate xếp sai bố cục màn (đúng: %s…)' % ' | '.join(_moi[:3])))
        t_tv += 1
    # ── phép 14/15/16 NỘI DUNG CASE (2026-09-10) — ba chỉ thị cùng ngày, cùng nguồn luật
    #    `qalib` với bộ sửa `fix_chi_thi_0910.py`:
    #      ⑭ case đã bị BỎ HẲN mà vẫn còn trong file (script một-lần cũ có thể tái sinh);
    #      ⑮ case `nhập vượt độ dài` mà cột D chưa theo khuôn thông báo + highlight/focus;
    #      ⑯ case liệt kê GIÁ TRỊ của ô chọn mà cột D còn mô tả hai nút `Chọn tất cả` /
    #        `Bỏ chọn tất cả` — đã có case riêng cho hai nút đó.
    for _rn in fix_chi_thi_0910.dong_case_bi_bo(tc):
        out.append(('CASE BỎ', '', (tc.c(_rn, 'B') or '')[:50]))
        t_bo += 1
    for _rn, _d, _g in fix_chi_thi_0910.viec_vuot_do_dai(tc):
        out.append(('ĐỘ DÀI', '', '%s  <- cột D chưa theo khuôn thông báo + focus'
                    % (tc.c(_rn, 'B') or '')[:44]))
        t_dd += 1
    for _rn, _d in fix_chi_thi_0910.viec_bo_nut_phu_tro(tc):
        out.append(('2 NÚT', '', '%s  <- cột D mô tả thừa Chọn tất cả / Bỏ chọn tất cả'
                    % (tc.c(_rn, 'B') or '')[:40]))
        t_nut += 1
    # ⑰ cột D còn viết `Bước 1:` `Bước 2:` — chỉ thị 2026-09-10 đòi đánh số trần `1.` `2.`
    #    (cột C đã đánh số bước rồi).
    for _rn, _d in fix_chi_thi_0910.viec_bo_tien_to_buoc(tc):
        out.append(('BƯỚC', '', '%s  <- cột D còn tiền tố "Bước N:"'
                    % (tc.c(_rn, 'B') or '')[:44]))
        t_bc += 1
    # ── phép 18 CỤM PHÂN TRANG THIẾU CONTROL (2026-09-10) ────────────────────────────────
    #    Chỉ thị + 2 ảnh người đặt việc: hai ảnh là ĐÚNG hai dòng nhóm `Textbox Số bản ghi trên
    #    trang` và `Textbox Nhập số trang`. Cụm phân trang là MỘT khối gồm nhiều control rời,
    #    mỗi control một nhóm `sub2` (luật §0.2) — nhưng không phép rà nào soi nó theo CỤM:
    #    `audit_validate_quota` chỉ đếm case của nhóm ĐÃ CÓ, phép ③ ở đây chỉ bắt nhóm rỗng
    #    đúng 0 case, còn `probe_live` đọc được cả 3 dữ kiện của cụm rồi chỉ IN RA.
    #    Đo trên bộ `ChuyenVien` (13/13 bộ rà 0): CN `XEM MA TRẬN MÂU THUẪN` có `Phân trang`
    #    14 case mà KHÔNG có control nào đặt số bản ghi/trang ⇒ thiếu 10–15 case, không ai kêu.
    #    Luật dùng CHUNG ở `qalib.soi_cum_phan_trang` để `probe_live` không lệch luật.
    for _cn, _thieu, _vi in qalib.soi_cum_phan_trang(tc, _spec):
        out.append(('PHÂN TRANG', _cn[:44], '%s  <- %s' % (_thieu, _vi)))
        t_pt += 1
    # ── phép 10 KHAI LOẠI CONTROL LẠC (2026-09-10) ───────────────────────────────────────
    # `loai_control` ở hồ sơ màn là cơ chế DUY NHẤT khai được những gì bảng `QUOTA` không diễn
    # tả nổi (ô ngày của trình duyệt · ô chọn nhiều giá trị · ô chọn không có hộp tìm). Nhưng
    # `qalib.kind_of()` tra bằng `override.get(norm(tên nhóm))`: gõ SAI tên nhóm thì nó chỉ
    # lặng lẽ rơi về luật tra theo từ khoá — bank sai được bơm, 13 bộ rà vẫn 0.
    # (Nhãn loại sai thì `kind_of` có in `!!`, nhưng chỉ khi CÓ script bơm chạy — nghiệm thu
    # thuần bằng audit thì không ai thấy.)
    _ovr = qalib.doc_override(getattr(tc, 'path', None))
    if _ovr:
        # ⚠️ Vá 2026-09-10: `loai_control` khai theo FILE (một hồ sơ màn / một .xlsx) nhưng
        # `iter_role_files` sinh TỪNG sheet BP ⇒ file hai sheet (màn có 2 thẻ, vd `BaoCaoDong`)
        # bị báo oan hai chiều: soi sheet 1 thì mọi khoá của sheet 2 thành "nhóm KHÔNG có trong
        # bộ case", và ngược lại. Gom nhóm của MỌI sheet BP trước khi xét — cùng cách
        # `audit_man_phu` đã vá phép ④.
        _tcs = [tc]
        for _bp in (getattr(tc, 'bpsheets', None) or []):
            if _bp == getattr(tc, 'bpname', None):
                continue
            try:
                _tcs.append(tcfix.load(tc.path, bp=_bp))
            except Exception:
                pass
        _nhom = {n((x.c(r, 'B') or '').split('\n')[0])
                 for x in _tcs for r in x.order
                 if r >= 12 and x.lvl(r) in ('sub', 'sub2')}
        # khoá phạm vi CN "<TÊN CN>|<Tên nhóm>" (vá 2026-09-10): phải soi CẶP (CN, nhóm) chứ
        # không chỉ tên nhóm — gõ đúng tên nhóm nhưng SAI tên CN thì override vẫn rơi im lặng.
        _cap = set()
        for x in _tcs:
            _cn_ten = None
            for r in x.order:
                if r < 12:
                    continue
                _lv, _b = x.lvl(r), n((x.c(r, 'B') or '').split('\n')[0])
                if _lv == 'cn':
                    _cn_ten = _b
                elif _lv in ('sub', 'sub2') and _cn_ten:
                    _cap.add('%s|%s' % (_cn_ten, _b))
        _nhan = {lab for lab, _q, _k in qalib.QUOTA}
        for _g, _lab in sorted(_ovr.items()):
            _co = (_g in _cap) if '|' in _g else (_g in _nhom)
            if _lab not in _nhan:
                out.append(('KHAI LOẠI', _g[:44],
                            'hồ sơ màn khai loại "%s" — KHÔNG có trong bảng QUOTA' % _lab))
                t_lc += 1
            elif not _co:
                out.append(('KHAI LOẠI', _g[:44],
                            'hồ sơ màn khai loại "%s" cho một nhóm KHÔNG có trong bộ case '
                            '(sai tên nhóm/tên CN ⇒ override rơi im lặng, bank sai vẫn được bơm)'
                            % _lab))
                t_lc += 1
    cn = None; groups = []
    # ── phép 7 RÀNG BUỘC CẶP (2026-09-09): CN có cặp trường quan hệ (Từ/Đến · bắt đầu/kết thúc)
    #    mà thiếu nhóm `Validate ràng buộc giữa các trường`. Dùng CHUNG `patch_rangbuoc.tim_cap`
    #    nên bơm và rà không lệch luật — bài học 09/09: bỏ/thêm mục ở bank thì phải sửa bộ rà
    #    TRONG CÙNG MỘT LẦN.
    ctrl_cn, co_rb = [], False

    def flush_btn():
        global t_btn
        if not cn or not groups:
            return
        c = n(cn); g = ' | '.join(n(x) for x in groups)
        kind = None
        if re.search(r'\bxoa\b', c) and 'khong xoa' not in c: kind = 'Xoá'
        elif any(k in c for k in ('them moi', 'tao moi', 'khai bao', 'onboard', 'ghi nhan')): kind = 'Thêm mới'
        elif any(k in c for k in ('chinh sua', 'cap nhat', 'sua ')): kind = 'Sửa'
        if not kind:
            return
        miss = []
        # ⚠️ Vá 2026-09-10: nút HUỶ của biểu mẫu không nhất thiết mang chữ "Hủy". Wizard
        # `Tạo báo cáo` / `Chỉnh sửa báo cáo` của màn Báo cáo động đặt nhãn "Quay lại" (bấm ở
        # bước 1 là thoát wizard, có hỏi lại nếu đã nhập) và KHÔNG có nút nào tên "Hủy" —
        # đòi đúng chữ "Hủy" là buộc bộ case ghi một nút KHÔNG tồn tại trên màn. Vẫn kêu khi
        # biểu mẫu không có nút rút-lui nào.
        if not any(k in g for k in ('button huy', 'button quay lai', 'button dong',
                                    'button thoat')):
            miss.append('Button Hủy / Quay lại / Đóng')
        if not re.search(r'button (?!huy)', g): miss.append('Button <hành động>')
        if miss:
            out.append(('NÚT', '%s [%s]' % (cn[:44], kind), ', '.join(miss))); t_btn += len(miss)

    def flush_rb():
        global t_rb
        if not cn or co_rb or not ctrl_cn:
            return
        try:
            caps = patch_rangbuoc.tim_cap(ctrl_cn)
        except Exception:
            return
        if caps:
            out.append(('RÀNG BUỘC', cn[:44],
                        'thiếu nhóm ràng buộc — cặp %s'
                        % ' | '.join('%s ↔ %s' % c for c in caps)[:28]))
            t_rb += len(caps) * len(quota_cases.RANGBUOC)

    in_attt = False; frag = None; gname_hien = None; in_validate = False
    for i, rn in enumerate(rows):
        lv = tc.lvl(rn); b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            flush_btn(); flush_rb(); cn = b; groups = []; in_attt = False; frag = None
            gname_hien = None; ctrl_cn = []; co_rb = False
            in_validate = False
        elif lv == 'grp':
            # khối ATTT có dòng nhóm LẶP LẠI tên ô (khung mẫu) — không phải khai báo control mới,
            # nên không xét [GỘP]/[RỖNG] ở đây (vá 2026-09-04, tránh nhân đôi cảnh báo nhiễu).
            in_attt = 'an toan thong tin' in n(b)
            in_validate = False
        elif lv == 'case':
            # ── phép 9 ZOOM NGƯỢC (2026-09-09): cột D mô tả trái chiều với tiêu đề case.
            #    §5.5 đã chốt bản chữ đúng từ lâu nhưng KHÔNG chỗ nào thi hành: mẫu (và mọi file
            #    nền chép theo mẫu) ghi zoom in -> "thu nhỏ", `new_from_base.lift()` chép verbatim
            #    ⇒ mọi bộ case sinh bằng tool thừa hưởng. Luật dùng CHUNG ở `qalib.zoom_*`.
            _k = qalib.zoom_kieu(b)
            if qalib.zoom_d_nguoc(_k, tc.c(rn, 'D')):
                out.append(('ZOOM', (cn or '')[:44],
                            '%s <- cột D nói NGƯỢC chiều zoom (§5.5); chạy sync_gdc_zoom_steps.py'
                            % b[:30]))
                t_zoom += 1
            # ── phép 19 BẢN CHỮ TỔNG THỂ GIAO DIỆN (2026-09-11): case `Kiểm tra tổng thể
            #    giao diện màn hình` là bản chữ CỐ ĐỊNH của mẫu, không viết lại theo từng màn.
            #    Đã trả giá: bước A6 của `Báo cáo động` viết lại cột C/D thành bố cục riêng của
            #    màn đó — vi phạm §7.3 và làm case lệch khỏi mọi bộ case anh em, mà 18 phép rà
            #    khi ấy đều im. Luật dùng CHUNG ở `qalib.tong_the_lech`.
            if qalib.tong_the_lech(b, tc.c(rn, 'C'), tc.c(rn, 'D')):
                out.append(('TỔNG THỂ', (cn or '')[:44],
                            'cột C/D khác bản chữ cố định của mẫu; chạy sync_gdc_zoom_steps.py'))
                t_tt_gd += 1
            # ── phép 20 CỘT D KHỐI VALIDATE QUÁ CHI TIẾT (2026-09-11) ────────────────────
            #    Chỉ thị người đặt việc: *"phần validate kết quả mong muốn đang bị quá chi
            #    tiết, làm như DanhMucTuDienDungChung.xlsx là được"*. Đo hai bộ cạnh nhau thì
            #    phần thuật (ngoài ngoặc kép) của bộ đang có dài gấp đôi mẫu, và 4 mẫu văn
            #    phong mà mẫu gần như không dùng thì bộ đang có dùng tới 40%. Luật + phép cắt
            #    dùng CHUNG ở `qalib.kq_qua_chi_tiet` / `rut_gon_kq`.
            # ── phép 23 CỘT C/D LẠC MỤC ĐÍCH — áp cho MỌI KHỐI (mở lại 2026-09-12) ──────
            #    Chỉ thị: *"mục đích case là gì thì các bước thực hiện và kết quả mong muốn
            #    đúng với case đó"*. Ngày 11/09 phép này bị siết về riêng `Validate` theo chỉ
            #    thị *"chỉ sửa phần validate"*; nay phạm vi đã mở lại sang `Chức năng`/`ATTT`
            #    nên phép rà phải theo. Chính 3 case `Tìm kiếm khi nhập:` làm lộ ra lớp lỗi
            #    này lại nằm ở khối `Chức năng` — để nó ngoài tầm rà là bỏ đúng chỗ đã đau.
            #    ⚠️ So trên CẢ cột B — 3 case đó khác nhau ở DÒNG THỨ HAI.
            # ── ㉘ GIÁ TRỊ TĨNH/ĐỘNG (2026-09-12) ───────────────────────────────────────
            _gt = qalib.kq_liet_ke_sai(_spec, gname_hien, tc.c(rn, 'B'), tc.c(rn, 'D'), cn)
            if _gt:
                out.append(('GIÁ TRỊ', (cn or '')[:44], '%s  <- %s' % (b[:22], _gt)))
                t_gt += 1
            _lech = qalib.kq_lech_muc_dich(tc.c(rn, 'B'), tc.c(rn, 'C'), tc.c(rn, 'D'))
            if _lech:
                out.append(('LẠC MĐ', (cn or '')[:44],
                            '%s  <- C/D không nhắc tới "%s"' % (b[:26], _lech)))
                t_lech += 1
            if in_validate:
                # ── phép 24 THIẾU Ý CỦA BẢN CHỮ MẪU (2026-09-11 lượt 5) ──────────────────
                #    Rút từ 464 case của `DanhMucTuDienDungChung.xlsx`: 51 loại case mà mẫu
                #    dùng CÂU ĐÓNG, giống hệt ở mọi màn. Đòi cột D đủ **Ý**, KHÔNG đòi khớp
                #    từng chữ — đòi nguyên văn là biến bộ rà thành máy ép chép chữ mẫu.
                _thieu = qalib.kq_thieu_y_mau(tc.c(rn, 'B'), tc.c(rn, 'D'))
                if _thieu:
                    out.append(('THIẾU Ý', (cn or '')[:44],
                                '%s  <- cột D thiếu ý "%s"' % (b[:24], _thieu[0])))
                    t_mau += 1
            if in_validate:
                # ㉑ (2026-09-11 lượt 2) gộp chung ô đếm với ⑳: cùng một chỉ thị *"ghi như
                # mẫu"*, cùng một chỗ sửa (`fix_kq_validate.py`) — tách hai ô đếm chỉ làm
                # dòng tổng kết dài thêm mà người sửa vẫn chạy đúng một lệnh.
                _d = tc.c(rn, 'D')
                _loi = (qalib.kq_qua_chi_tiet(_d, _giu)
                        + qalib.kq_co_so_lieu(_d, _giu)
                        + qalib.kq_co_trich_dan(_d))
                # Miễn case GỘP mà chính mẫu viết dài — xem `qalib.mien_kq_dai`.
                if qalib.mien_kq_dai(gname_hien, b):
                    _loi = [x for x in _loi if not x.startswith('phần thuật >')]
                if _loi:
                    # ⑳ vs ⑳b — TÁCH hai ô đếm (2026-09-14). Trước lượt vá này bộ rà gộp làm
                    # một số, mà `fix_kq_validate` chỉ vá được PHẦN CƠ GIỚI: đo 2026-09-14 trên
                    # role `ChuyenVien` bộ rà báo 79 còn bộ vá ra `0 file · 0 case` — người sửa
                    # chạy đúng lệnh tài liệu chỉ mà con số không nhúc nhích, không có đường nào
                    # về 0. Nay hỏi thẳng phép cắt: đổi được thì là NỢ LỆNH (⑳, mốc chốt 0),
                    # không đổi được thì là NỢ NỘI DUNG (⑳b) — phải người viết rút gọn.
                    # ⛔ ⑳b KHÔNG phải chỗ giấu lỗi: nó vẫn in ra, vẫn liệt kê từng ca.
                    _m, _ma = qalib.bo_trich_dan_kq(_d)
                    _m, _mv = qalib.rut_gon_kq(_m, giu_nguyen=_giu)
                    _m = qalib.bo_so_lieu_kq(_m, giu_nguyen=_giu)
                    _may_lam_duoc = (_m != _d) or list(_ma) + _mv
                    out.append(('KQ DÀI' if _may_lam_duoc else 'KQ TAY', (cn or '')[:44],
                                '%s  <- %s' % (b[:26], ', '.join(_loi))))
                    if _may_lam_duoc:
                        t_kqd += 1
                    else:
                        t_kqt += 1
            why = bad_title(b, frag, gname_hien)
            if why:
                out.append(('TIÊU ĐỀ', (cn or '')[:44], '%s  <- %s' % (b[:44], why)))
                t_title += 1
            leak = ro_code(tc.c(rn, 'D') or '')
            if leak:
                out.append(('RÒ CODE', (cn or '')[:44], '%s  <- cột D %s' % (b[:30], leak)))
                t_leak += 1
            # ── ㉙ LẪN TIẾNG ANH / ĐƯỜNG DẪN MÃ (chỉ thị người đặt việc 2026-09-14, kèm ảnh)
            #    *"không được lẫn tiếng Anh hoặc mã gì đó, ghi bằng tiếng Việt dễ hiểu"*.
            #    Soi CẢ cột C — phép RÒ CODE ở trên chỉ soi cột D, mà đường dẫn
            #    `/dynamic-reports/{mã}/edit-chart` trong ảnh nằm ở cột C. Luật + bảng dịch
            #    dùng CHUNG ở `qalib.lan_tieng_anh` / `qalib.dich_tieng_anh`, bộ sửa là
            #    `fix_chi_thi_0914.py`.
            for _col in 'CD':
                _la = qalib.lan_tieng_anh(tc.c(rn, _col) or '')
                if _la:
                    out.append(('TIẾNG ANH', (cn or '')[:44],
                                '%s  <- cột %s lẫn "%s" -> %s' % (b[:24], _col, _la[0], _la[1])))
                    t_anh += 1
            ma = thao_tac_ma(b + ' ' + (tc.c(rn, 'C') or ''), cn_all)
            if ma:
                out.append(('THAO TÁC MA', (cn or '')[:44],
                            '%s  <- không có CN %s; thiếu hậu tố "nếu có"?'
                            % (b[:30], ma)))
                t_ma += 1
            # ── phép 11 HẬU TỐ ĐIỀU KIỆN (2026-09-10): tiêu đề thuộc bộ case BẮT BUỘC mang
            #    hậu tố "nếu có" mà đang thiếu. Khác phép ⑥ (suy từ CN của file, chỉ nói tới
            #    thao tác Xoá/Khôi phục): phép này đối chiếu với DANH SÁCH ĐÓNG các case mẫu
            #    mà chỉ thị đã chốt phải có hậu tố — bắt được cả khi file CÓ đủ CN, vì lý do
            #    giữ hậu tố là để case dùng lại được ở MÀN KHÁC.
            _nhan = qalib.thieu_hau_to_dieu_kien(b)
            if _nhan:
                out.append(('HẬU TỐ', (cn or '')[:44],
                            '%s  <- thiếu hậu tố "nếu có" (%s)' % (b[:30], _nhan)))
                t_hau += 1
        elif lv in ('sub', 'sub2'):
            # ⑳ `Validate các trường thông tin` nằm ở cấp **sub** (outlineLevel 2), KHÔNG phải
            # `grp` — cây là CN(0) › bucket(1) › sub(2) › control(3) › case(4). Bản đầu đặt
            # nhầm ở nhánh `grp` nên `in_validate` không bao giờ bật: bộ rà in `0` trên đúng
            # bộ file mà đo tay ra 52% case vi phạm. Đúng lớp điểm mù "im lặng khi nhóm chưa
            # khớp" của README — số 0 phải chứng minh được là đã QUÉT tới nơi.
            if lv == 'sub':
                in_validate = 'validate' in n(b)
            # ── ㉗ CONTROL SẮP XẾP phải thuộc CN Danh sách (2026-09-12) ─────────────────
            _sx = qalib.sap_xep_lac_cn(cn, b)
            if _sx:
                out.append(('SẮP XẾP', (cn or '')[:44],
                            '%s  <- control sắp xếp phải ở CN Danh sách' % b[:30]))
                t_sx += 1
            if in_attt:
                continue
            if cn: groups.append(b)
            if 'rang buoc giua cac truong' in n(b) or 'rang buoc lien truong' in n(b):
                co_rb = True
            elif lv == 'sub2':
                ctrl_cn.append(b)
            frag = degenerate_frag(b)
            gname_hien = b
            if is_merged(b):
                out.append(('GỘP', cn[:44] if cn else '', b)); t_merge += 1
            nxt = rows[i + 1] if i + 1 < len(rows) else None
            nxt_lv = tc.lvl(nxt) if nxt else None
            # ⚠️ Vá 2026-09-09: bản trước miễn trừ MỌI dòng có `sub2` đứng ngay sau — nhưng miễn
            # trừ đó chỉ đúng cho `sub` (dòng CHỨA nhóm con: `Validate các trường thông tin`,
            # `Chức năng Tìm kiếm đơn lẻ`). Với `sub2` — nhóm control LÁ — thì `sub2` đứng sau
            # chỉ có nghĩa "nhóm kế tiếp", nên nhóm control RỖNG lọt hết. Đo trên màn
            # `Chi tiết lỗi`: 5 nhóm (`Breadcrumb` + 4 `Thẻ số liệu …`) rỗng trơn mà
            # `audit_extra` báo 0 và `audit_validate_quota` cũng báo 0 (định mức = 0 vì tên nhóm
            # không khớp bảng QUOTA) — cùng lớp điểm mù "im lặng khi nhóm chưa tồn tại".
            co_case = nxt_lv == 'case' or (lv == 'sub' and nxt_lv == 'sub2')
            if not co_case and not any(k in b.lower() for k in BAO):
                out.append(('RỖNG', cn[:44] if cn else '', b)); t_empty += 1
    flush_btn(); flush_rb()
    if out:
        print('####', nm)
        for tag, c, d in out:
            print('   [%-4s] %-46s %s' % (tag, c, d[:56]))

print('\n=== Nhóm gộp: %d · Nút bắt buộc thiếu: %d · Nhóm rỗng: %d · Tiêu đề hỏng: %d '
      '· Rò code: %d · Thao tác ma: %d · Ràng buộc cặp thiếu: %d · Giao diện chưa liệt kê: %d '
      '· Zoom ngược: %d · Khai loại control lạc: %d · Thiếu hậu tố "nếu có": %d '
      '· Liệt kê sai thứ tự màn: %d · Khối Validate sai thứ tự màn: %d '
      '· Case đã bỏ còn sót: %d · Kết quả độ dài sai khuôn: %d · Mô tả 2 nút thừa: %d '
      '· Cột D còn "Bước N:": %d · Cụm phân trang thiếu control: %d '
      '· Bản chữ tổng thể giao diện sai: %d '
      '· Cột D khối Validate quá chi tiết: %d '
      '· Cột D Validate PHẢI SỬA TAY: %d '
      '· Cột C/D lạc mục đích: %d '
      '· Cột D thiếu ý bản chữ mẫu: %d '
      '· Bank sinh mới lệch mẫu: %d '
      '· Định mức ≠ bank: %d '
      '· Sắp xếp lạc CN: %d · Liệt kê giá trị sai: %d '
      '· Lẫn tiếng Anh/mã: %d ==='
      % (t_merge, t_btn, t_empty, t_title, t_leak, t_ma, t_rb, t_gd, t_zoom, t_lc, t_hau,
         t_tt, t_tv, t_bo, t_dd, t_nut, t_bc, t_pt, t_tt_gd, t_kqd, t_kqt, t_lech, t_mau,
         _t_bank, _t_dm, t_sx, t_gt, t_anh))
if t_pt:
    print('Cụm phân trang: soi lại bằng `probe_live.py <url> --spec <hồ sơ màn>` (mục "phân trang"),')
    print('   rồi THÊM nhóm còn thiếu vào `cn[].controls` của hồ sơ màn + chạy lại patch_quota;')
    print('   màn thật KHÔNG có ô đó thì ghi vào `grounding.khong_co` kèm bằng chứng.')
if t_bo or t_dd or t_nut or t_bc:
    print('Sửa nội dung: python3 fix_chi_thi_0910.py %s [tên màn] --apply' % ROLE)
if t_tv:
    print('Sắp lại khối Validate: python3 fix_thu_tu_validate.py %s [tên màn] --apply' % ROLE)
if t_tt:
    print('Sắp lại thứ tự: python3 patch_giaodien.py %s [tên màn] --apply --force' % ROLE)
if t_hau:
    print('Trả hậu tố: python3 fix_hau_to.py %s [tên màn] --apply' % ROLE)
if t_zoom:
    print('Sửa zoom: python3 sync_gdc_zoom_steps.py --role %s --apply' % ROLE)
if t_gd:
    print('Liệt kê giao diện: python3 patch_giaodien.py %s [tên màn] --apply' % ROLE)
if t_rb:
    print('Bơm ràng buộc: python3 patch_rangbuoc.py %s [tên màn] --apply' % ROLE)
if t_kqd:
    print('Rút gọn cột D khối Validate: python3 fix_kq_validate.py %s [tên màn] --apply' % ROLE)
    print('   Cờ [CHỮ HOA nhấn mạnh] có thể là NHIỄU khi chữ hoa là GIÁ TRỊ thật của màn')
    print('   (`Mặc định là GOLD.`) — soi tay, đừng hạ chữ hoa của giá trị/nhãn.')
if t_kqt:
    print('[KQ TAY] %d case: MỌI phép cắt cơ giới đã chạy hết mà cột D vẫn dài/đủ 4 tầng.' % t_kqt)
    print('   ⛔ ĐỪNG chạy fix_kq_validate cho nhóm này — nó sẽ ra "0 case" và con số không đổi.')
    print('   Đây là NỢ NỘI DUNG: người viết phải tự rút, hoặc chấp nhận và ghi rõ trong báo cáo.')
    print('   Phần lớn là case có NHIỀU Ý kết quả thật — cắt bằng máy là làm bộ case SAI thêm.')
if t_lech:
    print('Cột C/D lạc mục đích: sửa TAY theo bank `quota_cases` của chính họ case đó')
    print('   (vd 3 case `Tìm kiếm khi nhập:` lấy lại C/D từ `SEARCH_SINGLE_TEXT`).')
    print('   Nếu do bước A6 ghi đè: sửa luật trong `ho-so-man/a6-<Màn>.py` cho HẸP lại rồi chạy lại.')
print('Lưu ý: mục [GỘP] có dấu / trong tên MỘT control (Tỉnh/Thành, Xã/Phường) là nhiễu — soi tay trước khi sửa.')

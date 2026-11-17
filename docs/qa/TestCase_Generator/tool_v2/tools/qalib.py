# -*- coding: utf-8 -*-
"""Hàm dùng chung cho bộ script test case của `tool_v2`.

Gom 4 luồng trước đây mỗi script tự chép lại một bản:

  1. `iter_role_files()`  — duyệt file .xlsx của một role: bỏ file trong `skip`, bỏ file đang mở
     trong LibreOffice, và **không để một file hỏng làm chết cả đợt rà** (bug đã gặp:
     `audit_validate_quota.py Teacher` chết ở `LichTapHuan` nên 2 file cuối không được rà mà
     dòng tổng kết cũng không in ra).
  2. `scan_quota()`       — rà định mức Validate theo loại control + cấu trúc CN (bảng §3 của luật).
  3. `dedupe_attt()`      — dọn case ATTT injection trùng mục trong cùng một nhóm per-field.
  4. `write_marks()`      — ghi kết quả chạy live (cột F) + ghi chú (cột T) vào file `*_ket_qua`.
  0. `backup()`           — chép bản lùi sang THƯ MỤC RIÊNG (mặc định `<gốc repo>/bak`), tuyệt đối
     không để cạnh file gốc trong thư mục bộ case.

Không có script nào phải import 3 cái còn lại khi chỉ cần một cái — mỗi khối độc lập.
"""
import glob
import hashlib
import json
import os
import re
import shutil
import sys
import time
import unicodedata
import urllib.parse
import uuid
import zipfile
from dataclasses import dataclass, field
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix          # noqa: E402
import roles          # noqa: E402


def norm(s):
    """Bỏ dấu tiếng Việt + hạ chữ thường. `đ` phải thay tay vì NFD không tách được."""
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


# ══════════════════════════════════════════════════════════════════════════════
# 0a. LUẬT CỨNG UI  (FIXED TOOL RULE — chỉ thị người đặt việc 2026-09-12)
# ══════════════════════════════════════════════════════════════════════════════
# HAI quy tắc dưới đây là **luật của tool**, KHÔNG phải dữ kiện ground được. Trước bản này cả
# hai đều "mềm": giá trị mặc định của ô chọn và của ô số bản ghi/trang lấy theo *màn thật* —
# `_b_loc_mac_dinh` đọc `verbatim.placeholder_loc_*`, `_b_perpage` đọc `hang_so.page_size_mac_dinh`
# — nên mỗi màn/mỗi dự án ra một bản chữ khác nhau, và màn nào FE cấu hình sai thì bộ case CHÉP
# LẠI CÁI SAI rồi tester chấm P. Đúng lớp lỗi "tool tự suy diễn theo từng màn hình".
#
#   ① Ô CHỌN (Selectbox / Combobox / ô chọn nhiều)
#        · ở vùng TÌM KIẾM  -> mặc định là CHỮ GỢI Ý `-- Chọn <nội dung cần tìm> --`
#          (vd `-- Chọn trạng thái --` · `-- Chọn loại --` · `-- Chọn đơn vị --`).
#          TUYỆT ĐỐI không chọn sẵn một giá trị nghiệp vụ nào.
#        · ở BIỂU MẪU Thêm mới -> mặc định là `-- Chọn --`. Không tự chọn option đầu tiên.
#        · ở BIỂU MẪU Chỉnh sửa -> nạp GIÁ TRỊ ĐANG LƯU của bản ghi (§5.6); bản ghi chưa có
#          giá trị thì về đúng `-- Chọn --`. Đây KHÔNG phải ngoại lệ của luật ①: luật cấm
#          *tự chọn option đầu tiên*, còn nạp dữ liệu thật của bản ghi là hành vi đúng.
#   ② Ô `Số bản ghi trên trang` -> mở màn lần đầu mặc định **20**. Không suy từ code, API,
#     config, trạng thái trình duyệt, localStorage hay dữ liệu lần chạy trước.
#
# Hệ quả BẮT BUỘC, áp thống nhất ở Live Test · Grounding · Hồ sơ màn · Sinh case · Audit · Verify:
#   · cột D của case *giá trị mặc định* lấy từ ĐÂY, không lấy từ hồ sơ màn;
#   · màn thật khác luật -> **ghi nhận vi phạm** (`bao_luat_cung()`), KHÔNG sửa app, KHÔNG sửa
#     dữ liệu, và KHÔNG bỏ qua chỉ vì code đang cấu hình khác;
#   · hồ sơ màn / BA / SRS khai khác -> **`bao_xung_dot()`** rồi để QA/BA quyết, tool KHÔNG tự
#     âm thầm đổi luật.
#
# ⚠️ DẤU GẠCH. Chỉ thị viết bằng gạch dài (`— Chọn —`); bộ case, mẫu và app thật của mọi dự án
# đang dùng gạch đôi (`-- Chọn --`). Hai cách viết là MỘT quy tắc, nên:
#   · bản chữ tool SINH RA dùng `DAU_PLACEHOLDER` (mặc định `--`, đổi ở đúng một dòng này);
#   · phép SO SÁNH bỏ qua kiểu gạch (`_phang_gach`) -> viết kiểu nào cũng không báo oan.
CO_LUAT_CUNG = '[FIXED RULE VIOLATION]'
CO_XUNG_DOT = '[CONFLICT WITH FIXED TOOL RULE]'
DAU_PLACEHOLDER = '--'
PLACEHOLDER_CHON = '%s Chọn %s' % (DAU_PLACEHOLDER, DAU_PLACEHOLDER)
PAGE_SIZE_MAC_DINH = 20

# Mọi biến thể gạch ngang -> `--`, để so sánh không phụ thuộc cách gõ.
_RX_GACH = re.compile(r'[-‐-―−]+')
# Tên nhóm của cụm phân trang — ô chọn nhưng thuộc luật ②, không thuộc luật ①.
_KW_PERPAGE = ('so ban ghi', 'so dong moi trang', 'so luong ban ghi', 'so goi moi trang')
# Tiền tố tên nhóm cho biết control LÀ một ô chọn.
_KW_O_CHON = ('selectbox', 'combobox', 'dropdown', 'o chon', 'multiselect', 'multi select')


def _phang_gach(s):
    """`— Chọn trạng thái —` và `-- Chọn trạng thái --` phải so ra BẰNG NHAU."""
    return _RX_GACH.sub('--', norm(s or ''))


def la_o_chon(ten_nhom):
    """Nhóm control này có phải một Ô CHỌN không (luật ① áp cho ô chọn, không áp ô nhập)."""
    n = norm(ten_nhom or '')
    return any(n == k or n.startswith(k + ' ') for k in _KW_O_CHON)


def la_nhom_perpage(ten_nhom):
    """Nhóm đặt số bản ghi trên trang — thuộc luật ②.

    ⚠️ Phải đòi tiền tố LOẠI CONTROL, không chỉ dò từ khoá: nhóm `Thẻ số liệu Tổng số bản ghi`
    cũng chứa `so ban ghi` nhưng là một THẺ ĐẾM, không phải ô đặt số dòng/trang. Bản đầu thiếu
    lưới này đã báo oan đúng 1 ca (`CanhBaoMauThuan` › XEM CHI TIẾT MÂU THUẪN) ngay lượt chạy thử.
    """
    n = norm(ten_nhom or '')
    if not (n.startswith('selectbox ') or n.startswith('textbox ')):
        return False
    return any(k in n for k in _KW_PERPAGE)


def ngu_canh_o_chon(ten_cn, ten_nhom):
    """'perpage' | 'loc' | 'them' | 'sua' | None — ô chọn này chịu nhánh nào của luật cứng.

    Ngữ cảnh suy từ TÊN CN (`loai_cn`), đúng cách `plan_quota_fill` chọn bank: cùng một
    `Selectbox Trạng thái` ở CN Tìm kiếm là bộ lọc, ở CN Thêm mới là ô biểu mẫu.
    """
    if la_nhom_perpage(ten_nhom):
        return 'perpage'
    if not la_o_chon(ten_nhom):
        return None
    lc = loai_cn(ten_cn)
    if lc == 'tim_kiem':
        return 'loc'
    if lc == 'bieu_mau':
        return 'sua' if 'sua' in norm(ten_cn or '') else 'them'
    return None


def placeholder_chuan(ten_nhom, ngu_canh):
    """Chữ gợi ý BẮT BUỘC của một ô chọn, theo luật ①. None = luật không chốt cứng."""
    if ngu_canh == 'them':
        return PLACEHOLDER_CHON
    if ngu_canh != 'loc':
        return None
    ten = field_of(ten_nhom or '').strip()
    if not ten:
        return PLACEHOLDER_CHON
    # `-- Chọn trạng thái --`: nội dung cần tìm viết thường, trừ khi vốn là danh từ riêng
    # (`Đơn vị` -> `đơn vị`, nhưng `Mã KV` giữ nguyên). Chỉ hạ chữ cái ĐẦU.
    noi_dung = ten[0].lower() + ten[1:] if ten[:2] != ten[:2].upper() else ten
    return '%s Chọn %s %s' % (DAU_PLACEHOLDER, noi_dung, DAU_PLACEHOLDER)


# ── KHUÔN MẪU của case §6 *giá trị mặc định*  (chỉ thị người đặt việc 2026-09-14 — ẢNH) ─────
# Mẫu viết case này thành BA ô rất ngắn, và chỗ chốt giá trị mặc định nằm ở **cột B + cột C**,
# KHÔNG ở cột D:
#     B  Tìm kiếm với:
#        - Selectbox = -- Chọn trạng thái --
#     C  1. Truy cập vào màn hình Danh sách/Tìm kiếm.
#        2. Chọn selectbox = -- Chọn trạng thái --
#     D  Hệ thống tự động hiển thị danh sách kết quả/dữ liệu thỏa mãn điều kiện mặc định ban đầu.
#
# ⚠️ Đây KHÔNG phải "mẫu thắng luật". Luật cứng ① đòi case phải NÊU RÕ mặc định LÀ GÌ (không
# được viết chung chung *"giữ ở giá trị mặc định"*, vì màn chọn sẵn `Hoạt động` vẫn chấm P).
# Khuôn mẫu nêu đúng chữ gợi ý bắt buộc — chỉ là nêu ở cột B/C thay vì cột D. Hệ quả BẮT BUỘC:
# `dat_luat_cung()` phải đọc CẢ BA ô cho lớp case này, nếu chỉ đọc cột D thì mọi case ĐÚNG MẪU
# đều bị phép ⓐ báo đỏ — và không có đường nào vá được (đúng lớp lỗi ⑳ "bộ rà đòi thứ bộ vá
# không làm được").
TK_MAC_DINH_B = 'Tìm kiếm với:\n- %s = %s'
TK_MAC_DINH_C = '1. Truy cập vào màn hình Danh sách/Tìm kiếm.\n2. Chọn %s = %s'
TK_MAC_DINH_D = ('Hệ thống tự động hiển thị danh sách kết quả/dữ liệu thỏa mãn điều kiện '
                 'mặc định ban đầu.')
# Control KHÔNG chịu luật ① (ô ngày trên thanh lọc…) thì không có chữ gợi ý bắt buộc để nêu;
# giữ lối viết cũ, và cột C nói GIỮ chứ không nói CHỌN — chọn cái gì thì có biết đâu.
TK_MAC_DINH_B_CHUNG = 'Tìm kiếm với:\n- %s = giá trị mặc định'
TK_MAC_DINH_C_CHUNG = '1. Truy cập vào màn hình Danh sách/Tìm kiếm.\n2. Giữ %s ở giá trị mặc định.'

# Tiền tố LOẠI CONTROL trong tên nhóm (`Selectbox Đơn vị` -> `Selectbox`). Dời từ
# `patch_timkiem_donle.PREFIX` về đây 2026-09-14: khuôn mẫu ở trên cần đúng cái loại đó ở cột
# B/C, mà luật dùng chung thì phải nằm ở `qalib`, không nằm trong một script.
PREFIX_NHOM = ('Textbox ', 'Selectbox ', 'Combobox ', 'Checkbox ', 'Datepicker ', 'Ô ngày ',
               'Ô chọn ', 'Nút lọc ', 'Nút chọn ', 'Nút ', 'Tab ', 'Bộ lọc ')


def loai_control_tu_nhom(ten_nhom):
    """LOẠI control lấy từ tên nhóm (`Selectbox Đơn vị` -> `Selectbox`), mặc định `Bộ lọc`."""
    for pre in PREFIX_NHOM:
        if (ten_nhom or '').startswith(pre):
            return pre.strip()
    return 'Bộ lọc'


# `= -- Chọn …` sau khi `_phang_gach` — dấu hiệu tiêu đề ĐÃ theo khuôn mẫu mới.
_RX_TK_PLACEHOLDER = re.compile(r'=\s*--\s*chon\b')


def la_case_tim_kiem_mac_dinh(tieu_de):
    """Case của khối §6 `Chức năng Tìm kiếm đơn lẻ` — case đo KẾT QUẢ khi CHƯA đặt bộ lọc nào.

    Nhận HAI đời tiêu đề, cố ý:
      · khuôn MẪU (từ 2026-09-14) — *"Tìm kiếm với: - Selectbox = -- Chọn trạng thái --"*;
      · khuôn CŨ                  — *"Tìm kiếm với: - Selectbox = giá trị mặc định"*.
    Bỏ vế thứ hai là mọi bộ case đã giao lặng lẽ rơi khỏi lưới: `fix_luat_cung` không còn thấy
    case nào để đưa về khuôn mới, `audit_luat_cung` báo `[THIẾU]`, mà `_b_tim_kiem_mac_dinh`
    thì im — đúng lớp "số 0 vì không quét tới nơi" đã trả giá ba lần.

    Cùng mang chữ *giá trị mặc định* như case control (khối Validate) nhưng MỤC ĐÍCH khác: nó
    đo KẾT QUẢ TÌM KIẾM khi chưa đặt bộ lọc nào. Dán bản chữ của case control vào đây là mất vế
    *"danh sách hiện theo điều kiện mặc định"* -> phép ㉓ bắt ngay.
    """
    n = _phang_gach(tieu_de or '')
    if not n.startswith('tim kiem voi'):
        return False
    return 'gia tri mac dinh' in n or _RX_TK_PLACEHOLDER.search(n) is not None


def tk_mac_dinh_bo_ba(ten_nhom, loai=None):
    """(cột B, cột C, cột D) của case §6 *giá trị mặc định* — MỘT nguồn chữ cho cả tool.

    Bank sinh mới (`quota_cases.SEARCH_SINGLE_PICK`), bước A6 (`_b_tim_kiem_mac_dinh`) và bộ sửa
    (`fix_luat_cung`) đều lấy chữ từ đây. Ba ô phải đi liền nhau: chữ gợi ý nằm ở B **và** C,
    nên để hai chỗ tự dựng chữ riêng là lại có case tự mâu thuẫn (bài học 14/09 lượt 2 lỗ 3).

    Hai nhánh:
      · control CHỊU luật ① (ô chọn trên thanh lọc) -> nêu thẳng chữ gợi ý bắt buộc, đúng mẫu;
      · control KHÔNG chịu (ô ngày, nút lọc, tab…) -> không có chữ gợi ý nào để nêu, giữ lối
        viết cũ và dùng động từ GIỮ — *"Chọn datepicker = giá trị mặc định"* là câu vô nghĩa.
    """
    lo = loai or loai_control_tu_nhom(ten_nhom)
    ph = placeholder_chuan(ten_nhom, 'loc') if la_o_chon(ten_nhom) else None
    if ph:
        return (TK_MAC_DINH_B % (lo, ph), TK_MAC_DINH_C % (lo.lower(), ph), TK_MAC_DINH_D)
    return (TK_MAC_DINH_B_CHUNG % lo, TK_MAC_DINH_C_CHUNG % lo.lower(), TK_MAC_DINH_D)


def tieu_de_mac_dinh_chuan(ten_nhom, ngu_canh, loai=None):
    """Cột B BẮT BUỘC cho case §6 *giá trị mặc định*, theo khuôn mẫu. None = không chốt cứng.

    Thêm 2026-09-14 cùng lúc với khuôn mẫu: từ nay chữ gợi ý bắt buộc nằm ở ĐÂY, nên chỉ sửa
    cột C/D mà bỏ cột B là để lại case mang tiêu đề chung chung *"= giá trị mặc định"* — vẫn
    đúng cái lỗi luật ① sinh ra để bịt.
    """
    return tk_mac_dinh_bo_ba(ten_nhom, loai)[0] if ngu_canh == 'loc' else None


def kq_mac_dinh_chuan(ten_nhom, ngu_canh, tim_kiem=False):
    """Cột D BẮT BUỘC cho case *giá trị mặc định*. None = luật không chốt cứng ô này."""
    if tim_kiem:
        return TK_MAC_DINH_D if ngu_canh == 'loc' else None
    if ngu_canh == 'perpage':
        return 'Mặc định là %d.' % PAGE_SIZE_MAC_DINH
    if ngu_canh == 'loc':  # noqa: E501 — xem `buoc_mac_dinh_chuan` ngay dưới
        return 'Ô chưa chọn gì, hiện chữ gợi ý "%s". Không có giá trị nghiệp vụ nào được chọn sẵn.' \
               % placeholder_chuan(ten_nhom, 'loc')
    if ngu_canh == 'them':
        return 'Mặc định là "%s". Ô không tự chọn giá trị đầu tiên của danh sách.' % PLACEHOLDER_CHON
    return None


def buoc_mac_dinh_chuan(ten_nhom, ngu_canh, tim_kiem=False, loai=None):
    """Cột C BẮT BUỘC cho case *giá trị mặc định*. None = giữ nguyên cột C đang có.

    ⚠️ Chỉ đổi cột C của lớp case §6 (`Tìm kiếm với: …`). Bộ case đã qua A6 viết cột C ở đó
    thành *"Chọn lần lượt từng giá trị của ô chọn …"* — mô tả việc CHỌN TỪNG GIÁ TRỊ, trái hẳn
    mục đích *giá trị mặc định*. Sửa mỗi cột D là để lại một case tự mâu thuẫn: bước bảo chọn
    hết lượt, kết quả bảo chưa lọc gì. **Phép ㉓ không bắt được** (đo trên `TangDuLieuDanhMuc`:
    ㉓ ra 0 trong khi cả 2 ca đều lệch) nên phải sửa chủ động, đừng chờ bộ rà kêu.

    Case control (`Kiểm tra giá trị mặc định <X>`) thì cột C của A6 vốn đã đúng
    (*"Mở màn → đọc chữ đang hiện trong ô"*) ⇒ trả None, không đụng.
    """
    if not tim_kiem or ngu_canh != 'loc':
        return None
    ph = placeholder_chuan(ten_nhom, 'loc')
    lo = (loai or loai_control_tu_nhom(ten_nhom))
    # Mẫu viết loại control ở bước 2 bằng chữ THƯỜNG (`2. Chọn selectbox = -- Chọn trạng thái --`)
    # trong khi cột B viết hoa (`- Selectbox = …`). Chép đúng cả hai.
    return (TK_MAC_DINH_C % (lo.lower(), ph)) if ph else (TK_MAC_DINH_C_CHUNG % lo.lower())


def dat_luat_cung(txt, ten_nhom, ngu_canh, txt_phu=None):
    """Ô này có thoả luật cứng không. So KHÔNG phụ thuộc kiểu gạch và cách diễn đạt.

    Chỉ đòi ĐÚNG DỮ KIỆN (chữ gợi ý / con số 20), không đòi câu chữ cố định: bộ case cũ mỗi
    nơi một cách diễn đạt, đòi câu y hệt là báo oan hàng loạt (đúng bài học `mac_dinh_sai_o_cn_sua`).

    `txt_phu` (2026-09-14) — các ô KHÁC của cùng case cũng được tính là chỗ nêu dữ kiện. Cần
    cho lớp case §6 theo khuôn mẫu: chữ gợi ý ở đó nằm tại **cột B và cột C**, cột D chỉ nói
    hệ thống phản hồi thế nào. Không có tham số này thì mọi case ĐÚNG MẪU đều bị phép ⓐ báo đỏ.
    """
    t = _phang_gach(txt)
    for _p in (txt_phu or ()):
        t += '\n' + _phang_gach(_p)
    if not t:
        return False
    if ngu_canh == 'perpage':
        return re.search(r'\b%d\b' % PAGE_SIZE_MAC_DINH, txt or '') is not None
    ph = placeholder_chuan(ten_nhom, ngu_canh)
    if not ph:
        return True
    if _phang_gach(ph) in t:
        return True
    # `-- Chọn --` là chữ gợi ý HỢP LỆ cho cả ô lọc: màn thật hay rút gọn như vậy, và luật chỉ
    # cấm *chọn sẵn giá trị nghiệp vụ*, không bắt phải nhắc lại tên trường.
    return ngu_canh == 'loc' and _phang_gach(PLACEHOLDER_CHON) in t


# Dấu hiệu cột D đang mô tả một GIÁ TRỊ NGHIỆP VỤ chọn sẵn — cái luật ① cấm.
_KW_CHON_SAN = ('gia tri dau tien', 'option dau tien', 'muc dau tien', 'lua chon dau tien',
                'tat ca', 'mac dinh chon', 'chon san')


# Từ phủ định — phải xét theo MỆNH ĐỀ, không theo cả ô.
_KW_PHU_DINH = ('khong ', 'chua ', 'khong.', 'chua.')


def vi_pham_chon_san(txt, ngu_canh):
    """Cột D nói ô tự chọn sẵn một giá trị -> vi phạm luật ① (chỉ xét ô Thêm mới và ô lọc).

    ⚠️ PHẢI xét PHỦ ĐỊNH theo từng mệnh đề. Bản đầu dò từ khoá trên cả ô nên báo oan đúng
    **bản chữ của chính luật cứng**: *"Không có giá trị nghiệp vụ nào được chọn sẵn"* chứa
    `chon san`, *"Ô không tự chọn giá trị đầu tiên"* chứa `gia tri dau tien` ⇒ chạy trọn chuỗi
    sinh xong bộ rà vẫn kêu 3 ca, trong khi file đã ĐÚNG. Đúng lớp bẫy đã ghi ở
    `mac_dinh_sai_o_cn_sua`: đòi/cấm một chuỗi mà bỏ qua ngữ cảnh câu là báo nhầm hàng loạt.

    Cắt câu theo `.` `,` `;` và xuống dòng: mệnh đề mang từ khoá mà CÓ từ phủ định thì bỏ qua.
    """
    if ngu_canh not in ('loc', 'them'):
        return None
    for menh_de in re.split(r'[.,;\n]', norm(txt or '')):
        if any(k in menh_de for k in _KW_PHU_DINH):
            continue
        for k in _KW_CHON_SAN:
            if k in menh_de:
                return k
    return None


# Chữ thường thấy khi ô chọn đang KHÔNG ở trạng thái placeholder — dùng để phân biệt
# "ô trống" với "ô đang chọn sẵn một giá trị nghiệp vụ".
_GOI_Y_HOP_LE = ('chon', 'select', 'tat ca dieu kien')


def la_o_trong(gia_tri, goi_y=''):
    """Ô chọn đang ở trạng thái CHƯA CHỌN GÌ (hiện chữ gợi ý) hay đang mang một giá trị?

    Trình duyệt trả `gia_tri` = text của option đang chọn / innerText của nút combobox. Với ô
    đúng luật, chuỗi đó CHÍNH LÀ chữ gợi ý -> chứa chữ "Chọn". Rỗng cũng là trống.
    """
    g = norm(gia_tri or '').strip()
    if not g:
        return True
    if goi_y and norm(goi_y).strip() == g:
        return True
    return any(k in g for k in _GOI_Y_HOP_LE)


def soi_luat_cung_live(d):
    """[(control, expected, actual)] — dữ kiện `probe_live` đọc được mà TRÁI luật cứng.

    Chỉ ĐỌC và BÁO. Không sửa app, không sửa dữ liệu, không sửa hồ sơ màn — đúng hàng rào an
    toàn của `probe_live` (script chỉ bấm 4 loại phần tử, không gọi API ghi).
    """
    ra = []
    # ── ② số bản ghi/trang
    p = (d or {}).get('phan_trang') or {}
    sbg = (p.get('so_ban_ghi_trang') or '').strip()
    if sbg and sbg.replace('.', '').replace(',', '') != str(PAGE_SIZE_MAC_DINH):
        ra.append(('Số bản ghi trên trang (cụm phân trang)',
                   'mặc định %d khi mở màn lần đầu' % PAGE_SIZE_MAC_DINH, sbg))
    # ── ① ô chọn ở thanh lọc: `<select>` và combobox dựng bằng button
    for x in (d or {}).get('thanh_loc') or []:
        the = (x.get('the') or '')
        if not (the.startswith('select') or the.startswith('button')):
            continue
        nhan = (x.get('nhan') or '').strip()
        # Vá 2026-09-14: danh sách chép tay 5 nhãn bỏ lọt mọi nút hành động khác đứng trên
        # thanh lọc (`Xuất excel`, `Đặt lại`, `Áp dụng`…) -> luật cứng ① tố oan chúng là "ô
        # chọn đang chọn sẵn giá trị nghiệp vụ". Nay dùng CHUNG `la_nut_hanh_dong_live()` —
        # bản có đủ ba lưới, KHÔNG phải phép khớp chữ trơn.
        if not nhan or la_nut_hanh_dong_live(x):
            continue
        gt = (x.get('gia_tri') or '').strip()
        if not la_o_trong(gt, x.get('goi_y')):
            ra.append(('Ô lọc "%s"' % nhan,
                       'chữ gợi ý "%s Chọn <nội dung cần tìm> %s", không chọn sẵn giá trị '
                       'nghiệp vụ' % (DAU_PLACEHOLDER, DAU_PLACEHOLDER), gt))
    # ── ① ô chọn trong biểu mẫu THÊM MỚI
    f = (d or {}).get('form_them') or {}
    for x in f.get('control') or []:
        the = (x.get('the') or '')
        if not (the.startswith('select') or the.startswith('[role=combobox]')):
            continue
        nhan = (x.get('nhan') or '').strip()
        gt = (x.get('gia_tri') or '').strip()
        if not la_o_trong(gt, x.get('goi_y')):
            ra.append(('Ô chọn "%s" (biểu mẫu Thêm mới)' % nhan,
                       'mặc định "%s", không tự chọn option đầu tiên' % PLACEHOLDER_CHON, gt))
    return ra


def bang_chung_tu_cot_d(d, ten_nhom, ngu_canh):
    """Rút BẰNG CHỨNG "màn thật đang là gì" từ chính cột D CŨ, trước khi ghi đè nó.

    Chỉ thị 2026-09-12 đòi *"Lưu evidence nếu cơ chế hiện tại hỗ trợ"*. Với bộ case đã qua A6,
    cột D cũ CHÍNH LÀ bằng chứng: *`Ô hiện sẵn "Tất cả trạng thái"`* · *`Ô hiện sẵn số 10`*.
    Ghi đè trơn là mất dấu vết màn thật chạy sai — sau này không ai biết vì sao case đòi 20.

    ⚠️ KHÔNG rút cho case §6 *Tìm kiếm với: … = giá trị mặc định*: cột D cũ của lớp case đó mô
    tả việc CHỌN TỪNG GIÁ TRỊ (`Chọn "Hoạt động": bảng chỉ còn …`), lấy chuỗi trong ngoặc ở đó
    ra làm "giá trị đang chọn sẵn" là bịa bằng chứng. Đo trên `TangDuLieuDanhMuc`: đúng 2 ca.
    """
    if not d:
        return None
    if ngu_canh == 'perpage':
        # ⚠️ Bỏ SỐ THỨ TỰ đầu dòng (`1.` `2.` — khuôn ⑰) trước khi dò. Bản đầu quét cả ô nên
        # cột D *"1. Bên phải ô … 2. Bấm nút thì … mức 10 đang dùng …"* cho ra bằng chứng
        # **"màn thật đang là 1"** — sai hẳn, và sai một cách RẤT dễ tin. Dính ngay ca đầu
        # tiên chạy thật (`TangDuLieuDanhMuc` r52).
        sach = re.sub(r'(?m)^\s*\d+\.\s*', '', d)
        # Ưu tiên con số đi kèm chữ chỉ mức; không có thì mới lấy số đầu tiên khác 20.
        uu_tien = re.findall(r'(?:m[ứư]c|s[ốô]|hi[ểe]n th[ịi])\s*(?:l[àa]\s*)?(\d{1,4})', sach, re.I)
        for so in uu_tien + re.findall(r'\b(\d{1,4})\b', sach):
            if int(so) != PAGE_SIZE_MAC_DINH:
                return 'màn thật đang là %s' % so
        return None
    if ngu_canh not in ('loc', 'them'):
        return None
    for x in re.findall(r'"([^"]{2,60})"', d):
        if _phang_gach('-- chon') in _phang_gach(x):
            continue                       # đã là chữ gợi ý hợp luật -> không phải bằng chứng sai
        if norm(x).startswith('so ban ghi') or norm(x).startswith('chon nhanh'):
            continue                       # nhãn ô, không phải giá trị đang chọn
        return 'màn thật đang hiện "%s"' % x
    return None


def bao_luat_cung(control, expected, actual, evidence=None):
    """Khối báo cáo `[FIXED RULE VIOLATION]` — khuôn CHỐT, mọi nơi in y hệt nhau.

    Một khuôn duy nhất để `probe_live` (màn thật), `audit_luat_cung` (bộ case) và bước Verify
    cùng in ra một dạng, grep được bằng đúng một từ khoá.
    """
    d = ['[FIXED RULE VIOLATION]', '', 'Control:', '%s' % control, '',
         'Expected:', '%s' % expected, '', 'Actual:', '%s' % (actual or '(không đọc được)')]
    d += ['', 'Evidence:', '%s' % (evidence or '(chưa có)')]
    return '\n'.join(d)


def bao_xung_dot(control, luat_tool, yeu_cau, nguon):
    """Khối `[CONFLICT WITH FIXED TOOL RULE]` — BA/SRS/hồ sơ màn đòi khác luật cứng.

    Tool KHÔNG tự đổi luật và cũng KHÔNG im lặng nghe theo: in ra để QA/BA quyết.
    """
    return '\n'.join(['[CONFLICT WITH FIXED TOOL RULE]', '', 'Control:', '%s' % control, '',
                      'Luật cứng tool_v2:', '%s' % luat_tool, '',
                      'Yêu cầu khác:', '%s' % yeu_cau, '',
                      'Nguồn:', '%s' % nguon, '',
                      '-> KHÔNG tự đổi rule. Báo QA/BA quyết rồi mới sửa `qalib` cho CẢ tool.'])


def duong_ho_so_man(path):
    """Các chỗ hồ sơ màn CÓ THỂ nằm, theo thứ tự ưu tiên — dùng cả để báo lỗi "thiếu ở đâu".

    Nhận cả file NGUỒN lẫn file KẾT QUẢ: file kết quả nằm ở thư mục khác và mang hậu tố
    `_ket_qua` (`qalib.res_suffix()`), cắt hậu tố rồi mới tra. Không có bước cắt này thì lượt
    chạy live đọc từ file kết quả luôn báo "không có hồ sơ màn" và §0 của PROMPT bắt DỪNG,
    đúng lúc dữ kiện đang nằm sẵn cạnh bộ case (thêm 2026-09-15 cho lớp B).
    """
    base = os.path.basename(path or '')
    if base.endswith('.xlsx'):
        base = base[:-5]
    suf = res_suffix()
    if suf and base.endswith(suf):
        base = base[:-len(suf)]
    d = os.path.dirname(os.path.abspath(path or '.'))
    goc_role = os.path.dirname(d)
    return [os.path.join(goc_role, 'ho-so-man', base + '.json'),
            os.path.join(d, 'ho-so-man', base + '.json'),
            os.path.join(d, base + '.json')]


def ho_so_man(path):
    """Hồ sơ màn của một bộ case: `<role>/ho-so-man/<tên .xlsx>.json` (chuẩn 2026-09-09).

    Đặt ở `qalib` vì từ 2026-09-12 có BA nơi cần (`audit_noi_dung` · `patch_giaodien` ·
    bộ luật cứng). Hai bản cũ giữ nguyên để không đụng đường chạy đã nghiệm thu; code MỚI
    dùng bản này.
    """
    if not path:
        return None
    for p in duong_ho_so_man(path):
        if os.path.exists(p):
            try:
                import json
                with open(p, encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print('   !! hồ sơ màn đọc không được (%s): %s' % (type(e).__name__, p))
                return None
    return None


def quet_o_chon(tc):
    """[(tên CN, tên nhóm, ngữ cảnh, [(dòng, tiêu đề, cột D, cột C)])] — mọi nhóm CHỊU luật cứng.

    Đi thẳng cây dòng chứ không dùng `scan_control_groups`: phép đó chỉ trả TIÊU ĐỀ case, mà
    luật cứng đo **cột D**; và nó chỉ quét nhóm trong khối `Validate`, trong khi ô chọn của
    thanh lọc có thể nằm thẳng ở cấp `sub` của khối `Giao diện`.

    ⚠️ **Cột C thêm 2026-09-14** (ô thứ TƯ, nối vào cuối để chỗ gọi cũ `rn, td, d = …` vẫn
    chạy được nếu chỉ lấy 3 ô đầu — nhưng CẢ HAI chỗ gọi đã được sửa theo). Từ khi case §6 đi
    theo khuôn mẫu, chữ gợi ý bắt buộc nằm ở **cột B và cột C**, cột D chỉ nói hệ thống phản
    hồi thế nào ⇒ phép quét chỉ trả B và D là bộ rà không có gì để đối chiếu.

    Để ở `qalib` chứ không ở bộ rà: bộ rà và bộ sửa phải dùng CHUNG một phép quét, và `import`
    một script `audit_*` là chạy luôn thân script đó (bẫy đã dính với `audit_timkiem`).
    """
    ra, cn, nhom, cases = [], None, None, []
    trong_attt = False

    def chot():
        if nhom and cases:
            ng = ngu_canh_o_chon(cn, nhom)
            if ng:
                ra.append((cn, nhom, ng, list(cases)))
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'case':
            if nhom and not trong_attt:
                cases.append((rn, (tc.c(rn, 'B') or '').strip(), tc.c(rn, 'D') or '',
                              tc.c(rn, 'C') or ''))
            continue
        chot()
        nhom, cases = None, []
        if lv == 'cn':
            cn = b
            trong_attt = False
        elif lv in ('grp', 'sub', 'sub2'):
            # ⚠️ BỎ QUA khối `An toàn thông tin` (vá 2026-09-14). `patch_attt_field` dựng trong
            # khối ATTT một nhóm con MANG ĐÚNG TÊN control (`Textbox Số bản ghi trên trang`) chứa
            # 1 case injection — phép quét này tưởng đó là nhóm control thật rồi đòi nó có case
            # *giá trị mặc định*, báo `[THIẾU]` OAN. Bộ case đã giao không dính vì nó sinh ra
            # TRƯỚC khi có ATTT per-field; chuỗi SINH MỚI mới lộ ra (đo 2026-09-14 trên màn
            # `Cảnh báo Mâu thuẫn`: 1 cờ oan). Cờ ở cấp `grp`/`sub` và giữ tới hết CN.
            # Cờ bật ở dòng khối ATTT và giữ tới hết CN. ⚠️ CHỈ đặt lại ở cấp `grp` — khối
            # ATTT là `grp`, còn nhóm per-field bên trong nó là `sub`; đặt lại ở cấp `sub` là
            # tự xoá cờ ngay dòng cần chặn (đã dính đúng lỗi đó ở bản vá đầu cùng ngày).
            if 'an toan thong tin' in norm(b):
                trong_attt = True
            elif lv == 'grp':
                trong_attt = False
            nhom = None if trong_attt else b
    chot()
    return ra


def khop_xung_dot(khoa, nhom, ng):
    """Xung đột khai theo tên control này có áp cho nhóm đang xét không.

    Khớp theo TÊN trước; nếu không thì khớp theo NGỮ CẢNH `perpage` — cụm phân trang có HAI
    control cho cùng một giá trị (`Textbox Số bản ghi/trang` + `Selectbox Số bản ghi trên
    trang`), hồ sơ màn chỉ khai một cái mà cả hai đều chịu cùng luật. Đo 2026-09-14 trên
    `CanhBaoMauThuan`: chỉ 2/4 case *giá trị mặc định* được gắn cờ, 2 case Textbox mất bằng
    chứng dù cột D cũng bị ghi theo luật.
    """
    kn, nn = norm(khoa or ''), norm(nhom or '')
    if kn and (kn in nn or nn in kn):
        return True
    return ng == 'perpage' and 'so ban ghi' in kn


def soi_luat_cung_spec(spec):
    """[(control, luật tool, yêu cầu khác, nguồn)] — hồ sơ màn khai TRÁI luật cứng.

    Hồ sơ màn là nơi grounding cất dữ kiện thật. Khai `page_size_mac_dinh: 10` hay
    `placeholder_loc_trang_thai: "Tất cả"` nghĩa là màn thật đang chạy khác luật — không phải
    lý do để đổi bộ case, mà là một xung đột phải báo.
    """
    g = (spec or {}).get('grounding') or {}
    v, h = g.get('verbatim') or {}, g.get('hang_so') or {}
    ra = []
    ps = h.get('page_size_mac_dinh')
    if isinstance(ps, int) and ps != PAGE_SIZE_MAC_DINH:
        ra.append(('Selectbox Số bản ghi trên trang',
                   'mặc định %d khi mở màn lần đầu' % PAGE_SIZE_MAC_DINH,
                   'mặc định %d' % ps, 'hồ sơ màn · grounding.hang_so.page_size_mac_dinh'))
    for k, val in v.items():
        if not k.startswith('placeholder_loc_') or not isinstance(val, str):
            continue
        ten = k[len('placeholder_loc_'):].replace('_', ' ')
        if _phang_gach(PLACEHOLDER_CHON) in _phang_gach(val):
            continue
        if _phang_gach(val).startswith('-- chon'):
            continue
        ra.append(('Selectbox %s' % ten,
                   'chữ gợi ý "%s"' % placeholder_chuan('Selectbox ' + ten, 'loc'),
                   '"%s"' % val, 'hồ sơ màn · grounding.verbatim.%s' % k))
    return ra


# ══════════════════════════════════════════════════════════════════════════════
# 0. BẢN LÙI (bak) — THƯ MỤC RIÊNG, KHÔNG NẰM CẠNH BỘ CASE
# ══════════════════════════════════════════════════════════════════════════════
# Trước 2026-09-10 mọi script chép bản lùi ra `<file>.bak` / `<file>.bak_run` NGAY CẠNH
# file gốc, nên thư mục `testCase/<Role>/testcase/` lẫn cả bản lùi. Hai cái giá đã trả:
#   · `iter_role_files()` và mọi bộ rà quét theo `*.xlsx*` đếm/đọc nhầm bản lùi;
#   · bản lùi bị `.gitignore` nuốt nên `git status` sạch trong khi thư mục thì bẩn.
# Từ đây MỌI script phải gọi `qalib.backup()`, không tự `shutil.copy(path, path + '.bak')`.
#
# Tuỳ biến theo từng máy (không sửa code):
#   QA_BAK_DIR   chỗ đặt thư mục bản lùi. Tuyệt đối (`/data/bak`, `~/qa-backups/tool_v2`)
#                hoặc tương đối so với gốc repo (`bak`). Mặc định `<gốc repo>/bak`.
#   QA_BAK_KEEP  số bản lùi giữ lại cho MỖI file, bản cũ hơn bị xoá. Mặc định 10.

BAK_KEEP = 10


def repo_root():
    """Gốc repo `tool_v2` — thư mục cha của `tools/`."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


_bak_warned = set()


def bak_dir():
    """Thư mục gốc chứa bản lùi (env `QA_BAK_DIR`, mặc định `<gốc repo>/bak`)."""
    d = (os.environ.get('QA_BAK_DIR') or '').strip()
    if not d:
        d = os.path.join(repo_root(), 'bak')
    else:
        d = os.path.expanduser(d)
        d = d if os.path.isabs(d) else os.path.join(repo_root(), d)
    d = os.path.abspath(d)
    _canh_bao_bak_trong_bo_case(d)
    return d


def _canh_bao_bak_trong_bo_case(d):
    """Bản lùi ĐẶT TRONG thư mục bộ case là hỏng cả bộ rà: `iter_role_files()` và mọi phép
    quét `*.xlsx` sẽ đếm luôn bản lùi (đúng bẫy đã sinh ra khối này). Cảnh báo 1 lần/thư mục.
    """
    tc = [os.path.abspath(os.path.expanduser(os.environ.get('QA_TESTCASE_DIR') or ''))] \
        if os.environ.get('QA_TESTCASE_DIR') else []
    tc += [os.path.join(repo_root(), n) for n in os.listdir(repo_root())
           if n.lower().startswith('testcase')
           and os.path.isdir(os.path.join(repo_root(), n))]
    for t in tc:
        if t and (d == t or d.startswith(t + os.sep)) and d not in _bak_warned:
            _bak_warned.add(d)
            print('!! QA_BAK_DIR=%s NẰM TRONG thư mục bộ case %s — mọi phép quét `*.xlsx`\n'
                  '   sẽ đếm cả bản lùi. Đặt QA_BAK_DIR ra ngoài (mặc định `<gốc repo>/bak`).'
                  % (d, t))


def bak_keep():
    """Số bản lùi giữ cho mỗi file (env `QA_BAK_KEEP`, mặc định `BAK_KEEP`)."""
    try:
        n = int((os.environ.get('QA_BAK_KEEP') or BAK_KEEP))
    except ValueError:
        print('!! QA_BAK_KEEP=%r không phải số — dùng mặc định %d'
              % (os.environ.get('QA_BAK_KEEP'), BAK_KEEP))
        n = BAK_KEEP
    return max(1, n)


def _bak_slot(path):
    """(thư mục đích, tên file) — soi lại cây thư mục của repo bên trong `bak_dir()`.

    `testCase/QuanTri/testcase/X.xlsx` → `<bak>/testCase/QuanTri/testcase/X…`
    File NGOÀI repo được gom vào `<bak>/_ngoai/<đường dẫn tuyệt đối>` để không đè nhau.
    """
    p = os.path.abspath(path)
    rel = os.path.relpath(p, repo_root())
    if rel.split(os.sep)[0] == os.pardir:
        rel = os.path.join('_ngoai', p.lstrip(os.sep).lstrip(':').lstrip(os.sep))
    return os.path.join(bak_dir(), os.path.dirname(rel)), os.path.basename(p)


# `<stem>.<YYYYmmdd-HHMMSS>[-<lần thứ N trong cùng giây>][.<tag>].<ext>`
_BAK_TS = re.compile(r'^(\d{8}-\d{6})(?:-(\d+))?(?:\.|$)')


def _bak_key(name, pre):
    """Khoá sắp bản lùi. KHÔNG sắp theo cả tên: `…-3.thu.xlsx` xếp TRƯỚC `…321.thu.xlsx`
    vì '-' < '.', nên bản mới nhất bị coi là cũ nhất và bị xoá oan. Bản không đúng quy ước
    đặt tên nhận khoá rỗng → nằm đầu hàng, bị dọn trước.
    """
    m = _BAK_TS.match(name[len(pre):])
    return (m.group(1), int(m.group(2) or 1)) if m else ('', 0)


def _bak_prune(d, stem, ext, keep):
    """Giữ `keep` bản mới nhất của MỘT file, xoá phần cũ hơn. Trả về số bản đã xoá."""
    pre = stem + '.'
    olds = sorted((f for f in os.listdir(d) if f.startswith(pre) and f.endswith(ext)),
                  key=lambda f: _bak_key(f, pre))
    n = 0
    for f in olds[:max(0, len(olds) - keep)]:
        try:
            os.remove(os.path.join(d, f))
            n += 1
        except OSError as e:                       # bản lùi khoá/mất quyền: báo, đừng chết cả đợt
            print('!! không xoá được bản lùi cũ %s (%s)' % (f, type(e).__name__))
    return n


def bak_show(dst):
    """Đường dẫn bản lùi để in ra: tương đối nếu nằm trong repo, còn lại rút gọn `~`."""
    rel = os.path.relpath(dst, repo_root())
    if rel.split(os.sep)[0] != os.pardir:
        return rel
    home = os.path.expanduser('~')
    return '~' + dst[len(home):] if dst.startswith(home + os.sep) else dst


def backup(path, tag='', keep=None, quiet=True):
    """Chép `path` sang thư mục bản lùi, dọn bớt bản cũ, trả về đường dẫn bản vừa tạo.

    tag  — nguồn tạo bản lùi (`bak_run`, `formula`…), ghép vào tên để biết ai đã ghi đè.
    keep — ghi đè `bak_keep()` cho lần gọi này.
    Trả về `None` khi `path` chưa tồn tại (lần ghi đầu tiên thì không có gì để lùi).
    """
    if not os.path.exists(path):
        return None
    d, base = _bak_slot(path)
    os.makedirs(d, exist_ok=True)
    stem, ext = os.path.splitext(base)
    pre = stem + '.'
    ts = time.strftime('%Y%m%d-%H%M%S')            # có NĂM để `_bak_key` sắp đúng qua giao thừa
    # Nhiều bản trong CÙNG MỘT GIÂY: số thứ tự lấy từ max các bản ĐANG CÓ + 1, không phải
    # "tên đầu còn trống" — `_bak_prune` xoá bản cũ làm trống lại tên nhỏ, dùng lại là ĐẢO
    # thứ tự và lần dọn sau xoá nhầm bản mới nhất.
    seq = max((_bak_key(f, pre)[1] for f in os.listdir(d) if f.startswith(pre + ts)),
              default=0) + 1
    tg = '.' + tag if tag else ''
    dst = os.path.join(d, '%s%s%s%s%s' % (pre, ts, '' if seq == 1 else '-%d' % seq, tg, ext))
    while os.path.exists(dst):                     # cùng giây + cùng tag
        seq += 1
        dst = os.path.join(d, '%s%s-%d%s%s' % (pre, ts, seq, tg, ext))
    shutil.copy2(path, dst)
    _bak_prune(d, stem, ext, bak_keep() if keep is None else keep)
    if not quiet:
        print('  bản lùi: %s' % bak_show(dst))
    return dst


# ══════════════════════════════════════════════════════════════════════════════
# 1. DUYỆT FILE THEO ROLE
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Sheet:
    """Một sheet BP của một file test case."""
    path: str
    base: str
    name: str            # tên màn (đã bỏ prefix/đuôi)
    bp: Optional[str]    # tên sheet BP, None nếu file chỉ có một sheet TC
    multi: bool          # file có nhiều sheet BP không (để quyết định in thêm tên sheet)
    tc: object           # tcfix.TC đã load


def is_locked(path):
    """File đang mở trong LibreOffice → cấm GHI (đọc thì vẫn được)."""
    d, b = os.path.dirname(path), os.path.basename(path)
    return os.path.exists(os.path.join(d, '.~lock.%s#' % b))


def iter_role_files(role, only=None, skip_locked=False, on_error=None, broken=None):
    """Sinh từng `Sheet` của một role.

    only        — lọc theo tên màn (khớp chuỗi con, không phân biệt hoa thường).
    skip_locked — True khi script sẽ GHI: bỏ qua file đang mở trong LibreOffice.
    on_error    — callback(base, exception) khi một file không đọc được; mặc định in cảnh báo.
                  Đợt rà vẫn chạy tiếp.
    broken      — list nhận (tên file, lý do) của file bị bỏ qua. Truyền vào chứ không lấy ra từ
                  thuộc tính của hàm: generator bị `break` giữa chừng sẽ không chạy tới dòng cuối.
    """
    cfg = roles.get(role)
    broken = [] if broken is None else broken
    # ⚠️ NÓI RA khi không có gì để đọc (vá 2026-09-09). Thư mục sai/rỗng thì generator này sinh
    # RỖNG và MỌI bộ rà in `0` — nhìn y hệt "sạch". Đã dính thật: hồ sơ dự án `moet` mặc định
    # trỏ `~/Desktop/testCase-moet` (không tồn tại) nên cả một đợt đo "0 nhiễu trên corpus" là
    # vô nghĩa, phải đo lại bằng `QA_TESTCASE_DIR`. Cùng lớp điểm mù 4 của README (bộ rà chết
    # giữa chừng vẫn in 0) — mọi chỗ tool không lấy được dữ kiện đều phải kêu, không im lặng.
    _co_file = glob.glob(cfg['dir'] + '*.xlsx')
    if not _co_file:
        print('!! KHÔNG CÓ FILE .xlsx nào trong %s' % cfg['dir'])
        print('   ⇒ mọi con số dưới đây là 0 vì KHÔNG ĐỌC GÌ, không phải vì sạch.'
              ' Đặt QA_TESTCASE_DIR trỏ đúng thư mục bộ case.')
    for path in sorted(_co_file):
        base = os.path.basename(path)
        if base in cfg['skip']:
            continue
        name = base.replace(cfg['strip'], '').replace('.xlsx', '')
        if only and only.lower() not in name.lower():
            continue
        if skip_locked and is_locked(path):
            print('  BỎ QUA (đang mở):', base)
            broken.append((base, 'đang mở trong LibreOffice'))
            continue
        try:
            first = tcfix.load(path)                # đọc 1 lần, dùng lại cho sheet đầu
        except Exception as e:                      # file hỏng / không nhận ra sheet TC
            (on_error or _warn_broken)(base, e)
            broken.append((base, '%s: %s' % (type(e).__name__, e)))
            continue
        bpsheets = first.bpsheets
        multi = len(bpsheets) > 1
        for i, bp in enumerate(bpsheets or [None]):
            try:
                # `first` đã là sheet BP đầu tiên — chỉ load lại từ sheet thứ hai trở đi
                tc = first if i == 0 else tcfix.load(path, bp=bp)
            except Exception as e:
                (on_error or _warn_broken)(base, e)
                broken.append((base, '%s: %s' % (type(e).__name__, e)))
                continue
            yield Sheet(path=path, base=base, name=name, bp=bp, multi=multi, tc=tc)


def _warn_broken(base, e):
    print('  ✘ KHÔNG ĐỌC ĐƯỢC %-50s %s: %s' % (base[:50], type(e).__name__, e))


# ══════════════════════════════════════════════════════════════════════════════
# 1b. ĐƯỜNG DẪN FILE KẾT QUẢ CHẠY LIVE  — dùng chung cho MỌI dự án, MỌI máy
# ══════════════════════════════════════════════════════════════════════════════
# Ba khoá `file_prefix` · `result_suffix` · `subdir_result` đã được khai ở `projects/<tên>.py`
# từ 2026-08-22 nhưng **KHÔNG code nào đọc**: mọi script chạm file kết quả đều tự chốt cứng
# đường dẫn (`do_tin_cay.ROOT = tools/../../testCase` · `sync_ncc_0821.BASE = …/testCase/NCC/`
# · `clear_marks_taikhoan.DST`). Hệ quả đo được 2026-09-12: `do_tin_cay.py ChuyenVien` báo
# `Không thấy thư mục kết quả` trên CHÍNH repo này, vì ROOT trỏ ra ngoài repo — và không một
# phép rà nào bắt, đúng lớp lỗi "đọc rỗng rồi kết luận" của điểm mù 4.
#
# Từ đây mọi script live test phải lấy đường dẫn qua khối này, không tự ghép chuỗi.
# Suy thư mục role từ chính `cfg['dir']` (cha của nó) chứ KHÔNG ghép `BASE + role`: hồ sơ
# `gstem` có role viết hoa-thường khác nhau (`NCC/testCase/` vs `Admin/testcase/`), ghép tay
# là trượt trên máy có hệ tệp phân biệt hoa thường.

RES_SUBDIR_MAC_DINH = ['ket-qua-test']
RES_SUFFIX_MAC_DINH = '_ket_qua'


def _pj(key, mac_dinh):
    """Đọc một khoá của hồ sơ dự án, thiếu thì rơi về mặc định (hồ sơ cũ không khai đủ)."""
    v = (roles.PROJECT or {}).get(key)
    return v if v else mac_dinh


def role_dir(role):
    """Thư mục CỦA ROLE (cha của thư mục nguồn). `…/testCase/NCC/testCase/` -> `…/testCase/NCC`."""
    return os.path.dirname(os.path.normpath(roles.get(role)['dir']))


def res_dirs(role, ton_tai=False):
    """Danh sách thư mục kết quả của role, theo `PROJECT['subdir_result']`.

    ton_tai=True — chỉ trả thư mục CÓ THẬT trên đĩa (dùng khi đọc; lúc tạo thì cần cả chỗ chưa có).
    Dò thêm biến thể hoa/thường vì bộ case cũ của GSTEM đặt `Ket-qua-test`.
    """
    base = role_dir(role)
    out = []
    for sub in _pj('subdir_result', RES_SUBDIR_MAC_DINH):
        d = os.path.join(base, sub)
        if not os.path.isdir(d):
            alt = [x for x in (os.listdir(base) if os.path.isdir(base) else [])
                   if x.lower() == sub.lower()]
            if alt:
                d = os.path.join(base, alt[0])
        out.append(d)
    return [d for d in out if os.path.isdir(d)] if ton_tai else out


def res_suffix():
    return _pj('result_suffix', RES_SUFFIX_MAC_DINH)


def ten_man(path, role):
    """Tên màn suy từ tên file, bỏ cả tiền tố dự án lẫn hậu tố kết quả."""
    b = os.path.basename(path)
    for ext in ('.xlsx',):
        if b.endswith(ext):
            b = b[:-len(ext)]
    suf = res_suffix()
    if suf and b.endswith(suf):
        b = b[:-len(suf)]
    return b.replace(roles.get(role)['strip'], '')


def src_path(role, man):
    """Đường dẫn file NGUỒN của một màn (khớp chuỗi con, trả bản khớp đầu tiên)."""
    hits = [p for p in sorted(glob.glob(roles.get(role)['dir'] + '*.xlsx'))
            if os.path.basename(p) not in roles.get(role)['skip']
            and man.lower() in ten_man(p, role).lower()]
    return hits[0] if hits else None


def res_path(role, man, which=0):
    """Đường dẫn file KẾT QUẢ tương ứng một màn — kể cả khi file/thư mục chưa tồn tại."""
    src = src_path(role, man)
    stem = (os.path.basename(src)[:-5] if src
            else _pj('file_prefix', 'Testcase-Role-') + role + '-' + man)
    ds = res_dirs(role)
    if not ds:
        return None
    return os.path.join(ds[min(which, len(ds) - 1)], stem + res_suffix() + '.xlsx')


def iter_result_files(role, only=None, which=None):
    """Duyệt file kết quả của role — song song `iter_role_files` nhưng cho thư mục kết quả.

    Kêu to khi không đọc được gì: thư mục rỗng/sai mà im lặng thì mọi số đo phía sau là 0 giả
    (đúng bẫy đã ghi ở `iter_role_files`).
    """
    ds = res_dirs(role, ton_tai=True)
    if which is not None:
        ds = [d for d in ds if os.path.basename(d).lower() == str(which).lower()] or ds[:1]
    if not ds:
        print('!! KHÔNG CÓ THƯ MỤC KẾT QUẢ nào của role %s trong %s' % (role, role_dir(role)))
        print('   ⇒ dựng bằng `python3 ket_qua.py %s --create --apply`.' % role)
        return
    n = 0
    for d in ds:
        for p in sorted(glob.glob(os.path.join(d, '*' + res_suffix() + '.xlsx'))):
            b = os.path.basename(p)
            if b.startswith('~') or b in roles.get(role)['skip']:
                continue
            if only and only.lower() not in ten_man(p, role).lower():
                continue
            n += 1
            yield p
    if not n:
        print('!! KHÔNG CÓ FILE KẾT QUẢ nào khớp trong: %s' % ' · '.join(ds))
        print('   ⇒ mọi con số dưới đây là 0 vì KHÔNG ĐỌC GÌ, không phải vì sạch.')


# ══════════════════════════════════════════════════════════════════════════════
# 1c. KHỚP KẾT QUẢ ĐÃ CHẠY THEO **NỘI DUNG** (không theo mã case)
# ══════════════════════════════════════════════════════════════════════════════
# Mã case ở cột A là CÔNG THỨC theo dòng — chèn/xoá một dòng là toàn bộ mã dịch theo. Đợt
# 2026-08 map theo mã case đã gán sai **202/279** ghi chú. Luật: khớp theo (cột B + cột C),
# vòng 2 khớp lỏng theo cột B cho case đã đổi lời văn phần Các bước.
# Logic này vốn nằm trong `sync_ncc_0821.py` (đóng đinh vào role NCC + layout cũ); đưa lên đây
# để MỌI dự án dùng chung, đúng luật "luật dùng chung phải ở qalib, không ở script".

CARRY_MAC_DINH = ('F', 'G', 'S', 'T')      # cột mang kết quả đã chạy — KHÔNG có 'R' (công thức)


def key_noi_dung(tc, rn):
    """Khoá khớp một dòng case: (mục đích, 220 ký tự đầu của các bước) đã normalize."""
    return (norm(tc.c(rn, 'B')), norm(tc.c(rn, 'C'))[:220])


def doc_marks(path, bp=None, cols=CARRY_MAC_DINH):
    """Đọc kết quả đã chạy của một sheet -> (khớp CHẶT theo B+C, khớp LỎNG theo B).

    Mỗi khoá giữ DANH SÁCH theo thứ tự xuất hiện: case trùng nội dung trong cùng file
    (Tab · zoom · "hiển thị đầy đủ") được gán lần lượt, không dồn hết vào dòng đầu.
    """
    tc = tcfix.load(path, bp)
    chat, long_ = {}, {}
    for rn in tc.order:
        if rn < 12 or not tc.c(rn, 'C'):
            continue
        vals = {c: tc.c(rn, c) for c in cols if tc.c(rn, c)}
        # ⚠️ Cột T mang HAI thứ khác hẳn nhau: **cờ của bộ case** (`[CẦN VERIFY]` · `[RỦI RO]` ·
        # `[CHI TIẾT]`) do người viết case đặt, và **ghi chú lượt chạy** (`[Lần 1] …`) do
        # `write_marks` đặt. Khung mới chép từ NGUỒN nên đã mang cờ BẢN MỚI NHẤT; bê cột T cũ
        # sang vô điều kiện là **đè cờ mới bằng cờ cũ** — mất đúng thứ vừa được cập nhật, và
        # không phép rà nào bắt vì ô vẫn có chữ. Đo 2026-09-12 trên `LoaiNguon`: 37 dòng có T
        # nhưng chỉ 9 dòng có kết quả chạy ⇒ 28 dòng sẽ bị đè oan.
        # Luật: chỉ mang cột T khi dòng đó THỰC SỰ có kết quả chạy. (`sync_ncc_0821.py` mang cả
        # 4 cột vô điều kiện — dính đúng lỗi này, nhưng là script của một đợt đã chạy nên để nguyên.)
        if not any(vals.get(c) for c in cols if c in 'FGHIJKLMNOPQ'):
            vals.pop('T', None)
        chat.setdefault(key_noi_dung(tc, rn), []).append(vals)
        long_.setdefault(norm(tc.c(rn, 'B')), []).append(vals)
    return chat, long_


def khop_marks(tc_moi, chat, long_):
    """Gán kết quả cũ vào khung MỚI. -> ({số dòng: {cột: giá trị}}, thống kê).

    Hai vòng: chặt (B+C) trước, lỏng (B) sau. Dòng không khớp được để TRỐNG — luật
    "mơ hồ thì để trống, đừng đoán". Trả kèm số case cũ KHÔNG còn chỗ trong khung mới.
    """
    dung, dung_l, rows, cho = {}, {}, {}, []
    for rn in tc_moi.order:
        if rn < 12 or not tc_moi.c(rn, 'C'):
            continue
        k = key_noi_dung(tc_moi, rn)
        lst, i = chat.get(k), dung.get(k, 0)
        if lst and i < len(lst):
            dung[k] = i + 1
            b = norm(tc_moi.c(rn, 'B'))
            dung_l[b] = dung_l.get(b, 0) + 1
            if lst[i]:
                rows[rn] = lst[i]
        else:
            cho.append(rn)
    n_chat = len(rows)
    for rn in cho:
        b = norm(tc_moi.c(rn, 'B'))
        lst, i = long_.get(b), dung_l.get(b, 0)
        if lst and i < len(lst) and lst[i]:
            dung_l[b] = i + 1
            rows[rn] = lst[i]
    con_lai = [vals for k, v in chat.items() for vals in v[dung.get(k, 0):] if vals.get('F')]
    return rows, dict(chat=n_chat, long=len(rows) - n_chat,
                      chua_chay=sum(1 for rn in tc_moi.order
                                    if rn >= 12 and tc_moi.c(rn, 'C') and rn not in rows),
                      khong_con=con_lai)


def ghi_o(tc, rn, col, val):
    """Ghi một ô inlineStr, GIỮ NGUYÊN style của ô cũ (mất style là vỡ viền bảng)."""
    body = tc.rows[rn]['body']
    cm = re.search(r'<c r="%s%d"[^>]*?(?:/>|>.*?</c>)' % (col, rn), body, re.S)
    st = re.search(r's="(\d+)"', cm.group(0)) if cm else None
    new = ('<c r="%s%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
           % (col, rn, st.group(1) if st else '72', tcfix.esc(val)))
    tc.rows[rn]['body'] = body.replace(cm.group(0), new) if cm else body + new


# ══════════════════════════════════════════════════════════════════════════════
# 2. RÀ ĐỊNH MỨC VALIDATE  (nguồn: luat/DINH-MUC-VALIDATE-testcase.md §3)
# ══════════════════════════════════════════════════════════════════════════════
# (nhãn loại, số case tối thiểu, [từ khoá nhận diện trong tên nhóm])
# Thứ tự QUAN TRỌNG: khớp từ trên xuống, luật hẹp đặt trước luật rộng.

# Khoá nhận diện nhóm control THẺ SỐ LIỆU (KPI). Tách thành hằng vì nay có BA nơi hỏi cùng một
# câu "nhóm này có phải thẻ KPI không": dòng `QUOTA` ngay dưới, lớp BƠM (`complete_func`) và
# lớp RÀ (`audit_func`) cho case *số liệu thống kê khớp DB*. Mỗi bên tự chép một bản dò chính
# là lỗ "bơm và rà lệch nhau" đã dính 4 lần (Breadcrumb · Thẻ số liệu · Cột nhập Excel ·
# Thẻ thống kê) — xem SKIP_KW bên dưới.
KHOA_THE_KPI = ['the so lieu', 'the thong ke', 'the kpi']

QUOTA = [
    # RÀNG BUỘC GIỮA CÁC TRƯỜNG — nhóm MỚI 2026-09-09 (chỉ thị người đặt việc: *"thiếu phần ràng
    # buộc mối quan hệ giữa các trường: ví dụ từ ngày > tới ngày"*). Định mức **4 case / một cặp**
    # (SÀN — màn có 2 cặp thì 8 case). Nhóm nằm ở khối `Validate các trường thông tin` của CN
    # chứa cặp trường đó; bơm bằng `patch_rangbuoc.py` (patch_quota KHÔNG bơm được vì nội dung
    # phụ thuộc CẶP trường, không suy được từ tên nhóm — nên cố tình KHÔNG khai ở `KINDSRC`).
    ('Ràng buộc giữa các trường', 4, ['rang buoc giua cac truong', 'rang buoc lien truong']),
    # BREADCRUMB + THẺ SỐ LIỆU — thêm 2026-09-09. Trước đó hai loại này KHÔNG có trong bảng nên
    # `patch_quota` bỏ qua (định mức 0) và `audit_validate_quota` cũng cho 0 ⇒ **nhóm rỗng vĩnh
    # viễn, phải viết tay** (đo trên màn `Chi tiết lỗi`: 24/82 case). Bộ mục rút từ chính bản
    # viết tay đã nghiệm thu của màn đó.
    # Loại OPT-IN — danh sách từ khoá RỖNG nên KHÔNG bao giờ khớp theo tên nhóm; chỉ vào được
    # bằng khoá `loai_control` của hồ sơ màn (xem `kind_of(override=…)`). Đây là cách khai §5.2
    # *"chỉ hạ 13 ⇒ 6 khi đã ground được ô chọn không có ô tìm kiếm"* mà KHÔNG phải nhét chú
    # thích vào tên nhóm (chỉ thị 09/09 đã bỏ cả 3 hậu tố).
    ('Selectbox không có ô tìm', 6, []),
    # 2026-09-10 — hai loại OPT-IN nữa, cùng cơ chế: bảng `QUOTA` tra theo TÊN NHÓM nên không
    # phân biệt được BẢN CHẤT control, mà tên nhóm thì phải giữ khuôn `<Loại control> <Nhãn UI>`.
    #   · `Ô ngày trình duyệt`      — `<input type="date">` SẴN CÓ của trình duyệt: chia 3 ngăn,
    #     chặn bằng `min`/`max`, KHÔNG có thông báo lỗi định dạng. Bộ `Datepicker` (11) viết cho
    #     hộp lịch riêng của ứng dụng ⇒ áp nhầm là 22/22 case phải viết lại tay (đo 09/10).
    #   · `Selectbox nhiều lựa chọn` — bộ `Selectbox` (13) khẳng định *"chỉ chọn được một giá
    #     trị"*, sai hẳn bản chất ô cho chọn nhiều.
    # Định mức GIỮ NGUYÊN như loại gốc (11 và 13) — đây là đổi BỘ MỤC, không đổi con số.
    ('Ô ngày trình duyệt',      11, []),
    #   · `Ô ngày có giờ`  — ô `dd/mm/yyyy hh:mm` (bộ mẫu `Thêm mới.xlsx` sheet *Ngày tháng có
    #     giờ*, 10 mục). Bộ `Datepicker` (11) nói về ngày SUÔNG: mọi bản chữ chốt `dd/mm/yyyy`
    #     và KHÔNG mục nào soi hai khoảng biên của phần giờ (`hh` 00-23 · `mm` 00-59) ⇒ áp nhầm
    #     là mất hẳn phép kiểm giờ, mà bộ rà chỉ ĐẾM nên vẫn sạch.
    #   · `Ô ngày nhiều lựa chọn` — ô lọc thời gian mở hộp lịch KÈM mục chọn nhanh (Hôm nay ·
    #     7 ngày qua · Tuần này · Tháng trước…) và điền một KHOẢNG `dd/mm/yyyy - dd/mm/yyyy`
    #     (bộ mẫu `Tìm kiếm.xlsx` sheet *Ngày tháng có nhiều lựa chọn*, 16 mục). Rơi vào bộ ô
    #     ngày ĐƠN thì 9 mục chọn nhanh — phần dễ sai nhất — không sinh case nào.
    ('Ô ngày có giờ',           10, []),
    ('Ô ngày nhiều lựa chọn',   16, []),
    ('Selectbox nhiều lựa chọn', 13, []),
    ('Breadcrumb',               5, ['breadcrumb', 'duong dan dieu huong']),
    ('Thẻ số liệu',              4, KHOA_THE_KPI),
    ('Textbox Nhập số trang',    7, ['nhap so trang']),
    ('Textbox Số bản ghi/trang',10, ['textbox so ban ghi', 'textbox so dong']),
    ('Phân trang',              14, ['phan trang']),
    # TIÊU ĐỀ CỘT SẮP XẾP — thêm 2026-09-10. Nhóm này được luật §0.10 và §0.13 GỌI TÊN đích danh
    # (*"case sắp xếp gộp thành nhóm `Tiêu đề cột sắp xếp` trong `Validate` của CN danh sách"*)
    # và PROMPT v3 §94 xếp nó vào danh sách control của CN danh sách — nhưng §3 KHÔNG có dòng
    # định mức nào, mà tên nhóm lại trúng `SKIP_KW` khoá `'cot '` ⇒ `kind_of` trả (None, 0),
    # `plan_quota_fill` `continue` LẶNG LẼ, `scan_quota_sheet` bỏ qua vì `label` rỗng.
    # Hậu quả đo được: `tach_cn_timkiem.py` (Admin-LoaiVanDe) dựng nhóm này rồi chỉ chuyển được
    # ĐÚNG MỘT case viết tay vào đó, và 13 bộ rà vẫn ra 0. Đúng lớp lỗi `Breadcrumb` /
    # `Thẻ số liệu` đã vá 09/09 — nhóm rỗng vĩnh viễn vì bảng không có dòng.
    ('Tiêu đề cột sắp xếp',      7, ['tieu de cot sap xep', 'cot sap xep', 'sap xep cot']),
    # CỘT NHẬP EXCEL — §3 cho định mức **8** (*"áp full checklist của loại control tương ứng,
    # wording paste vào file"*) nhưng bảng này chưa từng có dòng, và `SKIP_KW` khoá `'cot '`
    # lại chặn luôn ⇒ mọi nhóm `Cột <tên>` của CN Nhập excel là nhóm rỗng im lặng.
    # CỐ Ý KHÔNG khai ở `KINDSRC`: bộ mục phụ thuộc LOẠI CONTROL của cột đó (Textbox/Selectbox/
    # Datepicker…), suy từ tên nhóm là sai — cùng cách xử lý `Ràng buộc giữa các trường`.
    # Khai ở đây để `scan_quota_sheet` ĐẾM và báo `[ĐỊNH MỨC] n/8` thay vì im lặng.
    ('Cột nhập Excel',           8, ['cot nhap']),
    # Tên nhóm chuẩn = **"Selectbox Số bản ghi trên trang"** (chốt 2026-09-03, đã đổi 23 chỗ;
    # chỉ thị 2026-09-09 nhắc lại: tên nhóm KHÔNG mang chữ "dòng"). Hai khoá KINDSRC mang tên cũ
    # (`Selectbox Số dòng mỗi trang` · `Selectbox số dòng/trang`) đã BỎ.
    # Vẫn GIỮ từ khoá 'so dong moi trang' ở đây: nó để TRA nhóm trong file ĐÃ SINH, không phải tên
    # để đặt mới — bỏ đi là corpus cũ (GSTEM 187 file ở máy khác) hoá "nhóm lạ".
    ('Selectbox Số bản ghi trên trang', 5, ['so dong moi trang', 'so ban ghi tren trang',
                                            'so luong ban ghi', 'so goi moi trang']),
    ('Checkbox bản ghi (grid)',  6, ['checkbox ban ghi', 'checkbox chon']),
    # ⚠️ Vá 2026-09-09 — `Button` phải đứng TRƯỚC `Danh sách / lưới`. Tên nhóm theo khuôn
    # `<Loại control> <Nhãn UI thật>` (§0.8e) nên chữ đầu LÀ loại control, phải thắng mọi
    # khoá bắt theo chữ trong NHÃN. Trước khi vá: nhóm `Button Quay lại danh sách dữ liệu lỗi`
    # dính khoá 'danh sach' -> bị bơm nguyên bộ 8 case của bảng danh sách (căn lề cột, độ
    # rộng cột, phân trang…) cho một cái NÚT, và `audit_validate_quota` vẫn ra 0 vì nó chỉ
    # ĐẾM. Cùng lớp lỗi với ghi chú `Button Icon xóa` ở luật `Icon` bên dưới.
    # NÚT TẢI LẠI / LÀM MỚI = **6 case** (chỉ thị + ảnh người đặt việc 2026-09-09), nhóm nằm ở
    # khối **Validate** của CN danh sách. Phải đứng TRƯỚC `Button`: `Button Làm mới dữ liệu`
    # gặp luật `Button` trước thì chỉ bị đòi 1 case căn lề/chính tả, mất hẳn 5 mục hành vi
    # (giữ bộ lọc · giữ trang · hiệu ứng chờ · mất mạng) — và không phép rà nào kêu vì
    # `audit_validate_quota` chỉ ĐẾM theo loại đã tra được.
    ('Tải lại',                 6, ['tai lai', 'lam moi']),
    # ⚠️ `Nút chọn (segmented)` CHUYỂN LÊN TRƯỚC `Button` (vá 2026-09-10) — cùng lý do đã ghi cho
    # `Tải lại`: dưới đây `Button` nhận thêm khoá `'nut xoa loc'`/`'nut bo loc'`, và bản cũ để
    # `Nút chọn` NẰM SAU `Icon` nên chỉ cần một khoá `nut …` rộng hơn ở `Button` là nhóm chip/
    # radio bị hạ từ 3 case xuống 1 case căn lề — mà `audit_validate_quota` chỉ ĐẾM nên không kêu.
    # Thêm khoá `chip` · `radio`: luật §3 đặt tên loại này là **`Nút chọn (segmented / chip)`**
    # và §0.13 xếp `Chip lọc …` vào control thanh lọc, nhưng trước bản này KHÔNG khoá nào bắt
    # hai chữ đó ⇒ `Chip lọc Trạng thái` / `Radio Loại hình` ra định mức 0, nhóm rỗng im lặng.
    ('Nút chọn (segmented)',     3, ['nut chon', 'chip loc', 'chip ', 'radio']),
    # `Nút Xóa lọc` là tên nhóm luật §0.13 GỌI ĐÍCH DANH trong bảng control thanh lọc, nhưng
    # khoá cũ chỉ có `'button '` (tiếng Anh) và `'nut xac nhan'` ⇒ định mức 0, nhóm rỗng im lặng.
    # Khoá để HẸP (đúng hai tên nhóm của luật), KHÔNG dùng `'nut '` rộng: `Icon` nằm SAU `Button`
    # và mang khoá `'nut thao tac'`, nên một khoá `'nut '` rộng sẽ hạ `Nút thao tác trên dòng`
    # từ 10 case xuống 1 — đúng lớp lỗi `Button Icon xóa` đã ghi ở luật `Icon` bên dưới.
    ('Button',                   1, ['button ', 'nut xac nhan', 'nut xoa loc', 'nut bo loc']),
    ('Danh sách / lưới',         8, ['danh sach', 'luoi the', 'bang danh sach', 'grid']),
    ('Tải file mẫu',             2, ['tai file mau']),
    # định mức GIỮ 13 theo luật §5.4; bộ case nguồn là EXCEL_IMPORT_FULL (18 mục) để 13 mục
    # CỦA MẪU có mặt đủ — bẫy "đủ số nhưng sai bộ", rà bằng audit_import.py (rà theo MỤC).
    # 18 = trọn bank `EXCEL_IMPORT_FULL`. Để 13 thì `plan_quota_fill` cắt 5 mục CUỐI
    # (thiếu cột bắt buộc · trùng mã trong cùng tệp · vượt giới hạn số dòng · ô vượt độ
    # dài · nút nạp khi không có dòng hợp lệ) — mất im lặng, xem phép ㉖.
    ('File Excel',              18, ['file excel', 'file nhap']),
    ('Hiển thị chi tiết',        4, ['thong tin chi tiet', 'hien thi chi tiet']),
    ('Hộp xác nhận',             3, ['hop xac nhan', 'hop thoai']),
    # Đổi tên nhóm `Icon thao tác trên dòng` -> **`Icon`** (chỉ thị người đặt việc 2026-09-09:
    # tên nhóm bỏ chữ "dòng"). Giữ NGUYÊN từ khoá cũ để bộ case đã sinh (`QuanTri/ChucVu` ·
    # `TrinhDoDaoTao` · corpus GSTEM ở máy khác) vẫn tra ra đúng loại — chỉ THÊM khoá `icon`
    # cho tên ngắn mới.
    # ⚠️ Phải đặt SAU `Button`: khoá `icon` là chuỗi con quá rộng, nhóm tên `Button Icon xóa`
    # gặp luật này trước thì bị đòi 10 case thay vì 1.
    ('Icon',                    10, ['icon thao tac', 'nut thao tac', 'icon (', 'icon']),
    # (`Nút chọn (segmented)` đã CHUYỂN LÊN trước `Button` — xem ghi chú ở đó)
    # `switch` / `toggle` / `công tắc` KHỚP VÀO ĐÂY (vá 2026-09-12) — trước đó bảng KHÔNG có
    # khoá nào bắt chúng, nên nhóm `Switch Trạng thái` ra định mức 0 và nằm RỖNG VĨNH VIỄN trừ
    # khi hồ sơ màn khai `loai_control`. Đúng lớp lỗi `Breadcrumb`/`Thẻ số liệu` đã vá 09/09.
    # Đo 2026-09-12 trên đường sinh MỚI (dự án trắng, màn có `Switch Trạng thái`): quên khai
    # `loai_control` thì bơm VÀ rà đều im, chỉ ô thứ 7 của `audit_validate_quota` kêu — người
    # sinh bộ case cho web mới không có cách nào biết trước. Nhãn loại vẫn là `Checkbox` đúng
    # như 3 hồ sơ màn đã khai tay (`"Switch Đang hoạt động": "Checkbox"`), nên định mức và bộ
    # case không đổi; `loai_control` vẫn ĐÈ được khi công tắc đó thật sự khác bản chất.
    ('Checkbox',                 5, ['checkbox', 'switch ', 'toggle ', 'cong tac ']),
    ('Upload ảnh',               9, ['upload anh', 'anh dai dien', 'tai anh', 'hinh anh']),
    ('Upload file',              9, ['upload file', 'tai lieu dinh kem', 'tep dinh kem']),
    ('Datepicker',              11, ['ngay sinh', 'datepicker', 'chon ngay']),
    ('Email',                   11, ['email']),
    ('Số điện thoại',            8, ['so dien thoai']),
    ('Combobox (searchable)',   13, ['combobox']),
    # = Textbox chữ (9) + `nhập nhiều dòng` (chỉ thị 2026-09-12). Phải khớp
    # `len(quota_cases.TEXTAREA)`, lệch là `patch_quota` cắt mất mục cuối.
    ('Textarea',                10, ['textarea']),
    ('Textbox tìm kiếm',         9, ['tim kiem', 'tim ten', 'tim theo', 'textbox tim', 'o tim']),
    ('Textbox số',              11, ['don gia', 'gia tham khao', 'phi ', 'so luong', 'so ngay',
                                     'thu tu hien thi', 'so tien', 'so trang']),
    # 2026-09-07 (chỉ thị + ảnh 1): selectbox của mẫu LÀ ô có tìm kiếm ⇒ 13 mục
    # (6 native + tải dữ liệu khi lớn + 6 mục tìm kiếm). Trước đây để 6 nên mọi selectbox
    # đều thiếu 7 mục, bộ rà vẫn báo sạch.
    ('Selectbox',               13, ['selectbox', 'select ', 'dropdown']),
    # 2026-09-07 (chỉ thị + ảnh 3): ô Mã (Mã môn học · Mã định danh…) là trường DUY NHẤT
    # ⇒ 10 mục = Textbox chữ (9) + 'Kiểm tra dữ liệu đã tồn tại'. Phải đặt TRƯỚC 'Textbox chữ'.
    ('Textbox mã (unique)',     10, ['textbox ma ', 'textbox ma\u0301', 'o ma ', 'cot ma ']),
    ('Textbox chữ',              9, ['textbox']),
]

# ĐỊNH MỨC CŨ (--legacy) — có hiệu lực trước 2026-09-03, giữ CHỈ để đối chiếu tồn đọng
# (huong-dan/DOI-CHIEU-MAU-vs-LUAT.md §6). KHÔNG dùng để nghiệm thu file mới.
QUOTA_LEGACY = [
    ('Phân trang',            12, ['phan trang']),
    ('Selectbox Số bản ghi trên trang', 4, ['so dong moi trang', 'so ban ghi tren trang',
                                            'so luong ban ghi', 'so goi moi trang']),
    ('Danh sách / lưới',       8, ['danh sach', 'luoi the', 'bang danh sach', 'grid']),
    ('Icon',                    5, ['icon thao tac', 'nut thao tac', 'icon (', 'icon']),
    ('Tải file mẫu',           2, ['tai file mau']),
    ('File Excel',            12, ['file excel', 'file nhap']),
    ('Hiển thị chi tiết',      4, ['thong tin chi tiet', 'hien thi chi tiet']),
    ('Hộp xác nhận',           3, ['hop xac nhan', 'hop thoai']),
    ('Button',                 1, ['button ', 'nut xac nhan']),
    ('Nút chọn (segmented)',   3, ['nut chon']),
    ('Checkbox',               5, ['checkbox']),
    ('Upload ảnh',             9, ['upload anh', 'anh dai dien', 'tai anh', 'hinh anh']),
    ('Upload file',            9, ['upload file', 'tai lieu dinh kem', 'tep dinh kem']),
    ('Datepicker',            11, ['ngay sinh', 'datepicker', 'chon ngay']),
    ('Email',                 11, ['email']),
    ('Số điện thoại',          8, ['so dien thoai']),
    ('Combobox (searchable)', 10, ['combobox']),
    ('Textarea',               8, ['textarea']),
    ('Textbox tìm kiếm',       5, ['tim kiem', 'tim ten', 'tim theo', 'textbox tim', 'o tim']),
    ('Textbox số',             9, ['don gia', 'gia tham khao', 'phi ', 'so luong', 'so ngay',
                                   'thu tu hien thi', 'so tien', 'so trang']),
    ('Selectbox',              6, ['selectbox', 'select ', 'dropdown']),
    ('Textbox chữ',            9, ['textbox']),
]

# Nhóm CỐ Ý miễn định mức (mẫu cũng không làm đủ / không áp dụng)
# 'nap san du lieu' ĐÃ GỠ 2026-09-07: nhóm đó nay là NHÓM CẤM (`is_banned_group`), không còn
# được miễn định mức — không thể vừa cấm vừa miễn.
#
# ⚠️ ĐÂY LÀ DANH SÁCH MIỄN TRỪ, KHÔNG PHẢI CHỖ CHỨA KHOÁ RỘNG. `kind_of()` xét `SKIP_KW`
# **TRƯỚC** vòng tra `QUOTA`, nên một khoá rộng ở đây SHADOW luôn dòng định mức thật và biến
# nhóm thành rỗng vĩnh viễn mà không phép rà nào kêu. Hai ca đã xảy ra, gỡ 2026-09-10:
#   · `'cot '`        — nhắm vào `Cột Hành động` nhưng trúng cả `Tiêu đề cột sắp xếp` (luật
#                       §0.10/§0.13 gọi đích danh) và `Cột nhập <tên>` (§3 định mức 8).
#                       Nay thu hẹp thành `'cot hanh dong'`; hai nhóm kia đã có dòng ở `QUOTA`.
#   · `'the thong ke'` — chính là MỘT TRONG BA khoá của dòng `('Thẻ số liệu', 4, …)` thêm ngày
#                       09/09 ⇒ khoá đó CHẾT từ lúc sinh ra: nhóm tên `Thẻ thống kê …` bị miễn
#                       định mức thay vì nhận 4 case. Gỡ khỏi đây để dòng QUOTA sống lại.
# Thêm khoá mới vào đây thì phải tự hỏi: nhóm này CÓ dòng ở `QUOTA` không? Có thì đừng thêm.
SKIP_KW = ['tu suy ra', 'chi doc', 'ma dinh danh',
           'checklist', 'tab ', 'cot hanh dong', 'thanh dieu huong', 'dau trang',
           'tep xuat ra']

# "Giao diện chung" = ĐÚNG 6 case ở mọi CN (chốt 2026-08-04) — trừ CN XUẤT = 2 case (2026-09-04).
GDC_BASE = [
    'hien thi day du cac thong tin trong man hinh chuc nang',
    'tong the giao dien man hinh',
    'khi thuc hien tab', 'khi thuc hien shift tab',
    'khi thuc hien zoom in', 'khi thuc hien zoom out',
]

# Phân trang CHỈ nằm trong khối Validate (chốt 2026-08-06).
PAGING_KW = ['phan trang', 'sang trang', 've trang', 'trang sau', 'trang truoc', 'chuyen trang',
             'so ban ghi moi trang', 'so dong moi trang', 'trang dau', 'trang cuoi',
             'trang 1', 'trang 2', 'reset trang']
# cụm gây nhiễu: "chuyển TRẠNG thái", "tải lại TRANG", "TRANG chủ", "TRANG thiết bị"
PAGING_BLACK = ['trang thai', 'tai lai trang', 'trang chu', 'trang thiet bi']


def is_banned_group(txt):
    """Nhóm TRỪU TƯỢNG do đợt chuẩn hoá GĐ1 tự sinh — không có trong mẫu, CẤM dùng (2026-08-06)."""
    n = norm(txt)
    if 'tai khoan' in n or 'tai lieu' in n:                 # "Trạng thái tài khoản" là control thật
        return False
    if 'trang thai tai' in n and ('rong' in n or 'loi' in n):
        return True                                          # Trạng thái tải & rỗng / lỗi
    if 'bo cuc' in n and 'tieu de man' in n:
        return True                                          # Bố cục & tiêu đề màn
    if 'hien thi thanh phan tren man' in n:
        return True                                          # Hiển thị thành phần trên màn
    if 'thao tac mo' in n and 'dong' in n:
        return True                                          # Thao tác mở & đóng
    if 'dau trang' in n and ('trang thai tai' in n or 'chi tiet' in n):
        return True                                          # Đầu trang & trạng thái tải chi tiết
    if 'tep xuat ra' in n or 'file xuat ra' in n:
        return True                                          # Tệp xuất ra (CN Xuất miễn Validate)
    if n.startswith(('chuc nang tai lai', 'chuc nang lam moi', 'chuc nang tai du lieu')):
        return True     # Tải lại là CONTROL, không phải thao tác nghiệp vụ: khai ở khối Validate
                        # thành nhóm `Tải lại` (6 case, §5.1). Chỉ thị người đặt việc 2026-09-09:
                        # "bỏ chức năng tải lại ở phần Chức năng của CN Danh sách".
    if n.startswith(('nap san', 'prefill')):
        return True     # Nạp sẵn dữ liệu / Prefill — §5.6 BỎ HẲN từ 2026-09-07: CN Sửa lặp full
                        # khối Validate nên nội dung nhóm này đã nằm ở case "giá trị mặc định".
                        # Gỡ bằng `go_napsan.py`.
    return False


def is_paging(txt):
    n = norm(txt)
    for b in PAGING_BLACK:
        n = n.replace(b, '~')
    return any(k in n for k in PAGING_KW)


def bad_cn_name(txt):
    """Phân trang / sắp xếp cột KHÔNG được nâng thành CN riêng (chốt 2026-08-08).
    Lưu ý: "sắp xếp thứ tự chương / bài" là chức năng GHI dữ liệu thật → không dính luật này."""
    n = norm(txt)
    if 'phan trang' in n:
        return 'tên CN có "phân trang"'
    if 'sap xep' in n and ('danh sach' in n or 'theo cot' in n or 'cac cot' in n):
        return 'tên CN có "sắp xếp danh sách/cột"'
    return None


def kind_of(name, quota=None, override=None, cn=None):
    """(nhãn loại control, định mức). `override` = {norm(tên nhóm): nhãn loại} từ hồ sơ màn.

    Vì sao có `override` (2026-09-09): bảng `QUOTA` tra theo TÊN NHÓM nên có hai dữ kiện nó
    KHÔNG diễn tả được, và trước bản này phải viết tay:
      · ô nhập chữ có ràng buộc TRÙNG mà **không phải ô `Mã`** (`Textbox Tên …` của họ danh mục
        MOET) — luật §3 cho 10 mục nhưng khoá tra chỉ nhận `textbox ma `;
      · ô chọn **không có ô tìm kiếm** — §5.2 cho hạ 13 ⇒ 6 *"khi đã ground được"*.
    Chỗ ĐÚNG để khai là **hồ sơ màn** (§5.2: *"ghi rõ bằng chứng ở hồ sơ màn"*), KHÔNG phải hậu
    tố trong tên nhóm — chỉ thị 09/09 đã bỏ cả 3 hậu tố `(cố định)`/`(unique)`/`(chuyển trạng
    thái)` vì tên nhóm phải giữ khuôn `<Loại control> <Nhãn UI>`.
    Bơm (`plan_quota_fill`) và rà (`scan_quota_sheet`) đọc CÙNG override nên không lệch nhau.

    KHOÁ CÓ PHẠM VI CN (vá 2026-09-10) — một màn có thể có HAI control TRÙNG TÊN NHÓM mà khác
    hẳn bản chất: `Selectbox Trạng thái` ở thanh lọc là ô chọn NHIỀU giá trị, còn `Selectbox
    Trạng thái` trong biểu mẫu Thêm/Sửa là ô chọn MỘT giá trị không có hộp tìm. Khoá phẳng
    `{tên nhóm: nhãn loại}` không tách được hai chỗ đó ⇒ khai kiểu gì cũng sai một nửa (lỗ đã
    ghi nhận 2026-09-10). Nay khoá nhận thêm dạng **`"<TÊN CN>|<Tên nhóm>"`**; tra theo thứ tự
    khoá-có-CN trước, rồi mới tới khoá phẳng (khoá phẳng vẫn là mặc định cho MỌI CN).
    """
    n = norm(name)
    if override:
        lab = override.get('%s|%s' % (norm(cn), n)) if cn else None
        lab = lab or override.get(n)
        if lab:
            for label, q, _kws in (quota or QUOTA):
                if label == lab:
                    return label, q
            print('!! hồ sơ màn khai loại control "%s" cho nhóm "%s" — KHÔNG có trong bảng QUOTA, '
                  'bỏ qua override' % (lab, name))
    if any(k in n for k in SKIP_KW):
        return None, 0
    for label, q, kws in (quota or QUOTA):
        if any(k in n for k in kws):
            return label, q
    return None, 0


# ── CỤM PHÂN TRANG PHẢI ĐỦ CONTROL  (chỉ thị + 2 ảnh người đặt việc 2026-09-10) ─────────────
# Ảnh gửi kèm là ĐÚNG hai dòng nhóm `Textbox Số bản ghi trên trang` và `Textbox Nhập số trang`.
# Cụm phân trang của app là MỘT khối gồm nhiều control rời, mỗi control là một nhóm `sub2` riêng
# (luật §0.2). Nhưng không phép rà nào soi cụm đó theo CỤM, chỉ soi từng nhóm ĐÃ CÓ:
#   · `audit_validate_quota` — đếm case của nhóm đã tồn tại; nhóm THIẾU HẲN thì nó im (§1 luật);
#   · `audit_extra` phép ③   — chỉ bắt nhóm rỗng ĐÚNG 0 case, không biết nhóm nào lẽ ra phải có;
#   · `probe_live`           — ĐỌC ĐƯỢC cả 3 dữ kiện (`so_ban_ghi_trang` · `o_nhap_trang` ·
#                              `muc_chon_nhanh`) rồi chỉ IN RA, không đối chiếu với hồ sơ màn.
# Đo 2026-09-10 trên bộ `ChuyenVien` (5 file, 13/13 bộ rà 0): CN `XEM MA TRẬN MÂU THUẪN` có nhóm
# `Phân trang` 14 case mà KHÔNG có nhóm số-bản-ghi-trên-trang nào ⇒ thiếu 10–15 case, không ai kêu.
#
# Luật: CN nào có nhóm `Phân trang` trong `Validate` thì cụm đó phải khai đủ control.
NHOM_PERPAGE = ('Selectbox Số bản ghi trên trang', 'Textbox Số bản ghi/trang')
NHOM_PAGE_INPUT = 'Textbox Nhập số trang'
# Hai control của cụm KHÔNG suy được từ file: `Textbox Nhập số trang` phụ thuộc prop `pageInput`
# và cụm số-bản-ghi/trang có màn ẩn hẳn (đo 09/10: hộp thoại ma trận của `Cảnh báo Mâu thuẫn`
# phân trang 10 dòng/trang và **ẩn phần chọn số bản ghi/trang**). Nên luật ở đây KHÔNG đòi
# "phải có nhóm" mà đòi **QUYẾT ĐỊNH PHẢI ĐƯỢC GHI RA**: hoặc có nhóm, hoặc hồ sơ màn ghi rõ là
# màn không có control đó. Cùng lối `noi_dat` của màn phụ (chỉ thị 09/09) — bắt tool NÓI RA thay
# vì lặng lẽ bỏ, vì im lặng thì không phân biệt được "màn không có" với "quên khai".
# Chữ trên nút cho biết đó là HÀNH ĐỘNG, không phải ô nhập liệu. Dời từ `probe_live`
# sang đây 2026-09-14: `soi_luat_cung_live()` (luật cứng ①) và `loai_tu_the()` (xếp loại
# control khi soi màn) cùng phải biết danh sách này — để hai bản sao ở hai chỗ thì sửa một
# bên là lệch luật, đúng lớp lỗi `fix_bank_doi_chu` đã phải dọn.
NUT_HANH_DONG = ('tim kiem', 'tim', 'xoa loc', 'xoa bo loc', 'dat lai', 'lam moi', 'tai lai',
                 'them moi', 'luu', 'cap nhat', 'huy', 'huy bo', 'dong', 'xoa', 'sua',
                 'chinh sua', 'xuat excel', 'nhap excel', 'tai ve', 'tai len', 'tai file mau',
                 'in', 'gui', 'duyet', 'tu choi', 'xac nhan', 'quay lai', 'tro ve', 'dong y',
                 'ap dung', 'chon file', 'them', 'luu lai', 'tiep tuc', 'mo rong', 'thu gon')
# Nút NẠP LẠI danh sách. Nhiều tên gọi, và trên app thật thường CHỈ CÓ ICON (⟳) nên tên nằm ở
# `aria-label`/`title` chứ không ở `innerText` — xem `probe_live._JS_VUNG_DAU`.
KW_TAI_LAI = ('tai lai', 'lam moi', 'nap lai', 'refresh', 'reload')


def la_nut_hanh_dong(nhan):
    """Chữ trên nút có phải MỘT HÀNH ĐỘNG không (khớp nguyên cụm, không khớp chuỗi con).

    Khớp chuỗi con là sai: nhãn ô lọc `Trạng thái xử lý` chứa `xu ly`… và nhất là `in` nằm
    trong hầu hết mọi từ tiếng Việt không dấu.
    """
    n = norm(nhan or '')
    return any(n == k or n.startswith(k + ' ') or n.endswith(' ' + k) for k in NUT_HANH_DONG)


def la_nut_tai_lai(nhan):
    """Nhãn này là nút nạp lại danh sách?"""
    n = norm(nhan or '')
    return any(n == k or n.startswith(k + ' ') or n.endswith(' ' + k) for k in KW_TAI_LAI)


def la_o_chon_aria(x):
    """Phần tử DOM (dict `probe_live` đọc về) có mang dấu hiệu CHUẨN của ô chọn dựng tay?

    Dời từ `probe_live._la_o_chon` sang đây 2026-09-14 cùng lý do với `NUT_HANH_DONG`: luật
    cứng ① và phép xếp loại control phải dùng CHUNG một định nghĩa "cái này là ô chọn".
    """
    if not isinstance(x, dict):
        return False
    if (x.get('vai') or '') in ('combobox', 'listbox'):
        return True
    if (x.get('popup') or '') in ('listbox', 'menu', 'tree', 'grid', 'true'):
        return True
    if x.get('co_listbox'):
        return True
    # `aria-expanded` một mình chưa đủ (nút Mở rộng/Thu gọn cũng có) — phải kèm chỗ nó điều khiển
    return bool(x.get('mo')) and (x.get('vai_dieu_khien') or '') in ('listbox', 'menu', 'dialog')


def la_nut_hanh_dong_live(x):
    """Phần tử này là NÚT HÀNH ĐỘNG trên màn thật (nên luật cứng ① không áp cho nó)?

    Ba lưới, theo đúng thứ tự chắc chắn giảm dần — thiếu lưới nào cũng ra một lớp lỗi đã đo:
      ① phải là `<button>`: `<select>` không bao giờ là nút, mà nhãn ô chọn thì hay kết thúc
         bằng chính các từ trong `NUT_HANH_DONG` (`Trạng thái hoạt động` -> `… dong`) ⇒ áp cho
         `<select>` là BỎ SÓT vi phạm trong im lặng;
      ② ARIA THẮNG: nút mang dấu hiệu ô chọn thì nó là ô chọn, dù chữ trên nút là gì — combobox
         đang hiện giá trị `Đang hoạt động` chính là thứ luật ① sinh ra để bắt;
      ③ rồi mới tới chữ trên nút.
    """
    if not isinstance(x, dict) or not (x.get('the') or '').startswith('button'):
        return False
    if la_o_chon_aria(x):
        return False
    return la_nut_hanh_dong(x.get('nhan') or '')


KW_PAGE_INPUT = ('nhap so trang', 'pageinput', 'page input')
KW_PERPAGE = ('so ban ghi/trang', 'so ban ghi tren trang', 'so ban ghi moi trang',
              'so dong moi trang', 'so dong/trang')
# Chỉ tính là "đã ghi là KHÔNG CÓ" khi câu đó mang TỪ PHỦ ĐỊNH. Thiếu phép này thì một câu
# KHẲNG ĐỊNH control có tồn tại cũng làm phép rà im: hồ sơ `Cảnh báo Mâu thuẫn` có đúng cả hai
# kiểu câu về cùng một control — `rui_ro` ghi *"Số bản ghi/trang mặc định 20 của màn này KHÁC
# màn danh sách (10)"* (⇒ CÓ) và `hanh_vi_dac_thu` ghi *"ẩn phần chọn số bản ghi/trang"* (⇒ KHÔNG).
KW_PHU_DINH = ('khong co', 'khong hien', 'khong truyen', 'khong dung', 'an phan', 'an han',
               'an cum', 'an o', 'bo han', 'mac dinh false', 'da an', 'khong render')


def _van_ban_ho_so(spec):
    """[mọi chuỗi tự do trong hồ sơ màn] — để soi câu ghi nhận grounding ở BẤT KỲ nhánh nào.

    Cố ý KHÔNG bó vào riêng `khong_co`: dữ kiện "màn không có control này" được người khai ghi
    ở nhánh nào thuận tay nhất — đo trên `CanhBaoMauThuan`, câu về cụm số-bản-ghi/trang nằm ở
    `hanh_vi_dac_thu`, còn câu về ô Nhập số trang thì ở `khong_co`. Bó vào một khoá là báo oan.
    """
    ra = []

    def walk(o):
        if isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
        elif isinstance(o, str):
            ra.append(o)

    walk(spec or {})
    return ra


def da_ghi_khong_co(spec, kws):
    """True nếu hồ sơ màn có câu ghi rõ màn KHÔNG CÓ control ứng với `kws`.

    Xét theo TỪNG CÂU: câu phải nhắc tới control **và** mang từ phủ định. Độ mịn là CẢ FILE
    (hồ sơ màn không khai `khong_co` theo từng CN), nên một CN ghi nhận thì các CN khác cùng file
    cũng được miễn. Chấp nhận đánh đổi đó: phép rà này chỉ dập một lời cảnh báo, còn thứ nó thay
    thế là IM LẶNG HOÀN TOÀN như trước 09/10.
    """
    for s in _van_ban_ho_so(spec):
        n = norm(s)
        if any(k in n for k in kws) and any(p in n for p in KW_PHU_DINH):
            return True
    return False


def soi_cum_phan_trang(tc, spec=None, quota=None):
    """[(tên CN, nhóm còn thiếu, lý do)] — cụm `Phân trang` của CN nào chưa khai đủ control.

    Thuần đọc. `spec` = hồ sơ màn (dùng để miễn control mà hồ sơ đã ghi rõ là màn không có).
    """
    ovr = doc_override(getattr(tc, 'path', None))
    theo_cn, thu_tu = {}, []
    for _rn, gname, _cases, cn_ten in scan_control_groups(tc):
        label, _q = kind_of(gname, quota, ovr, cn_ten)
        if cn_ten not in theo_cn:
            thu_tu.append(cn_ten)
        theo_cn.setdefault(cn_ten, set()).add(label or gname)
    ghi_perpage = da_ghi_khong_co(spec, KW_PERPAGE)
    ghi_page_input = da_ghi_khong_co(spec, KW_PAGE_INPUT)
    ra = []
    for cn_ten in thu_tu:
        nhan = theo_cn[cn_ten]
        if 'Phân trang' not in nhan:
            continue
        if not any(x in nhan for x in NHOM_PERPAGE) and not ghi_perpage:
            ra.append((cn_ten, 'Selectbox/Textbox Số bản ghi trên trang',
                       'CN có nhóm `Phân trang` mà KHÔNG có control nào đặt số bản ghi/trang '
                       '(định mức 5 hoặc 10 case), hồ sơ màn cũng chưa ghi là màn ẩn cụm đó'))
        if NHOM_PAGE_INPUT not in nhan and not ghi_page_input:
            ra.append((cn_ten, NHOM_PAGE_INPUT,
                       'chưa có nhóm và hồ sơ màn cũng CHƯA GHI là màn không có ô này — '
                       'thêm nhóm (7 case) hoặc ghi vào `grounding.khong_co` kèm bằng chứng'))
    return ra


def doc_giu_nut_tao(path):
    """{"<TÊN CN>|<tên nhóm>"} — các nhóm `Button Thêm/Tạo …` được PHÉP ở lại một CN Sửa.

    Vì sao có (2026-09-10): §5.6 điểm 1 bắt bỏ mọi nhóm `Button Thêm …` khỏi CN Sửa, để chặn
    lỗi "chép nút mở biểu mẫu Thêm mới sang CN Sửa". Nhưng có màn mà nút đó là control THẬT
    của chính biểu mẫu Sửa: wizard `Chỉnh sửa báo cáo` của màn Báo cáo động có `+ Thêm biểu đồ`
    (BA BR-BCD-16-5: mỗi báo cáo 1..6 biểu đồ, thêm/xoá ngay trong wizard sửa) và
    `+ Tạo bộ dữ liệu mới` ở bước 2. Đòi bỏ hai nhóm đó là buộc bộ case BỎ control có thật.

    Chỗ khai là **hồ sơ màn** (cùng lối `loai_control` / `khong_co`) để miễn trừ đi kèm bằng
    chứng, KHÔNG nới lỏng luật cho mọi màn. Cả bộ rà (`audit_sua`) và bộ vá (`fix_cn_sua`) đọc
    CÙNG hàm này nên không bao giờ lệch luật.

        "giu_nut_tao": {
          "CHỈNH SỬA BIỂU ĐỒ BÁO CÁO|Button Thêm biểu đồ": "<lý do + căn cứ>"
        }
    """
    import json
    d = os.path.dirname(os.path.abspath(path or ''))
    p = os.path.join(os.path.dirname(d), 'ho-so-man',
                     os.path.basename(path or '').replace('.xlsx', '.json'))
    if not os.path.exists(p):
        return set()
    try:
        spec = json.load(open(p, encoding='utf-8'))
    except Exception:
        return set()
    ra = set()
    for k in (spec.get('giu_nut_tao') or {}):
        ra.add('|'.join(norm(x) for x in str(k).split('|')))
    return ra


def mien_dinh_muc(name):
    """True nếu nhóm CỐ Ý được miễn định mức (`SKIP_KW`) — khác hẳn "chưa có luật nào".

    `kind_of()` trả `(None, 0)` cho CẢ HAI ca, nên trước bản này không ai phân biệt được:
      · miễn trừ có chủ đích (`Cột Hành động`, `Trình N bước — thanh điều hướng`) — đúng, để yên;
      · KHÔNG có dòng nào trong `QUOTA` khớp tên nhóm — nhóm rỗng vĩnh viễn, phải kêu.
    Có hàm này thì `scan_quota_sheet` mới đếm riêng ca thứ hai (xem `SheetQuota.unknown`).
    """
    return any(k in norm(name) for k in SKIP_KW)


def doc_override(path):
    """{norm(tên nhóm): nhãn loại} đọc từ khoá `loai_control` của hồ sơ màn cạnh bộ case.

    Chuẩn chỗ đặt: `<Role>/ho-so-man/<tên trùng .xlsx>.json` (chốt 2026-09-09) — nên không cần
    tham số `--spec`: mọi script đọc cùng một chỗ.
    """
    import json
    d = os.path.dirname(os.path.abspath(path or ''))
    p = os.path.join(os.path.dirname(d), 'ho-so-man',
                     os.path.basename(path or '').replace('.xlsx', '.json'))
    if not os.path.exists(p):
        return {}
    try:
        spec = json.load(open(p, encoding='utf-8'))
    except Exception as e:
        print('!! hồ sơ màn %s đọc không được (%s) — bỏ qua override định mức'
              % (os.path.basename(p), type(e).__name__))
        return {}
    def _key(k):
        # khoá phạm vi CN: "<TÊN CN>|<Tên nhóm>" — norm từng vế, giữ dấu | làm ranh giới
        return '|'.join(norm(x) for x in k.split('|', 1)) if '|' in k else norm(k)

    return {_key(k): v for k, v in (spec.get('loai_control') or {}).items()}


def is_export_cn(cn):
    """CN dạng Xuất Excel: miễn khối Validate, `Giao diện chung` chỉ 2 case."""
    n = norm(cn)
    return 'xuat' in n and not any(k in n for k in ('xuat ban', 'xuat xu'))


@dataclass
class SheetQuota:
    """Kết quả rà một sheet. Rỗng hết = sheet đạt chuẩn."""
    thin: list = field(default_factory=list)        # (cn, tên nhóm, nhãn loại, đang có, định mức)
    nostruct: list = field(default_factory=list)    # (cn, [khối còn thiếu])
    gdc: list = field(default_factory=list)         # (cn, mô tả lỗi Giao diện chung)
    paging: list = field(default_factory=list)      # (cn, mô tả phân trang sai khối)
    banned: list = field(default_factory=list)      # (cn, tên nhóm trừu tượng)
    cn_name: list = field(default_factory=list)     # (cn, lý do tên CN sai)
    # ── Ô THỨ 7 (thêm 2026-09-10) — nhóm control mà `kind_of` KHÔNG tra được loại.
    # Đây là điểm mù NẶNG NHẤT của bộ rà định mức, và là đúng lớp lỗi §1 của luật đã cảnh báo
    # (*"nhóm control chưa hề tồn tại thì nó không báo gì cả"*), chỉ dịch sang một bậc: nhóm
    # TỒN TẠI nhưng KHÔNG có dòng định mức nào khớp tên ⇒ định mức = 0 ⇒
    #   · `plan_quota_fill`  : `if not label … continue`   → KHÔNG bơm, không nói gì;
    #   · `scan_quota_sheet` : `if label and cnt < q`      → KHÔNG đếm, không nói gì.
    # Nhóm nằm đó với 0–2 case và cả 13 bộ rà ra 0. `audit_extra` phép ③ [RỖNG] chỉ đỡ được ca
    # ĐÚNG 0 case; nhóm có 1 case viết tay thì không phép nào thấy (đã đo: `Tiêu đề cột sắp xếp`
    # của `Admin-LoaiVanDe` — 1 case, mọi bộ rà 0).
    # Đếm ở đây thì mọi loại control CHƯA có luật đều lộ ra ngay ở lần nghiệm thu đầu, thay vì
    # phải chờ ai đó tình cờ mở file và đếm tay như 4 lần đã xảy ra (Breadcrumb · Thẻ số liệu ·
    # Tiêu đề cột sắp xếp · Cột nhập Excel).
    unknown: list = field(default_factory=list)     # (cn, tên nhóm, số case đang có)

    def __bool__(self):
        return bool(self.thin or self.nostruct or self.gdc
                    or self.paging or self.banned or self.cn_name or self.unknown)


def scan_quota_sheet(tc, quota=None):
    """Rà một sheet TC đã load. Thuần tính toán — không in, không ghi file."""
    r = SheetQuota()
    ovr = doc_override(getattr(tc, 'path', None))   # cùng override với bộ bơm
    cn_paging = set()          # CN đã có nhóm Phân trang trong Validate (= CN danh sách)
    cn = None
    cn_has = {}                # CN -> set khối đã thấy
    grp = None                 # nhóm cấp 1 (Giao diện / Chức năng / ATTT)
    insub = None               # (tên nhóm control, số case) đang đếm
    in_validate = False
    in_gdc = False
    gdc_n = {}                 # CN -> số case của nhóm Giao diện chung
    gdc_bad = []               # (CN, tiêu đề case lạc chỗ)

    def close_sub():
        nonlocal insub
        if not insub:
            return
        name, cnt = insub
        label, q = kind_of(name, quota, ovr, cn)
        if label and cnt < q:
            r.thin.append((cn, name, label, cnt, q))
        # KHÔNG tra được loại và cũng KHÔNG thuộc diện miễn trừ ⇒ định mức 0, nhóm sẽ nằm rỗng
        # mãi. Xem ghi chú dài ở `SheetQuota.unknown`.
        elif not label and not mien_dinh_muc(name) and not is_banned_group(name):
            r.unknown.append((cn, name, cnt))

    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        txt = (tc.c(rn, 'B') or tc.c(rn, 'C') or '').split('\n')[0].strip()
        # phân trang lạc sang khối Chức năng / An toàn thông tin
        if lv in ('case', 'sub', 'sub2') and grp \
                and ('chuc nang' in grp or 'an toan thong tin' in grp) and is_paging(txt) \
                and not _paging_ok(txt):
            r.paging.append((cn, ('[NHÓM] ' if lv != 'case' else '') + txt))
        # sắp xếp cột danh sách cũng chỉ được ở Validate — chỉ soi CN đã có nhóm Phân trang
        if lv in ('sub', 'sub2') and grp and 'chuc nang' in grp \
                and 'sap xep' in norm(txt) and cn in cn_paging:
            r.paging.append((cn, '[NHÓM] ' + txt + '  (sắp xếp cột)'))
        if lv in ('sub', 'sub2') and is_banned_group(txt):
            r.banned.append((cn, txt))
        if lv == 'case':
            if insub:
                insub = (insub[0], insub[1] + 1)
            if in_gdc:
                gdc_n[cn] = gdc_n.get(cn, 0) + 1
                if not any(b in norm(txt) for b in GDC_BASE):
                    gdc_bad.append((cn, txt))
            continue
        if lv == 'cn':
            close_sub(); insub = None; in_validate = in_gdc = False
            cn = txt; cn_has[cn] = set(); grp = None
            why = bad_cn_name(txt)
            if why:
                r.cn_name.append((cn, why))
            continue
        if lv == 'grp':
            close_sub(); insub = None; in_gdc = False
            grp = norm(txt)
            if cn is None:
                continue
            if 'giao dien' in grp:
                cn_has[cn].add('gd')
            elif 'chuc nang' in grp:
                cn_has[cn].add('cn')
            elif 'an toan thong tin' in grp:
                cn_has[cn].add('attt')
            in_validate = False
            continue
        # lv in ('sub', 'sub2')
        n = norm(txt)
        if lv == 'sub':
            close_sub(); insub = None
            in_gdc = 'giao dien chung' in n
            if in_gdc:
                cn_has[cn].add('gdc'); in_validate = False; continue
            if 'validate' in n:
                cn_has[cn].add('val'); in_validate = True; continue
            if grp and 'giao dien' in grp:
                in_validate = False
            # nhóm control đặt thẳng ở cấp sub trong khối Giao diện
            if in_validate or (grp and 'giao dien' in grp):
                insub = (txt, 0)
            continue
        if lv == 'sub2':
            close_sub(); in_gdc = False
            if in_validate and n.startswith('phan trang'):
                cn_paging.add(cn)
            insub = (txt, 0) if in_validate else None
    close_sub()

    # "Giao diện chung" phải đúng 6 case nền (CN Xuất: 2), không case nào khác
    r.gdc = [(c, 'chỉ có %d/%d case nền' % (gdc_n.get(c, 0), 2 if is_export_cn(c) else 6))
             for c in cn_has if 'gdc' in cn_has[c]
             and gdc_n.get(c, 0) != (2 if is_export_cn(c) else 6)]
    r.gdc += [(c, 'case lạc chỗ: "%s"' % t[:60]) for c, t in gdc_bad if not is_export_cn(c)]

    for c, has in cn_has.items():
        exp = is_export_cn(c)
        # CN Xuất excel miễn CẢ HAI khối `Validate` và `An toàn thông tin` — chỉ thị người đặt
        # việc 2026-09-10 (*"bỏ ATTT tại chức năng Xuất excel, bỏ validate tại chức năng Xuất
        # excel"*). Trước 10/09 chỉ miễn `Validate`; giữ nguyên thì mọi file đã dọn theo chỉ
        # thị đều bị báo "thiếu khối An toàn thông tin" vĩnh viễn, và cách duy nhất làm bộ rà
        # im là bơm lại đúng cái vừa được yêu cầu bỏ.
        need = [lbl for key, lbl in (('gdc', 'Giao diện chung'), ('val', 'Validate'),
                                     ('cn', 'Chức năng'), ('attt', 'An toàn thông tin'))
                if key not in has and not (key in ('val', 'attt') and exp)]
        if need:
            r.nostruct.append((c, need))
    return r


def scan_quota(role, only=None, legacy=False, verbose=True):
    """Rà cả role. Trả về (tổng 7 số, danh sách file không đọc được)."""
    quota = QUOTA_LEGACY if legacy else QUOTA
    tot = dict(thin=0, nostruct=0, gdc=0, paging=0, banned=0, cn_name=0, unknown=0)
    broken = []
    for sh in iter_role_files(role, only=only, broken=broken):
        r = scan_quota_sheet(sh.tc, quota)
        if not r:
            continue
        if verbose:
            print('#' * 4, sh.name + (' / ' + sh.bp if sh.bp and sh.multi else ''))
            for c, why in r.cn_name:
                print('   [CN SAI  ] %-45s %s' % (c[:45], why))
            for c, need in r.nostruct:
                print('   [CẤU TRÚC] %-45s thiếu khối: %s' % (c[:45], ', '.join(need)))
            for c, msg in r.gdc:
                print('   [GD CHUNG] %-45s %s' % (c[:45], msg))
            for c, t in r.paging:
                print('   [SAI KHỐI] %-45s phân trang/sắp xếp ngoài Validate: "%s"'
                      % (c[:45], t[:58]))
            for c, t in r.banned:
                print('   [NHÓM LẠ ] %-45s nhóm không có trong mẫu: "%s"' % (c[:45], t[:58]))
            for c, name, label, cnt, q in r.thin:
                print('   [ĐỊNH MỨC] %-42s %-22s %d/%d case'
                      % (name[:42], '(' + label + ')', cnt, q))
            for c, name, cnt in r.unknown:
                print('   [KHÔNG RÕ LOẠI] %-38s %d case — KHÔNG dòng nào của bảng QUOTA khớp '
                      'tên nhóm ⇒ định mức 0, patch_quota bỏ qua IM LẶNG.' % (name[:38], cnt))
                print('                   Chọn MỘT trong hai: khai `loai_control` ở hồ sơ màn '
                      '(§3 cuối) trỏ vào một nhãn loại có thật, hoặc thêm dòng vào '
                      '`qalib.QUOTA` + `KINDSRC` + bank + `quota_cases.BY_KIND` (đủ 4 chỗ).')
            print()
        for k in tot:
            tot[k] += len(getattr(r, k))
    return tot, broken


# ══════════════════════════════════════════════════════════════════════════════
# 3. LỌC TRÙNG CASE ATTT PER-FIELD
# ══════════════════════════════════════════════════════════════════════════════

C_MINE = re.compile(r'^1\.\s*Nhập vào ô "', re.I)


def attt_muc_of(t):
    """Xếp một case ATTT vào 1 trong 5 mục injection; None nếu không phải case injection."""
    n = norm(t)
    if 'hexa' in n and 'url' in n:
        return 'hexa url'
    if 'hexa' in n and 'html' in n:
        return 'hexa html'
    if 'alert' in n:
        return 'alert'
    if 'sql' in n or 'truy van' in n:
        return 'sqli'
    if 'script html' in n or 'the script' in n or 'xss' in n:
        return 'xss tho'
    return None


def _kq_mine():
    """3 bản chữ Kết quả do đợt bơm 04/09 sinh — dùng để phân biệt bản mới với bản cũ."""
    import quota_cases
    return {norm(c[3]) for spec in (quota_cases.ATTT_ADD, quota_cases.ATTT_EDIT,
                                    quota_cases.ATTT_SEARCH, quota_cases.ATTT_IMPORT)
            for c in spec}


def scan_attt_dupes(tc, kq_mine=None):
    """Tìm case ATTT trùng mục trong cùng nhóm per-field.

    Luật 8 (giữ case CŨ): mục nào có ≥2 case → giữ bản CŨ, bỏ bản do đợt 04/09 sinh;
    nếu toàn bản 04/09 thì giữ 1. Trả về (set dòng cần bỏ, list dòng log).
    """
    kq_mine = _kq_mine() if kq_mine is None else kq_mine

    def is_mine(c_txt, d_txt):
        return bool(C_MINE.match((c_txt or '').strip())) and norm(d_txt) in kq_mine

    blk = grp = cn = None
    buckets = {}                       # (cn, grp) -> {muc: [(rn, mine?, tiêu đề)]}
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        t = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            cn = t; blk = None; grp = None
        elif lv == 'grp':
            blk = norm(t); grp = None
        elif lv in ('sub', 'sub2') and blk and 'toan thong tin' in blk:
            grp = t
        elif lv == 'case' and blk and 'toan thong tin' in blk and grp:
            m = attt_muc_of(t)
            if m:
                buckets.setdefault((cn, grp), {}).setdefault(m, []).append(
                    (rn, is_mine(tc.c(rn, 'C'), tc.c(rn, 'D')), t))

    drop, log = set(), []
    for (c, g), mucs in buckets.items():
        for m, lst in mucs.items():
            if len(lst) < 2:
                continue
            mine = [x for x in lst if x[1]]
            keep_old = [x for x in lst if not x[1]]
            if keep_old and mine:                 # có bản cũ → xoá bản 04/09
                drop.update(rn for rn, _, _ in mine)
                log.append((c, g, m, len(mine), 'xoá %d bản trùng' % len(mine)))
            elif not keep_old:                    # toàn bản 04/09 → giữ 1
                drop.update(rn for rn, _, _ in lst[1:])
                log.append((c, g, m, len(lst) - 1, 'xoá %d bản 04/09 thừa' % (len(lst) - 1)))
    return drop, log


def dedupe_attt(role, apply=False, verbose=True):
    """Chạy lọc trùng ATTT cho cả role. Trả về (số file đụng tới, tổng case đã bỏ)."""
    kq_mine = _kq_mine()
    tot_del = tot_file = 0
    per_file = {}
    for sh in iter_role_files(role, skip_locked=True):
        drop, log = scan_attt_dupes(sh.tc, kq_mine)
        if verbose:
            for c, g, m, _, msg in log:
                print('   %-18s %-26s %-26s [%s] %s'
                      % (sh.name[:18], (c or '')[:26], g[:26], m, msg))
        if not drop:
            continue
        per_file.setdefault(sh.path, 0)
        per_file[sh.path] += len(drop)
        if apply:
            pl = tcfix.Plan(sh.tc)
            for rn in sh.tc.order:
                if rn >= 12 and rn not in drop:
                    pl.keep(rn)
            sh.tc.rebuild(pl).save(quiet=True, sync=not sh.multi)
    tot_file = len(per_file)
    tot_del = sum(per_file.values())
    return tot_file, tot_del


# ══════════════════════════════════════════════════════════════════════════════
# 4. GHI KẾT QUẢ CHẠY LIVE (cột F + cột T)
# ══════════════════════════════════════════════════════════════════════════════

def build_marks(results, row_map, merge=None):
    """Gộp kết quả probe theo DÒNG của file kết quả.

    results — {key: {'mark': 'P'|'F'|'PE', 'note': str}}
    row_map — {key: số dòng}
    merge   — {số dòng: [key ưu tiên, ...]} cho dòng gộp nhiều phép đo
    Một dòng có nhiều key: F thắng PE, PE thắng P (bi quan — không tô hồng kết quả).
    """
    merge = merge or {}
    rows = {}
    for key, rn in row_map.items():
        if key in results:
            rows.setdefault(rn, []).append(key)
    plan = []
    for rn, keys in sorted(rows.items()):
        keys = [k for k in merge.get(rn, keys) if k in results]
        if not keys:
            continue
        mark = ('F' if any(results[k]['mark'] == 'F' for k in keys)
                else 'PE' if any(results[k]['mark'] == 'PE' for k in keys) else 'P')
        note = ' '.join(results[k]['note'].strip() for k in keys)
        plan.append((rn, mark, note))
    return plan


# ═════════════════════════════════════════════════════════════════════════════
# 4b. CASE ĐỐI CHIẾU CSDL → `PE`   (chỉ thị người đặt việc 2026-09-14)
# ═════════════════════════════════════════════════════════════════════════════
# Luật CŨ — `PROMPT-chay-live-test` §chinh_sach_PE mục 5: *"không truy cập được CSDL → đối
# chiếu ở mức API, vẫn chấm P/F"*. Chỉ thị 14/09 ĐỔI: case mà phép kiểm chứng là **chạy truy
# vấn trên CSDL** thì chấm **`PE`** — API là CÙNG tầng máy chủ vừa sinh ra dữ liệu, đọc lại nó
# không chứng minh được bản ghi nằm đúng trong bảng: case *lưu đúng vào database* mà chỉ GET lại
# đúng endpoint vừa POST thì luôn P, kể cả khi máy chủ ghi thiếu cột.
#
# ⚠️ RANH GIỚI — chỗ dễ chấm PE OAN nhất. Đo trên bộ `ChuyenVien` (2.666 case, 14/09):
#      66 case  cột C có **truy vấn kiểm chứng**                  -> ĐÚNG phạm vi luật
#      43 case  `SQL Injection (Insert/Update)`                -> SQL là CHUỖI NHẬP vào ô, kiểm trên UI
#      41 case  ATTT *"…không bị mã hoá khi lưu vào database"*   -> kiểm bằng mở lại bản ghi trên UI
# Khớp chữ `database`/`DB` trơn là PE oan **84 case** — gấp rưỡi phần đúng ⇒ luật soi theo
# **DÒNG LỆNH ở cột C**, không theo từ khoá trong câu.
#
# HAI mức (chỉ thị 14/09, câu hỏi *case hỗn hợp*):
#   `toan_bo`   kỳ vọng của case nằm HẲN ở CSDL — tiêu đề nói *khớp DB* / *lưu đúng vào database*
#               / *xóa bản ghi trong database* -> chấm **PE** + khối `[DB ACCESS REQUIRED]` ở cột T.
#   `mot_phan`  thao tác + hiển thị kiểm được trên màn, CHỈ MỘT bước là đối chiếu CSDL (case tìm
#               kiếm, thẻ số liệu) -> **vẫn chấm P/F theo phần UI**, cột T mang khối `[DB PARTIAL]`
#               nói rõ phần CSDL còn treo. Chấm PE cả case ở đây là vứt kết quả thật của ~30 case tìm kiếm.
#
# DỰ ÁN CÓ QUYỀN TRUY VẤN thì **không chạy** `pe_db.py --apply` và chấm P/F như cũ — luật này nói
# về việc *không có CSDL để đối chiếu*, không phải cấm đối chiếu.
CO_PE_DB = '[DB ACCESS REQUIRED]'
CO_DB_MOT_PHAN = '[DB PARTIAL]'

# MỘT DÒNG lệnh SQL — chỉ nhận dạng câu TRUY VẤN, không nhận từ `database` trong câu văn.
_RX_TRUY_VAN = re.compile(r'(select\s+[^\n]{0,200}?\bfrom\b|delete\s+from\b'
                          r'|update\s+\S+\s+set\b|insert\s+into\b)', re.I)
# Dòng bảo người test GÕ chuỗi vào ô — payload SQL Injection, KHÔNG phải truy vấn kiểm chứng.
_RX_DONG_NHAP = re.compile(r'^\s*\d*\s*[.)]?\s*(nhap|dan|go|dien|paste|copy|thu voi|su dung chuoi)')
# Bước đối chiếu CSDL viết bằng lời (không kèm câu lệnh) — vẫn là việc phải có CSDL mới làm được.
_KW_KIEM_DB = ('doi chieu voi db', 'doi chieu db', 'kiem tra db', 'kiem tra trong db',
               'doi chieu voi csdl', 'kiem tra csdl', 'doi chieu voi database',
               'kiem tra trong database', 'truy van csdl', 'truy van db', 'chay cau lenh sql')
# Tiêu đề nói **mục đích của case là đối chiếu CSDL** -> toàn bộ kỳ vọng nằm ở CSDL.
# ⚠️ `DB` còn là **tên trường** trên màn (`Chọn 1 giá trị của Loại DB` · `Thẻ số liệu Tổng loại
# database`) — vì vậy chữ `DB` phải đi kèm động từ đối chiếu/lưu trữ thì mới tính.
_RX_TIEU_DE_DB = re.compile(r'(khop\s+(voi\s+)?(du\s+lieu\s+(trong|o)\s+)?(db|csdl)\b'
                            r'|(vao|trong|tu|len)\s+(dung\s+)?(database|csdl)\b'
                            r'|(luu|xoa|khoi\s+phuc|cap\s+nhat)\s+[^\n]{0,30}\bdb\b)')


def tieu_de_noi_db(tieu_de):
    """Tiêu đề tự nhận case là việc đối chiếu CSDL? (dùng để soi case viết LỆCH lối API)."""
    nb = norm(tieu_de)
    return 'sql injection' not in nb and bool(_RX_TIEU_DE_DB.search(nb))


def truy_van_db(cac_buoc):
    """Các dòng TRUY VẤN kiểm chứng trong cột C (đã bỏ dòng gõ chuỗi SQL vào ô)."""
    out = []
    for ln in (cac_buoc or '').splitlines():
        if _RX_TRUY_VAN.search(ln) and not _RX_DONG_NHAP.match(norm(ln)):
            out.append(ln.strip())
    return out


def _kq_toan_db(kq):
    """Cột D **chỉ** nói chuyện khớp CSDL (vd `Dữ liệu xuất ra khớp với DB`)?"""
    dong = [l for l in norm(kq or '').splitlines() if l.strip()]
    return bool(dong) and all('db' in re.split(r'[^a-z0-9]+', l) or 'database' in l or 'csdl' in l
                              for l in dong)


def la_case_db(tieu_de, cac_buoc, kq=''):
    """Case có phải case ĐỐI CHIẾU CSDL không -> `('toan_bo'|'mot_phan'|None, [dòng truy vấn])`.

    Luật dùng chung cho `pe_db.py` (bơm PE + bộ rà) và cho mọi script live test sau này —
    KHÔNG chép regex sang script, xem §4b ở trên.
    """
    nb = norm(tieu_de)
    if 'sql injection' in nb:          # SQL ở đây là payload nhập vào ô, kiểm được trên UI
        return None, []
    tv = truy_van_db(cac_buoc)
    if not tv and not any(k in norm(cac_buoc) for k in _KW_KIEM_DB):
        return None, []
    toan_bo = bool(_RX_TIEU_DE_DB.search(nb)) or _kq_toan_db(kq)
    return ('toan_bo' if toan_bo else 'mot_phan'), tv


_DA_THU_MAC_DINH = (
    '- đối chiếu ở mức UI: chỉ đọc lại chính dữ liệu máy chủ vừa trả về\n'
    '- đối chiếu ở mức API: cùng tầng đã sinh ra dữ liệu — không chứng minh được bản ghi nằm '
    'đúng trong bảng/cột như câu truy vấn đòi')


def bao_pe_db(tieu_de, truy_van, da_thu=None):
    """Khối `[DB ACCESS REQUIRED]` cho cột T — khuôn CHỐT, mọi nơi in y hệt nhau.

    Đúng đòi hỏi của §chinh_sach_PE: ghi chú PE phải nêu **đã thử gì** và **cần gì để chốt**.
    """
    return '\n'.join([CO_PE_DB, '', 'Case:', (tieu_de or '').strip(), '',
                      'Query:', '\n'.join(truy_van) or '(cột C ghi bước đối chiếu CSDL, không kèm câu lệnh)',
                      '', 'Đã thử:', da_thu or _DA_THU_MAC_DINH, '',
                      'Cần để chốt:', 'quyền chạy truy vấn CHỈ ĐỌC trên CSDL môi trường test, hoặc bản '
                      'kết xuất bảng tương ứng do DBA cấp'])


def bao_db_mot_phan(truy_van):
    """Khối `[DB PARTIAL]` — case vẫn chấm P/F, riêng bước đối chiếu CSDL còn treo.

    Đây là **cờ của case**, không phải ghi chú của một lượt chạy — `write_marks` giữ lại khối
    này khi lượt chạy ghi ghi chú đè lên cột T.
    """
    return '\n'.join([CO_DB_MOT_PHAN, '',
                      'Chưa đối chiếu:', '\n'.join(truy_van) or '(bước đối chiếu CSDL ở cột C)', '',
                      'Kết quả P/F của case này chỉ tính phần kiểm được trên màn (thao tác + hiển thị); '
                      'phần đối chiếu CSDL treo vì không có quyền truy vấn.'])


def muc_case_db(tc, rn, theo_tieu_de=False):
    """Mức CSDL của MỘT dòng -> `('toan_bo'|'mot_phan'|None, [dòng truy vấn])`.

    `theo_tieu_de` (mặc định TẮT) nới phạm vi sang case mang TIÊU ĐỀ đối chiếu CSDL mà cột C
    lại viết lối API (*"đối chiếu với dữ liệu máy chủ"*). Chỉ thị 14/09 chốt phạm vi theo CÂU
    TRUY VẤN nên đây là cờ phải tự bật; bật là chấp nhận PE cho cả nhóm đó.
    """
    b = tc.c(rn, 'B')
    muc, tv = la_case_db(b, tc.c(rn, 'C'), tc.c(rn, 'D'))
    if not muc and theo_tieu_de and tieu_de_noi_db(b):
        return 'toan_bo', []
    return muc, tv


def dong_case(tc):
    """Số dòng của mọi case thật trong một sheet (bỏ dòng nhóm / dòng đầu bảng)."""
    return [rn for rn in tc.order if rn >= 12 and tc.c(rn, 'C')]


def quet_case_db(tc, theo_tieu_de=False):
    """Quét một sheet -> `[(số dòng, mức, tiêu đề, [dòng truy vấn])]` theo §4b."""
    out = []
    for rn in dong_case(tc):
        muc, tv = muc_case_db(tc, rn, theo_tieu_de)
        if muc:
            out.append((rn, muc, (tc.c(rn, 'B') or '').strip(), tv))
    return out


# ══════════════════════════════════════════════════════════════════════════════
# 4c. HÀNG RÀO AN TOÀN KHI CHẠY CASE LIVE  (luật máy của `<hang_rao_an_toan>`)
# ══════════════════════════════════════════════════════════════════════════════
# Nguồn luật: `prompts/PROMPT-chay-live-test.md` §`<hang_rao_an_toan>` — viết ra sau sự cố
# 2026-08-02 (agent gửi `PUT` rồi `DELETE ?version=4` vào gói STEM THẬT của tenant khác, cả hai
# trả 200, phải nhờ DBA `UPDATE … SET deleted_at=NULL`). Prompt là bản cho NGƯỜI/agent đọc;
# khối này là bản cho MÁY thi hành, đặt ở `qalib` chứ không ở script vì cả `chay_live.py`, bộ
# tự kiểm và mọi executor về sau đều phải dùng CHUNG một luật — hai bản sao là hai luật.
#
# ⚠️ CHIỀU AN TOÀN CỦA PHÉP NHẬN DẠNG: thà CHẶN NHẦM một case đọc-thuần còn hơn thả lọt một
# case ghi. Mọi chỗ không chắc đều trả "có thao tác ghi"; số case bị chặn được BÁO RA (không
# giấu), người chạy đọc rồi tự quyết — không có đường nào để tool tự nới.
CO_CHAN_AT = '[SAFETY BLOCKED]'

# §hang_rao_an_toan mục 3 — bản ghi QA tạo phải mang dấu nhận biết. Đây là danh sách dấu ĐƯỢC
# CÔNG NHẬN; bản ghi không mang dấu nào thì KHÔNG chứng minh được quyền sở hữu ⇒ không đụng.
TIEN_TO_QA = ('zzqa', 'qa-', 'qa_', 'test-auto', 'asdasd')

# Method HTTP được phép tự phát sinh khi chạy case chưa qua guard (mục 1: "CHỈ được GET").
METHOD_DOC = ('GET', 'HEAD', 'OPTIONS')

# ── Động từ CAM KẾT THAY ĐỔI dữ liệu trên cột C. Chỉ nhận động từ CHỐT, không nhận động từ MỞ:
# `Bấm Thêm mới` / `Bấm icon Chỉnh sửa` mới chỉ MỞ biểu mẫu (probe_live vẫn làm, an toàn) —
# thứ đổi dữ liệu là `Lưu` · `Cập nhật` · `Xác nhận xoá` … Nhận nhầm động từ mở là chặn oan
# gần hết bộ case; bỏ sót động từ chốt là mất đúng thứ hàng rào này sinh ra để chặn.
_TD_GHI = (
    ('luu', 'Lưu'), ('cap nhat', 'Cập nhật'),
    ('xoa', 'Xóa'), ('xoa bo', 'Xóa bỏ'), ('go bo', 'Gỡ bỏ'),
    ('duyet', 'Duyệt'), ('tu choi', 'Từ chối'), ('phe duyet', 'Phê duyệt'),
    ('chuyen trang thai', 'Chuyển trạng thái'), ('kich hoat', 'Kích hoạt'),
    ('ngung hoat dong', 'Ngưng hoạt động'), ('khoa tai khoan', 'Khóa tài khoản'),
    ('luu tru', 'Lưu trữ'), ('khoi phuc', 'Khôi phục'), ('publish', 'Publish'),
    ('nhap excel', 'Nhập excel'), ('import', 'Import'), ('tai len', 'Tải lên'),
    ('upload', 'Upload'), ('submit', 'Submit'), ('gui yeu cau', 'Gửi yêu cầu'),
    ('xac nhan xoa', 'Xác nhận xóa'), ('dong y xoa', 'Đồng ý xóa'),
    ('doi mat khau', 'Đổi mật khẩu'), ('reset mat khau', 'Reset mật khẩu'),
)
# Mệnh đề mang động từ ghi nhưng KHÔNG thực hiện nó — "bấm Hủy bỏ, KHÔNG lưu", "nút Lưu bị mờ",
# "kiểm tra hiển thị nút Lưu". Xét theo MỆNH ĐỀ như `vi_pham_chon_san` (§0a), không theo cả ô:
# xét cả ô thì một câu "không lưu" ở bước 5 xoá luôn thao tác ghi thật ở bước 2.
_KW_KHONG_GHI = ('khong luu', 'khong duoc luu', 'khong bi xoa', 'khong duoc xoa',
                 'chua luu', 'huy bo', 'huy thao tac', 'bi mo', 'vo hieu hoa')

# Động từ THAO TÁC của người test — thứ biến một chữ thành một HÀNH ĐỘNG sẽ được thực hiện.
# ⚠️ PHẢI có biên từ ở đầu: không có nó thì `an` khớp vào giữa chữ `màn`, và câu *"Mở màn Vị trí
# lưu trữ"* được đọc thành "có động từ thao tác đứng trước `lưu trữ`" ⇒ chặn oan cả màn. Bộ tự
# kiểm `kiem_chay_live.py` phép B6 giữ đúng ca này.
_DT_THAO_TAC = r'(?:^|[^a-z0-9])(?:bam|click|nhan|an|chon|thuc hien|tien hanh|go|keo|xac nhan)'
# Chữ đứng ngay trước biến động từ thành DANH TỪ: *"dữ liệu đang lưu"* · *"bản ghi đã xóa"*.
# Bỏ lưới này là chặn oan: đo trên `LoaiNguon` (297 case) — 93 case bị coi là ghi, trong đó
# case *"Đối chiếu với dữ liệu đang lưu"* là case ĐỌC THUẦN.
_TRUOC_DANH_TU = r'(?:dang|da|du lieu|thong tin|gia tri|trang thai|ban ghi|muc|che do|noi)\s+$'
# Chữ đứng ngay SAU biến động từ thành thao tác trên Ô NHẬP / BỘ LỌC — không đụng dữ liệu:
# *"Xoá trắng ô Số bản ghi/trang"* · *"Xoá hết nội dung ô"* · *"Xóa từ khoá"* · *"Xóa lọc"*.
_SAU_KHONG_GHI = {
    'xoa': r'\s*(trang|het|sach|noi dung|tu khoa|ky tu|loc|bo loc|tim kiem|dieu kien|du lieu nhap)',
    'luu': r'\s*(y|luong|tru)',        # `lưu ý` · `lưu lượng` · `lưu trữ` (có mục riêng bên dưới)
}
# Động từ mà chữ của nó CÒN LÀ tên trạng thái / tên màn (`Lưu trữ`, `Publish`) hoặc tên tính năng
# (`Import`): chỉ nhận khi có động từ thao tác đứng trước. Thiếu lưới này thì câu *"Mở màn Vị trí
# lưu trữ"* và thẻ số liệu *"KHÔNG HOẠT ĐỘNG / LƯU TRỮ"* đều bị coi là thao tác ghi.
_CAN_DONG_TU = ('luu tru', 'import', 'upload', 'tai len', 'khoi phuc', 'publish', 'submit')


def thao_tac_ghi(cac_buoc, tieu_de=''):
    """[(từ khoá, tên thao tác)] — những thao tác GHI mà cột C yêu cầu THỰC HIỆN.

    Rỗng nghĩa là case chạy được bằng thao tác ĐỌC. Không rỗng thì case chỉ được chạy sau khi
    `Guard` chứng minh được bản ghi thuộc quyền sở hữu của phiên (§hang_rao_an_toan mục 2).

    Nhận theo NGỮ CẢNH ĐỘNG TỪ, không theo từ khoá trơn — cùng bài học của §4b (khớp chữ
    `database` trơn là PE oan 84 case): ở đây khớp chữ `lưu` trơn chặn oan mọi case *"đối chiếu
    với dữ liệu đang lưu"*, mà chặn oan thì người chạy mất case, không ai biết vì sao.
    """
    ra, thay = [], set()
    for menh_de in re.split(r'[.;\n]|(?<=\))\s|>\s', norm(cac_buoc or '')):
        menh_de = menh_de.strip()
        if any(k in menh_de for k in _KW_KHONG_GHI):
            continue
        for kw, ten in _TD_GHI:
            if ten in thay:
                continue
            for m in re.finditer(r'(?:^|[^a-z0-9])(%s)(?:$|[^a-z0-9])' % re.escape(kw), menh_de):
                truoc, sau = menh_de[:m.start(1)], menh_de[m.end(1):]
                if re.search(_TRUOC_DANH_TU, truoc):
                    continue                            # danh từ, không phải hành động
                if kw in _SAU_KHONG_GHI and re.match(_SAU_KHONG_GHI[kw], sau):
                    continue                            # thao tác trên ô nhập / bộ lọc
                co_dong_tu = re.search(_DT_THAO_TAC + r'[^.;]{0,30}$', truoc)
                if kw in _CAN_DONG_TU and not co_dong_tu:
                    continue                            # tên trạng thái / tên màn, không phải lệnh
                # Hoặc mệnh đề MỞ ĐẦU bằng động từ (lối viết mệnh lệnh: "Lưu lại", "Xóa bản ghi"),
                # hoặc có động từ thao tác đứng trước trong cùng mệnh đề ("Bấm nút Lưu").
                if (re.match(r'^\s*(?:\d+[.)]\s*)?(?:nut|button|icon)?\s*$', truoc) or co_dong_tu):
                    thay.add(ten)
                    ra.append((kw, ten))
                    break
    return ra


def can_guard(tc, rn):
    """(có cần guard không, [tên thao tác ghi]) cho MỘT dòng case."""
    tt = thao_tac_ghi(tc.c(rn, 'C'), tc.c(rn, 'B'))
    return bool(tt), [ten for _, ten in tt]


def la_ban_ghi_qa(nhan):
    """Bản ghi có mang dấu nhận biết của QA không (§hang_rao_an_toan mục 3 và mục 5)."""
    n = norm(nhan or '').strip()
    return bool(n) and any(n.startswith(t) or t in n for t in TIEN_TO_QA)


# ══════════════════════════════════════════════════════════════════════════════
# 4c-bis. SỔ MẠNG — PHÂN LOẠI, KHÔNG XOÁ  (chỉ thị người đặt việc 2026-09-15 lượt 2)
# ══════════════════════════════════════════════════════════════════════════════
# Bản đầu (15/09 lượt 1) XOÁ sổ mạng ngay sau khi đăng nhập để `POST /api/login` không bị đếm
# là vi phạm. Sai về nguyên tắc: **bằng chứng phải phản ánh đúng thứ Chrome quan sát được**, và
# một cái sổ có thể xoá thì không còn là bằng chứng — "0 request khác GET" đọc lên giống hệt
# nhau ở lượt chạy sạch và ở lượt chạy vừa xoá mất dấu vết. Nay không xoá gì: mọi request được
# GIỮ và được PHÂN LOẠI, cái nào được phép thì ghi rõ *vì sao được phép*.
#
#   READ   GET/HEAD/OPTIONS                              — thao tác đọc, luôn hợp lệ
#   AUTH   POST tới ĐÚNG endpoint đăng nhập đã quy định  — `ALLOWLISTED_AUTH`, lý do ghi kèm
#   READ*  POST tới endpoint người chạy khai tường minh  — `ALLOWLISTED_READ` (vd API tìm kiếm
#          dựng bằng POST). Phải khai bằng tay, mặc định RỖNG.
#   WRITE  mọi method thay đổi dữ liệu ngoài hai nhóm trên          -> VI PHẠM
#   UNKNOWN method lạ / không đọc được                              -> VI PHẠM (không đoán)
#
# Vi phạm = `WRITE` + `UNKNOWN`. Lượt chạy chỉ-đọc mà thấy vi phạm thì DỪNG (xem
# `chay_live.kiem_so_mang`) — không chạy tiếp chỉ vì đang giữa bộ case, và đối chiếu SAU MỖI
# CASE chứ không phải cuối lượt (chỉ thị 15/09 lượt 3 PHẦN 2).
#
# Cả hai allowlist (`AUTH_MAC_DINH`/`QA_AUTH_ENDPOINTS` và `--mang-cho-phep`) khớp qua
# `khop_endpoint` = **origin + path ĐÚNG BẰNG**. Bản trước dùng `endswith` cho AUTH và `in`
# cho `--mang-cho-phep`; cả hai đều biến MỘT dòng khai thành một HỌ endpoint: `/foo/login` và
# `/admin/login` đi lọt cổng đăng nhập, `/api/evil/x` · `/api/x-extra` · `?next=/api/x` đi lọt
# cổng đọc. Một allowlist khớp rộng hơn thứ nó khai thì không còn là allowlist.
READ, AUTH, GHI, LA = 'READ', 'AUTH', 'WRITE', 'UNKNOWN'
CHO_PHEP_READ = 'ALLOWLISTED_READ'

# Endpoint ĐĂNG NHẬP được phép POST. Danh sách ĐÓNG và hẹp: `auth` chung chung sẽ nuốt cả
# `/api/auth/users/{id}` (một endpoint GHI). Đè bằng `QA_AUTH_ENDPOINTS` (ngăn bằng dấu phẩy)
# khi app đặt route khác.
AUTH_MAC_DINH = ('/login', '/api/login', '/auth/login', '/api/auth/login', '/signin',
                 '/api/signin', '/oauth/token', '/oauth2/token', '/connect/token',
                 '/api/token', '/refresh-token', '/api/auth/refresh', '/logout', '/api/logout')

# Khoá query/tham số mang bí mật — giá trị bị CHE trước khi ghi xuống đĩa.
KHOA_NHAY_CAM = ('password', 'pass', 'pwd', 'matkhau', 'token', 'access_token', 'refresh_token',
                 'id_token', 'authorization', 'api_key', 'apikey', 'secret', 'client_secret',
                 'signature', 'sig', 'session', 'sessionid', 'otp', 'code', 'credential')
# Header KHÔNG BAO GIỜ được ghi (kể cả đã che) — sổ mạng không cần tới chúng.
HEADER_CAM = ('authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token',
              'proxy-authorization')
_RX_JWT = re.compile(r'\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}')


def auth_endpoints():
    """Endpoint đăng nhập được phép POST — `QA_AUTH_ENDPOINTS` > hồ sơ dự án > mặc định.

    Route đăng nhập là dữ kiện của DỰ ÁN, không phải của tool: MOETDL đặt ở
    `/api/authentication/v1/auth/login`, không khớp một mục nào trong `AUTH_MAC_DINH`, nên mọi
    lượt chạy live của dự án này chết ngay ở bước ĐĂNG NHẬP — sổ mạng tố chính cái POST mà tool
    vừa tự gửi (16/09). Khai ở hồ sơ dự án thì mỗi dự án nói một lần, thay vì mỗi người chạy
    phải nhớ dựng biến môi trường.

    Danh sách vẫn ĐÓNG và vẫn khớp `origin + path ĐÚNG BẰNG` — thêm một đường KHAI, không nới
    một li nào cách so khớp.
    """
    moi = (os.environ.get('QA_AUTH_ENDPOINTS') or '').strip()
    if moi:
        return tuple(x.strip().lower() for x in moi.split(',') if x.strip())
    pj = _pj('auth_endpoints', ())
    if pj:
        return tuple(str(x).strip().lower() for x in pj if str(x).strip())
    return AUTH_MAC_DINH


def che_url(url, gioi_han=300):
    """URL đã CHE bí mật — dùng cho MỌI chỗ ghi xuống đĩa/in ra màn hình.

    Che giá trị của tham số nhạy cảm và mọi chuỗi hình dạng JWT (token có thể nằm ở path chứ
    không riêng query). Giữ nguyên phần còn lại: sổ mạng mất URL thì không đối chiếu được.
    """
    u = str(url or '')[:gioi_han * 3]
    u = _RX_JWT.sub('eyJ…<JWT ĐÃ CHE>', u)

    def _che(m):
        return '%s=<ĐÃ CHE>' % m.group(1)
    for k in KHOA_NHAY_CAM:
        u = re.sub(r'(?i)([?&#]%s)=[^&#\s]*' % re.escape(k), _che, u)
    return u[:gioi_han]


def _tach_url(url):
    """(origin, path) đã CHUẨN HOÁ cho việc so khớp allowlist. Không bao giờ ném lỗi.

    Chuẩn hoá đúng bốn thứ chỉ thị 15/09 (PHẦN 3) nêu tên, và KHÔNG thứ gì hơn — mỗi phép
    chuẩn hoá thừa là một cách mở rộng allowlist mà không ai cố ý mở:

      · **query + fragment**: cắt bỏ. `?x=1` không được biến `/a` thành một endpoint khác,
        cũng không được dùng để LÁCH (`/api/evil?x=/api/list`);
      · **URL-encoding**: giải MỘT lần, **theo từng đoạn**, và dấu `/` chui ra từ `%2F`
        được mã hoá lại. `%2F` KHÔNG phải dấu ngăn đoạn: `/api%2Flogin` là một tài nguyên
        tên `api/login`, khác hẳn `/api/login`, và server thật cũng phân biệt hai cái đó.
        Giải thẳng `%2F` thành `/` là dùng chuẩn hoá để NHẬP hai endpoint làm một — đúng
        thứ chỉ thị cấm. Giải một lần thôi, cũng vì lẽ đó (`%252F`);
      · **`/` cuối**: bỏ (`/login/` ≡ `/login`), trừ path gốc `/`;
      · **chữ hoa/thường**: hạ thường ở path (khớp hành vi cũ) và ở origin.

    Trả `('', path)` khi URL không có scheme://host (vd `/api/x` tương đối) — origin rỗng
    nghĩa là "không biết origin", và luật khớp ở dưới xử lý nó tường minh.
    """
    u = str(url or '').strip()
    m = re.match(r'^([a-zA-Z][\w+.-]*)://([^/?#]*)([^?#]*)', u)
    if m:
        origin = '%s://%s' % (m.group(1).lower(), m.group(2).lower())
        duong = m.group(3) or '/'
    else:
        origin, duong = '', u.split('?')[0].split('#')[0] or '/'
    doan = []
    for x in duong.split('/'):
        try:
            x = urllib.parse.unquote(x)              # MỘT lần, không lặp
        except Exception:
            pass
        doan.append(x.replace('%', '%25').replace('/', '%2f'))
    duong = '/'.join(doan).lower()
    if not duong.startswith('/'):
        duong = '/' + duong
    duong = duong.rstrip('/') or '/'
    return origin, duong


def _duong_dan(url):
    """(API cũ) chỉ phần path đã chuẩn hoá — giữ cho chỗ nào đang gọi."""
    return _tach_url(url)[1]


def khop_endpoint(url, khai):
    """URL này có ĐÚNG là endpoint `khai` không? — so khớp CHÍNH XÁC, không chuỗi con.

    Sự cố lớp này không đến từ việc quên chặn mà từ việc khớp RỘNG: `endswith('/login')`
    cho `/foo/login` và `/admin/login` đi qua cổng đăng nhập, `'/api/list' in url` cho cả
    `/api/evil/list` lẫn `/api/list-extra` lẫn `?next=/api/list`. Cả hai đều biến một dòng
    allowlist thành một họ endpoint mà không ai khai.

    Hai dạng khai, cả hai đều khớp **ĐÚNG BẰNG**:
      · `https://host/login` -> origin PHẢI đúng **và** path PHẢI đúng;
      · `/login`             -> chỉ path, khớp mọi origin (app có nhiều host/cổng).

    Khai không có `/` đầu (vd `login`) được hiểu là path `/login`; khai rỗng KHÔNG khớp gì
    (một dòng allowlist rỗng không được mở toang cả sổ).
    """
    khai = str(khai or '').strip()
    if not khai:
        return False
    o_khai, d_khai = _tach_url(khai)
    o_url, d_url = _tach_url(url)
    if d_khai != d_url:
        return False
    if not o_khai:                       # khai chỉ-path -> khớp mọi origin
        return True
    return o_khai == o_url


def phan_loai_request(method, url, cho_phep_read=(), cua_so=None, id_mock=(), req_id=None):
    """(lớp, lý do) cho MỘT request — không bao giờ trả `None`, không bao giờ im lặng bỏ qua.

    `cua_so` (§4d) là CỬA SỔ GHI đang mở, nếu lượt chạy đang ở giữa một thao tác QA đã khai.
    Chỉ khi ấy một request thay đổi dữ liệu mới có cửa ra `QA_WRITE`; mọi lúc khác — kể cả
    lúc cửa sổ vừa đóng — nó vẫn là `WRITE` và vẫn dừng cả lượt chạy.

    `id_mock` (§4e) là tập `networkId` của những request đã bị GIỮ LẠI tại trình duyệt và
    được trả lời tại chỗ. Một request nằm trong tập này CHƯA TỪNG tới máy chủ, nên nó không
    thể là mutation trên dữ liệu thật — nhưng điều đó phải được chứng minh bằng chính id,
    **không** bằng việc "case này có khai mock". Khai mà không giữ được ⇒ vẫn là `WRITE`.
    """
    m = (method or '').strip().upper()
    if not m:
        return LA, 'không đọc được method của request'
    if req_id is not None and str(req_id) in {str(x) for x in (id_mock or ())}:
        return MOCK, ('request bị GIỮ tại trình duyệt và trả lời tại chỗ (page.route/mock) — '
                      'không tới máy chủ')
    if m in METHOD_DOC:
        return READ, 'read-only method'
    if m == 'POST':
        for e in auth_endpoints():
            if khop_endpoint(url, e):
                return AUTH, 'authentication request explicitly allowed (%s)' % e
    # `--mang-cho-phep` khai một endpoint **ĐỌC dựng bằng POST** — nên nó chỉ mở POST. Bản
    # trước xét trước khi phân biệt method, nên khai `/api/x` là mở luôn `PUT /api/x` và
    # `DELETE /api/x`: một dòng khai endpoint đọc mở cả đường ghi trên chính nó.
    if m == 'POST':
        for mau in (cho_phep_read or ()):
            if khop_endpoint(url, mau):
                return CHO_PHEP_READ, ('endpoint đọc khai tường minh khi chạy '
                                       '(--mang-cho-phep %s)' % str(mau).strip())
    if cua_so is not None and m in ('POST', 'PUT', 'PATCH', 'DELETE'):
        ok, ly_do, ma_id = cua_so.khop(m, url)
        if ok:
            cua_so.dung(m, url, ma_id)
            return QA_GHI, ly_do
        # Có cửa sổ mà KHÔNG khớp thì lý do phải nói ra: đây là chỗ một lượt chạy có quyền
        # ghi vẫn phải dừng, và người đọc cần biết nó trượt ở điều kiện nào.
        if m in ('POST', 'PUT', 'PATCH', 'DELETE'):
            return GHI, 'mutating method TRONG lượt có cửa sổ ghi nhưng %s' % ly_do
    if m in ('POST', 'PUT', 'PATCH', 'DELETE'):
        return GHI, 'mutating method ngoài allowlist'
    return LA, 'method lạ (%s) — không đoán là đọc hay ghi' % m


def so_mang(su_kien, cho_phep_read=(), cua_so=None, id_mock=()):
    """[bản ghi đã CHE + đã PHÂN LOẠI] cho toàn bộ request quan sát được. KHÔNG bỏ bản ghi nào.

    Bản ghi chỉ mang `method` · `url đã che` · `lớp` · `lý do` · `loại tài nguyên` · `mốc thời
    gian`. Không header, không body, không cookie — xem `browser_manager._gon_su_kien`, nơi đã
    cắt chúng ngay lúc bắt sự kiện để bí mật không nằm cả trong bộ nhớ của tiến trình.
    """
    ra = []
    for e in su_kien or []:
        p = (e or {}).get('params') or {}
        rq = p.get('request') or {}
        m = (rq.get('method') or '').upper()
        loai, ly_do = phan_loai_request(m, rq.get('url'), cho_phep_read, cua_so,
                                        id_mock=id_mock, req_id=p.get('requestId'))
        ban = {'method': m or '?', 'url': che_url(rq.get('url')), 'loai': loai,
               'ly_do': ly_do, 'tai_nguyen': (p.get('type') or '')[:20],
               'luc': p.get('wallTime') or p.get('timestamp')}
        if loai == QA_GHI and cua_so is not None:
            # §13: mỗi WRITE phải ghi rõ TESTCASE + THỰC THỂ QA + HÀNH ĐỘNG. Gắn ngay vào
            # bản ghi sổ, không để người đọc phải tự ghép hai file evidence với nhau.
            ban['qa'] = {'case': cua_so.case_key, 'thuc_the': cua_so.thuc_the,
                         'hanh_dong': cua_so.hanh_dong, 'ban_ghi': cua_so.ma}
        ra.append(ban)
    return ra


def vi_pham_mang(ds_so):
    """Bản ghi VI PHẠM trong sổ = `WRITE` + `UNKNOWN`. Nhận đầu vào là sổ đã phân loại."""
    return [x for x in (ds_so or []) if x.get('loai') in (GHI, LA)]


def dem_so_mang(ds_so):
    d = {k: 0 for k in (READ, AUTH, CHO_PHEP_READ, QA_GHI, MOCK, GHI, LA)}
    for x in ds_so or []:
        d[x.get('loai', LA)] = d.get(x.get('loai', LA), 0) + 1
    return d


def vi_pham_method(su_kien, cho_phep=()):
    """(API cũ) [(method, url đã che)] — giữ cho chỗ nào đang gọi; luật thật ở `so_mang`.

    ⚠️ Khác bản 15/09 lượt 1 ở một điểm: `AUTH` không còn bị tính là vi phạm (trước đây phải
    XOÁ sự kiện đăng nhập khỏi sổ mới ra 0 — chính chỗ làm hỏng tính bằng chứng của cái sổ).
    """
    return [(x['method'], x['url']) for x in vi_pham_mang(so_mang(su_kien, cho_phep))]


def bao_chan_at(tieu_de, thao_tac, da_thu=None):
    """Khối ghi chú cột T cho case bị hàng rào an toàn chặn — nêu ĐÃ THỬ GÌ và CẦN GÌ để chốt.

    Cùng khuôn với `bao_pe_db` (§4b): người đọc kết quả phải biết đây không phải "đo kém" mà
    là "không được phép đo bằng tài khoản/dữ liệu hiện có".
    """
    tt = ' · '.join(thao_tac) if thao_tac else 'thao tác ghi dữ liệu'
    return ('%s\n\nCase đòi thao tác GHI: %s.\n'
            'Đã thử: chạy phần ĐỌC được của case trên màn thật (đăng nhập · mở màn · đọc DOM đã '
            'render); dừng trước thao tác ghi vì không chứng minh được bản ghi thuộc dữ liệu do '
            'QA tạo trong phiên này.\n'
            'Cần để chốt: bản ghi mang dấu %s do chính phiên tạo, hoặc whitelist id được duyệt '
            '(--whitelist), rồi chạy lại với --cho-phep-ghi.\n'
            'Luật: PROMPT-chay-live-test §hang_rao_an_toan mục 2-3 (sự cố mất dữ liệu 2026-08-02).'
            % (CO_CHAN_AT, tt, '/'.join(t.upper() for t in TIEN_TO_QA[:3]))
            + (('\nGhi chú thêm: %s' % da_thu) if da_thu else ''))


# ══════════════════════════════════════════════════════════════════════════════
# 4d. DỮ LIỆU QA + CỬA SỔ GHI  (chỉ thị người đặt việc 2026-09-15 lượt 4)
# ══════════════════════════════════════════════════════════════════════════════
# Vấn đề mà khối này sinh ra để giải: §4c chặn ĐÚNG nhưng chặn HẾT. Bộ `LoaiNguon` có 69/297
# case đòi thao tác ghi, và cả 69 phải để trống chỉ vì tool không có cách nào tạo ra dữ liệu
# của chính nó. "Tool chưa làm" bị đọc thành "không đo được" — đúng thứ §vai_tro cấm.
#
# Cách giải KHÔNG phải nới hàng rào, mà là **cho hàng rào một thứ hợp lệ để cho qua**:
#
#     SETUP (tạo bản ghi ZZQA) → CHẠY CASE → NGHIỆM THU → DỌN → NGHIỆM THU DỌN
#
# Ba lớp chứng minh, thiếu một lớp là CHẶN (không có lớp nào suy ra được từ lớp khác):
#
#   ① DẤU     mã bản ghi mang tiền tố của CHÍNH lượt chạy này (`zzqa_<run>_<seq>`), không
#             phải một dấu QA chung chung — bản ghi `zzqa_` của lượt hôm qua cũng bị chặn;
#   ② SỔ      mã nằm trong sổ dữ liệu QA (`qa_data.So`) với trạng thái còn sống, và sổ ghi
#             rõ case nào tạo nó;
#   ③ CHỦ     phiên đang chạy đúng là phiên đã tạo bản ghi (`dau_van_tay` = tài khoản +
#             origin + run id). Đổi tài khoản giữa chừng là mất quyền thao tác — bản ghi
#             của tenant khác không bao giờ mang vân tay của phiên này.
#
# Và một lớp thứ tư ở tầng MẠNG, vì ba lớp trên đều là lời hứa ở tầng ý định: mọi request
# thay đổi dữ liệu chỉ hợp lệ khi nó rơi vào một **CỬA SỔ GHI** đã khai TRƯỚC lúc bấm nút —
# khai rõ case nào · thực thể nào · hành động gì · bao nhiêu request. Ngoài cửa sổ, một
# `POST` cũng đủ để dừng cả lượt chạy. Xem `CuaSoGhiQA` bên dưới.

QA_GHI = 'QA_WRITE'                 # mutation ĐÃ KHAI trước khi bấm, đúng phạm vi QA

# Tiền tố mã bản ghi QA. `zzqa` đứng đầu để bản ghi QA luôn nằm CUỐI danh sách sắp theo mã —
# người vận hành liếc một cái là thấy còn sót bản ghi test nào không.
QA_TIEN_TO = 'zzqa'

# NGĂN CÁCH trong mã bản ghi. Bản đầu chốt cứng `_` vì "ràng buộc mã thường gặp nhất là
# `^[a-z0-9_]+$`" — một suy đoán, và màn `LoaiLuuTru` của MOETDL đá thẳng vào nó: `code_regex`
# ở đó là `^[a-z0-9-]+$` (gạch ngang, CẤM gạch dưới). Hậu quả không phải một case sai mà là
# **72 case chết cùng một kiểu** ở lượt chạy 16/09: bước SETUP không tạo nổi bản ghi QA nên
# mọi case GHI của màn đều ra `LỖI` và để TRỐNG — tool không đo được chính thứ nó vừa được
# cấp phép để đo. Nay ngăn cách suy từ `grounding.hang_so.code_regex` của TỪNG màn.
QA_NGAN_MAC_DINH = '_'
QA_NGAN_CACH = ('_', '-')

# Cả hai ngăn cách đều được NHẬN khi đối chiếu quyền sở hữu: sổ của lượt trước có thể sinh
# bằng ngăn cách khác (đổi hồ sơ màn, `--resume` sau khi vá), và một mã không đọc được là một
# bản ghi không ai dọn được. Phần quyết định quyền sở hữu vẫn là `<run>` ở giữa.
# Hậu tố `<ngăn><chữ/số>` được phép: ca *"nhập trong độ dài cho phép"* phải kéo mã cho đủ đúng
# ngưỡng (32 ký tự) mà vẫn phải mang dấu của lượt chạy — hậu tố không nới điều đó một li nào.
_RX_MA_QA = re.compile(r'^zzqa[_-]([0-9a-z]{4,10})[_-](\d{1,4})(?:[_-][0-9a-z]*)?$')


def qa_ngan_cach(code_regex=None):
    """Ngăn cách dùng được cho mã bản ghi QA trên màn có ràng buộc `code_regex`.

    Đọc THẲNG bộ ký tự mà regex của màn cho phép thay vì đoán theo tên màn: `_` là mặc định,
    và chỉ đổi sang `-` khi regex CẤM `_` mà CHO `-`. Regex không đọc được / không khai ⇒ giữ
    mặc định: đây là chỗ thà giữ nguyên hành vi cũ còn hơn tự suy.
    """
    rx = str(code_regex or '').strip()
    if not rx:
        return QA_NGAN_MAC_DINH
    # `code_regex` ở hồ sơ màn là chuỗi NGƯỜI ĐỌC ('^[a-z0-9-]+$ — chỉ chữ thường, số và dấu
    # gạch ngang (-)'), nên chỉ xét phần biểu thức đứng đầu, không xét lời giải thích tiếng
    # Việt phía sau — trong lời giải thích chữ "gạch dưới" có thể xuất hiện ở câu phủ định.
    bt = rx.split(' ', 1)[0]
    try:
        m = re.compile(bt)
    except re.error:
        return QA_NGAN_MAC_DINH
    mau = 'zzqa%sab12%s001'
    for ng in QA_NGAN_CACH:
        if m.match(mau % (ng, ng)):
            return ng
    return QA_NGAN_MAC_DINH


def qa_run_id(hat=None):
    """Sinh mã lượt chạy QA — `ZZQA_<6 ký tự>_<YYYYmmddHHMMSS>` (§7 của chỉ thị).

    Phần giữa là ngẫu nhiên, KHÔNG suy từ thời gian: hai lượt chạy khởi động trong cùng một
    giây vẫn phải ra hai run khác nhau, nếu không thì bản ghi của lượt này chứng minh được
    quyền sở hữu cho lượt kia.
    """
    r = (hat or uuid.uuid4().hex)[:6].lower()
    return 'ZZQA_%s_%s' % (r, time.strftime('%Y%m%d%H%M%S'))


def qa_van(run_id):
    """Phần `<run>` dùng trong mã bản ghi, rút từ run id. Rỗng nếu run id sai khuôn."""
    m = re.match(r'^ZZQA_([0-9a-z]{4,10})_\d{8,14}$', str(run_id or ''))
    return m.group(1) if m else ''


def qa_ma_ban_ghi(run_id, seq, ngan=None):
    """Mã bản ghi QA thứ `seq` của lượt chạy — `zzqa<ngăn><run><ngăn><seq>`, ≤ 32 ký tự.

    `ngan` lấy từ `qa_ngan_cach(code_regex của màn)`; thiếu thì dùng `_` như trước.
    """
    van = qa_van(run_id)
    if not van:
        raise ValueError('run id không đúng khuôn ZZQA_<run>_<ts>: %r' % (run_id,))
    ng = ngan if ngan in QA_NGAN_CACH else QA_NGAN_MAC_DINH
    return '%s%s%s%s%03d' % (QA_TIEN_TO, ng, van, ng, int(seq))


def qa_ten_hien_thi(run_id, seq, hau='', ngan=None):
    """Tên hiển thị của bản ghi QA — mang dấu để người nhìn danh sách nhận ra ngay.

    Phần chữ CÓ DẤU tiếng Việt là cố ý: case *"tìm kiếm tiếng Việt có dấu / không dấu"* phải
    có dữ liệu mang dấu để tìm. Bản đầu đặt tên không dấu (`DU LIEU QA TU DONG`) nên phép ấy
    tìm `Dữ liệu QA` và không bao giờ ra kết quả — tool chấm F cho một chức năng đang chạy
    đúng (3 case, lượt chạy live 15/09).
    """
    return ('%s %s%s' % (qa_ma_ban_ghi(run_id, seq, ngan).upper(),
                         'Dữ liệu QA tự động', (' ' + hau) if hau else '')).strip()


# Giá trị ĐỔ SẴN cho ô BẮT BUỘC ngoài Mã/Tên khi SETUP dựng bản ghi QA (vá 2026-09-16).
#
# Vì sao là LUẬT ở đây chứ không phải dữ kiện khai ở hồ sơ màn: biểu mẫu nào cũng có thể có ô
# bắt buộc thứ ba, và SETUP không quan tâm giá trị nghiệp vụ nào — bản ghi sinh ra là để bị
# xoá ở bước dọn. Thứ nó cần là một giá trị ĐỦ QUA được lớp validate của FE. Nhận dạng theo
# NGHĨA của nhãn + chữ gợi ý + kiểu ô, không theo tên màn, nên màn mới không phải khai thêm gì.
#
# Lỗ đã vá: `phep_live.dien_form` chỉ điền 3 ô đầu theo VỊ TRÍ, nên màn nào có ô bắt buộc nằm
# ngoài 3 vị trí ấy là SETUP chết ngay ở bản ghi đầu tiên, và MỌI case GHI của màn rơi về lớp
# LỖI — `ViTriLuuTru` 16/09: ô `Loại database` (Selectbox) + `Chuỗi kết nối` không được điền,
# 115/115 case GHI hỏng, không phép rà nào kêu vì "LỖI" vẫn là một lớp hợp lệ.
QA_GIA_TRI_O = (
    # (từ khoá nhận dạng theo BIÊN TỪ — `chua_tu`, giá trị đổ vào)
    (('chuoi ket noi', 'connection', 'connection string', 'dsn', 'ket noi'),
     'postgresql://zzqa:zzqa@127.0.0.1:5432/zzqa'),
    (('port',), '5432'),
    (('email', 'thu dien tu'), 'zzqa@example.invalid'),
    (('url', 'duong dan', 'host', 'endpoint'), 'http://127.0.0.1'),
    (('dien thoai', 'sdt', 'phone'), '0900000000'),
)


# ── Chuỗi mẫu KHAI SẴN cho các lớp case "nhập giá trị đặc thù rồi lưu" ────────────────────
# Cột C của nhiều case chỉ mô tả LOẠI chuỗi (*"chuỗi có ký tự đặc biệt và thẻ html"*) mà không
# nêu chuỗi cụ thể; chỉ một số ít case kèm ví dụ nguyên văn (`"Kho <b>1</b>"`). Phép đo cần một
# chuỗi để gõ, nên trước đây nó bỏ cuộc — 13 case `truong_nhap_gia_tri` của lượt chạy 500 nằm ở
# đúng đó.
#
# ⚠️ Đây là DỮ LIỆU ĐẦU VÀO, không phải Expected Result. §10 cấm tự nghĩ ra kỳ vọng, và luật ấy
# giữ nguyên: kỳ vọng vẫn đọc nguyên văn từ cột D. Chuỗi ở bảng này chỉ thay cho việc người test
# tự gõ một chuỗi thoả mô tả của cột C, và phép đo PHẢI ghi vào evidence rằng chuỗi đến từ đây
# (`nguon_gia_tri='bảng chuỗi mẫu khai ở qalib'`) — người đọc kết quả có quyền biết chuỗi nào là
# của bộ case, chuỗi nào là của tool.
MAU_NHAP_KHAI = (
    (('ky tu dac biet', 'the html', 'script'), 'Kho <b>1</b> & "QA" 100%'),
    (('tieng viet co dau', 'chu tieng viet'), 'Kho lưu trữ dữ liệu Việt Nam'),
    (('khoang trang o dau va cuoi', 'cat khoang trang', 'space o dau'), '  zzqa gia tri  '),
    (('chu va ky tu dac biet', 'nhap chu'), 'abc@#'),
    (('chu hoa', 'hoa thuong'), 'Kho LƯU trữ'),
)


def mau_nhap_khai(chu):
    """Chuỗi mẫu khai sẵn cho lớp case mà `chu` (cột B/C) mô tả. `None` nếu không lớp nào khớp."""
    for tu, gt in MAU_NHAP_KHAI:
        if chua_tu(chu, *tu):
            return gt
    return None


def gia_tri_qa_cho_o(nhan, o=None, ma='', ten=''):
    """Giá trị đổ vào một ô BẮT BUỘC dạng NHẬP khi SETUP dựng bản ghi QA. -> chuỗi.

    `o` là mô tả ô đọc từ hộp thoại (`live_ui.doc_hop_thoai()['o'][i]`): cần nó để biết KIỂU ô
    — đổ chữ vào `input[number]` thì ô rỗng và biểu mẫu vẫn báo thiếu, mà nhìn log thì tưởng
    đã điền. Không có `o` thì suy theo nhãn.
    """
    o = o or {}
    nb = ' '.join(x for x in (str(nhan or ''), str(o.get('goi_y') or '')) if x)
    the = str(o.get('the') or '')
    if 'number' in the:
        # Ô số: mọi giá trị chữ ở bảng trên đều vô nghĩa với nó. `1` nằm trong mọi khoảng
        # min/max thường gặp (`port_min` của chính màn Vị trí lưu trữ cũng là 1).
        return '1'
    for tu, gt in QA_GIA_TRI_O:
        if chua_tu(nb, *tu):
            return gt
    if the.startswith('textarea'):
        return '%s — dữ liệu QA tự động' % (ten or ma or QA_TIEN_TO)
    return ma or ten or QA_TIEN_TO


def la_ma_cua_run(ma, run_id):
    """Mã này có phải do CHÍNH lượt chạy `run_id` sinh ra không? (lớp ① của §4d)

    Chặt hơn `la_ban_ghi_qa` một bậc và cố ý: `la_ban_ghi_qa` trả lời *"có phải dữ liệu test
    không"* (dùng để CHẶN), còn hàm này trả lời *"có phải của TA không"* (dùng để CHO PHÉP).
    Nới hàm này ra thành "mang dấu zzqa bất kỳ" là cho phép một lượt chạy xoá bản ghi mà lượt
    khác đang dùng — và trên app thật thì lượt khác có thể là người khác.
    """
    van = qa_van(run_id)
    m = _RX_MA_QA.match(str(ma or '').strip().lower())
    return bool(van and m and m.group(1) == van)


def dau_van_tay(tai_khoan, origin, run_id):
    """Vân tay CHỦ SỞ HỮU của phiên (lớp ③). Không chứa mật khẩu, không chứa token.

    Băm tài khoản thay vì ghi thẳng: vân tay đi vào sổ dữ liệu QA và sổ nằm trong evidence —
    evidence không phải chỗ để tên đăng nhập đi ra ngoài.
    """
    n = '\x1f'.join((norm(tai_khoan or ''), _tach_url(origin or '')[0], str(run_id or '')))
    return hashlib.sha256(n.encode('utf-8')).hexdigest()[:24]


class CuaSoGhiQA:
    """MỘT cửa sổ ghi: khai TRƯỚC khi bấm, đóng NGAY sau khi đọc kết quả.

    Đây là chỗ duy nhất trong cả bộ tool mà một request khác `GET` được coi là hợp lệ, nên
    nó cố tình hẹp tới mức khó chịu:

      · `so_toi_da` request thay đổi dữ liệu, mặc định **1**. Bấm một nút Lưu mà app gửi hai
        `POST` là chuyện phải biết, không phải chuyện cho qua;
      · chỉ những `method` đã khai (`tao` -> POST, `sua` -> PUT/PATCH, `xoa` -> DELETE);
      · chỉ những endpoint đã khai, khớp theo KHUÔN có chỗ trống `{id}`;
      · endpoint mang `{id}`: id trong URL phải nằm trong `ids_qa`. Chưa biết id (bản ghi vừa
        tạo ở lượt này chưa kịp đọc lại) thì id ĐẦU TIÊN quan sát được sẽ bị **buộc** vào cửa
        sổ và mọi id khác sau đó là vi phạm — một cửa sổ mở cho một bản ghi, không phải cho
        một họ bản ghi.

    Cửa sổ KHÔNG tự đóng theo thời gian: đóng là việc của người mở (`với` / `dong()`), và
    quên đóng thì `kiem_tra_dong()` của lượt chạy tố ra — hết hạn theo đồng hồ thì một app
    chậm sẽ biến vi phạm thành "không thấy gì".
    """

    METHOD_CUA = {'tao': ('POST',), 'sua': ('PUT', 'PATCH', 'POST'),
                  'xoa': ('DELETE', 'POST'), 'doc': ()}
    # Số lần app được phép gửi TRÙNG một request đã cho qua (cùng method + path). Nhỏ và cố
    # định: nó dung thứ cho tật gửi trùng của app, không dung thứ cho một vòng lặp chạy loạn.
    LAP_TOI_DA = 2

    def __init__(self, case_key, hanh_dong, thuc_the, ma, endpoints, ids_qa=(),
                 so_toi_da=1, mo_ta='', so_id_toi_da=1):
        if hanh_dong not in self.METHOD_CUA:
            raise ValueError('hành động cửa sổ ghi phải là %s' % '/'.join(self.METHOD_CUA))
        self.case_key = str(case_key or '')
        self.hanh_dong = hanh_dong
        self.thuc_the = str(thuc_the or '')
        self.ma = str(ma or '')
        self.endpoints = tuple(endpoints or ())
        self.ids_qa = {str(x) for x in (ids_qa or ()) if str(x).strip()}
        self.so_toi_da = max(1, int(so_toi_da or 1))
        # Bao nhiêu id MỚI được phép buộc vào cửa sổ. Mặc định 1 (một cửa sổ, một bản ghi).
        # Xoá hàng loạt là ca duy nhất cần nhiều hơn: N bản ghi QA đã tích chọn ⇒ N lệnh xoá,
        # mỗi lệnh một id mà ta KHÔNG biết trước (tạo bằng biểu mẫu thì id không lộ ra DOM).
        # Vẫn chặt: chỉ nhận đúng N id đầu tiên, id thứ N+1 là vi phạm — nên một lệnh xoá lạc
        # sang bản ghi thật vẫn bị tố.
        self.so_id_toi_da = max(1, int(so_id_toi_da or 1))
        self.mo_ta = mo_ta
        self.mo_luc = time.time()
        self.dong_luc = None
        self.da_dung = []            # [(method, url đã che, id)] — mutation đã cho qua
        self.id_buoc = set()         # id được BUỘC vào cửa sổ khi quan sát lần đầu

    # ── khớp một request ─────────────────────────────────────────────────────
    def khop(self, method, url):
        """(có cho qua không, lý do, id đọc được). KHÔNG bao giờ thay đổi trạng thái."""
        if self.dong_luc is not None:
            return False, 'cửa sổ ghi ĐÃ ĐÓNG lúc %s' % time.strftime(
                '%H:%M:%S', time.localtime(self.dong_luc)), None
        m = (method or '').upper()
        if m not in self.METHOD_CUA[self.hanh_dong]:
            return False, ('method %s không thuộc hành động %r (chỉ %s)'
                           % (m, self.hanh_dong,
                              '/'.join(self.METHOD_CUA[self.hanh_dong]) or 'không method nào')), None
        khop_ep, ma_id = None, None
        for ep in self.endpoints:
            ok, x = khop_khuon_endpoint(url, ep)
            if ok:
                khop_ep, ma_id = ep, x
                break
        if khop_ep is None:
            # Chẩn đoán ca hay gặp nhất: hồ sơ màn khai đường dẫn API THIẾU TIỀN TỐ (`/api/v1`,
            # `/api/db-tool/v1`…) vì bundle FE ghép base URL ở chỗ khác. Không nới hàng rào —
            # vẫn chặn — nhưng nói thẳng ra chỗ phải sửa, thay vì để người chạy tự mò.
            _, d_url = _tach_url(url)
            goi_y = ''
            for ep in self.endpoints:
                _, d_ep = _tach_url(ep.replace('{id}', 'x'))
                than = d_ep.rsplit('/x', 1)[0] if d_ep.endswith('/x') else d_ep
                if than and than != '/' and d_url.endswith(than):
                    goi_y = ('. CÓ VẺ hồ sơ màn khai THIẾU TIỀN TỐ: đường dẫn thật là %r, '
                             'khai là %r — sửa `grounding.api` rồi chạy lại'
                             % (d_url, d_ep))
                    break
            return False, ('endpoint ngoài danh sách đã khai của cửa sổ (%s)%s'
                           % (' · '.join(self.endpoints), goi_y)), None
        if ma_id is not None:
            biet = self.ids_qa | self.id_buoc
            if biet and ma_id not in biet and len(self.id_buoc) >= self.so_id_toi_da:
                return False, ('id %r trong URL KHÔNG thuộc bản ghi QA của lượt chạy '
                               '(đã biết: %s; hạn mức buộc thêm id: %d)'
                               % (ma_id, ' · '.join(sorted(biet)[:4]),
                                  self.so_id_toi_da)), ma_id
        if len(self.da_dung) >= self.so_toi_da:
            # App tự gửi TRÙNG cùng một request (cùng method + cùng path) trong cùng một cửa
            # sổ là hành vi của app, **không phải** thao tác vượt phạm vi: nó vẫn đúng endpoint,
            # đúng bản ghi. Hạn mức sinh ra để bắt *chạy loạn*, không phải để bắt *gửi trùng*.
            # Đo trên app thật 15/09: một cú bấm "Tạo loại nguồn" sinh 2 POST cách nhau 234 ms
            # ⇒ bản đầu dừng cả lượt chạy 297 case ở case thứ 170. Cho qua, nhưng ĐẾM riêng và
            # nêu trong evidence để đây là một phát hiện chứ không phải chuyện bị nuốt.
            lap = [x for x in self.da_dung
                   if x['method'] == m and x.get('path') == _tach_url(url)[1]]
            if lap and len(self.da_dung) < self.so_toi_da + self.LAP_TOI_DA:
                return True, ('QA scope: case %s · thực thể %s · hành động %s · bản ghi %s '
                              '(APP GỬI TRÙNG lần %d — cùng %s %s)'
                              % (self.case_key or '-', self.thuc_the or '-', self.hanh_dong,
                                 self.ma or '(chưa có mã)', len(lap) + 1, m,
                                 _tach_url(url)[1])), ma_id
            return False, ('vượt hạn mức %d request ghi của cửa sổ (đã dùng %d)'
                           % (self.so_toi_da, len(self.da_dung))), ma_id
        return True, ('QA scope: case %s · thực thể %s · hành động %s · bản ghi %s'
                      % (self.case_key or '-', self.thuc_the or '-', self.hanh_dong,
                         self.ma or '(chưa có mã)')), ma_id

    def dung(self, method, url, ma_id=None):
        """Ghi nhận một mutation ĐÃ được cho qua — buộc id vào cửa sổ nếu chưa biết."""
        if ma_id and str(ma_id) not in (self.ids_qa | self.id_buoc) \
                and len(self.id_buoc) < self.so_id_toi_da:
            self.id_buoc.add(str(ma_id))
        self.da_dung.append({'method': (method or '').upper(), 'url': che_url(url),
                             'path': _tach_url(url)[1], 'id': ma_id,
                             'luc': time.strftime('%Y-%m-%d %H:%M:%S')})

    def dong(self):
        if self.dong_luc is None:
            self.dong_luc = time.time()
        return self

    @property
    def dang_mo(self):
        return self.dong_luc is None

    def khoi(self):
        """Khối JSON cho evidence — §13 đòi mỗi WRITE ghi rõ testcase + thực thể + hành động."""
        return {'case': self.case_key, 'thuc_the': self.thuc_the, 'hanh_dong': self.hanh_dong,
                'ban_ghi': self.ma, 'endpoints': list(self.endpoints),
                'ids_qa': sorted(self.ids_qa), 'id_buoc': sorted(self.id_buoc),
                'so_toi_da': self.so_toi_da, 'so_id_toi_da': self.so_id_toi_da,
                'so_da_dung': len(self.da_dung),
                'so_lan_app_gui_trung': max(0, len(self.da_dung) - self.so_toi_da),
                'mutation': self.da_dung, 'mo_ta': self.mo_ta,
                'mo_luc': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(self.mo_luc)),
                'dong_luc': (time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(self.dong_luc))
                             if self.dong_luc else None)}


def khop_khuon_endpoint(url, khuon):
    """(khớp không, id đọc được) — khuôn có thể mang một chỗ trống `{id}`.

    `"/ingestion/source-types/{id}"` khớp `/ingestion/source-types/42` và trả `'42'`; khuôn
    không có `{id}` thì trả `(True, None)` khi path khớp ĐÚNG BẰNG (mượn `khop_endpoint`).
    Chỗ trống chỉ nuốt **một đoạn** đường dẫn: `/a/{id}` KHÔNG khớp `/a/42/child` — một khuôn
    nuốt được nhiều đoạn là một khuôn mở cửa cho endpoint chưa ai khai.
    """
    khuon = str(khuon or '').strip()
    if not khuon:
        return False, None
    if '{id}' not in khuon:
        return khop_endpoint(url, khuon), None
    o_k, d_k = _tach_url(khuon.replace('{id}', '\x00'))
    o_u, d_u = _tach_url(url)
    if o_k and o_k != o_u:
        return False, None
    mau = '^' + '([^/]+)'.join(re.escape(x) for x in d_k.split('\x00')) + '$'
    m = re.match(mau, d_u)
    if not m:
        return False, None
    return True, m.group(1)


# Hồ sơ màn được phép ghi endpoint theo lối RÚT GỌN (`POST /targets`) rồi khai gốc REST ở
# một dòng riêng (`gốc REST: /api/db-tool/v1 — kèm header…`). Hai lối cùng hợp lệ với người
# đọc, nhưng cửa sổ ghi khớp **path ĐÚNG BẰNG**, nên lối rút gọn làm mọi mutation hợp lệ bị
# xếp `WRITE` và DỪNG lượt chạy — đúng lúc bản ghi QA vừa được tạo trên app thật (đo 16/09,
# màn `Vị trí lưu trữ`: `POST /api/db-tool/v1/targets` vs khai `/targets`).
#
# Nối lại ở ĐÂY chứ không sửa từng hồ sơ màn: hàng rào phải đọc được cả hai lối khai, và một
# bộ case sinh sau vẫn có thể khai lối rút gọn.
_RX_GOC_REST = re.compile(r'g[ốô]c\s+REST\s*[:=]\s*(/[^\s,;]*)', re.I)


def _goc_rest(ds_api):
    """Tiền tố gốc REST khai trong `grounding.api` (dòng `gốc REST: /api/...`). '' nếu không có."""
    for dong in ds_api or []:
        m = _RX_GOC_REST.search(str(dong))
        if m:
            return '/' + m.group(1).strip('/')
    return ''


def _day_du(ep, goc):
    """Endpoint đầy đủ: nối `goc` vào trước `ep` khi `ep` chưa mang tiền tố ấy."""
    ep = str(ep or '')
    if not goc or not ep.startswith('/') or ep.startswith(goc + '/') or ep == goc:
        return ep
    return goc + ep


def endpoints_ghi(hs_man, thuc_the=''):
    """Khuôn endpoint GHI rút từ `grounding.api` của hồ sơ màn -> {'tao':[…],'sua':[…],'xoa':[…]}.

    Hồ sơ màn ghi API theo lối người đọc (`"PUT  /ingestion/source-types/{id}  (updateSourceType…)"`)
    nên phải rút bằng luật, không bằng mắt. Rút được gì thì khai đúng thứ đó: **không suy
    diễn** thêm endpoint nào — cửa sổ ghi mở đúng bằng những gì hồ sơ màn chứng minh được.
    """
    ra = {'tao': [], 'sua': [], 'xoa': []}
    ds = ((hs_man or {}).get('grounding') or {}).get('api') or []
    goc = _goc_rest(ds)
    for dong in ds:
        m = re.match(r'\s*(GET|POST|PUT|PATCH|DEL|DELETE)\s+(\S+)', str(dong))
        if not m:
            continue
        me, ep = m.group(1).upper(), _day_du(m.group(2), goc)
        if ':' in ep.rsplit('/', 1)[-1]:
            continue                      # `/x:export` — endpoint hành động, không phải CRUD
        if me == 'POST' and '{id}' not in ep:
            ra['tao'].append(ep)
        elif me == 'POST':
            # ⚠️ VÁ 2026-09-17 lượt 2. `POST` MANG `{id}` là một hành động đổi trạng thái trên
            # một bản ghi ĐÃ CÓ (`POST /targets/{id}/activate`), tức thuộc nhóm `sua` — không
            # phải `tao`. Bản trước không xếp nó vào nhóm nào cả, nên nó **không cửa sổ ghi
            # nào khai được**: phép chuyển trạng thái mở cửa sổ `sua`, app bắn `/activate`, và
            # sổ mạng tố đúng một request GHI ngoài danh sách rồi DỪNG cả lượt chạy (đo được
            # 17/09, lượt chẩn đoán chết ở case 66/89).
            #
            # Đây KHÔNG phải nới hàng rào: endpoint này do chính hồ sơ màn khai
            # (`POST /targets/{id}/activate (activateTarget)`), chỉ là trước đây bị rơi mất
            # lúc phân nhóm. Hàng rào vẫn chỉ cho đúng những gì hồ sơ màn chứng minh được.
            ra['sua'].append(ep)
        elif me in ('PUT', 'PATCH'):
            ra['sua'].append(ep)
        elif me in ('DEL', 'DELETE'):
            ra['xoa'].append(ep)
    return ra


# ══════════════════════════════════════════════════════════════════════════════
# 4e. MÔ PHỎNG MẠNG (`page.route()`)  — chỉ thị người đặt việc 2026-09-16
# ══════════════════════════════════════════════════════════════════════════════
# Vấn đề: một loạt case chỉ kiểm HÀNH VI CỦA MÀN trước một phản hồi nhất định — danh sách
# rỗng · đang tải · API 400/401/403/404/409/500 · timeout · dữ liệu dài · nhiều bản ghi.
# Dựng chúng bằng dữ liệu thật thì hoặc không dựng được, hoặc phải phá dữ liệu thật. Cả hai
# lối đều dẫn về `PE`, và PE ở đây là *"tool chưa có cách"* chứ không phải *"không đo được"*.
#
# Cách giải: GIỮ request lại ngay trong trình duyệt (`Fetch.requestPaused`) rồi tự trả lời
# (`Fetch.fulfillRequest`). Đúng thứ `page.route()` của Playwright làm, và cũng đúng một
# tầng với sổ mạng hiện có nên không phải mở đường quan sát thứ hai.
#
# Ba luật, không luật nào được nới:
#
#   ① **MOCK không bao giờ là bằng chứng cho nghiệp vụ máy chủ.** Nó chỉ chứng minh MÀN cư
#      xử thế nào trước một phản hồi. Case hỏi *"lưu đúng vào database"* mà chấm P bằng mock
#      là nói dối — phép đo phải tự từ chối, xem `MUC_MOCK_CAM`.
#   ② **Mọi kết luận dựng bằng mock phải mang dấu `[MOCK]`** kèm endpoint + kịch bản, để
#      người đọc kết quả biết ngay mức bằng chứng (§muc_bang_chung).
#   ③ **Request GHI bị mock KHÔNG được coi là hợp lệ vì đã khai** — nó hợp lệ vì **chứng
#      minh được nó chưa từng tới máy chủ**: `Network.requestWillBeSent.requestId` phải có
#      mặt trong danh sách request đã bị GIỮ và đã được trả lời tại trình duyệt
#      (`Fetch.requestPaused.networkId`). Không chứng minh được ⇒ vẫn là `WRITE` ⇒ dừng lượt.
MOCK = 'MOCKED'                     # request bị giữ tại trình duyệt, KHÔNG tới máy chủ

# Mức bằng chứng của một kết luận — ghi vào cột T để người đọc biết đang tin vào cái gì.
MUC_UI, MUC_API, MUC_DB, MUC_MOCK = 'UI', 'API', 'DB', 'MOCK'

# Mục đích case mà mock KHÔNG BAO GIỜ được dùng làm bằng chứng: chúng hỏi máy chủ đã làm gì,
# mà mock thì thay hẳn máy chủ. Khớp trên tiêu đề đã normalize.
MUC_MOCK_CAM = ('luu dung vao database', 'luu vao database', 'khop db', 'khop voi db',
                'trong database', 'xoa ban ghi trong database', 'doi chieu csdl')

# Kịch bản dựng sẵn -> (mã trạng thái, thân, mô tả). `None` ở mã trạng thái = không trả lời
# (dùng cho `treo`/`timeout`: giữ request cho tới khi hết giờ chờ của phép đo).
KICH_BAN_MOCK = {
    'rong':        (200, None, 'API trả danh sách RỖNG (0 bản ghi)'),
    'dang_tai':    (None, None, 'API không trả lời — màn phải ở trạng thái ĐANG TẢI'),
    'timeout':     (None, None, 'API treo quá hạn — màn phải báo lỗi tải, không treo trắng'),
    'loi_400':     (400, None, 'API trả 400 Bad Request'),
    'loi_401':     (401, None, 'API trả 401 Unauthorized'),
    'loi_403':     (403, None, 'API trả 403 Forbidden'),
    'loi_404':     (404, None, 'API trả 404 Not Found'),
    'loi_409':     (409, None, 'API trả 409 Conflict (trùng dữ liệu)'),
    'loi_500':     (500, None, 'API trả 500 Internal Server Error'),
    'du_lieu_dai': (200, None, 'API trả bản ghi có trường VĂN BẢN RẤT DÀI'),
    'nhieu_ban_ghi': (200, None, 'API trả NHIỀU bản ghi (đủ để sinh nhiều trang)'),
    'xss':         (200, None, 'API trả dữ liệu mang payload XSS'),
    'cham':        (200, None, 'API trả lời CHẬM (đo trạng thái đang tải)'),
}


# Một nút "có chữ" là nút chứa ít nhất một CHỮ CÁI (kể cả chữ Việt có dấu) hoặc chữ số.
# Ký tự hình (`⏹ ✎ 🗑 👁 ▾`) KHÔNG phải chữ.
_CO_CHU = re.compile(r'[0-9A-Za-zÀ-ỹ]')


def co_chu(s):
    """`s` có chữ cái/chữ số nào không — dùng để tách nút CÓ CHỮ với nút CHỈ CÓ ICON.

    ⚠️ Đặt ở đây vì cùng một câu hỏi đã sinh ra cùng một lỗi ở HAI phép đo khác nhau
    (18/09): `can_le_chinh_ta_nut` và `hinh_hoc_nut` đều đem ký tự hình `⏹` của một nút
    chỉ-có-icon đi đối chiếu bản verbatim, không khớp, rồi chốt **F** — *"không khớp chuỗi
    nào"* — cho một nút không hề sai chính tả. Lần vá thứ nhất chỉ chữa một trong hai chỗ,
    và bộ `kiem_phep_moi` chạy thật bắt lại đúng câu F ấy ở lượt sau.

    Nút không có chữ thì phép soi CHÍNH TẢ không có gì để soi: phải nhường cho phép đo hình
    học icon (đo icon căn giữa trong nút + đọc chú thích), chứ không được kết luận.
    """
    return bool(_CO_CHU.search(s or ''))


def chua_tu(chuoi, *tu):
    """`chuoi` (đã/chưa bỏ dấu) có chứa một trong các TỪ `tu` không — theo BIÊN TỪ.

    Vì sao phải có hàm này thay vì `k in s`: cùng một lỗi đã cắn ba lần trong lớp live, và
    lần nào cũng im lặng.

      · `'an'` khớp vào giữa `'màn'`   -> *"Mở màn Vị trí lưu trữ"* thành thao tác GHI;
      · `'dong'` khớp vào giữa `'Hoạt động'` -> bước CHỌN GIÁ TRỊ thành bước TÍCH CHỌN;
      · `'huy'` khớp vào giữa `'Chuyển'` -> nút `Chuyển trạng thái` bị loại khỏi danh sách
        nút chốt (vì tưởng là nút `Hủy`), phép đo bấm nhầm rồi tự trả `None`.

    Ba lỗi trên đều KHÔNG làm chương trình chết: chúng đổi kết luận. Nên chỗ nào so khớp
    từ khoá tiếng Việt cũng phải đi qua đây.
    """
    s = norm(chuoi)
    for k in tu:
        k = norm(k)
        if k and re.search(r'(?:^|[^0-9a-z])%s(?:[^0-9a-z]|$)' % re.escape(k), s):
            return True
    return False


def la_case_cam_mock(tieu_de, cac_buoc=''):
    """Case này có phải loại mà mock KHÔNG được dùng làm bằng chứng không? (luật ① §4e)"""
    t = norm('%s %s' % (tieu_de or '', cac_buoc or ''))
    return any(k in t for k in MUC_MOCK_CAM)


class CuaSoMock:
    """MỘT cửa sổ mô phỏng mạng: khai TRƯỚC khi bật chặn, đóng NGAY sau khi đọc kết quả.

    Cùng khuôn với `CuaSoGhiQA` (§4d) và cùng lý do: một cơ chế can thiệp vào app đang chạy
    thì phải có phạm vi khai trước, có hạn mức, và có sổ để đối chiếu sau.

        cs = qalib.CuaSoMock(case_key='r25', kich_ban='rong', endpoints=['/api/items'])

    `endpoints` khớp theo **khuôn có chỗ trống `{id}`** như cửa sổ ghi; khai rỗng là KHÔNG
    khớp gì (một dòng khai rỗng không được mở toang cả trang).
    """

    def __init__(self, case_key, kich_ban, endpoints, mo_ta='', so_toi_da=200):
        if kich_ban not in KICH_BAN_MOCK:
            raise ValueError('kịch bản mock lạ: %r (có: %s)'
                             % (kich_ban, ', '.join(sorted(KICH_BAN_MOCK))))
        self.case_key = str(case_key or '')
        self.kich_ban = kich_ban
        self.endpoints = tuple(x for x in (endpoints or ()) if str(x).strip())
        self.mo_ta = mo_ta or KICH_BAN_MOCK[kich_ban][2]
        self.so_toi_da = max(1, int(so_toi_da or 1))
        self.mo_luc = time.time()
        self.dong_luc = None
        self.da_chan = []            # [{'method','url','requestId','networkId','xu_ly'}]
        self.id_mang = set()         # networkId của request đã bị GIỮ — bằng chứng của luật ③

    @property
    def dang_mo(self):
        return self.dong_luc is None

    def khop(self, url):
        """URL này có nằm trong phạm vi đã khai không? (chỉ đọc, không đổi trạng thái)"""
        for ep in self.endpoints:
            ok, _ = khop_khuon_endpoint(url, ep)
            if ok:
                return True
        return False

    def ghi_chan(self, method, url, request_id, network_id, xu_ly):
        """Ghi lại một request ĐÃ BỊ GIỮ và cách nó được xử. Sổ này là bằng chứng của luật ③."""
        if len(self.da_chan) >= self.so_toi_da:
            raise LoiHangRao(
                'cửa sổ mock của case %s đã giữ %d request (hạn mức %d) — dừng để người soi, '
                'một trang không nên gọi API nhiều tới vậy trong một case'
                % (self.case_key or '-', len(self.da_chan), self.so_toi_da))
        self.da_chan.append({'method': (method or '').upper(), 'url': che_url(url),
                             'requestId': request_id, 'networkId': network_id, 'xu_ly': xu_ly})
        if network_id:
            self.id_mang.add(str(network_id))

    def dong(self):
        if self.dong_luc is None:
            self.dong_luc = time.time()
        return self

    def khoi(self):
        """Khối evidence của cửa sổ — vào `evidence/mock.json`."""
        return {'case': self.case_key, 'kich_ban': self.kich_ban, 'mo_ta': self.mo_ta,
                'endpoints': list(self.endpoints), 'so_request_bi_giu': len(self.da_chan),
                'request': self.da_chan,
                'mo_luc': time.strftime('%H:%M:%S', time.localtime(self.mo_luc)),
                'dong_luc': (time.strftime('%H:%M:%S', time.localtime(self.dong_luc))
                             if self.dong_luc else None)}

    def nhan_xet(self):
        """Dòng `[MOCK]` cho cột T — luật ② của §4e."""
        return ('[MOCK] %s — endpoint %s (%d request bị giữ tại trình duyệt, KHÔNG tới máy chủ)'
                % (self.mo_ta, ' · '.join(self.endpoints) or '?', len(self.da_chan)))


class LoiHangRao(RuntimeError):
    """Hàng rào an toàn của `qalib` phát hiện việc vượt phạm vi đã khai."""


# ══════════════════════════════════════════════════════════════════════════════
# MÀU KẾT QUẢ CỘT R — tô NỀN THẬT vào style của ô, KHÔNG dùng conditional formatting
# ══════════════════════════════════════════════════════════════════════════════
# LibreOffice vẽ nền của conditional formatting ĐÈ LÊN VIỀN ô: ô nào trúng luật là mất
# lưới kẻ, trong khi các cột bên cạnh vẫn còn viền. Triệu chứng người dùng thấy: chạy live
# xong, cột R tô màu P/F/PE tới đâu thì khung bảng mất tới đó (trước khi chạy, cột R còn
# trống nên không luật nào khớp → viền vẫn đủ ⇒ lỗi chỉ lộ SAU khi chạy live).
#
# Đã đo đủ 5 cách trên chính file thật trước khi bỏ CF (render `soffice` → PDF → so từng
# điểm ảnh, 2026-09-12):
#     ① dxf bỏ `<border/>` rỗng          → ảnh GIỐNG HỆT bản hỏng
#     ② dxf bỏ cả `<font/>` rỗng          → giống hệt
#     ③ dxf khai hẳn `<border>` thin      → giống hệt  (LibreOffice bỏ qua viền trong dxf)
#     ④ viền của ô khai màu tường minh    → giống hệt
#     ⑤ BỎ HẲN CF                         → viền trở lại đủ
# ⇒ không có cách nào giữ CF mà còn viền. Màu phải nằm trong style của chính ô.
MAU_KQ = {'P': 'FFC6EFCE', 'F': 'FFFFC7CE', 'PE': 'FFFFEB9C'}


def _fill_kq(rgb):
    return ('<fill><patternFill patternType="solid"><fgColor rgb="%s"/>'
            '<bgColor rgb="%s"/></patternFill></fill>' % (rgb, rgb))


class BangMau:
    """Cấp style-id cho ô cột R theo kết quả P/F/PE, GIỮ NGUYÊN viền/phông/căn lề của ô.

        bm = qalib.BangMau(styles_xml)
        sid = bm.style(sid_cu, 'P')      # 'P'/'F'/'PE' → nền màu; '' → trả style GỐC
        if bm.doi: styles_xml = bm.xml   # ghi lại `xl/styles.xml`

    `style()` luôn bóc nền kết quả cũ ra trước rồi mới tô, nên chấm lại P→F hay xoá kết quả
    đều không đẻ style rác và không cộng dồn màu.

    Nhận ra "nền kết quả" bằng cách SO KHỚP NGUYÊN VĂN chuỗi fill do chính lớp này sinh —
    không so theo mã màu, để không nhầm với ô nền xanh/hồng sẵn có của file mẫu (dòng nhóm,
    dòng tiêu đề) vốn khai fill theo cách khác.
    """

    def __init__(self, styles_xml):
        self.goc_xml = styles_xml
        self.doi = False
        m = re.search(r'(<fills\b[^>]*>)(.*?)</fills>', styles_xml, re.S)
        x = re.search(r'(<cellXfs\b[^>]*>)(.*?)</cellXfs>', styles_xml, re.S)
        self.ok = bool(m and x)
        if not self.ok:                       # bảng style lạ: không đụng vào, trả style cũ
            return
        self._fm, self._xm = m, x
        self.fills = re.findall(r'<fill\b(?:[^>]*/>|.*?</fill>)', m.group(2), re.S)
        self.xfs = re.findall(r'<xf\b(?:[^>]*/>|.*?</xf>)', x.group(2), re.S)
        self._fid = {}                        # mark -> chỉ số fill
        self._nen_kq = set()
        for i, f in enumerate(self.fills):
            mark = self._la_nen_kq(f)
            if mark:
                self._nen_kq.add(i)
                self._fid.setdefault(mark, i)

    # ── nội bộ ────────────────────────────────────────────────────────────────
    _RGB = re.compile(r'<fgColor rgb="([0-9A-Fa-f]{6,8})"')

    @classmethod
    def _la_nen_kq(cls, fill):
        """fill này là nền kết quả nào ('P'/'F'/'PE') — nhận theo MÃ MÀU của `fgColor`.

        Không so nguyên văn chuỗi fill: người thật mở file bằng LibreOffice rồi lưu là
        `styles.xml` bị ghi lại (bgColor đổi, fill không ai dùng bị dọn). So nguyên văn thì
        sau đúng một lần lưu, tool không còn nhận ra nền của chính nó — bộ rà báo `MAU` sai
        OAN và mỗi lần chạy lại đẻ thêm một fill + một style trùng lặp.
        Ba mã màu này KHÔNG có trong bảng màu của file mẫu (đã kiểm: 30 fill, không cái nào
        trùng), nên không sợ nhận nhầm nền sẵn có của dòng nhóm / dòng tiêu đề.
        """
        if 'patternType="solid"' not in fill:
            return None
        m = cls._RGB.search(fill)
        if not m:
            return None
        rgb = m.group(1).upper()[-6:]
        for mark, c in MAU_KQ.items():
            if rgb == c[-6:]:
                return mark
        return None

    def _fid_cua(self, mark):
        if mark in self._fid:
            return self._fid[mark]
        self.fills.append(_fill_kq(MAU_KQ[mark]))
        self._fid[mark] = len(self.fills) - 1
        self._nen_kq.add(self._fid[mark])
        self.doi = True
        return self._fid[mark]

    @staticmethod
    def _khong_fill(xf):
        return re.sub(r'\s*(?:fillId="\d+"|applyFill="[^"]*")', '', xf)

    def _nen_hien(self, sid):
        """Ô đang mang nền kết quả nào ('P'/'F'/'PE'), hay None nếu không mang nền nào."""
        if not self.ok or sid >= len(self.xfs):
            return None
        f = re.search(r'fillId="(\d+)"', self.xfs[sid])
        if not f or int(f.group(1)) >= len(self.fills):
            return None
        return self._la_nen_kq(self.fills[int(f.group(1))])

    def goc(self, sid):
        """Style GỐC của ô (bóc nền kết quả nếu đang có). Không có nền kết quả → trả lại sid."""
        if not self.ok or sid >= len(self.xfs):
            return sid
        f = re.search(r'fillId="(\d+)"', self.xfs[sid])
        if not f or int(f.group(1)) not in self._nen_kq:
            return sid
        khoa = self._khong_fill(self.xfs[sid])
        for i, xf in enumerate(self.xfs):      # style sinh ra nó vẫn còn trong bảng
            f2 = re.search(r'fillId="(\d+)"', xf)
            if (f2 and int(f2.group(1)) not in self._nen_kq
                    and self._khong_fill(xf) == khoa):
                return i
        return self._them_xf(sid, 0)           # không tìm được: dựng bản không nền

    def _them_xf(self, base, fid):
        xf = self.xfs[base]
        if 'fillId=' in xf:
            xf = re.sub(r'fillId="\d+"', 'fillId="%d"' % fid, xf)
        else:
            xf = re.sub(r'<xf\b', '<xf fillId="%d"' % fid, xf, count=1)
        if 'applyFill=' in xf:
            xf = re.sub(r'applyFill="[^"]*"', 'applyFill="1"', xf)
        else:
            xf = xf.replace('fillId="%d"' % fid, 'fillId="%d" applyFill="1"' % fid, 1)
        if xf in self.xfs:
            return self.xfs.index(xf)
        # chưa khớp nguyên văn thì tìm style KHÁC MỖI CÁCH GHI thuộc tính fill (LibreOffice
        # ghi `applyFill="true"`, bản gốc ghi `applyFill="1"`…) — không thì mỗi lần đổi
        # P↔F trên file đã qua tay LibreOffice lại đẻ thêm một style y hệt.
        khoa = self._khong_fill(xf)
        for i, y in enumerate(self.xfs):
            f2 = re.search(r'fillId="(\d+)"', y)
            if f2 and int(f2.group(1)) == fid and self._khong_fill(y) == khoa:
                return i
        self.xfs.append(xf)
        self.doi = True
        return len(self.xfs) - 1

    # ── dùng bên ngoài ────────────────────────────────────────────────────────
    def style(self, sid, mark):
        """sid mới cho ô cột R mang kết quả `mark` ('' / None = chưa chạy → style gốc)."""
        if not self.ok or sid >= len(self.xfs):
            return sid            # style-id lạ (ngoài bảng): không đoán, trả nguyên
        mark = (mark or '').strip()
        can = mark if mark in MAU_KQ else None
        if self._nen_hien(sid) == can:
            return sid            # đang đúng nền rồi — đừng đẻ style mới
        base = self.goc(sid)
        if not can:
            return base
        return self._them_xf(base, self._fid_cua(mark))

    def sai_mau(self, sid, mark):
        """True khi ô đang mang nền KHÔNG khớp kết quả — dùng cho phép rà."""
        return self.ok and self.style(sid, mark) != sid

    @property
    def xml(self):
        if not (self.ok and self.doi):
            return self.goc_xml
        s = self.goc_xml
        moi_f = (re.sub(r'count="\d+"', 'count="%d"' % len(self.fills), self._fm.group(1), count=1)
                 + ''.join(self.fills) + '</fills>')
        moi_x = (re.sub(r'count="\d+"', 'count="%d"' % len(self.xfs), self._xm.group(1), count=1)
                 + ''.join(self.xfs) + '</cellXfs>')
        s = s[:self._fm.start()] + moi_f + s[self._fm.end():]
        m = re.search(r'(<cellXfs\b[^>]*>)(.*?)</cellXfs>', s, re.S)
        return s[:m.start()] + moi_x + s[m.end():]


def write_marks(path, plan, backup_suffix='bak_run', cols=('F', 'T'), lan_prefix=True, bp=None):
    """Ghi cột F (kết quả) + cột T (ghi chú) vào file `*_ket_qua`, giữ nguyên style từng ô.

    KHÔNG đụng cột R (công thức) — chạy `postfix_cache_*.py` sau để tính lại cache
    cột R + D4:D8 + sheet Tổng hợp.

    plan — [(số dòng, mark, note)] từ `build_marks()`. `mark = None` -> CHỈ ghi ghi chú
           (dùng cho cờ `[DB PARTIAL]` của §4b: case vẫn do lượt chạy chấm P/F).
    bp   — tên sheet BP cần ghi. Bỏ trống là sheet BP ĐẦU TIÊN; file gộp màn phụ theo lối
           `sheet_rieng` có NHIỀU sheet test case, gọi lần lượt từng sheet (mỗi lần ghi đọc
           lại đúng file trên đĩa nên không đè mất sheet vừa ghi — khác `TC.save()`).
    lan_prefix — thêm tiền tố `[Lần N]` vào ghi chú theo việc ô kết quả đã có giá trị chưa.
    backup_suffix — nhãn `tag` của bản lùi; bản lùi nằm trong `bak_dir()`, KHÔNG cạnh file gốc.
    """
    if is_locked(path):
        raise RuntimeError('file đang mở trong LibreOffice, không được ghi: ' + path)
    tc = tcfix.load(path, bp)
    backup(path, tag=backup_suffix, quiet=False)
    sheet = tc.sheet
    col_mark, col_note = cols
    for rn, mark, note in plan:
        if lan_prefix:
            old = (tc.c(rn, col_mark) or '').strip()
            note = '[%s] %s' % ('Lần 2' if old else 'Lần 1', note)
        # `[DB PARTIAL]` là cờ của CASE (§4b), không phải ghi chú của một lượt chạy: lượt chạy
        # ghi đè cột T thì cờ phải còn — mất cờ là mất đúng câu nói "P/F này chưa gồm CSDL".
        cu = (tc.c(rn, col_note) or '').strip()
        if CO_DB_MOT_PHAN in cu and CO_DB_MOT_PHAN not in note:
            note = cu + '\n\n' + note
        for col, val in ((col_mark, mark), (col_note, note)):
            if val is None:
                continue
            cm = re.search(r'<c r="%s%d"[^>]*?(?:/>|>.*?</c>)' % (col, rn), sheet, re.S)
            st = re.search(r's="(\d+)"', cm.group(0)).group(1) if cm else '0'
            new = ('<c r="%s%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
                   % (col, rn, st, tcfix.esc(val)))
            if cm:
                sheet = sheet.replace(cm.group(0), new, 1)
    # Luật 14/09 (§4b): case đối chiếu CSDL `toan_bo` phải là PE. KHÔNG tự đổi mark của lượt
    # chạy (dự án có quyền truy vấn thì P/F là đúng) — nhưng KÊU, vì im lặng ở đây là đúng lớp
    # lỗi "ghi xong rồi không ai biết đã ghi sai luật".
    sai = [rn for rn, mark, _ in plan if mark in ('P', 'F')
           and muc_case_db(tc, rn)[0] == 'toan_bo']
    if sai:
        print('!! %d dòng là case ĐỐI CHIẾU CSDL mà lượt chạy chấm P/F (luật 14/09 đòi PE): %s'
              % (len(sai), ' '.join('r%d' % r for r in sai[:12])))
        print('   ⇒ soi lại bằng `python3 pe_db.py <Role> [màn] --check`; giữ P/F thì cột T phải '
              'có bằng chứng ĐÃ CHẠY được truy vấn thật.')
    z = zipfile.ZipFile(path)
    tmp = path + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
        for it in z.infolist():
            out.writestr(it, sheet.encode() if it.filename == tc.tcf else z.read(it.filename))
    z.close()
    os.replace(tmp, path)
    return len(plan)


# ══════════════════════════════════════════════════════════════════════════════
# 5. BƠM CASE CHO NHÓM DƯỚI ĐỊNH MỨC  (bộ case nguồn: quota_cases.py)
# ══════════════════════════════════════════════════════════════════════════════
# nhãn loại control của QUOTA  ->  tên hằng bộ case trong `quota_cases.py`
KINDSRC = {
    'Textbox chữ': 'TEXTBOX', 'Textbox tìm kiếm': 'SEARCHBOX', 'Textbox số': 'NUMBOX',
    'Textbox mã (unique)': 'TEXTBOX_MA',
    'Textarea': 'TEXTAREA', 'Selectbox': 'SELECTBOX_FULL', 'Checkbox': 'CHECKBOX',
    'Email': 'EMAIL', 'Số điện thoại': 'PHONE', 'Danh sách / lưới': 'LIST',
    'Icon': 'ICON', 'Selectbox Số bản ghi trên trang': 'PERPAGE',
    # 2026-09-07 (chỉ thị người đặt việc): bộ `PAGING` là bộ DỰ ÁN TỰ ĐẶT, đã LỖI THỜI —
    # đủ 14 case nhưng sai bộ mục và sai wording so với mẫu (thiếu hẳn `Style của paging`,
    # `lưu cache`, 4 case `vị trí trang sau 1 thao tác`; tự thêm mục không có trong mẫu).
    # Bộ CHUẨN là `PAGING_YCHANG` = 14 mục verbatim mẫu r50–r63 (§5.1).
    'Phân trang': 'PAGING_YCHANG', 'Hộp xác nhận': 'DIALOG',
    'Hiển thị chi tiết (chỉ đọc)': 'DETAIL', 'Hiển thị chi tiết': 'DETAIL',
    'Nút chọn (segmented)': 'SEGMENTED', 'Datepicker': 'DATEPICKER',
    'Upload ảnh': 'UPLOAD_IMG', 'Upload file': 'UPLOAD_FILE', 'Button': 'BUTTON',
    # ⚠️ `plan_quota_fill()` tra bank qua BẢNG NÀY, không qua `quota_cases.BY_KIND` —
    # thêm loại control vào QUOTA mà quên dòng ở đây thì nó `continue` LẶNG LẼ, nhóm mãi 0 case
    # (đúng bẫy đã ghi ở 2 dòng dưới cho `Textbox Nhập số trang` / `Checkbox bản ghi`).
    'Tải lại': 'RELOAD',
    # 2026-09-09 — thiếu dòng ở KINDSRC thì `plan_quota_fill` `continue` LẶNG LẼ và nhóm mãi 0
    # case (bẫy đã dính khi thêm loại `Tải lại`). Luôn khai đủ 4 chỗ: QUOTA · KINDSRC · bank ·
    # BY_KIND.
    'Breadcrumb': 'BREADCRUMB', 'Thẻ số liệu': 'THE_SO_LIEU',
    'Selectbox không có ô tìm': 'SELECTBOX',        # bank 6 mục native, không có 7 mục tìm kiếm
    'Ô ngày trình duyệt': 'DATEPICKER_NATIVE', 'Selectbox nhiều lựa chọn': 'SELECTBOX_MULTI',
    # 2026-09-12 — hai bộ mẫu `Tìm kiếm.xlsx` / `Thêm mới.xlsx` người đặt việc gửi có RIÊNG một
    # sheet cho mỗi loại ô ngày dưới đây; trước bản này cả hai đều rơi vào bank ô ngày ĐƠN.
    'Ô ngày có giờ': 'DATEPICKER_GIO', 'Ô ngày nhiều lựa chọn': 'DATEPICKER_KHOANG',
    'Tải file mẫu': 'TEMPLATE_FILE',
    # §5.4 bẫy "đủ số nhưng sai bộ": EXCEL_IMPORT (13) là bộ do dự án tự đặt, THIẾU 5 mục
    # của mẫu. Phải bơm bằng EXCEL_IMPORT_FULL = 13 mục mẫu + mục dự án = 18 (rà: audit_import.py).
    'File Excel': 'EXCEL_IMPORT_FULL',
    # bổ sung 2026-09-03 — hai loại control định mức nâng-mẫu chưa từng có nguồn case trước đây
    'Combobox (searchable)': 'COMBOBOX_FULL', 'Textbox Số bản ghi/trang': 'PAGE_RECORDS',
    # 2026-09-10 — nhóm `Tiêu đề cột sắp xếp` (luật §0.10/§0.13 gọi đích danh, §3 chưa có dòng).
    'Tiêu đề cột sắp xếp': 'COT_SAP_XEP',
    # bổ sung 2026-09-07 — hai loại control có định mức ở §5.1 mà thiếu bộ case nguồn:
    # thiếu nguồn thì plan_quota_fill() `continue` LẶNG LẼ ⇒ sheet không bao giờ chốt 6 số 0.
    'Textbox Nhập số trang': 'PAGE_INPUT', 'Checkbox bản ghi (grid)': 'CHECKBOX_GRID',
}

# khoá mơ hồ (là chuỗi con của khoá khác) -> cụm nhận diện đặc trưng
DISTINCT = {
    'gia tri': ['cac gia tri', 'gia tri co trong', 'gia tri trong', 'danh sach gia tri', 'cac muc trong'],
    'chon ':   ['chon cac gia tri khac nhau', 'chon lan luot', 'chon tung gia tri', 'chi chon duoc mot'],
    'gia tri 0': ['gia tri 0', 'bang 0', '= 0'],
}

_FIELD_PREFIX = re.compile(
    r'^(textbox số|textbox|textarea|selectbox|combobox|checkbox|radio|nút chọn|'
    r'icon|biểu tượng|hộp thoại|danh sách|bảng|ô|button|nút|upload|datepicker|email|'
    r'số điện thoại|phân trang)\s*', re.I)


def field_of(gname):
    """Tên trường rút từ tên nhóm: bỏ tiền tố loại control + phần chú thích trong ngoặc.

    ⚠️ Cắt tiền tố xong mà phần còn lại KHÔNG mở đầu bằng chữ/số thì phải trả lại NGUYÊN tên nhóm.
    Sự cố 2026-09-08 (`Testcase-Role-QuanTri-LuongDuLieu.xlsx`): nhóm `Danh sách / lưới` bị cắt
    `danh sách` còn trơ `/ lưới`, ghép vào 8 case verbatim mẫu ra "Kiểm tra giá trị mặc định
    của / lưới" — mất hẳn tên thực thể. Nhánh `or gname` cũ chỉ cứu được khi phần dư RỖNG,
    mà `/ lưới` là chuỗi truthy nên lọt. Không bộ rà nào bắt (điểm mù #2: `audit_validate_quota`
    chỉ ĐẾM đủ 8 case, không soi tiêu đề) — nay đã có `audit_extra.py` rà tiêu đề hỏng.
    """
    f = _FIELD_PREFIX.sub('', gname).strip()
    f = re.sub(r'\s*\(.*?\)\s*$', '', f).strip()
    if not f or not f[0].isalnum():
        return gname
    return f


# ══════════════════════════════════════════════════════════════════════════════
# PHÂN LOẠI CN — "ô này là BỘ LỌC hay là Ô BIỂU MẪU?"
# ══════════════════════════════════════════════════════════════════════════════
# Cùng một cái `Selectbox Trạng thái` mang HAI nghĩa hoàn toàn khác nhau tuỳ nằm ở CN nào:
#   · ở CN TÌM KIẾM  -> BỘ LỌC   -> cần khối `Chức năng Tìm kiếm đơn lẻ` (§6)
#   · ở CN THÊM MỚI  -> Ô BIỂU MẪU -> cần bộ case Selectbox (§5.2), TUYỆT ĐỐI không phải bộ lọc
# Lẫn hai thứ này đã trả giá hai lần trong ngày 2026-09-08:
#   ① `audit_timkiem.py` bản đầu dùng danh sách LOẠI TRỪ tên CN -> "TẠO BÀI VIẾT MỚI" không chứa
#      cụm "tao moi" nên lọt, ô biểu mẫu `Selectbox Trạng thái khởi tạo` bị chấm là bộ lọc.
#   ② Trong chính bộ case: nhóm `Selectbox Trạng thái khởi tạo` ở CN Thêm mới được QA chạy và
#      chấm P, nhưng đọc ghi chú Lần 1 thì 3/6 case thật ra test trên **ô lọc ngoài danh sách**
#      (giá trị `Tin tức`/`Sự kiện` là Loại bài viết, không phải trạng thái). Khối đã bị gỡ.
# Vì vậy: đừng bao giờ suy "bộ lọc" từ TÊN NHÓM. Luôn hỏi CN chứa nó là loại gì.
CN_TIM_KIEM = ('tim kiem', 'loc ', 'tra cuu', 'bo loc')
CN_BIEU_MAU = ('them moi', 'them ', 'tao moi', 'tao ', 'khai bao', 'chinh sua', 'cap nhat',
               'sua ', 'onboard', 'ghi nhan', 'bien soan')
CN_KHAC = ('danh sach', 'xoa', 'khoi phuc', 'xuat', 'nhap', 'chi tiet', 'doi trang thai',
           'duyet', 'huy', 'dang ')


def loai_cn(ten_cn):
    """'tim_kiem' | 'bieu_mau' | 'khac' — quyết định Ô trong CN đó mang nghĩa gì.

    `tim_kiem` xét TRƯỚC: "TÌM KIẾM & LỌC BÀI VIẾT" cũng chứa chữ "bài viết" nhưng nó là màn lọc.
    """
    n = norm(ten_cn or '')
    if any(k in n for k in CN_TIM_KIEM):
        return 'tim_kiem'
    if any(k in n for k in CN_BIEU_MAU):
        return 'bieu_mau'
    return 'khac'


def la_cn_tim_kiem(ten_cn):
    """CN này có phải CN TÌM KIẾM / TRA CỨU không — bản DÙNG CHUNG cho mọi luật ATTT.

    Vì sao phải có hàm riêng thay vì mỗi chỗ tự khớp từ khoá: tính đến 2026-09-16 có **BỐN**
    bản chép tay của đúng câu hỏi này, mỗi bản một danh sách từ khoá khác nhau —
      · `attt_kind_of_cn()`    'tim kiem' | startswith 'tim '  -> chọn BANK + định mức case
      · `kq_mau_khoi()`        'tim kiem'                      -> chọn câu KẾT QUẢ MẪU
      · `audit_attt.pick()`    'tim kiem' | startswith 'loc '  -> chọn bộ phép [A]
      · `complete_attt.kind()` 'tim kiem' | startswith 'loc '  -> BƠM khối [A]
    trong khi bảng chuẩn `CN_TIM_KIEM` ngay trên đây đã có đủ `tra cuu` / `bo loc` từ lâu, và 5
    module khác (`audit_split` · `new_from_base` · `audit_cn_buoc` · `complete_func`) cũng đã
    nhận `tra cuu` — chỉ nhánh ATTT là lạc.

    Đo 2026-09-16 trên màn có CN **"TRA CỨU CƠ SỞ GIÁO DỤC"** (tên không chứa chữ *tìm kiếm*):
      · `patch_attt_field` KHÔNG bơm 4 case injection cho ô tìm kiếm thật của màn;
      · `audit_attt` phép [B] nhận `kind=None` rồi `continue` -> báo SẠCH;
      · `kq_mau_khoi` chọn nhầm `KQ_MAU_ATTT_FORM` (*"không cho phép Insert"*) cho ô chỉ đọc;
      · `complete_attt` bơm bộ `Thao tác khác` (3 mục) thay bộ `Tìm kiếm` (4 mục).
    Bốn chỗ cùng sai MỘT KIỂU nên KHỚP nhau -> không phép rà nào kêu. Đây là lỗi của BẢNG LUẬT
    DÙNG CHUNG chứ không của riêng màn nào: mọi dự án đặt tên CN kiểu "Tra cứu …" / "Lọc …"
    đều dính y hệt. Sửa ở đây thì cả bốn chỗ đổi cùng một lần — thêm từ khoá lẻ vào từng chỗ
    là đúng hôm nay, sai lại vào ngày có tên CN thứ năm.

    `startswith('tim ')` giữ lại để bản mới là TẬP TRÙM của cả bốn bản cũ, không hạ case nào.
    """
    return loai_cn(ten_cn) == 'tim_kiem' or norm(ten_cn or '').startswith('tim ')


# Nhóm khung do luật quy định — không phải control nghiệp vụ của màn.
# 'icon' được THÊM 2026-09-09: tên nhóm chuẩn đã rút từ `Icon thao tác trên dòng` -> `Icon`,
# khoá cũ 'icon thao tac' không còn khớp nên nhóm khung này lọt vào danh sách bộ lọc.
NHOM_KHUNG = ('danh sach', 'phan trang', 'so ban ghi', 'so dong', 'icon thao tac', 'nut thao tac',
              'icon', 'checkbox chon tat ca', 'checkbox ban ghi', 'button', 'nut ', 'nhan ',
              'the ', 'cot ', 'badge', 'giao dien chung', 'validate cac truong',
              # nhóm `Validate ràng buộc giữa các trường` (2026-09-09) nằm trong khối Giao diện
              # của CN tìm kiếm nhưng KHÔNG phải một bộ lọc — không khai ở đây thì luật đảo của
              # `la_bo_loc()` tính nó thành tiêu chí thứ n+1 và làm sai cả số case tổ hợp (§6).
              'rang buoc giua cac truong', 'rang buoc lien truong',
              # `Breadcrumb` không phải bộ lọc — thiếu ở đây thì luật ĐẢO của `la_bo_loc()` tính
              # nó thành tiêu chí lọc trong CN tìm kiếm (`the ` đã có nên `Thẻ số liệu` an toàn).
              'breadcrumb', 'duong dan dieu huong',
              # nút Tải lại / Làm mới thuộc CN DANH SÁCH (luật 13), không bao giờ là bộ lọc
              'tai lai', 'lam moi')
# Từ khoá nhãn bộ lọc HAY GẶP. Giữ lại để đọc hiểu, nhưng KHÔNG còn là điều kiện cần —
# xem `la_bo_loc()`.
LOC_KW = ('tim kiem', 'tim theo', 'o tim', 'tim nhanh', 'loc', 'trang thai', 'tu ngay', 'den ngay')


# ── "KẾT QUẢ ĐÚNG LÀ KHÔNG CÓ THÔNG BÁO NÀO" (2026-09-09) ────────────────────────────────
# `audit_noi_dung` phép ② CHỮ CHAY đòi: cột D nói tới *thông báo / báo lỗi / cảnh báo* thì phải
# mang một chuỗi verbatim đã ground. Điều luật ấy KHÔNG diễn tả được lớp case mà kết quả đúng
# chính là **sự VẮNG MẶT của thông báo** — và lớp đó có thật, ground được:
#   · ô ngày `<input type="date">` của trình duyệt chặn bằng min/max, KHÔNG có thông báo lỗi
#     định dạng nào của hệ thống;
#   · ô tìm chốt tối thiểu 3 ký tự nhưng KHÔNG hiện lời nhắc nào khi gõ 1–2 ký tự.
# Trước khi có hàm này, 7 case như thế của màn `Cảnh báo Mâu thuẫn` bị báo oan **vĩnh viễn**:
# viết đúng hành vi thật thì bộ rà kêu, muốn bộ rà im thì phải bịa ra một câu thông báo.
# ⇒ Cùng lớp bài học đã ghi: *"ngưỡng của phép rà phải đúng với ca NHỎ NHẤT hợp lệ"*.
#
# Miễn trừ cố tình HẸP: chỉ khi MỌI lần nhắc tới thông báo trong cột D đều đứng sau một phủ
# định trong cửa sổ ngắn. Nhờ vậy câu khẳng định chung chung *"Hệ thống báo lỗi"* mà §8.2 cấm
# VẪN bị bắt, kể cả khi cùng ô còn một câu phủ định ở chỗ khác.
PHU_DINH_KW = ('khong', 'chua', 'khỏi')
# 46 ký tự: đủ cho "KHÔNG có thông báo lỗi định dạng của hệ thống", hẹp hơn một câu.
PHU_DINH_WIN = 46


def noi_khong_co_thong_bao(d, rx):
    """Cột D có khẳng định KHÔNG có thông báo nào không — True thì miễn phép CHỮ CHAY.

    `rx` là chính biểu thức dò cụm *thông báo* của phép rà (truyền vào để hai bên không lệch).
    Trả False khi cột D không nhắc tới thông báo lần nào — hàm này chỉ dùng để MIỄN TRỪ.
    """
    hit = list(rx.finditer(d or ''))
    if not hit:
        return False
    for m in hit:
        truoc = (d or '')[max(0, m.start() - PHU_DINH_WIN):m.start()]
        # Cửa sổ KHÔNG được vượt qua dấu hết câu: gieo lỗi bắt được ngay ca
        # *"không có thông báo nào. Ngoài ra hệ thống báo lỗi khi bấm Lưu."* — phủ định của câu
        # TRƯỚC bị tính cho cụm khẳng định của câu SAU, và như thế là miễn trừ oan.
        truoc = re.split(r'[.;!?\n]', truoc)[-1]
        if not any(k in norm(truoc) for k in PHU_DINH_KW):
            return False
    return True


# ── case `Kiểm tra tổng thể giao diện màn hình` — BẢN CHỮ CỐ ĐỊNH CỦA MẪU ────────────────
# Chỉ thị người đặt việc 2026-09-11 (kèm ảnh mẫu): case này *"chỉ cần ghi như ảnh"* — bản chữ
# GENERIC của mẫu, KHÔNG viết lại theo từng màn. Đã trả giá: bước A6 của màn `Báo cáo động`
# viết lại cột C/D thành bố cục riêng của màn đó (liệt kê tiêu đề, mô tả, thanh lọc…) — vi phạm
# luật "CẤM thay bản chữ cố định" (§7.3) và làm case lệch khỏi mọi bộ case anh em.
# Ba chỗ cùng cần luật này ⇒ đặt ở `qalib`, không ở script: `new_from_base` (sửa tại gốc khi
# trích 6 case `Giao diện chung`) · `sync_gdc_zoom_steps` (sửa bộ case ĐÃ SINH) · `audit_extra`
# phép ⑲ (chặn tái diễn).
TONG_THE_TIEU_DE = 'kiem tra tong the giao dien man hinh'
TONG_THE_C = ('1. Kiểm tra về bố cục\n'
              '2. Kiểm tra font chữ, cỡ chữ, màu chữ\n'
              '3. Kiểm tra chính tả')
TONG_THE_D = ('1. Bố cục\n'
              ' - Các label, text, button được bố trí thẳng hàng,\n'
              ' có độ dài, độ rộng và khoảng cách bằng nhau,\n'
              ' không xô lệch\n'
              ' - Font chữ được bố trí hợp lý và dễ sử dụng\n'
              ' - Các trường hợp bắt buộc nhập phải có dấu (*)\n'
              '2. Font chữ, màu chữ\n'
              ' - Các label, text được sử dụng cùng một loại font chữ, cỡ chữ.\n'
              ' - Màu chữ: giống như giao diện prototype\n'
              '3. Chính tả:\n'
              ' - Không có lỗi về chính tả, cấu trúc câu, ngữ pháp trên màn hình')


def la_case_tong_the(tieu_de):
    return TONG_THE_TIEU_DE in norm(tieu_de or '')


def tong_the_lech(tieu_de, c, d):
    """True nếu case `tổng thể giao diện` đã bị viết lại khác bản chữ cố định của mẫu."""
    return la_case_tong_the(tieu_de) and ((c or '') != TONG_THE_C or (d or '') != TONG_THE_D)


# ── 2 case ZOOM — bản chữ chuẩn PROMPT v3 §5.5 (đặt ở đây từ 2026-09-09) ─────────────────
# Ba chỗ cùng cần luật này: `new_from_base` (sửa tại gốc khi trích 6 case `Giao diện chung`) ·
# `sync_gdc_zoom_steps` (sửa file đã sinh) · `audit_extra` phép ⑨ (chặn tái diễn). Trước đó
# nó nằm trong `sync_gdc_zoom_steps.py` — mà file ấy là SCRIPT không có guard `__main__`, nên
# `import` nó là chạy luôn thân script rồi chết vì đọc `sys.argv` của tiến trình khác (đã dính).
# ⇒ Luật dùng chung phải ở `qalib`, không ở script.
ZOOM_C = {'in':  'Ấn vào biểu tượng zoom in hoặc nhấn Ctrl+ chuột theo chiều hướng vào trong',
          'out': 'Ấn vào biểu tượng zoom out hoặc nhấn Ctrl+ chuột theo chiều hướng ra ngoài'}
ZOOM_D = {'in':  ('Giao diện phóng to theo độ zoom, không bị lệch/chồng lấp giữa các phần; '
                  'bảng cuộn ngang khi cần.'),
          'out': 'Giao diện thu nhỏ theo độ zoom, không bị lệch/chồng lấp giữa các phần.'}
# Từ khoá của bản NGƯỢC nghĩa: zoom in mà nói "thu nhỏ", zoom out mà nói "phóng to".
ZOOM_NGUOC = {'in': ('thu nho', 'nho lai', 'nho di'), 'out': ('phong to', 'to len', 'to ra')}


def zoom_kieu(tieu_de):
    """'in' | 'out' | None — case này nói về chiều zoom nào."""
    n = norm(tieu_de or '')
    return 'in' if 'zoom in' in n else ('out' if 'zoom out' in n else None)


def zoom_d_nguoc(kieu, d):
    """Cột D có mô tả TRÁI CHIỀU với tiêu đề case không (§5.5)."""
    return bool(kieu) and any(k in norm(d or '') for k in ZOOM_NGUOC[kieu])


# ── HẬU TỐ ĐIỀU KIỆN "nếu có" — case tả thứ KHÔNG PHẢI MÀN NÀO CŨNG CÓ ──────────────────
# Chỉ thị người đặt việc 2026-09-10 (ảnh 4 case `vị trí trang sau 1 thao tác` của mẫu):
# tiêu đề nói tới một THAO TÁC/THÀNH PHẦN mà không phải màn nào cũng có thì phải khép bằng
# "nếu có" — người chạy kiểm khi màn CÓ, màn không có thì case không áp dụng. Thiếu hậu tố là
# biến case thành lời KHẲNG ĐỊNH màn có thao tác đó: đúng lớp lỗi `audit_extra` phép ⑥ bắt
# được ở "Kiểm tra màu biểu tượng xoá" (họ màn danh mục MOET bỏ hẳn thao tác Xoá).
# Ba chỗ dùng chung luật này: `quota_cases` (bank sinh mới, đã mang sẵn hậu tố) ·
# `fix_hau_to.py` (trả hậu tố cho bộ đã sinh) · `audit_extra` phép ⑪ (chặn tái diễn).
# ⇒ Luật ở `qalib`, KHÔNG chép vào từng script.
HAU_TO_DIEU_KIEN = ('neu co', 'neu he thong co', 'khi co')
HAU_TO_CHUAN = 'nếu có'

# Tiêu đề BẮT BUỘC mang hậu tố: (khoá nhận diện đã chuẩn hoá qua `norm`, nhãn để in).
# ⚠️ Khoá phải HẸP — khớp đúng bộ chữ của mẫu. Đừng nới thành "mọi tiêu đề có chữ xoá":
# case của một CN Xoá CÓ THẬT thì hậu tố "nếu có" là thừa và làm mờ nghĩa.
# ── ㉘ GIÁ TRỊ TĨNH phải LIỆT KÊ, giá trị ĐỘNG thì không (chỉ thị 2026-09-12) ─────────────
# *"Giá trị TĨNH (định nghĩa cố định trong source/cấu hình/đặc tả) phải liệt kê CỤ THỂ TOÀN BỘ.
#   Giá trị ĐỘNG (lấy từ DB/API/cấu hình) thì để chung chung. Không tự suy đoán."*
# Mục tiêu: Tester đối chiếu thẳng với dữ liệu thật, không phải đọc source để đoán.
#
# Nguồn quyết định là HỒ SƠ MÀN — khoá `grounding.gia_tri_tinh` (dict: nhãn ô -> danh sách giá
# trị) và `grounding.gia_tri_dong` (danh sách nhãn ô). Không khai thì phép rà nói "CHƯA GROUND",
# KHÔNG tự đoán — đúng §11.4 *thà gắn cờ hơn bịa*.
#
# Ba lỗi phép này bắt, đều làm case vô dụng với người chạy test:
#   ① dấu hai chấm TRƠ  — `Hiển thị các giá trị:` rồi hết (đo 2026-09-12: 19 ca);
#   ② chữ CHUNG CHUNG   — `Chọn một giá trị` · `các giá trị mặc định` · `giá trị trong danh sách`;
#   ③ ô TĨNH mà không liệt kê đủ giá trị đã ground.
KQ_CHUNG_CHUNG_GIATRI = (
    'chon mot gia tri', 'chon gia tri trong danh sach', 'cac gia tri mac dinh',
    'gia tri trong danh sach', 'cac gia tri duoc khai bao', 'day du cac gia tri',
)


def gia_tri_cua_o(spec, nhan_o, ten_nhom=None, cn=None):
    """-> ('tinh', [giá trị…]) · ('dong', None) · (None, None) nếu hồ sơ màn CHƯA khai.

    So khớp trên CẢ tên nhóm đầy đủ, không chỉ `field_of`: `field_of('Textbox Số bản ghi trên
    trang')` trả `bản ghi trên trang` — chữ `Số` bị luật tiền tố `Textbox số` ăn mất — nên khoá
    `Số bản ghi trên trang` của hồ sơ màn không bao giờ khớp. Đo 2026-09-12 trên `ViTriLuuTru`.

    ⚠️ KHOÁ MANG PHẠM VI CN — `"<TÊN CN>|<nhãn ô>"` (thêm 2026-09-12, cùng khuôn đã vá cho
    `kind_of`/`loai_control` ngày 2026-09-10). Lý do y hệt: MỘT màn có nhiều ô TRÙNG TÊN mà bộ
    giá trị KHÁC HẲN nhau, khoá phẳng thì khai kiểu gì cũng sai một chỗ. Đo 2026-09-12 trên
    `ChuyenVien/TangDuLieuDanhMuc`: ba nhóm cùng tên `Selectbox Trạng thái` —
      · bộ lọc màn Chi tiết bộ danh mục -> Tất cả trạng thái · Hoạt động · Không hoạt động
      · biểu mẫu Thêm/Sửa phần tử       -> Hoạt động · Không hoạt động
      · bộ lọc màn Yêu cầu thay đổi     -> Tất cả trạng thái · Chờ duyệt · Đã duyệt · Đã áp
                                           dụng · Từ chối
    Khoá phẳng `Trạng thái` thắng cả ba ⇒ `fix_kq_mau` GHI ĐÈ hai ô lọc bằng bộ giá trị của
    biểu mẫu, mà phép rà ㉘ vẫn báo 0 (nó đọc CÙNG một khoá sai). Tra khoá-có-CN TRƯỚC, khoá
    phẳng vẫn là mặc định cho mọi CN nên hồ sơ màn cũ không đổi hành vi.
    """
    g = (spec or {}).get('grounding') or {}
    ns = [norm(x) for x in (nhan_o, ten_nhom) if x]
    ncn = norm(cn or '')

    def _khop(k):
        if '|' in k:
            kcn, kfield = k.split('|', 1)
            if not ncn or norm(kcn) != ncn:
                return False
            k = kfield
        nk = norm(k)
        return any(nk == n or n.endswith(nk) or nk in n for n in ns)

    tinh = (g.get('gia_tri_tinh') or {})
    dong = (g.get('gia_tri_dong') or [])
    # Vòng 1 — khoá MANG PHẠM VI CN (hẹp trước rộng sau, đúng lối của `kind_of`).
    for k, v in tinh.items():
        if '|' in k and _khop(k):
            return 'tinh', list(v)
    for k in dong:
        if '|' in k and _khop(k):
            return 'dong', None
    # Vòng 2 — khoá phẳng, mặc định cho mọi CN.
    for k, v in tinh.items():
        if '|' not in k and _khop(k):
            return 'tinh', list(v)
    for k in dong:
        if '|' not in k and _khop(k):
            return 'dong', None
    return None, None


def kq_liet_ke_dung(spec, ten_nhom, tieu_de, d, cn=None):
    """Cột D ĐÚNG cho case liệt kê giá trị -> str, hoặc None nếu không dựng được.

    · ô TĨNH  -> liệt kê TOÀN BỘ giá trị đã ground, theo khuôn mẫu `Hiển thị các giá trị: …`;
    · ô ĐỘNG  -> câu chung, nói RÕ là giá trị lấy từ dữ liệu nên không liệt kê — khác hẳn dấu
                 hai chấm trơ, vì người chạy test biết phải đối chiếu với dữ liệu thật.
    Hồ sơ màn chưa khai thì trả None (để phép ㉘ gắn cờ, KHÔNG tự đoán).
    """
    if not la_case_liet_ke_gia_tri(tieu_de):
        return None
    loai, gts = gia_tri_cua_o(spec, field_of(ten_nhom), ten_nhom, cn)
    if loai == 'tinh' and gts:
        return 'Hiển thị các giá trị: ' + ' · '.join('"%s"' % x for x in gts)
    if loai == 'dong':
        # ⚠️ Câu này phải TỰ QUA được chính phép ㉘ và phép ⑳. Bản đầu viết "Hiển thị ĐẦY ĐỦ
        # CÁC GIÁ TRỊ…" — trúng ngay khoá cấm `day du cac gia tri`, tự bắn vào chân: bộ sửa ghi
        # ra 16 ca mà bộ rà lập tức báo đỏ. Cũng tránh dấu `;`, ngoặc giải thích và chữ HOA nhấn
        # mạnh để không vướng ⑳.
        return ('Danh sách hiện các giá trị lấy theo dữ liệu của hệ thống. Đây là giá trị động, '
                'không cố định — đối chiếu trực tiếp với dữ liệu thật lúc chạy.')
    return None


def kq_liet_ke_sai(spec, ten_nhom, tieu_de, d, cn=None):
    """Case liệt kê giá trị mà cột D chưa dùng được -> tên lỗi, hoặc None."""
    if not la_case_liet_ke_gia_tri(tieu_de):
        return None
    nd = (d or '').strip()
    if nd.endswith(':'):
        return 'dấu hai chấm TRƠ (không có giá trị nào)'
    if any(k in norm(nd) for k in KQ_CHUNG_CHUNG_GIATRI):
        return 'chữ chung chung (§chỉ thị 12/09 cấm)'
    loai, gts = gia_tri_cua_o(spec, field_of(ten_nhom), ten_nhom, cn)
    if loai is None:
        return 'ô CHƯA khai gia_tri_tinh/gia_tri_dong ở hồ sơ màn'
    if loai == 'tinh':
        thieu = [x for x in gts if norm(x) not in norm(nd)]
        if thieu:
            return 'ô TĨNH còn thiếu giá trị: %s' % ' · '.join(thieu[:3])
    return None


# ── ㉗ CONTROL SẮP XẾP DANH SÁCH THUỘC CN DANH SÁCH (chỉ thị 2026-09-12) ──────────────────
# *"Nếu có sắp xếp danh sách (ví dụ A-Z,...) thì để validate ở chức năng danh sách"*.
# Sắp xếp là thuộc tính của DANH SÁCH, không phải của bộ lọc — dù trên màn ô `Sắp xếp` hay nằm
# chung thanh lọc. Luật §0.10/§0.13 đã nói đúng điều này cho nhóm `Tiêu đề cột sắp xếp`; nay áp
# cho MỌI control sắp xếp. Đo 2026-09-12: `Selectbox Sắp xếp` của `ViTriLuuTru` bị hồ sơ màn
# khai dưới CN `TÌM KIẾM & LỌC` ⇒ 8 case validate nằm sai chỗ mà không phép rà nào thấy.
# ⚠️ KHÔNG bắt `sắp xếp các giá trị trong <ô chọn>` — đó là thứ tự OPTION trong dropdown, việc
#    của chính ô chọn, không phải sắp xếp danh sách.
NHOM_SAP_XEP = ('sap xep', 'tieu de cot sap xep', 'cot sap xep')


def la_control_sap_xep(ten_nhom):
    n = norm(ten_nhom or '')
    if not n:
        return False
    nhan = norm(field_of(ten_nhom) or '')
    return nhan.startswith('sap xep') or 'tieu de cot sap xep' in n or 'cot sap xep' in n


def sap_xep_lac_cn(ten_cn, ten_nhom):
    """Control sắp xếp mà KHÔNG nằm ở CN Danh sách -> tên CN đang chứa nó, hoặc None."""
    if not la_control_sap_xep(ten_nhom):
        return None
    if 'danh sach' in norm(ten_cn or ''):
        return None
    return ten_cn


# ── CASE VALIDATE CỦA BUTTON: nêu rõ BẤM VÀO THÌ LÀM GÌ (chỉ thị 2026-09-12) ─────────────
# Case `căn lề, chính tả của button` chỉ nói về hình thức; nếu CỘT C có thao tác BẤM nút thì
# cột D phải nói nút ấy làm gì — nếu không, người chạy test bấm xong không biết lấy gì đối chiếu.
# Hai biến thể, suy từ TÊN NÚT: nút ĐIỀU HƯỚNG (Quay lại · Xem · Chi tiết) thì nói "tới màn",
# nút còn lại nói "thực hiện hành động". Chọn nhầm biến thể là mô tả sai việc của nút.
NUT_DIEU_HUONG = ('quay lai', 'xem chi tiet', 'xem ', 'chi tiet', 'link', 'toi man')


def cau_hanh_dong_nut(ten_nhom):
    """Câu bổ sung cho cột D của case validate button -> str, hoặc None nếu không phải nút."""
    n = norm(ten_nhom or '')
    if not (n.startswith('button') or n.startswith('nut')):
        return None
    nhan = field_of(ten_nhom) or ''
    if any(k in n for k in NUT_DIEU_HUONG):
        return 'Bấm nút "%s" điều hướng tới màn tương ứng.' % nhan
    return 'Bấm nút "%s" thực hiện đúng hành động tương ứng.' % nhan


def thieu_cau_hanh_dong_nut(ten_nhom, tieu_de, c, d):
    """Cột C có thao tác BẤM nút mà cột D chưa nói nút làm gì -> câu cần thêm, hoặc None.

    CHỈ áp cho case `căn lề, chính tả của button` — đó là case nói về HÌNH THỨC, bấm xong không
    có gì đối chiếu. Các case button khác (`tải lại dữ liệu`, `hiệu ứng Loading`…) vốn đã tả rõ
    nút làm gì; nối thêm câu chung chung vào đó chỉ là nhiễu. Đo 2026-09-12: bỏ chốt tiêu đề thì
    phép này bơm vào MỌI case của nhóm Button.
    """
    if 'can le' not in norm(tieu_de or ''):
        return None
    cau = cau_hanh_dong_nut(ten_nhom)
    if not cau:
        return None
    nc, nd = norm(c or ''), norm(d or '')
    if not any(k in nc for k in ('bam nut', 'bam vao nut', 'click nut', 'bam "', 'nhan nut')):
        return None
    if any(k in nd for k in ('dieu huong', 'thuc hien dung hanh dong', 'toi man',
                             'thuc hien hanh dong')):
        return None
    return cau


# Chỉ thị 2026-09-12: hậu tố `nếu có` phải nằm CẢ TRONG ngoặc liệt kê thao tác.
HAU_TO_TRONG_NGOAC_CU = '(sửa, xóa, thêm mới,...)'
HAU_TO_TRONG_NGOAC_MOI = '(sửa, xóa, thêm mới,... nếu có)'

CASE_CAN_HAU_TO = (
    ('vi tri trang sau khi thuc hien 1 thao tac', 'Phân trang · vị trí trang sau 1 thao tác'),
    ('mau icon xoa', 'Icon · màu icon xoá'),
)


def co_hau_to_dieu_kien(tieu_de):
    """Tiêu đề đã mang hậu tố điều kiện chưa (nếu có · khi có · nếu hệ thống có)."""
    return any(k in norm(tieu_de or '') for k in HAU_TO_DIEU_KIEN)


def thieu_hau_to_dieu_kien(tieu_de):
    """Nhãn bộ case khi tiêu đề BẮT BUỘC có hậu tố mà đang thiếu; None = không thuộc luật này."""
    t = norm(tieu_de or '')
    if co_hau_to_dieu_kien(t):
        return None
    for khoa, nhan in CASE_CAN_HAU_TO:
        if khoa in t:
            return nhan
    return None


def them_hau_to_dieu_kien(tieu_de):
    """Nối hậu tố vào CUỐI tiêu đề, giữ nguyên chữ đã có (không viết lại wording).

    Tiêu đề nhiều dòng (mẫu có `Kiểm tra icon Trang tiếp >\n(next page)`) thì hậu tố đi vào
    cuối dòng CUỐI — đó là chỗ người đọc kết câu.
    """
    t = (tieu_de or '').rstrip()
    if co_hau_to_dieu_kien(t):
        return tieu_de
    return '%s %s' % (t.rstrip('.'), HAU_TO_CHUAN)


# ── NHÃN HIỂN THỊ của loại control trong case `Kiểm tra hiển thị đầy đủ …` ────────────────
# Chỉ thị người đặt việc 2026-09-10 (ảnh mẫu `TuDienDungChung_113`): danh sách thành phần viết
# theo khuôn **`N. [<Nhãn loại>] <Nhãn UI>`**, không phải `- <Loại control> <Nhãn UI>` như bản
# 09/09. Tên loại trong bộ case (`Textbox`, `Selectbox`, `Button`…) là từ điển NỘI BỘ để tra
# định mức §3; cái hiện ra cho người chạy test phải là tiếng Việt.
#
# Khoá dò theo TIỀN TỐ tên nhóm, xét theo thứ tự trong danh sách (dài trước ngắn) — `Textbox
# Số bản ghi trên trang` phải trúng `Trường nhập` chứ không rơi vào nhánh mặc định.
NHAN_HIEN_THI = (
    ('the so lieu',      'Thẻ số liệu'),
    ('hop xac nhan',     'Hộp xác nhận'),
    ('hop thoai',        'Hộp xác nhận'),
    ('breadcrumb',       'Breadcrumb'),
    ('phan trang',       'Phân trang'),
    ('danh sach',        'Bảng dữ liệu'),
    ('bang danh sach',   'Bảng dữ liệu'),
    ('luoi',             'Bảng dữ liệu'),
    ('grid',             'Bảng dữ liệu'),
    ('checkbox',         'Checkbox'),
    # 2026-09-10 — công tắc bật/tắt (`<Switch>`, ARIA `role=switch`). Trước đây thiếu dòng này
    # nên nhóm `Switch Đang hoạt động` (màn `Loại lưu trữ`, moet-datalake) rơi xuống nhánh
    # "không tiền tố nào" và liệt kê ra tên nhóm TRẦN, mất cặp `[Nhãn loại] Nhãn UI` của khuôn
    # 2026-09-10. ĐỊNH MỨC vẫn khai qua `loai_control` (bảng QUOTA không có loại `Switch`).
    ('switch',           'Công tắc'),
    ('radio',            'Radio'),
    ('button',           'Nút bấm'),
    ('nut ',             'Nút bấm'),
    ('icon',             'Icon'),
    ('datepicker',       'Trường chọn ngày'),
    ('o ngay',           'Trường chọn ngày'),
    ('selectbox',        'Danh sách chọn'),
    ('combobox',         'Danh sách chọn'),
    ('dropdown',         'Danh sách chọn'),
    ('upload',           'Tải tệp'),
    ('textarea',         'Trường nhập'),
    ('textbox',          'Trường nhập'),
    ('email',            'Trường nhập'),
    ('so dien thoai',    'Trường nhập'),
)
# Nhóm KHÔNG mang tiền tố loại nào (`Tải lại`, `Thông tin chi tiết`, tên bảng riêng của màn)
# giữ NGUYÊN cả cụm và không gắn nhãn — thà thiếu nhãn còn hơn gắn sai loại.


def nhan_va_ten(gname):
    """('<Nhãn loại>' | None, '<Nhãn UI>') tách từ tên nhóm control.

    Cắt tiền tố theo SỐ TỪ của khoá (không theo số ký tự): `norm()` bỏ dấu nên độ dài chuỗi
    đã bỏ dấu KHÁC độ dài chuỗi gốc — cắt theo ký tự là lệch với mọi tên có dấu.

        `Textbox Tên hiển thị`        -> ('Trường nhập',  'Tên hiển thị')
        `Thẻ số liệu Tổng nguồn`      -> ('Thẻ số liệu',  'Tổng nguồn')
        `Hộp xác nhận Xóa loại nguồn` -> ('Hộp xác nhận', 'Xóa loại nguồn')
        `Danh sách loại nguồn`        -> ('Bảng dữ liệu', 'Danh sách loại nguồn')  ← giữ cả cụm
        `Phân trang` · `Icon`         -> (None,           tên nguyên)  ← tên ĐÃ LÀ loại
        `Tải lại`                     -> (None,           'Tải lại')   ← không tiền tố nào
    """
    t = ' '.join((gname or '').split())
    n = norm(t)
    for khoa, nhan in NHAN_HIEN_THI:
        if n != khoa and not n.startswith(khoa + ' '):
            continue
        con = ' '.join(t.split()[len(khoa.split()):]).strip()
        if not con:
            # Tên nhóm CHÍNH LÀ tên loại (`Phân trang`, `Icon`, `Breadcrumb`) — gắn nhãn nữa là
            # lặp chữ (`[Phân trang] Phân trang`), nên trả tên trần.
            return None, t
        if nhan == 'Bảng dữ liệu':
            # `Danh sách loại nguồn` cắt đầu còn `loại nguồn` thì đọc lên mất nghĩa ⇒ giữ cả cụm.
            return nhan, t
        return nhan, con[0].upper() + con[1:]
    return None, t


def dong_liet_ke(gname, bat_buoc=False):
    """Một dòng của danh sách thành phần: `[<Nhãn loại>] <Nhãn UI>` (+ ` *` nếu bắt buộc)."""
    nhan, ten = nhan_va_ten(gname)
    dong = '[%s] %s' % (nhan, ten) if nhan else ten
    return dong + (' *' if bat_buoc else '')


# ── THẺ SỐ LIỆU (KPI) — nhận diện dùng chung cho lớp BƠM và lớp RÀ ─────────────────────────
# Chỉ thị người đặt việc 2026-09-16: *"bổ sung thêm case db cho các thẻ KPI tại phần chức năng"*.
# Case *số liệu thống kê khớp DB* từng bị gỡ khỏi `complete_func.SPEC` ngày 2026-09-09 vì nó
# KHẲNG ĐỊNH màn có thẻ thống kê ⇒ màn không có KPI thì là case chết. Nay case quay lại nhưng
# có ĐIỀU KIỆN: chỉ bơm/chỉ đòi khi CN đó THẬT có nhóm control thẻ KPI. Hai lớp phải hỏi CÙNG
# hàm này, nếu không thì lặp lại đúng lỗ "bơm và rà lệch nhau".
#
# ⚠️ Đo 2026-09-16 trên 5 màn `ChuyenVien` có KPI: các case `Thẻ số liệu … khớp dữ liệu trong
# hệ thống` ở khối **Validate** của 4/5 màn đối chiếu với CHÍNH MÀN HÌNH (con số ở thanh phân
# trang, đếm dòng sau khi lọc) — KHÔNG có câu truy vấn nào. Tức trước chỉ thị này, con số trên
# thẻ chưa từng được đối soát với CSDL ở bất kỳ đâu; lý do (a)/(b) của lần gỡ 09/09 vì thế
# không còn đúng.
def la_nhom_the_kpi(gname):
    """Tên nhóm này có phải nhóm control thẻ số liệu (KPI) không."""
    n = norm(' '.join((gname or '').split()))
    return any(n == k or n.startswith(k + ' ') for k in KHOA_THE_KPI)


def nhan_the_kpi(gname):
    """Nhãn UI của thẻ KPI (`Thẻ số liệu Tổng nguồn` -> `Tổng nguồn`), `None` nếu không phải.

    Nhóm tên TRẦN đúng bằng tên loại (`Thẻ số liệu`) trả `None`: không có nhãn nào để dẫn ra
    trong bước test, dẫn tên loại vào là bịa chữ trên màn.
    """
    if not la_nhom_the_kpi(gname):
        return None
    t = ' '.join((gname or '').split())
    n = norm(t)
    for k in KHOA_THE_KPI:
        if n.startswith(k + ' '):
            con = ' '.join(t.split()[len(k.split()):]).strip()
            return (con[0].upper() + con[1:]) if con else None
    return None


# ── CONTROL MÀ HỒ SƠ MÀN KHAI CHO MỘT CN  (thêm 2026-09-14) ────────────────────────────────
# Vì sao cần: vài luật suy diễn "CN X phải có đủ control của CN Y" (rõ nhất là §5.6 *"CN Sửa
# LUÔN lặp full khối Validate của CN Thêm"*). Luật đó đúng với đa số màn, nhưng KHÔNG phải mọi
# màn: biểu mẫu Sửa có thể hẹp hơn biểu mẫu Thêm vì chính ứng dụng dựng như vậy.
# Đo 2026-09-14 trên `ChuyenVien/TangDuLieuDanhMuc`: hồ sơ màn ghi verbatim
#   grounding.verbatim.form_them.nhan_o = 7 ô  (có Ngày bắt đầu · Ngày kết thúc · Năm học,
#                                               và ghi rõ 3 ô này CHỈ hiện với vài bộ danh mục)
#   grounding.verbatim.form_sua.nhan_o  = 4 ô  (không có 3 ô trên)
# `audit_sua` [1] không đọc hồ sơ màn nên báo *"thiếu 3 nhóm (~28 case)"* — bơm vào là VIẾT CASE
# CHO Ô KHÔNG TỒN TẠI, đúng thứ tài liệu dự án cấm (ghi nguyên trạng, không khẳng định thay).
# ⚠️ Phải soi CẢ `man_phu[].cn[]`: file nhiều sheet đặt CN của màn phụ ở đó, `cn[]` gốc chỉ có
# CN của sheet chính. `sap_theo_bo_cuc` (⑫) từng chỉ soi `cn[]` nên im lặng với mọi CN màn phụ
# — ĐÃ VÁ 2026-09-14: nó gọi thẳng hàm này, mọi phép sắp theo bố cục nay dùng chung một nguồn.
def controls_khai_cua_cn(spec, ten_cn):
    """[tên nhóm…] hồ sơ màn khai cho CN này, soi cả `cn[]` lẫn `man_phu[].cn[]`.

    `None` = hồ sơ màn KHÔNG khai CN này (khác hẳn `[]` = khai mà để rỗng). Người gọi phải
    phân biệt: `None` thì giữ nguyên luật suy diễn, `[]`/có danh sách thì luật nhường hồ sơ.
    """
    if not spec or not ten_cn:
        return None
    dich = norm(ten_cn)
    goc = list(spec.get('cn') or [])
    for mp in (spec.get('man_phu') or []):
        if isinstance(mp, dict):
            goc.extend(mp.get('cn') or [])
    for cn in goc:
        if isinstance(cn, dict) and norm(cn.get('ten') or '') == dich:
            ds = cn.get('controls')
            return list(ds) if isinstance(ds, list) else None
    return None


def sap_theo_bo_cuc(groups, spec, ten_cn):
    """Sắp danh sách nhóm control THEO THỨ TỰ TRÊN MÀN — Trái→Phải, Trên→Dưới.

    Chỉ thị người đặt việc 2026-09-10: case `Kiểm tra hiển thị đầy đủ các thông tin trong màn
    hình chức năng` phải liệt kê thành phần *theo thứ tự màn hình*, để người chạy test rà một
    lượt từ trên xuống chứ không nhảy cóc. Thứ tự CHUẨN là thứ tự khai `cn[].controls` của
    **hồ sơ màn** (người khai đã soi màn thật), KHÔNG phải thứ tự nhóm nằm trong file — khối
    `Validate các trường thông tin` xếp theo mạch viết case, hai thứ tự đó lệch nhau là bình
    thường (đo trên `LoaiNguon` 10/09: `Button Bỏ chọn` nằm ở thanh hàng loạt TRÊN bảng nhưng
    khai sau `Danh sách`; `Button Xóa tất cả` cũng ở thanh đó nhưng khai sau hộp xác nhận).

    Nhóm KHÔNG khớp tên nào trong hồ sơ giữ NGUYÊN thứ tự tương đối và dồn xuống cuối — thà
    lệch vài dòng còn hơn tự bịa một vị trí không soi được. Hồ sơ thiếu / không có CN tương
    ứng ⇒ trả lại y nguyên `groups`.
    """
    if not spec or not groups:
        return list(groups)
    # Soi CẢ `man_phu[].cn[]` qua `controls_khai_cua_cn`: file nhiều sheet đặt CN của màn phụ ở
    # đó, `cn[]` gốc chỉ có CN của sheet chính. Đọc mỗi `cn[]` thì phép ⑫/⑬ + `patch_giaodien`
    # + `fix_thu_tu_validate` IM LẶNG với mọi CN màn phụ và vẫn in 0 (đo 2026-09-14 trên
    # `ChuyenVien/TangDuLieuDanhMuc`: 11/15 CN chưa từng được sắp theo bố cục mà `audit_extra`
    # vẫn ra `Liệt kê sai thứ tự màn: 0 · Khối Validate sai thứ tự màn: 0`).
    ds = controls_khai_cua_cn(spec, ten_cn)
    if not ds:
        return list(groups)
    thu_tu = {norm(x): i for i, x in enumerate(ds)}
    N = len(thu_tu)
    ra = [g for _, _, g in sorted(
        ((thu_tu.get(norm(g), N), i, g) for i, g in enumerate(groups)))]
    return _button_xuong_duoi_o_cn_xoa(ra, ten_cn)


# CN Xoá không có "bố cục" theo nghĩa thông thường: hai hộp xác nhận là hai HỘP THOẠI khác
# nhau, còn `Button Hủy` / `Button Xóa tất cả` là nút NẰM TRONG (hoặc mở ra) các hộp đó. Chỉ
# thị người đặt việc 2026-09-10: *"Riêng chức năng Xóa, các validate button sẽ ở dưới các hộp
# xác nhận"* ⇒ liệt kê hộp trước, nút sau — bất kể `controls` của hồ sơ màn khai thế nào.
# Đây là lý do luật này nằm ở ĐÂY chứ không phải ở dữ liệu: sửa mỗi hồ sơ màn thì màn Xoá tiếp
# theo lại khai sai một kiểu khác.
def _button_xuong_duoi_o_cn_xoa(groups, ten_cn):
    if 'xoa' not in norm(ten_cn or ''):
        return groups
    la_nut = lambda g: norm(g).startswith('button') or norm(g).startswith('nut ')
    return [g for g in groups if not la_nut(g)] + [g for g in groups if la_nut(g)]


# ── CHỈ THỊ 2026-09-10: ba luật về NỘI DUNG case ────────────────────────────────────────
# Đặt ở `qalib` vì cả bộ SỬA (`fix_chi_thi_0910.py`) lẫn bộ RÀ (`audit_extra` ⑭⑮⑯) đều đọc —
# bài học đã trả giá nhiều lần: luật nằm trong script thì hai bên lệch nhau lúc nào không hay.

# ⑭ Case bị BỎ HẲN. Danh sách ĐÓNG — đừng nới thành "mọi case có chữ mặc định".
CASE_DA_BO = (
    ('tai danh sach mac dinh', 'Tải danh sách mặc định'),
    # Bỏ 2026-09-12 cùng chỉ thị "Textarea = Textbox + đúng 1 case nhiều dòng".
    ('nhap noi dung rat dai', 'Kiểm tra <ô> nhập nội dung rất dài'),
)

# ⑮ Khuôn cột D của case `nhập vượt độ dài cho phép`.
KHUON_VUOT_DO_DAI = ('1. Thông báo lỗi "%s"\n'
                     '2. Highlight, focus vào trường lỗi\n'
                     'Hoặc hệ thống không cho nhập quá %s ký tự')
# Ô BỊ KHOÁ (ô mã ở biểu mẫu Chỉnh sửa) không có thông báo lỗi nào ⇒ khuôn trên không áp
# dụng. Nhận ra bằng chính lời cột C/D, không phải bằng tên nhóm.
O_BI_KHOA_KW = ('bi khoa', 'disabled', 'khong sua duoc', 'chi doc')


def la_case_vuot_do_dai(tieu_de):
    return 'vuot do dai' in norm(tieu_de or '') or 'nhap vuot do dai' in norm(tieu_de or '')


def o_bi_khoa(*txts):
    return any(k in norm(t or '') for t in txts for k in O_BI_KHOA_KW)


def dung_khuon_vuot_do_dai(d):
    """Cột D đã theo khuôn ⑮ chưa — đủ 3 ý, không cần khớp từng chữ.

    MIỄN TRỪ **ô CHẶN CỨNG ở trình duyệt**: ô chỉ có `maxlength` của DOM mà màn KHÔNG khai luật
    độ dài thì gõ/dán quá giới hạn bị cắt ngay, KHÔNG hề có thông báo lỗi / highlight / focus
    nào để mà đòi. Mẫu cũng chỉ viết nhánh thứ hai cho ca này (`Hoặc hệ thống không cho nhập
    quá N ký tự`). Trước khi có miễn trừ này, người viết phải dựng câu dài phủ định cả ba ý
    (*"không có thông báo lỗi nào, không highlight và không đổi focus…"*) chỉ để qua phép ⑮ —
    21 case như vậy, và chính chúng lại vướng phép ⑳ *cột D quá chi tiết*. Hai luật đá nhau,
    gỡ ở đây.
    """
    n = norm(d or '')
    if 'khong cho nhap qua' in n and not _re.search(r'thong bao loi(?! nao)', n):
        return True
    # MIỄN TRỪ THỨ HAI — ô KHÔNG có luật độ dài nào ở TRÌNH DUYỆT, giới hạn CHỈ do MÁY CHỦ áp
    # lúc lưu (THGV `BaiGiang`: Tên bài giảng 500 · Mô tả 2000 khai ở proto, DOM không đặt
    # `maxlength`). Gõ/dán vượt giới hạn KHÔNG bị cắt và KHÔNG có thông báo/highlight/focus
    # nào — nên CẢ HAI nhánh của khuôn đều sai sự thật, viết theo khuôn là bộ case đòi một
    # hành vi màn không có. Cùng lớp "hai luật đá nhau" đã gỡ cho ô chặn cứng ở trên: sửa
    # LUẬT, không bắt người viết luồn lách. Chỉ nhận khi cột D nói ĐỦ hai vế của sự thật.
    if 'khong co thong bao loi nao' in n and 'may chu' in n:
        return True
    return ('thong bao loi' in n and 'highlight' in n and 'focus' in n
            and 'khong cho nhap qua' in n)


# ⑰ Cột KẾT QUẢ MONG MUỐN đánh số trần `1.` `2.`, KHÔNG viết `Bước 1:` `Bước 2:`.
# Chỉ thị người đặt việc 2026-09-10. Lý do đọc ra được từ chính bộ case: cột C đã đánh số bước
# rồi, cột D lặp lại chữ "Bước" chỉ làm dài dòng — và khi cột D chỉ nói về vài bước cuối
# (case xoá nói từ bước 3) thì người đọc tưởng thiếu kết quả của bước 1, 2.
# Số thứ tự GIỮ NGUYÊN để vẫn khớp bước tương ứng ở cột C — chỉ bỏ chữ "Bước" và đổi `:` -> `.`.
import re as _re
# `[^\S\n]*` (khoảng trắng TRỪ xuống dòng) chứ không phải `\s*`: `Bước 2:` đứng riêng một
# dòng rồi mới tới các gạch đầu dòng con — `\s*` nuốt luôn ký tự xuống dòng và dán dòng con
# lên cùng hàng (`2. - con 1`).
RX_TIEN_TO_BUOC = _re.compile(r'^([ \t]*)B(?:ước|uoc)[^\S\n]*(\d+)[^\S\n]*[:.][^\S\n]*',
                              _re.I | _re.M)


def co_tien_to_buoc(d):
    return bool(RX_TIEN_TO_BUOC.search(d or ''))


def bo_tien_to_buoc(d):
    """`Bước 2: xyz` -> `2. xyz` — chỉ ở ĐẦU DÒNG, giữ nguyên số và phần thụt đầu dòng."""
    def _thay(m):
        # Dòng chỉ có mỗi `Bước 2:` (nội dung nằm ở các dòng con bên dưới) thì KHÔNG thêm dấu
        # cách thừa ở cuối — nếu không, ô để lại một dòng `2. ` có khoảng trắng đuôi.
        het_dong = m.string[m.end():m.end() + 1] in ('\n', '')
        return '%s%s.%s' % (m.group(1), m.group(2), '' if het_dong else ' ')
    return RX_TIEN_TO_BUOC.sub(_thay, d or '')


# ── ⑳ CỘT D KHỐI VALIDATE — KHUÔN NGẮN CỦA MẪU (chỉ thị người đặt việc 2026-09-11) ─────────
# Chỉ thị: *"Phần validate kết quả mong muốn đang bị quá chi tiết, làm như
# `templateTestcase/DanhMucTuDienDungChung.xlsx` là được"*.
#
# Đo trên chính hai bộ (306 case Validate của mẫu vs 1157 case Validate của 6 file ChuyenVien),
# sau khi CHE các chuỗi trong ngoặc kép — phần trong ngoặc kép là bản chữ verbatim của màn
# (§7.3), dài bao nhiêu cũng đúng, nên đo cả chuỗi đó thì mọi ngưỡng đều vô nghĩa:
#
#     phần thuật (ngoài ngoặc kép)   mẫu: median 46 · p90  97     bộ đang có: median 93 · p90 197
#     dấu `;` nối mệnh đề            mẫu  0,7%                     bộ đang có 40,3%
#     CHỮ HOA nhấn mạnh              mẫu  0,7%                     bộ đang có 14,3%
#     ngoặc đơn giải thích ≥15       mẫu  0,3%                     bộ đang có  8,1%
#     câu dặn người test             mẫu  0,0%                     bộ đang có  3,8%
#
# ⚠️ Hai ca "mẫu cũng dính" đều nằm TRONG ngoặc kép (`dd/mm/YYYY`, danh sách đuôi tệp
# `*.pdf; *.doc; …`) — đó là lý do phép này bắt buộc phải che chuỗi trích TRƯỚC khi đo.
#
# §8.2 đòi cột D đủ ba tầng *(thông báo verbatim · trạng thái control · hệ quả dữ liệu)* —
# luật này KHÔNG bỏ tầng nào. Nó chỉ chặn tầng THỨ TƯ mà mẫu không có: **giải thích vì sao**,
# **đối chiếu với chế độ/màn khác**, và **dặn người test phải ghi chép gì** — ba thứ đó thuộc
# cột C (các bước) hoặc cột T (ghi chú; §8.3 cho phép chi tiết kỹ thuật ở T, cột D thì không).

# Câu MỞ ĐẦU bằng các cụm này là lời DẶN NGƯỜI TEST — thuộc cột C, không phải kết quả.
KQ_DAN_DO = ('Ghi nguyên trạng', 'Ghi lại', 'Đối chiếu', 'Quan sát', 'Lưu ý',
             'Kiểm tra lại', 'Thử lại', 'Cần xác nhận', 'Xác nhận với', 'Nếu vẫn')
# Câu MỞ ĐẦU bằng các cụm này là GIẢI THÍCH / ĐỐI CHIẾU CHẾ ĐỘ KHÁC — thuộc cột T.
KQ_GIAI_THICH = ('Đây là', 'Bản đang kiểm', 'Lý do', 'Nguyên nhân', 'Case này',
                 'Màn này', 'Trước đó', 'Khác với', 'Khác chế độ', 'Khác ô')
# CHỮ HOA nhấn mạnh — danh sách ĐÓNG các từ tiếng Việt hay bị viết hoa để nhấn giọng.
# ⛔ KHÔNG hạ chữ hoa theo luật chung: `GOLD` `STT` `DB` `SQL` `YYYY` là giá trị/nhãn THẬT của
#    màn, hạ xuống là sai bản chữ. Thêm từ vào đây thì phải là từ nối, không phải danh từ.
KQ_HOA_NHAN_MANH = ('KHÔNG', 'CHÍNH', 'DUY NHẤT', 'BẤT KỲ', 'MỘT', 'NGAY', 'ĐÃ CÓ', 'ĐÃ',
                    'NGƯỢC', 'BỊ KHOÁ', 'BỊ KHÓA', 'CẤM', 'PHẢI', 'VẪN', 'TẤT CẢ',
                    'Ở GIỮA', 'TỪNG', 'CHƯA', 'CHỨA', 'CŨ', 'BỎ', 'CÙNG',
                    # Cụm NHIỀU CHỮ để trước (vòng hạ chữ chạy theo độ dài giảm dần) — hạ cả
                    # cụm thì an toàn hơn hạ từng từ lẻ như `ĐANG`, `XEM`, `LƯU`, vốn có thể
                    # là NHÃN THẬT của màn khi người viết quên bỏ vào ngoặc kép.
                    'ĐANG HIỂN THỊ', 'CỦA TRANG ĐANG XEM', 'TỰ ĐƯA VỀ', 'TỰ QUAY VỀ',
                    'GIỮ NGUYÊN', 'TOÀN BỘ', 'IN HOA', 'LUÔN', 'RIÊNG', 'NGANG', 'HAI')
# ⚠️ CỐ Ý KHÔNG có trong danh sách: `GOLD` `DIAMOND` `SQL` `OLAP` `API` `STT` `TABLE` `VIEW`
#    `MART` `GBR` `BCD` — đó là GIÁ TRỊ / NHÃN / mã tài liệu THẬT của màn, hạ xuống là sai bản
#    chữ. Các ca này `kq_qua_chi_tiet` vẫn gắn cờ `CHỮ HOA nhấn mạnh`; đó là NHIỄU ĐÚNG CHUẨN,
#    soi tay rồi bỏ qua (§8.5), đừng nhét chúng vào đây cho hết cờ.
KQ_NGOAC_DAI = 15      # ngoặc đơn dài hơn ngần này là câu giải thích, không phải chú thích
KQ_THUAT_DAI = 180     # p90 của mẫu là 97 — lấy 180 cho rộng tay, chỉ bắt ca thật sự dài

_RX_TRICH = _re.compile(r'"[^"]*"')
_RX_HOA = _re.compile(r'\b[A-ZĐÂÊÔƯĂ]{3,}\b')
_RX_CHE = _re.compile(r'\x00(\d+)\x00')
# Câu dặn dò nằm CUỐI dòng: "… là LỖI, ghi lại nguyên trạng" · "Nếu vẫn … thì ghi lại".
_RX_DAN_CUOI = _re.compile(r'là LỖI|ghi lại|ghi nguyên trạng|cần xác nhận', _re.I)


def che_chuoi_trich(d):
    """Che mọi chuỗi trong ngoặc kép -> (chuỗi đã che, bảng tra). Bản chữ verbatim của màn là
    BẤT KHẢ XÂM PHẠM (§7.3): mọi phép đo và mọi phép cắt đều chạy trên bản ĐÃ CHE."""
    giu = []

    def _sub(m):
        giu.append(m.group(0))
        return '\x00%d\x00' % (len(giu) - 1)
    return _RX_TRICH.sub(_sub, d or ''), giu


def bo_che(s, giu):
    return _RX_CHE.sub(lambda m: giu[int(m.group(1))], s or '')


# ── LUẬT 7 §D: CỘT D KHÔNG CHỨA CODE  (dời về `qalib` 2026-09-14) ──────────────────────────
# Trước lượt này luật chỉ nằm trong `audit_extra` nên chỉ RÀ được, không CHẶN được: `a6_auto`
# bơm thẳng dữ kiện `grounding` vào cột D, và một khoá tả phạm vi tìm kiếm mang chuỗi
# `GET /targets` đã lọt vào bộ case đã nghiệm thu (đo 2026-09-14 trên `ViTriLuuTru`).
# Bơm và rà phải dùng CHUNG một bảng luật — nay cả hai gọi `ro_code()` ở đây.
D_LEAK = [
    (re.compile(r'\.(tsx|jsx|ts|go|py|vue|java)\b', re.I), 'đuôi file mã nguồn'),
    (re.compile(r'\b(useState|useEffect|props|className|onClick|onChange)\b'), 'API React'),
    (re.compile(r'<[A-Z][A-Za-z]+\s*/?>'), 'thẻ component'),
    (re.compile(r'\b(GET|POST|PUT|PATCH|DELETE)\s+/[a-z]', re.I), 'HTTP + đường dẫn API'),
    (re.compile(r'\b(null|undefined|NaN)\b'), 'giá trị đặc biệt của JS'),
    # >=3 ký tự thường trước chữ HOA: loại tên sản phẩm kiểu "mBlock", "iPhone" (1 ký tự đầu)
    (re.compile(r'\b[a-z]{3,}[A-Z][a-zA-Z]{2,}\b'), 'tên biến camelCase'),
]


# ── CHỈ THỊ 2026-09-14 (ảnh): *"không được lẫn tiếng Anh hoặc mã gì đó, ghi bằng tiếng Việt
#    dễ hiểu"*. DANH SÁCH ĐÓNG, và mỗi từ đều đã kiểm là **mẫu KHÔNG dùng** — đo trên
#    `DanhMucTuDienDungChung.xlsx`: `API` 0 · `modal` 0 · `cookie` 0 · `FE` 0 · `bundle` 0 ·
#    `permission` 0 · `endpoint` 0 · `request` 1.
#    ⛔ KHÔNG cấm theo luật chung "mọi từ La-tinh": mẫu dùng dày đặc `Click` (170) · `Tab` (23) ·
#    `Insert` (6) · `zoom` (6) · `font` (7) · `checkbox` (16) · `popup` (8) · `URL` (24) ·
#    `database` (13) · `DB` (24) · `tooltip` (8) · `client` (6) · `cache` (2) · `header` (2) —
#    cấm cả loạt là đá vào §7.3 (cấm thay bản chữ cố định của mẫu). Cùng bẫy với `KQ_HOA_NHAN_MANH`:
#    `schema` trong `Tên schema` / `{catalog}.{schema}.{bảng}` là NHÃN THẬT của màn, không phải
#    chữ lẫn — nên không có trong danh sách này.
# Payload ATTT (§7.2) là mã CỐ Ý người test phải gõ NGUYÊN VĂN — `<script>alert(...)</script>`,
# `' OR 1=1 --`, `../../etc/passwd`. Che trước khi soi, nếu không phép rà mới sẽ báo đỏ đúng
# những case ATTT mà chính prompt §7.2 bắt buộc phải có.
_RX_PAYLOAD = re.compile(r'<script\b.*?</script>|<img\b[^>]*onerror[^>]*>|\bOR\s+1\s*=\s*1\b'
                         r'|(\.\./){2,}\S*|\bjavascript:\S+', re.I | re.S)

TU_TIENG_ANH = (
    ('API', 'dịch vụ của máy chủ'), ('endpoint', 'địa chỉ dịch vụ'),
    ('modal', 'popup'), ('request', 'yêu cầu'), ('cookie', 'phiên lưu ở trình duyệt'),
    ('bundle', 'gói mã giao diện'), ('permission', 'quyền'), ('FE', 'giao diện'),
    ('BE', 'máy chủ'), ('client-side', 'ngay trên trình duyệt'),
    ('sidebar', 'menu bên'), ('lowercase', 'hạ hoa/thường'), ('includes', 'chứa'),
    ('wizard', 'luồng nhiều bước'), ('DISABLED', 'giá trị mã của trạng thái'),
)
# ⚠️ `modal` dịch thành **popup**, KHÔNG phải "hộp thoại": mẫu dùng `popup` 10 lần và không có
#    chữ `hộp thoại` nào, bộ case đang giao cũng đã dùng `popup` 65 lượt. Đặt ra từ thứ ba là
#    tự tạo một bản chữ mới cho cùng một thứ — đúng thứ §7.3 cấm.

# Bảng DỊCH — khoá theo CỤM, không theo từ lẻ: thay từ lẻ thì `Gọi API danh sách: GET /api/...`
# ra câu Việt-Anh lẫn lộn còn tệ hơn. Áp theo thứ tự, cụm DÀI trước.
DICH_TIENG_ANH = (
    ('không gửi request nhiều lần', 'không gửi yêu cầu nhiều lần'),
    ('xoá cookie phiên ở trình duyệt', 'xoá phiên đăng nhập lưu trong trình duyệt'),
    ('xóa cookie phiên ở trình duyệt', 'xóa phiên đăng nhập lưu trong trình duyệt'),
    ('bundle FE khai permission rỗng cho mọi mục sidebar',
     'mã giao diện khai quyền rỗng cho mọi mục menu bên'),
    ('client-side, khớp CHỨA (includes)', 'ngay trên trình duyệt, khớp CHỨA'),
    ('đã lowercase', 'đã hạ hoa/thường'),
    ('Bước 2 của wizard', 'Bước 2 của luồng tạo báo cáo'),
    ('trạng thái mặc định là DISABLED (hiển thị "Đã vô hiệu hóa")',
     'trạng thái mặc định là "Đã vô hiệu hóa"'),
    # ── Gọi thẳng dịch vụ máy chủ (case ATTT phân quyền/phạm vi dữ liệu) ──────────────────
    ('Gọi API danh sách: GET /api/db-tool/v1/database-types:export',
     'Gọi thẳng dịch vụ xuất Excel của máy chủ'),
    ('Gọi API: GET /api/db-tool/v1/database-types:export',
     'Gọi thẳng dịch vụ xuất Excel của máy chủ'),
    ('Gọi lại API danh sách: GET /api/db-tool/v1/database-types',
     'Gọi lại dịch vụ danh sách của máy chủ'),
    ('Gọi API danh sách: GET /api/db-tool/v1/database-types',
     'Gọi thẳng dịch vụ danh sách của máy chủ'),
    ('Gọi API: POST /api/db-tool/v1/database-types',
     'Gọi thẳng dịch vụ thêm mới của máy chủ'),
    ('Gọi API: PUT /api/db-tool/v1/database-types/{id}',
     'Gọi thẳng dịch vụ cập nhật của máy chủ'),
    ('dịch vụ GET /api/db-tool/v1/ingestion/source-groups',
     'dịch vụ danh sách nhóm nguồn của máy chủ'),
    ('Gọi thẳng API danh sách', 'Gọi thẳng dịch vụ danh sách của máy chủ'),
    ('Gọi thẳng API cập nhật', 'Gọi thẳng dịch vụ cập nhật của máy chủ'),
    ('Gọi thẳng API xoá', 'Gọi thẳng dịch vụ xoá của máy chủ'),
    ('API danh sách không nhận tham số', 'dịch vụ danh sách của máy chủ không nhận tham số'),
    ('máy chủ đã trả ở API danh sách', 'máy chủ đã trả ở dịch vụ danh sách'),
    ('không có API lưu', 'máy chủ chưa có dịch vụ lưu'),
    # ── Đường dẫn trang ───────────────────────────────────────────────────────────────────
    ('Mở /dynamic-reports/{mã}/edit-chart của một báo cáo',
     'Mở màn Chỉnh sửa biểu đồ của một báo cáo'),
    ('Mở /dynamic-reports/{mã}/edit-chart của 1 báo cáo',
     'Mở màn Chỉnh sửa biểu đồ của 1 báo cáo'),
    ('tại đường dẫn /dynamic-reports/{mã báo cáo}', ''),
    ('Gõ thẳng địa chỉ https://moet-datalake.saas.vsystem.vn/dynamic-reports',
     'Gõ thẳng địa chỉ trang Báo cáo động vào thanh địa chỉ trình duyệt'),
    # ── Tên lệnh/giá trị MÃ của hệ thống lọt vào câu văn ──────────────────────────────────
    ('(GetBIReport theo mã vừa điều hướng tới)',
     '(dịch vụ chi tiết báo cáo theo mã vừa điều hướng tới)'),
    ('lệnh listDatasets', 'dịch vụ danh sách bộ dữ liệu'),
    ('trạng thái là DRAFT (Bản nháp)', 'trạng thái là Bản nháp'),
    # Giá trị mã kèm ngay bản chữ hiển thị -> giữ bản chữ, bỏ mã. Chuỗi trong ngoặc kép đã bị
    # CHE thành chỗ giữ nên phải dùng biểu thức, chuỗi thường không bao giờ khớp nổi.
    (re.compile(r'DISABLED \(hiển thị (\x00\d+\x00)\)'), r'\1'),
    ('thì là ACTIVE', 'thì là trạng thái đang hoạt động'),
    ('Tạo một báo cáo mới qua wizard', 'Tạo một báo cáo mới qua luồng 3 bước'),
    ('Mở wizard trên', 'Mở luồng tạo báo cáo trên'),
    ('mỗi biểu đồ trong wizard', 'mỗi biểu đồ trong luồng tạo báo cáo'),
    ('nút X để bỏ khỏi wizard', 'nút X để bỏ khỏi luồng tạo báo cáo'),
    ('khỏi wizard NGAY trên giao diện', 'khỏi luồng tạo báo cáo NGAY trên giao diện'),
    ('và KHÔNG hiện wizard', 'và KHÔNG hiện luồng tạo báo cáo'),
    ('đường dẫn trang KHÔNG đổi (vẫn là /dynamic-reports)', 'đường dẫn trang KHÔNG đổi'),
    ('modal', 'popup'),
)
# Đường dẫn trang / địa chỉ dịch vụ lọt vào cột C/D: `/dynamic-reports/{mã}/edit-chart`,
# `GET /api/db-tool/v1/database-types`. Bắt cả dạng có `{tham số}`.
_RX_DUONG_DAN = re.compile(r'(?<![\w"])/[a-z][a-z0-9]*(?:[-/][{}\w]+)+')
_RX_TU_ANH = [(re.compile(r'(?<![A-Za-z])%s(?![A-Za-z])' % re.escape(w)), w, vi)
              for w, vi in TU_TIENG_ANH]


def lan_tieng_anh(s, bo_qua_trich=True):
    """Cột C/D có lẫn tiếng Anh / đường dẫn mã không -> (chỗ lẫn, chữ Việt thay thế) hoặc None.

    `bo_qua_trich` — che chuỗi trong ngoặc kép trước khi soi. Bản chữ VERBATIM của màn dài bao
    nhiêu, tiếng gì cũng đúng (§7.3): nhãn nút thật là "Export Excel" thì phải chép y nguyên.
    Chỉ phần THUẬT của người viết mới phải là tiếng Việt.
    """
    t = re.sub(r'"[^"]*"', ' ', s or '') if bo_qua_trich else (s or '')
    # Payload ATTT (§7.2) là mã CỐ Ý — `<script>alert(document.cookie)</script>` phải giữ nguyên
    # từng ký tự, đó là thứ người test gõ vào. Che riêng nhóm này trước khi soi.
    t = _RX_PAYLOAD.sub(' ', t)
    m = _RX_DUONG_DAN.search(t)
    if m:
        return (m.group(0), 'viết bằng lời, vd "màn Chỉnh sửa báo cáo"')
    for rx, w, vi in _RX_TU_ANH:
        if rx.search(t):
            return (w, vi)
    return None


def dich_tieng_anh(s):
    """Dịch cụm tiếng Anh/mã trong cột C/D sang tiếng Việt -> (chữ mới, [cụm đã dịch]).

    ⛔ KHÔNG đụng vào chuỗi trong ngoặc kép — đó là bản chữ VERBATIM của màn (§7.3). Nhãn nút
    thật là "Export Excel" thì phải giữ y nguyên; dịch nó là bịa ra một màn không tồn tại.
    Payload ATTT (§7.2) cũng được che, vì đó là chuỗi người test phải gõ từng ký tự.
    """
    if not s:
        return s, []
    # Cắt chuỗi thành các mảnh ĐƯỢC PHÉP SỬA và các mảnh PHẢI GIỮ NGUYÊN (ngoặc kép + payload).
    giu = []

    def _giu(m):
        giu.append(m.group(0))
        return '\x00%d\x00' % (len(giu) - 1)

    t = _RX_PAYLOAD.sub(_giu, s)
    t = re.compile(r'"[^"]*"').sub(_giu, t)
    da = []
    for cu, moi in DICH_TIENG_ANH:
        if hasattr(cu, 'sub'):                       # mục khai bằng biểu thức chính quy
            t2 = cu.sub(moi, t)
            if t2 != t:
                t = t2
                da.append(cu.pattern)
        elif cu in t:
            t = t.replace(cu, moi)
            da.append(cu)
    # Dọn rác do phép xoá cụm để lại (khoảng trắng đôi, dấu cách trước dấu câu).
    t = re.sub(r'[ \t]{2,}', ' ', t)
    t = re.sub(r'[ \t]+([,.;:])', r'\1', t)
    t = _RX_CHE.sub(lambda m: giu[int(m.group(1))], t)
    return t, da


def ro_code(d):
    """Cột D có rò từ ngữ CODE không -> mô tả chỗ rò, hoặc None."""
    for rx, why in D_LEAK:
        m = rx.search(d or '')
        if m:
            return '%s: "%s"' % (why, m.group(0))
    return None


def cho_verify_thong_bao(t):
    """Cột T có đang khai rằng CHÍNH NỘI DUNG THÔNG BÁO là thứ chưa ground được không.

    Miễn trừ cho phép ② CHỮ CHAY của `audit_noi_dung` (thêm 2026-09-14). Lý do: case *nhập
    trùng cùng lúc từ 2 client* của `NhomNguon` mô tả đúng hành vi (máy chủ từ chối client thứ
    hai, hiện dòng đỏ dưới tiêu đề hộp thoại) nhưng KHÔNG có chuỗi verbatim nào để dẫn — ràng
    buộc duy nhất nằm ở máy chủ, FE không kiểm, nên hồ sơ màn không ground được câu báo lỗi.
    Case đã tự khai `[CẦN VERIFY] … cần dev xác nhận … nội dung thông báo trả về`. Bộ rà đòi
    một chuỗi verbatim ở đây là ép người viết BỊA ra câu thông báo — đúng lớp lỗi đã vá ngày
    10/09 cho ca *"không có thông báo nào"*.

    ⚠️ HẸP có chủ ý: phải là cờ `[CẦN VERIFY]` VÀ ghi chú phải nói tới THÔNG BÁO/MESSAGE. Cả
    role `ChuyenVien` có 208/2666 case (7,8%) mang `[CẦN VERIFY]`; miễn cả cụm đó là mở toang
    phép ②. Đo 2026-09-14: luật hẹp này miễn đúng **1** case.
    """
    t = t or ''
    if 'CẦN VERIFY' not in t:
        return False
    return bool(_re.search(r'(n[ộo]i dung\s+)?th[ôo]ng b[áa]o|message|c[âa]u b[áa]o l[ỗo]i', t,
                           _re.I))


def a6_chan_ghi(tieu_de, C, D, C_cu=None, D_cu=None, ten_cn=None):
    """Phép A6 này có được phép ghi đè C/D của case không -> lý do TỪ CHỐI, hoặc None.

    Lưới chắn dùng chung cho MỌI đường A6 (`a6_auto` và mọi `a6-<Màn>.py` viết tay). Hai thứ
    A6 hay làm hỏng, cả hai đều đã có phép rà nhưng chỉ bắt được SAU KHI bộ case đã giao:

      · **rò CODE vào cột D** (luật 7 §D) — hồ sơ màn có khoá tả phạm vi kỹ thuật
        (`… qua tham số search của GET /targets`) và A6 bơm thẳng vào cột D;
      · **LẠC MỤC ĐÍCH** (phép ㉓) — luật A6 khai `tiêu_đề=None` thì áp cho MỌI case của nhóm,
        kể cả case định mức chung (`Kiểm tra căn lề, chính tả` · `Kiểm tra hiển thị …`). Cột D
        khi đó tả hành vi của NÚT trong khi cột B hỏi về CĂN LỀ. Đo 2026-09-14 trên
        `a6-BaoCaoDong.py`: 6 luật `tiêu_đề=None` của nhóm Button làm hỏng 22 case như vậy.

    Từ chối thì A6 **bỏ qua phép đó và đi tiếp** — để phép HẸP hơn (khai TRƯỚC luật rộng) có
    cơ hội ghi — chứ không ghi bản sai rồi chờ bộ rà kêu.
    """
    if D is not None:
        _ro = ro_code(D)
        if _ro:
            return 'cột D rò code — %s' % _ro
    if C is None and D is None:
        return None
    # Xét trên GIÁ TRỊ SAU KHI GHI, không phải chỉ phần mới: phép chỉ ghi cột C (D=None) thì
    # cột D CŨ vẫn đứng đó và cặp C/D có thể vẫn khớp mục đích. Xét thiếu vế cũ là từ chối
    # OAN đúng những luật lành — 17 luật `tiêu_đề=None` của `a6-BaoCaoDong.py` chỉ cần bỏ vế
    # D là hợp lệ trở lại, vì cột D của case đó do `fix_kq_mau` cấp theo BẢN CHỮ MẪU.
    _lech = kq_lech_muc_dich(tieu_de,
                             C if C is not None else C_cu,
                             D if D is not None else D_cu)
    if _lech:
        return 'lạc mục đích — C/D không nhắc tới "%s"' % _lech
    # ── ③ BẢN CHỮ CHUẨN cho case `giá trị mặc định` ở CN Sửa (chỉ thị 2026-09-14) ──────
    #    A6 hay tả rất kỹ ô nạp sẵn (`Ô đã nạp SẴN tên của báo cáo đang sửa. Ngay dưới ô có
    #    dòng chữ nhỏ …`) — đúng dữ kiện nhưng SAI CHỖ: người đặt việc chốt cột D của lớp case
    #    này là đúng một câu `Mặc định là dữ liệu từ DB`, chi tiết thuộc cột T. Không chặn tại
    #    gốc thì `fix_chi_thi_0914` dọn bao nhiêu lần, chạy lại A6 là hỏng lại bấy nhiêu.
    #    Cần `ten_cn` mới phân biệt được: cùng tiêu đề đó ở CN THÊM MỚI lại phải tả ô rỗng.
    if ten_cn and D is not None and mac_dinh_lech_chuan_sua(ten_cn, tieu_de, D):
        return 'case `giá trị mặc định` ở CN Sửa phải là "%s" (chi tiết để cột T)' % MAC_DINH_KQ_SUA
    return None


# ── CỘT D LAN MAN — rút gọn TAY theo chỉ thị, đồng bộ xuống bộ case đã sinh (2026-09-14) ──
# Chỉ thị (ảnh): *"case này kết quả mong muốn đang dài lan man chưa đúng trọng tâm mục đích
# case"*. Khác ⑳ (đo độ dài phần thuật): ở đây chữ dài vì ÔM NỘI DUNG CỦA CASE KHÁC — cột C chốt
# đúng MỘT tình huống mà cột D tả thêm các tình huống cột C không dựng ra. Không phép máy nào
# tách được "ý này thuộc case nào" mà không báo oan (đo 2026-09-14: lọc theo từ khoá `bộ lọc` ra
# 20 ca thì 19 là mệnh đề bổ nghĩa hợp lệ) ⇒ rút TAY, ghi lại ở đây để bộ case đã sinh đồng bộ
# được, và sửa kèm ở luật A6 để lượt sinh sau không đẻ lại.
# Mỗi mục: (tiêu đề case, cột D CŨ nguyên văn, cột D MỚI, phần dồn sang cột T).
# So khớp TUYỆT ĐỐI cả ô — chữ đã bị sửa khác đi thì bỏ qua, an toàn theo thiết kế.
KQ_LAN_MAN = [
    ('Kiểm tra báo cáo khi không có dữ liệu',
     'Chữ đổi theo bộ lọc đang áp: "Chưa có báo cáo đã xuất bản" · "Chưa có báo cáo đã xóa" · '
     '"Không có báo cáo khớp bộ lọc". Không lọc gì thì hiện khối trống tiêu đề "Chưa có báo cáo '
     'nào", dòng "Báo cáo động được tạo theo 2 bước: khai báo bộ dữ liệu → tạo báo cáo." và 2 '
     'mục hướng dẫn "1. Khai báo bộ dữ liệu / Chọn bảng ở tầng GOLD/DIAMOND được phép báo cáo" · '
     '"2. Tạo báo cáo / Chọn bộ dữ liệu rồi cấu hình tối đa 6 biểu đồ". Thanh phân trang không '
     'hiện khi tổng số bản ghi = 0.',
     'Bảng danh sách được thay bằng khối trống mang tiêu đề "Chưa có báo cáo nào". Thanh phân '
     'trang không hiện.',
     'Chữ của khối trống ĐỔI THEO BỘ LỌC đang áp: "Chưa có báo cáo đã xuất bản" · "Chưa có báo '
     'cáo đã xóa" · "Không có báo cáo khớp bộ lọc" — thuộc case của khối lọc, không thuộc case '
     'này. Khối trống còn kèm dòng "Báo cáo động được tạo theo 2 bước: khai báo bộ dữ liệu → tạo '
     'báo cáo." và 2 mục hướng dẫn "1. Khai báo bộ dữ liệu / Chọn bảng ở tầng GOLD/DIAMOND được '
     'phép báo cáo" · "2. Tạo báo cáo / Chọn bộ dữ liệu rồi cấu hình tối đa 6 biểu đồ".'),
]


# ── BANK ĐÃ ĐỔI CHỮ — bảng đồng bộ xuống bộ case ĐÃ SINH  (thêm 2026-09-14) ────────────────
# Vì sao cần: `patch_quota` chỉ BƠM case còn THIẾU, nên sửa chữ trong `quota_cases` chỉ có tác
# dụng với lượt sinh MỚI. Bộ case đã giao giữ nguyên chữ cũ mãi mãi, và bộ rà cứ báo đỏ mà
# không lệnh nào vá được — đúng lớp lỗi "bộ rà đòi thứ bộ vá không làm được" đã gỡ ở phép ⑳.
# Mỗi mục là (chữ CŨ nguyên văn, chữ MỚI, lý do). So khớp TUYỆT ĐỐI, không đoán: chữ đã bị A6
# hay người viết sửa khác đi thì KHÔNG khớp và script bỏ qua — an toàn theo thiết kế.
BANK_DOI_CHU = [
    # Bản TRUNG GIAN của chính lượt vá 14/09 (đã ghi vào bộ case rồi mới phát hiện nó làm bank
    # LỆCH MẪU — phép ㉕ bắt được). Giữ mục này để bộ case đã nhận bản trung gian đi tiếp được
    # về đích, đừng xoá: bỏ đi là mắc kẹt ở giữa đường.
    ('1. Giá trị đã chọn trong ô select được focus\n'
     '2. Hiển thị đúng số bản ghi ở trang đầu tiên và hiển thị phân trang\n'
     '3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn',
     '1. Giá trị 20 trong ô select được focus\n'
     '2. Hiển thị 20 bản ghi ở trang đầu tiên và hiển thị phân trang\n'
     '3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn',
     'bản trung gian 14/09 hết dài nhưng LỆCH MẪU (㉕). Đích cuối là nguyên văn mẫu.'),
    ('1. Giá trị đã chọn trong ô select được focus\n'
     '2. Hiển thị đúng số bản ghi mỗi trang ở trang đầu tiên và hiển thị phân trang\n'
     '3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn',
     '1. Giá trị 20 trong ô select được focus\n'
     '2. Hiển thị 20 bản ghi ở trang đầu tiên và hiển thị phân trang\n'
     '3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn',
     'phần thuật 182 > ngưỡng 180 của phép ⑳. Bản diễn giải của ta dài hơn CHÍNH MẪU: mẫu viết '
     '"Giá trị 20 … Hiển thị 20 bản ghi …" (162 ký tự). Trả về NGUYÊN VĂN MẪU — vừa hết dài, '
     'vừa hết cờ ㉕ *bank lệch mẫu*. Số 20 ở đây được phép: ㉑ chừa "số bản ghi/trang do người '
     'test nhập", và luật cứng UI cũng chốt mặc định 20.'),
]

# ⛔ KHÔNG khai ở đây chữ cũ của case §6 *Tìm kiếm với: … = giá trị mặc định* (bản 12/09 dồn chữ
# gợi ý vào cột D). `fix_bank_doi_chu` chỉ ghi CỘT D, mà khuôn mẫu 14/09 đổi cả **ba** ô — sửa
# mỗi cột D là để lại tiêu đề cũ *"= giá trị mặc định"* bên cạnh một cột D mới, tức case tự mâu
# thuẫn và chỗ chốt giá trị biến mất. Lớp case đó do `fix_luat_cung.py` (bước 11d) đưa về khuôn,
# nó ghi trọn B + C + D; bộ rà tương ứng là `audit_luat_cung.py` phép ⓔ.


# Khuôn có chỗ giữ `{f}` (tên trường) thì không so tuyệt đối được — khai bằng BIỂU THỨC khớp
# TRỌN ô, nhóm bắt `(?P<f>…)` giữ lại tên trường để dựng chữ mới. Vẫn là phép so CHẶT: sai một
# chữ là không khớp và script bỏ qua.
BANK_DOI_CHU_KHUON = [
    (_re.compile(r'- Nếu (?P<f>.+?) là trường BẮT BUỘC: báo lỗi yêu cầu nhập (?P=f) và không '
                 r'lưu bản ghi nào\.\n- Nếu (?P=f) là trường không bắt buộc: lưu thành công, '
                 r'giá trị để rỗng\.$'),
     '- Là trường bắt buộc: báo lỗi yêu cầu nhập {f}, không lưu bản ghi nào.\n'
     '- Là trường không bắt buộc: lưu thành công, giá trị để rỗng.',
     'khuôn `{f}` của bank: tên trường dài thì phần thuật vượt 180 (đo: "dòng của bảng danh '
     'sách" -> 209). Bỏ 2 lần lặp tên trường và chữ hoa BẮT BUỘC, giữ đủ 2 nhánh.'),
    (_re.compile(r'- Nếu (?P<f>.+?) là trường BẮT BUỘC: thông báo "(?P<msg>[^"]+)", highlight '
                 r'và focus vào trường lỗi, không lưu bản ghi nào\.\n- Nếu (?P=f) là trường '
                 r'không bắt buộc: lưu thành công, giá trị để rỗng\.$'),
     '- Là trường bắt buộc: thông báo "{msg}", highlight và focus vào trường lỗi, không lưu '
     'bản ghi nào.\n- Là trường không bắt buộc: lưu thành công, giá trị để rỗng.',
     'như trên, bản có thông báo verbatim + highlight của khuôn ⑮.'),
]


def bank_doi_chu(d):
    """Cột D này có khớp một chữ bank ĐÃ ĐỔI không -> (chữ mới, lý do), hoặc None."""
    cu = (d or '').strip()
    for a, b, why in BANK_DOI_CHU:
        if cu == a.strip():
            return b, why
    for rx, mau, why in BANK_DOI_CHU_KHUON:
        m = rx.fullmatch(cu)
        if m:
            return mau.format(**m.groupdict()), why
    return None


# ── XUNG ĐỘT LUẬT CỨNG ĐÃ ĐƯỢC NGƯỜI ĐẶT VIỆC QUYẾT  (thêm 2026-09-14) ─────────────────────
# `audit_luat_cung` cố ý KHÔNG tự xử xung đột giữa luật cứng UI và màn thật — nó báo và đợi
# người quyết. Nhưng trước lượt này KHÔNG có chỗ nào ghi lại QUYẾT ĐỊNH, nên một xung đột đã
# xử vẫn treo mãi ở ô đếm; treo lâu thì người đọc quen bỏ qua, đúng lớp lỗi của phép ⑳.
# Mỗi mục: (màn, control, quyết định, ngày). ⛔ KHÔNG phải chỗ làm im lỗi: bộ rà vẫn IN ra đầy
# đủ dưới nhãn `ĐÃ QUYẾT`, chỉ là không tính vào ô đếm việc-chưa-xử.
XUNG_DOT_DA_QUYET = [
    ('CanhBaoMauThuan', 'Selectbox Số bản ghi trên trang',
     'GIỮ luật cứng 20. Cột D viết theo luật, cột T mang cờ [FIXED RULE VIOLATION] ghi rõ màn '
     'thật đang là 10 — case sẽ FAIL khi chạy live, và đó là Ý ĐỒ: luật cứng là thứ hệ thống '
     'PHẢI làm. KHÔNG đổi `PAGE_SIZE_MAC_DINH` của tool.',
     '2026-09-14'),
]


def xung_dot_da_quyet(man, control):
    """Xung đột này đã được quyết chưa -> (quyết định, ngày), hoặc None."""
    m, c = norm(man or ''), norm(control or '')
    for _m, _c, qd, ngay in XUNG_DOT_DA_QUYET:
        if norm(_m) in m and (norm(_c) in c or c in norm(_c)):
            return qd, ngay
    return None


def che_them_ground(s, giu, giu_nguyen):
    """Che thêm chuỗi ĐÃ GROUND của màn lên bản đã che ngoặc kép -> chuỗi mới.

    Dùng CHUNG cho cả phép ĐO (`kq_qua_chi_tiet` · `kq_co_so_lieu`) và phép CẮT (`rut_gon_kq` ·
    `bo_so_lieu_kq`). ⚠️ Vá 2026-09-14: trước đó CHỈ phép cắt che nhóm này, phép đo thì không —
    nên `audit_extra` ⑳ báo đỏ đúng những ô mà `fix_kq_validate` CỐ Ý không đụng, và người sửa
    không có đường nào đưa nó về 0 (`fix_kq_validate` ra `0 file · 0 case` trong khi bộ rà báo
    79). Đo trên role `ChuyenVien`: 83 ca bộ vá bó tay, trong đó nhóm ngoặc/chữ hoa là GIÁ TRỊ
    THẬT của màn. Bơm và rà phải dùng CHUNG một bảng luật — cùng bài học với `patch_rangbuoc`
    và `patch_giaodien` (bộ rà gọi thẳng hàm của bộ bơm).
    """
    for _g in sorted([x for x in (giu_nguyen or ()) if x and len(x) >= 3], key=len, reverse=True):
        if _g in s:
            giu.append(_g)
            s = s.replace(_g, '\x00%d\x00' % (len(giu) - 1))
    return s


# Tính LƯỜI: `KQ_MAU_D` khai ở phía dưới trong cùng module, dựng set ngay ở đây thì
# `NameError` lúc import.
_KQ_MAU_CAU = None


def _kq_mau_cau():
    global _KQ_MAU_CAU
    if _KQ_MAU_CAU is None:
        _KQ_MAU_CAU = frozenset(norm(c) for *_x, c in KQ_MAU_D)
    return _KQ_MAU_CAU


# ── MIỄN PHÉP ⑳ CHO CASE GỘP CỦA MẪU  (thêm 2026-09-14) ────────────────────────────────────
# `kq_qua_chi_tiet` miễn trừ bản chữ mẫu bằng cách so KHỚP NGUYÊN VĂN (`norm(d) in
# _kq_mau_cau()`). Nhưng có một case mà chính mẫu viết DÀI và dự án lại BẮT BUỘC viết lại theo
# màn thật: mục 01 của nhóm `Danh sách / lưới` — *"Kiểm tra giá trị mặc định"* — là case GỘP 5
# bước (căn lề · rê chuột đổi màu dòng · bố cục grid · chú thích khi rê chuột). Bản mẫu của nó
# dài **530 ký tự**, gấp 3 ngưỡng ⑳. Viết lại theo màn (tên cột thật, kiểu căn lề thật) là việc
# A6 PHẢI làm — nhưng viết lại xong thì mất khớp nguyên văn ⇒ mất luôn miễn trừ ⇒ bị cờ.
# Đo 2026-09-14 trên role `ChuyenVien`: **12/16** case loại này của CẢ bộ bị cờ, dài 205-520 ký
# tự, tức đều NGẮN HƠN bản mẫu 530 mà vẫn báo đỏ. Cờ mà 12/16 là oan thì người sửa sẽ bỏ qua
# cả ô đếm — đúng thứ §8.5 cấm (*"nhiễu không sửa được thì đừng báo"*).
# CHỈ miễn ĐÚNG case này; mọi case khác của nhóm `Danh sách` vẫn bị ⑳ soi như thường.
def mien_kq_dai(ten_nhom, tieu_de):
    """Case này có được miễn phép ⑳ (cột D quá dài) không — vì chính MẪU viết dài."""
    if not ten_nhom or not tieu_de:
        return False
    lab, _q = kind_of(ten_nhom)
    return lab == 'Danh sách / lưới' and la_case_mac_dinh(tieu_de)


def kq_qua_chi_tiet(d, giu_nguyen=()):
    """Cột D có vi phạm khuôn ngắn của mẫu không -> danh sách tên lỗi (rỗng = đạt).

    MIỄN TRỪ **chính bản chữ của mẫu**: vài câu mẫu (ô chọn *giá trị quá dài*, lưới *giá trị mặc
    định*) dài hơn ngưỡng ⑳ — nhưng mẫu là chuẩn mà người đặt việc chốt, không thể vừa bắt viết
    y hệt mẫu vừa báo đỏ chính câu đó. Cùng lớp với hai luật đá nhau đã gỡ ở khuôn ⑮.
    """
    if norm(d) in _kq_mau_cau():
        return []
    s, _giu = che_chuoi_trich(d)
    s = che_them_ground(s, _giu, giu_nguyen)
    loi = []
    if ';' in s:
        loi.append('dấu ; nối mệnh đề')
    # Chỉ báo khi chữ HOA là TỪ NHẤN GIỌNG (`KHÔNG` `PHẢI` `VẪN`…) — tức thứ hạ xuống được.
    # Bản cũ bắt MỌI cụm 3 chữ hoa nên `GOLD` `TABLE` `VIEW` `SQL` `STT` — GIÁ TRỊ/nhãn thật của
    # màn — đều bị báo, mà lại không sửa được (hạ xuống là sai bản chữ). Đo 2026-09-11: 13/31 ca
    # cờ này là oan kiểu đó. Nhiễu không sửa được thì đừng báo (§8.5).
    if any(_re.search(r'(?<![A-ZĐÂÊÔƯĂ])%s(?![A-ZĐÂÊÔƯĂ])' % _re.escape(w), s)
           for w in KQ_HOA_NHAN_MANH):
        loi.append('CHỮ HOA nhấn mạnh')
    if _re.search(r'\([^)]{%d,}\)' % KQ_NGOAC_DAI, s):
        loi.append('ngoặc đơn giải thích')
    dau_dong = [dong.lstrip('0123456789. ').strip() for dong in s.split('\n')]
    if any(x.startswith(KQ_DAN_DO) for x in dau_dong):
        loi.append('dặn người test')
    if any(x.startswith(KQ_GIAI_THICH) for x in dau_dong):
        loi.append('giải thích/đối chiếu')
    if len(_RX_CHE.sub('', s)) > KQ_THUAT_DAI:
        loi.append('phần thuật > %d ký tự' % KQ_THUAT_DAI)
    return loi


def _hoa_dau(s):
    return s[:1].upper() + s[1:] if s else s


def rut_gon_kq(d, giu_nguyen=()):
    """Rút cột D về khuôn ngắn -> (cột D mới, [những mảnh phải dồn sang cột T]).

    CHỈ làm những phép CƠ GIỚI, xác định, không đoán nghĩa:
      · ngoặc đơn giải thích dài  -> cắt, dồn sang T
      · câu dặn dò / giải thích   -> cắt cả câu, dồn sang T
      · `;` nối mệnh đề           -> tách thành CÂU riêng (mẫu viết `Chỉ được chọn 1. Hiển thị
                                    giá trị được chọn sau cùng lên selectbox` — một dòng, hai
                                    câu), KHÔNG tách thành ý đánh số `1.`/`2.`
      · CHỮ HOA nhấn mạnh         -> hạ xuống chữ thường

    ⛔ KHÔNG cắt bớt SỐ Ý của case. Bản nháp 2026-09-11 có chặn "tối đa 2 ý" và nó cắt mất kết
       quả THẬT (`Bấm "Bỏ lọc ✕" thì chỉ bỏ điều kiện mã lô…` của case nút Bỏ lọc) — đã bỏ.
       Case dài mà mọi ý đều là kết quả thật thì để `kq_qua_chi_tiet` GẮN CỜ cho người viết tự
       rút gọn, đừng cắt bằng máy. Cùng một bài học với 3 lần "sửa quá tay" đã phải hoàn nguyên.
    """
    s, giu = che_chuoi_trich(d)
    # `giu_nguyen` = các chuỗi ĐÃ GROUND ở hồ sơ màn. Che luôn chúng để phép hạ chữ hoa không
    # đụng tới: `audit_noi_dung` dò chuỗi ground theo NỘI DUNG và có phân biệt hoa/thường, nên
    # hạ một chữ hoa NẰM TRONG chuỗi ground là chuỗi đó hết khớp — phủ grounding tụt và case
    # bị tính là "chữ chay". Đo 2026-09-11: đúng 1 chuỗi + 1 ca chữ chay rơi vì lý do này.
    # Cùng một bất biến với hai chốt ⑮/⑰ bên dưới: rút gọn không được làm bộ case sai thêm.
    s = che_them_ground(s, giu, giu_nguyen)
    bo = []
    # NGOẶC ĐƠN GIẢI THÍCH -> cắt, dồn sang cột T. Phép này từng bị TẮT ở lượt 1 (2026-09-11)
    # vì gây hỏng ba chỗ; lượt 3 BẬT LẠI được là nhờ đã có đủ ba chốt mà lúc đó chưa có:
    #   · chuỗi đã ground được che bằng `giu_nguyen` ngay bên trên  -> không còn cắt nhầm
    #     `(từ = hôm nay − 30…)` hay `relational (xanh dương)`, phủ grounding không tụt;
    #   · chốt ⑮ `dung_khuon_vuot_do_dai` ở cuối hàm  -> cắt mất `(hệ thống không cho nhập quá
    #     250 ký tự)` thì TRẢ NGUYÊN BẢN;
    #   · chốt ⑰ `co_tien_to_buoc` ở cuối hàm        -> `Bước 1 (…):` hoá `Bước 1:` thì TRẢ
    #     NGUYÊN BẢN.
    # Ngoặc NGẮN (`(vàng)`, `(xanh)`, `(*)`) vẫn giữ: đó là chú thích, không phải câu giải thích.
    def _ngoac(m):
        # `\x00N\x00` = chỗ đã che một chuỗi verbatim / chuỗi đã ground. Ngoặc nào CÒN MANG
        # một chỗ che thì KHÔNG cắt — nếu không thì `(bấm lần nữa đổi thành "Xem tất cả")`
        # bị cắt mất cả bản chữ `"Xem tất cả"`, phủ grounding tụt. Đo 2026-09-11 lượt 3: bỏ
        # chốt này làm rơi đúng 3 chuỗi đã ground.
        if len(m.group(1)) >= KQ_NGOAC_DAI and '\x00' not in m.group(1):
            bo.append(m.group(1).strip())
            return ''
        return m.group(0)
    s = _re.sub(r'\s*\(([^)]*)\)', _ngoac, s)
    # ㉔ MỆNH ĐỀ SAU GẠCH DÀI `—` -> cột T. Mẫu dùng gạch dài đúng **0,0%** trong cả 306 case
    # Validate; bộ sinh 09/2026 dùng 7,9%, và đọc ra thì mệnh đề đó luôn là lời BỔ NGHĨA —
    # `… — máy chủ khớp trên chuỗi ghép {catalog}.{schema}.{bảng}` · `… — ô chặn cứng ở thuộc
    # tính maxlength` · `… — khác thẻ Báo cáo`. Cùng một lớp với ngoặc đơn giải thích, chỉ khác
    # dấu. Giữ nguyên khi mệnh đề CÓ chỗ che (chuỗi verbatim / chuỗi đã ground) hoặc quá ngắn.
    def _dash(m):
        noi_dung = m.group(1).strip()
        if len(noi_dung) >= KQ_NGOAC_DAI and '\x00' not in noi_dung:
            bo.append(noi_dung)
            return m.group(2)
        return m.group(0)
    # Dừng ở dấu chấm KẾT CÂU (chấm + khoảng trắng) hoặc hết dòng — KHÔNG dừng ở mọi dấu
    # chấm: `{catalog}.{schema}.{bảng}` có chấm giữa chuỗi, bản đầu cắt ngang ở đó và để lại
    # đuôi cụt `.{schema} của cột "Bảng".`
    s = _re.sub(r'\s*[—–]\s*([^\n]+?)(?=(\.\s|\.$|\n|$))', _dash, s)
    # Hạ CHỮ HOA nhấn mạnh TRƯỚC khi ghép câu: làm ngược lại thì `Ô trống; KHÔNG bắt buộc`
    # ghép thành `Ô trống. KHÔNG bắt buộc` rồi mới hạ, ra `Ô trống. không bắt buộc` — đầu câu
    # thành chữ thường. Hạ trước thì `_hoa_dau` viết hoa lại đúng chữ đầu câu.
    for w in sorted(KQ_HOA_NHAN_MANH, key=len, reverse=True):
        s = _re.sub(r'(?<![A-ZĐÂÊÔƯĂ])%s(?![A-ZĐÂÊÔƯĂ])' % _re.escape(w), w.lower(), s)
    dong_moi = []
    for dong in s.split('\n'):
        if not dong.strip():
            continue
        phan = [p.strip() for p in dong.split(';') if p.strip()]
        if len(phan) > 1:
            dong = '. '.join([phan[0].rstrip('.')]
                             + [_hoa_dau(p.rstrip('.')) for p in phan[1:]]) + '.'
        dau = dong.lstrip('0123456789. ').strip()
        if (dau.startswith(KQ_DAN_DO) or dau.startswith(KQ_GIAI_THICH)) and '\x00' not in dau:
            bo.append(dau)
            continue
        # Câu DẶN DÒ nằm CUỐI dòng (không phải đầu dòng): `… Giá trị cũ được giữ. Ghi lại
        # nguyên văn thông báo.` · `… ngoài giới hạn là LỖI, ghi lại nguyên trạng.` Luật cũ chỉ
        # soi ĐẦU DÒNG nên cả lớp này lọt — đo 2026-09-11 còn 12 ca. Chỉ cắt câu Ở CUỐI, chỉ khi
        # dòng còn lại ít nhất MỘT câu (cột D không bao giờ được rỗng, §4.1), và không đụng câu
        # còn mang chuỗi verbatim đã che.
        cau = _re.split(r'(?<=[.!?])\s+', dong)
        while len(cau) > 1 and '\x00' not in cau[-1] and (
                cau[-1].strip().startswith(KQ_DAN_DO) or _RX_DAN_CUOI.search(cau[-1])):
            bo.append(cau.pop().strip())
        dong = ' '.join(cau)
        dong_moi.append(dong)
    moi = '\n'.join(dong_moi)
    moi = _re.sub(r'[ \t]+', ' ', moi)
    moi = _re.sub(r'[ \t]+([,.:])', r'\1', moi)
    moi = _re.sub(r'\.\s*\.', '.', moi).strip()
    # ⛔ CỘT D KHÔNG ĐƯỢC RỖNG. `Dòng nhóm là dòng có cột B nhưng cột D RỖNG` (§4.1) — đó là
    # cách công thức cột A phân biệt nhóm với case. Case nào có cột D gồm TOÀN câu dặn dò /
    # giải thích thì cắt hết sẽ biến chính nó thành DÒNG NHÓM: mất case, và mọi case sau nó
    # bị đánh lại mã. Gặp ca đó thì TRẢ NGUYÊN BẢN và để `kq_qua_chi_tiet` gắn cờ cho người
    # viết tự xử — thà gắn cờ hơn làm hỏng cấu trúc (§11.4).
    if not moi.strip():
        return d, []
    moi = bo_che(moi, giu)
    # ⛔ PHÉP RÚT KHÔNG ĐƯỢC PHÁ LUẬT KHÁC. Hai lần đã trả giá ngay trong lượt đầu chạy thử
    # trên 6 file ChuyenVien (2026-09-11) — cả hai đều do phép cắt NGOẶC ĐƠN:
    #   ⑮ `Kiểm tra … nhập vượt độ dài`: cụm `(hệ thống không cho nhập quá 250 ký tự)` là MỘT
    #      trong ba ý BẮT BUỘC của khuôn ⑮ — cắt đi thì `dung_khuon_vuot_do_dai` hết đạt.
    #   ⑰ `Bước 1 (còn dữ liệu gốc nhưng bộ lọc không khớp):` — bỏ ngoặc xong còn `Bước 1:`,
    #      tự tay SINH RA đúng cái vi phạm mà ⑰ cấm (trước khi cắt thì `(` chen vào giữa nên
    #      `RX_TIEN_TO_BUOC` không khớp, phép ⑰ im).
    # Bất biến chung: rút gọn là phép làm ĐẸP, không bao giờ được làm bộ case SAI thêm. Chỗ
    # nào không giữ được bất biến thì TRẢ NGUYÊN BẢN và để bộ rà gắn cờ cho người viết.
    if not co_tien_to_buoc(d) and co_tien_to_buoc(moi):
        return d, []
    if dung_khuon_vuot_do_dai(d) and not dung_khuon_vuot_do_dai(moi):
        return d, []
    return moi, [bo_che(x, giu) for x in bo]



# ── ㉑ CỘT D KHỐI VALIDATE — KHÔNG GHI SỐ LIỆU ĐẾM (chỉ thị người đặt việc 2026-09-11, lượt 2)
# Chỉ thị: *"Validate lược bỏ thêm phần số liệu, vì số liệu cập nhật liên tục không cần thiết
# ghi vào, ghi tương tự mẫu"*.
#
# Đo trên 306 case Validate của mẫu vs 1157 case của 6 file ChuyenVien:
#
#     `N lựa chọn / N cột / N thẻ / N nút`   mẫu 0,0%   |   bộ đang có 2,7%
#     chữ số đếm (`sáu lựa chọn`, `ba thẻ`)  mẫu 0,0%   |   bộ đang có 4,3%
#     `tăng N` / `giảm N`                    mẫu 0,0%   |   bộ đang có 0,3%
#     mã màu `#16a34a`                       mẫu 0,0%   |   bộ đang có 0,3%
#
# ⚠️ MẪU VẪN GHI SỐ ở hai chỗ, nên hai chỗ đó CẤM đụng:
#   · **ngưỡng validate** — `tối đa 50 ký tự` · `tối đa 1000 bản ghi` · `phải lớn hơn 0` ·
#     `nhập > 18 số`. Đây là cấu hình, không phải số liệu sống; `audit_noi_dung` phép ③
#     (NGƯỠNG CHAY) còn ĐÒI phải có số thật ở đây.
#   · **số bản ghi/trang mà chính người test nhập vào** — `Hiển thị 20 bản ghi ở trang đầu`.
#     Đó là tham số đầu vào của case, không phải số liệu đọc từ màn.
#
# Cái phải bỏ là **số ĐẾM thành phần trên màn** và **số liệu sống của thẻ**: hôm nay 6 cột, mai
# thêm cột là case sai; thẻ "ĐANG HOẠT ĐỘNG" tăng 1 thì con số phụ thuộc dữ liệu lúc chạy.
# Cách bỏ: **thay số bằng từ chỉ định, GIỮ NGUYÊN phần liệt kê phía sau** — `Đúng 6 cột theo
# thứ tự: STT · Bảng · …` -> `Đúng các cột theo thứ tự: STT · Bảng · …`. Người test vẫn đối
# chiếu được từng cột, chỉ không còn con số chết cứng.

# Danh từ chỉ THÀNH PHẦN TRÊN MÀN — đếm mấy thứ này là số liệu chết cứng.
KQ_DANH_TU_DEM = ('lựa chọn', 'tiêu đề cột', 'cột', 'thẻ', 'nút', 'ô lọc', 'ô bắt buộc', 'ô')
# Số đếm viết bằng chữ.
KQ_SO_CHU = ('hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười')
# Đứng sau các cụm này thì con số là NGƯỠNG / GIỚI HẠN, không phải số đếm -> GIỮ.
KQ_TRUOC_NGUONG = ('toi da', 'toi thieu', 'khong qua', 'vuot qua', 'lon hon', 'nho hon',
                   'quá', 'tren', 'duoi')

# `truoc` bắt tới HAI từ đứng trước con số: ngưỡng hay viết hai chữ (`tối đa 4 thẻ`). Bản đầu
# chỉ bắt một từ nên `norm('đa ')` không khớp `'toi da'` -> `tối đa 4 thẻ` bị đổi thành
# `tối đa các thẻ`, mất đúng con số GIỚI HẠN mà luật này phải giữ.
_RX_SO_DEM = _re.compile(
    r'(?P<truoc>(?:[\w\u00c0-\u1ef9]+\s+){0,2})(?P<so>\d+)\s+(?P<dt>%s)\b'
    % '|'.join(KQ_DANH_TU_DEM), _re.I)
_RX_SO_CHU_DEM = _re.compile(
    r'\b(?P<so>%s)\s+(?P<dt>%s)\b' % ('|'.join(KQ_SO_CHU), '|'.join(KQ_DANH_TU_DEM)), _re.I)
_RX_TANG_GIAM = _re.compile(r'\b(tăng|giảm)\s+\d+\b', _re.I)
_RX_MA_MAU = _re.compile(r'\s*[:(]?\s*#[0-9a-fA-F]{6}\)?')


def _la_nguong(truoc):
    return any(k in norm(truoc or '') for k in KQ_TRUOC_NGUONG)


def kq_co_so_lieu(d, giu_nguyen=()):
    """Cột D còn ghi SỐ ĐẾM thành phần / số liệu sống không -> danh sách tên lỗi."""
    s, _giu = che_chuoi_trich(d)
    s = che_them_ground(s, _giu, giu_nguyen)
    loi = []
    for m in _RX_SO_DEM.finditer(s):
        if not _la_nguong(m.group('truoc')):
            loi.append('số đếm "%s"' % m.group(0).strip())
            break
    if _RX_SO_CHU_DEM.search(s):
        loi.append('số đếm viết chữ')
    if _RX_TANG_GIAM.search(s):
        loi.append('tăng/giảm N')
    if _RX_MA_MAU.search(s):
        loi.append('mã màu #hex')
    return loi


def bo_so_lieu_kq(d, giu_nguyen=()):
    """Bỏ SỐ ĐẾM khỏi cột D, giữ nguyên phần liệt kê -> cột D mới.

    ⛔ KHÔNG đụng: chuỗi trong ngoặc kép · chuỗi đã ground ở hồ sơ màn · ngưỡng validate
       (`tối đa N …`) · số bản ghi/trang do người test nhập. Ba thứ đầu che bằng mặt nạ, thứ
       tư nhờ `KQ_DANH_TU_DEM` KHÔNG chứa `bản ghi` — mẫu vẫn ghi `Hiển thị 20 bản ghi`.
    """
    s, giu = che_chuoi_trich(d)
    s = che_them_ground(s, giu, giu_nguyen)

    def _so(m):
        if _la_nguong(m.group('truoc')):
            return m.group(0)
        return '%scác %s' % (m.group('truoc') or '', m.group('dt'))
    s = _RX_SO_DEM.sub(_so, s)
    s = _RX_SO_CHU_DEM.sub(lambda m: 'các %s' % m.group('dt'), s)
    s = _RX_TANG_GIAM.sub(lambda m: '%s theo' % m.group(1), s)
    s = _RX_MA_MAU.sub('', s)
    s = _re.sub(r'\bcác các\b', 'các', s, flags=_re.I)
    # `Có đúng hai thẻ:` -> `Có đúng các thẻ:` đọc cợn — `đúng` đi với SỐ thì được, đi với
    # `các` thì thừa. Bỏ chữ `đúng` ở đúng cụm này, giữ nguyên `Đúng các cột theo thứ tự:`
    # (ở đó `Đúng` là vị ngữ chính của câu, không phải bổ nghĩa cho số).
    s = _re.sub(r'\b(có|gồm|hiện)\s+đúng\s+các\b', r'\1 các', s, flags=_re.I)
    # Bỏ số ở ĐẦU Ý thì từ thay thế rơi xuống chữ thường: `2. 3 thẻ …` -> `2. các thẻ …`.
    # Viết hoa lại khi `các` đứng đầu dòng, đầu ý đánh số, hoặc ngay sau dấu chấm câu.
    s = _re.sub(r'(?m)^(\s*(?:\d+\.\s*)?)các\b', r'\1Các', s)
    s = _re.sub(r'([.:]\s+)các\b', r'\1Các', s)
    s = _re.sub(r'[ \t]+', ' ', s)
    s = _re.sub(r'[ \t]+([,.:])', r'\1', s)
    moi = bo_che(s, giu).strip()
    return moi if moi else d


# ── ㉒ CỘT D KHỐI VALIDATE — KHÔNG TRÍCH DẪN TÀI LIỆU / BẰNG CHỨNG (chỉ thị 2026-09-11 lượt 3)
# Chỉ thị: *"bỏ những mã như này: `(BA BR-BCD-02-2)`, bỏ nhưng câu từ `(ảnh màn thật 10/09/2026:
# "Báo cáo 3" · "Bộ dữ liệu 26")`"*.
#
# Hai lớp khác nhau, xử lý khác nhau:
#   · **Mã tài liệu** (`BA BR-…` · `TKCT §…` · `BA §3.16.14` · `GBR-07`) — là dấu vết truy
#     nguyên, CÓ giá trị, chỉ sai CHỖ ĐỂ. §8.3: cột T được phép mang tên tệp/route/mã; cột D
#     thì tuyệt đối không. ⇒ **dồn sang cột T**, không vứt.
#   · **Dẫn chứng ảnh kèm ngày + số liệu lúc chụp** (`(ảnh màn thật 10/09/2026: "Báo cáo 3")`)
#     — đúng loại "số liệu cập nhật liên tục" người đặt việc đã bác ở lượt 2: hôm nay 3, mai 4.
#     ⇒ **xoá hẳn**.
# Mẫu: 0% cả hai lớp. Bộ sinh 09/2026: 58 mã tài liệu · 4 dẫn chứng ảnh.

_RX_MA_TAI_LIEU = _re.compile(
    r'\s*[(\[]\s*(?:BA|TKCT|BR|GBR)\b[^)\]]*[)\]]', _re.I)
_RX_DAN_CHUNG = _re.compile(
    r'\s*\([^)]*(?:ảnh màn|màn thật|đo ngày|soi ngày|chụp màn)[^)]*\)', _re.I)
# Mệnh đề sau gạch dài mà chỉ còn trơ dấu câu sau khi gỡ mã -> gỡ luôn cả mệnh đề.
_RX_DASH_TRO = _re.compile(r'\s*[—–]\s*(?=[.,;:]|$)', _re.M)


def kq_co_trich_dan(d):
    """Cột D còn trích dẫn tài liệu / dẫn chứng ảnh không -> danh sách tên lỗi."""
    s, _giu = che_chuoi_trich(d)
    loi = []
    if _RX_MA_TAI_LIEU.search(s):
        loi.append('mã tài liệu (BA/TKCT)')
    if _RX_DAN_CHUNG.search(s):
        loi.append('dẫn chứng ảnh kèm ngày')
    return loi


def bo_trich_dan_kq(d):
    """-> (cột D mới, [mã tài liệu phải dồn sang cột T]). Dẫn chứng ảnh bị XOÁ, không dồn."""
    s, giu = che_chuoi_trich(d)
    ma = []

    def _ma(m):
        ma.append(m.group(0).strip().strip('()[] '))
        return ''
    s = _RX_MA_TAI_LIEU.sub(_ma, s)
    s = _RX_DAN_CHUNG.sub('', s)
    s = _RX_DASH_TRO.sub('', s)
    s = _re.sub(r'\(\s*\)', '', s)
    s = _re.sub(r'[ \t]+', ' ', s)
    s = _re.sub(r'[ \t]+([,.:;])', r'\1', s)
    s = _re.sub(r'([.,;:])\1+', r'\1', s)
    moi = bo_che(s, giu).strip()
    return (moi if moi else d), ma


# ── ㉓ CỘT C/D PHẢI KHỚP MỤC ĐÍCH Ở CỘT B (chỉ thị người đặt việc 2026-09-11 lượt 4) ────────
# Chỉ thị: *"case nào, các bước thực hiện và kết quả mong muốn phải map với case đó — case yêu
# cầu nhập khoảng trắng space thì các bước thực hiện và kết quả mong muốn cũng phải khớp với
# mục đích case"*.
#
# Ca đã trả giá (`BaoCaoDong`, cả 2 sheet): 3 case KHÁC MỤC ĐÍCH bị ghi đè CÙNG một cột C/D —
#     `Tìm kiếm khi nhập: - Textbox = Các ký tự Space`
#     `Tìm kiếm khi nhập: - Textbox là một chuỗi có ký tự Space ở đầu và cuối chuỗi`
#     `Tìm kiếm khi nhập: - Textbox là các ký tự đặc biệt`
# đều mang cột C *"lần lượt thử 1 ký tự, 2 ký tự, rồi 3 ký tự"* và cột D nói về chờ 1500 ms.
# Không case nào còn nhắc tới SPACE hay KÝ TỰ ĐẶC BIỆT — tức là cả 3 case mất sạch mục đích.
# 13 bộ rà lúc đó đều báo 0: không phép nào đối chiếu cột C/D với cột B.
#
# Bank `quota_cases.SEARCH_SINGLE_TEXT` VỐN ĐÚNG (chép từ mẫu, mỗi mục một C/D riêng) — hỏng ở
# bước A6: luật khớp `tieu_de='tim kiem khi nhap:'` là TIỀN TỐ trùm cả 3 case, và bộ khớp của
# A6 chỉ so `B.split('\n')[0]` nên 3 case này (khác nhau ở DÒNG THỨ HAI) là một với nó.
#
# Phép rà dưới đây soi THẲNG vào bộ case, không cần biết ai gây ra: cột B nêu một LOẠI DỮ LIỆU
# NHẬP thì cột C và cột D phải có ít nhất một từ cùng họ. Bảng dưới đóng, chỉ gồm những họ
# case có mục đích rõ ràng — cố ý KHÔNG rà những case mô tả tự do, để không báo oan.
KQ_MUC_DICH = (
    (('ky tu space', 'cac ky tu space', 'toan space', 'nhap space'),
     ('space', 'khoang trang', 'dau cach'), 'space'),
    (('space o dau va cuoi', 'khoang trang o dau va cuoi', 'space o dau', 'khoang trang dau'),
     ('space', 'khoang trang', 'trim', 'dau cach'), 'space đầu/cuối'),
    (('ky tu dac biet', 'the html', 'script'),
     ('dac biet', 'html', 'script', 'ma hoa', 'escape'), 'ký tự đặc biệt/HTML'),
    (('tieng viet co dau', 'chu tieng viet'),
     ('tieng viet', 'co dau', 'bo dau', 'font'), 'tiếng Việt có dấu'),
    (('hoa thuong', 'chu hoa', 'chu thuong'),
     ('hoa', 'thuong'), 'hoa/thường'),
    # `dau tru` — case số âm hay viết bằng THAO TÁC (`Nhập dấu trừ rồi nhập số`) chứ không
    # dùng chữ "âm"; thiếu khoá này thì báo oan.
    (('nhap so am', 'so am'),
     ('am', 'dau tru', 'khong cho phep nhap', 'chi nhan'), 'số âm'),
    (('so thap phan',), ('thap phan', 'khong cho phep nhap'), 'số thập phân'),
    (('copy', 'paste', 'dan vao'), ('dan', 'copy', 'paste', 'sao chep'), 'copy-paste'),
    # ⚠️ CỐ Ý KHÔNG dùng khoá trần `da ton tai`: tiêu đề mẫu `Tìm kiếm tương đối: - Nhập
    # Textbox là một phần của xâu ĐÃ TỒN TẠI` nói về xâu có sẵn trong CSDL, không phải phép
    # kiểm trùng — khoá trần làm phép rà báo oan 3 ca ngay lượt chạy đầu.
    (('du lieu da ton tai', 'ma da ton tai', 'ten da ton tai', 'gia tri da ton tai'),
     ('ton tai', 'trung', 'da co'), 'trùng dữ liệu'),
    # ── Mở rộng 2026-09-12 (chỉ thị *"mục đích case là gì thì các bước thực hiện và kết quả
    #    mong muốn đúng với case đó"*). Tám họ trên chỉ nói về LOẠI DỮ LIỆU NHẬP; các họ dưới
    #    bắt những mục đích còn lại mà bộ case hay ghi lạc sau khi áp bản chữ mẫu.
    #    ⚠️ Mỗi họ chỉ thêm khi TỪ VỰNG rõ ràng — khoá mơ hồ là đẻ báo oan (xem 2 ca đã trả
    #    giá ở trên: `tu khoa` chứa `hoa`, và `da ton tai` của case tìm kiếm tương đối).
    (('can le', 'can giua', 'can trai'),
     ('can le', 'can giua', 'can trai', 'can phai', 'thang hang'), 'căn lề'),
    (('chinh ta',), ('chinh ta', 'ghi dung chu', 'dung chu'), 'chính tả'),
    # ⚠️ `sap xep` phải đứng ĐẦU tiêu đề: `Sắp xếp` còn là TÊN TRƯỜNG (ô chọn `Sắp xếp` của
    #    màn Vị trí lưu trữ) — khoá trần bắt luôn case `chọn các giá trị khác nhau trong
    #    Sắp xếp`, báo oan. Cùng lớp bẫy với `Vị trí chú thích` bên dưới.
    (('kiem tra sap xep',), ('sap xep', 'thu tu', 'xep theo'), 'sắp xếp'),
    # Vế C/D phải rộng: màn viết thông báo rỗng bằng nhiều lối (`Không có bản ghi nào` ·
    # `Không có loại nguồn khớp bộ lọc` · ô chi tiết bỏ trống thì hiện dấu `—`).
    (('khong co du lieu', 'khi khong co ban ghi'),
     ('khong co', 'khong tim thay', 'trong', 'rong', 'chua co', 'dau —', '—'),
     'không có dữ liệu'),
    (('qua dai', 'gia tri dai', 'du lieu dai'),
     ('dai', 'ba cham', 'cat', 'tran', 'do rong', 'xuong dong'), 'giá trị quá dài'),
    (('do rong cac cot',), ('do rong', 'cot'), 'độ rộng cột'),
    (('dieu huong',), ('dieu huong', 'chuyen', 'mo ', 'sang man'), 'điều hướng'),
    (('doi mau', 'thay doi mau', 'mau icon'), ('mau',), 'đổi màu'),
    (('con tro chuot',), ('con tro',), 'con trỏ chuột'),
    # ⚠️ CHỈ khoá `tooltip`: `chú thích` còn là TÊN TRƯỜNG (`Vị trí chú thích` của biểu đồ),
    #    khoá trần bắt nhầm 11 case chọn giá trị của ô đó. Từ vựng vế C/D cũng phải rộng —
    #    case chú thích hay diễn đạt bằng `ý nghĩa của icon`, `văn bản hiện ra`.
    (('tooltip',),
     ('chu thich', 'van ban', 'tooltip', 'noi dung', 'y nghia', 'icon'), 'chú thích/tooltip'),
)


def kq_lech_muc_dich(b, c, d):
    """Cột C/D có nhắc tới đúng thứ mà cột B nêu không -> tên mục đích bị lạc, hoặc None.

    So trên **CẢ cột B** (không chỉ dòng đầu): chính vì chỉ đọc dòng đầu mà 3 case `Tìm kiếm khi
    nhập:` — khác nhau ở dòng hai — bị coi là một. Chỉ báo khi cột B khớp một họ ĐÓNG ở bảng
    `KQ_MUC_DICH`; case mô tả tự do thì im.
    """
    nb = norm(b or '')
    tho = (c or '') + ' ' + (d or '')
    ncd = norm(tho)
    # Case *hoa/thường* thường chứng minh bằng VÍ DỤ (`Nhập "MỚI" rồi nhập lại "mới"`) chứ
    # không viết chữ "hoa"/"thường". Chuẩn hoá xong thì hai chuỗi đó giống hệt nhau, nên phải
    # soi bản THÔ: có từ viết HOA từ 2 chữ cái trở lên là case đã thật sự thử chữ hoa.
    # Không dùng lớp ký tự [A-Z…] viết tay: chữ HOA tiếng Việt có dấu (`Ớ` U+1EDA, `Ề`, `Ẫ`…)
    # nằm rải khắp bảng Unicode, liệt kê tay kiểu gì cũng sót — `"MỚI"` lọt lưới ngay lượt đầu.
    co_vi_du_hoa = any(len(k) >= 2 and k.isupper() and k.isalpha()
                       for k in _re.findall(r'[^\W\d_]+', tho, _re.UNICODE))
    for khoa_b, tu_cd, ten in KQ_MUC_DICH:
        if not any(k in nb for k in khoa_b):
            continue
        # Khớp theo TỪ, không theo chuỗi con: `từ khoá` chuẩn hoá thành `tu khoa`, mà `khoa`
        # CHỨA `hoa` ⇒ mọi case hoa/thường có chữ "từ khoá" đều được tha oan. Cùng lớp bẫy với
        # `SKIP_KW` khoá rộng che mất luật (README điểm mù #3).
        if any(_re.search(r'(?<![a-z0-9])%s(?![a-z0-9])' % _re.escape(t), ncd) for t in tu_cd):
            continue
        if ten == 'hoa/thường' and co_vi_du_hoa:
            continue
        return ten
    return None


def soi_luat_trum(khop):
    """Lưới chắn cho bước A6 — `khop` = {chỉ số luật: (ghi_cd, {cột B đầy đủ đã khớp})}.

    Trả danh sách luật GHI cột C/D mà trùm từ HAI mục đích trở lên. Một luật như thế đang dán
    cùng một lời "các bước" và "kết quả mong muốn" lên những case có mục đích khác nhau —
    lớp lỗi mà lưới chắn cũ (*luật khớp 0 case*) không thấy, vì nó chỉ đếm 0 hay khác 0.
    Luật chỉ ghi cột T thì được phép trùm nhiều case (ghi chú dùng chung là bình thường).
    """
    xau = []
    for idx, (ghi_cd, tieu_de) in sorted(khop.items()):
        if ghi_cd and len(set(tieu_de)) > 1:
            xau.append((idx, sorted(set(tieu_de))))
    return xau


# ── ㉔ BẢN CHỮ CỘT D THEO MẪU (chỉ thị người đặt việc 2026-09-11 lượt 5) ────────────────────
# Chỉ thị: *"tham khảo mẫu `DanhMucTuDienDungChung.xlsx` để lấy mẫu câu kết quả mong muốn cho
# hợp lý rồi vá vào tool_v2"*.
#
# Rút từ 464 case của mẫu: gom cột D theo tiêu đề case, lấy những loại mà **mọi lần dùng đều
# GIỐNG HỆT** (51 loại) — đó là câu ĐÓNG của mẫu, không phụ thuộc màn. Bảng dưới giữ những loại
# tool này thật sự sinh ra; mỗi mục khai *những Ý BẮT BUỘC phải có* chứ KHÔNG đòi khớp từng chữ.
#
# Vì sao đòi Ý chứ không đòi nguyên văn: cùng một ý, mẫu và dự án có thể chọn từ khác nhau mà
# vẫn đúng (`chữ trong nút` vs `text trong button`). Đòi nguyên văn thì phép rà biến thành máy
# ép chép chữ — đúng cái bẫy đã đo được ở lượt 1: snap về chữ mẫu kéo median 92→84 nhưng thay
# `"Bảng hiển thị hết bản ghi trên một trang"` bằng `"Dữ liệu của trường được hiển thị bình
# thường"`, mất sạch giá trị kiểm thử. Ở đây chỉ chặn khi cột D **thiếu hẳn ý** của mẫu.
#
# ⛔ CỐ Ý KHÔNG đưa **zoom in/zoom out** vào bảng: mẫu ghi NGƯỢC NGHĨA (zoom in -> "nhỏ lại").
#    Bản đúng ở `ZOOM_D`, phép rà ⑨ giữ. Mẫu là bậc 6, không phải bậc 4 (§1).
KQ_MAU = (
    # (khoá tiêu đề, (những Ý bắt buộc — mỗi ý là tuple các từ đồng nghĩa), câu mẫu để gợi ý)
    (('kiem tra tich chon', 'tich chon o'),
     (('tich chon', 'duoc chon', 'duoc tich'),),
     'Checkbox được tích chọn.'),
    (('kiem tra bo tich chon', 'bo tich chon o'),
     (('bo tich', 'bo chon'),),
     'Checkbox được bỏ tích chọn.'),
    # Ba mục trên CHỈ áp cho ô tích chọn của BIỂU MẪU. Xem `KQ_MAU_MIEN` bên dưới.
    (('la truong bat buoc',),
     (('thong bao', 'bao loi', 'vui long'), ('highlight', 'focus', 'con tro')),
     '1. Thông báo lỗi "Vui lòng nhập <Nhãn>"\n2. Highlight, focus vào trường lỗi'),
    (('du lieu da ton tai', 'ma da ton tai', 'ten da ton tai'),
     (('ton tai', 'trung'), ('highlight', 'focus', 'con tro')),
     '1. Thông báo lỗi "<Nhãn> đã tồn tại"\n2. Highlight, focus vào trường lỗi'),
    # ⛔ CỐ Ý BỎ mục `trim space`: phép ㉓ đã đòi case về khoảng trắng phải nhắc tới khoảng
    #    trắng, còn CÁCH diễn đạt thì mỗi màn một khác và đều đúng (`khoảng trắng ở ĐẦU bị
    #    loại ngay khi gõ` · `khoảng trắng cuối bị cắt` · `khoảng trắng không được nhận`).
    #    Giữ mục này ở đây chỉ đẻ báo oan — đo 2026-09-11: 5/5 ca là oan.
    (('khi thuc hien tab',),
     (('con tro',), ('trai qua phai', 'tu trai')),
     'Con trỏ di chuyển giữa các control theo thứ tự từ trái qua phải, từ trên xuống dưới.'),
    (('khi thuc hien shift tab',),
     (('con tro',), ('nguoc lai', 'nguoc')),
     'Con trỏ di chuyển giữa các control theo thứ tự ngược lại khi ấn Tab.'),
    # Chỉ hai biến thể CÓ chữ `button` — khoá trần `can le` bắt luôn case căn lề của ô chọn
    # và của lưới (chúng không có `căn giữa`), đẻ 46 ca báo oan ngay lượt thử.
    (('can le chinh ta cua button', 'can le, chinh ta cua button'),
     (('chinh ta',), ('can giua', 'can le giua')),
     'Đúng chính tả, chữ trong nút được căn giữa.'),
)


# MIỄN TRỪ của ㉔ — đo ngày 2026-09-11: không có mấy dòng này thì 15/60 ca là BÁO OAN.
#   · `tich chon tat ca` / `hang tieu de` — ô tích chọn của BẢNG (chọn cả trang), không phải ô
#     tích chọn của biểu mẫu; câu mẫu `Checkbox được tích chọn` không mô tả đúng việc của nó.
#   · `switch` — control KHÁC checkbox (§NHAN_HIEN_THI), kết quả nói về trạng thái đã lưu.
KQ_MAU_MIEN = ('tich chon tat ca', 'chon tat ca', 'hang tieu de', 'switch', 'tat ca tren hang')


def kq_thieu_y_mau(tieu_de, d):
    """Cột D có đủ những Ý mà mẫu đòi cho loại case này không -> (ý thiếu, câu mẫu) hoặc None.

    Khớp tiêu đề theo bảng ĐÓNG `KQ_MAU`; tiêu đề ngoài bảng thì im (không đoán).

    MIỄN TRỪ **Ô BỊ KHOÁ**: ô mã ở biểu mẫu Chỉnh sửa không gõ được, nên không có thông báo lỗi
    nào để đòi — cùng miễn trừ mà phép ⑮ đã dùng (`o_bi_khoa`), dùng lại chứ không khai lại.
    """
    nb = norm(tieu_de or '')
    nd = norm(d or '')
    if any(k in nb for k in KQ_MAU_MIEN) or o_bi_khoa(d):
        return None
    # Case `là trường bắt buộc` mà màn THẬT lại không bắt buộc: cột D nói đúng sự thật
    # (`nhãn ô không có dấu (*)` · `lưu thành công`) thì KHÔNG có thông báo lỗi nào để đòi.
    # Đây là phát hiện đúng của người viết case, không phải thiếu ý. (Tiêu đề case nên đổi
    # thành `không phải là trường bắt buộc` — việc đó thuộc phép rà tiêu đề, không phải ㉔.)
    if 'bat buoc' in nb and _re.search(r'khong (phai la |la )?(truong )?bat buoc|tuy chon', nd):
        return None
    # Thông báo Ở CẤP BIỂU MẪU (`Vui lòng hoàn tất các mục còn thiếu bên dưới`) thì KHÔNG có
    # trường lỗi đơn lẻ nào để highlight/focus — đòi thêm ý đó là ép người viết ghi sai màn.
    # Gặp ở biểu mẫu nhiều bước (`Tạo báo cáo`): lỗi hiện một dòng chung ở đầu khối, không
    # gắn vào ô nào. Chỉ đòi highlight/focus khi thông báo gắn vào Ô (`ngay dưới ô`, `tại ô`).
    if _re.search(r'cac muc con thieu|hoan tat cac muc|con thieu ben duoi', nd):
        return None
    for khoa, cac_y, mau in KQ_MAU:
        if not any(k in nb for k in khoa):
            continue
        for y in cac_y:
            if not any(t in nd for t in y):
                return y[0], mau
        return None
    return None


# ══════════════════════════════════════════════════════════════════════════════════════════
# KQ_MAU_D — CỘT D KHỐI `Validate` VIẾT Y HỆT MẪU (chỉ thị người đặt việc 2026-09-11 lượt 8)
# Chỉ thị: *"viết kết quả mong muốn của validate y hệt như mẫu (tổng quát), ngoại trừ các case
# của mẫu có chi tiết thì phải làm chi tiết"*.
#
# Rút nguyên văn từ khối `Validate` của `DanhMucTuDienDungChung.xlsx` (28 nhóm / 306 case).
# Khoá: `(loại control | None, khoá tiêu đề, câu mẫu)` — luật ĐẶT TRƯỚC thắng, nên luật riêng
# cho một loại control phải khai TRƯỚC luật chung `None`.
#
# `{f}` = nhãn ô · `{n}` = giới hạn ký tự của ô. Mẫu ghi thẳng tên trường của nó
# (`"Vui lòng nhập Mã từ điển dùng chung"`) vì mẫu chỉ có MỘT màn — bank phải để chỗ điền.
#
# ⚠️ GIỮ CHUỖI ĐÃ GROUND: chỗ nào mẫu để thông báo trong ngoặc kép, bộ áp khuôn sẽ **dùng lại
# chuỗi verbatim đang có trong cột D** nếu case đó đã ground được, chỉ thay phần THUẬT quanh nó.
# Không làm vậy thì mọi thông báo thật của màn bị thay bằng chữ của mẫu ⇒ `audit_noi_dung` tụt
# phủ grounding và case thành "chữ chay" — đúng thứ §8.2 luật 2 cấm.
#
# ⛔ KHÔNG có **zoom in/out** (mẫu ghi NGƯỢC nghĩa, bản đúng ở `qalib.ZOOM_D`) và KHÔNG có case
#    của khối `Giao diện`/`Chức năng`/`ATTT` — chỉ thị chốt *"chỉ sửa phần validate"*.
KQ_MAU_D = (
    # ── ô SỐ (Textbox Thứ tự hiển thị của mẫu) — khác ô chữ ở 5 mục, khai TRƯỚC ─────────────
    ('so', 'nhap so thap phan hoac so am', 'Hệ thống không cho phép nhập'),
    ('so', 'nhap so am', 'Không cho phép nhập'),
    ('so', 'nhap ky tu khac so', 'Không cho phép nhập'),
    ('so', 'ky tu dac biet', 'Hệ thống không cho phép nhập'),
    ('so', 'trim space', 'Hệ thống không cho phép nhập khoảng trắng ở 2 đầu'),
    ('so', 'copy noi dung du lieu', 'Chỉ nhận dữ liệu số'),
    ('so', 'tieng viet co dau', 'Hệ thống chỉ cho phép nhập số'),
    ('so', 'gia tri 0', '1. Thông báo lỗi "{f} phải lớn hơn 0"\n2. Highlight, focus vào trường lỗi'),
    # ── ô CHỌN (Selectbox) ─────────────────────────────────────────────────────────────────
    # `{ds}` = DANH SÁCH GIÁ TRỊ THẬT của ô, lấy từ chính cột D đang có. Mẫu viết
    # `Hiển thị các giá trị: Hoạt động, Không hoạt động` — dấu hai chấm là để DẪN vào danh
    # sách. Áp câu mẫu mà bỏ danh sách thì còn trơ `Hiển thị các giá trị:` — người chạy test
    # không có gì để đối chiếu, case thành vô dụng. Không đọc được danh sách thì BỎ QUA case.
    ('chon', 'cac gia tri co trong', 'Hiển thị các giá trị: {ds}'),
    ('chon', 'sap xep cac gia tri', 'Giá trị trong selectbox được sắp xếp theo: {ds}'),
    ('chon', 'chon cac gia tri khac nhau',
     'Chỉ được chọn 1. Hiển thị giá trị được chọn sau cùng lên selectbox'),
    ('chon', 'qua dai',
     '1. Độ rộng ô select không thay đổi theo chiều dài dữ liệu, selectbox được fix cứng ở 1 '
     'khoảng rộng nhất định\n2. Giá trị có tên dài vượt quá khoảng rộng cố định thì sẽ hiện '
     'thêm 3 chấm, khi di chuột vào hiện hết thông tin giá trị'),
    ('chon', 'can le', 'Các giá trị trong selectbox được căn lề trái'),
    ('chon', 'tim kiem', 'Hiển thị đúng option'),
    ('chon', 'tai du lieu khi danh sach',
     'Nếu dữ liệu lớn thì load theo trang, mỗi trang 20 bản ghi. Khi cuộn chuột xuống thì load '
     'tiếp, mỗi lần load 1 trang'),
    # ── ô TÍCH (Checkbox) ──────────────────────────────────────────────────────────────────
    ('tich', 'gia tri mac dinh', 'Mặc định là không tích chọn checkbox'),
    ('tich', 'o hoac nhan', 'Ô checkbox được bỏ chọn hoặc tích chọn'),
    # ⚠️ `bo tich` PHẢI đứng trước `tich chon`: `kiem tra bo tich chon X` CHỨA `tich chon`,
    # xếp sau thì case *bỏ tích chọn* nhận nhầm câu `Checkbox được tích chọn` — sai ngược
    # nghĩa. Phép ㉔ bắt được 6 ca này ngay lượt chạy thử; cùng lớp bẫy chuỗi-con với
    # `Button Bỏ chọn` -> `o chon` ở `KQ_LOAI_NHOM`.
    ('tich', 'bo tich', 'Checkbox được bỏ tích chọn'),
    ('tich', 'tich chon', 'Checkbox được tích chọn'),
    ('tich', 'phim tat', 'Checkbox thay đổi trạng thái'),
    # ── NÚT ────────────────────────────────────────────────────────────────────────────────
    # ⚠️ Khoá KHÔNG được nối hai cụm bị dấu phẩy chen vào: `norm()` GIỮ dấu phẩy nên tiêu
    # đề ra `can le, chinh ta cua button` và khoá `can le chinh ta` KHÔNG BAO GIỜ khớp.
    # Đo 2026-09-12: đúng 23 case `căn lề, chính tả của button` giữ nguyên cột D tả CHỨC
    # NĂNG của nút (mở modal, đi bước wizard) — lạc hẳn mục đích case.
    ('nut', 'can le', 'Đúng chính tả, text trong button được căn lề giữa'),
    # ── CHUNG cho mọi ô nhập chữ ───────────────────────────────────────────────────────────
    (None, 'la truong bat buoc',
     '1. Thông báo lỗi "Vui lòng nhập {f}"\n2. Highlight, focus vào trường lỗi'),
    (None, 'khong phai la truong bat buoc',
     'Thực hiện lưu thành công. Hệ thống không bắt buộc nhập'),
    (None, 'vuot do dai',
     '1. Thông báo lỗi "{f} tối đa {n} ký tự"\n2. Highlight, focus vào trường lỗi\n'
     'Hoặc hệ thống không cho nhập quá {n} ký tự'),
    (None, 'trong do dai', 'Lưu thành công'),
    (None, 'du lieu da ton tai',
     '1. Thông báo lỗi "{f} đã tồn tại"\n2. Highlight, focus vào trường lỗi'),
    (None, 'trim space',
     '1. Thực hiện thành công\n2. Thực hiện trim space ở đầu và cuối trường dữ liệu'),
    (None, 'copy noi dung du lieu', '1. Thực hiện thành công'),
    (None, 'nhap so', '1. Dữ liệu của trường được hiển thị bình thường'),
    (None, 'tieng viet co dau',
     '1. Thực hiện thành công\n2. Dữ liệu được view lên bình thường, không bị lỗi font'),
    (None, 'ky tu dac biet',
     '1. Thực hiện thành công\n2. Các ký tự đặc biệt, thẻ html không bị mã hóa khi view lên và '
     'khi lưu vào database'),
    # ── PHÂN TRANG + cụm điều khiển trang (mẫu: 14 + 7 + 5 + 10 mục) ──────────────────────
    ('trang', 'cach danh so cac ban ghi',
     'Đánh số thứ tự tăng dần và liên tục: Số thứ tự đầu tiên của trang sau là số tiếp theo '
     'của trang trước.'),
    ('trang', 'mo cac trang',
     'Mở trang tương ứng\nSố bản ghi đầu tiên của trang sau là số tiếp theo của trang trước.'),
    ('trang', 'menu va header', 'Menu, header, footer không thay đổi'),
    ('trang', 'luu cache', 'Hệ thống không bị lưu cache'),
    # ô NHẬP SỐ TRANG / SỐ BẢN GHI TRÊN TRANG — mẫu chốt ngắn, dùng chung khoá `so`
    ('so', 'nhap ky tu khac so', 'Không cho phép nhập'),
    # ── DANH SÁCH (lưới) — mẫu viết CHI TIẾT ở case đầu, giữ nguyên độ chi tiết ────────────
    ('luoi', 'tieu de cot khop',
     'Tiêu đề cột khớp với label tương ứng trong form thêm mới'),
    ('luoi', 'khong co du lieu', 'Hiển thị icon kèm thông báo Không có dữ liệu'),
    ('luoi', 'so luong ban ghi', 'Số lượng khớp nhau'),
    ('luoi', 'hien thi dung cot', 'Dữ liệu hiển thị đúng cột, không xộc xệch'),
    ('luoi', 'do rong cac cot', 'Độ rộng các cột phù hợp với dữ liệu'),
    ('luoi', 'hien thi du lieu dai', 'Hiển thị không bị tràn cột'),
    ('luoi', 'dieu huong dung trang', 'Điều hướng đúng trang/chức năng tương ứng'),
)

# Loại control suy từ TÊN NHÓM — quyết định luật nào của `KQ_MAU_D` được áp.
# ⚠️ THỨ TỰ QUAN TRỌNG: `nut` phải đứng TRƯỚC `chon`. `Button Bỏ chọn` chuẩn hoá thành
# `button bo chon`, mà `bo chon` CHỨA `o chon` ⇒ xếp nhầm thành ô chọn và case
# *căn lề, chính tả của button* bị gán câu `Các giá trị trong selectbox được căn lề trái`.
# Cùng một lớp bẫy chuỗi-con với `tu khoa` chứa `hoa` ở phép ㉓ — nên khớp theo TỪ luôn.
KQ_LOAI_NHOM = (
    ('icon', ('icon',)),
    # Ô chọn nhanh vs ô gõ tay của cụm số bản ghi/trang — mẫu cho HAI bộ case KHÁC nhau
    # (`Selectbox số lượng bản ghi trên trang` 5 mục · `Textbox Số bản ghi trên trang` 10 mục).
    # Phải tách trước khoá `so` chung, nếu không cả hai rơi vào bộ ô-số và sai bộ.
    ('perpage_select', ('selectbox so ban ghi', 'selectbox so luong ban ghi',
                        'o chon so ban ghi')),
    ('perpage_text', ('textbox so ban ghi', 'textbox so ban ghi/trang', 'o so ban ghi')),
    ('trang', ('phan trang',)),
    ('luoi', ('danh sach',)),
    ('nut', ('button', 'nut')),
    ('so', ('textbox so', 'o so', 'thu tu hien thi', 'so ban ghi', 'nhap so trang', 'port')),
    ('chon', ('selectbox', 'combobox', 'dropdown')),
    ('tich', ('checkbox',)),
)


def kq_loai_nhom(ten_nhom):
    """Loại control suy từ TÊN NHÓM — khớp ở ĐẦU chuỗi, không khớp giữa chừng.

    §0.8e chốt tên nhóm là `<Loại control> <Nhãn UI thật>`, tức loại control luôn là TIỀN TỐ.
    Khớp giữa chừng thì `Button Quay lại DANH SÁCH` trúng khoá `danh sach` của bộ lưới và bị
    xếp thành `luoi` — đo 2026-09-12: 2 case `căn lề, chính tả của button` vì thế không nhận
    được câu mẫu, và 1 case bị áp nhầm câu của lưới (`Hiển thị icon kèm thông báo …`).
    Cùng lớp bẫy chuỗi-con với `bo chon` ⊃ `o chon` và `bo tich chon` ⊃ `tich chon`.
    """
    n = norm(ten_nhom or '')
    for loai, kws in KQ_LOAI_NHOM:
        if any(_re.match(r'%s(?![a-z0-9])' % _re.escape(k), n) for k in kws):
            return loai
    return None


def kq_mau_cho(ten_nhom, tieu_de):
    """-> câu mẫu của mẫu cho case này (còn nguyên `{f}` `{n}` `{ds}`), hoặc None."""
    loai = kq_loai_nhom(ten_nhom)
    nb = norm(tieu_de or '')
    # Ô tích của BẢNG (chọn tất cả / ô trên hàng tiêu đề) KHÔNG dùng câu checkbox của biểu
    # mẫu: việc của nó là chọn cả trang + bật thanh thao tác hàng loạt, `Checkbox được tích
    # chọn` mô tả thiếu hẳn. Cùng danh sách miễn trừ đã dùng ở `kq_thieu_y_mau`.
    if any(k in nb for k in KQ_MAU_MIEN):
        return None
    # Ba bộ RIÊNG, tra trước bảng chung: mẫu cho chúng bộ case riêng hẳn.
    rieng = {'icon': KQ_MAU_ICON, 'perpage_select': KQ_MAU_PERPAGE_SELECT,
             'perpage_text': KQ_MAU_PERPAGE_TEXT}.get(loai)
    if rieng:
        for khoa, cau in rieng:
            if khoa in nb:
                return cau
        return None
    for l_, khoa, cau in KQ_MAU_D:
        if l_ is not None and l_ != loai:
            continue
        if khoa in nb:
            return cau
    return None


# ── Bổ sung 2026-09-12: ba nhóm Validate còn lệch mẫu (người đặt việc chỉ đích danh) ───────
# `Icon` · `Selectbox số lượng bản ghi trên trang` · `Textbox Số bản ghi trên trang`.
# Rút nguyên văn từ mẫu; chỗ nào mẫu ghi số THẬT của màn nó (20 · 1000) thì để `{n}`/`{ds}`
# hoặc viết chung lại cho khỏi bịa số của màn khác.
KQ_MAU_ICON = (
    # ⚠️ KHOÁ GỘP ĐẶT TRƯỚC. Bộ case của ta GỘP hai mục của mẫu vào một tiêu đề
    # (`… hiện khi rê chuột VÀ ẩn khi bỏ chuột` · `nội dung VÀ chính tả`). Áp câu của một
    # mục thì mất nửa kia — đo 2026-09-12: `1. Không hiển thị văn bản` nuốt mất vế "hiện".
    # Ghép cả hai câu của mẫu, giữ đúng lối đánh số của mẫu.
    ('hien khi re chuot va an khi bo chuot',
     '1. Hiển thị văn bản khi di chuột vào icon\n2. Không hiển thị văn bản khi bỏ chuột ra'),
    ('hien khi re chuot va an',
     '1. Hiển thị văn bản khi di chuột vào icon\n2. Không hiển thị văn bản khi bỏ chuột ra'),
    ('noi dung va chinh ta',
     '1. Hiện thị đầy đủ ý nghĩa của icon\n2. Không có lỗi chính tả'),
    ('doi mau va con tro khi re chuot',
     '1. Icon thay đổi màu\n2. Thay đổi con trỏ chuột từ dạng mặc định sang dạng con trỏ'),
    ('icon phu hop voi chuc nang', 'Icon phù hợp với chức năng'),
    ('bieu tuong thao tac phu hop', 'Icon phù hợp với chức năng'),
    ('mau icon xoa', 'Icon màu đỏ'),
    ('mau bieu tuong xoa', 'Icon màu đỏ'),
    ('chieu rong', '1 Hiển thị chiều cao & chiều rộng theo độ dài văn bản'),
    ('can le van ban', '1. Văn bản hiển thị được căn lề trái'),
    ('van ban duoc hien thi khi di chuot', '1. Hiển thị văn bản khi di chuột vào icon'),
    ('bo chuot ra khoi', '1. Không hiển thị văn bản'),
    ('an di ngay khi bo chuot', '1. Không hiển thị văn bản'),
    ('an khi bo chuot', '1. Không hiển thị văn bản'),
    ('di chuot vao icon co thay doi mau', '1. Icon thay đổi màu'),
    ('doi mau khi re chuot', '1. Icon thay đổi màu'),
    ('con tro chuot', '1. Thay đổi con trỏ chuột từ dạng mặc định sang dạng con trỏ'),
    ('giai thich duoc cho nguoi dung', '1. Hiện thị đầy đủ ý nghĩa của icon'),
    ('loi chinh ta', '1. Không có lỗi chính tả'),
    ('chinh ta cua chu thich', '1. Không có lỗi chính tả'),
)

KQ_MAU_PERPAGE_SELECT = (
    # ⛔ LUẬT CỨNG ② ĐÈ MẪU (2026-09-12). Mẫu ghi *"mặc định giá trị đang áp dụng được chọn"* —
    # câu này ĐÚNG với mọi con số nên case không bao giờ bắt được lỗi. Đây là chỗ thứ ba cố ý
    # KHÔNG lấy theo mẫu (hai chỗ kia: zoom in/out ở §5.5, và `{f}` thay nhãn cứng).
    # ⚠️ Phải sửa ở ĐÂY nữa, không chỉ ở bank: chuỗi sinh chạy `fix_kq_mau` SAU bước A6
    # (11a/11b sau 10e) nên bảng này ghi đè lại cột D mà A6 vừa đặt đúng luật.
    ('gia tri mac dinh', 'Mặc định là 20.'),
    ('cac gia tri', 'Hiển thị list các giá trị: {ds}'),
    ('gia tri trong o select', 'Hiển thị list các giá trị: {ds}'),
    # ⚠️ 2026-09-14: mục này từng chép bản DIỄN GIẢI của ta ("đúng số bản ghi mỗi trang"), không
    # phải chữ mẫu. Bản diễn giải dài 182 ký tự phần thuật — vượt ngưỡng ⑳ là 180 — nên 8 case
    # của 6 màn bị cờ `KQ TAY` mà không lệnh nào vá được. Mẫu viết NGẮN hơn vì dùng số cụ thể.
    # Số 20 được phép: ㉑ chừa "số bản ghi/trang do người test nhập", luật cứng UI cũng chốt 20.
    ('nho hon',
     '1. Giá trị 20 trong ô select được focus\n'
     '2. Hiển thị 20 bản ghi ở trang đầu tiên và hiển thị phân trang\n'
     '3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn'),
    ('lon hon',
     '1. Giá trị đã chọn trong ô select được focus\n'
     '2. Hiển thị toàn bộ bản ghi và không hiển thị phân trang\n'
     '3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn'),
    ('bang dung tong', 
     '1. Giá trị đã chọn trong ô select được focus\n'
     '2. Hiển thị toàn bộ bản ghi và không hiển thị phân trang\n'
     '3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn'),
    ('bang tong',
     '1. Giá trị đã chọn trong ô select được focus\n'
     '2. Hiển thị toàn bộ bản ghi và không hiển thị phân trang\n'
     '3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn'),
)

KQ_MAU_PERPAGE_TEXT = (
    # ⛔ LUẬT CỨNG ②: `{n}` để mẫu điền số của MÀN — nay số do luật chốt, không do màn.
    ('gia tri mac dinh', 'Mặc định là 20.'),
    ('nhap ky tu khac so', 'Không cho phép nhập'),
    ('nhap so am', 'Không cho phép nhập'),
    ('nhap 0', 'Tự động chuyển về giá trị đang áp dụng sau khi enter'),
    ('lon hon 1000',
     '1. Hiển thị thông báo lỗi: Số bản ghi/trang tối đa 1000 bản ghi\n'
     '2. Tự động reset về 1000'),
    ('trung mot muc co san',
     '1. Hiển thị đúng số lượng bản ghi/trang = số đã nhập\n'
     '2. Giá trị tương ứng trong ô select được focus'),
    ('khong trung muc nao',
     '1. Hiển thị đúng số lượng bản ghi/trang = số đã nhập\n'
     '2. Không có giá trị nào trong ô select được focus'),
    ('nho hon tong so', 'Hiển thị đúng số bản ghi mỗi trang và hiển thị phân trang'),
    ('lon hon tong so', 'Hiển thị toàn bộ bản ghi và không hiển thị phân trang'),
    ('bang dung tong so', 'Hiển thị toàn bộ bản ghi và không hiển thị phân trang'),
)

# ── Khối `Chức năng` và `An toàn thông tin` (chỉ thị 2026-09-12: hai khối này cũng quá chi
#    tiết). Rút nguyên văn từ mẫu. ATTT có HAI biến thể — ô TÌM KIẾM khác ô BIỂU MẪU.
KQ_MAU_CN = (
    ('luu thanh cong khi xac nhan viec them',
     '1. Hiển thị thông báo Thêm mới thành công\n2. Bản ghi hiện ngoài danh sách'),
    ('luu thanh cong khi xac nhan viec chinh sua',
     '1. Hiển thị thông báo Chỉnh sửa thành công\n2. Bản ghi hiện ngoài danh sách'),
    ('luu vao dung database', 'Dữ liệu được lưu thành công vào database'),
    ('khong nhap cac truong bat buoc',
     '1. Thông báo lỗi tương ứng và không lưu thành công\n2. Không lưu bản ghi nào.'),
    ('huy bo them moi', 'Đóng popup. Không thêm mới bản ghi nào'),
    ('huy bo chinh sua', 'Đóng popup. Không chỉnh sửa bản ghi nào'),
    ('huy bo thao tac xoa', 'Hủy bỏ thành công thao tác xóa, bản ghi không bị xóa'),
    ('huy bo thao tac khoi phuc',
     'Hủy bỏ thành công thao tác khôi phục, bản ghi không bị khôi phục'),
    ('click icon dong tren man hinh xoa',
     '1. Popup được đóng lại, màn hình giữ nguyên\n2. Bản ghi không bị xóa khỏi danh sách'),
    ('xoa ban ghi trong database', 'Không hiển thị bản ghi vừa xóa trong database'),
    # ⚠️ CHỈ THỊ THẮNG MẪU (2026-09-14). Mẫu ghi nguyên văn `Hệ thống không gửi request nhiều
    #    lần` — nhưng chỉ thị người đặt việc cùng ngày cấm lẫn tiếng Anh, và chỉ thị trong phiên
    #    là BẬC 1 của thang bậc nguồn, trên mẫu (bậc 2). Đây là ca thắng mẫu thứ TƯ, ghi ở
    #    `huong-dan/DOI-CHIEU-MAU-vs-LUAT.md` §3. Đổi ở đây chứ không ở bộ rà: sửa bộ rà mà để
    #    bank nguyên chữ cũ là mỗi lượt sinh mới lại bơm lại tiếng Anh.
    ('click lien tuc vao button xoa', 'Hệ thống không gửi yêu cầu nhiều lần'),
    ('click lien tuc vao button khoi phuc', 'Hệ thống không gửi yêu cầu nhiều lần'),
    ('click lien tuc vao nut xuat', 'Thực hiện xuất thành công theo số lần click tương ứng'),
    ('xuat theo dieu kien tim kiem', 'Xuất danh sách theo thông tin tìm kiếm'),
    ('khop he thong',
     'File excel được tải xuống thành công, hiển thị dữ liệu chính xác về số lượng, '
     'sắp xếp và dữ liệu từng bản ghi'),
    ('xuat du lieu lon',
     'File excel được tải xuống thành công, hiển thị dữ liệu chính xác về số lượng, '
     'sắp xếp và dữ liệu từng bản ghi'),
    # ⚠️ HẸP TRƯỚC RỘNG — `kq_mau_khoi` trả câu của khoá khớp ĐẦU TIÊN. Hai dòng `khop du lieu`
    # / `khop db` ngay dưới sinh ra cho ngữ cảnh XUẤT EXCEL (*"Dữ liệu **xuất ra** khớp với
    # DB"*), mà khoá của chúng là chuỗi con của MỌI tiêu đề có chữ *khớp DB*. Case thẻ KPI thêm
    # 2026-09-16 vì thế bị đè mất phần cốt lõi — cột D không còn nói con số trên thẻ phải khớp
    # cái gì, trong khi màn danh sách chẳng "xuất ra" gì cả. Đặt dòng này TRƯỚC để giữ nghĩa.
    ('the kpi', 'Số liệu trên từng thẻ khớp với DB'),
    ('khop du lieu', 'Dữ liệu xuất ra khớp với DB'),
    ('khop db', 'Dữ liệu xuất ra khớp với DB'),
    ('du lieu hien thi dung tu database', 'Hiển thị thông tin chi tiết khớp với DB'),
    ('du lieu hien thi trong danh sach', 'Hiển thị danh sách bản ghi khớp với DB'),
)

# ATTT — ô TÌM KIẾM (không ghi vào CSDL)
KQ_MAU_ATTT_TIM = (
    ('alert', 'Không hiển thị màn hình alert'),
    ('xss', 'Hệ thống thực hiện tìm kiếm và:\n- Hiển thị các kết quả hợp lệ nếu có\n'
            '- Hiển thị Không tìm thấy kết quả tìm kiếm nếu không có'),
    ('sql injection', 'Hệ thống thông báo: không tìm thấy kết quả tìm kiếm'),
)
# ATTT — ô BIỂU MẪU (có ghi vào CSDL)
KQ_MAU_ATTT_FORM = (
    ('alert', 'Không hiển thị màn hình alert'),
    ('xss', '- Hệ thống không cho phép Insert\n'
            '- Hoặc cho phép Insert đúng chuỗi dữ liệu nhập vào và hiển thị ra cũng đúng '
            'chuỗi đã nhập'),
    ('sql injection', 'Kết quả mong muốn:\n- Hệ thống không cho phép Insert\n'
                      '- Hoặc cho phép Insert đúng chuỗi dữ liệu nhập vào và hiển thị ra cũng '
                      'đúng chuỗi đã nhập'),
)


def kq_mau_khoi(khoi, ten_cn, ten_nhom, tieu_de):
    """Câu mẫu cho case NGOÀI khối Validate (`Chức năng` · `An toàn thông tin`), hoặc None.

    ATTT tách hai biến thể: ô của CN Tìm kiếm không ghi vào CSDL nên mẫu viết theo hướng
    *"tìm kiếm và trả về kết quả"*, còn ô của biểu mẫu thì theo hướng *"không cho Insert"*.
    Chọn nhầm biến thể là mô tả sai hẳn hành vi ⇒ suy từ TÊN CN, không đoán theo tên nhóm.
    """
    nk, nb = norm(khoi or ''), norm(tieu_de or '')
    if 'an toan thong tin' in nk:
        bang = KQ_MAU_ATTT_TIM if la_cn_tim_kiem(ten_cn) else KQ_MAU_ATTT_FORM
    elif 'chuc nang' in nk:
        bang = KQ_MAU_CN
    else:
        return None
    for khoa, cau in bang:
        if khoa in nb:
            return cau
    return None


# ⑯ Case liệt kê GIÁ TRỊ của ô chọn không được mô tả hai nút phụ trợ — đã có case riêng.
NUT_PHU_TRO_KW = ('chon tat ca', 'bo chon tat ca')


def la_case_liet_ke_gia_tri(tieu_de):
    n = norm(tieu_de or '')
    return n.startswith('kiem tra cac gia tri co trong') or n.startswith('kiem tra cac gia tri trong')


def la_bo_loc(ten_nhom, ten_cn):
    """Nhóm control này có phải BỘ LỌC không — CHỈ đúng khi CN chứa nó là CN tìm kiếm/lọc.

    ⚠️ Vá 2026-09-09 — ĐẢO LUẬT: trước đây phải khớp một từ khoá trong `LOC_KW` mới được coi
    là bộ lọc. Danh sách từ khoá đóng đó bỏ sót mọi bộ lọc có nhãn UI "trung tính": màn
    `Dữ liệu lỗi` (moet-datalake) lọc bằng `Selectbox Bảng đích` và `Selectbox Đơn vị` —
    KHÔNG chứa 'loc'/'tim kiem'/'trang thai' nên tool đếm màn chỉ có 3 bộ lọc thay vì 5
    ⇒ thiếu 2 nhóm con của khối `Chức năng Tìm kiếm đơn lẻ` và tính tổ hợp `2^3-3-1 = 4`
    thay vì `2^5-5-1 = 26`. **Không phép rà nào kêu** vì cả bộ bơm lẫn bộ rà cùng gọi hàm này.
    Không thể chữa bằng cách đổi tên nhóm: §0.8e buộc tên nhóm = `<Loại control> <Nhãn UI thật>`.

    Luật MỚI đúng theo PROMPT v3 §2 luật 13: trong một CN tìm kiếm/lọc, MỌI nhóm control của
    khối `Giao diện` đều là bộ lọc — trừ nhóm KHUNG (`NHOM_KHUNG`). Tức chỉ còn một danh sách
    loại trừ, không còn danh sách "cho phép" đóng.
    """
    if loai_cn(ten_cn) != 'tim_kiem':
        return False
    n = norm(ten_nhom or '')
    if any(k in n for k in NHOM_KHUNG):
        return False
    return True


# ── "giá trị mặc định" ở CN SỬA phải là DỮ LIỆU ĐANG LƯU, không phải ô rỗng ──────────────
# Cùng một tiêu đề "Kiểm tra giá trị mặc định" mang hai nghĩa trái ngược:
#   · CN THÊM MỚI  -> ô rỗng / placeholder / giá trị khởi tạo
#   · CN SỬA       -> **nạp sẵn giá trị hiện tại của bản ghi**
# §5.6 đã BỎ HẲN nhóm `Nạp sẵn dữ liệu` với lý do "nội dung đã nằm trong case giá trị mặc định",
# nhưng `patch_quota.py` bơm nhóm control ở CN Sửa bằng đúng bộ chữ của CN Thêm ⇒ ngữ nghĩa nạp
# sẵn MẤT HẲN, và `patch_sua_validate.py` (nơi có sẵn chữ đúng của mẫu) chỉ sửa được nhóm nó
# CLONE, không đụng tới nhóm đã có. Đo 2026-09-08: Admin 13/28 case, `QuanTri/ChucVu` 4/4.
RONG_KW = ('de trong', 'la trong', 'bo trong', 'trong.', 'trong,', 'chua chon', 'chua nhap',
           '-- chon --', 'khong co gia tri', 'gia tri rong', 'placeholder')


# NGUYÊN VĂN MẪU `DanhMucTuDienDungChung.xlsx` CN CHỈNH SỬA (r306/r317/r338) — chỉ thị 2026-09-07
MAC_DINH_BUOC_SUA = 'Kiểm tra giá trị mặc định của trường này'
# ⚠️ CHỈ THỊ NGƯỜI ĐẶT VIỆC 2026-09-14 (ảnh, case `Kiểm tra giá trị mặc định Tên báo cáo`):
#    *"Kết quả mong đợi chưa đúng, phải là: Mặc định là dữ liệu từ DB"*.
#    Mẫu chứa CẢ HAI cách viết — `Mặc định hiển thị dữ liệu từ DB` 9 lần, `Mặc định là dữ liệu
#    từ DB` 2 lần — nên bản trước chọn nhầm biến thể theo SỐ LƯỢT. Đếm không phải căn cứ: cả họ
#    câu mặc định của mẫu đều mở bằng `Mặc định là …` (`Mặc định là trống` · `Mặc định là
#    -- Chọn --` · `Mặc định là không tích chọn checkbox` · `Mặc định là tích chọn` · `Mặc định
#    là không có file nào`), nên biến thể `là` mới là khuôn, `hiển thị` là ngoại lệ.
#    Biến thể cũ giữ ở `MAC_DINH_KQ_SUA_CU` để bộ rà/bộ sửa NHẬN RA bộ case đời trước — xoá đi
#    là 20 case đang mang chữ cũ lặng lẽ rơi khỏi lưới (đúng lỗ đã trả giá ở lượt 3 §6).
MAC_DINH_KQ_SUA = 'Mặc định là dữ liệu từ DB'
MAC_DINH_KQ_SUA_CU = ('Mặc định hiển thị dữ liệu từ DB',)


# Dấu hiệu ĐÚNG nghĩa CN Sửa: nói tới giá trị ĐANG CÓ của bản ghi. Danh sách rộng vì mỗi bộ
# diễn đạt một kiểu — đo 2026-09-08: đòi câu cố định thì báo nhầm 17/17 case NCC; thiếu
# "hiển thị sẵn"/"hình thức hiện tại"/"đang gán" thì báo nhầm thêm 5 ca nữa của Admin.
DUNG_KW = ('hien tai', 'hien san', 'hien thi san', 'dang ', 'san dung', 'da luu', 'tu db',
           'gia tri cu', 'nap san', 'dien san', 'chon san', 'giu nguyen')


def la_case_mac_dinh(tieu_de):
    return 'gia tri mac dinh' in norm(tieu_de) or 'mac dinh hien thi' in norm(tieu_de)


# Những câu mặc định NGẮN khác của mẫu vẫn ĐÚNG ở CN Sửa — không được gộp về câu "từ DB".
# Ô tích chọn của mẫu ghi `Mặc định là không tích chọn checkbox`; ép nó thành "dữ liệu từ DB" là
# vừa sai bản chữ mẫu vừa sai nghĩa (ô tích không lấy giá trị từ bản ghi nào cả).
MAC_DINH_KQ_MAU_KHAC = ('Mặc định là không tích chọn checkbox', 'Mặc định là tích chọn')


def mac_dinh_lech_chuan_sua(ten_cn, tieu_de, kq):
    """Case "giá trị mặc định" ở CN Sửa có đúng BẢN CHỮ CHUẨN không -> lý do lệch, hoặc None.

    Khác `mac_dinh_sai_o_cn_sua` (chỉ bắt ca nói NGƯỢC nghĩa — ô rỗng): phép này đòi đúng câu,
    theo chỉ thị 2026-09-14. Phải có phép ĐÒI ĐÚNG CÂU thì mới chốt được về 0 — phép cũ cố ý
    LỎNG (`DUNG_KW` nhận mọi cách diễn đạt "giá trị đang có") nên 13 case văn dài của A6 và 20
    case mang biến thể cũ đều LỌT, mà bộ sửa thì im: đúng lớp *"bộ vá làm thứ bộ rà không đo"*.
    """
    if loai_cn(ten_cn) != 'bieu_mau' or 'sua' not in norm(ten_cn):
        return None
    if not la_case_mac_dinh(tieu_de):
        return None
    d = (kq or '').strip()
    if d == MAC_DINH_KQ_SUA or d in MAC_DINH_KQ_MAU_KHAC:
        return None
    if d in MAC_DINH_KQ_SUA_CU:
        return 'dùng biến thể cũ của mẫu'
    return 'không phải bản chữ chuẩn'


def mac_dinh_sai_o_cn_sua(ten_cn, kq):
    """Case "giá trị mặc định" ở CN Sửa mà kết quả mong đợi nói ô RỖNG -> sai ngữ nghĩa.

    Bắt dấu hiệu Ô RỖNG chứ không đòi một câu chữ cố định: bộ NCC diễn đạt
    "Hiển thị sẵn giá trị hiện tại của chủ đề" — ĐÚNG nghĩa, đòi câu cố định là báo nhầm 17/17.
    """
    if loai_cn(ten_cn) != 'bieu_mau' or 'sua' not in norm(ten_cn):
        return False
    return any(k in norm(kq) for k in RONG_KW)


def mac_dinh_mo_ho_o_cn_sua(ten_cn, kq):
    """Tầng cảnh báo thứ hai: ở CN Sửa mà kết quả KHÔNG nói ô rỗng, cũng KHÔNG nói giá trị
    đang có -> mơ hồ, phải soi tay. Vd "Ô hiện đúng trạng thái mặc định theo nghiệp vụ."
    Đo 2026-09-08 trên bộ thật: chỉ **1** ca (Admin-TaiKhoan) -> tầng này rất ít nhiễu."""
    if loai_cn(ten_cn) != 'bieu_mau' or 'sua' not in norm(ten_cn):
        return False
    n = norm(kq)
    return not any(k in n for k in RONG_KW) and not any(k in n for k in DUNG_KW)


# §6 — định mức khối `Chức năng Tìm kiếm đơn lẻ`, mỗi bộ lọc một nhóm con.
# Gom về đây 2026-09-08: trước đó chỉ `patch_timkiem_donle.py` có, `audit_timkiem.py` muốn dùng
# phải `import` cả script -> chạy luôn thân script. Bộ rà và bộ bơm phải chung một luật.
SEARCH_TEXT_PREFIX = ('textbox', 'o tim', 'tim theo', 'tim nhanh')


def search_spec(gname):
    """(tên bộ case trong `quota_cases`, số mục, nhãn loại) cho một bộ lọc."""
    if norm(gname).startswith(SEARCH_TEXT_PREFIX):
        return 'SEARCH_SINGLE_TEXT', 6, 'ô nhập chữ'
    return 'SEARCH_SINGLE_PICK', 2, 'control chọn giá trị'


# §6 CỐ Ý đặt case "đặt lại phân trang khi đổi bộ lọc" vào khối `Chức năng Tìm kiếm kết hợp`
# (nhóm cuối cộng 2 case). Luật 10 lại cấm case phân trang nằm ngoài `Validate` -> hai luật chống
# nhau, y hệt ca `DUP_OK` ở §5.1: bộ case ĐÚNG MẪU thì không bao giờ nghiệm thu được.
# Mẫu `Testcase-Role-NCC-BienSoanChuDe.xlsx` có đúng case này; trước 2026-09-08 nó bị tính là
# "phân trang sai khối" ở mọi file làm đúng §6. Miễn trừ HẸP: chỉ case nói về việc ĐẶT LẠI /
# RESET phân trang khi đổi từ khoá hoặc bộ lọc. Đừng nới cho case phân trang khác.
PAGING_OK_KW = ('dat lai phan trang', 'reset phan trang', 'phan trang quay ve trang dau',
                'phan trang ve trang dau')


def _paging_ok(txt):
    n = norm(txt)
    return any(k in n for k in PAGING_OK_KW) and any(k in n for k in ('bo loc', 'tu khoa', 'tim kiem', 'loc'))


def scan_control_groups(tc):
    """[(rn cuối nhóm, tên nhóm, [tiêu đề case], TÊN CN)] cho mọi nhóm control trong `Validate`.

    Thuần đọc. Nhóm control có thể nằm ở cấp `sub2` (dưới `Validate các trường thông tin`) hoặc
    thẳng ở cấp `sub` khi khối `Giao diện` không có tầng `Validate` trung gian.

    **Tên CN thêm 2026-09-09** để bộ bơm biết NGỮ CẢNH của nhóm: cùng một `Datepicker` nhưng ở
    CN tìm kiếm là **bộ lọc**, ở CN Thêm mới là **ô biểu mẫu** — hai bộ case khác nhau. Trước đó
    `plan_quota_fill` chỉ biết TÊN NHÓM nên áp bank biểu mẫu cho cả ô lọc (đo trên
    `moetdl/DuLieuLoi`: 22/22 case datepicker phải viết lại tay).
    """
    out, cur, cases, last, in_val, grp = [], None, [], None, False, None
    cn_ten = None
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        txt = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'case':
            if cur:
                cases.append(txt)
                last = rn
            continue
        if cur:
            out.append((last, cur, cases, cn_ten))
            cur, cases, last = None, [], None
        if lv == 'cn':
            in_val, grp, cn_ten = False, None, txt
        elif lv == 'grp':
            grp, in_val = norm(txt), False
        elif lv == 'sub':
            n = norm(txt)
            if 'giao dien chung' in n:
                in_val = False
            elif 'validate' in n:
                in_val = True
            elif grp and 'giao dien' in grp:
                cur, cases, last = txt, [], rn      # nhóm control đặt thẳng ở cấp sub
        elif lv == 'sub2':
            if in_val:
                cur, cases, last = txt, [], rn
    if cur:
        out.append((last, cur, cases, cn_ten))
    return out


# Bank thay thế khi control nằm trong CN TÌM KIẾM/LỌC (ô lọc, không phải ô biểu mẫu).
# Chỉ khai loại nào THẬT SỰ khác hành vi; loại không có ở đây thì dùng bank mặc định.
BANK_LOC = {
    'Datepicker': 'DATEPICKER_LOC',
    # `Ô ngày nhiều lựa chọn` (2026-09-12) KHÔNG khai ở đây: bank `DATEPICKER_KHOANG` vốn đã
    # chép từ sheet của bộ mẫu **Tìm kiếm**, ô đó chỉ tồn tại trên thanh lọc nên không có bản
    # biểu mẫu để đổi sang.
    # `Ô ngày có giờ` cũng chưa có dòng: bộ mẫu chỉ có sheet ngày-giờ cho **Thêm mới**, chưa có
    # bản cho thanh lọc. Gặp ô ngày giờ trên thanh lọc thì bank biểu mẫu sẽ được dùng và mấy câu
    # "bấm nút lưu" phải sửa tay — ghi ra đây để không tưởng là đã phủ.
}


_RX_CHO_GIU_SOT = re.compile(r'\{[a-z_]+\}')


def fmt_bank(txt, f, loai=None, ten_nhom=None):
    """Điền chỗ giữ của một mẩu bank — CHỊU ĐƯỢC bank có chỗ giữ mới.

    Thêm 2026-09-10 cùng lúc với chỗ giữ `{loai}` của `SEARCH_SINGLE_PICK`. Trước đó mọi nơi
    đều gọi `md.format(f=f)`; thêm một chỗ giữ vào bank là các nơi CÒN LẠI nổ `KeyError`
    (đo: `patch_timkiem_donle` có HAI đường format, sửa một đường là đường kia chết).
    ⇒ Một hàm duy nhất, thêm chỗ giữ thì chỉ sửa ở đây.

    `{ph}` (2026-09-14) — CHỮ GỢI Ý bắt buộc của luật ①, suy từ `ten_nhom`. Chỗ gọi không
    truyền `ten_nhom` thì rơi về `{f}`, vẫn ra câu đọc được.

    ⚠️ Nhánh `except` cũ trả NGUYÊN văn bản, tức ghi thẳng `{ph}` vào cột B của bộ case và
    không ai biết. Nay chỗ giữ còn sót thì **BÁO TO** — thà thấy một dòng cảnh báo còn hơn
    giao một bộ case có `{ph}` trong tiêu đề.
    """
    lo = loai or (loai_control_tu_nhom(ten_nhom) if ten_nhom else 'Bộ lọc')
    ph = (placeholder_chuan(ten_nhom, 'loc') if ten_nhom and la_o_chon(ten_nhom) else None)
    try:
        ra = txt.format(f=f, loai=lo, loai_thuong=lo.lower(), ph=ph or 'giá trị mặc định')
    except (KeyError, IndexError):
        ra = txt
    if _RX_CHO_GIU_SOT.search(ra):
        print('  !! fmt_bank: chỗ giữ CHƯA ĐIỀN %s trong "%s…" — khai thêm ở `fmt_bank`'
              % (', '.join(sorted(set(_RX_CHO_GIU_SOT.findall(ra)))), ra.replace('\n', ' ')[:50]))
    return ra


def plan_quota_fill(tc, quota=None, bo_qua=None):
    """{rn chèn sau: [(mục đích, các bước, kết quả)]} — case phải bơm để mọi nhóm đủ định mức.

    Thuần tính toán, KHÔNG ghi file. Hai vòng, đúng như bản `patch_quota.py` đầu tiên:
      vòng 1 — bơm MỤC chưa hề có trong nhóm (so theo tiêu đề case trong CHÍNH nhóm đó);
      vòng 2 — bù cho case GỘP nhiều mục ("sắp xếp / căn lề / quá dài" đếm 1 nhưng chuẩn đòi 3).

    `bo_qua` (thêm 2026-09-10): truyền một list vào để NHẬN LẠI mọi nhóm bị bỏ qua kèm lý do —
    `[(tên CN, tên nhóm, số case đang có, lý do)]`. Hai `continue` dưới đây trước bản này bỏ
    nhóm TRONG IM LẶNG, nên `patch_quota` in `+0 case` và người chạy tưởng là đã đủ định mức:
      · `not label`  — không dòng nào của `QUOTA` khớp tên nhóm (định mức 0);
      · `not src`    — có định mức nhưng THIẾU bank / thiếu dòng `KINDSRC` (bẫy đã dính 3 lần:
                       `Tải lại` · `Textbox Nhập số trang` · `Checkbox bản ghi (grid)`).
    """
    import quota_cases          # 900 dòng dữ liệu — chỉ nạp khi thật sự bơm
    add = {}
    ovr = doc_override(getattr(tc, 'path', None))
    for last_rn, gname, cases, cn_ten in scan_control_groups(tc):
        label, q = kind_of(gname, quota, ovr, cn_ten)
        if not label:
            if bo_qua is not None and not mien_dinh_muc(gname) and not is_banned_group(gname):
                bo_qua.append((cn_ten, gname, len(cases),
                               'KHÔNG dòng nào của bảng QUOTA khớp tên nhóm (định mức 0)'))
            continue
        if len(cases) >= q:
            continue
        ten_bank = KINDSRC.get(label, '')
        # ── BANK THEO NGỮ CẢNH (2026-09-09) — cùng loại control, khác chỗ đứng thì khác bộ case.
        # Ngữ cảnh lấy từ TÊN CN chứa nhóm (`loai_cn`), KHÔNG từ hậu tố trong tên nhóm: chỉ thị
        # 09/09 đã chốt tên nhóm giữ đúng khuôn `<Loại control> <Nhãn UI>`, không mang chú thích.
        if loai_cn(cn_ten) == 'tim_kiem':
            ten_bank = BANK_LOC.get(label, ten_bank)
        src = getattr(quota_cases, ten_bank, None)
        if not src:
            if bo_qua is not None:
                bo_qua.append((cn_ten, gname, len(cases),
                               'định mức %d nhưng KHÔNG có bộ case nguồn — thiếu dòng ở '
                               '`qalib.KINDSRC` hoặc thiếu hằng `%s` ở `quota_cases`'
                               % (q, ten_bank or '(chưa khai KINDSRC)')))
            continue
        have, f, need = norm(' | '.join(cases)), field_of(gname), q - len(cases)
        picked = []
        for key, md, buoc, kq in src:                        # vòng 1: mục chưa có
            if len(picked) >= need:
                break
            if any(x in have for x in DISTINCT.get(norm(key), [norm(key)])):
                continue
            t = md.format(f=f)
            if norm(t) in have:
                continue
            picked.append((t, buoc.format(f=f), kq.format(f=f)))
        if len(picked) < need:                               # vòng 2: bù cho case GỘP nhiều mục
            for key, md, buoc, kq in src:
                if len(picked) >= need:
                    break
                t = fmt_bank(md, f)
                if norm(t) in have or any(norm(t) == norm(x[0]) for x in picked):
                    continue
                picked.append((t, fmt_bank(buoc, f), fmt_bank(kq, f)))
        if picked:
            add[last_rn] = picked
    return add


def patch_quota(role, only=None, apply=True, quota=None, verbose=True):
    """Bơm định mức cho cả role. Trả về (tổng case đã thêm, số sheet đụng tới, [nhóm bỏ qua]).

    Ô thứ 3 thêm 2026-09-10: danh sách nhóm bộ bơm ĐÃ BỎ QUA kèm lý do. Trước bản này hai
    `continue` của `plan_quota_fill` im lặng, nên một nhóm không có luật/không có bank chỉ hiện
    ra dưới dạng `+0 case` — không phân biệt được với "đã đủ định mức".
    """
    tot = nsheet = 0
    bo_qua_all = []
    for sh in iter_role_files(role, only=only, skip_locked=True):
        bo_qua = []
        add = plan_quota_fill(sh.tc, quota, bo_qua=bo_qua)
        bo_qua_all += [(sh.name,) + x for x in bo_qua]
        if not add:
            continue
        n = sum(len(v) for v in add.values())
        tot += n
        nsheet += 1
        if verbose:
            print('%-18s +%d case (%d nhóm)%s'
                  % (sh.name[:18], n, len(add), '' if not sh.multi else ' [%s]' % sh.bp))
        if not apply:
            continue
        pl = tcfix.Plan(sh.tc)
        for rn in sh.tc.order:
            if rn < 12:
                continue
            pl.keep(rn)
            for c in add.get(rn, []):
                pl.case(*c)
        sh.tc.rebuild(pl).save(quiet=True, sync=not sh.multi)
    if verbose and bo_qua_all:
        print('\n!! BỘ BƠM BỎ QUA %d nhóm — những nhóm này sẽ nằm RỖNG, không phải "đã đủ":'
              % len(bo_qua_all))
        for ten_file, cn_ten, gname, cnt, ly_do in bo_qua_all:
            print('   · %-16s %-34s %d case  <- %s'
                  % (ten_file[:16], gname[:34], cnt, ly_do))
    return tot, nsheet, bo_qua_all


# ══════════════════════════════════════════════════════════════════════════════
# 6. DỌN CASE TRÙNG TÊN TRONG CÙNG NHÓM  (mục ⑥ nghiệm thu §7 của luật)
# ══════════════════════════════════════════════════════════════════════════════

def _flat(s):
    return re.sub(r'\s+', ' ', (s or '')).strip().lower()


def ctx_of(c):
    """Ngữ cảnh phân biệt, lấy từ bước 2 của cột C — dùng để đặt lại tên case trùng."""
    m = re.search(r'^\s*2\.\s*(.+?)\.?\s*$', c or '', re.M)
    if not m:
        return None
    t = m.group(1).strip().rstrip('.')
    t = re.sub(r'^(thao tác|thử|bấm|thực hiện)\s+', '', t, flags=re.I)
    t = re.sub(r'^(bấm|thử)\s+', '', t, flags=re.I)
    if not t:
        return None
    # chỉ hạ chữ cái đầu khi phần sau không viết hoa theo kiểu liệt kê (Thêm/Sửa/Xoá)
    return t if re.search(r'/[A-ZĐÀ-Ỹ]', t) else t[0].lower() + t[1:]


# Tiêu đề mà MẪU cố ý dùng cho NHIỀU case trong cùng một nhóm — không phải lỗi trùng tên.
# §5.1: nhóm `Phân trang` có 4 case "vị trí trang sau 1 thao tác" DÙNG CHUNG một tiêu đề,
# chỉ khác cột C/D (thêm-rồi-Hủy · thêm-rồi-Lưu · xoá-1-item · xoá-bản-ghi-cuối-của-trang-cuối).
# Không miễn trừ thì mục 3 §12 (không case trùng tên trong nhóm) và §5.1 chống nhau,
# và bộ case đúng mẫu sẽ không bao giờ nghiệm thu được.
DUP_OK = ['vi tri trang sau khi thuc hien 1 thao tac',
          'kiem tra tim kiem']   # ảnh 1: 6 case tìm kiếm selectbox dùng chung 1 tiêu đề


def _dup_ok(b):
    n = norm(b)
    return any(k in n for k in DUP_OK)


def scan_dup_titles(tc):
    """(drop, rename) — case trùng tiêu đề trong CÙNG một nhóm. Thuần tính toán.

    Ba nhánh, theo đúng bản `dedupe_0806.py` đầu tiên:
      1. bước thực hiện GIỐNG HỆT            -> xoá bản sau (trùng thật, do bơm 2 lượt);
      2. "Kiểm tra quyền truy cập màn"        -> xoá bản sau (cùng phép thử, khác cách diễn đạt);
      3. khác thao tác (thường là ATTT
         "Thao tác khi hết phiên")            -> GIỮ cả hai, đổi tên bản sau theo ngữ cảnh bước 2.
    """
    seen, drop, rename = {}, [], []
    for rn in tc.order:
        if rn < 12:
            continue
        b = (tc.c(rn, 'B') or '').strip()
        if tc.lvl(rn) != 'case':
            seen = {}                     # đổi nhóm thì reset — trùng tên chỉ tính TRONG nhóm
            continue
        if _dup_ok(b):                    # mẫu CỐ Ý cho trùng tên -> không tính là lỗi
            continue
        k = b.lower()
        if k not in seen:
            seen[k] = rn
            continue
        if _flat(tc.c(seen[k], 'C')) == _flat(tc.c(rn, 'C')) or 'quyền truy cập màn' in b:
            drop.append(rn)
            continue
        ctx = ctx_of(tc.c(rn, 'C'))
        if not ctx:
            drop.append(rn)
            continue
        new = 'Kiểm tra %s khi hết phiên' % ctx if 'hết phiên' in b else '%s — %s' % (b, ctx)
        rename.append((rn, new))
        seen[new.lower()] = rn
    return drop, rename


def dedupe_titles(role, only=None, skip=(), apply=False, verbose=True):
    """Dọn case trùng tên cho cả role. Trả về (số case xoá, số case đổi tên, số sheet đụng tới).

    `skip` — tên màn bỏ qua (đợt 2026-08-06 bỏ `DonGia`/`GoiSTEM` vì hai file đó xử lý riêng).
    """
    skip = {s.lower() for s in skip}
    tot_del = tot_ren = nsheet = 0
    for sh in iter_role_files(role, only=only, skip_locked=True):
        if sh.name.lower() in skip:
            continue
        drop, rename = scan_dup_titles(sh.tc)
        if not drop and not rename:
            continue
        tot_del += len(drop)
        tot_ren += len(rename)
        nsheet += 1
        if verbose:
            print('### %s: xoá %d · đổi tên %d%s'
                  % (sh.name, len(drop), len(rename), '' if not sh.multi else ' [%s]' % sh.bp))
            for rn, new in rename:
                print('    r%d -> %s' % (rn, new[:78]))
        if not apply:
            continue
        for rn, new in rename:
            sh.tc.rename(rn, new)
        pl = tcfix.Plan(sh.tc)
        pl.items = [r for r in sh.tc.order if r >= 12 and r not in drop]
        sh.tc.rebuild(pl).save(quiet=True, sync=not sh.multi)
    return tot_del, tot_ren, nsheet

# ── ATTT per-field (dùng chung: patch_attt_field.py · audit_attt.py) ───────────────────
# Chỉ thị 2026-09-04: khối injection áp cho **MỌI ô gõ được** — textbox chữ · textarea · ô số ·
# Email · SĐT · mật khẩu · ô tìm. Loại trừ control KHÔNG gõ được (selectbox · checkbox · radio ·
# datepicker · upload) và ô chỉ đọc / mã tự sinh.
ATTT_PREFIX = re.compile(r'^(textbox|textarea|ô tìm|ô nhập|ô số)\s*', re.I)
ATTT_RO = ('chi doc', 'ma dinh danh', 'tu suy ra', 'tu sinh', 'tu dong sinh')
ATTT_START = ('textbox', 'textarea', 'o tim', 'o nhap', 'o so', 'tim theo', 'tim nhanh')

# từ khoá nhận diện 5 mục injection — dùng để dedupe khi bơm và để đếm khi rà
ATTT_NEEDLES = {
    # 'phan chieu' / 'the html tho' / 'chong xss' : cách diễn đạt của dự án cho CÙNG mục XSS thô —
    # thiếu chúng thì patch_attt_field tưởng còn thiếu và bơm case thứ 2 (đã gặp ở Admin-DonGia).
    'xss tho':   ['script html', 'the script', 'xss the script', 'xss tho', 'phan chieu',
                  'the html tho', 'chong xss', 'xss khi hien thi'],
    'hexa url':  ['hexa dang url', 'hexa url', 'hexa (url)', 'hexa'],
    'hexa html': ['hexa dang html', 'hexa html', 'hexa (html)'],
    'alert':     ['alert', 'canh bao'],
    'sqli':      ['sql injection', 'sqli', 'cau lenh truy van', 'chen cau lenh'],
}


def attt_field_label(g):
    """Bỏ từ khoá LOẠI control, giữ TÊN trường ("Textbox Số điện thoại" -> "Số điện thoại")."""
    s = ATTT_PREFIX.sub('', g).strip()
    return re.sub(r'\s*\(.*?\)\s*$', '', s).strip() or g


def needs_attt(g):
    """Nhóm control này có phải ô GÕ ĐƯỢC (⇒ phải có khối ATTT injection) không?"""
    n = norm(g)
    if not n.startswith(ATTT_START):
        return False
    return not any(b in n for b in ATTT_RO)


def attt_kind_of_cn(cn):
    """-> ('Nhập Excel'|'Tìm kiếm'|'Thêm mới'|'Chỉnh sửa', số case chuẩn) hoặc (None, 0)."""
    n = norm(cn)
    if 'nhap excel' in n or 'import' in n:                     return 'Nhập Excel', 4
    if la_cn_tim_kiem(cn):                                     return 'Tìm kiếm', 4
    if any(k in n for k in ('them', 'tao', 'khoi tao')):       return 'Thêm mới', 5
    if any(k in n for k in ('chinh sua', 'cap nhat', 'sua ')): return 'Chỉnh sửa', 5
    # CN duyệt / từ chối / trả lại: thao tác UPDATE trạng thái bản ghi đã có, nhưng hộp xác
    # nhận của chúng mang ô nhập lý do / nhận xét được LƯU LẠI (THGV BaiGiang: `reason` của
    # `lessons:review`). Ô gõ được mà không luật nào nhận ra CN thì `patch_attt_field` không
    # bơm và `audit_attt` chỉ đếm vào [CN LẠC LUẬT] — khối injection rỗng vĩnh viễn.
    if any(k in n for k in ('duyet', 'tu choi', 'tra lai')):   return 'Chỉnh sửa', 5
    return None, 0


# ═══════════════ TÊN NHÓM `Chức năng …` PHẢI THEO BẢN CHUẨN (2026-09-12) ═══════════════
# Hồ sơ màn khai tên nhóm chức năng bằng chữ TỰ NHIÊN ("Chức năng Tìm kiếm"), nhưng cả bộ
# patcher lẫn bộ rà tra theo tên CHUẨN của mẫu ("Chức năng Tìm kiếm chung"). Lệch một chữ là:
#   · `patch_timkiemchung.py` không thấy nhóm  -> KHÔNG bơm 4 case của mẫu;
#   · `audit_func.pick()` trả (None, None)     -> bộ rà KHÔNG kêu thiếu;
#   ⇒ nhóm nằm RỖNG VĨNH VIỄN, chỉ `audit_extra` phép ③ đếm được "Nhóm rỗng: 1".
# Đo 2026-09-12 trên đường sinh MỚI của một dự án trắng: khai `"Chức năng Tìm kiếm"` mất đúng
# 4 case `Tìm kiếm chung` của mẫu mà 12/13 bộ rà vẫn ra 0.
# Khoá so khớp là tên ĐÃ CHUẨN HOÁ ĐẦY ĐỦ (không phải chuỗi con) — `Chức năng Tìm kiếm đơn lẻ`
# và `… kết hợp` là nhóm KHÁC, đổi tên chúng là hỏng bộ ba của mẫu.
TEN_NHOM_CN_CHUAN = {
    'chuc nang tim kiem': 'Chức năng Tìm kiếm chung',
    'chuc nang loc': 'Chức năng Tìm kiếm chung',
    'chuc nang tim kiem va loc': 'Chức năng Tìm kiếm chung',
    'chuc nang them': 'Chức năng Thêm mới',
    'chuc nang tao moi': 'Chức năng Thêm mới',
    'chuc nang sua': 'Chức năng Chỉnh sửa',
    'chuc nang cap nhat': 'Chức năng Chỉnh sửa',
    'chuc nang xuat excel': 'Chức năng Xuất excel',
    'chuc nang xuat file': 'Chức năng Xuất excel',
    'chuc nang nhap excel': 'Chức năng Nhập excel',
    'chuc nang huy': 'Chức năng Hủy bỏ',
}


def ten_nhom_cn_chuan(ten):
    """Tên nhóm `Chức năng …` theo bản chuẩn của mẫu. Không biết thì GIỮ NGUYÊN."""
    return TEN_NHOM_CN_CHUAN.get(norm(ten), ten)


def cn_khong_tra_duoc_bo_muc(ten):
    """True khi tên nhóm mở đầu bằng `Chức năng` mà KHÔNG bộ mục nào của mẫu tra ra.

    Dùng cho cả lúc dựng khung (`new_from_base`) lẫn lúc nghiệm thu (`audit_func`): nhóm như
    vậy sẽ không được patcher nào bơm và cũng không bộ rà nào đòi -> rỗng vĩnh viễn.
    """
    n = norm(ten)
    if not n.startswith('chuc nang'):
        return False
    if n in TEN_NHOM_CN_CHUAN:
        return False
    biet = ('danh sach', 'tim kiem chung', 'tim kiem ket hop', 'tim kiem don le', 'them moi',
            'tao moi', 'them ', 'khoi tao', 'cap nhat', 'chinh sua', 'chi tiet', 'xoa', 'xuat',
            'nhap excel', 'import', 'huy')
    if n.startswith('chuc nang sua'):
        return False
    return not any(k in n for k in biet)


# ═══════════════════ NEO DÒNG A6 THEO NỘI DUNG (2026-09-12) ═══════════════════
# Vì sao: các script `a6-<Màn>.py` khoá bảng `SUA` theo SỐ DÒNG tuyệt đối. Chỉ cần hồ sơ màn đổi
# (dời 1 nhóm sang CN khác) hoặc chuỗi bơm thêm 1 case là MỌI dòng phía sau trượt, script `raise
# SystemExit` ngay case đầu tiên lệch ⇒ cả chuỗi sinh chết mà không sửa được gì. Đo 2026-09-12:
# ngay chính file THẬT mà A6 sinh ra cũng đã lệch 50/337 dòng sau các bước chạy sau nó.
#
# Cách vá: kèm mỗi script A6 một tệp neo `a6-<Màn>.neo.json` = {số dòng: [CN, nhóm, tiêu đề]},
# chụp từ file mà bảng `SUA` được soạn theo. Lúc chạy, số dòng chỉ còn là GỢI Ý — dòng thật tra
# theo bộ ba nội dung đó trong file hiện tại. Case nào không tra ra thì BÁO rồi đi tiếp, không
# giết cả chuỗi: mất vài case nội dung thật vẫn hơn mất trắng cả bộ.

def _khoa_neo(s):
    return norm((s or '').split('\n')[0])


def chup_neo(tc):
    """{số dòng: (CN, nhóm, tiêu đề)} cho mọi dòng case của `tc`.

    Cấp trong `tcfix.TC.LV_TEN` là ('cn','grp','sub','sub2') + 'case'/'dem'. "Nhóm" của một case
    là tiêu đề GẦN NHẤT phía trên nó — `sub2` (control) nếu có, không thì `sub`, không nữa thì
    `grp` — vì bộ case nông sâu khác nhau tuỳ khối.
    """
    ra, cn = {}, ''
    sau = {'grp': '', 'sub': '', 'sub2': ''}
    for rn in tc.order:
        lv = tc.lvl(rn)
        t = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            cn = t
            sau = {'grp': '', 'sub': '', 'sub2': ''}
        elif lv == 'grp':
            sau['grp'], sau['sub'], sau['sub2'] = t, '', ''
        elif lv == 'sub':
            sau['sub'], sau['sub2'] = t, ''
        elif lv == 'sub2':
            sau['sub2'] = t
        elif lv == 'case':
            ra[rn] = (cn, sau['sub2'] or sau['sub'] or sau['grp'], t)
    return ra


def neo_a6(tc, SUA, neo):
    """Dời bảng `SUA` (khoá theo số dòng cũ) sang số dòng THẬT của `tc`.

    `neo` = {số dòng cũ (str/int): [CN, nhóm, tiêu đề]} đọc từ `a6-<Màn>.neo.json`.
    -> (SUA_mới, [(dòng cũ, tiêu đề) không tra ra]).
    Không có `neo` thì trả nguyên bảng cũ (giữ nết cũ cho script chưa chụp neo).
    """
    if not neo:
        return dict(SUA), []
    neo = {int(k): tuple(v) for k, v in neo.items()}
    hien = chup_neo(tc)
    # 3 mức tra, hẹp trước rộng sau (luật hẹp trước luật rộng — xem memory a6-luat-khop-noi-dung)
    idx3, idx2, idx1 = {}, {}, {}
    for rn, (cn, grp, t) in hien.items():
        idx3.setdefault((_khoa_neo(cn), _khoa_neo(grp), _khoa_neo(t)), []).append(rn)
        idx2.setdefault((_khoa_neo(grp), _khoa_neo(t)), []).append(rn)
        idx1.setdefault((_khoa_neo(cn), _khoa_neo(t)), []).append(rn)
    da_dung, ra, truot = set(), {}, []
    for rn_cu in sorted(SUA):
        k = neo.get(rn_cu)
        if not k:
            truot.append((rn_cu, '(thiếu neo)'))
            continue
        cn, grp, t = k
        ung = None
        for idx, kk in ((idx3, (_khoa_neo(cn), _khoa_neo(grp), _khoa_neo(t))),
                        (idx2, (_khoa_neo(grp), _khoa_neo(t))),
                        (idx1, (_khoa_neo(cn), _khoa_neo(t)))):
            con = [r for r in idx.get(kk, []) if r not in da_dung]
            if con:
                # trùng tiêu đề trong cùng nhóm -> lấy dòng GẦN số dòng cũ nhất
                ung = min(con, key=lambda r: abs(r - rn_cu))
                break
        if ung is None:
            truot.append((rn_cu, t))
            continue
        da_dung.add(ung)
        ra[ung] = SUA[rn_cu]
    return ra, truot


def doc_neo(duong_dan_script):
    """Đọc `a6-<Màn>.neo.json` nằm cạnh script A6; chưa có thì trả {}."""
    import json as _json
    p = os.path.splitext(duong_dan_script)[0] + '.neo.json'
    if not os.path.exists(p):
        return {}
    with open(p, encoding='utf-8') as f:
        return _json.load(f)


# ══════════════════════════════════════════════════════════════════════════════════════════
# A6 TỰ ĐỘNG — BƠM DỮ KIỆN ĐÃ GROUND VÀO CỘT C/D  (2026-09-12)
# ══════════════════════════════════════════════════════════════════════════════════════════
# Vì sao có phần này: bước A6 (HDSD §3) là bước DUY NHẤT đưa nhãn/thông báo/giá trị THẬT của
# màn vào cột C/D, và tới 2026-09-12 nó chỉ tồn tại dưới dạng script viết tay cho từng màn
# (`ho-so-man/a6-<Màn>.py`, 856–1515 dòng/màn). Hệ quả đo được trên đường sinh của một dự án
# TRẮNG (không còn dữ liệu dự án nào): chuỗi chạy trọn, 13 bộ rà cấu trúc ra 0, nhưng cột D
# còn nguyên chỗ giữ `<số ký tự tối đa>` và thông báo lỗi tự chế — `audit_noi_dung` đo phủ
# grounding 59% và 20 case "chữ chay". Nghĩa là: dự án mới sinh được bộ case ĐẦY ĐỦ KHUNG mà
# KHÔNG đầy đủ NỘI DUNG, trừ khi có người ngồi viết script A6 riêng.
#
# Phần dưới đây bơm TỰ ĐỘNG những dữ kiện đã ground mà khuôn case CHỈ CÓ MỘT CHỖ ĐẶT — không
# suy diễn, không sinh chữ mới: mỗi hàm `b_*` chỉ ghi khi hồ sơ màn CÓ đúng khoá đó.
#   · thiếu khoá  -> KHÔNG ghi gì (im lặng, không bịa);
#   · có khoá mà không case nào nhận -> báo `[KHÔNG GẮN ĐƯỢC]` để người soạn biết còn nợ A6.
# Phần chữ phụ thuộc hành vi riêng của màn (ô bị khoá khi sửa, xoá mềm, wizard…) VẪN phải
# viết tay ở `a6-<Màn>.py` — bản tự động chạy TRƯỚC nên script tay ghi đè được.
#
# ⚠️ Ba luật của mẫu mà chữ sinh ra ở đây phải theo (đã bị bộ rà bắt khi viết tay):
#   · cột D CẤM từ lóng `toast` / `badge` / `placeholder` (phép rò chữ kỹ thuật);
#   · case *vượt độ dài* phải giữ đủ 4 ý của khuôn ⑮ — nên chỗ này chỉ THAY SỐ, không viết lại;
#   · KHÔNG đụng case *"Kiểm tra hiển thị đầy đủ các thông tin"* (của `patch_giaodien`, phép ⑧/⑫)
#     và case *"Kiểm tra tổng thể giao diện màn hình"* (bản chữ cố định §7.3, phép ⑲).
A6_CAM_DUNG = ('hien thi day du cac thong tin', 'tong the giao dien man hinh',
               'khi thuc hien tab', 'khi thuc hien shift tab',
               'khi thuc hien zoom in', 'khi thuc hien zoom out')


def a6_set_t(tc, rn, txt):
    """Ghi cột T (ghi chú / cờ) — `retext` chỉ đổi B/C/D nên cột T phải ghi thẳng vào XML."""
    b = tc.rows[rn]['body']
    cm = re.search(r'<c r="T%d"[^>]*?(?:/>|>.*?</c>)' % rn, b, re.S)
    if not cm:
        return False
    st = re.search(r's="(\d+)"', cm.group(0))
    tc.rows[rn]['body'] = b.replace(
        cm.group(0),
        '<c r="T%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
        % (rn, st.group(1) if st else '0', tcfix.esc(txt)))
    return True


def a6_noi_t(tc, rn, txt):
    """NỐI thêm một cờ vào cột T, KHÔNG ghi đè phần đang có.

    `a6_set_t` thay trọn ô — dùng cho ghi chú do chính A6 sinh. Cờ luật cứng thì phải nối:
    case có thể đã mang `[CẦN VERIFY]` do `Plan.case()` gắn tự động, ghi đè là mất nợ đã ghi.
    """
    b = tc.rows[rn]['body']
    m = re.search(r'<c r="T%d"[^>]*?(?:/>|>(.*?)</c>)' % rn, b, re.S)
    cu = ''
    if m and m.group(1):
        cu = ' '.join(re.findall(r'<t[^>]*>(.*?)</t>', m.group(1), re.S)).strip()
    if txt in cu:
        return True
    return a6_set_t(tc, rn, (cu + ' · ' + txt).strip(' ·') if cu else txt)


def a6_chuoi(x, noi=' · '):
    """Giá trị hồ sơ màn -> một dòng chữ đọc được. Dict/rỗng -> None (không ghi)."""
    if x is None or isinstance(x, dict):
        return None
    if isinstance(x, (list, tuple)):
        cai = [a6_chuoi(i) for i in x]
        cai = [c for c in cai if c]
        return noi.join(cai) if cai else None
    s = str(x).strip()
    return s or None


def a6_ten_truong(ten_nhom):
    """`Textbox Mã kho` -> `ma kho` (bỏ nhãn loại control ở đầu tên nhóm)."""
    _loai, ten = nhan_va_ten(ten_nhom or '')
    return norm(ten or ten_nhom or '')


# Hậu tố của khoá `hang_so` mang NGƯỠNG ĐỘ DÀI. `_dom` = chỉ đọc được thuộc tính của ô nhập
# trên giao diện, chưa phải giới hạn của cột dữ liệu -> case dùng nó phải mang cờ [CẦN VERIFY].
A6_HAU_TO_DAI = ('_max_dom', '_max_validate', '_max_ky_tu', '_max')


def a6_nguong_dai(h, ten_nhom):
    """(số ký tự tối đa, tên khoá, có phải chỉ đo trên giao diện) của ô `ten_nhom`.

    Khớp theo TÊN TRƯỜNG rút từ tên nhóm, lấy khoá DÀI NHẤT khớp được — `ten_max_dom` và
    `ten_hien_thi_max_dom` cùng khớp nhóm `Textbox Tên hiển thị`, phải chọn cái sau.
    Không khớp chắc chắn thì trả None: thà giữ chỗ giữ `<số ký tự tối đa>` (có bộ rà ④ soi)
    còn hơn điền nhầm ngưỡng của trường khác.
    """
    if not h:
        return None, None, False
    tn = a6_ten_truong(ten_nhom)
    if not tn:
        return None, None, False
    tot = None
    for k, val in h.items():
        if not isinstance(val, int):
            continue
        for hau in A6_HAU_TO_DAI:
            if k.endswith(hau):
                truong = norm(k[:-len(hau)].replace('_', ' '))
                if truong and (tn == truong or tn.startswith(truong + ' ')
                               or truong.startswith(tn + ' ') or tn.endswith(' ' + truong)):
                    if tot is None or len(truong) > len(tot[3]):
                        tot = (val, k, k.endswith('_dom'), truong)
                break
    return (tot[0], tot[1], tot[2]) if tot else (None, None, False)


def a6_loi_cua(v, ten_nhom, hau_to):
    """Thông báo lỗi verbatim của ô `ten_nhom` theo hậu tố (`_rong` · `_qua_dai` · …)."""
    lv = (v or {}).get('loi_validate')
    if not isinstance(lv, dict):
        return None, None
    tn = a6_ten_truong(ten_nhom)
    tot = None
    for k, msg in lv.items():
        if not k.endswith(hau_to) or not isinstance(msg, str):
            continue
        truong = norm(k[:-len(hau_to)].replace('_', ' '))
        if truong and (tn == truong or tn.startswith(truong + ' ') or tn.endswith(' ' + truong)
                       or truong.startswith(tn + ' ')):
            if tot is None or len(truong) > len(tot[2]):
                tot = (msg, k, truong)
    return (tot[0], tot[1]) if tot else (None, None)


def _a6_dong_dau(d, moi):
    """Thay DÒNG ĐẦU của cột D (`1. Thông báo lỗi "…"`) mà giữ nguyên các dòng sau (khuôn ⑮)."""
    dong = (d or '').split('\n')
    if not dong:
        return moi
    dong[0] = moi
    return '\n'.join(dong)


# ── CÁC PHÉP BƠM ─────────────────────────────────────────────────────────────────────────
# Mỗi hàm nhận `x` (một case đang xét) và trả `(C, D, T, [khoá hồ sơ đã dùng])`.
# `None` = không áp dụng; C/D/T `None` = giữ nguyên ô đó. Hàm nào cũng phải:
#   · chỉ ghi khi hồ sơ màn CÓ khoá tương ứng (thiếu -> trả None, KHÔNG bịa chữ);
#   · ghi đúng MỘT mục đích (nhiều mục đích thì tách thành nhiều hàm) — phép rà `soi_luat_trum`
#     của A6 viết tay sinh ra chính vì luật trùm nhiều mục đích dán chung một cột D.

def _b_nguong_do_dai(x):
    """Case *vượt / trong độ dài*: thay chỗ giữ `<số ký tự tối đa>` bằng ngưỡng đã ground."""
    td = x['td']
    vuot = 'vuot do dai' in td
    if not vuot and 'trong do dai' not in td:
        return None
    n, khoa, chi_dom = a6_nguong_dai(x['h'], x['nhom2'])
    if n is None:
        return None
    C = (x['C'] or '').replace('dài hơn giới hạn cho phép', 'dài hơn %d ký tự' % n) \
                      .replace('dài đúng bằng giới hạn cho phép', 'dài đúng %d ký tự' % n)
    D = (x['D'] or '').replace('<số ký tự tối đa>', str(n))
    msg, khoa_msg = a6_loi_cua(x['v'], x['nhom2'], '_qua_dai')
    dung = ['hang_so.%s' % khoa]
    if vuot and msg:
        D = _a6_dong_dau(D, '1. Thông báo lỗi "%s"' % msg)
        dung.append('verbatim.loi_validate.%s' % khoa_msg)
    T = None
    if chi_dom:
        # §11.4 thà gắn cờ hơn bịa: `*_max_dom` mới chỉ là thuộc tính chặn của ô nhập trên giao
        # diện, chưa phải giới hạn của cột dữ liệu.
        T = ('✿✿ [CẦN VERIFY] Giao diện chặn %d ký tự bằng thuộc tính độ dài của ô nhập. Giới '
             'hạn thật của cột dữ liệu chưa được xác nhận.' % n)
    return (C if C != x['C'] else None, D if D != x['D'] else None, T, dung)


def _b_bat_buoc(x):
    """Case *là trường bắt buộc*: dùng đúng câu báo lỗi của màn."""
    if 'la truong bat buoc' not in x['td']:
        return None
    msg, khoa = a6_loi_cua(x['v'], x['nhom2'], '_rong')
    if not msg:
        return None
    return (None, _a6_dong_dau(x['D'], '1. Thông báo lỗi "%s"' % msg), None,
            ['verbatim.loi_validate.%s' % khoa])


def _b_sai_dinh_dang(x):
    """Ô có luật ĐỊNH DẠNG (mã chỉ nhận chữ thường/số/gạch ngang…): bản chữ mặc định của bank
    nói *"ký tự đặc biệt được chấp nhận"* — SAI hẳn với ô có ràng buộc. Chỉ ghi khi hồ sơ khai
    CẢ luật định dạng LẪN câu báo lỗi, tức đã ground được cả hai."""
    if 'ky tu dac biet' not in x['td']:
        return None
    tn = a6_ten_truong(x['nhom2'])
    regex = None
    for k, val in (x['h'] or {}).items():
        if k.endswith('_regex') and isinstance(val, str):
            truong = norm(k[:-len('_regex')].replace('_', ' '))
            if truong and (tn == truong or tn.startswith(truong + ' ') or tn.endswith(' ' + truong)):
                regex = (val, k)
                break
    msg, khoa_msg = a6_loi_cua(x['v'], x['nhom2'], '_sai_dinh_dang')
    if not regex or not msg:
        return None
    return (None,
            '1. Thông báo lỗi "%s"\n2. Highlight, focus vào trường lỗi\nÔ chỉ nhận: %s'
            % (msg, regex[0]),
            None, ['hang_so.%s' % regex[1], 'verbatim.loi_validate.%s' % khoa_msg])


def _b_tieu_de_cot(x):
    """Case *tiêu đề cột*: liệt kê đúng tên cột đã ground, đúng thứ tự trên màn."""
    if 'tieu de cot' not in x['td'] or 'sap xep' in x['td']:
        return None
    cot = a6_chuoi((x['v'] or {}).get('cot_bang'))
    if not cot:
        return None
    return (None, 'Bảng hiện đúng các cột, đúng thứ tự: %s. Tiêu đề đúng chính tả, không viết '
                  'tắt lạ.' % cot, None, ['verbatim.cot_bang'])


def _b_khong_co_du_lieu(x):
    """Case *khi không có dữ liệu*: dùng đúng dòng chữ rỗng của màn."""
    if 'khi khong co du lieu' not in x['td']:
        return None
    v = x['v'] or {}
    rong = a6_chuoi(v.get('rong_khong_du_lieu'))
    if not rong:
        return None
    dung = ['verbatim.rong_khong_du_lieu']
    d = 'Bảng hiện dòng chữ "%s"' % rong
    nut = a6_chuoi(v.get('rong_khong_du_lieu_nut'))
    if nut:
        d += ' kèm nút "%s"' % nut
        dung.append('verbatim.rong_khong_du_lieu_nut')
    d += '. Không hiện từ ngữ kỹ thuật hay bảng trống không lời nhắn.'
    return (None, d, None, dung)


def _b_o_tim_mac_dinh(x):
    """Case *giá trị mặc định ô tìm*: nêu đúng chữ gợi ý trong ô.

    Bỏ qua CN biểu mẫu: ở CN Sửa, case *giá trị mặc định* phải nói dữ liệu đang lưu (§5.6).
    """
    if 'gia tri mac dinh o ' not in x['td'] or 'tim' not in x['nhom2n']:
        return None
    if loai_cn(x['cn']) == 'bieu_mau':
        return None
    goi_y = a6_chuoi((x['v'] or {}).get('placeholder_tim'))
    if not goi_y:
        return None
    return (None, 'Ô trống, hiện chữ gợi ý "%s".' % goi_y, None, ['verbatim.placeholder_tim'])


def _b_perpage(x):
    """Nhóm chọn số bản ghi mỗi trang: mức mặc định và bộ mức chọn nhanh đã ground."""
    if 'so ban ghi moi trang' not in x['td'] and 'so ban ghi tren trang' not in x['td']:
        return None
    # Lưới chắn: phép này khớp theo TIÊU ĐỀ, mà nhóm `Thẻ số liệu Tổng số bản ghi …` cũng có
    # thể mang chữ đó. Từ 2026-09-12 phép ghi cột D VÔ ĐIỀU KIỆN (luật cứng ②) nên trúng nhầm
    # là ghi đè hẳn nội dung của một thẻ đếm — trước đây còn `if isinstance(ps, int)` che bớt.
    if norm(x['nhom2'] or '').startswith('the '):
        return None
    h = x['h'] or {}
    if 'gia tri mac dinh' in x['td']:
        # ⛔ LUẬT CỨNG ② (2026-09-12) — mặc định LUÔN là `PAGE_SIZE_MAC_DINH`, KHÔNG đọc
        # `hang_so.page_size_mac_dinh` nữa. Bản cũ chép thẳng con số của màn thật vào cột D, nên
        # màn nào FE cấu hình 10/25/50 thì bộ case ghi nhận CÁI SAI làm kết quả mong đợi và
        # tester chấm P — lỗi không bao giờ lộ. Hồ sơ màn khai số khác giờ là XUNG ĐỘT, do
        # `soi_luat_cung_spec()` / `audit_luat_cung.py` báo, không phải nguồn để ghi case.
        ps = h.get('page_size_mac_dinh')
        t = None
        if isinstance(ps, int) and ps != PAGE_SIZE_MAC_DINH:
            t = ('[FIXED RULE VIOLATION] mặc định phải là %d; màn thật/hồ sơ đang là %d'
                 % (PAGE_SIZE_MAC_DINH, ps))
        return (None, kq_mac_dinh_chuan(x['nhom2'], 'perpage'), t, ['luat_cung.page_size'])
    if x['td'].startswith('kiem tra cac gia tri'):
        muc = a6_chuoi(h.get('page_size_chon_nhanh'), ' · ')
        if muc:
            return (None, 'Ô chọn có đúng các mức: %s.' % muc, None,
                    ['hang_so.page_size_chon_nhanh'])
    return None


def _b_page_toi_da(x):
    """Case *nhập lớn hơn mức tối đa* của ô số bản ghi/trang: ngưỡng + câu báo lỗi thật."""
    if 'vuot' not in x['td'] and 'lon hon 1000' not in x['td']:
        return None
    if 'so ban ghi' not in x['nhom2n']:
        return None
    h, v = x['h'] or {}, x['v'] or {}
    toi_da = h.get('page_size_toi_da')
    loi = [s for s in (v.get('loi_page_size') or []) if isinstance(s, str) and 'toi da' in norm(s)]
    if not isinstance(toi_da, int) or not loi:
        return None
    return (None, '1. Thông báo lỗi "%s"\n2. Danh sách giữ nguyên mức đang dùng, không tải quá '
                  '%d bản ghi.' % (loi[0], toi_da),
            None, ['hang_so.page_size_toi_da', 'verbatim.loi_page_size'])


def _b_attt_thong_bao(x):
    """Ba case ATTT dùng chung mọi màn: chưa đăng nhập · không đủ quyền · hết phiên."""
    v = x['v'] or {}
    cap = [('chua dang nhap', 'chua_dang_nhap',
            'Bị chặn vào màn và chuyển về trang đăng nhập. Thông báo: "%s"'),
           ('yeu cau quyen', 'khong_du_quyen',
            'Không vào được màn. Thông báo: "%s"'),
           ('het phien', 'het_phien',
            'Thao tác không được thực hiện. Thông báo: "%s" và người dùng phải đăng nhập lại.')]
    for khoa_td, khoa, mau in cap:
        if khoa_td in x['td']:
            msg = a6_chuoi(v.get(khoa), ' — ')
            if msg:
                return (None, mau % msg, None, ['verbatim.%s' % khoa])
    return None


def _b_chon_mac_dinh_form(x):
    """Ô CHỌN của biểu mẫu THÊM MỚI: mặc định `-- Chọn --`, không tự chọn option đầu (luật ①).

    Vì sao phải có phép A6 chứ không chỉ sửa bank: bank `SELECTBOX` chỉ được bơm cho nhóm CÒN
    THIẾU case. Nhóm đã đủ định mức — do bộ cũ sinh, do A6 tay, hay do người viết — thì bank
    không đụng tới, nên bản chữ sai vẫn nằm nguyên. Phép này chạy trên MỌI case *giá trị mặc
    định* của ô chọn ở CN Thêm mới nên không có đường nào lọt.

    CN CHỈNH SỬA cố ý KHÔNG áp: §5.6 đòi nạp GIÁ TRỊ ĐANG LƯU của bản ghi — `fix_macdinh_sua`
    và `audit_sua` giữ phần đó. Luật ① cấm *tự chọn option đầu tiên*, không cấm nạp dữ liệu thật.
    """
    if not la_case_mac_dinh(x['tieu_de']):
        return None
    if ngu_canh_o_chon(x['cn'], x['nhom2']) != 'them':
        return None
    t = None
    vp = vi_pham_chon_san(x['D'], 'them')
    if vp:
        t = ('%s ô chọn không được chọn sẵn giá trị nghiệp vụ; cột D cũ nói "%s"'
             % (CO_LUAT_CUNG, vp))
    return (None, kq_mac_dinh_chuan(x['nhom2'], 'them'), t, ['luat_cung.placeholder_form'])


def _b_tim_kiem_mac_dinh(x):
    """Case §6 *Tìm kiếm với: <loại> = <chữ gợi ý>* — ghi cột C/D theo KHUÔN MẪU (ảnh 14/09).

    Bản 12/09 dồn chữ gợi ý vào CỘT D thành một danh sách 2 ý. Mẫu không viết vậy: nó nêu chữ
    gợi ý ở **cột B và cột C** rồi để cột D đúng một câu ngắn nói hệ thống phản hồi thế nào.
    Luật ① vẫn được thi hành y nguyên — case vẫn chốt mặc định LÀ GÌ, chỉ đổi chỗ chốt.

    ⚠️ A6 chỉ ghi được C và D (khuôn binder trả `(C, D, T, khoá)`). **Cột B do
    `fix_luat_cung.py` ở bước 11d ghi** — chạy A6 lẻ mà bỏ 11d thì tiêu đề còn là bản cũ
    *"= giá trị mặc định"*, tức mất đúng chỗ mẫu chốt giá trị.
    """
    if not la_case_tim_kiem_mac_dinh(x['tieu_de']):
        return None
    if ngu_canh_o_chon(x['cn'], x['nhom2']) != 'loc':
        return None
    _b, c, d = tk_mac_dinh_bo_ba(x['nhom2'])
    return (c, d, None, ['luat_cung.placeholder_loc'])


def _b_selectbox_gia_tri(x):
    """Case *các giá trị có trong <ô chọn>*: liệt kê đúng bộ giá trị đã ground.

    Nguồn ĐẦU TIÊN là `grounding.gia_tri_tinh` / `gia_tri_dong` — khoá chuẩn của phép ㉘, và
    khuôn chữ lấy thẳng `kq_liet_ke_dung()` để chỉ có MỘT bản chữ trong cả bộ tool. Hồ sơ màn
    chưa khai hai khoá đó thì mới suy từ `tuy_chon_*` / `*_gia_tri`.
    """
    if not x['td'].startswith('kiem tra cac gia tri co trong'):
        return None
    chuan = kq_liet_ke_dung(x['spec'], x['nhom2'], x['tieu_de'], x['D'], x['cn'])
    if chuan:
        return (None, chuan, None, ['grounding.gia_tri_tinh'])
    tn = a6_ten_truong(x['nhom2'])
    v, h = x['v'] or {}, x['h'] or {}
    nguon = []
    for goc in ('form_them', 'form_sua'):
        d = v.get(goc)
        if isinstance(d, dict) and loai_cn(x['cn']) == 'bieu_mau':
            for k, val in d.items():
                if k.startswith('tuy_chon_') and isinstance(val, list):
                    nguon.append((norm(k[len('tuy_chon_'):].replace('_', ' ')), val,
                                  'verbatim.%s.%s' % (goc, k)))
    for k, val in v.items():
        if k.startswith('tuy_chon_') and isinstance(val, list):
            nguon.append((norm(k[len('tuy_chon_'):].replace('loc_', '').replace('_', ' ')),
                          val, 'verbatim.%s' % k))
    for k, val in h.items():
        if k.endswith('_gia_tri') and isinstance(val, list):
            nguon.append((norm(k[:-len('_gia_tri')].replace('_', ' ')), val, 'hang_so.%s' % k))
    for truong, val, khoa in sorted(nguon, key=lambda t: -len(t[0])):
        if truong and (tn == truong or truong in tn or tn in truong):
            ds = ' · '.join('"%s"' % t for t in val if str(t).strip())
            if ds:
                return (None, 'Hiển thị các giá trị: ' + ds, None, [khoa])
    return None


def _b_selectbox_khong_thay(x):
    """Case *tìm từ khoá không tồn tại* trong ô chọn: đúng dòng chữ của ô."""
    if 'tim kiem tu khoa khong ton tai' not in x['td']:
        return None
    msg = a6_chuoi((x['v'] or {}).get('selectbox_khong_thay'))
    if not msg:
        return None
    return (None, 'Danh sách rỗng và hiện dòng chữ "%s". Ô chọn không đóng lại.' % msg, None,
            ['verbatim.selectbox_khong_thay'])


def _b_icon_ban_ghi(x):
    """Case *biểu tượng thao tác phù hợp*: đúng bộ biểu tượng có trên dòng."""
    if 'bieu tuong thao tac phu hop' not in x['td']:
        return None
    ds = a6_chuoi((x['v'] or {}).get('icon_ban_ghi'), ' · ')
    if not ds:
        return None
    return (None, 'Mỗi dòng có đúng các thao tác: %s. Biểu tượng đúng nghĩa với thao tác.' % ds,
            None, ['verbatim.icon_ban_ghi'])


def _b_tai_lai(x):
    """Nhóm nút tải lại: chú thích khi rê chuột và thông báo sau khi tải xong."""
    v = x['v'] or {}
    if 'hien thi nut' in x['td'] and 'lam moi' in x['nhom2n']:
        tip = a6_chuoi(v.get('tooltip_lam_moi'))
        if tip:
            return (None, 'Nút hiện đúng vị trí, rê chuột vào hiện chú thích "%s".' % tip, None,
                    ['verbatim.tooltip_lam_moi'])
    if 'khong ap dung bo loc' in x['td'] and 'lam moi' in x['nhom2n']:
        msg = a6_chuoi(v.get('toast_lam_moi'))
        if msg:
            return (None, 'Danh sách tải lại từ đầu và hiện thông báo nổi "%s".' % msg, None,
                    ['verbatim.toast_lam_moi'])
    return None


def _b_thanh_hang_loat(x):
    """Case tích chọn tất cả: đúng chữ trên thanh thao tác hàng loạt."""
    if 'tich chon o tich chon tat ca' not in x['td']:
        return None
    ds = a6_chuoi((x['v'] or {}).get('thanh_hang_loat'), ' · ')
    if not ds:
        return None
    return (None, 'Mọi dòng của trang đang xem được tích. Thanh thao tác hàng loạt hiện với các '
                  'mục: %s.' % ds, None, ['verbatim.thanh_hang_loat'])


def _b_cn_thanh_cong(x):
    """Case *thành công* của khối Chức năng: đúng thông báo nổi của màn."""
    if 'thanh cong' not in x['td'] or 'chuc nang' not in x['nhomn']:
        return None
    v = x['v'] or {}
    cap = [('them moi', 'form_them'), ('chinh sua', 'form_sua'), ('cap nhat', 'form_sua'),
           ('xoa', 'xoa_don_le'), ('xuat excel', 'xuat_excel')]
    for khoa_nhom, khoa in cap:
        if khoa_nhom in x['nhomn']:
            d = v.get(khoa)
            msg = a6_chuoi(d.get('toast_thanh_cong')) if isinstance(d, dict) else None
            if msg:
                return (None, 'Thực hiện thành công, hiện thông báo nổi "%s".' % msg, None,
                        ['verbatim.%s.toast_thanh_cong' % khoa])
    return None


def _b_hop_xac_nhan_xoa(x):
    """Case *hủy bỏ thao tác xóa* / nội dung hộp xác nhận: đúng chữ trong hộp."""
    hop = (x['v'] or {}).get('xoa_don_le')
    if not isinstance(hop, dict):
        return None
    if 'noi dung' in x['td'] and 'hop' in x['td']:
        tieu_de, mo_ta = a6_chuoi(hop.get('tieu_de')), a6_chuoi(hop.get('mo_ta'))
        nut = a6_chuoi(hop.get('nut'), ' · ')
        if tieu_de and nut:
            d = 'Hộp hiện tiêu đề "%s"' % tieu_de
            if mo_ta:
                d += ', nội dung "%s"' % mo_ta
            return (None, d + ' và hai nút %s.' % nut, None,
                    ['verbatim.xoa_don_le.tieu_de', 'verbatim.xoa_don_le.mo_ta',
                     'verbatim.xoa_don_le.nut'])
    if 'huy bo thao tac xoa' in x['td']:
        nut = hop.get('nut')
        if isinstance(nut, list) and nut:
            return (None, 'Bấm "%s" thì hộp đóng lại, bản ghi KHÔNG bị xóa và danh sách giữ '
                          'nguyên.' % nut[0], None, ['verbatim.xoa_don_le.nut'])
    return None


def _b_xoa_hang_loat(x):
    """Case *chọn nhiều bản ghi để xóa*: đúng chữ của luồng xoá hàng loạt."""
    if 'chon nhieu ban ghi de xoa' not in x['td']:
        return None
    hl = (x['v'] or {}).get('xoa_hang_loat')
    if not isinstance(hl, dict):
        return None
    tieu_de, msg = a6_chuoi(hl.get('tieu_de')), a6_chuoi(hl.get('toast_thanh_cong'))
    if not (tieu_de or msg):
        return None
    d = 'Hộp xác nhận hiện tiêu đề "%s".' % tieu_de if tieu_de else ''
    dung = ['verbatim.xoa_hang_loat.tieu_de'] if tieu_de else []
    if msg:
        d += ' Xác nhận xong, các bản ghi đã chọn bị xóa và hiện thông báo nổi "%s".' % msg
        dung.append('verbatim.xoa_hang_loat.toast_thanh_cong')
    return (None, d.strip(), None, dung)


def _b_tim_kiem_nguong(x):
    """Luồng tìm kiếm: ngưỡng ký tự tối thiểu + thời gian chờ đã ground."""
    if 'tim kiem' not in x['nhomn'] or 'du lieu khong gioi han' not in x['td']:
        return None
    h = x['h'] or {}
    duoi = a6_chuoi(h.get('tim_kiem_duoi_nguong'))
    pham_vi = a6_chuoi(h.get('tim_kiem_pham_vi'))
    if not (duoi or pham_vi):
        return None
    dung, d = [], []
    if pham_vi:
        d.append('Hệ thống tìm theo đúng phạm vi: %s.' % pham_vi)
        dung.append('hang_so.tim_kiem_pham_vi')
    if duoi:
        d.append(duoi if duoi.endswith('.') else duoi + '.')
        dung.append('hang_so.tim_kiem_duoi_nguong')
    if isinstance(h.get('tim_kiem_debounce_ms'), int):
        d.append('Kết quả áp sau khi ngừng gõ %d mili giây.' % h['tim_kiem_debounce_ms'])
        dung.append('hang_so.tim_kiem_debounce_ms')
    return (None, ' '.join(d), None, dung)


def _b_the_so_lieu(x):
    """Nhóm `Thẻ số liệu …`: nhãn thẻ đúng nguyên văn trên màn."""
    if not x['nhom2n'].startswith('the so lieu') or 'gia tri mac dinh' not in x['td']:
        return None
    ds = (x['v'] or {}).get('the_so_lieu')
    if not isinstance(ds, list):
        return None
    tn = a6_ten_truong(x['nhom2'])
    for nhan in ds:
        if isinstance(nhan, str) and norm(nhan) and (norm(nhan) in tn or tn in norm(nhan)):
            return (None, 'Thẻ hiện đúng nhãn "%s" và một con số nguyên. Nhãn đúng chính tả, '
                          'giá trị không kèm đơn vị nào khác.' % nhan, None,
                    ['verbatim.the_so_lieu'])
    return None


def _b_loc_mac_dinh(x):
    """Ô LỌC chưa chọn gì: đúng dòng chữ gợi ý trong ô.

    Hai lưới chắn (cả hai đã bị bộ rà bắt khi thiếu):
      · chỉ áp cho control của CN TÌM KIẾM/LỌC — `placeholder_loc_*` là chữ của thanh lọc trên
        màn danh sách, dán sang ô cùng tên trong biểu mẫu Thêm/Sửa là SAI control;
      · case *giá trị mặc định* ở CN SỬA phải nói DỮ LIỆU ĐANG LƯU, không phải ô rỗng (§5.6) —
        `audit_sua` bắt đúng chỗ này.
    """
    if not x['td'].startswith('kiem tra gia tri mac dinh'):
        return None
    if not la_bo_loc(x['nhom2'], x['cn']):
        return None
    # ⛔ LUẬT CỨNG ① (2026-09-12). Trước bản này phép chỉ chạy khi hồ sơ màn có
    # `verbatim.placeholder_loc_<trường>`, và nó CHÉP Y NGUYÊN chữ đó vào cột D — màn hiện
    # `Tất cả` hay chọn sẵn `Hoạt động` thì bộ case ghi nhận cái sai làm kết quả mong đợi.
    # Nay chữ gợi ý do LUẬT quyết (`placeholder_chuan`), hồ sơ màn chỉ còn vai trò BẰNG CHỨNG:
    # khai khác luật -> gắn cờ vi phạm ở cột T, KHÔNG đổi cột D.
    ng = ngu_canh_o_chon(x['cn'], x['nhom2'])
    if ng != 'loc':
        return None                      # ô lọc KHÔNG phải ô chọn (Textbox tìm…) -> phép khác lo
    tn = a6_ten_truong(x['nhom2'])
    tot = None
    for k, val in (x['v'] or {}).items():
        if k.startswith('placeholder_loc_') and isinstance(val, str):
            truong = norm(k[len('placeholder_loc_'):].replace('_', ' '))
            if truong and (tn == truong or truong in tn or tn in truong):
                if tot is None or len(truong) > len(tot[2]):
                    tot = (val, k, truong)
    t = None
    if tot and not dat_luat_cung(tot[0], x['nhom2'], 'loc'):
        t = ('[FIXED RULE VIOLATION] chữ gợi ý phải là "%s"; màn thật đang là "%s"'
             % (placeholder_chuan(x['nhom2'], 'loc'), tot[0]))
    return (None, kq_mac_dinh_chuan(x['nhom2'], 'loc'), t,
            ['luat_cung.placeholder_loc'] + (['verbatim.%s' % tot[1]] if tot else []))


def _b_rong_co_loc(x):
    """Case *tìm không ra kết quả*: đúng dòng chữ rỗng-theo-lọc của màn."""
    if 'khong ra ket qua' not in x['td']:
        return None
    msg = a6_chuoi((x['v'] or {}).get('rong_co_loc'))
    if not msg:
        return None
    return (None, 'Bảng rỗng và hiện dòng chữ "%s". Bộ lọc đang áp vẫn giữ nguyên trên màn.'
            % msg, None, ['verbatim.rong_co_loc'])


def _b_xoa_tu_khoa_selectbox(x):
    """Case *xóa từ khoá đã nhập trong ô tìm* của ô chọn: nêu lại chữ gợi ý trong hộp tìm."""
    if 'xoa tu khoa da nhap trong o tim kiem' not in x['td']:
        return None
    goi_y = a6_chuoi((x['v'] or {}).get('tim_trong_selectbox'))
    if not goi_y:
        return None
    return (None, 'Danh sách trở lại đầy đủ mọi giá trị, hộp tìm hiện lại chữ gợi ý "%s".'
            % goi_y, None, ['verbatim.tim_trong_selectbox'])


# ⚠️ THỨ TỰ CÓ NGHĨA: mỗi case chỉ do MỘT phép ghi (dừng ở phép khớp đầu tiên). Ba phép luật
# cứng đứng TRƯỚC mọi phép đọc hồ sơ màn — luật thắng dữ kiện, đó chính là nghĩa của "fix cứng".
A6_BINDER = [_b_loc_mac_dinh, _b_chon_mac_dinh_form, _b_perpage, _b_tim_kiem_mac_dinh,
             _b_the_so_lieu, _b_rong_co_loc, _b_xoa_tu_khoa_selectbox,
             _b_nguong_do_dai, _b_bat_buoc, _b_sai_dinh_dang, _b_tieu_de_cot,
             _b_khong_co_du_lieu, _b_o_tim_mac_dinh, _b_page_toi_da,
             _b_attt_thong_bao, _b_selectbox_gia_tri, _b_selectbox_khong_thay, _b_icon_ban_ghi,
             _b_tai_lai, _b_thanh_hang_loat, _b_cn_thanh_cong, _b_hop_xac_nhan_xoa,
             _b_xoa_hang_loat, _b_tim_kiem_nguong]


def chuoi_da_ground(spec):
    """Tập chuỗi HIỂN THỊ đã ground của một màn (mọi nhánh `verbatim` + hằng số `hang_so`).

    Dùng để trả lời câu *"chữ trong cột D này có phải dữ kiện thật của màn không?"* — phân biệt
    với chữ do bank/bản mẫu sinh ra. Bỏ chuỗi quá ngắn: so đâu cũng khớp.
    """
    g = (spec or {}).get('grounding') or {}
    ra = set()

    def _nhat(x):
        if isinstance(x, dict):
            for v in x.values():
                _nhat(v)
        elif isinstance(x, (list, tuple)):
            for v in x:
                _nhat(v)
        elif isinstance(x, str) and len(x.strip()) >= 6:
            ra.add(norm(x))
    _nhat(g.get('verbatim'))
    _nhat(g.get('gia_tri_tinh'))
    for v in (g.get('hang_so') or {}).values():
        if isinstance(v, str) and len(v.strip()) >= 6:
            ra.add(norm(v))
    return ra


# ── TẬP CHUỖI ĐÃ GROUND DẠNG NGUYÊN VĂN  (dời về `qalib` 2026-09-14) ───────────────────────
# `chuoi_da_ground()` ngay trên trả bản ĐÃ CHUẨN HOÁ (`norm`) — dùng để SO. Phép CHE thì cần
# bản NGUYÊN VĂN, và cần quét RỘNG hơn (mọi nhánh `grounding*`, không riêng `verbatim`).
# Bản rộng đó trước nằm ở `audit_noi_dung.gom_verbatim` và `fix_kq_validate` phải `import` một
# bộ RÀ để lấy về. Luật dùng chung phải ở thư viện: nay ở đây, hai nơi kia gọi vào.
GROUND_MIN_LEN = 8
GROUND_BO_QUA_KHOA = ('cach', 'chunk_man', 'api', 'do_bang', 'ngay', 'url', 'route',
                      'thao_tac_duoc_noi', 'khong_co', 'rui_ro', 'ghi_chu_gop', 'vao_tu',
                      'cn', 'ten')


def gom_ground_verbatim(spec):
    """[(khoá, chuỗi)] — mọi dữ kiện dạng chuỗi/số đã ground, bỏ khoá không phải chữ hiển thị."""
    ra = []

    def di(o, duong):
        if isinstance(o, dict):
            for k, v in o.items():
                if norm(k) in GROUND_BO_QUA_KHOA:
                    continue
                di(v, duong + '.' + k if duong else k)
        elif isinstance(o, list):
            for v in o:
                di(v, duong)
        elif isinstance(o, str):
            if len(o.strip()) >= GROUND_MIN_LEN:
                ra.append((duong, o.strip()))
        elif isinstance(o, (int, float)) and not isinstance(o, bool):
            ra.append((duong, str(o)))
    di((spec or {}).get('grounding') or {}, 'grounding')
    for k, v in (spec or {}).items():
        if k.startswith('grounding_') or k == 'verbatim':
            di(v, k)
    return ra


def giu_nguyen_cua(spec):
    """Tuple chuỗi NGUYÊN VĂN đã ground của một màn — đối số `giu_nguyen` của mọi phép đo/cắt."""
    return tuple(v for _k, v in gom_ground_verbatim(spec))


def giu_nguyen_cua_file(path):
    """Như trên nhưng nhận đường dẫn `.xlsx`; không có hồ sơ màn thì trả `()`."""
    return giu_nguyen_cua(ho_so_man(path) or {})


def co_chuoi_da_ground(spec, d):
    """Cột D có đang mang một chuỗi ĐÃ GROUND của màn không (so trong ngoặc kép)."""
    if not d:
        return False
    tap = chuoi_da_ground(spec)
    if not tap:
        return False
    for x in re.findall(r'"([^"]{6,})"', d):
        nx = norm(x)
        if any(nx == t or nx in t or t in nx for t in tap):
            return True
    return False


def a6_chay(tc, spec, ghi=False):
    """Áp mọi phép bơm A6 lên MỘT sheet đã nạp.

    Trả `(số case sửa C/D, số case ghi cột T, {khoá hồ sơ đã dùng}, [(dòng, tiêu đề, phép)])`.
    Mỗi case chỉ do MỘT phép ghi (dừng ở phép khớp đầu tiên) — cùng luật với A6 viết tay.
    """
    g = (spec or {}).get('grounding') or {}
    v, h = g.get('verbatim') or {}, g.get('hang_so') or {}
    n_cd = n_t = 0
    dung, ca = set(), []
    cn = sub = sub2 = None
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b_full = (tc.c(rn, 'B') or '').strip()
        b = b_full.split('\n')[0].strip()
        if lv == 'cn':
            cn, sub, sub2 = b, None, None
            continue
        if lv in ('grp', 'sub'):
            sub, sub2 = b, None
            continue
        if lv == 'sub2':
            sub2 = b
            continue
        if lv != 'case':
            continue
        td = norm(b_full)
        if any(k in td for k in A6_CAM_DUNG):
            continue                      # ô của `patch_giaodien` / bản chữ cố định §7.3
        nhom = ' | '.join(t for t in (sub, sub2) if t)
        x = dict(cn=cn, cnn=norm(cn or ''), nhom=nhom, nhomn=norm(nhom),
                 nhom2=sub2 or sub or '', nhom2n=norm(sub2 or sub or ''),
                 td=td, tieu_de=b_full, C=tc.c(rn, 'C') or '', D=tc.c(rn, 'D') or '',
                 v=v, h=h, g=g, spec=spec)
        for f in A6_BINDER:
            try:
                ra = f(x)
            except Exception as e:                       # một phép hỏng không được giết cả bước
                print('  !! phép %s lỗi ở dòng %d: %s' % (f.__name__, rn, e))
                continue
            if not ra:
                continue
            C, D, T, khoa = ra
            if C is None and D is None and T is None:
                continue
            # ── CHẶN RÒ CODE NGAY LÚC GHI (vá 2026-09-14) ─────────────────────────────
            # Luật 7 §D cấm cột D chứa code, nhưng A6 bơm THẲNG dữ kiện `grounding` và hồ sơ
            # màn có những khoá tả phạm vi kỹ thuật (`… qua tham số search của GET /targets`).
            # Đo 2026-09-14: đúng 1 chuỗi như vậy đã lọt vào `ViTriLuuTru` sau khi chạy
            # `a6_auto`, và chỉ `audit_extra` ⑤ bắt được — tức lọt tới tận bước nghiệm thu.
            # Bỏ qua phép đó và đi tiếp: để phép SAU có cơ hội ghi, thay vì ghi bản sai.
            _chan = a6_chan_ghi(b_full, C, D, x['C'], x['D'], x.get('cn'))
            if _chan:
                ca.append((rn, b[:60], '%s [BỎ: %s]' % (f.__name__, _chan)))
                continue
            dung.update(khoa or [])
            ca.append((rn, b[:60], f.__name__))
            if ghi:
                if C is not None or D is not None:
                    tc.retext(rn, None, C, D)
                if T is not None:
                    # Cờ luật cứng NỐI thêm (case có thể đã mang `[CẦN VERIFY]`); ghi chú
                    # thường của A6 thì thay trọn ô như cũ.
                    (a6_noi_t if T.startswith(CO_LUAT_CUNG) else a6_set_t)(tc, rn, T)
            if C is not None or D is not None:
                n_cd += 1
            if T is not None:
                n_t += 1
            break
    return n_cd, n_t, dung, ca


def a6_khoa_ho_so(spec):
    """Mọi khoá dữ kiện của hồ sơ màn, dạng `verbatim.x.y` / `hang_so.z` — để đo phần CHƯA dùng."""
    g = (spec or {}).get('grounding') or {}
    ra = []
    for goc in ('verbatim', 'hang_so'):
        d = g.get(goc) or {}
        for k, val in d.items():
            if isinstance(val, dict):
                # chỉ đếm khoá CON — đếm cả khoá cha thì mẫu số phồng lên và một nhánh đã dùng
                # vẫn hiện ở danh sách "chưa gắn được".
                ra.extend('%s.%s.%s' % (goc, k, k2) for k2 in val)
            else:
                ra.append('%s.%s' % (goc, k))
    return ra

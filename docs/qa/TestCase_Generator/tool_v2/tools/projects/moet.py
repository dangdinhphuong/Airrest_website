# -*- coding: utf-8 -*-
"""HỒ SƠ DỰ ÁN — MOET / Hệ thống Cơ sở Dữ Liệu Học bạ số (lớp L2).

Dự án khác GSTEM — dùng chung bộ script tool_v2 qua QA_PROJECT=moet.
Chưa có file nền riêng cho MOET -> mượn file nền GSTEM (NCC-mau.xlsx) chỉ để lấy
cấu trúc form chuẩn (3 sheet, 6 case Giao diện chung, 4 khối/CN) — KHÔNG mượn nội dung
nghiệp vụ. Xem docs/qa-doc/tool_v2/huong-dan/HO-SO-DU-AN.md §C.1.

TABLE: chưa xác định (không có quyền đọc DB/proto của dự án MOET) -> để trống,
mọi case đối chiếu DB phải gắn cờ [CẦN VERIFY] (verify_all=True).
"""

import os
from pathlib import Path

# Đặt QA_TESTCASE_DIR để trỏ nơi lưu bộ case (không dùng thư mục testCase/ mặc định của GSTEM).
BASE = os.environ.get('QA_TESTCASE_DIR') or str(Path(__file__).resolve().parents[3] / 'testCase-moet')
BASE = BASE.rstrip('/\\') + os.sep

# Nền ưu tiên: file MOET cùng họ (CategoryCrudPage) đã chuẩn zoom. Nền dự phòng: bản kèm repo.
# Suy từ chính `BASE` của dự án (đã tôn trọng `QA_TESTCASE_DIR`), KHÔNG cắm cứng đường máy.
# Bản cũ ghi thẳng `/home/khuetm/Desktop/qa-doc/...` ⇒ trên máy khác `os.path.exists` luôn False
# nên lặng lẽ rơi về nền kèm repo — chạy vẫn "được" mà nền đã khác, không ai biết.
_NEN_MOET = (os.environ.get('QA_BASE_MOET')
             or BASE + 'QuanTri/testcase/Testcase-Role-QuanTri-TrinhDoChuyenMon.xlsx')
_NEN_KEM = str(Path(__file__).resolve().parents[2] / 'file-nen' / 'file-nen.xlsx')

PROJECT = dict(
    name='MOET',
    title='Hệ thống Cơ sở Dữ Liệu Học bạ số Quốc gia',
    file_prefix='Testcase-Role-',
    result_suffix='_ket_qua',
    subdir_src='testcase',
    subdir_result=['ket-qua-test'],
    # File nền: ưu tiên env QA_BASE_FILE, sau đó bộ case MOET đã chuẩn cùng họ
    # (CategoryCrudPage) — dùng nền cùng họ thì 6 case `Giao diện chung` đã đúng chuẩn
    # zoom (xem BAO-CAO-THOI-GIAN-trinh-do-chuyen-mon.md §4), không phải vá lại.
    # Nhánh cuối: nền đi kèm repo (tool_v2/file-nen/) — đường dẫn tuyệt đối phía trên chỉ
    # đúng trên máy đã có bộ case MOET; máy khác rơi về nền kèm theo thay vì gãy.
    base_file=(os.environ.get('QA_BASE_FILE')
               or (_NEN_MOET if os.path.exists(_NEN_MOET) else _NEN_KEM)),
    # Bước 1 của khối bước ở dòng CN (PROMPT v3 §4) — nguyên văn mẫu
    # DanhMucTuDienDungChung.xlsx r12: 'Vào CSDL học bạ số > Đăng nhập tài khoản <vai trò>'.
    entry='Vào CSDL học bạ số',
    # Vai trò ghi ở bước 1: mẫu dùng danh sách ĐẦY ĐỦ cho CN chỉ-đọc (Danh sách · Tìm kiếm ·
    # Xem chi tiết · Xuất excel), chỉ 'Quản trị vận hành' cho CN có ghi dữ liệu.
    role_xem=('Quản trị vận hành/ Cán bộ, lãnh đạo phòng ban/ Admin Sở/ Admin Xã Phường/ '
              'Admin Trường '),
    role_ghi='Quản trị vận hành',
)

ROLES = {
    # ------------------------------------------------------- QUẢN TRỊ HỆ THỐNG
    # Tài khoản probe: qthttest@gmail.com — vai trò "Supper admin hệ thống",
    # tenant `moet` (fc886da3-5976-4e19-833b-442993ecb59d), có đủ 10 quyền
    # moet_declaration:category:* (view·list·create·update·delete·export·import·
    # approve·restore·lookup) — nguồn: assets/permissions-BMADoFVj.js
    'QuanTri': dict(
        # Tên tài khoản ghi ở BƯỚC 1 khối bước dòng CN (chỉ thị 2026-09-12). Nguyên văn theo
        # `role_ghi` của dự án. Vai trò `Admin` CỐ Ý để trống: hồ sơ dự án chưa có căn cứ nào
        # nói `Admin` ứng với tên tài khoản nào trong `role_xem` — tool sẽ báo thiếu chứ
        # không tự đặt (§11.4 thà gắn cờ hơn bịa).
        ten_vai_tro='Quản trị vận hành',
        dir=BASE + 'QuanTri/testcase/',
        strip='Testcase-Role-QuanTri-',
        skip=[],
        verify_all=True,                 # map màn -> bảng DB chưa có căn cứ
        # ATTT: quản trị hệ thống là vai trò xuyên tổ chức -> phạm vi tính theo QUYỀN được cấp
        group='nhóm quản trị hệ thống',
        own='quyền được cấp',
        other='ngoài phạm vi được cấp',
        other_role='Sở GD&ĐT / Phòng GD&ĐT / nhà trường / giáo viên',
        table={
            # để trống: chưa có bằng chứng tên bảng (chỉ probe được REST
            # /api/declaration/v1/<resource>), VERIFY_ALL sẽ gắn cờ [CẦN VERIFY]
        },
        noun={
            'LoaiCanBo': 'loại cán bộ',
            'TrinhDoChuyenMon': 'trình độ chuyên môn',
            'TruongHoc': 'trường học',
            'MonHoc': 'môn học',
            # /admin/categories/identity/position — Danh mục định danh > Danh mục chức vụ
            'ChucVu': 'chức vụ',
            # /admin/categories/education/training — Danh mục trình độ > Danh mục trình độ đào tạo
            # (grounding 2026-09-08 bằng probe_fe.py: category "training-education",
            #  displayName "trình độ đào tạo" — assets/category-display-names-D9BXPSNe.js)
            'TrinhDoDaoTao': 'trình độ đào tạo',
            # /admin/categories/education/language — Danh mục trình độ > Danh mục trình độ ngoại ngữ
            # (grounding 2026-09-09 bằng probe_fe.py + đọc bundle FE: category "language-education",
            #  title "Danh mục trình độ ngoại ngữ", displayName "trình độ ngoại ngữ";
            #  REST resource language-proficiency-levels — LanguageEducationPage-DrFbIGik.js)
            'TrinhDoNgoaiNgu': 'trình độ ngoại ngữ',
        },
    ),

    'Admin': dict(
        dir=BASE + 'Admin/testcase/',
        strip='Testcase-Role-Admin-',
        skip=[],
        verify_all=True,  # map màn -> bảng DB chưa có căn cứ -> mọi case DB gắn cờ CẦN VERIFY
        group='nhóm quản trị',
        own='quyền được cấp',
        other='ngoài phạm vi được cấp',
        other_role='cán bộ Sở / cán bộ Trường / giáo viên',
        table={
            # chưa xác định bảng thật — để trống, script tự gắn <...> + [CẦN VERIFY]
        },
        noun={
            'DanhMucTrinhDoLyLuanChinhTri': 'trình độ lý luận chính trị',
        },
    ),
}


def get(name):
    if name not in ROLES:
        raise SystemExit('role phải là một trong: %s' % ', '.join(ROLES))
    return ROLES[name]

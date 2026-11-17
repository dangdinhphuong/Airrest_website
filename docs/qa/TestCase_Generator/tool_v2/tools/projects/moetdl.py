# -*- coding: utf-8 -*-
"""HỒ SƠ DỰ ÁN — MOET DATALAKE / Trục Tích Hợp Dữ Liệu (lớp L2).

App KHÁC hẳn `moet.py` (CSDL Học bạ số, host dev-moet.coquan.vn): đây là
`moet-datalake.saas.vsystem.vn` — "HỆ THỐNG CƠ SỞ DỮ LIỆU QUỐC GIA · Giáo dục & Đào tạo",
tiêu đề tab do FE đặt là "Trục Tích Hợp Dữ Liệu" (assets/usePageTitle-*.js). Mọi route nằm ở
GỐC (`/quarantine-list`), KHÔNG dưới `/admin` -> chạy `probe_live.py` phải đặt
`QA_HOME_PREFIX=/` (mặc định của script là `/admin`).

Nguồn grounding (2026-09-09, bundle FE + soi màn thật, xem `<Role>/ho-so-man/*.json`):
  · danh mục vai trò: `ki` trong assets/index-*.js — R01 Lãnh đạo Bộ · R02 Chuyên viên ·
    R03 Quản trị viên · R04 Tổ chức ngoài · R05 Người dân · R06 Đơn vị nguồn ·
    R07 Sở GD&ĐT · R08 Trường học.
  · tài khoản probe: admin_csdl@moet.gov.vn — hiển thị "Admin CSDL / Chuyên viên" (R02).
  · phân quyền: MỌI mục sidebar khai `permission: null` -> FE KHÔNG gác quyền màn nào.
    Phân quyền (nếu có) nằm hoàn toàn ở server -> case ATTT gắn cờ [RỦI RO]/[CẦN VERIFY].

TABLE: chưa có quyền đọc repository/proto -> để trống, `verify_all=True` gắn cờ [CẦN VERIFY]
cho mọi case đối chiếu DB. Chỉ biết REST: /api/db-tool/v1/datalake/quarantine*.
"""

import os
from pathlib import Path

# Bộ case của dự án này để RIÊNG, không trộn với testCase/ của dự án MOET học bạ số.
BASE = os.environ.get('QA_TESTCASE_DIR') or str(
    Path(__file__).resolve().parents[2] / 'testCase-moetdl')
BASE = BASE.rstrip('/\\') + os.sep

# Nền trung tính đi kèm repo — KHÔNG mượn bộ case của dự án khác làm nền (nội dung nghiệp vụ
# của nền sẽ lẫn sang). Đè bằng QA_BASE_FILE nếu dự án có nền riêng.
NEN_KEM = str(Path(__file__).resolve().parents[2] / 'file-nen' / 'file-nen.xlsx')

PROJECT = dict(
    name='MOETDL',
    title='Hệ thống Cơ sở dữ liệu Quốc gia về Giáo dục và Đào tạo',
    file_prefix='Testcase-Role-',
    result_suffix='_ket_qua',
    subdir_src='testcase',
    subdir_result=['ket-qua-test'],
    base_file=os.environ.get('QA_BASE_FILE') or NEN_KEM,
    # Bước 1 của khối bước ở dòng CN (PROMPT v3 §4.1) — theo khuôn mẫu
    # 'Vào <hệ thống> > Đăng nhập tài khoản <vai trò>'. Tên hệ thống lấy nguyên văn
    # dòng chữ trên thanh tiêu đề của app.
    entry='Vào Hệ thống Cơ sở dữ liệu Quốc gia về Giáo dục và Đào tạo',
    # Vai trò ghi ở bước 1. CN chỉ-đọc dùng danh sách ĐẦY ĐỦ các vai trò dùng giao diện
    # (bỏ R04 Tổ chức ngoài — kênh chính là API, và R05 Người dân — kênh Cổng dịch vụ công).
    role_xem=('Quản trị viên/ Chuyên viên/ Lãnh đạo Bộ/ Đơn vị nguồn/ Sở GD&ĐT/ '
              'Trường học '),
    role_ghi='Quản trị viên',
    # Route ĐĂNG NHẬP của app — `qalib.auth_endpoints()` đọc khoá này để sổ mạng xếp POST đăng
    # nhập vào loại AUTH. Không khai thì lượt chạy live dừng NGAY ở bước đăng nhập: sổ mạng tố
    # chính cái POST mà tool vừa tự gửi (đã dính 2026-09-16). Khớp origin + path ĐÚNG BẰNG.
    auth_endpoints=('/api/authentication/v1/auth/login',
                    '/api/authentication/v1/auth/logout',
                    '/api/authentication/v1/auth/refresh'),
)

ROLES = {
    # R02 — Chuyên viên (Data Steward). Phạm vi dữ liệu tính theo tỉnh/đơn vị được phân công
    # (ABAC) — nguyên văn mô tả vai trò trong bundle FE.
    'ChuyenVien': dict(
        # Tên tài khoản ghi ở BƯỚC 1 khối bước dòng CN (chỉ thị 2026-09-12: bộ case sinh cho
        # vai trò nào thì ghi ĐÚNG vai trò đó, không liệt kê cả danh sách). Nguyên văn lấy
        # từ `role_xem` của dự án — không tự đặt tên mới.
        ten_vai_tro='Chuyên viên',
        dir=BASE + 'ChuyenVien/testcase/',
        strip='Testcase-Role-ChuyenVien-',
        skip=[],
        verify_all=True,                 # chưa có căn cứ tên bảng DB
        group='nhóm chuyên viên nghiệp vụ dữ liệu',
        own='phạm vi tỉnh/đơn vị được phân công',
        other='ngoài phạm vi được phân công',
        other_role='Lãnh đạo Bộ / Đơn vị nguồn / Sở GD&ĐT / Trường học / Tổ chức ngoài',
        table={
            # để trống: chỉ probe được REST /api/db-tool/v1/datalake/quarantine/groups,
            # không có căn cứ tên bảng -> verify_all gắn cờ [CẦN VERIFY]
        },
        noun={
            # /quarantine-list — Dữ liệu > Quản lý dữ liệu lỗi > Dữ liệu lỗi
            'DuLieuLoi': 'tập dữ liệu lỗi',
            # /ingestion/source-types — Dữ liệu > Quản lý khai báo > Loại nguồn.
            # Danh mục phân loại kênh ingestion (TKCT §13.14): Code · Tên hiển thị ·
            # Trạng thái (active/inactive/archived) · Ngày tạo.
            'LoaiNguon': 'loại nguồn',
            # /ingestion/database-types — Dữ liệu > Quản lý khai báo > Loại lưu trữ.
            # Danh mục loại database được hỗ trợ (TKCT §13.14, UC-QLKB-02): Code ·
            # Tên · Engine Family · Trạng thái (active/inactive). KHÔNG có Ngày tạo.
            'LoaiLuuTru': 'loại lưu trữ',
            # /ingestion/source-groups — Dữ liệu > Quản lý khai báo > Nhóm nguồn.
            # Danh mục gom nhóm các nguồn dữ liệu theo tiêu chí nghiệp vụ (TKCT §13.14,
            # UC-QLKB-03): Code · Tên hiển thị · Trạng thái (active/inactive/archived) ·
            # Ngày tạo. KHÔNG có Xem chi tiết (chỉ Loại lưu trữ mới có — GBR-QLKB-09).
            'NhomNguon': 'nhóm nguồn',
            # /dynamic-reports — Báo cáo > Báo cáo động. Màn có 2 THẺ (tab) dùng chung
            # thanh công cụ: thẻ "Báo cáo" (vòng đời báo cáo DRAFT -> PUBLISHED -> ARCHIVED)
            # và thẻ "Bộ dữ liệu" (khai báo bảng/view Trino làm nguồn). Bộ case đặt 2 SHEET
            # trong CÙNG file: BP-BaoCaoDong (thẻ Báo cáo + wizard Tạo báo cáo + màn Chi tiết
            # + màn Sửa biểu đồ) và BP-BoDuLieu (thẻ Bộ dữ liệu + modal Thêm bộ dữ liệu).
            # `noun` chỉ tra được theo TÊN FILE nên danh từ nền là "báo cáo"; các nhóm
            # `Chức năng …` của sheet BP-BoDuLieu tự khai kèm chữ "bộ dữ liệu" để
            # `complete_func.Ctx.scope()` lấy đúng danh từ (BA: Báo cáo động.docx §3).
            'BaoCaoDong': 'báo cáo',
            # /conflict-alerts — Dữ liệu > Quản lý dữ liệu lỗi > Dữ liệu mâu thuẫn.
            # Nhãn menu là "Dữ liệu mâu thuẫn" nhưng TIÊU ĐỀ MÀN (h1 + document.title) là
            # "Cảnh báo Mâu thuẫn"; mô tả đầu màn đếm theo "bản ghi conflict".
            'CanhBaoMauThuan': 'bản ghi mâu thuẫn',
        },
    ),
}


def get(name):
    if name not in ROLES:
        raise SystemExit('role phải là một trong: %s' % ', '.join(ROLES))
    return ROLES[name]

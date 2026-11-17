# -*- coding: utf-8 -*-
"""HỒ SƠ DỰ ÁN — VietQ / Newsroom (lớp L2).

Nguồn: ba-docs/docs-spec/newsroom/16-sxnd-dang-bai-dac-biet-tro-ly-quy-tac-soan.md (UC-NR-0262,
mục 2.21 + 2.20 UC-NR-0261) và 15/17/18/19. Tên bảng DB chỉ lấy từ SQL của BA (nr_story.articles);
mọi thứ khác để trống + verify_all=True -> tự gắn [CẦN VERIFY].
Route sau đăng nhập dưới /admin (https://vietq.saas.coquan.vn/admin/...).
"""
import os
from pathlib import Path

BASE = os.environ.get('QA_TESTCASE_DIR') or str(
    Path(__file__).resolve().parents[2] / 'testCase-vietq')
BASE = BASE.rstrip('/\\') + os.sep

NEN_KEM = str(Path(__file__).resolve().parents[2] / 'file-nen' / 'file-nen.xlsx')

PROJECT = dict(
    name='VIETQ',
    title='VietQ - Newsroom',
    file_prefix='Testcase-Role-',
    result_suffix='_ket_qua',
    subdir_src='',                       # bộ case nằm thẳng trong <BASE>/DanhSachTinBai/
    subdir_result=['ket-qua-test'],
    base_file=os.environ.get('QA_BASE_FILE') or NEN_KEM,
    entry='Vào hệ thống VietQ',
    role_xem='Quản trị',
    role_ghi='Quản trị',
    auth_endpoints=(),
)

ROLES = {
    'QuanTri': dict(
        ten_vai_tro='Quản trị',
        dir=BASE + 'DanhSachTinBai/',
        strip='Testcase-Role-QuanTri-',
        skip=[],
        verify_all=True,
        group='nhóm quản trị',
        own='quyền được cấp',
        other='ngoài phạm vi được cấp',
        other_role='Phóng viên / Biên tập viên / Trưởng ban / Thư ký tòa soạn / Tổng biên tập / Cộng tác viên',
        table={},
        noun={'DanhSachTinBai': 'tin bài'},
    ),
}


def get(name):
    if name not in ROLES:
        raise SystemExit('role phải là một trong: %s' % ', '.join(ROLES))
    return ROLES[name]

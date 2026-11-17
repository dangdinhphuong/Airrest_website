# -*- coding: utf-8 -*-
"""HỒ SƠ DỰ ÁN — ViSEF (Cuộc thi KHKT) — dùng qua QA_PROJECT=visef.
Bộ case: QA_TESTCASE_DIR=<repo>/docs/QA_DOCS/03_TestCases/ViSEF
Admin: https://moet-visef.coquan.net ; Portal: https://visef.coquan.net
"""
import os
from pathlib import Path

BASE = (os.environ.get('QA_TESTCASE_DIR')
        or str(Path(__file__).resolve().parents[6] / 'QA_DOCS' / '03_TestCases' / 'ViSEF')).rstrip('/\\') + os.sep
_NEN_KEM = str(Path(__file__).resolve().parents[2] / 'file-nen' / 'file-nen.xlsx')

PROJECT = dict(
    name='ViSEF',
    title='ViSEF — Hệ thống quản lý Cuộc thi Khoa học kỹ thuật',
    file_prefix='Testcase-Role-',
    result_suffix='_ket_qua',
    subdir_src='testcase',
    subdir_result=['ket-qua-test'],
    base_file=os.environ.get('QA_BASE_FILE') or _NEN_KEM,
    entry='Vào hệ thống ViSEF',
    role_xem='Giám khảo',
    role_ghi='Giám khảo',
)

ROLES = {
    'GiamKhao': dict(
        ten_vai_tro='Giám khảo',
        dir=BASE + 'GiamKhao/testcase/',
        strip='Testcase-Role-GiamKhao-',
        skip=[],
        verify_all=True,
        group='nhóm giám khảo',
        own='phiên chấm được phân công',
        other='ngoài phiên chấm được phân công',
        other_role='Quản trị Bộ / Hội đồng thi / Thí sinh',
        table={},
        noun={'NhapDiemCham': 'nhập điểm chấm'},
    ),
}


def get(name):
    if name not in ROLES:
        raise SystemExit('role phải là một trong: %s' % ', '.join(ROLES))
    return ROLES[name]

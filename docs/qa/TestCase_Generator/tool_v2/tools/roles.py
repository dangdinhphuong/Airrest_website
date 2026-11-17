# -*- coding: utf-8 -*-
"""LOADER hồ sơ dự án — chọn bộ cấu hình theo biến môi trường `QA_PROJECT`.

Trước 2026-08-22 file này CHỨA cấu hình GSTEM kèm đường dẫn tuyệt đối
`/home/khuetm/projects/gstem/...` nên đổi máy / đổi chỗ checkout là gãy cả 11 script.
Nay cấu hình nằm ở `projects/<tên>.py` (lớp L2), file này chỉ nạp.

    QA_PROJECT=gstem   python3 audit_validate_quota.py Admin        # mặc định
    QA_PROJECT=abc     python3 audit_validate_quota.py QuanTri      # dự án khác
    QA_TESTCASE_DIR=/duong/dan/khac  python3 ...                    # đổi chỗ bộ case

API giữ nguyên cho mọi script cũ: `roles.ROLES`, `roles.get(name)`.
Thêm: `roles.PROJECT` (metadata dự án), `roles.BASE`, `roles.available()`.
Cách khai báo dự án mới: xem `../huong-dan/HO-SO-DU-AN.md`.
"""
import importlib
import os
from pathlib import Path

_DIR = Path(__file__).resolve().parent / 'projects'
NAME = os.environ.get('QA_PROJECT', 'gstem')


def available():
    return sorted(p.stem for p in _DIR.glob('*.py') if not p.stem.startswith('_'))


try:
    _mod = importlib.import_module('projects.%s' % NAME)
except ImportError:                                  # chạy từ thư mục khác
    import sys
    sys.path.insert(0, str(_DIR.parent))
    try:
        _mod = importlib.import_module('projects.%s' % NAME)
    except ImportError as e:
        raise SystemExit(
            'Không nạp được hồ sơ dự án "%s" (%s).\nHiện có: %s\n'
            'Khai báo dự án mới: copy projects/gstem.py -> projects/<tên>.py, '
            'sửa PROJECT + ROLES, chạy với QA_PROJECT=<tên>. Hướng dẫn: HO-SO-DU-AN.md'
            % (NAME, e, ', '.join(available()) or '(trống)'))

ROLES = _mod.ROLES
BASE = _mod.BASE
PROJECT = getattr(_mod, 'PROJECT', dict(name=NAME))


def get(name):
    if name not in ROLES:
        raise SystemExit(
            'role phải là một trong: %s   (dự án "%s")' % (', '.join(ROLES), PROJECT.get('name', NAME)))
    return ROLES[name]

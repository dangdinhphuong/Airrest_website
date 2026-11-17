# -*- coding: utf-8 -*-
"""SHIM — tên cũ của `postfix_cache.py` (đổi tên 2026-09-12).

Giữ lại vì 13 chỗ trong tài liệu và vài script cũ còn gọi tên này. Không có logic riêng:
mọi thay đổi phải làm ở `postfix_cache.py`.
"""
import os
import runpy
import sys

sys.argv[0] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'postfix_cache.py')
runpy.run_path(sys.argv[0], run_name='__main__')

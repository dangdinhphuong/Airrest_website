# -*- coding: utf-8 -*-
"""Dọn case ATTT injection BỊ TRÙNG MỤC trong cùng một nhóm per-field.

Sự cố 2026-09-04: `patch_attt_field.py` dedup bằng cách tìm TÊN Ô trong tiêu đề case. Ở những
file vốn ĐÃ có nhóm per-field (tên ô nằm ở DÒNG NHÓM, tiêu đề case không nhắc lại) thì phép
dedup trượt ⇒ bơm thêm một bộ 4–5 case trùng mục với bộ sẵn có.

Quy tắc dọn (luật 8 — giữ case CŨ của dự án):
  · trong mỗi nhóm ATTT per-field, gom case theo MỤC (XSS thô · hexa URL · hexa HTML · alert · SQLi);
  · mục nào có ≥2 case → giữ bản CŨ, xoá bản do đợt 04/09 sinh;
  · bản do đợt 04/09 sinh nhận diện bằng cột C `1. Nhập vào ô "…"` + cột D theo đúng 3 mẫu kết quả
    của `quota_cases.ATTT_*` (không đụng case nào khác).

    python3 dedupe_attt_field.py --role Admin          # xem trước
    python3 dedupe_attt_field.py --role Admin --apply  # ghi

Logic nằm ở `qalib.scan_attt_dupes()` / `qalib.dedupe_attt()` để script khác gọi lại được.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib


def main(argv):
    apply = '--apply' in argv
    role = argv[argv.index('--role') + 1] if '--role' in argv else 'Admin'

    tot_file, tot_del = qalib.dedupe_attt(role, apply=apply)

    print('\n=== %s: %d file · xoá %d case trùng ===%s'
          % (role, tot_file, tot_del, '' if apply else '   (xem trước, chưa ghi)'))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))

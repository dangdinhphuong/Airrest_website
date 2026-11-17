# -*- coding: utf-8 -*-
"""Ghi kết quả chạy live (cột F) + ghi chú (cột T) vào một file `*_ket_qua.xlsx`.

Thay cho `write_taikhoan_0825.py` / `…0825b.py` / `…0825c.py` — ba bản chép y hệt nhau,
chỉ khác đúng 3 hằng số (file kết quả probe, file map dòng, bảng gộp dòng).

KHÔNG đụng cột R (công thức) và KHÔNG đụng bộ `Ket-qua-test-thu-cong` (kết quả người thật
chạy tay). Chạy `postfix_cache_*.py` SAU script này để tính lại cache cột R + D4:D8 + Tổng hợp.

    python3 write_marks_json.py --xlsx <file_ket_qua> --res res.json --map map.json
    python3 write_marks_json.py … --merge merge.json --apply

  --res    {"<key>": {"mark": "P|F|PE", "note": "…"}}
  --map    {"<key>": <số dòng trong file kết quả>}
  --merge  {"<số dòng>": ["<key ưu tiên>", …]}   cho dòng gộp nhiều phép đo (tuỳ chọn)

Một dòng nhận nhiều key thì F thắng PE, PE thắng P — không tô hồng kết quả.
Ghi chú tự thêm tiền tố `[Lần 1]` / `[Lần 2]` theo việc ô kết quả đã có giá trị chưa.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--xlsx', required=True, help='file *_ket_qua.xlsx cần ghi')
    ap.add_argument('--res', required=True, help='JSON kết quả probe')
    ap.add_argument('--map', required=True, help='JSON ánh xạ key → số dòng')
    ap.add_argument('--merge', help='JSON gộp dòng (tuỳ chọn)')
    ap.add_argument('--backup-suffix', default='bak_run')
    ap.add_argument('--apply', action='store_true', help='ghi thật; bỏ cờ này là xem trước')
    a = ap.parse_args()

    res = json.load(open(a.res, encoding='utf-8'))
    row_map = json.load(open(a.map, encoding='utf-8'))
    merge = {int(k): v for k, v in json.load(open(a.merge, encoding='utf-8')).items()} \
        if a.merge else None

    plan = qalib.build_marks(res, row_map, merge)
    n = {m: sum(1 for _, mk, _ in plan if mk == m) for m in ('P', 'F', 'PE')}
    print('sẽ ghi %d dòng (%dP/%dF/%dPE)' % (len(plan), n['P'], n['F'], n['PE']))
    for rn, mark, note in plan[:5]:
        print('  %-4d %-3s %s' % (rn, mark, note[:90]))
    if not a.apply:
        print('(xem trước, chưa ghi — thêm --apply để ghi)')
        return 0

    qalib.write_marks(a.xlsx, plan, backup_suffix=a.backup_suffix)
    print('ĐÃ GHI', a.xlsx)
    return 0


if __name__ == '__main__':
    sys.exit(main())

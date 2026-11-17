#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chụp tệp neo `a6-<Màn>.neo.json` cho một script A6.

    python3 neo_a6.py <đường/dẫn/a6-Màn.py> <file .xlsx khớp bảng SUA>

Bảng `SUA` trong script A6 khoá theo SỐ DÒNG tuyệt đối, nên chỉ cần bộ case đổi cấu trúc là
script chết. Tệp neo ghi lại NỘI DUNG (CN · nhóm · tiêu đề) của từng dòng trong bảng, để lúc
chạy `qalib.neo_a6` tra lại dòng thật. File .xlsx truyền vào phải là bản mà bảng `SUA` được
soạn theo — kiểm bằng chính lệnh này: lệch > 0 là SAI file, đừng ghi.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib  # noqa: E402
import tcfix  # noqa: E402


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    script, xlsx = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    src = open(script, encoding='utf-8').read().replace('\nmain()', '\n')
    g = {'__name__': 'neo', '__file__': script}
    argv, sys.argv = sys.argv, ['neo_a6']
    exec(compile(src, script, 'exec'), g)
    sys.argv = argv
    SUA = g['SUA']

    tc = tcfix.load(xlsx)
    neo = qalib.chup_neo(tc)
    lech = [rn for rn in SUA if rn not in neo]
    print('bảng SUA: %d dòng · file: %d case · LỆCH: %d' % (len(SUA), len(neo), len(lech)))
    if lech:
        print('  dòng không phải case:', lech[:15])
        raise SystemExit('DỪNG — file .xlsx không khớp bảng SUA, đừng ghi tệp neo sai.')

    ra = {str(rn): list(neo[rn]) for rn in sorted(SUA)}
    out = os.path.splitext(script)[0] + '.neo.json'
    if '--apply' not in argv:
        print('(XEM TRƯỚC — thêm --apply để ghi %s)' % os.path.basename(out))
        return
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(ra, f, ensure_ascii=False, indent=1, sort_keys=True)
    print('ĐÃ GHI ->', out)


main()

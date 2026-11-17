# -*- coding: utf-8 -*-
"""Gỡ nhóm `Nạp sẵn dữ liệu` / `Prefill …` khỏi khối Validate của CN CHỈNH SỬA.

Căn cứ: `prompts/PROMPT-gen-testcase-v3.md` §5.6 (chốt 2026-09-07) — CN Sửa LUÔN lặp full khối
Validate của CN Thêm, nên nhóm nạp sẵn KHÔNG còn lý do tồn tại: nội dung của nó đã nằm trong case
*"Kiểm tra giá trị mặc định"* của từng nhóm control (kết quả = "hiển thị dữ liệu đang lưu của bản ghi").

⚠️ Chỉ chạy khi người đặt việc yêu cầu rõ (v3 §5.6 ghi "chỉ dọn khi người đặt việc yêu cầu rõ").
Đã được chốt 2026-09-07: "Gỡ cả 4 nhóm".

    python3 go_napsan.py --role Admin --only KhaoSat            # xem trước
    python3 go_napsan.py --role Admin --only KhaoSat --apply    # ghi
"""
import os
import sys
import glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix
import roles
from patch_sua_validate import norm, cn_kind

APPLY = '--apply' in sys.argv
ROLE = sys.argv[sys.argv.index('--role') + 1] if '--role' in sys.argv else 'Admin'
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
CFG = roles.get(ROLE)

tot_grp = tot_case = tot_file = 0
for p in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
    base = os.path.basename(p)
    if base in CFG['skip']:
        continue
    nm = base.replace(CFG['strip'], '').replace('.xlsx', '')
    if ONLY and ONLY.lower() not in nm.lower():
        continue
    if os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % base)):
        print('  BỎ QUA (đang mở):', base)
        continue
    try:
        bps = tcfix.load(p).bpsheets
    except Exception as e:
        print('  LỖI đọc %s: %s' % (base, e))
        continue

    f_grp = f_case = 0
    for bp in bps:
        tc = tcfix.load(p, bp)
        drop = set()
        cn_ok = False
        blk = None
        inval = False
        cur_drop = False
        for rn in tc.order:
            if rn < 12:
                continue
            lv = tc.lvl(rn)
            head = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            n = norm(head)
            if lv == 'cn':
                cn_ok = cn_kind(head) == 'SUA'
                blk, inval, cur_drop = None, False, False
            elif lv == 'grp':
                blk, inval, cur_drop = n, False, False
            elif lv in ('sub', 'sub2'):
                cur_drop = False
                if not (cn_ok and blk and 'giao dien' in blk):
                    continue
                if 'validate' in n:
                    inval = True
                    continue
                if lv == 'sub' and not n.startswith(('nap san', 'prefill')):
                    inval = False
                if inval and n.startswith(('nap san', 'prefill')):
                    drop.add(rn)
                    cur_drop = True
                    f_grp += 1
                    print('   %-22s %-40s (gỡ)' % (nm[:22], head[:40]))
            elif lv == 'case' and cur_drop:
                drop.add(rn)
                f_case += 1
        if not drop or not APPLY:
            continue
        pl = tcfix.Plan(tc)
        for rn in tc.order:
            if rn >= 12 and rn not in drop:
                pl.keep(rn)
        tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if f_grp:
        tot_file += 1
        tot_grp += f_grp
        tot_case += f_case
        print('      -> %s: gỡ %d nhóm / %d case%s' % (base, f_grp, f_case, '' if APPLY else ' (chưa ghi)'))

print('\n=== %s: %d file · gỡ %d nhóm · %d case ===%s'
      % (ROLE, tot_file, tot_grp, tot_case, '' if APPLY else '   (xem trước, chưa ghi)'))

# -*- coding: utf-8 -*-
"""Tái cấu trúc khối An toàn thông tin về ĐÚNG KHUNG MẪU: mỗi ô nhập một DÒNG NHÓM riêng.

Mẫu (r282 / r288 …) đặt case injection dưới dòng nhóm mang tên ô, ví dụ:

    An toàn thông tin (…)
      Textbox Mã từ điển dùng chung          <- dòng nhóm, cấp `sub` (outlineLevel 2)
         · XSS (Kiểm tra lỗi khi nhập Script HTML)
         · XSS (… hexa dạng URL)
         · XSS (… hexa dạng HTML)
         · XSS (Kiểm tra lỗi khi nhập alert)
         · SQL Injection (Kiểm tra khi Insert)
      Textbox Tên từ điển dùng chung
         · …

Đợt 2026-09-04 (`patch_attt_field.py`) bơm case PHẲNG và nhét tên ô vào tiêu đề
("… — Tên xuất xứ") nên thiếu dòng nhóm. Script này:
  1. gom case injection theo từng ô (theo hậu tố "— <ô>", theo nhóm đang chứa, hoặc theo tên ô
     xuất hiện trong tiêu đề; CN chỉ có 1 ô nhập thì mọi case injection thuộc ô đó);
  2. dựng lại khối: case phân quyền/phiên giữ PHẲNG ở trên → sau đó mỗi ô một dòng nhóm;
  3. bỏ hậu tố "— <ô>" ở tiêu đề case do đợt 04/09 sinh (tên ô đã nằm ở dòng nhóm);
     tiêu đề case CŨ giữ nguyên chữ (luật 8: không ghi đè nội dung sẵn có).

KHÔNG thêm/xoá case nào — chỉ chèn dòng nhóm và sắp lại thứ tự trong khối ATTT.

    python3 restructure_attt_field.py --role Admin          # xem trước
    python3 restructure_attt_field.py --role Admin --apply  # ghi
"""
import os, sys, glob, re, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles

def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

PREFIX = re.compile(r'^(textbox|textarea|ô tìm|ô nhập|ô số)\s*', re.I)
def field_label(g):
    s = PREFIX.sub('', g).strip()
    return re.sub(r'\s*\(.*?\)\s*$', '', s).strip() or g

def needs_attt(g):
    n = norm(g)
    if not n.startswith(('textbox', 'textarea', 'o tim', 'o nhap', 'o so', 'tim theo', 'tim nhanh')):
        return False
    return not any(b in n for b in ('chi doc', 'ma dinh danh', 'tu suy ra', 'tu sinh', 'tu dong sinh'))

INJ = ['script html', 'the script', 'xss', 'hexa', 'alert', 'sql injection', 'sqli',
       'cau lenh truy van', 'chen cau lenh']
def is_injection(t):
    n = norm(t)
    return any(k in n for k in INJ)

# thứ tự mục trong nhóm, đúng mẫu
def muc_order(t):
    n = norm(t)
    if 'hexa' in n and 'url' in n:  return 1
    if 'hexa' in n and 'html' in n: return 2
    if 'alert' in n:                return 3
    if 'sql' in n or 'truy van' in n: return 4
    return 0                                    # XSS thô

SUFFIX = re.compile(r'\s+—\s+.+$')              # hậu tố "— <ô>" do đợt 04/09 sinh

APPLY = '--apply' in sys.argv
ROLE = 'Admin'
if '--role' in sys.argv: ROLE = sys.argv[sys.argv.index('--role') + 1]
CFG = roles.get(ROLE)
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None

tot_grp = tot_cn = tot_file = 0
for p in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
    base = os.path.basename(p)
    if base in CFG['skip']: continue
    if os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % base)):
        print('  BỎ QUA (đang mở):', base); continue
    nm = base.replace(CFG['strip'], '').replace('.xlsx', '')
    if ONLY and ONLY.lower() not in nm.lower(): continue
    try: bps = tcfix.load(p).bpsheets
    except Exception as e:
        print('  LỖI đọc %s: %s' % (base, e)); continue

    file_grp = 0
    for bp in bps:
        tc = tcfix.load(p, bp)
        # ---- quét: ô nhập theo CN + nội dung khối ATTT theo CN ----
        cn = None; blk = None; inval = False
        fields = {}; blocks = {}      # cn -> [(rn, kind, text, group_hiện_tại)]
        curgrp = None
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn); t = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'cn':
                cn = t; blk = None; inval = False; curgrp = None
                fields.setdefault(cn, []); blocks.setdefault(cn, [])
            elif lv == 'grp':
                blk = norm(t); inval = False; curgrp = None
            elif lv in ('sub', 'sub2'):
                if blk and 'giao dien' in blk:
                    if 'validate' in norm(t): inval = True
                    elif lv == 'sub': inval = False
                    if inval and needs_attt(t) and t not in fields[cn]: fields[cn].append(t)
                elif blk and 'toan thong tin' in blk:
                    curgrp = t
                    blocks[cn].append((rn, 'grp', t, None))
            elif lv == 'case' and blk and 'toan thong tin' in blk:
                blocks[cn].append((rn, 'case', t, curgrp))

        plan_by_cn = {}
        for c, items in blocks.items():
            fs = [f for f in fields.get(c, [])]
            if not fs or not items: continue
            cases = [x for x in items if x[1] == 'case']
            if not cases: continue
            only_one = len(fs) == 1
            assign = {f: [] for f in fs}; flat = []
            for rn, _k, t, g in cases:
                if not is_injection(t): flat.append((rn, t)); continue
                hit = None
                m = SUFFIX.search(t)
                if m:                                        # "… — <ô>"
                    lab = norm(m.group(0).split('—', 1)[1].strip())
                    for f in fs:
                        if norm(field_label(f)) == lab: hit = f; break
                if hit is None and g:                        # đang nằm trong nhóm per-field
                    for f in fs:
                        if norm(field_label(f)) in norm(g) or norm(g) in norm(f): hit = f; break
                if hit is None:                              # tên ô nằm trong tiêu đề
                    for f in fs:
                        if norm(field_label(f)) in norm(t): hit = f; break
                if hit is None and only_one: hit = fs[0]
                if hit is None: flat.append((rn, t))
                else: assign[hit].append((rn, t))
            if not any(assign.values()): continue
            plan_by_cn[c] = (flat, assign, [x[0] for x in items])
            tot_cn += 1
            for f, cs in assign.items():
                if cs:
                    file_grp += 1; tot_grp += 1
                    print('   %-20s %-28s NHÓM "%s" ← %d case' % (nm[:20], c[:28], f[:34], len(cs)))
        if not plan_by_cn: continue

        if APPLY:
            # bỏ hậu tố "— <ô>" ở tiêu đề case do đợt 04/09 sinh
            for c, (flat, assign, _rows) in plan_by_cn.items():
                for f, cs in assign.items():
                    for rn, t in cs:
                        if SUFFIX.search(t) and (t.startswith('XSS (') or t.startswith('SQL Injection (')):
                            tc.retext(rn, md=SUFFIX.sub('', t))
            replaced = {}
            for c, (flat, assign, rows) in plan_by_cn.items():
                for r in rows: replaced[r] = c
            pl = tcfix.Plan(tc); done = set()
            for rn in tc.order:
                if rn < 12: continue
                c = replaced.get(rn)
                if c is None:
                    pl.keep(rn); continue
                if c in done: continue               # cả khối đã được dựng lại ở lần gặp đầu
                done.add(c)
                flat, assign, rows = plan_by_cn[c]
                for r, _t in flat: pl.keep(r)        # case phân quyền/phiên: phẳng, giữ thứ tự
                for f in fields[c]:
                    cs = assign.get(f) or []
                    if not cs: continue
                    pl.add_sub(f)                    # DÒNG NHÓM theo mẫu (cấp sub)
                    for r, _t in sorted(cs, key=lambda x: muc_order(x[1])): pl.keep(r)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if file_grp: tot_file += 1

print('\n=== %s: %d file · %d CN · %d dòng nhóm ===%s'
      % (ROLE, tot_file, tot_cn, tot_grp, '' if APPLY else '   (xem trước, chưa ghi)'))

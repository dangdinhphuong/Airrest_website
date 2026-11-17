# -*- coding: utf-8 -*-
"""Nghiệm thu 8 mục §7 (DINH-MUC-VALIDATE-testcase.md) cho bộ Admin sau đợt dọn 2026-08-06.

  ① verify() 0 lỗi          ② mọi dòng đủ 20 ô        ③ mã case liên tục prefix_1..N
  ④ không dòng case nào mất mã cột A                  ⑤ cột S rỗng
  ⑥ không case trùng tên trong cùng nhóm              ⑦ (chạy riêng audit_validate_quota)
  ⑧ round-trip soffice sạch (chạy riêng, tốn thời gian)
"""
import os, re, glob, sys, tcfix, qalib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roles

_args = [a for a in sys.argv[1:] if not a.startswith('--')]
ROLE = _args[0] if _args and _args[0] in roles.ROLES else 'Admin'
ONLY = [a for a in _args if a != ROLE]
DIR = roles.ROLES[ROLE]['dir']
SKIP = ({'DonGia', 'GoiSTEM'} if ROLE == 'Admin' else set()) | {
    os.path.basename(f).replace(roles.ROLES[ROLE]['strip'], '').replace('.xlsx', '')
    for f in roles.ROLES[ROLE]['skip']}

tot_case = 0
bad = 0
# ── QUÉT RỖNG PHẢI CHẾT, KHÔNG ĐƯỢC IN 0  (vá 2026-09-14) ──────────────────────────────────
# Thiếu `QA_TESTCASE_DIR` (hoặc sai `QA_PROJECT`) thì `DIR` trỏ vào thư mục KHÔNG TỒN TẠI, vòng
# lặp chạy 0 vòng và dòng cuối in `=== 0 case · 0 file có lỗi ===` — đọc y như "sạch". Đúng lớp
# lỗi đã vá cho `qalib.iter_role_files` (thư mục rỗng vẫn in 0) nhưng bộ này chưa theo; dính
# thật 2026-09-14 ngay lệnh nghiệm thu đầu phiên. Số 0 phải chứng minh được là ĐÃ QUÉT TỚI NƠI.
_ds = sorted(glob.glob(DIR + '*.xlsx'))
if not os.path.isdir(DIR):
    raise SystemExit('DỪNG — thư mục bộ case KHÔNG TỒN TẠI: %s\n'
                     '   Đặt QA_TESTCASE_DIR (và QA_PROJECT) cho đúng rồi chạy lại.' % DIR)
if not _ds:
    raise SystemExit('DỪNG — %s không có file .xlsx nào. KHÔNG kết luận "0 lỗi" từ quét rỗng.'
                     % DIR)
print('rà %d file trong %s' % (len(_ds), DIR))
for path in _ds:
    nm = os.path.basename(path).replace(roles.ROLES[ROLE]['strip'], '').replace('.xlsx', '')
    if nm in SKIP or (ONLY and nm not in ONLY): continue
    errs = []

    n, e = tcfix.verify(path)                                   # ①③
    errs += e
    tot_case += n

    tc = tcfix.load(path)
    ncell = {}
    dup = []
    seen = {}
    cur = None
    for rn in tc.order:
        if rn < 12: continue
        body = tc.rows[rn]['body']
        cols = re.findall(r'<c r="([A-Z]+)%d"' % rn, body)
        ncell[rn] = len(cols)
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').strip()
        if lv != 'case':
            cur = b; seen = {}
            continue
        if not (tc.c(rn, 'A') or '').strip():                    # ④
            errs.append(f'r{rn} case mất mã cột A')
        if (tc.c(rn, 'S') or '').strip():                        # ⑤
            errs.append(f'r{rn} cột S có dữ liệu')
        key = b.lower()
        # §5.1 miễn trừ: mẫu CỐ Ý cho 4 case "vị trí trang sau 1 thao tác" dùng chung một
        # tiêu đề (chỉ khác cột C/D). Bộ này tự cài lại phép dò trùng nên trước 2026-09-08
        # KHÔNG có `DUP_OK` của `qalib` -> mọi file có nhóm `Phân trang` đúng 14 case verbatim
        # đều trượt mục ⑥, tức bộ case CÀNG ĐÚNG MẪU CÀNG BỊ BÁO LỖI.
        if key in seen and not qalib._dup_ok(b):
            dup.append(f'r{rn} trùng "{b[:44]}" (đã có r{seen[key]}) trong "{str(cur)[:30]}"')
        seen[key] = rn
    short = [r for r, c in ncell.items() if c != 20]             # ②
    if short: errs.append(f'{len(short)} dòng không đủ 20 ô: {short[:5]}')
    errs += dup[:5]                                              # ⑥
    if dup and len(dup) > 5: errs.append(f'… tổng {len(dup)} case trùng tên')

    flag = '✔' if not errs else '✘'
    if errs: bad += 1
    print(f'{flag} {nm:18s} {n:4d} case' + ('' if not errs else '  | ' + ' ; '.join(errs)[:150]))

_da_ra = sum(1 for p in _ds
             if os.path.basename(p).replace(roles.ROLES[ROLE]['strip'], '').replace('.xlsx', '')
             not in SKIP and (not ONLY or os.path.basename(p)
                              .replace(roles.ROLES[ROLE]['strip'], '')
                              .replace('.xlsx', '') in ONLY))
if not _da_ra:
    raise SystemExit('DỪNG — 0/%d file lọt qua bộ lọc (SKIP/tên màn). Không có gì để nghiệm thu.'
                     % len(_ds))
print(f'=== {tot_case} case · {_da_ra} file đã rà · {bad} file có lỗi ===')

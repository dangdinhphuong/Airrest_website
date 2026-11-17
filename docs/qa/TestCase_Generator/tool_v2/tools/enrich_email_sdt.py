# -*- coding: utf-8 -*-
"""Bổ sung BƯỚC THỰC HIỆN (cột C) cho nhóm Email / Số điện thoại theo từ điển gốc
`templateTestcase/DanhMucTuDienDungChung.xlsx` (Textbox Email r194-205 · Textbox SĐT r206-214).

Bước hiện có bị rút gọn ("đầu số hợp lệ của nhà mạng (10 chữ số)"), từ điển liệt kê ĐỦ đầu số
từng nhà mạng + quy tắc độ dài 10/11/12 theo dạng 0 / 84 / +84; email liệt kê 7 biến thể sai
và 6 ví dụ đúng. Script GIỮ NGUYÊN bước đang có, chỉ chèn khối chi tiết còn thiếu vào ngay sau
dòng hành động đầu tiên — không ghi đè ngữ cảnh riêng của từng màn.

Chỉ áp cho Ô NHẬP thật. Ô tìm kiếm / danh sách / hộp thoại bị loại (định mức khác, không kiểm
định dạng email).

Dùng:  python3 enrich_email_sdt.py [--apply]
"""
import os, re, sys, glob, unicodedata, tcfix

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../testCase/Admin/testcase/')
APPLY = '--apply' in sys.argv


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


# ── khối chi tiết bám verbatim từ điển ──
PHONE = (
    'Đầu số hợp lệ theo nhà mạng:\n'
    '- Viettel: 096, 097, 098, 086, 032, 033, 034, 035, 036, 037, 038, 039\n'
    '- Mobifone: 090, 093, 089, 070, 076, 077, 078, 079\n'
    '- Vinaphone: 091, 094, 088, 081, 082, 083, 084, 085\n'
    '- Vietnamobile: 092, 052, 056, 058\n'
    '- Gmobile: 099, 059\n'
    'Độ dài theo dạng: 10 số với dạng bắt đầu bằng 0 (ví dụ 0989306222); 11 số với dạng 84 '
    '(ví dụ 84989306222); 12 số với dạng 084 hoặc +84 (ví dụ 084989306222, +84989306222).')

EMAIL_BAD = (
    'Các dạng sai cần thử lần lượt: thiếu dấu @; thừa dấu @; có hai dấu chấm liền nhau; '
    'dấu chấm ở đầu hoặc cuối địa chỉ; dấu @ ở cuối địa chỉ; dấu gạch ngang ngay trước hoặc '
    'ngay sau dấu @; nội dung là thẻ html, chuỗi liên kết, ký tự đặc biệt (; & # * ^ % $ ...).')

EMAIL_OK = (
    'Ví dụ địa chỉ đúng: firstname@viettel.com.vn; firstname.lastname@domain.com; '
    'email@subdomain.domain.com; email@domain-one.com; firstname-lastname@domain.com; '
    'email@domain.co.jp — phần trước dấu @ dài từ 1 đến 64 ký tự.')

BLANK = 'Thử cả hai cách: để trống hẳn và nhập toàn khoảng trắng.'

# ── mục nào của mỗi loại được bổ sung khối nào ──
PHONE_RULES = [
    (('dung dau so', 'dau so cho phep', 'dau so hop le'), PHONE),
    (('sai so ky tu', 'sai so chu so', 'sai do dai', 'khong hop le'), PHONE),
    (('sai dau so',), PHONE),
    (('copy', 'paste'), PHONE),
    (('bat buoc',), BLANK),
]
EMAIL_RULES = [
    (('sai dinh dang', 'khong dung dinh dang'), EMAIL_BAD),
    # chỉ mục "nhập đúng định dạng" mới liệt kê ví dụ (từ điển r203);
    # mục "độ dài hợp lệ trước dấu @" (r201) KHÔNG có ví dụ -> không khớp 'hợp lệ' chung chung
    (('dung dinh dang',), EMAIL_OK),
    (('copy', 'paste'), EMAIL_OK),
    (('bat buoc',), BLANK),
]

# nhóm KHÔNG áp (ô tìm kiếm / danh sách / hộp thoại)
EXCLUDE = ('tim theo', 'tim kiem', 'danh sach', 'hop thoai')


def kind_of_group(name):
    n = norm(name)
    if any(k in n for k in EXCLUDE): return None
    if 'email' in n: return 'email'
    if 'so dien thoai' in n or 'sdt' in n: return 'phone'
    return None


def block_for(kind, title):
    n = norm(title)
    for kws, blk in (PHONE_RULES if kind == 'phone' else EMAIL_RULES):
        if any(k in n for k in kws): return blk
    return None


def insert(c, blk):
    """Chèn khối chi tiết ngay sau dòng hành động đầu tiên, giữ nguyên phần đã có."""
    lines = (c or '').split('\n')
    if not lines or not lines[0].strip(): return (c or '') + ('\n' if c else '') + blk
    i = 0
    for j, ln in enumerate(lines):                       # ưu tiên dòng "1. ..."
        if re.match(r'\s*1\.', ln): i = j; break
    return '\n'.join(lines[:i + 1] + [blk] + lines[i + 1:])


tot_g = tot_c = 0
for path in sorted(glob.glob(DIR + '*.xlsx')):
    nm = os.path.basename(path).replace('Testcase-Role-Admin-', '').replace('.xlsx', '')
    tc = tcfix.load(path)
    rows = [r for r in tc.order if r >= 12]
    in_val = False
    edits = []
    for i, rn in enumerate(rows):
        lv = tc.lvl(rn)
        t = (tc.c(rn, 'B') or '').strip()
        if lv == 'sub': in_val = 'validate' in norm(t)
        if lv not in ('sub', 'sub2') or not in_val: continue
        kind = kind_of_group(t)
        if not kind: continue                            # duyệt hết, KHÔNG break (bẫy §0.3 #6)
        grp_edits = []
        for r2 in rows[i + 1:]:
            if tc.lvl(r2) != 'case': break
            blk = block_for(kind, tc.c(r2, 'B') or '')
            if not blk: continue
            cur = tc.c(r2, 'C') or ''
            head = blk.split('\n')[0][:28]
            if head in cur: continue                     # đã có khối này rồi
            grp_edits.append((r2, insert(cur, blk)))
        if grp_edits:
            tot_g += 1; tot_c += len(grp_edits)
            print(f'  {nm:16s} r{rn:<5} [{kind:5s}] {t[:40]:40s} +{len(grp_edits)} case')
            edits += grp_edits
    if edits and APPLY:
        for rn, c in edits: tc.retext(rn, buoc=c)
        plan = tcfix.Plan(tc); plan.keep_rest(12)
        tc.rebuild(plan).save(quiet=True)

print(f'=== {tot_g} nhóm · {tot_c} case được bổ sung bước ===' + ('' if APPLY else '  (DRY-RUN)'))

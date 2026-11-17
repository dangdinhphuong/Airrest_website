# -*- coding: utf-8 -*-
"""Bơm case ATTT injection PER-FIELD còn thiếu cho MỌI ô nhập.

Chuẩn mẫu (r283–r293 form · r147–r150 ô tìm · r570–r578 cột Excel):
  · CN Thêm mới / Chỉnh sửa : 5 mục / ô  (XSS thô · hexa URL · hexa HTML · alert · SQLi)
  · CN Tìm kiếm / Nhập Excel: 4 mục / ô  (bỏ alert)

Chỉ thị 2026-09-04: áp cho **MỌI ô gõ được**, kể cả ô số / Email / SĐT / mật khẩu.
Loại trừ control không gõ được (Selectbox · Combobox · Checkbox · Upload · Ngày · Nút · Tab)
và ô chỉ đọc / mã tự sinh.

Vì sao cần script riêng: `audit_attt.py` rà khối **phân quyền & phiên** (chưa đăng nhập, quyền,
phạm vi, IDOR, hết phiên) — KHÁC hẳn khối injection per-field của mẫu. Hai khối CỘNG NHAU.

    python3 patch_attt_field.py --role Admin              # xem trước cả role
    python3 patch_attt_field.py --role Admin --only KhaoSat --apply   # chỉ 1 file
"""
import os, sys, glob, re, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, quota_cases, qalib

def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

# CHỈ strip từ khoá LOẠI control. KHÔNG gộp 'textbox số' thành một cụm — làm vậy sẽ cắt mất
# chữ "Số" vốn là phần TÊN THẬT của trường ("Textbox Số điện thoại" -> phải còn "Số điện thoại").
# Ba hàm dưới nay nằm ở `qalib.py` để `audit_attt.py` rà bằng ĐÚNG luật mà script này bơm —
# trước 2026-09-07 chỉ script này biết "ô nào cần ATTT" nên không bộ rà nào bắt được ô bị bỏ sót.
field_label = qalib.attt_field_label
needs_attt = qalib.needs_attt
NEEDLES = qalib.ATTT_NEEDLES


def spec_of_cn(cn):
    kind, _n = qalib.attt_kind_of_cn(cn)
    return {'Nhập Excel': quota_cases.ATTT_IMPORT, 'Tìm kiếm': quota_cases.ATTT_SEARCH,
            'Thêm mới': quota_cases.ATTT_ADD, 'Chỉnh sửa': quota_cases.ATTT_EDIT}.get(kind), kind


APPLY = '--apply' in sys.argv
ROLE = 'Admin'
if '--role' in sys.argv: ROLE = sys.argv[sys.argv.index('--role') + 1]
CFG = roles.get(ROLE)
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None

tot_case = tot_field = tot_file = 0
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

    file_case = 0
    for bp in bps:
        tc = tcfix.load(p, bp)
        # gom theo từng CN: ô nhập trong Validate + case ATTT hiện có + dòng cuối khối ATTT
        cn = None; blk = None; inval = False
        fields = {}; acases = {}; alast = {}
        # BẪY (vá 2026-09-07): trước đây chỉ so tên trường trong TIÊU ĐỀ case, nên file đã có
        # dòng nhóm ATTT per-field (tiêu đề case không nhắc tên trường) bị coi là THIẾU -> bơm
        # lần hai, sinh case trùng (đã từng phải viết dedupe_attt_field.py để dọn 203 case).
        # Nay gom theo NHÓM: agrp[cn][khoá trường] = {'cases': [...], 'last': dòng cuối của nhóm}.
        agrp = {}; cur_ag = None
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn); t = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'cn':
                cn = t; blk = None; inval = False; cur_ag = None
                fields.setdefault(cn, []); acases.setdefault(cn, []); agrp.setdefault(cn, {})
            elif lv == 'grp':
                blk = norm(t); inval = False
                cur_ag = None
                if 'toan thong tin' in blk: alast[cn] = rn      # khối ATTT rỗng vẫn có mốc chèn
            elif lv in ('sub', 'sub2'):
                if blk and 'giao dien' in blk:
                    if 'validate' in norm(t): inval = True
                    elif lv == 'sub': inval = False
                    if inval and needs_attt(t) and t not in fields[cn]: fields[cn].append(t)
                elif blk and 'toan thong tin' in blk:
                    alast[cn] = rn
                    cur_ag = norm(field_label(t))
                    agrp[cn][cur_ag] = {'cases': [], 'last': rn}
            elif lv == 'case' and blk and 'toan thong tin' in blk:
                acases[cn].append(t); alast[cn] = rn
                if cur_ag is not None:
                    agrp[cn][cur_ag]['cases'].append(t); agrp[cn][cur_ag]['last'] = rn

        add = {}
        for c, fs in fields.items():
            spec, kind = spec_of_cn(c)
            if not spec or not fs or c not in alast: continue
            only_one = len(fs) == 1
            for f in fs:
                lab = norm(field_label(f))
                ag = agrp.get(c, {}).get(lab)
                if ag is not None:                       # đã có nhóm ATTT riêng cho trường này
                    mine, anchor = ag['cases'], ag['last']
                else:
                    anchor = alast[c]
                    mine = [x for x in acases[c] if lab and lab in norm(x)]
                    if not mine and only_one:
                        mine = [x for x in acases[c]
                                if any(any(k in norm(x) for k in v) for v in NEEDLES.values())]
                have = norm(' | '.join(mine))
                picked = []
                for key, md, buoc, kq in spec:
                    if any(x in have for x in NEEDLES[key]): continue
                    lb = field_label(f)
                    picked.append((md.format(f=lb), buoc.format(f=lb), kq))
                if picked:
                    add.setdefault(anchor, []).extend(picked)
                    tot_field += 1
                    print('   %-20s %-30s %-24s [%s] +%d'
                          % (nm[:20], c[:30], f[:24], kind, len(picked)))
        if not add: continue
        file_case += sum(len(v) for v in add.values())
        if APPLY:
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn < 12: continue
                pl.keep(rn)
                for cse in add.get(rn, []): pl.case(*cse)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if file_case:
        tot_file += 1; tot_case += file_case

print('\n=== %s: %d file · %d ô nhập · +%d case ===%s'
      % (ROLE, tot_file, tot_field, tot_case, '' if APPLY else '   (xem trước, chưa ghi)'))

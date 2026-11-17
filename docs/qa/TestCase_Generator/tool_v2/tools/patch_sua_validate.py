# -*- coding: utf-8 -*-
"""Lặp khối `Validate các trường thông tin` từ CN THÊM sang CN SỬA — bám mẫu.

Mẫu `templateTestcase/DanhMucTuDienDungChung.xlsx`, CN CHỈNH SỬA (r294–r432) lặp **full**
mọi nhóm control của CN THÊM MỚI (r151), khác đúng 2 chỗ:

    · cột C: "3. Click Thêm mới"                 -> "3. Click Cập nhật"
    · case "Kiểm tra giá trị mặc định": cột C -> "Kiểm tra giá trị mặc định của trường này"
                                        cột D -> "Mặc định hiển thị dữ liệu từ DB"

Tên nhóm giữ NGUYÊN VĂN như CN Thêm (mẫu không thêm hậu tố "(sửa)").
Luật: `luat/DINH-MUC-VALIDATE-testcase.md` §4 — hướng "lặp FULL" (người đặt việc yêu cầu bám mẫu).

Ghép cặp CN Sửa <-> CN Thêm theo THỰC THỂ (bỏ động từ + phần trong ngoặc), vì một file có thể
có nhiều thực thể (Curriculum: Thêm bộ sách / chương / bài). Chỉ bơm nhóm control NHẬP LIỆU
mà CN Sửa còn thiếu; KHÔNG sửa/xoá case cũ (luật 8), KHÔNG đụng khối ATTT.

    python3 patch_sua_validate.py --role Admin --only KhaoSat            # xem trước
    python3 patch_sua_validate.py --role Admin --only KhaoSat --apply    # ghi
    python3 patch_sua_validate.py --role Admin --only KhaoSat --detail   # in cả nội dung case

Sau khi ghi PHẢI chạy lại `formula_layer.py` (rebuild ghi giá trị thường, mất công thức cột A/R).
"""
import os
import re
import sys
import glob
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix
import roles
import qalib


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


VERB = r'(chinh sua|cap nhat|them moi|tao moi|khoi tao|sua|them|tao)'

# ── Nhóm KHÔNG lặp (có bằng chứng: control không tồn tại / chỉ đọc / đã có dưới tên khác) ──
# Khoá: (tên file không dấu chứa cụm, tên nhóm không dấu chứa cụm) — chỉ thị 2026-09-04.
EXCLUDE = [
    ('taikhoan', 'selectbox loai to chuc'),      # màn Sửa không cho đổi tổ chức (user chốt)
    ('taikhoan', 'selectbox so gd'),
    ('taikhoan', 'selectbox to chuc'),
    ('media',    'nut chon loai'),               # đã có nhóm "Nút chọn Loại (chỉ đọc khi sửa)"
    ('media',    'nut chon nguon video'),
]
# CN KHÔNG phải biểu mẫu sửa (lọt vào phép đo vì tên CN có chữ "Cập nhật")
EXCLUDE_CN = ['vong doi campaign']
# Alias: nhóm ở CN Sửa mang tên khác nhưng CÙNG control -> coi như đã có
ALIAS = [('textbox mat khau', 'textbox mat khau moi'),
         ('textbox nhap lai mat khau', 'textbox nhap lai mat khau moi')]

# Case chỉ đúng ở màn THÊM (tiền đề "ô đang trống" / "tự sinh") -> không lặp, in ra để soi
SKIP_CASE = [('dang trong', 'tu dien'), ('dang trong', 'tu sinh'), ('chua co', 'tu sinh')]


def cn_kind(t):
    n = norm(t)
    if any(k in n for k in ('nhap excel', 'import', 'xuat', 'wizard', 'deploy')):
        return None
    if 'buoc' in n and any(k in n for k in ('buoc 1', 'buoc 2', 'buoc 3', 'buoc 4', 'buoc 5')):
        return None
    if any(k in n for k in EXCLUDE_CN):
        return None
    if any(k in n for k in ('chinh sua', 'cap nhat')) or n.startswith('sua ') or ' sua ' in n:
        return 'SUA'
    if any(k in n for k in ('them moi', 'tao moi', 'them ', 'tao ', 'khoi tao')):
        return 'THEM'
    return None


def entity(t):
    n = re.sub(r'\(.*?\)', ' ', norm(t))
    n = re.sub(r'\b' + VERB + r'\b', ' ', n)
    n = re.sub(r'\b(luu nhap|ban nhap|nhap|moi)\b', ' ', n)
    return re.sub(r'\s+', ' ', n).strip()


def key_of(g):
    """Khoá so khớp nhóm: bỏ hậu tố (sửa)/(edit)/(cập nhật) và phần trong ngoặc ở cuối."""
    x = re.sub(r'\s*\((?:s[uử]a|edit|c[aậ]p nh[aậ]t)[^)]*\)\s*$', '', g, flags=re.I)
    x = re.sub(r'\s*\([^)]*\)\s*$', '', x)
    k = norm(x).strip()
    for a, b in ALIAS:
        if k == b:
            return a          # "mật khẩu mới" ~ "mật khẩu"
    return k


def is_input(g):
    n = norm(g)
    if n.startswith(('button', 'hop xac nhan', 'hop thoai', 'nap san', 'danh sach', 'the ',
                     'trinh ', 'hien thi')):
        return False
    return n.startswith(('textbox', 'textarea', 'selectbox', 'combobox', 'checkbox', 'upload',
                         'datepicker', 'o ngay', 'o so', 'o nhap', 'o tim', 'email',
                         'so dien thoai', 'nut chon', 'ngay '))


def is_tail(g):
    """Nhóm 'đuôi' của khối Validate — control nhập liệu phải đứng TRƯỚC chúng."""
    return norm(g).startswith(('hop xac nhan', 'hop thoai', 'button'))


# ── biến đổi nội dung khi clone Thêm -> Sửa ────────────────────────────────────────────
SAVE_RE = re.compile(
    r'(B[aấ]m|Nh[aấ]n|Click|Ch[oọ]n)\s+(?:v[aà]o\s+)?(?:n[uú]t\s+|button\s+|icon\s+)?'
    r'(L[uư]u(?:\s+nh[aá]p)?|Th[eê]m m[oớ]i|T[aạ]o m[oớ]i|T[aạ]o|Ghi nh[aậ]n|X[aá]c nh[aậ]n)'
    r'(?![\wÀ-ỹ])', re.I)


def to_edit(text, btn):
    """Đổi cụm bấm nút lưu của biểu mẫu THÊM sang nhãn nút của biểu mẫu SỬA."""
    if not text:
        return text
    out = SAVE_RE.sub(lambda m: '%s nút %s' % (m.group(1), btn), text)
    # "biểu mẫu tạo đợt khảo sát mới" -> "biểu mẫu sửa đợt khảo sát"  (cụm DÀI xử lý trước)
    out = re.sub(r'(bi[eể]u m[aẫ]u)\s+(?:t[aạ]o|th[eê]m)(?:\s+m[oớ]i)?\s+', r'\1 sửa ', out,
                 flags=re.I)
    out = re.sub(r'(bi[eể]u m[aẫ]u s[uử]a\s+[^.,;⏎"]*?)\s+m[oớ]i\b', r'\1', out, flags=re.I)
    out = re.sub(r'(M[oở])\s+(bi[eể]u m[aẫ]u)(?!\s+s[uử]a)', r'\1 \2 sửa', out)
    return out


def to_edit_kq(text):
    out = re.sub(r'(Th[eê]m m[oớ]i|T[aạ]o m[oớ]i) th[aà]nh c[oô]ng', 'Cập nhật thành công', text or '')
    out = re.sub(r'th[eê]m m[oớ]i th[aà]nh c[oô]ng', 'cập nhật thành công', out)
    # "không tạo đợt nào" / "chưa tạo bản ghi nào" là nghĩa của màn THÊM
    out = re.sub(r'(kh[oô]ng|ch[uư]a)\s+t[aạ]o\s+(?:th[eê]m\s+)?[^.,;⏎]{0,28}?n[aà]o',
                 r'\1 lưu thay đổi nào', out, flags=re.I)
    return out


# NGUYÊN VĂN MẪU (DanhMucTuDienDungChung.xlsx, CN CHỈNH SỬA r306/r317/r338…) — chỉ thị 2026-09-07:
# case "giá trị mặc định" của CN Sửa ghi ĐÚNG như mẫu, không diễn giải dài.
# ⚠️ LẤY TỪ `qalib`, KHÔNG chép lại (vá 2026-09-14). Bản trước chép nguyên văn vào đây, nên khi
#    chỉ thị 14/09 đổi chữ chuẩn ở `qalib` thì bộ bơm này vẫn lặng lẽ bơm chữ CŨ cho mọi màn sinh
#    mới — bộ rà `audit_sua` báo đỏ mà không ai ngờ nguồn nằm ở một hằng số chép tay.
DEFAULT_BUOC = qalib.MAC_DINH_BUOC_SUA
DEFAULT_KQ = qalib.MAC_DINH_KQ_SUA


def is_default_case(md):
    return 'gia tri mac dinh' in norm(md) or 'mac dinh hien thi' in norm(md)


def skip_case(c, d):
    j = norm((c or '') + ' ¦ ' + (d or ''))
    return any(all(x in j for x in pair) for pair in SKIP_CASE)


def find_btn(tc, grp_rows):
    """Nhãn nút lưu của CN Sửa (từ nhóm `Button ...` trong khối Validate).

    ⚠️ BÀI HỌC 07/09/2026: nhãn trong TÊN NHÓM của bộ case có thể lệch so với giao diện thật —
    KhaoSat ghi `Button Lưu thay đổi` nhưng nút thật chỉ là "Lưu" (đã xác nhận live, đã sửa 41 case).
    Nhãn lấy ở đây là nguồn tốt nhất khi làm offline; sau khi bơm nên đối chiếu 1 lần trên UI thật.
    """
    bad = ('huy', 'thu lai', 'xem truoc', 'sao chep', 'dong', 'quay lai', 'them', 'xoa')
    for _rn, name in grp_rows:
        n = norm(name)
        if n.startswith('button') and not any(k in n for k in bad):
            return name.split('\n')[0].strip()[len('Button'):].strip() or 'Cập nhật'
    return 'Cập nhật'


def scan(tc):
    """-> {cn: {'kind','vrow','grps':[(rn,name)],'cases':{rn_nhom:[(B,C,D)]},'vend':rn}}"""
    data, cn, kind, blk, inval, cur = {}, None, None, None, False, None
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        t = (tc.c(rn, 'B') or '').strip()
        head = t.split('\n')[0].strip()
        if lv == 'case':
            if cn in data and cur:
                data[cn]['cases'][cur].append((t, tc.c(rn, 'C') or '', tc.c(rn, 'D') or ''))
                data[cn]['vend'] = rn
            continue
        cur = None
        if lv == 'cn':
            cn = head
            kind = cn_kind(head)          # CHỈ dòng tiêu đề: ô B của CN còn chứa các bước đăng nhập
            blk, inval = None, False
            if kind:
                data[cn] = {'kind': kind, 'vrow': None, 'grps': [], 'cases': {}, 'vend': None}
        elif kind and lv == 'grp':
            blk, inval = norm(head), False
        elif kind and lv in ('sub', 'sub2') and blk and 'giao dien' in blk:
            if 'validate' in norm(head):
                inval = True
                data[cn]['vrow'] = rn
                data[cn]['vend'] = rn
            elif lv == 'sub':
                inval = False
            if inval and data[cn]['vrow'] and rn != data[cn]['vrow']:
                data[cn]['grps'].append((rn, head))
                data[cn]['cases'][rn] = []
                data[cn]['vend'] = rn
                cur = rn
    return data


def plan_file(path, base, only_detail=False):
    """-> (list các (bp, {rn_chèn: [item]}), log) ; item = ('GRP',ten) | ('CASE',B,C,D)"""
    out, log = [], []
    try:
        bps = tcfix.load(path).bpsheets
    except Exception as e:
        log.append('  LỖI đọc: %s' % e)
        return out, log
    fnorm = norm(base)
    for bp in bps:
        tc = tcfix.load(path, bp)
        data = scan(tc)
        them = {c: d for c, d in data.items() if d['kind'] == 'THEM'}
        sua = {c: d for c, d in data.items() if d['kind'] == 'SUA'}
        ins = {}
        for cs, ds in sua.items():
            if not ds['vrow']:
                continue
            es = entity(cs)
            cand = [c for c in them if entity(c) == es] or \
                   [c for c in them if entity(c) and (entity(c) in es or es in entity(c))]
            if not cand and len(them) == 1:
                cand = list(them)
            if not cand:
                log.append('  · %-38s KHÔNG ghép được CN Thêm -> bỏ qua' % cs[:38])
                continue
            ct = max(cand, key=lambda c: len(them[c]['grps']))
            have = {key_of(g) for _r, g in ds['grps']}
            btn = find_btn(tc, ds['grps'])
            # điểm chèn: trước nhóm 'đuôi' đầu tiên; không có -> sau nhóm cuối của khối Validate
            tails = [r for r, g in ds['grps'] if is_tail(g)]
            anchor = min(tails) if tails else None
            items = []
            nadd = ncase = nskip = 0
            for rn_g, gname in them[ct]['grps']:
                if not is_input(gname) or key_of(gname) in have:
                    continue
                if any(a in fnorm and b in norm(gname) for a, b in EXCLUDE):
                    log.append('  · %-30s LOẠI TRỪ nhóm %s' % (cs[:30], gname[:34]))
                    continue
                cs_list = []
                for B, C, D in them[ct]['cases'][rn_g]:
                    if skip_case(C, D):
                        nskip += 1
                        log.append('    - BỎ case (chỉ đúng ở màn Thêm): %s | %s'
                                   % (gname[:24], B.split('\n')[0][:44]))
                        continue
                    if is_default_case(B):
                        nC, nD = DEFAULT_BUOC, DEFAULT_KQ
                    else:
                        nC, nD = to_edit(C, btn), to_edit_kq(to_edit(D, btn))
                    cs_list.append(('CASE', B, nC, nD))
                if not cs_list:
                    continue
                items.append(('GRP', gname))
                items.extend(cs_list)
                nadd += 1
                ncase += len(cs_list)
            if items:
                key = anchor if anchor else ('AFTER', ds['vend'])
                ins.setdefault(key, []).extend(items)
                log.append('  · %-38s <- %-30s +%d nhóm / +%d case (nút "%s")%s'
                           % (cs[:38], ct[:30], nadd, ncase, btn,
                              '  [bỏ %d case]' % nskip if nskip else ''))
                if only_detail:
                    for it in items:
                        if it[0] == 'GRP':
                            log.append('      ── %s' % it[1])
                        else:
                            log.append('         B= %s' % it[1].split('\n')[0][:70])
                            log.append('         C= %s' % it[2].replace('\n', ' ⏎ ')[:110])
                            log.append('         D= %s' % it[3].replace('\n', ' ⏎ ')[:110])
        if ins:
            out.append((bp, ins))
    return out, log


def apply_ins(path, bp, ins, nsheet):
    tc = tcfix.load(path, bp)
    after = {v[1]: k for k, v in
             ((k, k) for k in ins if isinstance(k, tuple))}      # {rn: key}
    after = {k[1]: k for k in ins if isinstance(k, tuple)}
    pl = tcfix.Plan(tc)
    for rn in tc.order:
        if rn < 12:
            continue
        if rn in ins:                                            # chèn TRƯỚC hàng này
            emit(pl, ins[rn])
        pl.keep(rn)
        if rn in after:                                          # chèn SAU hàng này
            emit(pl, ins[after[rn]])
    tc.rebuild(pl).save(quiet=True, sync=nsheet == 1)


def emit(pl, items):
    for it in items:
        if it[0] == 'GRP':
            pl.add_sub2(it[1])
        else:
            pl.case(it[1], it[2], it[3])


def main(argv):
    apply_ = '--apply' in argv
    detail = '--detail' in argv
    role = argv[argv.index('--role') + 1] if '--role' in argv else 'Admin'
    only = argv[argv.index('--only') + 1] if '--only' in argv else None
    CFG = roles.get(role)

    tot_f = tot_g = tot_c = 0
    for p in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
        base = os.path.basename(p)
        if base in CFG['skip']:
            continue
        nm = base.replace(CFG['strip'], '').replace('.xlsx', '')
        if only and only.lower() not in nm.lower():
            continue
        if os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % base)):
            print('  BỎ QUA (đang mở):', base)
            continue
        sheets, log = plan_file(p, base, detail)
        if not sheets and not log:
            continue
        print('#### %s' % nm)
        for line in log:
            print(line)
        ng = sum(1 for _bp, ins in sheets for v in ins.values() for it in v if it[0] == 'GRP')
        nc = sum(1 for _bp, ins in sheets for v in ins.values() for it in v if it[0] == 'CASE')
        if not ng:
            continue
        tot_f += 1
        tot_g += ng
        tot_c += nc
        if apply_:
            nsheet = len(tcfix.load(p).bpsheets)
            for bp, ins in sheets:
                apply_ins(p, bp, ins, nsheet)
            print('   -> ĐÃ GHI %s (+%d nhóm / +%d case)' % (base, ng, nc))

    print('\n=== %s: %d file · +%d nhóm · +%d case ===%s'
          % (role, tot_f, tot_g, tot_c, '' if apply_ else '   (xem trước, chưa ghi)'))
    if apply_:
        print('NHỚ chạy lại: python3 formula_layer.py   (rebuild làm mất công thức cột A/R)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))

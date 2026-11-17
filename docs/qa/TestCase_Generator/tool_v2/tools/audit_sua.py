# -*- coding: utf-8 -*-
"""Rà CN CHỈNH SỬA theo §5.6 của `prompts/PROMPT-gen-testcase-v3.md` (chỉ đọc, không ghi).

§5.6 (chốt 2026-09-07): CN Sửa LUÔN lặp full khối Validate của CN Thêm; bỏ hẳn hướng prefill.
Bộ này kiểm 6 điểm mà audit_* cũ không kiểm:

  [1] THIẾU NHÓM   nhóm control nhập liệu của CN Thêm chưa có ở CN Sửa
  [2] NẠP SẴN      còn nhóm `Nạp sẵn dữ liệu` / `Prefill …` (§5.6 bỏ hẳn)
  [3] UNIQUE       có case "đã tồn tại" nhưng thiếu luật "giữ nguyên giá trị cũ → không báo trùng
                   chính nó" (điểm 3 của §5.6)
  [4] ATTT         khối ATTT ít nhóm hơn CN Thêm, hoặc còn ghi "Insert" thay vì "update" (điểm 5)
  [5] CHỨC NĂNG    `Chức năng Cập nhật` < 7 case hoặc thiếu `Chức năng Hủy bỏ`
  [6] NÚT TẠO      CN Sửa còn nhóm `Button Thêm mới / Tạo mới` (điểm 1 — phải bỏ)
  [7] MẶC ĐỊNH     case "giá trị mặc định" ở CN Sửa còn ghi Ô RỖNG — phải là dữ liệu ĐANG LƯU
                   (thêm 2026-09-08; luật ở `qalib.mac_dinh_sai_o_cn_sua()`)

    python3 audit_sua.py [Admin|NCC|Teacher] [tên file]
"""
import os
import sys
import glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix
import roles
import qalib
import patch_giaodien
from patch_sua_validate import norm, entity, key_of, is_input, cn_kind

ROLE = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
ONLY = sys.argv[2] if len(sys.argv) > 2 else None
CFG = roles.get(ROLE)

UNIQ_HIT = ('da ton tai', 'bi trung', 'trung ten', 'trung ma')
UNIQ_OK = ('giu nguyen gia tri', 'trung chinh no', 'chinh ban ghi dang sua', 'khong bao trung',
           'giu nguyen ma', 'giu nguyen ten', 'khong doi gia tri')


def scan(tc):
    """-> {cn: {kind, val:[(rn,name,[case])], attt:[(rn,name,[case])], fn:{name:[case]},
              has_prefill:[], has_addbtn:[]}}"""
    data, cn, kind, blk, inval, cur, bucket = {}, None, None, None, False, None, None
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '')
        head = b.split('\n')[0].strip()
        if lv == 'case':
            if cur is not None and cn in data:
                cur.append((head, tc.c(rn, 'C') or '', tc.c(rn, 'D') or ''))
            continue
        if lv == 'cn':
            cn, kind = head, cn_kind(head)
            blk, inval, cur, bucket = None, False, None, None
            if kind:
                data[cn] = {'kind': kind, 'val': [], 'attt': [], 'fn': {},
                            'has_prefill': [], 'has_addbtn': []}
            continue
        if not kind:
            continue
        n = norm(head)
        if lv == 'grp':
            inval = False
            bucket = ('attt' if 'an toan thong tin' in n else
                      'fn' if n.startswith('chuc nang') else
                      'gd' if 'giao dien' in n else None)
            cur = None
            continue
        # sub / sub2
        if bucket == 'gd':
            if 'validate' in n:
                inval, cur = True, None
                continue
            if lv == 'sub':
                inval = False
            if inval:
                if n.startswith(('nap san', 'prefill')):
                    data[cn]['has_prefill'].append(head)
                if n.startswith('button') and any(k in n for k in ('them moi', 'tao moi', 'them ', 'tao ')):
                    data[cn]['has_addbtn'].append(head)
                cur = []
                data[cn]['val'].append((rn, head, cur))
            else:
                cur = None
        elif bucket == 'attt':
            cur = []
            data[cn]['attt'].append((rn, head, cur))
        elif bucket == 'fn':
            cur = []
            data[cn]['fn'][head] = cur
        else:
            cur = None
    return data


tot = {k: 0 for k in ('miss', 'prefill', 'uniq', 'attt', 'fn', 'addbtn', 'macdinh', 'macdinh_mo', 'macdinh_chuan')}
for p in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
    base = os.path.basename(p)
    if base in CFG['skip']:
        continue
    nm = base.replace(CFG['strip'], '').replace('.xlsx', '')
    if ONLY and ONLY.lower() not in nm.lower():
        continue
    try:
        bps = tcfix.load(p).bpsheets
    except Exception as e:
        print('#### %-24s LỖI đọc: %s' % (nm, e))
        continue
    out = []
    _GIU_NUT = qalib.doc_giu_nut_tao(p)
    _SPEC = patch_giaodien.ho_so_man(p)      # phép [1] nhường hồ sơ màn — xem ghi chú ở đó
    for bp in bps:
        data = scan(tcfix.load(p, bp))
        them = {c: d for c, d in data.items() if d['kind'] == 'THEM'}
        for cs, ds in ((c, d) for c, d in data.items() if d['kind'] == 'SUA'):
            for g in ds['has_prefill']:
                out.append(('NẠP SẴN', cs, g)); tot['prefill'] += 1
            for g in ds['has_addbtn']:
                # Miễn trừ khai ở hồ sơ màn (luật dùng CHUNG với `fix_cn_sua`) — xem
                # `qalib.doc_giu_nut_tao`.
                if '%s|%s' % (norm(cs), norm(g)) in _GIU_NUT:
                    continue
                out.append(('NÚT TẠO', cs, g)); tot['addbtn'] += 1
            # [5] khối Chức năng
            capn = [v for k, v in ds['fn'].items() if 'cap nhat' in norm(k) or norm(k).startswith('chuc nang sua')]
            if capn and len(max(capn, key=len)) < 7:
                out.append(('CHỨC NĂNG', cs, 'Chức năng Cập nhật chỉ %d/7 case' % len(max(capn, key=len))))
                tot['fn'] += 1
            if not any('huy' in norm(k) for k in ds['fn']):
                out.append(('CHỨC NĂNG', cs, 'thiếu nhóm Chức năng Hủy bỏ')); tot['fn'] += 1
            # [7] "giá trị mặc định" ở CN Sửa: phải là dữ liệu đang lưu, không phải ô rỗng.
            # §5.6 bỏ nhóm `Nạp sẵn dữ liệu` vì "nội dung đã nằm trong case giá trị mặc định" —
            # nhưng `patch_quota` bơm nhóm ở CN Sửa bằng chữ của CN Thêm nên nghĩa nạp sẵn mất hẳn.
            for _rn, g, cases in ds['val']:
                for md, _b, kq in cases:
                    if not qalib.la_case_mac_dinh(md):
                        continue
                    if qalib.mac_dinh_sai_o_cn_sua(cs, kq):
                        out.append(('MẶC ĐỊNH', cs, '%s — "%s"' % (g[:30], (kq or '').split(chr(10))[0][:40])))
                        tot['macdinh'] += 1
                    elif qalib.mac_dinh_mo_ho_o_cn_sua(cs, kq):
                        out.append(('MẶC ĐỊNH?', cs, '%s — mơ hồ: "%s"' % (g[:26], (kq or '').split(chr(10))[0][:36])))
                        tot['macdinh_mo'] += 1
                    # ── Ô ĐẾM MỚI (chỉ thị 2026-09-14): đòi ĐÚNG bản chữ chuẩn, không chỉ
                    #    đòi "đúng nghĩa". Hai phép trên cố ý LỎNG (`DUNG_KW` nhận mọi cách
                    #    diễn đạt) nên 13 case văn dài của A6 và 20 case mang biến thể cũ của
                    #    mẫu đều LỌT — bộ rà in 0 trên đúng bộ file người đặt việc vừa chê.
                    _lc = qalib.mac_dinh_lech_chuan_sua(cs, md, kq)
                    if _lc:
                        out.append(('MẶC ĐỊNH≠', cs, '%s — %s: "%s"'
                                    % (g[:24], _lc, (kq or '').split(chr(10))[0][:32])))
                        tot['macdinh_chuan'] += 1
            # [3] unique
            for _rn, g, cases in ds['val']:
                j = norm(' ¦ '.join(a + ' ' + b + ' ' + c for a, b, c in cases))
                if any(k in j for k in UNIQ_HIT) and not any(k in j for k in UNIQ_OK):
                    out.append(('UNIQUE', cs, '%s — thiếu case "giữ nguyên giá trị cũ"' % g[:38]))
                    tot['uniq'] += 1
            # [4] ATTT: "Insert" ở CN Sửa
            for _rn, g, cases in ds['attt']:
                j = ' ¦ '.join(a + ' ' + b for a, b, _c in cases)
                if 'insert' in j.lower() and 'update' not in j.lower():
                    out.append(('ATTT', cs, '%s — còn "Insert", phải là "update"' % g[:38]))
                    tot['attt'] += 1
            # ghép cặp để đo [1] và số nhóm ATTT
            es = entity(cs)
            cand = [c for c in them if entity(c) == es] or \
                   [c for c in them if entity(c) and (entity(c) in es or es in entity(c))]
            if not cand and len(them) == 1:
                cand = list(them)
            if not cand:
                continue
            ct = max(cand, key=lambda c: len(them[c]['val']))
            have = {key_of(g) for _r, g, _c in ds['val']}
            miss = [(g, len(cs2)) for _r, g, cs2 in them[ct]['val'] if is_input(g) and key_of(g) not in have]
            # ── HỒ SƠ MÀN THẮNG luật suy diễn (vá 2026-09-14) ────────────────────────────
            # §5.6 *"CN Sửa LUÔN lặp full khối Validate của CN Thêm"* đúng với đa số màn nhưng
            # KHÔNG phải mọi màn — biểu mẫu Sửa của ứng dụng có thể hẹp hơn biểu mẫu Thêm.
            # Khai `cn[].controls` cho CN Sửa ở hồ sơ màn là BẰNG CHỨNG đã soi màn thật, phải
            # thắng phép suy từ CN Thêm; nhóm nào hồ sơ KHÔNG khai thì không đòi.
            # Đo trên `ChuyenVien/TangDuLieuDanhMuc`: `form_them.nhan_o` 7 ô (3 ô Ngày bắt đầu /
            # Ngày kết thúc / Năm học chỉ hiện với vài bộ danh mục) vs `form_sua.nhan_o` 4 ô
            # ⇒ bản cũ báo *thiếu 3 nhóm (~28 case)*; bơm vào là viết case cho Ô KHÔNG TỒN TẠI.
            # Hồ sơ KHÔNG khai CN đó (`None`) ⇒ giữ nguyên luật cũ, phép này im lặng như trước.
            _khai = qalib.controls_khai_cua_cn(_SPEC, cs)
            if _khai is not None:
                _ok = {key_of(x) for x in _khai}
                _bo = [g for g, _n in miss if key_of(g) not in _ok]
                miss = [(g, n_) for g, n_ in miss if key_of(g) in _ok]
                if _bo:
                    print('   [bỏ qua] %-38s hồ sơ màn KHÔNG khai: %s'
                          % (cs[:38], ', '.join(x[:26] for x in _bo[:3])))
            if miss:
                out.append(('THIẾU NHÓM', cs, '%d nhóm (~%d case) <- %s: %s'
                            % (len(miss), sum(n for _g, n in miss), ct[:20],
                               ', '.join(g[:20] for g, _n in miss[:3]))))
                tot['miss'] += len(miss)
            ha = {key_of(g) for _r, g, _c in ds['attt']}
            ma = [g for _r, g, _c in them[ct]['attt'] if is_input(g) and key_of(g) not in ha]
            if ma:
                out.append(('ATTT', cs, 'thiếu %d nhóm: %s' % (len(ma), ', '.join(x[:22] for x in ma[:3]))))
                tot['attt'] += len(ma)
    if out:
        print('#### %s' % nm)
        for tag, cs, d in out:
            print('   [%-10s] %-34s %s' % (tag, cs[:34], d))

print('\n=== %s — §5.6: thiếu nhóm %d · nạp sẵn %d · unique %d · ATTT %d · chức năng %d · nút tạo %d'
      ' · mặc định sai %d (+%d mơ hồ) · mặc định LỆCH BẢN CHỮ %d ==='
      % (ROLE, tot['miss'], tot['prefill'], tot['uniq'], tot['attt'], tot['fn'], tot['addbtn'],
         tot['macdinh'], tot['macdinh_mo'], tot['macdinh_chuan']))

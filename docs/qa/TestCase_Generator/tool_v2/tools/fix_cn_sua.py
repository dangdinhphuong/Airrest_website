# -*- coding: utf-8 -*-
"""VÁ 3 điểm §5.6 mà `audit_sua.py` chỉ PHÁT HIỆN chứ không có script nào sửa.

`audit_sua` rà 7 điểm; 4 điểm đã có fixer (`patch_sua_validate` [1] · `go_napsan` [2] ·
`complete_func`/`patch_cn_trangthai` [5] · `fix_macdinh_sua` [7]). Ba điểm còn lại phải sửa TAY —
đo 2026-09-08 trên bản `QuanTri/TrinhDoDaoTao` do chính tool sinh: `unique 1 · ATTT 3`.

  [3] UNIQUE   nhóm có case "đã tồn tại" mà THIẾU luật "giữ nguyên giá trị cũ -> không báo trùng
               chính nó"  ->  CHÈN 1 case (§5.6 điểm 3)
  [4] ATTT     case injection ở CN Sửa còn ghi `Insert`, phải là `update` (§5.6 điểm 5)
               ->  SỬA TẠI CHỖ cột B/C/D
  [6] NÚT TẠO  CN Sửa còn nhóm `Button Thêm mới / Tạo mới`  ->  BỎ nhóm đó (§5.6 điểm 1)

Phép nhận diện DÙNG CHUNG với `audit_sua` (`UNIQ_HIT`/`UNIQ_OK`, `is_input`, `cn_kind`) nên rà và
vá không bao giờ lệch luật.

    python3 fix_cn_sua.py QuanTri                 # XEM TRƯỚC (mặc định, không ghi)
    python3 fix_cn_sua.py QuanTri TrinhDoDaoTao   # lọc theo tên màn
    python3 fix_cn_sua.py QuanTri --apply         # ghi
    python3 fix_cn_sua.py QuanTri --giu-nut-tao   # KHÔNG bỏ nhóm `Button Thêm mới`

⚠️ `rebuild()` ghi cột A thành chữ chay -> BẮT BUỘC chạy `formula_layer.py` ngay sau `--apply`.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib          # noqa: E402
import tcfix          # noqa: E402
from audit_sua import UNIQ_HIT, UNIQ_OK          # noqa: E402  — dùng CHUNG luật với bộ rà
from patch_sua_validate import norm, is_input    # noqa: E402

APPLY = '--apply' in sys.argv
GIU_NUT = '--giu-nut-tao' in sys.argv
_ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
ROLE = _ARGS[0] if _ARGS else 'Admin'
ONLY = _ARGS[1] if len(_ARGS) > 1 else None

NUT_TAO = ('button them moi', 'button tao moi', 'button them', 'button tao')


def la_cn_sua(cn):
    n = norm(cn)
    return n.startswith(('chinh sua', 'sua ', 'cap nhat')) or 'chinh sua' in n


def nhan_nut_cap_nhat(groups):
    """Nhãn nút lưu THẬT của CN Sửa, lấy từ nhóm `Button …` trong khối Validate."""
    for g in groups:
        n = norm(g)
        if n.startswith('button') and not any(k in n for k in NUT_TAO + ('button huy',)):
            return re.sub(r'(?i)^button\s*', '', g).strip() or 'Cập nhật'
    return 'Cập nhật'


# Dùng CHUNG `qalib.field_of()` — đừng nhân bản. Bản riêng trước đây KHÔNG bỏ phần chú thích
# trong ngoặc ở cuối tên nhóm, nên nhóm nào có chú thích trong ngoặc là nó sinh tiêu đề
# *"giữ nguyên giá trị cũ của <tên> (chú thích)"* — lọt vào cả tiêu đề lẫn cột Các bước. `qalib.field_of()` đã có nhánh bỏ
# ngoặc + nhánh cứu khi phần dư không mở đầu bằng chữ/số (sự cố `/ lưới` 2026-09-08).
field_of = qalib.field_of


def case_giu_nguyen(field, nut):
    return ('Kiểm tra giữ nguyên giá trị cũ của %s' % field,
            '1. Mở biểu mẫu chỉnh sửa một bản ghi đang có\n'
            '2. Giữ nguyên %s, không sửa gì ở ô này\n'
            '3. Sửa một trường khác sang giá trị hợp lệ\n'
            '4. Click %s' % (field, nut),
            'Cập nhật thành công; hệ thống KHÔNG báo trùng với chính bản ghi đang sửa.')


def set_cell(tc, rn, col, txt):
    body = tc.rows[rn]['body']
    cm = re.search(r'<c r="%s%d"[^>]*?(?:/>|>.*?</c>)' % (col, rn), body, re.S)
    if not cm:
        return
    st = re.search(r's="(\d+)"', cm.group(0))
    tc.rows[rn]['body'] = body.replace(cm.group(0),
        '<c r="%s%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
        % (col, rn, st.group(1) if st else '0', tcfix.esc(txt)))


def quet(tc):
    """[(cn, khối, nhóm, dòng nhóm, [dòng case])] — chỉ các CN Sửa."""
    out, cn, grp, cur = [], None, None, None
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            cn = b; grp = None; cur = None
        elif lv == 'grp':
            grp = b; cur = None
        elif lv in ('sub', 'sub2'):
            cur = [cn, grp, b, rn, []]
            out.append(cur)
        elif lv == 'case' and cur:
            cur[4].append(rn)
    return [x for x in out if la_cn_sua(x[0] or '')]


tot = {'uniq': 0, 'attt': 0, 'nut': 0}
n_file = 0
broken = []
for sh in qalib.iter_role_files(ROLE, only=ONLY, skip_locked=True, broken=broken):
    tc = sh.tc
    add, edits, drop = {}, [], []
    blocks = quet(tc)
    val_groups = [b[2] for b in blocks if (b[1] or '').startswith('Giao diện')]
    nut = nhan_nut_cap_nhat(val_groups)
    head = False

    def log(tag, msg):
        global head
        if not head:
            print('\n#### %s%s' % (sh.name, ' [%s]' % sh.bp if sh.multi else ''))
            head = True
        print('   [%-9s] %s' % (tag, msg))

    for cn, grp, g, grn, crows in blocks:
        titles = [(tc.c(r, 'B') or '') + ' ' + (tc.c(r, 'C') or '') + ' ' + (tc.c(r, 'D') or '')
                  for r in crows]
        j = norm(' ¦ '.join(titles))
        # [3] UNIQUE — chỉ nhóm ô NHẬP trong khối Validate
        if (grp or '').startswith('Giao diện') and is_input(g) \
                and any(k in j for k in UNIQ_HIT) and not any(k in j for k in UNIQ_OK):
            f = field_of(g)
            add.setdefault(crows[-1] if crows else grn, []).append(case_giu_nguyen(f, nut))
            tot['uniq'] += 1
            log('UNIQUE', '%-32s + case "giữ nguyên giá trị cũ của %s"' % (g[:32], f[:24]))
        # [4] ATTT Insert -> update
        if (grp or '').startswith('An toàn'):
            jj = ' '.join((tc.c(r, 'B') or '') + ' ' + (tc.c(r, 'C') or '') for r in crows)
            if 'insert' in jj.lower() and 'update' not in jj.lower():
                for r in crows:
                    for col in ('B', 'C', 'D'):
                        v = tc.c(r, col) or ''
                        if 'Insert' in v:
                            edits.append((r, col, v.replace('Insert', 'update')))
                tot['attt'] += 1
                log('ATTT', '%-32s Insert -> update (%d case)' % (g[:32], len(crows)))
        # [6] NÚT TẠO — miễn trừ khai ở hồ sơ màn (luật dùng CHUNG với `audit_sua`):
        # `qalib.doc_giu_nut_tao`. Nút `+ Thêm biểu đồ` / `+ Tạo bộ dữ liệu mới` của wizard
        # Chỉnh sửa báo cáo là control THẬT của chính biểu mẫu Sửa, không phải nút mở biểu mẫu
        # Thêm mới — bỏ nó là bỏ một control có thật khỏi bộ case.
        _mien = '%s|%s' % (norm(cn or ''), norm(g)) in qalib.doc_giu_nut_tao(tc.path)
        if not GIU_NUT and not _mien \
                and (grp or '').startswith('Giao diện') and norm(g).startswith(NUT_TAO):
            drop.extend([grn] + crows)
            tot['nut'] += 1
            log('NÚT TẠO', '%-32s BỎ nhóm (%d case) — §5.6 điểm 1' % (g[:32], len(crows)))

    if not (add or edits or drop):
        continue
    n_file += 1
    if APPLY:
        for rn, col, txt in edits:
            set_cell(tc, rn, col, txt)
        pl = tcfix.Plan(tc)
        for rn in tc.order:
            if rn < 12 or rn in drop:
                continue
            pl.keep(rn)
            for c in add.get(rn, []):
                pl.case(*c)
        tc.rebuild(pl).save(quiet=True, sync=not sh.multi)

print('\n=== %s: %d file · UNIQUE +%d case · ATTT %d nhóm Insert->update · NÚT TẠO bỏ %d nhóm ===%s'
      % (ROLE, n_file, tot['uniq'], tot['attt'], tot['nut'],
         '' if APPLY else '   (XEM TRƯỚC — thêm --apply để ghi)'))
if APPLY and n_file:
    print('⚠️  BẮT BUỘC chạy tiếp: python3 formula_layer.py <các file vừa sửa>')
if broken:
    print('!!! %d file KHÔNG đọc được:' % len(broken))
    for b, w in broken:
        print('    - %-52s %s' % (b[:52], w))

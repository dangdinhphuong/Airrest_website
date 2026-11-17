# -*- coding: utf-8 -*-
"""Gắn cờ `[CẦN VERIFY]` vào cột T cho case còn CHỖ GIỮ phải hỏi dev (tên bảng · cột · ngưỡng).

§11.4 của prompt v3: *"thà gắn cờ hơn bịa"*. Case còn `<bảng dữ liệu của màn>` / `<cột …>` mà
cột T **không** mang cờ là nợ ẩn — người đọc tưởng câu truy vấn đã đúng.

Từ 2026-09-09 `tcfix.Plan.case()` gắn cờ **tự động** khi bơm, nên bộ case sinh mới không còn lỗi
này. Script này lo bộ case **đã sinh trước đó** (đo được 4 ca ở `QuanTri`).

Chỉ ghi cột T, KHÔNG đụng B/C/D, không thêm/xoá case. Rà bằng `audit_noi_dung.py` phép ④.

    python3 fix_can_verify.py <role> [tên màn]            # XEM TRƯỚC
    python3 fix_can_verify.py <role> [tên màn] --apply    # ghi
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import roles
import tcfix

# Dùng CHUNG luật nhận diện với `audit_noi_dung` (chỗ giữ cần hỏi dev) và `tcfix.Plan.case`
import audit_noi_dung as _nd

CO = tcfix.Plan.CO_VERIFY


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 fix_can_verify.py <%s> [tên màn] [--apply]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv

    tot = totf = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=True):
        tc, nm = sh.tc, sh.name
        sua, blk = [], None
        for rn in tc.order:
            if rn < 12:
                continue
            lv = tc.lvl(rn)
            if lv == 'grp':
                blk = qalib.norm(tc.c(rn, 'B') or '')
            elif lv == 'cn':
                blk = None
            elif lv == 'case':
                if 'an toan thong tin' in (blk or ''):
                    continue                      # payload §7.2 verbatim có chỗ giữ — miễn trừ
                c, d, t = tc.c(rn, 'C') or '', tc.c(rn, 'D') or '', tc.c(rn, 'T') or ''
                if _nd.cho_giu_that(c + ' ' + d) and not any(x in t for x in _nd.CO_HOP_LE):
                    sua.append(rn)
        if not sua:
            continue
        tot += len(sua); totf += 1
        print('   %-24s %d case  (dòng %s)' % (nm[:24], len(sua), str(sua[:6])[1:-1]))
        if not apply_:
            continue
        for rn in sua:
            _ghi_t(tc, rn, CO)          # `TC.retext()` chỉ ghi B/C/D — cột T ghi riêng
        pl = tcfix.Plan(tc)
        pl.keep_range(12, max(tc.order))
        tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)

    print('=== %d file · %d case gắn cờ [CẦN VERIFY]%s ==='
          % (totf, tot, '' if apply_ else ' (XEM TRƯỚC)'))
    if tot and not apply_:
        print('Ghi thật: python3 fix_can_verify.py %s%s --apply'
              % (role, ' ' + only if only else ''))


def _ghi_t(tc, rn, txt):
    """`TC.retext()` chỉ ghi B/C/D — cột T phải ghi trực tiếp, giữ nguyên style của ô."""
    import re
    b = tc.rows[rn]['body']
    cm = re.search(r'<c r="T%d"[^>]*?(?:/>|>.*?</c>)' % rn, b, re.S)
    if not cm:
        return
    st = re.search(r's="(\d+)"', cm.group(0))
    st = st.group(1) if st else '0'
    tc.rows[rn]['body'] = b.replace(
        cm.group(0),
        '<c r="T%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
        % (rn, st, tcfix.esc(txt)))


if __name__ == '__main__':
    main()

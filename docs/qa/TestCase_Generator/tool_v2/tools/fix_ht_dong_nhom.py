# -*- coding: utf-8 -*-
"""Gỡ CHIỀU CAO BỊ ÉP ở dòng tiêu đề của bộ case đã sinh (chỉ thị 2026-09-14).

Chỉ thị: *"các dòng nhóm đều bị [phình], để tự động như mẫu danhmuctudienchung"*.

Vì sao có chỗ phình: `tcfix.Plan._hdr()` từng ép `ht`/`customHeight` cho mọi dòng tiêu đề
nhiều dòng chữ — 39.55pt (3 dòng) · 52.2pt (4 dòng) · nội suy 13.05pt/dòng cho phần còn lại,
có dòng lên tới 91.35pt. Đo lại trên mẫu `DanhMucTuDienDungChung.xlsx` (2026-09-14): 9 dòng CN
của mẫu cũng mang 3-4 dòng chữ nhưng để `ht = 15.75` hoặc không ghi, tức **cao đúng 1 dòng** —
ô `B:E` gộp nên Excel/LibreOffice không tự giãn, phần bước `1./2./3.` cố ý bị che. Bộ case
`qa-doc` làm trước khi có `HT_HDR` cũng 0 dòng bị ép.

Gốc đã vá ở `tcfix`: `Plan._hdr()` không ghi `ht` nữa, và `rebuild()` gỡ `ht` ép của dòng tiêu
đề ở mọi lần ghi. Script này lo bộ case **sẽ không có patcher nào chạy qua nữa**.

⚠️ Chỉ đụng dòng TIÊU ĐỀ (cn/grp/sub/sub2). Dòng CASE cao 109.5pt là ĐÚNG mẫu (ô cột D liệt
kê thành phần màn) — gỡ ở đó là làm hỏng chỗ khác.

    python3 fix_ht_dong_nhom.py <role> [tên màn]            # XEM TRƯỚC
    python3 fix_ht_dong_nhom.py <role> [tên màn] --apply    # ghi
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import roles
import tcfix


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 fix_ht_dong_nhom.py <%s> [tên màn] [--apply]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv

    tot = totf = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=apply_):
        tc, nm = sh.tc, sh.name + ('/' + sh.bp if sh.multi else '')
        mdinh = tc.ht_mac_dinh()
        ep = [(rn, tc.rows[rn]['attrs']) for rn in tc.order
              if rn >= 12 and tc.lvl(rn) != 'case' and tc._ht_ep(tc.rows[rn]['attrs'])]
        if not ep:
            continue
        tot += len(ep); totf += 1
        print('#### %s   (mặc định %.2fpt)' % (nm, mdinh))
        for rn, attrs in ep:
            print('   r%-5d %-7spt  %s'
                  % (rn, re.search(r'ht="([\d.]+)"', attrs).group(1),
                     (tc.c(rn, 'B') or '').split('\n')[0][:56]))
        if not apply_:
            continue
        qalib.backup(tc.path, tag='truoc_ht_dong_nhom')
        # `rebuild()` tự gỡ `ht` ép của dòng tiêu đề — ở đây chỉ cần giữ nguyên mọi dòng.
        pl = tcfix.Plan(tc)
        pl.keep_range(12, max(tc.order))
        tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)

    print('\n=== %d file · %d dòng tiêu đề được gỡ ép cao%s ==='
          % (totf, tot, '' if apply_ else '   (XEM TRƯỚC, chưa ghi)'))
    if tot and not apply_:
        print('Ghi thật: python3 fix_ht_dong_nhom.py %s%s --apply'
              % (role, ' ' + only if only else ''))


if __name__ == '__main__':
    main()

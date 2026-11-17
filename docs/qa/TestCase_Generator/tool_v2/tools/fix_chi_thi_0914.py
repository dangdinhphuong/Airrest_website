# -*- coding: utf-8 -*-
"""HAI chỉ thị người đặt việc 2026-09-14 (ảnh case `Kiểm tra giá trị mặc định Tên báo cáo`).

    ① *"Kết quả mong đợi chưa đúng, phải là: Mặc định là dữ liệu từ DB"*
       -> cột D của MỌI case `giá trị mặc định` trong CN Sửa về đúng bản chữ chuẩn.
    ② *"không được lẫn tiếng Anh hoặc mã gì đó, ghi bằng tiếng Việt dễ hiểu"*
       -> dịch cụm tiếng Anh / đường dẫn mã ở **cả cột C lẫn cột D**.

Luật dùng chung ở `qalib` (`MAC_DINH_KQ_SUA` · `mac_dinh_lech_chuan_sua` · `lan_tieng_anh` ·
`dich_tieng_anh`) — KHÔNG chép luật vào đây, để bộ rà `audit_sua` / `audit_extra` và bộ sửa này
không bao giờ đòi hai thứ khác nhau.

⚠️ Chữ cũ KHÔNG bị vứt: cột D dài của A6 được dồn sang cột T sau nhãn `[CHI TIẾT]` (§8.3) trước
   khi ghi bản chữ chuẩn. Ghi đè thẳng là XOÁ BẰNG CHỨNG — đúng lỗ đã trả giá ở lượt 2 ngày
   14/09.
⚠️ Chỉ đụng phần NGOÀI ngoặc kép và ngoài payload ATTT: bản chữ verbatim của màn (§7.3) và
   chuỗi người test phải gõ từng ký tự (§7.2) giữ nguyên.

    python3 fix_chi_thi_0914.py <Role> [Tên màn]            # XEM TRƯỚC
    python3 fix_chi_thi_0914.py <Role> [Tên màn] --apply    # ghi
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import roles
import tcfix

NHAN_CHI_TIET = '[CHI TIẾT]'


def gop_ghi_chu(cu, manh):
    """Dồn cột D cũ sang cột T — KHÔNG ghi đè cờ đang có, không nối chồng khi chạy lại."""
    cu = (cu or '').strip()
    them = '%s %s' % (NHAN_CHI_TIET, manh.strip())
    if NHAN_CHI_TIET in cu:
        return None
    return (cu + ' ' + them).strip() if cu else them


def quet(tc):
    """-> [(dòng, cột, việc, giá trị mới, ghi chú dồn sang T)]."""
    ra = []
    cn = None
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            cn = b
            continue
        if lv != 'case':
            continue
        # ── ① bản chữ chuẩn cho case `giá trị mặc định` ở CN Sửa ─────────────────────────
        d = tc.c(rn, 'D') or ''
        ly_do = qalib.mac_dinh_lech_chuan_sua(cn or '', b, d) if cn else None
        if ly_do:
            # Chỉ dồn sang T khi chữ cũ là VĂN DÀI mang dữ kiện thật; biến thể cũ của mẫu
            # (`Mặc định hiển thị dữ liệu từ DB`) không có gì để giữ.
            manh = d.strip() if ly_do == 'không phải bản chữ chuẩn' else None
            ra.append((rn, 'D', '① mặc định CN Sửa (%s)' % ly_do, qalib.MAC_DINH_KQ_SUA, manh))
            d = qalib.MAC_DINH_KQ_SUA
        # ── ③ cột D LAN MAN: rút gọn tay theo bảng `qalib.KQ_LAN_MAN` ───────────────────
        #    So khớp TUYỆT ĐỐI cả ô + đúng tiêu đề case. Chữ cắt đi dồn sang cột T.
        for _td, _cu, _moi, _sangT in qalib.KQ_LAN_MAN:
            if b == _td and (d or '').strip() == _cu:
                ra.append((rn, 'D', '③ rút gọn lan man (chỉ thị 14/09)', _moi, _sangT))
                d = _moi
                break
        # ── ② dịch tiếng Anh / đường dẫn mã ở CẢ cột C lẫn cột D ─────────────────────────
        for col, val in (('C', tc.c(rn, 'C') or ''), ('D', d)):
            moi, da = qalib.dich_tieng_anh(val)
            if da:
                ra.append((rn, col, '② dịch: %s' % ', '.join(da)[:44], moi, None))
    return ra


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 fix_chi_thi_0914.py <%s> [tên màn] [--apply]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv

    totf = tot1 = tot2 = tot3 = tot_t = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=apply_):
        tc = sh.tc
        viec = quet(tc)
        if not viec:
            continue
        totf += 1
        print('#### %s  (%d ô)' % (sh.name + ('/' + sh.bp if sh.multi else ''), len(viec)))
        for rn, col, mo_ta, moi, manh in viec[:8]:
            print('   r%-5d %s  %s' % (rn, col, mo_ta))
            print('        -> %s' % moi.replace('\n', ' ⏎ ')[:104])
        if len(viec) > 8:
            print('   … còn %d ô nữa' % (len(viec) - 8))
        for rn, col, mo_ta, moi, manh in viec:
            if mo_ta.startswith('①'):
                tot1 += 1
            elif mo_ta.startswith('③'):
                tot3 += 1
            else:
                tot2 += 1
        if not apply_:
            continue
        for rn, col, mo_ta, moi, manh in viec:
            gc = gop_ghi_chu(tc.c(rn, 'T'), manh) if manh else None
            if gc:
                tot_t += 1
            tc.retext(rn, **{'buoc' if col == 'C' else 'kq': moi}, ghi_chu=gc)
        pl = tcfix.Plan(tc)
        # ⚠️ `Plan(tc)` khởi tạo RỖNG — quên `keep_range` là XOÁ SẠCH nội dung file.
        pl.keep_range(12, max(tc.order))
        tc.rebuild(pl).save(quiet=True, sync=not sh.multi)

    print('\n=== %d file · ① %d ô mặc định · ② %d ô dịch · ③ %d ô rút gọn lan man '
          '· %d ô dồn sang cột T%s ==='
          % (totf, tot1, tot2, tot3, tot_t, '' if apply_ else '   (XEM TRƯỚC, chưa ghi)'))
    if apply_ and totf:
        print('⚠️  BẮT BUỘC chạy tiếp: python3 formula_layer.py <file>  (rebuild đã ghi đè cột A)')


if __name__ == '__main__':
    main()

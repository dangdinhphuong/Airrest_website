# -*- coding: utf-8 -*-
"""Rút cột D của khối `Validate các trường thông tin` về KHUÔN NGẮN CỦA MẪU (chỉ thị 2026-09-11).

Chỉ thị người đặt việc: *"Phần validate kết quả mong muốn đang bị quá chi tiết, làm như
`templateTestcase/DanhMucTuDienDungChung.xlsx` là được"*.

Đo hai bộ cạnh nhau — 306 case Validate của mẫu vs 1157 case Validate của 6 file ChuyenVien,
sau khi CHE chuỗi trong ngoặc kép (bản chữ verbatim của màn, §7.3, dài bao nhiêu cũng đúng):

    phần thuật (ngoài "")   mẫu median 46 · p90  97   |   bộ đang có median 93 · p90 197
    dấu `;` nối mệnh đề     mẫu  0,7%                 |   bộ đang có 40,3%
    CHỮ HOA nhấn mạnh       mẫu  0,7%                 |   bộ đang có 14,3%
    ngoặc đơn giải thích    mẫu  0,3%                 |   bộ đang có  8,1%
    câu dặn người test      mẫu  0,0%                 |   bộ đang có  3,8%

Script này lo bộ ĐÃ SINH; đường sinh mới đã vá ở §8.2 của PROMPT + phép rà `audit_extra` ⑳.
Luật dùng chung ở `qalib.kq_qua_chi_tiet()` / `qalib.rut_gon_kq()` — KHÔNG chép luật vào đây.

Phần bị cắt khỏi cột D **không bị vứt đi**: nó được nối vào cột T sau nhãn `[CHI TIẾT]`
(§8.3 — cột T được phép mang chi tiết kỹ thuật, cột D thì tuyệt đối không). Cột T đã có cờ
sẵn (`[CẦN VERIFY]`, `[Lệch BA - theo Code]`) thì NỐI THÊM, không ghi đè.

⚠️ Chỉ đụng case NẰM TRONG khối `Validate các trường thông tin`. Khối `Chức năng` có case
   luồng dài, khối `Giao diện` có case liệt kê thành phần mà phép ⑧/⑫ đòi liệt kê ĐỦ — rút
   gọn hai khối đó là phá chính luật khác.
⚠️ KHÔNG cắt bớt SỐ Ý của case (xem chú thích `qalib.rut_gon_kq`). Case dài mà mọi ý đều là
   kết quả thật thì script để nguyên, `audit_extra` ⑳ gắn cờ cho người viết tự rút.

    python3 fix_kq_validate.py <role> [tên màn]            # XEM TRƯỚC
    python3 fix_kq_validate.py <role> [tên màn] --apply    # ghi
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audit_noi_dung
import qalib
import roles
import tcfix

NHAN_CHI_TIET = '[CHI TIẾT]'


def gop_ghi_chu(cu, manh):
    """Nối phần cắt khỏi cột D vào cột T — KHÔNG ghi đè cờ đang có."""
    cu = (cu or '').strip()
    them = '%s %s' % (NHAN_CHI_TIET, ' '.join(m.rstrip(' .') + '.' for m in manh))
    if NHAN_CHI_TIET in cu:          # chạy lại lần hai: đừng nối chồng lên nhau
        return cu
    return (cu + ' ' + them).strip() if cu else them


def chuoi_da_ground(tc):
    """Chuỗi ĐÃ GROUND của màn — che khỏi mọi phép cắt/đo. Luật ở `qalib` (dời về 2026-09-14)."""
    return qalib.giu_nguyen_cua_file(getattr(tc, 'path', '') or '')


def quet(tc):
    """-> [(dòng, tên CN, tiêu đề case, D mới, [mảnh dồn sang T], [tên lỗi])] trong khối Validate."""
    giu = chuoi_da_ground(tc)
    ra = []
    cn = None
    trong_validate = False
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            cn = b
            trong_validate = False
        elif lv == 'grp':
            trong_validate = False
        elif lv == 'sub':
            # `Validate các trường thông tin` ở cấp **sub** (outlineLevel 2), không phải `grp`:
            # cây là CN(0) › bucket(1) › sub(2) › control(3) › case(4). Đặt nhầm cấp thì cờ
            # không bao giờ bật và script im lặng báo "0 case" trên đúng bộ file đang sai.
            trong_validate = 'validate' in qalib.norm(b)
        elif lv == 'case':
            d = tc.c(rn, 'D') or ''
            # ⚠️ CHỈ THỊ 2026-09-11: *"chỉ sửa phần validate"*. Bản trước còn gỡ mã tài
            # liệu (㉒) ở MỌI khối — nay bỏ hẳn nhánh đó: ngoài khối `Validate` thì script
            # KHÔNG đụng một ô nào. Mã tài liệu còn sót ở `Chức năng`/`Giao diện` là CỐ Ý để
            # lại, không phải sót; muốn dọn thì người đặt việc phải cho phép riêng.
            if not trong_validate:
                continue
            loi = (qalib.kq_qua_chi_tiet(d) + qalib.kq_co_so_lieu(d)
                   + qalib.kq_co_trich_dan(d))
            if not loi:
                continue
            # ㉒ gỡ mã tài liệu / dẫn chứng ảnh TRƯỚC: mã nằm trong ngoặc, gỡ trước thì phép
            # cắt ngoặc bên dưới không phải xử lý cái ngoặc chỉ chứa mỗi mã.
            moi, ma_tl = qalib.bo_trich_dan_kq(d)
            moi, _m = qalib.rut_gon_kq(moi, giu_nguyen=giu)
            manh = list(ma_tl) + _m
            # ㉑ bỏ SỐ ĐẾM sau khi đã rút gọn — chạy sau để phép rút gọn làm việc trên bản
            # còn nguyên số (khuôn ⑮ đếm chữ `không cho nhập quá 250 ký tự` để tự kiểm).
            moi = qalib.bo_so_lieu_kq(moi, giu_nguyen=giu)
            if moi == d and not manh:
                continue                      # chỉ còn lỗi phải sửa TAY (vd chữ hoa là giá trị thật)
            ra.append((rn, cn, b, moi, manh, loi))
    return ra


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 fix_kq_validate.py <%s> [tên màn] [--apply]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv

    tot = totf = tot_t = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=True):
        tc, nm = sh.tc, sh.name + ('/' + sh.bp if sh.multi else '')
        sua = quet(tc)
        if not sua:
            continue
        totf += 1
        tot += len(sua)
        print('#### %s  (%d case)' % (nm, len(sua)))
        for rn, cn, b, moi, manh, loi in sua[:6]:
            print('   r%-5d %-34s %s' % (rn, b[:34], ', '.join(loi)))
            print('          %s' % moi.replace('\n', ' ⏎ ')[:96])
            if manh:
                print('          ->T  %s' % ' | '.join(manh)[:88])
        if len(sua) > 6:
            print('   … còn %d case nữa' % (len(sua) - 6))
        if not apply_:
            continue
        for rn, cn, b, moi, manh, loi in sua:
            if manh:
                tc.retext(rn, kq=moi, ghi_chu=gop_ghi_chu(tc.c(rn, 'T'), manh))
                tot_t += 1
            else:
                tc.retext(rn, kq=moi)
        pl = tcfix.Plan(tc)
        # ⚠️ `Plan(tc)` khởi tạo RỖNG — quên `keep_range` là XOÁ SẠCH nội dung file.
        pl.keep_range(12, max(tc.order))
        tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)

    print('\n=== %d file · %d case rút gọn cột D · %d case có phần dồn sang cột T%s ==='
          % (totf, tot, tot_t, '' if apply_ else '   (XEM TRƯỚC, chưa ghi)'))
    if tot and not apply_:
        print('Ghi thật: python3 fix_kq_validate.py %s%s --apply'
              % (role, ' ' + only if only else ''))


if __name__ == '__main__':
    main()

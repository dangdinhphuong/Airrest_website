# -*- coding: utf-8 -*-
"""Rà KHỐI BƯỚC ở dòng CN (vàng) — `PROMPT-gen-testcase-v3.md` §4. Chỉ ĐỌC.

Mẫu `templateTestcase/DanhMucTuDienDungChung.xlsx` đặt Ở CỘT B của dòng CN:

    <TÊN CN>
    1. Vào CSDL học bạ số > Đăng nhập tài khoản <vai trò>
    2. Kéo xuống phần <app> > chọn <menu> > chọn <mục> > chọn <màn>
    3. <thao tác mở CN>              <- CN Danh sách KHÔNG có bước 3

Vì sao cần bộ rà riêng (đo 2026-09-08 trên `QuanTri/TrinhDoDaoTao`): `new_from_base.py` trước
đây chỉ ghi TÊN CN, nên MỌI bộ case sinh bằng tool_v2 thiếu hẳn khối này — mà **không phép rà
nào bắt**: bộ rà chốt `qalib.scan_quota` đọc `.split('\n')[0]` nên chỉ thấy dòng đầu, còn
`audit_extra` chỉ soi tiêu đề CASE. Người đặt việc phải phát hiện bằng mắt.

Năm phép rà:
  ① [THIẾU HẲN]  dòng CN chỉ có tên, không có bước nào
  ② [THIẾU B1]   không có bước đăng nhập
  ③ [THIẾU B2]   không có bước đường dẫn vào màn
  ④ [THIẾU B3]   CN cần thao tác mở (Thêm mới · Sửa · Xóa · Khôi phục · Nhập/Xuất excel ·
                 Xem chi tiết · Tìm kiếm) mà không có bước 3. CN Danh sách được MIỄN — mẫu
                 cố ý không có bước 3 ở đó.
  ⑥ [SAI ROLE]   bước 1 ghi vai trò KHÁC vai trò của chính bộ case (chỉ thị 2026-09-12:
                 *"khi chọn role nào thì ghi đúng role đó không tràn lan"*). Bắt cả kiểu liệt
                 kê `A/ B/ C/ …` lẫn kiểu ghi nhầm sang vai trò khác. Vai trò chưa khai
                 `ten_vai_tro` ở hồ sơ dự án thì phép này IM (không có căn cứ để so).
  ⑤ [C/D · HT]   dòng CN có cột C hoặc D không rỗng (công thức cột A nhận dòng nhóm qua D rỗng,
                 `tcfix.rebuild()` nhận qua C rỗng ⇒ ghi vào là biến dòng CN thành case), hoặc
                 dòng tiêu đề bị ÉP chiều cao (`ht`/`customHeight` cao hơn chiều cao mặc định
                 của sheet) ⇒ ô phình to so với mẫu.
                 ⚠ Phép HT đảo chiều 2026-09-14 theo chỉ thị *"các dòng nhóm đều bị [phình],
                 để tự động như mẫu"*. Bản cũ bắt NGƯỢC LẠI — dòng nhiều chữ mà THIẾU `ht` thì
                 báo "chữ bị che" — nên nó chính là thứ ép `tcfix.HT_HDR` phải phình dòng CN
                 lên 39.55/52.2/91.35pt. Mẫu để mọi dòng CN cao 1 dòng (ô `B12:E12` gộp nên
                 không tự giãn), phần bước 1./2./3. cố ý bị che.

    python3 audit_cn_buoc.py QuanTri
    python3 audit_cn_buoc.py QuanTri TrinhDoDaoTao
"""
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib          # noqa: E402

# CN được MIỄN bước 3 — mẫu r12 (Danh sách) không có bước 3
MIEN_B3 = ('danh sach',)
# CN có thao tác mở riêng ⇒ PHẢI có bước 3 (mẫu r94·r151·r294·r433·r461·r488·r579·r590)
CAN_B3 = ('tim kiem', 'tra cuu', 'them moi', 'tao moi', 'chinh sua', 'cap nhat', 'sua ',
          'xoa', 'khoi phuc', 'nhap excel', 'xuat excel', 'xem chi tiet', 'chuyen trang thai')
KW_B1 = ('dang nhap', 'dang nhap tai khoan')
KW_B2 = ('keo xuong phan', 'chon ', ' > ')


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def can_b3(ten):
    n = norm(ten)
    if any(k in n for k in MIEN_B3):
        return False
    return any(k in n for k in CAN_B3)


def ten_vai_tro_cua(role):
    """Tên tài khoản phải ghi ở bước 1 cho vai trò này; None = hồ sơ dự án chưa khai."""
    try:
        import roles as _r
        return (_r.ROLES.get(role) or {}).get('ten_vai_tro')
    except Exception:
        return None


def ht_mac_dinh(tc):
    """Chiều cao mặc định của sheet (`defaultRowHeight`) — mốc để biết dòng nào bị ÉP cao."""
    m = re.search(r'defaultRowHeight="([\d.]+)"', tc.head or '')
    return float(m.group(1)) if m else 15.0


def ht_ep(tc, rn):
    """Chiều cao bị ép của dòng tiêu đề, hoặc None nếu để tự động / đúng 1 dòng.

    Nới 1pt so với mặc định: file đi qua LibreOffice bị ghi `ht` cho MỌI dòng (13.8 hoặc
    15.75) — đó là chiều cao 1 dòng chữ, KHÔNG phải phình, nên không tính là lỗi.
    """
    attrs = tc.rows[rn]['attrs']
    m = re.search(r'ht="([\d.]+)"', attrs)
    if not m or 'customHeight' not in attrs:
        return None
    ht = float(m.group(1))
    return ht if ht > ht_mac_dinh(tc) + 1 else None


def soi_cn(tc, rn, vai_tro=None):
    """[(mã lỗi, mô tả)] cho một dòng CN."""
    b = tc.c(rn, 'B') or ''
    lines = [x.strip() for x in b.split('\n')]
    ten = lines[0]
    buoc = [x for x in lines[1:] if x]
    out = []
    if not buoc:
        return ten, [('THIẾU HẲN', 'dòng CN chỉ có tên, không có bước đăng nhập/đường dẫn')]
    joined = norm(' | '.join(buoc))
    if not any(k in joined for k in KW_B1):
        out.append(('THIẾU B1', 'không thấy bước đăng nhập'))
    elif vai_tro:
        # ⑥ Bước 1 phải ghi ĐÚNG vai trò của bộ case. Trước 12/09 `new_from_base` ghi
        # `role_xem` (danh sách ĐẦY ĐỦ) cho CN chỉ-đọc và `role_ghi` cho CN ghi — cả hai đều
        # không liên quan tới vai trò đang sinh: 6 file ChuyenVien đều ghi "Quản trị viên".
        for x in buoc:
            if 'dang nhap' not in norm(x):
                continue
            sau = x.split('Đăng nhập tài khoản')[-1].strip().rstrip('.')
            if not sau:
                break
            if norm(sau) != norm(vai_tro):
                out.append(('SAI ROLE',
                            'bước 1 ghi "%s" — bộ case là của "%s"'
                            % (sau[:58], vai_tro)))
            break
    if not any(k in joined for k in KW_B2):
        out.append(('THIẾU B2', 'không thấy bước đường dẫn vào màn'))
    # bước 3: phải có mục đánh số >= 3
    if can_b3(ten) and not any(re.match(r'^[3-9]\.', x) for x in buoc):
        out.append(('THIẾU B3', 'CN có thao tác mở riêng mà không có bước 3'))
    for col in ('C', 'D'):
        if (tc.c(rn, col) or '').strip():
            out.append(('C/D', 'cột %s của dòng CN KHÔNG rỗng — sẽ bị đếm thành case' % col))
    ht = ht_ep(tc, rn)
    if ht:
        out.append(('HT', 'dòng CN bị ép cao %.2fpt (mặc định %.2fpt) — ô phình so với mẫu'
                    % (ht, ht_mac_dinh(tc))))
    return ten, out


def main(argv):
    role = argv[1] if len(argv) > 1 else 'Admin'
    only = argv[2] if len(argv) > 2 else None
    tot = {'THIẾU HẲN': 0, 'THIẾU B1': 0, 'THIẾU B2': 0, 'THIẾU B3': 0, 'C/D': 0, 'HT': 0,
           'SAI ROLE': 0}
    vai_tro = ten_vai_tro_cua(role)
    if not vai_tro:
        print('(vai trò "%s" chưa khai "ten_vai_tro" trong hồ sơ dự án — phép ⑥ SAI ROLE '
              'không chạy)' % role)
    n_cn = 0
    broken = []
    for sh in qalib.iter_role_files(role, only=only, broken=broken):
        head = False
        for rn in sh.tc.order:
            if rn < 12:
                continue
            lv = sh.tc.lvl(rn)
            if lv != 'cn':
                # Phép ⑤ HT phủ CẢ dòng nhóm (grp/sub/sub2), không riêng dòng CN: chỉ thị
                # 2026-09-14 nói *"các dòng nhóm ĐỀU bị"*. Rà ở đây thay vì trong `soi_cn`.
                if lv in ('grp', 'sub', 'sub2'):
                    ht = ht_ep(sh.tc, rn)
                    if ht:
                        tot['HT'] = tot.get('HT', 0) + 1
                        if not head:
                            print('\n#### %s%s' % (sh.name, ' [%s]' % sh.bp if sh.multi else ''))
                            head = True
                        print('   [%-9s] r%-4d %-44s dòng nhóm bị ép cao %.2fpt (mặc định '
                              '%.2fpt) — ô phình so với mẫu'
                              % ('HT', rn, (sh.tc.c(rn, 'B') or '')[:44], ht,
                                 ht_mac_dinh(sh.tc)))
                continue
            n_cn += 1
            ten, loi = soi_cn(sh.tc, rn, vai_tro)
            for ma, vi in loi:
                tot[ma] = tot.get(ma, 0) + 1
                if not head:
                    print('\n#### %s%s' % (sh.name, ' [%s]' % sh.bp if sh.multi else ''))
                    head = True
                print('   [%-9s] r%-4d %-44s %s' % (ma, rn, ten[:44], vi))
    print('\n=== %s — dòng CN: %d · thiếu hẳn %d · thiếu B1 %d · thiếu B2 %d · thiếu B3 %d · '
          'C/D bẩn %d · dòng tiêu đề bị ép cao %d · SAI ROLE %d ==='
          % (role, n_cn, tot['THIẾU HẲN'], tot['THIẾU B1'], tot['THIẾU B2'],
             tot['THIẾU B3'], tot['C/D'], tot['HT'], tot['SAI ROLE']))
    if broken:
        print('!!! %d file KHÔNG rà được (kết quả CHƯA phủ hết role):' % len(broken))
        for base, why in broken:
            print('    - %-52s %s' % (base[:52], why))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))

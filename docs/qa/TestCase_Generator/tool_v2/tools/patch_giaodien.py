# -*- coding: utf-8 -*-
"""Ghi cột C/D của case `Kiểm tra hiển thị đầy đủ các thông tin trong màn hình chức năng`:
cột C = ĐÚNG 2 bước cố định, cột D = DANH SÁCH THÀNH PHẦN THẬT của chính CN đó.

⚠️ Chỉ thị người đặt việc 2026-09-11: cột *Các bước thực hiện* **chỉ ghi 2 bước**
(`1. Mở màn hình chức năng.` · `2. Đối chiếu từng thành phần đang hiện trên màn với thiết kế
màn hình`) — KHÔNG lặp lại danh sách. Bản trước nhồi y nguyên danh sách vào CẢ HAI cột.

Chỉ thị người đặt việc 2026-09-09: *"phần giao diện, một số chỗ chưa liệt kê đầy đủ các trường
mà vẫn đang để là như ảnh…"*. Đúng: 6 case `Giao diện chung` được `new_from_base.py` chép
VERBATIM từ file nền, trong đó case này có cột C **lặp lại đúng tiêu đề** và cột D chỉ ghi
*"… đầy đủ các thành phần như thiết kế (như hình)"* — không nêu một thành phần nào, nên người
chạy test không có gì để đối chiếu ngoài tấm ảnh ở cột E.

Nguồn liệt kê = **tên nhóm control của chính CN đó** trong khối `Validate các trường thông tin`
(chuẩn §0.8e: `<Loại control> <Nhãn UI thật>`) — đọc từ FILE, không đoán thêm. THỨ TỰ liệt kê
thì lấy theo `cn[].controls` của hồ sơ màn (`qalib.sap_theo_bo_cuc`), tức thứ tự Trái→Phải,
Trên→Dưới trên màn thật — chỉ thị 2026-09-10. Câu mẫu ở cột D
được GIỮ NGUYÊN rồi mới nối danh sách vào sau (bài học 09/09: đừng thay case của mẫu bằng case
tự nghĩ, mẫu còn neo ảnh ở cột E).

Cột bảng danh sách (`verbatim.cot_bang` của hồ sơ màn) chỉ nối thêm khi **không có chỗ nào mơ
hồ**: hồ sơ có đúng 1 danh sách cột và file có đúng 1 CN mang nhóm `Danh sách …`. File gộp nhiều
màn (danh sách + chi tiết) có 2 bộ cột khác nhau ⇒ script BỎ QUA và nói ra, không tự ghép.

    python3 patch_giaodien.py <role> [tên màn]            # XEM TRƯỚC
    python3 patch_giaodien.py <role> [tên màn] --apply    # ghi
    ... --force    # ghi lại cả case đã liệt kê (mặc định bỏ qua)
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import tcfix
import roles

norm = qalib.norm
TIEU_DE = 'kiem tra hien thi day du cac thong tin trong man hinh chuc nang'
# Nhóm KHÔNG phải thành phần giao diện — có mặt trong khối Validate nhưng không phải control
# nhìn thấy được trên màn. `Validate ràng buộc giữa các trường` là nhóm CASE về quan hệ giữa hai
# ô đã liệt kê ở trên; liệt kê nó là nói người chạy test đi tìm một thành phần không tồn tại
# (đã lỡ ghi vào bộ case `DuLieuLoi` một lần rồi sửa lại).
KHONG_PHAI_THANH_PHAN = ('rang buoc giua cac truong', 'rang buoc lien truong')


def ho_so_man(path):
    """Hồ sơ màn nằm CẠNH bộ case theo chuẩn 2026-09-09: <role>/ho-so-man/<tên .xlsx>.json."""
    d = os.path.dirname(os.path.abspath(path))
    p = os.path.join(os.path.dirname(d), 'ho-so-man',
                     os.path.basename(path).replace('.xlsx', '.json'))
    if not os.path.exists(p): return None
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception as e:
        print('   !! hồ sơ màn đọc không được (%s) — bỏ qua phần cột bảng' % type(e).__name__)
        return None


def cot_bang_duy_nhat(spec):
    """[cột] nếu hồ sơ màn có ĐÚNG MỘT danh sách `cot_bang`; nhiều hơn -> None (không đoán)."""
    if not spec: return None
    ra = []

    def di(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == 'cot_bang' and isinstance(v, list) and v: ra.append(v)
                else: di(v)
        elif isinstance(o, list):
            for v in o: di(v)
    di(spec)
    if len(ra) > 1:
        print('   !! hồ sơ màn có %d danh sách `cot_bang` khác nhau (file gộp nhiều màn) — '
              'KHÔNG ghép cột bảng, chỉ liệt kê nhóm control' % len(ra))
    return ra[0] if len(ra) == 1 else None


RX_DONG = re.compile(r'^\s*(\d+)\.\s+(.+)$')


def da_liet_ke(c):
    """Cột C đã có danh sách thành phần chưa.

    ⚠️ Ngưỡng ĐỔI 2026-09-09 từ `>= 2` xuống `>= 1`: CN chỉ có MỘT nhóm control (vd
    `CHUYỂN TRẠNG THÁI …` chỉ có `Hộp xác nhận …`) thì bản liệt kê đúng cũng chỉ có 1 dòng
    ⇒ ngưỡng 2 làm `patch_giaodien` ghi rồi mà `audit_extra` phép ⑧ vẫn báo thiếu, không bao
    giờ hết. Bản verbatim của mẫu KHÔNG có dòng liệt kê nào nên ngưỡng 1 vẫn phân biệt được.

    ⚠️ 2026-09-10: khuôn đổi từ `- <tên>` sang `N. [<Nhãn loại>] <tên>`. Nhận CẢ HAI để bản
    cũ vẫn bị coi là "đã liệt kê" (không nhân đôi danh sách khi chạy lại), nhưng
    `audit_extra` phép ⑫ mới là chỗ đòi nâng cấp bản cũ lên khuôn mới.
    """
    txt = c or ''
    if txt.count('\n- ') >= 1:
        return True
    return len(doc_liet_ke(txt)) >= 1


def doc_liet_ke(c):
    """[tên thành phần] đọc ngược từ cột C.

    ⚠️ Chỉ đọc phần NẰM GIỮA dòng mở *"Đối chiếu từng thành phần…"* và dòng cột bảng
    *"Đối chiếu tiêu đề các cột…"*. Bản đầu quét cả ô: hai dòng BƯỚC (`1. Mở màn hình chức
    năng.` · `2. Đối chiếu từng thành phần…`) và dòng cột bảng (`3. Đối chiếu tiêu đề…`) cũng
    khớp khuôn `N. ` nên bị đọc thành "thành phần" ⇒ phép ⑫ báo sai thứ tự ở CẢ 5 CN của một
    file vừa mới ghi đúng.

    Bỏ nhãn loại `[…]`, dấu `*` và các dòng phụ thụt đầu (thanh hành động · icon) vì chúng
    không đánh số.
    """
    dong = (c or '').split('\n')
    dau = 0
    # Nhận CẢ HAI khuôn: cột C của bản trước 2026-09-11 (mốc mở *"Đối chiếu từng thành phần…"*)
    # và cột D — nơi danh sách nằm từ 2026-09-11 (mốc mở chính `MO_DAU_D`).
    for i, x in enumerate(dong):
        if 'doi chieu tung thanh phan' in norm(x) or norm(MO_DAU_D) in norm(x):
            dau = i + 1
            break
    ra = []
    for x in dong[dau:]:
        if 'doi chieu tieu de cac cot' in norm(x) or 'bang danh sach du cac cot' in norm(x):
            break
        m = RX_DONG.match(x)
        if not m:
            continue
        t = re.sub(r'^\[[^\]]+\]\s*', '', m.group(2).strip()).strip()
        ra.append(t.rstrip('*').strip())
    return ra


MO_DAU_D = 'Hiển thị màn hình chức năng bao gồm các thông tin:'
# Bản chữ cột C — chép NGUYÊN VĂN chỉ thị người đặt việc 2026-09-11.
CAC_BUOC_C = ('1. Mở màn hình chức năng.\n'
              '2. Đối chiếu từng thành phần đang hiện trên màn với thiết kế màn hình')


def nhom_bat_buoc(tc):
    """{tên nhóm control} có case `… là trường bắt buộc` — nguồn duy nhất suy ra dấu `*`.

    Không lấy từ hồ sơ màn: dấu sao là thuộc tính của Ô TRÊN MÀN, mà bằng chứng gần nhất đã
    nằm sẵn trong chính bộ case (bank `bat buoc` chỉ bơm cho ô bắt buộc). Suy từ file thì màn
    nào cũng đúng, không phải khai thêm một chỗ nữa để rồi lệch.
    """
    ra, gname = set(), None
    for rn in tc.order:
        if rn < 12: continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'sub2':
            gname = b
        elif lv in ('cn', 'grp', 'sub'):
            gname = None
        elif lv == 'case' and gname and 'la truong bat buoc' in norm(b):
            ra.add(gname)
    return ra


# Nhánh `verbatim` mang tiêu đề hộp thoại, theo LOẠI CN. Đây là bộ khoá mà cả 6 hồ sơ màn đang
# có đều dùng (`form_them.tieu_de` · `form_sua.tieu_de` · `xoa_don_le.tieu_de`) — trước 2026-09-12
# `patch_giaodien` KHÔNG đọc chúng mà đòi một khoá thứ hai (`cn[].popup`) cho cùng một dữ kiện,
# nên hồ sơ chỉ khai theo quy ước `verbatim` thì dòng `[Tiêu đề popup]` lặng lẽ biến mất.
POPUP_THEO_CN = (('xoa', 'xoa_don_le'), ('chinh sua', 'form_sua'), ('sua', 'form_sua'),
                 ('them', 'form_them'), ('tao moi', 'form_them'))


def popup_cua_cn(spec, ten_cn):
    """Tiêu đề hộp thoại của CN — `cn[].popup` khai tay THẮNG, sau đó mới suy từ `verbatim`."""
    _ds = list((spec or {}).get('cn') or [])
    for _mp in ((spec or {}).get('man_phu') or []):      # CN màn phụ cũng khai `popup` được
        if isinstance(_mp, dict):
            # `cn` của mục màn phụ là LIST khi noi_dat=sheet_rieng, nhưng là CHUỖI (tên CN đã
            # khai ở `cn` gốc) khi noi_dat=cung_sheet — khuôn tài liệu HO-SO-DU-AN §B00. Extend
            # thẳng một chuỗi là rải TỪNG KÝ TỰ vào danh sách rồi nổ `'str' has no attr get`.
            _cn_mp = _mp.get('cn')
            if isinstance(_cn_mp, list):
                _ds.extend(_cn_mp)
    for cn in _ds:
        if norm(cn.get('ten') or '') == norm(ten_cn or ''):
            tay = (cn.get('popup') or '').strip()
            if tay:
                return tay
    v = ((spec or {}).get('grounding') or {}).get('verbatim') or {}
    n = norm(ten_cn or '')
    for khoa_cn, khoa in POPUP_THEO_CN:
        if khoa_cn in n:
            d = v.get(khoa)
            tieu_de = (d.get('tieu_de') or '').strip() if isinstance(d, dict) else ''
            return tieu_de or None
    return None


def thanh_hanh_dong(spec):
    """[nhãn…] của thanh hành động hàng loạt (`verbatim.thanh_hang_loat`) — [] nếu không khai."""
    v = ((spec or {}).get('grounding') or {}).get('verbatim') or {}
    x = v.get('thanh_hang_loat')
    return [str(i) for i in x] if isinstance(x, list) and x else []


def icon_ban_ghi(spec):
    """[nhãn…] các icon thao tác trên dòng (`verbatim.icon_ban_ghi`) — [] nếu không khai."""
    v = ((spec or {}).get('grounding') or {}).get('verbatim') or {}
    x = v.get('icon_ban_ghi')
    return [str(i) for i in x] if isinstance(x, list) and x else []


def soan(groups, cols=None, batbuoc=(), popup=None, thanh=(), icons=()):
    """(cột C, cột D) cho case liệt kê thành phần.

    Khuôn `N. [<Nhãn loại>] <Nhãn UI> *` theo ảnh mẫu người đặt việc gửi 2026-09-10
    (`TuDienDungChung_113`) — thay khuôn `- <Loại control> <Nhãn UI>` của bản 09/09, vốn đọc
    lên là từ điển nội bộ của tool chứ không phải tên người dùng nhìn thấy.
    """
    dong = []
    if popup:
        dong.append('[Tiêu đề popup] %s' % popup)
    stt = 0
    for g in groups:
        stt += 1
        d = '%d. %s' % (stt, qalib.dong_liet_ke(g, g in batbuoc))
        # Checkbox chọn dòng: nêu luôn THANH HÀNH ĐỘNG hiện ra khi đã tích — chỉ thị
        # 2026-09-10 *"checkbox bản ghi cần ghi rõ thanh hành động có những thành phần nào"*.
        # Không có thanh này thì không nêu (đừng bịa cho màn không có chọn hàng loạt).
        if thanh and 'checkbox ban ghi' in norm(g):
            d += ('\n   Tích chọn bản ghi thì hiện thanh hành động gồm: %s'
                  % ' · '.join(thanh))
        # Nhóm `Icon` đọc trơ trọi thì người chạy test không biết đi tìm cái gì — nêu luôn các
        # icon thao tác trên dòng đã ground. Cùng lý do với thanh hành động ở trên.
        if icons and norm(g) == 'icon':
            d += '\n   Cột Hành động gồm các icon: %s' % ' · '.join(icons)
        dong.append(d)
    ds = '\n'.join(dong)
    # ⚠️ CHỈ THỊ NGƯỜI ĐẶT VIỆC 2026-09-11: cột *Các bước thực hiện* của case này chỉ ghi ĐÚNG
    # HAI BƯỚC, KHÔNG lặp lại danh sách thành phần. Danh sách chỉ nằm ở cột *Kết quả mong muốn*
    # — bản trước nhồi y nguyên danh sách vào cả hai cột nên ô cột C dài vô ích và trùng lặp.
    c = CAC_BUOC_C
    d = '%s\n%s' % (MO_DAU_D, ds)
    if cols:
        d += '\nBảng danh sách đủ các cột: %s.' % ' · '.join(cols)
    return c, d


def quet(tc):
    """[(dòng case, tên CN, [nhóm control], có_nhom_danh_sach)] — thuần đọc."""
    out = []
    cn = grp = sub = None
    ctrls, r_case, co_ds = [], None, False

    def xong():
        if cn is not None and r_case is not None:
            out.append((r_case, cn, list(ctrls), co_ds))

    for rn in tc.order:
        if rn < 12: continue
        lv = tc.lvl(rn); b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            xong(); cn, grp, sub, ctrls, r_case, co_ds = b, None, None, [], None, False
        elif lv == 'grp':
            grp = norm(b); sub = None
        elif lv == 'sub':
            sub = norm(b)
        elif lv == 'sub2':
            if grp and 'giao dien' in grp and sub and 'validate cac truong' in sub:
                if any(k in norm(b) for k in KHONG_PHAI_THANH_PHAN): continue
                ctrls.append(b)
                if 'danh sach' in norm(b) and not norm(b).startswith('button'): co_ds = True
        elif lv == 'case':
            if norm(b) == TIEU_DE: r_case = rn
    xong()
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 patch_giaodien.py <%s> [tên màn] [--apply] [--force]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv
    force = '--force' in sys.argv

    tot = totf = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=True):
        tc, nm = sh.tc, sh.name
        viec = quet(tc)
        spec = ho_so_man(tc.path)
        cols = cot_bang_duy_nhat(spec)
        bb = nhom_bat_buoc(tc)
        thanh = thanh_hanh_dong(spec)
        icons = icon_ban_ghi(spec)
        n_ds = sum(1 for _r, _c, _g, co_ds in viec if co_ds)
        if cols and n_ds != 1:
            print('   %-18s !! %d CN mang nhóm `Danh sách …` — KHÔNG ghép cột bảng (mơ hồ)'
                  % (nm[:18], n_ds))
            cols = None
        sua = 0
        for rn, cn, groups, co_ds in viec:
            if not groups: continue
            if da_liet_ke(tc.c(rn, 'D')) and not force:
                continue
            # Thứ tự LIỆT KÊ = thứ tự TRÊN MÀN (hồ sơ màn), không phải thứ tự nhóm trong file.
            groups = qalib.sap_theo_bo_cuc(groups, spec, cn)
            c, d = soan(groups, cols if (cols and co_ds) else None,
                        batbuoc=bb, popup=popup_cua_cn(spec, cn), thanh=thanh, icons=icons)
            print('   %-18s %-34s %d thành phần%s'
                  % (nm[:18], cn[:34], len(groups), ' + cột bảng' if (cols and co_ds) else ''))
            if apply_: tc.retext(rn, None, c, d)
            sua += 1
        if not sua: continue
        tot += sua; totf += 1
        if not apply_: continue
        pl = tcfix.Plan(tc); pl.keep_range(12, max(tc.order))
        tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)

    print('=== %d file · %d case đã liệt kê thành phần%s ==='
          % (totf, tot, '' if apply_ else ' (XEM TRƯỚC)'))
    if tot and not apply_:
        print('Ghi thật: python3 patch_giaodien.py %s%s --apply'
              % (role, ' ' + only if only else ''))


if __name__ == '__main__':
    main()

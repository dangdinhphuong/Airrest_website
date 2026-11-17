# -*- coding: utf-8 -*-
"""Rà LUỒNG TÌM KIẾM theo §6 (chỉ đọc) — lấp lỗ hổng lớn nhất còn lại của bộ rà.

Vì sao có bộ này (2026-09-08): khối `Chức năng Tìm kiếm đơn lẻ` (§6 — mỗi bộ lọc một nhóm con:
ô nhập chữ **6 mục**, control chọn giá trị **2 mục**) **chưa từng được rà bởi bất kỳ script nào**:

  · `audit_func.py:79`  -> `if 'tim kiem don le' in n: return None,None`   (CỐ Ý bỏ qua)
  · `patch_quota.py`    -> chỉ quét nhóm trong khối `Validate`, không với tới khối `Chức năng`
  · `patch_timkiem_donle.py` -> chỉ BÙ MỤC cho nhóm ĐÃ CÓ; nhóm vắng hẳn thì nó ra `+0`
  · `new_from_base.py` / `complete_func.py` -> không tạo nhóm này

Bốn cái đó cộng lại thành một lỗ: **màn có bộ lọc nhưng thiếu HẲN khối tìm kiếm đơn lẻ vẫn
nghiệm thu sạch `0·0·0·0·0·0`**. Đo lúc viết: bộ `Testcase-Role-QuanTri-ChucVu` mới sinh có 2 bộ
lọc, đúng ra phải 8 case (6+2), thực tế **0** — mà mọi bộ rà đều báo sạch.

Bốn phép rà:
  ① CN có bộ lọc mà THIẾU HẲN nhóm `Chức năng Tìm kiếm đơn lẻ`
  ② Bộ lọc chưa có nhóm con riêng dưới `Chức năng Tìm kiếm đơn lẻ`
  ③ Nhóm con có nhưng MỎNG hơn định mức (ô nhập chữ 6 · control chọn 2)
  ④ **TÌM KIẾM KẾT HỢP** (§6): màn `>= 2` bộ lọc phải có khối `Chức năng Tìm kiếm kết hợp`
     với đủ **`X - 1`** case tổ hợp (X=2 -> 1 · X=3 -> 2 · X=4 -> 3 · X=5 -> 4).
     ⚠️ Định mức này ĐỔI 2026-09-09 (chỉ thị người đặt việc: *"tìm kiếm kết hợp n tiêu chí cần
     n-1 case"*) — trước đó là `2^X - X - 1` (X=5 -> 26). Bơm ở `patch_kethop.py`, cùng luật.
     Bổ sung 2026-09-08 sau khi phát hiện bản ①②③ vẫn báo `ChucVu` sạch dù thiếu hẳn khối này:
     `patch_kethop.py` bỏ qua nó vì ngưỡng cũ `N < 3` (đọc nhầm §6 thành "2 bộ lọc NGOÀI ô tìm")
     và vì nó lấy mốc chèn = case cuối của chính khối chưa tồn tại.

  ⑥ **LẠC CHỖ** (chỉ thị người đặt việc 2026-09-09: *"các chức năng liên quan đến lọc và tìm
     kiếm cần để ở chức năng lọc và tìm kiếm"*): control lọc/tìm kiếm — hoặc cả nhóm
     `Chức năng Tìm kiếm …` — khai ở một CN KHÔNG phải CN tìm kiếm.
     Vì sao cần: `qalib.la_bo_loc()` trả `False` cho mọi CN không phải tìm kiếm, nên bộ lọc khai
     lạc vào CN `DANH SÁCH …` làm phép ①②③④ **không có gì để xét** và cả khối tìm kiếm biến mất
     TRONG IM LẶNG. Đo 2026-09-09 trên `moetdl/DuLieuLoi`: đổi tên CN tìm kiếm thành
     `DANH SÁCH …` rồi xoá sạch 45 case tìm kiếm ⇒ **10/10 bộ rà vẫn báo 0**.

Phân loại control dùng CHUNG `qalib.search_spec()` — bộ rà và bộ bơm cùng một luật.

    python3 audit_timkiem.py [Admin|NCC|Teacher|QuanTri] [tên file]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import roles

norm = qalib.norm

# Luật "ô này là BỘ LỌC hay Ô BIỂU MẪU" nằm ở `qalib.loai_cn()` / `qalib.la_bo_loc()` — dùng
# chung với `patch_timkiem_donle.py`. Bản trước tự chép danh sách LOẠI TRỪ tên CN và đã rò:
# "TẠO BÀI VIẾT MỚI" không chứa cụm "tao moi" nên lọt, ô biểu mẫu `Selectbox Trạng thái khởi tạo`
# bị chấm là bộ lọc. Nay hỏi thẳng: CN chứa nó là loại gì.
SUB_TKDL = 'chuc nang tim kiem don le'
la_bo_loc = qalib.la_bo_loc


# ── phép ⑥: từ khoá NHẬN DIỆN control lọc/tìm kiếm (danh sách MỞ, chỉ để cảnh báo) ────────
# Khác `qalib.la_bo_loc()`: hàm đó chạy TRONG CN tìm kiếm và dùng danh sách LOẠI TRỪ. Ở đây
# ta đứng NGOÀI CN tìm kiếm nên phải bắt theo dấu hiệu DƯƠNG — và cố tình bắt hẹp, chấp nhận
# bỏ sót nhãn trung tính (`Selectbox Bảng đích`) để **không báo oan** một ô biểu mẫu.
LOC_DUONG = ('tim kiem', 'tim theo', 'o tim', 'tim nhanh', 'bo loc', 'loc theo',
             'trang thai', 'tu ngay', 'den ngay', 'tu gio', 'den gio', 'khoang ngay')
CN_TK_NHOM = 'chuc nang tim kiem'


def quet_lac_cho(tc):
    """[(tên CN, loại lạc, tên nhóm)] — control lọc / nhóm CN tìm kiếm nằm ngoài CN tìm kiếm.

    Ô của CN **biểu mẫu** (Thêm mới / Chỉnh sửa) KHÔNG xét ở phần control: form có quyền mang ô
    `Trạng thái`, `Từ ngày` mà không phải bộ lọc. Nhóm `Chức năng Tìm kiếm …` thì xét MỌI CN.
    """
    ra, co_cn_tk = [], []
    cn = grp = sub = None
    for rn in tc.order:
        if rn < 12: continue
        lv = tc.lvl(rn); b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            cn = b; grp = sub = None
            if qalib.loai_cn(cn) == 'tim_kiem': co_cn_tk.append(cn)
            continue
        # ⚠️ MIỄN TRỪ CN Nhập/Xuất excel: nhóm control của nó là **cột của bảng tính**, không
        # phải control trên màn — đo 09/09: hồ sơ `TrinhDoDaoTao` bị báo oan `Selectbox Trạng
        # thái` (một cột của file nhập).
        if 'excel' in norm(cn or ''): continue
        if cn is None: continue
        loai = qalib.loai_cn(cn)
        if lv == 'grp':
            grp = norm(b); sub = None
        elif lv in ('sub', 'sub2'):
            n = norm(b)
            if lv == 'sub': sub = n
            if loai == 'tim_kiem': continue
            if grp and 'chuc nang' in grp and CN_TK_NHOM in n:
                ra.append((cn, 'NHÓM CN', b))
            elif (grp and 'giao dien' in grp and loai == 'khac'
                  and not any(k in n for k in qalib.NHOM_KHUNG)
                  and any(k in n for k in LOC_DUONG)
                  and (lv == 'sub2' or sub is None or 'giao dien chung' not in sub)):
                ra.append((cn, 'CONTROL', b))
    return ra, co_cn_tk


def so_to_hop(x):
    """§6: số case tổ hợp bắt buộc cho X tiêu chí = **X - 1** (mỗi cỡ k=2..X đúng 1 case).

    Chỉ thị người đặt việc 2026-09-09 thay công thức cũ `2^X - X - 1` (X=5 -> 26 case, trong đó
    22 case chỉ khác nhau ở việc CHỌN tiêu chí nào). Định mức là SÀN: bộ case cũ mang đủ 26 tổ
    hợp vẫn nghiệm thu sạch, chỉ bộ sinh MỚI là ra X-1.
    """
    return max(x - 1, 0)


def quet(tc):
    """[(tên CN, [bộ lọc], {nhóm con: số case}, có_khối_tkdl, số case 'Kết hợp:')] — thuần đọc."""
    out = []
    cn = None
    loc, con, co_khoi, n_kh, co_kh = [], {}, False, 0, False
    r_dl = r_kh = None                  # dòng nhóm `đơn lẻ` / `kết hợp` -> kiểm THỨ TỰ (§4/§6)
    grp = sub = sub2 = None

    def xong():
        if cn is not None and (loc or co_khoi):
            out.append((cn, list(loc), dict(con), co_khoi, n_kh, co_kh, r_dl, r_kh))

    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            xong()
            cn = b
            loc, con, co_khoi, n_kh, co_kh = [], {}, False, 0, False
            r_dl = r_kh = None
            grp = sub = sub2 = None
        elif lv == 'grp':
            grp = norm(b)
            sub = sub2 = None
        elif lv == 'sub':
            sub = norm(b)
            sub2 = None
            if SUB_TKDL in sub:
                co_khoi = True
                if r_dl is None: r_dl = rn
            elif 'tim kiem ket hop' in sub:
                co_kh = True
                if r_kh is None: r_kh = rn
            elif grp and 'giao dien' in grp and la_bo_loc(b, cn):
                loc.append(b)                      # bộ lọc khai thẳng ở cấp sub
        elif lv == 'sub2':
            sub2 = b
            if sub and SUB_TKDL in sub:
                con.setdefault(b, 0)
            elif grp and 'giao dien' in grp and la_bo_loc(b, cn):
                loc.append(b)
        elif lv == 'case':
            if sub and SUB_TKDL in sub and sub2 is not None:
                con[sub2] = con.get(sub2, 0) + 1
            # Đếm case tổ hợp — nhận CẢ HAI lối đặt tiêu đề: bản MỚI (chỉ thị 09/09 lượt 2)
            # `Kiểm tra tìm kiếm kết hợp N tiêu chí` và bản CŨ `Kết hợp: <A> + <B>` (bộ case đã
            # sinh trước đó). Bỏ lối cũ đi là mọi file cũ hoá "thiếu tổ hợp".
            _nb = qalib.norm(b)
            if _nb.startswith('ket hop:') or ('tim kiem ket hop' in _nb and 'tieu chi' in _nb):
                n_kh += 1
    xong()
    return out


def main():
    role = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
    only = sys.argv[2] if len(sys.argv) > 2 else None
    roles.get(role)                                   # báo lỗi sớm nếu role sai

    t_khoi = t_con = t_mong = t_kh = t_thutu = t_lac = 0
    for sh in qalib.iter_role_files(role, only):      # một file hỏng không làm chết cả đợt rà
        tc, nm = sh.tc, (sh.name + ('/' + sh.bp if sh.multi else ''))
        ra = []
        # ⑥ LẠC CHỖ — xét TRƯỚC vì nó giải thích tại sao ①②③④ im lặng
        lac, co_cn_tk = quet_lac_cho(tc)
        for cn_l, kieu, ten in lac:
            if kieu == 'NHÓM CN':
                d = ('nhóm `%s` nằm ở CN này — nhóm tìm kiếm phải nằm trong CN Tìm kiếm & lọc'
                     % ten[:44])
            elif co_cn_tk:
                d = ('control lọc/tìm kiếm `%s` khai ở CN này — chuyển sang CN `%s`'
                     % (ten[:34], co_cn_tk[0][:26]))
            else:
                d = ('control lọc/tìm kiếm `%s` khai ở CN này mà FILE KHÔNG CÓ CN Tìm kiếm & lọc '
                     'nào ⇒ mất trọn khối tìm kiếm (đơn lẻ + kết hợp) mà không phép nào kêu'
                     % ten[:34])
            ra.append(('LẠC CHỖ', cn_l, d))
            t_lac += 1
        for cn, loc, con, co_khoi, n_kh, co_kh, r_dl, r_kh in quet(tc):
            if not loc:
                continue
            if qalib.loai_cn(cn) != 'tim_kiem':
                continue
            # ④ tìm kiếm kết hợp — xét độc lập với khối đơn lẻ
            if len(loc) >= 2:
                can = so_to_hop(len(loc))
                if not co_kh:
                    ra.append(('KẾT HỢP', cn, 'THIẾU HẲN khối `Chức năng Tìm kiếm kết hợp` — '
                               '%d tiêu chí cần %d case tổ hợp' % (len(loc), can)))
                    t_kh += can
                elif n_kh < can:
                    ra.append(('KẾT HỢP', cn, 'mới %d/%d case tổ hợp (%d tiêu chí -> %d-1)'
                               % (n_kh, can, len(loc), len(loc))))
                    t_kh += can - n_kh
            # ⑤ THỨ TỰ — mẫu r132 (đơn lẻ) đứng TRƯỚC r143 (kết hợp). `patch_timkiem_donle`
            #    bản trước 08/09 chèn khối đơn lẻ vào CUỐI khối Chức năng nên luôn sai thứ tự.
            if r_dl and r_kh and r_dl > r_kh:
                ra.append(('THỨ TỰ', cn, 'nhóm `Tìm kiếm đơn lẻ` (r%d) nằm DƯỚI nhóm '
                           '`Tìm kiếm kết hợp` (r%d) — mẫu đòi đơn lẻ TRƯỚC kết hợp'
                           % (r_dl, r_kh)))
                t_thutu += 1
            if not co_khoi:
                ra.append(('KHỐI', cn, 'THIẾU HẲN nhóm `Chức năng Tìm kiếm đơn lẻ` — %d bộ lọc: %s'
                           % (len(loc), ', '.join(loc)[:60])))
                t_khoi += 1
                continue
            for g in loc:
                _, dm, nhan = qalib.search_spec(g)
                # khớp nhóm con theo tên bộ lọc (nhóm con thường lặp đúng tên control)
                key = next((k for k in con if norm(k) == norm(g) or norm(g) in norm(k)
                            or norm(k) in norm(g)), None)
                if key is None:
                    ra.append(('NHÓM CON', cn, '%s — chưa có nhóm con (%s, cần %d case)'
                               % (g[:34], nhan, dm)))
                    t_con += 1
                elif con[key] < dm:
                    ra.append(('MỎNG', cn, '%s — %d/%d case (%s)' % (g[:34], con[key], dm, nhan)))
                    t_mong += dm - con[key]
        if ra:
            print('####', nm)
            for tag, cn, d in ra:
                print('   [%-8s] %-38s %s' % (tag, cn[:38], d))

    print('\n=== %s — ĐƠN LẺ: thiếu hẳn khối %d · thiếu nhóm con %d · case thiếu %d'
          '  ·  KẾT HỢP: tổ hợp thiếu %d  ·  THỨ TỰ sai %d  ·  LẠC CHỖ %d ==='
          % (role, t_khoi, t_con, t_mong, t_kh, t_thutu, t_lac))
    if t_lac:
        print('Lạc chỗ    : chuyển control/nhóm lọc-tìm kiếm sang CN Tìm kiếm & lọc trong HỒ SƠ MÀN '
              'rồi sinh lại (§6) — đừng chỉ đổi tên nhóm')
    if t_khoi or t_con or t_mong:
        print('Bơm đơn lẻ : patch_timkiem_donle.py --role %s --create --apply' % role)
    if t_kh:
        print('Bơm kết hợp: patch_kethop.py %s --create        (--dry để xem trước)' % role)


if __name__ == '__main__':
    main()

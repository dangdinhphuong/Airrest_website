# -*- coding: utf-8 -*-
"""Dựng file test case MỚI từ một file nền đã chuẩn (lớp L1 giữ nguyên, L2/L3 khai báo ngoài).

`tcfix` KHÔNG tạo được workbook mới (`load()` bắt buộc file có sẵn), nên "sinh mới" thực chất là
*clone file nền rồi thay ruột* — đúng lối `gen_mamnon_0819.py` đã chạy thành công cho 4 file.
Script này là bản TỔNG QUÁT của lối đó: không gắn với màn/đợt nào.

Lấy VERBATIM từ file nền (nên không bao giờ lệch chuẩn wording/style):
  · 6 case `Giao diện chung`      · khối `An toàn thông tin` của CN đầu tiên
Sinh mới theo khai báo:
  · dòng CN (vàng) · khối Giao diện/Chức năng/ATTT · nhóm control rỗng trong Validate
Bơm case cho các nhóm control là việc của `patch_quota.py` (chạy sau), chốt bằng `audit_validate_quota.py`.

    # xem trước (mặc định là DRY-RUN)
    python3 new_from_base.py --out ../../testCase/Admin/testcase/Testcase-Role-Admin-Kho.xlsx \
        --prefix Kho --title "Quản lý kho" \
        --cn "DANH SÁCH KHO:Danh sách kho,Phân trang,Selectbox Số bản ghi trên trang" \
        --cn "THÊM MỚI KHO:Textbox Tên kho,Textbox Mã kho,Button Lưu,Button Hủy"

    # hoặc khai báo bằng hồ sơ màn (L3) — xem HO-SO-DU-AN.md
    python3 new_from_base.py --out <file.xlsx> --spec man-kho.json --apply

Khi `--apply`, ngoài file `.xlsx` script còn **tự cất hồ sơ màn** vào
    <QA_TESTCASE_DIR>/<Role>/ho-so-man/<TÊN TRÙNG FILE .xlsx>.json
(tự `makedirs`, nên dự án mới / thư mục rỗng cũng tự có). Hồ sơ màn là **bằng chứng grounding**
của chính bộ case đó — để rời nhau thì sau này không biết bộ case sinh từ dữ kiện nào.
Chạy bằng `--cn` (không có `--spec`) thì script CẢNH BÁO chứ không im lặng.

Sau khi ghi:
    python3 patch_quota.py <Role> <TênFile>      # bơm case theo định mức
    python3 formula_layer.py <file.xlsx>         # áp 6 lớp công thức
    python3 audit_validate_quota.py <Role> <Tên> # phải ra 0·0·0·0·0·0·0 (7 ô)
"""
import argparse, glob, io, json, os, re, shutil, sys, unicodedata, zipfile

import tcfix
try:
    import roles as _roles
except SystemExit:
    _roles = None
try:
    import qalib                     # chỉ dùng cho cảnh báo LẠC CHỖ — thiếu thì bỏ qua phép này
except Exception:
    qalib = None

# ── 2 case ZOOM: bản chữ CHUẨN của prompt v3 §5.5 ────────────────────────────────────────
# Mẫu (và mọi file nền chép theo mẫu) ghi **NGƯỢC NGHĨA** ở cột D: zoom in -> "thu nhỏ".
# §5.5 đã chốt bản đúng, nhưng KHÔNG chỗ nào thi hành ⇒ `lift()` chép verbatim nên MỌI bộ case
# sinh bằng tool_v2 thừa hưởng lỗi (đo 2026-09-09 trên `file-nen/file-nen.xlsx`: zoom in ->
# "Giao diện thu nhỏ theo độ zoom"), ×2 case × số CN, và không phép rà nào soi.
# Sửa TẠI GỐC ở đây thì bộ mới sinh ra đã đúng; bộ cũ dùng `sync_gdc_zoom_steps.py --apply`.
# Bản chữ chuẩn nằm ở `qalib.ZOOM_C` / `qalib.ZOOM_D` — dùng chung với `sync_gdc_zoom_steps`
# và `audit_extra` phép ⑨, để ba chỗ không lệch nhau.


def sua_zoom(cases):
    """([case đã sửa], số case sửa) — ghi lại C/D của 2 case zoom theo §5.5.

    `lift()` trả TUPLE (bất biến) nên phải dựng danh sách mới, không gán tại chỗ.
    """
    ra, n = [], 0
    for c in cases:
        k = qalib.zoom_kieu(c[0]) if qalib else None
        moi = c
        if k:
            cc, dd = qalib.ZOOM_C[k], qalib.ZOOM_D[k]
            if (c[1], c[2]) != (cc, dd):
                moi = (c[0], cc, dd)
                n += 1
        # Case `Kiểm tra tổng thể giao diện màn hình` cũng là bản chữ CỐ ĐỊNH của mẫu — file nền
        # đang giữ bản rút gọn nên phải áp lại ngay lúc trích (chỉ thị 2026-09-11).
        elif qalib and qalib.la_case_tong_the(c[0]):
            if (c[1], c[2]) != (qalib.TONG_THE_C, qalib.TONG_THE_D):
                moi = (c[0], qalib.TONG_THE_C, qalib.TONG_THE_D)
                n += 1
        ra.append(moi)
    return ra, n


BUCKETS = ('Giao diện', 'Chức năng', 'An toàn thông tin')
SUB_VALIDATE = 'Validate các trường thông tin'
SUB_GDC = 'Giao diện chung'


def die(msg):
    raise SystemExit('LỖI: ' + msg)


def locked(path):
    d, n = os.path.dirname(path) or '.', os.path.basename(path)
    return bool(glob.glob(os.path.join(d, '.~lock.%s#' % n)))


def rename_sheet(path, old, new):
    """Đổi tên sheet + sửa công thức ở sheet khác đang trỏ tên cũ (giữ nguyên mọi part khác)."""
    z = zipfile.ZipFile(path)
    items = {'xl/workbook.xml': z.read('xl/workbook.xml').decode()
             .replace('name="%s"' % old, 'name="%s"' % new).encode()}
    for n in z.namelist():
        if n.startswith('xl/worksheets/'):
            d = z.read(n).decode('utf-8', 'ignore')
            if old in d:
                items[n] = d.replace(old, new).encode()
    tmp = path + '.tmp'
    zo = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
    for it in z.infolist():
        zo.writestr(it, items.get(it.filename) or z.read(it.filename))
    zo.close(); z.close(); os.replace(tmp, path)


# ══════════════════════════════════════════════════════════════════════════════
# LƯU HỒ SƠ MÀN (L3) CẠNH BỘ CASE  —  chốt 2026-09-09
# ══════════════════════════════════════════════════════════════════════════════
# Vì sao: `--spec` nhận đường dẫn tuỳ ý và tài liệu KHÔNG quy định chỗ đặt, nên hồ sơ màn
# (bằng chứng grounding của chính bộ case đó) hay nằm rời một chỗ khác. Hệ quả đã thấy:
# `QuanTri/ChucVu` đến giờ vẫn treo `[CẦN VERIFY]` tên bảng DB vì không ai biết lúc sinh
# nó ground từ dữ kiện nào. Nay hồ sơ luôn được cất **cạnh** bộ case, TÊN TRÙNG file .xlsx.
HO_SO_DIR = 'ho-so-man'


def noi_luu_ho_so(out, subdir_src=None):
    """Thư mục cất hồ sơ màn: ANH EM của thư mục chứa file .xlsx.

    `<...>/<Role>/testcase/X.xlsx`  ->  `<...>/<Role>/ho-so-man/`
    Thư mục đích không tên như `subdir_src` của hồ sơ dự án (bố trí lạ) thì cất NGAY CẠNH
    file .xlsx để không tự đoán sai chỗ.
    """
    d = os.path.dirname(os.path.abspath(out))
    if subdir_src and os.path.basename(d).lower() != str(subdir_src).lower():
        return os.path.join(d, HO_SO_DIR)
    return os.path.join(os.path.dirname(d), HO_SO_DIR)


def luu_ho_so(spec_path, out, subdir_src=None, apply_=False):
    """Copy hồ sơ màn vào chỗ chuẩn, đặt TÊN TRÙNG file .xlsx (đổi đuôi .json)."""
    dst_dir = noi_luu_ho_so(out, subdir_src)
    dst = os.path.join(dst_dir, os.path.splitext(os.path.basename(out))[0] + '.json')
    if not apply_:
        print('  hồ sơ màn -> %s (chưa ghi, đang DRY-RUN)' % dst)
        return dst
    if os.path.abspath(spec_path) == os.path.abspath(dst):
        print('  hồ sơ màn: đã nằm đúng chỗ (%s)' % dst)
        return dst
    os.makedirs(dst_dir, exist_ok=True)
    cu = None
    if os.path.exists(dst):
        cu = io.open(dst, encoding='utf-8').read()
    moi = io.open(spec_path, encoding='utf-8').read()
    io.open(dst, 'w', encoding='utf-8').write(moi)
    if cu is None:
        print('  hồ sơ màn -> %s (đã lưu cạnh bộ case)' % dst)
    elif cu != moi:
        print('  hồ sơ màn -> %s (GHI ĐÈ bản cũ — nội dung đã khác)' % dst)
    else:
        print('  hồ sơ màn -> %s (không đổi)' % dst)
    return dst


def set_cell(tc, rn, col, txt):
    body = tc.rows[rn]['body']
    cm = re.search(r'<c r="%s%d"[^>]*?(?:/>|>.*?</c>)' % (col, rn), body, re.S)
    if not cm:
        return
    st = re.search(r's="(\d+)"', cm.group(0))
    tc.rows[rn]['body'] = body.replace(cm.group(0),
        '<c r="%s%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
        % (col, rn, st.group(1) if st else '0', tcfix.esc(txt)))


def lift(tc, want_sub=None, want_grp=None):
    """Trích VERBATIM case của khối ĐẦU TIÊN khớp tên (sub hoặc grp).

    File nền có nhiều CN, mỗi CN lại có `Giao diện chung` và khối ATTT riêng — gom hết là
    nhân bản (đã dính: 62 case thay vì 6). Lấy đúng khối đầu tiên rồi dừng.
    """
    out, on, done = [], False, False
    for rn in tc.order:
        if rn < 12 or done:
            continue
        lv, txt = tc.lvl(rn), (tc.c(rn, 'B') or '').strip()
        if lv in ('cn', 'grp', 'sub', 'sub2'):
            was = on
            if want_sub is not None:
                on = (lv == 'sub' and txt == want_sub)
            else:
                on = (lv == 'grp' and txt == want_grp) or (on and lv in ('sub', 'sub2'))
            if was and not on and out:
                done = True
            continue
        if on and lv == 'case':
            out.append((txt, tc.c(rn, 'C') or '', tc.c(rn, 'D') or ''))
    # ── 0 case mà tên khối CÓ trong nền = lỗi SUY CẤP, không phải nền thiếu khối ──────────
    # Vá 2026-09-10. `tcfix.TC.LV` suy cấp tiêu đề từ style ô B; suy lệch thì `lvl()` trả
    # 'case'/sai cấp cho dòng tiêu đề, `on` không bao giờ bật, hàm này trả [] LẶNG LẼ và bộ
    # case sinh ra thiếu hẳn 6 case `Giao diện chung` — không phép rà nào bắt vì file vẫn
    # hợp lệ. Ba đường suy lệch đã đo: xem khối chú thích ở `tcfix.TC.__init__`.
    # Chỉ báo lỗi khi tên khối THỰC SỰ có trong cột B: nền không có khối ATTT là chuyện
    # bình thường (`--lift-attt` không bắt buộc), phải trả [] như cũ.
    ten = want_sub if want_sub is not None else want_grp
    if not out and ten:
        co = [rn for rn in tc.order
              if rn >= 12 and (tc.c(rn, 'B') or '').strip() == ten and not tc.c(rn, 'C')]
        if co:
            die('nền có dòng %r ở r%d nhưng lift() ra 0 case: tcfix suy SAI cấp tiêu đề '
                '(LV=%s, suy từ %s; cấp đọc được ở r%d = %r).\n'
                '  Nền phải có 4 cấp cn/grp/sub/sub2 mỗi cấp một style, và không có dòng '
                'đệm mang style riêng. Soi bằng: python3 -c "import tcfix; '
                "tc=tcfix.load('<nền>'); print(tc.LV, tc.LV_nguon); tc.dump(12, 70)\""
                % (ten, co[0], tc.LV, tc.LV_nguon, co[0], tc.lvl(co[0])))
    return out


# ══════════════════════════════════════════════════════════════════════════════
# KHỐI BƯỚC Ở DÒNG CN  (PROMPT v3 §4)
# ══════════════════════════════════════════════════════════════════════════════
# Mẫu `templateTestcase/DanhMucTuDienDungChung.xlsx` đặt Ở CỘT B của dòng CN (vàng):
#
#     <TÊN CN>
#     1. <entry của dự án> > Đăng nhập tài khoản <vai trò>
#     2. Kéo xuống phần <app> > chọn <menu> > chọn <mục> > chọn <màn>
#     3. <thao tác mở CN>                     <- CN Danh sách KHÔNG có bước 3
#
# Cột C/D của dòng CN vẫn RỖNG. Trước 2026-09-08 script chỉ ghi TÊN CN nên MỌI bộ case
# sinh bằng tool_v2 đều thiếu hẳn khối này, mà không phép rà nào bắt: bộ rà chốt
# `qalib.scan_quota` đọc `.split('\n')[0]` nên chỉ thấy dòng đầu. Rà bằng `audit_cn_buoc.py`.

# Bước 3 verbatim mẫu, tra theo tên CN (r12·r94·r151·r294·r433·r461·r488·r579·r590).
BUOC3_MAU = [
    (('danh sach',),        None),                       # mẫu KHÔNG có bước 3
    (('tim kiem', 'tra cuu'), 'Xem phần tìm kiếm'),
    (('them moi', 'tao moi'), 'Click Thêm mới'),
    (('chinh sua', 'cap nhat'), 'Click icon chỉnh sửa'),
    (('xoa',),              'Click icon xóa bản ghi Hoạt động\n'
                            'Hoặc tích chọn bản ghi Hoạt động > Chọn button Xóa'),
    (('khoi phuc',),        'Click icon khôi phục bản ghi Không hoạt động\n'
                            'Hoặc tích chọn bản ghi Không hoạt động > Chọn button Khôi phục'),
    (('nhap excel',),       'Click Nhập excel'),
    (('xuat excel',),       'Click Xuất excel'),
    (('xem chi tiet',),     'Click tên danh mục'),
]
# CN chỉ-đọc -> bước 1 dùng danh sách vai trò ĐẦY ĐỦ (mẫu r12·r94·r579·r590).
# ⚠️ CHỈ còn dùng khi bộ case KHÔNG gắn với một vai trò cụ thể. Xem `vai_tro_buoc1()`.
CN_CHI_DOC = ('danh sach', 'tim kiem', 'tra cuu', 'xem chi tiet', 'xuat excel')


def role_tu_duong_dan(path):
    """Suy VAI TRÒ của bộ case từ đường dẫn file đích -> tên role, hoặc None.

    `new_from_base.py` không có cờ `--role`; vai trò nằm sẵn trong tên file
    (`Testcase-Role-<Role>-<Màn>.xlsx`) và trong thư mục (`testCase/<Role>/testcase/`).
    Khớp bằng `strip`/`dir` ĐÃ KHAI trong hồ sơ dự án chứ không cắt chuỗi theo cảm tính —
    mỗi dự án một khuôn tên khác nhau.
    """
    try:
        import roles as _r
    except Exception:
        return None
    base, full = os.path.basename(path or ''), os.path.abspath(path or '')
    for ten, cfg in (_r.ROLES or {}).items():
        st = cfg.get('strip')
        if st and base.startswith(st):
            return ten
    for ten, cfg in (_r.ROLES or {}).items():
        d = cfg.get('dir')
        if d and full.startswith(os.path.abspath(d)):
            return ten
    return None


def vai_tro_buoc1(ten_cn, spec, prj, role=None):
    """Vai trò ghi ở bước 1 của khối bước dòng CN -> (chuỗi, lý do nếu không có).

    Chỉ thị người đặt việc 2026-09-12: **bộ case sinh cho vai trò nào thì bước 1 ghi ĐÚNG vai
    trò đó**, không ghi tràn lan cả danh sách. Sinh cho `ChuyenVien` mà bước 1 ghi
    `Quản trị viên/ Chuyên viên/ Lãnh đạo Bộ/ Đơn vị nguồn/ Sở GD&ĐT/ Trường học` là sai —
    người test đọc không biết phải đăng nhập bằng tài khoản nào.

    Thứ tự tra:
      1. `vai_tro` khai thẳng trong hồ sơ màn  (màn đặc thù đè lên mặc định của vai trò)
      2. `ten_vai_tro` của chính vai trò đang sinh, trong hồ sơ dự án
      3. `role_xem`/`role_ghi` của dự án — CHỈ khi không biết đang sinh cho vai trò nào
    Vai trò chưa khai `ten_vai_tro` thì BÁO THIẾU, **không** tụt về danh sách đầy đủ: thà gắn
    cờ còn hơn ghi sai tên tài khoản (§11.4).
    """
    rieng = spec.get('vai_tro')
    if rieng:
        return rieng, None
    if role:
        try:
            import roles as _r
            ten = (_r.ROLES.get(role) or {}).get('ten_vai_tro')
        except Exception:
            ten = None
        if ten:
            return ten, None
        return None, ('vai trò "%s" chưa khai "ten_vai_tro" trong hồ sơ dự án' % role)
    chi_doc = any(k in _norm(ten_cn) for k in CN_CHI_DOC)
    vt = (spec.get('vai_tro_xem' if chi_doc else 'vai_tro_ghi')
          or (prj or {}).get('role_xem' if chi_doc else 'role_ghi'))
    return (vt, None) if vt else (None, 'hồ sơ dự án chưa khai role_xem/role_ghi')


def _norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def buoc3_of(ten):
    """Bước 3 mặc định theo loại CN; None = CN Danh sách (mẫu không có bước 3)."""
    n = _norm(ten)
    for kws, b3 in BUOC3_MAU:
        if any(k in n for k in kws):
            return b3
    return None


def cn_text(ten, spec, prj, role=None):
    """Cột B của dòng CN: tên + bước đăng nhập + đường dẫn + thao tác mở CN.

    Thiếu `nav` trong hồ sơ màn thì trả về TÊN TRẦN (giữ tương thích lệnh --cn cũ),
    kèm cảnh báo — không tự bịa đường dẫn.
    """
    nav = spec.get('nav')
    if not nav:
        return ten, 'hồ sơ màn chưa khai "nav"'
    if isinstance(nav, str):
        nav = [x.strip() for x in re.split(r'>', nav) if x.strip()]
    entry = spec.get('entry') or (prj or {}).get('entry') \
        or ('Vào %s' % (prj or {}).get('title', 'hệ thống'))
    vai_tro, thieu = vai_tro_buoc1(ten, spec, prj, role)
    if not vai_tro:
        return ten, thieu
    lines = ['%s > Đăng nhập tài khoản %s' % (entry, vai_tro),
             'Kéo xuống phần ' + ' > chọn '.join(nav)]
    return '\n'.join([ten] + ['%d. %s' % (i, t) for i, t in enumerate(lines, 1)]), None


# ── CẢNH BÁO LẠC CHỖ ngay lúc SINH (chỉ thị người đặt việc 2026-09-09) ────────────────────
# *"các chức năng liên quan đến lọc và tìm kiếm cần để ở chức năng lọc và tìm kiếm"*.
# Khai bộ lọc vào CN `DANH SÁCH …` thì `qalib.la_bo_loc()` trả False cho mọi nhóm của nó ⇒
# `patch_timkiem_donle` / `patch_kethop` KHÔNG dựng khối nào và `audit_timkiem` phép ①②③④
# không có gì để xét ⇒ mất trọn khối tìm kiếm TRONG IM LẶNG (đo 09/09: 45 case, 10/10 bộ rà 0).
# Nói ra ngay ở bước sinh thì rẻ hơn phát hiện lúc nghiệm thu. Chỉ CẢNH BÁO, không tự sửa —
# tách CN là quyết định của người khai hồ sơ màn.
LOC_DUONG = ('tim kiem', 'tim theo', 'o tim', 'tim nhanh', 'bo loc', 'loc theo',
             'trang thai', 'tu ngay', 'den ngay', 'tu gio', 'den gio', 'khoang ngay')


def canh_bao_lac_cho(cns):
    """In cảnh báo `!!` nếu control lọc / nhóm `Chức năng Tìm kiếm …` khai ở CN không phải tìm kiếm."""
    if qalib is None: return
    ra = []
    co_cn_tk = [c['ten'] for c in cns if qalib.loai_cn(c['ten']) == 'tim_kiem']
    for c in cns:
        loai = qalib.loai_cn(c['ten'])
        if loai == 'tim_kiem': continue
        for f in c.get('chuc_nang') or []:
            if 'chuc nang tim kiem' in qalib.norm(f):
                ra.append((c['ten'], f, 'nhóm chức năng tìm kiếm'))
        if loai != 'khac': continue                # CN biểu mẫu có quyền mang ô Trạng thái/Từ ngày
        # ⚠️ MIỄN TRỪ CN Nhập/Xuất excel: `controls` của nó là **cột của bảng tính**, không phải
        # control trên màn — đo 09/09: hồ sơ `TrinhDoDaoTao` bị báo oan `Selectbox Trạng thái`.
        if 'excel' in qalib.norm(c['ten']): continue
        for g in c.get('controls') or []:
            n = qalib.norm(g)
            if any(k in n for k in qalib.NHOM_KHUNG): continue
            if any(k in n for k in LOC_DUONG):
                ra.append((c['ten'], g, 'control lọc/tìm kiếm'))
    if not ra: return
    print('!! LẠC CHỖ — %d chỗ khai lọc/tìm kiếm ở CN không phải CN Tìm kiếm & lọc:' % len(ra))
    for ten_cn, g, kieu in ra:
        print('   · %-46s %s `%s`' % (ten_cn[:46], kieu, g))
    print('   ⇒ Tách sang một CN riêng tên có chữ "TÌM KIẾM"/"LỌC" (§6), không thì `patch_timkiem_donle`'
          ' + `patch_kethop` bỏ qua và không phép rà nào kêu.'
          + ('\n   (file đã có CN tìm kiếm: %s)' % co_cn_tk[0] if co_cn_tk else ''))


# ══════════════════════════════════════════════════════════════════════════════
# MÀN PHỤ — TOOL PHẢI HỎI CHỖ ĐẶT, KHÔNG TỰ QUYẾT  (chỉ thị người đặt việc 2026-09-10)
# ══════════════════════════════════════════════════════════════════════════════
# `probe_routes.py --sau` dò ra màn phụ, `audit_man_phu.py` chặn lỗi thiếu hẳn màn — nhưng
# GIỮA hai đầu đó không ai quyết **chỗ đặt**, và tool thì lặng lẽ dựng một sheet duy nhất.
# Hai lối hợp lệ, khác nhau ở mã case và ở dòng Tổng hợp:
#   · `cung_sheet`  — CN của màn phụ nối tiếp trong CÙNG sheet, mã case CHUNG một dãy
#                     (lối màn `Chi tiết lỗi` đã gộp vào `Dữ liệu lỗi`);
#   · `sheet_rieng` — thêm sheet `BP-…` thứ hai trong cùng file, mã case đánh dãy RIÊNG.
# Chọn sai là phải dựng lại từ đầu (mã case đã đánh), nên tool **DỪNG LẠI HỎI** thay vì đoán.
NOI_DAT_HOP_LE = ('cung_sheet', 'sheet_rieng')

CAU_HOI = [
    '',
    '   Cho vào ĐÂU?',
    '     [1] cung_sheet   — nối tiếp trong CÙNG sheet BP đang dựng; mã case CHUNG một dãy,',
    '                        một dòng Tổng hợp. Khai CN của màn phụ thẳng vào "cn" của hồ sơ màn.',
    '     [2] sheet_rieng  — thêm sheet BP thứ hai trong CÙNG file; mã case đánh dãy RIÊNG.',
    '                        Mục màn phụ phải khai thêm "sheet", "prefix" và "cn": [ … ].',
    '',
    '   Trả lời bằng MỘT trong hai cách:',
    '     · thêm khoá  "noi_dat": "cung_sheet"  (hoặc "sheet_rieng") vào từng mục "man_phu"',
    '     · hoặc chạy lại kèm  --man-phu cung_sheet  (áp cho mọi mục chưa quyết)',
    '',
    '   (Mục cố ý KHÔNG làm thì khai "bo_qua": "<lý do>" — tool bỏ qua, audit_man_phu không tính lỗi.)',
]


def hoi_noi_dat(spec, tra_loi):
    """[(mục màn phụ, nơi đặt)] — DỪNG chương trình nếu còn mục chưa quyết chỗ đặt.

    Trả rỗng khi hồ sơ chưa khai `man_phu` (đã có `audit_man_phu` lo việc đó) hoặc mọi mục
    đều `bo_qua`.
    """
    mp = spec.get('man_phu')
    if not mp:
        return []
    ra, chua = [], []
    for muc in mp:
        if isinstance(muc, str):
            muc = {'route': muc}
        if muc.get('bo_qua'):
            continue
        nd = muc.get('noi_dat') or tra_loi
        if nd not in NOI_DAT_HOP_LE:
            chua.append(muc)
        else:
            ra.append((muc, nd))
    if chua:
        print('\n?? CẦN NGƯỜI ĐẶT VIỆC QUYẾT — %d màn phụ chưa có chỗ đặt:' % len(chua))
        for muc in chua:
            print('   · %-38s %s' % ((muc.get('route') or '?')[:38], muc.get('ten') or ''))
        for d in CAU_HOI:
            print(d)
        die('chưa quyết chỗ đặt màn phụ — xem câu hỏi ở trên, KHÔNG tự đoán')
    return ra


def them_sheet(path, base, ten_sheet):
    """Thêm một sheet BP nữa vào file đã dựng, ruột chép từ sheet BP của file NỀN.

    Chép từ chính file nền nên chỉ mục style trùng khớp (file đích vốn cũng clone từ nền đó).
    Sheet BP của bộ này không có rels/drawing riêng nên chỉ phải khai 3 chỗ:
    `workbook.xml` · `_rels/workbook.xml.rels` · `[Content_Types].xml`.
    """
    zb = zipfile.ZipFile(base)
    tb = tcfix.load(base)
    ruot = zb.read(tb.tcf)
    zb.close()

    z = zipfile.ZipFile(path)
    wb = z.read('xl/workbook.xml').decode()
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    ct = z.read('[Content_Types].xml').decode()
    if 'name="%s"' % ten_sheet in wb:
        z.close()
        return False                                    # đã có sheet này rồi
    nums = [int(x) for x in re.findall(r'xl/worksheets/sheet(\d+)\.xml', ' '.join(z.namelist()))]
    stt = max(nums or [0]) + 1
    part = 'xl/worksheets/sheet%d.xml' % stt
    rid = 'rId%d' % (max([int(x) for x in re.findall(r'Id="rId(\d+)"', rels)] or [0]) + 1)
    sid = max([int(x) for x in re.findall(r'sheetId="(\d+)"', wb)] or [0]) + 1
    wb = wb.replace('</sheets>', '<sheet name="%s" sheetId="%d" state="visible" r:id="%s"/></sheets>'
                    % (ten_sheet, sid, rid))
    rels = rels.replace('</Relationships>',
                        '<Relationship Id="%s" Type="http://schemas.openxmlformats.org/'
                        'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"'
                        '/></Relationships>' % (rid, stt))
    ct = ct.replace('</Types>', '<Override PartName="/%s" ContentType="application/vnd.'
                    'openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' % part)
    items = {'xl/workbook.xml': wb.encode(), 'xl/_rels/workbook.xml.rels': rels.encode(),
             '[Content_Types].xml': ct.encode()}
    tmp = path + '.tmp'
    zo = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
    for it in z.infolist():
        zo.writestr(it, items.get(it.filename) or z.read(it.filename))
    zo.writestr(part, ruot)
    zo.close(); z.close(); os.replace(tmp, path)
    return True


def dung_ruot(tc, cns, spec, prj, gdc, attt, p=None, role=None):
    """Dựng khung 4 khối cho một sheet — dùng chung cho sheet chính, sheet màn phụ và `--them-cn`.

    `p` = Plan có sẵn (đã `keep_rest`) khi chỉ NỐI THÊM CN vào bộ case đã có.
    """
    p = p if p is not None else tcfix.Plan(tc)
    for cn in cns:
        ten = cn['ten'].upper()
        txt, why = cn_text(ten, spec, prj, role)
        b3 = cn.get('buoc3', buoc3_of(ten)) if not why else None
        if b3 and not why:
            txt += '\n%d. %s' % (txt.count('\n') + 1, b3)
        if why:
            print('  ⚠ %-44s dòng CN chỉ có TÊN (%s) — mẫu đòi kèm bước '
                  'đăng nhập + đường dẫn, xem PROMPT v3 §4' % (ten[:44], why))
        p.add_cn(txt)
        p.add_grp('Giao diện')
        p.add_sub(SUB_GDC)
        for md, b, k in gdc:
            p.case(md, b, k)
        p.add_sub(SUB_VALIDATE)
        for c in cn['controls']:
            p.add_sub2(c)
        p.add_grp('Chức năng')
        for f in cn.get('chuc_nang') or ['Chức năng %s' % cn['ten'].capitalize()]:
            # Tên nhóm chức năng phải theo BẢN CHUẨN của mẫu, nếu không patcher không bơm mà bộ
            # rà cũng không đòi -> nhóm rỗng vĩnh viễn (xem `qalib.TEN_NHOM_CN_CHUAN`).
            if qalib:
                chuan = qalib.ten_nhom_cn_chuan(f)
                if chuan != f:
                    print('  ⚠ %-40s tên nhóm chức năng -> "%s" (bản chuẩn của mẫu)'
                          % (f[:40], chuan))
                    f = chuan
                if qalib.cn_khong_tra_duoc_bo_muc(f):
                    print('  ⚠ %-40s KHÔNG bộ mục nào của mẫu tra ra tên nhóm này — sẽ không '
                          'patcher nào bơm case, phải viết tay hoặc đổi tên' % f[:40])
            p.add_sub(f)
        if cn.get('attt', True):
            p.add_grp('An toàn thông tin')
            for md, b, k in attt:
                p.case(md, b, k)
    return p


def parse_cn(spec_str):
    """"TÊN CN:control 1,control 2"  ->  dict"""
    ten, _, ctrls = spec_str.partition(':')
    return dict(ten=ten.strip(),
                controls=[c.strip() for c in ctrls.split(',') if c.strip()],
                chuc_nang=[], attt=True)


def them_cn(a, spec, cns):
    """NỐI THÊM CN vào bộ case ĐÃ CÓ — giữ nguyên toàn bộ case cũ.

    Thêm 2026-09-10. Trước đó bộ tool chỉ DỰNG MỚI được cả file: nhập màn phụ vào CÙNG sheet
    (`noi_dat: "cung_sheet"`) phải sinh lại từ đầu, tức mất trắng phần A6 đã ghi tay ở cột C/D
    của bộ case cũ. Đây là lỗ hổng thật của quy trình gộp màn phụ, không phải tiện ích.

    Dùng lại `dung_ruot()` nên khung CN nối thêm GIỐNG HỆT khung sinh mới (cùng khối bước §4.1,
    cùng `Giao diện chung` verbatim, cùng thứ tự 4 khối).
    """
    if not os.path.exists(a.out):
        die('--them-cn cần một bộ case ĐÃ CÓ ở %s' % a.out)
    if locked(a.out):
        die('file đích đang mở trong LibreOffice (.~lock) — đóng rồi chạy lại')
    base = a.base or spec.get('base') or (_roles and _roles.PROJECT.get('base_file'))
    if not base or not os.path.exists(base):
        die('cần file nền để lấy 6 case "%s" verbatim (--base hoặc `base_file` hồ sơ dự án)' % SUB_GDC)

    muon = [n(x) for x in a.them_cn] if False else [x.strip().upper() for x in a.them_cn]
    chon = [c for c in cns if c['ten'].strip().upper() in muon]
    thieu = [x for x in muon if not any(c['ten'].strip().upper() == x for c in cns)]
    if thieu:
        die('hồ sơ màn không có CN: %s' % ' · '.join(thieu))

    tc = tcfix.load(a.out, a.sheet) if a.sheet else tcfix.load(a.out)
    co_san = {(tc.c(rn, 'B') or '').split('\n')[0].strip().upper()
              for rn in tc.order if rn >= 12 and tc.lvl(rn) == 'cn'}
    trung = [c['ten'] for c in chon if c['ten'].strip().upper() in co_san]
    if trung:
        die('CN đã có sẵn trong sheet %s: %s — nối thêm nữa là đẻ trùng'
            % (tc.bpname, ' · '.join(trung)))

    gdc, _ = sua_zoom(lift(tcfix.load(base), want_sub=SUB_GDC))
    prj = _roles.PROJECT if _roles else {}
    truoc = len([rn for rn in tc.order if rn >= 12 and tc.lvl(rn) == 'case'])
    print('Nối thêm vào %s (sheet %s) — đang có %d case:'
          % (os.path.basename(a.out), tc.bpname, truoc))
    for c in chon:
        print('  + CN %-46s %d nhóm control' % (c['ten'][:46], len(c['controls'])))
    if not a.apply:
        print('\n(DRY-RUN — thêm --apply để ghi)')
        return
    p = tcfix.Plan(tc).keep_rest(12)
    dung_ruot(tc, chon, spec, prj, gdc, [], p=p, role=role_tu_duong_dan(tc.path))
    tc.rebuild(p).save(sync=True)
    sau, errs = tcfix.verify(a.out)
    print('\nĐã ghi %s — %d -> %d case, verify: %s'
          % (a.out, truoc, sau, 'OK' if not errs else errs))
    if a.spec:
        luu_ho_so(a.spec, a.out, (_roles and _roles.PROJECT.get('subdir_src')), apply_=True)
    print('Tiếp: patch_quota.py -> complete_*.py -> formula_layer.py (chạy lại cả chuỗi cho CN mới)')


def main():
    ap = argparse.ArgumentParser(description='Dựng file test case mới từ file nền chuẩn')
    ap.add_argument('--out', required=True, help='file .xlsx sẽ tạo')
    ap.add_argument('--base', help='file nền (mặc định: PROJECT["base_file"] của hồ sơ dự án)')
    ap.add_argument('--prefix', help='tiền tố mã case, ghi vào D3 (vd: Kho -> Kho_1, Kho_2…)')
    ap.add_argument('--title', help='tên màn, ghi vào D2')
    ap.add_argument('--sheet', help='tên sheet test case (mặc định: BP-<prefix>)')
    ap.add_argument('--cn', action='append', default=[], help='"TÊN CN:control1,control2" (lặp nhiều lần)')
    ap.add_argument('--spec', help='hồ sơ màn dạng JSON (L3)')
    ap.add_argument('--apply', action='store_true', help='ghi thật (mặc định chỉ in kế hoạch)')
    ap.add_argument('--force', action='store_true', help='cho phép ghi đè file đã tồn tại')
    ap.add_argument('--them-cn', action='append', default=[], dest='them_cn',
                    help='NỐI THÊM một CN (theo tên, lấy khung từ --spec) vào bộ case ĐÃ CÓ ở '
                         '--out, giữ nguyên mọi case cũ. Dùng để nhập màn phụ vào CÙNG sheet '
                         '(noi_dat="cung_sheet"). Lặp nhiều lần cho nhiều CN.')
    ap.add_argument('--man-phu', choices=NOI_DAT_HOP_LE, dest='man_phu',
                    help='chỗ đặt CN của MÀN PHỤ: cung_sheet (chung sheet, chung dãy mã case) '
                         'hoặc sheet_rieng (thêm sheet BP thứ hai trong cùng file). Không truyền '
                         'và hồ sơ màn cũng chưa khai `noi_dat` thì tool DỪNG LẠI HỎI.')
    ap.add_argument('--lift-attt', action='store_true',
                    help='chép luôn khối ATTT của file nền. MẶC ĐỊNH TẮT: case ATTT của file nền mang '
                         'ngữ cảnh riêng ("màn Danh mục Thiết bị", "nhóm Nhà cung cấp") nên chép sang '
                         'màn khác là sai. Để trống thì complete_attt.py sinh theo từ vựng hồ sơ dự án.')
    a = ap.parse_args()

    spec = json.load(open(a.spec, encoding='utf-8')) if a.spec else {}
    cns = spec.get('cn') or [parse_cn(s) for s in a.cn]
    for c in cns:                                  # mặc định 1 nhóm Chức năng theo tên CN
        c.setdefault('chuc_nang', []) or c.__setitem__(
            'chuc_nang', ['Chức năng %s' % c['ten'].strip().capitalize()])
    prefix = a.prefix or spec.get('prefix')
    title = a.title or spec.get('title') or prefix
    base = a.base or spec.get('base') or (_roles and _roles.PROJECT.get('base_file'))
    if not cns:    die('chưa khai báo CN nào (--cn hoặc --spec)')
    canh_bao_lac_cho(cns)
    mp = hoi_noi_dat(spec, a.man_phu)            # DỪNG nếu còn màn phụ chưa quyết chỗ đặt
    mp_rieng = [m for m, nd in mp if nd == 'sheet_rieng']
    for m, nd in mp:
        # `cung_sheet` = CN của màn phụ phải nằm ngay trong "cn" của hồ sơ màn này.
        if nd != 'cung_sheet' or qalib is None:
            continue
        want = qalib.norm(m.get('cn') or m.get('ten') or '')
        if want and not any(qalib.norm(c['ten']) == want for c in cns):
            print('  ⚠ màn phụ %s khai noi_dat="cung_sheet" nhưng "%s" KHÔNG có trong "cn" của '
                  'hồ sơ màn — khai thêm CN đó, không thì audit_man_phu sẽ báo [THIẾU CN]'
                  % (m.get('route') or '?', m.get('cn') or m.get('ten')))
    for m in mp_rieng:
        if not (m.get('sheet') and isinstance(m.get('cn'), list)):
            die('màn phụ %s khai noi_dat="sheet_rieng" thì phải khai thêm "sheet" (tên sheet BP), '
                '"prefix" và "cn": [ … ] cho chính màn phụ đó' % (m.get('route') or '?'))
    if not prefix: die('thiếu --prefix (tiền tố mã case)')
    if not base:   die('thiếu --base và hồ sơ dự án chưa khai `base_file`')
    if not os.path.exists(base): die('không thấy file nền: %s' % base)
    if a.them_cn:
        return them_cn(a, spec, cns)
    if os.path.exists(a.out) and not a.force: die('%s đã tồn tại (dùng --force nếu thật sự muốn đè)' % a.out)
    if locked(a.out):
        die('file đích đang mở trong LibreOffice (.~lock) — đóng rồi chạy lại')
    if locked(base):
        print('Lưu ý: file nền đang mở trong LibreOffice — chỉ ĐỌC nên vẫn chạy, '
              'nội dung lấy theo bản đã lưu trên đĩa.')

    # ---- đọc khung chuẩn từ file nền
    try:
        tb = tcfix.load(base)
    except KeyError:
        die('file nền không có sheet tên bắt đầu bằng "BP" nên tcfix không đọc được.\n'
            '      Chuyển file nền về khung chuẩn trước (xem khaibao_shell_0817.py), hoặc chọn nền khác.')
    gdc = lift(tb, want_sub=SUB_GDC)                     # generic, chép verbatim là ĐÚNG luật wording
    attt = lift(tb, want_grp='An toàn thông tin') if a.lift_attt else []
    if len(gdc) != 6:
        print('CẢNH BÁO: file nền có %d case "%s" (luật: ĐÚNG 6) — kiểm lại file nền.' % (len(gdc), SUB_GDC))
    gdc, n_zoom = sua_zoom(gdc)
    if n_zoom:
        print('Zoom  : sửa %d/2 case zoom về bản chữ chuẩn §5.5 (nền ghi NGƯỢC nghĩa cột D)'
              % n_zoom)
    # §4: đúng 20 cột A..T. `Plan._row()` chép khuôn cột từ nền, nên nền sai khuôn là MỌI file
    # sinh ra đều sai theo. Sự cố 2026-09-08: `Testcase-Role-QuanTri-LuongDuLieu.xlsx` ra 40 ô
    # mỗi dòng (U..AN rỗng trơn, không header) vì nền bên máy sinh đã 40 ô — không script rà nào
    # của bộ này bắt lúc sinh, chỉ `nghiemthu_0806.py` phát hiện về sau.
    ncell = {len(tb.tpl.get(k) or ()) for k in ('case', 'cn', 'grp', 'sub', 'sub2') if tb.tpl.get(k)}
    if ncell and ncell != {20}:
        print('CẢNH BÁO: file nền có %s ô/dòng (luật §4: ĐÚNG 20, cột A..T) — file sinh ra sẽ '
              'sai khuôn theo. Dọn nền trước, hoặc chọn nền khác.' % '/'.join(map(str, sorted(ncell))))
    print('Nền   : %s  (sheet %s)' % (os.path.basename(base), tb.bpname))
    print('Trích : %d case "Giao diện chung"%s'
          % (len(gdc), ' · %d case ATTT (--lift-attt)' % len(attt) if attt
             else ' · ATTT để trống cho complete_attt.py sinh theo từ vựng dự án'))

    tong = 0
    for cn in cns:
        n = len(gdc) + len(attt)
        _t, _w = cn_text(cn['ten'].upper(), spec, _roles.PROJECT if _roles else {},
                         role_tu_duong_dan(a.out))
        print('\nCN  %s' % cn['ten'])
        if _w:
            print('    ⚠ dòng CN chỉ có TÊN (%s) — mẫu đòi kèm bước đăng nhập + đường dẫn (§4)' % _w)
        else:
            _b3 = cn.get('buoc3', buoc3_of(cn['ten'].upper()))
            for _l in (_t.split('\n')[1:] + (['%d. %s' % (_t.count('\n') + 1, _b3)] if _b3 else [])):
                print('    │ %s' % _l.replace('\n', ' / '))
        print('    Giao diện > %s ......... %d case (chép verbatim)' % (SUB_GDC, len(gdc)))
        print('    Giao diện > %s' % SUB_VALIDATE)
        for c in cn['controls']:
            print('        %-46s (rỗng — patch_quota sẽ bơm)' % c)
        print('    Chức năng')
        for f in cn.get('chuc_nang') or []:
            print('        %-46s (rỗng — bơm theo checklist Chức năng)' % f)
        if cn.get('attt', True):
            print('    An toàn thông tin ...................... %s'
                  % ('%d case (chép verbatim)' % len(attt) if attt else 'rỗng — complete_attt.py sinh'))
        tong += n
    print('\n=> %d CN · %d case nền (chưa tính case patch_quota bơm cho %d nhóm control)'
          % (len(cns), tong, sum(len(c['controls']) for c in cns)))

    if not a.apply:
        if a.spec:
            luu_ho_so(a.spec, a.out, (_roles and _roles.PROJECT.get('subdir_src')), apply_=False)
        print('\n(DRY-RUN — thêm --apply để ghi ra %s)' % a.out)
        return

    # ---- clone + dựng ruột
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    # chạy lại lệnh này là ĐÈ TRẮNG bộ case cũ ở `--out` (đã mất phần A6 một lần vì vậy)
    if qalib:
        qalib.backup(a.out, tag='new_from_base', quiet=False)
    shutil.copy(base, a.out)
    sheet = a.sheet or ('BP-' + prefix)
    if tb.bpname != sheet:
        rename_sheet(a.out, tb.bpname, sheet)

    tc = tcfix.load(a.out)
    tc.prefix = prefix
    set_cell(tc, 2, 'D', title)
    set_cell(tc, 3, 'D', prefix)

    prj = _roles.PROJECT if _roles else {}
    p = dung_ruot(tc, cns, spec, prj, gdc, attt, role=role_tu_duong_dan(tc.path))
    tc.rebuild(p).save(sync=len(mp_rieng) == 0)

    # ---- MÀN PHỤ khai `sheet_rieng`: thêm sheet BP nữa trong CÙNG file
    for m in mp_rieng:
        ten_sheet = m['sheet'] if m['sheet'].upper().startswith('BP') else 'BP-' + m['sheet']
        if not them_sheet(a.out, base, ten_sheet):
            print('  ⚠ sheet "%s" đã có sẵn — bỏ qua, không dựng đè' % ten_sheet)
            continue
        tc2 = tcfix.load(a.out, ten_sheet)
        tc2.prefix = m.get('prefix') or ten_sheet.replace('BP-', '')
        set_cell(tc2, 2, 'D', m.get('ten') or ten_sheet)
        set_cell(tc2, 3, 'D', tc2.prefix)
        for c in m['cn']:
            c.setdefault('chuc_nang', []) or c.__setitem__(
                'chuc_nang', ['Chức năng %s' % c['ten'].strip().capitalize()])
        p2 = dung_ruot(tc2, m['cn'], spec, prj, gdc, attt, role=role_tu_duong_dan(tc2.path))
        tc2.rebuild(p2).save(sync=False)
        print('  + sheet MỚI %-22s %d CN (màn phụ %s)'
              % (ten_sheet, len(m['cn']), m.get('route') or ''))

    n, errs = tcfix.verify(a.out)
    print('\nĐã ghi %s — %d case, verify: %s' % (a.out, n, 'OK' if not errs else errs))
    if a.spec:
        luu_ho_so(a.spec, a.out, (_roles and _roles.PROJECT.get('subdir_src')), apply_=True)
    else:
        print('  ⚠ không có --spec nên KHÔNG lưu được hồ sơ màn cạnh bộ case — bộ case này sẽ '
              'không còn bằng chứng grounding (xem HO-SO-DU-AN.md §B)')
    print('Tiếp: patch_quota.py -> formula_layer.py -> audit_validate_quota.py (chốt 0·0·0·0·0·0·0)')


if __name__ == '__main__':
    main()

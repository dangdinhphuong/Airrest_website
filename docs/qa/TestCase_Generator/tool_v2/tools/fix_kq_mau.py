# -*- coding: utf-8 -*-
"""Trả cột D khối `Validate` về BẢN CHỮ MẪU — hai phép, đều CHỈ trong khối Validate.

Chỉ thị người đặt việc 2026-09-11: *"tham khảo mẫu `DanhMucTuDienDungChung.xlsx` để lấy mẫu câu
kết quả mong muốn cho hợp lý"* + *"chỉ sửa phần validate"*.

① **BỔ SUNG Ý CÒN THIẾU** (`qalib.KQ_MAU` — phép rà ㉔). Mẫu chốt cột D của case *là trường bắt
   buộc* / *dữ liệu đã tồn tại* gồm HAI ý: thông báo lỗi verbatim **và** `Highlight, focus vào
   trường lỗi`. Bộ case đang có nêu đủ thông báo nhưng bỏ hẳn ý thứ hai. Ý này là **MONG ĐỢI**
   theo §8.2 luật 7 (inline dưới ô + viền cam + focus), không phải quan sát — nêu ra để màn nào
   không làm thì case FAIL, đúng việc của test case.

② **CÂU CHỐT CHO HỌ CASE LẶP** (`KHUON_HO`). Hai họ dưới đây lặp gần như nguyên văn ở rất nhiều
   ô mà lại là hai họ dài nhất bộ — rút về một câu chốt, ngắn đúng tầm mẫu:
     · *cách tải dữ liệu khi danh sách … lớn* (20 ca) — bản cũ mở đầu `Ghi nguyên trạng:` rồi
       nêu HAI giả thiết `nếu … nếu …` và khép bằng `Đối chiếu với hành vi đã ground ở hồ sơ
       màn` ⇒ vừa dặn người test (cấm ở §8.2.1) vừa không chốt được kết quả nào.
     · *nhập vượt độ dài cho phép* ở ô KHÔNG có luật độ dài (21 ca) — bản cũ phải viết dài để
       phủ định cả ba ý của khuôn ⑮ (`không có thông báo lỗi nào, không highlight, không focus`).
       Khuôn ⑮ nay đã miễn trừ ô không có luật độ dài nên chỉ cần nhánh `Hoặc …` của mẫu.

    python3 fix_kq_mau.py <role> [tên màn]            # XEM TRƯỚC
    python3 fix_kq_mau.py <role> [tên màn] --apply    # ghi
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audit_noi_dung
import qalib
import roles
import tcfix

# Ý bắt buộc của mẫu mà bộ case hay bỏ -> câu nối thêm vào cuối cột D.
Y_BO_SUNG = {'highlight': 'Highlight, focus vào trường lỗi.'}

# Họ case lặp -> (khoá tiêu đề, dấu nhận bản CŨ, câu chốt mới)
KHUON_HO = (
    ('cach tai du lieu khi danh sach', ('ghi nguyen trang', 'doi chieu voi hanh vi'),
     'Danh sách tải theo trang, cuộn tới cuối thì tự tải tiếp, '
     'không kẹt và không lặp bản ghi.'),
    ('nhap vuot do dai', ('khong khai luat do dai', 'khong co thong bao loi',
                          'thuoc tinh maxlength', 'chan san bang thuoc tinh',
                          'phan du bi cat', 'phan go dan thua bi cat'),
     'Hệ thống không cho nhập quá {n} ký tự, ô chỉ nhận đúng {n} ký tự đầu.'),
    # Ô BỊ KHOÁ ở biểu mẫu Chỉnh sửa (ô mã): không gõ được thì không có thông báo lỗi nào.
    # Bản cũ phải giải thích dài (*"case chỉ áp dụng ở biểu mẫu Thêm mới"* + nêu cả hành vi của
    # nút Cập nhật) — phần đó thuộc cột T/C, cột D chỉ cần chốt kết quả.
    (None, ('bi khoa o che do sua',),
     'Ô bị khoá ở chế độ sửa nên không thao tác được. Không có thông báo lỗi nào.'),
)


def _so_gioi_han(d):
    m = re.search(r'(\d{2,4})\s*ký tự', d or '')
    return m.group(1) if m else None


_RX_TRICH = re.compile(r'"[^"]*"')
SPEC = [None]  # hồ sơ màn của file đang xét (đặt ở đầu mỗi lần `quet`)
GNAME = ['']   # tên nhóm control của case đang xét (đặt trước mỗi lần gọi `sua_mot`)
C_HIEN = ['']  # cột C của case đang xét
CN_HIEN = ['']  # tên CN của case đang xét — khoá phạm vi CN của `gia_tri_tinh` (12/09)
GIU_GROUND = '--de-mat-ground' not in sys.argv
KHOI_KHAC = '--khoi-khac' in sys.argv   # mở sang khối Chức năng / ATTT
# Câu mẫu có NÓI VỀ thông báo không (để không biến case thành "chữ chay" khi thay).
_NOI_VE_TB = re.compile(r'thông báo|báo lỗi|thông tin lỗi', re.I)
# Chuỗi trong ngoặc kép có ra dáng THÔNG BÁO không (phân biệt với nhãn nút / tiêu đề popup).
_RA_DANG_TB = re.compile(r'không|chưa|trống|rỗng|vui lòng|lỗi|thất bại|thành công|đã ', re.I)
# Cột D nói rõ màn KHÔNG có thông báo / không có luật -> đừng áp khuôn có thông báo vào.
_KHONG_CO_TB = re.compile(
    r'khong (co |hien |hien thi )?thong bao|khong khai luat|khong kiem trung|khong bat buoc'
    r'|chan cung|khong cho nhap qua')
# Chuỗi trong ngoặc kép có RA DÁNG một thông báo lỗi không (phân biệt với tiêu đề popup/nhãn).
_LA_THONG_BAO = re.compile(
    r'vui lòng|Vui lòng|tối đa|đã tồn tại|không đúng|không hợp lệ|phải |không được|bắt buộc',
    re.I)


def ap_khuon_mau(gname, b, d):
    """Áp bản chữ mẫu (`qalib.KQ_MAU_D`) cho MỘT case -> cột D mới, hoặc None.

    Hai chỗ điền:
      · `{f}` — nhãn ô, lấy từ tên nhóm control (`qalib.field_of`);
      · `{n}` — giới hạn ký tự, đọc từ chính cột D/B đang có (mẫu ghi số thật của màn nó).

    ⚠️ GIỮ CHUỖI ĐÃ GROUND. Câu mẫu nào có thông báo trong ngoặc kép mà cột D ĐANG CÓ cũng có
    một chuỗi trong ngoặc kép thì DÙNG LẠI chuỗi đang có — đó là bản chữ thật của màn, đã
    ground. Thay bằng chữ của mẫu là `audit_noi_dung` tụt phủ grounding và case thành "chữ
    chay" (§8.2 luật 2). Khuôn của mẫu chỉ thay phần THUẬT quanh thông báo.
    """
    cau = qalib.kq_mau_cho(gname, b)
    if not cau:
        return None
    f = qalib.field_of(gname) or ''
    cau = cau.replace('{f}', f)
    if '{ds}' in cau:
        # Danh sách giá trị THẬT = các chuỗi trong ngoặc kép của cột D, giữ nguyên thứ tự.
        # Mẫu viết `Hiển thị các giá trị: Hoạt động, Không hoạt động` — dấu hai chấm là để
        # DẪN vào danh sách; áp câu mẫu mà bỏ danh sách thì còn trơ `Hiển thị các giá trị:`,
        # người chạy test không có gì đối chiếu. Không đọc được danh sách -> BỎ QUA case.
        ds = _RX_TRICH.findall(d or '')
        if len(ds) < 2:
            return None
        # Trả NGAY: sau khi điền, `cau` đã mang các giá trị trong ngoặc kép — đi tiếp thì
        # đoạn xử lý "khuôn có chỗ thông báo" bên dưới tưởng đây là thông báo lỗi và loại bỏ.
        return cau.replace('{ds}', ' · '.join(ds))
    if '{n}' in cau:
        n = _so_gioi_han(d) or _so_gioi_han(b)
        if not n:
            return None                       # không đọc được giới hạn -> để người sửa tay
        cau = cau.replace('{n}', n)
    moi = _RX_TRICH.findall(cau)
    if not moi:
        # `--giu-ground` (mặc định BẬT): cột D đang mang chuỗi verbatim / hằng số đã ground mà
        # câu mẫu thì KHÔNG có chỗ chứa nó ⇒ áp vào là mất trắng dữ kiện. Đo 2026-09-11 trên 6
        # file: áp thẳng làm rơi 53 chuỗi ground, đẻ 8 ca "chữ chay" và 9 ca "lạc mục đích" —
        # chính bộ rà của mình tố cáo. Bật cờ này thì chỉ áp câu mẫu ở những case KHÔNG có gì
        # để mất. Tắt bằng `--de-mat-ground` nếu người đặt việc CHẤP NHẬN mất.
        # ⚠️ Vá 2026-09-12: chuỗi ĐÃ GROUND (có mặt trong hồ sơ màn) thì KHÔNG được mất, kể cả
        # khi người chạy bật `--de-mat-ground`. Cờ đó sinh ra để gọt phần chữ THUẬT do bank đẻ
        # ra cho giống mẫu — không phải để xoá dữ kiện thật của màn. Đo khi bắc bước A6 tự động
        # vào chuỗi sinh: bước 11a đang ghi đè lại chính chữ A6 vừa bơm (case *ký tự đặc biệt*
        # của ô có luật định dạng bị trả về bản bank nói NGƯỢC — "ký tự đặc biệt được chấp
        # nhận"), tức hai bước trong cùng một chuỗi đá nhau mà không bộ rà nào kêu.
        if _RX_TRICH.search(d or '') and (GIU_GROUND or qalib.co_chuoi_da_ground(SPEC[0], d)):
            return None
        # Ngay cả khi người đặt việc CHẤP NHẬN mất ground (`--de-mat-ground`), vẫn không được
        # tạo ra ca "CHỮ CHAY": cột D nói về THÔNG BÁO mà không dùng chuỗi verbatim nào — đó là
        # lớp `Hệ thống báo lỗi` chung chung mà §8.2 luật 2 CẤM, và `audit_noi_dung` phép ② bắt.
        # Đo 2026-09-11: bỏ chốt này thì áp phương án A đẻ thêm 8 ca chữ chay.
        if _NOI_VE_TB.search(cau) and _RX_TRICH.search(d or '') and not _RX_TRICH.search(cau):
            # Câu mẫu có NHẮC tới thông báo nhưng viết chung chung, mà cột D đang có nguyên văn
            # của màn ⇒ GẮN nguyên văn đó vào câu mẫu. Đây là chỗ chỉ thị *"cắt giảm sao cho
            # giống mẫu mà VẪN ĐÚNG VỚI MÀN"* rơi vào: giữ KHUÔN của mẫu, giữ CHỮ của màn.
            #   mẫu : Hiển thị icon kèm thông báo Không có dữ liệu
            #   màn : … tiêu đề "Chưa có báo cáo nào" …
            #   ra  : Hiển thị icon kèm thông báo "Chưa có báo cáo nào"
            # Chuỗi được chọn phải RA DÁNG một THÔNG BÁO, không phải nhãn nút. Đo 2026-09-12:
            # lấy chuỗi dài đầu tiên làm case `khi không có dữ liệu` nhận nhãn nút
            # `"Thêm bộ dữ liệu"` -> `Hiển thị icon kèm thông báo "Thêm bộ dữ liệu"`, vô nghĩa.
            tb = next((x for x in _RX_TRICH.findall(d)
                       if len(x) > 6 and _RA_DANG_TB.search(x)), None)
            if not tb:
                return None
            return re.sub(r'(thông báo|báo lỗi|dòng chữ)\s+.*$',
                          lambda m: m.group(1) + ' ' + tb, cau, flags=re.I)
        return cau                            # khuôn không có thông báo -> áp thẳng, an toàn
    # ── Khuôn CÓ chỗ thông báo: chỉ áp khi KHÔNG phải bịa ra thông báo ────────────────────
    # §11.4 *thà gắn cờ hơn bịa*. Hai ca đã suýt hỏng ngay lượt chạy thử:
    #   · ô chỉ bị chặn bằng `maxlength`, màn KHÔNG hiện thông báo độ dài nào — áp khuôn vào
    #     là dựng ra `"{f} tối đa 250 ký tự"` mà màn không hề có;
    #   · case *dữ liệu đã tồn tại* mà màn không kiểm trùng ở trình duyệt — chuỗi trong ngoặc
    #     kép của cột D lại là TIÊU ĐỀ popup (`"Thêm loại database mới"`), lấy nó làm thông báo
    #     lỗi thì ra câu vô nghĩa `1. Thông báo lỗi "Thêm loại database mới"`.
    if qalib.o_bi_khoa(d) or _KHONG_CO_TB.search(qalib.norm(d)):
        return None
    cu = [x for x in _RX_TRICH.findall(d or '') if _LA_THONG_BAO.search(x)]
    if not cu:
        return None                           # không có chuỗi nào ra dáng thông báo -> bỏ qua
    for i, khuon_tb in enumerate(moi):
        if i < len(cu):
            cau = cau.replace(khuon_tb, cu[i], 1)
    return cau


def _de_thanh_chu_chay(d, cau):
    """Thay `d` bằng `cau` có biến case thành "chữ chay" không.

    "Chữ chay" = cột D nói về thông báo/báo lỗi mà KHÔNG dùng chuỗi hiển thị nào đã ground —
    đúng lớp `Hệ thống báo lỗi` chung chung mà §8.2 luật 2 cấm, `audit_noi_dung` phép ② bắt.
    """
    return bool(_NOI_VE_TB.search(cau) and _RX_TRICH.search(d or '')
                and not _RX_TRICH.search(cau))


def _khong_pha_luat_khac(b, c, cau):
    """Câu mẫu sắp ghi đè có làm case VI PHẠM phép rà khác không.

    Cùng bất biến đã dùng ở `qalib.rut_gon_kq`: **phép sửa không được làm bộ case sai thêm**.
    Ca đã đo 2026-09-11: câu mẫu `Hiển thị đúng option` của mục *Kiểm tra tìm kiếm* bị áp cả cho
    `Kiểm tra tìm kiếm TIẾNG VIỆT có dấu` và `… KHÔNG PHÂN BIỆT HOA THƯỜNG` — hai case khác mục
    đích, và chính phép ㉓ của mình tố cáo 6 ca `lạc mục đích`. Chặn ngay tại đây thay vì đi nới
    khoá của bank: khoá bank rộng là chuyện bình thường, cái phải chặn là KẾT QUẢ sai.
    """
    return not qalib.kq_lech_muc_dich(b, c, cau)


def sua_mot(b, d):
    """-> (cột D mới, lý do) hoặc (None, None)."""
    nb, nd = qalib.norm(b), qalib.norm(d)
    for khoa, dau, cau in KHUON_HO:
        # `khoa is None` = khuôn nhận theo DẤU Ở CỘT D, không theo tiêu đề (ô bị khoá xuất
        # hiện dưới nhiều tiêu đề khác nhau: *bắt buộc* · *ký tự đặc biệt* · *trim* …).
        if (khoa is None or khoa in nb) and any(x in nd for x in dau):
            if '{n}' in cau:
                n = _so_gioi_han(d)
                if not n:
                    continue                       # không đọc được giới hạn -> để người sửa tay
                cau = cau.replace('{n}', n)
            return cau, 'khuôn họ "%s"' % khoa
    # Chỉ thị 2026-09-12: case validate của BUTTON mà cột C có thao tác BẤM thì cột D phải nói
    # nút ấy làm gì (điều hướng tới màn / thực hiện hành động). Nối vào CUỐI, giữ nguyên câu
    # mẫu về căn lề - chính tả ở đầu.
    # Chỉ thị 2026-09-12: case liệt kê giá trị dựng lại TỪ HỒ SƠ MÀN — ô TĨNH liệt kê đủ, ô
    # ĐỘNG nói rõ là động. Xét TRƯỚC các phép khác vì nó ghi đè cả ô.
    _lk = qalib.kq_liet_ke_dung(SPEC[0], GNAME[0], b, d, CN_HIEN[0])
    if _lk and qalib.norm(_lk) != qalib.norm(d or ''):
        return _lk, 'liệt kê giá trị theo hồ sơ màn'
    _nut = qalib.thieu_cau_hanh_dong_nut(GNAME[0], b, C_HIEN[0], d)
    if _nut:
        return ((d or '').rstrip().rstrip('.') + '.\n' + _nut), 'câu hành động của nút'
    thieu = qalib.kq_thieu_y_mau(b, d)
    if thieu and thieu[0] in Y_BO_SUNG:
        cu = (d or '').rstrip()
        if not cu:
            return None, None
        dong = cu.split('\n')
        # Cột D đã đánh số `1.` thì ý thêm vào phải mang số kế tiếp, giữ khuôn mẫu.
        if re.match(r'^\s*1\.', dong[0]):
            so = max((int(m.group(1)) for m in
                      (re.match(r'^\s*(\d+)\.', x) for x in dong) if m), default=1)
            return cu + '\n%d. %s' % (so + 1, Y_BO_SUNG[thieu[0]]), 'thêm ý "%s"' % thieu[0]
        return cu.rstrip('.') + '. ' + Y_BO_SUNG[thieu[0]], 'thêm ý "%s"' % thieu[0]
    return None, None


def quet(tc, mau=False):
    SPEC[0] = audit_noi_dung.ho_so_cua(getattr(tc, 'path', '') or '')
    ra = []
    cn = None
    gname = None
    khoi = None
    inv = False
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            cn = b; inv = False
        elif lv == 'grp':
            inv = False
            khoi = b
        elif lv == 'sub':
            inv = 'validate' in qalib.norm(b); gname = b
            if inv:
                khoi = 'Validate'
        elif lv == 'sub2':
            gname = b
        elif lv == 'case' and (inv or (KHOI_KHAC and mau)):
            # Cột D đang tả CHỨC NĂNG của nút ở case hỏi *căn lề/chính tả* — nội dung ấy
            # đúng nhưng SAI CHỖ (thuộc case của khối `Chức năng`). Dồn sang cột T thay vì
            # vứt, rồi mới ghi câu mẫu vào D.
            _giu_sang_t = None
            if mau and qalib.kq_lech_muc_dich(tc.c(rn, 'B'), tc.c(rn, 'C'), tc.c(rn, 'D')):
                _giu_sang_t = (tc.c(rn, 'D') or '').strip()
            if mau and not inv:
                # Khối `Chức năng` / `An toàn thông tin` — bảng mẫu riêng (`kq_mau_khoi`),
                # chỉ chạy khi bật `--khoi-khac` (chỉ thị 2026-09-12 mở lại phạm vi).
                moi = qalib.kq_mau_khoi(khoi, cn, gname, tc.c(rn, 'B'))
                # Cùng chốt chống "CHỮ CHAY" như nhánh Validate: câu mẫu nói về THÔNG BÁO mà
                # không mang nguyên văn nào, trong khi cột D đang có ⇒ thay vào là mất bản chữ
                # thật và vi phạm §8.2 luật 2. Đo 2026-09-12: thiếu chốt này, mở sang khối
                # `Chức năng`/`ATTT` đẩy `chữ chay` 1 -> 12.
                if moi and _de_thanh_chu_chay(tc.c(rn, 'D'), moi):
                    moi = None
                if moi and not _khong_pha_luat_khac(tc.c(rn, 'B'), tc.c(rn, 'C'), moi):
                    moi = None
                ly_do = 'bản chữ mẫu (%s)' % (khoi or '')[:14]
            elif mau:
                moi = ap_khuon_mau(gname, tc.c(rn, 'B'), tc.c(rn, 'D'))
                if moi and not _khong_pha_luat_khac(tc.c(rn, 'B'), tc.c(rn, 'C'), moi):
                    moi = None
                ly_do = 'bản chữ mẫu'
            else:
                GNAME[0] = gname or ''
                C_HIEN[0] = tc.c(rn, 'C') or ''
                CN_HIEN[0] = cn or ''
                moi, ly_do = sua_mot(tc.c(rn, 'B'), tc.c(rn, 'D'))
            if moi and moi != (tc.c(rn, 'D') or ''):
                ra.append((rn, cn, b, moi, ly_do, _giu_sang_t))
    return ra


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 fix_kq_mau.py <%s> [tên màn] [--apply]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv
    tot = totf = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=True):
        tc, nm = sh.tc, sh.name + ('/' + sh.bp if sh.multi else '')
        sua = quet(tc, mau='--mau' in sys.argv)
        if not sua:
            continue
        totf += 1; tot += len(sua)
        print('#### %s  (%d case)' % (nm, len(sua)))
        for rn, cn, b, moi, ly_do, _gt in sua[:5]:
            print('   r%-5d %-34s [%s]' % (rn, b[:34], ly_do))
            print('          %s' % moi.replace('\n', ' ⏎ ')[:100])
        if len(sua) > 5:
            print('   … còn %d case nữa' % (len(sua) - 5))
        if not apply_:
            continue
        for rn, _cn, _b, moi, _l, _gt in sua:
            if _gt:
                cu = (tc.c(rn, 'T') or '').strip()
                them = '[CHI TIẾT] ' + _gt
                tc.retext(rn, kq=moi,
                          ghi_chu=(cu + ' ' + them).strip() if '[CHI TIẾT]' not in cu else cu)
            else:
                tc.retext(rn, kq=moi)
        tc.rebuild(tcfix.Plan(tc).keep_range(12, max(tc.order))).save(
            quiet=True, sync=len(tc.bpsheets) == 1)
    print('\n=== %d file · %d case%s ===' % (totf, tot, '' if apply_ else '  (XEM TRƯỚC)'))
    if tot and not apply_:
        print('Ghi thật: python3 fix_kq_mau.py %s%s --apply' % (role, ' ' + only if only else ''))


if __name__ == '__main__':
    main()

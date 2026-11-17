# -*- coding: utf-8 -*-
"""Bơm case còn thiếu cho nhóm `Chức năng Tìm kiếm đơn lẻ` — theo mẫu r134–r142.

Định mức (chốt 2026-09-04):
  · ô NHẬP CHỮ (Textbox / ô tìm / "Tìm theo …")  = 6 mục  → quota_cases.SEARCH_SINGLE_TEXT
  · control CHỌN GIÁ TRỊ (Selectbox · Combobox · Checkbox · Tab · Nút lọc · Ô ngày)
                                                  = 2 mục  → quota_cases.SEARCH_SINGLE_PICK

Vì sao cần script riêng:
  - `patch_quota.py` chỉ quét nhóm trong khối **Validate**.
  - `audit_func.py` trước 04/09 CỐ Ý bỏ qua nhóm này (`if 'tim kiem don le' ... return None,None`)
    vì cấu trúc `sub` + `sub2` per-control không khớp logic gom-1-rổ của nó ⇒ chưa từng được rà.
Chỉ THÊM mục còn thiếu, không sửa/xoá case cũ (luật 8).

    python3 patch_timkiem_donle.py --role Admin          # xem trước
    python3 patch_timkiem_donle.py --role Admin --apply  # ghi
"""
import os, sys, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, quota_cases, qalib


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def spec_of(gname):
    """(bộ case chuẩn, nhãn loại) theo tên nhóm control — luật ở `qalib.search_spec()`."""
    ten, _, nhan = qalib.search_spec(gname)
    return getattr(quota_cases, ten), nhan

# khoá nhận diện mục đã có (khớp audit_func để sau khi bơm bộ rà ra 0)
NEEDLES = {
    'toan ky tu space':        ['toan ky tu space', 'cac ky tu space', 'toan khoang trang', 'toan bo la space'],
    'space dau va cuoi':       ['space o dau va cuoi', 'khoang trang 2 dau', 'khoang trang hai dau',
                                'space o dau', 'dau va cuoi chuoi'],
    'tim kiem tuong doi':      ['tuong doi', 'mot phan', '1 phan', 'khop 1 phan', 'khop mot phan'],
    'ky tu dac biet':          ['ky tu dac biet'],
    # nới rộng: case đã kiểm "không phân biệt dấu" / "có dấu-không dấu" coi như đã phủ mục này,
    # tránh bơm case gần trùng (đã gặp ở VaiTro · ThongBaoHeThong)
    'tieng viet co dau':       ['tieng viet co dau', 'tieng viet', 'co dau', 'phan biet dau'],
    'du lieu khong gioi han':  ['khong gioi han', 'rat dai', 'chuoi dai'],
    # `= -- chon` thêm 2026-09-14: khuôn MẪU của mục này không còn chữ *giá trị mặc định* ở
    # tiêu đề (nó nêu thẳng chữ gợi ý — `- Selectbox = -- Chọn trạng thái --`). Thiếu khoá này
    # thì chạy lại bộ bơm trên màn ĐÃ đúng mẫu sẽ bơm THÊM một case trùng.
    'gia tri mac dinh':        ['gia tri mac dinh', 'mac dinh', '= -- chon'],
    'chon 1 gia tri':          ['chon 1 gia tri', 'chon tung gia tri', 'chon lan luot', 'chon mot gia tri',
                                'chon gia tri', 'tich chon', 'chon trang thai', 'loc theo',
                                # cách diễn đạt phổ biến trong dự án: "Chọn 1 <X> để lọc"
                                'chon 1 ', 'chon mot ', 'de loc', 'chon dung 1', 'bo tich',
                                # Lối viết theo khuôn `Tìm kiếm với:` của mẫu — `- Đơn vị = 1 giá
                                # trị`. KHÔNG có động từ "chọn" nên 13 khoá trên đều trượt: đo
                                # 2026-09-14 trên `CanhBaoMauThuan`, 2 nhóm `Datepicker` bị đòi
                                # bơm thêm **+2 case TRÙNG** dù nhóm đã đủ định mức. Lỗ có TỪ
                                # TRƯỚC đợt vá khuôn mẫu (đã đối chiếu trên bản lùi) và không bộ
                                # rà nào thấy — `audit_timkiem` đếm SỐ case nên nhóm vẫn "đủ".
                                '= 1 gia tri'],
}

# 'Datepicker ' THÊM 2026-09-09: bảng `qalib.QUOTA` gọi loại control này là `Datepicker` nên tên
# nhóm chuẩn là `Datepicker <Nhãn UI>`, nhưng PREFIX chỉ có 'Ô ngày ' -> không cắt được tiền tố,
# case sinh ra đọc thành "Chọn 1 giá trị của Datepicker Từ ngày" và tên tổ hợp của
# `patch_kethop` cũng kéo theo ("Kết hợp: Bảng đích + Datepicker Từ ngày").
# Danh sách DỜI về `qalib.PREFIX_NHOM` 2026-09-14 — `qalib.tk_mac_dinh_bo_ba()` cần cùng phép
# cắt tiền tố. Hai bản chép tay là đường chắc chắn lệch (chính chỗ này đã lệch một lần: bản
# nhân bản ở vòng 2 thiếu `Datepicker `).
PREFIX = qalib.PREFIX_NHOM


def ten_truong(gname):
    for pre in PREFIX:
        if gname.startswith(pre):
            return gname[len(pre):]
    return gname


def loai_control(gname):
    """LOẠI control lấy từ tên nhóm (`Selectbox Đơn vị` -> `Selectbox`), mặc định `Bộ lọc`.

    Thêm 2026-09-10: bộ `SEARCH_SINGLE_PICK` trước đó chốt cứng chữ **"Selectbox"** trong tiêu
    đề, trong khi `qalib.search_spec()` trả bộ này cho MỌI control chọn giá trị — nhóm
    `Datepicker Từ ngày` sinh ra *"Tìm kiếm với: - Selectbox = giá trị mặc định"*.

    Luật DỜI về `qalib.loai_control_tu_nhom()` 2026-09-14 (khuôn mẫu cần đúng loại đó ở cột
    B/C, mà luật dùng chung phải ở thư viện). Giữ tên ở đây cho mọi chỗ đang gọi.
    """
    return qalib.loai_control_tu_nhom(gname)


def mot_muc(gname, key, md, buoc, kq):
    """(mục đích, các bước, kết quả) của MỘT mục bank, đã điền chỗ giữ theo nhóm control.

    Mục `giá trị mặc định` KHÔNG đi qua `fmt_bank` mà lấy thẳng ba ô từ
    `qalib.tk_mac_dinh_bo_ba()`: đó là một nguồn chữ DUY NHẤT dùng chung với bước A6
    (`_b_tim_kiem_mac_dinh`) và bộ sửa (`fix_luat_cung`), và nó có HAI nhánh mà một literal
    bank không diễn được — ô chọn thì *"Chọn selectbox = -- Chọn trạng thái --"*, ô ngày/nút
    lọc thì *"Giữ … ở giá trị mặc định"* (control đó không có chữ gợi ý nào để nêu).
    """
    if key == 'gia tri mac dinh':
        return qalib.tk_mac_dinh_bo_ba(gname)
    f, loai = ten_truong(gname), loai_control(gname)
    return (qalib.fmt_bank(md, f, loai, gname), qalib.fmt_bank(buoc, f, loai, gname),
            qalib.fmt_bank(kq, f, loai, gname))


def bo_case(gname):
    """[(mục đích, các bước, kết quả)] đầy đủ cho một bộ lọc."""
    spec, _ = spec_of(gname)
    return [mot_muc(gname, key, md, buoc, kq) for key, md, buoc, kq in spec]


APPLY = '--apply' in sys.argv
# `--create`: DỰNG khối `Chức năng Tìm kiếm đơn lẻ` khi CN tìm kiếm/lọc thiếu HẲN nó.
# Không có cờ này thì script chỉ bù mục cho nhóm ĐÃ CÓ — và vì `new_from_base`/`complete_func`
# không tạo nhóm này, `audit_func` lại cố ý bỏ qua, nên khối vắng hẳn ở 17 CN của bộ case thật
# mà mọi phép nghiệm thu vẫn báo sạch (đo 2026-09-08). Rà bằng `audit_timkiem.py`.
CREATE = '--create' in sys.argv
ROLE = 'Admin'
if '--role' in sys.argv: ROLE = sys.argv[sys.argv.index('--role') + 1]
CFG = roles.get(ROLE)
# Lọc TÊN MÀN — thêm 2026-09-09. Trước đó script chỉ nhận `--role` nên LUÔN chạy cho CẢ role:
# lần chạy 09/09 (sinh màn `Danh mục trình độ ngoại ngữ`) `patch_timkiem_donle` định sửa lây
# `TrinhDoDaoTao` (+1 case) — đúng lớp sự cố "sửa lây file ngoài phạm vi" mà 3 script `complete_*`
# đã vá 08/09. Cùng lối đặt tham số với `patch_cn_trangthai.py` / `audit_*`.
ONLY = None
for _a in sys.argv[1:]:
    if not _a.startswith('--') and _a != ROLE:
        ONLY = _a

tot_case = tot_grp = tot_file = 0
for p in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
    base = os.path.basename(p)
    if base in CFG['skip']: continue
    if os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % base)):
        print('  BỎ QUA (đang mở):', base); continue
    nm = base.replace(CFG['strip'], '').replace('.xlsx', '')
    if ONLY and ONLY.lower() not in nm.lower():
        continue
    try: bps = tcfix.load(p).bpsheets
    except Exception as e:
        print('  LỖI đọc %s: %s' % (base, e)); continue

    file_case = 0
    for bp in bps:
        tc = tcfix.load(p, bp)
        groups, cur, cases, last, inside = [], None, [], None, False
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn)
            txt = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'case':
                # Gom cả tiêu đề (B) và các bước (C): nhiều case cũ diễn đạt mục ở phần bước.
                # ⚠️ Phải lấy B ĐẦY ĐỦ, không cắt dòng đầu (vá 2026-09-08): 3/6 mục của
                # SEARCH_SINGLE_TEXT đều mở đầu bằng "Tìm kiếm khi nhập:" — phần phân biệt nằm ở
                # DÒNG 2. Cắt dòng đầu thì dedup trượt, chạy lần 2 lại bơm thêm ⇒ đẻ case trùng.
                if cur:
                    cases.append((tc.c(rn, 'B') or '') + ' ¦ ' + (tc.c(rn, 'C') or ''))
                    last = rn
                continue
            if cur:
                groups.append((last, cur, cases)); cur, cases, last = None, [], None
            if lv == 'cn':   inside = False
            elif lv == 'sub': inside = 'tim kiem don le' in norm(txt)
            elif lv == 'sub2' and inside:
                cur, cases, last = txt, [], rn
        if cur: groups.append((last, cur, cases))

        # ── quét cấp CN: chỗ chèn · đã có khối chưa · bộ lọc nào
        # THỨ TỰ MẪU (DanhMucTuDienDungChung r127·r132·r143): `Tìm kiếm chung` -> `Tìm kiếm ĐƠN LẺ`
        # -> `Tìm kiếm KẾT HỢP`. Bản trước 2026-09-08 chèn vào dòng CUỐI khối `Chức năng` nên khối
        # đơn lẻ luôn rơi xuống DƯỚI khối kết hợp — sai thứ tự mẫu, và không phép rà nào kiểm thứ
        # tự (người đặt việc phát hiện bằng mắt trên `QuanTri/TrinhDoDaoTao`). Nay dùng mốc
        # `anchor_pre` = dòng cuối cùng TRƯỚC nhóm kết hợp đầu tiên; không có nhóm kết hợp thì
        # rơi về dòng cuối khối `Chức năng` như cũ.
        cn_info, cn_t, anchor, has, filters, grp, sub = [], None, None, False, [], None, None
        anchor_pre, seen_kh = None, False
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn); txt = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'cn':
                if cn_t is not None:
                    cn_info.append((cn_t, anchor_pre or anchor, has, filters))
                cn_t, anchor, has, filters, grp, sub = txt, None, False, [], None, None
                anchor_pre, seen_kh = None, False
            elif lv == 'grp':
                grp = norm(txt); sub = None
            elif lv == 'sub':
                sub = norm(txt)
                if 'tim kiem don le' in sub: has = True
                elif grp and 'chuc nang' in grp and 'tim kiem ket hop' in sub: seen_kh = True
                elif grp and 'giao dien' in grp and qalib.la_bo_loc(txt, cn_t): filters.append(txt)
            elif lv == 'sub2':
                if (grp and 'giao dien' in grp and (sub is None or 'tim kiem don le' not in sub)
                        and qalib.la_bo_loc(txt, cn_t)):
                    filters.append(txt)
            if grp and 'chuc nang' in grp:
                anchor = rn                                 # dòng cuối cùng của khối Chức năng
                if not seen_kh: anchor_pre = rn             # ... nhưng TRƯỚC nhóm kết hợp
        if cn_t is not None:
            cn_info.append((cn_t, anchor_pre or anchor, has, filters))

        dung = {}
        if CREATE:
            for cnn, anc, has_, fl in cn_info:
                if has_ or not fl or anc is None: continue
                if qalib.loai_cn(cnn) != 'tim_kiem': continue
                rows = [('sub', 'Chức năng Tìm kiếm đơn lẻ')]
                for g in fl:
                    rows.append(('sub2', g))
                    rows += [('case', c) for c in bo_case(g)]
                dung[anc] = rows
                n_case = sum(1 for t, _ in rows if t == 'case')
                print('   %-22s %-38s [DỰNG KHỐI] %d bộ lọc · +%d'
                      % (nm, cnn[:38], len(fl), n_case))
                tot_grp += 1

        add = {}
        for last_rn, gname, cs in groups:
            spec, kind = spec_of(gname)
            have = norm(' | '.join(cs))
            # ⚠️ Vá 2026-09-10: đường này trước đây NHÂN BẢN danh sách tiền tố (và bản nhân
            # bản thiếu `Datepicker ` — đúng lỗ đã vá ở `PREFIX` mà quên chỗ này) rồi format
            # bằng `{f}` trần nên chỗ giữ `{loai}` mới sẽ nổ KeyError. Nay dùng chung
            # `ten_truong` / `loai_control` / `qalib.fmt_bank`.
            picked = []
            for key, md, buoc, kq in spec:
                if any(x in have for x in NEEDLES[key]): continue
                picked.append(mot_muc(gname, key, md, buoc, kq))
            # VÒNG 2 — bù cho trường hợp MỘT case cũ khớp từ khoá của NHIỀU mục (dedup quá tay)
            # nên nhóm vẫn dưới định mức. Cùng cơ chế "vòng 2" của patch_quota.py.
            need = len(spec) - len(cs)
            if len(picked) < need:
                for key, md, buoc, kq in spec:
                    if len(picked) >= need: break
                    muc = mot_muc(gname, key, md, buoc, kq)
                    t = muc[0]
                    if norm(t) in have or any(norm(t) == norm(x[0]) for x in picked): continue
                    picked.append(muc)
            if picked:
                add[last_rn] = picked; tot_grp += 1
                print('   %-22s %-38s [%s] +%d' % (nm, gname[:38], kind, len(picked)))
        if not add and not dung: continue
        file_case += sum(len(v) for v in add.values())
        file_case += sum(1 for rows in dung.values() for t, _ in rows if t == 'case')
        if APPLY:
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn < 12: continue
                pl.keep(rn)
                for c in add.get(rn, []): pl.case(*c)
                for kind_, val in dung.get(rn, []):
                    if kind_ == 'sub':    pl.add_sub(val)
                    elif kind_ == 'sub2': pl.add_sub2(val)
                    else:                 pl.case(*val)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if file_case:
        tot_file += 1; tot_case += file_case

print('\n=== %s: %d file · %d nhóm · +%d case ===%s'
      % (ROLE, tot_file, tot_grp, tot_case, '' if APPLY else '   (xem trước, chưa ghi)'))

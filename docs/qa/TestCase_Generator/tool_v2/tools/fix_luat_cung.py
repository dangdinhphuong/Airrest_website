# -*- coding: utf-8 -*-
"""Đưa case *giá trị mặc định* của ô chọn / ô số bản ghi trên trang về đúng LUẬT CỨNG UI.

Luật nằm ở `qalib` mục **0a. LUẬT CỨNG UI** — script này KHÔNG có luật riêng, chỉ ghi
`qalib.kq_mac_dinh_chuan()` vào cột D. Rà lại bằng `audit_luat_cung.py`.

Vì sao cần script riêng thay vì chỉ sửa bank: `patch_quota` chỉ bơm case cho nhóm CÒN THIẾU
so với định mức. Mọi nhóm đã đủ case — tức toàn bộ bộ case đã sinh trước 2026-09-12 — không
bao giờ được bank đụng tới. Đo lần đầu trên `moetdl/ChuyenVien` (7 file đã nghiệm thu sạch
13 bộ rà): **26 case sai luật + 1 case chọn sẵn giá trị nghiệp vụ**.

BA nhánh xử lý, cố ý khác nhau:
  · ô LỌC và ô THÊM MỚI  -> ghi cột D theo luật;
  · ô CHỈNH SỬA          -> **KHÔNG đụng** (§5.6 đòi nạp giá trị đang lưu) trừ khi cột D đang
                            nói ô tự chọn sẵn giá trị nghiệp vụ — cái đó luật ① cấm ở mọi CN;
  · hồ sơ màn khai khác luật -> gắn cờ `[FIXED RULE VIOLATION]` vào cột T (bằng chứng màn thật
                            lệch luật), **không** đổi cột D theo hồ sơ.

⚠️ `rebuild()` ghi đè cột A thành chữ chay ⇒ chạy `formula_layer.py` ngay sau `--apply`
(script tự nhắc, y như `fix_macdinh_sua.py`).

    python3 fix_luat_cung.py <Role> [Tên màn]            # xem trước
    python3 fix_luat_cung.py <Role> [Tên màn] --apply    # ghi
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib      # noqa: E402
import roles      # noqa: E402
import tcfix      # noqa: E402
# ⚠️ KHÔNG `import audit_luat_cung`: đó là một SCRIPT, import là chạy luôn thân nó (bẫy đã dính
# với `audit_timkiem`). Phép quét dùng chung nằm ở `qalib.quet_o_chon` / `qalib.ho_so_man`.


def viec_cua_file(tc, spec=None):
    """[(dòng, tên CN, tên nhóm, ngữ cảnh, cột D cũ, cột D mới, cờ cột T, cột C mới, cột B mới)].

    Thuần tính, KHÔNG ghi file.
    """
    xd = {qalib.norm(c): (l, y) for c, l, y, _n in qalib.soi_luat_cung_spec(spec or {})}
    ra = []
    for cn, nhom, ng, cases in qalib.quet_o_chon(tc):
        for rn, td, d, c in cases:
            tk = qalib.la_case_tim_kiem_mac_dinh(td)
            if not (qalib.la_case_mac_dinh(td) or tk):
                continue
            san = qalib.vi_pham_chon_san(d, ng)
            if ng == 'sua' and not san:
                continue                      # §5.6 — `fix_macdinh_sua.py` giữ phần này
            moi = qalib.kq_mac_dinh_chuan(nhom, 'them' if ng == 'sua' else ng, tim_kiem=tk)
            if not moi:
                continue
            # Cờ chỉ gắn khi có BẰNG CHỨNG màn thật lệch luật (hồ sơ màn đã ground), không gắn
            # cho case chỉ mang chữ chay của bank cũ — gắn bừa là biến cờ thành nhiễu.
            co = None
            b_moi = None
            if tk:
                # ⚠️ Lớp case §6 đo trên CẢ BA Ô (vá 2026-09-14). Khuôn mẫu nêu chữ gợi ý ở cột
                # B/C rồi để cột D đúng một câu ngắn, nên phép chỉ-đọc-cột-D trả `True` cho CẢ
                # bộ case đời cũ (chữ gợi ý nằm trong cột D) lẫn bộ đúng mẫu ⇒ không có đường
                # nào đưa bộ cũ về khuôn mẫu, đúng lớp lỗi ⑳ *"bộ rà đòi thứ bộ vá không làm
                # được"*. Ở đây so KHỚP TRỌN ba ô: đó là chữ VERBATIM của mẫu, không phải câu
                # chữ ta tự nghĩ, nên không vướng bài học báo-oan của `mac_dinh_sai_o_cn_sua`.
                b_moi, buoc_moi, moi = qalib.tk_mac_dinh_bo_ba(nhom)
                _dat = (not san and td.strip() == b_moi
                        and (c or '').strip() == buoc_moi and (d or '').strip() == moi)
            else:
                _dat = qalib.dat_luat_cung(d, nhom, ng) and not san
            for khoa, (luat, thuc) in xd.items():
                # Khớp theo TÊN hoặc theo NGỮ CẢNH — luật ở `qalib.khop_xung_dot` (vá 14/09).
                if qalib.khop_xung_dot(khoa, nhom, ng):
                    co = '%s %s; màn thật/hồ sơ đang là %s' % (qalib.CO_LUAT_CUNG, luat, thuc)
                    break
            if not co and not tk:
                # Bộ case đã qua A6: cột D CŨ chính là bằng chứng màn thật chạy sai. Rút ra cột
                # T TRƯỚC khi ghi đè, không thì mất dấu vết (chỉ thị: *"Lưu evidence nếu cơ chế
                # hiện tại hỗ trợ"*). Case §6 (`tk`) không rút — xem `bang_chung_tu_cot_d`.
                bc = qalib.bang_chung_tu_cot_d(d, nhom, ng)
                if bc:
                    co = '%s %s' % (qalib.CO_LUAT_CUNG, bc)
            if _dat:
                # ⚠️ Vá 2026-09-14: cột D ĐÃ đúng luật thì trước đây `continue` ngay, nên case
                # KHÔNG BAO GIỜ được gắn cờ xung đột — mất bằng chứng màn thật chạy khác. Đo
                # trên `CanhBaoMauThuan`: chỉ 2/4 case *giá trị mặc định* có cờ. Nay vẫn đi
                # tiếp khi có cờ, nhưng KHÔNG đụng cột C/D (truyền `moi=None`).
                if not co:
                    continue
                ra.append((rn, cn, nhom, ng, d, None, co, None, None))
                continue
            buoc = qalib.buoc_mac_dinh_chuan(nhom, ng, tim_kiem=tk)
            ra.append((rn, cn, nhom, ng, d, moi, co, buoc, b_moi))
    return ra


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    apply_ = '--apply' in sys.argv
    role = args[0] if args else 'Admin'
    only = args[1] if len(args) > 1 else None
    roles.get(role)

    tot_f = tot_c = tot_t = n_file = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=apply_):
        n_file += 1
        tc = sh.tc
        sua = viec_cua_file(tc, qalib.ho_so_man(sh.path))
        if not sua:
            continue
        tot_f += 1
        tot_c += len(sua)
        print('#### %s' % (sh.name + ('/' + sh.bp if sh.multi else '')))
        for rn, cn, nhom, ng, cu, moi, co, _b, b_moi in sua:
            print('   r%-5d [%-7s] %-34s "%s"' % (rn, ng, nhom[:34],
                                                  (cu or '').replace('\n', ' ')[:46]))
            if moi is None:
                print('   %-7s %-9s %-34s -> (cột D ĐÃ đúng luật — chỉ gắn cờ bằng chứng)'
                      % ('', '', ''))
            else:
                print('   %-7s %-9s %-34s -> "%s"' % ('', '', '', moi[:60]))
            if b_moi:
                print('   %-7s %-9s %-34s -> cột B "%s"'
                      % ('', '', '', b_moi.replace('\n', ' ')[:60]))
            if co:
                tot_t += 1
                print('   %-7s %s' % ('', co[:96]))
        if not apply_:
            continue
        # Bản lùi TRƯỚC khi ghi (thêm 2026-09-14 — script này vốn thiếu, trong khi USER-GUIDE
        # chốt *"script mới phải gọi `qalib.backup()`"*). File nhiều sheet BP thì mỗi sheet là
        # một `sh` nhưng CHUNG một `path`; `backup` chỉ chép khi file có thật nên bản thứ hai
        # chỉ tốn thêm một bản lùi, không sai.
        qalib.backup(sh.path, tag='truoc_luat_cung')
        for rn, _cn, _nhom, _ng, _cu, moi, co, buoc, b_moi in sua:
            # `buoc` chỉ khác None ở case §6 — ở đó cột C cũ mô tả việc CHỌN, trái mục đích.
            # `b_moi` cũng chỉ có ở case §6: từ 14/09 chữ gợi ý bắt buộc nằm ở CỘT B (khuôn
            # mẫu), bỏ cột B là để lại tiêu đề chung chung *"= giá trị mặc định"*.
            if moi is not None:
                tc.retext(rn, md=b_moi, buoc=buoc, kq=moi)
            if co:
                qalib.a6_noi_t(tc, rn, co)
        # Plan giữ NGUYÊN mọi dòng (không chèn/xoá) — nhưng `rebuild()` bắt buộc để `save()`
        # dựng lại sheet. ⚠️ `Plan(tc)` khởi tạo RỖNG: quên vòng `keep` là xoá sạch nội dung.
        pl = tcfix.Plan(tc)
        for rn in tc.order:
            if rn >= 12:
                pl.keep(rn)
        tc.rebuild(pl).save(quiet=True, sync=not sh.multi)

    print('\n=== %s: %d file · %d case · %d cờ cột T %s ==='
          % (role, tot_f, tot_c, tot_t, '' if apply_ else '(xem trước, chưa ghi)'))
    if not n_file:
        print('!! KHÔNG đọc được file nào — số 0 ở trên KHÔNG có nghĩa là sạch.')
    if apply_ and tot_f:
        print('⚠️  BẮT BUỘC chạy tiếp: python3 formula_layer.py <các file vừa sửa>')
        print('    `rebuild()` đã ghi đè cột A thành chữ chay — không áp lại là mất lớp công thức 1.')


if __name__ == '__main__':
    main()

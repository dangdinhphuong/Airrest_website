# -*- coding: utf-8 -*-
"""RÀ LUẬT CỨNG UI — hai quy tắc `tool_v2` chốt cứng, không dự án/màn nào định nghĩa lại.

Nguồn luật: `qalib` mục **0a. LUẬT CỨNG UI** (chỉ thị người đặt việc 2026-09-12). Bộ rà này
KHÔNG có luật riêng — nó chỉ thi hành `qalib.dat_luat_cung()` / `qalib.soi_luat_cung_spec()`,
đúng nguyên tắc *luật dùng chung phải ở `qalib`, không ở script*.

  ① Ô CHỌN
       · vùng TÌM KIẾM      -> mặc định `-- Chọn <nội dung cần tìm> --`, KHÔNG chọn sẵn giá trị
                               nghiệp vụ nào;
       · biểu mẫu THÊM MỚI  -> mặc định `-- Chọn --`, KHÔNG tự chọn option đầu tiên;
       · biểu mẫu CHỈNH SỬA -> nạp giá trị ĐANG LƯU (§5.6) — phần này `audit_sua.py` giữ, ở đây
                               chỉ soi xem có tự chọn sẵn giá trị nghiệp vụ không.
  ② Ô `Số bản ghi trên trang` -> mở màn lần đầu mặc định **20**.

Vì sao phải có bộ rà RIÊNG — không bộ nào trong 13 bộ cũ bắt được lớp lỗi này:
  · `audit_validate_quota` chỉ ĐẾM đủ số case, không đọc cột D;
  · `audit_content` dò theo TỪ KHOÁ tiêu đề, không đối chiếu GIÁ TRỊ mặc định;
  · `audit_noi_dung` đo phủ grounding — mà chính grounding mới là chỗ sai: màn thật cấu hình
    lệch thì cột D chép lại cái lệch đó và phép phủ chấm là ĐẠT.
Đúng lớp điểm mù "case luôn đúng nên không bao giờ bắt được lỗi": câu *"mặc định giá trị đang
áp dụng được chọn"* đọc thế nào cũng P, dù màn đang 10 hay 50.

Năm phép:
  ⓐ CỘT D SAI LUẬT   — case *giá trị mặc định* của ô chọn / ô số bản ghi/trang không nêu đúng
                        chữ gợi ý bắt buộc (hoặc không nêu số 20). Cố ý LỎNG: chỉ đòi dữ kiện
                        có mặt, không đòi câu chữ — bộ case cũ mỗi nơi một lối diễn đạt.
  ⓑ CHỌN SẴN         — cột D mô tả ô tự chọn sẵn một giá trị nghiệp vụ / option đầu tiên.
  ⓒ THIẾU COVERAGE   — nhóm ô chọn / cụm phân trang KHÔNG có case *giá trị mặc định* nào.
  ⓓ XUNG ĐỘT HỒ SƠ   — hồ sơ màn (BA/SRS đã ground) khai khác luật -> in
                        `[CONFLICT WITH FIXED TOOL RULE]`, KHÔNG tự đổi luật, KHÔNG im lặng.
  ⓔ LỆCH KHUÔN MẪU   — riêng lớp case §6 `Chức năng Tìm kiếm đơn lẻ` (chỉ thị 2026-09-14, theo
                        ảnh mẫu): ba ô B/C/D phải VERBATIM `qalib.tk_mac_dinh_bo_ba()`. Phép ⓐ
                        không thay được — bản cũ giấu chữ gợi ý trong cột D vẫn qua ⓐ.
Cộng một phép chạy MỘT LẦN mỗi đợt: bank sinh mới có còn khớp luật không (bank trôi thì màn
sinh sau lại sai y như cũ — bài học *"vá script xong phải chạy trọn pipeline sinh mới"*).

    python3 audit_luat_cung.py <Role> [tên màn] [--gon]

MẶC ĐỊNH in đủ khối `[FIXED RULE VIOLATION]` (Control / Expected / Actual / Evidence) đúng khuôn
chỉ thị — đó là thứ dán thẳng được vào phiếu lỗi. `--gon` rút về một dòng một ca cho log dài.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib     # noqa: E402
import roles     # noqa: E402

CHI_TIET = '--gon' not in sys.argv        # khuôn đầy đủ là MẶC ĐỊNH (chỉ thị §5)
_arg = [a for a in sys.argv[1:] if not a.startswith('--')]
ROLE = _arg[0] if _arg else 'Admin'
ONLY = _arg[1] if len(_arg) > 1 else None
norm = qalib.norm


# `ho_so_man` + `quet_o_chon` nằm ở `qalib`: bộ rà và bộ sửa (`fix_luat_cung.py`) phải dùng
# CHUNG một phép quét, mà `import` một script `audit_*` là chạy luôn thân script đó.
ho_so_cua = qalib.ho_so_man
quet = qalib.quet_o_chon


def mo_ta(cn, nhom):
    return '%s › %s' % ((cn or '(không rõ CN)')[:40], nhom)


def in_vi_pham(control, expected, actual, evidence, gon):
    if CHI_TIET:
        print()
        print(qalib.bao_luat_cung(control, expected, actual, evidence))
    else:
        print('   %s %s' % (qalib.CO_LUAT_CUNG, gon))


# ══════════════════════════════════════════════════════════════════════════════
# Phép chạy MỘT LẦN: bank sinh mới có còn khớp luật không
# ══════════════════════════════════════════════════════════════════════════════
t_bank = 0
import quota_cases  # noqa: E402  — chỉ nạp khi thật sự rà

for _bn, _ng, _nhom in (('SELECTBOX', 'them', 'Selectbox Loại'),
                        ('SELECTBOX_MULTI', 'them', 'Selectbox Loại'),
                        ('PERPAGE', 'perpage', 'Selectbox Số bản ghi trên trang'),
                        ('PAGE_RECORDS', 'perpage', 'Textbox Số bản ghi trên trang')):
    _bank = getattr(quota_cases, _bn, None)
    _mac = [r for r in (_bank or []) if r[0] == 'gia tri mac dinh']
    if not _mac:
        print('   %s quota_cases.%s KHÔNG có mục `gia tri mac dinh` -> sinh màn mới sẽ '
              'THIẾU coverage của luật cứng' % (qalib.CO_LUAT_CUNG, _bn))
        t_bank += 1
        continue
    if not qalib.dat_luat_cung(_mac[0][3], _nhom, _ng):
        in_vi_pham('bank sinh mới `quota_cases.%s`' % _bn,
                   qalib.kq_mac_dinh_chuan(_nhom, _ng), _mac[0][3],
                   'tools/quota_cases.py',
                   'quota_cases.%s — bank lệch luật, màn sinh sau sẽ sai lại' % _bn)
        t_bank += 1
# ── Bank §6 `SEARCH_SINGLE_PICK` — so TRỌN BA Ô với khuôn mẫu (thêm 2026-09-14) ────────────
# Bộ này không so được bằng vòng ở trên: từ khuôn mẫu, chữ gợi ý nằm ở **cột B và cột C**, cột
# D chỉ còn một câu ngắn ⇒ `dat_luat_cung(cột D)` trả False cho cả bank ĐÚNG. Và bank ở đây là
# một literal có chỗ giữ, trong khi chữ thật do `qalib.tk_mac_dinh_bo_ba()` dựng — hai nguồn
# đó LỆCH nhau thì `patch_timkiem_donle` ghi một đằng, `audit_extra` soi một nẻo, không ai thấy.
_NHOM_MAU = 'Selectbox Trạng thái'
_pick = [r for r in (getattr(quota_cases, 'SEARCH_SINGLE_PICK', None) or [])
         if r[0] == 'gia tri mac dinh']
if not _pick:
    print('   %s quota_cases.SEARCH_SINGLE_PICK KHÔNG có mục `gia tri mac dinh` -> khối '
          '`Chức năng Tìm kiếm đơn lẻ` sinh mới sẽ THIẾU case chốt giá trị mặc định'
          % qalib.CO_LUAT_CUNG)
    t_bank += 1
else:
    _that = qalib.tk_mac_dinh_bo_ba(_NHOM_MAU)
    _bank_dien = tuple(qalib.fmt_bank(_o, qalib.field_of(_NHOM_MAU), ten_nhom=_NHOM_MAU)
                       for _o in _pick[0][1:4])
    for _ten_o, _a, _b in zip('BCD', _bank_dien, _that):
        if _a.strip() != _b.strip():
            in_vi_pham('bank sinh mới `quota_cases.SEARCH_SINGLE_PICK` cột %s' % _ten_o,
                       _b.replace('\n', ' '), _a.replace('\n', ' '), 'tools/quota_cases.py',
                       'SEARCH_SINGLE_PICK cột %s lệch `qalib.tk_mac_dinh_bo_ba()`' % _ten_o)
            t_bank += 1
if t_bank:
    print('   => sửa bank cho khớp `qalib.kq_mac_dinh_chuan()` / `qalib.tk_mac_dinh_bo_ba()` '
          'rồi chạy lại chuỗi sinh.\n')

# ══════════════════════════════════════════════════════════════════════════════
# Rà từng file
# ══════════════════════════════════════════════════════════════════════════════
t_cd = t_san = t_thieu = t_xung = t_quyet = t_mau = 0
n_file = n_khong_ho_so = 0

for sh in qalib.iter_role_files(ROLE, ONLY):
    tc = sh.tc
    nm = sh.name + ('/' + sh.bp if sh.multi else '')
    n_file += 1
    dong = []
    for cn, nhom, ng, cases in quet(tc):
        # Hai LỚP case cùng mang chữ *giá trị mặc định*, mục đích khác nhau (xem
        # `qalib.la_case_tim_kiem_mac_dinh`): case CONTROL trong khối Validate, và case KẾT QUẢ
        # TÌM KIẾM của khối §6. Cả hai đều phải nêu chữ gợi ý, nhưng bản chữ đúng khác nhau.
        mac = [(x, qalib.la_case_tim_kiem_mac_dinh(x[1])) for x in cases
               if qalib.la_case_mac_dinh(x[1]) or qalib.la_case_tim_kiem_mac_dinh(x[1])]
        if not mac:
            # ⓒ Nhóm ô chọn mà KHÔNG có case giá trị mặc định -> luật cứng không có chỗ bám.
            # Cụm phân trang và ô chọn biểu mẫu đều có mục đó trong bank, thiếu nghĩa là nhóm
            # bị bơm bằng bank khác hoặc case đã bị xoá tay.
            dong.append(('THIẾU', mo_ta(cn, nhom),
                         'không có case "Kiểm tra giá trị mặc định" (%d case)' % len(cases)))
            t_thieu += 1
            continue
        for (rn, td, d, c), tk in mac:
            vp = qalib.vi_pham_chon_san(d, ng)
            if vp:
                dong.append(('CHỌN SẴN', mo_ta(cn, nhom),
                             'dòng %d cột D nói "%s"' % (rn, vp)))
                t_san += 1
                continue
            if ng == 'sua':
                continue           # §5.6 — `audit_sua.py` giữ phần này
            # ⚠️ Lớp case §6 nêu chữ gợi ý ở CỘT B + CỘT C (khuôn mẫu 14/09), cột D chỉ nói hệ
            # thống phản hồi thế nào ⇒ đọc mỗi cột D là báo đỏ TOÀN BỘ case đúng mẫu, và không
            # lệnh nào vá được. Truyền cả ba ô vào; phần *chốt cứng* vẫn là chữ gợi ý.
            if not qalib.dat_luat_cung(d, nhom, ng, txt_phu=(td, c) if tk else None):
                dong.append(('CỘT D', mo_ta(cn, nhom), 'dòng %d' % rn,
                             qalib.kq_mac_dinh_chuan(nhom, ng, tim_kiem=tk),
                             d.replace('\n', ' ')[:70], '%s dòng %d' % (nm, rn)))
                t_cd += 1
                continue
            # ⓔ LỆCH KHUÔN MẪU (thêm 2026-09-14). Phép ⓐ chỉ đòi DỮ KIỆN (chữ gợi ý có mặt ở
            # đâu đó trong B/C/D) — cố ý lỏng, để bộ case cũ diễn đạt kiểu gì cũng không báo
            # oan. Nhưng chỉ thị 14/09 chốt lớp case §6 phải VERBATIM theo ảnh mẫu, mà phép ⓐ
            # thì bản cũ (chữ gợi ý nằm trong cột D) vẫn qua ⇒ không ô đếm nào chứng minh được
            # bộ case đã về khuôn mẫu. `fix_luat_cung.py` đưa về; ô này là chỗ soi lại.
            if tk:
                _mau = qalib.tk_mac_dinh_bo_ba(nhom)
                if (td.strip(), (c or '').strip(), (d or '').strip()) != _mau:
                    dong.append(('LỆCH MẪU', mo_ta(cn, nhom),
                                 'dòng %d — case §6 chưa đúng khuôn mẫu, chạy `fix_luat_cung.py`'
                                 % rn))
                    t_mau += 1

    # ⓓ hồ sơ màn khai trái luật -> XUNG ĐỘT, không phải nguồn để sửa case
    spec = ho_so_cua(sh.path)
    if spec is None:
        n_khong_ho_so += 1
    xd = qalib.soi_luat_cung_spec(spec) if spec else []
    if dong or xd:
        print('####', nm)
    for x in dong:
        if x[0] == 'CỘT D':
            in_vi_pham(x[1], x[3], x[4], x[5], '%-46s %s' % (x[1][:46], x[2]))
        else:
            print('   [%-8s] %-46s %s' % (x[0], x[1][:46], x[2]))
    for control, luat, yeu_cau, nguon in xd:
        # ── XUNG ĐỘT ĐÃ ĐƯỢC NGƯỜI ĐẶT VIỆC QUYẾT (vá 2026-09-14) ──────────────────────
        # Bộ rà cố ý không tự xử xung đột — nó báo và ĐỢI người quyết. Nhưng trước lượt này
        # không có chỗ ghi lại quyết định, nên một xung đột ĐÃ XỬ vẫn treo mãi ở ô đếm; treo
        # lâu thì người đọc quen bỏ qua cả ô đó. Nay quyết định ghi ở `qalib.XUNG_DOT_DA_QUYET`
        # và in RA ĐẦY ĐỦ dưới nhãn `ĐÃ QUYẾT`, chỉ là không tính vào ô đếm việc-chưa-xử.
        _qd = qalib.xung_dot_da_quyet(sh.name, control)
        if _qd:
            t_quyet += 1
            print('   [ĐÃ QUYẾT %s] %-30s luật: %s · hồ sơ: %s'
                  % (_qd[1], control[:30], luat, yeu_cau))
            import textwrap as _tw
            for _d in _tw.wrap(_qd[0], 92):
                print('      %s' % _d)
            continue
        t_xung += 1
        if CHI_TIET:
            print()
            print(qalib.bao_xung_dot(control, luat, yeu_cau, nguon))
        else:
            print('   %s %-32s luật: %s · hồ sơ: %s'
                  % (qalib.CO_XUNG_DOT, control[:32], luat, yeu_cau))

print('\n=== Cột D sai luật cứng: %d · Chọn sẵn giá trị: %d · Thiếu case mặc định: %d '
      '· Case §6 lệch khuôn mẫu: %d · Xung đột hồ sơ/BA CHƯA xử: %d · Bank lệch luật: %d  (%d file'
      % (t_cd, t_san, t_thieu, t_mau, t_xung, t_bank, n_file)
      + (' · %d xung đột ĐÃ QUYẾT)' % t_quyet if t_quyet else ')'))
if not n_file:
    print('!! KHÔNG rà được file nào — kiểm lại role/tên màn trước khi tin số 0 ở trên.')
if n_khong_ho_so:
    print('   (%d file không có hồ sơ màn — phép ⓐⓑⓒⓔ VẪN đo được vì luật cứng không cần '
          'ground; chỉ phép ⓓ là bỏ qua)' % n_khong_ho_so)
if t_cd or t_san or t_thieu or t_mau:
    print('   Sửa: python3 fix_luat_cung.py %s [tên màn] --apply' % ROLE)
if t_xung:
    print('   ⚠️ XUNG ĐỘT KHÔNG tự sửa được: tool KHÔNG đổi luật theo hồ sơ, và cũng KHÔNG im')
    print('      lặng nghe theo. Báo QA/BA quyết; quyết đổi thì sửa `qalib` cho CẢ tool.')

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Đồng bộ bộ test case màn "Yêu cầu tư vấn" (Admin) theo GIAO DIỆN MỚI — 2026-08-26.

Nguồn dữ kiện (probe hệ thống thật 26/08 + react/.../admin/ContactRequestManagement.tsx):
  - Bảng đổi cột: "Mã YC" (#YCxxxx) · "Người liên hệ" (chấm màu trạng thái + họ tên + chức vụ)
    · "Đơn vị" · "Tỉnh" · "Bậc học" (ẩn dưới màn xl) · "Quan tâm" · "Thông tin liên hệ"
    (email + SĐT) · "Ngày" · cột thao tác. KHÔNG còn cột "Trạng thái" riêng, không có cột STT.
  - Ô tìm kiếm: "Tìm theo tên, email, đơn vị, SĐT, mã YC..." — probe: YC0027 · yc0027 ·
    #YC0027 · 0027 đều ra đúng 1 bản ghi.
  - Badge số nay có ở CẢ 5 tab, đếm theo bộ lọc đang áp (5 request page_size=1), mỗi tab 1 màu.
  - Bộ đếm ký tự: Hình thức tư vấn 0/200 · Ghi chú thêm 0/5000 · Ghi chú nội bộ 0/5000;
    vượt → viền đỏ + dòng cảnh báo + nút hành động bị mờ (FE không cắt chuỗi).
  - Chân khung chi tiết: "Đã tư vấn" (chỉ khi Đã đọc) · "Lưu trữ" · "Phản hồi" (mở Gmail
    compose tab mới, ẩn khi Lưu trữ) · "Xóa".
  - Phân trang: « ‹ "Trang x / y" › » + "Mỗi trang" — KHÔNG có ô nhập số trang.
  - Export Excel bị vô hiệu khi danh sách rỗng.

Áp CÙNG kịch bản theo số dòng lên 3 file (nguồn + 2 thư mục kết quả) vì cả 3 đang khớp 1-1
từng dòng → cột F · G · S · T của 283 case cũ tự đi theo dòng, không mất kết quả đã chạy.
Không xoá case nào (luật 8): chỉ sửa nội dung tại chỗ + chèn 20 case mới.

    python3 bosung_yctv_0826.py            # dry-run
    python3 bosung_yctv_0826.py --apply    # ghi thật
"""
import os
import sys

import tcfix

BASE = '../../testCase/Admin'
FILES = [
    BASE + '/testcase/Testcase-Role-Admin-YeuCauTuVan.xlsx',
    BASE + '/ket-qua-test/Testcase-Role-Admin-YeuCauTuVan_ket_qua.xlsx',
    BASE + '/ket-qua-test-thu-cong/Testcase-Role-Admin-YeuCauTuVan_ket_qua.xlsx',
]

O = 'Tìm theo tên, email, đơn vị, SĐT'          # tên ô tìm kiếm CŨ
N = 'Tìm theo tên, email, đơn vị, SĐT, mã YC'   # tên ô tìm kiếm MỚI

# ─────────────────────────────── SỬA nội dung tại chỗ (giữ nguyên dòng) ───────────────

RETEXT = {
    # ── CN1 · Danh sách ────────────────────────────────────────────────────────────
    28: (None, '1. Quan sát tiêu đề bảng.',
         'Bảng có đúng các cột: "Mã YC", "Người liên hệ", "Đơn vị", "Tỉnh", "Bậc học", '
         '"Quan tâm", "Thông tin liên hệ", "Ngày" và một cột thao tác không có tiêu đề; '
         'tiêu đề cột khớp dữ liệu từng dòng.'),
    30: ('Kiểm tra chấm màu trạng thái trên dòng',
         '1. Xem yêu cầu ở 4 trạng thái khác nhau.',
         'Không có cột "Trạng thái" riêng — trạng thái thể hiện bằng chấm tròn màu đứng trước '
         'họ tên trong cột "Người liên hệ": "Mới" chấm xanh dương, "Đã đọc" chấm xám nhạt, '
         '"Đã tư vấn" chấm xanh lá, "Lưu trữ" chấm xám đậm.'),
    31: (None, '1. Xem yêu cầu không có Chức vụ hoặc Đơn vị.',
         'Ô trống hiển thị dấu "—", không để trắng và không vỡ bố cục dòng.'),
    # ── CN1 · Phân trang ───────────────────────────────────────────────────────────
    55: ('Kiểm tra bản ghi không lặp giữa các trang',
         '1. Ghi lại mã YC của các dòng ở trang 1.\n2. Sang trang 2, đối chiếu.',
         'Bảng không có cột số thứ tự; các mã YC ở trang 2 khác hoàn toàn trang 1, '
         'không lặp và không bỏ sót bản ghi nào; thứ tự vẫn là mới nhất trước.'),
    62: ('Kiểm tra chặn mở trang ngoài phạm vi',
         '1. Màn không có ô nhập số trang — gọi thẳng dịch vụ danh sách với số trang lớn hơn '
         'tổng số trang.\n2. Gọi lại với số trang bằng 0.',
         'Hệ thống không báo lỗi hệ thống: trang vượt phạm vi trả về danh sách rỗng, '
         'trang bằng 0 được đưa về trang 1; màn đang xem giữ nguyên trang hiện tại.'),
    # ── CN2 · Validate ô tìm kiếm ──────────────────────────────────────────────────
    97: (None, '1. Quan sát ô tìm kiếm khi mới vào.',
         'Ô để trống, hiển thị gợi ý "Tìm theo tên, email, đơn vị, SĐT, mã YC...".'),
    101: (None, '1. Nhập chuỗi chỉ gồm chữ số vào ô "%s".\n2. Nhấn Enter.' % N,
          'Ô nhận bình thường, coi chữ số là văn bản; danh sách lọc theo chuỗi số '
          '(khớp số điện thoại hoặc phần số của mã YC), không phát sinh lỗi.'),
    102: (None, '1. Nhập vào ô "%s" chuỗi tiếng Việt có đầy đủ dấu.\n2. Nhấn Enter.' % N,
          'Từ khóa hiển thị lại đúng nguyên văn, đủ dấu, không lỗi phông chữ; '
          'danh sách lọc đúng theo từ khóa có dấu.'),
    103: (None, '1. Dán vào ô "%s" một chuỗi rất dài (khoảng 500 ký tự).\n2. Nhấn Enter.' % N,
          'Ô nhận hết chuỗi, bố cục thanh lọc không vỡ; hệ thống tìm và trả về '
          '"Không tìm thấy yêu cầu nào", không báo lỗi hệ thống.'),
    104: ('Kiểm tra ô tìm kiếm không bắt buộc nhập',
          '1. Xóa trống ô "%s".\n2. Nhấn Enter.' % N,
          'Không báo lỗi bắt buộc; danh sách trở về toàn bộ yêu cầu theo các bộ lọc còn lại.'),
    105: ('Kiểm tra tìm bằng địa chỉ thư điện tử đầy đủ',
          '1. Nhập một địa chỉ thư điện tử hợp lệ của 1 yêu cầu.\n2. Nhấn Enter.',
          'Trả về đúng yêu cầu mang địa chỉ đó; ô tìm kiếm nhận mọi loại từ khóa nên '
          'không báo lỗi định dạng.'),
    106: ('Kiểm tra tìm bằng địa chỉ thư điện tử dùng chung nhiều yêu cầu',
          '1. Nhập địa chỉ thư điện tử đã có trong hệ thống.\n2. Nhấn Enter.',
          'Trả về đủ các yêu cầu dùng địa chỉ đó; ô tìm kiếm không kiểm tra trùng nên '
          'không báo lỗi "đã tồn tại".'),
    107: ('Kiểm tra tìm bằng chuỗi dài hơn 64 ký tự trước dấu @',
          '1. Nhập chuỗi có phần trước dấu @ dài hơn 64 ký tự.\n2. Nhấn Enter.',
          'Không báo lỗi định dạng; hệ thống coi là từ khóa thường và trả về '
          '"Không tìm thấy yêu cầu nào".'),
    # ── CN4 · giới hạn ký tự thật ──────────────────────────────────────────────────
    252: ('Kiểm tra nhập Hình thức tư vấn vượt 200 ký tự',
          '1. Dán vào ô "Hình thức tư vấn" chuỗi dài hơn 200 ký tự.\n'
          '2. Quan sát bộ đếm ký tự và nút "Xác nhận".',
          'Ô vẫn nhận hết chuỗi nhưng viền ô chuyển đỏ, bộ đếm đỏ dạng "2xx/200", hiện dòng '
          '"Hình thức tư vấn tối đa 200 ký tự" và nút "Xác nhận" bị mờ, không lưu được.'),
    253: ('Kiểm tra Hình thức tư vấn nhập trong độ dài cho phép',
          '1. Nhập "Hình thức tư vấn" dài đúng 200 ký tự.\n2. Chọn Ngày tư vấn.\n'
          '3. Bấm "Xác nhận".',
          'Lưu thành công; bộ đếm hiện "200/200" màu thường; giá trị hiển thị đầy đủ, '
          'không bị cắt chữ.'),
    265: ('Kiểm tra nhập Ghi chú thêm vượt 5000 ký tự',
          '1. Dán vào ô "Ghi chú thêm" chuỗi dài hơn 5000 ký tự.\n'
          '2. Quan sát bộ đếm ký tự và nút "Xác nhận".',
          'Ô vẫn nhận hết chuỗi nhưng viền ô chuyển đỏ, bộ đếm đỏ dạng "5xxx/5000", hiện dòng '
          '"Ghi chú tối đa 5000 ký tự" và nút "Xác nhận" bị mờ, không lưu được.'),
    276: ('Kiểm tra nhập Ghi chú nội bộ vượt 5000 ký tự',
          '1. Dán vào ô "Ghi chú nội bộ" chuỗi dài hơn 5000 ký tự.\n'
          '2. Quan sát bộ đếm ký tự và nút "Lưu ghi chú".',
          'Ô vẫn nhận hết chuỗi nhưng viền ô chuyển đỏ, bộ đếm đỏ dạng "5xxx/5000", hiện dòng '
          '"Ghi chú tối đa 5000 ký tự" và nút "Lưu ghi chú" bị mờ, không lưu được.'),
}

RENAME = {
    24: 'Badge số trên tab trạng thái',
    96: 'Textbox %s' % N,
    148: 'Textbox %s' % N,
}

# ─────────────────────────────── case MỚI ────────────────────────────────────────────

BADGE = [
    ('Kiểm tra số trên từng tab khớp số thật',
     '1. Quan sát số cạnh cả 5 tab.\n2. Bấm lần lượt từng tab, đối chiếu với dòng '
     '"Hiển thị x–y / N yêu cầu" ở chân bảng.',
     'Mỗi tab hiện đúng số yêu cầu của trạng thái đó (không phải số dòng của trang đang xem); '
     'số trên tab "Tất cả" bằng tổng số của 4 tab còn lại.'),
    ('Kiểm tra số trên tab đổi theo từ khóa và bộ lọc',
     '1. Ghi lại số trên 5 tab khi chưa lọc.\n2. Nhập một từ khóa (hoặc chọn Tỉnh/TP, Bậc học).\n'
     '3. Quan sát lại số trên cả 5 tab.',
     'Số trên từng tab được tính lại theo bộ lọc đang áp, không giữ số của toàn bộ dữ liệu.'),
    ('Kiểm tra số trên tab cập nhật sau khi đổi trạng thái',
     '1. Ghi lại số của tab "Mới" và tab "Đã đọc".\n'
     '2. Mở chi tiết 1 yêu cầu đang ở trạng thái "Mới" rồi đóng khung chi tiết.',
     'Số tab "Mới" giảm 1, số tab "Đã đọc" tăng 1 ngay, không cần bấm "Làm mới".'),
    ('Kiểm tra màu nền số trên từng tab',
     '1. Quan sát màu nền của con số cạnh 5 tab.',
     'Tab "Tất cả" nền xanh dương đậm chữ trắng; "Mới" nền xanh dương nhạt; "Đã đọc" nền '
     'xanh lá nhạt; "Đã tư vấn" nền cam nhạt; "Lưu trữ" nền xám — phân biệt được với nhau.'),
]

MAYC_COT = [
    ('Kiểm tra cột Mã YC',
     '1. Xem cột "Mã YC" của các dòng.\n2. Tải lại màn và đối chiếu.',
     'Mỗi yêu cầu có một mã dạng "#YCxxxx" hiển thị bằng phông đều (chữ nhỏ, màu nhạt), '
     'không có 2 dòng trùng mã; mã không đổi sau khi tải lại màn.'),
]

TIM_MAYC = [
    ('Tìm theo Mã YC',
     '1. Nhập đúng mã của 1 yêu cầu, ví dụ "YC0027".\n2. Nhấn Enter.',
     'Trả về đúng 1 yêu cầu mang mã đó; chân bảng hiện "Hiển thị 1–1 / 1 yêu cầu".'),
    ('Tìm theo Mã YC có kèm dấu #',
     '1. Nhập mã kèm dấu #, ví dụ "#YC0027".\n2. Nhấn Enter.',
     'Hệ thống bỏ qua dấu #, vẫn trả về đúng yêu cầu mang mã đó.'),
    ('Tìm theo một phần số của Mã YC',
     '1. Nhập phần số của mã, ví dụ "0027".\n2. Nhấn Enter.',
     'Trả về các yêu cầu có mã chứa chuỗi số đó, không báo lỗi.'),
]

MAYC_CHITIET = [
    ('Kiểm tra mã YC của yêu cầu trên khung chi tiết',
     '1. Ghi lại mã ở cột "Mã YC" của 1 dòng.\n2. Mở chi tiết dòng đó, quan sát đầu khung.',
     'Khung chi tiết hiển thị đúng mã YC của yêu cầu (cạnh họ tên và nhãn trạng thái) '
     'để đối chiếu khi trao đổi nội bộ.'),
]

BTN_PHANHOI = [
    ('Kiểm tra căn lề, chính tả của button',
     '1. Mở chi tiết 1 yêu cầu chưa lưu trữ.\n2. Quan sát nút "Phản hồi" ở chân khung.',
     'Nút hiện đúng chữ "Phản hồi" kèm biểu tượng mở liên kết ngoài, căn hàng cùng các nút '
     'khác ở chân khung, không sai chính tả.'),
]

CN_PHANHOI = [
    ('Kiểm tra bấm Phản hồi mở trình soạn thư',
     '1. Mở chi tiết 1 yêu cầu.\n2. Bấm "Phản hồi".',
     'Mở tab mới tới trình soạn thư Gmail với người nhận là email người gửi, tiêu đề '
     '"Re: Yêu cầu tư vấn từ <họ tên>" và phần nội dung chào sẵn; màn Yêu cầu tư vấn ở tab '
     'cũ giữ nguyên khung chi tiết đang mở.'),
    ('Kiểm tra ẩn nút Phản hồi với yêu cầu đã Lưu trữ',
     '1. Mở chi tiết 1 yêu cầu trạng thái "Lưu trữ".\n2. Quan sát chân khung.',
     'Chân khung chỉ còn nút "Xóa"; không còn nút "Phản hồi" và "Lưu trữ".'),
]

DEM_HTTV = [
    ('Kiểm tra bộ đếm ký tự ô Hình thức tư vấn',
     '1. Mở hộp thoại "Đã tư vấn".\n2. Gõ dần nội dung vào ô "Hình thức tư vấn".',
     'Góc phải dưới ô hiện "0/200" khi ô trống và tăng đúng theo số ký tự đã nhập.'),
    ('Kiểm tra bộ đếm ký tự đếm theo ký tự tiếng Việt có dấu',
     '1. Nhập đúng 10 ký tự tiếng Việt có dấu vào ô "Hình thức tư vấn".\n2. Đọc bộ đếm.',
     'Bộ đếm hiện "10/200" — đếm theo ký tự hiển thị, không tính theo byte.'),
]

DEM_GCT = [
    ('Kiểm tra bộ đếm ký tự ô Ghi chú thêm',
     '1. Mở hộp thoại "Đã tư vấn".\n2. Gõ dần nội dung vào ô "Ghi chú thêm".',
     'Góc phải dưới ô hiện "0/5000" khi ô trống và tăng đúng theo số ký tự đã nhập.'),
    ('Kiểm tra Ghi chú thêm giữ nguyên xuống dòng',
     '1. Nhập "Ghi chú thêm" gồm 3–4 dòng có xuống dòng.\n2. Bấm "Xác nhận".\n'
     '3. Mở lại chi tiết yêu cầu đó.',
     'Nội dung ghi chú hiển thị lại đúng số dòng đã nhập, không bị dồn thành một dòng.'),
]

DEM_GCNB = [
    ('Kiểm tra bộ đếm ký tự ô Ghi chú nội bộ',
     '1. Mở chi tiết 1 yêu cầu.\n2. Gõ dần nội dung vào ô "Ghi chú nội bộ".',
     'Góc phải dưới ô hiện "0/5000" khi ô trống và tăng đúng theo số ký tự đã nhập.'),
    ('Kiểm tra Ghi chú nội bộ giữ nguyên xuống dòng',
     '1. Nhập ghi chú gồm 3–4 dòng có xuống dòng.\n2. Bấm "Lưu ghi chú".\n'
     '3. Đóng và mở lại chi tiết yêu cầu đó.',
     'Nội dung ghi chú hiển thị lại đúng số dòng đã nhập, không bị dồn thành một dòng.'),
]

BTN_LUUGHICHU = [
    ('Kiểm tra căn lề, chính tả của button',
     '1. Mở chi tiết 1 yêu cầu.\n2. Quan sát nút "Lưu ghi chú" ngay dưới ô "Ghi chú nội bộ".',
     'Nút hiện đúng chữ "Lưu ghi chú" kèm biểu tượng lưu, nền màu chủ đạo, căn trái dưới ô '
     'nhập, không sai chính tả.'),
]

XUAT_RONG = [
    ('Kiểm tra nút Export Excel khi danh sách rỗng',
     '1. Lọc hoặc tìm sao cho bảng không còn yêu cầu nào.\n2. Quan sát nút "Export Excel".',
     'Nút bị mờ và không bấm được; không tải về tệp rỗng.'),
]

TOTAL_NEW = sum(len(x) for x in (BADGE, MAYC_COT, TIM_MAYC, MAYC_CHITIET, BTN_PHANHOI,
                                 CN_PHANHOI, DEM_HTTV, DEM_GCT, DEM_GCNB, BTN_LUUGHICHU,
                                 XUAT_RONG))


def cases(pl, items):
    for md, buoc, kq in items:
        pl.case(md, buoc, kq)


def build(tc, pl):
    pl.keep_range(12, 26)               # CN1 → hết nhóm Badge (2 case cũ)
    cases(pl, BADGE)                    # +4
    pl.keep_range(27, 28)               # sub2 Danh sách + case tiêu đề cột
    cases(pl, MAYC_COT)                 # +1
    pl.keep_range(29, 147)              # phần còn lại CN1 + CN2 tới hết nhóm Tab trạng thái
    pl.keep_range(148, 158)             # sub2 Textbox tìm kiếm (Chức năng tìm đơn lẻ)
    cases(pl, TIM_MAYC)                 # +3
    pl.keep_range(159, 215)             # CN2 còn lại + CN3 tới hết nhóm Khối Người gửi
    cases(pl, MAYC_CHITIET)             # +1
    pl.keep_range(216, 223)             # các khối chi tiết còn lại
    pl.add_sub2('Button Phản hồi')
    cases(pl, BTN_PHANHOI)              # +1
    pl.keep_range(224, 228)             # khối Chức năng + Chức năng xem chi tiết
    pl.add_sub('Chức năng Phản hồi qua thư điện tử')
    cases(pl, CN_PHANHOI)               # +2
    pl.keep_range(229, 253)             # ATTT CN3 + CN4 tới hết nhóm Hình thức tư vấn
    cases(pl, DEM_HTTV)                 # +2
    pl.keep_range(254, 265)             # Ô ngày + nhóm Ghi chú thêm
    cases(pl, DEM_GCT)                  # +2
    pl.keep_range(266, 276)             # nhóm Ghi chú nội bộ
    cases(pl, DEM_GCNB)                 # +2
    pl.add_sub2('Button Lưu ghi chú')
    cases(pl, BTN_LUUGHICHU)            # +1
    pl.keep_range(277, 375)             # CN4 còn lại + CN5 + CN6 tới hết Chức năng Xuất Excel
    cases(pl, XUAT_RONG)                # +1
    pl.keep_rest(376)                   # ATTT của CN Xuất Excel


def run(apply=False):
    for path in FILES:
        if not os.path.exists(path):
            sys.exit('DỪNG: không có file %s' % path)
        lock = os.path.join(os.path.dirname(path), '.~lock.%s#' % os.path.basename(path))
        if os.path.exists(lock):
            sys.exit('DỪNG: file đang mở trong LibreOffice → %s' % lock)

    for path in FILES:
        tc = tcfix.load(path)
        n_old = sum(1 for r in tc.order if r >= 12 and tc.c(r, 'C'))
        for rn, txt in RENAME.items():
            assert tc.lvl(rn) == 'sub2', 'r%d không phải nhóm sub2' % rn
            tc.rename(rn, txt)
        for rn, (md, buoc, kq) in RETEXT.items():
            assert tc.c(rn, 'C'), 'r%d không phải dòng case' % rn
            tc.retext(rn, md=md, buoc=buoc, kq=kq)
        pl = tcfix.Plan(tc)
        build(tc, pl)
        tc.rebuild(pl)
        lost = [(r, (tc.c(r, 'B') or '')[:50]) for r in tc._dropped if tc.c(r, 'C')]
        if lost:
            sys.exit('DỪNG: %d case cũ bị mất: %s' % (len(lost), lost))
        if tc._dropped:
            sys.exit('DỪNG: bỏ mất dòng khung %s' % tc._dropped)
        print('%-58s %d → %d case (+%d)' % (os.path.basename(path), n_old, tc._n,
                                            tc._n - n_old))
        assert tc._n - n_old == TOTAL_NEW, 'lệch số case mới: %d ≠ %d' % (tc._n - n_old, TOTAL_NEW)
        if apply:
            tc.save(sync=True, quiet=True)
            print('      ĐÃ GHI')


if __name__ == '__main__':
    run('--apply' in sys.argv)

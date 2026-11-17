# -*- coding: utf-8 -*-
"""Bù nhóm control THẬT cho các CN có khối Validate trống sau đợt dọn nhóm trừu tượng 2026-08-06.

Luật §2 luật 3 + 11 (DINH-MUC-VALIDATE-testcase.md): mỗi CN phải đủ 4 khối, và nhóm trong
Validate chỉ đặt theo CONTROL CÓ THẬT trên màn (lấy từ chính khối Chức năng của CN đó,
không suy đoán). CN Xuất được miễn Validate -> bỏ hẳn header.

Dùng:  python3 fix_validate_0806.py [--apply]
"""
import os, sys, unicodedata, tcfix

# Đường dẫn dữ liệu lấy từ hồ sơ dự án (vá 2026-09-08). Bản cũ ghép cứng
# `../../testCase/Admin/testcase/` — chỉ đúng khi `tool_v2` nằm TRONG `qa-doc`; dời repo ra
# chỗ khác là script chết ngay lúc import (FileNotFoundError), không chạy nổi một dòng.
import roles
DIR = roles.get('Admin')['dir']
APPLY = '--apply' in sys.argv


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


# ── bộ case chuẩn theo loại control (bám wording quota_cases.py) ──
def BUTTON(f, server=True):
    out = [('Kiểm tra căn lề, chính tả của button',
            f'1. Quan sát nút "{f}".',
            'Đúng chính tả, chữ trong nút được căn giữa.')]
    if server:
        out.append(('Kiểm tra khoá nút khi đang xử lý',
                    f'1. Bấm nút "{f}".\n2. Trong lúc hệ thống đang xử lý, bấm tiếp nút đó.',
                    'Nút bị khoá trong lúc đang xử lý, không tạo thêm yêu cầu trùng.'))
    return out


def ICON(f, extra):
    return [
        ('Kiểm tra biểu tượng thao tác phù hợp với chức năng',
         '1. Quan sát các biểu tượng thao tác trên dòng.',
         'Mỗi biểu tượng phù hợp với chức năng của nó.'),
        extra,
        ('Kiểm tra chú thích hiện khi rê chuột và ẩn khi bỏ chuột',
         '1. Rê chuột lên biểu tượng.\n2. Đưa chuột ra khỏi biểu tượng.',
         'Chú thích hiện khi rê chuột và biến mất ngay khi con trỏ rời đi.'),
        ('Kiểm tra đổi màu và con trỏ khi rê chuột vào biểu tượng',
         '1. Rê chuột lên biểu tượng.',
         'Biểu tượng đổi màu và con trỏ đổi thành hình bàn tay.'),
        ('Kiểm tra nội dung và chính tả của chú thích',
         '1. Đọc chú thích của từng biểu tượng.',
         'Chú thích đủ nghĩa để hiểu chức năng, không sai chính tả.'),
    ]


def DETAIL(f):
    return [
        (f'Kiểm tra {f} khi có trường không có dữ liệu',
         '1. Xem bản ghi có trường không bắt buộc bị để trống.',
         'Trường trống hiện giá trị rỗng hoặc dấu gạch.'),
        (f'Kiểm tra {f} khi tất cả các trường đều có dữ liệu',
         '1. Xem bản ghi đã điền đủ thông tin.',
         'Không có trường nào bị trống giá trị.'),
        (f'Kiểm tra {f} khi dữ liệu quá dài',
         '1. Xem bản ghi có giá trị rất dài.',
         'Hiển thị đầy đủ, giao diện không bị xô lệch.'),
        (f'Kiểm tra {f} khớp dữ liệu trong hệ thống',
         '1. Đối chiếu từng thông tin trên màn với dữ liệu đang lưu trong hệ thống.',
         'Thông tin hiển thị khớp với dữ liệu đang lưu trong hệ thống.'),
    ]


def DIALOG(f):
    return [
        (f'Kiểm tra nội dung {f}',
         f'1. Mở "{f}".',
         'Hộp hiện đúng tiêu đề, nội dung nhắc và hai nút hành động.'),
        (f'Kiểm tra dữ liệu bản ghi hiện trong {f}',
         f'1. Mở "{f}" từ một bản ghi có tên dài.',
         'Hộp hiện đúng thông tin bản ghi đang chọn; tên dài không làm vỡ khung.'),
        (f'Kiểm tra căn lề, chính tả trên {f}',
         '1. Đọc tiêu đề, nội dung và nhãn hai nút.',
         'Không sai chính tả; chữ trong nút được căn giữa, hai nút thẳng hàng.'),
    ]


# ── việc cần làm: (file, đầu tên CN, [(tên nhóm, [case…])]) ; None = bỏ header Validate ──
JOBS = [
    ('BaiViet', 'ĐĂNG BÀI VIẾT', [('Button Đăng', BUTTON('Đăng'))]),
    ('DanhMucBaiViet', 'ẨN / HIỆN DANH MỤC', [
        ('Icon thao tác Ẩn / Hiện trên dòng',
         ICON('Ẩn / Hiện', ('Kiểm tra biểu tượng đổi theo trạng thái hiện tại của danh mục',
                            '1. Xem biểu tượng ở dòng danh mục đang hiện.\n'
                            '2. Xem biểu tượng ở dòng danh mục đang ẩn.',
                            'Biểu tượng phản ánh đúng trạng thái hiện tại và thao tác sẽ thực hiện khi bấm.')))]),
    ('DonHang', 'XEM CHI TIẾT ĐƠN', [('Hiển thị chi tiết đơn hàng', DETAIL('chi tiết đơn hàng'))]),
    ('DonHang', 'THAO TÁC VÒNG ĐỜI ĐƠN', [
        ('Hộp thoại xác nhận thao tác vòng đời đơn', DIALOG('hộp thoại xác nhận thao tác'))]),
    ('GanBoSach', 'BỎ GÁN BỘ SÁCH', [('Button Bỏ gán', BUTTON('Bỏ gán'))]),
    ('ThongBaoHeThong', 'ĐÁNH DẤU TẤT CẢ THÔNG BÁO ĐÃ ĐỌC', [
        ('Button Đánh dấu tất cả đã đọc', BUTTON('Đánh dấu tất cả đã đọc'))]),
    ('ThongTinLienHe', 'TỔNG QUAN MÀN & TẢI DỮ LIỆU', [
        ('Hiển thị chi tiết thông tin liên hệ đang lưu', DETAIL('thông tin liên hệ đang lưu'))]),
    ('YeuCauTuVan', 'XUẤT EXCEL DANH SÁCH YÊU CẦU TƯ VẤN', None),   # CN Xuất: miễn Validate
    # nút bắt buộc còn thiếu (audit_extra) — chỉ bù khi nút CÓ THẬT (§0.4 luật 1).
    # Platform / TAB OTA UPDATE: case "không có bước xác nhận trước khi Deploy" đã chứng minh
    # màn KHÔNG có nút Hủy -> cố ý bỏ trống, không bù (nhiễu đúng chuẩn của bộ rà).
    ('TaiKhoan', 'GIẢI PHÓNG EMAIL MỒ CÔI', [
        ('Button Hủy', [
            ('Kiểm tra căn lề, chính tả của button',
             '1. Mở hộp xác nhận giải phóng email.\n2. Quan sát nút hủy trong hộp.',
             'Đúng chính tả, chữ trong nút được căn giữa, hai nút thẳng hàng.')])]),
]


def val_row(tc, cn_row):
    """Dòng header 'Validate các trường thông tin' của CN cn_row."""
    for rn in tc.order:
        if rn <= cn_row: continue
        if tc.lvl(rn) == 'cn': return None
        if tc.lvl(rn) == 'sub' and 'validate' in norm(tc.c(rn, 'B') or ''): return rn
    return None


def cn_row_of(tc, head):
    for rn in tc.order:
        if rn >= 12 and tc.lvl(rn) == 'cn' and (tc.c(rn, 'B') or '').strip().startswith(head):
            return rn
    return None


by_file = {}
for f, head, groups in JOBS:
    by_file.setdefault(f, []).append((head, groups))

for f, jobs in by_file.items():
    path = DIR + f'Testcase-Role-Admin-{f}.xlsx'
    tc = tcfix.load(path)
    todo = {}                     # dòng header Validate -> nhóm cần chèn (None = xoá header)
    for head, groups in jobs:
        cn = cn_row_of(tc, head)
        if cn is None: print(f'  !! {f}: không thấy CN "{head}"'); continue
        vr = val_row(tc, cn)
        if vr is None: print(f'  !! {f}: CN "{head}" không có header Validate'); continue
        todo[vr] = groups
        n = sum(len(c) for _, c in groups) if groups else 0
        print(f'  [{f}] CN "{head[:40]}" r{vr}: ' +
              (f'+{len(groups)} nhóm · {n} case' if groups else 'bỏ header Validate (CN Xuất)'))
    if not APPLY or not todo: continue
    plan = tcfix.Plan(tc)
    for rn in tc.order:
        if rn < 12: continue
        if rn in todo and todo[rn] is None: continue          # bỏ hẳn header Validate
        plan.keep(rn)
        for name, cases in (todo.get(rn) or []):
            plan.add_sub2(name)
            for b, c, d in cases: plan.case(b, c, d)
    tc.rebuild(plan).save()

print('=== xong ===' if APPLY else '=== DRY-RUN ===')

# -*- coding: utf-8 -*-
"""B3 — tái cấu trúc 4 file test case nhóm "Quản lý khai báo" cho khớp luật §0
của `../luat/DINH-MUC-VALIDATE-testcase.md`.

⛔ **KHÔNG CHẠY LẠI SCRIPT NÀY** (cảnh báo thêm 2026-09-03). Các lệnh `rename_group` ở dưới đổi
tên nhóm NGƯỢC với mẫu chuẩn — chính chúng đã tạo ra lệch chuẩn phải đi sửa lại 52 chỗ ngày
2026-09-03:
    'Selectbox Số lượng bản ghi trên trang' -> 'Selectbox Số dòng mỗi trang'   (SAI, mẫu dùng "bản ghi")
    'Textbox Thứ tự hiển thị'               -> 'Textbox số Thứ tự hiển thị'    (SAI, mẫu không có tiền tố "số")
Tên đúng hiện hành: `Selectbox Số bản ghi trên trang` · `Textbox Thứ tự hiển thị`.
Giữ file này chỉ để tra lịch sử.

Chỉ CHUYỂN CHỖ / ĐỔI TÊN / THÊM nhóm rỗng — **không xoá case nào** (luật 8), nên cột
F · G · R · T (kết quả đã chạy) đi theo đúng dòng của nó. Nhóm rỗng thêm vào sẽ được
`patch_quota.py` bơm đủ định mức ở bước sau.

Việc làm:
  1. Bỏ tiền tố `CNxx: ` khỏi tên chức năng (bộ Admin không dùng).
  2. Rút tiêu đề khối ATTT về đúng cụm `An toàn thông tin`.
  3. `Giao diện chung` về ĐÚNG 6 case: case `nhấn Enter` chuyển sang nhóm Chức năng của
     chính CN đó (mục *Tab + Enter* của checklist `audit_func`), KHÔNG xoá.
  4. Tách nhóm gộp 2 control thành 2 nhóm (luật 2).
  5. Đổi tên nhóm không phải control thật / đặt sai loại control (luật 11 + bẫy §6).
  6. Gói case treo thẳng dưới khối `Chức năng` vào một nhóm `Chức năng <thao tác>`.
  7. Thêm nhóm control CÓ THẬT trên màn nhưng bộ case còn thiếu (đối chiếu bản probe
     hệ thống thật ngày 2026-08-17): `Icon thao tác trên dòng`, `Button Huỷ`/`Button <hành động>`,
     `Textbox xác nhận tên` của hộp thoại xoá màn Xuất xứ.
  8. Vá cột D lộ thuật ngữ code (luật 7): badge/toast/grid → tiếng Việt.

    python3 restructure_khaibao_0817.py            # dry-run
    python3 restructure_khaibao_0817.py --apply
"""
import os, re, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles
from khaibao_shell_0817 import fix_r_column

DIR = roles.get('Admin')['dir']
ENTER = 'Kiểm tra chức năng của màn hình khi nhấn Enter'


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


# ─────────────────────────────────────────────────────────────── cây tài liệu

class Node:
    """Một dòng của bảng: tiêu đề (cn/grp/sub/sub2) hoặc case."""
    __slots__ = ('kind', 'text', 'row')

    def __init__(self, kind, text, row=None):
        self.kind, self.text, self.row = kind, text, row

    def head(self):
        return (self.text or '').split('\n')[0].strip()

    def __repr__(self):
        return '<%s %r r=%s>' % (self.kind, self.head()[:40], self.row)


def parse(tc):
    return [Node(tc.lvl(rn), tc.c(rn, 'B') or '', rn) for rn in tc.order if rn >= 12]


def idx_of(seq, pred, start=0):
    for i in range(start, len(seq)):
        if pred(seq[i]):
            return i
    return -1


def cn_span(seq, i):
    """[đầu, cuối) của CN chứa chỉ số i."""
    a = i
    while a >= 0 and seq[a].kind != 'cn':
        a -= 1
    b = a + 1
    while b < len(seq) and seq[b].kind != 'cn':
        b += 1
    return a, b


def block_span(seq, a, b, name):
    """[đầu, cuối) của khối grp tên `name` trong khoảng CN [a,b)."""
    i = idx_of(seq, lambda n: n.kind == 'grp' and norm(name) in norm(n.head()), a)
    if i < 0 or i >= b:
        return -1, -1
    j = i + 1
    while j < b and seq[j].kind != 'grp':
        j += 1
    return i, j


def group_span(seq, a, b, name):
    """[dòng tiêu đề, hết case) của nhóm sub/sub2 khớp `name` trong [a,b)."""
    i = idx_of(seq, lambda n: n.kind in ('sub', 'sub2') and norm(n.head()) == norm(name), a)
    if i < 0 or i >= b:
        i = idx_of(seq, lambda n: n.kind in ('sub', 'sub2') and norm(name) in norm(n.head()), a)
    if i < 0 or i >= b:
        return -1, -1
    j = i + 1
    while j < b and seq[j].kind == 'case':
        j += 1
    return i, j


# ─────────────────────────────────────────────────────────────── phép biến đổi

def strip_cn_prefix(seq, log):
    for n in seq:
        if n.kind == 'cn':
            new = re.sub(r'^CN\d+\s*[:.]\s*', '', n.text)
            if new != n.text:
                n.text = new
                log.append('  CN  đổi tên → %s' % new.split('\n')[0][:60])


def short_attt(seq, log):
    for n in seq:
        if n.kind == 'grp' and n.head().startswith('An toàn thông tin ('):
            n.text = 'An toàn thông tin'
            log.append('  khối ATTT → "An toàn thông tin"')


def move_enter(seq, log, dest_by_cn):
    """Chuyển case `nhấn Enter` khỏi Giao diện chung sang nhóm Chức năng của cùng CN.

    Gỡ HẾT trong một lượt rồi mới chèn lại — nếu vừa tìm vừa chèn thì case vừa chèn lại
    bị tìm thấy ở vòng sau và script quay vòng vô tận.
    """
    pending, keep, cur = [], [], None
    for n in seq:
        if n.kind == 'cn':
            cur = n.head()
        if n.kind == 'case' and n.head() == ENTER:
            pending.append((cur, n))
            continue
        keep.append(n)
    seq[:] = keep
    for cn, node in pending:
        i = idx_of(seq, lambda x: x.kind == 'cn' and x.head() == cn)
        if i < 0:
            seq.append(node); continue
        a, b = cn_span(seq, i)
        dest = next((v for k, v in dest_by_cn.items() if norm(k) in norm(cn)), None)
        gi, gj = group_span(seq, a, b, dest) if dest else (-1, -1)
        if gi < 0:                                   # chưa có nhóm đích → cuối khối Chức năng
            ci, cj = block_span(seq, a, b, 'Chức năng')
            gj = cj if ci >= 0 else b
        seq.insert(gj, node)
        log.append('  "nhấn Enter" → %s / %s' % (cn[:34], dest or 'khối Chức năng'))


def rename_group(seq, log, old, new, cn_hint=None):
    for i, n in enumerate(seq):
        if n.kind not in ('sub', 'sub2') or norm(n.head()) != norm(old):
            continue
        if cn_hint:
            a, _ = cn_span(seq, i)
            if norm(cn_hint) not in norm(seq[a].head()):
                continue
        n.text = new
        log.append('  nhóm "%s" → "%s"' % (old[:44], new))


def split_group(seq, log, old, first_name, first_n, second_name):
    """Tách nhóm gộp: `first_n` case đầu ở lại nhóm 1, phần còn lại sang nhóm 2.

    Tên hai nhóm mới truyền vào ĐẦY ĐỦ (kể cả hậu tố "(Sửa)") — suy hậu tố từ tên cũ
    từng làm hụt "(Sửa)" ở nhóm `Datepicker Ngày bắt đầu/kết thúc (Sửa, vẫn giữ min/max…)`.
    """
    i = idx_of(seq, lambda n: n.kind in ('sub', 'sub2') and norm(n.head()) == norm(old))
    if i < 0:
        log.append('  ⚠ KHÔNG THẤY nhóm cần tách: "%s"' % old[:60])
        return 0
    j = i + 1
    while j < len(seq) and seq[j].kind == 'case':
        j += 1
    seq[i].text = first_name
    seq.insert(i + 1 + first_n, Node(seq[i].kind, second_name))
    log.append('  tách "%s" → "%s" (%d case) + "%s" (%d case)'
               % (old[:40], first_name, first_n, second_name, j - i - 1 - first_n))
    return 1


def wrap_block_cases(seq, log, cn_name, block, group_name):
    """Case treo thẳng dưới khối (không có nhóm) → gói vào một nhóm sub."""
    i = idx_of(seq, lambda n: n.kind == 'cn' and norm(cn_name) in norm(n.head()))
    if i < 0:
        return
    a, b = cn_span(seq, i)
    bi, bj = block_span(seq, a, b, block)
    if bi < 0 or bi + 1 >= bj or seq[bi + 1].kind != 'case':
        return
    seq.insert(bi + 1, Node('sub', group_name))
    log.append('  %s / %s: gói %d case rời vào nhóm "%s"'
               % (cn_name[:28], block, bj - bi - 1, group_name))


def add_group_after(seq, log, cn_name, after, new_name, kind='sub2'):
    """Thêm nhóm control RỖNG (patch_quota sẽ bơm case) ngay sau nhóm `after`."""
    i = idx_of(seq, lambda n: n.kind == 'cn' and norm(cn_name) in norm(n.head()))
    if i < 0:
        return
    a, b = cn_span(seq, i)
    gi, gj = group_span(seq, a, b, after)
    if gi < 0:
        return
    if group_span(seq, a, b, new_name)[0] >= 0:
        return
    seq.insert(gj, Node(kind, new_name))
    log.append('  %s: thêm nhóm "%s"' % (cn_name[:28], new_name))


def merge_group(seq, log, cn_name, src, dst):
    """Dồn case của nhóm `src` vào cuối nhóm `dst` (cùng CN) rồi bỏ dòng tiêu đề rỗng."""
    i = idx_of(seq, lambda n: n.kind == 'cn' and norm(cn_name) in norm(n.head()))
    if i < 0:
        return
    a, b = cn_span(seq, i)
    si, sj = group_span(seq, a, b, src)
    if si < 0:
        return
    cases = seq[si + 1:sj]
    del seq[si:sj]
    a, b = cn_span(seq, i)
    di, dj = group_span(seq, a, b, dst)
    if di < 0:
        return
    seq[dj:dj] = cases
    log.append('  %s: dồn %d case "%s" → "%s"' % (cn_name[:28], len(cases), src[:36], dst))


def move_group_to_cn(seq, log, src_cn, group, dst_cn, dst_after):
    """Chuyển nguyên một nhóm control sang CN khác (luật 13 — bộ lọc thuộc CN tìm kiếm)."""
    i = idx_of(seq, lambda n: n.kind == 'cn' and norm(src_cn) in norm(n.head()))
    if i < 0:
        return
    a, b = cn_span(seq, i)
    gi, gj = group_span(seq, a, b, group)
    if gi < 0:
        return
    chunk = seq[gi:gj]
    del seq[gi:gj]
    k = idx_of(seq, lambda n: n.kind == 'cn' and norm(dst_cn) in norm(n.head()))
    a2, b2 = cn_span(seq, k)
    ai, aj = group_span(seq, a2, b2, dst_after)
    seq[aj:aj] = chunk
    log.append('  chuyển nhóm "%s": %s → %s' % (group[:34], src_cn[:24], dst_cn[:24]))


# ─────────────────────────────────────────────────────────────── vá cột D

D_FIX = [
    (r'\bbadge\b', 'nhãn'), (r'\bBadge\b', 'Nhãn'),
    (r'\btoast\b', 'thông báo nổi'), (r'\bToast\b', 'Thông báo nổi'),
    (r'\bgrid\b', 'bảng danh sách'), (r'\bGrid\b', 'Bảng danh sách'),
    (r'\bmodal\b', 'hộp thoại'), (r'\bModal\b', 'Hộp thoại'),
    (r'\bsoft-delete\b', 'xoá mềm'), (r'\bplaceholder\b', 'chữ gợi ý'),
    (r'\bcheckbox\b', 'ô tích chọn'), (r'\btooltip\b', 'chú thích'),
]


def fix_d(tc, log):
    n = 0
    for rn in tc.order:
        if rn < 12 or not tc.c(rn, 'C'):
            continue
        d = tc.c(rn, 'D') or ''
        new = d
        for pat, rep in D_FIX:
            new = re.sub(pat, rep, new)
        if new != d:
            tc.retext(rn, kq=new)
            n += 1
    if n:
        log.append('  vá cột D (thuật ngữ code → tiếng Việt): %d case' % n)


# ─────────────────────────────────────────────────────────────── kịch bản/file

def build_LoaiThietBi(seq, log):
    strip_cn_prefix(seq, log); short_attt(seq, log)
    rename_group(seq, log, 'Danh sách (Grid)', 'Danh sách loại thiết bị')
    rename_group(seq, log, 'Selectbox Số lượng bản ghi trên trang', 'Selectbox Số dòng mỗi trang')
    rename_group(seq, log, 'Kiểm tra dữ liệu hiển thị trong danh sách', 'Chức năng Danh sách')
    rename_group(seq, log, 'Chức năng Tìm kiếm', 'Chức năng Tìm kiếm chung')
    rename_group(seq, log, 'Modal Không thể thực hiện (BlockedModal)', 'Hộp thoại Không thể ẩn')
    rename_group(seq, log, 'Modal xác nhận Xóa (Yes/No đơn giản)', 'Hộp xác nhận Xóa')
    rename_group(seq, log, 'Textbox Thứ tự hiển thị', 'Textbox số Thứ tự hiển thị')
    split_group(seq, log, 'Textbox Tên loại thiết bị / Textarea Mô tả',
                'Textbox Tên loại thiết bị', 5, 'Textarea Mô tả')
    split_group(seq, log, 'Textbox Tên loại thiết bị / Textarea Mô tả (Sửa)',
                'Textbox Tên loại thiết bị (Sửa)', 5, 'Textarea Mô tả (Sửa)')
    wrap_block_cases(seq, log, 'ẨN/HIỆN LOẠI THIẾT BỊ', 'Chức năng', 'Chức năng Ẩn/Hiện')
    wrap_block_cases(seq, log, 'XÓA LOẠI THIẾT BỊ', 'Chức năng', 'Chức năng Xóa')
    wrap_block_cases(seq, log, 'NHẬP EXCEL', 'Chức năng', 'Chức năng Nhập Excel')
    move_enter(seq, log, {'THÊM MỚI LOẠI THIẾT BỊ': 'Chức năng Thêm mới',
                          'CHỈNH SỬA LOẠI THIẾT BỊ': 'Chức năng Cập nhật',
                          'XÓA LOẠI THIẾT BỊ': 'Chức năng Xóa'})
    add_group_after(seq, log, 'DANH SÁCH LOẠI THIẾT BỊ', 'Danh sách loại thiết bị',
                    'Icon thao tác trên dòng')
    add_group_after(seq, log, 'CHỈNH SỬA LOẠI THIẾT BỊ', 'Checkbox Có thành phần con (Sửa)', 'Button Huỷ')
    add_group_after(seq, log, 'CHỈNH SỬA LOẠI THIẾT BỊ', 'Button Huỷ', 'Button Lưu')
    add_group_after(seq, log, 'XÓA LOẠI THIẾT BỊ', 'Hộp xác nhận Xóa', 'Button Huỷ')
    add_group_after(seq, log, 'XÓA LOẠI THIẾT BỊ', 'Button Huỷ', 'Button Xóa')


def build_XuatXu(seq, log):
    strip_cn_prefix(seq, log); short_attt(seq, log)
    rename_group(seq, log, 'Danh sách (Grid)', 'Danh sách xuất xứ')
    rename_group(seq, log, 'Selectbox Số lượng bản ghi trên trang', 'Selectbox Số dòng mỗi trang')
    rename_group(seq, log, 'Kiểm tra dữ liệu hiển thị trong danh sách', 'Chức năng Danh sách')
    rename_group(seq, log, 'Chức năng Tìm kiếm', 'Chức năng Tìm kiếm chung')
    rename_group(seq, log, 'Ghi chú tĩnh về Thứ tự hiển thị (KHÔNG có control nhập)',
                 'Ghi chú trên biểu mẫu về thứ tự')
    rename_group(seq, log, 'Phản hồi khi bị chặn (chỉ TOAST, KHÔNG có modal riêng)',
                 'Thông báo nổi khi bị chặn')
    rename_group(seq, log, 'Banner "Đã thay đổi thứ tự — chưa lưu." (local-first, chưa persist ngay)',
                 'Thanh nhắc Đã thay đổi thứ tự')
    split_group(seq, log, 'Textbox Tên xuất xứ / Textarea Mô tả',
                'Textbox Tên xuất xứ', 5, 'Textarea Mô tả')
    split_group(seq, log, 'Textbox Tên xuất xứ / Textarea Mô tả (Sửa)',
                'Textbox Tên xuất xứ (Sửa)', 5, 'Textarea Mô tả (Sửa)')
    split_group(seq, log, 'Modal xác nhận Xóa — YÊU CẦU GÕ LẠI ĐÚNG TÊN (duy nhất trong 11 màn)',
                'Hộp xác nhận Xóa', 1, 'Textbox xác nhận tên xuất xứ')
    wrap_block_cases(seq, log, 'ẨN/HIỆN XUẤT XỨ', 'Chức năng', 'Chức năng Ẩn/Hiện')
    wrap_block_cases(seq, log, 'XÓA XUẤT XỨ', 'Chức năng', 'Chức năng Xóa')
    wrap_block_cases(seq, log, 'SẮP XẾP THỨ TỰ', 'Chức năng', 'Chức năng Sắp xếp thứ tự')
    move_enter(seq, log, {'THÊM MỚI XUẤT XỨ': 'Chức năng Thêm mới',
                          'CHỈNH SỬA XUẤT XỨ': 'Chức năng Cập nhật',
                          'XÓA XUẤT XỨ': 'Chức năng Xóa'})
    add_group_after(seq, log, 'DANH SÁCH XUẤT XỨ', 'Danh sách xuất xứ', 'Icon thao tác trên dòng')
    add_group_after(seq, log, 'CHỈNH SỬA XUẤT XỨ', 'Textarea Mô tả (Sửa)', 'Button Huỷ')
    add_group_after(seq, log, 'CHỈNH SỬA XUẤT XỨ', 'Button Huỷ', 'Button Lưu')
    add_group_after(seq, log, 'XÓA XUẤT XỨ', 'Textbox xác nhận tên xuất xứ', 'Button Huỷ')
    add_group_after(seq, log, 'XÓA XUẤT XỨ', 'Button Huỷ', 'Button Xóa')


def build_NangLucCotLoi(seq, log):
    strip_cn_prefix(seq, log); short_attt(seq, log)
    rename_group(seq, log, 'Danh sách (Grid)', 'Danh sách năng lực cốt lõi')
    rename_group(seq, log, 'Selectbox Số lượng bản ghi trên trang', 'Selectbox Số dòng mỗi trang')
    rename_group(seq, log, 'Kiểm tra dữ liệu hiển thị trong danh sách', 'Chức năng Danh sách')
    rename_group(seq, log, 'Chức năng Tìm kiếm & Lọc chung', 'Chức năng Tìm kiếm chung')
    rename_group(seq, log, 'Icon Ẩn/Hiện (không có modal xác nhận)', 'Icon thao tác Ẩn/Hiện trên dòng')
    rename_group(seq, log, 'Modal xác nhận Xóa', 'Hộp xác nhận Xóa')
    rename_group(seq, log, 'Textbox Thứ tự', 'Textbox số Thứ tự (thứ tự hiển thị)')
    split_group(seq, log, 'Textbox Tên / Textarea Mô tả', 'Textbox Tên', 5, 'Textarea Mô tả')
    split_group(seq, log, 'Textbox Tên / Textarea Mô tả (Sửa)',
                'Textbox Tên (Sửa)', 5, 'Textarea Mô tả (Sửa)')
    # luật 13: ô tích lọc thuộc CN TÌM KIẾM, không thuộc CN danh sách
    move_group_to_cn(seq, log, 'DANH SÁCH NĂNG LỰC CỐT LÕI', 'Checkbox Bao gồm mục đã ẩn',
                     'TÌM KIẾM & LỌC NĂNG LỰC CỐT LÕI', 'Textbox tìm kiếm (Mã hoặc Tên)')
    wrap_block_cases(seq, log, 'ẨN/HIỆN NĂNG LỰC CỐT LÕI', 'Chức năng', 'Chức năng Ẩn/Hiện')
    wrap_block_cases(seq, log, 'XÓA NĂNG LỰC CỐT LÕI', 'Chức năng', 'Chức năng Xóa')
    wrap_block_cases(seq, log, 'NHẬP EXCEL', 'Chức năng', 'Chức năng Nhập Excel')
    move_enter(seq, log, {'THÊM MỚI NĂNG LỰC CỐT LÕI': 'Chức năng Thêm mới',
                          'CHỈNH SỬA NĂNG LỰC CỐT LÕI': 'Chức năng Cập nhật',
                          'XÓA NĂNG LỰC CỐT LÕI': 'Chức năng Xóa'})
    add_group_after(seq, log, 'DANH SÁCH NĂNG LỰC CỐT LÕI', 'Danh sách năng lực cốt lõi',
                    'Icon thao tác trên dòng')
    add_group_after(seq, log, 'XÓA NĂNG LỰC CỐT LÕI', 'Hộp xác nhận Xóa', 'Button Huỷ')
    add_group_after(seq, log, 'XÓA NĂNG LỰC CỐT LÕI', 'Button Huỷ', 'Button Xóa')


def build_NamHocHocKy(seq, log):
    strip_cn_prefix(seq, log); short_attt(seq, log)
    # màn danh sách là THẺ CÂY 2 cấp: gộp case thẻ Học kỳ vào chính nhóm danh sách (§0.4.4)
    rename_group(seq, log, 'Thẻ Năm học (card, có thể mở/thu gọn)', 'Danh sách thẻ Năm học')
    merge_group(seq, log, 'DANH SÁCH NĂM HỌC', 'Thẻ Học kỳ (nested trong Năm học)',
                'Danh sách thẻ Năm học')
    rename_group(seq, log, 'Selectbox Số lượng bản ghi trên trang', 'Selectbox Số dòng mỗi trang')
    rename_group(seq, log, 'Kiểm tra dữ liệu hiển thị trong danh sách', 'Chức năng Danh sách')
    rename_group(seq, log, 'Modal xác nhận Xóa Năm học', 'Hộp xác nhận Xóa năm học')
    rename_group(seq, log, 'Modal xác nhận Xóa Học kỳ', 'Hộp xác nhận Xóa học kỳ')
    split_group(seq, log, 'Datepicker Ngày bắt đầu / Ngày kết thúc (Sửa)',
                'Datepicker Ngày bắt đầu (Sửa)', 1, 'Datepicker Ngày kết thúc (Sửa)')
    split_group(seq, log, 'Datepicker Ngày bắt đầu/kết thúc (Sửa, vẫn giữ min/max + no-overlap-sibling)',
                'Datepicker Ngày bắt đầu học kỳ (Sửa)', 1, 'Datepicker Ngày kết thúc học kỳ (Sửa)')
    wrap_block_cases(seq, log, 'XÓA NĂM HỌC', 'Chức năng', 'Chức năng Xóa')
    wrap_block_cases(seq, log, 'XÓA HỌC KỲ', 'Chức năng', 'Chức năng Xóa')
    wrap_block_cases(seq, log, 'NHẬP EXCEL NĂM HỌC', 'Chức năng', 'Chức năng Nhập Excel')
    wrap_block_cases(seq, log, 'NHẬP EXCEL HỌC KỲ', 'Chức năng', 'Chức năng Nhập Excel')
    move_enter(seq, log, {'THÊM MỚI NĂM HỌC': 'Chức năng Thêm mới',
                          'CHỈNH SỬA NĂM HỌC': 'Chức năng Cập nhật',
                          'XÓA NĂM HỌC': 'Chức năng Xóa',
                          'THÊM HỌC KỲ': 'Chức năng Thêm học kỳ',
                          'CHỈNH SỬA HỌC KỲ': 'Chức năng Cập nhật',
                          'XÓA HỌC KỲ': 'Chức năng Xóa'})
    add_group_after(seq, log, 'DANH SÁCH NĂM HỌC', 'Danh sách thẻ Năm học', 'Icon thao tác trên thẻ')
    for cn, after in (('THÊM MỚI NĂM HỌC', 'Datepicker Ngày kết thúc'),
                      ('CHỈNH SỬA NĂM HỌC', 'Datepicker Ngày kết thúc (Sửa)'),
                      ('THÊM HỌC KỲ', 'Datepicker Ngày kết thúc (min/max = khoảng ngày năm học cha)'),
                      ('CHỈNH SỬA HỌC KỲ', 'Datepicker Ngày kết thúc học kỳ (Sửa)')):
        add_group_after(seq, log, cn, after, 'Button Huỷ')
        add_group_after(seq, log, cn, 'Button Huỷ', 'Button Lưu')
    add_group_after(seq, log, 'XÓA NĂM HỌC', 'Hộp xác nhận Xóa năm học', 'Button Huỷ')
    add_group_after(seq, log, 'XÓA NĂM HỌC', 'Button Huỷ', 'Button Xóa')
    add_group_after(seq, log, 'XÓA HỌC KỲ', 'Hộp xác nhận Xóa học kỳ', 'Button Huỷ')
    add_group_after(seq, log, 'XÓA HỌC KỲ', 'Button Huỷ', 'Button Xóa')


BUILD = {'LoaiThietBi': build_LoaiThietBi, 'NamHocHocKy': build_NamHocHocKy,
         'NangLucCotLoi': build_NangLucCotLoi, 'XuatXu': build_XuatXu}


def run(name, apply=False):
    path = os.path.join(DIR, 'Testcase-Role-Admin-%s.xlsx' % name)
    tc = tcfix.load(path)
    seq = parse(tc)
    before_rows = {n.row for n in seq if n.row is not None}
    before_case_rows = {n.row for n in seq if n.kind == 'case'}
    before_cases = len(before_case_rows)
    log = []
    BUILD[name](seq, log)

    after_rows = {n.row for n in seq if n.row is not None}
    lost_cases = before_case_rows - after_rows
    assert not lost_cases, 'MẤT CASE: %s' % sorted(lost_cases)[:10]
    lost_hdr = before_rows - after_rows
    if lost_hdr:                       # chỉ được phép mất dòng TIÊU ĐỀ (nhóm bị dồn/gộp)
        log.append('  bỏ %d dòng tiêu đề rỗng sau khi dồn nhóm: %s'
                   % (len(lost_hdr), sorted(lost_hdr)))

    print('##', name, ' (%d case, %d dòng)' % (before_cases, len(before_rows)))
    for l in log:
        print(l)
    print('   → sau khi dựng: %d dòng (%d thêm mới)'
          % (len(seq), sum(1 for n in seq if n.row is None)))
    if not apply:
        return

    # đổi tên tiêu đề ngay trên dòng gốc rồi dựng lại theo thứ tự mới
    for n in seq:
        if n.row is not None and n.kind != 'case' and n.text != (tc.c(n.row, 'B') or ''):
            tc.rename(n.row, n.text)
    fix_d(tc, log)
    p = tcfix.Plan(tc)
    for n in seq:
        if n.row is not None:
            p.keep(n.row)
        else:
            {'sub': p.add_sub, 'sub2': p.add_sub2, 'grp': p.add_grp, 'cn': p.add_cn}[n.kind](n.text)
    tc.rebuild(p).save(quiet=True, sync=False)
    n_fix = fix_r_column(path, 'BP-AD-%s' % name)
    print('   ĐÃ GHI · cột R vá lại %d dòng case' % n_fix)


if __name__ == '__main__':
    ap = '--apply' in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    for nm in (only or list(BUILD)):
        run(nm, apply=ap)
        print()
    print('===', 'ĐÃ GHI' if ap else 'dry-run, chưa ghi (thêm --apply)', '===')

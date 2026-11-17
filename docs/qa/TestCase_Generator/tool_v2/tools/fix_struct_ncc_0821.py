# -*- coding: utf-8 -*-
"""Vá CẤU TRÚC + TÊN NHÓM cho bộ test case NCC (đợt 2026-08-21) — bước sau
`restructure_ncc_0821.py`, chạy TRƯỚC `patch_quota.py`.

Việc làm (không xoá case nào):
  1. CN thiếu khối `Chức năng`: nhóm thao tác đang nằm nhờ trong `Validate` → chuyển ra
     khối `Chức năng` (CTGD/CHỈNH SỬA, DoanhThu/BIỂU ĐỒ).
  2. CN thiếu khối `Validate`: thêm khối + nhóm control THẬT trên màn (đối chiếu bản probe
     2026-08-21: nút Publish/Unpublish, nút Tải xuống).
  3. Nhóm ĐẶT TÊN SAI loại control (§0.8e — tên quyết định định mức):
     `Nút chuyển Lưới / Danh sách` là nút chọn segmented chứ không phải danh sách 8 case…
  4. Nhóm GỘP 2 control (luật 2) → tách đôi.

    python3 fix_struct_ncc_0821.py            # dry-run
    python3 fix_struct_ncc_0821.py --apply
"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles
from restructure_khaibao_0817 import (Node, parse, idx_of, cn_span, block_span, group_span,
                                      norm, rename_group, split_group, merge_group)

DIR = roles.ROLES['NCC']['dir']


def move_groups_to_block(seq, log, cn_name, groups, block='Chức năng', before='An toàn thông tin'):
    """Chuyển nhóm khỏi khối hiện tại sang khối `block` của cùng CN (tạo khối nếu chưa có)."""
    i = idx_of(seq, lambda n: n.kind == 'cn' and norm(cn_name) in norm(n.head()))
    if i < 0:
        log.append('  ⚠ KHÔNG THẤY CN "%s"' % cn_name[:40])
        return
    chunks = []
    for g in groups:
        a, b = cn_span(seq, i)
        gi, gj = group_span(seq, a, b, g)
        if gi < 0:
            log.append('  ⚠ KHÔNG THẤY nhóm "%s"' % g[:40])
            continue
        part = seq[gi:gj]
        part[0] = Node('sub', part[0].text, part[0].row)      # sub2 → sub khi lên khối mới
        chunks += part
        del seq[gi:gj]
    if not chunks:
        return
    a, b = cn_span(seq, i)
    bi, bj = block_span(seq, a, b, block)
    if bi < 0:                                    # chưa có khối → chèn ngay trước khối `before`
        ai, _ = block_span(seq, a, b, before)
        at = ai if ai >= 0 else b
        seq[at:at] = [Node('grp', block)]
        bj = at + 1
    seq[bj:bj] = chunks
    log.append('  %s: %d nhóm → khối "%s"' % (cn_name[:32], len(groups), block))


def fix_validate_place(seq, log, cn_name, groups):
    """`Validate các trường thông tin` là `sub` NẰM TRONG khối `Giao diện` (ngay sau
    `Giao diện chung`), nhóm control là `sub2` — đặt sai cấp thì audit không nhận."""
    i = idx_of(seq, lambda n: n.kind == 'cn' and norm(cn_name) in norm(n.head()))
    if i < 0:
        log.append('  ⚠ KHÔNG THẤY CN "%s"' % cn_name[:40])
        return
    a, b = cn_span(seq, i)
    # gỡ khối Validate đặt sai cấp (nếu đợt trước đã thêm nhầm thành grp)
    j = idx_of(seq, lambda n: n.kind == 'grp' and 'validate' in norm(n.head()), a)
    if 0 <= j < b:
        k = j + 1
        while k < b and seq[k].kind in ('sub', 'sub2') and not any(
                x.kind == 'case' for x in seq[j + 1:k + 1]):
            k += 1
        del seq[j:k]
        log.append('  %s: gỡ khối Validate đặt sai cấp (%d dòng)' % (cn_name[:32], k - j))
    a, b = cn_span(seq, i)
    gi, gj = group_span(seq, a, b, 'Giao diện chung')
    at = gj if gi >= 0 else block_span(seq, a, b, 'Giao diện')[1]
    seq[at:at] = [Node('sub', 'Validate các trường thông tin')] + [Node('sub2', g) for g in groups]
    log.append('  %s: thêm nhóm Validate "%s"' % (cn_name[:32], '", "'.join(groups)))


def add_block_groups(seq, log, cn_name, block, groups, before='An toàn thông tin'):
    """Thêm khối (nếu thiếu) + các nhóm control RỖNG — patch_quota bơm case ngay sau."""
    i = idx_of(seq, lambda n: n.kind == 'cn' and norm(cn_name) in norm(n.head()))
    if i < 0:
        log.append('  ⚠ KHÔNG THẤY CN "%s"' % cn_name[:40])
        return
    a, b = cn_span(seq, i)
    bi, bj = block_span(seq, a, b, block)
    if bi < 0:
        ai, _ = block_span(seq, a, b, before)
        at = ai if ai >= 0 else b
        seq[at:at] = [Node('grp', block)] + [Node('sub2', g) for g in groups]
        log.append('  %s: thêm khối "%s" + %d nhóm %s' % (cn_name[:32], block, len(groups), groups))
    else:
        seq[bj:bj] = [Node('sub2', g) for g in groups]
        log.append('  %s: thêm %d nhóm vào khối "%s"' % (cn_name[:32], len(groups), block))


# ───────────────────────────────────────────────── kịch bản theo file (sheet BP)

def build_ChuongTrinhGiangDay(seq, log):
    move_groups_to_block(seq, log, 'CHỈNH SỬA CHƯƠNG TRÌNH',
                         ['Chức năng Cập nhật & Publish', 'Chức năng Thoát/Hủy', 'Chức năng Cập nhật'])
    fix_validate_place(seq, log, 'PUBLISH / UNPUBLISH CHƯƠNG TRÌNH',
                       ['Button Publish', 'Button Unpublish'])


def build_DoanhThu(seq, log):
    move_groups_to_block(seq, log, 'BIỂU ĐỒ & CÁC KHỐI SỐ LIỆU',
                         ['Khối "Top đại lý" & bảng đối soát hoa hồng'])
    rename_group(seq, log, 'Khối "Top đại lý" & bảng đối soát hoa hồng',
                 'Chức năng Bảng đối soát hoa hồng đại lý')


def build_Media(seq, log):
    fix_validate_place(seq, log, 'TẢI XUỐNG ASSET', ['Button Tải xuống'])
    rename_group(seq, log, 'Nút chuyển Lưới / Danh sách', 'Nút chọn Chế độ hiển thị')
    rename_group(seq, log, 'Nút chọn Loại (đã khoá)', 'Nút chọn Loại (chỉ đọc khi sửa)')
    merge_group(seq, log, 'DANH SÁCH THƯ VIỆN MEDIA', 'Trạng thái danh sách',
                'Danh sách — chế độ Lưới (grid)')


def build_TaiKhoan(seq, log):
    split_group(seq, log, 'Chọn số dòng mỗi trang + Phân trang',
                'Selectbox Số dòng mỗi trang', 3, 'Phân trang')
    # nhóm gộp 3 control (luật 2) → 3 nhóm, mỗi nhóm 1 case gốc, patch_quota bơm cho đủ 6
    split_group(seq, log, 'Giới tính · Tỉnh/TP · Vai trò',
                'Selectbox Giới tính', 1, 'Selectbox Tỉnh/Thành phố')
    split_group(seq, log, 'Selectbox Tỉnh/Thành phố',
                'Selectbox Tỉnh/Thành phố', 1, 'Selectbox Vai trò')


def build_LichTapHuan(seq, log):
    split_group(seq, log, 'Chế độ xem & nhãn số lượng',
                'Nút chọn Chế độ xem', 1, 'Nhãn tổng số buổi tập huấn')


BUILD = {
    'ChuongTrinhGiangDay-mau': ('BP05-ChuongTrinh', build_ChuongTrinhGiangDay),
    'DoanhThu':                ('BP-RV-DoanhThu',   build_DoanhThu),
    'Media-mau':               ('BP04-Media',       build_Media),
    'TaiKhoan':                ('BP-AC-TaiKhoan',   build_TaiKhoan),
    'LichTapHuan':             ('BP-LTH-Lich',      build_LichTapHuan),
}


def run(name, apply=False):
    bp, build = BUILD[name]
    path = os.path.join(DIR, 'Testcase-Role-NCC-%s.xlsx' % name)
    tc = tcfix.load(path, bp)
    seq = parse(tc)
    before_case_rows = {n.row for n in seq if n.kind == 'case'}
    before_rows = {n.row for n in seq if n.row is not None}
    log = []
    build(seq, log)
    after_rows = {n.row for n in seq if n.row is not None}
    assert not (before_case_rows - after_rows), 'MẤT CASE: %s' % sorted(before_case_rows - after_rows)[:10]
    lost = before_rows - after_rows
    if lost:
        log.append('  bỏ %d dòng tiêu đề rỗng: %s' % (len(lost), sorted(lost)))

    print('##', name, '/', bp, '(%d case)' % len(before_case_rows))
    for l in log:
        print(l)
    if not apply:
        return
    for n in seq:
        if n.row is not None and n.kind != 'case' and n.text != (tc.c(n.row, 'B') or ''):
            tc.rename(n.row, n.text)
    p = tcfix.Plan(tc)
    for n in seq:
        if n.row is not None:
            p.keep(n.row)
        else:
            {'sub': p.add_sub, 'sub2': p.add_sub2, 'grp': p.add_grp, 'cn': p.add_cn}[n.kind](n.text)
    tc.rebuild(p).save(quiet=True, sync=False)
    print('   ĐÃ GHI')


if __name__ == '__main__':
    ap = '--apply' in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    for nm in (only or list(BUILD)):
        run(nm, apply=ap)
    print('\n=== %s ===' % ('ĐÃ GHI' if ap else 'DRY-RUN'))

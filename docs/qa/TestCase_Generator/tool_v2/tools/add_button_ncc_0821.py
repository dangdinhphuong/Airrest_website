# -*- coding: utf-8 -*-
"""Bổ sung nhóm `Button Hủy` / `Button <hành động>` cho CN Thêm/Sửa/Xoá của bộ NCC
(audit_extra: "Nút bắt buộc thiếu"). Nhãn nút lấy từ HỆ THỐNG THẬT — probe 2026-08-21
(`Hủy` · `Lưu thay đổi` · `Tạo tài khoản` · `Tải lên` …) và từ mã nguồn FE khi màn dạng thẻ
không mở được biểu mẫu bằng script.

KHÔNG thêm cho 6 CN dạng `TAB "…" (TẠO MỚI)` của Biên soạn chủ đề: nút Hủy/Lưu là của
TRANG soạn, đã tính ở CN `GIAO DIỆN TRANG BIÊN SOẠN CHỦ ĐỀ` — thêm nữa là case trùng.

Nhóm thêm vào để RỖNG, `patch_quota.py` bơm 1 case/nhóm (định mức Button = 1).

    python3 add_button_ncc_0821.py            # dry-run
    python3 add_button_ncc_0821.py --apply
"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles
from restructure_khaibao_0817 import Node, parse, idx_of, cn_span, group_span, block_span, norm

DIR = roles.ROLES['NCC']['dir']

JOBS = [
    ('BaiGiang', 'BP-BG-BaiGiang', [
        ('CHỈNH SỬA BÀI GIẢNG', ['Button Hủy', 'Button Lưu thay đổi']),
        ('XÓA BÀI GIẢNG',       ['Button Xóa']),
    ]),
    ('BienSoanChuDe', 'BP-CD-BienSoanChuDe', [
        ('GIAO DIỆN TRANG BIÊN SOẠN CHỦ ĐỀ', ['Button Hủy']),
        ('LƯU NHÁP CHỦ ĐỀ',                  ['Button Hủy']),
        ('CHỈNH SỬA CHỦ ĐỀ',                 ['Button Hủy', 'Button Lưu thay đổi']),
    ]),
    ('BoCaiPhanMem', 'BP-SW-BoCai', [
        ('VÒNG ĐỜI CAMPAIGN', ['Button Hủy', 'Button Xác nhận']),
    ]),
    ('ChuongTrinhGiangDay-mau', 'BP05-ChuongTrinh', [
        ('TẠO MỚI CHƯƠNG TRÌNH',   ['Button Hủy']),
        ('CHỈNH SỬA CHƯƠNG TRÌNH', ['Button Hủy', 'Button Lưu nháp']),
    ]),
    ('TaiKhoan', 'BP-AC-TaiKhoan', [
        ('SỬA TÀI KHOẢN',        ['Button Hủy', 'Button Lưu thay đổi']),
        ('THAO TÁC TÀI KHOẢN',   ['Button Hủy', 'Button Xác nhận']),
    ]),
    ('ThongBao', 'BP-NT-ThongBao', [
        ('ĐÁNH DẤU ĐÃ ĐỌC & XÓA THÔNG BÁO', ['Button Hủy', 'Button Xóa']),
    ]),
    ('VaiTro', 'BP-RO-VaiTro', [
        ('SỬA / CẤU HÌNH QUYỀN VAI TRÒ', ['Button Hủy', 'Button Lưu thay đổi']),
        ('XÓA VAI TRÒ',                  ['Button Xóa']),
    ]),
]


def add_buttons(seq, log, cn_name, groups):
    i = idx_of(seq, lambda n: n.kind == 'cn' and norm(cn_name) in norm(n.head()))
    if i < 0:
        log.append('  ⚠ KHÔNG THẤY CN "%s"' % cn_name[:40]); return
    a, b = cn_span(seq, i)
    add = [g for g in groups if group_span(seq, a, b, g)[0] < 0]
    if not add:
        return
    vi, vj = group_span(seq, a, b, 'Validate các trường thông tin')
    if vi < 0:
        log.append('  ⚠ CN "%s" không có khối Validate' % cn_name[:40]); return
    at = vj                                    # cuối khối Validate = trước khối grp kế tiếp
    while at < b and seq[at].kind == 'sub2':   # nhảy qua các nhóm sub2 đã có
        at += 1
        while at < b and seq[at].kind == 'case':
            at += 1
    seq[at:at] = [Node('sub2', g) for g in add]
    log.append('  %-40s + %s' % (cn_name[:40], ', '.join(add)))


def run(name, bp, jobs, apply=False):
    path = os.path.join(DIR, 'Testcase-Role-NCC-%s.xlsx' % name)
    tc = tcfix.load(path, bp)
    seq = parse(tc)
    before = {n.row for n in seq if n.row is not None}
    log = []
    for cn, groups in jobs:
        add_buttons(seq, log, cn, groups)
    if not log:
        return
    assert not (before - {n.row for n in seq if n.row is not None}), 'MẤT DÒNG'
    print('##', name, '/', bp)
    for l in log:
        print(l)
    if not apply:
        return
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
    for name, bp, jobs in JOBS:
        run(name, bp, jobs, apply=ap)
    print('\n=== %s ===' % ('ĐÃ GHI' if ap else 'DRY-RUN'))

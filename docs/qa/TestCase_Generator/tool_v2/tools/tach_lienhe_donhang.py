# -*- coding: utf-8 -*-
"""Tách nhóm gộp `Thông tin liên hệ (Đầu mối / SĐT / Email)` ở CN TẠO ĐƠN HÀNG (Admin-DonHang).

Luật §0.4 #2 (KY-NANG-CHUAN-HOA-TESTCASE.md): mỗi control = 1 nhóm `sub2` RIÊNG.
Hiện trạng: 11 case gộp, trong đó 8 case thực chất chỉ kiểm Email, SĐT và Đầu mối không có
case riêng nào.

Sau khi tách:
  Textbox Đầu mối liên hệ   giữ 3 case chung + 8 mục Textbox chữ  (bỏ mục "bắt buộc" vì
                            case "các trường liên hệ không bắt buộc" đã phủ)
  Số điện thoại đầu mối     8 mục định mức Số điện thoại
  Textbox Email đầu mối     8 case cũ (đổi tiêu đề) + 3 mục còn thiếu

Ba ô liên hệ đều KHÔNG bắt buộc (case r241 hiện có) -> mục "bắt buộc" viết theo hướng
"không bắt buộc", không bê nguyên wording bắt buộc của từ điển.

Dùng:  python3 tach_lienhe_donhang.py [--apply]
"""
import os, sys, tcfix, quota_cases as q

# Đường dẫn dữ liệu lấy từ hồ sơ dự án (vá 2026-09-08). Bản cũ ghép cứng
# `../../testCase/Admin/testcase/` — chỉ đúng khi `tool_v2` nằm TRONG `qa-doc`; dời repo ra
# chỗ khác là script chết ngay lúc import (FileNotFoundError), không chạy nổi một dòng.
import roles
PATH = roles.get('Admin')['dir'] + 'Testcase-Role-Admin-DonHang.xlsx'
APPLY = '--apply' in sys.argv
OLD = 'Thông tin liên hệ (Đầu mối / SĐT / Email)'


def build(kind, f, skip=()):
    """Case chuẩn theo loại control, thay {f}, bỏ các mục trong skip."""
    return [(b.format(f=f), c.format(f=f), d.format(f=f))
            for k, b, c, d in q.BY_KIND[kind] if k not in skip]


# mục "bắt buộc" viết lại theo đúng thực tế: ô không bắt buộc
def optional(f):
    return (f'Kiểm tra {f} có bắt buộc hay không',
            f'1. Để trống ô "{f}".\n2. Nhập đủ các thông tin bắt buộc khác.\n3. Bấm nút lưu.',
            f'Lưu đơn thành công, không báo lỗi thiếu {f}.')


GROUPS = [
    ('Textbox Đầu mối liên hệ',
     build('Textbox chữ', 'Đầu mối liên hệ', skip=('bat buoc',))),
    ('Số điện thoại đầu mối',
     [optional('Số điện thoại đầu mối')] +
     build('Số điện thoại', 'Số điện thoại đầu mối', skip=('bat buoc',))),
    ('Textbox Email đầu mối',
     [optional('Email đầu mối')] +
     build('Email', 'Email đầu mối', skip=('bat buoc', 'gia tri mac dinh', 'hop le',
                                           'da ton tai', 'qua 64', 'rong truoc @',
                                           'trong 64', 'sai dinh dang', 'nhap space'))),
]

tc = tcfix.load(PATH)
hdr = None
for rn in tc.order:
    if rn >= 12 and tc.lvl(rn) == 'sub2' and (tc.c(rn, 'B') or '').strip() == OLD:
        hdr = rn; break
assert hdr, 'không thấy nhóm gộp'

cases = []
for rn in tc.order:
    if rn <= hdr: continue
    if tc.lvl(rn) != 'case': break
    cases.append(rn)

# 3 case đầu viết chung cho cả khối -> ở lại nhóm Đầu mối; phần còn lại là case Email
chung = cases[:3]
email = [r for r in cases[3:]]

print(f'nhóm gộp r{hdr} · {len(cases)} case  ->  '
      f'Đầu mối giữ {len(chung)} + bơm {len(GROUPS[0][1])} · '
      f'SĐT bơm {len(GROUPS[1][1])} · Email chuyển {len(email)} + bơm {len(GROUPS[2][1])}')
for rn in email:
    old = (tc.c(rn, 'B') or '').strip()
    print(f'    r{rn}: {old[:52]} -> {old.replace(OLD, "Email đầu mối")[:52]}')
if not APPLY:
    print('=== DRY-RUN ===')
    sys.exit()

tc.rename(hdr, GROUPS[0][0])
for rn in email:                                     # bỏ tên nhóm gộp khỏi tiêu đề case
    tc.rename(rn, (tc.c(rn, 'B') or '').replace(OLD, 'Email đầu mối'))

plan = tcfix.Plan(tc)
for rn in tc.order:
    if rn < 12 or rn in email: continue
    plan.keep(rn)
    if rn == chung[-1]:                              # hết 3 case chung -> bơm nốt nhóm Đầu mối
        for b, c, d in GROUPS[0][1]: plan.case(b, c, d)
        for name, cs in GROUPS[1:]:
            plan.add_sub2(name)
            if name.startswith('Textbox Email'):
                plan.keep(*email)
            for b, c, d in cs: plan.case(b, c, d)
tc.rebuild(plan).save()

# -*- coding: utf-8 -*-
"""Rà ĐỊNH MỨC case Validate theo LOẠI CONTROL + cấu trúc bắt buộc của mỗi CN.

Khác `audit_content.py`: bộ đó rà theo TỪ KHOÁ từng mục (dễ nhiễu khi đổi cách diễn đạt),
bộ này rà theo SỐ LƯỢNG tối thiểu và theo CẤU TRÚC — bắt được thứ từ khoá không bắt được:
CN không có nhóm Validate, control bị viết quá mỏng, nhóm gộp nhiều control.

Chỉ ĐỌC, không ghi file. Dùng:
    python3 audit_validate_quota.py Admin
    python3 audit_validate_quota.py Admin GoiSTEM        # lọc theo tên file
    python3 audit_validate_quota.py Admin --legacy       # định mức CŨ trước 2026-09-03

Định mức chuẩn (mặc định, từ 2026-09-03): luat/DINH-MUC-VALIDATE-testcase.md §3
    — đã nâng theo templateTestcase/DanhMucTuDienDungChung.xlsx (mẫu = bậc 2 trong thang nguồn).
Phép đo tác động của lần nâng này: huong-dan/DOI-CHIEU-MAU-vs-LUAT.md

Bảng định mức + luật phân loại nhóm nay nằm ở `qalib.py` (dùng chung với các script khác);
sửa định mức thì sửa `qalib.QUOTA`, đừng chép lại bảng vào script mới.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib


def main(argv):
    legacy = '--legacy' in argv
    argv = [a for a in argv if a not in ('--legacy', '--mau')]   # --mau nay = mặc định
    role = argv[1] if len(argv) > 1 else 'Admin'
    only = argv[2] if len(argv) > 2 else None

    tot, broken = qalib.scan_quota(role, only=only, legacy=legacy)

    print('=== Dưới định mức: %d · CN thiếu khối chuẩn: %d · Giao diện chung sai: %d · '
          'Phân trang sai khối: %d · Nhóm lạ: %d · CN đặt tên sai: %d · '
          'Nhóm không rõ loại: %d ==='
          % (tot['thin'], tot['nostruct'], tot['gdc'],
             tot['paging'], tot['banned'], tot['cn_name'], tot['unknown']))
    if tot['unknown']:
        print('   ⇒ Ô THỨ 7 (thêm 2026-09-10) là điểm mù cũ của chính bộ rà này: nhóm KHÔNG tra')
        print('     được loại thì định mức = 0, nên `patch_quota` không bơm và 6 ô đầu vẫn ra 0.')
        print('     Nhóm đó nằm rỗng vĩnh viễn — phải khai `loai_control` ở hồ sơ màn, hoặc')
        print('     thêm dòng vào `qalib.QUOTA` + `KINDSRC` + bank + `quota_cases.BY_KIND`.')
    if broken:
        print('!!! %d file KHÔNG rà được (kết quả trên CHƯA phủ hết role):' % len(broken))
        for base, why in broken:
            print('    - %-52s %s' % (base[:52], why))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))

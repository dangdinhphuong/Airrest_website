# -*- coding: utf-8 -*-
"""Dịch cụm tiếng Anh / đường dẫn mã trong **vế cột C/D của luật A6** sang tiếng Việt.

Chỉ thị người đặt việc 2026-09-14: *"không được lẫn tiếng Anh hoặc mã gì đó, ghi bằng tiếng
Việt dễ hiểu"*. `fix_chi_thi_0914.py` dọn bộ case ĐÃ SINH; script này dọn **nguồn** — không vá
gốc thì chạy lại bước A6 là chữ tiếng Anh quay về nguyên vẹn (đúng lớp lỗi *"sửa bank không lan
tới bộ đã sinh"*, chỉ ngược chiều).

⚠️ CHỈ đụng vế **C** và **D** của `r()` / `ro()`. Vế **T** là cột ghi chú, mà §8.3 cho phép cột T
   mang chi tiết kỹ thuật (`bundle FE khai permission rỗng` · `BA BR-BCD-16-2: chỉ Bước 3 có API
   lưu`) — dịch cả cột T là làm hỏng chính chỗ dùng để dẫn chứng cho dev/BA. Vì vậy script đi
   theo CÂY CÚ PHÁP chứ không thay chuỗi mù trên cả tệp: thay mù thì không cách nào phân biệt
   chữ nào rơi vào cột nào.
⚠️ Chuỗi trong ngoặc kép (bản chữ verbatim của màn, §7.3) và payload ATTT (§7.2) được che —
   luật che nằm trong `qalib.dich_tieng_anh`, không chép lại ở đây.

    python3 fix_a6_tieng_anh.py <đường/dẫn/a6-Màn.py> [...]            # XEM TRƯỚC
    python3 fix_a6_tieng_anh.py <đường/dẫn/a6-Màn.py> [...] --apply    # ghi
"""
import ast
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import a6_src
import qalib
from a6_src import thay          # phép sửa mã nguồn dùng chung — xem bẫy byte-offset ở đó


def quet(path):
    """-> [(dòng, vế, chuỗi cũ, chuỗi mới, [cụm đã dịch], span)] sắp xếp từ CUỐI tệp lên."""
    src = open(path, encoding='utf-8').read()
    cay = ast.parse(src, path)
    ra = []
    ve = a6_src.ve_cd(cay)
    for ten, nd in ve:
        if not (isinstance(nd, ast.Constant) and isinstance(nd.value, str)):
            continue
        moi_, da = qalib.dich_tieng_anh(nd.value)
        if not da:
            continue
        ra.append((nd.lineno, ten, nd.value, moi_, da,
                   (nd.lineno, nd.col_offset, nd.end_lineno, nd.end_col_offset)))
    ra.sort(key=lambda x: (x[5][0], x[5][1]), reverse=True)
    return src, ra


def main():
    paths = [a for a in sys.argv[1:] if not a.startswith('--')]
    apply_ = '--apply' in sys.argv
    if not paths:
        raise SystemExit(__doc__)
    tong = 0
    for p in paths:
        src, viec = quet(p)
        if not viec:
            continue
        print('#### %s  (%d vế)' % (os.path.basename(p), len(viec)))
        for ln, ten, cu, moi, da, span in sorted(viec, key=lambda x: x[0]):
            print('   dòng %-5d vế %s  <- %s' % (ln, ten, ', '.join(da)[:60]))
            print('        %s' % moi.replace('\n', ' ⏎ ')[:104])
        tong += len(viec)
        if not apply_:
            continue
        for ln, ten, cu, moi, da, span in viec:       # đã sắp từ CUỐI lên -> span không trôi
            src = thay(src, span, moi)
        # ⚠️ LƯỚI CHẮN TRƯỚC KHI GHI. Bản đầu kiểm sau khi `write()` — tức là đã ghi đè tệp
        #    nguồn rồi mới phát hiện hỏng cú pháp, phải đi lùi tay từ `bak/`. Kiểm trước thì
        #    tệp thật không bao giờ ở trạng thái hỏng.
        try:
            ast.parse(src, p)
        except SyntaxError as e:
            raise SystemExit('DỪNG — bản dịch làm %s hỏng cú pháp (dòng %s): %s  [KHÔNG ghi gì]'
                             % (os.path.basename(p), e.lineno, e.msg))
        qalib.backup(p)
        open(p, 'w', encoding='utf-8').write(src)
        _s2, con = quet(p)
        if con:
            raise SystemExit('DỪNG — %s còn %d vế lẫn tiếng Anh sau khi ghi' % (p, len(con)))
        print('   ĐÃ GHI -> %s' % p)
    print('\n=== %d vế C/D được dịch%s ===' % (tong, '' if apply_ else '   (XEM TRƯỚC, chưa ghi)'))


if __name__ == '__main__':
    main()

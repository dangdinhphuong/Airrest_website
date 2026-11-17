#!/usr/bin/env python3
"""Đưa CN danh sách (+ thẻ KPI) về đúng mẫu — Admin/TaiKhoan.

Lệch so với mẫu `Testcase-Role-NCC-mau.xlsx` / `Admin-NCC` (đã chuẩn 10/08):

  1. nhóm `Icon thao tác trên dòng` nằm ở khối **Chức năng** → phải là `sub2` trong **Validate**
     (luật 13, DINH-MUC-VALIDATE-testcase.md:52); định mức 5 case, hiện 4.
  2. khối **Chức năng** của CN danh sách không có nhóm `Chức năng Danh sách`.
  3. case đối soát KPI ↔ DB nằm trong `Validate` → mẫu đặt ở `Chức năng Danh sách`
     ("Kiểm tra số liệu thống kê khớp DB").
  4. `Selectbox Số dòng mỗi trang` 7 case — định mức đúng 4, cấm mục sắp xếp / quá dài / căn lề.
  5. tên nhóm `4 thẻ KPI` → quy ước `4 thẻ thống kê (KPI)`.

Áp CÙNG một kịch bản theo số dòng lên cả cặp (testcase / *_ket_qua) nên cột F·R·T của case cũ
tự đi theo dòng; case mới để trống chờ chạy live. Chạy không tham số = dry-run, `--apply` mới ghi.
"""
import os
import re
import sys

import tcfix

SRC = '../../testCase/Admin/testcase/Testcase-Role-Admin-%s.xlsx'
RES = '../../testCase/Admin/ket-qua-test/Testcase-Role-Admin-%s_ket_qua.xlsx'


def build_TaiKhoan(tc, p):
    # ---- Giao diện chung + header Validate (r12..r21) giữ nguyên
    p.keep_range(12, 21)

    # ---- Validate > 4 thẻ thống kê (KPI)
    tc.rename(22, '4 thẻ thống kê (KPI)')
    p.keep(22).keep(23).keep(25).keep(26)          # bỏ r24 ra khỏi đây (chuyển xuống Chức năng)
    p.case('Kiểm tra nguồn số liệu 4 thẻ thống kê khi lọc / tìm kiếm',
           '1. Ghi lại con số trên 4 thẻ.\n'
           '2. Gõ một từ khoá vào ô tìm kiếm hoặc chọn một bộ lọc bất kỳ.\n'
           '3. Quan sát lại 4 thẻ.',
           'Số trên 4 thẻ là số của toàn bộ tài khoản đã tải, ổn định — không đổi theo '
           'từ khoá tìm kiếm, bộ lọc hay khi chuyển trang.')
    p.case('Kiểm tra hiển thị số 0 khi không có tài khoản ở trạng thái đó',
           '1. Lọc/chuẩn bị dữ liệu sao cho không có tài khoản nào ở một trạng thái '
           '(vd: không còn tài khoản "Đã khoá").\n'
           '2. Quan sát thẻ tương ứng.',
           'Thẻ tương ứng hiển thị số 0, không để trống và không hiển thị dấu "-".')

    # ---- Validate > Danh sách (bảng tài khoản)
    p.keep_range(27, 37)

    # ---- Validate > Icon thao tác trên dòng  (chuyển từ khối Chức năng về, đủ 5 mục định mức)
    p.add_sub2('Icon thao tác trên dòng')
    p.keep(61)                                      # icon phù hợp chức năng
    p.case('Kiểm tra màu biểu tượng xoá',
           '1. Quan sát biểu tượng thùng rác ở cột "Thao tác".',
           'Biểu tượng xoá hiển thị màu đỏ để cảnh báo, phân biệt với các biểu tượng còn lại.')
    p.case('Kiểm tra chú thích hiện khi rê chuột và ẩn khi bỏ chuột',
           '1. Rê chuột lên từng biểu tượng thao tác.\n'
           '2. Đưa con trỏ ra khỏi biểu tượng.',
           'Chú thích hiện ngay khi rê chuột và biến mất ngay khi con trỏ rời khỏi biểu tượng.')
    p.keep(62)                                      # đổi màu + con trỏ bàn tay
    p.case('Kiểm tra nội dung và chính tả của chú thích',
           '1. Đọc chú thích của từng biểu tượng: con mắt, bút chì, thùng rác, 3 chấm dọc.',
           'Chú thích đủ nghĩa để hiểu đúng chức năng của biểu tượng, không sai chính tả, '
           'không viết tắt khó hiểu.')

    # ---- Validate > Selectbox Số dòng mỗi trang: về đúng 4 case của định mức
    #      (bỏ r42 sắp xếp · r44 giá trị quá dài · r45 căn lề — §3 cấm áp cho control này)
    p.keep(38).keep(39).keep(40).keep(41).keep(43)

    # ---- Validate > Phân trang
    p.keep_range(46, 58)

    # ---- Chức năng
    p.keep(59)
    p.add_sub('Chức năng Danh sách')
    p.case('Tải danh sách mặc định',
           '1. Mở màn Tài khoản (/admin/accounts), không áp bộ lọc nào.',
           'Tải danh sách tài khoản, hiển thị trang đầu với số dòng mặc định, sắp xếp mặc định '
           'theo Họ và tên A→Z; 4 thẻ thống kê hiển thị đồng thời với bảng.')
    p.case('Kiểm tra dữ liệu danh sách khớp DB',
           '1. Mở màn danh sách (bỏ hết bộ lọc), ghi lại các dòng đang hiển thị.\n'
           '2. Đối chiếu với dữ liệu hệ thống:\n'
           'SELECT id, full_name, email, phone, status, created_at\n'
           'FROM accounts WHERE deleted_at IS NULL\n'
           'ORDER BY full_name;',
           'Số dòng và từng cột hiển thị khớp chính xác với dữ liệu trong hệ thống; '
           'thứ tự sắp xếp giống nhau; không hiển thị bản ghi đã xoá mềm.')
    tc.rename(24, 'Kiểm tra số liệu thống kê (4 thẻ KPI) khớp DB')
    p.keep(24)                                      # giữ nguyên bước SQL + kết quả đã chạy
    p.keep(63).keep(64)                             # mở menu 3 chấm · mở tài khoản từ họ tên
    p.case('Kiểm tra tải lại danh sách sau thao tác',
           '1. Thực hiện một thao tác ghi dữ liệu trên màn: tạo / sửa / khoá / xoá một tài khoản.\n'
           '2. Quan sát bảng và 4 thẻ thống kê.',
           'Danh sách và 4 thẻ thống kê tự tải lại, phản ánh đúng thay đổi vừa thực hiện; '
           'không cần tải lại trang bằng tay.')

    # ---- An toàn thông tin của CN1 + toàn bộ CN còn lại
    p.keep_rest(65)


BUILDERS = {'TaiKhoan': build_TaiKhoan}


def postfix_ketqua(path):
    """Đếm lại cột R rồi ghi đè cache P/F/PE ở sheet BP và sheet "Tổng hợp"."""
    import zipfile
    tc = tcfix.load(path)
    vals = [(tc.c(r, 'R') or '').strip() for r in tc.order if r >= 12 and tc.c(r, 'C')]
    tong = len(vals)
    p, f, pe = (sum(1 for v in vals if v == k) for k in ('P', 'F', 'PE'))
    chua = tong - p - f - pe
    z = zipfile.ZipFile(path)
    rels = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"',
                           z.read('xl/_rels/workbook.xml.rels').decode()))
    sheets = re.findall(r'<sheet name="([^"]+)"[^>]*r:id="([^"]+)"',
                        z.read('xl/workbook.xml').decode())
    repl = {}
    for name, rid in sheets:
        part = 'xl/' + rels[rid]
        s = z.read(part).decode()
        if name.startswith('BP'):
            for ref, val in (('D4', p), ('D5', f), ('D6', pe), ('D7', chua), ('D8', tong)):
                s = re.sub(r'(<c r="%s"[^>]*>(?:<f[^>]*>.*?</f>)?<v>)-?\d+(</v>)' % ref,
                           r'\g<1>%d\g<2>' % val, s, flags=re.S)
        elif name == 'Tổng hợp':
            for row in (5, 6):
                for col, val in (('D', tong), ('E', p), ('F', f), ('G', pe), ('H', tong)):
                    s = re.sub(r'(<c r="%s%d"[^>]*><v>)-?\d+(</v>)' % (col, row),
                               r'\g<1>%d\g<2>' % val, s)
                ty = round(p / tong, 6) if tong else 0
                s = re.sub(r'(<c r="I%d"[^>]*><v>)[\d.]+(</v>)' % row,
                           r'\g<1>%s\g<2>' % ty, s)
        else:
            continue
        repl[part] = s.encode()
    tmp = path + '.tmp'
    zo = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
    for it in z.infolist():
        zo.writestr(it, repl.get(it.filename) or z.read(it.filename))
    zo.close(); z.close(); os.replace(tmp, path)
    print('      thống kê: %d case = %dP · %dF · %dPE · %d chưa chạy' % (tong, p, f, pe, chua))


def run(name, apply):
    if name not in BUILDERS:
        sys.exit('chưa có builder cho %s' % name)
    for path in (SRC % name, RES % name):
        if not os.path.exists(path):
            print('  bỏ qua (không có): %s' % path)
            continue
        lock = os.path.join(os.path.dirname(path), '.~lock.%s#' % os.path.basename(path))
        if os.path.exists(lock):
            sys.exit('DỪNG: file đang mở trong LibreOffice → %s' % lock)
        tc = tcfix.load(path)
        n_old = sum(1 for r in tc.order if r >= 12 and tc.c(r, 'C'))
        pl = tcfix.Plan(tc)
        BUILDERS[name](tc, pl)
        tc.rebuild(pl)
        drop = [(r, (tc.c(r, 'B') or '')[:60]) for r in tc._dropped]
        print('%-52s %d → %d case; bỏ %d dòng' % (os.path.basename(path), n_old, tc._n, len(drop)))
        for r, b in drop:
            print('      bỏ r%-4d %s' % (r, b))
        if apply:
            tc.save(sync=True, quiet=True)
            print('      ĐÃ GHI')
            if path.endswith('_ket_qua.xlsx'):
                postfix_ketqua(path)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    for n in (args or list(BUILDERS)):
        run(n, '--apply' in sys.argv)

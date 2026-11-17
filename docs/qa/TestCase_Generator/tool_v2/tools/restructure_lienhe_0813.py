#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dọn màn "Thông tin liên hệ" (Admin) về đúng 4 CN — chỉ thị người đặt việc 2026-08-13.

Vì sao: bộ case cũ có 6 CN, trong đó 4 CN là CN GIẢ — chúng là *nhóm control*, không phải
thao tác (`VALIDATE TRƯỜNG ĐỊA CHỈ` · `VALIDATE KHỐI HOTLINE` · `VALIDATE KHỐI EMAIL` ·
`VALIDATE TRƯỜNG GIỜ LÀM VIỆC`), vi phạm luật "mỗi CN = 1 thao tác" (§0.4.3
KY-NANG-CHUAN-HOA-TESTCASE.md). Hệ quả: mỗi CN giả tự đẻ ra `Giao diện chung` 6 case,
một nhóm `Chức năng lưu trường X` cho MỘT nút Lưu duy nhất, và bộ ATTT 3 case lặp lại.
CN thứ 6 `CHỨC NĂNG LƯU THAY ĐỔI & HỦY` lại gộp 2 thao tác.

Màn thật (react/.../admin/ContactInfoAdmin.tsx, probe 2026-08-13) chỉ có 3 thao tác:
  · liên kết "Xem trên trang công khai" → mở /contact ở tab mới
  · nút "Lưu thay đổi"      · nút "Hủy"
7 ô nhập còn lại là VALIDATE của thao tác Lưu thay đổi.

Cấu trúc đích — 4 CN:
  1. TỔNG QUAN MÀN & TẢI DỮ LIỆU THÔNG TIN LIÊN HỆ   (giữ nguyên)
  2. CHỨC NĂNG XEM TRÊN TRANG CÔNG KHAI              (mới)
  3. CHỨC NĂNG LƯU THAY ĐỔI                          (hút 7 nhóm control + XSS/SQLi về đây)
  4. CHỨC NĂNG HỦY                                   (tách khỏi CN gộp)

Giống `tach_cn_timkiem.py`, script này CHẠM CẢ FILE KẾT QUẢ TEST: cặp (testcase / *_ket_qua)
khớp 1-1 từng dòng nên áp CÙNG một kịch bản theo số dòng lên cả hai file thì kết quả đã chạy
(cột F · R · T) tự đi theo dòng. Ghi chú của case bị bỏ được dồn sang case tương đương
để không mất bằng chứng đã chạy.

    python3 restructure_lienhe_0813.py            # dry-run: in cấu trúc mới + dòng bị bỏ
    python3 restructure_lienhe_0813.py --apply    # ghi thật
"""
import os
import re
import sys

import tcfix

NAME = 'ThongTinLienHe'
SRC = '../../testCase/Admin/testcase/Testcase-Role-Admin-%s.xlsx' % NAME
RES = '../../testCase/Admin/ket-qua-test/Testcase-Role-Admin-%s_ket_qua.xlsx' % NAME

# ---------------------------------------------------------------- nội dung CN mới

CN_XEM = (
    'CHỨC NĂNG XEM TRÊN TRANG CÔNG KHAI\n'
    'Liên kết "Xem trên trang công khai" nằm ở góc phải khối "THÔNG TIN LIÊN HỆ" — bấm vào '
    'mở trang liên hệ công khai (/contact) ở tab mới, màn quản trị giữ nguyên.'
)

CN_LUU = (
    'CHỨC NĂNG LƯU THAY ĐỔI\n'
    'Nút "Lưu thay đổi" chỉ bật khi có ít nhất 1 trường thay đổi so với dữ liệu vừa tải; '
    'lưu theo cơ chế khóa lạc quan (phiên bản dữ liệu).\n'
    'Biểu mẫu gồm 7 trường: Địa chỉ (*) · Số chính (*) · Ghi chú · Thời gian gọi · '
    'Email liên hệ (*) · Email hỗ trợ · Giờ làm việc (*) — validate của cả 7 trường nằm trong '
    'khối Validate của chức năng này.\n'
    "SQL đối chiếu chung: SELECT address_lines, hotline_primary, hotline_note, hotline_hours, "
    "email_contact, email_support, working_hours_lines, version FROM contact_info "
    "WHERE tenant_id='<tenant hiện tại>';"
)

CN_HUY = (
    'CHỨC NĂNG HỦY\n'
    'Nút "Hủy" bỏ mọi thay đổi chưa lưu, trả cả 7 trường về đúng giá trị đã tải; '
    'nút chỉ bật khi có ít nhất 1 trường thay đổi.'
)

# nhóm sub2 "Liên kết Xem trên trang công khai" — theo mẫu Admin-Dashboard (Liên kết Chi tiết)
LINK_VALIDATE = [
    ('Kiểm tra căn lề, chính tả của liên kết Xem trên trang công khai',
     '1. Mở màn Thông tin liên hệ.\n2. Quan sát liên kết "Xem trên trang công khai".',
     'Liên kết nằm cùng hàng với tiêu đề khối "THÔNG TIN LIÊN HỆ", căn phải, đúng chính tả; '
     'có biểu tượng mở tab mới bên phải phần chữ.'),
    ('Kiểm tra hiệu ứng khi rê chuột lên liên kết Xem trên trang công khai',
     '1. Rê chuột lên liên kết "Xem trên trang công khai".',
     'Phần chữ chuyển sang dạng gạch chân, con trỏ đổi thành hình bàn tay; '
     'bố cục các phần còn lại không đổi.'),
]

LINK_FUNC = [
    ('Kiểm tra bấm liên kết Xem trên trang công khai',
     '1. Bấm liên kết "Xem trên trang công khai".',
     'Mở trang liên hệ công khai ở tab mới; tab màn quản trị vẫn giữ nguyên nội dung đang mở.'),
    ('Kiểm tra dữ liệu trang công khai khớp cấu hình đang lưu',
     '1. Ghi lại giá trị 7 trường đang lưu trên màn quản trị.\n'
     '2. Bấm "Xem trên trang công khai", đối chiếu từng trường trên trang vừa mở.',
     'Địa chỉ, Hotline (số chính · ghi chú · thời gian gọi), Email liên hệ, Email hỗ trợ và '
     'Giờ làm việc trên trang công khai khớp đúng dữ liệu đang lưu.'),
    ('Kiểm tra bấm liên kết khi đang sửa dở chưa lưu',
     '1. Sửa vài trường, chưa bấm "Lưu thay đổi".\n2. Bấm "Xem trên trang công khai".',
     'Trang công khai mở ở tab mới vẫn hiện dữ liệu đã lưu trước đó, không hiện nội dung đang '
     'sửa dở; nội dung đang sửa ở tab quản trị không bị mất.'),
]

HUY_FUNC = [
    ('Kiểm tra nút Hủy khi chưa có thay đổi nào',
     '1. Mở màn, không sửa trường nào.\n2. Quan sát nút "Hủy" và thử bấm.',
     'Nút "Hủy" ở trạng thái vô hiệu, không bấm được; dữ liệu trên màn giữ nguyên.'),
    ('Kiểm tra Hủy khôi phục đủ cả 7 trường',
     '1. Sửa lần lượt cả 7 trường (Địa chỉ, Số chính, Ghi chú, Thời gian gọi, Email liên hệ, '
     'Email hỗ trợ, Giờ làm việc).\n2. Bấm "Hủy".',
     'Cả 7 trường trở lại đúng giá trị đã tải ban đầu, kể cả từng dòng của hai ô nhiều dòng.'),
    ('Kiểm tra Hủy khi đã xóa trắng trường bắt buộc',
     '1. Xóa trắng ô "Địa chỉ" và ô "Liên hệ" (email).\n2. Bấm "Hủy".',
     'Hai ô khôi phục lại giá trị cũ; thông báo lỗi bắt buộc (nếu có) biến mất.'),
    ('Kiểm tra sửa lại sau khi Hủy',
     '1. Sửa một trường rồi bấm "Hủy".\n2. Sửa lại trường đó và bấm "Lưu thay đổi".',
     'Lưu thành công với giá trị mới; tải lại màn thấy đúng giá trị vừa lưu, '
     'không lẫn giá trị đã hủy trước đó.'),
]

# case bị bỏ  ->  case tương đương được giữ (dồn ghi chú cột T sang, không mất bằng chứng)
NOTE_MAP = {
    236: [69, 124, 177, 209],       # lưu thành công … (4 bản theo từng trường)
    243: [70, 125, 178, 210],       # lưu đúng vào database
    239: [71],                      # bấm Lưu liên tục
    248: [181, 213], 249: [182, 214], 250: [183, 215],          # ATTT lặp
    223: [142, 191], 224: [143, 192], 225: [144, 193],          # Giao diện chung lặp
    226: [145, 194], 227: [146, 195], 228: [147, 196],
}


def note_merge(tc, dst, srcs):
    """Dồn ghi chú (cột T) của các dòng sắp bỏ vào dòng được giữ; bỏ qua nội dung trùng."""
    cur = (tc.c(dst, 'T') or '').strip()
    add = [x for x in ((tc.c(s, 'T') or '').strip() for s in srcs) if x and x not in cur]
    if not add:
        return
    txt = (cur + ('\n' if cur else '') + '\n'.join(add)).strip()
    b = tc.rows[dst]['body']
    cm = re.search(r'<c r="T%d"[^>]*?(?:/>|>.*?</c>)' % dst, b, re.S)
    if not cm:
        return
    st = re.search(r's="(\d+)"', cm.group(0))
    tc.rows[dst]['body'] = b.replace(
        cm.group(0), '<c r="T%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
        % (dst, st.group(1) if st else '0', tcfix.esc(txt)))


def cases(pl, items):
    for md, buoc, kq in items:
        pl.case(md, buoc, kq)
    return pl


def build(tc, pl):
    for dst, srcs in NOTE_MAP.items():
        note_merge(tc, dst, srcs)

    # ── CN1 · TỔNG QUAN MÀN & TẢI DỮ LIỆU — giữ nguyên r12..r44
    pl.keep_range(12, 44)

    # ── CN2 · CHỨC NĂNG XEM TRÊN TRANG CÔNG KHAI
    #    dùng lại khối Giao diện / Giao diện chung / Validate / Chức năng / ATTT của CN giả
    #    "VALIDATE TRƯỜNG ĐỊA CHỈ" (nội dung 6 case Giao diện chung giống hệt nhau nên
    #    kết quả đã chạy vẫn đúng, không phải chạy lại)
    pl.add_cn(CN_XEM)
    pl.keep(46, 47)                       # grp Giao diện · sub Giao diện chung
    pl.keep(*range(48, 54))               # 6 case Giao diện chung
    pl.keep(54)                           # sub Validate các trường thông tin
    pl.add_sub2('Liên kết Xem trên trang công khai')
    cases(pl, LINK_VALIDATE)
    pl.keep(67)                           # grp Chức năng
    pl.add_sub('Chức năng Xem trên trang công khai')
    cases(pl, LINK_FUNC)
    pl.keep(211)                          # hiển thị trên trang công khai sau khi lưu
    pl.keep(72, 73, 74, 75)               # grp ATTT + 3 case

    # ── CN3 · CHỨC NĂNG LƯU THAY ĐỔI
    tc.rename(220, CN_LUU)
    pl.keep(220, 221, 222)
    pl.keep(*range(223, 229))             # Giao diện chung
    pl.keep(229)                          # sub Validate
    pl.keep(55);  pl.keep(*range(56, 67))         # Textarea Địa chỉ
    pl.keep(90);  pl.keep(*range(91, 102))        # Textbox Số chính (Hotline)
    pl.keep(102); pl.keep(*range(103, 112))       # Textbox Ghi chú (Hotline)
    pl.keep(112); pl.keep(*range(113, 122))       # Textbox Thời gian gọi (Hotline)
    pl.keep(149); pl.keep(*range(150, 162))       # Textbox Email Liên hệ
    pl.keep(162); pl.keep(*range(163, 175))       # Textbox Email Hỗ trợ
    pl.keep(198); pl.keep(*range(199, 207))       # Textarea Giờ làm việc
    pl.keep(232, 233)                             # Button Lưu thay đổi
    pl.keep(234, 235)                             # grp Chức năng · sub Chức năng Lưu thay đổi
    pl.keep(*range(236, 245))
    pl.keep(126)                          # lưu khi để trống toàn bộ khối hotline
    pl.keep(179)                          # chặn lưu khi email sai định dạng
    pl.keep(247, 248, 249, 250)           # grp ATTT + 3 case chung
    pl.keep(*range(76, 80))               # XSS/SQLi Địa chỉ
    pl.keep(*range(131, 139))             # XSS/SQLi Số chính + Ghi chú
    pl.keep(*range(184, 188))             # XSS/SQLi Email liên hệ
    pl.keep(*range(216, 220))             # XSS/SQLi Giờ làm việc

    # ── CN4 · CHỨC NĂNG HỦY — dùng lại khối của CN giả "VALIDATE KHỐI HOTLINE"
    pl.add_cn(CN_HUY)
    pl.keep(81, 82)
    pl.keep(*range(83, 89))               # 6 case Giao diện chung
    pl.keep(89)                           # sub Validate
    pl.keep(230, 231)                     # Button Hủy
    pl.keep(122)                          # grp Chức năng
    pl.keep(245, 246)                     # sub Chức năng Hủy + case bấm Hủy
    cases(pl, HUY_FUNC)
    pl.keep(127, 128, 129, 130)           # grp ATTT + 3 case


def postfix_ketqua(path):
    """Đếm lại cache P/F/PE ở sheet BP và sheet Tổng hợp (rebuild chỉ biết tổng số case)."""
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


def run(apply=False):
    for path in (SRC, RES):
        if not os.path.exists(path):
            sys.exit('không có file: %s' % path)
        lock = os.path.join(os.path.dirname(path), '.~lock.%s#' % os.path.basename(path))
        if os.path.exists(lock):
            sys.exit('DỪNG: file đang mở trong LibreOffice → %s' % lock)
        tc = tcfix.load(path)
        n_old = sum(1 for r in tc.order if r >= 12 and tc.c(r, 'C'))
        pl = tcfix.Plan(tc)
        build(tc, pl)
        tc.rebuild(pl)
        drop = [(r, (tc.c(r, 'B') or '').split('\n')[0][:62]) for r in tc._dropped]
        n_drop_case = sum(1 for r in tc._dropped if tc.c(r, 'C'))
        print('%-52s %d → %d case; bỏ %d dòng (%d case)'
              % (os.path.basename(path), n_old, tc._n, len(drop), n_drop_case))
        for r, b in drop:
            print('      bỏ r%-4d %s' % (r, b))
        if apply:
            tc.save(sync=True, quiet=True)
            print('      ĐÃ GHI')
            if path.endswith('_ket_qua.xlsx'):
                postfix_ketqua(path)


if __name__ == '__main__':
    run('--apply' in sys.argv)

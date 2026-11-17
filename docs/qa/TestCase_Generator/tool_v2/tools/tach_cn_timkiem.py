#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tách CN "TÌM KIẾM & LỌC …" ra khỏi CN danh sách (chỉ thị người đặt việc 2026-08-08).

Vì sao cần: nhiều file để chung "danh sách" và "tìm kiếm" trong MỘT chức năng — sai
luật "mỗi CN = 1 thao tác" (§0.4.3 KY-NANG-CHUAN-HOA-TESTCASE.md) và lệch hẳn so với
15/29 file Admin vốn đã có CN `TÌM KIẾM & LỌC …` riêng.

Điểm khác các script khác trong thư mục: script này CHẠM CẢ FILE KẾT QUẢ TEST.
Làm được vì mỗi cặp (testcase / *_ket_qua) hiện khớp 1-1 từng dòng — cùng số dòng,
cùng nội dung cột B. Áp CÙNG một kịch bản theo số dòng lên cả hai file thì kết quả
đã chạy (cột F · R · T) tự đi theo dòng, không cần dò khớp nội dung.

    python3 tach_cn_timkiem.py DanhMucFAQ            # dry-run, in cấu trúc sau khi tách
    python3 tach_cn_timkiem.py DanhMucFAQ --apply    # ghi thật
    python3 tach_cn_timkiem.py all --apply
"""
import os
import re
import sys

import tcfix

SRC = '../../testCase/Admin/testcase/Testcase-Role-Admin-%s.xlsx'
RES = '../../testCase/Admin/ket-qua-test/Testcase-Role-Admin-%s_ket_qua.xlsx'

# ---------------------------------------------------------------- bộ case dùng lại

GDC = [  # Giao diện chung — 6 case, wording chốt (§2 DINH-MUC-VALIDATE)
    ('Kiểm tra hiển thị đầy đủ các thông tin trong màn hình chức năng',
     'Kiểm tra hiển thị đầy đủ các thông tin trong màn hình chức năng',
     'Hiển thị màn hình chức năng bao gồm đầy đủ các thành phần như thiết kế (như hình).'),
    ('Kiểm tra tổng thể giao diện màn hình',
     '1. Kiểm tra về bố cục\n2. Kiểm tra font chữ, cỡ chữ, màu chữ\n3. Kiểm tra chính tả',
     '1. Bố cục: các label, text, button bố trí thẳng hàng, cân đối, không xô lệch; '
     'trường bắt buộc có dấu (*).\n2. Font/màu chữ: đồng nhất, giống prototype.\n'
     '3. Không sai chính tả.'),
    ('Kiểm tra khi thực hiện Tab', 'Thực hiện bấm phím Tab',
     'Con trỏ di chuyển giữa các control theo thứ tự từ trái qua phải, từ trên xuống dưới.'),
    ('Kiểm tra khi thực hiện Shift Tab', 'Thực hiện bấm phím Shift + Tab',
     'Con trỏ di chuyển giữa các control theo thứ tự ngược lại khi ấn Tab.'),
    # cột C VERBATIM mẫu r19–r20 (v3 §5.5) — bản cũ 'Ấn Ctrl và cuộn chuột…' KHÔNG đúng chuẩn,
    # đã sửa 2026-09-07 sau khi `sync_gdc_zoom_steps.py` đồng bộ 918 case mà script này thì không.
    ('Kiểm tra khi thực hiện zoom in',
     'Ấn vào biểu tượng zoom in hoặc nhấn Ctrl+ chuột theo chiều hướng vào trong',
     'Giao diện phóng to theo độ zoom, không bị lệch/chồng lấp giữa các phần; bảng cuộn khi cần.'),
    ('Kiểm tra khi thực hiện zoom out',
     'Ấn vào biểu tượng zoom out hoặc nhấn Ctrl+ chuột theo chiều hướng ra ngoài',
     'Giao diện thu nhỏ theo độ zoom, không bị lệch/chồng lấp giữa các phần.'),
]


def attt_timkiem(thucthe):
    """6 case An toàn thông tin cho CN tìm kiếm — mẫu Admin-DanhMucBaiViet."""
    return [
        ('Kiểm tra XSS thẻ script trong ô tìm kiếm',
         '1. Nhập "<script>alert(1)</script>" vào ô tìm kiếm.\n2. Bấm tìm, mở lại xem.',
         'Hiển thị dạng văn bản thuần, không thực thi mã, không bật hộp thoại cảnh báo.'),
        ('Kiểm tra XSS mã hóa hexa dạng URL trong ô tìm kiếm',
         '1. Nhập "%3cb%3e1%3c%2fb%3e" vào ô tìm kiếm.\n2. Bấm tìm, mở lại xem.',
         'Coi là văn bản thuần, không giải mã thành thẻ, không thực thi.'),
        ('Kiểm tra XSS mã hóa hexa dạng HTML trong ô tìm kiếm',
         '1. Nhập "&lt;b&gt;1&lt;/b&gt;" vào ô tìm kiếm.\n2. Bấm tìm, mở lại xem.',
         'Coi là văn bản thuần, hiển thị nguyên chuỗi, không giải mã thành thẻ.'),
        ('Kiểm tra chèn câu lệnh truy vấn trong ô tìm kiếm',
         '1. Nhập "\' or \'1\'=\'1" vào ô tìm kiếm.\n2. Bấm tìm.',
         'Hệ thống coi là văn bản thuần, không hiểu là câu lệnh; không lộ và không đổi dữ liệu khác.'),
        ('Kiểm tra tìm kiếm chỉ trong phạm vi được cấp quyền',
         '1. Nhập từ khóa khớp với bản ghi %s nằm ngoài phạm vi tài khoản được cấp.' % thucthe,
         'Không trả về bản ghi ngoài phạm vi; kết quả giới hạn đúng theo quyền của tài khoản đang đăng nhập.'),
        ('Thao tác khi hết phiên', '1. Để phiên hết hạn.\n2. Thực hiện tìm kiếm.',
         'Trả về lỗi hết phiên và điều hướng về màn đăng nhập; không trả kết quả.'),
    ]


def searchbox(f):
    """5 mục định mức Textbox tìm kiếm — {f} = nhãn ô."""
    return {
        'mac dinh': ('Kiểm tra giá trị mặc định ô %s' % f,
                     '1. Mở màn, xem ô "%s".' % f, 'Ô trống, có chữ gợi ý nội dung cần tìm.'),
        'rat dai': ('Kiểm tra nhập chuỗi rất dài vào ô %s' % f,
                    '1. Dán vào ô "%s" một chuỗi khoảng 1.000 ký tự.' % f,
                    'Hiện thông báo không tìm thấy kết quả, giao diện không bị vỡ và không báo lỗi hệ thống.'),
        'dac biet': ('Kiểm tra ô %s nhập ký tự đặc biệt, thẻ html, script' % f,
                     '1. Nhập vào ô "%s" chuỗi có ký tự đặc biệt và thẻ html.' % f,
                     'Hệ thống tìm bình thường; chuỗi vừa nhập hiển thị nguyên dạng, không bị thực thi.'),
        'trim': ('Kiểm tra ô %s cắt khoảng trắng hai đầu' % f,
                 '1. Nhập từ khoá có khoảng trắng ở đầu và cuối.',
                 'Hệ thống tự cắt khoảng trắng hai đầu trước khi tìm và vẫn trả về đúng kết quả.'),
        'de trong': ('Kiểm tra để trống ô %s' % f,
                     '1. Nhập từ khoá để lọc.\n2. Xoá hết nội dung ô "%s".' % f,
                     'Ô tìm không bắt buộc; khi để trống danh sách trở lại đầy đủ như trước khi tìm.'),
    }


def checkbox(f):
    return {
        'mac dinh': ('Kiểm tra giá trị mặc định %s' % f, '1. Mở màn, xem ô "%s".' % f,
                     'Ô hiện đúng trạng thái mặc định theo nghiệp vụ.'),
        'o hoac nhan': ('Kiểm tra click vào ô hoặc nhãn %s' % f,
                        '1. Bấm vào ô vuông.\n2. Bấm vào phần nhãn chữ bên cạnh.',
                        'Cả hai cách đều đổi được trạng thái tích chọn.'),
        'tich chon': ('Kiểm tra tích chọn %s' % f, '1. Tích chọn ô "%s".' % f,
                      'Ô được tích chọn; danh sách lọc lại theo điều kiện mới.'),
        'bo tich': ('Kiểm tra bỏ tích chọn %s' % f, '1. Bỏ tích ô "%s".' % f,
                    'Ô được bỏ tích chọn; danh sách lọc lại theo điều kiện mới.'),
        'phim tat': ('Kiểm tra dùng bàn phím với %s' % f,
                     '1. Nhấn Tab tới ô "%s".\n2. Nhấn phím cách.' % f,
                     'Ô đổi trạng thái tích chọn bằng bàn phím.'),
    }


def selectbox(f):
    return {
        'mac dinh': ('Kiểm tra giá trị mặc định %s' % f, '1. Mở màn, xem ô chọn "%s".' % f,
                     'Ô hiện đúng giá trị mặc định theo nghiệp vụ.'),
        'gia tri': ('Kiểm tra các giá trị có trong %s' % f, '1. Mở ô chọn "%s".' % f,
                    'Danh sách đủ các giá trị theo nghiệp vụ, không thừa không thiếu.'),
        'sap xep': ('Kiểm tra sắp xếp các giá trị trong %s' % f, '1. Mở ô chọn, đọc thứ tự các giá trị.',
                    'Các giá trị sắp xếp theo đúng quy tắc đã thống nhất.'),
        'chon khac nhau': ('Kiểm tra chọn các giá trị khác nhau trong %s' % f,
                           '1. Lần lượt chọn từng giá trị khác nhau.',
                           'Chỉ chọn được 1 giá trị; giá trị chọn sau cùng có hiệu lực.'),
        'qua dai': ('Kiểm tra hiển thị %s khi giá trị quá dài' % f,
                    '1. Chọn giá trị có nội dung dài nhất.',
                    'Độ rộng ô không đổi, phần thừa cắt bằng dấu ba chấm, không xô lệch bố cục.'),
        'can le': ('Kiểm tra căn lề các giá trị trong %s' % f, '1. Mở ô chọn, quan sát các giá trị.',
                   'Các giá trị căn lề trái, thẳng hàng.'),
    }


def icon_anhien(thucthe):
    return [
        ('Kiểm tra biểu tượng thao tác phù hợp với chức năng',
         '1. Quan sát các biểu tượng thao tác trên dòng.',
         'Mỗi biểu tượng phù hợp với chức năng của nó.'),
        ('Kiểm tra biểu tượng đổi theo trạng thái hiện tại của %s' % thucthe,
         '1. Xem biểu tượng ở dòng đang hiện.\n2. Xem biểu tượng ở dòng đang ẩn.',
         'Biểu tượng phản ánh đúng trạng thái hiện tại và thao tác sẽ thực hiện khi bấm.'),
        ('Kiểm tra chú thích hiện khi rê chuột và ẩn khi bỏ chuột',
         '1. Rê chuột lên biểu tượng.\n2. Đưa chuột ra khỏi biểu tượng.',
         'Chú thích hiện khi rê chuột và biến mất ngay khi con trỏ rời đi.'),
        ('Kiểm tra đổi màu và con trỏ khi rê chuột vào biểu tượng', '1. Rê chuột lên biểu tượng.',
         'Biểu tượng đổi màu và con trỏ đổi thành hình bàn tay.'),
        ('Kiểm tra nội dung và chính tả của chú thích', '1. Đọc chú thích của từng biểu tượng.',
         'Chú thích đủ nghĩa để hiểu chức năng, không sai chính tả.'),
    ]


ATTT_THAOTAC = [
    ('Yêu cầu quyền thực hiện thao tác',
     '1. Đăng nhập tài khoản không có quyền với thao tác này.\n2. Gọi chức năng.',
     'Bị chặn vì không đủ quyền; trạng thái dữ liệu không đổi.'),
    ('Không thao tác được trên bản ghi ngoài phạm vi được cấp',
     '1. Cố thực hiện thao tác trên 1 bản ghi ngoài phạm vi được cấp bằng cách sửa mã định danh trên đường dẫn.',
     'Bị chặn vì bản ghi không thuộc quyền được cấp; không thay đổi được dữ liệu.'),
    ('Thao tác khi hết phiên', '1. Để phiên hết hạn.\n2. Thực hiện thao tác.',
     'Trả về lỗi hết phiên; không thay đổi dữ liệu.'),
]


def list_default(f, them_kq=''):
    """Case 1 của nhóm Danh sách — gộp 5 bước, wording chốt."""
    return ('Kiểm tra giá trị mặc định của %s' % f,
            '1. Kiểm tra căn lề dữ liệu trong bảng.\n'
            '2. Di chuyển con trỏ chuột vào một dòng.\n'
            '3. Kiểm tra bố cục trong bảng danh sách.\n'
            '4. Rê chuột vào các biểu tượng hoặc các liên kết trên dòng.\n'
            '5. Bỏ chuột khỏi các biểu tượng hoặc các liên kết.',
            '1. Chữ căn lề trái; số căn lề phải; ngày tháng có số ký tự bằng nhau căn giữa; '
            'tiêu đề cột căn theo dữ liệu phía dưới.\n'
            '2. Màu nền của dòng đó thay đổi.\n'
            '3. Cột thứ tự và tên các cột khác xếp từ trái qua phải đúng như thiết kế màn hình; '
            'các thao tác đặt tại cột cuối bảng, cuộn ngang vẫn ghim lại cột thao tác, '
            'cuộn dọc vẫn ghim lại hàng tiêu đề; tổng số bản ghi đặt ở cuối bảng.%s\n'
            '4. Hiện chú thích đúng tên tương ứng với chức năng.\n'
            '5. Bỏ chuột khỏi biểu tượng, chú thích mất đi.' % them_kq)


# ---------------------------------------------------------------- tiện ích

def note_merge(tc, dst, *srcs):
    """Dồn ghi chú (cột T) của các dòng sắp bỏ vào dòng được giữ — không mất bằng chứng đã chạy."""
    if 'T' not in ''.join(re.findall(r'r="([A-Z]+)%d"' % dst, tc.rows[dst]['body'])):
        pass
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
    st = st.group(1) if st else '0'
    tc.rows[dst]['body'] = b.replace(
        cm.group(0), '<c r="T%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
        % (dst, st, tcfix.esc(txt)))


def postfix_ketqua(path):
    """Cập nhật lại cache thống kê P/F/PE của file kết quả.

    `rebuild()` chỉ biết tổng số case (D7/D8) nên sau khi bỏ/thêm case, cache P/F/PE ở
    sheet BP và sheet "Tổng hợp" còn giữ số cũ. Đếm lại theo cột R rồi ghi đè.
    """
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


def cases(pl, items):
    for md, buoc, kq in items:
        pl.case(md, buoc, kq)
    return pl


def gdc_block(pl):
    pl.add_grp('Giao diện')
    pl.add_sub('Giao diện chung')
    return cases(pl, GDC)


# ---------------------------------------------------------------- builders

def build_DanhMucFAQ(tc, pl):
    F = 'Tìm theo tên hoặc slug'
    sb, cb = searchbox(F), checkbox('Bao gồm danh mục ẩn')

    # ===== CN1 — DANH SÁCH (bỏ phần tìm kiếm, chuẩn hoá nhóm Danh sách về đúng 8 case)
    pl.keep(12, 13, 14, 15, 16, 17, 18, 19, 20, 21)
    pl.keep(30)                                              # nhóm "Danh sách danh mục"
    note_merge(tc, 37, 35, 36)
    tc.retext(37, *list_default('danh sách danh mục',
                                ' Màn không phân trang nên hiển thị toàn bộ bản ghi trên một trang.'))
    pl.keep(37)
    note_merge(tc, 38, 31)
    pl.keep(38)
    note_merge(tc, 33, 39)
    tc.retext(33, md='Kiểm tra danh sách danh mục khi không có dữ liệu',
              buoc='1. Lọc bằng từ khoá không khớp bản ghi nào.\n'
                   '2. Ẩn hoặc xoá hết dữ liệu để danh sách rỗng hoàn toàn.',
              kq='Cả hai trường hợp đều hiện biểu tượng kèm thông báo không có dữ liệu, '
                 'không để bảng trắng trơn.')
    pl.keep(33)
    tc.retext(27, md='Kiểm tra số lượng bản ghi trên danh sách danh mục',
              buoc='1. Đếm số bản ghi hiển thị.\n2. Đối chiếu với thống kê tổng số bản ghi ghi trên màn.',
              kq='Số lượng khớp nhau.')
    pl.keep(27)
    tc.retext(32, md='Kiểm tra dữ liệu danh mục hiển thị đúng cột',
              buoc='1. Đối chiếu từng giá trị trên dòng với tiêu đề cột tương ứng.',
              kq='Dữ liệu hiển thị đúng cột, không xộc xệch.')
    pl.keep(32)
    pl.case('Kiểm tra độ rộng các cột của danh sách danh mục',
            '1. Quan sát độ rộng từng cột.',
            'Độ rộng các cột phù hợp với dữ liệu, không quá hẹp hay quá thừa.')
    tc.retext(34, md='Kiểm tra danh sách danh mục hiển thị dữ liệu dài')
    pl.keep(34)
    pl.case('Kiểm tra điều hướng đúng trang từ danh sách danh mục',
            '1. Bấm vào các thao tác ở cột hành động trên một dòng.',
            'Điều hướng đúng trang hoặc mở đúng chức năng tương ứng.')
    pl.keep(40, 41, 42, 43, 44, 45)                          # Icon thao tác trên dòng
    pl.add_sub2('Button Tải lại')
    tc.retext(26, md='Kiểm tra căn lề, chính tả của button Tải lại')
    pl.keep(26)
    pl.keep(46)                                              # khối Chức năng
    pl.add_sub('Chức năng Tải lại')
    pl.case('Kiểm tra tải lại danh sách',
            '1. Bấm nút "Tải lại" trên thanh công cụ.',
            'Danh sách gọi lại máy chủ và hiển thị dữ liệu mới nhất; điều kiện lọc đang áp giữ nguyên.')
    pl.case('Kiểm tra dữ liệu sau khi tải lại khớp dữ liệu trong hệ thống',
            '1. Thêm hoặc sửa 1 danh mục ở phiên khác.\n2. Bấm "Tải lại".\n'
            '3. Đối chiếu dữ liệu:\nSELECT name, slug, display_order, is_active FROM faq_categories '
            "WHERE deleted_at IS NULL ORDER BY display_order;",
            'Danh sách hiện đúng dữ liệu mới nhất, khớp dữ liệu trong hệ thống.')
    pl.keep(*range(67, 80))                                  # An toàn thông tin

    # ===== CN2 — TÌM KIẾM & LỌC (mới)
    pl.add_cn('TÌM KIẾM & LỌC DANH MỤC FAQ\n'
              'Tiền điều kiện: đã đăng nhập Quản trị Nền tảng (Quản trị Hệ thống), đang ở màn '
              'Danh mục FAQ (/admin/cms/faq-categories).\n'
              'Thanh lọc gồm: ô "Tìm theo tên hoặc slug" và ô tích "Bao gồm danh mục ẩn".\n'
              'GHI CHÚ: mỗi lần đổi điều kiện đều gọi lại máy chủ (không gom phím).')
    gdc_block(pl)
    pl.add_sub('Validate các trường thông tin')
    pl.add_sub2('Textbox %s' % F)
    tc.retext(23, md=sb['mac dinh'][0])
    pl.keep(23)
    cases(pl, [sb['rat dai']])
    tc.retext(55, md=sb['dac biet'][0])
    pl.keep(55)
    tc.retext(28, md=sb['trim'][0])
    pl.keep(28)
    cases(pl, [sb['de trong']])
    tc.retext(29, md='Kiểm tra copy nội dung dữ liệu, paste vào ô %s' % F)
    pl.keep(29)
    pl.add_sub2('Checkbox Bao gồm danh mục ẩn')
    tc.retext(24, md=cb['mac dinh'][0])
    pl.keep(24)
    cases(pl, [cb['o hoac nhan'], cb['tich chon']])
    tc.retext(25, md=cb['bo tich'][0])
    pl.keep(25)
    cases(pl, [cb['phim tat']])
    pl.add_grp('Chức năng')
    pl.keep(47, 48, 49)                                      # Tìm kiếm chung
    pl.keep(50, 51, 52, 53, 54, 56, 57)                      # Tìm kiếm đơn lẻ — Textbox
    pl.keep(58, 59)                                          # Tìm kiếm đơn lẻ — Checkbox
    pl.keep(60, 61, 62)                                      # Tìm kiếm kết hợp
    pl.add_grp('An toàn thông tin')
    pl.add_sub('An toàn thông tin — ô tìm kiếm')
    cases(pl, attt_timkiem('danh mục FAQ'))

    # ===== CN3 — ẨN / HIỆN NHANH (mới, tách khỏi CN danh sách)
    pl.add_cn('ẨN / HIỆN NHANH DANH MỤC FAQ\n'
              'Bấm biểu tượng con mắt ở 1 dòng danh mục → đổi trạng thái ngay, '
              'KHÔNG qua hộp thoại xác nhận.\n'
              "SQL đối chiếu: SELECT is_active FROM faq_categories WHERE id='<mã danh mục>' "
              'AND deleted_at IS NULL;')
    gdc_block(pl)
    pl.add_sub('Validate các trường thông tin')
    pl.add_sub2('Icon thao tác Ẩn / Hiện trên dòng')
    cases(pl, icon_anhien('danh mục'))
    pl.add_grp('Chức năng')
    pl.add_sub('Chức năng Ẩn / Hiện')
    pl.keep(64, 65, 66)
    pl.case('Kiểm tra Ẩn/Hiện không đổi các trường khác của danh mục',
            '1. Ẩn hoặc Hiện 1 danh mục.\n'
            '2. Mở lại khung Sửa của đúng danh mục đó, đối chiếu các trường còn lại.',
            'Toàn bộ trường khác (Tên danh mục, Slug, Thứ tự hiển thị) giữ nguyên như trước khi bấm, '
            'chỉ trạng thái Hiện/Ẩn thay đổi.')
    pl.add_grp('An toàn thông tin')
    cases(pl, ATTT_THAOTAC)

    pl.keep_rest(80)                                         # THÊM / SỬA / XÓA giữ nguyên


def build_LoaiVanDe(tc, pl):
    F = 'Tìm theo tên hoặc slug'

    # ===== CN1 — DANH SÁCH
    pl.keep(12, 13, 14, 15, 16, 17, 18, 19, 20, 21)
    pl.keep(22)                                              # nhóm "Danh sách Loại vấn đề"
    tc.retext(29, *list_default('danh sách Loại vấn đề',
                                ' Danh sách sắp theo Thứ tự hiển thị tăng dần như thiết kế.'))
    pl.keep(29)
    tc.retext(23, md='Kiểm tra tiêu đề cột của danh sách Loại vấn đề khớp nhãn trong biểu mẫu thêm mới',
              buoc='1. Đối chiếu tiêu đề từng cột với nhãn tương ứng trong biểu mẫu thêm mới.',
              kq='Tiêu đề cột khớp với nhãn tương ứng trong biểu mẫu thêm mới.')
    pl.keep(23)
    tc.retext(27, md='Kiểm tra danh sách Loại vấn đề khi không có dữ liệu')
    pl.keep(27)
    note_merge(tc, 28, 31)
    tc.retext(28, md='Kiểm tra số lượng bản ghi trên danh sách Loại vấn đề',
              buoc='1. Đếm số bản ghi hiển thị.\n2. Đối chiếu với thống kê tổng số bản ghi ghi trên màn.\n'
                   '3. Kiểm tra khi tổng số loại vượt ngưỡng tải một lần của màn.',
              kq='Số lượng khớp nhau; khi vượt ngưỡng tải một lần thì màn vẫn hiển thị đủ theo thiết kế, '
                 'không mất bản ghi.')
    pl.keep(28)
    note_merge(tc, 25, 24)
    tc.retext(25, md='Kiểm tra dữ liệu Loại vấn đề hiển thị đúng cột',
              buoc='1. Đối chiếu từng giá trị trên dòng với tiêu đề cột tương ứng, gồm cả cột số thứ tự.',
              kq='Dữ liệu hiển thị đúng cột, không xộc xệch; cột số thứ tự đánh số đúng vị trí dòng.')
    pl.keep(25)
    pl.case('Kiểm tra độ rộng các cột của danh sách Loại vấn đề',
            '1. Quan sát độ rộng từng cột.',
            'Độ rộng các cột phù hợp với dữ liệu, không quá hẹp hay quá thừa.')
    tc.retext(30, md='Kiểm tra danh sách Loại vấn đề hiển thị dữ liệu dài')
    pl.keep(30)
    pl.case('Kiểm tra điều hướng đúng trang từ danh sách Loại vấn đề',
            '1. Bấm vào các thao tác ở cột hành động trên một dòng.',
            'Điều hướng đúng trang hoặc mở đúng chức năng tương ứng.')
    # case "sắp xếp danh sách" đang F (bảng không sắp xếp được) — để riêng một nhóm chứ không
    # gộp vào case giá trị mặc định, tránh làm mờ lỗi đã ghi nhận.
    pl.add_sub2('Tiêu đề cột sắp xếp')
    tc.retext(26, md='Kiểm tra sắp xếp danh sách theo tiêu đề cột')
    pl.keep(26)
    pl.keep(32, 33, 34, 35, 36, 37)                          # Icon thao tác trên dòng
    pl.add_sub2('Button Tải lại')
    pl.case('Kiểm tra căn lề, chính tả của button Tải lại', '1. Quan sát nút "Tải lại".',
            'Đúng chính tả, chữ trong nút được căn giữa.')
    pl.keep(54)                                              # khối Chức năng
    pl.add_sub('Chức năng Tải lại')
    pl.keep(53)                                              # "Kiểm tra bấm Tải lại"
    pl.case('Kiểm tra dữ liệu sau khi tải lại khớp dữ liệu trong hệ thống',
            '1. Thêm hoặc sửa 1 loại vấn đề ở phiên khác.\n2. Bấm "Tải lại".\n'
            '3. Đối chiếu dữ liệu:\nSELECT name, slug, display_order, is_active FROM support_issue_types '
            'WHERE deleted_at IS NULL ORDER BY display_order;',
            'Danh sách hiện đúng dữ liệu mới nhất, khớp dữ liệu trong hệ thống.')
    pl.keep(*range(71, 83))                                  # An toàn thông tin

    # ===== CN2 — TÌM KIẾM & LỌC (mới)
    pl.add_cn('TÌM KIẾM & LỌC LOẠI VẤN ĐỀ HỖ TRỢ\n'
              'Tiền điều kiện: đã đăng nhập Quản trị Nền tảng (Quản trị Hệ thống), đang ở màn '
              'Loại vấn đề hỗ trợ (/admin/cms/support/issue-types).\n'
              'Thanh lọc gồm: ô "Tìm theo tên hoặc slug" và ô tích "Bao gồm loại đã ẩn".')
    gdc_block(pl)
    pl.add_sub('Validate các trường thông tin')
    pl.keep(38, 39, 40, 41, 42, 43, 44, 45)                  # Textbox Tìm theo tên hoặc slug
    tc.retext(58, md='Kiểm tra để trống ô %s' % F,
              buoc='1. Nhập từ khoá để lọc.\n2. Xoá hết nội dung ô "%s".' % F,
              kq='Ô tìm không bắt buộc; khi để trống danh sách trở lại đầy đủ như trước khi tìm.')
    pl.keep(58)
    pl.keep(46, 47, 48, 49, 50, 51)                          # Checkbox Bao gồm loại đã ẩn
    pl.add_grp('Chức năng')
    pl.keep(55, 56, 57)                                      # Tìm kiếm chung
    pl.keep(59, 60, 61, 62, 63, 64, 65)                      # Tìm kiếm đơn lẻ — Textbox
    pl.keep(66, 67)                                          # Tìm kiếm đơn lẻ — Checkbox
    pl.keep(68, 69, 70)                                      # Tìm kiếm kết hợp
    pl.add_grp('An toàn thông tin')
    pl.add_sub('An toàn thông tin — ô tìm kiếm')
    cases(pl, attt_timkiem('loại vấn đề hỗ trợ'))

    pl.keep_rest(83)                                         # THÊM / SỬA / ẨN-HIỆN / XÓA


def build_PhiBanQuyen(tc, pl):
    # ===== CN1 — DANH SÁCH
    pl.keep(12, 13, 14, 15, 16, 17, 18, 19, 20, 21)
    pl.keep(22)                                              # nhóm "Danh sách Loại tài nguyên"
    note_merge(tc, 31, 33)
    tc.retext(31, *list_default('danh sách Loại tài nguyên',
                                ' Màn không phân trang nên hiển thị toàn bộ bản ghi trên một trang.'))
    pl.keep(31)
    tc.retext(23, md='Kiểm tra tiêu đề cột của danh sách Loại tài nguyên khớp nhãn trong biểu mẫu thêm mới',
              buoc='1. Đối chiếu tiêu đề từng cột với nhãn tương ứng trong biểu mẫu thêm mới.',
              kq='Tiêu đề cột khớp với nhãn tương ứng trong biểu mẫu thêm mới.')
    pl.keep(23)
    note_merge(tc, 29, 28)
    tc.retext(29, md='Kiểm tra danh sách Loại tài nguyên khi không có dữ liệu',
              buoc='1. Tìm bằng từ khoá không khớp bản ghi nào.\n'
                   '2. Ẩn hoặc xoá hết dữ liệu để danh sách rỗng hoàn toàn.',
              kq='Cả hai trường hợp đều hiện biểu tượng kèm thông báo không có dữ liệu, '
                 'không để bảng trắng trơn.')
    pl.keep(29)
    note_merge(tc, 30, 26)
    tc.retext(30, md='Kiểm tra số lượng bản ghi trên danh sách Loại tài nguyên',
              buoc='1. Đếm số bản ghi hiển thị.\n2. Đối chiếu với thống kê tổng số bản ghi ghi trên màn.',
              kq='Số lượng khớp nhau.')
    pl.keep(30)
    note_merge(tc, 24, 25, 27)
    tc.retext(24, md='Kiểm tra dữ liệu Loại tài nguyên hiển thị đúng cột',
              buoc='1. Đối chiếu từng giá trị trên dòng với tiêu đề cột tương ứng '
                   '(mã loại, tên loại, mô tả, đơn giá, trạng thái).',
              kq='Dữ liệu hiển thị đúng cột, không xộc xệch; đơn giá và nhãn trạng thái hiển thị '
                 'đúng định dạng đã thống nhất.')
    pl.keep(24)
    pl.case('Kiểm tra độ rộng các cột của danh sách Loại tài nguyên',
            '1. Quan sát độ rộng từng cột.',
            'Độ rộng các cột phù hợp với dữ liệu, không quá hẹp hay quá thừa.')
    tc.retext(32, md='Kiểm tra danh sách Loại tài nguyên hiển thị dữ liệu dài')
    pl.keep(32)
    pl.case('Kiểm tra điều hướng đúng trang từ danh sách Loại tài nguyên',
            '1. Bấm vào các thao tác ở cột hành động trên một dòng.',
            'Điều hướng đúng trang hoặc mở đúng chức năng tương ứng.')
    pl.keep(34, 35, 36, 37, 38, 39)                          # Icon thao tác trên dòng
    pl.keep(55)                                              # khối Chức năng
    pl.add_sub('Chức năng Tải lại')
    pl.case('Kiểm tra tải lại danh sách', '1. Bấm nút "Tải lại" trên thanh công cụ.',
            'Danh sách gọi lại máy chủ và hiển thị dữ liệu mới nhất; điều kiện lọc đang áp giữ nguyên.')
    pl.case('Kiểm tra dữ liệu sau khi tải lại khớp dữ liệu trong hệ thống',
            '1. Thêm hoặc sửa 1 loại tài nguyên ở phiên khác.\n2. Bấm "Tải lại".\n'
            '3. Đối chiếu dữ liệu:\nSELECT code, name, unit_price, is_active FROM royalty_resource_types '
            'WHERE deleted_at IS NULL ORDER BY display_order;',
            'Danh sách hiện đúng dữ liệu mới nhất, khớp dữ liệu trong hệ thống.')
    pl.keep(*range(71, 82))                                  # An toàn thông tin

    # ===== CN2 — TÌM KIẾM & LỌC (mới)
    pl.add_cn('TÌM KIẾM & LỌC LOẠI TÀI NGUYÊN TÍNH PHÍ BẢN QUYỀN\n'
              'Tiền điều kiện: đã đăng nhập Quản trị Nền tảng (Quản trị Hệ thống), đang ở màn '
              'Loại tài nguyên tính phí bản quyền (/admin/cms/royalty-resource-types).\n'
              'Thanh lọc gồm: ô "Tìm theo mã loại hoặc tên loại tài nguyên" và ô tích "Bao gồm mục đã ẩn".')
    gdc_block(pl)
    pl.add_sub('Validate các trường thông tin')
    pl.keep(40, 41, 42, 43, 44, 45, 46, 47, 48)              # Textbox tìm kiếm
    pl.keep(49, 50, 51, 52, 53, 54)                          # Checkbox Bao gồm mục đã ẩn
    pl.add_grp('Chức năng')
    pl.keep(56, 57, 58)                                      # Tìm kiếm chung
    pl.keep(59, 60, 61, 62, 63, 64, 65)                      # Tìm kiếm đơn lẻ — Textbox
    pl.keep(66, 67)                                          # Tìm kiếm đơn lẻ — Checkbox
    pl.keep(68, 69, 70)                                      # Tìm kiếm kết hợp
    pl.add_grp('An toàn thông tin')
    pl.add_sub('An toàn thông tin — ô tìm kiếm')
    cases(pl, attt_timkiem('loại tài nguyên tính phí bản quyền'))

    pl.keep_rest(82)                                         # THÊM / SỬA / ẨN-HIỆN & XÓA


def build_DonGia(tc, pl):
    """2 tab, mỗi tab một CN danh sách đang ôm phần tìm kiếm.

    Nhóm `Hiển thị thành phần trên màn` giữ nguyên: `DonGia` nằm ngoài phạm vi đợt dọn
    nhóm trừu tượng 2026-08-06 (người đặt việc loại trừ), không tự ý đụng.
    """
    pl.keep_range(12, 57)                                    # CN "TỔNG QUAN MÀN QUẢN LÝ ĐƠN GIÁ"

    # ===== TAB THIẾT BỊ — CN danh sách
    pl.keep(58, 59, 60, 61, 62, 63, 64, 65, 66, 67)
    pl.keep(68, 69, 70)                                      # Hiển thị thành phần trên màn
    pl.keep(*range(89, 124))                                 # Danh sách · Icon · Số dòng · Phân trang
    pl.keep(124)                                             # khối Chức năng
    pl.add_sub('Chức năng Xem danh sách đơn giá thiết bị')
    pl.case('Kiểm tra mở tab "Đơn giá thiết bị"',
            '1. Chọn 1 nhà cung cấp ở đầu màn.\n2. Mở tab "Đơn giá thiết bị".',
            'Danh sách hiện đúng thiết bị của nhà cung cấp đang chọn, kèm giá đầu vào và giá đầu ra hiện hành.')
    pl.case('Kiểm tra danh sách đơn giá thiết bị khớp dữ liệu trong hệ thống',
            '1. Mở tab "Đơn giá thiết bị".\n2. Đối chiếu vài dòng với dữ liệu trong hệ thống.',
            'Tên thiết bị, mã SKU, danh mục, giá đầu vào và giá đầu ra khớp dữ liệu trong hệ thống.')
    pl.case('Kiểm tra đổi nhà cung cấp thì danh sách nạp lại',
            '1. Đang ở tab "Đơn giá thiết bị".\n2. Đổi sang nhà cung cấp khác ở đầu màn.',
            'Danh sách nạp lại theo nhà cung cấp mới, không còn dòng của nhà cung cấp trước.')
    pl.case('Kiểm tra tải danh sách theo giá trị mặc định',
            '1. Mở tab "Đơn giá thiết bị" khi chưa nhập điều kiện lọc nào.',
            'Danh sách tải theo điều kiện mặc định của màn, hiển thị từ trang đầu với số dòng mặc định.')
    pl.case('Kiểm tra thống kê trên màn khớp dữ liệu trong hệ thống',
            '1. Đọc các chỉ số thống kê ở đầu màn (số thiết bị, số thiết bị thiếu giá).\n'
            '2. Đối chiếu với dữ liệu trong hệ thống.',
            'Các chỉ số thống kê khớp dữ liệu trong hệ thống.')
    pl.keep(*range(142, 150))                                # An toàn thông tin

    # ===== TAB THIẾT BỊ — CN tìm kiếm (mới)
    pl.add_cn('TÌM KIẾM & LỌC ĐƠN GIÁ THIẾT BỊ (TAB "ĐƠN GIÁ THIẾT BỊ")\n'
              'Tiền điều kiện: đã đăng nhập Quản trị Nền tảng, đã chọn nhà cung cấp và đang ở tab '
              '"Đơn giá thiết bị" của màn Quản lý đơn giá.\n'
              'Thanh lọc gồm: ô "Tìm tên / SKU", ô chọn "Danh mục" và nút "Xóa lọc".')
    gdc_block(pl)
    pl.add_sub('Validate các trường thông tin')
    pl.keep(*range(71, 89))                                  # Textbox · Selectbox Danh mục · Nút Xóa lọc
    pl.add_grp('Chức năng')
    pl.keep(*range(125, 142))                                # 3 nhóm Chức năng Tìm kiếm
    pl.add_grp('An toàn thông tin')
    pl.add_sub('An toàn thông tin — ô tìm kiếm')
    cases(pl, attt_timkiem('đơn giá thiết bị'))

    pl.keep_range(150, 223)                                  # CẬP NHẬT ĐƠN GIÁ · LỊCH SỬ GIÁ

    # ===== TAB CHƯƠNG TRÌNH — CN danh sách (đổi tên: bỏ chữ "& TÌM KIẾM")
    tc.rename(224, 'DANH SÁCH ĐƠN GIÁ CHƯƠNG TRÌNH GIẢNG DẠY (TAB "ĐƠN GIÁ CHƯƠNG TRÌNH")\n'
                   + '\n'.join((tc.c(224, 'B') or '').split('\n')[1:]))
    pl.keep(224, 225, 226, 227, 228, 229, 230, 231, 232, 233)
    pl.keep(234, 235)                                        # Hiển thị thành phần trên màn
    pl.keep(*range(247, 282))                                # Danh sách · Icon · Số dòng · Phân trang
    pl.keep(282)                                             # khối Chức năng
    pl.add_sub('Chức năng Xem danh sách đơn giá chương trình')
    pl.case('Kiểm tra mở tab "Đơn giá chương trình"',
            '1. Chọn 1 nhà cung cấp ở đầu màn.\n2. Mở tab "Đơn giá chương trình".',
            'Danh sách hiện đúng chương trình giảng dạy của nhà cung cấp đang chọn, '
            'kèm giá đầu vào và giá đầu ra hiện hành.')
    pl.case('Kiểm tra danh sách đơn giá chương trình khớp dữ liệu trong hệ thống',
            '1. Mở tab "Đơn giá chương trình".\n2. Đối chiếu vài dòng với dữ liệu trong hệ thống.',
            'Tên chương trình, khối lớp, giá đầu vào và giá đầu ra khớp dữ liệu trong hệ thống.')
    pl.case('Kiểm tra tải danh sách theo giá trị mặc định',
            '1. Mở tab "Đơn giá chương trình" khi chưa nhập điều kiện lọc nào.',
            'Danh sách tải theo điều kiện mặc định của màn, hiển thị từ trang đầu với số dòng mặc định.')
    pl.case('Kiểm tra thống kê trên màn khớp dữ liệu trong hệ thống',
            '1. Đọc các chỉ số thống kê ở đầu màn (số chương trình, số chương trình thiếu giá).\n'
            '2. Đối chiếu với dữ liệu trong hệ thống.',
            'Các chỉ số thống kê khớp dữ liệu trong hệ thống.')
    pl.keep(288, 289, 290, 291, 292)                          # An toàn thông tin (giữ ở CN danh sách)
    # CN này trước đây mang tên "DANH SÁCH & TÌM KIẾM …" nên bộ rà không xếp vào loại màn danh sách;
    # đổi tên xong thì phải đủ bộ ATTT của màn danh sách.
    pl.case('Truy cập màn khi chưa đăng nhập',
            '1. Mở đường dẫn màn Quản lý đơn giá bằng trình duyệt chưa đăng nhập.',
            'Bị đưa về màn đăng nhập, không thấy dữ liệu đơn giá nào.')
    pl.case('Truy cập màn bằng tài khoản khác vai trò (ngoài phạm vi quản trị)',
            '1. Đăng nhập bằng tài khoản thuộc vai trò khác.\n2. Mở màn Quản lý đơn giá.',
            'Bị chặn vì không thuộc phạm vi quản trị; không thấy dữ liệu đơn giá.')
    pl.case('Ngoại lệ: tài khoản được cấp đúng quyền vẫn vào được',
            '1. Đăng nhập tài khoản được cấp đúng quyền xem đơn giá.\n2. Mở tab "Đơn giá chương trình".',
            'Vào được màn và xem đủ dữ liệu trong phạm vi được cấp.')
    pl.case('Can thiệp tham số để lấy dữ liệu ngoài phạm vi',
            '1. Sửa tham số nhà cung cấp trên lệnh gọi danh sách đơn giá chương trình sang đơn vị khác.',
            'Máy chủ bỏ qua tham số ép phạm vi, chỉ trả dữ liệu trong phạm vi tài khoản đang đăng nhập.')

    # ===== TAB CHƯƠNG TRÌNH — CN tìm kiếm (mới)
    pl.add_cn('TÌM KIẾM ĐƠN GIÁ CHƯƠNG TRÌNH GIẢNG DẠY (TAB "ĐƠN GIÁ CHƯƠNG TRÌNH")\n'
              'Tiền điều kiện: đã đăng nhập Quản trị Nền tảng, đã chọn nhà cung cấp và đang ở tab '
              '"Đơn giá chương trình" của màn Quản lý đơn giá.\n'
              'Thanh lọc của tab này chỉ có ô "Tìm tên chương trình" kèm nút xoá từ khoá.')
    gdc_block(pl)
    pl.add_sub('Validate các trường thông tin')
    pl.keep(*range(236, 247))                                # Textbox Tìm tên chương trình
    pl.add_grp('Chức năng')
    pl.keep(283, 284, 285, 286, 287)                          # Chức năng Tìm kiếm chung
    pl.add_grp('An toàn thông tin')
    pl.add_sub('An toàn thông tin — ô tìm kiếm')
    pl.keep(294)                                             # XSS phản chiếu qua ô tìm
    a = attt_timkiem('đơn giá chương trình giảng dạy')
    cases(pl, [a[1], a[2]])                                  # XSS hexa URL · hexa HTML
    pl.keep(293)                                             # chèn câu lệnh truy vấn qua ô tìm
    cases(pl, [a[4], a[5]])                                  # phạm vi quyền · hết phiên

    pl.keep_rest(295)                                        # CẬP NHẬT ĐƠN GIÁ CHƯƠNG TRÌNH


def build_NCC(tc, pl):
    """CN `XỬ LÝ VI PHẠM NCC` đang ôm cả thanh lọc 4 tiêu chí.

    File này đã có sẵn CN `TÌM KIẾM & LỌC NCC` cho màn danh sách NCC — CN mới bám đúng
    khung đó. Khối Chức năng của CN vi phạm trước nay KHÔNG có nhóm tìm kiếm nào nên
    3 nhóm Chức năng Tìm kiếm ở CN mới là case bổ sung.
    """
    TIEUCHI = ['Tìm theo NCC hoặc mô tả', 'Loại vi phạm', 'Mức độ', 'Trạng thái vi phạm']
    pl.keep_range(12, 672)                                   # 10 CN trước giữ nguyên

    # ===== CN XỬ LÝ VI PHẠM — bỏ phần lọc
    pl.keep(673, 674, 675, *range(676, 683))                 # CN · Giao diện chung · header Validate
    pl.keep(683, 684)                                        # 3 thẻ tổng theo trạng thái
    pl.keep(*range(718, 740))                                # thẻ vi phạm · 2 Button · danh sách thẻ
    pl.keep(*range(740, 765))                                # khối Chức năng (không có nhóm tìm kiếm)
    pl.keep(*range(765, 779))                                # An toàn thông tin

    # ===== CN mới — TÌM KIẾM & LỌC VI PHẠM NCC
    pl.add_cn('TÌM KIẾM & LỌC VI PHẠM NCC\n'
              'Tiền điều kiện: đã đăng nhập Quản trị Nền tảng, đang ở màn Xử lý vi phạm NCC '
              '(/admin/suppliers/violations).\n'
              'Thanh lọc gồm: ô "Tìm theo NCC hoặc mô tả", 3 ô chọn "Loại vi phạm" · "Mức độ" · '
              '"Trạng thái vi phạm", và chip lọc theo NCC khi mở màn từ hồ sơ một NCC.')
    gdc_block(pl)
    pl.add_sub('Validate các trường thông tin')
    note_merge(tc, 692, 686)
    pl.keep(691, 692, 693, 694, 695, 696)                    # Textbox Tìm theo NCC hoặc mô tả
    note_merge(tc, 698, 687)
    pl.keep(*range(697, 704))                                # Selectbox Loại vi phạm
    note_merge(tc, 705, 688)
    pl.keep(*range(704, 711))                                # Selectbox Mức độ
    note_merge(tc, 712, 689)
    pl.keep(*range(711, 718))                                # Selectbox Trạng thái vi phạm
    pl.add_sub2('Chip lọc theo NCC')
    pl.case('Kiểm tra giá trị mặc định chip lọc theo NCC',
            '1. Mở màn Xử lý vi phạm từ menu (không đi từ hồ sơ NCC).',
            'Không có chip lọc nào; danh sách hiện vi phạm của mọi nhà cung cấp.')
    pl.case('Kiểm tra chip lọc theo NCC khi mở từ hồ sơ nhà cung cấp',
            '1. Mở màn Xử lý vi phạm từ hồ sơ một nhà cung cấp.',
            'Hiện chip lọc mang tên nhà cung cấp đó; danh sách chỉ còn vi phạm của nhà cung cấp này.')
    pl.keep(690)                                             # Kiểm tra bỏ chip lọc theo NCC
    pl.add_grp('Chức năng')
    pl.add_sub('Chức năng Tìm kiếm chung')
    pl.case('Tìm kiếm theo giá trị mặc định',
            '1. Mở màn khi chưa nhập điều kiện lọc nào.',
            'Danh sách hiện toàn bộ vi phạm trong phạm vi được cấp, sắp xếp theo mặc định của màn.')
    pl.case('Kiểm tra tìm không ra kết quả',
            '1. Nhập từ khoá chắc chắn không khớp bản ghi nào.',
            'Danh sách rỗng kèm thông báo không có dữ liệu; các thẻ tổng cập nhật về 0 theo bộ lọc.')
    pl.add_sub('Chức năng Tìm kiếm đơn lẻ')
    pl.add_sub2('Textbox Tìm theo NCC hoặc mô tả')
    pl.case('Tìm theo tên nhà cung cấp',
            '1. Nhập một phần tên nhà cung cấp vào ô tìm.',
            'Chỉ còn vi phạm của các nhà cung cấp có tên chứa từ khoá.')
    pl.case('Tìm theo mô tả vi phạm',
            '1. Nhập một phần nội dung mô tả vi phạm vào ô tìm.',
            'Chỉ còn vi phạm có mô tả chứa từ khoá.')
    pl.add_sub2('Selectbox Loại vi phạm')
    pl.case('Chọn 1 Loại vi phạm để lọc', '1. Chọn một giá trị ở ô "Loại vi phạm".',
            'Danh sách chỉ còn vi phạm đúng loại đã chọn.')
    pl.add_sub2('Selectbox Mức độ')
    pl.case('Chọn 1 Mức độ để lọc', '1. Chọn một giá trị ở ô "Mức độ".',
            'Danh sách chỉ còn vi phạm đúng mức độ đã chọn.')
    pl.add_sub2('Selectbox Trạng thái vi phạm')
    pl.case('Chọn 1 Trạng thái vi phạm để lọc', '1. Chọn một giá trị ở ô "Trạng thái vi phạm".',
            'Danh sách chỉ còn vi phạm đúng trạng thái đã chọn; thẻ tổng tương ứng được làm nổi bật.')
    pl.add_sub('Chức năng Tìm kiếm kết hợp tất cả các trường')
    pl.add_sub2('Kết hợp 2 thông tin (C(4,2) = 6 trường hợp)')
    for a, b in [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]:
        pl.case('Kết hợp %s và %s' % (TIEUCHI[a], TIEUCHI[b]),
                '1. Nhập/chọn đồng thời 2 tiêu chí: "%s" và "%s".' % (TIEUCHI[a], TIEUCHI[b]),
                'Danh sách chỉ còn bản ghi thoả cả 2 tiêu chí.')
    pl.add_sub2('Kết hợp 3 thông tin (C(4,3) = 4 trường hợp)')
    for a, b, c in [(0, 1, 2), (0, 1, 3), (0, 2, 3), (1, 2, 3)]:
        pl.case('Kết hợp %s, %s và %s' % (TIEUCHI[a], TIEUCHI[b], TIEUCHI[c]),
                '1. Nhập/chọn đồng thời 3 tiêu chí: "%s", "%s" và "%s".'
                % (TIEUCHI[a], TIEUCHI[b], TIEUCHI[c]),
                'Danh sách chỉ còn bản ghi thoả cả 3 tiêu chí.')
    pl.add_sub2('Kết hợp 4 thông tin (đủ 4 tiêu chí)')
    pl.case('Kết hợp đủ 4 tiêu chí lọc',
            '1. Nhập/chọn đồng thời cả 4 tiêu chí trên thanh lọc.',
            'Danh sách chỉ còn bản ghi thoả đồng thời cả 4 tiêu chí.')
    pl.case('Kiểm tra kết quả kết hợp khớp dữ liệu trong hệ thống',
            '1. Lọc bằng đủ 4 tiêu chí.\n2. Đối chiếu kết quả với dữ liệu trong hệ thống.',
            'Số bản ghi và nội dung khớp dữ liệu trong hệ thống.')
    pl.case('Kiểm tra bỏ dần từng tiêu chí lọc',
            '1. Đang lọc bằng cả 4 tiêu chí.\n2. Bỏ dần từng tiêu chí.',
            'Sau mỗi lần bỏ, danh sách nới rộng đúng theo các tiêu chí còn lại.')
    pl.add_grp('An toàn thông tin')
    pl.add_sub('An toàn thông tin — ô tìm kiếm')
    cases(pl, attt_timkiem('vi phạm NCC'))

    pl.keep_rest(779)                                        # CÔNG CỤ QUẢN LÝ DOMAIN …


def build_VaiTro(tc, pl):
    """2 CN đang ôm phần tìm kiếm: ma trận trần quyền và tab "Tài khoản"."""
    Q = 'Tìm kiếm quyền'
    A = 'Tìm kiếm tài khoản'
    sbq, sba = searchbox(Q), searchbox(A)
    cb = checkbox('Chỉ quản trị')

    pl.keep_range(12, 52)                                    # CN danh sách vai trò

    # ===== CN XEM MA TRẬN TRẦN QUYỀN — bỏ nhóm tìm kiếm
    pl.keep(*range(53, 89))                                  # tới hết nhóm "Xem & mở/thu gọn nhóm"
    pl.keep(*range(101, 106))                                # An toàn thông tin

    # ===== CN mới — TÌM KIẾM QUYỀN TRONG MA TRẬN TRẦN QUYỀN
    pl.add_cn('TÌM KIẾM QUYỀN TRONG MA TRẬN TRẦN QUYỀN (TAB "TRẦN QUYỀN")\n'
              'Tiền điều kiện: đã đăng nhập Quản trị Nền tảng, đã chọn 1 vai trò tổ chức và đang ở '
              'tab "Trần quyền".\n'
              'Thanh lọc của màn chỉ có ô tìm kiếm quyền, lọc ngay trên ma trận đang hiển thị.')
    gdc_block(pl)
    pl.add_sub('Validate các trường thông tin')
    pl.add_sub2('Textbox %s' % Q)
    tc.retext(90, md=sbq['mac dinh'][0])
    pl.keep(90)
    cases(pl, [sbq['rat dai'], sbq['dac biet'], sbq['trim']])
    tc.retext(98, md=sbq['de trong'][0])
    pl.keep(98)
    pl.add_grp('Chức năng')
    pl.add_sub('Chức năng Tìm kiếm chung')
    pl.keep(99, 100, 95)                                     # mặc định · không ra kết quả · không khớp
    pl.add_sub('Chức năng Tìm kiếm đơn lẻ')
    pl.add_sub2('Textbox %s' % Q)
    pl.keep(91, 92, 93, 94, 96, 97)
    pl.add_grp('An toàn thông tin')
    pl.add_sub('An toàn thông tin — ô tìm kiếm')
    cases(pl, attt_timkiem('quyền trong ma trận trần quyền'))

    pl.keep_range(106, 204)                                  # CHỈNH SỬA TRẦN QUYỀN · TAB ROLE CON

    # ===== CN XEM TAB "TÀI KHOẢN" — bỏ 3 nhóm tìm kiếm
    pl.keep(*range(205, 226))                                # CN · Giao diện · Validate · Danh sách
    pl.keep(226)                                             # khối Chức năng
    pl.keep(240, 241, 242, 243)                              # Xem tài khoản cấp dưới
    pl.keep(*range(244, 255))                                # An toàn thông tin

    # ===== CN mới — TÌM KIẾM & LỌC TÀI KHOẢN (TAB "TÀI KHOẢN")
    pl.add_cn('TÌM KIẾM & LỌC TÀI KHOẢN (TAB "TÀI KHOẢN")\n'
              'Tiền điều kiện: đã đăng nhập Quản trị Nền tảng, đã chọn 1 vai trò tổ chức và đang ở '
              'tab "Tài khoản".\n'
              'Thanh lọc gồm: ô tìm kiếm tài khoản (theo tên hoặc email) và bộ lọc "Chỉ quản trị".')
    gdc_block(pl)
    pl.add_sub('Validate các trường thông tin')
    pl.add_sub2('Textbox %s' % A)
    cases(pl, [sba['mac dinh'], sba['rat dai'], sba['dac biet'], sba['trim'], sba['de trong']])
    pl.add_sub2('Checkbox Chỉ quản trị')
    cases(pl, [cb['mac dinh'], cb['o hoac nhan'], cb['tich chon'], cb['bo tich'], cb['phim tat']])
    pl.add_grp('Chức năng')
    pl.keep(227, 228, 229, 230)                              # Tìm kiếm chung
    pl.keep(231, 232, 233, 234)                              # Tìm kiếm đơn lẻ — Textbox
    pl.keep(235, 236)                                        # Tìm kiếm đơn lẻ — Bộ lọc "Chỉ quản trị"
    pl.keep(237, 238, 239)                                   # Tìm kiếm kết hợp
    pl.add_grp('An toàn thông tin')
    pl.add_sub('An toàn thông tin — ô tìm kiếm')
    cases(pl, attt_timkiem('tài khoản'))

    pl.keep_rest(255)                                        # CÁ BIỆT HOÁ QUYỀN MỘT TÀI KHOẢN


def build_BaiViet(tc, pl):
    """Admin-BaiViet: CN1 `DANH SÁCH BÀI VIẾT & TÌM KIẾM/LỌC` gộp 2 thao tác.

    Mẫu đối chiếu: Testcase-Role-Admin-DanhMucBaiViet.xlsx (cùng cụm CMS).
    Kèm 2 lỗi cấu trúc sửa luôn: 4 nhóm control thanh lọc đang ở cấp `sub` (ngoài khối
    Validate) và nhóm `Danh sách bài viết` 10 case đặt tên tự do (chuẩn là 8 case).
    """
    SQL_LIST = ('SELECT title, slug, type, status, category_id FROM articles '
                'WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 50;')

    # ===== CN1 — DANH SÁCH BÀI VIẾT
    tc.retext(12, md='DANH SÁCH BÀI VIẾT (/admin/cms/articles)\n'
                     'Tiền điều kiện: đã đăng nhập Quản trị Hệ thống.\n'
                     '1. Vào menu CMS → "Bài viết" (/admin/cms/articles).\n'
                     'GHI CHÚ: dữ liệu THẬT (gọi máy chủ CMS); mỗi lần tải chỉ lấy tối đa 50 bài viết '
                     'đầu tiên theo thứ tự tạo mới nhất, KHÔNG có phân trang.')
    pl.keep(12, 13, 14, 15, 16, 17, 18, 19, 20, 21)
    pl.keep(22)                                              # nhóm "Danh sách bài viết"

    # 8 case chuẩn: mặc định · tiêu đề cột · không dữ liệu · số lượng · đúng cột ·
    #               độ rộng cột · dữ liệu dài · điều hướng
    note_merge(tc, 29, 28)
    tc.retext(29, *list_default(
        'danh sách bài viết',
        ' Bảng có 6 cột "Tiêu đề", "Loại", "Danh mục", "Trạng thái", "Cờ", "Thao tác"; '
        'bộ đếm tổng số bài viết đặt ở góc phải thanh lọc. Màn không có thanh phân trang hay ô chọn '
        'số dòng mỗi trang, toàn bộ bài viết hiển thị trong một danh sách cuộn, tối đa 50 bài đầu tiên '
        'theo thứ tự tạo mới nhất.'))
    pl.keep(29)
    tc.retext(23, md='Kiểm tra tiêu đề cột của danh sách bài viết khớp nhãn trong biểu mẫu thêm mới',
              buoc='1. Quan sát tiêu đề bảng.\n'
                   '2. Đối chiếu tiêu đề từng cột với nhãn tương ứng trong biểu mẫu thêm mới.',
              kq='Bảng có đúng các cột: "Tiêu đề", "Loại", "Danh mục", "Trạng thái", "Cờ", "Thao tác"; '
                 'tiêu đề cột khớp dữ liệu từng dòng và khớp nhãn tương ứng trong biểu mẫu thêm mới.')
    pl.keep(23)
    tc.retext(27, md='Kiểm tra danh sách bài viết khi không có dữ liệu',
              buoc='1. Nhập từ khóa hoặc chọn bộ lọc chắc chắn không khớp bài viết nào.\n'
                   '2. Xem lại màn khi hệ thống chưa có bài viết nào.',
              kq='Cả hai trường hợp đều ẩn các dòng dữ liệu và hiện dòng "Chưa có bài viết.", '
                 'không để bảng trắng trơn.')
    pl.keep(27)
    tc.retext(31, md='Kiểm tra số lượng bản ghi trên danh sách bài viết',
              buoc='1. Đếm số bản ghi hiển thị trong bảng.\n'
                   '2. Đối chiếu với bộ đếm tổng số bài viết ở góc phải thanh lọc.',
              kq='Số lượng khớp nhau; khi đang áp bộ lọc thì bộ đếm hiện đúng tổng số bài khớp bộ lọc.')
    pl.keep(31)
    note_merge(tc, 24, 25, 26)
    tc.retext(24, md='Kiểm tra dữ liệu bài viết hiển thị đúng cột',
              buoc='1. Đối chiếu từng giá trị trên dòng với tiêu đề cột tương ứng.\n'
                   '2. Xem các bài ở đủ 5 trạng thái và các bài thuộc nhiều loại khác nhau.',
              kq='Cột "Tiêu đề" hiện tên bài in đậm, dòng dưới là đường dẫn tĩnh dạng chữ đơn cách đều, '
                 'cả 2 cắt gọn nếu quá dài; "Loại" hiện nhãn nền xám; "Danh mục" hiện đúng tên danh mục '
                 'hoặc dấu gạch ngang nếu chưa gán; "Trạng thái" hiện nhãn màu đúng theo trạng thái '
                 '("Bản nháp" nền xám, "Chờ duyệt" xanh dương, "Đã xuất bản" xanh lá, "Bị từ chối" đỏ, '
                 '"Lưu trữ" vàng cam); "Cờ" hiện biểu tượng ngôi sao (Nổi bật) / lửa (Tin nóng) / '
                 'ghim (Ghim) nếu bài có cờ.\n'
                 '[Lệch BA] Cột "Cờ" hiện biểu tượng cho MỌI loại bài viết như nhau, nhưng khung '
                 'Tạo/Sửa chỉ cho phép bật các cờ này khi Loại là Tin tức — các loại khác không có '
                 'cách gắn cờ qua giao diện dù cột vẫn hiển thị đúng biểu tượng nếu dữ liệu có sẵn cờ.')
    pl.keep(24)
    pl.case('Kiểm tra độ rộng các cột của danh sách bài viết',
            '1. Quan sát độ rộng từng cột.',
            'Độ rộng các cột phù hợp với dữ liệu, không quá hẹp hay quá thừa.')
    pl.case('Kiểm tra danh sách bài viết hiển thị dữ liệu dài',
            '1. Xem bài viết có tiêu đề hoặc đường dẫn tĩnh rất dài.',
            'Nội dung cắt gọn trong ô kèm dấu ba chấm; bảng cuộn ngang khi cần, không vỡ giao diện.')
    tc.retext(30, md='Kiểm tra điều hướng đúng trang từ danh sách bài viết',
              buoc='1. Bấm lần lượt các nút và biểu tượng ở cột "Thao tác" trên một dòng.\n'
                   '2. Bấm vào vùng trống của dòng (không trúng nút hay biểu tượng thao tác).',
              kq='1. Mỗi thao tác mở đúng chức năng tương ứng của đúng dòng đó: biểu tượng bút chì mở '
                 'khung chỉnh sửa điền sẵn dữ liệu của bài đó, biểu tượng thùng rác mở hộp xác nhận xoá '
                 'của bài đó, nút đổi trạng thái áp lên đúng bài đó.\n'
                 '2. Bấm vào vùng trống của dòng thì không có gì xảy ra.')
    pl.keep(30)
    pl.keep(33, 34, 35, 36, 37, 38)                          # Icon thao tác trên dòng
    pl.add_sub2('Button Tải lại')
    pl.case('Kiểm tra căn lề, chính tả của button Tải lại',
            '1. Quan sát nút "Tải lại" trên thanh lọc.',
            'Nút hiển thị chữ "Tải lại" kèm biểu tượng mũi tên xoay, căn thẳng hàng với các ô lọc '
            'còn lại, không sai chính tả.')

    pl.keep(68)                                              # khối Chức năng
    pl.add_sub('Chức năng Danh sách')
    pl.case('Tải danh sách mặc định',
            '1. Mở màn "Bài viết".\n2. Quan sát danh sách khi vừa tải xong.',
            'Danh sách tự tải ngay khi mở màn, không cần thao tác thêm; bài viết xếp theo thứ tự tạo '
            'mới nhất; tải tối đa 50 bài trong một lần và không có phân trang.')
    pl.case('Kiểm tra dữ liệu danh sách khớp dữ liệu trong hệ thống',
            '1. Mở màn "Bài viết".\n2. Đối chiếu từng dòng trên bảng với dữ liệu trong hệ thống:\n'
            + SQL_LIST,
            'Từng dòng trên bảng khớp dữ liệu trong hệ thống về tiêu đề, đường dẫn tĩnh, loại bài viết, '
            'trạng thái và danh mục; không thừa, không thiếu dòng nào; bài viết đã xoá không hiển thị.')
    pl.case('Kiểm tra số liệu thống kê khớp dữ liệu trong hệ thống',
            '1. Đọc bộ đếm tổng số bài viết ở góc phải thanh lọc.\n'
            '2. Đối chiếu với dữ liệu trong hệ thống:\n'
            'SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL;',
            'Con số trên bộ đếm khớp với số liệu trong hệ thống; sau khi thêm hoặc xoá một bài viết '
            'thì bộ đếm cập nhật lại đúng.')
    pl.add_sub('Chức năng Tải lại')
    tc.retext(32, md='Kiểm tra bấm nút Tải lại',
              kq='Icon nút xoay tròn trong lúc tải; sau khi xong danh sách và bộ đếm cập nhật lại, '
                 'giữ nguyên bộ lọc và từ khóa đang áp dụng.')
    pl.keep(32)
    pl.case('Kiểm tra dữ liệu sau khi tải lại khớp dữ liệu trong hệ thống',
            '1. Thêm hoặc sửa 1 bài viết ở phiên khác.\n2. Bấm "Tải lại".\n'
            '3. Đối chiếu dữ liệu:\n' + SQL_LIST,
            'Danh sách hiện đúng dữ liệu mới nhất, khớp dữ liệu trong hệ thống.')

    pl.keep(104, 105)                                        # An toàn thông tin
    tc.retext(106, buoc='1. Để hết phiên đăng nhập.\n2. Thao tác tải lại danh sách.')
    pl.keep(106)
    pl.case('Truy cập màn khi chưa đăng nhập',
            '1. Khi chưa đăng nhập (hoặc vừa đăng xuất), mở thẳng màn Bài viết bằng cách gõ địa chỉ '
            'hoặc mở lại tab cũ.',
            'Hệ thống điều hướng về màn đăng nhập; không hiển thị bất kỳ nội dung nào của màn Bài viết.')
    pl.case('Yêu cầu quyền xem màn',
            '1. Đăng nhập tài khoản thuộc nhóm quản trị nhưng CHƯA được cấp quyền nào với bài viết.\n'
            '2. Mở màn (bấm menu hoặc gõ địa chỉ).',
            'Không vào được: hệ thống báo trang không tồn tại ngay tại chỗ, vẫn giữ khung menu và tiêu '
            'đề của ứng dụng; không gọi và không để lộ dữ liệu nào.')
    pl.case('Truy cập màn bằng tài khoản khác vai trò (ngoài phạm vi quản trị)',
            '1. Đăng nhập tài khoản KHÁC vai trò (nhà cung cấp / nhà trường / giáo viên).\n'
            '2. Mở thẳng màn Bài viết của quản trị.',
            'Ngoài phạm vi vai trò: hệ thống báo trang không tồn tại ngay tại chỗ, vẫn giữ khung menu '
            'và tiêu đề; không để lộ dữ liệu quản trị.')
    pl.case('Ngoại lệ: tài khoản được cấp đúng quyền vẫn vào được',
            '1. Đăng nhập tài khoản đã thật sự được cấp đúng quyền với bài viết.\n2. Mở màn.',
            'Vẫn vào xem được bình thường; không bị chặn nhầm.')
    pl.case('Kiểm tra phạm vi dữ liệu trả về đúng quyền được cấp',
            '1. Đăng nhập tài khoản chỉ được cấp quyền trên một phần dữ liệu bài viết.\n'
            '2. Xem danh sách.',
            'Chỉ trả về đúng phần dữ liệu tài khoản được phép xem; phần ngoài phạm vi không xuất hiện '
            'và không đếm vào bộ đếm tổng số bài viết.')
    pl.case('Can thiệp tham số để lấy dữ liệu ngoài phạm vi',
            '1. Sửa trực tiếp mã định danh hoặc tham số lọc trên đường dẫn để trỏ tới bài viết ngoài '
            'phạm vi được cấp.',
            'Hệ thống bỏ qua hoặc chặn: vẫn chỉ trả về dữ liệu trong phạm vi được cấp, không lộ bản ghi '
            'ngoài phạm vi.')
    pl.case('Kiểm tra phân quyền Xem/Tạo/Sửa/Xóa tách biệt',
            '1. Đăng nhập tài khoản chỉ có 1 trong các quyền xem/tạo/sửa/xóa bài viết, thử thao tác '
            'ngoài quyền được cấp (vd chỉ có quyền xem, thử Tạo/Sửa/Xóa).',
            '[CẦN VERIFY] Kỳ vọng máy chủ từ chối thao tác ngoài quyền được cấp dù nút thao tác vẫn '
            'hiển thị trên giao diện; cần xác minh máy chủ chặn đúng cho từng quyền tạo/sửa/xóa riêng biệt.')
    pl.keep(110, 111, 112)

    # ===== CN2 — TÌM KIẾM & LỌC BÀI VIẾT (mới)
    pl.add_cn('TÌM KIẾM & LỌC BÀI VIẾT (/admin/cms/articles)\n'
              'Tiền điều kiện: đã đăng nhập Quản trị Hệ thống, đang ở màn Bài viết '
              '(/admin/cms/articles).\n'
              'Thanh lọc gồm: ô "Tìm theo tiêu đề", ô chọn "Mọi loại", ô chọn "Mọi trạng thái", '
              'ô chọn "Mọi danh mục".\n'
              'GHI CHÚ: tìm kiếm và lọc đều xử lý ở máy chủ; mỗi lần đổi điều kiện đều gọi lại máy chủ.')
    gdc_block(pl)
    pl.add_sub('Validate các trường thông tin')
    pl.add_sub2('Textbox Tìm theo tiêu đề')
    pl.keep(*range(40, 47))
    pl.add_sub2('Selectbox Mọi loại (lọc Loại bài viết)')
    pl.keep(*range(48, 54))
    pl.add_sub2('Selectbox Mọi trạng thái (lọc Trạng thái)')
    pl.keep(*range(55, 61))
    pl.add_sub2('Selectbox Mọi danh mục (lọc Danh mục)')
    pl.keep(*range(62, 68))
    pl.add_grp('Chức năng')
    pl.keep(69, 70, 71, 72)                                  # Tìm kiếm chung
    pl.keep(*range(73, 86))                                  # Tìm kiếm đơn lẻ
    pl.keep(*range(86, 104))                                 # Kết hợp tất cả / 2 / 3 / 4 tiêu chí
    pl.add_grp('An toàn thông tin')
    pl.add_sub('An toàn thông tin — ô tìm kiếm')
    tc.retext(108, md='Kiểm tra XSS thẻ script trong ô tìm kiếm')
    pl.keep(108)
    pl.case('Kiểm tra XSS mã hóa hexa dạng URL trong ô tìm kiếm',
            '1. Nhập "%3cb%3e1%3c%2fb%3e" vào ô tìm kiếm.\n2. Xem danh sách kết quả.',
            'Coi là văn bản thuần, không giải mã thành thẻ, không thực thi.')
    pl.case('Kiểm tra XSS mã hóa hexa dạng HTML trong ô tìm kiếm',
            '1. Nhập "&lt;b&gt;1&lt;/b&gt;" vào ô tìm kiếm.\n2. Xem danh sách kết quả.',
            'Coi là văn bản thuần, hiển thị nguyên chuỗi, không giải mã thành thẻ.')
    tc.retext(107, md='Kiểm tra chèn câu lệnh truy vấn trong ô tìm kiếm')
    pl.keep(107, 109)
    pl.case('Thao tác khi hết phiên',
            '1. Để phiên hết hạn.\n2. Thực hiện tìm kiếm hoặc đổi bộ lọc.',
            'Trả về lỗi hết phiên và điều hướng về màn đăng nhập; không trả kết quả.')

    pl.keep_rest(113)                                        # TẠO / SỬA / ĐĂNG / LƯU TRỮ / XÓA


BUILDERS = {'DanhMucFAQ': build_DanhMucFAQ, 'LoaiVanDe': build_LoaiVanDe,
            'PhiBanQuyen': build_PhiBanQuyen, 'DonGia': build_DonGia, 'NCC': build_NCC,
            'VaiTro': build_VaiTro, 'BaiViet': build_BaiViet}


# ---------------------------------------------------------------- chạy

def run(name, apply=False):
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
    ap = '--apply' in sys.argv
    names = list(BUILDERS) if (not args or args[0] == 'all') else args
    for n in names:
        run(n, ap)

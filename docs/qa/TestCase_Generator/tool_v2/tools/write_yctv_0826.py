# -*- coding: utf-8 -*-
"""Ghi kết quả chạy live 26/08 màn "Yêu cầu tư vấn" (Admin) vào 2 thư mục kết quả.

Phạm vi: 20 case MỚI + 17 case vừa SỬA nội dung theo giao diện mới (kết quả cũ của các case
này không còn hiệu lực vì đề bài đã đổi).
  - Ghi cột F (kết quả lần chạy) + cột T (ghi chú kèm bằng chứng).
  - Ở bộ `ket-qua-test-thu-cong`: XÓA cột G của 17 case đã sửa (kết quả người chạy tay trên
    nội dung CŨ), không ghi đè cột G bằng kết quả của agent.
  - KHÔNG đụng cột R (công thức) → chạy `postfix_cache_ncc_0821.py` ngay sau script này.

Map theo cặp (tiêu đề cột B + bước cột C) và bắt buộc khớp DUY NHẤT — vì trong file có nhiều
case trùng tiêu đề ("Kiểm tra căn lề, chính tả của button", "Kiểm tra giá trị mặc định").

    python3 write_yctv_0826.py           # dry-run
    python3 write_yctv_0826.py --apply
"""
import os
import re
import sys
import zipfile

import tcfix

FILES = [
    '../../testCase/Admin/ket-qua-test/Testcase-Role-Admin-YeuCauTuVan_ket_qua.xlsx',
    '../../testCase/Admin/ket-qua-test-thu-cong/Testcase-Role-Admin-YeuCauTuVan_ket_qua.xlsx',
]
L = '[Lần 1 – 26/08] '

# (khóa nhận diện trong cột B, khóa trong cột C, mark, ghi chú)
MOI = [
 ('Kiểm tra số trên từng tab khớp số thật', 'Quan sát số cạnh cả 5 tab', 'P',
  'Tất cả 61 = Mới 15 + Đã đọc 25 + Đã tư vấn 15 + Lưu trữ 6. Bấm lần lượt từng tab, chân bảng '
  'lần lượt "1–15/15", "1–20/25", "1–15/15", "1–6/6" — đúng bằng số trên tab, không phải số dòng '
  'của trang đang xem.'),
 ('Kiểm tra số trên tab đổi theo từ khóa và bộ lọc', 'Ghi lại số trên 5 tab', 'P',
  'Nhập từ khóa không khớp bản ghi nào: cả 5 tab về 0 (Tất cả 0 · Mới 0 · Đã đọc 0 · Đã tư vấn 0 · '
  'Lưu trữ 0). Xóa từ khóa, số trở lại 61/15/25/15/6.'),
 ('Kiểm tra số trên tab cập nhật sau khi đổi trạng thái', 'Ghi lại số của tab "Mới"', 'P',
  'Trước: Mới 15 · Đã đọc 26. Mở chi tiết 1 yêu cầu "Mới" (bản ghi QA tự tạo) rồi đóng khung: '
  'Mới 14 · Đã đọc 27 ngay, không cần bấm "Làm mới"; nhãn trên khung cũng đổi thành "Đã đọc".'),
 ('Kiểm tra màu nền số trên từng tab', 'Quan sát màu nền của con số', 'P',
  'Tất cả nền xanh dương đậm chữ trắng; Mới xanh dương nhạt; Đã đọc xanh lá nhạt; Đã tư vấn cam '
  'nhạt; Lưu trữ xám — 5 màu phân biệt được với nhau.'),
 ('Kiểm tra cột Mã YC', 'Xem cột "Mã YC" của các dòng', 'P',
  'Mã dạng "#YC0027", phông monospace 12px màu nhạt; 20 dòng trang 1 không có mã trùng; tải lại '
  'màn thì dãy mã giữ nguyên.'),
 ('Tìm theo Mã YC', 'Nhập đúng mã của 1 yêu cầu', 'P',
  'Nhập "YC0027" → đúng 1 kết quả #YC0027, chân bảng "Hiển thị 1–1 / 1 yêu cầu"; nhập "yc0027" '
  '(chữ thường) cũng ra đúng bản ghi đó.'),
 ('Tìm theo Mã YC có kèm dấu #', 'Nhập mã kèm dấu #', 'P',
  'Nhập "#YC0027" → vẫn đúng 1 kết quả #YC0027; hệ thống bỏ qua dấu #.'),
 ('Tìm theo một phần số của Mã YC', 'Nhập phần số của mã', 'P',
  'Nhập "0027" → 1 kết quả #YC0027, không báo lỗi.'),
 ('Kiểm tra mã YC của yêu cầu trên khung chi tiết', 'Ghi lại mã ở cột "Mã YC"', 'F',
  'LỖI: khung chi tiết chỉ hiện họ tên + nhãn trạng thái ("Cao Thị Bích Ngọc · Đã đọc"); dò toàn '
  'bộ nội dung khung không thấy chuỗi mã YC nào. Bảng đã có cột "Mã YC" nhưng chi tiết thì không '
  '→ mở chi tiết xong không biết đang xử lý yêu cầu mã nào để trao đổi nội bộ.'),
 ('Kiểm tra căn lề, chính tả của button', 'Quan sát nút "Phản hồi"', 'P',
  'Nút "Phản hồi" kèm biểu tượng mở liên kết ngoài, nằm cùng hàng với "Đã tư vấn" và "Lưu trữ" ở '
  'chân khung, chính tả đúng.'),
 ('Kiểm tra bấm Phản hồi mở trình soạn thư', 'Bấm "Phản hồi"', 'P',
  'Mở tab mới tới mail.google.com/mail/?view=cm&fs=1&to=<email người gửi>&su=Re: Yêu cầu tư vấn '
  'từ … (máy kiểm thử chưa đăng nhập Google nên dừng ở trang đăng nhập, tham số to/su vẫn đủ); '
  'thẻ có target=_blank rel="noopener noreferrer"; tab cũ giữ nguyên khung chi tiết đang mở.'),
 ('Kiểm tra ẩn nút Phản hồi với yêu cầu đã Lưu trữ', 'trạng thái "Lưu trữ"', 'P',
  'Mở chi tiết 1 yêu cầu "Lưu trữ": chân khung chỉ còn nút "Xóa"; không còn "Phản hồi" và '
  '"Lưu trữ". Trên bảng, icon thùng rác cũng chỉ hiện ở 6/6 dòng tab Lưu trữ, tab Mới có 0 icon.'),
 ('Kiểm tra bộ đếm ký tự ô Hình thức tư vấn', 'Gõ dần nội dung vào ô "Hình thức tư vấn"', 'P',
  'Mở hộp thoại "Xác nhận đã tư vấn": ô trống hiện "0/200"; gõ tới đâu bộ đếm tăng tới đó.'),
 ('Kiểm tra bộ đếm ký tự đếm theo ký tự tiếng Việt có dấu', 'Nhập đúng 10 ký tự tiếng Việt', 'P',
  'Nhập "Tiếng Việt" (10 ký tự hiển thị) → bộ đếm "10/200", không tính theo byte.'),
 ('Kiểm tra bộ đếm ký tự ô Ghi chú thêm', 'Gõ dần nội dung vào ô "Ghi chú thêm"', 'P',
  'Ô trống hiện "0/5000"; nhập ghi chú 82 ký tự → "82/5000".'),
 ('Kiểm tra Ghi chú thêm giữ nguyên xuống dòng', 'gồm 3–4 dòng có xuống dòng', 'P',
  'Trên bản ghi QA tự tạo: nhập ghi chú 3 dòng rồi "Xác nhận" → thông báo "Đã đánh dấu tư vấn". '
  'Mở lại chi tiết, nội dung nằm ở ô "Ghi chú nội bộ" và vẫn đủ 3 dòng, không bị dồn.'),
 ('Kiểm tra bộ đếm ký tự ô Ghi chú nội bộ', 'Gõ dần nội dung vào ô "Ghi chú nội bộ"', 'P',
  'Ô trống hiện "0/5000"; nhập "Tiếng Việt" (10 ký tự) → "10/5000".'),
 ('Kiểm tra Ghi chú nội bộ giữ nguyên xuống dòng', 'Nhập ghi chú gồm 3–4 dòng', 'P',
  'Trên bản ghi QA tự tạo: lưu ghi chú 3 dòng → "Đã lưu ghi chú"; đóng và mở lại chi tiết, nội '
  'dung vẫn đủ 3 dòng.'),
 ('Kiểm tra căn lề, chính tả của button', 'Quan sát nút "Lưu ghi chú"', 'P',
  'Nút "Lưu ghi chú" kèm biểu tượng lưu, nền màu chủ đạo, căn trái ngay dưới ô nhập; khi chưa sửa '
  'gì thì mờ (disabled, opacity 0.5).'),
 ('Kiểm tra nút Export Excel khi danh sách rỗng', 'bảng không còn yêu cầu nào', 'P',
  'Lọc ra 0 kết quả ("Không tìm thấy yêu cầu nào"): nút "Export Excel" ở trạng thái vô hiệu '
  '(disabled, opacity 0.5), bấm không có phản ứng, không tải tệp rỗng.'),
]

SUA = [
 ('Kiểm tra các cột danh sách', 'Quan sát tiêu đề bảng', 'P',
  'Tiêu đề bảng đúng bộ mới: Mã YC · Người liên hệ · Đơn vị · Tỉnh · Bậc học · Quan tâm · '
  'Thông tin liên hệ · Ngày, kèm 1 cột thao tác không có tiêu đề.'),
 ('Kiểm tra chấm màu trạng thái trên dòng', 'Xem yêu cầu ở 4 trạng thái', 'P',
  'Không còn cột "Trạng thái" riêng. Chấm tròn trước họ tên: tab Mới xanh dương, Đã đọc xám nhạt, '
  'Đã tư vấn xanh lá, Lưu trữ xám đậm — phân biệt được 4 trạng thái.'),
 ('Kiểm tra thông tin trống của 1 dòng', 'không có Chức vụ hoặc Đơn vị', 'P',
  'Bản ghi QA tự tạo thiếu chức vụ/đơn vị/tỉnh/bậc học/quan tâm: 5 ô đều hiện dấu "—", dòng không '
  'vỡ bố cục.'),
 ('Kiểm tra bản ghi không lặp giữa các trang', 'Ghi lại mã YC của các dòng ở trang 1', 'P',
  'Bảng không có cột số thứ tự. Trang 1 bắt đầu #YC0064, trang 2 bắt đầu #YC0039; đối chiếu 2 '
  'trang không có mã nào trùng nhau, thứ tự vẫn mới nhất trước.'),
 ('Kiểm tra chặn mở trang ngoài phạm vi', 'Màn không có ô nhập số trang', 'P',
  'Màn chỉ có « ‹ "Trang 2 / 4" › » — không có ô nhập số trang. Gọi dịch vụ danh sách với '
  'page=999 → 200, total 61, trả về 0 dòng; page=0 → trả về trang 1 (20 dòng); màn vẫn đứng ở '
  '"Trang 2 / 4", không báo lỗi hệ thống.'),
 ('Kiểm tra giá trị mặc định', 'Quan sát ô tìm kiếm khi mới vào', 'P',
  'Ô để trống, gợi ý đúng "Tìm theo tên, email, đơn vị, SĐT, mã YC...".'),
 ('Kiểm tra nhập số', 'Nhập chuỗi chỉ gồm chữ số vào ô "Tìm theo tên, email, đơn vị, SĐT, mã YC"',
  'P', 'Nhập "12345" → 2 kết quả (#YC0005, #YC0001) khớp phần số điện thoại; không phát sinh lỗi.'),
 ('Kiểm tra nhập dữ liệu là chữ tiếng Việt có dấu',
  'Nhập vào ô "Tìm theo tên, email, đơn vị, SĐT, mã YC" chuỗi tiếng Việt', 'P',
  'Nhập "Nguyễn" → 19 kết quả, từ khóa hiển thị lại đủ dấu, không lỗi phông chữ.'),
 ('Kiểm tra nhập dữ liệu rất dài', 'Dán vào ô "Tìm theo tên, email, đơn vị, SĐT, mã YC"', 'P',
  'Dán 500 ký tự: ô nhận đủ 500 ký tự, thanh lọc không vỡ, kết quả "Không tìm thấy yêu cầu nào", '
  'không có lỗi hệ thống.'),
 ('Kiểm tra ô tìm kiếm không bắt buộc nhập', 'Xóa trống ô', 'P',
  'Xóa trắng rồi Enter: không báo lỗi bắt buộc, danh sách trở lại đủ 58 yêu cầu theo bộ lọc còn lại.'),
 ('Kiểm tra tìm bằng địa chỉ thư điện tử đầy đủ', 'địa chỉ thư điện tử hợp lệ', 'P',
  'Nhập "cao.thi.bich.ngoc15@thpt.edu.vn" → đúng 1 kết quả #YC0027; không báo lỗi định dạng.'),
 ('Kiểm tra tìm bằng địa chỉ thư điện tử dùng chung nhiều yêu cầu', 'đã có trong hệ thống', 'P',
  'Nhập địa chỉ đã có trong hệ thống → trả về đúng (các) yêu cầu dùng địa chỉ đó; ô tìm kiếm '
  'không kiểm tra trùng nên không báo "đã tồn tại".'),
 ('Kiểm tra tìm bằng chuỗi dài hơn 64 ký tự trước dấu @', 'dài hơn 64 ký tự', 'P',
  'Nhập 70 ký tự + "@a.vn" → "Không tìm thấy yêu cầu nào"; không báo lỗi định dạng, coi như từ '
  'khóa thường.'),
 ('Kiểm tra nhập Hình thức tư vấn vượt 200 ký tự', 'chuỗi dài hơn 200 ký tự', 'P',
  'Dán 201 ký tự: ô vẫn nhận đủ, viền ô chuyển đỏ, bộ đếm "201/200" màu đỏ, hiện dòng "Hình thức '
  'tư vấn tối đa 200 ký tự", nút "Xác nhận" mờ (disabled, opacity 0.5) — không lưu được.'),
 ('Kiểm tra Hình thức tư vấn nhập trong độ dài cho phép', 'dài đúng 200 ký tự', 'P',
  'Trên bản ghi QA tự tạo: nhập đúng 200 ký tự, bộ đếm "200/200" màu thường, "Xác nhận" thành '
  'công ("Đã đánh dấu tư vấn"); mở lại chi tiết, khối "Đã tư vấn" hiện Hình thức đủ 200 ký tự, '
  'không bị cắt.'),
 ('Kiểm tra nhập Ghi chú thêm vượt 5000 ký tự', 'chuỗi dài hơn 5000 ký tự', 'P',
  'Dán 5001 ký tự vào "Ghi chú thêm": bộ đếm "5001/5000", hiện dòng "Ghi chú tối đa 5000 ký tự", '
  'nút "Xác nhận" mờ, không lưu được.'),
 ('Kiểm tra nhập Ghi chú nội bộ vượt 5000 ký tự', 'chuỗi dài hơn 5000 ký tự', 'P',
  'Dán 5001 ký tự: viền ô đỏ, bộ đếm "5001/5000" màu đỏ, hiện dòng "Ghi chú tối đa 5000 ký tự", '
  'nút "Lưu ghi chú" mờ (disabled) — không lưu được.'),
]


def find(tc, kb, kc):
    hit = [r for r in tc.order
           if r >= 12 and tc.c(r, 'C') and kb in (tc.c(r, 'B') or '') and kc in (tc.c(r, 'C') or '')]
    if len(hit) != 1:
        sys.exit('DỪNG: khóa "%s" / "%s" khớp %d dòng %s' % (kb, kc, len(hit), hit))
    return hit[0]


def main(apply=False):
    for path in FILES:
        lock = os.path.join(os.path.dirname(path), '.~lock.%s#' % os.path.basename(path))
        if os.path.exists(lock):
            sys.exit('DỪNG: file đang mở trong LibreOffice → %s' % lock)

    for path in FILES:
        thucong = 'thu-cong' in path
        tc = tcfix.load(path)
        plan = []                       # (row, col, value)
        for kb, kc, mark, note in MOI:
            rn = find(tc, kb, kc)
            plan.append((rn, 'F', mark))
            plan.append((rn, 'T', L + note))
        for kb, kc, mark, note in SUA:
            rn = find(tc, kb, kc)
            plan.append((rn, 'F', mark))
            plan.append((rn, 'T', L + '(case sửa theo giao diện mới) ' + note))
            if thucong:
                plan.append((rn, 'G', ''))     # bỏ kết quả người chạy trên nội dung CŨ
        rows = sorted({r for r, _, _ in plan})
        nP = sum(1 for _, c, v in plan if c == 'F' and v == 'P')
        nF = sum(1 for _, c, v in plan if c == 'F' and v == 'F')
        print('%-58s %d dòng · %dP · %dF%s'
              % (os.path.basename(os.path.dirname(path)), len(rows), nP, nF,
                 ' · xóa %d ô G' % len(SUA) if thucong else ''))
        if not apply:
            continue
        sheet = tc.sheet
        for rn, col, val in plan:
            cm = re.search(r'<c r="%s%d"[^>]*?(?:/>|>.*?</c>)' % (col, rn), sheet, re.S)
            if not cm:
                sys.exit('DỪNG: không thấy ô %s%d' % (col, rn))
            st = re.search(r's="(\d+)"', cm.group(0))
            st = st.group(1) if st else '0'
            new = ('<c r="%s%d" s="%s"/>' % (col, rn, st) if val == '' else
                   '<c r="%s%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
                   % (col, rn, st, tcfix.esc(val)))
            sheet = sheet.replace(cm.group(0), new, 1)
        z = zipfile.ZipFile(path)
        tmp = path + '.tmp'
        with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
            for it in z.infolist():
                out.writestr(it, sheet.encode() if it.filename == tc.tcf else z.read(it.filename))
        z.close()
        os.replace(tmp, path)
        print('      ĐÃ GHI')
    return 0


if __name__ == '__main__':
    sys.exit(main('--apply' in sys.argv))

# -*- coding: utf-8 -*-
"""BƯỚC A6 của màn "Vị trí lưu trữ" — phần tool KHÔNG làm thay được.

HDSD §3 A6: sau khi khung đã sạch 13 bộ rà, phải sửa TAY cột C/D theo dữ kiện đã ground
(thông báo verbatim · giới hạn thật · hành vi thật của FE) và gắn cờ cho chỗ chưa chốt được.
Script này chỉ ghi ĐÈ cột C/D/T của những dòng đã liệt kê — KHÔNG thêm/xoá/đổi tên case, nên
mã case và lớp công thức không đổi. Chạy lại được nhiều lần (idempotent).

Căn cứ: hồ sơ màn `Testcase-Role-ChuyenVien-ViTriLuuTru.json` khoá `grounding`
(chunk FE TargetsPage-DPZDuHeU.js + TKCT §13 UC-QLKB-04 + probe_live 2026-09-10 + ảnh màn thật).

    python3 a6-ViTriLuuTru.py            # XEM TRƯỚC
    python3 a6-ViTriLuuTru.py --apply    # ghi
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def _tim_tools():
    """Tìm thư mục `tools` — KHÔNG đoán cứng `../../../tools`.

    Bộ case có thể đặt NGOÀI repo (`QA_TESTCASE_DIR` cho phép), lúc đó đường cứng trỏ ra chỗ
    không có `tools` và script chết ngay bước A6 với `ModuleNotFoundError: tcfix` — dính
    2026-09-12 khi chạy thử chuỗi sinh vào thư mục khác. Đi NGƯỢC lên từ chính file này, rồi
    từ thư mục làm việc, tìm nơi thật sự có `tcfix.py`.
    """
    for goc in (HERE, os.getcwd()):
        d = goc
        for _ in range(6):
            ung = os.path.join(d, 'tools')
            if os.path.exists(os.path.join(ung, 'tcfix.py')):
                return ung
            if os.path.exists(os.path.join(d, 'tcfix.py')):
                return d
            d = os.path.dirname(d)
    raise SystemExit('KHÔNG tìm thấy thư mục `tools` (chứa tcfix.py) — đặt QA_TOOLS hoặc chạy '
                     'từ trong repo.')


sys.path.insert(0, os.environ.get('QA_TOOLS') or _tim_tools())
import tcfix                                                        # noqa: E402
import qalib                                                        # noqa: E402

XLSX = os.path.join(HERE, '..', 'testcase', 'Testcase-Role-ChuyenVien-ViTriLuuTru.xlsx')

V = '✿✿ [CẦN VERIFY] '
M = '✿✿ [YÊU CẦU MONG ĐỢI] '
R = '✿✿ [RỦI RO] '
L = '✿✿ [Lệch BA - theo Code] '

# Ba cụm dùng lại nhiều lần
T_QUYEN = (R + 'Mọi mục điều hướng của ứng dụng đều khai quyền "không giới hạn" nên giao diện '
           'KHÔNG chặn vai trò nào; nếu máy chủ cũng không chặn thì đây là lỗ hổng phân quyền. '
           'Cần QA/BA + dev xác nhận lưới chắn phía máy chủ.')
T_DAIDB = (V + 'Giao diện chỉ chặn 250 ký tự bằng thuộc tính của ô nhập, không có luật độ dài '
           'riêng; giới hạn thật của cột dữ liệu chưa được xác nhận.')

# {dòng: (cột C hoặc None, cột D hoặc None, cột T hoặc None)}
SUA = {}

# ══════════════════════ CN DANH SÁCH VỊ TRÍ LƯU TRỮ ══════════════════════
# ── 4 thẻ số liệu: đếm trên TOÀN BỘ danh sách máy chủ trả về theo bộ lọc đang áp ──
_THE = [
    (22, 'TỔNG VỊ TRÍ LƯU TRỮ', 'tổng số vị trí lưu trữ', None),
    (27, 'HOẠT ĐỘNG', 'số vị trí lưu trữ đang ở trạng thái Hoạt động', 'Hoạt động'),
    (32, 'CHỜ KẾT NỐI', 'số vị trí lưu trữ đang ở trạng thái Chờ kết nối', 'Chờ kết nối'),
    (37, 'NGỪNG HOẠT ĐỘNG', 'số vị trí lưu trữ đang ở trạng thái Ngừng hoạt động',
     'Ngừng hoạt động'),
]
for _g, _nhan, _y, _tt in _THE:
    SUA[_g + 1] = (
        '1. Mở màn Vị trí lưu trữ, chưa lọc và chưa tìm kiếm gì.\n'
        '2. Đọc nhãn và giá trị trên thẻ "%s".' % _nhan,
        'Thẻ hiện nhãn "%s" viết in hoa kèm một con số nguyên; nhãn đúng chính tả, '
        'giá trị không kèm đơn vị nào khác.' % _nhan, None)
    if _tt is None:
        SUA[_g + 2] = (
            '1. Đọc con số trên thẻ "%s".\n'
            '2. Đối chiếu với "Tổng số bản ghi:" ở thanh phân trang khi chưa áp bộ lọc nào.'
            % _nhan,
            'Hai con số bằng nhau và bằng %s máy chủ trả về; thẻ này bằng tổng của ba thẻ '
            '"HOẠT ĐỘNG" + "CHỜ KẾT NỐI" + "NGỪNG HOẠT ĐỘNG".' % _y, None)
    else:
        SUA[_g + 2] = (
            '1. Đọc con số trên thẻ "%s".\n'
            '2. Lọc "-- Chọn trạng thái --" = %s rồi đọc "Tổng số bản ghi:" ở thanh phân trang.'
            % (_nhan, _tt),
            'Hai con số bằng nhau: thẻ đếm đúng %s.' % _y, None)
    SUA[_g + 3] = (
        '1. Chuẩn bị dữ liệu không còn vị trí lưu trữ nào thuộc nhóm của thẻ "%s".' % _nhan,
        'Thẻ "%s" hiện số 0, không để trống và không hiện dấu gạch.' % _nhan, None)
    SUA[_g + 4] = (
        '1. Chuẩn bị danh sách rất nhiều bản ghi (từ 1000 trở lên) thuộc nhóm của thẻ "%s".\n'
        '2. Quan sát con số trên thẻ và độ rộng của cả bốn thẻ.' % _nhan,
        'Số lớn hiển thị trọn vẹn trong thẻ, không tràn và không đẩy lệch ba thẻ bên cạnh; '
        'bốn thẻ vẫn chia đều chiều ngang.', None)

SUA.update({
# ── Button Làm mới dữ liệu (bank Tải lại, 6 case) ──
43: ('1. Mở màn Vị trí lưu trữ.\n'
     '2. Tìm nút tròn có biểu tượng mũi tên xoay ở cuối thanh lọc, bên phải ô "Sắp xếp".\n'
     '3. Rê chuột lên nút để đọc chú thích.',
     '1. Nút nằm đúng cuối thanh lọc, phía bên phải màn hình, ngay sau ô "Sắp xếp".\n'
     '2. Chú thích hiện đúng chữ "Làm mới dữ liệu".', None),
44: ('1. Mở màn Vị trí lưu trữ, chưa lọc và chưa tìm kiếm gì.\n'
     '2. Ghi lại dòng chữ "Cập nhật: ..." nằm bên phải, ngay dưới thanh lọc.\n'
     '3. Bấm nút "Làm mới dữ liệu".',
     '1. Danh sách được lấy lại mới nhất từ hệ thống.\n'
     '2. Hiện thông báo nổi "Đã làm mới".\n'
     '3. Dòng "Cập nhật: ..." đổi sang thời điểm vừa bấm, theo dạng ngày/tháng/năm giờ:phút.',
     None),
45: ('1. Chọn "-- Chọn loại db --" và "-- Chọn trạng thái --", nhập từ khoá vào ô '
     '"Tìm kiếm name, tên hiển thị..." rồi chờ danh sách lọc xong.\n'
     '2. Bấm nút "Làm mới dữ liệu".',
     '1. Danh sách được lấy lại mới nhất nhưng VẪN giữ nguyên giá trị đang chọn ở hai ô lọc, '
     'từ khoá đang tìm và thứ tự sắp xếp đang áp.\n'
     '2. Hiện thông báo nổi "Đã làm mới".', None),
46: ('1. Để danh sách có nhiều trang, chuyển sang trang 2 và đổi số bản ghi/trang khác 20.\n'
     '2. Bấm nút "Làm mới dữ liệu".',
     'Hệ thống tải lại dữ liệu và giữ người dùng ở đúng trang 2 cùng số bản ghi/trang đang '
     'chọn; không nhảy về trang 1.', None),
47: ('1. Bấm nút "Làm mới dữ liệu".\n'
     '2. Quan sát biểu tượng trên nút và bảng dữ liệu trong lúc chờ phản hồi.',
     '1. Biểu tượng trên nút xoay tròn, các bản ghi tạm thay bằng ba vạch xám nhấp nháy.\n'
     '2. Nút bị vô hiệu trong lúc đang tải nên bấm liên tục không gửi thêm yêu cầu nào.',
     None),
48: ('1. Ngắt kết nối mạng của thiết bị.\n'
     '2. Bấm nút "Làm mới dữ liệu".',
     '1. Hiện thông báo "Bạn đang ngoại tuyến" kèm dòng "Không thể kết nối đến máy chủ. Một số '
     'dữ liệu có thể không được cập nhật. Vui lòng kiểm tra kết nối internet và thử lại."\n'
     '2. Dữ liệu cũ trên màn KHÔNG bị xoá trắng.', None),
# ── Button Bỏ chọn ──
50: ('1. Tích chọn ít nhất một bản ghi để thanh hành động hàng loạt hiện ra.\n'
     '2. Quan sát nút "Bỏ chọn" nằm cạnh nút "Xóa tất cả".',
     'Nút ghi đúng chữ "Bỏ chọn", không sai chính tả, chữ trong nút được căn giữa và thẳng '
     'hàng với dòng "Đã chọn {N} mục".', None),
# ── Danh sách vị trí lưu trữ (bảng, 8 case) ──
52: ('1. Kiểm tra căn lề dữ liệu trong bảng.\n'
     '2. Di chuyển con trỏ chuột vào một bản ghi.\n'
     '3. Kiểm tra bố cục trong bảng danh sách.\n'
     '4. Rê chuột vào các biểu tượng ở cột Hành động.\n'
     '5. Bỏ chuột khỏi các biểu tượng.',
     '1. Chữ căn lề trái; số căn lề phải; cột STT căn giữa; tiêu đề cột căn theo dữ liệu '
     'phía dưới.\n'
     '2. Màu nền của bản ghi đó thay đổi.\n'
     '3. Các cột xếp từ trái qua phải đúng thứ tự STT · ô tích chọn · Code · Tên hiển thị · '
     'Loại DB · Phiên bản · Port · Trạng thái · Tags · Hành động; cột Hành động ở cuối bảng và '
     'được ghim lại khi cuộn ngang, hàng tiêu đề được ghim khi cuộn dọc; phân trang và '
     '"Tổng số bản ghi:" đặt ở cuối bảng.\n'
     '4. Hiện chú thích đúng tên tương ứng với chức năng.\n'
     '5. Bỏ chuột khỏi biểu tượng, chú thích mất đi.', None),
53: ('1. Đối chiếu tiêu đề từng cột của bảng với nhãn ô tương ứng trong biểu mẫu Thêm mới.\n'
     '2. Kiểm chính tả và cách viết hoa của từng tiêu đề cột.',
     '1. Bảng có đúng 9 cột: STT · Code · Tên hiển thị · Loại DB · Phiên bản · Port · '
     'Trạng thái · Tags · Hành động (cột ô tích chọn không có tiêu đề chữ).\n'
     '2. Không sai chính tả, không viết tắt lạ.', None),
54: ('1. Lọc hoặc tìm kiếm sao cho không còn bản ghi nào khớp.',
     'Bảng hiện biểu tượng máy chủ mờ kèm dòng chữ "Chưa có target nào" và nút '
     '"+ Thêm vị trí lưu trữ mới"; không hiện bảng trống không có chú thích.', None),
55: ('1. Đếm số bản ghi đang hiển thị trên trang.\n'
     '2. Đối chiếu với "Tổng số bản ghi:" ở thanh phân trang và với thẻ "TỔNG VỊ TRÍ LƯU TRỮ".',
     'Số bản ghi trên trang đúng bằng số bản ghi/trang đang chọn (trang cuối thì bằng phần '
     'còn lại); "Tổng số bản ghi:" và thẻ "TỔNG VỊ TRÍ LƯU TRỮ" khớp nhau.', None),
56: ('1. Đối chiếu từng giá trị với tiêu đề cột tương ứng.\n'
     '2. Xem một bản ghi chưa khai Phiên bản, Port và Tags.',
     '1. Dữ liệu hiển thị đúng cột, không xộc xệch; cột Trạng thái hiện thẻ màu đúng ba mức '
     'Chờ kết nối (vàng) · Hoạt động (xanh) · Ngừng hoạt động (xám).\n'
     '2. Ô Phiên bản, Port và Tags không có giá trị thì hiện dấu "—".', None),
57: ('1. Quan sát độ rộng từng cột trong 9 cột của bảng.',
     'Độ rộng các cột phù hợp với dữ liệu, không quá hẹp hay quá thừa; cột Hành động đủ chỗ '
     'cho tối đa 4 biểu tượng trên một bản ghi.', None),
58: ('1. Chuẩn bị bản ghi có Code và Tên hiển thị dài 250 ký tự, kèm nhiều thẻ ở cột Tags.\n'
     '2. Xem bản ghi đó trên danh sách.',
     'Hiển thị không bị tràn cột, không đẩy lệch các cột khác; bảng cuộn ngang khi cần và cột '
     'Hành động vẫn được ghim lại.', None),
59: ('1. Bấm lần lượt từng biểu tượng ở cột Hành động của một bản ghi.',
     'Mọi thao tác đều mở TẠI CHỖ bằng hộp thoại (Chi tiết target · Thêm/Sửa · Xóa target?) '
     'hoặc thực hiện ngay tại chỗ (Kích hoạt · Ngừng hoạt động); địa chỉ trang KHÔNG đổi và '
     'không chuyển sang màn khác.', None),
# ── Checkbox bản ghi ──
61: ('1. Mở màn danh sách, xem cột ô tích chọn.\n'
     '2. Đối chiếu với cột Trạng thái của từng bản ghi.',
     '1. Mọi ô tích chọn đều đang bỏ trống; thanh hành động hàng loạt chưa hiện.\n'
     '2. Chỉ bản ghi KHÁC "Hoạt động" mới có ô tích chọn; bản ghi "Hoạt động" bỏ trống ô này, '
     'không tích được.', None),
62: ('1. Tích vào ô tích chọn của một bản ghi Chờ kết nối hoặc Ngừng hoạt động.',
     '1. Ô tích chọn của bản ghi đó được tích.\n'
     '2. Thanh hành động hiện lên phía trên bảng gồm dòng "Đã chọn 1 mục", nút "Xóa tất cả" '
     'chữ đỏ và nút "Bỏ chọn".', None),
63: ('1. Tích chọn một bản ghi.\n2. Bỏ tích chính bản ghi đó.',
     '1. Ô tích chọn trở về trạng thái trống.\n'
     '2. Thanh hành động hàng loạt ẩn đi khi không còn bản ghi nào được chọn.', None),
64: ('1. Trang đang xem có cả bản ghi Hoạt động lẫn bản ghi khác Hoạt động.\n'
     '2. Tích vào ô tích chọn ở hàng tiêu đề của bảng.',
     'Chỉ các bản ghi KHÁC "Hoạt động" của trang đang xem được tích; bản ghi "Hoạt động" không '
     'bị tích. Số trên thanh hành động bằng đúng số bản ghi vừa được tích.', None),
65: ('1. Tích ô tích chọn ở hàng tiêu đề.\n2. Bỏ tích ô tích chọn ở hàng tiêu đề.',
     'Toàn bộ ô tích chọn trở về trạng thái trống; thanh hành động hàng loạt ẩn đi.', None),
66: ('1. Tích chọn vài bản ghi ở trang 1.\n2. Chuyển sang trang 2.\n3. Quay lại trang 1.',
     'Ô tích chọn ở hàng tiêu đề chỉ gom bản ghi CỦA TRANG ĐANG XEM. Ghi rõ hệ thống giữ hay '
     'bỏ lựa chọn khi đổi trang; số trên "Đã chọn {N} mục" phải khớp với số bản ghi thực sự sẽ '
     'bị xoá khi bấm "Xóa tất cả".',
     R + 'Ô tích ở hàng tiêu đề chỉ chọn bản ghi của trang đang xem — người dùng dễ tưởng đã '
     'chọn hết toàn bộ kết quả lọc rồi bấm "Xóa tất cả".'),
# ── Icon (10 case) ──
68: ('1. Quan sát các biểu tượng ở cột Hành động trên từng bản ghi.\n'
     '2. Đối chiếu với trạng thái của bản ghi đó.',
     'Biểu tượng đúng nghĩa với chức năng: con mắt = Xem chi tiết, nút tam giác = Kích hoạt, '
     'hai vạch dừng = Ngừng hoạt động, cây bút = Chỉnh sửa, thùng rác = Xóa. Bản ghi "Hoạt '
     'động" chỉ có Xem chi tiết và Ngừng hoạt động; bản ghi "Hoạt động" đang được sử dụng chỉ '
     'có Xem chi tiết; bản ghi khác "Hoạt động" có Xem chi tiết · Kích hoạt · Chỉnh sửa · Xóa.',
     None),
70: ('1. Rê chuột lên từng biểu tượng ở cột Hành động.\n2. Đưa chuột ra khỏi biểu tượng.',
     'Chú thích hiện đúng một trong các chữ "Xem chi tiết" · "Kích hoạt" · "Ngừng hoạt động" · '
     '"Chỉnh sửa" · "Xóa" và biến mất ngay khi con trỏ rời đi.', None),
72: ('1. Đọc chú thích của từng biểu tượng ở cột Hành động.',
     'Chú thích ghi đúng "Xem chi tiết" · "Kích hoạt" · "Ngừng hoạt động" · "Chỉnh sửa" · '
     '"Xóa"; đủ nghĩa để hiểu chức năng, không sai chính tả.', None),
# ── Textbox Số bản ghi trên trang ──
79: ('1. Mở màn, xem ô nhập trước chữ "Số bản ghi/trang:" ở cuối danh sách.',
     'Ô hiện sẵn số 20.', None),
80: ('1. Nhập chữ hoặc ký tự đặc biệt vào ô "Số bản ghi/trang:".\n'
     '2. Nhập tiếp một số có phần thập phân, ví dụ 1.5, rồi bấm ra ngoài ô.',
     '1. Ô chỉ nhận chữ số và dấu chấm; chữ và ký tự đặc biệt bị bỏ ngay khi gõ.\n'
     '2. Nhập 1.5 rồi rời ô thì hiện dòng chữ đỏ "Số bản ghi/trang phải là số nguyên" ngay '
     'phía trên ô; ô viền đỏ và danh sách giữ nguyên số bản ghi/trang cũ.', None),
81: ('1. Nhập dấu trừ rồi nhập số vào ô "Số bản ghi/trang:".\n2. Rời khỏi ô.',
     'Dấu trừ bị bỏ ngay khi gõ nên không nhập được số âm.', None),
82: ('1. Xoá trống ô "Số bản ghi/trang:" hoặc nhập 0.\n2. Rời khỏi ô.',
     'Hiện dòng chữ đỏ "Số bản ghi/trang phải lớn hơn 0" ngay phía trên ô; ô viền đỏ và danh '
     'sách giữ nguyên số bản ghi/trang cũ.', None),
83: ('1. Nhập một giá trị lớn hơn 1000 (ví dụ 1500) vào ô "Số bản ghi/trang:".\n'
     '2. Rời khỏi ô.',
     'Hiện thông báo nổi "Số bản ghi/trang tối đa 1000 bản ghi"; ô tự trả về giá trị đang áp '
     'trước đó.', None),
84: ('1. Nhập đúng một trong các mức có sẵn (20, 50, 100, 200, 500) vào ô "Số bản ghi/trang:".\n'
     '2. Mở nút "Chọn nhanh số bản ghi" bên cạnh.',
     'Mức tương ứng trong danh sách chọn nhanh được tô đậm và đổi màu; danh sách hiển thị đúng '
     'số bản ghi vừa nhập.', None),
85: ('1. Nhập một giá trị không khớp mức nào (ví dụ 37) vào ô "Số bản ghi/trang:".\n'
     '2. Mở nút "Chọn nhanh số bản ghi" bên cạnh.',
     'Danh sách hiển thị đúng 37 bản ghi mỗi trang; không mức nào trong danh sách chọn nhanh '
     'được tô đậm.', None),
86: ('1. Nhập một giá trị nhỏ hơn tổng số bản ghi hiện có vào ô "Số bản ghi/trang:".',
     'Trang đầu hiện đúng số bản ghi đã nhập và thanh phân trang hiện đủ các nút chuyển trang.',
     None),
87: ('1. Nhập một giá trị lớn hơn tổng số bản ghi hiện có vào ô "Số bản ghi/trang:".',
     'Toàn bộ bản ghi hiện trên một trang; cụm nút chuyển trang bị ẩn vì chỉ còn 1 trang.',
     None),
88: ('1. Nhập giá trị bằng đúng "Tổng số bản ghi:" đang hiển thị.',
     'Toàn bộ bản ghi hiện trên một trang duy nhất; cụm nút chuyển trang bị ẩn.', None),
# ── Selectbox Số bản ghi trên trang ──
90: ('1. Mở màn, bấm nút "Chọn nhanh số bản ghi" ở cuối danh sách.',
     'Mức 20 đang được tô đậm — đúng giá trị mặc định của màn.', None),
91: ('1. Bấm nút "Chọn nhanh số bản ghi".',
     'Danh sách hiện đúng 5 mức 20 · 50 · 100 · 200 · 500; chỉ chọn được một mức, chọn xong '
     'danh sách tự đóng.', None),
92: ('1. Chọn mức nhỏ hơn tổng số bản ghi (ví dụ 20 khi có nhiều hơn 20 bản ghi).',
     'Trang đầu hiện đúng số bản ghi đã chọn và thanh phân trang hiện đủ các nút chuyển trang; '
     'danh sách quay về trang 1.', None),
93: ('1. Chọn mức lớn hơn tổng số bản ghi (ví dụ 500 khi chỉ có 15 bản ghi).',
     'Toàn bộ bản ghi hiện trên một trang; cụm nút chuyển trang bị ẩn.', None),
94: ('1. Chọn mức bằng đúng "Tổng số bản ghi:" đang hiển thị.',
     'Toàn bộ bản ghi hiện trên một trang duy nhất; cụm nút chuyển trang bị ẩn.', None),
# ── Phân trang: GIỮ NGUYÊN bản chữ của mẫu (bank PAGING_YCHANG), chỉ gắn cờ chỗ lệch màn ──
103: (None, None,
      L + 'Bản chữ của mẫu nhắc ô "Nhập số trang" — màn Vị trí lưu trữ KHÔNG bật ô này '
      '(probe_live 2026-09-10: ô "Nhập số trang": không). Bỏ qua ý đó khi chạy.'),
104: (None, None,
      L + 'Bản chữ của mẫu nhắc ô "Nhập số trang" — màn Vị trí lưu trữ KHÔNG bật ô này '
      '(probe_live 2026-09-10: ô "Nhập số trang": không). Bỏ qua ý đó khi chạy.'),
# ── Chức năng Danh sách ──
112: ('1. Mở màn Vị trí lưu trữ, để nguyên "Sắp xếp" ở mức mặc định "Mới nhất trước".\n'
      '2. Ghi lại các bản ghi đang hiển thị và thứ tự của chúng.\n'
      '3. Đối chiếu với dữ liệu đang lưu:\n'
      'select * from <bảng vị trí lưu trữ>\n'
      'where deleted_at is null\n'
      'order by created_at desc;',
      'Số bản ghi và từng cột Code · Tên hiển thị · Loại DB · Phiên bản · Port · Trạng thái · '
      'Tags khớp chính xác với dữ liệu đang lưu; thứ tự mặc định là mới nhất lên trước.', None),
# ── ATTT màn danh sách: FE KHÔNG gác quyền -> ghi đúng hành vi thật + gắn cờ ──
115: ('1. Đăng nhập tài khoản thuộc nhóm chuyên viên nghiệp vụ dữ liệu nhưng CHƯA được cấp '
      'quyền nào với dữ liệu.\n'
      '2. Mở màn Vị trí lưu trữ bằng menu và bằng gõ thẳng địa chỉ.\n'
      '3. Ghi lại đúng những gì màn hiển thị.',
      '1. Kết quả MONG ĐỢI: hệ thống chặn, hiện "Không đủ quyền truy cập" kèm dòng "Bạn không '
      'có quyền truy cập trang này. Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là sự '
      'nhầm lẫn.", không gọi và không để lộ dữ liệu nào.\n'
      '2. Ghi lại hành vi THẬT quan sát được: nếu màn vẫn mở và vẫn tải đủ danh sách thì đánh '
      'trượt và ghi rõ vào cột kết quả thực tế.', T_QUYEN),
116: ('1. Đăng nhập tài khoản KHÁC vai trò (Lãnh đạo Bộ / Đơn vị nguồn / Sở GD&ĐT / '
      'Trường học / Tổ chức ngoài).\n'
      '2. Mở thẳng màn Vị trí lưu trữ bằng địa chỉ trang.',
      '1. Kết quả MONG ĐỢI: hệ thống chặn, hiện "Không đủ quyền truy cập"; không để lộ dữ liệu '
      'của nhóm chuyên viên nghiệp vụ dữ liệu.\n'
      '2. Ghi lại hành vi THẬT: nếu mọi tài khoản đăng nhập đều vào và thao tác được như nhau '
      'thì đánh trượt và ghi rõ vào cột kết quả thực tế.', T_QUYEN),
120: ('1. Để phiên đăng nhập hết hạn.\n2. Bấm chuyển trang danh sách hoặc bấm "Làm mới dữ liệu".',
      'Hiện thông báo "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." và điều hướng về '
      'màn đăng nhập; không trả về dữ liệu.', None),
114: ('1. Khi chưa đăng nhập (hoặc vừa đăng xuất), mở thẳng màn Vị trí lưu trữ bằng cách gõ '
      'địa chỉ trang.',
      'Hiện thông báo "Bạn cần đăng nhập để truy cập trang này. Vui lòng đăng nhập bằng tài '
      'khoản của bạn để tiếp tục." và điều hướng về màn đăng nhập; không hiển thị bất kỳ nội '
      'dung nào của màn.', None),
})

# ══════════════════ CN TÌM KIẾM & LỌC VỊ TRÍ LƯU TRỮ ══════════════════
_LIETKE_TK = (
    '1. [Danh sách chọn] Loại DB\n'
    '   chữ gợi ý "-- Chọn loại db --", chọn được NHIỀU giá trị\n'
    '2. [Danh sách chọn] Trạng thái\n'
    '   chữ gợi ý "-- Chọn trạng thái --", chọn MỘT trong "Chờ kết nối" · "Hoạt động" · '
    '"Ngừng hoạt động"\n'
    '3. [Trường nhập] Tìm kiếm name, tên hiển thị\n'
    '   chữ gợi ý "Tìm kiếm name, tên hiển thị..."\n'
    '4. [Danh sách chọn] Sắp xếp\n'
    '   mặc định "Mới nhất trước", lựa chọn còn lại là "Cũ nhất trước"\n'
    '   (bên phải ô Sắp xếp là nút tròn có chú thích "Làm mới dữ liệu")')
SUA.update({
124: ('1. Mở màn Vị trí lưu trữ.\n'
      '2. Đối chiếu từng thành phần trên thanh lọc, từ trái qua phải:\n' + _LIETKE_TK,
      'Hiển thị màn hình chức năng bao gồm các thông tin:\n' + _LIETKE_TK, None),
# ── Selectbox Loại DB (ô chọn NHIỀU giá trị, 13 case) ──
132: ('1. Mở màn, xem ô lọc đầu tiên trên thanh lọc khi chưa chọn gì.',
      'Ô trống, hiện chữ gợi ý "-- Chọn loại db --"; chưa có bộ lọc nào được áp và danh sách '
      'hiện đủ mọi vị trí lưu trữ.', None),
133: ('1. Bấm mở ô "-- Chọn loại db --".\n'
      '2. Đối chiếu danh sách lựa chọn với danh mục Loại lưu trữ đang khai báo trong hệ thống.',
      'Danh sách hiện đủ các Loại lưu trữ đang có; mỗi dòng có dấu tích ở đầu cho biết đang '
      'chọn hay chưa; phía trên có ô nhỏ ghi "Tìm kiếm...".', None),
134: ('1. Mở ô "-- Chọn loại db --" nhiều lần và so thứ tự các lựa chọn.',
      'Thứ tự lựa chọn giữ nguyên giữa các lần mở, không xáo trộn.', None),
135: ('1. Chọn một Loại DB, quan sát danh sách bản ghi.\n'
      '2. Chọn thêm Loại DB thứ hai, thứ ba rồi quan sát.',
      '1. Ô cho chọn nhiều giá trị cùng lúc và KHÔNG tự đóng sau mỗi lần chọn; mỗi giá trị đã '
      'chọn hiện thành một thẻ nhỏ trong ô.\n'
      '2. Danh sách trả về bản ghi thuộc BẤT KỲ Loại DB nào đang chọn; sau mỗi lần đổi, danh '
      'sách quay về trang 1.', None),
136: ('1. Đang chọn nhiều Loại DB, bấm lại đúng một giá trị đang chọn.\n'
      '2. Bấm dấu "x" nhỏ bên phải trong ô để bỏ hết.',
      '1. Bấm lại giá trị đang chọn thì bỏ chọn đúng giá trị đó, các giá trị còn lại giữ '
      'nguyên.\n'
      '2. Bấm dấu "x" thì ô trở về chữ gợi ý "-- Chọn loại db --" và danh sách bỏ lọc theo '
      'Loại DB.', None),
137: ('1. Mở ô "-- Chọn loại db --", quan sát cụm nút dọc bên phải danh sách lựa chọn.\n'
      '2. Bấm lần lượt "Chọn tất cả" rồi "Bỏ chọn tất cả".',
      '1. Cụm nút có đủ ba nút với chú thích "Chọn tất cả" · "Bỏ chọn tất cả" · '
      '"Chỉ xem đã chọn" (bấm lần nữa đổi thành "Xem tất cả").\n'
      '2. "Chọn tất cả" chọn mọi lựa chọn ĐANG HIỆN (đang gõ trong ô "Tìm kiếm..." thì chỉ các '
      'lựa chọn còn lại); "Bỏ chọn tất cả" đưa ô về trạng thái chưa chọn gì.', None),
138: ('1. Chọn nhiều hơn 4 Loại DB.\n2. Chọn một Loại DB có nhãn dài nhất.',
      '1. Ô hiện tối đa 4 thẻ, phần còn lại rút gọn thành chữ "... {N} lựa chọn".\n'
      '2. Độ rộng ô không đổi theo độ dài nhãn; nhãn dài quá khổ bị cắt bớt kèm dấu ba chấm.',
      None),
139: ('1. Mở ô "-- Chọn loại db --" và xem cách căn lề các lựa chọn.',
      'Các lựa chọn căn lề trái; lựa chọn đang chọn được tô nền xám và in đậm, kèm dấu tích '
      'ở đầu dòng.', None),
140: ('1. Mở ô "-- Chọn loại db --" ở môi trường có nhiều Loại lưu trữ.\n'
      '2. Cuộn xuống cuối danh sách lựa chọn.',
      'Danh sách đổ hết một lần ngay khi mở (ô nạp toàn bộ danh mục Loại lưu trữ), vùng lựa '
      'chọn cao tối đa khoảng 15 dòng rồi cuộn trong khung, không tải thêm theo trang và không '
      'lặp lựa chọn.', None),
141: ('1. Bấm mở ô "-- Chọn loại db --".\n'
      '2. Nhập vào ô "Tìm kiếm..." bên trong đúng trọn tên một Loại DB đang có.',
      'Danh sách chỉ còn đúng lựa chọn đó; chọn được bình thường và các giá trị đang chọn '
      'không bị mất.', None),
142: ('1. Bấm mở ô "-- Chọn loại db --".\n'
      '2. Nhập vào ô "Tìm kiếm..." một PHẦN tên của lựa chọn đang có.',
      'Danh sách còn mọi lựa chọn có tên CHỨA phần đã nhập, giữ đúng thứ tự ban đầu.', None),
143: ('1. Bấm mở ô "-- Chọn loại db --".\n'
      '2. Nhập từ khoá vào ô "Tìm kiếm..." lần lượt bằng chữ thường rồi chữ HOA.',
      'Hai lần nhập cho ra cùng một danh sách lựa chọn.', None),
144: ('1. Bấm mở ô "-- Chọn loại db --".\n'
      '2. Nhập vào ô "Tìm kiếm..." từ khoá tiếng Việt CÓ dấu.\n'
      '3. Nhập lại từ khoá đó nhưng BỎ hết dấu.\n'
      '4. Nhập một từ khoá không có lựa chọn nào khớp.',
      '1. Hai lần đầu ra cùng danh sách: gõ không dấu vẫn tìm được lựa chọn có dấu.\n'
      '2. Từ khoá không khớp thì vùng lựa chọn hiện dòng chữ "Không tìm thấy".', None),
# ── Selectbox Trạng thái (ô lọc, chọn MỘT giá trị, vẫn có ô tìm) ──
146: ('1. Mở màn, xem ô lọc thứ hai trên thanh lọc.',
      'Ô trống, hiện chữ gợi ý "-- Chọn trạng thái --"; chưa lọc theo trạng thái nào.', None),
147: ('1. Bấm mở ô "-- Chọn trạng thái --".',
      'Danh sách hiện đúng 3 lựa chọn theo thứ tự: "Chờ kết nối" · "Hoạt động" · '
      '"Ngừng hoạt động".', None),
148: ('1. Mở ô "-- Chọn trạng thái --" nhiều lần và xem thứ tự các giá trị.',
      'Thứ tự luôn là "Chờ kết nối" · "Hoạt động" · "Ngừng hoạt động", không xáo trộn giữa '
      'các lần mở.', None),
149: ('1. Chọn "Hoạt động", quan sát danh sách.\n'
      '2. Mở lại ô và chọn "Ngừng hoạt động".\n'
      '3. Mở lại ô và bấm đúng giá trị đang chọn một lần nữa.',
      '1. Chỉ chọn được MỘT giá trị; ô đóng ngay sau khi chọn và hiện giá trị chọn sau cùng.\n'
      '2. Danh sách chỉ còn bản ghi có trạng thái đó và quay về trang 1.\n'
      '3. Bấm lại giá trị đang chọn thì bỏ chọn, ô trở về "-- Chọn trạng thái --".', None),
150: ('1. Chọn giá trị có nhãn dài nhất ("Ngừng hoạt động") và quan sát ô.',
      'Độ rộng ô không thay đổi theo độ dài nhãn; nhãn dài quá khổ được cắt bớt và hiện dấu '
      'ba chấm.', None),
151: ('1. Mở ô "-- Chọn trạng thái --" và xem cách căn lề các giá trị.',
      'Các giá trị căn lề trái; giá trị đang chọn được tô nền xám và in đậm.', None),
152: ('1. Mở ô "-- Chọn trạng thái --" và cuộn trong vùng lựa chọn.',
      'Ô chỉ có 3 lựa chọn cố định, đổ hết một lần ngay khi mở, không tải thêm theo trang và '
      'không lặp lựa chọn.', None),
153: ('1. Bấm mở ô "-- Chọn trạng thái --".\n'
      '2. Nhập vào ô "Tìm kiếm..." bên trong đúng trọn một nhãn, ví dụ "Hoạt động".',
      'Vùng lựa chọn chỉ còn các nhãn CHỨA trọn chuỗi đã nhập; chọn được bình thường.', None),
154: ('1. Bấm mở ô "-- Chọn trạng thái --".\n'
      '2. Nhập vào ô "Tìm kiếm..." một phần nhãn, ví dụ "kết".',
      'Vùng lựa chọn còn đúng nhãn "Chờ kết nối".', None),
155: ('1. Bấm mở ô "-- Chọn trạng thái --".\n'
      '2. Nhập "HOẠT ĐỘNG" rồi nhập lại "hoạt động".',
      'Hai lần nhập cho ra cùng một danh sách lựa chọn.', None),
156: ('1. Bấm mở ô "-- Chọn trạng thái --".\n'
      '2. Nhập "hoạt động" rồi nhập lại "hoat dong".',
      'Cả hai lần đều ra cùng danh sách: gõ không dấu vẫn tìm được nhãn có dấu.', None),
157: ('1. Bấm mở ô "-- Chọn trạng thái --".\n2. Nhập một từ khoá không khớp nhãn nào.',
      'Vùng lựa chọn hiện dòng chữ "Không tìm thấy".', None),
158: ('1. Bấm mở ô "-- Chọn trạng thái --".\n'
      '2. Nhập từ khoá rồi bấm dấu "x" trong ô "Tìm kiếm..." để xoá.',
      'Danh sách trở lại đủ 3 lựa chọn như khi chưa tìm.', None),
# ── Textbox Tìm kiếm name, tên hiển thị (7 case) ──
160: ('1. Mở màn, xem ô tìm kiếm ở giữa thanh lọc.',
      'Ô trống, hiện chữ gợi ý "Tìm kiếm name, tên hiển thị..." kèm biểu tượng kính lúp bên '
      'trái; chưa có dấu "x" xoá từ khoá.', None),
161: ('1. Nhập vào ô "Tìm kiếm name, tên hiển thị..." chuỗi có ký tự đặc biệt và thẻ html, '
      'ví dụ <b>1</b>.\n2. Nhấn Enter.',
      'Hệ thống tìm bình thường; chuỗi vừa nhập hiển thị nguyên dạng trong ô, không bị thực '
      'thi và không làm vỡ giao diện.', None),
162: ('1. Nhập một chuỗi toàn chữ số vào ô "Tìm kiếm name, tên hiển thị...".',
      'Ô nhận chuỗi số bình thường; từ 3 ký tự trở lên hệ thống tìm theo đúng chuỗi số đã nhập '
      'trên cả cột Code lẫn cột Tên hiển thị.', None),
163: ('1. Sao chép một từ khoá hợp lệ.\n'
      '2. Dán vào ô "Tìm kiếm name, tên hiển thị..." rồi nhấn Enter.',
      'Ô nhận đúng nội dung vừa dán, không lỗi phông; nhấn Enter thì áp ngay, không phải chờ '
      'hết 1,5 giây.', None),
164: ('1. Nhập từ khoá tiếng Việt có dấu vào ô "Tìm kiếm name, tên hiển thị...".',
      'Hệ thống trả về đúng kết quả tương ứng, hiển thị đúng dấu tiếng Việt, không lỗi phông.',
      None),
165: ('1. Nhập từ khoá tiếng Việt không dấu vào ô "Tìm kiếm name, tên hiển thị...".',
      'Ghi lại hành vi thật: hệ thống có trả về bản ghi có dấu tương ứng hay không. Việc bỏ dấu '
      'do máy chủ xử lý, giao diện chỉ gửi nguyên từ khoá đã nhập.',
      V + 'Việc tìm không dấu do máy chủ quyết định — giao diện gửi nguyên từ khoá, không tự bỏ '
      'dấu. Cần dev/BA xác nhận máy chủ có bỏ dấu khi so khớp hay không.'),
166: ('1. Nhập từ khoá có khoảng trắng ở đầu.\n'
      '2. Nhập tiếp khoảng trắng ở cuối rồi bấm ra ngoài ô.',
      '1. Khoảng trắng đầu bị bỏ ngay khi gõ; gõ liên tiếp từ 2 dấu cách trở lên thì tự gộp '
      'thành một.\n'
      '2. Rời khỏi ô thì khoảng trắng cuối bị cắt và hệ thống tìm theo từ khoá đã cắt.', None),
# ── Selectbox Sắp xếp ──
168: ('1. Mở màn, xem ô cuối cùng bên phải thanh lọc, trước nút "Làm mới dữ liệu".\n'
      '2. Bấm dấu "x" trong ô để bỏ lựa chọn đang có.',
      '1. Ô hiện sẵn "Mới nhất trước" — đây là thứ tự mặc định của màn, không phải ô trống.\n'
      '2. Bỏ lựa chọn thì ô hiện chữ gợi ý "-- Chọn sắp xếp --" và danh sách quay về thứ tự '
      'mặc định của hệ thống.', None),
169: ('1. Bấm mở ô "Sắp xếp".',
      'Danh sách hiện đúng 2 lựa chọn: "Mới nhất trước" và "Cũ nhất trước".', None),
170: ('1. Mở ô "Sắp xếp" nhiều lần và xem thứ tự các giá trị.',
      'Thứ tự luôn là "Mới nhất trước" rồi "Cũ nhất trước", không xáo trộn giữa các lần mở.',
      None),
171: ('1. Chọn "Cũ nhất trước", quan sát danh sách.\n2. Mở lại ô và chọn "Mới nhất trước".',
      '1. Chỉ chọn được MỘT giá trị; ô đóng ngay sau khi chọn và hiện giá trị chọn sau cùng.\n'
      '2. Thứ tự bản ghi trong bảng đảo lại đúng theo lựa chọn.', None),
172: ('1. Chọn giá trị có nhãn dài nhất và quan sát ô.',
      'Độ rộng ô giữ nguyên; nhãn dài quá khổ được cắt bớt và hiện dấu ba chấm.', None),
173: ('1. Mở ô "Sắp xếp" và xem cách căn lề các giá trị.',
      'Các giá trị căn lề trái; giá trị đang chọn được tô nền xám và in đậm.', None),
174: ('1. Mở ô "Sắp xếp" và cuộn trong vùng lựa chọn.',
      'Ô chỉ có 2 lựa chọn cố định, đổ hết một lần ngay khi mở, không tải thêm theo trang.',
      None),
175: ('1. Bấm mở ô "Sắp xếp".\n2. Nhập vào ô "Tìm kiếm..." bên trong đúng trọn "Cũ nhất trước".',
      'Vùng lựa chọn chỉ còn đúng "Cũ nhất trước".', None),
176: ('1. Bấm mở ô "Sắp xếp".\n2. Nhập vào ô "Tìm kiếm..." một phần nhãn, ví dụ "nhất".',
      'Vùng lựa chọn còn cả hai nhãn vì cả hai đều chứa chuỗi đã nhập.', None),
177: ('1. Bấm mở ô "Sắp xếp".\n2. Nhập "MỚI" rồi nhập lại "mới".',
      'Hai lần nhập cho ra cùng một danh sách lựa chọn.', None),
178: ('1. Bấm mở ô "Sắp xếp".\n2. Nhập "mới" rồi nhập lại "moi".',
      'Cả hai lần đều ra cùng danh sách: gõ không dấu vẫn tìm được nhãn có dấu.', None),
179: ('1. Bấm mở ô "Sắp xếp".\n2. Nhập một từ khoá không khớp nhãn nào.',
      'Vùng lựa chọn hiện dòng chữ "Không tìm thấy".', None),
180: ('1. Bấm mở ô "Sắp xếp".\n'
      '2. Nhập từ khoá rồi bấm dấu "x" trong ô "Tìm kiếm..." để xoá.',
      'Danh sách trở lại đủ 2 lựa chọn như khi chưa tìm.', None),
# ── Chức năng Tìm kiếm chung ──
183: ('1. Mở màn Vị trí lưu trữ.\n2. Không nhập và không chọn bất kỳ tiêu chí nào.',
      'Danh sách hiện toàn bộ vị trí lưu trữ, sắp theo "Mới nhất trước", 20 bản ghi mỗi trang.',
      None),
184: ('1. Nhập vào ô "Tìm kiếm name, tên hiển thị..." một từ khoá từ 3 ký tự trở lên chắc chắn '
      'không khớp bản ghi nào.\n'
      '2. Lần lượt thử thêm với từng ô lọc và với cả ba tiêu chí cùng lúc.',
      'Bảng không còn bản ghi nào và hiện dòng chữ "Chưa có target nào"; "Tổng số bản ghi:" '
      'về 0; bốn thẻ số liệu cũng về 0 theo bộ lọc đang áp.', None),
185: ('1. Chọn "-- Chọn loại db --", chọn "-- Chọn trạng thái --", nhập từ khoá vào ô tìm và '
      'chọn "Sắp xếp" — đủ cả 4 tiêu chí, giá trị khớp bản ghi đang có.',
      'Danh sách chỉ còn bản ghi thoả mãn ĐỒNG THỜI cả 4 tiêu chí, sắp theo đúng thứ tự đã '
      'chọn.', None),
186: ('1. Nhập điều kiện tìm kiếm 1 cho ra n bản ghi, ví dụ: Trạng thái = Hoạt động.\n'
      '2. Nhập điều kiện tìm kiếm 2 cũng cho ra n bản ghi nhưng là bản ghi khác, ví dụ: '
      'Loại DB = PostgreSQL.',
      'Hai lần đều hiện n bản ghi, nhưng danh sách của lần 2 đúng là các bản ghi thoả mãn tiêu '
      'chí 2, không lẫn kết quả của lần 1.', None),
# ── Tìm kiếm đơn lẻ ──
189: ('1. Mở màn Vị trí lưu trữ.\n2. Để ô "-- Chọn loại db --" ở trạng thái chưa chọn gì.',
      'Danh sách hiện toàn bộ vị trí lưu trữ, không lọc theo Loại DB.', None),
190: ('1. Lần lượt chọn từng Loại DB trong ô "-- Chọn loại db --".\n'
      '2. Đối chiếu kết quả với dữ liệu đang lưu:\n'
      'select * from <bảng vị trí lưu trữ>\n'
      "where <cột loại lưu trữ> = '<mã loại đang chọn>';",
      '1. Danh sách chỉ còn bản ghi có cột Loại DB đúng giá trị đã chọn.\n'
      '2. Kết quả khớp với dữ liệu đang lưu trong hệ thống.', None),
192: ('1. Mở màn Vị trí lưu trữ.\n2. Để ô "-- Chọn trạng thái --" ở trạng thái chưa chọn gì.',
      'Danh sách hiện đủ bản ghi của cả ba trạng thái Chờ kết nối · Hoạt động · '
      'Ngừng hoạt động.', None),
193: ('1. Lần lượt chọn "Chờ kết nối", "Hoạt động", "Ngừng hoạt động".\n'
      '2. Đối chiếu kết quả với dữ liệu đang lưu:\n'
      'select * from <bảng vị trí lưu trữ>\n'
      "where <cột trạng thái> = '<trạng thái đang chọn>';",
      '1. Danh sách chỉ còn bản ghi có cột Trạng thái đúng giá trị đã chọn; số bản ghi khớp '
      'với con số trên thẻ số liệu tương ứng.\n'
      '2. Kết quả khớp với dữ liệu đang lưu trong hệ thống.', None),
195: ('1. Nhập vào ô "Tìm kiếm name, tên hiển thị..." toàn dấu cách.',
      'Khoảng trắng đầu bị bỏ ngay khi gõ nên ô vẫn trống; hệ thống không áp lọc và danh sách '
      'giữ nguyên.', None),
196: ('1. Nhập vào ô "Tìm kiếm name, tên hiển thị..." một từ khoá đang có, kèm khoảng trắng ở '
      'đầu và cuối.\n2. Nhấn Enter.',
      'Khoảng trắng đầu bị bỏ ngay khi gõ; khoảng trắng cuối nhập được nhưng bị cắt trước khi '
      'tìm; kết quả đúng như khi nhập từ khoá không có khoảng trắng.', None),
197: ('1. Nhập vào ô "Tìm kiếm name, tên hiển thị..." một phần Code hoặc Tên hiển thị đang có '
      '(ít nhất 3 ký tự), lần lượt bằng chữ thường rồi chữ HOA.\n'
      '2. Đối chiếu kết quả với dữ liệu đang lưu:\n'
      'select * from <bảng vị trí lưu trữ>\n'
      "where <cột code> ilike '%<từ khoá>%' or <cột tên hiển thị> ilike '%<từ khoá>%';",
      '1. Cả hai lần đều trả về bản ghi có Code HOẶC Tên hiển thị chứa chuỗi đã nhập, không '
      'phân biệt chữ hoa chữ thường.\n'
      '2. Kết quả khớp với dữ liệu đang lưu trong hệ thống.', None),
198: ('1. Nhập vào ô "Tìm kiếm name, tên hiển thị..." lần lượt các ký tự đặc biệt:\n'
      '- % (hoặc %test)\n- &\n- _\n- *\n- \\\n- dấu nháy \'\n- thẻ HTML: <b>1</b>\n'
      '2. Đối chiếu kết quả với dữ liệu đang lưu:\n'
      'select * from <bảng vị trí lưu trữ>\n'
      "where <cột code> ilike '%<ký tự đã nhập>%' escape '\\';",
      '1. Danh sách trả về bản ghi chứa đúng ký tự đã nhập, không báo lỗi hệ thống và không '
      'làm vỡ giao diện.\n'
      '2. Kết quả khớp với dữ liệu đang lưu.', None),
199: ('1. Nhập vào ô "Tìm kiếm name, tên hiển thị..." một từ khoá tiếng Việt có dấu đang có '
      'trong cột Tên hiển thị.\n2. Nhấn Enter.\n'
      '3. Đối chiếu kết quả với dữ liệu đang lưu:\n'
      'select * from <bảng vị trí lưu trữ>\n'
      "where <cột tên hiển thị> ilike '%<từ khoá có dấu>%';",
      '1. Danh sách trả về bản ghi có Tên hiển thị chứa từ khoá, hiển thị đúng dấu tiếng Việt.\n'
      '2. Kết quả khớp với dữ liệu đang lưu.', None),
200: ('1. Nhập vào ô "Tìm kiếm name, tên hiển thị..." một chuỗi rất dài (từ 500 ký tự trở lên).\n'
      '2. Nhập tiếp một chuỗi chỉ 1-2 ký tự rồi chờ quá 2 giây.',
      '1. Ô nhận chuỗi dài, không giới hạn độ dài, giao diện không vỡ; hệ thống tìm và trả về '
      'danh sách rỗng kèm dòng "Chưa có target nào".\n'
      '2. Dưới 3 ký tự thì hệ thống KHÔNG áp lọc và KHÔNG hiện thông báo nào — danh sách giữ '
      'nguyên như khi chưa tìm.', None),
202: ('1. Mở màn Vị trí lưu trữ.\n2. Để ô "Sắp xếp" ở giá trị mặc định.',
      'Ô hiện "Mới nhất trước" và danh sách xếp bản ghi tạo gần đây nhất lên trên cùng.', None),
203: ('1. Lần lượt chọn "Mới nhất trước" rồi "Cũ nhất trước" ở ô "Sắp xếp".\n'
      '2. Đối chiếu thứ tự với dữ liệu đang lưu:\n'
      'select * from <bảng vị trí lưu trữ>\n'
      'order by created_at desc;   -- và order by created_at asc;',
      '1. Chọn "Mới nhất trước" thì bản ghi tạo gần đây nhất lên đầu; chọn "Cũ nhất trước" thì '
      'thứ tự đảo lại hoàn toàn.\n'
      '2. Thứ tự trên màn khớp với thứ tự dữ liệu đang lưu trong hệ thống.', None),
# ── ATTT khối tìm kiếm ──
211: ('1. Để phiên đăng nhập hết hạn.\n'
      '2. Nhập từ khoá vào ô "Tìm kiếm name, tên hiển thị..." hoặc đổi một ô lọc.',
      'Hiện thông báo "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." và điều hướng về '
      'màn đăng nhập; không trả về kết quả nào.', None),
})

# ══════════ CN THÊM MỚI / CHỈNH SỬA VỊ TRÍ LƯU TRỮ — sinh song song ══════════
# §5.6: CN Sửa lặp FULL bộ nhóm control của CN Thêm; chỉ khác 5 điểm đã liệt kê ở prompt v3.
# Dòng đầu của từng nhóm control (dòng xám) ở hai CN:
#            Code  Tên h.thị  Mô tả  Loại db  Schema  Port  Database  Chuỗi kết nối
G_THEM = {'code': 227, 'ten': 238, 'mota': 248, 'loai': 258, 'schema': 265,
          'port': 275, 'db': 286, 'conn': 296}
G_SUA = {'code': 378, 'ten': 390, 'mota': 400, 'loai': 410, 'schema': 417,
         'port': 427, 'db': 438, 'conn': 448}

_LIETKE_FORM = (
    '[Tiêu đề popup] %s\n'
    '— Nhóm "Thông tin cơ bản" —\n'
    '1. [Trường nhập] Code *%s\n'
    '2. [Trường nhập] Tên hiển thị *\n'
    '3. [Trường nhập] Mô tả\n'
    '4. [Danh sách chọn] Loại database *\n'
    '5. [Trường nhập] Tên schema\n'
    '— Nhóm "Cấu hình kết nối" —\n'
    '(khung chú dẫn màu xanh: "Chỉ ô Chuỗi kết nối bên dưới là bắt buộc và phải có đủ thông '
    'tin (host, port, tên database, tài khoản đăng nhập). 2 ô Port mặc định / Database mặc '
    'định là tùy chọn, không cần điền nếu chuỗi kết nối đã đầy đủ.")\n'
    '6. [Trường nhập] Port mặc định\n'
    '7. [Trường nhập] Database mặc định\n'
    '8. [Trường nhập] Chuỗi kết nối *\n'
    '9. [Nút bấm] Hủy\n'
    '10. [Nút bấm] %s')

SUA[220] = ('1. Mở màn hình chức năng.\n'
            '2. Đối chiếu từng thành phần đang hiện trên màn với thiết kế màn hình:\n'
            + _LIETKE_FORM % ('Thêm target mới', '', 'Thêm mới'),
            'Hiển thị màn hình chức năng bao gồm các thông tin:\n'
            + _LIETKE_FORM % ('Thêm target mới', '', 'Thêm mới'),
            L + 'Tiêu đề hộp thoại là "Thêm target mới" trong khi tiêu đề màn và nút đầu màn '
            'đã dùng chữ "vị trí lưu trữ" — TKCT §13.16.4 mục "Lưu ý đối chiếu code" đã ghi '
            'nhận. Cần QA/BA chốt bản chữ thống nhất.')
SUA[371] = ('1. Mở màn hình chức năng.\n'
            '2. Đối chiếu từng thành phần đang hiện trên màn với thiết kế màn hình:\n'
            + _LIETKE_FORM % ('Sửa: {tên hiển thị}', '\n   ô BỊ KHOÁ, nền xám, kèm dòng chú '
                              'thích "Không thể thay đổi mã sau khi tạo"', 'Cập nhật'),
            'Hiển thị màn hình chức năng bao gồm các thông tin:\n'
            + _LIETKE_FORM % ('Sửa: {tên hiển thị}', '\n   ô BỊ KHOÁ, nền xám, kèm dòng chú '
                              'thích "Không thể thay đổi mã sau khi tạo"', 'Cập nhật'),
            R + 'Ba ô Port mặc định · Database mặc định · Chuỗi kết nối mở ra RỖNG khi sửa, '
            'không nạp lại cấu hình đang lưu của bản ghi.')


def _kq_vuot_do_dai(n=250):
    """Cột D cho case *nhập vượt độ dài* — khuôn ⑮ (thông báo lỗi · highlight · focus ·
    không cho nhập quá N) nhưng ghi ĐÚNG hành vi thật: giao diện tự cắt ở N và không báo lỗi.
    """
    return ('1. Hệ thống không cho nhập quá %d ký tự — phần dư bị cắt ngay khi dán, giao '
            'diện KHÔNG hiện thông báo lỗi độ dài nào, KHÔNG highlight và KHÔNG focus vào ô '
            '(luật kiểm của biểu mẫu không xét độ dài).\n'
            '2. Ghi lại phản hồi thật của máy chủ nếu chuỗi dài hơn %d ký tự vẫn tới được — '
            'giới hạn thật của cột dữ liệu chưa xác nhận được.' % (n, n))


def _form(g, nut, sua):
    """Sinh bảng sửa cho MỘT bộ nhóm control của biểu mẫu (Thêm mới hoặc Chỉnh sửa)."""
    b3 = 'Click %s' % nut
    mo = ('1. Mở hộp thoại "Sửa: {tên hiển thị}" của một bản ghi đang có.'
          if sua else '1. Mở hộp thoại "Thêm target mới".')
    d = {}

    # ── Textbox Code (unique) ──────────────────────────────────────────────
    c = g['code']
    if not sua:
        d[c + 1] = (mo + '\n2. Xem ô "Code".', 'Mặc định là trống.', None)
    else:
        d[c + 1] = (None, None,
                    R + 'Ô Code bị khoá khi sửa nhưng dữ liệu gửi lên máy chủ VẪN kèm trường '
                    'mã (lấy mã cũ của bản ghi) — nếu máy chủ chấp nhận thì mã vẫn đổi được '
                    'dù giao diện khoá ô. Cần dev xác nhận máy chủ có bỏ qua trường này không.')
    d[c + 2] = ('1. Để trống ô "Code".\n2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                '1. Thông báo lỗi "Vui lòng không bỏ trống thông tin này" hiện bằng chữ đỏ '
                'ngay dưới ô "Code".\n2. Không lưu bản ghi nào.'
                + ('\n3. Ở chế độ sửa ô "Code" bị khoá nên không xoá trống được — ghi lại '
                   'đúng hành vi quan sát thấy.' if sua else ''), None)
    d[c + 3] = ('1. Dán vào ô "Code" một chuỗi 251 ký tự (chữ thường và số).\n2. %s' % b3,
                _kq_vuot_do_dai(), T_DAIDB)
    d[c + 4] = ('1. Nhập vào ô "Code" một chuỗi 250 ký tự gồm chữ thường, số và dấu "-".\n'
                '2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                'Lưu thành công; giá trị hiển thị đầy đủ ở cột Code ngoài danh sách, không bị '
                'mất chữ.', T_DAIDB)
    d[c + 5] = ('1. Nhập vào ô "Code" chuỗi có chữ HOA, dấu cách, ký tự đặc biệt và thẻ html, '
                'ví dụ "AB c<b>1</b>".\n2. %s' % b3,
                '1. Thông báo lỗi "Chỉ được dùng chữ thường, số, dấu gạch ngang (-) và gạch '
                'dưới (_)" hiện bằng chữ đỏ ngay dưới ô "Code".\n'
                '2. Không lưu bản ghi nào và chuỗi vừa nhập không bị thực thi.', None)
    d[c + 6] = ('1. Nhập vào ô "Code" chuỗi chỉ gồm chữ số.\n2. %s' % b3,
                'Ô nhận bình thường và lưu thành công — luật chỉ đòi chữ thường, số, dấu "-" '
                'và dấu "_".', None)
    d[c + 7] = ('1. Nhập "Code" có khoảng trắng ở đầu và cuối.\n2. %s' % b3,
                'Hệ thống tự cắt khoảng trắng hai đầu trước khi kiểm và trước khi lưu; giá trị '
                'lưu xuống không còn khoảng trắng thừa.', None)
    d[c + 8] = ('1. Sao chép một mã hợp lệ (chữ thường, số, dấu "-") rồi dán vào ô "Code".',
                'Dán thành công, chữ hiển thị bình thường, không lỗi phông; chuỗi dán dài hơn '
                '250 ký tự thì bị cắt còn 250.', None)
    d[c + 9] = ('1. Nhập "Code" bằng tiếng Việt có dấu, ví dụ "vị-trí".\n2. %s' % b3,
                '1. Ô cho gõ tiếng Việt có dấu nhưng khi lưu báo lỗi "Chỉ được dùng chữ '
                'thường, số, dấu gạch ngang (-) và gạch dưới (_)".\n'
                '2. Không lưu bản ghi nào.', None)
    d[c + 10] = ('1. Nhập vào ô "Code" một mã đã tồn tại của bản ghi khác.\n'
                 '2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                 '1. Giao diện KHÔNG tự kiểm trùng và KHÔNG có thông báo lỗi trùng nào của '
                 'riêng nó — chữ đỏ hiện ngay dưới ô "Code" là nguyên văn thông điệp máy chủ '
                 'trả về (giao diện nhận ra nó bằng cách dò chuỗi "Tên target" hoặc '
                 '"đã tồn tại").\n'
                 '2. Không tạo thêm bản ghi trùng mã.',
                 V + 'Giao diện chỉ nhận diện thông báo trùng bằng cách dò chữ "Tên target" '
                 'hoặc "đã tồn tại" trong thông điệp của máy chủ. Bản chữ chính xác và việc '
                 'máy chủ có chặn trùng hay không đều CHƯA xác nhận được.')

    # ── Textbox Tên hiển thị ───────────────────────────────────────────────
    c = g['ten']
    if not sua:
        d[c + 1] = (mo + '\n2. Xem ô "Tên hiển thị".', 'Mặc định là trống.', None)
    d[c + 2] = ('1. Để trống ô "Tên hiển thị".\n2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                '1. Thông báo lỗi "Vui lòng không bỏ trống thông tin này" hiện bằng chữ đỏ '
                'ngay dưới ô "Tên hiển thị".\n2. Không lưu bản ghi nào.', None)
    d[c + 3] = ('1. Dán vào ô "Tên hiển thị" một chuỗi 251 ký tự.\n2. %s' % b3,
                _kq_vuot_do_dai(), T_DAIDB)
    d[c + 4] = ('1. Nhập "Tên hiển thị" dài đúng 250 ký tự.\n'
                '2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                'Lưu thành công; giá trị hiển thị đầy đủ ở cột Tên hiển thị ngoài danh sách, '
                'không bị mất chữ.', T_DAIDB)
    d[c + 5] = ('1. Nhập vào ô "Tên hiển thị" chuỗi có ký tự đặc biệt và thẻ html, ví dụ '
                '"Kho <b>1</b>".\n2. %s\n3. Mở lại bản ghi để xem.' % b3,
                'Lưu được (ô này không có luật định dạng); ký tự đặc biệt và thẻ html hiển thị '
                'nguyên dạng ở cột Tên hiển thị và khi mở lại biểu mẫu, không bị thực thi.',
                None)
    d[c + 6] = ('1. Nhập vào ô "Tên hiển thị" chuỗi chỉ gồm chữ số.\n2. %s' % b3,
                'Ô nhận bình thường, lưu thành công, giá trị hiển thị đúng như đã nhập.', None)
    d[c + 7] = ('1. Nhập "Tên hiển thị" có khoảng trắng ở đầu và cuối.\n2. %s' % b3,
                'Hệ thống tự cắt khoảng trắng hai đầu trước khi lưu.', None)
    d[c + 8] = ('1. Sao chép một đoạn chữ từ nơi khác, dán vào ô "Tên hiển thị".',
                'Dán thành công, chữ hiển thị bình thường, không lỗi phông; chuỗi dán dài hơn '
                '250 ký tự thì bị cắt còn 250.', None)
    d[c + 9] = ('1. Nhập "Tên hiển thị" bằng tiếng Việt có dấu.\n'
                '2. %s rồi mở lại bản ghi để xem.' % b3,
                'Lưu thành công; giá trị hiển thị đúng dấu tiếng Việt ở cột Tên hiển thị và '
                'khi mở lại biểu mẫu, không lỗi phông.', None)

    # ── Textbox Mô tả (KHÔNG bắt buộc) ─────────────────────────────────────
    c = g['mota']
    if not sua:
        d[c + 1] = (mo + '\n2. Xem ô "Mô tả".',
                    'Mặc định là trống, hiện chữ gợi ý "Mô tả ngắn về target này".', None)
    d[c + 2] = ('1. Để trống ô "Mô tả".\n2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                'Ô "Mô tả" KHÔNG bắt buộc: nhãn ô không có dấu (*), hệ thống lưu thành công '
                'và để trống phần mô tả của bản ghi; không hiện thông báo lỗi nào.', None)
    d[c + 3] = ('1. Dán vào ô "Mô tả" một chuỗi 251 ký tự.\n2. %s' % b3,
                _kq_vuot_do_dai(), T_DAIDB)
    d[c + 4] = ('1. Nhập "Mô tả" dài đúng 250 ký tự.\n'
                '2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                'Lưu thành công; mở hộp thoại "Chi tiết target" thấy ô Mô tả hiện đủ 250 ký '
                'tự, không bị mất chữ.', T_DAIDB)
    d[c + 5] = ('1. Nhập vào ô "Mô tả" chuỗi có ký tự đặc biệt và thẻ html.\n'
                '2. %s rồi mở hộp thoại "Chi tiết target" để xem.' % b3,
                'Ký tự đặc biệt và thẻ html hiển thị nguyên dạng ở dòng "Mô tả" của hộp thoại '
                'chi tiết, không bị thực thi.', None)
    d[c + 6] = ('1. Nhập vào ô "Mô tả" chuỗi chỉ gồm chữ số.\n2. %s' % b3,
                'Ô nhận bình thường, lưu thành công, giá trị hiển thị đúng như đã nhập.', None)
    d[c + 7] = ('1. Nhập "Mô tả" có khoảng trắng ở đầu và cuối.\n2. %s' % b3,
                'Hệ thống tự cắt khoảng trắng hai đầu trước khi lưu.', None)
    d[c + 8] = ('1. Sao chép một đoạn chữ từ nơi khác, dán vào ô "Mô tả".',
                'Dán thành công, chữ hiển thị bình thường, không lỗi phông; chuỗi dán dài hơn '
                '250 ký tự thì bị cắt còn 250.', None)
    d[c + 9] = ('1. Nhập "Mô tả" bằng tiếng Việt có dấu.\n'
                '2. %s rồi mở hộp thoại "Chi tiết target" để xem.' % b3,
                'Giá trị hiển thị đúng dấu tiếng Việt, không lỗi phông.', None)

    # ── Selectbox Loại database (KHÔNG có ô tìm bên trong) ─────────────────
    c = g['loai']
    if not sua:
        d[c + 1] = (mo + '\n2. Xem ô "Loại database".',
                    'Ô trống, hiện chữ gợi ý "Chọn loại database"; trong lúc còn đang nạp danh '
                    'mục thì hiện "Đang tải..." và ô bị khoá.', None)
    d[c + 2] = ('1. Bấm mở ô "Loại database".\n'
                '2. Đối chiếu danh sách với danh mục Loại lưu trữ trong hệ thống.',
                '1. Danh sách CHỈ liệt kê các Loại lưu trữ đang Hoạt động — Loại lưu trữ không '
                'hoạt động không xuất hiện.\n'
                '2. Ô KHÔNG có hộp tìm kiếm bên trong; danh mục rỗng thì hiện dòng "Không có '
                'dữ liệu".', None)
    d[c + 3] = ('1. Mở ô "Loại database" nhiều lần và so thứ tự các lựa chọn.',
                'Thứ tự lựa chọn giữ nguyên giữa các lần mở, đúng theo thứ tự danh mục Loại '
                'lưu trữ trả về, không xáo trộn.', None)
    d[c + 4] = ('1. Chọn lần lượt các Loại database khác nhau.\n'
                '2. Bấm dấu "x" bên phải trong ô.',
                '1. Chỉ chọn được MỘT giá trị; ô đóng ngay sau khi chọn và hiện giá trị chọn '
                'sau cùng.\n'
                '2. Bấm dấu "x" thì ô trở về chữ gợi ý "Chọn loại database".',
                R + 'Bấm dấu "x" đưa ô về rỗng; nếu bấm %s ngay sau đó thì hiện lỗi "Vui lòng '
                'chọn loại database" — cần xác nhận máy chủ cũng chặn khi dữ liệu gửi lên '
                'thiếu loại lưu trữ.' % nut)
    d[c + 5] = ('1. Chọn Loại database có nhãn dài nhất và quan sát ô.',
                'Độ rộng ô không thay đổi theo độ dài nhãn; nhãn dài quá khổ được cắt bớt và '
                'hiện dấu ba chấm.', None)
    d[c + 6] = ('1. Mở ô "Loại database" và xem cách căn lề các giá trị.',
                'Các giá trị căn lề trái; giá trị đang chọn được tô nền xám và in đậm.', None)

    # ── Textbox Tên schema (KHÔNG bắt buộc, có luật định dạng riêng) ───────
    c = g['schema']
    if not sua:
        d[c + 1] = (mo + '\n2. Xem ô "Tên schema".',
                    'Mặc định là trống; ngay dưới ô có dòng chú dẫn "Tên Trino schema — chỉ '
                    'chữ thường, số, _, -. Để trống nếu dùng schema mặc định của loại '
                    'database."', None)
    d[c + 2] = ('1. Để trống ô "Tên schema".\n2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                'Ô "Tên schema" KHÔNG bắt buộc: nhãn ô không có dấu (*), hệ thống lưu thành '
                'công và bản ghi dùng schema mặc định của loại lưu trữ; không hiện thông báo '
                'lỗi nào.', None)
    d[c + 3] = ('1. Dán vào ô "Tên schema" một chuỗi 251 ký tự chữ thường.\n2. %s' % b3,
                _kq_vuot_do_dai(), T_DAIDB)
    d[c + 4] = ('1. Nhập "Tên schema" dài đúng 250 ký tự, chỉ gồm chữ thường và dấu "_".\n'
                '2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                'Lưu thành công; mở hộp thoại "Chi tiết target" thấy dòng "Schema" hiện đủ giá '
                'trị vừa nhập.', T_DAIDB)
    d[c + 5] = ('1. Nhập vào ô "Tên schema" chuỗi có chữ HOA, dấu cách, ký tự đặc biệt hoặc '
                'thẻ html, ví dụ "Kho <b>1</b>".\n2. %s' % b3,
                '1. Thông báo lỗi "schema_name chỉ được chứa chữ thường, số, dấu gạch dưới và '
                'gạch ngang (snake_case)" hiện bằng chữ đỏ ngay dưới ô "Tên schema".\n'
                '2. Không lưu bản ghi nào và chuỗi vừa nhập không bị thực thi.',
                M + 'Thông báo lỗi đang hiện tên trường kỹ thuật "schema_name" cho người dùng '
                'cuối; mong đợi đổi thành nhãn tiếng Việt "Tên schema".')
    d[c + 6] = ('1. Nhập vào ô "Tên schema" chuỗi chỉ gồm chữ số.\n2. %s' % b3,
                'Ô nhận bình thường và lưu thành công — luật cho phép chữ thường, số, dấu "_" '
                'và dấu "-".', None)
    d[c + 7] = ('1. Nhập "Tên schema" hợp lệ nhưng có khoảng trắng ở đầu và cuối.\n2. %s' % b3,
                'Hệ thống tự cắt khoảng trắng hai đầu trước khi lưu; giá trị lưu xuống không '
                'còn khoảng trắng thừa.', None)
    d[c + 8] = ('1. Sao chép một chuỗi chữ thường có dấu "_" rồi dán vào ô "Tên schema".',
                'Dán thành công, chữ hiển thị bình thường, không lỗi phông.', None)
    d[c + 9] = ('1. Nhập "Tên schema" bằng tiếng Việt có dấu.\n2. %s' % b3,
                '1. Ô cho gõ tiếng Việt có dấu nhưng khi lưu báo lỗi "schema_name chỉ được '
                'chứa chữ thường, số, dấu gạch dưới và gạch ngang (snake_case)".\n'
                '2. Không lưu bản ghi nào.', None)

    # ── Textbox Port mặc định (ô số, KHÔNG bắt buộc, FE không kiểm) ────────
    c = g['port']
    if not sua:
        d[c + 1] = (mo + '\n2. Xem ô "Port mặc định".', 'Mặc định là trống.', None)
    d[c + 2] = ('1. Để trống ô "Port mặc định".\n'
                '2. Nhập, chọn hợp lệ các trường còn lại.\n3. %s' % b3,
                'Ô "Port mặc định" KHÔNG bắt buộc: nhãn ô không có dấu (*), khung chú dẫn màu '
                'xanh cũng ghi rõ ô này là tùy chọn. Hệ thống lưu thành công và chuỗi kết nối '
                'lưu xuống không kèm phần cổng.', None)
    d[c + 3] = ('1. Nhập 0 vào ô "Port mặc định".\n2. %s' % b3,
                'Ô nhận số 0 và biểu mẫu vẫn gửi đi được — giao diện KHÔNG kiểm ô này dù ô '
                'khai giới hạn nhỏ nhất là 1. Ghi lại phản hồi thật của máy chủ.',
                R + 'Biểu mẫu tắt kiểm tra sẵn có của trình duyệt và luật kiểm riêng không xét '
                'ô Port mặc định, nên giá trị ngoài khoảng 1-65535 vẫn gửi lên máy chủ được.')
    d[c + 4] = ('1. Nhập vào ô "Port mặc định" giá trị vượt ngưỡng cổng cho phép: lớn hơn '
                '65535 (ví dụ 70000), rồi thử tiếp một chuỗi số rất dài.\n2. %s' % b3,
                'Ô nhận giá trị và biểu mẫu vẫn gửi đi được dù ô khai giới hạn lớn nhất là '
                '65535 — luật kiểm của biểu mẫu KHÔNG xét ô này nên KHÔNG có thông báo lỗi '
                'nào ở giao diện. Ghi lại phản hồi thật của máy chủ: chặn lại, hay lưu thẳng '
                'một cổng không hợp lệ.',
                R + 'Không có lưới chắn nào ở giao diện cho khoảng 1-65535; cần dev/BA xác '
                'nhận máy chủ có kiểm hay không.')
    d[c + 5] = ('1. Nhập dấu trừ rồi nhập số vào ô "Port mặc định".\n2. %s' % b3,
                'Ô nhập kiểu số cho gõ dấu trừ; ghi lại đúng hành vi quan sát được: giá trị âm '
                'có được gửi lên máy chủ không và máy chủ trả về gì.',
                R + 'Giao diện không chặn số âm ở ô này.')
    d[c + 6] = ('1. Nhập vào ô "Port mặc định" giá trị có phần thập phân, ví dụ 5432.5.\n'
                '2. %s' % b3,
                'Ghi lại đúng hành vi quan sát được: ô có nhận phần thập phân không, giá trị '
                'gửi lên máy chủ là gì.',
                R + 'Giao diện không chặn số thập phân ở ô này.')
    d[c + 7] = ('1. Nhập chữ, sau đó nhập ký tự đặc biệt vào ô "Port mặc định".',
                'Ô nhập kiểu số của trình duyệt không nhận chữ và ký tự đặc biệt, ô giữ nguyên '
                'trống hoặc giữ giá trị số cũ.', None)
    d[c + 8] = ('1. Sao chép chuỗi vừa có chữ vừa có số, dán vào ô "Port mặc định".',
                'Ô nhập kiểu số chỉ nhận phần chữ số hoặc từ chối cả chuỗi; không hiện phần '
                'chữ trong ô.', None)
    d[c + 9] = ('1. Dán vào ô "Port mặc định" giá trị có khoảng trắng ở hai đầu.\n2. %s' % b3,
                'Khoảng trắng không được nhận; giá trị được hiểu đúng là số đã nhập.', None)
    d[c + 10] = ('1. Nhập chữ tiếng Việt có dấu vào ô "Port mặc định".',
                 'Ô nhập kiểu số không nhận chữ tiếng Việt có dấu, ô giữ nguyên trống hoặc '
                 'giữ giá trị số cũ.', None)

    # ── Textbox Database mặc định (KHÔNG bắt buộc) ─────────────────────────
    c = g['db']
    if not sua:
        d[c + 1] = (mo + '\n2. Xem ô "Database mặc định".',
                    'Mặc định là trống, hiện chữ gợi ý "vd. postgres, admin, master".', None)
    d[c + 2] = ('1. Để trống ô "Database mặc định".\n'
                '2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                'Ô "Database mặc định" KHÔNG bắt buộc: nhãn ô không có dấu (*), khung chú dẫn '
                'màu xanh cũng ghi rõ ô này là tùy chọn. Hệ thống lưu thành công và chuỗi kết '
                'nối lưu xuống không kèm phần tên cơ sở dữ liệu.', None)
    d[c + 3] = ('1. Dán vào ô "Database mặc định" một chuỗi 251 ký tự.\n2. %s' % b3,
                _kq_vuot_do_dai(), T_DAIDB)
    d[c + 4] = ('1. Nhập "Database mặc định" dài đúng 250 ký tự.\n'
                '2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                'Lưu thành công; mở hộp thoại "Chi tiết target" thấy phần tên cơ sở dữ liệu '
                'được nối đủ vào dòng "Connection".', T_DAIDB)
    d[c + 5] = ('1. Nhập vào ô "Database mặc định" chuỗi có ký tự đặc biệt và thẻ html.\n'
                '2. %s rồi mở hộp thoại "Chi tiết target" để xem.' % b3,
                'Ký tự đặc biệt và thẻ html hiển thị nguyên dạng trong dòng "Connection" của '
                'hộp thoại chi tiết, không bị thực thi.', None)
    d[c + 6] = ('1. Nhập vào ô "Database mặc định" chuỗi chỉ gồm chữ số.\n2. %s' % b3,
                'Ô nhận bình thường, lưu thành công, giá trị hiển thị đúng như đã nhập.', None)
    d[c + 7] = ('1. Nhập "Database mặc định" có khoảng trắng ở đầu và cuối.\n2. %s' % b3,
                'Hệ thống tự cắt khoảng trắng hai đầu trước khi ghép vào chuỗi kết nối.', None)
    d[c + 8] = ('1. Sao chép một đoạn chữ từ nơi khác, dán vào ô "Database mặc định".',
                'Dán thành công, chữ hiển thị bình thường, không lỗi phông; chuỗi dán dài hơn '
                '250 ký tự thì bị cắt còn 250.', None)
    d[c + 9] = ('1. Nhập "Database mặc định" bằng tiếng Việt có dấu.\n2. %s' % b3,
                'Giá trị hiển thị đúng dấu tiếng Việt, không lỗi phông.', None)

    # ── Textarea Chuỗi kết nối (BẮT BUỘC, không giới hạn độ dài) ───────────
    c = g['conn']
    if not sua:
        d[c + 1] = (mo + '\n2. Xem ô "Chuỗi kết nối".',
                    'Mặc định là trống; ô là vùng nhập nhiều dòng cao 2 dòng, chữ dạng đều '
                    'nét, kéo giãn được chiều cao.', None)
    else:
        d[c + 1] = (None,
                    # Chữ chuẩn lấy từ `qalib` (chỉ thị 2026-09-14) — chép tay vào đây là lại
                    # đúng lỗ "sửa luật ở một nơi, chữ cũ sống ở nơi khác".
                    qalib.MAC_DINH_KQ_SUA, None)
    d[c + 2] = ('1. Để trống ô "Chuỗi kết nối".\n'
                '2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                '1. Thông báo lỗi "Vui lòng không bỏ trống thông tin này" hiện bằng chữ đỏ '
                'ngay dưới ô "Chuỗi kết nối"; viền ô chuyển đỏ.\n2. Không lưu bản ghi nào.',
                None)
    d[c + 3] = ('1. Dán vào ô "Chuỗi kết nối" một chuỗi 5.000 ký tự.\n2. %s' % b3,
                '1. Khác 5 ô chữ còn lại của biểu mẫu (hệ thống không cho nhập quá 250 ký '
                'tự), ô này KHÔNG khai giới hạn nào: nhận trọn 5.000 ký tự, hiện thanh cuộn, '
                'giao diện không vỡ và KHÔNG hiện thông báo lỗi độ dài nào, KHÔNG highlight, '
                'KHÔNG focus vào ô.\n'
                '2. Ghi lại phản hồi thật của máy chủ: lưu được hay bị chặn.',
                V + 'Ô "Chuỗi kết nối" là ô DUY NHẤT của biểu mẫu không đặt giới hạn ký tự ở '
                'giao diện; giới hạn thật của cột dữ liệu chưa được xác nhận.')
    d[c + 4] = ('1. Nhập "Chuỗi kết nối" đủ thông tin theo chú dẫn (máy chủ, cổng, tên cơ sở '
                'dữ liệu, tài khoản đăng nhập).\n'
                '2. Các thông tin khác nhập hợp lệ.\n3. %s' % b3,
                'Lưu thành công; mở hộp thoại "Chi tiết target" thấy dòng "Connection" hiện đủ '
                'chuỗi vừa nhập, có nối thêm phần cổng và tên cơ sở dữ liệu nếu hai ô đó được '
                'điền.', None)
    d[c + 5] = ('1. Nhập vào ô "Chuỗi kết nối" chuỗi có ký tự đặc biệt và thẻ html.\n'
                '2. %s rồi mở hộp thoại "Chi tiết target" để xem.' % b3,
                'Ký tự đặc biệt và thẻ html hiển thị nguyên dạng trong dòng "Connection" của '
                'hộp thoại chi tiết, không bị thực thi.', None)
    d[c + 6] = ('1. Nhập vào ô "Chuỗi kết nối" chuỗi chỉ gồm chữ số.\n2. %s' % b3,
                'Ô nhận bình thường, lưu thành công, giá trị hiển thị đúng như đã nhập.', None)
    d[c + 7] = ('1. Nhập "Chuỗi kết nối" gồm nhiều dòng, dùng Enter để xuống dòng.\n'
                '2. %s rồi mở lại biểu mẫu để xem.' % b3,
                'Ô nhận nhiều dòng; khi mở lại các dòng vẫn giữ đúng vị trí xuống dòng như khi '
                'nhập.'
                + (' Lưu ý ở chế độ sửa ô này mở ra RỖNG nên phải nhập lại từ đầu.'
                   if sua else ''), None)
    d[c + 8] = ('1. Dán vào ô "Chuỗi kết nối" một đoạn khoảng 5.000 ký tự.\n'
                '2. Quan sát ô và kéo giãn chiều cao ô.',
                'Ô hiện thanh cuộn và kéo giãn được chiều cao, giao diện không bị vỡ; hộp '
                'thoại tự cuộn dọc khi nội dung dài.', None)
    d[c + 9] = ('1. Nhập "Chuỗi kết nối" có khoảng trắng ở đầu và cuối.\n2. %s' % b3,
                'Hệ thống tự cắt khoảng trắng hai đầu trước khi kiểm và trước khi lưu.', None)
    return d


SUA.update(_form(G_THEM, 'Thêm mới', sua=False))
SUA.update(_form(G_SUA, 'Cập nhật', sua=True))

# ── Hai nút của biểu mẫu + khối Chức năng + Hủy bỏ của CN Thêm / CN Sửa ──────
SUA.update({
307: ('1. Mở hộp thoại "Thêm target mới", quan sát nút bên trái ở cuối biểu mẫu.',
      'Nút ghi đúng chữ "Hủy", nền xám nhạt, chữ căn giữa, không sai chính tả.', None),
309: ('1. Mở hộp thoại "Thêm target mới", quan sát nút bên phải ở cuối biểu mẫu.\n'
      '2. Bấm nút và quan sát trong lúc chờ máy chủ trả lời.',
      '1. Nút ghi đúng chữ "Thêm mới", chữ căn giữa, không sai chính tả.\n'
      '2. Trong lúc đang lưu, nút đổi chữ thành "Đang lưu..." và bị vô hiệu cùng nút "Hủy".',
      None),
459: ('1. Mở hộp thoại "Sửa: {tên hiển thị}", quan sát nút bên trái ở cuối biểu mẫu.',
      'Nút ghi đúng chữ "Hủy", nền xám nhạt, chữ căn giữa, không sai chính tả.', None),
461: ('1. Mở hộp thoại "Sửa: {tên hiển thị}", quan sát nút bên phải ở cuối biểu mẫu.\n'
      '2. Bấm nút và quan sát trong lúc chờ máy chủ trả lời.',
      '1. Nút ghi đúng chữ "Cập nhật", chữ căn giữa, không sai chính tả.\n'
      '2. Trong lúc đang lưu, nút đổi chữ thành "Đang lưu..." và bị vô hiệu cùng nút "Hủy".',
      None),
# ── Chức năng Thêm mới ──
312: ('1. Nhập hợp lệ tất cả các ô, dùng đúng 250 ký tự cho Code, Tên hiển thị, Mô tả, '
      'Tên schema và Database mặc định.\n2. Click Thêm mới.',
      '1. Hiện thông báo nổi "Thêm target thành công".\n'
      '2. Hộp thoại đóng lại; bản ghi vừa tạo xuất hiện ở ĐẦU danh sách (thứ tự mặc định "Mới '
      'nhất trước").\n'
      '3. Bản ghi mới có trạng thái "Chờ kết nối" — máy chủ tự đặt, biểu mẫu không cho chọn.',
      None),
313: ('1. Nhập hợp lệ tất cả các ô.\n2. Click Thêm mới.\n'
      '3. Kiểm tra dữ liệu đang lưu:\n'
      'select * from <bảng vị trí lưu trữ>\n'
      'where deleted_at is null\n'
      'order by created_at desc\n'
      'limit 1;',
      'Bản ghi được lưu đúng với đầy đủ giá trị vừa nhập; phần cấu hình kết nối lưu thành một '
      'chuỗi ghép từ ô "Chuỗi kết nối" nối thêm cổng và tên cơ sở dữ liệu nếu hai ô đó được '
      'điền.', None),
314: ('1. Chỉ nhập 4 ô bắt buộc: Code, Tên hiển thị, Loại database, Chuỗi kết nối.\n'
      '2. Để trống Mô tả, Tên schema, Port mặc định, Database mặc định.\n3. Click Thêm mới.',
      '1. Hiện thông báo nổi "Thêm target thành công".\n'
      '2. Bản ghi xuất hiện ngoài danh sách; các cột Phiên bản, Port và Tags hiện dấu "—".\n'
      '3. Mở hộp thoại "Chi tiết target" thấy dòng "Mô tả" và "Schema" hiện dấu "—".', None),
315: ('1. Lần lượt bỏ trống (hoặc nhập toàn dấu cách) từng ô bắt buộc: Code, Tên hiển thị, '
      'Loại database, Chuỗi kết nối.\n2. Click Thêm mới sau mỗi lần.',
      '1. Ô Code, Tên hiển thị và Chuỗi kết nối bỏ trống thì hiện "Vui lòng không bỏ trống '
      'thông tin này" ngay dưới ô tương ứng.\n'
      '2. Ô Loại database chưa chọn thì hiện "Vui lòng chọn loại database".\n'
      '3. Không tạo bản ghi nào; bỏ trống nhiều ô cùng lúc thì báo lỗi cho TẤT CẢ các ô đó '
      'trong một lần bấm.', None),
316: ('1. Nhập đầy đủ, hợp lệ.\n2. Bấm chuột liên tục nhiều lần vào nút "Thêm mới".',
      'Ngay sau lần bấm đầu tiên nút đổi chữ thành "Đang lưu..." và bị vô hiệu; hệ thống không '
      'gửi yêu cầu nhiều lần — chỉ tạo đúng 1 bản ghi.', None),
317: ('1. Nhập đầy đủ, hợp lệ.\n'
      '2. Dùng phím Tab tới nút "Thêm mới" rồi nhấn Enter liên tục.',
      'Ngay sau lần Enter đầu tiên nút đổi chữ thành "Đang lưu..." và bị vô hiệu; chỉ tạo đúng '
      '1 bản ghi.', None),
318: ('1. Từ 2 tab (hoặc 2 máy) cùng nhập một giá trị Code giống nhau.\n2. Cùng bấm Thêm mới.',
      'Tab 1( Client 1) : hiện "Thêm target thành công".\n'
      'Tab 2( Client 2) : không tạo được, thông báo trùng mã do máy chủ trả về hiện bằng chữ '
      'đỏ ngay dưới ô "Code" — không tạo ra 2 bản ghi trùng mã.',
      V + 'Giao diện KHÔNG tự kiểm trùng; việc chặn hoàn toàn phụ thuộc máy chủ và bản chữ '
      'thông báo chưa xác nhận được.'),
320: ('1. Mở hộp thoại "Thêm target mới", nhập dữ liệu đầy đủ và hợp lệ.\n'
      '2. Bấm nút "Hủy" (hoặc dấu X ở góc trên bên phải, hoặc bấm ra vùng nền mờ).',
      'Hộp thoại đóng lại và mọi lỗi đang hiện được xoá; không tạo bản ghi nào, danh sách và '
      'bốn thẻ số liệu giữ nguyên như trước.', None),
# ── Chức năng Chỉnh sửa ──
464: ('1. Mở hộp thoại "Sửa: {tên hiển thị}" của một bản ghi KHÁC Hoạt động.\n'
      '2. Đổi hợp lệ Tên hiển thị, Mô tả, Loại database, Tên schema, dùng đúng 250 ký tự cho '
      'các ô chữ.\n'
      '3. Nhập lại đủ Chuỗi kết nối (ô này mở ra rỗng).\n4. Click Cập nhật.',
      '1. Hiện thông báo nổi "Cập nhật target thành công".\n'
      '2. Hộp thoại đóng lại; bản ghi ngoài danh sách hiển thị theo giá trị mới.', None),
465: ('1. Sửa dữ liệu rồi Click Cập nhật.\n'
      '2. Kiểm tra dữ liệu đang lưu:\n'
      "select * from <bảng vị trí lưu trữ> where id = '<mã bản ghi>';",
      'Bản ghi trong hệ thống được cập nhật đúng các giá trị mới; các trường không sửa giữ '
      'nguyên. Riêng phần cấu hình kết nối bị ghi đè theo nội dung ba ô của nhóm "Cấu hình kết '
      'nối" tại thời điểm bấm Cập nhật.',
      R + 'Ba ô của nhóm "Cấu hình kết nối" mở ra RỖNG khi sửa, nên chỉ sửa Tên hiển thị rồi '
      'lưu là ghi đè cấu hình kết nối cũ bằng chuỗi vừa gõ. Cần QA/BA xác nhận đây là lỗi.'),
466: ('1. Mở hộp thoại "Sửa: {tên hiển thị}".\n'
      '2. Chỉ sửa Tên hiển thị và chọn lại Loại database, giữ nguyên các ô còn lại.\n'
      '3. Click Cập nhật.',
      'Ghi lại đúng hành vi quan sát được: vì ô "Chuỗi kết nối" mở ra rỗng và là ô bắt buộc, '
      'bấm Cập nhật mà chưa nhập lại thì hiện "Vui lòng không bỏ trống thông tin này" ngay '
      'dưới ô đó và KHÔNG cập nhật được — không thể chỉ sửa một trường rồi lưu.',
      R + 'Không sửa được riêng một trường nếu chưa nhập lại chuỗi kết nối. Cần QA/BA xác '
      'nhận đây là lỗi.'),
467: ('1. Xoá trống lần lượt từng ô bắt buộc: Tên hiển thị, Loại database, Chuỗi kết nối '
      '(ô Code bị khoá nên không xoá được).\n2. Click Cập nhật sau mỗi lần.',
      '1. Ô Tên hiển thị và Chuỗi kết nối bỏ trống thì hiện "Vui lòng không bỏ trống thông tin '
      'này" ngay dưới ô tương ứng.\n'
      '2. Ô Loại database bỏ chọn thì hiện "Vui lòng chọn loại database".\n'
      '3. Không cập nhật bản ghi.', None),
468: ('1. Sửa hợp lệ.\n2. Bấm chuột liên tục nhiều lần vào nút "Cập nhật".',
      'Ngay sau lần bấm đầu tiên nút đổi chữ thành "Đang lưu..." và bị vô hiệu; hệ thống không '
      'gửi yêu cầu nhiều lần — chỉ cập nhật đúng 1 lần.', None),
469: ('1. Sửa hợp lệ.\n2. Dùng phím Tab tới nút "Cập nhật" rồi nhấn Enter liên tục.',
      'Ngay sau lần Enter đầu tiên nút đổi chữ thành "Đang lưu..." và bị vô hiệu; chỉ cập nhật '
      'đúng 1 lần.', None),
470: ('1. Từ 2 tab (hoặc 2 máy) cùng mở sửa hai bản ghi khác nhau và cùng đổi Tên hiển thị về '
      'một giá trị giống nhau.\n2. Cùng bấm Cập nhật.',
      'Tab 1( Client 1) : hiện "Cập nhật target thành công".\n'
      'Tab 2( Client 2) : ghi lại đúng phản hồi của máy chủ — chặn kèm thông báo trùng, hay '
      'vẫn lưu được hai bản ghi cùng tên.',
      V + 'Chưa có bằng chứng ô "Tên hiển thị" bị chặn trùng; giao diện không kiểm và tài liệu '
      'cũng không nêu. Cần dev/BA xác nhận.'),
472: ('1. Mở hộp thoại "Sửa: {tên hiển thị}", sửa dữ liệu ở một vài ô.\n'
      '2. Bấm nút "Hủy" (hoặc dấu X ở góc trên bên phải, hoặc bấm ra vùng nền mờ).',
      'Hộp thoại đóng lại và mọi lỗi đang hiện được xoá; bản ghi giữ nguyên dữ liệu cũ, danh '
      'sách không đổi.', None),
})

# ══════════════════ CN XEM CHI TIẾT VỊ TRÍ LƯU TRỮ ══════════════════
_CHITIET = (
    '[Tiêu đề popup] Chi tiết target\n'
    '1. Hiển thị chi tiết vị trí lưu trữ\n'
    '   nhóm "Thông tin cơ bản" — 14 dòng nhãn/giá trị: Code · Tên hiển thị · Mô tả · '
    'Loại DB · Phiên bản · Port · Schema · Mặc định · Trạng thái · Đang sử dụng · Tags · '
    'Tạo bởi · Ngày tạo · Cập nhật lúc\n'
    '   nhóm "Kết nối & Vault" — 3 dòng: Connection · Vault Path · Vault Keys')
SUA.update({
522: ('1. Bấm biểu tượng con mắt (chú thích "Xem chi tiết") ở cột Hành động của một bản ghi.\n'
      '2. Đối chiếu từng thành phần đang hiện trên hộp thoại với thiết kế:\n' + _CHITIET,
      'Hiển thị màn hình chức năng bao gồm các thông tin:\n' + _CHITIET
      + '\nTrong lúc đang tải hiện biểu tượng xoay kèm chữ "Đang tải...".',
      L + 'Tiêu đề hộp thoại là "Chi tiết target" và ba dòng cuối để nguyên chữ tiếng Anh '
      '"Connection" · "Vault Path" · "Vault Keys". Cần QA/BA chốt bản chữ tiếng Việt.'),
530: ('1. Mở "Chi tiết target" của bản ghi chưa khai Mô tả, Phiên bản, Port, Schema và Tags.',
      'Các dòng đó hiện dấu "—"; dòng "Mặc định" và "Đang sử dụng" hiện chữ "Không"; hai dòng '
      '"Connection" và "Vault Keys" chưa có giá trị cũng hiện dấu "—".', None),
531: ('1. Mở "Chi tiết target" của bản ghi đã khai đủ mọi thông tin.',
      '1. Đủ 14 dòng của nhóm "Thông tin cơ bản" và 3 dòng của nhóm "Kết nối & Vault" đều có '
      'giá trị, không dòng nào bỏ trống.\n'
      '2. Dòng "Trạng thái" hiện thẻ màu đúng mức Chờ kết nối / Hoạt động / Ngừng hoạt động; '
      'dòng "Mặc định" hiện thẻ "Mặc định"; dòng "Đang sử dụng" hiện thẻ "Đang dùng".\n'
      '3. Hai dòng "Ngày tạo" và "Cập nhật lúc" theo dạng ngày/tháng/năm giờ:phút.', None),
532: ('1. Mở "Chi tiết target" của bản ghi có Code và Tên hiển thị dài 250 ký tự, nhiều thẻ ở '
      'dòng Tags và chuỗi kết nối rất dài.',
      'Giá trị dài tự ngắt xuống dòng trong cột bên phải, không tràn ra ngoài khung; khối '
      '"Connection" hiện thanh cuộn ngang riêng; cả hộp thoại cuộn dọc được và không cao quá '
      '90% chiều cao màn hình.', None),
533: ('1. Mở "Chi tiết target" của một bản ghi.\n'
      '2. Đối chiếu từng dòng với chính bản ghi đó trên danh sách và với dữ liệu đang lưu.',
      'Các dòng Code · Tên hiển thị · Loại DB · Phiên bản · Port · Trạng thái · Tags khớp đúng '
      'giá trị đang hiện ở bảng danh sách; các dòng còn lại khớp dữ liệu đang lưu trong hệ '
      'thống.', None),
536: ('1. Bấm biểu tượng "Xem chi tiết" của một bản ghi ở trang 2, khi đang áp bộ lọc.\n'
      '2. Đóng hộp thoại bằng dấu X hoặc bấm ra vùng nền mờ.',
      'Mở đúng chi tiết bản ghi vừa chọn (hệ thống gọi riêng một lần đọc bản ghi đó); đóng lại '
      'thì quay về danh sách, giữ nguyên trang 2 và bộ lọc đang áp.', None),
537: ('1. Mở "Chi tiết target" của một bản ghi.\n'
      '2. Đối chiếu với dữ liệu đang lưu:\n'
      "select * from <bảng vị trí lưu trữ> where id = '<mã bản ghi>';",
      'Từng dòng trên hộp thoại chi tiết khớp chính xác với dữ liệu đang lưu trong hệ thống, '
      'kể cả phần cấu hình kết nối và hai dòng đường dẫn kho khoá.', None),
539: ('1. Để phiên đăng nhập hết hạn rồi bấm biểu tượng "Xem chi tiết".',
      'Hiện thông báo "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." và điều hướng về '
      'màn đăng nhập; không lộ thông tin chi tiết nào.', None),
541: ('1. Chuẩn bị một bản ghi có ô Tên hiển thị hoặc Mô tả chứa đoạn script HTML: <b>1</b>\n'
      '2. Mở hộp thoại "Chi tiết target" của bản ghi đó.',
      'Chuỗi hiển thị nguyên dạng như văn bản thường trên dòng tương ứng, trình duyệt không '
      'thực thi mã và không hiện hộp cảnh báo nào.', None),
})

# ══════ CN KÍCH HOẠT / NGỪNG HOẠT ĐỘNG — KHÔNG có hộp xác nhận ══════
# Bộ case gốc `quota_cases.STATUS_FN` giả định có hộp xác nhận (mẫu họ màn danh mục MOET).
# Màn này gọi máy chủ NGAY khi bấm biểu tượng -> viết lại theo hành vi thật, giữ nguyên tiêu đề
# case để không đụng mã case và lớp công thức.
_TT = [
    # (dòng case liệt kê giao diện, dòng case của nút, dòng đầu khối Chức năng, tên thao tác,
    #  chú thích icon, trạng thái nguồn, trạng thái đích, báo thành công, báo thất bại)
    (545, 553, 555, 'Kích hoạt', 'nút tam giác', 'Chờ kết nối hoặc Ngừng hoạt động',
     'Hoạt động', 'Đã kích hoạt target', 'Kích hoạt thất bại'),
    (570, 578, 580, 'Ngừng hoạt động', 'hai vạch dừng', 'Hoạt động và KHÔNG được sử dụng',
     'Ngừng hoạt động', 'Đã ngừng hoạt động target', 'Ngừng hoạt động thất bại'),
]
for _lk, _rn, _fn, _ten, _icon, _tu, _den, _ok, _fail in _TT:
    SUA[_lk] = (
        '1. Mở màn Vị trí lưu trữ.\n'
        '2. Đối chiếu từng thành phần đang hiện trên màn với thiết kế màn hình:\n'
        '1. [Nút bấm] %s\n'
        '   biểu tượng %s ở cột Hành động, chỉ hiện trên bản ghi %s'
        % (_ten, _icon, _tu),
        'Hiển thị màn hình chức năng bao gồm các thông tin:\n'
        '1. [Nút bấm] %s\n'
        '   biểu tượng %s ở cột Hành động, chỉ hiện trên bản ghi %s\n'
        '   thao tác này KHÔNG có hộp xác nhận: bấm biểu tượng là gọi máy chủ ngay'
        % (_ten, _icon, _tu),
        R + 'Thao tác %s không hỏi lại — bấm nhầm biểu tượng là đổi trạng thái ngay. Lưới chắn '
        'duy nhất là biểu tượng bị khoá trong lúc đang gọi máy chủ.' % _ten)
    SUA[_rn] = (
        '1. Mở màn Vị trí lưu trữ, tìm một bản ghi %s.\n'
        '2. Rê chuột lên biểu tượng %s ở cột Hành động của bản ghi đó.' % (_tu, _icon),
        'Chú thích hiện đúng chữ "%s", không sai chính tả; biểu tượng căn giữa trong ô và '
        'thẳng hàng với các biểu tượng còn lại của cột Hành động.' % _ten, None)
    SUA[_fn + 1] = (
        '1. Tìm một bản ghi %s.\n'
        '2. Bấm biểu tượng %s ở cột Hành động rồi quan sát ngay.' % (_tu, _icon),
        'Ghi lại đúng hành vi thật: màn KHÔNG mở hộp xác nhận nào — bấm biểu tượng là hệ thống '
        'gọi máy chủ đổi trạng thái ngay, nên KHÔNG có nút "Hủy" để hủy bỏ thao tác. Đánh '
        'trượt nếu xuất hiện hộp xác nhận không đúng thiết kế.',
        M + 'Mong đợi có hộp xác nhận trước khi %s, giống mọi thao tác Xoá của module. Hiện '
        'chưa có.' % _ten.lower())
    SUA[_fn + 2] = (
        '1. Bấm biểu tượng %s ở cột Hành động của một bản ghi %s.\n'
        '2. Tìm biểu tượng X để đóng hộp xác nhận.' % (_icon, _tu),
        'Ghi lại đúng hành vi thật: không có hộp xác nhận nào được mở nên không có biểu tượng '
        'X để đóng; hệ thống đã gọi máy chủ ngay từ lần bấm đầu.',
        M + 'Mong đợi có hộp xác nhận đóng được bằng biểu tượng X. Hiện chưa có.')
    SUA[_fn + 3] = (
        '1. Bấm biểu tượng %s ở cột Hành động của một bản ghi %s.\n'
        '2. Quan sát thông báo nổi, cột Trạng thái, thẻ số liệu và cột Hành động của bản ghi '
        'đó.' % (_icon, _tu),
        '1. Hiện thông báo nổi "%s" kèm dòng phụ là Tên hiển thị của bản ghi.\n'
        '2. Cột Trạng thái của bản ghi đổi sang thẻ "%s".\n'
        '3. Bộ biểu tượng ở cột Hành động đổi lại theo trạng thái mới.\n'
        '4. Bốn thẻ số liệu đầu màn cập nhật lại theo trạng thái mới.' % (_ok, _den), None)
    SUA[_fn + 4] = (
        '1. Thực hiện %s cho một bản ghi.\n'
        '2. Đưa bản ghi đó trở lại trạng thái cũ bằng biểu tượng tương ứng ở cột Hành động.'
        % _ten.lower(),
        'Đổi được cả hai chiều: bản ghi "%s" bấm biểu tượng đối ứng thì quay lại trạng thái '
        'trước đó, thông báo nổi và bộ biểu tượng ở cột Hành động đổi theo. Riêng bản ghi '
        '"Hoạt động" ĐANG ĐƯỢC SỬ DỤNG thì KHÔNG có biểu tượng Ngừng hoạt động nên không đổi '
        'ngược được.' % _den, None)
    SUA[_fn + 5] = (
        '1. Bấm liên tục nhiều lần vào biểu tượng %s của cùng một bản ghi.' % _icon,
        'Ngay sau lần bấm đầu tiên, mọi biểu tượng trên bản ghi đó bị khoá cho tới khi máy chủ '
        'trả lời; hệ thống không gửi yêu cầu nhiều lần và chỉ đổi trạng thái một lần.', None)
    SUA[_fn + 6] = (
        '1. Dùng phím Tab tới biểu tượng %s của một bản ghi %s.\n'
        '2. Nhấn Enter liên tục.' % (_icon, _tu),
        'Kết quả giống hệt khi bấm chuột: hệ thống không gửi yêu cầu nhiều lần, chỉ đổi trạng '
        'thái một lần và không báo lỗi.', None)
    SUA[_fn + 7] = (
        '1. Mở cùng một bản ghi %s trên 2 tab (hoặc 2 máy).\n'
        '2. Tab 1 (Client 1): bấm biểu tượng %s.\n'
        '3. Tab 2 (Client 2): bấm biểu tượng %s trên bản ghi đã cũ.' % (_tu, _icon, _icon),
        'Tab 1( Client 1) : đổi trạng thái thành công, hiện "%s".\n'
        'Tab 2( Client 2) : không đổi được, hiện "%s" — bản ghi đã đổi trạng thái trước đó.'
        % (_ok, _fail), None)

# ══════════════════════ CN XÓA VỊ TRÍ LƯU TRỮ ══════════════════════
_LIETKE_XOA = (
    '1. [Hộp xác nhận] Xóa vị trí lưu trữ\n'
    '   tiêu đề "Xóa target?", nút "Hủy" và nút "Xóa"\n'
    '2. [Hộp xác nhận] Xóa nhiều vị trí lưu trữ đã chọn\n'
    '   tiêu đề "Xóa {N} vị trí lưu trữ đã chọn?", nút "Huỷ" và nút "Xóa"\n'
    '3. [Nút bấm] Xóa tất cả\n'
    '   trên thanh hành động hàng loạt, phía trên bảng\n'
    '4. [Nút bấm] Hủy\n'
    '   trong hộp xác nhận xoá một bản ghi')
SUA.update({
595: ('1. Mở màn hình chức năng.\n'
      '2. Đối chiếu từng thành phần đang hiện trên màn với thiết kế màn hình:\n' + _LIETKE_XOA,
      'Hiển thị màn hình chức năng bao gồm các thông tin:\n' + _LIETKE_XOA,
      L + 'Nút huỷ của hai hộp viết KHÁC nhau: xoá một bản ghi là "Hủy", xoá nhiều là "Huỷ". '
      'Cần QA/BA chốt một cách viết.'),
603: ('1. Bấm biểu tượng thùng rác ở cột Hành động của một bản ghi.\n'
      '2. Đọc tiêu đề, nội dung và hai nút của hộp xác nhận.',
      '1. Tiêu đề: "Xóa target?"\n'
      '2. Nội dung: "Bạn sắp xóa {tên hiển thị} ({code}). Hành động này không thể hoàn tác. '
      'Các schema_designs đang dùng target này sẽ bị ảnh hưởng."\n'
      '3. Hai nút: "Hủy" và "Xóa" (nút Xóa nền đỏ).',
      M + 'Câu mô tả đang hiện nguyên chuỗi kỹ thuật "schema_designs" cho người dùng cuối; '
      'mong đợi đổi thành bản chữ tiếng Việt, ví dụ "các lược đồ đang dùng vị trí lưu trữ '
      'này".'),
604: ('1. Bấm biểu tượng thùng rác trên một bản ghi có Tên hiển thị dài 250 ký tự.\n'
      '2. Đọc câu mô tả trong hộp xác nhận.',
      'Câu mô tả nhắc đúng Tên hiển thị (in đậm) và Code (chữ dạng đều nét) của CHÍNH bản ghi '
      'đang chọn; tên dài tự ngắt dòng, không làm vỡ khung hộp thoại.', None),
605: ('1. Đọc tiêu đề, nội dung và nhãn hai nút của hộp xác nhận xoá một bản ghi.',
      'Không sai chính tả; chữ trong nút được căn giữa, hai nút thẳng hàng ở góc dưới bên '
      'phải; nút "Xóa" nền đỏ để cảnh báo hành động phá huỷ.', None),
607: ('1. Tích chọn từ 2 bản ghi KHÁC Hoạt động trở lên.\n'
      '2. Bấm nút "Xóa tất cả" trên thanh hành động.\n'
      '3. Đọc tiêu đề, nội dung và hai nút của hộp xác nhận.',
      '1. Tiêu đề: "Xóa {N} vị trí lưu trữ đã chọn?" với {N} là số bản ghi đang chọn.\n'
      '2. Nội dung: "Hành động này không thể hoàn tác."\n'
      '3. Hai nút: "Huỷ" và "Xóa" (nút Xóa nền đỏ).', None),
608: ('1. Tích chọn 3 bản ghi rồi bấm "Xóa tất cả".\n'
      '2. Bỏ bớt còn 2 bản ghi rồi bấm lại "Xóa tất cả".',
      'Con số {N} trên tiêu đề luôn bằng đúng số bản ghi đang được tích chọn; hộp này KHÔNG '
      'liệt kê tên từng bản ghi.',
      R + 'Hộp xác nhận xoá hàng loạt chỉ nêu số lượng, không nêu bản ghi nào — người dùng '
      'không đối chiếu được trước khi xoá.'),
609: ('1. Đọc tiêu đề, nội dung và nhãn hai nút của hộp xác nhận xoá nhiều bản ghi.',
      'Không sai chính tả; chữ trong nút được căn giữa, hai nút thẳng hàng. Lưu ý nút huỷ ở '
      'hộp này ghi "Huỷ" (dấu hỏi) trong khi hộp xoá một bản ghi ghi "Hủy" (dấu ngã).', None),
611: ('1. Tích chọn ít nhất một bản ghi để thanh hành động hiện ra.\n'
      '2. Quan sát nút "Xóa tất cả".',
      'Nút ghi đúng chữ "Xóa tất cả", có biểu tượng thùng rác nhỏ ở đầu, chữ và viền màu đỏ, '
      'chữ căn giữa, không sai chính tả.', None),
613: ('1. Bấm biểu tượng thùng rác trên một bản ghi.\n'
      '2. Quan sát nút bên trái của hộp xác nhận.',
      'Nút ghi đúng chữ "Hủy", chữ căn giữa, không sai chính tả.', None),
# ── Chức năng Xóa ──
616: ('1. Tìm một bản ghi đang Hoạt động (đang được dùng làm đích ghi dữ liệu).\n'
      '2. Quan sát cột Hành động của bản ghi đó.\n'
      '3. Tìm một bản ghi Hoạt động ĐANG ĐƯỢC SỬ DỤNG và quan sát cột Hành động.',
      '1. Bản ghi đang Hoạt động KHÔNG có biểu tượng thùng rác và cũng không có ô tích chọn — '
      'không có lối nào để xoá từ giao diện.\n'
      '2. Bản ghi Hoạt động đang được sử dụng chỉ còn duy nhất biểu tượng "Xem chi tiết".',
      None),
617: ('1. Tìm một bản ghi KHÁC Hoạt động (Chờ kết nối hoặc Ngừng hoạt động).\n'
      '2. Bấm biểu tượng thùng rác rồi bấm nút "Xóa" trong hộp xác nhận.',
      '1. Trong lúc xoá, nút đổi chữ thành "Đang xóa..." và bị vô hiệu.\n'
      '2. Hiện thông báo nổi "Xóa target thành công"; hộp thoại đóng lại.\n'
      '3. Bản ghi biến khỏi danh sách, "Tổng số bản ghi:" và bốn thẻ số liệu giảm đúng 1.',
      None),
618: ('1. Ghi lại mã bản ghi trước khi xoá.\n'
      '2. Thực hiện xoá bản ghi đó.\n'
      '3. Kiểm tra dữ liệu đang lưu:\n'
      "select id, deleted_at from <bảng vị trí lưu trữ> where id = '<mã bản ghi>';",
      'Bản ghi được đánh dấu thời điểm đã xoá (xoá mềm) hoặc bị xoá hẳn; biến khỏi danh sách '
      'trên màn. Ghi rõ cách xoá thật vào cột kết quả thực tế.', None),
619: ('1. Mở hộp xác nhận xoá của một bản ghi ở tab 1.\n'
      '2. Ở tab 2, xoá chính bản ghi đó.\n'
      '3. Quay lại tab 1 và bấm nút "Xóa".',
      'Hệ thống báo không tìm thấy bản ghi bằng dòng chữ đỏ ngay trong hộp xác nhận; hộp thoại '
      'KHÔNG tự đóng và danh sách không đổi.', None),
620: ('1. Bấm biểu tượng thùng rác trên một bản ghi.\n2. Bấm nút "Hủy" trong hộp xác nhận.',
      'Hộp thoại đóng lại; bản ghi không bị xoá và vẫn còn trong danh sách, "Tổng số bản ghi:" '
      'không đổi.', None),
621: ('1. Bấm biểu tượng thùng rác trên một bản ghi.\n'
      '2. Đóng hộp xác nhận bằng phím Esc hoặc bấm ra vùng nền mờ.',
      '1. Hộp thoại đóng lại, màn hình giữ nguyên và lỗi đang hiện (nếu có) được xoá.\n'
      '2. Bản ghi không bị xoá khỏi danh sách.', None),
622: ('1. Tích chọn từ 2 bản ghi KHÁC Hoạt động trở lên.\n'
      '2. Bấm nút "Xóa tất cả" trên thanh hành động.\n'
      '3. Bấm nút "Xóa" trong hộp xác nhận "Xóa {N} vị trí lưu trữ đã chọn?".',
      '1. Xoá hết thì hiện thông báo nổi "Đã xóa {N} mục"; các bản ghi đó không còn trong danh '
      'sách và thanh hành động ẩn đi.\n'
      '2. Có bản ghi xoá không được thì hiện "Xóa thất bại {d}/{N} mục" — thông báo chỉ nêu số '
      'lượng, KHÔNG nêu bản ghi nào hỏng.',
      R + 'Xoá hàng loạt gọi lệnh xoá LẶP từng bản ghi nên xoá được một phần vẫn xảy ra; '
      'thông báo không cho biết bản ghi nào thất bại.'),
623: ('1. Bấm biểu tượng thùng rác trên bản ghi.\n'
      '2. Bấm liên tục nhiều lần vào nút "Xóa" trong hộp xác nhận.',
      'Ngay sau lần bấm đầu tiên nút đổi chữ thành "Đang xóa..." và bị vô hiệu cùng nút "Hủy"; '
      'hệ thống không gửi yêu cầu nhiều lần, chỉ xoá một lần và không báo lỗi.', None),
624: ('1. Bấm biểu tượng thùng rác trên bản ghi.\n'
      '2. Dùng phím Tab tới nút "Xóa" rồi nhấn Enter liên tục.',
      'Kết quả giống hệt khi bấm chuột: nút đổi chữ thành "Đang xóa..." và bị vô hiệu, hệ '
      'thống chỉ xoá một lần.', None),
625: ('1. Mở cùng một bản ghi trên 2 tab (hoặc 2 máy) và bấm biểu tượng thùng rác ở cả hai.\n'
      '2. Tab 1 (Client 1): bấm nút "Xóa".\n3. Tab 2 (Client 2): bấm nút "Xóa".',
      'Tab 1( Client 1) : hiện "Xóa target thành công", bản ghi biến khỏi danh sách.\n'
      'Tab 2( Client 2) : không xoá được, hộp xác nhận hiện dòng chữ đỏ báo không tìm thấy bản '
      'ghi và không tự đóng.', None),
629: ('1. Để phiên đăng nhập hết hạn.\n2. Bấm biểu tượng thùng rác rồi bấm nút "Xóa".',
      'Hiện thông báo "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." và điều hướng về '
      'màn đăng nhập; bản ghi không bị xoá.', None),
})

# ── Cờ [RỦI RO] phân quyền cho mọi case ATTT "yêu cầu quyền" của các CN có ghi dữ liệu ──
for _rn in (322, 474, 564, 589, 627):
    _c, _d, _t = SUA.get(_rn, (None, None, None))
    SUA[_rn] = (_c, _d, T_QUYEN)


SUA[15] = (
    '1. Mở màn hình chức năng.\n2. Đối chiếu từng thành phần đang hiện trên màn với thiết kế màn hình:\n[Tiêu đề màn] Vị trí lưu trữ\n[Mô tả màn] Quản lý các database đích để ghi dữ liệu ingestion\n[Nút đầu màn] Thêm vị trí lưu trữ mới\n1. [Thẻ số liệu] Tổng vị trí lưu trữ\n2. [Thẻ số liệu] Hoạt động\n3. [Thẻ số liệu] Chờ kết nối\n4. [Thẻ số liệu] Ngừng hoạt động\n5. [Nút bấm] Làm mới dữ liệu\n6. [Nút bấm] Bỏ chọn\n7. [Bảng dữ liệu] Danh sách vị trí lưu trữ\n   Bảng đang tải thì hiện 3 vạch xám nhấp nháy (skeleton) thay cho các bản ghi\n8. [Checkbox] Bản ghi\n   Tích chọn bản ghi thì hiện thanh hành động gồm: Đã chọn {N} mục · Xóa tất cả · Bỏ chọn\n9. Icon\n   Cột Hành động gồm các icon: Xem chi tiết · Kích hoạt · Ngừng hoạt động · Chỉnh sửa · Xóa\n10. [Trường nhập] Số bản ghi trên trang\n11. [Danh sách chọn] Số bản ghi trên trang\n12. Phân trang\n'
    '3. Đối chiếu tiêu đề các cột của bảng danh sách: STT · Code · Tên hiển thị · Loại DB · Phiên bản · Port · Trạng thái · Tags · Hành động.',
    'Hiển thị màn hình chức năng bao gồm các thông tin:\n[Tiêu đề màn] Vị trí lưu trữ\n[Mô tả màn] Quản lý các database đích để ghi dữ liệu ingestion\n[Nút đầu màn] Thêm vị trí lưu trữ mới\n1. [Thẻ số liệu] Tổng vị trí lưu trữ\n2. [Thẻ số liệu] Hoạt động\n3. [Thẻ số liệu] Chờ kết nối\n4. [Thẻ số liệu] Ngừng hoạt động\n5. [Nút bấm] Làm mới dữ liệu\n6. [Nút bấm] Bỏ chọn\n7. [Bảng dữ liệu] Danh sách vị trí lưu trữ\n   Bảng đang tải thì hiện 3 vạch xám nhấp nháy (skeleton) thay cho các bản ghi\n8. [Checkbox] Bản ghi\n   Tích chọn bản ghi thì hiện thanh hành động gồm: Đã chọn {N} mục · Xóa tất cả · Bỏ chọn\n9. Icon\n   Cột Hành động gồm các icon: Xem chi tiết · Kích hoạt · Ngừng hoạt động · Chỉnh sửa · Xóa\n10. [Trường nhập] Số bản ghi trên trang\n11. [Danh sách chọn] Số bản ghi trên trang\n12. Phân trang\n'
    'Bảng danh sách đủ các cột: STT · Code · Tên hiển thị · Loại DB · Phiên bản · Port · Trạng thái · Tags · Hành động.',
    None)


def set_t(tc, rn, txt):
    """Ghi cột T (ghi chú BA-vs-Code). `tcfix.retext` chỉ lo B/C/D."""
    import re
    b = tc.rows[rn]['body']
    cm = re.search(r'<c r="T%d"[^>]*?(?:/>|>.*?</c>)' % rn, b, re.S)
    if not cm:
        return False
    st = re.search(r's="(\d+)"', cm.group(0))
    st = st.group(1) if st else '0'
    tc.rows[rn]['body'] = b.replace(
        cm.group(0),
        '<c r="T%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
        % (rn, st, tcfix.esc(txt)))
    return True


def main():
    apply_ = '--apply' in sys.argv
    tc = tcfix.load(os.path.normpath(XLSX))
    n_cd = n_t = 0
    # Bảng `SUA` khoá theo SỐ DÒNG của bản mà nó được soạn theo; bộ case đổi cấu trúc (hồ sơ
    # màn dời nhóm, chuỗi bơm thêm case) là mọi dòng phía sau trượt. Neo lại theo NỘI DUNG
    # (CN · nhóm · tiêu đề) nhờ `a6-<Màn>.neo.json`; case nào không tra ra thì báo rồi đi tiếp,
    # KHÔNG giết cả chuỗi sinh — mất vài case nội dung thật vẫn hơn mất trắng cả bộ.
    import qalib as _q
    SUA_, truot = _q.neo_a6(tc, SUA, _q.doc_neo(os.path.abspath(__file__)))
    if truot:
        print('   !! %d case không neo được (bộ case đã đổi) — BỎ QUA, rà lại bằng tay:'
              % len(truot))
        for _rn, _t in truot[:12]:
            print('      r%-4d %s' % (_rn, _t[:64]))
    # Tên CN của từng dòng — lưới chắn dùng chung cần nó để phân biệt case `giá trị mặc định`
    # ở CN SỬA (phải là bản chữ chuẩn) với cùng tiêu đề đó ở CN THÊM MỚI (tả ô rỗng).
    _cn_cua = {}
    _cn = None
    for _r in tc.order:
        if _r < 12:
            continue
        if tc.lvl(_r) == 'cn':
            _cn = (tc.c(_r, 'B') or '').split('\n')[0].strip()
        else:
            _cn_cua[_r] = _cn
    for rn in sorted(SUA_):
        c, d, t = SUA_[rn]
        if not tc.c(rn, 'C'):
            continue
        # ⚠️ ĐI QUA LƯỚI CHẮN DÙNG CHUNG (vá 2026-09-14). Khuôn bảng `SUA` trước đây ghi THẲNG,
        #    nên mọi phép chặn thêm vào `qalib.a6_chan_ghi` (rò code · lạc mục đích · bản chữ
        #    chuẩn của case mặc định) đều VÔ HIỆU với script kiểu này — đo được: chạy lại A6
        #    làm 3 case `giá trị mặc định` của màn bật lại văn dài ngay sau khi vừa dọn.
        _chan = _q.a6_chan_ghi((tc.c(rn, 'B') or '').strip(), c, d,
                                  tc.c(rn, 'C'), tc.c(rn, 'D'), _cn_cua.get(rn))
        if _chan:
            print('   r%-4d BỎ: %s' % (rn, _chan))
            continue
        if c is not None or d is not None:
            tc.retext(rn, None, c, d)
            n_cd += 1
        if t is not None:
            set_t(tc, rn, t)
            n_t += 1
        print('   r%-4d %s' % (rn, (tc.c(rn, 'B') or '').split('\n')[0][:64]))
    print('\n=== A6 Vị trí lưu trữ: %d case sửa cột C/D · %d case ghi cột T ===' % (n_cd, n_t))
    if not apply_:
        print('(XEM TRƯỚC — thêm --apply để ghi)')
        return
    import qalib
    qalib.backup(tc.path, tag='truoc_a6_vitriluutru')
    # `retext` chỉ đổi nội dung ô trong bộ nhớ; phải qua `rebuild` mới dựng lại sheet để `save`.
    # Plan khởi tạo RỖNG -> quên keep là XOÁ SẠCH nội dung file (bẫy đã ghi ở README).
    pl = tcfix.Plan(tc).keep_range(12, max(tc.order))
    tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)
    print('ĐÃ GHI -> %s' % os.path.normpath(XLSX))
    print('⚠️  BẮT BUỘC chạy tiếp: python3 ../../../tools/formula_layer.py <file> '
          '(rebuild đã ghi đè cột A thành chữ chay)')


main()

# -*- coding: utf-8 -*-
"""BƯỚC A6 của màn "Nhóm nguồn" — phần tool KHÔNG làm thay được.

HDSD §3 A6: sau khi khung đã sạch 13 bộ rà, phải sửa TAY cột C/D theo dữ kiện đã ground
(thông báo verbatim · giới hạn thật · hành vi thật của FE) và gắn cờ cho chỗ chưa chốt được.
Script này chỉ ghi ĐÈ cột C/D/T của những dòng đã liệt kê — KHÔNG thêm/xoá/đổi tên case, nên
mã case và lớp công thức không đổi. Chạy lại được nhiều lần (idempotent).

Căn cứ: hồ sơ màn `Testcase-Role-ChuyenVien-NhomNguon.json` khoá `grounding`
(chunk FE SourceGroupsPage-DBe9gFEb.js + TKCT §13 UC-QLKB-03 + ảnh chụp màn thật).

    python3 a6-NhomNguon.py            # XEM TRƯỚC
    python3 a6-NhomNguon.py --apply    # ghi
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

XLSX = os.path.join(HERE, '..', 'testcase', 'Testcase-Role-ChuyenVien-NhomNguon.xlsx')

V = '✿✿ [CẦN VERIFY] '
M = '✿✿ [YÊU CẦU MONG ĐỢI] '
R = '✿✿ [RỦI RO] '

# {dòng: (cột C hoặc None, cột D hoặc None, cột T hoặc None)}
SUA = {
# ══════════════════ CN DANH SÁCH NHÓM NGUỒN ══════════════════
# ── Thẻ số liệu: ba thẻ đếm trên TOÀN BỘ danh sách đã tải, không phải trên một bản ghi ──
23: ('1. Mở màn Nhóm nguồn, chưa lọc và chưa tìm kiếm gì.\n'
     '2. Đọc nhãn và giá trị trên thẻ đầu tiên.',
     'Thẻ hiện nhãn "TỔNG NHÓM NGUỒN" (chữ in hoa) và một con số nguyên; nhãn đúng chính tả, '
     'giá trị không kèm đơn vị nào khác.', None),
24: ('1. Đọc con số trên thẻ TỔNG NHÓM NGUỒN.\n'
     '2. Đối chiếu với "Tổng số bản ghi:" ở thanh phân trang khi KHÔNG áp bộ lọc nào.',
     'Hai con số bằng nhau và bằng tổng số nhóm nguồn hệ thống trả về; thẻ đếm trên toàn bộ '
     'danh sách, KHÔNG đổi theo bộ lọc hay từ khoá đang áp.', None),
25: ('1. Đăng nhập bằng tài khoản/môi trường mà danh sách nhóm nguồn chưa có bản ghi nào.',
     'Thẻ TỔNG NHÓM NGUỒN hiện số 0; bảng danh sách hiện dòng chữ "Chưa có nhóm nguồn nào" '
     'kèm nút "+ Thêm nhóm"; không hiện từ ngữ kỹ thuật thay cho giá trị rỗng.', None),
26: ('1. Chuẩn bị danh sách có rất nhiều bản ghi (từ 1000 trở lên).\n'
     '2. Quan sát con số trên thẻ TỔNG NHÓM NGUỒN và độ rộng của cả ba thẻ.',
     'Số lớn hiển thị trọn vẹn trong thẻ, không tràn và không đẩy lệch hai thẻ bên cạnh; '
     'ba thẻ vẫn chia đều chiều ngang.', None),
28: ('1. Mở màn Nhóm nguồn, chưa lọc và chưa tìm kiếm gì.\n'
     '2. Đọc nhãn và giá trị trên thẻ thứ hai.',
     'Thẻ hiện nhãn "ĐANG HOẠT ĐỘNG" (chữ in hoa) và một con số nguyên; nhãn đúng chính tả.',
     None),
29: ('1. Đọc con số trên thẻ ĐANG HOẠT ĐỘNG.\n'
     '2. Lọc Trạng thái = Đang hoạt động rồi đọc "Tổng số bản ghi:" ở thanh phân trang.',
     'Hai con số bằng nhau: thẻ đếm đúng số nhóm nguồn có trạng thái Đang hoạt động trên toàn '
     'bộ danh sách.', None),
30: ('1. Chuẩn bị dữ liệu không còn nhóm nguồn nào ở trạng thái Đang hoạt động.',
     'Thẻ ĐANG HOẠT ĐỘNG hiện số 0, không để trống và không hiện dấu gạch.', None),
31: ('1. Chuẩn bị danh sách có rất nhiều bản ghi Đang hoạt động (từ 1000 trở lên).\n'
     '2. Quan sát con số trên thẻ ĐANG HOẠT ĐỘNG.',
     'Số lớn hiển thị trọn vẹn trong thẻ, không tràn và không đẩy lệch các thẻ bên cạnh.', None),
33: ('1. Mở màn Nhóm nguồn, chưa lọc và chưa tìm kiếm gì.\n'
     '2. Đọc nhãn và giá trị trên thẻ thứ ba.',
     'Thẻ hiện nhãn "KHÔNG HOẠT ĐỘNG / LƯU TRỮ" (chữ in hoa) và một con số nguyên; nhãn đúng '
     'chính tả, dấu gạch chéo có khoảng trắng hai bên như thiết kế.', None),
34: ('1. Đọc con số trên thẻ KHÔNG HOẠT ĐỘNG / LƯU TRỮ.\n'
     '2. Lọc Trạng thái = Không hoạt động, ghi lại tổng số bản ghi.\n'
     '3. Lọc Trạng thái = Đã lưu trữ, ghi lại tổng số bản ghi.',
     'Con số trên thẻ bằng TỔNG của hai lần lọc ở bước 2 và 3 — thẻ gộp cả hai trạng thái '
     'Không hoạt động và Đã lưu trữ; cộng với thẻ ĐANG HOẠT ĐỘNG thì bằng thẻ TỔNG NHÓM NGUỒN.',
     None),
35: ('1. Chuẩn bị dữ liệu mà mọi nhóm nguồn đều Đang hoạt động.',
     'Thẻ KHÔNG HOẠT ĐỘNG / LƯU TRỮ hiện số 0, không để trống và không hiện dấu gạch.', None),
36: ('1. Chuẩn bị danh sách có rất nhiều bản ghi không hoạt động (từ 1000 trở lên).\n'
     '2. Quan sát con số và nhãn dài trên thẻ KHÔNG HOẠT ĐỘNG / LƯU TRỮ.',
     'Số lớn và nhãn dài hiển thị trọn vẹn trong thẻ, không tràn, không cắt chữ và không đẩy '
     'lệch hai thẻ bên cạnh.', None),
# ── Button Làm mới dữ liệu ──
38: ('1. Trên màn Nhóm nguồn.\n'
     '2. Kiểm tra hiển thị nút Làm mới dữ liệu.',
     'Nút hình tròn viền màu nhấn, mang biểu tượng mũi tên xoay, nằm ở cuối thanh lọc phía bên '
     'phải ô tìm kiếm; rê chuột vào hiện chú thích "Làm mới dữ liệu".', None),
39: ('1. Trên màn Nhóm nguồn, không áp bộ lọc và không nhập từ khoá.\n'
     '2. Click nút Làm mới dữ liệu.',
     '1. Hệ thống gọi lại dịch vụ lấy danh sách nhóm nguồn và vẽ lại bảng theo dữ liệu mới nhất.\n'
     '2. Hiện thông báo nổi "Đã làm mới".\n'
     '3. Dòng chữ "Cập nhật: {d/m/yyyy hh:mm}" bên trên bảng đổi sang thời điểm vừa bấm.', None),
40: ('1. Trên màn Nhóm nguồn, chọn Trạng thái và nhập từ khoá tìm kiếm (từ 3 ký tự trở lên).\n'
     '2. Click nút Làm mới dữ liệu.',
     'Danh sách được tải lại nhưng vẫn giữ nguyên trạng thái đang lọc và từ khoá đang tìm; '
     'kết quả sau khi làm mới vẫn chỉ gồm bản ghi khớp bộ lọc/từ khoá đó.', None),
41: ('1. Trên màn Nhóm nguồn, danh sách có nhiều trang, đang đứng ở Trang 2 (hoặc đã đổi số bản '
     'ghi/trang khác mặc định).\n'
     '2. Click nút Làm mới dữ liệu.',
     'Hệ thống tải lại dữ liệu, giữ nguyên số trang đang đứng và số bản ghi/trang đang chọn; '
     'chỉ khi số bản ghi sau khi tải lại ít đi làm trang hiện tại vượt quá số trang thì hệ '
     'thống mới tự lùi về trang cuối cùng còn dữ liệu.', None),
42: ('1. Trên màn Nhóm nguồn, bấm nút Làm mới dữ liệu.\n'
     '2. Quan sát nút và bảng dữ liệu trong lúc chờ phản hồi từ máy chủ.',
     '1. Biểu tượng trên nút Làm mới dữ liệu xoay tròn trong lúc chờ.\n'
     '2. Nút bị vô hiệu, bấm thêm không có tác dụng.\n'
     '3. Vùng bảng hiện ba vạch xám nhấp nháy thay cho các dòng dữ liệu cho tới khi có kết quả.',
     None),
43: ('1. Ngắt kết nối Internet của thiết bị.\n'
     '2. Bấm nút Làm mới dữ liệu.',
     '1. Hệ thống hiện màn báo mất kết nối với dòng chữ "Bạn đang ngoại tuyến" và "Không thể '
     'kết nối đến máy chủ. Một số dữ liệu có thể không được cập nhật. Vui lòng kiểm tra kết nối '
     'internet và thử lại."\n'
     '2. Hoặc hiện dòng chữ đỏ báo lỗi ngay dưới ba thẻ số liệu (không phải thông báo nổi).\n'
     '3. Dữ liệu cũ trên bảng không bị xoá trắng.',
     V + 'Màn ngoại tuyến là thành phần dùng chung của ứng dụng; cần chốt với dev màn Nhóm nguồn '
     'rơi vào nhánh nào khi mất mạng.'),
# ── Button Bỏ chọn ──
45: ('1. Tích chọn ít nhất một bản ghi để thanh hành động hàng loạt hiện ra.\n'
     '2. Quan sát nút "Bỏ chọn" bên phải nút "Xóa tất cả".',
     'Đúng chính tả, chữ trong nút được căn giữa; nút chỉ hiện khi đang có bản ghi được tích '
     'chọn và nằm cùng hàng với dòng chữ "Đã chọn {N} mục".', None),
# ── Danh sách ──
48: ('1. Đối chiếu tiêu đề từng cột của bảng với nhãn của trường tương ứng trong biểu mẫu '
     'Thêm/Chỉnh sửa nhóm nguồn.\n'
     '2. Kiểm chính tả và cách viết hoa của từng tiêu đề cột.',
     'Bảng có đúng 6 cột theo thứ tự: STT · Code · Tên hiển thị · Trạng thái · Ngày tạo · '
     'Hành động (kèm một cột ô tích chọn không có tiêu đề chữ, đặt giữa STT và Code); tiêu đề '
     'đúng nhãn nghiệp vụ, không viết tắt lạ, không sai chính tả.', None),
49: ('1. Nhập từ khoá hoặc chọn Trạng thái sao cho không còn bản ghi nào khớp.\n'
     '2. Bỏ hết bộ lọc, xem lại màn ở môi trường chưa có dữ liệu.',
     '1. Khi đang lọc mà không khớp: hiện biểu tượng mờ kèm dòng chữ "Không có nhóm nguồn khớp '
     'bộ lọc", KHÔNG hiện nút thêm mới.\n'
     '2. Khi danh sách rỗng hoàn toàn: hiện biểu tượng mờ kèm dòng chữ "Chưa có nhóm nguồn nào" '
     'và nút "+ Thêm nhóm" ngay bên dưới.', None),
53: ('1. Chuẩn bị bản ghi có Code và Tên hiển thị rất dài (tới 250 ký tự).\n'
     '2. Xem bản ghi đó trên danh sách.',
     'Giá trị dài không làm tràn cột, không đẩy lệch các cột khác; cột Hành động vẫn ghim ở '
     'cuối bảng, bảng cuộn ngang khi cần.', None),
54: ('1. Bấm biểu tượng Chỉnh sửa ở cột Hành động của một bản ghi.\n'
     '2. Đóng lại, bấm tiếp biểu tượng Xóa của bản ghi đó.',
     'Cả hai thao tác đều mở hộp thoại NGAY TẠI MÀN, không rời khỏi trang Nhóm nguồn và không '
     'đổi địa chỉ trên trình duyệt: Chỉnh sửa mở biểu mẫu "Chỉnh sửa: {tên hiển thị}", Xóa mở '
     'hộp xác nhận "Xóa nhóm nguồn?".', None),
# ── Checkbox bản ghi ──
59: ('1. Tích vào ô tích chọn ở hàng tiêu đề của bảng khi danh sách có nhiều hơn một trang.',
     'Chỉ các bản ghi CỦA TRANG ĐANG XEM được tích, không phải toàn bộ kết quả lọc; dòng chữ '
     '"Đã chọn {N} mục" hiện đúng bằng số bản ghi của trang đang xem.',
     R + 'Ô tích ở hàng tiêu đề chỉ tác động lên trang đang xem — người dùng dễ tưởng đã chọn '
     'hết toàn bộ kết quả lọc.'),
61: ('1. Tích chọn vài bản ghi ở trang 1.\n'
     '2. Chuyển sang trang 2, ghi lại số trên dòng "Đã chọn {N} mục".\n'
     '3. Quay lại trang 1.\n'
     '4. Đổi Trạng thái đang lọc hoặc đổi từ khoá tìm kiếm.',
     '1-3. Đổi trang KHÔNG làm mất lựa chọn: các bản ghi đã tích ở trang 1 vẫn còn tích khi quay '
     'lại, số trên "Đã chọn {N} mục" giữ nguyên trong suốt quá trình đổi trang.\n'
     '4. Đổi bộ lọc hoặc từ khoá thì hệ thống BỎ hết lựa chọn, thanh hành động hàng loạt ẩn đi.',
     None),
64: ('1. Quan sát biểu tượng Xóa ở cột Hành động.',
     'Biểu tượng Xóa (hình thùng rác) hiển thị màu đỏ, khác màu với biểu tượng Chỉnh sửa.', None),
# ── Textbox Số bản ghi trên trang ──
74: ('1. Xem ô nhập số bản ghi trên trang ở thanh phân trang cuối bảng.',
     'Ô hiện sẵn số 20 — mức mặc định của màn.', None),
77: ('1. Xoá trắng ô số bản ghi trên trang (hoặc nhập 0) rồi rời ô.',
     'Hệ thống hiện dòng chữ báo lỗi "Số bản ghi/trang phải lớn hơn 0" ngay tại thanh phân '
     'trang và giữ nguyên số bản ghi/trang đang áp; không hiển thị 0 bản ghi.', None),
78: ('1. Nhập một giá trị lớn hơn 1000 (ví dụ 1001) vào ô số bản ghi trên trang rồi rời ô.',
     'Hệ thống hiện thông báo nổi cảnh báo "Số bản ghi/trang tối đa 1000 bản ghi" và tự đưa ô '
     'về đúng số bản ghi/trang đang áp trước đó.', None),
79: ('1. Nhập đúng một trong các mức có sẵn ở nút chọn nhanh (20, 50, 100, 200, 500) vào ô số '
     'bản ghi trên trang rồi rời ô.',
     'Danh sách hiển thị theo đúng mức vừa nhập; mở cụm "Chọn nhanh số bản ghi" thì mức tương '
     'ứng được tô đậm là đang chọn.', None),
80: ('1. Nhập một giá trị không khớp mức nào trong cụm chọn nhanh (ví dụ 37) vào ô số bản ghi '
     'trên trang rồi rời ô.',
     'Danh sách hiển thị đúng 37 bản ghi mỗi trang; mở cụm "Chọn nhanh số bản ghi" thì không '
     'mức nào được tô đậm.', None),
# ── Selectbox Số bản ghi trên trang ──
85: ('1. Bấm mở cụm "Chọn nhanh số bản ghi" ở thanh phân trang.',
     'Mức 20 đang được tô đậm là mức mặc định của màn.', None),
86: ('1. Bấm mở cụm "Chọn nhanh số bản ghi".',
     'Danh sách hiện đúng 5 mức theo thứ tự: 20 · 50 · 100 · 200 · 500; chỉ chọn được một mức, '
     'chọn xong thì danh sách tự đóng.', None),
# ── Chức năng Danh sách ──
107: ('1. Mở màn Nhóm nguồn, ghi lại các dòng đang hiển thị và tổng số bản ghi.\n2. Đối chiếu '
      'với dữ liệu hệ thống trả về ở dịch vụ danh sách nhóm nguồn của máy chủ.\n3. Đối chiếu '
      'tiếp với CSDL:\nselect * from <bảng dữ liệu của màn>\nwhere deleted_at is null\norder by '
      'created_at desc;',
      'Số dòng và từng cột (Code · Tên hiển thị · Trạng thái · Ngày tạo) khớp chính xác với dữ '
      'liệu nhóm nguồn trong hệ thống; thứ tự các dòng đúng như thứ tự hệ thống trả về.', None),
# ══════════════════ CN TÌM KIẾM & LỌC NHÓM NGUỒN ══════════════════
127: ('1. Mở màn Nhóm nguồn, xem ô lọc Trạng thái khi chưa chọn gì.',
      'Ô hiện chữ gợi ý "-- Chọn trạng thái --"; chưa áp bộ lọc trạng thái nào nên danh sách '
      'hiện đủ mọi trạng thái.', None),
128: ('1. Bấm mở ô lọc Trạng thái.\n'
      '2. Đối chiếu danh sách lựa chọn với các trạng thái đang có trong hệ thống.',
      'Danh sách hiện đúng 3 lựa chọn: Đang hoạt động · Không hoạt động · Đã lưu trữ; mỗi dòng '
      'có dấu tích ở đầu cho biết đang chọn hay chưa.', None),
129: ('1. Mở ô lọc Trạng thái nhiều lần và so thứ tự các lựa chọn.',
      'Thứ tự luôn là Đang hoạt động · Không hoạt động · Đã lưu trữ, không xáo trộn giữa các '
      'lần mở.', None),
130: ('1. Chọn Đang hoạt động, quan sát danh sách.\n'
      '2. Chọn thêm Không hoạt động rồi Đã lưu trữ, quan sát sau mỗi lần chọn.',
      '1. Ô cho chọn nhiều trạng thái cùng lúc, KHÔNG tự đóng sau mỗi lần chọn; mỗi trạng thái '
      'đã chọn hiện thành một thẻ nhỏ trên ô.\n'
      '2. Danh sách còn lại các bản ghi thuộc BẤT KỲ trạng thái nào đang chọn (quan hệ HOẶC); '
      'sau mỗi lần đổi, phân trang quay về trang 1 và các bản ghi đang tích chọn bị bỏ chọn hết.',
      None),
131: ('1. Đang chọn nhiều trạng thái, bấm lại đúng một trạng thái đang chọn.\n'
      '2. Bấm dấu X ở bên phải ô lọc.',
      '1. Bấm lại đúng trạng thái đang chọn thì bỏ chọn riêng trạng thái đó, các trạng thái còn '
      'lại giữ nguyên và danh sách lọc lại theo phần còn lại.\n'
      '2. Bấm dấu X thì ô trở về "-- Chọn trạng thái --" và danh sách hiện lại đủ mọi trạng thái.',
      None),
132: ('1. Mở ô lọc Trạng thái, xem cụm ba nút nhỏ xếp dọc ở mép phải danh sách.\n'
      '2. Bấm lần lượt nút "Chọn tất cả" rồi nút "Bỏ chọn tất cả".\n'
      '3. Chọn vài trạng thái rồi bấm nút thứ ba "Chỉ xem đã chọn".',
      '1. "Chọn tất cả" tích hết các trạng thái ĐANG HIỆN trong danh sách (đang gõ trong hộp tìm '
      'thì chỉ tích các lựa chọn còn lại).\n'
      '2. "Bỏ chọn tất cả" đưa ô về trạng thái chưa chọn gì.\n'
      '3. "Chỉ xem đã chọn" thu danh sách còn đúng các trạng thái đang chọn, chú thích nút đổi '
      'thành "Xem tất cả"; bấm lần nữa thì hiện lại đủ 3 lựa chọn.', None),
133: ('1. Chọn cả 3 trạng thái và quan sát ô lọc.\n'
      '2. Chọn trạng thái có nhãn dài nhất ("Đang hoạt động") và quan sát độ rộng ô.',
      '1. Ô hiện tối đa 4 thẻ; màn chỉ có 3 trạng thái nên cả 3 thẻ hiện đủ, không xuất hiện chữ '
      'rút gọn "... {N} lựa chọn".\n'
      '2. Độ rộng ô lọc không đổi theo độ dài nhãn (cố định 200px); nhãn quá khổ bị cắt bớt kèm '
      'dấu ba chấm.', None),
134: ('1. Mở ô lọc Trạng thái và xem cách căn lề các lựa chọn.',
      'Các lựa chọn căn lề trái, dấu tích đặt trước nhãn; lựa chọn đang chọn được tô nền xám và '
      'in đậm để phân biệt.', None),
135: ('1. Mở ô lọc Trạng thái.\n'
      '2. Cuộn danh sách lựa chọn tới cuối.\n'
      '3. Ghi lại cách ô nạp dữ liệu.',
      'Danh sách trạng thái là bộ giá trị cố định gồm đúng 3 lựa chọn, đổ hết một lần ngay khi '
      'mở ô — không tải thêm theo trang, không có hiệu ứng chờ.', None),
136: ('1. Bấm mở ô lọc Trạng thái.\n'
      '2. Gõ vào hộp tìm bên trong trọn tên một lựa chọn: "Đã lưu trữ".',
      'Danh sách chỉ còn đúng lựa chọn "Đã lưu trữ"; chọn được bình thường và các trạng thái '
      'đang chọn trước đó không bị mất.', None),
137: ('1. Bấm mở ô lọc Trạng thái.\n'
      '2. Gõ vào hộp tìm một phần của nhãn, ví dụ "hoạt".',
      'Danh sách còn lại mọi lựa chọn có nhãn CHỨA chuỗi vừa gõ (Đang hoạt động · Không hoạt '
      'động), giữ đúng thứ tự ban đầu.', None),
138: ('1. Bấm mở ô lọc Trạng thái.\n'
      '2. Gõ vào hộp tìm "LƯU TRỮ" (chữ hoa), ghi lại kết quả.\n'
      '3. Xoá đi và gõ lại "lưu trữ" (chữ thường).',
      'Hai lần gõ cho ra cùng một danh sách lựa chọn.', None),
139: ('1. Bấm mở ô lọc Trạng thái.\n'
      '2. Gõ vào hộp tìm "hoạt động" (có dấu), ghi lại kết quả.\n'
      '3. Xoá đi và gõ lại "hoat dong" (bỏ hết dấu).',
      'Cả hai lần đều ra cùng danh sách lựa chọn: gõ không dấu vẫn tìm được lựa chọn có dấu; '
      'chữ "đ" gõ thành "d" cũng vẫn khớp.', None),
141: ('1. Mở màn Nhóm nguồn, xem ô tìm kiếm ở giữa thanh lọc.',
      'Ô trống, hiện chữ gợi ý "Tìm kiếm theo mã, tên hiển thị..." kèm biểu tượng kính lúp bên '
      'trái; chưa áp từ khoá nào.', None),
142: ('1. Nhập vào ô tìm kiếm chuỗi có ký tự đặc biệt và thẻ html, ví dụ <b>1</b>, từ 3 ký tự '
      'trở lên.\n'
      '2. Nhấn Enter.',
      'Hệ thống tìm bình thường trên hai cột Code và Tên hiển thị; chuỗi vừa nhập hiển thị '
      'nguyên dạng trong ô, không bị thực thi; không khớp bản ghi nào thì bảng hiện dòng chữ '
      '"Không có nhóm nguồn khớp bộ lọc".', None),
144: ('1. Sao chép một Code hoặc Tên hiển thị đang có (từ 3 ký tự trở lên).\n'
      '2. Dán vào ô "Tìm kiếm theo mã, tên hiển thị...".',
      'Ô nhận đúng nội dung vừa dán, không lỗi phông; sau khoảng 1,5 giây (hoặc ngay khi nhấn '
      'Enter) danh sách lọc còn đúng bản ghi tương ứng.', None),
147: ('1. Nhập từ khoá có khoảng trắng ở đầu và cuối, và hai khoảng trắng liền nhau ở giữa.\n'
      '2. Rời khỏi ô (hoặc nhấn Enter).',
      '1. Khoảng trắng ở ĐẦU bị loại ngay khi gõ — không gõ được khoảng trắng đầu chuỗi.\n'
      '2. Hai khoảng trắng liền nhau tự gộp thành một.\n'
      '3. Khoảng trắng ở cuối gõ được nhưng hệ thống chưa lọc; rời ô hoặc nhấn Enter thì cắt bỏ '
      'rồi mới lọc, kết quả đúng như khi gõ từ khoá không có khoảng trắng thừa.', None),
150: ('1. Truy cập màn Nhóm nguồn.\n'
      '2. Không nhập từ khoá và không chọn trạng thái nào.',
      'Hệ thống hiện toàn bộ danh sách nhóm nguồn, 20 bản ghi mỗi trang, sắp xếp theo đúng thứ '
      'tự hệ thống trả về; thanh phân trang hiện "Tổng số bản ghi:" bằng tổng số nhóm nguồn.',
      None),
151: ('1. Nhập từ khoá không khớp bản ghi nào (từ 3 ký tự trở lên), hoặc chọn trạng thái không '
      'có bản ghi nào.\n'
      '2. Nhấn Enter.',
      'Bảng hiện biểu tượng mờ kèm dòng chữ "Không có nhóm nguồn khớp bộ lọc"; thanh phân trang '
      'hiện Tổng số bản ghi: 0; KHÔNG hiện nút thêm mới.', None),
152: ('1. Chọn Trạng thái và nhập từ khoá cùng lúc, sao cho có bản ghi thoả mãn cả hai.\n'
      '2. Nhấn Enter.',
      'Danh sách chỉ còn bản ghi thoả mãn ĐỒNG THỜI cả hai điều kiện: đúng trạng thái đang chọn '
      'VÀ Code hoặc Tên hiển thị có chứa từ khoá.', None),
153: ('1. Nhập điều kiện tìm kiếm 1 -> ra n bản ghi:\n'
      '   - Trạng thái: Đang hoạt động\n'
      '   - Từ khoá: một phần Code, ví dụ "bo-"\n'
      '2. Đổi sang điều kiện tìm kiếm 2 cũng ra n bản ghi:\n'
      '   - Trạng thái: Đang hoạt động\n'
      '   - Từ khoá: một phần Tên hiển thị, ví dụ "Giáo dục"',
      'Hiển thị n bản ghi nhưng là các bản ghi thoả mãn tiêu chí 2, không giữ lại kết quả của '
      'tiêu chí 1.', None),
156: ('1. Truy cập màn Nhóm nguồn.\n'
      '2. Giữ ô lọc Trạng thái ở "-- Chọn trạng thái --", không chọn gì.',
      'Không áp bộ lọc trạng thái: danh sách hiện đủ bản ghi ở cả ba trạng thái Đang hoạt động, '
      'Không hoạt động và Đã lưu trữ.', None),
157: ('1. Lần lượt chọn từng trạng thái: Đang hoạt động, Không hoạt động, Đã lưu trữ.\n'
      '2. Sau mỗi lần chọn, đối chiếu kết quả với dữ liệu đang lưu:\n'
      'select * from <bảng dữ liệu của màn>\n'
      "where <cột ứng với Trạng thái> = '<giá trị đang chọn>';",
      '1. Danh sách chỉ còn bản ghi có nhãn Trạng thái đúng bằng lựa chọn đang áp.\n'
      '2. Số bản ghi khớp với dữ liệu đang lưu trong hệ thống.\n'
      '3. Lọc được thực hiện ngay tại trình duyệt trên toàn bộ danh sách đã tải, không gọi lại '
      'máy chủ.', None),
159: ('1. Nhập vào ô "Tìm kiếm theo mã, tên hiển thị..." toàn ký tự khoảng trắng.',
      'Ô vẫn trống: khoảng trắng ở đầu chuỗi bị loại ngay khi gõ nên không nhập được; hệ thống '
      'không áp từ khoá nào, danh sách giữ nguyên.', None),
160: ('1. Nhập vào ô "Tìm kiếm theo mã, tên hiển thị..." một Code hoặc Tên hiển thị đang có, '
      'kèm khoảng trắng ở đầu và cuối chuỗi.\n'
      '2. Nhấn Enter.',
      'Khoảng trắng ở đầu không nhập được (bị loại ngay khi gõ); khoảng trắng ở cuối nhập được '
      'nhưng bị cắt bỏ khi nhấn Enter hoặc rời ô, và hệ thống hiển thị đúng kết quả như khi tìm '
      'bằng từ khoá không có khoảng trắng thừa.', None),
161: ('1. Nhập vào ô "Tìm kiếm theo mã, tên hiển thị..." một phần của Code hoặc Tên hiển thị đã '
      'tồn tại (từ 3 ký tự trở lên), lần lượt bằng chữ thường rồi chữ HOA.\n'
      '2. Đối chiếu kết quả với dữ liệu đang lưu:\n'
      'select * from <bảng dữ liệu của màn>\n'
      "where lower(<cột Code>) like lower('%<từ khoá>%')\n"
      "   or lower(<cột Tên hiển thị>) like lower('%<từ khoá>%');",
      '1. Hai lần nhập cho cùng một kết quả: hệ thống khớp CHỨA trên cột Code hoặc cột Tên hiển '
      'thị, không phân biệt chữ hoa chữ thường.\n'
      '2. Kết quả khớp với dữ liệu đang lưu trong hệ thống.', None),
163: ('1. Nhập vào ô "Tìm kiếm theo mã, tên hiển thị..." một Tên hiển thị tiếng Việt CÓ dấu đang '
      'tồn tại (từ 3 ký tự trở lên).\n'
      '2. Nhấn Enter.\n'
      '3. Xoá đi, nhập lại chính từ khoá đó nhưng BỎ hết dấu.',
      '1. Lần nhập CÓ dấu: hiển thị đúng bản ghi có Tên hiển thị chứa từ khoá.\n'
      '2. Lần nhập KHÔNG dấu: ghi lại nguyên trạng — hệ thống so khớp trực tiếp trên chuỗi đã '
      'hạ chữ thường, không bỏ dấu, nên nhiều khả năng KHÔNG ra kết quả.',
      M + 'Ô tìm kiếm của danh sách khớp trực tiếp, KHÔNG bỏ dấu (khác hộp tìm bên trong ô lọc '
      'Trạng thái vốn có bỏ dấu). Đề nghị thống nhất: tìm không dấu vẫn ra bản ghi có dấu.'),
164: ('1. Nhập vào ô "Tìm kiếm theo mã, tên hiển thị..." một chuỗi rất dài (trên 250 ký tự).',
      'Ô nhận trọn chuỗi, không giới hạn độ dài; hệ thống lọc bình thường và hiện dòng chữ '
      '"Không có nhóm nguồn khớp bộ lọc" khi không có bản ghi nào khớp, không lỗi màn hình.',
      None),
166: ('1. Nhập/chọn đồng thời ĐỦ 2 tiêu chí của màn: Trạng thái · Tìm kiếm theo mã, tên hiển '
      'thị.\n'
      '2. Đối chiếu kết quả với dữ liệu đang lưu theo cùng điều kiện đang lọc:\n'
      'select * from <bảng dữ liệu của màn>\n'
      "where <cột Trạng thái> = '<giá trị đang chọn>'\n"
      "  and (lower(<cột Code>) like lower('%<từ khoá>%')\n"
      "       or lower(<cột Tên hiển thị>) like lower('%<từ khoá>%'));\n"
      '3. Ghi rõ giá trị đã dùng cho từng tiêu chí vào cột kết quả thực tế.',
      '1. Danh sách chỉ còn bản ghi thoả mãn ĐỒNG THỜI cả 2 tiêu chí.\n'
      '2. Kết quả khớp với dữ liệu đang lưu trong hệ thống, không thừa không thiếu.', None),
167: ('1. Đang áp đủ 2 tiêu chí (Trạng thái và từ khoá).\n'
      '2. Bỏ dấu X ở ô lọc Trạng thái.\n'
      '3. Xoá tiếp từ khoá trong ô tìm kiếm.',
      'Sau mỗi lần bỏ, số bản ghi tăng dần; bỏ hết cả hai thì danh sách trở lại đầy đủ như ban '
      'đầu và thanh phân trang hiện lại tổng số bản ghi ban đầu.', None),
# ══════════════════ CN THÊM MỚI NHÓM NGUỒN ══════════════════
187: ('1. Bấm "+ Thêm nhóm" để mở biểu mẫu, xem ô "Code".',
      'Ô Code trống, có dấu (*) đỏ ở nhãn cho biết là trường bắt buộc, con trỏ nhập được ngay.',
      None),
188: ('1. Để trống ô "Code".\n'
      '2. Nhập hợp lệ ô "Tên hiển thị".\n'
      '3. Bấm nút "Tạo nhóm".',
      'Hệ thống không gửi yêu cầu tạo mới; dòng chữ đỏ "Vui lòng nhập mã" hiện ngay dưới ô Code, '
      'viền ô chuyển đỏ; không tạo bản ghi nào.', None),
189: ('1. Dán vào ô "Code" một chuỗi dài hơn 250 ký tự.\n'
      '2. Đếm số ký tự thực sự nhận được trong ô.\n'
      '3. Bấm nút "Tạo nhóm".',
      '1. Thông báo lỗi "Code tối đa 250 ký tự"\n'
      '2. Highlight, focus vào trường lỗi\n'
      'Hoặc hệ thống không cho nhập quá 250 ký tự\n'
      'Bản đang kiểm đi theo nhánh thứ hai: ô chặn cứng ở 250 ký tự, phần dư bị cắt ngay khi '
      'dán và giao diện KHÔNG hiện thông báo lỗi độ dài nào; bấm Tạo nhóm thì gửi lên máy chủ '
      'chuỗi 250 ký tự đó.',
      V + 'Giao diện KHÔNG có luật độ dài cho ô Code (chỉ chặn cứng 250 ký tự ở ô nhập). Cần '
      'chốt với dev giới hạn thật của cột CSDL và thông báo lỗi khi vượt.'),
190: ('1. Nhập ô "Code" một chuỗi hợp lệ dài đúng 250 ký tự (chỉ chữ thường, số, dấu gạch '
      'ngang).\n'
      '2. Nhập hợp lệ ô "Tên hiển thị".\n'
      '3. Bấm nút "Tạo nhóm".',
      'Lưu thành công; Code hiển thị đầy đủ 250 ký tự ở cột Code của danh sách, không bị mất '
      'chữ.',
      V + 'Chưa xác nhận cột CSDL chứa được 250 ký tự — cần dev xác nhận trước khi chấm Pass.'),
191: ('1. Nhập vào ô "Code" chuỗi có ký tự đặc biệt, chữ HOA hoặc thẻ html, ví dụ <b>1</b>, '
      'BO_GD, Bo-Gd.\n'
      '2. Bấm nút "Tạo nhóm".',
      'Hệ thống chặn ngay tại giao diện: dòng chữ đỏ "Chỉ dùng chữ thường, số, dấu -" hiện dưới '
      'ô Code; không gửi yêu cầu và không tạo bản ghi nào. Chỉ chữ thường a-z, chữ số 0-9 và dấu '
      'gạch ngang (-) mới hợp lệ.', None),
192: ('1. Nhập vào ô "Code" chuỗi chỉ gồm chữ số, ví dụ 12345.\n'
      '2. Nhập hợp lệ ô "Tên hiển thị" rồi bấm "Tạo nhóm".',
      'Chuỗi toàn số là hợp lệ theo luật của ô Code; lưu thành công và Code hiển thị đúng như đã '
      'nhập.', None),
193: ('1. Nhập ô "Code" một mã hợp lệ nhưng có khoảng trắng ở đầu và cuối.\n'
      '2. Bấm nút "Tạo nhóm".',
      'Hệ thống chặn vì khoảng trắng không nằm trong bộ ký tự cho phép: hiện dòng chữ đỏ "Chỉ '
      'dùng chữ thường, số, dấu -" dưới ô Code; không tạo bản ghi.',
      M + 'Giao diện KHÔNG tự cắt khoảng trắng hai đầu của ô Code mà báo lỗi định dạng — thông '
      'báo chưa nói rõ nguyên nhân là khoảng trắng. Đề nghị tự cắt khoảng trắng trước khi kiểm.'),
194: ('1. Sao chép một mã hợp lệ từ nơi khác, dán vào ô "Code".',
      'Dán thành công, chữ hiển thị bình thường, không lỗi phông; chuỗi dán vào vẫn bị kiểm theo '
      'luật chỉ chữ thường, số và dấu gạch ngang khi bấm Tạo nhóm.', None),
195: ('1. Nhập ô "Code" bằng tiếng Việt có dấu, ví dụ "nhóm-nguồn".\n'
      '2. Bấm nút "Tạo nhóm".',
      'Ô nhận được chữ có dấu nhưng hệ thống chặn khi lưu: hiện dòng chữ đỏ "Chỉ dùng chữ '
      'thường, số, dấu -" dưới ô Code; không tạo bản ghi nào.', None),
196: ('1. Nhập ô "Code" một mã đã tồn tại trong danh sách.\n'
      '2. Nhập hợp lệ ô "Tên hiển thị".\n'
      '3. Bấm nút "Tạo nhóm".',
      'Giao diện KHÔNG kiểm trùng nên vẫn gửi yêu cầu lên máy chủ; máy chủ phải từ chối và hệ '
      'thống hiện dòng chữ đỏ báo lỗi ngay dưới tiêu đề hộp thoại "Thêm nhóm nguồn mới", biểu '
      'mẫu không đóng và không tạo bản ghi trùng.',
      V + 'TKCT UC-QLKB-03 E1 ghi "Tên/Code Nhóm nguồn đã tồn tại — chưa xác nhận rõ thông báo '
      'lỗi cụ thể". Cần dev/BA chốt hành vi và nội dung thông báo trùng của máy chủ.'),
198: ('1. Bấm "+ Thêm nhóm" để mở biểu mẫu, xem ô "Tên hiển thị".',
      'Ô Tên hiển thị trống, có dấu (*) đỏ ở nhãn cho biết là trường bắt buộc.', None),
199: ('1. Để trống ô "Tên hiển thị".\n'
      '2. Nhập hợp lệ ô "Code".\n'
      '3. Bấm nút "Tạo nhóm".',
      'Hệ thống không gửi yêu cầu tạo mới; dòng chữ đỏ "Vui lòng nhập tên hiển thị" hiện ngay '
      'dưới ô Tên hiển thị, viền ô chuyển đỏ; không tạo bản ghi nào.', None),
200: ('1. Dán vào ô "Tên hiển thị" một chuỗi dài hơn 250 ký tự.\n'
      '2. Đếm số ký tự thực sự nhận được trong ô.\n'
      '3. Bấm nút "Tạo nhóm".',
      '1. Thông báo lỗi "Tên hiển thị tối đa 250 ký tự"\n'
      '2. Highlight, focus vào trường lỗi\n'
      'Hoặc hệ thống không cho nhập quá 250 ký tự\n'
      'Bản đang kiểm đi theo nhánh thứ hai: ô chặn cứng ở 250 ký tự, phần dư bị cắt ngay khi '
      'dán và giao diện KHÔNG hiện thông báo lỗi độ dài nào; bấm Tạo nhóm thì gửi lên máy chủ '
      'chuỗi 250 ký tự đó.',
      V + 'Giao diện KHÔNG có luật độ dài cho ô Tên hiển thị (chỉ chặn cứng 250 ký tự ở ô nhập). '
      'Cần chốt với dev giới hạn thật của cột CSDL và thông báo lỗi khi vượt.'),
201: ('1. Nhập ô "Tên hiển thị" một chuỗi dài đúng 250 ký tự.\n'
      '2. Nhập hợp lệ ô "Code".\n'
      '3. Bấm nút "Tạo nhóm".',
      'Lưu thành công; Tên hiển thị hiện đầy đủ ở cột Tên hiển thị của danh sách, không mất chữ; '
      'chuỗi dài không làm vỡ bố cục bảng.',
      V + 'Chưa xác nhận cột CSDL chứa được 250 ký tự — cần dev xác nhận trước khi chấm Pass.'),
202: ('1. Nhập vào ô "Tên hiển thị" chuỗi có ký tự đặc biệt và thẻ html, ví dụ <b>1</b>.\n'
      '2. Bấm "Tạo nhóm", mở lại bản ghi để xem.',
      'Ô Tên hiển thị KHÔNG bị ràng buộc định dạng nên lưu được; chuỗi hiển thị nguyên dạng ở '
      'cột Tên hiển thị và khi mở lại biểu mẫu, thẻ html không bị thực thi.', None),
204: ('1. Nhập ô "Tên hiển thị" có khoảng trắng ở đầu và cuối.\n'
      '2. Bấm nút "Tạo nhóm", mở lại bản ghi để xem.',
      'Ghi lại nguyên trạng: giao diện chỉ dùng bản đã cắt khoảng trắng để kiểm rỗng, còn giá '
      'trị GỬI LÊN vẫn giữ nguyên khoảng trắng hai đầu — mở lại bản ghi vẫn thấy khoảng trắng.',
      M + 'Đề nghị cắt khoảng trắng hai đầu của ô Tên hiển thị trước khi gửi lên máy chủ, tránh '
      'hai bản ghi trông giống hệt nhau mà khác nhau ở khoảng trắng.'),
207: ('1. Nhập ô "Tên hiển thị" một tên đã tồn tại trong danh sách.\n'
      '2. Nhập hợp lệ ô "Code".\n'
      '3. Bấm nút "Tạo nhóm".',
      'Giao diện KHÔNG kiểm trùng nên vẫn gửi yêu cầu lên máy chủ; nếu tên hiển thị là trường '
      'không cho trùng thì máy chủ phải từ chối và hệ thống hiện dòng chữ đỏ báo lỗi ngay dưới '
      'tiêu đề hộp thoại "Thêm nhóm nguồn mới".',
      V + 'TKCT UC-QLKB-03 E1 có nhắc "Tên/Code đã tồn tại" nhưng chưa chốt Tên hiển thị có phải '
      'trường duy nhất hay không. Cần BA xác nhận.'),
209: ('1. Bấm "+ Thêm nhóm" để mở biểu mẫu, xem ô "Trạng thái".',
      'Ô Trạng thái đã chọn sẵn "Đang hoạt động"; nhãn ô KHÔNG có dấu (*) — đây là trường không '
      'bắt buộc.', None),
210: ('1. Bấm mở ô "Trạng thái" trong biểu mẫu.',
      'Danh sách hiện đúng 3 giá trị theo thứ tự: Đang hoạt động · Không hoạt động · Đã lưu trữ; '
      'ô này KHÔNG có hộp tìm kiếm bên trong.', None),
211: ('1. Mở ô "Trạng thái" nhiều lần và xem thứ tự các giá trị.',
      'Thứ tự luôn là Đang hoạt động · Không hoạt động · Đã lưu trữ, không xáo trộn giữa các '
      'lần mở.', None),
212: ('1. Chọn lần lượt từng giá trị Đang hoạt động, Không hoạt động, Đã lưu trữ.\n'
      '2. Bấm lại đúng giá trị đang chọn.\n'
      '3. Bấm dấu X bên phải ô.',
      '1. Chỉ chọn được một giá trị; chọn xong danh sách tự đóng và ô hiện giá trị vừa chọn.\n'
      '2-3. Bấm lại giá trị đang chọn hoặc bấm dấu X thì ô về rỗng và hiện chữ gợi ý "-- Chọn --".',
      R + 'Ô Trạng thái xoá được về rỗng mà biểu mẫu vẫn gửi lưu được (hàm kiểm hợp lệ không '
      'kiểm Trạng thái) — có thể gửi trạng thái rỗng lên máy chủ. Cần dev xác nhận hành vi.'),
213: ('1. Chọn giá trị có nhãn dài nhất ("Đang hoạt động") và quan sát ô.',
      'Độ rộng ô không đổi theo độ dài nhãn; nhãn quá khổ được cắt bớt và hiện dấu ba chấm.',
      None),
221: ('1. Nhập ô "Code" một mã hợp lệ dài 250 ký tự, ô "Tên hiển thị" dài 250 ký tự, chọn '
      'Trạng thái.\n'
      '2. Bấm nút "Tạo nhóm".',
      'Hiện thông báo nổi "Thêm nhóm nguồn thành công"; biểu mẫu đóng lại; nhóm nguồn vừa tạo '
      'xuất hiện ở cuối danh sách và ba thẻ số liệu cộng thêm 1.', None),
223: ('1. Chỉ nhập ô "Code" và ô "Tên hiển thị", không đụng vào ô Trạng thái.\n'
      '2. Bấm nút "Tạo nhóm".',
      'Lưu thành công kèm thông báo nổi "Thêm nhóm nguồn thành công"; bản ghi mới mang trạng '
      'thái mặc định Đang hoạt động và hiện nhãn "Đang hoạt động" màu xanh ở cột Trạng thái.',
      None),
224: ('1. Để trống CẢ hai ô "Code" và "Tên hiển thị" (hoặc nhập toàn dấu cách).\n'
      '2. Bấm nút "Tạo nhóm".',
      'Hệ thống hiện đồng thời hai dòng chữ đỏ: "Vui lòng nhập mã" dưới ô Code và "Vui lòng '
      'nhập tên hiển thị" dưới ô Tên hiển thị; không gửi yêu cầu và không tạo bản ghi nào.',
      None),
225: ('1. Nhập đầy đủ, hợp lệ.\n'
      '2. Bấm chuột liên tục nhiều lần vào nút "Tạo nhóm".',
      'Ngay sau lần bấm đầu tiên, nhãn nút đổi thành "Đang lưu..." và nút bị vô hiệu cho tới khi '
      'lưu xong; các lần bấm thêm không có tác dụng — chỉ tạo đúng 1 bản ghi.', None),
226: ('1. Nhập đầy đủ, hợp lệ.\n'
      '2. Dùng phím Tab tới nút "Tạo nhóm" rồi nhấn Enter liên tục.',
      'Ngay sau lần Enter đầu tiên, nhãn nút đổi thành "Đang lưu..." và nút bị vô hiệu cho tới '
      'khi lưu xong; các lần Enter thêm không có tác dụng — chỉ tạo đúng 1 bản ghi.', None),
227: ('1. Từ 2 tab (hoặc 2 máy) cùng nhập một giá trị Code giống nhau.\n'
      '2. Cùng bấm nút "Tạo nhóm".',
      'Giao diện không chặn được vì không kiểm trùng; máy chủ phải cho client thứ nhất lưu thành '
      'công và từ chối client thứ hai, hệ thống hiện dòng chữ đỏ báo lỗi dưới tiêu đề hộp thoại '
      '— không tạo ra 2 bản ghi cùng Code.',
      V + 'Ràng buộc duy nhất của Code chỉ có thể ở máy chủ. Cần dev xác nhận có ràng buộc này '
      'và nội dung thông báo trả về.'),
229: ('1. Nhập dữ liệu đầy đủ và hợp lệ cho các trường.\n'
      '2. Bấm nút "Hủy" (hoặc dấu X góc trên bên phải, hoặc nhấn phím Esc, hoặc bấm ra ngoài '
      'hộp thoại).',
      'Cả bốn cách đều đóng biểu mẫu ngay, không hỏi lại; không thêm bản ghi nào và danh sách '
      'giữ nguyên như trước. Mở lại "+ Thêm nhóm" thì các ô đã được xoá trắng, không giữ dữ liệu '
      'lần trước.', None),
# ══════════════════ CN CHỈNH SỬA NHÓM NGUỒN ══════════════════
258: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi, xem ô "Code".',
      'Ô Code nạp sẵn đúng mã của bản ghi đang sửa và BỊ KHOÁ: nền xám, chữ mờ, con trỏ báo '
      'không nhập được.', None),
259: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi.\n'
      '2. Thử xoá trắng ô "Code".',
      'Không xoá được vì ô đang bị khoá; giá trị Code giữ nguyên. Hệ thống cũng KHÔNG kiểm luật '
      'bắt buộc của Code ở chế độ sửa — luật này chỉ áp khi thêm mới.', None),
260: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi.\n'
      '2. Thử dán vào ô "Code" một chuỗi dài hơn 250 ký tự.',
      'Không dán được vì ô đang bị khoá; không có thông báo lỗi độ dài nào và giá trị Code giữ '
      'nguyên.', ''),
261: ('1. Bấm biểu tượng Chỉnh sửa trên bản ghi có Code dài (tới 250 ký tự).\n'
      '2. Quan sát ô "Code".',
      'Ô hiện đầy đủ giá trị Code đang lưu, không mất chữ; chuỗi dài không làm vỡ bố cục hộp '
      'thoại.', None),
262: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi.\n'
      '2. Thử gõ ký tự đặc biệt hoặc thẻ html vào ô "Code".',
      'Ô không nhận được ký tự nào vì đang bị khoá; giá trị Code giữ nguyên như đang lưu.',
      R + 'Ô Code bị khoá ở giao diện NHƯNG yêu cầu cập nhật gửi lên máy chủ VẪN kèm trường '
      'code, và hàm kiểm hợp lệ bỏ qua toàn bộ luật của Code khi sửa. Cần dev xác nhận máy chủ '
      'có bỏ qua trường code trong yêu cầu cập nhật hay không.'),
263: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi.\n'
      '2. Thử gõ chuỗi số vào ô "Code".',
      'Ô không nhận được ký tự nào vì đang bị khoá; giá trị Code giữ nguyên như đang lưu.', None),
264: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi.\n'
      '2. Thử gõ khoảng trắng vào đầu và cuối ô "Code".',
      'Ô không nhận được ký tự nào vì đang bị khoá; giá trị Code giữ nguyên như đang lưu.', None),
265: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi.\n'
      '2. Sao chép một đoạn chữ từ nơi khác và thử dán vào ô "Code".',
      'Không dán được vì ô đang bị khoá; giá trị Code giữ nguyên như đang lưu.', None),
266: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi.\n'
      '2. Thử gõ tiếng Việt có dấu vào ô "Code".',
      'Ô không nhận được ký tự nào vì đang bị khoá; giá trị Code giữ nguyên như đang lưu.', None),
267: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi.\n'
      '2. Vì ô Code bị khoá, dùng công cụ của trình duyệt gỡ thuộc tính khoá rồi đổi Code sang '
      'một mã đã tồn tại ở bản ghi khác.\n'
      '3. Bấm nút "Lưu thay đổi".',
      'Máy chủ phải từ chối yêu cầu vì Code trùng (hoặc bỏ qua trường code trong yêu cầu cập '
      'nhật và giữ nguyên mã cũ); hệ thống hiện dòng chữ đỏ báo lỗi ngay dưới tiêu đề hộp thoại '
      '"Chỉnh sửa: {tên hiển thị}"; không tạo ra hai bản ghi cùng Code.',
      R + 'Giao diện không có lưới chắn nào: yêu cầu cập nhật vẫn gửi trường code và hàm kiểm '
      'hợp lệ bỏ qua luật của Code khi sửa. Cần dev xác nhận máy chủ chặn.'),
268: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi đang có.\n'
      '2. Giữ nguyên ô Code (ô đang bị khoá nên không sửa được).\n'
      '3. Đổi ô "Tên hiển thị" sang một giá trị hợp lệ khác.\n'
      '4. Bấm nút "Lưu thay đổi".',
      'Cập nhật thành công kèm thông báo nổi "Cập nhật nhóm nguồn thành công"; hệ thống KHÔNG '
      'báo trùng Code với chính bản ghi đang sửa.', None),
270: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi, xem ô "Tên hiển thị".',
      'Ô nạp sẵn đúng Tên hiển thị đang lưu của bản ghi, sửa được bình thường, có dấu (*) đỏ ở '
      'nhãn.', None),
271: ('1. Xoá trắng ô "Tên hiển thị".\n'
      '2. Bấm nút "Lưu thay đổi".',
      'Hệ thống không gửi yêu cầu cập nhật; dòng chữ đỏ "Vui lòng nhập tên hiển thị" hiện ngay '
      'dưới ô, viền ô chuyển đỏ; bản ghi giữ nguyên giá trị cũ.', None),
272: ('1. Dán vào ô "Tên hiển thị" một chuỗi dài hơn 250 ký tự.\n'
      '2. Đếm số ký tự thực sự nhận được trong ô.\n'
      '3. Bấm nút "Lưu thay đổi".',
      '1. Thông báo lỗi "Tên hiển thị tối đa 250 ký tự"\n'
      '2. Highlight, focus vào trường lỗi\n'
      'Hoặc hệ thống không cho nhập quá 250 ký tự\n'
      'Bản đang kiểm đi theo nhánh thứ hai: ô chặn cứng ở 250 ký tự, phần dư bị cắt ngay khi '
      'dán và giao diện KHÔNG hiện thông báo lỗi độ dài nào; bấm Lưu thay đổi thì gửi lên máy '
      'chủ chuỗi 250 ký tự đó.',
      V + 'Giao diện KHÔNG có luật độ dài cho ô Tên hiển thị (chỉ chặn cứng 250 ký tự ở ô nhập). '
      'Cần chốt với dev giới hạn thật của cột CSDL và thông báo lỗi khi vượt.'),
274: ('1. Nhập vào ô "Tên hiển thị" chuỗi có ký tự đặc biệt và thẻ html, ví dụ <b>1</b>.\n'
      '2. Bấm "Lưu thay đổi", mở lại bản ghi để xem.',
      'Ô Tên hiển thị KHÔNG bị ràng buộc định dạng nên lưu được; chuỗi hiển thị nguyên dạng ở '
      'cột Tên hiển thị và khi mở lại biểu mẫu, thẻ html không bị thực thi.', None),
276: ('1. Nhập ô "Tên hiển thị" có khoảng trắng ở đầu và cuối.\n'
      '2. Bấm "Lưu thay đổi", mở lại bản ghi để xem.',
      'Ghi lại nguyên trạng: giao diện chỉ dùng bản đã cắt khoảng trắng để kiểm rỗng, còn giá '
      'trị GỬI LÊN vẫn giữ nguyên khoảng trắng hai đầu — mở lại bản ghi vẫn thấy khoảng trắng.',
      M + 'Đề nghị cắt khoảng trắng hai đầu của ô Tên hiển thị trước khi gửi lên máy chủ.'),
279: ('1. Sửa ô "Tên hiển thị" thành một tên đã tồn tại ở bản ghi khác.\n'
      '2. Bấm nút "Lưu thay đổi".',
      'Giao diện KHÔNG kiểm trùng nên vẫn gửi yêu cầu lên máy chủ; nếu Tên hiển thị là trường '
      'không cho trùng thì máy chủ phải từ chối và hệ thống hiện dòng chữ đỏ báo lỗi ngay dưới '
      'tiêu đề hộp thoại "Chỉnh sửa: {tên hiển thị}".',
      V + 'Chưa chốt được Tên hiển thị có phải trường duy nhất hay không (TKCT UC-QLKB-03 E1 '
      'chưa xác nhận). Cần BA xác nhận.'),
280: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi đang có.\n'
      '2. Giữ nguyên ô "Tên hiển thị", không sửa gì ở ô này.\n'
      '3. Đổi ô "Trạng thái" sang một giá trị khác.\n'
      '4. Bấm nút "Lưu thay đổi".',
      'Cập nhật thành công kèm thông báo nổi "Cập nhật nhóm nguồn thành công"; hệ thống KHÔNG '
      'báo trùng Tên hiển thị với chính bản ghi đang sửa.', None),
282: ('1. Bấm biểu tượng Chỉnh sửa trên một bản ghi, xem ô "Trạng thái".',
      'Ô nạp sẵn đúng trạng thái đang lưu của bản ghi (Đang hoạt động / Không hoạt động / Đã '
      'lưu trữ), không phải giá trị mặc định của biểu mẫu thêm mới.', None),
283: ('1. Bấm mở ô "Trạng thái" trong biểu mẫu chỉnh sửa.',
      'Danh sách hiện đúng 3 giá trị theo thứ tự: Đang hoạt động · Không hoạt động · Đã lưu trữ; '
      'ô này KHÔNG có hộp tìm kiếm bên trong.', None),
285: ('1. Chọn lần lượt các giá trị khác nhau trong ô "Trạng thái".\n'
      '2. Bấm dấu X bên phải ô.',
      '1. Chỉ chọn được một giá trị; chọn xong danh sách tự đóng và ô hiện giá trị vừa chọn.\n'
      '2. Bấm dấu X thì ô về rỗng và hiện chữ gợi ý "-- Chọn --".',
      R + 'Ô Trạng thái xoá được về rỗng mà biểu mẫu vẫn lưu được — có thể gửi trạng thái rỗng '
      'lên máy chủ khi cập nhật. Cần dev xác nhận hành vi.'),
294: ('1. Bấm biểu tượng Chỉnh sửa, đổi ô "Tên hiển thị" (tới 250 ký tự) và ô "Trạng thái".\n'
      '2. Bấm nút "Lưu thay đổi".',
      'Hiện thông báo nổi "Cập nhật nhóm nguồn thành công"; biểu mẫu đóng lại; dòng tương ứng '
      'trên danh sách hiện ngay giá trị mới, ba thẻ số liệu tính lại theo trạng thái mới.', None),
296: ('1. Chỉ đổi ô "Tên hiển thị", giữ nguyên ô "Trạng thái".\n'
      '2. Bấm nút "Lưu thay đổi".',
      'Cập nhật thành công; chỉ cột Tên hiển thị đổi giá trị, cột Code · Trạng thái · Ngày tạo '
      'giữ nguyên như trước.', None),
297: ('1. Xoá trắng ô "Tên hiển thị" (ô Code đang bị khoá nên không xoá được).\n'
      '2. Bấm nút "Lưu thay đổi".',
      'Hệ thống không gửi yêu cầu cập nhật; hiện dòng chữ đỏ "Vui lòng nhập tên hiển thị" ngay '
      'dưới ô; bản ghi giữ nguyên giá trị cũ.', None),
298: ('1. Sửa hợp lệ.\n'
      '2. Bấm chuột liên tục nhiều lần vào nút "Lưu thay đổi".',
      'Ngay sau lần bấm đầu tiên, nhãn nút đổi thành "Đang lưu..." và nút bị vô hiệu cho tới khi '
      'lưu xong; các lần bấm thêm không có tác dụng — cập nhật đúng 1 lần.', None),
299: ('1. Sửa hợp lệ.\n'
      '2. Dùng phím Tab tới nút "Lưu thay đổi" rồi nhấn Enter liên tục.',
      'Ngay sau lần Enter đầu tiên, nhãn nút đổi thành "Đang lưu..." và nút bị vô hiệu cho tới '
      'khi lưu xong; các lần Enter thêm không có tác dụng — cập nhật đúng 1 lần.', None),
300: ('1. Từ 2 tab (hoặc 2 máy) cùng sửa hai bản ghi khác nhau về cùng một Tên hiển thị.\n'
      '2. Cùng bấm nút "Lưu thay đổi".',
      'Giao diện không chặn được vì không kiểm trùng; nếu Tên hiển thị là trường không cho trùng '
      'thì máy chủ phải cho client thứ nhất lưu thành công và từ chối client thứ hai, hệ thống '
      'hiện dòng chữ đỏ báo lỗi dưới tiêu đề hộp thoại.',
      V + 'Chưa chốt ràng buộc duy nhất của Tên hiển thị (TKCT UC-QLKB-03 E1 chưa xác nhận). '
      'Cần dev/BA xác nhận.'),
302: ('1. Sửa dữ liệu ở một vài ô trên biểu mẫu.\n'
      '2. Bấm nút "Hủy" (hoặc dấu X góc trên bên phải, hoặc nhấn phím Esc, hoặc bấm ra ngoài '
      'hộp thoại).',
      'Cả bốn cách đều đóng biểu mẫu ngay, không hỏi lại; bản ghi giữ nguyên dữ liệu cũ trên '
      'danh sách. Mở lại biểu mẫu Chỉnh sửa thì các ô nạp lại giá trị đang lưu, không giữ những '
      'gì vừa gõ dở.', None),
# ══════════════════ CN XÓA NHÓM NGUỒN ══════════════════
330: ('1. Bấm biểu tượng Xóa trên một bản ghi để mở hộp xác nhận.',
      'Hộp hiện tiêu đề "Xóa nhóm nguồn?", nội dung nhắc "Bạn chắc chắn muốn xóa nhóm “{tên '
      'hiển thị}”? Hành động này không thể hoàn tác." và hai nút "Hủy" · "Xóa" (nút Xóa màu đỏ).',
      None),
331: ('1. Bấm biểu tượng Xóa trên một bản ghi có Tên hiển thị rất dài (tới 250 ký tự).',
      'Nội dung nhắc hiện đúng Tên hiển thị của bản ghi đang chọn, đặt trong cặp dấu nháy kép '
      'kiểu tiếng Việt; tên dài xuống dòng trong khung, không làm vỡ hộp thoại.', None),
332: ('1. Bấm biểu tượng Xóa trên một bản ghi.\n'
      '2. Đọc tiêu đề, nội dung nhắc và nhãn hai nút.',
      'Không sai chính tả; nhãn hai nút là "Hủy" và "Xóa"; chữ trong nút căn giữa, hai nút thẳng '
      'hàng ở góc dưới bên phải.', None),
334: ('1. Tích chọn từ 2 bản ghi trở lên.\n'
      '2. Bấm nút "Xóa tất cả" trên thanh hành động hàng loạt.',
      'Hộp hiện tiêu đề "Xóa {N} nhóm nguồn đã chọn?" với N đúng bằng số bản ghi đang tích, nội '
      'dung nhắc "Hành động này không thể hoàn tác." và hai nút "Huỷ" · "Xóa".', None),
335: ('1. Tích chọn nhiều bản ghi, trong đó có bản ghi Tên hiển thị rất dài.\n'
      '2. Bấm nút "Xóa tất cả".',
      'Hộp chỉ nêu SỐ LƯỢNG bản ghi sẽ xoá, không liệt kê tên từng bản ghi; khung hộp không bị '
      'vỡ.',
      M + 'Hộp xác nhận xoá hàng loạt không cho người dùng soát lại danh sách bản ghi sắp xoá. '
      'Đề nghị bổ sung danh sách tên (hoặc vài tên đầu) để tránh xoá nhầm.'),
336: ('1. Bấm nút "Xóa tất cả" để mở hộp xác nhận hàng loạt.\n'
      '2. Đọc tiêu đề, nội dung nhắc và nhãn hai nút.',
      'Không sai chính tả; chữ trong nút căn giữa, hai nút thẳng hàng.',
      M + 'Nhãn nút huỷ của hai hộp xác nhận viết KHÁC nhau: xoá đơn lẻ là "Hủy", xoá hàng loạt '
      'là "Huỷ". Đề nghị thống nhất một cách viết.'),
338: ('1. Tích chọn ít nhất một bản ghi.\n'
      '2. Quan sát nút "Xóa tất cả" trên thanh hành động hàng loạt.',
      'Đúng chính tả, chữ trong nút căn giữa; nút có biểu tượng thùng rác, chữ và viền màu đỏ.',
      None),
343: ('1. Chọn 1 nhóm nguồn đang được nguồn dữ liệu khác tham chiếu.\n'
      '2. Bấm biểu tượng Xóa và xác nhận "Xóa".',
      'Máy chủ phải từ chối: hệ thống hiện dòng chữ đỏ báo bản ghi đang được sử dụng ngay trong '
      'hộp xác nhận, hộp KHÔNG đóng và bản ghi vẫn còn trong danh sách.',
      V + 'Giao diện KHÔNG có luật chặn nào cho trường hợp này (không đọc số lượng tham chiếu). '
      'Cần dev xác nhận máy chủ có chặn và nội dung thông báo trả về.'),
344: ('1. Chọn 1 nhóm nguồn chưa bị tham chiếu ở đâu.\n'
      '2. Bấm biểu tượng Xóa và xác nhận "Xóa".',
      'Trong lúc chờ, nhãn nút đổi thành "Đang xóa..."; xong thì hiện thông báo nổi "Xóa nhóm '
      'nguồn thành công", hộp xác nhận đóng lại, bản ghi biến khỏi danh sách và ba thẻ số liệu '
      'giảm đúng 1.', None),
346: ('1. Mở màn Nhóm nguồn ở 2 tab.\n'
      '2. Tab 1: xoá một bản ghi.\n'
      '3. Tab 2 (chưa làm mới): bấm Xóa đúng bản ghi đó và xác nhận.',
      'Máy chủ trả lỗi không tìm thấy bản ghi; hệ thống hiện dòng chữ đỏ báo lỗi trong hộp xác '
      'nhận, hộp không đóng, không phát sinh lỗi hệ thống và danh sách không đổi.', None),
347: ('1. Bấm biểu tượng Xóa trên một bản ghi.\n'
      '2. Bấm nút "Hủy" trong hộp xác nhận.',
      'Hộp xác nhận đóng lại; bản ghi không bị xoá và vẫn còn trong danh sách.', None),
348: ('1. Bấm biểu tượng Xóa trên một bản ghi.\n'
      '2. Tìm biểu tượng X để đóng hộp xác nhận.\n'
      '3. Nhấn phím Esc.\n'
      '4. Bấm ra vùng tối bên ngoài hộp xác nhận.',
      '2. Hộp xác nhận xoá KHÔNG có biểu tượng X — chỉ đóng được bằng nút "Hủy" hoặc phím Esc '
      '(khác biểu mẫu Thêm/Chỉnh sửa vốn có dấu X ở góc trên bên phải).\n'
      '3. Nhấn Esc thì hộp đóng lại, bản ghi không bị xoá.\n'
      '4. Bấm ra ngoài hộp thì hộp KHÔNG đóng — đây là hộp cảnh báo, cố ý bắt người dùng chọn '
      'một trong hai nút.',
      M + 'Hộp xác nhận xoá không có nút đóng X trong khi biểu mẫu Thêm/Chỉnh sửa có. Đề nghị '
      'chốt với thiết kế đây là cố ý hay thiếu.'),
349: ('1. Tích chọn từ 2 bản ghi trở lên.\n'
      '2. Bấm nút "Xóa tất cả".\n'
      '3. Bấm nút "Xóa" trong hộp xác nhận.',
      '1. Xoá hết thành công: hiện thông báo nổi "Đã xóa {N} mục" với N đúng bằng số bản ghi đã '
      'chọn; các bản ghi đó không còn trong danh sách và thanh hành động hàng loạt ẩn đi.\n'
      '2. Có bản ghi xoá hỏng: hiện thông báo nổi "Xóa thất bại {d}/{N} mục"; các bản ghi xoá '
      'được vẫn biến mất, phần còn lại vẫn nằm trên danh sách.',
      R + 'Xoá hàng loạt gọi lệnh xoá LẶP từng bản ghi nên có thể xoá được một phần; thông báo '
      'chỉ nêu số lượng hỏng, KHÔNG nói bản ghi nào hỏng.'),
350: ('1. Bấm biểu tượng Xóa trên một bản ghi.\n'
      '2. Bấm liên tục nhiều lần vào nút "Xóa" trong hộp xác nhận.',
      'Ngay sau lần bấm đầu tiên, nhãn nút đổi thành "Đang xóa..." và nút bị vô hiệu; các lần '
      'bấm thêm không có tác dụng — chỉ gửi đúng một lệnh xoá, không báo lỗi.', None),
351: ('1. Bấm biểu tượng Xóa trên một bản ghi.\n'
      '2. Nhấn Tab tới nút "Xóa" rồi nhấn Enter liên tục.',
      'Ngay sau lần Enter đầu tiên, nhãn nút đổi thành "Đang xóa..." và nút bị vô hiệu; các lần '
      'Enter thêm không có tác dụng — chỉ gửi đúng một lệnh xoá, không báo lỗi.', None),
352: ('1. Mở cùng một bản ghi trên 2 tab (hoặc 2 máy) và bấm biểu tượng Xóa ở cả hai.\n'
      '2. Tab 1 (Client 1): bấm nút "Xóa".\n'
      '3. Tab 2 (Client 2): bấm nút "Xóa".',
      'Tab 1 (Client 1): xoá thành công kèm thông báo nổi "Xóa nhóm nguồn thành công".\n'
      'Tab 2 (Client 2): máy chủ trả lỗi vì bản ghi đã bị xoá trước đó; hệ thống hiện dòng chữ '
      'đỏ báo lỗi trong hộp xác nhận và hộp không đóng.', None),
# ══════════════════ CN XUẤT EXCEL NHÓM NGUỒN ══════════════════
361: ('1. Trên màn Nhóm nguồn.\n'
      '2. Click button Xuất excel.',
      '1. Tên file và tiêu đề file:\n'
      '- File xuất ra có tên là: danh_sach_nhom_nguon_du_lieu.xlsx (hoặc tên do máy chủ đặt kèm '
      'theo phản hồi tải file)\n'
      '- Tiêu đề của file: <tiêu đề bên trong file>\n'
      '- Thời gian xuất: Thời gian mà hệ thống xuất dữ liệu và tải được file về máy, có định '
      'dạng là dd/mm/yyyy hh:mm:ss\n'
      '2. Dữ liệu\n'
      '- File excel được tải xuống thành công, hiển thị dữ liệu chính xác, dữ liệu hiển thị theo '
      'quy tắc: cột STT căn giữa, các cột số canh phải, các cột còn lại căn trái, các cột được '
      'kẻ ô, không bị lỗi font chữ\n'
      '- Tiêu đề cột: In đậm, căn trái, riêng cột STT căn giữa, các cột số canh phải\n'
      '- Tiêu đề cột trong file excel phải được ghim lại khi cuộn chuột xuống (với file có nhiều '
      'dữ liệu)\n'
      '3. Trong lúc chờ, nhãn nút đổi thành "Đang xuất..." và nút bị vô hiệu; xong thì hiện '
      'thông báo nổi "Xuất Excel thành công".',
      V + 'Tiêu đề bên trong file do máy chủ dựng, chưa xem được. Cần dev/BA cung cấp mẫu file.'),
364: ('1. Bấm nút "Xuất Excel" khi không áp bộ lọc và không nhập từ khoá.\n'
      '2. Mở file, đối chiếu từng dòng với danh sách trên màn.',
      'Số dòng trong file bằng "Tổng số bản ghi:" trên màn; từng cột Code · Tên hiển thị · Trạng '
      'thái · Ngày tạo khớp chính xác; thứ tự sắp xếp giống trên màn.', None),
366: ('1. Chọn Trạng thái và/hoặc nhập từ khoá để danh sách trên màn chỉ còn một phần bản ghi.\n'
      '2. Ghi lại "Tổng số bản ghi:" đang hiện.\n'
      '3. Bấm nút "Xuất Excel", mở file và đếm số dòng.',
      'Ghi lại nguyên trạng và đối chiếu với thiết kế: màn gọi lệnh xuất KHÔNG kèm bộ lọc nào '
      'nên file tải về nhiều khả năng chứa TOÀN BỘ danh sách, không phải phần đang lọc trên màn.',
      M + 'Nút Xuất Excel không truyền bộ lọc đang áp (dịch vụ có nhận tham số trạng thái nhưng '
      'màn gọi không tham số) — file tải về là toàn bộ danh sách. Cần BA chốt đây là mong muốn '
      'hay lỗi; nếu là lỗi thì phải xuất theo bộ lọc đang áp.'),
367: ('1. Lọc/nhập từ khoá sao cho danh sách không còn bản ghi nào.\n'
      '2. Quan sát nút "Xuất Excel".\n'
      '3. Thử bấm nút "Xuất Excel".',
      '1. Ghi lại nguyên trạng: nút "Xuất Excel" chỉ bị vô hiệu khi TOÀN BỘ danh sách rỗng, còn '
      'khi danh sách gốc vẫn có dữ liệu mà bộ lọc không khớp bản ghi nào thì nút VẪN bấm được.\n'
      '2. Bấm được thì hệ thống vẫn xuất toàn bộ danh sách và hiện thông báo nổi "Xuất Excel '
      'thành công".', None),
369: ('1. Bấm "Xuất Excel" và chờ xong.\n'
      '2. Bấm xuất lại ngay lập tức.\n'
      '3. Lặp lại vài lượt liên tiếp.',
      'Ghi lại nguyên trạng:\n'
      '- Giao diện KHÔNG đặt giới hạn tần suất: mỗi lượt bấm đều gửi một yêu cầu xuất và tải về '
      'một file.\n'
      '- Lượt nào máy chủ từ chối thì hệ thống hiện thông báo nổi "Xuất Excel thất bại" (hoặc '
      'nội dung lỗi máy chủ trả về), không thất bại im lặng.',
      V + 'Cần dev xác nhận máy chủ có đặt giới hạn tần suất gọi lệnh xuất hay không.'),
370: ('1. Bấm liên tục nhiều lần vào nút "Xuất Excel" trong thời gian ngắn.',
      'Ngay sau lần bấm đầu tiên, nhãn nút đổi thành "Đang xuất..." và nút bị vô hiệu cho tới '
      'khi tải xong; các lần bấm thêm không có tác dụng — chỉ tải về đúng 1 file.', None),
}


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
    print('\n=== A6 Nhóm nguồn: %d case sửa cột C/D · %d case ghi cột T ==='
          % (n_cd, n_t))
    if not apply_:
        print('(XEM TRƯỚC — thêm --apply để ghi)')
        return
    import qalib
    qalib.backup(tc.path, tag='truoc_a6_nhomnguon')
    # `retext` chỉ đổi nội dung ô trong bộ nhớ; phải qua `rebuild` mới dựng lại sheet để `save`.
    # Plan khởi tạo RỖNG -> quên keep là XOÁ SẠCH nội dung file (bẫy đã ghi ở README).
    pl = tcfix.Plan(tc).keep_range(12, max(tc.order))
    tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)
    print('ĐÃ GHI -> %s' % os.path.normpath(XLSX))
    print('⚠️  BẮT BUỘC chạy tiếp: python3 ../../../tools/formula_layer.py <file> '
          '(rebuild đã ghi đè cột A thành chữ chay)')


main()

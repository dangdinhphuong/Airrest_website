# -*- coding: utf-8 -*-
"""BƯỚC A6 của menu "Tầng dữ liệu danh mục" — phần tool KHÔNG làm thay được.

HDSD §3 A6: sau khi khung đã sạch bộ rà cấu trúc, phải ghi TAY cột C/D theo dữ kiện đã ground
(nhãn thật · thông báo verbatim · hành vi thật của giao diện) và gắn cờ cho chỗ chưa chốt được.
Script chỉ GHI ĐÈ cột C/D/T của những case đã liệt kê — KHÔNG thêm/xoá/đổi tên case, nên mã case
và lớp công thức không đổi. Chạy lại được nhiều lần (idempotent).

KHÁC các script a6 trước: bảng luật KHOÁ THEO NỘI DUNG `(sheet, CN, nhóm, tiêu đề[, lần thứ n])`
chứ không theo SỐ DÒNG, nên không cần tệp neo và không trượt khi chuỗi sinh chèn thêm case
(bẫy ① của HDSD §8.2.8).

Căn cứ: hồ sơ màn `Testcase-Role-ChuyenVien-TangDuLieuDanhMuc.json` khoá `grounding`
(mã nguồn FE đầy đủ trong repo + TKCT §15 UC-DM-01..10 + soi màn thật 2026-09-12 + ảnh màn thật).

    python3 a6-TangDuLieuDanhMuc.py            # XEM TRƯỚC
    python3 a6-TangDuLieuDanhMuc.py --apply    # ghi
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def _tim_tools():
    for goc in (HERE, os.getcwd()):
        d = goc
        for _ in range(6):
            ung = os.path.join(d, 'tools')
            if os.path.exists(os.path.join(ung, 'tcfix.py')):
                return ung
            if os.path.exists(os.path.join(d, 'tcfix.py')):
                return d
            d = os.path.dirname(d)
    raise SystemExit('KHÔNG tìm thấy thư mục `tools` (chứa tcfix.py).')


sys.path.insert(0, os.environ.get('QA_TOOLS') or _tim_tools())
import tcfix                                                        # noqa: E402
import qalib                                                        # noqa: E402

XLSX = os.path.join(HERE, '..', 'testcase', 'Testcase-Role-ChuyenVien-TangDuLieuDanhMuc.xlsx')

V = '✿✿ [CẦN VERIFY] '
M = '✿✿ [YÊU CẦU MONG ĐỢI] '
R = '✿✿ [RỦI RO] '
L = '✿✿ [Lệch BA - theo Code] '

# ── Ba cụm ghi chú dùng lại nhiều lần ────────────────────────────────────────────────────────
T_QUYEN = (R + 'Cả bốn trang của menu này không có phép kiểm vai trò nào ở giao diện và mục '
           'sidebar khai quyền rỗng, nên mọi tài khoản đã đăng nhập đều thấy đủ nút. Nếu máy chủ '
           'cũng không chặn thì đây là lỗ hổng phân quyền. Cần QA/BA + dev xác nhận lưới chắn '
           'phía máy chủ. Nguồn: TKCT §15.4 · §15.13.')
T_DODAI = (V + 'Giao diện chỉ chặn 250 ký tự bằng thuộc tính của ô nhập, hàm kiểm chỉ bắt ô rỗng '
           'chứ không có luật độ dài. Giới hạn thật của cột dữ liệu chưa được xác nhận.')
T_BANG = (V + 'Tên bảng và tên cột trong câu truy vấn đối chiếu cần xác nhận lại với dev '
          'trước khi thực thi.')
T_TOAST = (L + 'Mọi lỗi của biểu mẫu đều báo bằng thông báo nổi ở góc màn hình; giao diện không '
           'tô viền ô lỗi và không đặt con trỏ vào ô lỗi như khuôn thông thường của hệ thống.')

# ── Bảng luật: (sheet, CN, nhóm, tiêu đề, C, D, T[, lần thứ n]) ──────────────────────────────
# sheet: 'CHINH' = BP-TangDuLieuDanhMuc · 'CHITIET' = BP-ChiTietDanhMuc · 'YEUCAU' = BP-YeuCauThayDoi
SHEET = {'CHINH': 'BP-TangDuLieuDanhMuc',
         'CHITIET': 'BP-ChiTietDanhMuc',
         'YEUCAU': 'BP-YeuCauThayDoi'}

LUAT = []


# Câu DẶN người test thuộc cột C, không thuộc cột D (§8.2.1 — phép rà ⑳ bắt đúng lớp này).
# Viết luật cho gọn thì vẫn đặt câu đó ở đầu cột D; `L_` tự tách ra và nối thành BƯỚC CUỐI
# của cột C. Làm một chỗ ở đây thay vì nhớ tách tay ở hơn 20 luật.
DAN_DO = 'Ghi lại nguyên trạng và đối chiếu với thiết kế: '
BUOC_DAN_DO = 'Ghi lại nguyên trạng hệ thống trả về rồi đối chiếu với thiết kế màn hình.'


def L_(sheet, cn, nhom, tieu_de, c=None, d=None, t=None, thu=1):
    if d and DAN_DO in d:
        d = d.replace(DAN_DO, '')
        d = d[:1].upper() + d[1:]
        if c:
            so = len([x for x in c.split('\n') if x[:1].isdigit()]) + 1
            c = c + '\n%d. %s' % (so, BUOC_DAN_DO)
    LUAT.append(dict(sheet=sheet, cn=cn, nhom=nhom, tieu_de=tieu_de, c=c, d=d, t=t, thu=thu))


# ══════════════════════════════════════════════════════════════════════════════════════════
#  KHUÔN DÙNG CHUNG
# ══════════════════════════════════════════════════════════════════════════════════════════
def tab(sheet, cn, xuoi, nguoc=None):
    """Hai case Tab / Shift Tab của `Giao diện chung` — ghi ĐÚNG thứ tự tiêu điểm của màn."""
    L_(sheet, cn, 'Giao diện chung', 'Kiểm tra khi thực hiện Tab',
       'Thực hiện bấm phím Tab',
       'Con trỏ lần lượt dừng ở: %s.' % xuoi)
    L_(sheet, cn, 'Giao diện chung', 'Kiểm tra khi thực hiện Shift Tab',
       'Thực hiện bấm phím Shift + Tab',
       nguoc or 'Con trỏ đi ngược lại đúng thứ tự khi bấm Tab, dừng đủ các thành phần đó.')


def nut(sheet, cn, nhom, nhan, viec, thu=1, t=None):
    """Case `căn lề, chính tả của button` — §8.2.7 ④ đòi nói rõ nút LÀM GÌ.

    Cột D giữ NGẮN (phép rà ⑳ chặn ở 180 ký tự phần thuật); chi tiết phụ dồn sang cột T.
    """
    L_(sheet, cn, nhom, 'Kiểm tra căn lề, chính tả của button',
       '1. Quan sát nút "%s".\n2. Bấm nút "%s".' % (nhan, nhan),
       'Đúng chính tả, chữ trong nút được căn giữa. Bấm nút "%s" %s' % (nhan, viec),
       t, thu=thu)


def tai_lai(sheet, cn, doi_tuong, loi_tai, toast_ok, co_loc):
    """Nhóm `Button Làm mới dữ liệu` — bank Tải lại, 6 mục."""
    L_(sheet, cn, 'Button Làm mới dữ liệu', 'Kiểm tra hiển thị nút "Làm mới dữ liệu"',
       '1. Mở màn.\n2. Tìm nút tròn có biểu tượng mũi tên xoay ở cuối thanh lọc, phía bên phải.\n'
       '3. Rê chuột lên nút để đọc chú thích.',
       '1. Nút nằm đúng cuối thanh lọc, phía bên phải màn hình.\n'
       '2. Chú thích hiện đúng chữ "Làm mới dữ liệu".')
    L_(sheet, cn, 'Button Làm mới dữ liệu', 'Kiểm tra tải lại dữ liệu khi không áp dụng bộ lọc',
       '1. Mở màn, chưa lọc và chưa tìm kiếm gì.\n'
       '2. Ghi lại dòng chữ "Cập nhật: ..." nằm bên phải, ngay dưới thanh lọc.\n'
       '3. Bấm nút "Làm mới dữ liệu".',
       '1. %s được lấy lại mới nhất từ hệ thống.\n2. %s\n'
       '3. Dòng "Cập nhật: ..." đổi sang thời điểm vừa bấm, theo dạng ngày/tháng/năm giờ:phút.'
       % (doi_tuong, toast_ok))
    L_(sheet, cn, 'Button Làm mới dữ liệu', 'Kiểm tra tải lại dữ liệu khi ĐANG có bộ lọc/tìm kiếm',
       '1. %s\n2. Bấm nút "Làm mới dữ liệu".' % co_loc,
       '1. %s được lấy lại mới nhất nhưng vẫn giữ nguyên từ khoá và các lựa chọn lọc đang áp.\n'
       '2. %s' % (doi_tuong, toast_ok))
    L_(sheet, cn, 'Button Làm mới dữ liệu',
       'Kiểm tra tải lại khi đang ở trang phân trang khác (Trang 2, 3...)',
       '1. Để danh sách có nhiều trang, chuyển sang trang 2 và đổi số bản ghi/trang khác mức mặc định.\n'
       '2. Bấm nút "Làm mới dữ liệu".',
       'Vẫn ở đúng trang 2 và giữ nguyên số bản ghi/trang vừa đặt.')
    L_(sheet, cn, 'Button Làm mới dữ liệu', 'Kiểm tra hiệu ứng Loading khi bấm "Làm mới dữ liệu"',
       '1. Bấm nút "Làm mới dữ liệu".\n2. Quan sát nút trong lúc chờ hệ thống trả dữ liệu.',
       '1. Biểu tượng mũi tên trên nút xoay tròn trong lúc chờ.\n'
       '2. Nút bị vô hiệu trong lúc chờ, bấm thêm không gửi yêu cầu mới.')
    L_(sheet, cn, 'Button Làm mới dữ liệu', 'Kiểm tra khi mất kết nối mạng (Offline/Network Error)',
       '1. Ngắt kết nối mạng của máy.\n2. Bấm nút "Làm mới dữ liệu".',
       '1. Hiện thông báo nổi "%s".\n'
       '2. Dữ liệu cũ trên màn giữ nguyên, không bị xoá trắng.' % loi_tai)


# ⛔ LUẬT CỨNG UI (tool_v2, `qalib` §0a) — giá trị mặc định của ô chọn và của ô số bản ghi/trang
# do LUẬT quyết, không do màn thật quyết. Script A6 này vẫn GIỮ NGUYÊN con số/chữ quan sát được
# ở từng call site; hàm dưới chuyển nó từ "kết quả mong đợi" thành "BẰNG CHỨNG màn chạy sai"
# (cột T). Không vá ở đây thì chạy A6 lẻ là ghi đè lại chữ sai — chuỗi sinh có bước 11d dọn,
# nhưng `a6-<Màn>.py --apply` chạy tay thì không ai dọn.
def _luat_cung(nhom, cn, quan_sat, ghi_chu=None):
    """(cột D theo luật, cột T kèm bằng chứng) — trả (None, ghi_chu) khi luật không chốt ô này."""
    ng = qalib.ngu_canh_o_chon(cn, nhom)
    d = qalib.kq_mac_dinh_chuan(nhom, ng) if ng else None
    if not d:
        return None, ghi_chu                      # CN Sửa (§5.6) và ô ngoài phạm vi luật
    bc = qalib.bang_chung_tu_cot_d(quan_sat, nhom, ng)
    if not bc:
        return d, ghi_chu
    co = '%s %s' % (qalib.CO_LUAT_CUNG, bc)
    return d, (ghi_chu + ' · ' + co) if ghi_chu else co


def perpage_text(sheet, cn, mac_dinh):
    """Nhóm `Textbox Số bản ghi trên trang` — 10 mục, theo hành vi thật của thanh phân trang."""
    g = 'Textbox Số bản ghi trên trang'
    _qs = 'Ô hiện sẵn số %s và danh sách đang hiển thị đúng %s bản ghi ở trang đầu.' % (mac_dinh, mac_dinh)
    _d, _t = _luat_cung(g, cn, _qs)
    L_(sheet, cn, g, 'Kiểm tra giá trị mặc định ô số bản ghi trên trang',
       '1. Mở màn, chưa đổi gì.\n2. Đọc ô nhập bên phải chữ "Số bản ghi/trang:" ở thanh phân trang.',
       _d or _qs, _t)
    L_(sheet, cn, g, 'Kiểm tra nhập ký tự khác số vào ô số bản ghi trên trang',
       '1. Đặt con trỏ vào ô "Số bản ghi/trang:".\n2. Gõ chữ cái và các ký tự đặc biệt.',
       'Ô chỉ nhận chữ số và dấu chấm, các ký tự khác không vào được ô. Không có thông báo lỗi nào.')
    L_(sheet, cn, g, 'Kiểm tra nhập số âm vào ô số bản ghi trên trang',
       '1. Gõ dấu trừ rồi gõ số vào ô "Số bản ghi/trang:".\n2. Rời khỏi ô.',
       'Dấu trừ không vào được ô, chỉ còn phần chữ số. Danh sách áp theo phần chữ số đó.')
    L_(sheet, cn, g, 'Kiểm tra nhập 0 vào ô số bản ghi trên trang',
       '1. Xoá hết nội dung ô "Số bản ghi/trang:" rồi gõ 0.\n2. Rời khỏi ô hoặc nhấn Enter.',
       '1. Hiện dòng chữ đỏ "Số bản ghi/trang phải lớn hơn 0" ngay trên ô.\n'
       '2. Viền ô chuyển sang màu đỏ.\n3. Danh sách giữ nguyên số bản ghi/trang đang dùng.')
    L_(sheet, cn, g, 'Kiểm tra nhập lớn hơn 1000 vào ô số bản ghi trên trang',
       '1. Gõ một số lớn hơn 1000 vào ô "Số bản ghi/trang:".\n2. Rời khỏi ô hoặc nhấn Enter.',
       '1. Hiện thông báo nổi "Số bản ghi/trang tối đa 1000 bản ghi".\n'
       '2. Ô tự trả về số đang dùng trước đó, danh sách không đổi.')
    L_(sheet, cn, g, 'Kiểm tra nhập giá trị trùng một mức có sẵn trong ô chọn nhanh',
       '1. Gõ 50 vào ô "Số bản ghi/trang:" rồi rời khỏi ô.\n'
       '2. Bấm nút mũi tên "Chọn nhanh số bản ghi" bên cạnh.',
       '1. Danh sách hiển thị 50 bản ghi mỗi trang và quay về trang 1.\n'
       '2. Trong danh sách chọn nhanh, mức 50 được tô sáng.')
    L_(sheet, cn, g, 'Kiểm tra nhập giá trị không trùng mức nào trong ô chọn nhanh',
       '1. Gõ 37 vào ô "Số bản ghi/trang:" rồi rời khỏi ô.\n'
       '2. Bấm nút mũi tên "Chọn nhanh số bản ghi" bên cạnh.',
       '1. Danh sách hiển thị 37 bản ghi mỗi trang và quay về trang 1.\n'
       '2. Trong danh sách chọn nhanh không mức nào được tô sáng.')
    L_(sheet, cn, g, 'Kiểm tra nhập số bản ghi trên trang nhỏ hơn tổng số bản ghi',
       '1. Đọc "Tổng số bản ghi:" ở thanh phân trang.\n'
       '2. Gõ vào ô "Số bản ghi/trang:" một số nhỏ hơn con số đó rồi rời khỏi ô.',
       'Trang đầu hiển thị đúng số bản ghi vừa nhập và thanh phân trang hiện nhiều trang.')
    L_(sheet, cn, g, 'Kiểm tra nhập số bản ghi trên trang lớn hơn tổng số bản ghi',
       '1. Đọc "Tổng số bản ghi:" ở thanh phân trang.\n'
       '2. Gõ vào ô "Số bản ghi/trang:" một số lớn hơn con số đó rồi rời khỏi ô.',
       'Hiển thị hết bản ghi trên một trang, thanh phân trang còn đúng 1 trang.')
    L_(sheet, cn, g, 'Kiểm tra nhập số bản ghi trên trang bằng đúng tổng số bản ghi',
       '1. Đọc "Tổng số bản ghi:" ở thanh phân trang.\n'
       '2. Gõ đúng con số đó vào ô "Số bản ghi/trang:" rồi rời khỏi ô.',
       'Hiển thị hết bản ghi trên một trang, thanh phân trang còn đúng 1 trang.')


def perpage_select(sheet, cn, mac_dinh, trong_ds):
    """Nhóm `Selectbox Số bản ghi trên trang` — 5 mục."""
    g = 'Selectbox Số bản ghi trên trang'
    if trong_ds:
        d0 = ('1. Bên phải ô "Số bản ghi/trang:" có nút mũi tên, chú thích "Chọn nhanh số bản ghi".\n'
              '2. Bấm nút thì mức %s đang dùng được tô sáng trong danh sách.' % mac_dinh)
        t0 = None
    else:
        d0 = ('1. Bên phải ô "Số bản ghi/trang:" có nút mũi tên, chú thích "Chọn nhanh số bản ghi".\n'
              '2. Bấm nút thì không mức nào được tô sáng, vì mức %s đang dùng không nằm trong '
              'danh sách chọn nhanh.' % mac_dinh)
        t0 = (R + 'Cỡ trang mặc định của màn này là %s nhưng danh sách chọn nhanh chỉ có '
              '20/50/100/200/500, nên mở ra không thấy mục nào đang được chọn. Cần QA/BA chốt lại '
              'mức mặc định hoặc bổ sung mức %s vào danh sách.' % (mac_dinh, mac_dinh))
    _d, _t = _luat_cung(g, cn, d0, t0)
    L_(sheet, cn, g, 'Kiểm tra giá trị mặc định ô chọn số bản ghi mỗi trang',
       '1. Mở màn, chưa đổi gì.\n2. Quan sát cụm chọn số bản ghi ở thanh phân trang rồi bấm mở.',
       _d or d0, _t)
    L_(sheet, cn, g, 'Kiểm tra các giá trị trong ô chọn số bản ghi mỗi trang',
       '1. Bấm nút "Chọn nhanh số bản ghi".',
       'Hiển thị các giá trị: 20 · 50 · 100 · 200 · 500.')
    L_(sheet, cn, g, 'Kiểm tra chọn số bản ghi mỗi trang nhỏ hơn tổng số',
       '1. Đọc "Tổng số bản ghi:" ở thanh phân trang.\n'
       '2. Bấm "Chọn nhanh số bản ghi" rồi chọn một mức nhỏ hơn con số đó.',
       '1. Danh sách hiển thị đúng số bản ghi vừa chọn và quay về trang 1.\n'
       '2. Ô "Số bản ghi/trang:" đổi theo mức vừa chọn.\n3. Thanh phân trang hiện nhiều trang.')
    L_(sheet, cn, g, 'Kiểm tra chọn số bản ghi mỗi trang lớn hơn hoặc bằng tổng số',
       '1. Đọc "Tổng số bản ghi:" ở thanh phân trang.\n'
       '2. Bấm "Chọn nhanh số bản ghi" rồi chọn một mức lớn hơn con số đó.',
       '1. Hiển thị hết bản ghi trên một trang, thanh phân trang còn đúng 1 trang.\n'
       '2. Ô "Số bản ghi/trang:" đổi theo mức vừa chọn.')
    L_(sheet, cn, g, 'Kiểm tra chọn số bản ghi mỗi trang bằng đúng tổng số bản ghi hiện có',
       '1. Đọc "Tổng số bản ghi:" ở thanh phân trang.\n'
       '2. Bấm "Chọn nhanh số bản ghi" rồi chọn đúng mức bằng con số đó nếu có.',
       '1. Hiển thị hết bản ghi trên một trang, thanh phân trang còn đúng 1 trang.\n'
       '2. Ô "Số bản ghi/trang:" đổi theo mức vừa chọn.')


def selectbox_khong_o_tim(sheet, cn, nhom, nhan, gia_tri, mac_dinh, tac_dung,
                          dong=False, ghi_chu=None):
    """Nhóm ô chọn dùng thành phần Select của hệ thống — KHÔNG có ô tìm kiếm bên trong (6 mục)."""
    # Dữ kiện "không có ô tìm kiếm bên trong" đặt ở case GIÁ TRỊ MẶC ĐỊNH, không đặt ở case
    # *các giá trị có trong …*: case đó bị `fix_kq_mau` dựng lại NGUYÊN Ô từ `gia_tri_tinh`
    # của hồ sơ màn (phép ㉘) nên câu thêm vào sẽ mất.
    # Dữ kiện "không có ô tìm kiếm bên trong" là hành vi THẬT của control -> giữ ở mọi nhánh;
    # riêng phần *giá trị mặc định* thì luật cứng quyết, quan sát cũ thành bằng chứng cột T.
    _qs = mac_dinh + ' Trong ô chọn không có ô tìm kiếm nào.'
    _d, _t = _luat_cung(nhom, cn, mac_dinh, ghi_chu)
    L_(sheet, cn, nhom, 'Kiểm tra giá trị mặc định %s' % nhan,
       '1. Mở màn.\n2. Đọc chữ đang hiện trong ô chọn "%s".\n3. Bấm mở ô chọn.' % nhan,
       (_d + ' Trong ô chọn không có ô tìm kiếm nào.') if _d else _qs, _t)
    if dong:
        d_gt = gia_tri
    else:
        d_gt = 'Hiển thị các giá trị: %s' % gia_tri
    L_(sheet, cn, nhom, 'Kiểm tra các giá trị có trong %s' % nhan,
       '1. Bấm mở ô chọn "%s".\n2. Đọc toàn bộ các mục trong danh sách.' % nhan, d_gt)
    L_(sheet, cn, nhom, 'Kiểm tra sắp xếp các giá trị trong %s' % nhan,
       '1. Bấm mở ô chọn "%s".\n2. Đối chiếu thứ tự các mục với thiết kế màn hình.' % nhan,
       'Thứ tự các mục giữ đúng như thiết kế, không tự sắp lại theo bảng chữ cái.')
    L_(sheet, cn, nhom, 'Kiểm tra chọn các giá trị khác nhau trong %s' % nhan,
       '1. Bấm mở ô chọn "%s" rồi chọn một giá trị.\n'
       '2. Mở lại và chọn một giá trị khác.\n'
       '3. Mở lại và bấm đúng giá trị đang được chọn.' % nhan,
       '1. Chỉ được chọn 1. Hiển thị giá trị được chọn sau cùng lên ô chọn, danh sách đóng lại ngay.\n'
       '2. %s\n'
       '3. Bấm lại giá trị đang chọn thì ô trở về trạng thái chưa chọn.' % tac_dung)
    L_(sheet, cn, nhom, 'Kiểm tra hiển thị %s khi giá trị quá dài' % nhan,
       '1. Chọn giá trị có nhãn dài nhất trong danh sách.\n2. Quan sát ô chọn.',
       'Nhãn dài bị cắt bớt bằng dấu ba chấm trong ô, không tràn ra ngoài và không đẩy lệch '
       'các thành phần bên cạnh.')
    L_(sheet, cn, nhom, 'Kiểm tra căn lề các giá trị trong %s' % nhan,
       '1. Bấm mở ô chọn "%s".\n2. Quan sát căn lề của các mục trong danh sách.' % nhan,
       'Các mục căn lề trái thẳng hàng nhau, đúng chính tả.')


def o_tim(sheet, cn, nhom, nhan, gt_mac_dinh, pham_vi, rong_kq, khong_dau, ghi_chu_kd=None):
    """Nhóm ô tìm kiếm trong khối Validate — 9 mục của bank tìm kiếm."""
    L_(sheet, cn, nhom, 'Kiểm tra giá trị mặc định ô %s' % nhan,
       '1. Mở màn, chưa gõ gì.\n2. Quan sát ô tìm kiếm.', gt_mac_dinh)
    L_(sheet, cn, nhom, 'Kiểm tra ô %s nhập ký tự đặc biệt, thẻ html, script' % nhan,
       '1. Gõ vào ô "%s" chuỗi có ký tự đặc biệt và thẻ html, ví dụ <b>1</b>.\n'
       '2. Nhấn Enter.' % nhan,
       'Chuỗi vừa gõ hiện nguyên dạng trong ô, không bị thực thi. %s' % rong_kq)
    L_(sheet, cn, nhom, 'Kiểm tra ô %s nhận số' % nhan,
       '1. Gõ một chuỗi toàn chữ số vào ô "%s".\n2. Nhấn Enter.' % nhan,
       'Ô nhận chuỗi số như mọi ký tự khác. %s' % pham_vi)
    L_(sheet, cn, nhom, 'Kiểm tra copy nội dung dữ liệu, dán vào ô %s' % nhan,
       '1. Sao chép một từ khoá đang có trên danh sách.\n2. Dán vào ô "%s".\n3. Nhấn Enter.' % nhan,
       'Ô nhận đúng nội dung vừa dán, không lỗi phông chữ. %s' % pham_vi)
    L_(sheet, cn, nhom, 'Kiểm tra ô %s tìm bằng tiếng Việt có dấu' % nhan,
       '1. Gõ từ khoá tiếng Việt có dấu đang có trên danh sách vào ô "%s".\n2. Nhấn Enter.' % nhan,
       'Hiển thị đúng các bản ghi chứa từ khoá, chữ tiếng Việt hiện đúng dấu, không lỗi phông chữ.')
    L_(sheet, cn, nhom, 'Kiểm tra ô %s tìm bằng tiếng Việt không dấu' % nhan,
       '1. Chọn một bản ghi có dấu tiếng Việt trên danh sách.\n'
       '2. Gõ đúng từ khoá đó nhưng BỎ DẤU vào ô "%s".\n3. Nhấn Enter.' % nhan,
       khong_dau, ghi_chu_kd)
    L_(sheet, cn, nhom, 'Kiểm tra ô %s cắt khoảng trắng hai đầu' % nhan,
       '1. Gõ từ khoá có thêm khoảng trắng ở đầu và cuối vào ô "%s".\n2. Nhấn Enter.' % nhan,
       'Hệ thống tự cắt khoảng trắng hai đầu trước khi tìm và trả về đúng kết quả như khi gõ '
       'từ khoá không có khoảng trắng.')
    L_(sheet, cn, nhom, 'Kiểm tra nhập chuỗi rất dài vào ô %s' % nhan,
       '1. Dán vào ô "%s" một chuỗi khoảng 1.000 ký tự.\n2. Nhấn Enter.' % nhan,
       '1. Ô chỉ nhận tối đa 250 ký tự, phần vượt bị bỏ.\n2. %s\n'
       '3. Giao diện không vỡ và không báo lỗi hệ thống.' % rong_kq)
    L_(sheet, cn, nhom, 'Kiểm tra để trống ô %s' % nhan,
       '1. Gõ từ khoá để lọc danh sách.\n'
       '2. Bấm dấu nhân ở cuối ô hoặc xoá hết nội dung trong ô "%s".' % nhan,
       'Ô tìm kiếm không bắt buộc. Khi ô trống, danh sách trở lại đầy đủ như trước khi tìm.')


def o_tim_don_le(sheet, cn, nhom, nhan, cat_space, tuong_doi, dac_biet, viet_hoa, duoi_nguong):
    """Nhóm `Chức năng Tìm kiếm đơn lẻ` cho ô gõ chữ — 6 mục, mỗi mục MỘT mục đích riêng."""
    L_(sheet, cn, nhom, 'Tìm kiếm khi nhập:',
       '1. Gõ vào ô "%s" toàn ký tự khoảng trắng.\n2. Nhấn Enter.' % nhan,
       cat_space, thu=1)
    L_(sheet, cn, nhom, 'Tìm kiếm khi nhập:',
       '1. Gõ vào ô "%s" một từ khoá đang có trên danh sách, thêm khoảng trắng ở đầu và cuối '
       'chuỗi.\n2. Nhấn Enter.' % nhan,
       'Hệ thống cắt khoảng trắng hai đầu rồi mới tìm, trả về đúng bản ghi chứa từ khoá đó.',
       thu=2)
    L_(sheet, cn, nhom, 'Tìm kiếm tương đối:', tuong_doi[0], tuong_doi[1], viet_hoa)
    L_(sheet, cn, nhom, 'Tìm kiếm khi nhập:', dac_biet[0], dac_biet[1], thu=3)
    L_(sheet, cn, nhom, 'Tìm kiếm khi nhập chữ tiếng việt có dấu',
       '1. Gõ vào ô "%s" một từ khoá tiếng Việt có dấu đang có trên danh sách.\n'
       '2. Nhấn Enter.' % nhan,
       'Hiển thị đúng các bản ghi chứa từ khoá, chữ hiện đúng dấu tiếng Việt.')
    L_(sheet, cn, nhom, 'Tìm kiếm khi nhập dữ liệu không giới hạn',
       '1. Gõ lần lượt 1 ký tự, 2 ký tự rồi 3 ký tự vào ô "%s", mỗi lần chờ hơn 2 giây.\n'
       '2. Gõ lại 2 ký tự rồi nhấn Enter ngay.' % nhan, duoi_nguong)


def breadcrumb(sheet, cn, cap, cap_cuoi, nhan_dai):
    g = 'Breadcrumb'
    L_(sheet, cn, g, 'Kiểm tra Breadcrumb hiển thị đủ cấp',
       '1. Mở màn ở cửa sổ rộng dưới 1024 điểm ảnh hoặc trên máy tính bảng.\n'
       '2. Đọc dải đường dẫn nằm trên thanh tiêu đề.',
       'Dải đường dẫn hiện: biểu tượng ngôi nhà (chú thích "Tổng quan") > %s.' % cap,
       V + 'Dải đường dẫn dùng chung của thanh trên chỉ hiện ở màn hình nhỏ (ẩn từ 1024 điểm ảnh '
       'trở lên). Trên màn hình rộng người dùng không thấy đường dẫn nào. Cần QA/BA chốt đây là '
       'chủ đích hay thiếu sót.')
    L_(sheet, cn, g, 'Kiểm tra bấm vào cấp trên của Breadcrumb',
       '1. Bấm vào chữ "Tầng dữ liệu danh mục" trên dải đường dẫn.',
       'Chuyển sang màn Danh mục dùng chung.')
    L_(sheet, cn, g, 'Kiểm tra cấp cuối của Breadcrumb',
       '1. Bấm vào chữ "%s" ở cuối dải đường dẫn.' % cap_cuoi,
       'Cấp cuối là chữ thường, không bấm được và không điều hướng đi đâu.')
    L_(sheet, cn, g, 'Kiểm tra Breadcrumb khi nhãn cấp cuối quá dài',
       '1. Mở màn có nhãn cấp cuối dài.\n2. Quan sát dải đường dẫn.', nhan_dai)
    L_(sheet, cn, g, 'Kiểm tra Breadcrumb khi thu hẹp cửa sổ trình duyệt',
       '1. Thu hẹp dần cửa sổ trình duyệt từ rộng xuống hẹp.\n2. Quan sát dải đường dẫn.',
       'Dải đường dẫn xuất hiện khi cửa sổ hẹp lại và biến mất khi cửa sổ rộng trở lại. '
       'Khi hiện, các cấp không xuống dòng lộn xộn và không che thanh tiêu đề.')


def icon_nhom(sheet, cn, ds_icon, mau_xoa, dieu_kien):
    """Nhóm `Icon` — 10 mục của bank, viết theo bộ biểu tượng THẬT trên bản ghi."""
    g = 'Icon'
    L_(sheet, cn, g, 'Kiểm tra biểu tượng thao tác phù hợp với chức năng',
       '1. Mở màn, xem cột "Hành động" của bảng.\n2. Đối chiếu từng biểu tượng với thao tác của nó.',
       'Cột "Hành động" hiện các biểu tượng: %s. %s' % (ds_icon, dieu_kien))
    L_(sheet, cn, g, 'Kiểm tra màu icon xóa nếu có', 'Kiểm tra màu icon xóa nếu có', mau_xoa)
    L_(sheet, cn, g, 'Kiểm tra chú thích hiện khi rê chuột và ẩn khi bỏ chuột',
       '1. Rê chuột lên từng biểu tượng ở cột "Hành động".\n2. Bỏ chuột ra khỏi biểu tượng.',
       '1. Hiện chú thích đúng tên tương ứng với chức năng.\n2. Bỏ chuột thì chú thích mất đi.')
    L_(sheet, cn, g, 'Kiểm tra đổi màu và con trỏ khi rê chuột vào biểu tượng',
       '1. Rê chuột lên một biểu tượng ở cột "Hành động".',
       'Biểu tượng đổi màu và con trỏ chuột đổi thành hình bàn tay.')
    L_(sheet, cn, g, 'Kiểm tra nội dung và chính tả của chú thích',
       '1. Rê chuột lên từng biểu tượng và đọc chú thích.',
       'Chú thích đúng chính tả và đúng nghĩa thao tác: %s.' % ds_icon)
    L_(sheet, cn, g, 'Kiểm tra chiều rộng và chiều cao của chú thích (tooltip)',
       '1. Rê chuột lên từng biểu tượng.\n2. Quan sát khung chú thích.',
       'Khung chú thích vừa đúng nội dung, không bị cắt chữ và không tràn ra ngoài bảng.')
    L_(sheet, cn, g, 'Kiểm tra căn lề văn bản trên chú thích (tooltip)',
       '1. Rê chuột lên từng biểu tượng.\n2. Quan sát chữ trong khung chú thích.',
       'Chữ trong khung chú thích căn giữa, không sát mép khung.')
    L_(sheet, cn, g, 'Kiểm tra chú thích ẩn đi ngay khi bỏ chuột ra khỏi biểu tượng',
       '1. Rê chuột lên một biểu tượng cho chú thích hiện ra.\n2. Đưa chuột ra chỗ khác.',
       'Chú thích ẩn đi ngay, không còn đọng lại trên màn.')
    L_(sheet, cn, g, 'Kiểm tra biểu tượng đổi màu khi rê chuột vào',
       '1. Rê chuột lần lượt lên từng biểu tượng ở cột "Hành động".',
       'Biểu tượng đang rê chuột đổi màu, các biểu tượng còn lại giữ nguyên màu.')
    L_(sheet, cn, g, 'Kiểm tra con trỏ chuột đổi hình khi rê vào biểu tượng',
       '1. Rê chuột lên biểu tượng, rồi đưa ra vùng trống của bản ghi.',
       'Trên biểu tượng con trỏ là hình bàn tay, ra vùng trống thì trở lại hình mũi tên.')


def bang_ds(sheet, cn, nhom, ten, cot, rong, so_luong, dai, dieu_huong, mac_dinh=None):
    """Nhóm bảng dữ liệu — 8 mục y chang bộ `Danh sách / lưới`."""
    L_(sheet, cn, nhom, 'Kiểm tra giá trị mặc định của %s' % ten,
       '1. Kiểm tra căn lề dữ liệu trong bảng.\n2. Di chuyển con trỏ chuột vào một bản ghi.\n'
       '3. Kiểm tra bố cục trong bảng danh sách.\n'
       '4. Rê chuột vào các biểu tượng hoặc các liên kết trên bản ghi.\n'
       '5. Bỏ chuột khỏi các biểu tượng hoặc các liên kết.',
       mac_dinh or
       '1. Chữ căn lề trái. Số căn lề phải. Ngày tháng có số ký tự bằng nhau căn giữa.\n'
       '2. Màu nền của bản ghi đó thay đổi.\n'
       '3. Các cột xếp từ trái qua phải đúng như thiết kế màn hình. Phân trang và tổng số bản '
       'ghi đặt ở cuối bảng.\n4. Hiện chú thích đúng tên tương ứng với chức năng.\n'
       '5. Bỏ chuột khỏi biểu tượng, chú thích mất đi.')
    L_(sheet, cn, nhom, 'Kiểm tra tiêu đề cột của %s' % ten,
       '1. Đọc tiêu đề từng cột của bảng từ trái sang phải.\n'
       '2. Kiểm chính tả và cách viết hoa của từng tiêu đề cột.',
       'Đúng các cột theo thứ tự: %s. Tiêu đề viết đúng chính tả, không viết tắt lạ.' % cot)
    L_(sheet, cn, nhom, 'Kiểm tra %s khi không có dữ liệu' % ten,
       '1. Lọc hoặc tìm kiếm sao cho không còn bản ghi nào.', rong)
    L_(sheet, cn, nhom, 'Kiểm tra số lượng bản ghi trên %s' % ten,
       '1. Đếm số bản ghi đang hiển thị trên trang.\n'
       '2. Đối chiếu với "Tổng số bản ghi:" và số bản ghi/trang ở thanh phân trang.', so_luong)
    L_(sheet, cn, nhom, 'Kiểm tra dữ liệu %s hiển thị đúng cột' % ten,
       '1. Đối chiếu từng giá trị trên một bản ghi với tiêu đề cột tương ứng.',
       'Dữ liệu nằm đúng cột, không lệch hàng lệch cột.')
    L_(sheet, cn, nhom, 'Kiểm tra độ rộng các cột của %s' % ten,
       '1. Quan sát độ rộng từng cột khi bảng có dữ liệu.',
       'Độ rộng các cột phù hợp với dữ liệu, không quá hẹp hay quá thừa.')
    L_(sheet, cn, nhom, 'Kiểm tra %s hiển thị dữ liệu dài' % ten,
       '1. Chuẩn bị bản ghi có giá trị rất dài.\n2. Xem bản ghi đó trên bảng.', dai)
    L_(sheet, cn, nhom, 'Kiểm tra điều hướng đúng trang từ %s' % ten,
       '1. Bấm lần lượt các thao tác ở cột "Hành động" trên một bản ghi.', dieu_huong)


def attt_phien(sheet, cn, tieu_de, thao_tac):
    L_(sheet, cn, 'An toàn thông tin', tieu_de,
       '1. Để phiên đăng nhập hết hạn.\n2. %s' % thao_tac,
       'Thao tác không được thực hiện. Thông báo: "Phiên đăng nhập đã hết hạn. Vui lòng đăng '
       'nhập lại." và người dùng phải đăng nhập lại.')


# ══════════════════════════════════════════════════════════════════════════════════════════
#  SHEET 1 — BP-TangDuLieuDanhMuc  ·  màn "Danh mục dùng chung"  (/reference-data)
#  Lưới THẺ 2 cột, không phải bảng. Tìm kiếm + phân trang + sắp xếp đều chạy ở trình duyệt
#  trên toàn bộ danh sách đã tải một lần (tối đa 1000 bộ).
# ══════════════════════════════════════════════════════════════════════════════════════════
S = 'CHINH'
CN_DS = 'DANH SÁCH BỘ DANH MỤC'
CN_TK = 'TÌM KIẾM BỘ DANH MỤC'
CN_XL = 'XUẤT EXCEL DANH SÁCH BỘ DANH MỤC'
CN_LS = 'XEM CHI TIẾT LỊCH SỬ TỆP EXCEL'

tab(S, CN_DS,
    'nút "Xuất Excel" · nút "Lịch sử xuất" · nút "Yêu cầu thay đổi" · ô "Tìm theo mã…" · '
    'nút "Làm mới dữ liệu" · lần lượt từng thẻ bộ danh mục · ô "Số bản ghi/trang:" · '
    'nút "Chọn nhanh số bản ghi" · các nút chuyển trang')
tab(S, CN_TK,
    'ô "Tìm theo mã…" · dấu nhân xoá từ khoá khi ô đang có chữ · nút "Làm mới dữ liệu"')
# CN Xuất Excel chỉ có 2 case `Giao diện chung` nói về TỆP (§2 luật 1) — không có case Tab.
tab(S, CN_LS, 'nút "Lịch sử xuất" rồi lần lượt từng mục trong danh sách lịch sử xuất')

nut(S, CN_DS, 'Button Yêu cầu thay đổi', 'Yêu cầu thay đổi', 'điều hướng tới màn tương ứng.')
nut(S, CN_LS, 'Button Lịch sử xuất', 'Lịch sử xuất',
    'mở danh sách các lần xuất gần đây ngay dưới nút.',
    t='Khi còn lần xuất chưa xong thì trên nút có thêm biểu tượng xoay tròn.')

tai_lai(S, CN_DS, 'Lưới thẻ bộ danh mục', 'Không thể tải danh mục',
        'Hiện thông báo nổi "Đã làm mới danh sách".',
        'Gõ từ khoá vào ô "Tìm theo mã…" rồi chờ lưới lọc xong.')

perpage_text(S, CN_DS, 10)
perpage_select(S, CN_DS, 10, trong_ds=False)

# ── Lưới THẺ: bộ 8 mục của bank viết cho BẢNG, ở đây viết lại theo THẺ ──────────────────────
G = 'Lưới thẻ bộ danh mục'
L_(S, CN_DS, G, 'Kiểm tra giá trị mặc định của Lưới thẻ bộ danh mục',
   '1. Mở màn Danh mục dùng chung.\n2. Quan sát cách xếp các thẻ và nội dung một thẻ.\n'
   '3. Rê chuột vào một thẻ.\n4. Đối chiếu thứ tự các thẻ với ngày đồng bộ cuối ghi trên thẻ.',
   '1. Các thẻ xếp thành lưới 2 cột, mỗi thẻ gồm: biểu tượng nhóm, mã bộ danh mục ở góc phải, '
   'tên bộ danh mục, mô tả, số phần tử, ngày đồng bộ cuối, mũi tên sang phải.\n'
   '2. Rê chuột vào thẻ thì viền và tên thẻ đổi màu, mũi tên dịch sang phải.\n'
   '3. Thẻ có ngày đồng bộ cuối mới nhất đứng trước.')
L_(S, CN_DS, G, 'Kiểm tra tiêu đề cột của Lưới thẻ bộ danh mục',
   '1. Đọc từng dòng thông tin trên một thẻ.\n2. Đối chiếu với thiết kế màn hình.',
   'Thẻ hiển thị đúng các thông tin: mã bộ danh mục · tên bộ danh mục · mô tả · số phần tử · '
   'ngày đồng bộ cuối. Chữ "phần tử" viết đúng chính tả.')
L_(S, CN_DS, G, 'Kiểm tra Lưới thẻ bộ danh mục khi không có dữ liệu',
   '1. Gõ vào ô "Tìm theo mã…" một từ khoá chắc chắn không khớp bộ danh mục nào.\n'
   '2. Quan sát vùng lưới thẻ.',
   'Hiện hình minh hoạ kèm dòng chữ "Không tìm thấy kết quả tìm kiếm". Thanh phân trang ẩn hoàn toàn.',
   V + 'Khi danh sách rỗng mà KHÔNG có từ khoá thì màn hiện "Không có dữ liệu". Trường hợp này '
   'chỉ tái hiện được khi hệ thống chưa có bộ danh mục nào.')
L_(S, CN_DS, G, 'Kiểm tra số lượng bản ghi trên Lưới thẻ bộ danh mục',
   '1. Đếm số thẻ đang hiển thị trên trang.\n'
   '2. Đối chiếu với "Tổng số bản ghi:" và số bản ghi/trang ở thanh phân trang.',
   'Số thẻ trên trang bằng số bản ghi/trang đang đặt, trang cuối bằng phần còn lại. '
   'Tổng số bản ghi bằng số bộ danh mục còn lại sau khi lọc.')
L_(S, CN_DS, G, 'Kiểm tra dữ liệu Lưới thẻ bộ danh mục hiển thị đúng cột',
   '1. Chọn một thẻ bất kỳ, đối chiếu từng giá trị trên thẻ với dữ liệu của bộ danh mục đó.\n'
   '2. Bấm vào thẻ để mở màn chi tiết rồi đối chiếu lại.',
   'Mã, tên, mô tả và ngày đồng bộ cuối trên thẻ đúng của bộ danh mục vừa mở, không lẫn sang '
   'thẻ khác.')
L_(S, CN_DS, G, 'Kiểm tra độ rộng các cột của Lưới thẻ bộ danh mục',
   '1. Quan sát chiều rộng hai cột thẻ ở cửa sổ rộng.\n'
   '2. Thu hẹp cửa sổ xuống dưới 768 điểm ảnh.',
   '1. Ở cửa sổ rộng, hai cột thẻ rộng bằng nhau.\n'
   '2. Khi cửa sổ hẹp, lưới xuống còn một cột, thẻ không bị cắt và không tràn ngang.')
L_(S, CN_DS, G, 'Kiểm tra Lưới thẻ bộ danh mục hiển thị dữ liệu dài',
   '1. Chọn bộ danh mục có tên và mô tả rất dài.\n2. Xem thẻ của bộ danh mục đó.',
   'Tên bị cắt còn một dòng, mô tả bị cắt còn tối đa hai dòng, phần thừa thay bằng dấu ba chấm. '
   'Thẻ không cao lên bất thường và không đẩy lệch các thẻ bên cạnh.')
L_(S, CN_DS, G, 'Kiểm tra điều hướng đúng trang từ Lưới thẻ bộ danh mục',
   '1. Bấm chuột vào một thẻ bộ danh mục.\n'
   '2. Quay lại màn trước, dùng phím Tab đưa tiêu điểm vào một thẻ rồi nhấn Enter.\n'
   '3. Làm lại bước 2 nhưng nhấn phím cách.',
   'Cả ba cách đều điều hướng sang màn Chi tiết bộ danh mục của đúng thẻ vừa chọn.')

L_(S, CN_DS, 'Chức năng Danh sách bộ danh mục', 'Kiểm tra dữ liệu danh sách khớp DB',
   '1. Mở màn Danh mục dùng chung, đặt số bản ghi/trang lớn hơn "Tổng số bản ghi:" để xem hết '
   'trên một trang.\n2. Ghi lại mã, tên, số phần tử và ngày đồng bộ cuối của các thẻ.\n'
   '3. Đối chiếu với dữ liệu trong hệ thống:\nselect * from <bảng dữ liệu của màn>\n'
   'where deleted_at is null\norder by lan_dong_bo_cuoi desc;',
   'Số thẻ và từng thông tin trên thẻ khớp chính xác với dữ liệu bộ danh mục trong hệ thống. '
   'Thứ tự thẻ giống thứ tự theo lần đồng bộ cuối mới nhất trước.', T_BANG)

# ── An toàn thông tin của màn danh sách ────────────────────────────────────────────────────
A = 'An toàn thông tin'
L_(S, CN_DS, A, 'Truy cập màn bằng tài khoản khác vai trò',
   '1. Đăng nhập tài khoản KHÁC vai trò (Lãnh đạo Bộ / Đơn vị nguồn / Sở GD&ĐT / Trường học / '
   'Tổ chức ngoài).\n2. Gõ thẳng địa chỉ màn Danh mục dùng chung.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện KHÔNG chặn vai trò nào nên màn vẫn '
   'mở ra đầy đủ. Nếu máy chủ chặn thì danh sách rỗng hoặc báo không đủ quyền.', T_QUYEN)
L_(S, CN_DS, A, 'Can thiệp tham số để lấy dữ liệu ngoài phạm vi',
   '1. Sửa tham số trang và số bản ghi trên địa chỉ để yêu cầu quá 1000 bộ danh mục.\n'
   '2. Mở lại màn và đọc "Tổng số bản ghi:".',
   'Hệ thống chỉ trả về dữ liệu thuộc phạm vi tỉnh/đơn vị được phân công, không lộ bản ghi ngoài '
   'phạm vi được phân công.', T_QUYEN)

# ── CN TÌM KIẾM ───────────────────────────────────────────────────────────────────────────
G = 'Textbox Tìm theo mã'
o_tim(S, CN_TK, G, 'Tìm theo mã',
      'Ô trống, hiện chữ gợi ý "Tìm theo mã…". Bên trái ô có biểu tượng kính lúp.',
      'Lưới thẻ chỉ còn các bộ danh mục có mã, tên, tên tiếng Anh hoặc mô tả chứa từ khoá, và '
      'quay về trang 1.',
      'Lưới thẻ hiện hình minh hoạ kèm dòng chữ "Không tìm thấy kết quả tìm kiếm".',
      'Lưới thẻ hiện "Không tìm thấy kết quả tìm kiếm": tìm kiếm so khớp nguyên chuỗi nên từ khoá '
      'bỏ dấu không khớp dữ liệu có dấu.',
      M + 'Chuẩn mong đợi là tìm được cả khi gõ không dấu. Hàm lọc của màn chỉ hạ chữ thường rồi '
      'so khớp chứa, không bỏ dấu, nên hiện tại không ra kết quả. Cần QA/BA quyết có bổ sung '
      'tìm không dấu hay không.')

o_tim_don_le(
    S, CN_TK, G, 'Tìm theo mã',
    cat_space='Danh sách giữ nguyên đầy đủ: hệ thống cắt khoảng trắng hai đầu nên từ khoá thành '
              'chuỗi rỗng và không áp lọc nào.',
    tuong_doi=('1. Gõ vào ô "Tìm theo mã…" một phần của mã đang có, lần lượt bằng chữ thường rồi '
               'chữ HOA.\n2. Đối chiếu kết quả với dữ liệu trong hệ thống:\n'
               'select * from <bảng dữ liệu của màn>\nwhere lower(<cột được tìm>) '
               "like lower('%<từ khoá>%');",
               '1. Hai lần gõ cho cùng một kết quả: lọc không phân biệt chữ hoa chữ thường.\n'
               '2. Kết quả khớp với dữ liệu đang lưu trong hệ thống.'),
    dac_biet=('1. Gõ vào ô "Tìm theo mã…" lần lượt các ký tự đặc biệt: %  ·  &  ·  _  ·  *  ·  \\'
              '  ·  dấu nháy  ·  thẻ html <b>1</b>.\n2. Nhấn Enter sau mỗi lần.',
              'Ký tự đặc biệt được coi như chữ thường, không có ký tự nào mang nghĩa đại diện. '
              'Lưới thẻ chỉ còn bộ danh mục có chuỗi chứa đúng ký tự đó, không có thì hiện '
              '"Không tìm thấy kết quả tìm kiếm".'),
    viet_hoa=T_BANG,
    duoi_nguong='1. Với 1 và 2 ký tự, hệ thống không áp lọc, lưới thẻ giữ nguyên đầy đủ và không '
                'hiện thông báo nào.\n2. Từ 3 ký tự trở lên, kết quả áp sau khi ngừng gõ 1500 mili '
                'giây.\n3. Nhấn Enter thì áp ngay cả với 2 ký tự, bỏ qua cả thời gian chờ lẫn '
                'ngưỡng ký tự.')

G = 'Chức năng Tìm kiếm chung'
L_(S, CN_TK, G, 'Tìm kiếm theo giá trị mặc định',
   '1. Mở màn Danh mục dùng chung.\n2. Không gõ gì vào ô "Tìm theo mã…".',
   'Lưới thẻ hiển thị toàn bộ bộ danh mục, xếp theo lần đồng bộ cuối mới nhất trước, trang 1.')
L_(S, CN_TK, G, 'Tìm kiếm không ra kết quả với từng điều kiện tìm kiếm hoặc tất cả các điều kiện',
   '1. Gõ vào ô "Tìm theo mã…" từ khoá chắc chắn không khớp bộ danh mục nào.\n2. Nhấn Enter.',
   'Hiển thị thông báo: Không tìm thấy kết quả tìm kiếm')
L_(S, CN_TK, G, 'Tìm kiếm kết hợp tất cả các điều kiện tìm kiếm',
   '1. Gõ vào ô "Tìm theo mã…" một chuỗi vừa khớp một phần mã vừa khớp một phần tên của cùng một '
   'bộ danh mục.\n2. Nhấn Enter.',
   'Hiển thị các bộ danh mục thoả mãn từ khoá. Màn chỉ có một tiêu chí tìm kiếm nên đây cũng là '
   'kết quả của toàn bộ điều kiện.',
   V + 'Màn Danh mục dùng chung chỉ có MỘT ô tìm kiếm, không có bộ lọc nào khác, nên case này '
   'trùng với case tìm theo một tiêu chí. Giữ lại theo khuôn mẫu.')
L_(S, CN_TK, G,
   'Thực hiện tìm kiếm lần lượt 2 điều kiện khác nhau nhưng đều ra số bản ghi kết quả giống nhau',
   '1. Gõ từ khoá 1 là một phần MÃ bộ danh mục, ghi lại số thẻ tìm được.\n'
   '2. Xoá ô tìm, gõ từ khoá 2 là một phần TÊN bộ danh mục sao cho cũng ra đúng số thẻ đó.',
   'Hai lượt cho cùng số thẻ nhưng danh sách thẻ khác nhau, đúng theo từ khoá vừa gõ.')

L_(S, CN_TK, A, 'Kiểm tra tìm kiếm chỉ trong phạm vi phạm vi tỉnh/đơn vị được phân công',
   '1. Gõ vào ô "Tìm theo mã…" từ khoá khớp bộ danh mục ngoài phạm vi được phân công.\n'
   '2. Nhấn Enter.',
   'Không trả về bản ghi ngoài phạm vi được phân công. Kết quả giới hạn đúng theo phạm vi '
   'tỉnh/đơn vị được phân công.',
   R + 'Lọc chạy ngay trên trình duyệt trên toàn bộ danh sách máy chủ đã trả về, nên phạm vi dữ '
   'liệu hoàn toàn do máy chủ quyết định. Cần QA/BA + dev xác nhận máy chủ có lọc theo phạm vi '
   'hay không.')

# ── CN XUẤT EXCEL ─────────────────────────────────────────────────────────────────────────
G = 'Giao diện chung'
L_(S, CN_XL, G, 'Kiểm tra đầy đủ thông tin trong file xuất ra',
   '1. Mở màn Danh mục dùng chung, chưa lọc gì.\n2. Bấm nút "Xuất Excel".\n'
   '3. Chờ tải xong rồi mở tệp vừa tải về.\n4. Đối chiếu các cột trong tệp với thông tin trên thẻ.',
   'Tệp Excel có đủ các cột mô tả bộ danh mục: <danh sách cột của file xuất>. Không thiếu cột nào '
   'và không có cột kỹ thuật thừa.',
   V + 'Tệp Excel do máy chủ dựng, giao diện chỉ gửi lên danh sách mã bộ danh mục đang lọc. '
   'Danh sách cột thật của tệp cần dev xác nhận.')
L_(S, CN_XL, G, 'Kiểm tra file excel xuất ra',
   '1. Mở màn Danh mục dùng chung.\n2. Bấm nút "Xuất Excel".\n'
   '3. Quan sát nút trong lúc chờ.\n4. Mở tệp vừa tải về.',
   '1. Trong lúc chờ, nút đổi chữ thành "Đang xuất..." và bị vô hiệu.\n'
   '2. Với dữ liệu nhỏ: hiện thông báo nổi "Đã tạo tệp Excel." và trình duyệt tải tệp về ngay.\n'
   '3. Với dữ liệu lớn: hiện thông báo nổi "Dữ liệu lớn đang được xuất nền. Theo dõi trong lịch '
   'sử xuất." và chưa tải tệp. Máy chủ không trả liên kết tải thì hiện "Không thể tạo liên kết '
   'tải tệp Excel."\n'
   '4. Tệp mở lên không lỗi phông chữ, cột số căn phải, các cột còn lại căn trái, hàng tiêu đề '
   'in đậm và được ghim khi cuộn.',
   V + 'Tên tệp, tiêu đề bên trong tệp và quy tắc căn lề do máy chủ dựng, cần dev xác nhận.')

G = 'Chức năng Xuất excel'
L_(S, CN_XL, G, 'Kiểm tra dữ liệu xuất ra khớp hệ thống',
   '1. Đặt số bản ghi/trang lớn hơn "Tổng số bản ghi:" để thấy hết thẻ trên một trang.\n'
   '2. Bấm "Xuất Excel" khi chưa gõ từ khoá nào.\n'
   '3. Mở tệp, đối chiếu từng dòng với các thẻ trên màn.',
   'Số dòng trong tệp bằng tổng số bộ danh mục trên màn. Từng thông tin khớp chính xác và thứ tự '
   'giống thứ tự thẻ trên màn.')
L_(S, CN_XL, G, 'Kiểm tra danh sách xuất ra khớp với dữ liệu trong DB',
   '1. Bấm "Xuất Excel".\n2. Mở tệp, đối chiếu với dữ liệu trong hệ thống:\n'
   'select * from <bảng dữ liệu của màn>\nwhere deleted_at is null\n'
   'order by lan_dong_bo_cuoi desc;',
   'Số dòng và từng thông tin trong tệp khớp chính xác với dữ liệu trong hệ thống, không thừa '
   'không thiếu bản ghi.', T_BANG)
L_(S, CN_XL, G, 'Kiểm tra xuất theo bộ lọc hiện tại',
   '1. Gõ từ khoá vào ô "Tìm theo mã…" để lưới chỉ còn vài bộ danh mục.\n'
   '2. Chuyển sang trang 2 nếu kết quả còn nhiều trang.\n3. Bấm "Xuất Excel".\n4. Mở tệp.',
   'Tệp chứa đúng các bộ danh mục khớp từ khoá, không xuất cả danh sách đầy đủ. Tệp chứa hết kết '
   'quả lọc chứ không chỉ các thẻ đang hiện trên trang.')
L_(S, CN_XL, G, 'Kiểm tra bấm xuất khi danh sách rỗng',
   '1. Gõ từ khoá sao cho lưới thẻ không còn bộ danh mục nào.\n'
   '2. Quan sát nút "Xuất Excel".\n3. Bấm nút "Xuất Excel".',
   '1. Nút "Xuất Excel" vẫn bấm được, không bị vô hiệu.\n'
   '2. Hiện thông báo nổi "Không có dữ liệu phù hợp để xuất." và không tải tệp nào.')
L_(S, CN_XL, G, 'Kiểm tra xuất dữ liệu lớn (nhiều bản ghi)',
   '1. Xoá hết từ khoá để lưới có toàn bộ bộ danh mục.\n2. Bấm "Xuất Excel".\n'
   '3. Mở danh sách "Lịch sử xuất" và theo dõi.',
   '1. Hiện thông báo nổi "Dữ liệu lớn đang được xuất nền. Theo dõi trong lịch sử xuất."\n'
   '2. Màn không bị treo, vẫn thao tác được.\n'
   '3. Trong danh sách "Lịch sử xuất" xuất hiện một lần xuất mới, trạng thái tự đổi sang '
   '"Hoàn tất" khi xong và tải được tệp.')
L_(S, CN_XL, G, 'Kiểm tra bấm xuất Excel liên tiếp nhiều lượt',
   '1. Bấm "Xuất Excel" và chờ xong.\n2. Bấm xuất lại ngay.\n3. Lặp lại vài lượt liên tiếp.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: mỗi lượt đều xuất được và thêm một dòng vào '
   'danh sách "Lịch sử xuất". Lượt nào bị chặn thì hiện thông báo nổi "Xuất Excel thất bại." '
   'hoặc nội dung lỗi máy chủ trả về, không thất bại im lặng.',
   V + 'Giao diện không đặt giới hạn số lần xuất. Cần dev xác nhận máy chủ có giới hạn tần suất '
   'hay không.')
L_(S, CN_XL, G, 'Kiểm tra click liên tục vào nút xuất',
   '1. Bấm liên tục nhiều lần vào nút "Xuất Excel" trong thời gian ngắn.',
   'Hệ thống không gửi request nhiều lần. Nút bị vô hiệu và đổi chữ thành "Đang xuất..." ngay sau '
   'lần bấm đầu, chỉ tạo một lần xuất.')

# ── CN XEM CHI TIẾT LỊCH SỬ TỆP EXCEL ─────────────────────────────────────────────────────
G = 'Danh sách lịch sử xuất'
L_(S, CN_LS, G, 'Kiểm tra giá trị mặc định của lịch sử xuất',
   '1. Bấm nút "Lịch sử xuất".\n2. Quan sát cách xếp và nội dung một mục trong danh sách.\n'
   '3. Rê chuột vào một mục.',
   '1. Danh sách thả xuống ngay dưới nút, các lần xuất mới nhất xếp trước.\n'
   '2. Mỗi mục có ba dòng: tên tệp, nhãn trạng thái, thời điểm tạo theo dạng ngày/tháng/năm giờ:phút.\n'
   '3. Rê chuột vào mục thì nền mục đổi màu.')
L_(S, CN_LS, G, 'Kiểm tra tiêu đề cột của lịch sử xuất',
   '1. Bấm nút "Lịch sử xuất".\n2. Đọc từng dòng thông tin của một mục.',
   'Mỗi mục hiển thị đủ: tên tệp · nhãn trạng thái · thời điểm tạo. Lần xuất thất bại hiện thêm '
   'dòng mô tả lỗi bằng chữ đỏ. Chữ trên mục đúng chính tả.')
L_(S, CN_LS, G, 'Kiểm tra lịch sử xuất khi không có dữ liệu',
   '1. Dùng tài khoản chưa từng xuất Excel lần nào.\n2. Bấm nút "Lịch sử xuất".\n'
   '3. Ngắt kết nối mạng rồi bấm lại nút "Lịch sử xuất".',
   '1. Danh sách hiện đúng một dòng chữ mờ "Chưa có lần xuất gần đây", dòng này không bấm được.\n'
   '2. Khi tải danh sách lỗi: hiện thông báo nổi "Không thể tải lịch sử xuất Excel."')
L_(S, CN_LS, G, 'Kiểm tra số lượng bản ghi trên lịch sử xuất',
   '1. Bấm "Xuất Excel" hai lần liên tiếp.\n2. Bấm nút "Lịch sử xuất" và đếm số mục.',
   'Mỗi lần bấm "Xuất Excel" thêm đúng một mục vào danh sách, không gộp và không nhân đôi.')
L_(S, CN_LS, G, 'Kiểm tra dữ liệu lịch sử xuất hiển thị đúng cột',
   '1. Bấm "Xuất Excel", ghi lại thời điểm bấm.\n2. Bấm nút "Lịch sử xuất".\n'
   '3. Đối chiếu mục đầu tiên với lần xuất vừa thực hiện.',
   'Tên tệp, nhãn trạng thái và thời điểm tạo của mục đầu tiên đúng của lần xuất vừa thực hiện.')
L_(S, CN_LS, G, 'Kiểm tra độ rộng các cột của lịch sử xuất',
   '1. Bấm nút "Lịch sử xuất".\n2. Quan sát chiều rộng danh sách và ba dòng của mỗi mục.',
   'Danh sách đủ rộng cho tên tệp dài nhất, ba dòng của mỗi mục không đè lên nhau và không tràn '
   'ra ngoài khung.')
L_(S, CN_LS, G, 'Kiểm tra lịch sử xuất hiển thị dữ liệu dài',
   '1. Tạo một lần xuất thất bại có mô tả lỗi dài.\n2. Bấm nút "Lịch sử xuất" và xem mục đó.',
   'Mô tả lỗi bị cắt còn tối đa hai dòng, không đẩy lệch các mục bên cạnh và không tràn khung.')
L_(S, CN_LS, G, 'Kiểm tra điều hướng đúng trang từ lịch sử xuất',
   '1. Bấm nút "Lịch sử xuất".\n2. Bấm vào một mục đã "Hoàn tất".\n'
   '3. Bấm vào một mục đang "Chờ xử lý" hoặc "Đang xuất...".\n'
   '4. Bấm vào một mục đã "Hết hạn".',
   '1. Mục đã hoàn tất: trình duyệt tải tệp về, danh sách đóng lại.\n'
   '2. Mục chưa xong: bấm không có tác dụng, danh sách vẫn mở.\n'
   '3. Mục hết hạn: tên tệp hiện mờ và gạch ngang, bấm không tải được tệp.')

G = 'Chức năng Xem chi tiết lịch sử xuất excel'
L_(S, CN_LS, G, 'Xem & đóng màn chi tiết',
   '1. Bấm nút "Lịch sử xuất" để mở danh sách.\n'
   '2. Đọc thông tin một lần xuất.\n3. Bấm ra ngoài danh sách hoặc bấm lại nút "Lịch sử xuất".',
   '1. Danh sách mở ra ngay dưới nút, hiện đủ tên tệp, nhãn trạng thái và thời điểm tạo.\n'
   '2. Bấm ra ngoài thì danh sách đóng lại, màn giữ nguyên từ khoá và trang đang xem.')
L_(S, CN_LS, G, 'Kiểm tra dữ liệu chi tiết khớp DB',
   '1. Bấm nút "Lịch sử xuất", ghi lại tên tệp và thời điểm tạo của mục đầu tiên.\n'
   '2. Đối chiếu với dữ liệu trong hệ thống:\n'
   "select * from <bảng dữ liệu của màn> where id = '<mã bản ghi>';",
   'Tên tệp, trạng thái và thời điểm tạo trên màn khớp chính xác với dữ liệu trong hệ thống.',
   T_BANG)
A = 'An toàn thông tin'
L_(S, CN_LS, A, 'Yêu cầu đăng nhập khi xem chi tiết',
   '1. Để phiên đăng nhập hết hạn hoặc đăng xuất.\n2. Bấm nút "Lịch sử xuất".',
   'Không xem được danh sách. Hệ thống đưa về trang đăng nhập kèm thông báo "Bạn cần đăng nhập '
   'để truy cập trang này. Vui lòng đăng nhập bằng tài khoản của bạn để tiếp tục."')
L_(S, CN_LS, A, 'Không xem được chi tiết bản ghi ngoài phạm vi được phân công',
   '1. Đăng nhập tài khoản A, bấm "Xuất Excel" một lần.\n'
   '2. Đăng nhập tài khoản B khác đơn vị, bấm nút "Lịch sử xuất".',
   'Tài khoản B không thấy lần xuất của tài khoản A. Danh sách chỉ có các lần xuất thuộc phạm vi '
   'tỉnh/đơn vị được phân công.', T_QUYEN)
L_(S, CN_LS, A, 'Chống XSS ở nội dung hiển thị',
   '1. Chuẩn bị một lần xuất có tên tệp hoặc mô tả lỗi chứa đoạn script HTML: <b>1</b>.\n'
   '2. Bấm nút "Lịch sử xuất" và xem mục đó.',
   'Chuỗi hiện ra đúng nguyên dạng đã lưu, không thực thi script và không làm vỡ danh sách.')

# ══════════════════════════════════════════════════════════════════════════════════════════
#  SHEET 2 — BP-ChiTietDanhMuc  ·  màn "Chi tiết bộ danh mục"  (/reference-data/:code)
#  Bảng phần tử + thẻ "Lịch sử thay đổi". Mọi thao tác ghi đều tạo YÊU CẦU THAY ĐỔI chờ duyệt.
# ══════════════════════════════════════════════════════════════════════════════════════════
S = 'CHITIET'
CN_DS = 'DANH SÁCH PHẦN TỬ DANH MỤC'
CN_TK = 'TÌM KIẾM & LỌC PHẦN TỬ DANH MỤC'
CN_TH = 'THÊM PHẦN TỬ DANH MỤC'
CN_SU = 'CHỈNH SỬA PHẦN TỬ DANH MỤC'
CN_ND = 'NGỪNG DÙNG PHẦN TỬ DANH MỤC'
CN_LS = 'XEM LỊCH SỬ THAY ĐỔI CỦA BỘ DANH MỤC'

tab(S, CN_DS,
    'dải đường dẫn · nút "Lịch sử thay đổi" · nút "Thêm phần tử" · ô "Tìm mã hoặc tên…" · '
    'ô chọn "Trạng thái" · lần lượt các biểu tượng ở cột "Hành động" của từng bản ghi · '
    'ô "Số bản ghi/trang:" · nút "Chọn nhanh số bản ghi" · các nút chuyển trang')
tab(S, CN_TK, 'ô "Tìm mã hoặc tên…" rồi tới ô chọn "Trạng thái"')
tab(S, CN_TH,
    'ô "Mã phần tử" · ô "Tên phần tử" · ô chọn "Trạng thái" · ô "Thứ tự" · ô "Ngày bắt đầu" · '
    'ô "Ngày kết thúc" · ô chọn "Năm học" · nút "Huỷ" · nút "Gửi yêu cầu"')
tab(S, CN_SU,
    'ô "Mã phần tử" · ô "Tên phần tử" · ô chọn "Trạng thái" · ô "Thứ tự" · nút "Huỷ" · '
    'nút "Gửi yêu cầu"')
tab(S, CN_ND,
    'ô chọn "Ánh xạ sang phần tử mới (nếu có)" · ô "Lý do" · nút "Huỷ" · '
    'nút "Xác nhận ngừng dùng"',
    'Con trỏ đi ngược lại đúng thứ tự khi bấm Tab. Ô "Ngày ngừng hiệu lực" bị bỏ qua ở cả hai '
    'chiều vì là ô chỉ đọc.')
tab(S, CN_LS,
    'nút "Lịch sử thay đổi" · nút "Thêm phần tử" · ô "Số bản ghi/trang:" · '
    'nút "Chọn nhanh số bản ghi" · các nút chuyển trang')

breadcrumb(S, CN_DS, 'Tầng dữ liệu danh mục > Phần tử', 'Phần tử',
           'Cấp cuối luôn là chữ "Phần tử" hoặc "Lịch sử thay đổi" theo thẻ đang xem, không phải '
           'tên bộ danh mục, nên nhãn không bao giờ dài quá. Nhãn dài hơn bề ngang thì bị cắt bớt '
           'bằng dấu ba chấm.')

bang_ds(S, CN_DS, 'Danh sách phần tử danh mục', 'phần tử danh mục',
        'STT · Mã · Tên · Thứ tự · Trạng thái · Hành động',
        'Bảng hiện đúng một dòng chữ "Không có phần tử nào." trải hết bề ngang bảng. '
        'Thanh phân trang ẩn hoàn toàn.',
        'Số bản ghi trên trang bằng số bản ghi/trang đang đặt, trang cuối bằng phần còn lại. '
        '"Tổng số bản ghi:" bằng số phần tử còn lại sau khi lọc trạng thái và tìm kiếm.',
        'Giá trị dài bị cắt trong ô, không tràn cột và không đẩy lệch các cột khác. Cột "Nội dung" '
        'xuống dòng thay vì kéo giãn bảng.',
        'Bấm biểu tượng "Chỉnh sửa" mở bảng trượt "Chỉnh sửa phần tử". Bấm biểu tượng "Ngừng dùng" '
        'mở hộp thoại "Ngừng dùng phần tử". Cả hai mở tại chỗ, không điều hướng sang màn khác.',
        mac_dinh='1. Cột STT và cột Thứ tự căn giữa. Cột Mã hiển thị bằng phông chữ đều. Các cột '
        'còn lại căn trái.\n2. Màu nền của bản ghi đó thay đổi.\n'
        '3. Các cột xếp từ trái qua phải: STT · Mã · Tên · Thứ tự · Trạng thái · Hành động. '
        'Cột thao tác đặt cuối bảng. Phân trang và tổng số bản ghi đặt ở cuối bảng.\n'
        '4. Hiện chú thích đúng tên tương ứng với chức năng.\n'
        '5. Bỏ chuột khỏi biểu tượng, chú thích mất đi.')

icon_nhom(S, CN_DS, '"Chỉnh sửa" (hình bút) · "Ngừng dùng" (hình vòng tròn gạch chéo)',
          'Màn không có thao tác xoá phần tử nên không áp dụng. Thao tác gần nhất là "Ngừng dùng", '
          'biểu tượng dùng màu chữ chung của cột thao tác, không tô đỏ.',
          'Bản ghi "Hoạt động" hiện cả hai biểu tượng. Bản ghi "Không hoạt động" chỉ hiện biểu '
          'tượng "Chỉnh sửa".')

perpage_text(S, CN_DS, 20)
perpage_select(S, CN_DS, 20, trong_ds=True)

L_(S, CN_DS, 'Chức năng Danh sách phần tử danh mục', 'Kiểm tra dữ liệu danh sách khớp DB',
   '1. Mở một bộ danh mục, để ô chọn "Trạng thái" ở "Tất cả trạng thái".\n'
   '2. Ghi lại mã, tên, thứ tự và trạng thái của các bản ghi đang hiển thị.\n'
   '3. Đối chiếu với dữ liệu trong hệ thống:\nselect * from <bảng dữ liệu của màn>\n'
   "where ma_bang = '<mã bộ danh mục>'\norder by thu_tu;",
   'Số bản ghi và từng cột hiển thị khớp chính xác với dữ liệu phần tử danh mục trong hệ thống. '
   'Thứ tự sắp xếp giống nhau.', T_BANG)

A = 'An toàn thông tin'
L_(S, CN_DS, A, 'Truy cập màn bằng tài khoản khác vai trò',
   '1. Đăng nhập tài khoản KHÁC vai trò (Lãnh đạo Bộ / Đơn vị nguồn / Sở GD&ĐT / Trường học / '
   'Tổ chức ngoài).\n2. Gõ thẳng địa chỉ màn Chi tiết bộ danh mục kèm mã một bộ danh mục.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện KHÔNG chặn vai trò nào nên màn vẫn '
   'mở ra đầy đủ, kể cả nút "Thêm phần tử" và các biểu tượng thao tác trên bản ghi.', T_QUYEN)
L_(S, CN_DS, A, 'Can thiệp tham số để lấy dữ liệu ngoài phạm vi',
   '1. Sửa mã bộ danh mục trên địa chỉ trang thành một mã không tồn tại.\n2. Mở lại màn.\n'
   '3. Làm lại với mã của bộ danh mục ngoài phạm vi được phân công.',
   '1. Với mã không tồn tại: hiện thông báo nổi "Danh mục không tồn tại hoặc không hợp lệ" và tự '
   'chuyển về màn Danh mục dùng chung.\n'
   '2. Với mã ngoài phạm vi: không lộ bản ghi ngoài phạm vi được phân công.', T_QUYEN)

# ── CN TÌM KIẾM & LỌC PHẦN TỬ ─────────────────────────────────────────────────────────────
G = 'Textbox Tìm mã hoặc tên'
o_tim(S, CN_TK, G, 'Tìm mã hoặc tên',
      'Ô trống, hiện chữ gợi ý "Tìm mã hoặc tên…". Bên trái ô có biểu tượng kính lúp.',
      'Bảng chỉ còn phần tử khớp từ khoá và quay về trang 1. Ô chọn "Trạng thái" đang chọn gì thì '
      'giữ nguyên điều kiện đó.',
      'Bảng hiện đúng một dòng chữ "Không có phần tử nào."',
      'Ghi lại nguyên trạng và đối chiếu với thiết kế: việc tìm không dấu do máy chủ quyết định. '
      'Nếu máy chủ có bỏ dấu thì ra đúng bản ghi, nếu không thì bảng hiện "Không có phần tử nào."',
      V + 'Ô tìm kiếm của màn này gửi từ khoá lên máy chủ, nên việc có bỏ dấu hay không hoàn toàn '
      'do máy chủ. Cần dev xác nhận.')

o_tim_don_le(
    S, CN_TK, G, 'Tìm mã hoặc tên',
    cat_space='Bảng giữ nguyên đầy đủ: hệ thống cắt khoảng trắng hai đầu nên từ khoá thành chuỗi '
              'rỗng và không gửi điều kiện tìm kiếm nào.',
    tuong_doi=('1. Gõ vào ô "Tìm mã hoặc tên…" một phần mã của phần tử đang có, lần lượt bằng chữ '
               'thường rồi chữ HOA.\n2. Đối chiếu kết quả với dữ liệu trong hệ thống:\n'
               'select * from <bảng dữ liệu của màn>\n'
               "where ma_bang = '<mã bộ danh mục>'\nand lower(<cột được tìm>) like lower('%<từ khoá>%');",
               '1. Hai lần gõ cho cùng một kết quả: tìm kiếm không phân biệt chữ hoa chữ thường.\n'
               '2. Kết quả khớp với dữ liệu đang lưu trong hệ thống.'),
    dac_biet=('1. Gõ vào ô "Tìm mã hoặc tên…" lần lượt các ký tự đặc biệt: %  ·  &  ·  _  ·  *  '
              '·  \\  ·  dấu nháy  ·  thẻ html <b>1</b>.\n2. Nhấn Enter sau mỗi lần.',
              'Hệ thống tìm bình thường và không báo lỗi hệ thống. Ký tự đặc biệt không làm hỏng '
              'điều kiện tìm kiếm. Không có kết quả thì bảng hiện "Không có phần tử nào."'),
    viet_hoa=T_BANG,
    duoi_nguong='1. Với 1 và 2 ký tự, hệ thống không gửi điều kiện tìm kiếm, bảng giữ nguyên đầy '
                'đủ và không hiện thông báo nào.\n'
                '2. Từ 3 ký tự trở lên, trong lúc chờ ô hiện biểu tượng xoay tròn có chú thích '
                '"Đang chờ nhập xong", kết quả áp sau khi ngừng gõ 1500 mili giây.\n'
                '3. Nhấn Enter thì áp ngay cả với 2 ký tự, bỏ qua cả thời gian chờ lẫn ngưỡng ký tự.')

selectbox_khong_o_tim(
    S, CN_TK, 'Selectbox Trạng thái', 'Trạng thái',
    '"Tất cả trạng thái" · "Hoạt động" · "Không hoạt động"',
    'Ô hiện sẵn "Tất cả trạng thái" và bảng đang liệt kê cả phần tử Hoạt động lẫn Không hoạt động.',
    'Bảng lọc lại theo trạng thái vừa chọn và quay về trang 1, từ khoá đang tìm giữ nguyên.',
    ghi_chu='Hai mục "Hoạt động" và "Không hoạt động" hiện kèm số phần tử đang có của trạng thái '
    'đó trong ngoặc.')
# ⛔ LUẬT CỨNG ①: case này đo *giá trị mặc định*, không đo việc CHỌN — nội dung chọn từng giá
# trị đã nằm ở case `Chọn 1 giá trị của Trạng thái` ngay dưới. Bản cũ viết cả C lẫn D theo hướng
# "chọn lần lượt" nên case luôn P dù ô đang chọn sẵn "Tất cả trạng thái".
L_(S, CN_TK, 'Selectbox Trạng thái', 'Tìm kiếm với:',
   qalib.buoc_mac_dinh_chuan('Selectbox Trạng thái', 'loc', tim_kiem=True),
   qalib.kq_mac_dinh_chuan('Selectbox Trạng thái', 'loc', tim_kiem=True),
   '%s màn thật đang hiện "Tất cả trạng thái"' % qalib.CO_LUAT_CUNG)
L_(S, CN_TK, 'Selectbox Trạng thái', 'Chọn 1 giá trị của Trạng thái',
   '1. Bấm mở ô chọn "Trạng thái" rồi chọn "Hoạt động".\n'
   '2. Đối chiếu số bản ghi với con số ghi trong ngoặc của chính mục "Hoạt động".',
   'Bảng chỉ còn phần tử "Hoạt động", quay về trang 1. "Tổng số bản ghi:" bằng đúng con số ghi '
   'trong ngoặc của mục vừa chọn.')

G = 'Chức năng Tìm kiếm chung'
L_(S, CN_TK, G, 'Tìm kiếm theo giá trị mặc định',
   '1. Mở màn Chi tiết bộ danh mục.\n2. Không gõ từ khoá và giữ ô chọn "Trạng thái" ở mặc định.',
   'Bảng hiển thị toàn bộ phần tử của bộ danh mục, gồm cả Hoạt động lẫn Không hoạt động, trang 1.')
L_(S, CN_TK, G, 'Tìm kiếm không ra kết quả với từng điều kiện tìm kiếm hoặc tất cả các điều kiện',
   '1. Gõ vào ô "Tìm mã hoặc tên…" từ khoá chắc chắn không khớp phần tử nào rồi nhấn Enter.\n'
   '2. Giữ từ khoá đó và chọn thêm "Trạng thái" = "Hoạt động".',
   'Cả hai lượt, bảng hiện đúng một dòng chữ "Không có phần tử nào." và thanh phân trang ẩn đi.')
L_(S, CN_TK, G, 'Tìm kiếm kết hợp tất cả các điều kiện tìm kiếm',
   '1. Gõ từ khoá khớp một phần tử "Hoạt động" vào ô "Tìm mã hoặc tên…".\n'
   '2. Chọn "Trạng thái" = "Hoạt động".',
   'Bảng chỉ còn phần tử vừa khớp từ khoá vừa ở trạng thái "Hoạt động".')
L_(S, CN_TK, G,
   'Thực hiện tìm kiếm lần lượt 2 điều kiện khác nhau nhưng đều ra số bản ghi kết quả giống nhau',
   '1. Gõ từ khoá là một phần MÃ phần tử, ghi lại số bản ghi tìm được.\n'
   '2. Xoá từ khoá, gõ một phần TÊN phần tử sao cho cũng ra đúng số bản ghi đó.',
   'Hai lượt cho cùng số bản ghi nhưng danh sách bản ghi khác nhau, đúng theo từ khoá vừa gõ.')

G = 'Chức năng Tìm kiếm kết hợp'
L_(S, CN_TK, G, 'Kiểm tra tìm kiếm kết hợp 2 tiêu chí',
   '1. Chọn 2 trong các tiêu chí của màn để kết hợp, ghi lại tiêu chí đã chọn vào cột kết quả '
   'thực tế. Các tiêu chí của màn: ô "Tìm mã hoặc tên…" · ô chọn "Trạng thái".\n'
   '2. Nhập hoặc chọn giá trị cho cả 2 tiêu chí, chắc chắn có bản ghi thoả mãn.\n'
   '3. Đối chiếu kết quả với dữ liệu trong hệ thống:\nselect * from <bảng dữ liệu của màn>\n'
   "where ma_bang = '<mã bộ danh mục>'\nand <điều kiện theo 2 tiêu chí đã chọn>;",
   'Bảng chỉ còn bản ghi thoả mãn ĐỒNG THỜI cả 2 tiêu chí, quay về trang 1. Kết quả khớp với dữ '
   'liệu đang lưu trong hệ thống.', T_BANG)
L_(S, CN_TK, G, 'Kiểm tra bỏ dần từng tiêu chí đang áp',
   '1. Áp cả 2 tiêu chí như case trên, ghi lại số bản ghi.\n'
   '2. Bỏ ô chọn "Trạng thái" về "Tất cả trạng thái", ghi lại số bản ghi.\n'
   '3. Xoá tiếp từ khoá trong ô tìm kiếm.',
   'Mỗi lần bỏ một tiêu chí thì số bản ghi tăng lên hoặc giữ nguyên, không bao giờ giảm. Khi bỏ '
   'hết, bảng trở lại toàn bộ phần tử của bộ danh mục.')

L_(S, CN_TK, A, 'Kiểm tra tìm kiếm chỉ trong phạm vi phạm vi tỉnh/đơn vị được phân công',
   '1. Gõ vào ô "Tìm mã hoặc tên…" từ khoá khớp phần tử ngoài phạm vi được phân công.\n'
   '2. Nhấn Enter.',
   'Không trả về bản ghi ngoài phạm vi được phân công. Kết quả giới hạn đúng theo phạm vi '
   'tỉnh/đơn vị được phân công.', T_QUYEN)

# ── CN THÊM PHẦN TỬ / CHỈNH SỬA PHẦN TỬ — hai biểu mẫu dùng chung bộ ô ────────────────────
T_TRIM = (R + 'Hàm kiểm của biểu mẫu chỉ xét ô có rỗng hay không và KHÔNG cắt khoảng trắng, nên '
          'chuỗi toàn dấu cách vẫn qua được lưới chắn và được gửi lên máy chủ. Cần QA/BA + dev '
          'xác nhận máy chủ có cắt khoảng trắng và chặn chuỗi rỗng hay không.')
T_MA_TRUNG = (V + 'Giao diện KHÔNG kiểm trùng mã. Dữ liệu thật của bộ dm_bac_luong đang có hai '
              'phần tử cùng mã 01, nên nhiều khả năng máy chủ cũng không chặn. Cần QA/BA chốt mã '
              'phần tử có phải là duy nhất hay không, và thông báo lỗi nếu có.')
T_SUA_MA = (R + 'Ô "Mã phần tử" ở biểu mẫu Chỉnh sửa KHÔNG bị khoá và mã mới được gửi lên máy '
            'chủ. Đổi mã của phần tử đang được các phân hệ khác tham chiếu có thể làm hỏng liên '
            'kết dữ liệu. Cần QA/BA + dev xác nhận đây có phải chủ đích không.')


def o_ma(sheet, cn, nut_gui, che_do):
    g = 'Textbox Mã phần tử'
    b3 = '3. Bấm nút "%s".' % nut_gui
    mac_dinh = ('Mặc định là trống, hiện chữ gợi ý "VD: VN_NEW".' if che_do == 'them'
                else 'Mặc định hiển thị dữ liệu từ DB: ô nạp sẵn đúng mã của phần tử đang chọn.')
    L_(sheet, cn, g, 'Kiểm tra giá trị mặc định Mã phần tử',
       '1. Mở biểu mẫu "%s".\n2. Quan sát ô "Mã phần tử".' % che_do_ten(che_do), mac_dinh)
    L_(sheet, cn, g, 'Kiểm tra Mã phần tử là trường bắt buộc',
       '1. Xoá trắng ô "Mã phần tử".\n2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Thông báo nổi "Vui lòng nhập Mã phần tử." Biểu mẫu không đóng và không gửi yêu cầu nào.',
       T_TOAST)
    L_(sheet, cn, g, 'Kiểm tra Mã phần tử nhập vượt độ dài cho phép',
       '1. Dán vào ô "Mã phần tử" một chuỗi 300 ký tự.\n2. Đếm số ký tự còn lại trong ô.\n' + b3,
       'Hoặc hệ thống không cho nhập quá 250 ký tự. Ô chỉ giữ lại 250 ký tự đầu, phần thừa bị bỏ '
       'và không có thông báo lỗi nào.', T_DODAI)
    L_(sheet, cn, g, 'Kiểm tra Mã phần tử nhập trong độ dài cho phép',
       '1. Nhập vào ô "Mã phần tử" một chuỗi đúng 250 ký tự.\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Nhận đủ chuỗi vừa nhập và gửi yêu cầu thành công.')
    L_(sheet, cn, g, 'Kiểm tra Mã phần tử nhập ký tự đặc biệt, thẻ html, script',
       '1. Nhập vào ô "Mã phần tử" chuỗi có ký tự đặc biệt và thẻ html, ví dụ <b>1</b>.\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ô nhận nguyên chuỗi vừa nhập, chữ cái tự chuyển thành chữ hoa. Không có thông báo lỗi '
       'định dạng nào ở giao diện.',
       V + 'Giao diện không có luật định dạng cho mã phần tử, chỉ tự chuyển thành chữ hoa. '
       'Cần QA/BA chốt mã phần tử có được chứa ký tự đặc biệt hay không.')
    L_(sheet, cn, g, 'Kiểm tra Mã phần tử nhập số',
       '1. Nhập vào ô "Mã phần tử" một chuỗi toàn chữ số.\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ô nhận chuỗi số bình thường và gửi yêu cầu thành công.')
    L_(sheet, cn, g, 'Kiểm tra Mã phần tử cắt khoảng trắng hai đầu',
       '1. Nhập vào ô "Mã phần tử" một chuỗi có khoảng trắng ở đầu và cuối.\n'
       '2. Làm lại với chuỗi chỉ gồm dấu cách.\n'
       '3. Các thông tin khác được nhập hợp lệ.\n4. Bấm nút "%s".' % nut_gui,
       'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện không cắt khoảng trắng, gửi '
       'nguyên chuỗi vừa nhập. Chuỗi chỉ gồm dấu cách vẫn qua được lưới chắn bắt buộc.', T_TRIM)
    L_(sheet, cn, g, 'Kiểm tra copy dữ liệu dán vào ô Mã phần tử',
       '1. Sao chép mã của một phần tử đang có.\n2. Dán vào ô "Mã phần tử".\n'
       '3. Các thông tin khác được nhập hợp lệ.\n4. Bấm nút "%s".' % nut_gui,
       'Ô nhận đúng nội dung vừa dán, chữ cái chuyển thành chữ hoa, không lỗi phông chữ.')
    L_(sheet, cn, g, 'Kiểm tra Mã phần tử nhập tiếng Việt có dấu',
       '1. Nhập vào ô "Mã phần tử" chuỗi tiếng Việt có dấu.\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ô nhận chuỗi tiếng Việt và chuyển thành chữ hoa, giữ đúng dấu, không lỗi phông chữ.')
    L_(sheet, cn, g, 'Kiểm tra dữ liệu đã tồn tại',
       '1. Nhập vào ô "Mã phần tử" đúng mã của một phần tử đang có trong bộ danh mục.\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện không chặn trùng mã. Nếu máy chủ '
       'chặn thì hiện thông báo nổi mang nội dung lỗi máy chủ trả về, hoặc "Không thể gửi yêu cầu." '
       'và không tạo yêu cầu.', T_MA_TRUNG)


def che_do_ten(che_do):
    return 'Thêm phần tử mới' if che_do == 'them' else 'Chỉnh sửa phần tử'


def o_ten(sheet, cn, nut_gui, che_do):
    g = 'Textbox Tên phần tử'
    b3 = '3. Bấm nút "%s".' % nut_gui
    mac_dinh = ('Mặc định là trống, hiện chữ gợi ý "Tên đầy đủ".' if che_do == 'them'
                else 'Mặc định hiển thị dữ liệu từ DB: ô nạp sẵn đúng tên của phần tử đang chọn.')
    L_(sheet, cn, g, 'Kiểm tra giá trị mặc định Tên phần tử',
       '1. Mở biểu mẫu "%s".\n2. Quan sát ô "Tên phần tử".' % che_do_ten(che_do), mac_dinh)
    L_(sheet, cn, g, 'Kiểm tra Tên phần tử là trường bắt buộc',
       '1. Xoá trắng ô "Tên phần tử".\n2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Thông báo nổi "Vui lòng nhập Tên phần tử." Biểu mẫu không đóng và không gửi yêu cầu nào.',
       T_TOAST)
    L_(sheet, cn, g, 'Kiểm tra Tên phần tử nhập vượt độ dài cho phép',
       '1. Dán vào ô "Tên phần tử" một chuỗi 300 ký tự.\n2. Đếm số ký tự còn lại trong ô.\n' + b3,
       'Hoặc hệ thống không cho nhập quá 250 ký tự. Ô chỉ giữ lại 250 ký tự đầu, phần thừa bị bỏ '
       'và không có thông báo lỗi nào.', T_DODAI)
    L_(sheet, cn, g, 'Kiểm tra Tên phần tử nhập trong độ dài cho phép',
       '1. Nhập vào ô "Tên phần tử" một chuỗi đúng 250 ký tự.\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Nhận đủ chuỗi vừa nhập và gửi yêu cầu thành công.')
    L_(sheet, cn, g, 'Kiểm tra Tên phần tử nhập ký tự đặc biệt, thẻ html, script',
       '1. Nhập vào ô "Tên phần tử" chuỗi có ký tự đặc biệt và thẻ html, ví dụ <b>1</b>.\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ô nhận nguyên chuỗi vừa nhập, không tự đổi chữ hoa chữ thường và không báo lỗi định dạng.')
    L_(sheet, cn, g, 'Kiểm tra Tên phần tử nhập số',
       '1. Nhập vào ô "Tên phần tử" một chuỗi toàn chữ số.\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ô nhận chuỗi số bình thường và gửi yêu cầu thành công.')
    L_(sheet, cn, g, 'Kiểm tra Tên phần tử cắt khoảng trắng hai đầu',
       '1. Nhập vào ô "Tên phần tử" một chuỗi có khoảng trắng ở đầu và cuối.\n'
       '2. Làm lại với chuỗi chỉ gồm dấu cách.\n'
       '3. Các thông tin khác được nhập hợp lệ.\n4. Bấm nút "%s".' % nut_gui,
       'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện không cắt khoảng trắng, gửi '
       'nguyên chuỗi vừa nhập. Chuỗi chỉ gồm dấu cách vẫn qua được lưới chắn bắt buộc.', T_TRIM)
    L_(sheet, cn, g, 'Kiểm tra copy dữ liệu dán vào ô Tên phần tử',
       '1. Sao chép tên của một phần tử đang có.\n2. Dán vào ô "Tên phần tử".\n'
       '3. Các thông tin khác được nhập hợp lệ.\n4. Bấm nút "%s".' % nut_gui,
       'Ô nhận đúng nội dung vừa dán, không lỗi phông chữ.')
    L_(sheet, cn, g, 'Kiểm tra Tên phần tử nhập tiếng Việt có dấu',
       '1. Nhập vào ô "Tên phần tử" chuỗi tiếng Việt có dấu.\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ô nhận và lưu đúng chuỗi tiếng Việt có dấu, mở lại vẫn đúng dấu, không lỗi phông chữ.')


def o_thu_tu(sheet, cn, nut_gui, che_do):
    g = 'Textbox Thứ tự'
    b3 = '3. Bấm nút "%s".' % nut_gui
    T_SO = (V + 'Ô "Thứ tự" là ô số của trình duyệt, giao diện không đặt giá trị nhỏ nhất, lớn '
            'nhất hay bước nhảy và không kiểm gì trước khi gửi. Giới hạn thật do máy chủ quyết '
            'định, cần dev xác nhận.')
    mac_dinh = ('Mặc định là trống, hiện chữ gợi ý 0.' if che_do == 'them'
                else 'Mặc định hiển thị dữ liệu từ DB: ô nạp sẵn đúng thứ tự của phần tử đang chọn.')
    L_(sheet, cn, g, 'Kiểm tra giá trị mặc định Thứ tự',
       '1. Mở biểu mẫu "%s".\n2. Quan sát ô "Thứ tự".' % che_do_ten(che_do), mac_dinh)
    L_(sheet, cn, g, 'Kiểm tra Thứ tự khi để trống',
       '1. Để trống ô "Thứ tự".\n2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ô "Thứ tự" không bắt buộc. Yêu cầu được gửi thành công, thứ tự được ghi nhận là 0.')
    L_(sheet, cn, g, 'Kiểm tra Thứ tự nhập giá trị = 0',
       '1. Nhập 0 vào ô "Thứ tự".\n2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ô nhận giá trị 0 và gửi yêu cầu thành công, không báo lỗi.')
    L_(sheet, cn, g, 'Kiểm tra Thứ tự nhập quá 18 chữ số',
       '1. Nhập vào ô "Thứ tự" một số có 20 chữ số.\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện không chặn độ dài, số được gửi '
       'nguyên lên máy chủ. Nếu máy chủ chặn thì hiện thông báo nổi "Không thể gửi yêu cầu."', T_SO)
    L_(sheet, cn, g, 'Kiểm tra Thứ tự nhập số âm',
       '1. Nhập -5 vào ô "Thứ tự".\n2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ghi lại nguyên trạng và đối chiếu với thiết kế: ô nhận số âm và gửi lên máy chủ, giao '
       'diện không báo lỗi.', T_SO)
    L_(sheet, cn, g, 'Kiểm tra Thứ tự nhập số thập phân',
       '1. Nhập 1.5 vào ô "Thứ tự".\n2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Ghi lại nguyên trạng và đối chiếu với thiết kế: ô nhận số thập phân và gửi lên máy chủ, '
       'giao diện không làm tròn và không báo lỗi.', T_SO)
    L_(sheet, cn, g, 'Kiểm tra Thứ tự nhập chữ và ký tự đặc biệt',
       '1. Gõ chữ cái và các ký tự đặc biệt vào ô "Thứ tự".\n2. Quan sát nội dung trong ô.',
       'Ô số của trình duyệt không nhận chữ cái và phần lớn ký tự đặc biệt. Ô để trống thì thứ tự '
       'được ghi nhận là 0.')
    L_(sheet, cn, g, 'Kiểm tra copy dữ liệu dán vào ô Thứ tự',
       '1. Sao chép một chuỗi có cả chữ và số.\n2. Dán vào ô "Thứ tự".',
       'Ô chỉ nhận phần là số hợp lệ, chuỗi có chữ thì ô để trống và thứ tự được ghi nhận là 0.')
    L_(sheet, cn, g, 'Kiểm tra ô Thứ tự cắt khoảng trắng hai đầu',
       '1. Dán vào ô "Thứ tự" một chuỗi số có khoảng trắng ở đầu và cuối.\n' + b3,
       'Ô số của trình duyệt bỏ khoảng trắng, chỉ giữ phần số. Yêu cầu gửi đi mang đúng con số đó.')
    L_(sheet, cn, g, 'Kiểm tra Thứ tự nhập tiếng Việt có dấu',
       '1. Gõ chuỗi tiếng Việt có dấu vào ô "Thứ tự".',
       'Ô không nhận chữ tiếng Việt, nội dung ô giữ nguyên như trước khi gõ.')
    L_(sheet, cn, g, 'Kiểm tra Thứ tự nhập đúng hoặc dưới ngưỡng độ dài cho phép',
       '1. Nhập một số nguyên dương nhỏ, ví dụ 5, vào ô "Thứ tự".\n'
       '2. Các thông tin khác được nhập hợp lệ.\n' + b3,
       'Yêu cầu gửi thành công. Sau khi yêu cầu được duyệt và áp dụng, phần tử đứng đúng vị trí '
       'theo thứ tự vừa nhập trên bảng.')


# ── Gọi bộ ô cho CN Thêm và CN Sửa ────────────────────────────────────────────────────────
o_ma(S, CN_TH, 'Gửi yêu cầu', 'them')
o_ten(S, CN_TH, 'Gửi yêu cầu', 'them')
o_thu_tu(S, CN_TH, 'Gửi yêu cầu', 'them')
o_ma(S, CN_SU, 'Gửi yêu cầu', 'sua')
o_ten(S, CN_SU, 'Gửi yêu cầu', 'sua')
o_thu_tu(S, CN_SU, 'Gửi yêu cầu', 'sua')

L_(S, CN_SU, 'Textbox Mã phần tử', 'Kiểm tra giữ nguyên giá trị cũ của Mã phần tử',
   '1. Mở biểu mẫu "Chỉnh sửa phần tử" của một phần tử đang có.\n'
   '2. Giữ nguyên ô "Mã phần tử", chỉ sửa ô "Tên phần tử".\n3. Bấm nút "Gửi yêu cầu".',
   'Yêu cầu gửi thành công, không báo mã đã tồn tại dù mã đó vẫn đang thuộc chính phần tử này.',
   T_SUA_MA)

# ── Ô chọn Trạng thái trong biểu mẫu ──────────────────────────────────────────────────────
for _cn in (CN_TH, CN_SU):
    _mac = ('Ô hiện sẵn "Hoạt động".' if _cn == CN_TH
            else 'Mặc định hiển thị dữ liệu từ DB: ô hiện đúng trạng thái của phần tử đang chọn.')
    selectbox_khong_o_tim(
        S, _cn, 'Selectbox Trạng thái', 'Trạng thái',
        '"Hoạt động" · "Không hoạt động"', _mac,
        'Ô hiện đúng giá trị vừa chọn, danh sách đóng lại ngay.',
        ghi_chu=(R + 'Khi ô đang có giá trị thì bên phải ô hiện thêm dấu nhân để xoá lựa chọn. '
                 'Bấm dấu nhân đưa ô về trống và hàm kiểm sẽ chặn bằng thông báo "Vui lòng chọn '
                 'Trạng thái." Cần QA/BA chốt có nên cho xoá lựa chọn ở ô bắt buộc hay không.'))

# ── Hai ô ngày của trình duyệt (chỉ hiện với bộ dm_nam_hoc và dm_hoc_ky) ───────────────────
T_NGAY_RIENG = (V + 'Hai ô ngày chỉ hiện với bộ danh mục dm_nam_hoc và dm_hoc_ky. Muốn chạy case '
                'này phải mở đúng một trong hai bộ đó. Nguồn: TKCT GBR-DM-05.')
T_NGAY_KHONG_GIOI_HAN = (V + 'Ô ngày không đặt ngày nhỏ nhất, ngày lớn nhất nào nên chọn được mọi '
                         'ngày. Giới hạn thật do máy chủ quyết định, cần dev xác nhận.')


def o_ngay(cn, nhan):
    g = 'Datepicker %s' % nhan
    L_(S, cn, g, 'Kiểm tra giá trị mặc định của %s' % nhan,
       '1. Mở một bộ danh mục dm_nam_hoc hoặc dm_hoc_ky.\n'
       '2. Bấm nút "Thêm phần tử".\n3. Quan sát ô "%s".' % nhan,
       'Mặc định là trống, hiện khuôn ngày/tháng/năm của trình duyệt kèm biểu tượng lịch ở cuối ô.',
       T_NGAY_RIENG)
    L_(S, cn, g, 'Kiểm tra %s khi xoá rỗng' % nhan,
       '1. Chọn một ngày cho ô "%s".\n2. Xoá rỗng lại ô đó.\n'
       '3. Các thông tin khác được nhập hợp lệ.\n4. Bấm nút "Gửi yêu cầu".' % nhan,
       'Thông báo nổi "Vui lòng nhập Ngày bắt đầu và Ngày kết thúc." Biểu mẫu không đóng và không '
       'gửi yêu cầu nào.', T_TOAST)
    L_(S, cn, g, 'Kiểm tra bảng lịch của trình duyệt ở %s' % nhan,
       '1. Bấm vào biểu tượng lịch ở cuối ô "%s".' % nhan,
       'Bảng lịch của trình duyệt mở ra ngay dưới ô, hiện tháng hiện tại.')
    L_(S, cn, g, 'Kiểm tra chọn ngày bằng bảng lịch ở %s' % nhan,
       '1. Mở bảng lịch của ô "%s".\n2. Chọn một ngày bất kỳ.' % nhan,
       'Bảng lịch đóng lại, ô hiện đúng ngày vừa chọn theo khuôn ngày/tháng/năm.')
    L_(S, cn, g, 'Kiểm tra nhập %s bằng bàn phím theo từng ngăn' % nhan,
       '1. Đặt con trỏ vào ô "%s".\n2. Gõ lần lượt ngày, tháng, năm bằng bàn phím.' % nhan,
       'Con trỏ tự nhảy sang ngăn tiếp theo sau mỗi ngăn đủ số, ô nhận đúng ngày vừa gõ.')
    L_(S, cn, g, 'Kiểm tra gõ ký tự lạ vào %s' % nhan,
       '1. Đặt con trỏ vào ô "%s".\n2. Gõ chữ cái và ký tự đặc biệt.' % nhan,
       'Ô ngày của trình duyệt chỉ nhận chữ số, các ký tự khác không vào được ô.')
    L_(S, cn, g, 'Kiểm tra dán chuỗi ngày vào %s' % nhan,
       '1. Sao chép chuỗi 01/09/2026.\n2. Dán vào ô "%s".' % nhan,
       'Ghi lại nguyên trạng và đối chiếu với thiết kế: ô ngày của trình duyệt chỉ nhận chuỗi '
       'đúng khuôn của nó, chuỗi sai khuôn thì ô giữ nguyên như trước khi dán.')
    L_(S, cn, g, 'Kiểm tra ngày không tồn tại ở %s' % nhan,
       '1. Gõ vào ô "%s" lần lượt 31/04, 30/02 và 29/02 của một năm thường.' % nhan,
       'Ô ngày của trình duyệt không nhận ngày không tồn tại, ngăn ngày tự giới hạn theo tháng và '
       'năm đã chọn. Không có thông báo lỗi nào.')
    L_(S, cn, g, 'Kiểm tra %s với ngày hợp lệ' % nhan,
       '1. Chọn một ngày hợp lệ cho ô "%s".\n'
       '2. Các thông tin khác được nhập hợp lệ.\n3. Bấm nút "Gửi yêu cầu".' % nhan,
       'Ô nhận đúng ngày vừa chọn và yêu cầu được gửi thành công.')
    L_(S, cn, g, 'Kiểm tra giới hạn khoảng ngày cho phép của %s' % nhan,
       '1. Mở bảng lịch của ô "%s".\n2. Thử chọn một ngày rất xa trong quá khứ và một ngày rất xa '
       'trong tương lai.' % nhan,
       'Cả hai ngày đều chọn được, không ngày nào bị làm mờ trong bảng lịch.',
       T_NGAY_KHONG_GIOI_HAN)
    L_(S, cn, g, 'Kiểm tra %s trên các trình duyệt khác nhau' % nhan,
       '1. Mở biểu mẫu trên Chrome, sau đó trên Firefox rồi trên Edge.\n'
       '2. Quan sát cách hiển thị và cách mở bảng lịch của ô "%s".' % nhan,
       'Mỗi trình duyệt vẽ bảng lịch theo kiểu riêng nhưng đều chọn được ngày, ô nhận đúng ngày '
       'đã chọn và yêu cầu gửi đi giống nhau.')


o_ngay(CN_TH, 'Ngày bắt đầu')
o_ngay(CN_TH, 'Ngày kết thúc')

selectbox_khong_o_tim(
    S, CN_TH, 'Selectbox Năm học', 'Năm học',
    'Danh sách nạp từ chính bộ danh mục Năm học, mỗi mục ghi tên năm học kèm mã trong ngoặc. '
    'Trong ô chọn không có ô tìm kiếm nào.',
    'Mặc định là trống, hiện chữ gợi ý "Chọn năm học…".',
    'Ô hiện đúng năm học vừa chọn, danh sách đóng lại ngay.',
    dong=True,
    ghi_chu=V + 'Ô "Năm học" chỉ hiện với bộ danh mục dm_hoc_ky. Danh sách lấy từ bộ dm_nam_hoc '
    'nên là giá trị động, số mục thay đổi theo dữ liệu. Nguồn: TKCT GBR-DM-05.')

nut(S, CN_TH, 'Button Huỷ', 'Huỷ', 'đóng biểu mẫu và không gửi yêu cầu nào.')
nut(S, CN_TH, 'Button Gửi yêu cầu', 'Gửi yêu cầu',
    'kiểm các ô bắt buộc rồi tạo một yêu cầu thay đổi ở trạng thái chờ duyệt.',
    t='Trong lúc gửi, nút hiện thêm biểu tượng xoay tròn và bị vô hiệu.')
nut(S, CN_SU, 'Button Huỷ', 'Huỷ', 'đóng biểu mẫu và không gửi yêu cầu nào.')
nut(S, CN_SU, 'Button Gửi yêu cầu', 'Gửi yêu cầu',
    'kiểm ô bắt buộc và kiểm có thay đổi so với dữ liệu gốc, rồi tạo yêu cầu chờ duyệt.')

# ── Ràng buộc Ngày bắt đầu ↔ Ngày kết thúc ────────────────────────────────────────────────
G = 'Validate ràng buộc giữa các trường'
T_CAP_NGAY = (M + 'Chuẩn mong đợi là chặn khi ngày bắt đầu muộn hơn ngày kết thúc. Giao diện hiện '
              'KHÔNG kiểm quan hệ giữa hai ô và cũng không giới hạn vùng chọn của ô sau theo ô '
              'trước. Cần QA/BA quyết bổ sung lưới chắn ở giao diện hay để máy chủ chặn.')
L_(S, CN_TH, G, 'Kiểm tra Ngày bắt đầu lớn hơn Ngày kết thúc',
   '1. Mở bộ danh mục dm_nam_hoc, bấm "Thêm phần tử".\n'
   '2. Chọn "Ngày bắt đầu" muộn hơn "Ngày kết thúc".\n'
   '3. Các thông tin khác được nhập hợp lệ.\n4. Bấm nút "Gửi yêu cầu".',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện không báo lỗi và vẫn gửi yêu cầu. '
   'Nếu máy chủ chặn thì hiện thông báo nổi nêu rõ lỗi và không tạo yêu cầu.', T_CAP_NGAY)
L_(S, CN_TH, G, 'Kiểm tra Ngày bắt đầu bằng Ngày kết thúc',
   '1. Chọn "Ngày bắt đầu" và "Ngày kết thúc" cùng một ngày.\n'
   '2. Các thông tin khác được nhập hợp lệ.\n3. Bấm nút "Gửi yêu cầu".',
   'Yêu cầu gửi thành công: hai đầu bằng nhau là hợp lệ.', T_CAP_NGAY)
L_(S, CN_TH, G, 'Kiểm tra chỉ nhập Ngày bắt đầu hoặc chỉ nhập Ngày kết thúc',
   '1. Chỉ chọn "Ngày bắt đầu", để trống "Ngày kết thúc", bấm "Gửi yêu cầu".\n'
   '2. Làm ngược lại: chỉ chọn "Ngày kết thúc", để trống "Ngày bắt đầu".',
   'Cả hai lượt đều hiện thông báo nổi "Vui lòng nhập Ngày bắt đầu và Ngày kết thúc." và không '
   'gửi yêu cầu: với hai bộ danh mục này cả hai ô đều bắt buộc.')
L_(S, CN_TH, G, 'Kiểm tra vùng chọn của Ngày kết thúc bị giới hạn theo Ngày bắt đầu',
   '1. Chọn "Ngày bắt đầu" là 01/09/2026.\n'
   '2. Mở bảng lịch của ô "Ngày kết thúc" và xem các ngày trước 01/09/2026.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: các ngày trước "Ngày bắt đầu" vẫn chọn được, '
   'không ngày nào bị làm mờ.', T_CAP_NGAY)

# ── Khối Chức năng của CN Thêm / CN Sửa ───────────────────────────────────────────────────
T_YEUCAU = (V + 'Thao tác này KHÔNG ghi thẳng vào bảng danh mục mà tạo một yêu cầu thay đổi ở '
            'trạng thái chờ duyệt. Dữ liệu chỉ đổi thật sau khi yêu cầu được Duyệt rồi Áp dụng ở '
            'màn Yêu cầu thay đổi. Nguồn: TKCT GBR-DM-01.')

G = 'Chức năng Thêm mới phần tử danh mục'
L_(S, CN_TH, G, 'Kiểm tra lưu thành công khi nhập đầy đủ các trường (tối đa độ dài cho phép)',
   '1. Bấm nút "Thêm phần tử".\n'
   '2. Nhập đủ mọi ô, ô "Mã phần tử" và "Tên phần tử" nhập đúng 250 ký tự.\n'
   '3. Bấm nút "Gửi yêu cầu".',
   '1. Thông báo nổi Đã ghi nhận yêu cầu thêm "<tên phần tử>". Đang chờ phê duyệt.\n'
   '2. Biểu mẫu đóng lại.\n'
   '3. Phần tử CHƯA xuất hiện trên bảng, yêu cầu nằm ở màn Yêu cầu thay đổi với nhãn "Chờ xử lý".',
   T_YEUCAU)
L_(S, CN_TH, G, 'Kiểm tra lưu đúng vào database',
   '1. Gửi yêu cầu thêm một phần tử, ghi lại mã và tên vừa nhập.\n'
   '2. Đối chiếu với dữ liệu trong hệ thống:\nselect * from <bảng yêu cầu thay đổi>\n'
   "where <cột tên bảng> = '<mã bộ danh mục>'\norder by created_at desc;",
   'Có đúng một yêu cầu mới với loại hành động thêm phần tử, trạng thái chờ duyệt, nội dung mang '
   'đúng mã và tên vừa nhập. Bảng danh mục thật chưa có phần tử đó.', T_BANG)
L_(S, CN_TH, G, 'Kiểm tra lưu thành công khi chỉ nhập các trường bắt buộc',
   '1. Bấm nút "Thêm phần tử".\n'
   '2. Chỉ nhập "Mã phần tử" và "Tên phần tử", giữ "Trạng thái" mặc định, để trống "Thứ tự".\n'
   '3. Bấm nút "Gửi yêu cầu".',
   '1. Thông báo nổi Đã ghi nhận yêu cầu thêm "<tên phần tử>". Đang chờ phê duyệt.\n'
   '2. Biểu mẫu đóng lại, thứ tự được ghi nhận là 0.', T_YEUCAU)
L_(S, CN_TH, G, 'Kiểm tra không nhập các trường bắt buộc',
   '1. Bấm nút "Thêm phần tử".\n2. Để trống cả "Mã phần tử" và "Tên phần tử".\n'
   '3. Bấm nút "Gửi yêu cầu".',
   '1. Thông báo nổi "Vui lòng nhập Mã phần tử." — hệ thống báo lần lượt từng ô, ô trên trước.\n'
   '2. Biểu mẫu không đóng và không gửi yêu cầu nào.', T_TOAST)
L_(S, CN_TH, G, 'Kiểm tra click liên tục vào nút lưu',
   '1. Nhập đủ các ô bắt buộc.\n2. Bấm liên tục nhiều lần vào nút "Gửi yêu cầu".',
   'Hệ thống không gửi request nhiều lần. Nút bị vô hiệu ngay sau lần bấm đầu, chỉ tạo đúng một '
   'yêu cầu thay đổi.')
L_(S, CN_TH, G, 'Kiểm tra thao tác bằng Tab + Enter',
   '1. Dùng phím Tab đi qua các ô, nhập đủ thông tin bằng bàn phím.\n'
   '2. Tab tới nút "Gửi yêu cầu" rồi nhấn Enter liên tục.',
   'Đi bằng bàn phím cho kết quả giống bấm chuột: chỉ tạo đúng một yêu cầu thay đổi và hiện thông '
   'báo nổi Đã ghi nhận yêu cầu thêm "<tên phần tử>". Đang chờ phê duyệt.')
L_(S, CN_TH, G, 'Kiểm tra nhập trùng cùng lúc từ 2 client',
   '1. Mở màn Chi tiết cùng một bộ danh mục trên hai tab.\n'
   '2. Mỗi tab nhập cùng một mã phần tử.\n3. Bấm "Gửi yêu cầu" ở cả hai tab gần như cùng lúc.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế:\n'
   'Tab 1( Client 1) : Gửi yêu cầu thành công\n'
   'Tab 2( Client 2) : Nếu hệ thống chặn trùng thì báo lỗi rõ ràng, nếu không chặn thì tạo yêu '
   'cầu thứ hai cùng mã.', T_MA_TRUNG)
L_(S, CN_TH, 'Chức năng Hủy bỏ', 'Kiểm tra hủy bỏ thêm mới',
   '1. Bấm nút "Thêm phần tử", nhập đủ thông tin hợp lệ.\n'
   '2. Bấm nút "Huỷ".\n3. Mở lại biểu mẫu "Thêm phần tử mới".',
   '1. Biểu mẫu đóng lại, không tạo yêu cầu thay đổi nào, bảng giữ nguyên.\n'
   '2. Mở lại thì mọi ô trở về trạng thái trống ban đầu, không giữ dữ liệu vừa nhập.')

G = 'Chức năng Cập nhật phần tử danh mục'
L_(S, CN_SU, G, 'Kiểm tra cập nhật thành công khi sửa hợp lệ (tối đa độ dài cho phép)',
   '1. Bấm biểu tượng "Chỉnh sửa" trên một bản ghi.\n'
   '2. Sửa "Tên phần tử" thành chuỗi đúng 250 ký tự.\n3. Bấm nút "Gửi yêu cầu".',
   '1. Thông báo nổi Đã ghi nhận yêu cầu chỉnh sửa "<tên phần tử>". Đang chờ phê duyệt.\n'
   '2. Biểu mẫu đóng lại và bảng được tải lại.\n'
   '3. Bản ghi trên bảng CHƯA đổi, yêu cầu nằm ở màn Yêu cầu thay đổi với nhãn "Chờ xử lý".',
   T_YEUCAU)
L_(S, CN_SU, G, 'Kiểm tra lưu đúng vào database',
   '1. Gửi yêu cầu chỉnh sửa một phần tử, ghi lại giá trị mới vừa nhập.\n'
   '2. Đối chiếu với dữ liệu trong hệ thống:\nselect * from <bảng yêu cầu thay đổi>\n'
   "where <cột tên bảng> = '<mã bộ danh mục>'\norder by created_at desc;",
   'Có đúng một yêu cầu mới với loại hành động sửa phần tử, trạng thái chờ duyệt, nội dung mang '
   'đúng giá trị vừa nhập. Bảng danh mục thật chưa đổi.', T_BANG)
L_(S, CN_SU, G, 'Kiểm tra cập nhật thành công khi chỉ sửa các trường bắt buộc',
   '1. Bấm biểu tượng "Chỉnh sửa" trên một bản ghi.\n'
   '2. Chỉ sửa "Tên phần tử", giữ nguyên các ô còn lại.\n3. Bấm nút "Gửi yêu cầu".',
   'Thông báo nổi Đã ghi nhận yêu cầu chỉnh sửa "<tên phần tử>". Đang chờ phê duyệt. '
   'Biểu mẫu đóng lại.', T_YEUCAU)
L_(S, CN_SU, G, 'Kiểm tra không nhập các trường bắt buộc',
   '1. Bấm biểu tượng "Chỉnh sửa" trên một bản ghi.\n2. Xoá trắng ô "Tên phần tử".\n'
   '3. Bấm nút "Gửi yêu cầu".',
   '1. Thông báo nổi "Vui lòng nhập Tên phần tử."\n'
   '2. Biểu mẫu không đóng và không gửi yêu cầu nào.', T_TOAST)
L_(S, CN_SU, G, 'Kiểm tra click liên tục vào nút lưu thay đổi (chuột)',
   '1. Sửa một ô bất kỳ.\n2. Bấm liên tục nhiều lần vào nút "Gửi yêu cầu".',
   'Hệ thống không gửi request nhiều lần. Nút bị vô hiệu ngay sau lần bấm đầu, chỉ tạo đúng một '
   'yêu cầu thay đổi.')
L_(S, CN_SU, G, 'Kiểm tra thao tác Tab + Enter liên tục',
   '1. Dùng phím Tab đi qua các ô, sửa thông tin bằng bàn phím.\n'
   '2. Tab tới nút "Gửi yêu cầu" rồi nhấn Enter liên tục.',
   'Đi bằng bàn phím cho kết quả giống bấm chuột: chỉ tạo đúng một yêu cầu thay đổi và hiện thông '
   'báo nổi Đã ghi nhận yêu cầu chỉnh sửa "<tên phần tử>". Đang chờ phê duyệt.')
L_(S, CN_SU, G, 'Kiểm tra sửa trùng cùng lúc từ 2 client',
   '1. Mở biểu mẫu "Chỉnh sửa phần tử" của CÙNG một phần tử trên hai tab.\n'
   '2. Mỗi tab sửa tên thành một giá trị khác nhau.\n'
   '3. Bấm "Gửi yêu cầu" ở cả hai tab gần như cùng lúc.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế:\n'
   'Tab 1( Client 1) : Gửi yêu cầu thành công\n'
   'Tab 2( Client 2) : Tạo yêu cầu thứ hai trên cùng phần tử. Khi áp dụng lần lượt, yêu cầu áp '
   'sau ghi đè yêu cầu áp trước.',
   V + 'Giao diện không kiểm phiên bản dữ liệu và không chặn hai yêu cầu chờ duyệt trên cùng một '
   'phần tử. Cần QA/BA + dev chốt cách xử lý khi hai yêu cầu cùng sửa một phần tử.')
L_(S, CN_SU, 'Chức năng Hủy bỏ', 'Kiểm tra hủy bỏ chỉnh sửa',
   '1. Bấm biểu tượng "Chỉnh sửa", sửa vài ô.\n2. Bấm nút "Huỷ".\n'
   '3. Mở lại biểu mẫu của chính phần tử đó.',
   '1. Biểu mẫu đóng lại, không tạo yêu cầu thay đổi nào, bảng giữ nguyên.\n'
   '2. Mở lại thì các ô nạp lại đúng dữ liệu gốc, không giữ nội dung vừa sửa dở.')

# ── CN NGỪNG DÙNG PHẦN TỬ ─────────────────────────────────────────────────────────────────
G = 'Hộp xác nhận Ngừng dùng phần tử'
L_(S, CN_ND, G, 'Kiểm tra nội dung Hộp xác nhận Ngừng dùng phần tử',
   '1. Bấm biểu tượng "Ngừng dùng" trên một bản ghi "Hoạt động".\n2. Đọc toàn bộ hộp thoại.',
   'Hộp thoại có tiêu đề "Ngừng dùng phần tử" kèm biểu tượng cảnh báo màu đỏ, khung thông tin bản '
   'ghi, ô chọn "Ánh xạ sang phần tử mới (nếu có)", ô "Ngày ngừng hiệu lực", ô "Lý do" và hai nút '
   '"Huỷ" · "Xác nhận ngừng dùng".')
L_(S, CN_ND, G, 'Kiểm tra dữ liệu bản ghi hiện trong Hộp xác nhận Ngừng dùng phần tử',
   '1. Ghi lại mã và tên của một bản ghi "Hoạt động".\n'
   '2. Bấm biểu tượng "Ngừng dùng" trên chính bản ghi đó.\n3. Đọc khung thông tin trong hộp thoại.',
   'Khung thông tin hiện đúng mã và tên của bản ghi vừa chọn, theo khuôn mã — tên, mã in bằng '
   'phông chữ đều.')
L_(S, CN_ND, G, 'Kiểm tra căn lề, chính tả trên Hộp xác nhận Ngừng dùng phần tử',
   '1. Mở hộp thoại "Ngừng dùng phần tử".\n2. Đọc từng nhãn và từng nút.',
   'Chữ đúng chính tả, các nhãn thẳng hàng nhau, ô bắt buộc "Lý do" có dấu sao. Hai nút nằm ở góc '
   'dưới bên phải, nút "Xác nhận ngừng dùng" tô nền đỏ.')

selectbox_khong_o_tim(
    S, CN_ND, 'Selectbox Ánh xạ sang phần tử mới', 'Ánh xạ sang phần tử mới',
    'Mục "Không ánh xạ" đứng đầu, sau đó là các phần tử đang hiện trên trang theo khuôn tên kèm '
    'mã trong ngoặc. Phần tử đang ngừng dùng không có trong danh sách. Trong ô chọn không có ô '
    'tìm kiếm nào.',
    'Mặc định là "Không ánh xạ".',
    'Ô hiện đúng phần tử vừa chọn, danh sách đóng lại ngay.',
    dong=True,
    ghi_chu=R + 'Danh sách ánh xạ chỉ lấy các phần tử ĐANG HIỆN TRÊN TRANG, không phải toàn bộ '
    'phần tử đang hoạt động của bộ danh mục. Đổi trang hoặc đổi bộ lọc là danh sách ánh xạ đổi '
    'theo. Cần QA/BA chốt đây có phải chủ đích không.')

G = 'Hiển thị chi tiết Ngày ngừng hiệu lực'
L_(S, CN_ND, G, 'Kiểm tra Hiển thị chi tiết Ngày ngừng hiệu lực khi có trường không có dữ liệu',
   '1. Mở hộp thoại "Ngừng dùng phần tử".\n2. Quan sát ô "Ngày ngừng hiệu lực".',
   'Ô luôn có sẵn ngày hiện tại, không bao giờ để trống và không hiện dấu gạch.')
L_(S, CN_ND, G,
   'Kiểm tra Hiển thị chi tiết Ngày ngừng hiệu lực khi tất cả các trường đều có dữ liệu',
   '1. Mở hộp thoại "Ngừng dùng phần tử".\n'
   '2. Đối chiếu ngày trong ô với ngày hiện tại của máy.\n3. Thử bấm và gõ vào ô đó.',
   'Ô hiện đúng ngày hiện tại theo khuôn năm-tháng-ngày, nền xám, không bấm được và không gõ '
   'được.')
L_(S, CN_ND, G, 'Kiểm tra Hiển thị chi tiết Ngày ngừng hiệu lực khi dữ liệu quá dài',
   '1. Mở hộp thoại "Ngừng dùng phần tử" ở cửa sổ hẹp.\n2. Quan sát ô "Ngày ngừng hiệu lực".',
   'Chuỗi ngày luôn cùng độ dài nên không bao giờ tràn ô. Ô giữ nguyên chiều cao, không đẩy lệch '
   'các thành phần bên dưới.')
L_(S, CN_ND, G, 'Kiểm tra Hiển thị chi tiết Ngày ngừng hiệu lực khớp dữ liệu trong hệ thống',
   '1. Ghi lại ngày trong ô "Ngày ngừng hiệu lực".\n'
   '2. Gửi yêu cầu ngừng dùng.\n3. Mở màn Yêu cầu thay đổi và đối chiếu ngày tạo của yêu cầu đó.',
   'Ngày hiệu lực gửi đi đúng bằng ngày hiện tại hiện trong ô, khớp với ngày tạo của yêu cầu.')

G = 'Textarea Lý do'
L_(S, CN_ND, G, 'Kiểm tra giá trị mặc định Lý do',
   '1. Mở hộp thoại "Ngừng dùng phần tử".\n2. Quan sát ô "Lý do".',
   'Mặc định là trống, hiện chữ gợi ý "Mô tả lý do ngừng dùng…", ô cao 2 dòng.')
L_(S, CN_ND, G, 'Kiểm tra Lý do là trường bắt buộc',
   '1. Để trống ô "Lý do".\n2. Bấm nút "Xác nhận ngừng dùng".',
   'Thông báo nổi "Vui lòng nhập lý do ngừng dùng." Hộp thoại không đóng và không gửi yêu cầu nào.',
   T_TOAST)
L_(S, CN_ND, G, 'Kiểm tra Lý do nhập vượt độ dài cho phép',
   '1. Dán vào ô "Lý do" một chuỗi 5.000 ký tự.\n2. Bấm nút "Xác nhận ngừng dùng".',
   'Ô nhận hết chuỗi vừa dán. Hoặc hệ thống không cho nhập quá <số ký tự tối đa của cột dữ liệu> '
   'ký tự.',
   V + 'Ô "Lý do" KHÔNG đặt giới hạn ký tự ở giao diện, khác hai ô "Mã phần tử" và "Tên phần tử" '
   'vốn bị trình duyệt chặn ở 250. Giới hạn thật của cột dữ liệu chưa được xác nhận.')
L_(S, CN_ND, G, 'Kiểm tra Lý do nhập trong độ dài cho phép',
   '1. Nhập vào ô "Lý do" một câu ngắn hợp lệ.\n2. Bấm nút "Xác nhận ngừng dùng".',
   'Nhận đủ chuỗi vừa nhập và gửi yêu cầu thành công.')
L_(S, CN_ND, G, 'Kiểm tra Lý do nhập ký tự đặc biệt, thẻ html, script',
   '1. Nhập vào ô "Lý do" chuỗi có ký tự đặc biệt và thẻ html, ví dụ <b>1</b>.\n'
   '2. Bấm nút "Xác nhận ngừng dùng".',
   'Ô nhận nguyên chuỗi vừa nhập, không báo lỗi định dạng. Chuỗi hiện lại ở màn Yêu cầu thay đổi '
   'đúng nguyên dạng, không thực thi script.')
L_(S, CN_ND, G, 'Kiểm tra Lý do nhập số',
   '1. Nhập vào ô "Lý do" một chuỗi toàn chữ số.\n2. Bấm nút "Xác nhận ngừng dùng".',
   'Ô nhận chuỗi số bình thường và gửi yêu cầu thành công.')
L_(S, CN_ND, G, 'Kiểm tra Lý do nhập nhiều dòng',
   '1. Nhập vào ô "Lý do" ba dòng, mỗi dòng nhấn Enter để xuống dòng.\n'
   '2. Bấm nút "Xác nhận ngừng dùng".\n3. Mở màn Yêu cầu thay đổi, xem lại lý do vừa nhập.',
   'Ô nhận được nhiều dòng và giữ đúng dấu xuống dòng sau khi gửi và mở lại.')
L_(S, CN_ND, G, 'Kiểm tra Lý do cắt khoảng trắng hai đầu',
   '1. Nhập vào ô "Lý do" một chuỗi có khoảng trắng ở đầu và cuối.\n'
   '2. Làm lại với chuỗi chỉ gồm dấu cách.\n3. Bấm nút "Xác nhận ngừng dùng".',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện không cắt khoảng trắng, gửi nguyên '
   'chuỗi vừa nhập. Chuỗi chỉ gồm dấu cách vẫn qua được lưới chắn bắt buộc.', T_TRIM)
L_(S, CN_ND, G, 'Kiểm tra copy dữ liệu dán vào ô Lý do',
   '1. Sao chép một đoạn văn bản.\n2. Dán vào ô "Lý do".\n3. Bấm nút "Xác nhận ngừng dùng".',
   'Ô nhận đúng nội dung vừa dán, không lỗi phông chữ.')
L_(S, CN_ND, G, 'Kiểm tra Lý do nhập tiếng Việt có dấu',
   '1. Nhập vào ô "Lý do" chuỗi tiếng Việt có dấu.\n2. Bấm nút "Xác nhận ngừng dùng".\n'
   '3. Mở màn Yêu cầu thay đổi, xem lại lý do vừa nhập.',
   'Ô nhận và lưu đúng chuỗi tiếng Việt có dấu, mở lại vẫn đúng dấu, không lỗi phông chữ.')

nut(S, CN_ND, 'Button Huỷ', 'Huỷ', 'đóng hộp thoại và không gửi yêu cầu nào.')
nut(S, CN_ND, 'Button Xác nhận ngừng dùng', 'Xác nhận ngừng dùng',
    'kiểm ô "Lý do" rồi tạo một yêu cầu ngừng dùng ở trạng thái chờ duyệt.',
    t='Trong lúc gửi, nút hiện thêm biểu tượng xoay tròn và bị vô hiệu.')

G = 'Chức năng Chuyển trạng thái phần tử danh mục'
L_(S, CN_ND, G, 'Kiểm tra việc hủy bỏ thao tác chuyển trạng thái',
   '1. Bấm biểu tượng "Ngừng dùng" trên một bản ghi "Hoạt động".\n'
   '2. Nhập lý do rồi bấm nút "Huỷ".',
   'Hộp thoại đóng lại, không tạo yêu cầu nào, bản ghi vẫn ở trạng thái "Hoạt động".')
L_(S, CN_ND, G, 'Kiểm tra click icon đóng trên hộp xác nhận chuyển trạng thái',
   '1. Mở hộp thoại "Ngừng dùng phần tử".\n2. Bấm dấu nhân ở góc trên bên phải hộp thoại.\n'
   '3. Mở lại hộp thoại rồi nhấn phím Esc.\n4. Mở lại hộp thoại rồi bấm ra vùng tối bên ngoài.',
   'Cả ba cách đều đóng hộp thoại, không tạo yêu cầu nào và bản ghi giữ nguyên trạng thái.')
L_(S, CN_ND, G, 'Kiểm tra chuyển trạng thái thành công',
   '1. Bấm biểu tượng "Ngừng dùng" trên một bản ghi "Hoạt động".\n'
   '2. Chọn một phần tử ở ô "Ánh xạ sang phần tử mới (nếu có)".\n'
   '3. Nhập lý do rồi bấm nút "Xác nhận ngừng dùng".',
   '1. Thông báo nổi Đã ghi nhận yêu cầu ngừng dùng "<tên phần tử>". Ánh xạ → <mã phần tử mới>. '
   'Đang chờ phê duyệt.\n2. Hộp thoại đóng lại.\n'
   '3. Bản ghi CHƯA đổi trạng thái, yêu cầu nằm ở màn Yêu cầu thay đổi với nhãn "Chờ xử lý".',
   T_YEUCAU)
L_(S, CN_ND, G, 'Kiểm tra chuyển trạng thái trở lại Hoạt động',
   '1. Chọn một bản ghi đang ở trạng thái "Không hoạt động".\n'
   '2. Quan sát cột "Hành động" của bản ghi đó.\n'
   '3. Bấm biểu tượng "Chỉnh sửa", đổi ô chọn "Trạng thái" sang "Hoạt động" rồi bấm "Gửi yêu cầu".',
   '1. Bản ghi "Không hoạt động" KHÔNG có biểu tượng "Ngừng dùng", chỉ có biểu tượng "Chỉnh sửa".\n'
   '2. Đưa phần tử trở lại "Hoạt động" phải đi qua biểu mẫu "Chỉnh sửa phần tử".\n'
   '3. Thông báo nổi Đã ghi nhận yêu cầu chỉnh sửa "<tên phần tử>". Đang chờ phê duyệt.',
   L + 'TKCT GBR-DM-02 ghi biểu tượng "Chỉnh sửa" và "Ngừng dùng" chỉ hiện khi đang lọc trạng '
   'thái Hoạt động. Mã nguồn cho biểu tượng "Chỉnh sửa" hiện ở MỌI bản ghi, chỉ biểu tượng '
   '"Ngừng dùng" mới phụ thuộc trạng thái của chính bản ghi. Màn thật xác nhận theo mã nguồn.')
L_(S, CN_ND, G, 'Kiểm tra click liên tục vào button Chuyển trạng thái',
   '1. Mở hộp thoại "Ngừng dùng phần tử", nhập lý do.\n'
   '2. Bấm liên tục nhiều lần vào nút "Xác nhận ngừng dùng".',
   'Hệ thống không gửi request nhiều lần. Nút bị vô hiệu ngay sau lần bấm đầu, chỉ tạo đúng một '
   'yêu cầu ngừng dùng.')
L_(S, CN_ND, G, 'Kiểm tra Tab và Enter liên tục vào button Chuyển trạng thái',
   '1. Mở hộp thoại, nhập lý do bằng bàn phím.\n'
   '2. Tab tới nút "Xác nhận ngừng dùng" rồi nhấn Enter liên tục.',
   'Đi bằng bàn phím cho kết quả giống bấm chuột: chỉ tạo đúng một yêu cầu ngừng dùng và hiện '
   'thông báo nổi Đã ghi nhận yêu cầu ngừng dùng "<tên phần tử>". Đang chờ phê duyệt.')
L_(S, CN_ND, G,
   'Kiểm tra chuyển trạng thái cùng một bản ghi cùng lúc từ 2 tab hoặc 2 client khác nhau',
   '1. Mở màn Chi tiết cùng một bộ danh mục trên hai tab.\n'
   '2. Cùng bấm biểu tượng "Ngừng dùng" trên CÙNG một bản ghi, nhập lý do khác nhau.\n'
   '3. Bấm "Xác nhận ngừng dùng" ở cả hai tab gần như cùng lúc.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế:\n'
   'Tab 1( Client 1) : Gửi yêu cầu thành công\n'
   'Tab 2( Client 2) : Tạo yêu cầu ngừng dùng thứ hai trên cùng phần tử, không bị chặn ở giao diện.',
   V + 'Giao diện không chặn hai yêu cầu ngừng dùng chờ duyệt trên cùng một phần tử. Cần QA/BA + '
   'dev chốt cách xử lý.')

A = 'An toàn thông tin'

# ── CN XEM LỊCH SỬ THAY ĐỔI ───────────────────────────────────────────────────────────────
nut(S, CN_LS, 'Button Lịch sử thay đổi', 'Lịch sử thay đổi',
    'chuyển sang thẻ Lịch sử thay đổi. Bấm lần nữa thì quay lại thẻ Phần tử.',
    t='Địa chỉ trang được thêm tham số thẻ đang xem.')

bang_ds(S, CN_LS, 'Danh sách lịch sử thay đổi', 'lịch sử thay đổi',
        'Hành động · Nội dung · Người yêu cầu · Người duyệt · Ngày áp dụng',
        'Hiện biểu tượng đồng hồ kèm dòng chữ "Chưa có lịch sử thay đổi." Thanh phân trang ẩn '
        'hoàn toàn.',
        'Số bản ghi trên trang bằng số bản ghi/trang đang đặt. "Tổng số bản ghi:" bằng số thay đổi '
        'ĐÃ ÁP DỤNG của bộ danh mục này, không tính yêu cầu đang chờ duyệt hay bị từ chối.',
        'Cột "Nội dung" bị cắt bớt trong ô, rê chuột vào hiện đầy đủ nội dung trong khung chú '
        'thích. Cột "Người yêu cầu" và "Người duyệt" chỉ hiện 8 ký tự đầu của định danh.',
        'Bảng lịch sử thay đổi không có cột thao tác nào, không bấm được vào bản ghi và không '
        'điều hướng đi đâu.',
        mac_dinh='1. Chữ căn lề trái. Nhãn loại hành động hiện dạng khối bo góc màu xanh.\n'
        '2. Màu nền của bản ghi đó thay đổi.\n'
        '3. Các cột xếp từ trái qua phải: Hành động · Nội dung · Người yêu cầu · Người duyệt · '
        'Ngày áp dụng. Phân trang và tổng số bản ghi đặt ở cuối bảng.\n'
        '4. Rê chuột vào cột "Nội dung" và cột "Người yêu cầu" thì hiện chú thích đầy đủ.\n'
        '5. Bỏ chuột đi, chú thích mất đi.')
L_(S, CN_LS, 'Danh sách lịch sử thay đổi', 'Kiểm tra tiêu đề cột của lịch sử thay đổi',
   '1. Bấm nút "Lịch sử thay đổi".\n2. Đọc tiêu đề từng cột của bảng từ trái sang phải.\n'
   '3. Kiểm chính tả và cách viết hoa của từng tiêu đề cột.',
   'Đúng các cột theo thứ tự: Hành động · Nội dung · Người yêu cầu · Người duyệt · Ngày áp dụng. '
   'Tiêu đề viết đúng chính tả, không viết tắt lạ.',
   V + 'Cột "Ngày áp dụng" hiện theo khuôn ngày/tháng/năm, trong khi cột "Ngày tạo" của màn Yêu '
   'cầu thay đổi lại hiện theo khuôn năm-tháng-ngày. Hai màn cùng menu nhưng lệch khuôn ngày. '
   'Cần QA/BA chốt một khuôn chung.')

perpage_text(S, CN_LS, 20)
perpage_select(S, CN_LS, 20, trong_ds=True)

G = 'Chức năng Xem chi tiết lịch sử thay đổi'
L_(S, CN_LS, G, 'Xem & đóng màn chi tiết',
   '1. Mở màn Chi tiết bộ danh mục, bấm nút "Lịch sử thay đổi".\n'
   '2. Đọc bảng lịch sử và địa chỉ trang.\n3. Bấm lại nút "Lịch sử thay đổi".',
   '1. Bảng đổi sang danh sách các thay đổi đã áp dụng, địa chỉ trang mang tham số thẻ lịch sử.\n'
   '2. Bấm lần nữa thì trở lại bảng phần tử, thanh lọc hiện lại và địa chỉ trang mang tham số '
   'thẻ phần tử.')
L_(S, CN_LS, G, 'Kiểm tra dữ liệu chi tiết khớp DB',
   '1. Bấm nút "Lịch sử thay đổi", ghi lại các bản ghi đang hiển thị.\n'
   '2. Đối chiếu với dữ liệu trong hệ thống:\nselect * from <bảng yêu cầu thay đổi>\n'
   "where <cột tên bảng> = '<mã bộ danh mục>'\nand <cột trạng thái> = '<trạng thái đã áp dụng>'\n"
   'order by updated_at desc;',
   'Số bản ghi và từng cột hiển thị khớp chính xác với dữ liệu trong hệ thống. Bảng chỉ hiện các '
   'thay đổi đã áp dụng, không hiện yêu cầu đang chờ duyệt hay bị từ chối.', T_BANG)

L_(S, CN_LS, A, 'Yêu cầu quyền thực hiện thao tác',
   '1. Đăng nhập tài khoản thuộc nhóm chuyên viên nghiệp vụ dữ liệu nhưng chưa được cấp quyền '
   'nào với phần tử danh mục.\n2. Mở màn Chi tiết bộ danh mục và bấm nút "Lịch sử thay đổi".',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện không chặn vai trò nào nên thẻ vẫn '
   'mở ra. Nếu máy chủ chặn thì hiện thông báo nổi "Không thể tải lịch sử thay đổi".', T_QUYEN)
L_(S, CN_LS, A, 'Không thao tác được trên bản ghi ngoài phạm vi được phân công',
   '1. Mở màn Chi tiết một bộ danh mục ngoài phạm vi được phân công.\n'
   '2. Bấm nút "Lịch sử thay đổi".',
   'Không hiện thay đổi của bộ danh mục ngoài phạm vi được phân công. Bảng rỗng kèm dòng chữ '
   '"Chưa có lịch sử thay đổi." hoặc thông báo nổi "Không thể tải lịch sử thay đổi".', T_QUYEN)
attt_phien(S, CN_LS, 'Thao tác khi hết phiên', 'Bấm nút "Lịch sử thay đổi".')

# ── An toàn thông tin của ba CN ghi dữ liệu ở màn Chi tiết ────────────────────────────────
L_(S, CN_TH, A, 'Yêu cầu quyền thêm mới',
   '1. Đăng nhập tài khoản không có quyền thêm phần tử danh mục.\n'
   '2. Mở màn Chi tiết bộ danh mục và bấm nút "Thêm phần tử".',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện vẫn hiện nút "Thêm phần tử" và mở '
   'được biểu mẫu. Nếu máy chủ chặn thì hiện thông báo nổi "Không thể gửi yêu cầu."', T_QUYEN)
L_(S, CN_TH, A, 'Thông tin chủ sở hữu lấy từ phiên đăng nhập',
   '1. Gửi một yêu cầu thêm phần tử.\n'
   '2. Mở màn Yêu cầu thay đổi, xem cột "Người tạo" của yêu cầu vừa gửi.',
   'Cột "Người tạo" là tài khoản đang đăng nhập. Hệ thống bỏ qua mọi thông tin người tạo do máy '
   'trạm tự gửi lên.', T_QUYEN)
L_(S, CN_SU, A, 'Yêu cầu quyền sửa',
   '1. Đăng nhập tài khoản không có quyền sửa phần tử danh mục.\n'
   '2. Bấm biểu tượng "Chỉnh sửa" trên một bản ghi rồi bấm "Gửi yêu cầu".',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện vẫn hiện biểu tượng và mở được biểu '
   'mẫu. Nếu máy chủ chặn thì hiện thông báo nổi "Không thể gửi yêu cầu."', T_QUYEN)
L_(S, CN_SU, A, 'Không sửa được bản ghi ngoài phạm vi được phân công',
   '1. Mở màn Chi tiết một bộ danh mục ngoài phạm vi được phân công.\n'
   '2. Bấm biểu tượng "Chỉnh sửa" trên một bản ghi, sửa rồi bấm "Gửi yêu cầu".',
   'Hệ thống chặn và không tạo yêu cầu thay đổi nào cho bản ghi ngoài phạm vi được phân công.',
   T_QUYEN)
L_(S, CN_ND, A, 'Yêu cầu quyền thực hiện thao tác',
   '1. Đăng nhập tài khoản không có quyền ngừng dùng phần tử danh mục.\n'
   '2. Bấm biểu tượng "Ngừng dùng", nhập lý do rồi bấm "Xác nhận ngừng dùng".',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện vẫn hiện biểu tượng và mở được hộp '
   'thoại. Nếu máy chủ chặn thì hiện thông báo nổi "Không thể gửi yêu cầu ngừng dùng." và không '
   'tạo yêu cầu.', T_QUYEN)
L_(S, CN_ND, A, 'Không thao tác được trên bản ghi ngoài phạm vi được phân công',
   '1. Mở màn Chi tiết một bộ danh mục ngoài phạm vi được phân công.\n'
   '2. Bấm biểu tượng "Ngừng dùng", nhập lý do rồi bấm "Xác nhận ngừng dùng".',
   'Hệ thống chặn và không tạo yêu cầu ngừng dùng nào cho bản ghi ngoài phạm vi được phân công.',
   T_QUYEN)

# ══════════════════════════════════════════════════════════════════════════════════════════
#  SHEET 3 — BP-YeuCauThayDoi  ·  màn "Yêu cầu thay đổi danh mục"
#  (/reference-data/change-requests). Vòng đời: Chờ xử lý → Đã duyệt → Đã áp dụng,
#  hoặc Chờ xử lý → Từ chối.
# ══════════════════════════════════════════════════════════════════════════════════════════
S = 'YEUCAU'
CN_DS = 'DANH SÁCH YÊU CẦU THAY ĐỔI'
CN_TK = 'TÌM KIẾM & LỌC YÊU CẦU THAY ĐỔI'
CN_KD = 'KIỂM DUYỆT YÊU CẦU THAY ĐỔI'
CN_TC = 'TỪ CHỐI YÊU CẦU THAY ĐỔI'
CN_AD = 'ÁP DỤNG YÊU CẦU THAY ĐỔI'
A = 'An toàn thông tin'

tab(S, CN_DS,
    'dải đường dẫn · ô chọn "Trạng thái" · ô "Từ ngày" · ô "Đến ngày" · ô "Tìm theo tên bảng…" · '
    'nút "Làm mới dữ liệu" · lần lượt các biểu tượng ở cột "Hành động" của từng bản ghi · '
    'ô "Số bản ghi/trang:" · nút "Chọn nhanh số bản ghi" · các nút chuyển trang')
tab(S, CN_TK, 'ô chọn "Trạng thái" · ô "Từ ngày" · ô "Đến ngày" · ô "Tìm theo tên bảng…"')
tab(S, CN_KD, 'biểu tượng "Duyệt" rồi tới biểu tượng "Từ chối" trên cùng một bản ghi')
tab(S, CN_TC, 'ô "Lý do từ chối" · nút "Huỷ" · nút "Từ chối"')
tab(S, CN_AD, 'biểu tượng "Áp dụng" của bản ghi "Đã duyệt"')

breadcrumb(S, CN_DS, 'Tầng dữ liệu danh mục > Yêu cầu thay đổi', 'Yêu cầu thay đổi',
           'Cấp cuối luôn là chữ "Yêu cầu thay đổi" nên nhãn không bao giờ dài quá. Nhãn dài hơn '
           'bề ngang thì bị cắt bớt bằng dấu ba chấm.')

tai_lai(S, CN_DS, 'Danh sách yêu cầu thay đổi', 'Không thể tải danh sách.',
        'Màn không hiện thông báo nổi nào.',
        'Chọn ô "Trạng thái" và gõ từ khoá vào ô "Tìm theo tên bảng…", chờ bảng lọc xong.')

bang_ds(S, CN_DS, 'Danh sách yêu cầu thay đổi', 'yêu cầu thay đổi',
        'STT · Bảng · Nội dung · Người tạo · Người duyệt · Ngày tạo · Trạng thái · Hành động',
        'Hiện biểu tượng cảnh báo kèm dòng chữ "Không có yêu cầu nào." trải hết bề ngang bảng.',
        'Số bản ghi trên trang bằng số bản ghi/trang đang đặt, trang cuối bằng phần còn lại. '
        '"Tổng số bản ghi:" bằng số yêu cầu còn lại sau khi lọc.',
        'Cột "Nội dung" tự xuống dòng cho hết chữ, không cắt ngang và không đẩy lệch các cột khác. '
        'Cột "Người tạo" và "Người duyệt" bị cắt bớt trong ô.',
        'Bấm "Duyệt" hoặc "Áp dụng" đổi trạng thái tại chỗ, "Từ chối" mở hộp thoại. '
        'Bấm "Xem bảng" điều hướng sang màn Chi tiết bộ danh mục, riêng yêu cầu đổi cấu trúc '
        'bảng thì sang màn Thiết kế lược đồ.',
        mac_dinh='1. Cột STT căn giữa. Cột Bảng hiển thị bằng phông chữ đều. Các cột còn lại căn '
        'trái.\n2. Màu nền của bản ghi đó thay đổi.\n'
        '3. Các cột xếp từ trái qua phải: STT · Bảng · Nội dung · Người tạo · Người duyệt · Ngày '
        'tạo · Trạng thái · Hành động. Cột thao tác đặt cuối bảng. Phân trang và tổng số bản ghi '
        'đặt ở cuối bảng.\n4. Hiện chú thích đúng tên tương ứng với chức năng.\n'
        '5. Bỏ chuột khỏi biểu tượng, chú thích mất đi.')
L_(S, CN_DS, 'Danh sách yêu cầu thay đổi', 'Kiểm tra tiêu đề cột của yêu cầu thay đổi',
   '1. Đọc tiêu đề từng cột của bảng từ trái sang phải.\n'
   '2. Kiểm chính tả và cách viết hoa của từng tiêu đề cột.\n'
   '3. Đọc nhãn trạng thái trên một bản ghi và đối chiếu với mục cùng nghĩa trong ô chọn '
   '"Trạng thái".',
   '1. Đúng các cột theo thứ tự: STT · Bảng · Nội dung · Người tạo · Người duyệt · Ngày tạo · '
   'Trạng thái · Hành động.\n2. Tiêu đề viết đúng chính tả, không viết tắt lạ.',
   V + 'Nhãn trạng thái trên bản ghi ghi "Chờ xử lý" trong khi mục tương ứng của ô lọc ghi '
   '"Chờ duyệt". Hai chỗ trong cùng một màn gọi khác tên một trạng thái. Cần QA/BA chốt một tên.')

icon_nhom(S, CN_DS,
          '"Duyệt" (hình dấu tích trong vòng tròn) · "Từ chối" (hình dấu nhân trong vòng tròn, '
          'màu đỏ) · "Áp dụng" (hình đồng hồ) · "Xem bảng" (hình mũi tên sang phải)',
          'Màn không có thao tác xoá nên không áp dụng. Biểu tượng phá huỷ gần nhất là "Từ chối", '
          'biểu tượng và chữ đều tô màu đỏ.',
          'Bản ghi "Chờ xử lý" hiện "Duyệt" và "Từ chối". Bản ghi "Đã duyệt" hiện "Áp dụng". '
          'Bản ghi "Đã áp dụng" hiện "Xem bảng". Bản ghi "Từ chối" không hiện thao tác nào.')

perpage_text(S, CN_DS, 20)
perpage_select(S, CN_DS, 20, trong_ds=True)

L_(S, CN_DS, 'Chức năng Danh sách yêu cầu thay đổi', 'Kiểm tra dữ liệu danh sách khớp DB',
   '1. Mở màn Yêu cầu thay đổi, chưa lọc gì.\n'
   '2. Ghi lại tên bảng, nội dung, người tạo, ngày tạo và trạng thái của các bản ghi.\n'
   '3. Đối chiếu với dữ liệu trong hệ thống:\nselect * from <bảng yêu cầu thay đổi>\n'
   'order by created_at desc;',
   'Số bản ghi và từng cột hiển thị khớp chính xác với dữ liệu yêu cầu thay đổi trong hệ thống. '
   'Thứ tự sắp xếp giống nhau.', T_BANG)

L_(S, CN_DS, A, 'Truy cập màn bằng tài khoản khác vai trò',
   '1. Đăng nhập tài khoản KHÁC vai trò (Lãnh đạo Bộ / Đơn vị nguồn / Sở GD&ĐT / Trường học / '
   'Tổ chức ngoài).\n2. Gõ thẳng địa chỉ màn Yêu cầu thay đổi.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện KHÔNG chặn vai trò nào nên màn vẫn '
   'mở ra đầy đủ, kể cả các biểu tượng "Duyệt", "Từ chối" và "Áp dụng".', T_QUYEN)
L_(S, CN_DS, A, 'Can thiệp tham số để lấy dữ liệu ngoài phạm vi',
   '1. Sửa tham số lọc trên địa chỉ trang để yêu cầu dữ liệu của đơn vị khác.\n'
   '2. Mở lại màn và đọc "Tổng số bản ghi:".',
   'Hệ thống chỉ trả về yêu cầu thuộc phạm vi tỉnh/đơn vị được phân công, không lộ bản ghi ngoài '
   'phạm vi được phân công.', T_QUYEN)

# ── CN TÌM KIẾM & LỌC YÊU CẦU THAY ĐỔI ────────────────────────────────────────────────────
selectbox_khong_o_tim(
    S, CN_TK, 'Selectbox Trạng thái', 'Trạng thái',
    '"Tất cả trạng thái" · "Chờ duyệt" · "Đã duyệt" · "Đã áp dụng" · "Từ chối"',
    'Ô hiện sẵn "Tất cả trạng thái" và bảng đang liệt kê yêu cầu ở mọi trạng thái.',
    'Bảng lọc lại theo trạng thái vừa chọn và quay về trang 1, các điều kiện lọc khác giữ nguyên.',
    ghi_chu='Bốn mục trạng thái hiện kèm số yêu cầu đang có của trạng thái đó trong ngoặc.')
# ⛔ LUẬT CỨNG ① — xem ghi chú ở case cùng tên của CN Tìm kiếm phần tử danh mục.
L_(S, CN_TK, 'Selectbox Trạng thái', 'Tìm kiếm với:',
   qalib.buoc_mac_dinh_chuan('Selectbox Trạng thái', 'loc', tim_kiem=True),
   qalib.kq_mac_dinh_chuan('Selectbox Trạng thái', 'loc', tim_kiem=True),
   '%s màn thật đang hiện "Tất cả trạng thái"' % qalib.CO_LUAT_CUNG)
L_(S, CN_TK, 'Selectbox Trạng thái', 'Chọn 1 giá trị của Trạng thái',
   '1. Bấm mở ô chọn "Trạng thái" rồi chọn "Chờ duyệt".\n'
   '2. Đối chiếu số bản ghi với con số ghi trong ngoặc của chính mục "Chờ duyệt".',
   'Bảng chỉ còn yêu cầu mang nhãn "Chờ xử lý", quay về trang 1. "Tổng số bản ghi:" bằng đúng '
   'con số ghi trong ngoặc của mục vừa chọn.',
   V + 'Mục lọc ghi "Chờ duyệt" nhưng nhãn trên bản ghi ghi "Chờ xử lý" — cùng một trạng thái, '
   'hai cách gọi. Cần QA/BA chốt một tên.')

T_NGAY_LOC = (V + 'Ô ngày của thanh lọc chỉ chọn được bằng hộp lịch, không gõ được bằng bàn phím '
              'và không có nút xoá nhanh. Muốn bỏ điều kiện ngày phải tải lại trang. '
              'Cần QA/BA chốt có bổ sung nút xoá hay không.')


def o_ngay_loc(nhan):
    g = 'Datepicker %s' % nhan
    L_(S, CN_TK, g, 'Kiểm tra giá trị mặc định của %s' % nhan,
       '1. Mở màn Yêu cầu thay đổi.\n2. Quan sát ô "%s" trên thanh lọc.' % nhan,
       'Mặc định là trống, hiện chữ gợi ý "%s" màu xám kèm biểu tượng lịch ở đầu ô.' % nhan)
    L_(S, CN_TK, g, 'Kiểm tra %s khi để trống' % nhan,
       '1. Để trống ô "%s".\n2. Quan sát bảng yêu cầu thay đổi.' % nhan,
       'Ô "%s" không bắt buộc. Khi để trống, bảng không bị chặn theo mốc ngày nào.' % nhan)
    L_(S, CN_TK, g, 'Kiểm tra hộp lịch khi %s chưa có giá trị' % nhan,
       '1. Bấm vào ô "%s" khi ô đang trống.' % nhan,
       'Hộp lịch mở ra ngay dưới ô, hiện tháng hiện tại và chưa ngày nào được tô chọn.')
    L_(S, CN_TK, g, 'Kiểm tra hộp lịch khi %s đã có giá trị' % nhan,
       '1. Chọn một ngày cho ô "%s".\n2. Bấm lại vào ô để mở hộp lịch.' % nhan,
       'Hộp lịch mở đúng tháng của ngày đang chọn và ngày đó được tô chọn.')
    L_(S, CN_TK, g, 'Kiểm tra hoạt động của hộp lịch %s' % nhan,
       '1. Mở hộp lịch của ô "%s".\n2. Chuyển tháng trước và tháng sau.\n'
       '3. Chọn một ngày.\n4. Mở lại hộp lịch rồi bấm ra ngoài.' % nhan,
       '1. Chuyển tháng được cả hai chiều.\n'
       '2. Chọn ngày thì hộp lịch đóng, ô hiện ngày, bảng lọc lại và quay về trang 1.\n'
       '3. Bấm ra ngoài thì hộp lịch đóng, giá trị giữ nguyên.')
    L_(S, CN_TK, g, 'Kiểm tra nhập và xoá %s bằng bàn phím' % nhan,
       '1. Đặt con trỏ vào ô "%s" và gõ 01/09/2026.\n'
       '2. Chọn một ngày bằng hộp lịch rồi thử xoá bằng phím Delete hoặc Backspace.' % nhan,
       'Ô không nhận chữ gõ từ bàn phím và không xoá được bằng bàn phím. Giá trị chỉ đổi được '
       'bằng cách chọn ngày khác trong hộp lịch.', T_NGAY_LOC)
    L_(S, CN_TK, g, 'Kiểm tra khi %s không đúng định dạng' % nhan,
       '1. Thử gõ chuỗi 2026-09-01 vào ô "%s".\n2. Thử dán chuỗi đó vào ô.' % nhan,
       'Ô không nhận chuỗi gõ hay dán vào, giá trị giữ nguyên như trước. Không có thông báo lỗi '
       'nào vì ô chỉ nhận ngày chọn từ hộp lịch.', T_NGAY_LOC)
    L_(S, CN_TK, g, 'Kiểm tra khi %s có định dạng đúng nhưng ngày không tồn tại' % nhan,
       '1. Mở hộp lịch của ô "%s".\n2. Chuyển sang tháng 2 của một năm thường và tìm ngày 30.\n'
       '3. Chuyển sang tháng 4 và tìm ngày 31.' % nhan,
       'Hộp lịch chỉ vẽ đúng số ngày thật của từng tháng nên không chọn được ngày không tồn tại. '
       'Không có thông báo lỗi nào.')
    L_(S, CN_TK, g, 'Kiểm tra khi %s có định dạng hợp lệ' % nhan,
       '1. Chọn một ngày hợp lệ cho ô "%s".\n2. Quan sát ô và bảng yêu cầu thay đổi.' % nhan,
       'Ô hiện đúng ngày vừa chọn theo khuôn ngày/tháng/năm. Bảng chỉ còn yêu cầu có ngày tạo '
       'thoả mãn mốc đó và quay về trang 1.')
    L_(S, CN_TK, g, 'Kiểm tra nhập %s là ngày quá khứ' % nhan,
       '1. Mở hộp lịch của ô "%s" và chọn một ngày trong quá khứ.' % nhan,
       'Ngày quá khứ chọn được bình thường, không bị làm mờ. Bảng lọc lại theo mốc ngày đó.')
    L_(S, CN_TK, g, 'Kiểm tra nhập %s là ngày tương lai' % nhan,
       '1. Mở hộp lịch của ô "%s" và chọn một ngày trong tương lai.' % nhan,
       'Ngày tương lai chọn được bình thường, không bị làm mờ. Bảng lọc theo mốc đó nên thường '
       'không còn yêu cầu nào và hiện dòng chữ "Không có yêu cầu nào."',
       V + 'Ô ngày không đặt mốc lớn nhất nên chọn được ngày tương lai. Cần QA/BA chốt có nên '
       'chặn ngày tương lai ở ô "Từ ngày" hay không.')
    L_(S, CN_TK, g, 'Tìm kiếm với:',
       '1. Chọn lần lượt vài ngày khác nhau cho ô "%s".\n'
       '2. Sau mỗi lần chọn, đọc "Tổng số bản ghi:" và cột "Ngày tạo" của các bản ghi.' % nhan,
       'Bảng chỉ còn yêu cầu có ngày tạo thoả mãn mốc vừa chọn. Đổi mốc thì kết quả đổi theo và '
       'luôn quay về trang 1.')
    L_(S, CN_TK, g, 'Chọn 1 giá trị của %s' % nhan,
       '1. Chọn đúng một ngày cho ô "%s", các tiêu chí khác để trống.' % nhan,
       'Bảng chỉ còn yêu cầu thoả mãn mốc ngày đó. Ô hiện đúng ngày vừa chọn.')


o_ngay_loc('Từ ngày')
o_ngay_loc('Đến ngày')

G = 'Textbox Tìm theo tên bảng'
o_tim(S, CN_TK, G, 'Tìm theo tên bảng',
      'Ô trống, hiện chữ gợi ý "Tìm theo tên bảng…". Bên trái ô có biểu tượng kính lúp.',
      'Bảng chỉ còn yêu cầu có tên bảng khớp từ khoá và quay về trang 1.',
      'Bảng hiện biểu tượng cảnh báo kèm dòng chữ "Không có yêu cầu nào."',
      'Ghi lại nguyên trạng và đối chiếu với thiết kế: tên bảng danh mục vốn viết không dấu nên '
      'từ khoá không dấu vẫn tìm ra bản ghi.',
      V + 'Ô tìm kiếm gửi từ khoá lên máy chủ. Cách so khớp và việc có bỏ dấu hay không do máy '
      'chủ quyết định, cần dev xác nhận.')

o_tim_don_le(
    S, CN_TK, G, 'Tìm theo tên bảng',
    cat_space='Bảng giữ nguyên đầy đủ: ô tự cắt khoảng trắng nên từ khoá thành chuỗi rỗng và '
              'không gửi điều kiện tìm kiếm nào.',
    tuong_doi=('1. Gõ vào ô "Tìm theo tên bảng…" một phần tên bảng đang có, lần lượt bằng chữ '
               'thường rồi chữ HOA.\n2. Đối chiếu kết quả với dữ liệu trong hệ thống:\n'
               'select * from <bảng yêu cầu thay đổi>\n'
               "where lower(<cột tên bảng>) like lower('%<từ khoá>%');",
               '1. Hai lần gõ cho cùng một kết quả: tìm kiếm không phân biệt chữ hoa chữ thường.\n'
               '2. Kết quả khớp với dữ liệu đang lưu trong hệ thống.'),
    dac_biet=('1. Gõ vào ô "Tìm theo tên bảng…" lần lượt các ký tự đặc biệt: %  ·  &  ·  _  ·  *  '
              '·  \\  ·  dấu nháy  ·  thẻ html <b>1</b>.\n2. Nhấn Enter sau mỗi lần.',
              'Hệ thống tìm bình thường và không báo lỗi hệ thống. Ký tự đặc biệt không làm hỏng '
              'điều kiện tìm kiếm. Không có kết quả thì bảng hiện "Không có yêu cầu nào."'),
    viet_hoa=T_BANG,
    duoi_nguong='1. Với 1 và 2 ký tự, hệ thống không gửi điều kiện tìm kiếm, bảng giữ nguyên đầy '
                'đủ và không hiện thông báo nào.\n'
                '2. Từ 3 ký tự trở lên, kết quả áp sau khi ngừng gõ 1500 mili giây.\n'
                '3. Nhấn Enter thì áp ngay cả với 2 ký tự, bỏ qua cả thời gian chờ lẫn ngưỡng ký tự.')

G = 'Validate ràng buộc giữa các trường'
T_CAP_LOC = (M + 'Chuẩn mong đợi là chặn khi "Từ ngày" muộn hơn "Đến ngày". Giao diện hiện KHÔNG '
             'kiểm quan hệ giữa hai ô và cũng không giới hạn hộp lịch của ô sau theo ô trước. '
             'Cần QA/BA quyết bổ sung lưới chắn hay để máy chủ xử lý.')
L_(S, CN_TK, G, 'Kiểm tra Từ ngày lớn hơn Đến ngày',
   '1. Chọn "Từ ngày" là 01/09/2026.\n2. Chọn "Đến ngày" là 01/08/2026.\n'
   '3. Quan sát bảng yêu cầu thay đổi.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện không báo lỗi và vẫn gửi cả hai mốc '
   'lên máy chủ. Bảng thường không còn yêu cầu nào và hiện "Không có yêu cầu nào."', T_CAP_LOC)
L_(S, CN_TK, G, 'Kiểm tra Từ ngày bằng Đến ngày',
   '1. Chọn "Từ ngày" và "Đến ngày" cùng một ngày có yêu cầu được tạo.\n'
   '2. Quan sát bảng yêu cầu thay đổi.',
   'Bảng vẫn còn các yêu cầu tạo đúng ngày đó: hai đầu bằng nhau là hợp lệ và tính cả hai biên.')
L_(S, CN_TK, G, 'Kiểm tra chỉ nhập Từ ngày hoặc chỉ nhập Đến ngày',
   '1. Chỉ chọn "Từ ngày", để trống "Đến ngày", đọc "Tổng số bản ghi:".\n'
   '2. Tải lại trang, chỉ chọn "Đến ngày", để trống "Từ ngày".',
   '1. Chỉ có "Từ ngày": bảng còn mọi yêu cầu từ ngày đó trở về sau, không bị chặn đầu cuối.\n'
   '2. Chỉ có "Đến ngày": bảng còn mọi yêu cầu từ ngày đó trở về trước.')
L_(S, CN_TK, G, 'Kiểm tra vùng chọn của Đến ngày bị giới hạn theo Từ ngày',
   '1. Chọn "Từ ngày" là 01/09/2026.\n'
   '2. Mở hộp lịch của ô "Đến ngày" và xem các ngày trước 01/09/2026.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: các ngày trước "Từ ngày" vẫn chọn được, không '
   'ngày nào bị làm mờ.', T_CAP_LOC)

G = 'Chức năng Tìm kiếm chung'
L_(S, CN_TK, G, 'Tìm kiếm theo giá trị mặc định',
   '1. Mở màn Yêu cầu thay đổi.\n2. Không gõ từ khoá, không chọn trạng thái và không chọn ngày.',
   'Bảng hiển thị toàn bộ yêu cầu thay đổi, mới nhất trước, trang 1.')
L_(S, CN_TK, G, 'Tìm kiếm không ra kết quả với từng điều kiện tìm kiếm hoặc tất cả các điều kiện',
   '1. Gõ vào ô "Tìm theo tên bảng…" từ khoá chắc chắn không khớp bảng nào rồi nhấn Enter.\n'
   '2. Giữ từ khoá đó và chọn thêm "Trạng thái", "Từ ngày", "Đến ngày".',
   'Cả hai lượt, bảng hiện biểu tượng cảnh báo kèm dòng chữ "Không có yêu cầu nào."')
L_(S, CN_TK, G, 'Tìm kiếm kết hợp tất cả các điều kiện tìm kiếm',
   '1. Chọn "Trạng thái", chọn "Từ ngày" và "Đến ngày", gõ từ khoá tên bảng, sao cho chắc chắn có '
   'yêu cầu thoả mãn.\n2. Quan sát bảng yêu cầu thay đổi.',
   'Bảng chỉ còn yêu cầu thoả mãn ĐỒNG THỜI cả bốn tiêu chí.')
L_(S, CN_TK, G,
   'Thực hiện tìm kiếm lần lượt 2 điều kiện khác nhau nhưng đều ra số bản ghi kết quả giống nhau',
   '1. Chọn "Trạng thái" = "Chờ duyệt", ghi lại số bản ghi tìm được.\n'
   '2. Bỏ lọc trạng thái, gõ từ khoá tên bảng sao cho cũng ra đúng số bản ghi đó.',
   'Hai lượt cho cùng số bản ghi nhưng danh sách bản ghi khác nhau, đúng theo điều kiện vừa áp.')

G = 'Chức năng Tìm kiếm kết hợp'
_TIEU_CHI = ('ô chọn "Trạng thái" · ô "Từ ngày" · ô "Đến ngày" · ô "Tìm theo tên bảng…"')
for _k in (2, 3, 4):
    L_(S, CN_TK, G, 'Kiểm tra tìm kiếm kết hợp %d tiêu chí' % _k,
       '1. Chọn %d trong các tiêu chí của màn để kết hợp, ghi lại tiêu chí đã chọn vào cột kết quả '
       'thực tế. Các tiêu chí của màn: %s.\n'
       '2. Nhập hoặc chọn giá trị cho cả %d tiêu chí, chắc chắn có bản ghi thoả mãn.'
       % (_k, _TIEU_CHI, _k)
       + ('\n3. Đối chiếu kết quả với dữ liệu trong hệ thống:\nselect * from <bảng yêu cầu thay '
          'đổi>\nwhere <điều kiện theo 4 tiêu chí đã chọn>;' if _k == 4 else ''),
       'Bảng chỉ còn bản ghi thoả mãn ĐỒNG THỜI cả %d tiêu chí, quay về trang 1.' % _k
       + (' Kết quả khớp với dữ liệu đang lưu trong hệ thống.' if _k == 4 else ''),
       T_BANG if _k == 4 else None)
L_(S, CN_TK, G, 'Kiểm tra bỏ dần từng tiêu chí đang áp',
   '1. Áp cả 4 tiêu chí như case trên, ghi lại số bản ghi.\n'
   '2. Xoá từ khoá tên bảng, ghi lại số bản ghi.\n'
   '3. Bỏ tiếp ô chọn "Trạng thái" về "Tất cả trạng thái".\n'
   '4. Tải lại trang để bỏ hai mốc ngày.',
   'Mỗi lần bỏ một tiêu chí thì số bản ghi tăng lên hoặc giữ nguyên, không bao giờ giảm. Khi bỏ '
   'hết, bảng trở lại toàn bộ yêu cầu thay đổi.', T_NGAY_LOC)

L_(S, CN_TK, A, 'Kiểm tra tìm kiếm chỉ trong phạm vi phạm vi tỉnh/đơn vị được phân công',
   '1. Gõ vào ô "Tìm theo tên bảng…" từ khoá khớp yêu cầu của đơn vị khác.\n2. Nhấn Enter.',
   'Không trả về bản ghi ngoài phạm vi được phân công. Kết quả giới hạn đúng theo phạm vi '
   'tỉnh/đơn vị được phân công.', T_QUYEN)

# ── CN KIỂM DUYỆT / TỪ CHỐI / ÁP DỤNG YÊU CẦU THAY ĐỔI ────────────────────────────────────
T_KHONG_HOI = (R + 'Bấm "Duyệt" và bấm "Áp dụng" gọi thẳng lên máy chủ, KHÔNG có hộp thoại xác '
               'nhận trung gian nào. Riêng "Từ chối" mới mở hộp thoại nhập lý do. Áp dụng là '
               'thao tác ghi thật lên bảng danh mục dùng chung nên bấm nhầm là đổi dữ liệu ngay. '
               'Cần QA/BA chốt có bổ sung bước xác nhận hay không.')

nut(S, CN_KD, 'Button Duyệt', 'Duyệt',
    'chuyển yêu cầu từ "Chờ xử lý" sang "Đã duyệt" ngay.', t=T_KHONG_HOI)
nut(S, CN_AD, 'Button Áp dụng', 'Áp dụng',
    'ghi thay đổi thật lên bảng danh mục và chuyển yêu cầu sang "Đã áp dụng".', t=T_KHONG_HOI)

G = 'Chức năng Chuyển trạng thái yêu cầu thay đổi'
L_(S, CN_KD, G, 'Kiểm tra việc hủy bỏ thao tác chuyển trạng thái',
   '1. Tìm một yêu cầu mang nhãn "Chờ xử lý".\n'
   '2. Rê chuột lên biểu tượng "Duyệt" rồi đưa chuột ra chỗ khác mà không bấm.',
   'Yêu cầu vẫn ở nhãn "Chờ xử lý", không có thay đổi nào. Thao tác duyệt chỉ xảy ra khi thật sự '
   'bấm vào biểu tượng.', T_KHONG_HOI)
L_(S, CN_KD, G, 'Kiểm tra click icon đóng trên hộp xác nhận chuyển trạng thái',
   '1. Bấm biểu tượng "Duyệt" trên một yêu cầu "Chờ xử lý".\n2. Quan sát màn hình.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: không có hộp thoại xác nhận nào mở ra nên '
   'không có dấu nhân để đóng. Yêu cầu đổi trạng thái ngay sau khi bấm.', T_KHONG_HOI)
L_(S, CN_KD, G, 'Kiểm tra chuyển trạng thái thành công',
   '1. Ghi lại tên bảng và nội dung của một yêu cầu mang nhãn "Chờ xử lý".\n'
   '2. Bấm biểu tượng "Duyệt" trên yêu cầu đó.',
   '1. Thông báo nổi "Đã phê duyệt. Có thể áp dụng ngay."\n'
   '2. Bảng tự tải lại, nhãn của yêu cầu đổi thành "Đã duyệt".\n'
   '3. Cột "Hành động" của yêu cầu đó chỉ còn biểu tượng "Áp dụng".\n'
   '4. Dữ liệu bảng danh mục CHƯA đổi.')
L_(S, CN_KD, G, 'Kiểm tra chuyển trạng thái trở lại Hoạt động',
   '1. Duyệt một yêu cầu, ghi lại nhãn mới.\n'
   '2. Tìm cách đưa yêu cầu đó trở lại nhãn "Chờ xử lý".',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: màn không có thao tác nào đưa yêu cầu đã duyệt '
   'trở lại chờ duyệt. Vòng đời chỉ đi một chiều.',
   M + 'Chuẩn mong đợi có thể cần thao tác thu hồi phê duyệt. Giao diện hiện không có. '
   'Cần QA/BA quyết có bổ sung hay không.')
L_(S, CN_KD, G, 'Kiểm tra click liên tục vào button Chuyển trạng thái',
   '1. Bấm liên tục nhiều lần vào biểu tượng "Duyệt" của cùng một yêu cầu.',
   'Hệ thống không gửi request nhiều lần. Biểu tượng bị vô hiệu ngay sau lần bấm đầu cho tới khi '
   'bảng tải lại xong, yêu cầu chỉ được duyệt một lần.')
L_(S, CN_KD, G, 'Kiểm tra Tab và Enter liên tục vào button Chuyển trạng thái',
   '1. Dùng phím Tab đưa tiêu điểm vào biểu tượng "Duyệt" của một yêu cầu "Chờ xử lý".\n'
   '2. Nhấn Enter liên tục.',
   'Đi bằng bàn phím cho kết quả giống bấm chuột: yêu cầu chỉ được duyệt một lần và hiện thông '
   'báo nổi "Đã phê duyệt. Có thể áp dụng ngay."')
L_(S, CN_KD, G,
   'Kiểm tra chuyển trạng thái cùng một bản ghi cùng lúc từ 2 tab hoặc 2 client khác nhau',
   '1. Mở màn Yêu cầu thay đổi trên hai tab, cùng thấy một yêu cầu "Chờ xử lý".\n'
   '2. Bấm biểu tượng "Duyệt" trên CÙNG yêu cầu đó ở cả hai tab gần như cùng lúc.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế:\n'
   'Tab 1( Client 1) : Duyệt thành công, nhãn đổi thành "Đã duyệt"\n'
   'Tab 2( Client 2) : Bị chặn kèm thông báo nổi "Không thể phê duyệt.", hoặc tải lại bảng và thấy '
   'yêu cầu đã ở nhãn "Đã duyệt".',
   V + 'Giao diện không kiểm trạng thái hiện tại trước khi gửi. Cần dev xác nhận máy chủ có chặn '
   'duyệt lại một yêu cầu đã duyệt hay không.')

G = 'Hộp xác nhận Từ chối yêu cầu'
L_(S, CN_TC, G, 'Kiểm tra nội dung Hộp xác nhận Từ chối yêu cầu',
   '1. Bấm biểu tượng "Từ chối" trên một yêu cầu "Chờ xử lý".\n2. Đọc toàn bộ hộp thoại.',
   'Hộp thoại có tiêu đề "Từ chối yêu cầu" kèm biểu tượng dấu nhân màu đỏ, khung thông tin yêu '
   'cầu, ô "Lý do từ chối" và hai nút "Huỷ" · "Từ chối".')
L_(S, CN_TC, G, 'Kiểm tra dữ liệu bản ghi hiện trong Hộp xác nhận Từ chối yêu cầu',
   '1. Ghi lại tên bảng và nội dung của một yêu cầu "Chờ xử lý".\n'
   '2. Bấm biểu tượng "Từ chối" trên chính yêu cầu đó.\n3. Đọc khung thông tin trong hộp thoại.',
   'Khung thông tin hiện đúng tên bảng ở dòng trên bằng phông chữ đều và nội dung yêu cầu ở dòng '
   'dưới, khớp với bản ghi vừa chọn.')
L_(S, CN_TC, G, 'Kiểm tra căn lề, chính tả trên Hộp xác nhận Từ chối yêu cầu',
   '1. Mở hộp thoại "Từ chối yêu cầu".\n2. Đọc từng nhãn và từng nút.',
   'Chữ đúng chính tả, các nhãn thẳng hàng nhau, ô bắt buộc "Lý do từ chối" có dấu sao. Hai nút '
   'nằm ở góc dưới bên phải, nút "Từ chối" tô nền đỏ.')

G = 'Textarea Lý do từ chối'
L_(S, CN_TC, G, 'Kiểm tra giá trị mặc định Lý do từ chối',
   '1. Mở hộp thoại "Từ chối yêu cầu".\n2. Quan sát ô "Lý do từ chối".',
   'Mặc định là trống, hiện chữ gợi ý "Mô tả lý do từ chối…", ô cao 3 dòng.')
L_(S, CN_TC, G, 'Kiểm tra Lý do từ chối là trường bắt buộc',
   '1. Để trống ô "Lý do từ chối".\n2. Bấm nút "Từ chối" trong hộp thoại.\n'
   '3. Làm lại với chuỗi chỉ gồm dấu cách.',
   'Cả hai lượt đều hiện thông báo nổi "Vui lòng nhập lý do từ chối." Hộp thoại không đóng và '
   'không gửi yêu cầu nào.', T_TOAST)
L_(S, CN_TC, G, 'Kiểm tra Lý do từ chối nhập vượt độ dài cho phép',
   '1. Dán vào ô "Lý do từ chối" một chuỗi 5.000 ký tự.\n2. Bấm nút "Từ chối".',
   'Ô nhận hết chuỗi vừa dán. Hoặc hệ thống không cho nhập quá <số ký tự tối đa của cột dữ liệu> '
   'ký tự.',
   V + 'Ô "Lý do từ chối" KHÔNG đặt giới hạn ký tự ở giao diện. Giới hạn thật của cột dữ liệu '
   'chưa được xác nhận.')
L_(S, CN_TC, G, 'Kiểm tra Lý do từ chối nhập trong độ dài cho phép',
   '1. Nhập vào ô "Lý do từ chối" một câu ngắn hợp lệ.\n2. Bấm nút "Từ chối".',
   'Nhận đủ chuỗi vừa nhập, hiện thông báo nổi "Đã từ chối yêu cầu." và hộp thoại đóng lại.')
L_(S, CN_TC, G, 'Kiểm tra Lý do từ chối nhập ký tự đặc biệt, thẻ html, script',
   '1. Nhập vào ô "Lý do từ chối" chuỗi có ký tự đặc biệt và thẻ html, ví dụ <b>1</b>.\n'
   '2. Bấm nút "Từ chối".\n3. Rê chuột vào dòng lý do dưới nhãn trạng thái của bản ghi đó.',
   'Ô nhận nguyên chuỗi vừa nhập. Chuỗi hiện lại trên bảng đúng nguyên dạng, không thực thi script '
   'và không làm vỡ bảng.')
L_(S, CN_TC, G, 'Kiểm tra Lý do từ chối nhập số',
   '1. Nhập vào ô "Lý do từ chối" một chuỗi toàn chữ số.\n2. Bấm nút "Từ chối".',
   'Ô nhận chuỗi số bình thường và từ chối thành công.')
L_(S, CN_TC, G, 'Kiểm tra Lý do từ chối nhập nhiều dòng',
   '1. Nhập vào ô "Lý do từ chối" ba dòng, mỗi dòng nhấn Enter để xuống dòng.\n'
   '2. Bấm nút "Từ chối".\n3. Rê chuột vào dòng lý do của bản ghi đó trên bảng.',
   'Ô nhận được nhiều dòng và giữ đúng dấu xuống dòng sau khi gửi và xem lại.')
L_(S, CN_TC, G, 'Kiểm tra Lý do từ chối cắt khoảng trắng hai đầu',
   '1. Nhập vào ô "Lý do từ chối" một chuỗi có khoảng trắng ở đầu và cuối.\n2. Bấm nút "Từ chối".',
   'Hệ thống bỏ qua khoảng trắng hai đầu khi kiểm ô bắt buộc và từ chối thành công.')
L_(S, CN_TC, G, 'Kiểm tra copy dữ liệu dán vào ô Lý do từ chối',
   '1. Sao chép một đoạn văn bản.\n2. Dán vào ô "Lý do từ chối".\n3. Bấm nút "Từ chối".',
   'Ô nhận đúng nội dung vừa dán, không lỗi phông chữ.')
L_(S, CN_TC, G, 'Kiểm tra Lý do từ chối nhập tiếng Việt có dấu',
   '1. Nhập vào ô "Lý do từ chối" chuỗi tiếng Việt có dấu.\n2. Bấm nút "Từ chối".\n'
   '3. Rê chuột vào dòng lý do của bản ghi đó trên bảng.',
   'Ô nhận và lưu đúng chuỗi tiếng Việt có dấu, xem lại vẫn đúng dấu, không lỗi phông chữ.')

nut(S, CN_TC, 'Button Huỷ', 'Huỷ', 'đóng hộp thoại và không từ chối yêu cầu nào.')
nut(S, CN_TC, 'Button Từ chối', 'Từ chối',
    'kiểm ô "Lý do từ chối" rồi chuyển yêu cầu sang nhãn "Từ chối".',
    t='Trong lúc gửi, nút hiện thêm biểu tượng xoay tròn và bị vô hiệu.')

G = 'Chức năng Chuyển trạng thái yêu cầu bị từ chối'
L_(S, CN_TC, G, 'Kiểm tra việc hủy bỏ thao tác chuyển trạng thái',
   '1. Bấm biểu tượng "Từ chối" trên một yêu cầu "Chờ xử lý".\n'
   '2. Nhập lý do rồi bấm nút "Huỷ".',
   'Hộp thoại đóng lại, yêu cầu vẫn ở nhãn "Chờ xử lý" và không ghi lý do nào.')
L_(S, CN_TC, G, 'Kiểm tra click icon đóng trên hộp xác nhận chuyển trạng thái',
   '1. Mở hộp thoại "Từ chối yêu cầu".\n2. Bấm dấu nhân ở góc trên bên phải hộp thoại.\n'
   '3. Mở lại hộp thoại rồi nhấn phím Esc.\n4. Mở lại hộp thoại rồi bấm ra vùng tối bên ngoài.',
   'Cả ba cách đều đóng hộp thoại, yêu cầu giữ nguyên nhãn "Chờ xử lý". Mở lại thì ô "Lý do từ '
   'chối" trở về trống.')
L_(S, CN_TC, G, 'Kiểm tra chuyển trạng thái thành công',
   '1. Ghi lại tên bảng và nội dung của một yêu cầu "Chờ xử lý".\n'
   '2. Bấm biểu tượng "Từ chối", nhập lý do rồi bấm nút "Từ chối".',
   '1. Thông báo nổi "Đã từ chối yêu cầu."\n'
   '2. Hộp thoại đóng lại, bảng tự tải lại, nhãn của yêu cầu đổi thành "Từ chối".\n'
   '3. Dưới nhãn trạng thái hiện thêm dòng lý do vừa nhập bằng chữ nhỏ, rê chuột vào thấy đầy đủ.\n'
   '4. Cột "Hành động" của yêu cầu đó không còn thao tác nào.')
L_(S, CN_TC, G, 'Kiểm tra chuyển trạng thái trở lại Hoạt động',
   '1. Từ chối một yêu cầu.\n2. Tìm cách đưa yêu cầu đó trở lại nhãn "Chờ xử lý".',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: màn không có thao tác nào đưa yêu cầu đã từ '
   'chối trở lại chờ duyệt. Người dùng phải gửi một yêu cầu mới.',
   M + 'Chuẩn mong đợi có thể cần thao tác mở lại yêu cầu bị từ chối. Giao diện hiện không có. '
   'Cần QA/BA quyết có bổ sung hay không.')
L_(S, CN_TC, G, 'Kiểm tra click liên tục vào button Chuyển trạng thái',
   '1. Mở hộp thoại "Từ chối yêu cầu", nhập lý do.\n'
   '2. Bấm liên tục nhiều lần vào nút "Từ chối".',
   'Hệ thống không gửi request nhiều lần. Nút bị vô hiệu ngay sau lần bấm đầu, yêu cầu chỉ bị từ '
   'chối một lần.')
L_(S, CN_TC, G, 'Kiểm tra Tab và Enter liên tục vào button Chuyển trạng thái',
   '1. Mở hộp thoại, nhập lý do bằng bàn phím.\n'
   '2. Tab tới nút "Từ chối" rồi nhấn Enter liên tục.',
   'Đi bằng bàn phím cho kết quả giống bấm chuột: yêu cầu chỉ bị từ chối một lần và hiện thông '
   'báo nổi "Đã từ chối yêu cầu."')
L_(S, CN_TC, G,
   'Kiểm tra chuyển trạng thái cùng một bản ghi cùng lúc từ 2 tab hoặc 2 client khác nhau',
   '1. Mở màn Yêu cầu thay đổi trên hai tab, cùng thấy một yêu cầu "Chờ xử lý".\n'
   '2. Tab 1 bấm "Duyệt". Tab 2 bấm "Từ chối" và nhập lý do rồi gửi.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế:\n'
   'Tab 1( Client 1) : Duyệt thành công, nhãn đổi thành "Đã duyệt"\n'
   'Tab 2( Client 2) : Bị chặn kèm thông báo nổi "Không thể từ chối.", hoặc tải lại bảng và thấy '
   'yêu cầu đã ở nhãn "Đã duyệt".',
   V + 'Giao diện không kiểm trạng thái hiện tại trước khi gửi. Cần dev xác nhận máy chủ có chặn '
   'từ chối một yêu cầu đã duyệt hay không.')

G = 'Chức năng Chuyển trạng thái yêu cầu đã duyệt'
L_(S, CN_AD, G, 'Kiểm tra việc hủy bỏ thao tác chuyển trạng thái',
   '1. Tìm một yêu cầu mang nhãn "Đã duyệt".\n'
   '2. Rê chuột lên biểu tượng "Áp dụng" rồi đưa chuột ra chỗ khác mà không bấm.',
   'Yêu cầu vẫn ở nhãn "Đã duyệt", dữ liệu bảng danh mục không đổi.', T_KHONG_HOI)
L_(S, CN_AD, G, 'Kiểm tra click icon đóng trên hộp xác nhận chuyển trạng thái',
   '1. Bấm biểu tượng "Áp dụng" trên một yêu cầu "Đã duyệt".\n2. Quan sát màn hình.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: không có hộp thoại xác nhận nào mở ra nên '
   'không có dấu nhân để đóng. Thay đổi được ghi thật ngay sau khi bấm.', T_KHONG_HOI)
L_(S, CN_AD, G, 'Kiểm tra chuyển trạng thái thành công',
   '1. Ghi lại tên bảng và nội dung của một yêu cầu "Đã duyệt".\n'
   '2. Bấm biểu tượng "Áp dụng" trên yêu cầu đó.\n'
   '3. Bấm biểu tượng "Xem bảng" của chính yêu cầu đó.',
   '1. Thông báo nổi "Đã áp dụng vào bảng danh mục thực."\n'
   '2. Bảng tự tải lại, nhãn của yêu cầu đổi thành "Đã áp dụng".\n'
   '3. Bấm "Xem bảng" mở màn Chi tiết bộ danh mục tương ứng và phần tử đã đổi đúng theo nội dung '
   'yêu cầu.\n4. Thay đổi đó cũng xuất hiện ở thẻ "Lịch sử thay đổi" của bộ danh mục.')
L_(S, CN_AD, G, 'Kiểm tra chuyển trạng thái trở lại Hoạt động',
   '1. Áp dụng một yêu cầu.\n2. Tìm cách hoàn tác thao tác áp dụng đó.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế: màn không có thao tác nào hoàn tác việc áp '
   'dụng. Muốn quay lại phải gửi một yêu cầu thay đổi mới.',
   R + 'Áp dụng là thao tác ghi thật lên dữ liệu danh mục dùng chung của toàn hệ thống và KHÔNG '
   'hoàn tác được từ giao diện. Cần QA/BA cân nhắc bổ sung bước xác nhận trước khi áp dụng.')
L_(S, CN_AD, G, 'Kiểm tra click liên tục vào button Chuyển trạng thái',
   '1. Bấm liên tục nhiều lần vào biểu tượng "Áp dụng" của cùng một yêu cầu.',
   'Hệ thống không gửi request nhiều lần. Biểu tượng bị vô hiệu ngay sau lần bấm đầu, thay đổi '
   'chỉ được ghi một lần vào bảng danh mục.')
L_(S, CN_AD, G, 'Kiểm tra Tab và Enter liên tục vào button Chuyển trạng thái',
   '1. Dùng phím Tab đưa tiêu điểm vào biểu tượng "Áp dụng" của một yêu cầu "Đã duyệt".\n'
   '2. Nhấn Enter liên tục.',
   'Đi bằng bàn phím cho kết quả giống bấm chuột: thay đổi chỉ được ghi một lần và hiện thông báo '
   'nổi "Đã áp dụng vào bảng danh mục thực."')
L_(S, CN_AD, G,
   'Kiểm tra chuyển trạng thái cùng một bản ghi cùng lúc từ 2 tab hoặc 2 client khác nhau',
   '1. Mở màn Yêu cầu thay đổi trên hai tab, cùng thấy một yêu cầu "Đã duyệt".\n'
   '2. Bấm biểu tượng "Áp dụng" trên CÙNG yêu cầu đó ở cả hai tab gần như cùng lúc.',
   'Ghi lại nguyên trạng và đối chiếu với thiết kế:\n'
   'Tab 1( Client 1) : Áp dụng thành công, nhãn đổi thành "Đã áp dụng"\n'
   'Tab 2( Client 2) : Bị chặn kèm thông báo nổi "Không thể áp dụng.", dữ liệu danh mục không bị '
   'ghi hai lần.',
   V + 'Giao diện không kiểm trạng thái hiện tại trước khi gửi. Cần dev xác nhận máy chủ có chặn '
   'áp dụng lại một yêu cầu đã áp dụng hay không.')

# ── An toàn thông tin của ba CN xử lý yêu cầu ─────────────────────────────────────────────
for _cn, _thao_tac, _loi in ((CN_KD, 'Duyệt', 'Không thể phê duyệt.'),
                             (CN_TC, 'Từ chối', 'Không thể từ chối.'),
                             (CN_AD, 'Áp dụng', 'Không thể áp dụng.')):
    L_(S, _cn, A, 'Yêu cầu quyền thực hiện thao tác',
       '1. Đăng nhập tài khoản không có quyền xử lý yêu cầu thay đổi danh mục.\n'
       '2. Mở màn Yêu cầu thay đổi và bấm biểu tượng "%s" trên một bản ghi.' % _thao_tac,
       'Ghi lại nguyên trạng và đối chiếu với thiết kế: giao diện vẫn hiện biểu tượng "%s" cho mọi '
       'tài khoản. Nếu máy chủ chặn thì hiện thông báo nổi "%s" và trạng thái không đổi.'
       % (_thao_tac, _loi), T_QUYEN)
    L_(S, _cn, A, 'Không thao tác được trên bản ghi ngoài phạm vi được phân công',
       '1. Tìm một yêu cầu thuộc bộ danh mục ngoài phạm vi được phân công.\n'
       '2. Bấm biểu tượng "%s" trên bản ghi đó.' % _thao_tac,
       'Hệ thống chặn, hiện thông báo nổi "%s" và trạng thái của yêu cầu không đổi.' % _loi,
       T_QUYEN)
    attt_phien(S, _cn, 'Thao tác khi hết phiên',
               'Bấm biểu tượng "%s" trên một bản ghi.' % _thao_tac)


# ══════════════════════════════════════════════════════════════════════════════════════════
#  BỘ CHẠY — khớp luật theo NỘI DUNG, ghi TỪNG SHEET MỘT
# ══════════════════════════════════════════════════════════════════════════════════════════
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


# ── THAY CHỮ: bank ATTT per-field viết "Bấm nút lưu." vì không biết nhãn nút thật của màn.
# Khuôn §8.1.3 đòi ghi ĐÚNG tên nút. Thay ở cột C của đúng hai CN biểu mẫu, không đụng CN khác.
THAY_C = [
    ('CHITIET', 'THÊM PHẦN TỬ DANH MỤC', 'Bấm nút lưu.', 'Bấm nút "Gửi yêu cầu".'),
    ('CHITIET', 'CHỈNH SỬA PHẦN TỬ DANH MỤC', 'Bấm nút lưu.', 'Bấm nút "Gửi yêu cầu".'),
]


def k(s):
    return qalib.norm((s or '').split('\n')[0])


def main():
    apply_ = '--apply' in sys.argv
    path = os.path.normpath(XLSX)
    bpsheets = tcfix.load(path).bpsheets
    for ten, bp in SHEET.items():
        if bp not in bpsheets:
            raise SystemExit('bộ case KHÔNG có sheet %s — chạy lại new_from_base trước' % bp)

    tong_cd = tong_t = 0
    chua_khop = []
    khop_theo_luat = {}

    for si, (ten_sheet, bp) in enumerate(SHEET.items()):
        luat = [x for x in LUAT if x['sheet'] == ten_sheet]
        if not luat:
            continue
        tc = tcfix.load(path, bp=bp)
        neo = qalib.chup_neo(tc)
        # {(cn, nhóm, tiêu đề): [dòng, …] theo thứ tự xuất hiện}
        idx = {}
        for rn in sorted(neo):
            cn, grp, t = neo[rn]
            idx.setdefault((k(cn), k(grp), k(t)), []).append(rn)
        n_cd = n_t = 0
        print('#### %s' % bp)
        for i, r in enumerate(luat):
            ds = idx.get((k(r['cn']), k(r['nhom']), k(r['tieu_de'])), [])
            if len(ds) < r['thu']:
                chua_khop.append((bp, r['cn'], r['nhom'], r['tieu_de'], r['thu']))
                continue
            rn = ds[r['thu'] - 1]
            khop_theo_luat[(si, i)] = (r['c'] is not None or r['d'] is not None,
                                       [neo[rn][2]])
            if r['c'] is not None or r['d'] is not None:
                tc.retext(rn, None, r['c'], r['d'])
                n_cd += 1
            if r['t'] is not None:
                set_t(tc, rn, r['t'])
                n_t += 1
        n_thay = 0
        for s_, cn_, cu, moi in THAY_C:
            if s_ != ten_sheet:
                continue
            for rn, (cn, _g, _t) in neo.items():
                if cn != cn_:
                    continue
                c = tc.c(rn, 'C') or ''
                if cu in c:
                    tc.retext(rn, None, c.replace(cu, moi), None)
                    n_thay += 1
        if n_thay:
            print('   %d case đổi nhãn nút trong cột C' % n_thay)
            n_cd += n_thay
        print('   %d case sửa cột C/D · %d case ghi cột T' % (n_cd, n_t))
        tong_cd += n_cd
        tong_t += n_t
        if apply_ and (n_cd or n_t):
            pl = tcfix.Plan(tc).keep_range(12, max(tc.order))
            tc.rebuild(pl).save(quiet=True, sync=False)

    xau = qalib.soi_luat_trum(khop_theo_luat)
    if xau:
        raise SystemExit('DỪNG — %d luật ghi cột C/D mà trùm nhiều mục đích: %s' % (len(xau), xau))
    if chua_khop:
        print('\n   !! %d luật KHÔNG khớp case nào (bộ case đã đổi cấu trúc) — rà lại bằng tay:'
              % len(chua_khop))
        for bp, cn, nhom, td, thu in chua_khop[:20]:
            print('      [%s] %s | %s | %s (lần %d)' % (bp, cn[:28], nhom[:28], td[:46], thu))

    print('\n=== A6 Tầng dữ liệu danh mục: %d case sửa cột C/D · %d case ghi cột T · '
          '%d luật không khớp ===' % (tong_cd, tong_t, len(chua_khop)))
    if not apply_:
        print('(XEM TRƯỚC — thêm --apply để ghi)')
        return
    print('ĐÃ GHI -> %s' % path)
    print('⚠️  BẮT BUỘC chạy tiếp: python3 <tools>/formula_layer.py <file> '
          '(rebuild đã ghi đè cột A thành chữ chay)')


if __name__ == '__main__':
    main()

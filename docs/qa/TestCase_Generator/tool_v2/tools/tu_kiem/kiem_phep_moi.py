#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM BỘ PHÉP MỚI CHẠY THẬT QUA `chay_live.py`  (2026-09-16).

`kiem_live_moi.py` đo từng NGUYÊN THAO TÁC (bấm thật · mock · hai phiên). Bộ này đo **đường
chạy trọn vẹn**: `chay_live.py` -> `phep_live.chay()` -> phép của `truong_live` / `man_live` /
`attt_live` -> ghi Excel -> dọn dữ liệu QA.

Vì sao phải tách hai bộ: lỗi hay gặp nhất của một phép đo mới KHÔNG nằm ở thuật toán mà nằm ở
đường gọi — sai chữ ký, thiếu thuộc tính trên `ctx`, `NameError` ở một nhánh hiếm. Lượt chạy
15/09 chết giữa case r16 vì đúng một `NameError` như vậy, và `node --check` không bắt được vì
đó là lỗi Python. Chỉ có chạy thật mới lộ ra.

Bộ case fixture ở đây khớp ĐÚNG `app_gia_crud.py` (đã mở rộng 16/09: breadcrumb · icon đổi
trạng thái · ô tải tệp · textarea · ô ngày · switch · tài khoản không quyền).

    python3 tools/tu_kiem/kiem_phep_moi.py
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
REPO = os.path.dirname(TOOLS)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)
os.environ.setdefault('QA_PROJECT', 'moetdl')

NEN = os.path.join(REPO, 'file-nen', 'file-nen.xlsx')
TK_A = ('qa@gia.vn', 'matkhau-QA')
TK_B = ('xem@gia.vn', 'matkhau-XEM')        # cùng tenant, KHÔNG quyền vào màn

# ── BỘ CASE: mỗi dòng nhắm ĐÚNG một phép mới ──────────────────────────────────────────────
CASES = [
    # (khối CN, nhóm con, B, C, D, phép kỳ vọng)
    ('DANH SÁCH LOẠI NGUỒN', 'Giao diện chung',
     'Kiểm tra hiển thị đầy đủ các thông tin trong màn hình chức năng',
     '1. Mở màn hình chức năng.\n2. Đối chiếu từng thành phần đang hiện trên màn với thiết kế.',
     'Hiển thị màn hình chức năng bao gồm các thông tin:\n'
     '1. [Nút bấm] Xuất Excel\n2. [Nút bấm] + Thêm loại nguồn\n'
     '3. [Trường nhập] Tìm kiếm theo mã, tên hiển thị...\n4. [Cột] Tên hiển thị\n'
     '5. Phân trang\n6. [Nút bấm] Xóa tất cả',
     ('giao_dien_liet_ke', 'liet_ke_thanh_phan')),
    ('DANH SÁCH LOẠI NGUỒN', 'Phân trang', 'Style của paging',
     '1. Quan sát cụm phân trang: nhãn "Số bản ghi/trang:", ô nhập, các nút số trang, '
     'nhãn "Tổng số bản ghi:".',
     'Các thành phần thẳng hàng, cùng chiều cao. Nút đang chọn được tô khác. Nút bị vô hiệu '
     'mờ đi và con trỏ chuột đổi thành dấu cấm.',
     'phan_trang_style'),
    ('DANH SÁCH LOẠI NGUỒN', 'Phân trang', 'Kiểm tra lưu cache',
     '1. Đặt số bản ghi/trang và chuyển sang trang 2.\n2. Rời sang thẻ khác rồi quay lại.',
     'Hệ thống không bị lưu cache', 'phan_trang_cache'),
    ('DANH SÁCH LOẠI NGUỒN', 'Textbox Số bản ghi trên trang',
     'Kiểm tra giá trị mặc định ô số bản ghi trên trang',
     '1. Mở màn, xem ô nhập cạnh chữ "Số bản ghi/trang:".', 'Mặc định là 20.',
     ('o_page_size_nhap', 'luat_cung_so_ban_ghi')),
    ('DANH SÁCH LOẠI NGUỒN', 'Textbox Số bản ghi trên trang',
     'Kiểm tra nhập số âm vào ô số bản ghi trên trang',
     '1. Nhập dấu trừ rồi nhập số vào ô số bản ghi trên trang.', 'Không cho phép nhập',
     # Từ 17/09 lượt 2, `o_so_ban_ghi_nhap` (phép CHUYÊN BIỆT) kết luận được ca này: nó đọc ô
     # theo VÙNG phân trang thay vì theo `<label>`, nên không còn bỏ cuộc và rơi xuống phép
     # tổng quát nữa. Khai cả hai — thứ phép kiểm này chốt là *case có kết luận*, không phải
     # *đúng phép ấy chạy*.
     ('o_page_size_nhap', 'o_so_ban_ghi_nhap')),
    # ⚠️ Thêm 18/09 lượt 2 — dựng lại r581. Nút *"Ngừng hoạt động"* của màn là ICON TRONG
    # DÒNG ở cột Hành động, không phải nút có chữ trên màn. Bản trước tìm theo chữ, không
    # thấy, rồi `return None` ⇒ case nằm CHƯA ĐO qua nhiều lượt chạy mà không lộ lý do.
    ('DANH SÁCH LOẠI NGUỒN', 'Button Ngừng hoạt động',
     'Kiểm tra căn lề, chính tả của button',
     '1. Mở màn, tìm một bản ghi Hoạt động và KHÔNG được sử dụng.\n'
     '2. Rê chuột lên biểu tượng hai vạch dừng ở cột Hành động của bản ghi đó.',
     'Đúng chính tả, text trong button được căn lề giữa', 'hinh_hoc_nut'),
    ('DANH SÁCH LOẠI NGUỒN', 'Breadcrumb', 'Kiểm tra Breadcrumb hiển thị đủ cấp',
     '1. Mở màn, quan sát đường dẫn phía trên tiêu đề.',
     'Breadcrumb hiện đủ các cấp, cấp cuối là tên màn hình.', 'breadcrumb_hien_thi'),
    ('DANH SÁCH LOẠI NGUỒN', 'Breadcrumb', 'Kiểm tra cấp cuối của Breadcrumb',
     '1. Quan sát cấp cuối của Breadcrumb.',
     'Cấp cuối không phải liên kết, không bấm được.', 'breadcrumb_hien_thi'),
    ('TÌM KIẾM & LỌC LOẠI NGUỒN', 'Textbox Tìm kiếm',
     'Kiểm tra ô Tìm kiếm cắt khoảng trắng hai đầu',
     '1. Gõ từ khoá có thêm khoảng trắng ở đầu và cuối vào ô "Tìm kiếm".\n2. Nhấn Enter.',
     'Hệ thống tự cắt khoảng trắng hai đầu trước khi tìm và trả về đúng kết quả như khi gõ '
     'từ khoá không có khoảng trắng.', ('o_tim_khoang_trang', 'o_tim_kiem_nhap')),
    ('TÌM KIẾM & LỌC LOẠI NGUỒN', 'Textbox Tìm kiếm',
     'Kiểm tra để trống ô Tìm kiếm',
     '1. Gõ từ khoá để lọc danh sách.\n2. Xoá hết nội dung trong ô "Tìm kiếm".',
     'Ô tìm kiếm không bắt buộc. Khi ô trống, danh sách trở lại đầy đủ như trước khi tìm.',
     ('o_tim_de_trong', 'o_tim_kiem_nhap')),
    ('TÌM KIẾM & LỌC LOẠI NGUỒN', 'Textbox Tìm kiếm',
     'Kiểm tra ô Tìm kiếm nhập hoa, thường',
     '1. Gõ vào ô "Tìm kiếm" một phần của mã đang có, lần lượt bằng chữ thường rồi chữ HOA.',
     'Hai lần gõ cho cùng một kết quả: lọc không phân biệt chữ hoa chữ thường.',
     'o_tim_hoa_thuong'),
    ('THÊM MỚI LOẠI NGUỒN', 'Textarea Mô tả', 'Kiểm tra giá trị mặc định Mô tả',
     '1. Bấm nút "+ Thêm loại nguồn".\n2. Quan sát ô "Mô tả".',
     'Ô "Mô tả" là khung nhập nhiều dòng, trống, chữ gợi ý "Mô tả ngắn về loại nguồn này".',
     'truong_mac_dinh'),
    ('THÊM MỚI LOẠI NGUỒN', 'Textarea Mô tả', 'Kiểm tra Mô tả nhập tiếng Việt có dấu',
     '1. Nhập "Mô tả" bằng tiếng Việt có dấu.',
     '1. Dữ liệu của trường được hiển thị bình thường', 'truong_nhap_gia_tri'),
    ('THÊM MỚI LOẠI NGUỒN', 'Textarea Mô tả', 'Kiểm tra copy dữ liệu dán vào ô Mô tả',
     '1. Sao chép một đoạn chữ từ nơi khác, dán vào ô "Mô tả".',
     'Dán thành công, chữ hiển thị bình thường, không lỗi phông.', 'truong_nhap_gia_tri'),
    ('THÊM MỚI LOẠI NGUỒN', 'Datepicker Ngày bắt đầu',
     'Kiểm tra giá trị mặc định của Ngày bắt đầu',
     '1. Bấm nút "+ Thêm loại nguồn".\n2. Quan sát ô "Ngày bắt đầu".',
     'Mặc định là trống, hiện khuôn ngày/tháng/năm của trình duyệt kèm biểu tượng lịch ở '
     'cuối ô.', 'ngay_mac_dinh'),
    ('THÊM MỚI LOẠI NGUỒN', 'Datepicker Ngày bắt đầu',
     'Kiểm tra gõ ký tự lạ vào Ngày bắt đầu',
     '1. Đặt con trỏ vào ô "Ngày bắt đầu".\n2. Gõ chữ cái và ký tự đặc biệt.',
     'Ô ngày của trình duyệt chỉ nhận chữ số, các ký tự khác không vào được ô.',
     'ngay_go_ky_tu'),
    ('THÊM MỚI LOẠI NGUỒN', 'Datepicker Ngày bắt đầu',
     'Kiểm tra bảng lịch của trình duyệt ở Ngày bắt đầu',
     '1. Bấm vào biểu tượng lịch ở cuối ô "Ngày bắt đầu".',
     'Bảng lịch của trình duyệt mở ra ngay dưới ô, hiện tháng hiện tại.', 'ngay_hop_lich'),
    ('THÊM MỚI LOẠI NGUỒN', 'Switch Đang hoạt động',
     'Kiểm tra giá trị mặc định Switch Đang hoạt động',
     '1. Bấm nút "+ Thêm loại nguồn".\n2. Quan sát ô "Đang hoạt động".',
     'Mặc định là không tích chọn checkbox', 'o_tich_mac_dinh'),
    ('THÊM MỚI LOẠI NGUỒN', 'Switch Đang hoạt động',
     'Kiểm tra tích chọn Switch Đang hoạt động',
     '1. Tích chọn ô "Đang hoạt động".', 'Checkbox được tích chọn', 'o_tich_thao_tac'),
    ('THÊM MỚI LOẠI NGUỒN', 'Switch Đang hoạt động',
     'Kiểm tra bỏ tích chọn Switch Đang hoạt động',
     '1. Bỏ tích ô "Đang hoạt động".', 'Checkbox được bỏ tích chọn', 'o_tich_thao_tac'),
    ('CHUYỂN TRẠNG THÁI LOẠI NGUỒN', 'Chức năng Chuyển trạng thái',
     'Kiểm tra việc hủy bỏ thao tác chuyển trạng thái',
     '1. Bấm biểu tượng chuyển trạng thái trên một bản ghi.\n'
     '2. Bấm "Hủy" trong hộp xác nhận.',
     'Hủy bỏ thành công; trạng thái của bản ghi không thay đổi trên danh sách.',
     'chuyen_trang_thai_huy'),
    ('CHUYỂN TRẠNG THÁI LOẠI NGUỒN', 'Chức năng Chuyển trạng thái',
     'Kiểm tra click icon đóng trên hộp xác nhận chuyển trạng thái',
     '1. Bấm biểu tượng X để đóng hộp xác nhận chuyển trạng thái.',
     '1. Hộp thoại được đóng lại, màn hình giữ nguyên.\n2. Trạng thái bản ghi không thay đổi.',
     'chuyen_trang_thai_huy'),
    ('CHUYỂN TRẠNG THÁI LOẠI NGUỒN', 'Chức năng Chuyển trạng thái',
     'Kiểm tra chuyển trạng thái thành công',
     '1. Bấm biểu tượng chuyển trạng thái trên một bản ghi đang Hoạt động.\n'
     '2. Bấm "Chuyển trạng thái" trong hộp xác nhận.',
     '1. Thông báo chuyển trạng thái thành công.\n2. Cột Trạng thái của bản ghi đó đổi.',
     'chuyen_trang_thai_that'),
    ('DANH SÁCH LOẠI NGUỒN', 'An toàn thông tin',
     'Truy cập màn bằng tài khoản khác vai trò',
     '1. Đăng nhập tài khoản KHÁC vai trò.\n2. Mở thẳng màn loại nguồn.',
     'Ghi lại nguyên trạng. Nếu bị chặn, hệ thống hiện "Không đủ quyền truy cập" và không để '
     'lộ dữ liệu loại nguồn.', 'attt_vai_tro_khac'),
    ('DANH SÁCH LOẠI NGUỒN', 'An toàn thông tin',
     'Ngoại lệ: tài khoản được cấp đúng quyền vẫn vào được',
     '1. Đăng nhập tài khoản đã thật sự được cấp đúng quyền.\n2. Mở màn.',
     'Vẫn vào xem được bình thường; không bị chặn nhầm.', 'attt_dung_quyen_van_vao_duoc'),
    ('DANH SÁCH LOẠI NGUỒN', 'An toàn thông tin',
     'Can thiệp tham số để lấy dữ liệu ngoài phạm vi',
     '1. Sửa trực tiếp mã định danh trên đường dẫn để trỏ tới bản ghi ngoài phạm vi.',
     'Hệ thống bỏ qua hoặc chặn: vẫn chỉ trả về dữ liệu thuộc phạm vi được phân công.',
     'attt_idor'),
    ('DANH SÁCH LOẠI NGUỒN', 'An toàn thông tin', 'Thao tác khi token không hợp lệ',
     '1. Gọi màn với token không hợp lệ.\n2. Quan sát.',
     'Thông báo: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." và người dùng phải '
     'đăng nhập lại.', 'attt_khong_token'),
]


def ho_so():
    """Hồ sơ màn khớp app giả SAU KHI mở rộng — nguồn kỳ vọng của mọi phép trong bộ này."""
    import copy
    import kiem_qa_data as kq
    hs = copy.deepcopy(kq.HO_SO)
    g = hs['grounding']
    g['api'] = list(g['api']) + ['GET  /api/items/{id}']
    g['verbatim']['icon_ban_ghi'] = ['Kích hoạt', 'Ngừng hoạt động', 'Chỉnh sửa', 'Xóa']
    g['verbatim']['toast_chuyen_trang_thai'] = 'Chuyển trạng thái thành công'
    g['verbatim']['het_phien'] = ('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    f = g['verbatim']['form_them']
    f['nhan_o'] = ['Code', 'Tên hiển thị', 'Trạng thái', 'Mô tả', 'Ngày bắt đầu',
                   'Đang hoạt động', 'Tệp đính kèm']
    f['o_bat_buoc'] = ['Code', 'Tên hiển thị']
    f['placeholder_mo_ta'] = 'Mô tả ngắn về loại nguồn này'
    g['hang_so'].update({'mo_ta_max_dom': 250})
    g['verbatim']['loi_validate']['mo_ta_rong'] = 'Vui lòng nhập mô tả'
    return hs


def dung_bo_case(goc, role='ChuyenVien', man='LoaiNguon'):
    import tcfix
    d_tc = os.path.join(goc, role, 'testcase')
    d_hs = os.path.join(goc, role, 'ho-so-man')
    os.makedirs(d_tc, exist_ok=True)
    os.makedirs(d_hs, exist_ok=True)
    src = os.path.join(d_tc, 'Testcase-Role-%s-%s.xlsx' % (role, man))
    shutil.copy(NEN, src)
    tc = tcfix.load(src)
    pl = tcfix.Plan(tc)
    cn_cu = None
    for cn, sub2, b, c, d, _ in CASES:
        if cn != cn_cu:
            pl.add_cn('%s\n1. Vào hệ thống > Đăng nhập tài khoản Chuyên viên\n'
                      '2. Vào màn Loại nguồn' % cn)
            pl.add_grp('Chức năng' if 'Chức năng' in sub2 else 'Giao diện')
            pl.add_sub('Validate các trường thông tin')
            cn_cu = cn
        pl.add_sub2(sub2)
        pl.case(b, c, d)
    tc.rebuild(pl).save(quiet=True, sync=False)
    json.dump(ho_so(), open(os.path.join(d_hs, os.path.basename(src).replace('.xlsx', '.json')),
                            'w', encoding='utf-8'), ensure_ascii=False)
    return src


def moi_truong(goc, base):
    import cach_ly
    e = cach_ly.moi_truong_sach(goc)
    e.update({'QA_PROJECT': 'moetdl', 'QA_TESTCASE_DIR': goc,
              'QA_SESSION_DIR': os.path.join(goc, '_phien'),
              'QA_HOME_PREFIX': '/admin', 'QA_LOGIN_PATH': '/login',
              'QA_AUTH_ENDPOINTS': '/api/login',
              'QA_USER': TK_A[0], 'QA_PASS': TK_A[1],
              # vai trò đối chứng cho lớp ATTT — chỉ trong biến môi trường
              'QA_ROLE_B': 'VaiTroKhac',
              'QA_USER_VAITROKHAC': TK_B[0], 'QA_PASS_VAITROKHAC': TK_B[1],
              'QA_ROLE_A': 'ChuyenVien',
              'QA_BAK_DIR': os.path.join(goc, '_bak')})
    return e


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--giu', action='store_true', help='giữ thư mục tạm để soi')
    a = ap.parse_args()

    import app_gia_crud as ag
    srv = ag.chay(0)
    port = srv.server_address[1]
    base = 'http://127.0.0.1:%d' % port
    goc = tempfile.mkdtemp(prefix='kiem-phep-moi-')
    print('TỰ KIỂM BỘ PHÉP MỚI — chạy TRỌN đường `chay_live.py`')
    print('   app giả: %s  ·  thư mục tạm: %s' % (base, goc))
    if not shutil.which('google-chrome') and not shutil.which('chromium'):
        print('   ⚠ KHÔNG có Chrome — bộ kiểm này không chạy được, KHÔNG tính là đạt.')
        return 2

    src = dung_bo_case(goc)
    p_hs = os.path.join(goc, 'ChuyenVien', 'ho-so-man',
                        os.path.basename(src).replace('.xlsx', '.json'))
    hs = json.load(open(p_hs, encoding='utf-8'))
    hs['url'] = [base + '/admin/loai-nguon']
    json.dump(hs, open(p_hs, 'w', encoding='utf-8'), ensure_ascii=False)
    env = moi_truong(goc, base)
    subprocess.run([sys.executable, os.path.join(TOOLS, 'ket_qua.py'), 'ChuyenVien',
                    'LoaiNguon', '--create', '--apply'],
                   capture_output=True, text=True, timeout=600, env=env)

    t0 = time.time()
    # KHÔNG truyền `--cho-phep-ghi`: từ 16/09 lượt 2 chế độ mặc định là TỰ ĐỘNG và bảng
    # chính sách tự quyết `ALLOW_QA_WRITE`. Bỏ cờ đi chính là phép thử của điều đó — case
    # GHI vẫn phải chạy, và mọi mutation vẫn phải qua guard.
    r = subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py'), 'ChuyenVien',
                        'LoaiNguon', '--apply', '--session', 'kiem-phep-moi'],
                       capture_output=True, text=True, timeout=1800, env=env)
    ra = (r.stdout or '') + (r.stderr or '')
    print('   lượt chạy: %.0f giây, mã thoát %d' % (time.time() - t0, r.returncode))

    d_ph = os.path.join(goc, '_phien', 'kiem-phep-moi')
    cases = {}
    p_cases = os.path.join(d_ph, 'result', 'cases.json')
    if os.path.exists(p_cases):
        cases = json.load(open(p_cases, encoding='utf-8'))
    tt = (cases.get('cases') if isinstance(cases, dict) and 'cases' in cases else cases) or {}

    loi = []
    # ⓿ chế độ tự động phải THẬT SỰ tự quyết — không có dòng này thì lượt chạy đã đi bằng
    #    một cờ do người truyền, và bài kiểm không chứng minh được gì về non-interactive.
    if '[AUTO-CONFIRM] decision=ALLOW_QA_WRITE' not in ra:
        loi.append('không thấy quyết định tự động ALLOW_QA_WRITE trong log')
    if 'TỰ ĐỘNG — không hỏi' not in ra:
        loi.append('lượt chạy không ở chế độ tự động')
    # ① lượt chạy phải đi tới cuối
    if r.returncode != 0:
        loi.append('chay_live thoát mã %d:\n%s' % (r.returncode, ra[-1800:]))
    # ② KHÔNG case nào rơi vào lớp LỖI (đó là lỗi của tool, không phải kết luận nghiệp vụ)
    hong = [k for k, v in tt.items() if (v or {}).get('tt') == 'LOI']
    if hong:
        chi = [((tt[k] or {}).get('ly_do') or '')[:200] for k in hong[:4]]
        loi.append('%d case rơi vào lớp LỖI: %s' % (len(hong), ' | '.join(chi)))
    # ③ mỗi phép mới phải THẬT SỰ chạy ít nhất một lần
    # Mỗi case khai MỘT HOẶC NHIỀU phép chấp nhận được: phép chuyên biệt cũ kết luận đúng
    # thì phép tổng quát mới không cần chạy — đó chính là thứ tự ưu tiên "chuyên biệt trước,
    # tổng quát sau" đang hoạt động, không phải một phép bị bỏ quên.
    da_chay = {(v or {}).get('phep') for v in tt.values() if (v or {}).get('phep')}
    thieu = []
    for x in CASES:
        ten = x[5] if isinstance(x[5], (tuple, list)) else (x[5],)
        if not (set(ten) & da_chay):
            thieu.append(' hoặc '.join(ten))
    if thieu:
        loi.append('phép KHÔNG chạy lần nào: %s' % ' · '.join(sorted(set(thieu))))
    # ④ phải có kết luận cho phần lớn case
    co_mark = [k for k, v in tt.items() if (v or {}).get('mark')]
    if len(co_mark) < len(CASES) * 0.6:
        loi.append('chỉ %d/%d case có kết luận (dưới 60%%)' % (len(co_mark), len(CASES)))
    # ④-bis SỔ QUYẾT ĐỊNH: lượt chạy tự động phải để lại bằng chứng về thứ nó tự quyết,
    #       và sổ ấy không được mang bí mật nào.
    p_qd = os.path.join(d_ph, 'evidence', 'quyet-dinh.json')
    if not os.path.exists(p_qd):
        loi.append('KHÔNG có evidence/quyet-dinh.json — lượt tự động không ghi lại quyết định')
    else:
        qd = json.load(open(p_qd, encoding='utf-8'))
        if not qd.get('non_interactive'):
            loi.append('sổ quyết định nói lượt chạy KHÔNG ở chế độ tự động')
        if 'ALLOW_QA_WRITE' not in (qd.get('theo_quyet_dinh') or {}):
            loi.append('sổ quyết định thiếu ALLOW_QA_WRITE: %s' % qd.get('theo_quyet_dinh'))
        sq = json.dumps(qd, ensure_ascii=False)
        for k in (TK_A[1], TK_B[1], TK_A[0], 'Authorization', 'eyJ'):
            if k in sq:
                loi.append('SỔ QUYẾT ĐỊNH lộ %r' % k)
    # ⑤ sổ mạng: 0 WRITE, 0 UNKNOWN
    p_mang = os.path.join(d_ph, 'evidence', 'mang.json')
    if os.path.exists(p_mang):
        so = json.load(open(p_mang, encoding='utf-8'))
        ds = so.get('so') if isinstance(so, dict) else so
        vp = [x for x in (ds or []) if x.get('loai') in ('WRITE', 'UNKNOWN')]
        if vp:
            loi.append('sổ mạng có %d vi phạm: %s' % (len(vp), vp[:2]))
    # ⑥ dữ liệu QA dọn sạch + dữ liệu THẬT nguyên vẹn
    p_so = os.path.join(d_ph, 'qa-data', 'so.json')
    if os.path.exists(p_so):
        s = json.load(open(p_so, encoding='utf-8'))
        con = [m for m in (s.get('muc') or {}).values() if m.get('trang_thai') == 'CON_SONG']
        if con:
            loi.append('%d bản ghi QA CHƯA dọn: %s' % (len(con), [m['ma'] for m in con][:4]))
    import urllib.request
    rq = urllib.request.Request(base + '/api/items')
    rq.add_header('Cookie', 'phien=%s' % TK_A[0])
    ds_that = json.load(urllib.request.urlopen(rq, timeout=5))['items']
    goc_that = [x for x in ds_that if x['code'].startswith('nguon_that_')]
    if len(goc_that) != 25:
        loi.append('dữ liệu THẬT không nguyên vẹn: còn %d/25 bản ghi' % len(goc_that))
    con_qa = [x for x in ds_that if x['code'].startswith('zzqa')]
    if con_qa:
        loi.append('app còn %d bản ghi QA: %s' % (len(con_qa), [x['code'] for x in con_qa][:4]))
    # ⑦ Excel: công thức sạch
    fkq = os.path.join(goc, 'ChuyenVien', 'ket-qua-test',
                       'Testcase-Role-ChuyenVien-LoaiNguon_ket_qua.xlsx')
    fl = subprocess.run([sys.executable, os.path.join(TOOLS, 'formula_layer.py'), '--check', fkq],
                        capture_output=True, text=True, env=env)
    # `--check` in ra một BẢNG, không phải chuỗi `A-sai 0`. Đọc bảng: cột A-sai và R-sai phải
    # bằng 0. Bản đầu tìm chuỗi nên báo đỏ OAN cho một file sạch — đúng lớp "phép rà nói dối"
    # mà chính bộ kiểm này sinh ra để chặn.
    dong_kq = [x for x in (fl.stdout or '').splitlines() if os.path.basename(fkq)[:28] in x]
    if not dong_kq:
        loi.append('formula_layer --check không in dòng nào cho file: %s'
                   % (fl.stdout or fl.stderr)[-300:])
    else:
        so = re.findall(r'-?\d+', dong_kq[0].split('.xlsx')[-1])
        # thứ tự cột: case · A-ct · A-chay · A-sai · R-ct · R-chay · R-sai
        if len(so) < 7 or so[3] != '0' or so[6] != '0':
            loi.append('formula_layer --check KHÔNG sạch: %s' % dong_kq[0].strip())
    # ⑧ bí mật
    bi_mat = []
    for thu_muc in (d_ph,):
        for r2, _, fs in os.walk(thu_muc):
            if 'chrome' in r2:
                continue
            for f in fs:
                if not f.endswith(('.json', '.md', '.log', '.txt')):
                    continue
                try:
                    noi = open(os.path.join(r2, f), encoding='utf-8', errors='ignore').read()
                except Exception:
                    continue
                for k in ('matkhau-QA', 'matkhau-XEM', 'Authorization', 'eyJ'):
                    if k in noi:
                        bi_mat.append('%s: %s' % (os.path.join(r2, f)[-60:], k))
    if bi_mat:
        loi.append('LỌT BÍ MẬT: %s' % ' | '.join(bi_mat[:4]))

    # ── báo cáo ───────────────────────────────────────────────────────────────
    dem = {}
    for v in tt.values():
        dem[(v or {}).get('mark') or (v or {}).get('tt')] = \
            dem.get((v or {}).get('mark') or (v or {}).get('tt'), 0) + 1
    print('   %d case: %s' % (len(tt), ' · '.join('%s=%d' % x for x in sorted(dem.items(),
                                                                             key=lambda y: str(y[0])))))
    print('   phép đã chạy (%d): %s' % (len(da_chay), ' · '.join(sorted(da_chay))))
    for k, v in sorted(tt.items()):
        if (v or {}).get('mark'):
            print('      %-30s %-3s %s' % ((v.get('phep') or '-')[:30], v['mark'],
                                           (v.get('note') or '')[:96].replace('\n', ' ')))
    if loi:
        print('\n   ✘ HỎNG %d:' % len(loi))
        for x in loi:
            print('      - %s' % x)
        print('   (giữ thư mục tạm: %s)' % goc)
        srv.shutdown()
        return 1
    print('\n   ✔ ĐẠT: %d phép mới chạy thật, 0 case LỖI, dữ liệu QA dọn sạch, dữ liệu thật '
          'nguyên vẹn 25/25, sổ mạng sạch, Excel sạch, 0 bí mật.' % len(da_chay))
    srv.shutdown()
    if not a.giu:
        shutil.rmtree(goc, ignore_errors=True)
    else:
        print('   (giữ thư mục tạm: %s)' % goc)
    return 0


if __name__ == '__main__':
    sys.exit(main())

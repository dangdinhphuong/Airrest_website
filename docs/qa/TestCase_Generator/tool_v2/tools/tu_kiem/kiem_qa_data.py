#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM VÒNG ĐỜI DỮ LIỆU QA — lớp GHI của `chay_live.py`  (mới 2026-09-15 lượt 4).

Đây là bộ kiểm của phần đắt nhất trong cả tool: phần **được phép thay đổi dữ liệu trên app
thật**. Mọi phép dưới đây chạy trên `app_gia_crud.py` (CRUD thật, có tenant, có sẵn bản ghi
KHÔNG mang dấu QA) trong thư mục tạm — không đụng bộ case, không đụng `sessions/`, không cần
tài khoản thật.

Mười tình huống §17 của chỉ thị, mỗi tình huống một phép:

    ① tạo QA record -> sửa -> xoá thành công        ⑥ cleanup idempotent
    ② cố sửa bản ghi KHÔNG có dấu QA -> BLOCK       ⑦ DELETE thật ngoài QA scope -> BLOCK
    ③ cố xoá bản ghi KHÔNG có dấu QA -> BLOCK       ⑧ WRITE thật ngoài QA scope -> BLOCK
    ④ bản ghi của tenant/chủ khác -> BLOCK          ⑨ resume sau khi đã tạo dữ liệu QA
    ⑤ cleanup sau exception                        ⑩ không lọt bí mật vào evidence

Phép ①⑤⑥⑨⑩ chạy THẬT qua Chrome (không có Chrome thì BỎ QUA và nói rõ là *không đo được*,
không bao giờ tự nhận là đạt). Phép ②③④⑦⑧ là phép chặn — chạy ở tầng luật nên luôn chạy được.

    python3 tools/tu_kiem/kiem_qa_data.py           # exit 0 = đạt hết
    python3 tools/tu_kiem/kiem_qa_data.py --nhanh   # bỏ phép cần Chrome
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
TK = ('qa@gia.vn', 'matkhau-QA')
TK_KHAC = ('khac@gia.vn', 'matkhau-KHAC')
KQ = []


def kiem(ten, can_chrome=False):
    def deco(f):
        KQ.append((ten, f, can_chrome))
        return f
    return deco


def _in(ten, ok, ghi_chu='', bo_qua=False):
    print('   %s %-58s %s' % ('–' if bo_qua else ('✔' if ok else '✘'), ten, ghi_chu))


# ══════════════════════════════════════════════════════════════════════════════
# FIXTURE — bộ case + hồ sơ màn khớp ĐÚNG `app_gia_crud.py`
# ══════════════════════════════════════════════════════════════════════════════
# Mỗi case ở đây là một case THẬT của bộ `LoaiNguon` (chép nguyên lời văn), nên phép nào nhận
# case nào là đúng bằng lúc chạy trên app thật.
CASES = [
    # (khối CN, nhóm con, mục đích B, các bước C, kết quả mong muốn D)
    ('DANH SÁCH', 'Danh sách loại nguồn', 'Kiểm tra tiêu đề cột của loại nguồn',
     '1. Đối chiếu tiêu đề từng cột.',
     'Bảng hiện đúng các cột, đúng thứ tự: STT · Code · Tên hiển thị · Trạng thái · Ngày tạo · '
     'Hành động.'),
    ('DANH SÁCH', 'Danh sách loại nguồn', 'Kiểm tra loại nguồn khi không có dữ liệu',
     '1. Nhập vào ô tìm kiếm một từ khoá (từ 3 ký tự) chắc chắn không khớp bản ghi nào.',
     'Bảng hiện dòng chữ "Không có loại nguồn khớp bộ lọc".'),
    ('TÌM KIẾM & LỌC', 'Textbox Tìm kiếm', 'Kiểm tra tìm kiếm khớp 100% dữ liệu',
     '1. Nhập đúng toàn bộ mã của một bản ghi.', 'Trả về đúng bản ghi đó.'),
    ('THÊM MỚI', 'Textbox Code', 'Kiểm tra Code là trường bắt buộc',
     '1. Để trống ô "Code".\n2. Các thông tin khác nhập hợp lệ.\n3. Bấm nút "Tạo loại nguồn".',
     '1. Thông báo lỗi "Vui lòng nhập mã"\n2. Highlight, focus vào trường lỗi'),
    ('THÊM MỚI', 'Textbox Code', 'Kiểm tra dữ liệu đã tồn tại',
     '1. Nhập vào ô "Code" một mã đã có trong danh sách.\n2. Bấm nút "Tạo loại nguồn".',
     'Không tạo thêm bản ghi trùng mã. Tổng số bản ghi không đổi.'),
    ('THÊM MỚI', 'Textbox Code', 'XSS (Kiểm tra lỗi khi nhập Script HTML)',
     '1. Nhập đoạn script vào ô "Code".\n2. Bấm nút "Tạo loại nguồn".',
     'Không thực thi script.'),
    ('THÊM MỚI', 'Chức năng Thêm mới', 'Kiểm tra lưu thành công khi chỉ nhập các trường bắt buộc',
     '1. Nhập đủ trường bắt buộc.\n2. Bấm nút "Tạo loại nguồn".',
     'Lưu thành công, hiện thông báo "Thêm loại nguồn thành công".'),
    # Ca này bắt đúng lớp lỗi đã làm dừng lượt chạy 297 case ngày 15/09: validate trong biểu
    # mẫu CHỈNH SỬA sinh `PUT`, không phải `POST` — cửa sổ ghi phải khai đúng hành động `sua`.
    ('CHỈNH SỬA', 'Textbox Tên hiển thị', 'Kiểm tra Tên hiển thị là trường bắt buộc',
     '1. Để trống ô "Tên hiển thị".\n2. Bấm nút "Lưu thay đổi".',
     '1. Thông báo lỗi "Vui lòng nhập tên hiển thị"\n2. Highlight, focus vào trường lỗi'),
    ('CHỈNH SỬA', 'Chức năng Chỉnh sửa', 'Kiểm tra cập nhật thành công khi chỉ sửa các trường bắt buộc',
     '1. Sửa tên hiển thị.\n2. Bấm nút "Lưu thay đổi".',
     'Cập nhật thành công, hiện thông báo "Cập nhật loại nguồn thành công".'),
    ('XÓA', 'Hộp xác nhận Xóa loại nguồn', 'Kiểm tra nội dung Hộp xác nhận Xóa loại nguồn',
     '1. Bấm icon Xóa trên một bản ghi.', 'Hộp xác nhận hiện đúng nội dung.'),
    ('XÓA', 'Chức năng Xóa', 'Xóa thành công bản ghi chưa được sử dụng',
     '1. Bấm icon Xóa.\n2. Bấm nút "Xóa" trên hộp xác nhận.',
     'Bản ghi bị xóa khỏi danh sách, hiện thông báo "Xóa loại nguồn thành công".'),
    ('XÓA', 'Chức năng Xóa', 'Kiểm tra việc hủy bỏ thao tác xóa',
     '1. Bấm icon Xóa.\n2. Bấm nút "Hủy".', 'Bản ghi không bị xóa.'),
    ('XÓA', 'Chức năng Xóa', 'Kiểm tra click liên tục vào button Xóa',
     '1. Bấm icon Xóa.\n2. Bấm liên tục nút "Xóa".', 'Chỉ gửi một yêu cầu xóa.'),
]

HO_SO = {
    'title': 'Loại nguồn', 'prefix': 'LoaiNguon',
    'nav': ['Quản lý khai báo', 'Loại nguồn'],
    'grounding': {
        'api': ['GET  /api/items', 'POST /api/items', 'PUT  /api/items/{id}',
                'DEL  /api/items/{id}', 'GET  /api/items:export'],
        'khong_co': [],
        'hang_so': {'page_size_mac_dinh': 20, 'page_size_chon_nhanh': [20, 50, 100, 200, 500],
                    'page_size_toi_da': 1000, 'tim_kiem_min_ky_tu': 3,
                    'tim_kiem_debounce_ms': 1500, 'code_regex': '^[a-z0-9_]+$',
                    'code_max_validate': 32, 'code_max_dom': 250,
                    'title_max_validate': 100, 'title_max_dom': 250},
        'verbatim': {
            'tieu_de_man': 'Loại nguồn',
            'the_so_lieu': ['TỔNG NGUỒN', 'ĐANG HOẠT ĐỘNG', 'KHÔNG HOẠT ĐỘNG / LƯU TRỮ'],
            'nut_dau_man': ['Xuất Excel', '+ Thêm loại nguồn'],
            'placeholder_tim': 'Tìm kiếm theo mã, tên hiển thị...',
            'tooltip_lam_moi': 'Làm mới dữ liệu', 'toast_lam_moi': 'Đã làm mới',
            'cot_bang': ['STT', 'Code', 'Tên hiển thị', 'Trạng thái', 'Ngày tạo', 'Hành động'],
            'badge_trang_thai': ['Đang hoạt động', 'Không hoạt động', 'Đã lưu trữ'],
            'icon_ban_ghi': ['Chỉnh sửa', 'Xóa'],
            'rong_khong_du_lieu': 'Chưa có loại nguồn nào',
            'rong_co_loc': 'Không có loại nguồn khớp bộ lọc',
            'thanh_hang_loat': ['Đã chọn {N} mục', 'Xóa tất cả', 'Bỏ chọn'],
            'form_them': {'tieu_de': 'Thêm loại nguồn mới',
                          'nhan_o': ['Code', 'Tên hiển thị', 'Trạng thái'],
                          'tuy_chon_trang_thai': ['Đang hoạt động', 'Không hoạt động',
                                                  'Đã lưu trữ'],
                          'nut': ['Hủy', 'Tạo loại nguồn'],
                          'toast_thanh_cong': 'Thêm loại nguồn thành công'},
            'form_sua': {'tieu_de': 'Chỉnh sửa: {tên hiển thị}',
                         'nut': ['Hủy', 'Lưu thay đổi'],
                         'toast_thanh_cong': 'Cập nhật loại nguồn thành công'},
            'loi_validate': {'code_rong': 'Vui lòng nhập mã',
                             'code_sai_dinh_dang': 'Chỉ dùng chữ thường, số và dấu _',
                             'code_qua_dai': 'Tối đa 32 ký tự',
                             'ten_rong': 'Vui lòng nhập tên hiển thị',
                             'ten_qua_dai': 'Tối đa 100 ký tự'},
            'xoa_don_le': {'tieu_de': 'Xóa loại nguồn?',
                           'mo_ta': 'Bạn chắc chắn muốn xóa “{tên hiển thị}”? Hành động này '
                                    'không thể hoàn tác.',
                           'nut': ['Hủy', 'Xóa'],
                           'toast_thanh_cong': 'Xóa loại nguồn thành công'},
            'xoa_hang_loat': {'tieu_de': 'Xóa {N} loại nguồn đã chọn?',
                              'mo_ta': 'Hành động này không thể hoàn tác.',
                              'nut_xac_nhan': 'Xóa', 'nut': ['Huỷ', 'Xóa'],
                              'toast_thanh_cong': 'Đã xóa {N} mục'},
            'xuat_excel': {'ten_file_mac_dinh': 'danh_sach_loai_nguon.xlsx',
                           'toast_thanh_cong': 'Xuất Excel thành công'},
            'chua_dang_nhap': 'Bạn cần đăng nhập để truy cập trang này. Vui lòng đăng nhập bằng '
                              'tài khoản của bạn để tiếp tục.',
            'het_phien': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        },
    },
}


def dung_bo_case(goc, man='LoaiNguon', role='ChuyenVien'):
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
    for cn, sub2, b, c, d in CASES:
        if cn != cn_cu:
            pl.add_cn('%s LOẠI NGUỒN\n1. Vào hệ thống > Đăng nhập tài khoản Chuyên viên\n'
                      '2. Vào màn Loại nguồn' % cn)
            pl.add_grp('Chức năng' if 'Chức năng' in sub2 or 'Hộp' in sub2 else 'Giao diện')
            pl.add_sub('Validate các trường thông tin')
            cn_cu = cn
        pl.add_sub2(sub2)
        pl.case(b, c, d)
    tc.rebuild(pl).save(quiet=True, sync=False)
    hs = json.loads(json.dumps(HO_SO))
    json.dump(hs, open(os.path.join(d_hs, os.path.basename(src).replace('.xlsx', '.json')), 'w',
                       encoding='utf-8'), ensure_ascii=False)
    return src


def dat_url(goc, url, man='LoaiNguon', role='ChuyenVien'):
    p = os.path.join(goc, role, 'ho-so-man', 'Testcase-Role-%s-%s.json' % (role, man))
    x = json.load(open(p, encoding='utf-8'))
    x['url'] = [url]
    json.dump(x, open(p, 'w', encoding='utf-8'), ensure_ascii=False)


def moi_truong(goc, tk=TK):
    """Môi trường cho một tiến trình chạy live trong bộ tự kiểm — CÁCH LY khỏi máy người chạy.

    ⚠️ VÁ 2026-09-17 lượt 2. Bản trước chép nguyên `os.environ` rồi chỉ ĐÈ vài khoá. Sau khi
    lớp tài khoản đổi sang khuôn `ROLE_*` + tệp env ngoài repo, phép chép ấy kéo theo cả tài
    khoản THẬT của người chạy: bộ kiểm dựng kịch bản *"thiếu tài khoản"* mà tiến trình con vẫn
    đăng nhập được, nên ⑳ của `kiem_auto_confirm` và F4 của `kiem_chay_live` hỏng — hỏng trên
    máy đã cắm credential, ĐẠT trên máy chưa cắm, cùng một mã nguồn.

    Xoá mọi khoá tài khoản rồi trỏ `TOOLV2_ENV_FILE` vào tệp không tồn tại: lớp tài khoản khi
    có khai báo thì chỉ xét đúng tệp ấy, không rơi về `~/.config/tool_v2/accounts.env`.
    """
    import cach_ly
    e = cach_ly.moi_truong_sach(goc)
    e.update({'QA_PROJECT': 'moetdl', 'QA_TESTCASE_DIR': goc,
              'QA_SESSION_DIR': os.path.join(goc, '_phien'),
              'QA_HOME_PREFIX': '/admin', 'QA_LOGIN_PATH': '/login',
              'QA_AUTH_ENDPOINTS': '/api/login',
              'QA_USER': tk[0], 'QA_PASS': tk[1],
              'QA_BAK_DIR': os.path.join(goc, '_bak')})
    return e


def chay(args, goc, giay=900, tk=TK):
    return subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py')] + args,
                          capture_output=True, text=True, timeout=giay, env=moi_truong(goc, tk))


def tao_ket_qua(goc, man='LoaiNguon'):
    return subprocess.run([sys.executable, os.path.join(TOOLS, 'ket_qua.py'), 'ChuyenVien', man,
                           '--create', '--apply'],
                          capture_output=True, text=True, timeout=600, env=moi_truong(goc))


def f_kq(goc, man='LoaiNguon', role='ChuyenVien'):
    return os.path.join(goc, role, 'ket-qua-test',
                        'Testcase-Role-%s-%s_ket_qua.xlsx' % (role, man))


def d_phien(goc, sid='live-ChuyenVien-LoaiNguon'):
    return os.path.join(goc, '_phien', sid)


def so_qa(goc, sid='live-ChuyenVien-LoaiNguon'):
    p = os.path.join(d_phien(goc, sid), 'qa-data', 'so.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None


# ══════════════════════════════════════════════════════════════════════════════
# A. PHÉP CHẶN — chạy ở tầng luật, không cần Chrome
# ══════════════════════════════════════════════════════════════════════════════
def _so_moi(goc, tk=TK, run=None):
    import qa_data
    import qalib
    d = os.path.join(goc, 'so-%d.json' % time.time_ns())
    return qa_data.SoQA(d, run_id=run or qalib.qa_run_id(), tai_khoan=tk[0],
                        origin='http://127.0.0.1:9', thuc_the='LoaiNguon')


@kiem('② cố SỬA bản ghi không mang dấu QA -> BLOCK')
def b2(goc, _app):
    import chay_live as cl
    import qa_data
    so = _so_moi(goc)
    cong = cl.Cong(cho_phep_ghi=True, so=so)
    for ma in ('nguon_that_01', 'loai_nguon_1', '42', ''):
        try:
            cong.ghi(ma, 'sửa', nhan=ma)
        except (cl.ChanAnToan, qa_data.LoiSoQA):
            continue
        raise AssertionError('bản ghi %r KHÔNG mang dấu QA mà vẫn được phép sửa' % ma)
    return 'chặn 4/4 mã thật'


@kiem('③ cố XOÁ bản ghi không mang dấu QA -> BLOCK')
def b3(goc, _app):
    import chay_live as cl
    import qa_data
    so = _so_moi(goc)
    # ngay cả khi người chạy nhét mã thật vào --whitelist: mã không mang dấu QA vẫn bị chặn
    cong = cl.Cong(cho_phep_ghi=True, whitelist=['nguon_that_01'], so=so)
    try:
        cong.ghi('nguon_that_01', 'xoá', nhan='nguon_that_01')
    except (cl.ChanAnToan, qa_data.LoiSoQA):
        return 'chặn cả khi mã thật nằm trong --whitelist'
    raise AssertionError('whitelist mở đường cho bản ghi KHÔNG mang dấu QA')


@kiem('④ bản ghi của CHỦ khác (tenant/tài khoản khác) -> BLOCK')
def b4(goc, _app):
    import qa_data
    import qalib
    run = qalib.qa_run_id()
    p = os.path.join(goc, 'so-tenant.json')
    so = qa_data.SoQA(p, run_id=run, tai_khoan=TK[0], origin='http://a', thuc_the='X')
    ma, ten = so.cap_ma()
    so.khai_tao(ma, ten, 'case#1')
    so.xac_nhan_tao(ma, '10')
    # ① đổi tài khoản giữa chừng -> sổ từ chối mở
    try:
        qa_data.SoQA(p, tai_khoan=TK_KHAC[0], origin='http://a')
        raise AssertionError('sổ dữ liệu QA nhận chủ khác mà không báo gì')
    except qa_data.LoiSoQA:
        pass
    # ② đổi origin (app khác) cũng là chủ khác
    try:
        qa_data.SoQA(p, tai_khoan=TK[0], origin='http://b')
        raise AssertionError('sổ dữ liệu QA nhận origin khác mà không báo gì')
    except qa_data.LoiSoQA:
        pass
    # ③ mục mang vân tay chủ khác -> chung_minh phải chặn
    so2 = qa_data.SoQA(p, tai_khoan=TK[0], origin='http://a')
    so2.muc[ma]['van_tay'] = 'vantay-cua-nguoi-khac'
    try:
        so2.chung_minh(ma, 'xoá')
        raise AssertionError('bản ghi mang vân tay chủ khác vẫn qua được chung_minh()')
    except qa_data.LoiSoQA:
        pass
    return 'chặn 3/3 đường (đổi tài khoản · đổi origin · vân tay lệch)'


@kiem('⑦ DELETE thật NGOÀI phạm vi QA -> sổ mạng tố + dừng')
def b7(goc, _app):
    import qalib
    cs = qalib.CuaSoGhiQA('case#1', 'xoa', 'LoaiNguon', 'zzqa_ab12cd_001',
                          ['/api/items/{id}'], ids_qa=['51'])
    ev = lambda m, u: {'params': {'request': {'method': m, 'url': u}, 'type': 'XHR'}}  # noqa: E731
    # id của ta -> QA_WRITE
    so = qalib.so_mang([ev('DELETE', 'http://h/api/items/51')], cua_so=cs)
    assert so[0]['loai'] == qalib.QA_GHI, so[0]
    assert not qalib.vi_pham_mang(so)
    # id KHÁC -> vi phạm
    so2 = qalib.so_mang([ev('DELETE', 'http://h/api/items/7')], cua_so=cs)
    assert so2[0]['loai'] == qalib.GHI, so2[0]
    assert qalib.vi_pham_mang(so2), 'DELETE ngoài phạm vi QA KHÔNG bị tố'
    # cửa sổ ĐÃ ĐÓNG -> mọi mutation đều là vi phạm
    cs.dong()
    so3 = qalib.so_mang([ev('DELETE', 'http://h/api/items/51')], cua_so=cs)
    assert qalib.vi_pham_mang(so3), 'mutation sau khi cửa sổ đóng không bị tố'
    # endpoint khác -> vi phạm
    cs2 = qalib.CuaSoGhiQA('c', 'xoa', 'X', 'zzqa_a_1', ['/api/items/{id}'], ids_qa=['51'])
    so4 = qalib.so_mang([ev('DELETE', 'http://h/api/nguoi-dung/51')], cua_so=cs2)
    assert qalib.vi_pham_mang(so4), 'DELETE sang endpoint khác không bị tố'
    return '4/4 ca (id lạ · cửa sổ đóng · endpoint lạ · id của ta thì cho qua)'


@kiem('⑧ WRITE thật NGOÀI phạm vi QA -> tố + hạn mức cửa sổ')
def b8(goc, _app):
    import qalib
    ev = lambda m, u: {'params': {'request': {'method': m, 'url': u}, 'type': 'XHR'}}  # noqa: E731
    # không có cửa sổ nào -> mọi POST/PUT là vi phạm
    for m in ('POST', 'PUT', 'PATCH', 'DELETE'):
        so = qalib.so_mang([ev(m, 'http://h/api/items')])
        assert qalib.vi_pham_mang(so), '%s ngoài cửa sổ không bị tố' % m
    # cửa sổ TẠO chỉ mở POST, hạn mức 1
    # Hạn mức: request ghi sang một endpoint KHÁC trong cùng cửa sổ là vi phạm ngay từ lần 2
    # (chỉ request TRÙNG y hệt mới được dung thứ — xem khối cuối phép này).
    cs = qalib.CuaSoGhiQA('c', 'tao', 'X', 'zzqa_a_1', ['/api/items', '/api/khac'], so_toi_da=1)
    assert qalib.so_mang([ev('POST', 'http://h/api/items')], cua_so=cs)[0]['loai'] == qalib.QA_GHI
    lan2 = qalib.so_mang([ev('POST', 'http://h/api/khac')], cua_so=cs)
    assert qalib.vi_pham_mang(lan2), 'request ghi thứ 2 sang endpoint khác mà không bị tố'
    cs2 = qalib.CuaSoGhiQA('c', 'tao', 'X', 'zzqa_a_1', ['/api/items'])
    assert qalib.vi_pham_mang(qalib.so_mang([ev('DELETE', 'http://h/api/items')], cua_so=cs2)), \
        'cửa sổ TẠO lại cho DELETE đi qua'
    # App tự gửi TRÙNG cùng một request: cho qua tối đa `LAP_TOI_DA` lần và ĐẾM riêng, nhưng
    # request thứ n+1 — và mọi request sang endpoint/id khác — vẫn là vi phạm.
    cs3 = qalib.CuaSoGhiQA('c', 'tao', 'X', 'zzqa_a_1', ['/api/items'], so_toi_da=1)
    lop = [qalib.so_mang([ev('POST', 'http://h/api/items')], cua_so=cs3)[0]['loai']
           for _ in range(5)]
    assert lop == [qalib.QA_GHI] * 3 + [qalib.GHI] * 2, lop
    assert cs3.khoi()['so_lan_app_gui_trung'] == 2, cs3.khoi()
    # Xoá HÀNG LOẠT: cửa sổ được buộc đúng N id (N = số bản ghi QA đã tích), id thứ N+1 vẫn
    # là vi phạm — nên một lệnh xoá lạc sang bản ghi thật không bao giờ đi lọt.
    cs5 = qalib.CuaSoGhiQA('c', 'xoa', 'X', 'zzqa_a_1', ['/api/items/{id}'], so_toi_da=3,
                           so_id_toi_da=2)
    lop5 = [qalib.so_mang([ev('DELETE', 'http://h/api/items/%s' % i)], cua_so=cs5)[0]['loai']
            for i in ('11', '22', '33')]
    assert lop5 == [qalib.QA_GHI, qalib.QA_GHI, qalib.GHI], lop5
    cs4 = qalib.CuaSoGhiQA('c', 'xoa', 'X', 'zzqa_a_1', ['/api/items/{id}'], ids_qa=['5'],
                           so_toi_da=1)
    assert qalib.so_mang([ev('DELETE', 'http://h/api/items/5')], cua_so=cs4)[0]['loai'] \
        == qalib.QA_GHI
    assert qalib.vi_pham_mang(qalib.so_mang([ev('DELETE', 'http://h/api/items/9')],
                                            cua_so=cs4)), 'gửi trùng KHÔNG được mở đường sang id khác'
    return ('POST/PUT/PATCH/DELETE ngoài cửa sổ đều bị tố · hạn mức 1 có hiệu lực · app gửi '
            'trùng cùng endpoint được đếm riêng, sang id khác vẫn bị tố')


@kiem('⑥ cleanup IDEMPOTENT (chạy lại nhiều lần không lỗi)')
def b6(goc, _app):
    import qa_data
    so = _so_moi(goc)
    ma, ten = so.cap_ma()
    so.khai_tao(ma, ten, 'c1')
    so.xac_nhan_tao(ma, '7')
    goi = []

    def _xoa(m):
        goi.append(m['ma'])
        return True, 'ok'
    r1 = qa_data.don(so, _xoa, lambda: [ma], ghi=lambda *a: None)
    assert r1['da_don'] == 1 and not r1['hong'], r1
    for _ in range(3):
        r = qa_data.don(so, _xoa, lambda: [], ghi=lambda *a: None)
        assert r == {'da_don': 0, 'khong_thay': 0, 'hong': 0, 'con_ton': 0,
                     'chi_tiet': [], 'dung': False}, r
    assert len(goi) == 1, 'dọn lại gọi xoá thêm %d lần' % (len(goi) - 1)
    dat, sot, _ = qa_data.nghiem_thu_don(so, lambda: [])
    assert dat and not sot
    # Bản ghi đã biến mất khỏi app trước khi dọn -> CLEAN, không phải lỗi.
    # ⚠️ Hợp đồng ĐỔI 15/09 (sau khi chính bộ kiểm này bắt được lỗi): `don()` KHÔNG còn dùng
    # danh sách đọc được để BỎ QUA việc dọn — nó luôn hỏi `xoa_mot`, và chính `xoa_mot` trả
    # lời "không còn". Lý do: phép đọc hỏng thì danh sách rỗng, và bản cũ kết luận "đã sạch"
    # trong khi app còn nguyên 8 bản ghi QA. Phép kiểm này giữ đúng hợp đồng MỚI.
    so2 = _so_moi(goc)
    m2, t2 = so2.cap_ma()
    so2.khai_tao(m2, t2, 'c2')
    so2.xac_nhan_tao(m2, '8')
    goi2 = []

    def _mat_san(m):
        goi2.append(m['ma'])
        return True, 'không còn trên danh sách'
    r = qa_data.don(so2, _mat_san, lambda: [], ghi=lambda *a: None)
    assert r['khong_thay'] == 1 and not r['hong'] and not r['da_don'], r
    assert goi2 == [m2], 'don() phải HỎI người xoá, không được tự kết luận từ danh sách'
    assert so2.muc[m2]['trang_thai'] == qa_data.KHONG_THAY, so2.muc[m2]
    # dọn HỎNG -> fail-stop, không dọn bản ghi tiếp theo
    so3 = _so_moi(goc)
    ds = []
    for _ in range(3):
        a, b = so3.cap_ma()
        so3.khai_tao(a, b, 'c3')
        so3.xac_nhan_tao(a, '9')
        ds.append(a)
    dem = []

    def _hong(m):
        dem.append(m['ma'])
        return False, 'máy chủ từ chối'
    r = qa_data.don(so3, _hong, lambda: ds, ghi=lambda *a: None)
    assert r['hong'] == 1 and r['dung'] and len(dem) == 1, (r, dem)
    assert r['con_ton'] == 3, r     # bản ghi DỌN HỎNG VẪN nằm trong "còn tồn"
    # Dọn LẠI sau CLEANUP_FAILED phải đụng tới ĐỦ CẢ BA, kể cả bản ghi vừa hỏng — nếu không
    # thì đường thoát sau sự cố không dọn được chính thứ gây ra sự cố (ca thật, live 15/09).
    dem2 = []
    r2 = qa_data.don(so3, lambda m: (dem2.append(m['ma']), (True, 'ok'))[1], lambda: ds,
                     ghi=lambda *a: None)
    assert sorted(dem2) == sorted(ds), (dem2, ds)
    assert r2['da_don'] == 3 and not r2['hong'] and r2['con_ton'] == 0, r2
    return 'idempotent · CLEAN khi đã mất · fail-stop dừng đúng sau 1 bản ghi hỏng'


@kiem('⑬ mã bản ghi có HẬU TỐ độ dài vẫn phải mang dấu của lượt chạy')
def b13(goc, _app):
    import qalib
    run = qalib.qa_run_id('e7f07b')
    ma = qalib.qa_ma_ban_ghi(run, 25)
    dai = (ma + '_' + 'a' * 32)[:32]            # ca "nhập trong độ dài cho phép"
    assert len(dai) == 32
    assert qalib.la_ma_cua_run(dai, run), 'mã kéo dài bị mất dấu lượt chạy (case r230 hỏng)'
    assert qalib.la_ma_cua_run(ma, run)
    khac = qalib.qa_run_id('999999')
    assert not qalib.la_ma_cua_run(dai, khac), 'hậu tố làm lọt mã của lượt chạy KHÁC'
    # (hậu tố viết HOA vẫn nhận: `la_ma_cua_run` hạ chữ trước khi so — đây là phép xét QUYỀN
    #  SỞ HỮU, không phải phép xét mã có hợp lệ với app hay không.)
    for xau in ('zzqa__025', 'zzqa_e7f07b_', 'nguon_that_01', 'zzqa_e7f07bXX_025'):
        assert not qalib.la_ma_cua_run(xau, run), xau
    return 'mã 32 ký tự vẫn nhận · mã của run khác vẫn bị chặn · 4 mã hỏng đều bị chặn'


@kiem('⑭ mã bản ghi theo RÀNG BUỘC MÃ CỦA MÀN (gạch dưới / gạch ngang)')
def b14(goc, _app):
    """Bản chốt cứng `_` làm CHẾT 72 case của màn `LoaiLuuTru` ở lượt chạy 16/09.

    Màn ấy khai `code_regex = ^[a-z0-9-]+$` (CẤM gạch dưới), nên mọi bản ghi SETUP đều bị FE
    chặn ở ô Code -> case GHI nào cũng ra `LỖI` và để TRỐNG. Phép này khoá ba điều: ngăn cách
    suy ĐÚNG từ regex của màn, mã sinh ra QUA được regex ấy, và việc đổi ngăn cách KHÔNG nới
    lớp chứng minh quyền sở hữu một li nào.
    """
    import re
    import qalib
    rx_gach_ngang = '^[a-z0-9-]+$ — chỉ chữ thường, số và dấu gạch ngang (-)'
    assert qalib.qa_ngan_cach(rx_gach_ngang) == '-', 'không suy ra được ngăn cách của màn'
    assert qalib.qa_ngan_cach('^[a-z0-9_]+$') == '_'
    for xau in (None, '', '^[a-z0-9', 'không phải regex'):
        assert qalib.qa_ngan_cach(xau) == '_', 'regex không đọc được phải GIỮ mặc định: %r' % xau

    run = qalib.qa_run_id('c4d5e6')
    m_ngang = qalib.qa_ma_ban_ghi(run, 7, '-')
    m_duoi = qalib.qa_ma_ban_ghi(run, 7, '_')
    assert re.match('^[a-z0-9-]+$', m_ngang), 'mã vẫn không qua được regex của màn: %r' % m_ngang
    assert re.match('^[a-z0-9_]+$', m_duoi), m_duoi
    assert len(m_ngang) <= 32 and len(m_duoi) <= 32

    # Quyền sở hữu: nhận CẢ HAI ngăn cách (sổ lượt trước có thể sinh bằng ngăn cách khác — mã
    # không đọc được là bản ghi không ai dọn được), nhưng vẫn khoá theo `<run>` ở giữa.
    khac = qalib.qa_run_id('999999')
    for m in (m_ngang, m_duoi):
        assert qalib.la_ma_cua_run(m, run), m
        assert not qalib.la_ma_cua_run(m, khac), 'đổi ngăn cách làm lọt mã của lượt chạy KHÁC'
    assert qalib.la_ma_cua_run(m_ngang + '-aaaa', run), 'hậu tố theo ngăn cách mới bị mất dấu'
    for xau in ('zzqa--007', 'zzqa-c4d5e6-', 'loai-that-01', 'zzqa-c4d5e6XX-007'):
        assert not qalib.la_ma_cua_run(xau, run), xau

    # Sổ: ngăn cách đi xuống ĐĨA và RESUME phải dùng lại, nếu không lượt sau sinh một họ mã
    # thứ hai mà bước dọn không đối chiếu được với bản ghi đã nằm trên app.
    import qa_data
    d = os.path.join(goc, 'so-ngan-cach.json')
    so = qa_data.SoQA(d, run_id=run, tai_khoan=TK[0], origin='http://a', thuc_the='X', ngan='-')
    ma, ten = so.cap_ma()
    assert '-' in ma and '_' not in ma, ma
    assert ma.upper() in ten, 'tên hiển thị không mang đúng mã'
    so.khai_tao(ma, ten, 'c1')
    so2 = qa_data.SoQA(d, tai_khoan=TK[0], origin='http://a')
    assert so2.ngan == '-', 'RESUME đánh rơi ngăn cách -> lượt sau sinh mã khác họ'
    ma2, _ = so2.cap_ma()
    assert '_' not in ma2, ma2
    assert so2.chung_minh(ma, 'xoá')['ma'] == ma, 'bản ghi lượt trước mất quyền sở hữu'
    return 'suy đúng từ regex màn · mã qua được regex · resume giữ ngăn cách · chặn mã run khác'


@kiem('⑫ TRẦN số bản ghi QA: chạm trần thì DỪNG, không tạo tiếp')
def b12(goc, _app):
    import qa_data
    cu = qa_data.TRAN_BAN_GHI
    qa_data.TRAN_BAN_GHI = 3
    try:
        so = _so_moi(goc)
        for _ in range(3):
            ma, ten = so.cap_ma()
            so.khai_tao(ma, ten, 'c')
        try:
            so.cap_ma()
            raise AssertionError('vượt trần mà vẫn cấp mã tiếp')
        except qa_data.LoiSoQA as e:
            assert 'TRẦN' in str(e), e
        assert len(so.con_ton()) == 3
    finally:
        qa_data.TRAN_BAN_GHI = cu
    return 'cấp đúng 3 mã rồi dừng · sổ giữ nguyên 3 bản ghi để dọn'


@kiem('⑨ resume: dùng lại run cũ, KHÔNG tạo dữ liệu trùng')
def b9(goc, _app):
    import qa_data
    p = os.path.join(goc, 'so-resume.json')
    so = qa_data.SoQA(p, tai_khoan=TK[0], origin='http://a', thuc_the='X')
    run = so.run_id
    ma, ten = so.cap_ma()
    so.khai_tao(ma, ten, 'case#1')
    so.xac_nhan_tao(ma, '11')
    so2 = qa_data.SoQA(p, tai_khoan=TK[0], origin='http://a')
    assert so2.run_id == run, 'resume sinh run id MỚI -> bản ghi cũ thành rác vô chủ'
    assert so2.seq == 1 and [m['ma'] for m in so2.con_ton()] == [ma], so2.tom_tat()
    ma2, _ = so2.cap_ma()
    assert ma2 != ma, 'cấp lại đúng mã cũ -> tạo trùng'
    so2.chung_minh(ma)               # bản ghi lượt trước vẫn chứng minh được quyền sở hữu
    try:
        so2.khai_tao(ma, ten, 'case#1')
        raise AssertionError('khai tạo lại mã đang sống mà không báo gì')
    except qa_data.LoiSoQA:
        pass
    return 'run id giữ nguyên · seq nối tiếp · mã cũ vẫn chứng minh được · cấm khai trùng'


# ══════════════════════════════════════════════════════════════════════════════
# B. PHÉP CHẠY THẬT — Chrome + app giả CRUD
# ══════════════════════════════════════════════════════════════════════════════
@kiem('① CREATE -> TEST -> UPDATE -> TEST -> DELETE -> VERIFY CLEANUP (chạy thật)',
      can_chrome=True)
def a1(goc, app):
    import app_gia_crud as ag
    dung_bo_case(goc)
    dat_url(goc, 'http://127.0.0.1:%d/admin/loai-nguon' % app)
    r = tao_ket_qua(goc)
    assert os.path.exists(f_kq(goc)), 'không dựng được file kết quả: %s' % r.stdout[-400:]
    truoc = len(ag.KHO.ds('T1'))
    r = chay(['ChuyenVien', 'LoaiNguon', '--cho-phep-ghi', '--apply',
              '--mang-cho-phep', '/api/login'], goc)
    out = r.stdout + r.stderr
    assert 'DỪNG AN TOÀN' not in out, 'lượt chạy bị hàng rào cắt ngang:\n%s' % out[-1500:]
    assert 'CLEANUP_FAILED' not in out, 'dọn thất bại:\n%s' % out[-1500:]
    s = so_qa(goc)
    assert s, 'không có sổ dữ liệu QA'
    tt = s['tom_tat']
    assert tt['tong'] >= 3, 'lượt chạy chỉ tạo %d bản ghi QA' % tt['tong']
    assert tt['con_ton'] == 0, 'còn %d bản ghi QA chưa dọn: %s' % (
        tt['con_ton'], [m['ma'] for m in s['muc'].values() if m['trang_thai'] in ('DINH_TAO',
                                                                                 'CON_SONG')])
    # ── dữ liệu THẬT của app phải nguyên vẹn ──
    sau = ag.KHO.ds('T1')
    that = [x for x in sau if not x['code'].startswith('zzqa')]
    assert len(that) == truoc, 'dữ liệu thật đổi: %d -> %d bản ghi' % (truoc, len(that))
    assert not [x for x in sau if x['code'].startswith('zzqa')], \
        'còn bản ghi QA trên app: %s' % [x['code'] for x in sau if x['code'].startswith('zzqa')]
    # ── kết quả có được ghi vào Excel không ──
    m = re.search(r'KẾT QUẢ\s+(\d+) P · (\d+) F · (\d+) PE', out)
    assert m, 'không thấy dòng KẾT QUẢ:\n%s' % out[-800:]
    p, f = int(m.group(1)), int(m.group(2))
    assert p + f >= 9, 'chỉ chấm được %d case trên %d' % (p + f, len(CASES))
    # ── sổ mạng: có QA_WRITE, KHÔNG có WRITE/UNKNOWN ──
    ev = json.load(open(os.path.join(d_phien(goc), 'evidence', 'mang.json'), encoding='utf-8'))
    dem = ev['dem']
    assert dem.get('WRITE', 0) == 0 and dem.get('UNKNOWN', 0) == 0, dem
    assert dem.get('QA_WRITE', 0) >= 3, 'sổ mạng chỉ ghi %s mutation QA' % dem.get('QA_WRITE')
    for x in ev['so_mang']:
        if x['loai'] == 'QA_WRITE':
            assert x.get('qa', {}).get('case') and x['qa'].get('hanh_dong'), \
                'mutation QA thiếu testcase/hành động: %s' % x
    return ('%d P · %d F · %d bản ghi QA tạo, dọn sạch · %d mutation QA có testcase kèm theo'
            % (p, f, tt['tong'], dem.get('QA_WRITE', 0)))


@kiem('⑤ cleanup SAU EXCEPTION: chết giữa chừng vẫn dọn được (chạy thật)', can_chrome=True)
def a5(goc, app):
    import app_gia_crud as ag
    g2 = os.path.join(goc, 'g5')
    os.makedirs(g2, exist_ok=True)
    dung_bo_case(g2)
    dat_url(g2, 'http://127.0.0.1:%d/admin/loai-nguon' % app)
    tao_ket_qua(g2)
    # ① chạy với hạn mức thời gian rất ngắn -> tiến trình chết giữa lượt, bỏ lại bản ghi QA
    # GIẾT tiến trình giữa chừng (SIGKILL) — dựng đúng ca "chết không kịp dọn". Dùng
    # `--timeout` không dựng được ca này: hết giờ là một đường THOÁT CÓ TRẬT TỰ, vẫn dọn sạch.
    import signal
    e = moi_truong(g2)
    pr = subprocess.Popen([sys.executable, os.path.join(TOOLS, 'chay_live.py'), 'ChuyenVien',
                           'LoaiNguon', '--cho-phep-ghi', '--mang-cho-phep', '/api/login'],
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=e,
                          start_new_session=True)
    t0 = time.time()
    while time.time() - t0 < 120:
        s0 = so_qa(g2)
        if s0 and s0['tom_tat']['tong'] >= 2:
            break
        if pr.poll() is not None:
            break
        time.sleep(1.0)
    if pr.poll() is None:
        os.killpg(os.getpgid(pr.pid), signal.SIGKILL)
    try:
        pr.wait(timeout=30)
    except Exception:
        pass
    s = so_qa(g2)
    assert s, 'chết giữa chừng mà KHÔNG để lại sổ dữ liệu QA — không ai dọn được'
    con = [m['ma'] for m in s['muc'].values() if m['trang_thai'] in ('DINH_TAO', 'CON_SONG')]
    if not con:
        return 'lượt chạy kịp xong trọn vẹn — không dựng được ca chết giữa chừng (đã dọn sạch)'
    tren_app = [x['code'] for x in ag.KHO.ds('T1') if x['code'].startswith('zzqa')]
    # ② dọn nốt bằng --don-du-lieu-qa
    r2 = chay(['ChuyenVien', 'LoaiNguon', '--don-du-lieu-qa', '--cho-phep-ghi',
               '--mang-cho-phep', '/api/login'], g2)
    out = r2.stdout + r2.stderr
    assert 'CLEANUP_FAILED' not in out, 'dọn nốt thất bại:\n%s' % out[-1200:]
    s2 = so_qa(g2)
    assert s2['tom_tat']['con_ton'] == 0, 'sau khi dọn vẫn còn %d' % s2['tom_tat']['con_ton']
    sot = [x['code'] for x in ag.KHO.ds('T1') if x['code'].startswith('zzqa')]
    assert not sot, 'app vẫn còn bản ghi QA sau khi dọn: %s' % sot
    that = [x for x in ag.KHO.ds('T1') if not x['code'].startswith('zzqa')]
    assert len(that) == 25, 'dữ liệu thật bị đụng: còn %d/25' % len(that)
    return ('chết giữa chừng để lại %d bản ghi (%d còn trên app), --don-du-lieu-qa dọn sạch, '
            'dữ liệu thật nguyên 25/25' % (len(con), len(tren_app)))


@kiem('⑩ KHÔNG lọt bí mật vào evidence/log/kết quả (chạy thật)', can_chrome=True)
def a10(goc, app):
    mat = [TK[1], TK_KHAC[1]]
    xau = []
    d = d_phien(goc)
    if not os.path.isdir(d):
        raise AssertionError('chưa có thư mục phiên — phép ① phải chạy trước')
    n = 0
    for goc_d, _, tep in os.walk(d):
        if 'chrome-profile' in goc_d:
            continue
        for t in tep:
            p = os.path.join(goc_d, t)
            try:
                b = open(p, 'rb').read()
            except Exception:
                continue
            n += 1
            for m in mat:
                if m.encode() in b:
                    xau.append('%s: lộ mật khẩu' % os.path.relpath(p, d))
            for k in (b'authorization', b'"cookie"', b'set-cookie'):
                if k in b.lower():
                    xau.append('%s: có header %s' % (os.path.relpath(p, d), k.decode()))
            if re.search(rb'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.', b):
                xau.append('%s: có chuỗi hình dạng JWT' % os.path.relpath(p, d))
    # cả file kết quả Excel
    if os.path.exists(f_kq(goc)):
        b = open(f_kq(goc), 'rb').read()
        for m in mat:
            if m.encode() in b:
                xau.append('file kết quả: lộ mật khẩu')
    assert not xau, 'LỘ BÍ MẬT: %s' % ' · '.join(xau[:5])
    return 'soi %d tệp evidence/log/kết quả: không mật khẩu, không header auth, không JWT' % n


@kiem('⑪ --chi-doc: dữ liệu thật nguyên vẹn, 0 mutation (chạy thật)', can_chrome=True)
def a11(goc, app):
    import app_gia_crud as ag
    g3 = os.path.join(goc, 'g11')
    os.makedirs(g3, exist_ok=True)
    dung_bo_case(g3)
    dat_url(g3, 'http://127.0.0.1:%d/admin/loai-nguon' % app)
    tao_ket_qua(g3)
    truoc = ag.KHO.dem['tao'], ag.KHO.dem['sua'], ag.KHO.dem['xoa']
    # ⚠️ HỢP ĐỒNG ĐỔI 2026-09-16 lượt 2: bỏ `--cho-phep-ghi` KHÔNG còn là cách tắt phần ghi.
    # Chế độ mặc định nay là TỰ ĐỘNG và bảng chính sách tự quyết `ALLOW_QA_WRITE` (§2 của chỉ
    # thị) — đúng mục đích: lượt chạy không dừng lại hỏi người. Cách tắt phần ghi nay là cờ
    # `--chi-doc`, một cờ THU HẸP quyền. Sửa kỳ vọng ở đây là sửa ĐÚNG; giữ nguyên kỳ vọng cũ
    # là chốt lại chính cái hộp thoại vừa bỏ đi.
    r = chay(['ChuyenVien', 'LoaiNguon', '--chi-doc', '--mang-cho-phep', '/api/login'], g3)
    out = r.stdout + r.stderr
    assert 'chặn an toàn' in out, out[-600:]
    assert 'decision=READ_ONLY' in out, 'không ghi quyết định READ_ONLY:\n%s' % out[-600:]
    sau = ag.KHO.dem['tao'], ag.KHO.dem['sua'], ag.KHO.dem['xoa']
    assert truoc == sau, ('lượt chạy KHÔNG bật --cho-phep-ghi mà app vẫn nhận lệnh ghi: '
                          'tạo %+d · sửa %+d · xoá %+d'
                          % tuple(b - a for a, b in zip(truoc, sau)))
    s = so_qa(g3, 'live-ChuyenVien-LoaiNguon')
    assert not s or s['tom_tat']['tong'] == 0, 'hàng rào tắt mà vẫn tạo dữ liệu QA'
    return '--chi-doc: 0 lệnh ghi tới app, 0 bản ghi QA'


# ══════════════════════════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--nhanh', action='store_true', help='bỏ phép cần Chrome')
    ap.add_argument('--chi', help='chỉ chạy phép có tên chứa chuỗi này')
    a = ap.parse_args()

    import app_gia_crud as ag
    srv = ag.chay(0)
    port = srv.server_address[1]
    goc = tempfile.mkdtemp(prefix='kiem-qa-data-')
    print('TỰ KIỂM VÒNG ĐỜI DỮ LIỆU QA')
    print('   app giả CRUD: http://127.0.0.1:%d  ·  thư mục tạm: %s' % (port, goc))
    co_chrome = bool(_tim_chrome())
    if not co_chrome:
        print('   ⚠ KHÔNG tìm thấy Chrome — các phép chạy thật sẽ BỎ QUA (không tính là đạt)')
    dat = hong = bo = 0
    for ten, f, can in KQ:
        if a.chi and a.chi not in ten:
            continue
        if can and (a.nhanh or not co_chrome):
            _in(ten, True, 'BỎ QUA (%s)' % ('--nhanh' if a.nhanh else 'không có Chrome'),
                bo_qua=True)
            bo += 1
            continue
        try:
            ghi = f(goc, port)
            _in(ten, True, ghi or '')
            dat += 1
        except Exception as e:
            _in(ten, False, '%s: %s' % (type(e).__name__, str(e)[:300]))
            hong += 1
    print('\n   ĐẠT %d · HỎNG %d · BỎ QUA %d' % (dat, hong, bo))
    if hong == 0 and bo == 0:
        print('   -> lớp ghi đã qua toàn bộ phép kiểm, ĐƯỢC PHÉP chạy trên app thật.')
    elif hong == 0:
        print('   -> còn %d phép chưa đo được: CHƯA đủ điều kiện chạy app thật.' % bo)
    if not hong:
        shutil.rmtree(goc, ignore_errors=True)
    else:
        print('   (giữ lại thư mục tạm để soi: %s)' % goc)
    return 1 if hong else 0


def _tim_chrome():
    import browser_manager as bm
    try:
        return bm.tim_chrome() if hasattr(bm, 'tim_chrome') else _tim_tay()
    except Exception:
        return _tim_tay()


def _tim_tay():
    for x in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'):
        p = shutil.which(x)
        if p:
            return p
    return None


if __name__ == '__main__':
    sys.exit(main())

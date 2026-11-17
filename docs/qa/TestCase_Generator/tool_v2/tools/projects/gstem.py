# -*- coding: utf-8 -*-
"""HỒ SƠ DỰ ÁN — GSTEM (lớp L2).

Cấu hình theo role cho các script bơm case (validate / chức năng / ATTT).
Dùng cho dự án khác: copy file này thành projects/<ten>.py, sửa PROJECT + ROLES,
rồi chạy với QA_PROJECT=<ten>. Xem ../../huong-dan/HO-SO-DU-AN.md.

TABLE: chỉ điền tên bảng khi CÓ CĂN CỨ (đã xuất hiện trong SQL sẵn có của file, hoặc
xác thực được trong docs/database + proto của repo). Không có căn cứ -> để trống,
script sẽ dùng chỗ trống <...> kèm cờ [CẦN VERIFY] ở cột Ghi chú (T).

VERIFY_ALL: role mà việc map màn -> bảng vẫn là suy luận -> luôn gắn cờ.
"""

import os
from pathlib import Path

# Thư mục bộ case. Ưu tiên biến môi trường QA_TESTCASE_DIR; mặc định suy từ vị trí file này
# (tool_v2/tools/projects/<file>.py -> ../../../testCase/) nên đổi máy / đổi chỗ checkout vẫn chạy.
BASE = os.environ.get('QA_TESTCASE_DIR') or str(Path(__file__).resolve().parents[3] / 'testCase')
BASE = BASE.rstrip('/\\') + os.sep          # luôn kết thúc bằng dấu phân cách, dù env quên

# File nền đi kèm repo (tool_v2/file-nen/) — máy mới clone về là dựng được file mới ngay,
# không cần bộ case thật. Suy từ vị trí file này nên không phụ thuộc chỗ checkout.
NEN_KEM = str(Path(__file__).resolve().parents[2] / 'file-nen' / 'file-nen.xlsx')
_nen_duan = BASE + 'NCC/testCase/Testcase-Role-NCC-mau.xlsx'

PROJECT = dict(
    name='GSTEM',
    title='Geleximco STEM Platform',
    file_prefix='Testcase-Role-',          # <prefix><Role>-<Man>.xlsx
    result_suffix='_ket_qua',
    subdir_src='testcase',                 # thư mục bản nguồn (một số role viết hoa 'testCase')
    subdir_result=['ket-qua-test', 'ket-qua-test-thu-cong'],
    # File NỀN để dựng bộ case mới (new_from_base.py). Phải là file đã chuẩn: 3 sheet
    # (Trang bìa|Bìa · Tổng hợp · BP-*), Giao diện chung đúng 6 case, đủ 4 khối mỗi CN.
    # Thứ tự ưu tiên: QA_BASE_FILE -> nền của bộ case thật -> nền đi kèm repo (file-nen/).
    # Nhánh cuối để máy chỉ clone tool_v2 (chưa có testCase/) vẫn chạy được new_from_base.py.
    base_file=(os.environ.get('QA_BASE_FILE')
               or (_nen_duan if os.path.exists(_nen_duan) else NEN_KEM)),
)


ROLES = {
    # ------------------------------------------------------------------ ADMIN
    'Admin': dict(
        dir=BASE + 'Admin/testcase/',
        strip='Testcase-Role-Admin-',
        skip=[],
        verify_all=False,
        # ATTT: Admin là vai trò xuyên tổ chức -> phạm vi tính theo QUYỀN được cấp
        group='nhóm quản trị',
        own='quyền được cấp',          # ghép được vào cả 'phạm vi {own}' lẫn 'thuộc {own}'
        other='ngoài phạm vi được cấp',
        other_role='nhà cung cấp / nhà trường / giáo viên',
        table={
            'BaiGiangTapHuan': 'training_lessons', 'BaiViet': 'articles', 'Curriculum': 'curriculums',
            'DanhMucBaiViet': 'categories', 'DanhMucFAQ': 'faq_categories', 'DonGia': 'output_prices',
            'DonHang': 'orders', 'FAQ': 'faqs', 'GoiSTEM': 'stem_packages', 'HopDong': 'contracts',
            'HopThuHoTro': 'support_tickets', 'KeHoachTapHuan': 'training_plans',
            'LichTapHuan': 'training_plan_sessions', 'LoaiVanDe': 'support_issue_types',
            'NCC': 'suppliers', 'NPP': 'distributors', 'Onboarding': 'schools',
            'PhiBanQuyen': 'article_royalty_configs', 'TaiKhoan': 'accounts',
            'ThongTinLienHe': 'contact_info', 'YeuCauTuVan': 'contact_requests',
            # Quản lý khai báo — master data service ims-declaration (tên bảng lấy từ
            # chính client FE: deviceTypeClient / academicYearApi / khungSuPhamClient / originClient)
            'LoaiThietBi': 'dm_thiet_bi', 'NamHocHocKy': 'dm_nam_hoc',
            'NangLucCotLoi': 'dm_nang_luc_cot_loi', 'XuatXu': 'dm_xuat_xu',
            # 4 danh mục mầm non (GDMN) — cùng service ims-declaration, tên bảng lấy từ
            # migrations/017..020 + proto ims-declaration/v1
            'DoTuoiMamNon': 'dm_do_tuoi_mam_non', 'LinhVucPhatTrien': 'dm_linh_vuc_phat_trien',
            'ChuDeMamNon': 'dm_chu_de', 'LoaiHinhHoatDongMamNon': 'dm_loai_hinh_hoat_dong',
        },
        noun={
            'Audit': 'bản ghi nhật ký', 'BaiGiangTapHuan': 'bài giảng', 'BaiViet': 'bài viết',
            'BaoMat': 'cấu hình bảo mật', 'CaiDat': 'cấu hình', 'Curriculum': 'chương trình giảng dạy',
            'DanhMucBaiViet': 'danh mục', 'DanhMucFAQ': 'danh mục', 'Dashboard': 'số liệu',
            'DonGia': 'đơn giá', 'DonHang': 'đơn hàng', 'FAQ': 'câu hỏi thường gặp',
            'GanBoSach': 'bản ghi gán bộ sách', 'GoiSTEM': 'gói STEM', 'HopDong': 'hợp đồng',
            'KhaoSat': 'đợt khảo sát',
            'HopThuHoTro': 'yêu cầu hỗ trợ', 'KeHoachTapHuan': 'kế hoạch tập huấn',
            'LichTapHuan': 'buổi tập huấn', 'LoaiVanDe': 'loại vấn đề', 'NCC': 'nhà cung cấp',
            'NPP': 'nhà phân phối', 'Onboarding': 'tổ chức', 'PhiBanQuyen': 'cấu hình phí bản quyền',
            'Platform': 'cấu hình nền tảng', 'TaiKhoan': 'tài khoản', 'ThongBaoHeThong': 'thông báo',
            'ThongTinLienHe': 'thông tin liên hệ', 'VaiTro': 'vai trò', 'YeuCauTuVan': 'yêu cầu tư vấn',
            'LoaiThietBi': 'loại thiết bị', 'NamHocHocKy': 'năm học', 'NangLucCotLoi': 'năng lực cốt lõi',
            'XuatXu': 'xuất xứ',
            'DoTuoiMamNon': 'độ tuổi mầm non', 'LinhVucPhatTrien': 'lĩnh vực phát triển',
            'ChuDeMamNon': 'chủ đề mầm non', 'LoaiHinhHoatDongMamNon': 'loại hình hoạt động mầm non',
        },
    ),

    # -------------------------------------------------------------------- NCC
    'NCC': dict(
        dir=BASE + 'NCC/testCase/',
        strip='Testcase-Role-NCC-',
        skip=['Testcase-Role-NCC-mau.xlsx'],          # Danh mục thiết bị = file mẫu, không sửa
        verify_all=False,
        group='Nhà cung cấp',
        own='nhà cung cấp của mình',
        other='của nhà cung cấp khác',
        other_role='nhà trường / giáo viên / nhà phân phối',
        table={                                        # đều lấy từ SQL sẵn có trong chính file
            'BaiGiang': 'training_lessons', 'BaoHanh': 'warranty_tickets',
            'BienSoanChuDe': 'stem_lessons', 'ChuongTrinhGiangDay': 'training_stems',
            'DonHang': 'orders', 'KeHoach': 'training_plans', 'KyThi': 'exams',
            'LichTapHuan': 'training_plan_sessions', 'Media-mau': 'coursewares',
            'TruongHoc': 'schools',
        },
        noun={
            'BaiGiang': 'bài giảng', 'BaoHanh': 'phiếu bảo hành', 'BienSoanChuDe': 'chủ đề',
            'BoCaiPhanMem': 'bộ cài phần mềm', 'CaiDat': 'cấu hình',
            'ChuongTrinhGiangDay': 'chương trình giảng dạy', 'Dashboard': 'số liệu',
            'DoanhThu': 'bản ghi doanh thu', 'DonHang': 'đơn hàng',
            'HieuQuaGiangDay': 'bản ghi hiệu quả giảng dạy', 'KeHoach': 'kế hoạch tập huấn',
            'KyThi': 'kỳ thi', 'License': 'giấy phép', 'LichTapHuan': 'buổi tập huấn',
            'Media-mau': 'học liệu', 'TaiKhoan': 'tài khoản', 'ThongBao': 'thông báo',
            'TruongHoc': 'trường học', 'VaiTro': 'vai trò',
        },
    ),

    # ---------------------------------------------------------------- TEACHER
    'Teacher': dict(
        dir=BASE + 'Teacher/testCase/',
        strip='Testcase-Role-Teacher-',
        skip=[],
        # map màn -> bảng của role Giáo viên đều là SUY LUẬN (file chưa có SQL thật)
        verify_all=True,
        group='Giáo viên',
        own='trường và lớp mình phụ trách',
        other='của trường hoặc lớp khác',
        other_role='nhà cung cấp / quản trị nhà trường / học sinh',
        table={                                        # tên bảng có thật trong repo, map là suy luận
            'BaiGiangTapHuan': 'training_lessons', 'CaiDat': 'portal_settings',
            'ChamBai': 'user_content_results', 'KhoHocLieu': 'coursewares',
            'LichTapHuan': 'training_plan_sessions', 'PhongHocSTEM': 'rooms',
        },
        noun={
            'BaiGiangTapHuan': 'bài giảng tập huấn', 'BaiTap': 'bài tập', 'CaiDat': 'cấu hình',
            'ChamBai': 'bài làm', 'Dashboard': 'số liệu', 'DatPhong': 'lượt đặt phòng',
            'KeHoachGD': 'kế hoạch giảng dạy', 'KhoHocLieu': 'học liệu',
            'LichTapHuan': 'buổi tập huấn', 'LopGiangDay': 'lớp giảng dạy',
            'PhongHocSTEM': 'phòng học STEM', 'ThongBao': 'thông báo',
            'GiaoDucSTEM': 'buổi dạy STEM',
        },
    ),
}


def get(name):
    if name not in ROLES:
        raise SystemExit('role phải là một trong: %s' % ', '.join(ROLES))
    return ROLES[name]

# -*- coding: utf-8 -*-
"""HỒ SƠ DỰ ÁN — MOET Open Data (cổng dữ liệu mở Bộ GD&ĐT), lớp L2.

Bộ case lưu ở docs/qa-docs/03_TestCases/<Mxx_...>/TC_UC-MOD-xxxx_<Ten>.xlsx (mỗi UC một file).
Chạy: QA_PROJECT=moetopen python3 <script>.py <Role> <từ-khoá-UC>   (vd: QTC UC-MOD-0071)
Chưa có DB/proto thật cho tài khoản quản trị (go/apps chưa có service) -> table để trống,
mọi case đối chiếu DB gắn cờ [CẦN VERIFY] (verify_all=True).
"""
import os
from pathlib import Path

_REPO = Path(__file__).resolve().parents[7]
BASE = os.environ.get('QA_TESTCASE_DIR') or str(_REPO / 'docs' / 'qa-docs' / '03_TestCases')
BASE = BASE.rstrip('/\\') + os.sep

_NEN = BASE + 'M06_TaiKhoanXacThuc/TC_UC-MOD-0141_DangKyTaiKhoanToChucKhaiThac.xlsx'
_NEN_KEM = str(Path(__file__).resolve().parents[2] / 'file-nen' / 'file-nen.xlsx')

PROJECT = dict(
    name='MOETOPEN',
    title='Cổng dữ liệu mở Bộ Giáo dục và Đào tạo',
    file_prefix='TC_',
    result_suffix='_ket_qua',
    subdir_src=None,
    # subdir_result được get() đặt theo từng role: 04_TestExecution/<cùng cấu trúc thư mục với 03_TestCases>
    subdir_result=['../04_TestExecution'],
    base_file=(os.environ.get('QA_BASE_FILE') or (_NEN if os.path.exists(_NEN) else _NEN_KEM)),
    entry='Vào cổng dữ liệu mở (khu Quản trị cổng)',
    role_xem='Quản trị cổng',
    role_ghi='Quản trị cổng',
)

ROLES = {
    # Quản trị cổng — M09 Quản trị người dùng và xử lý
    'QTC': dict(
        dir=BASE + 'M09_QuanTriNguoiDungXuLy/',
        strip='TC_',
        skip=[],
        verify_all=True,
        ten_vai_tro='Quản trị cổng',
        group='nhóm quản trị cổng',
        own='quyền được cấp',
        other='ngoài phạm vi được cấp',
        other_role='Tổ chức khai thác',
        table={},
        noun={},
    ),
    # Quản trị cổng — M08 Quản trị nội dung (lượt M08 Bộ dữ liệu, 1 file gom 9 UC)
    'QTC_M08': dict(
        dir=BASE + 'M08_QuanTriNoiDung/',
        strip='TC_',
        skip=['TC_UC-MOD-0031_CongBoBoDuLieu.xlsx', 'TC_UC-MOD-0109_TamAnGoKhoiPhucBoDuLieu.xlsx',
              'TC_UC-MOD-0111_CapNhatDanhMucDonViCungCap.xlsx', 'TC_UC-MOD-0144_NhapDanhSachBoDuLieuTuExcel.xlsx',
              'TC_UC-MOD-0148_XemChiTietBoDuLieuQuanTri.xlsx'],
        verify_all=True,
        ten_vai_tro='Quản trị cổng',
        group='nhóm quản trị cổng',
        own='quyền được cấp',
        other='ngoài phạm vi được cấp',
        other_role='Tổ chức khai thác',
        table={},
        noun={},
    ),
    # Quản trị cổng — M09 Yêu cầu khai thác dịch vụ (lượt UC-MOD-0165/0166/0143, 1 file gom 3 UC)
    'QTC_M09_YCKT': dict(
        dir=BASE + 'M09_QuanTriNguoiDungXuLy/',
        strip='TC_',
        skip=['TC_M09_TaiKhoan.xlsx', 'TC_M09_VaiTroVaPhanQuyen.xlsx',
              'TC_UC-MOD-0071_TaoTaiKhoanQuanTriCong.xlsx', 'TC_UC-MOD-0150_SuaThongTinThietLapLaiMFA.xlsx'],
        verify_all=True,
        ten_vai_tro='Quản trị cổng',
        group='nhóm quản trị cổng',
        own='quyền được cấp',
        other='ngoài phạm vi được cấp',
        other_role='Tổ chức khai thác',
        table={},
        noun={},
    ),
}


# Quản trị cổng — M08 Quản trị nội dung, mỗi lượt một thư mục (mỗi UC một file TC_UC-MOD-xxxx_*.xlsx;
# file gộp tham chiếu *_GopThamChieu.xlsx và luồng xuyên UC được bỏ qua khi chạy theo UC)
for _luot in ('BoDuLieu', 'DichVuDuLieu', 'DanhMucDungChung', 'DanhMucThamChieu', 'VanBanPhapLuat', 'TrangTinhHuongDan'):
    ROLES['QTC_M08_' + _luot] = dict(
        dir=BASE + 'M08_QuanTriNoiDung/M08_%s/' % _luot,
        strip='TC_',
        skip=[f for f in (
            'TC_M08_%s_GopThamChieu.xlsx' % _luot,
        )],
        verify_all=True,
        ten_vai_tro='Quản trị cổng',
        group='nhóm quản trị cổng',
        own='quyền được cấp',
        other='ngoài phạm vi được cấp',
        other_role='Tổ chức khai thác',
        table={},
        noun={},
    )


# Người khai thác — M06 Tài khoản và xác thực (mỗi UC một file; chạy theo UC bằng tham số màn)
ROLES['NKT_M06'] = dict(
    dir=BASE + 'M06_TaiKhoanXacThuc/',
    strip='TC_',
    skip=[],
    verify_all=True,
    ten_vai_tro='Người khai thác',
    group='nhóm người khai thác',
    own='quyền được cấp',
    other='ngoài phạm vi được cấp',
    other_role='Quản trị cổng',
    table={},
    noun={},
)


# Người khai thác — M03 Dịch vụ dữ liệu (API) (mỗi UC một file + file luồng xuyên UC)
ROLES['NKT_M03'] = dict(
    dir=BASE + 'M03_DichVuDuLieuAPI/',
    strip='TC_',
    skip=[],
    verify_all=True,
    ten_vai_tro='Người khai thác',
    group='nhóm người khai thác',
    own='quyền được cấp',
    other='ngoài phạm vi được cấp',
    other_role='Quản trị cổng',
    table={},
    noun={},
)


# Người khai thác — M05 Văn bản pháp luật (mỗi UC một file + file luồng xuyên UC)
ROLES['NKT_M05'] = dict(
    dir=BASE + 'M05_VanBanPhapLuat/',
    strip='TC_',
    skip=[],
    verify_all=True,
    ten_vai_tro='Người khai thác',
    group='nhóm người khai thác',
    own='quyền được cấp',
    other='ngoài phạm vi được cấp',
    other_role='Quản trị cổng',
    table={},
    noun={},
)


class _RolesTheoThuMuc(dict):
    """Mỗi lần tra một role, đặt thư mục kết quả = 04_TestExecution/<cùng cấu trúc thư mục với 03_TestCases>
    (03 chỉ chứa test case, kết quả nằm ở 04). roles.get() chỉ đọc ROLES[name] nên móc vào đây."""

    def __getitem__(self, name):
        cfg = dict.__getitem__(self, name)
        rel = os.path.relpath(cfg['dir'].rstrip('/\\'), BASE.rstrip('/\\'))
        PROJECT['subdir_result'] = [str(_REPO / 'docs' / 'qa-docs' / '04_TestExecution' / rel)]
        return cfg


ROLES = _RolesTheoThuMuc(ROLES)


def get(name):
    if name not in ROLES:
        raise SystemExit('role phải là một trong: %s' % ', '.join(ROLES))
    return ROLES[name]

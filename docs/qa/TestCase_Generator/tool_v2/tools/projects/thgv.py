# -*- coding: utf-8 -*-
"""HỒ SƠ DỰ ÁN — THGV / Tập huấn Giáo viên (lớp L2).

App `taphuangiaovien.saas.coquan.vn` — "Tập huấn Giáo viên · Bộ Giáo dục và Đào tạo"
(trang đăng nhập ghi đủ: "Bồi dưỡng thường xuyên GV và CBQL CSGD phổ thông").
Mọi route nằm ở GỐC (`/ref-school-levels`), KHÔNG dưới `/admin` -> chạy `probe_live.py`
phải đặt `QA_HOME_PREFIX=/`.

Nguồn code (monorepo `temis`, đọc 2026-09-15 — đủ 5 lớp của HO-SO-DU-AN §0 mục 5):
  · FE page      : react/apps/teacher-training/src/app/pages/admin/platform/
                   ReferenceSchoolLevelsPage.tsx
  · FE service   : react/apps/teacher-training/src/app/services/referenceDataApi.ts
                   + src/app/types/referenceData.ts
  · FE dùng chung: react/packages/shared/src/list/... (ListTable · TablePagination ·
                   BulkActionBar) · react/packages/shared/src/components/SearchableSelect
  · BE repository: go/apps/ims-declaration/internal/repositories/dm_cap_hoc.go  ★ SQL THẬT
  · proto        : go/packages/proto/ims/proto/ims-declaration/v1/dm_cap_hoc.proto ★ giới hạn

⚠️ **CHƯA soi được màn thật** (2026-09-15): tài khoản `admintaphuan@gmail.com` bị hệ thống
trả "Tên đăng nhập hoặc mật khẩu không chính xác!" — đã kiểm chứng script điền đúng cả hai ô.
Phần `nav` và thứ tự control lấy từ ẢNH MÀN người đặt việc gửi + code sidebar
(`src/app/components/AdminLayout.tsx` nhóm 'Danh mục tổ chức'). Chỗ nào chỉ có code chống
lưng thì bộ case gắn cờ [CẦN VERIFY]; có tài khoản chạy được thì soi lại bằng
`probe_live.py <url> --spec <hồ sơ màn>.json`.

BASE: bộ case nằm TRONG repo nghiệp vụ (`temis/docs/qa-doc/`), không nằm cạnh tool_v2 —
người đặt việc chốt bố cục PHẲNG 2026-09-15:
    docs/qa-doc/testcase/Testcase-Role-<Role>-<Màn>.xlsx
    docs/qa-doc/ho-so-man/<tên trùng .xlsx>.json      (new_from_base tự cất vào đây vì
                                                       thư mục cha tên đúng `subdir_src`)
    docs/qa-doc/ket-qua-test/
Đổi chỗ bằng `QA_TESTCASE_DIR=/đường/dẫn/khác`.
"""

import os
from pathlib import Path

# Đường dẫn mặc định trỏ vào repo nghiệp vụ. Khác gstem/moetdl (bộ case nằm cạnh tool) nên
# KHÔNG suy được từ vị trí file này — vẫn để QA_TESTCASE_DIR đè lên khi checkout chỗ khác.
# Cắm cứng `/home/khuetm/...` thì trên máy khác `os.path.exists` luôn False và MỌI bộ rà in 0
# mà không ai biết — nên mặc định neo vào `~` (đúng bố cục, không đúng tên người dùng).
BASE = os.environ.get('QA_TESTCASE_DIR') or os.path.expanduser(
    '~/projects/temis/docs/qa-doc')
BASE = BASE.rstrip('/\\') + os.sep

# Nền trung tính đi kèm repo tool_v2 — dự án này chưa có bộ case nào nên không có nền riêng.
NEN_KEM = str(Path(__file__).resolve().parents[2] / 'file-nen' / 'file-nen.xlsx')

PROJECT = dict(
    name='THGV',
    title='Tập huấn Giáo viên',
    file_prefix='Testcase-Role-',
    result_suffix='_ket_qua',
    subdir_src='testcase',
    # Kết quả gom theo VAI TRÒ trong `ket-qua-test/` (chỉ thị người đặt việc 2026-09-21).
    # Nguồn vẫn PHẲNG ở `testcase/` — giữ vậy để `qalib.ho_so_man()` còn tra ra
    # `<BASE>/ho-so-man/<tên trùng .xlsx>.json` (nó suy từ chỗ đặt file .xlsx, không
    # phải từ hồ sơ dự án). Đổi nguồn sang `testcase/<Role>/` là mất hồ sơ màn.
    subdir_result=['ket-qua-test/QuanTriHeThong'],
    base_file=os.environ.get('QA_BASE_FILE') or NEN_KEM,
    # Bước 1 của khối bước ở dòng CN (PROMPT v3 §4.1) — khuôn mẫu
    # 'Vào <hệ thống> > Đăng nhập tài khoản <vai trò>'.
    entry='Vào Hệ thống Tập huấn Giáo viên',
    # Bộ case này gắn với MỘT vai trò (§8.2.9) nên hai khoá dưới KHÔNG liệt kê tràn lan;
    # `ten_vai_tro` của từng role mới là thứ quyết định chữ ghi ở bước 1.
    role_xem='Quản trị hệ thống',
    role_ghi='Quản trị hệ thống',
)

ROLES = {
    # Vai trò hiển thị dưới tên tài khoản trên thanh đầu trang: "Quản trị hệ thống".
    'QuanTriHeThong': dict(
        ten_vai_tro='Quản trị hệ thống',
        dir=BASE + 'testcase/',
        strip='Testcase-Role-QuanTriHeThong-',
        skip=[],
        # Tên bảng lấy từ SQL THẬT trong repository -> không gắn cờ cả loạt.
        verify_all=False,
        # ATTT: danh mục cấp học là dữ liệu dùng chung TOÀN NGÀNH (proto ghi rõ "KHÔNG có
        # field tenant_id vì là dữ liệu chung toàn ngành GD") -> phạm vi tính theo QUYỀN
        # được cấp, không theo đơn vị.
        group='nhóm quản trị hệ thống',
        own='quyền được cấp',
        other='ngoài phạm vi được cấp',
        other_role='Giáo viên / Cán bộ quản lý / Quản trị đơn vị',
        table={
            # go/apps/ims-declaration/internal/repositories/dm_cap_hoc.go
            #   SELECT ... FROM dm_cap_hoc WHERE "NGAY_XOA" IS NULL
            'CapHoc': 'dm_cap_hoc',
            # go/apps/lms-content-builder/internal/repositories/lesson_*.go
            #   lessons (identity) · lesson_versions (bản version) · lesson_blocks (cây nội dung)
            #   Mọi truy vấn đều lọc tenant_id; xoá MỀM bằng deleted_at.
            'BaiGiang': 'lessons',
            # go/apps/lms-content-builder/internal/repositories/courseware_repository.go
            #   + courseware_list_repository.go + courseware_delete_repository.go
            #   coursewares (identity) LEFT JOIN latest_version lv (courseware_versions).
            #   Mọi truy vấn lọc tenant_id; xoá MỀM bằng deleted_at; sự kiện qua outbox_events.
            'KhoHocLieu': 'coursewares',
            # go/apps/lms-content-builder/internal/repositories/exam_courseware_repository.go
            #   + exam_paper_repository.go
            #   coursewares (identity) · courseware_exam_versions (bản đề — version_status
            #   DRAFT/PENDING_APPROVAL/APPROVED/PUBLISHED/HIDDEN/REJECTED) · exam_papers (mã đề
            #   PDF) · exam_sections · questions · question_versions.
            #   MỌI truy vấn lọc tenant_id; xoá MỀM bằng deleted_at.
            'BaiKiemTra': 'courseware_exam_versions',
            # docs/dev-manual/database/yugabyteDB/authentication_schema_sql.md (đọc trực tiếp
            # 2026-09-25, submodule dev-manual CÓ checkout — SQL THẬT, khác 4 dòng trên vốn suy
            # từ code Go vì FE/BE của màn Tài khoản không probe được, xem man-TaiKhoan.json).
            # users (identity) · roles/user_roles (phân quyền) · locations/location_members (đơn vị).
            'TaiKhoan': 'users',
        },
        noun={
            # /ref-school-levels — Danh mục tổ chức > Cấp học.
            # Danh mục cấp học (Mầm non · Tiểu học · THCS · THPT · GDTX...): Mã · Tên ·
            # Trạng thái. Xoá MỀM ("NGAY_XOA"), chặn khi còn khối lớp/môn học tham chiếu.
            'CapHoc': 'cấp học',
            # /content-authoring — Xây dựng nội dung > Bài giảng.
            # Bài giảng (LECTURE): Tên · Ảnh bìa · Môn học · Khối · Mô tả + cây nội dung
            # (chuyên đề / học liệu). Vòng đời Nháp -> Chờ duyệt -> Đã duyệt -> Đã xuất bản
            # / Bị từ chối / Lưu trữ. Xoá MỀM giữ 30 ngày.
            'BaiGiang': 'bài giảng',
            # /content-bank — Xây dựng nội dung > Kho học liệu.
            # Học liệu số dùng chung, 5 loại VIDEO/IMAGE/AUDIO/DOCUMENT/SCORM: Tên · Môn học ·
            # Khối lớp · Năm xuất bản · Mô tả · Tệp · Cho phép tải xuống. Vòng đời Nháp ->
            # Chờ duyệt -> Đã duyệt -> Đã xuất bản / Bị từ chối. Xoá MỀM (deleted_at), chỉ xoá
            # được ở trạng thái Nháp hoặc Bị từ chối.
            'KhoHocLieu': 'học liệu',
            # /exams — Xây dựng nội dung > Bài kiểm tra.
            # Bài kiểm tra (EXAM): Tên · Môn học · Khối lớp · Chủ đề · Thời gian làm bài ·
            # Loại đề (Ngân hàng câu hỏi (ma trận) / Nhập tay / File PDF) + cấu hình chấm
            # điểm & trộn đề. Vòng đời Nháp -> Chờ duyệt -> Đã duyệt -> Đã xuất bản / Bị từ
            # chối / Lưu trữ. Màn KHÔNG có chức năng Xoá.
            'BaiKiemTra': 'bài kiểm tra',
            # /accounts — Quản trị > Tài khoản (TKCT_TK.md Mục 2 + Mục 4.3).
            'TaiKhoan': 'tài khoản',
        },
    ),
}


def get(name):
    if name not in ROLES:
        raise SystemExit('role phải là một trong: %s' % ', '.join(ROLES))
    return ROLES[name]

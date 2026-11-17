#!/bin/bash
# Chuỗi sinh bộ case màn "Báo cáo động" (moet-datalake, /dynamic-reports) — chạy lại được từ đầu.
# Mỗi bước theo huong-dan/HUONG-DAN-SU-DUNG.md §3 kịch bản A (bản 2026-09-10).
#
# ĐẶC THÙ CỦA MÀN NÀY — khác 4 chuỗi anh em (LoaiNguon · LoaiLuuTru · NhomNguon · ViTriLuuTru):
#   · Màn có HAI THẺ dùng chung một route. Người đặt việc chốt 2026-09-10: mỗi thẻ MỘT SHEET
#     trong CÙNG file, chức năng của thẻ nào đặt đúng sheet của thẻ đó ⇒ hồ sơ màn khai thẻ
#     "Bộ dữ liệu" ở `man_phu` với `noi_dat: "sheet_rieng"` + `sheet: "BP-BoDuLieu"`.
#     `new_from_base.py` dựng sheet thứ hai ngay trong bước 1; mọi bộ bơm/rà sau đó tự chạy cho
#     CẢ HAI sheet (`qalib.iter_role_files` sinh từng sheet BP).
#   · Ba màn phụ CÓ THẬT của thẻ Báo cáo (`/create` · `/:id` · `/:id/edit-chart`) khai
#     `noi_dat: "cung_sheet"` nên nằm chung sheet BP-BaoCaoDong, chung dãy mã case.
#   · CN `TẢI VỀ BÁO CÁO` dùng nhóm `Chức năng Tải về` -> `complete_func.kind()` xếp vào họ
#     `Xuất Excel` (đúng bản chất: tải một tệp về máy), nhưng KHÔNG chạy `fix_cn_xuatexcel.py`
#     cho nó — chỉ 2 CN mang chữ "XUẤT EXCEL" mới bị lược Validate + ATTT.
#   · Hồ sơ màn khai `giu_nut_tao` cho 2 nhóm `Button Thêm biểu đồ` / `Button Tạo bộ dữ liệu
#     mới` ở CN Sửa: §5.6 điểm 1 bắt bỏ mọi nhóm `Button Thêm …` khỏi CN Sửa, nhưng hai nút này
#     là control THẬT của chính wizard Sửa (BA BR-BCD-16-5 / AF-04 / Bảng thành phần mục 4).
#     Miễn trừ khai ở hồ sơ màn nên `fix_cn_sua` KHÔNG bỏ và `audit_sua` KHÔNG kêu — luật vẫn
#     còn hiệu lực cho mọi nhóm khác (qalib.doc_giu_nut_tao).
# KHÔNG chạy `patch_rangbuoc.py` (màn không có cặp Từ/Đến — đã kiểm: +0) và KHÔNG chạy
# `sync_gdc_zoom_steps.py` (lệnh vá bộ case CŨ, đường sinh mới đã đúng).
# ⚠️ `pipefail` là BẮT BUỘC, không phải cho đẹp: mọi bước ở đây đều `| tail -N`, mà trong bash
# trạng thái thoát của một pipeline là của LỆNH CUỐI (`tail`, luôn 0) ⇒ chỉ `set -e` thì bước 1
# CHẾT mà chuỗi vẫn chạy hết và in "XONG". Đã dính thật 2026-09-11: file đích đang mở trong
# LibreOffice nên `new_from_base` từ chối ghi, 10 bước sau im lặng no-op ("BỎ QUA (đang mở)"),
# chuỗi báo XONG và bộ case trên đĩa vẫn là bản cũ.
set -euo pipefail
# Suy đường dẫn từ CHÍNH VỊ TRÍ file này, không cắm cứng: chuỗi nằm ở
# <repo>/testCase/<Role>/ho-so-man/ nên `../../..` là gốc repo. Bản cũ cắm
# `/home/khuetm/Desktop/tool_v2` ⇒ trên máy khác là gãy, mà TỆ HƠN: chạy từ một bản SAO trên
# cùng máy thì nó lặng lẽ ghi vào bộ case của bản GỐC (đã dính khi thử 2026-09-12).
# `QA_TESTCASE_DIR` vẫn cho đè bằng biến môi trường như cũ.
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
cd "$ROOT/tools"
export QA_PROJECT=moetdl QA_TESTCASE_DIR="${QA_TESTCASE_DIR:-$ROOT/testCase}"
R=ChuyenVien; F=BaoCaoDong
SPEC="${1:-$QA_TESTCASE_DIR/$R/ho-so-man/Testcase-Role-$R-$F.json}"
OUT="$QA_TESTCASE_DIR/$R/testcase/Testcase-Role-$R-$F.xlsx"

step(){ echo; echo "########## $* ##########"; }

# TIỀN-BAY: khoá LibreOffice (README "Quy tắc tiền-bay"). Kiểm CẢ THƯ MỤC vì các lệnh chạy theo
# role sẽ bỏ qua bất kỳ file nào đang mở, không chỉ file đích.
LOCKS=$(ls -a "$(dirname "$OUT")" | grep -iE '^\.~lock.*#' || true)
if [ -n "$LOCKS" ]; then
  echo "DỪNG — còn file đang mở trong LibreOffice, đóng (KHÔNG lưu) rồi chạy lại:"
  echo "$LOCKS" | sed 's/^\.~lock\.//; s/#$//; s/^/   · /'
  exit 1
fi
if [ ! -f "$SPEC" ]; then echo "DỪNG — không thấy hồ sơ màn: $SPEC"; exit 1; fi

# KHÔNG `rm -f $OUT`: new_from_base.py chép bản lùi vào `bak/` rồi mới đè khung mới.
step "1. DỰNG KHUNG (2 sheet)"
python3 new_from_base.py --out "$OUT" --spec "$SPEC" --apply --force | tail -4
step "2. BƠM ĐỊNH MỨC"        ; python3 patch_quota.py $R $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "3. KHỐI CHỨC NĂNG"      ; python3 complete_func.py $R $F | tail -2
step "4. KHỐI ATTT"           ; python3 complete_attt.py $R $F | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "5a. TÌM KIẾM CHUNG"     ; python3 patch_timkiemchung.py  --role $R $F --apply | tail -2
step "5b. TÌM KIẾM ĐƠN LẺ"    ; python3 patch_timkiem_donle.py --role $R $F --create --apply | tail -2
step "5c. TÌM KIẾM KẾT HỢP"   ; python3 patch_kethop.py        $R $F --create | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "6a. CN CHUYỂN TRẠNG THÁI"; python3 patch_cn_trangthai.py --role $R $F --apply | tail -2
step "6b. HỦY BỎ Ở FORM"      ; python3 patch_form_huybo.py --role $R $F --apply | tail -2
step "6c. CHỨC NĂNG CN XÓA"   ; python3 patch_xoa_fn.py --role $R $F --apply | tail -2
step "6d. CN XUẤT EXCEL"      ; python3 patch_excel_cn.py --role $R $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "7a. ATTT PER-FIELD"     ; python3 patch_attt_field.py      --role $R --only $F --apply | tail -2
step "7b. DỰNG DÒNG NHÓM"     ; python3 restructure_attt_field.py --role $R --only $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
# ── CHỈ THỊ 2026-09-10 — chạy SAU khi MỌI nhóm control đã có đủ (bước 2 → 7) ──────────────
step "8a. BỎ/CHUẨN CASE 10/09"; python3 fix_chi_thi_0910.py   $R $F --apply | tail -2
step "8b. CHUẨN CN XUẤT EXCEL"; python3 fix_cn_xuatexcel.py   $R $F --apply | tail -2
step "8c. THỨ TỰ KHỐI VALIDATE"; python3 fix_thu_tu_validate.py $R $F --apply | tail -2
step "8d. LIỆT KÊ GIAO DIỆN"  ; python3 patch_giaodien.py     $R $F --apply --force | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
# ── BA ĐIỂM §5.6 + hậu tố ────────────────────────────────────────────────────────────────
step "9a. §5.6 CN SỬA"        ; python3 fix_cn_sua.py      $R $F --apply | tail -2
step "9b. MẶC ĐỊNH CN SỬA"    ; python3 fix_macdinh_sua.py $R $F --mo-ho --apply | tail -2
step "9c. CỜ CẦN VERIFY"      ; python3 fix_can_verify.py  $R $F --apply | tail -2
step "9d. HẬU TỐ nếu có"      ; python3 fix_hau_to.py      $R $F --apply | tail -2
A6="$QA_TESTCASE_DIR/$R/ho-so-man/a6-BaoCaoDong.py"
step "10. A6 — NỘI DUNG THẬT"
if [ -f "$A6" ]; then python3 "$A6" --apply | tail -3; else echo "  (chưa có a6-BaoCaoDong.py — bỏ qua)"; fi
# ── BẢN CHỮ MẪU + RÚT GỌN cột D (chỉ thị 2026-09-11/12) — chạy SAU A6 vì A6 mới là bước
#    ghi nội dung thật vào cột C/D; rút gọn trước A6 thì A6 ghi đè lại chữ dài.
#    Thiếu hai bước này thì SINH MỚI ra bộ chưa gọt: đo 2026-09-12 trên 5 màn —
#    `quá chi tiết` 224 vs 85 của bộ đã gọt, `lạc mục đích` 22 vs 0.
step "10e. BẢN CHỮ MẪU"       ; python3 fix_kq_mau.py $R $F --mau --de-mat-ground --khoi-khac --apply | tail -2
step "10f. BỔ SUNG Ý MẪU"     ; python3 fix_kq_mau.py $R $F --apply | tail -2
step "10g. RÚT GỌN CỘT D"     ; python3 fix_kq_validate.py $R $F --apply | tail -2
step "11. ÁP 6 LỚP CÔNG THỨC" ; python3 formula_layer.py "$OUT" | grep -E 'case, dong|ghi [0-9]'
echo; echo "########## XONG — $OUT ##########"

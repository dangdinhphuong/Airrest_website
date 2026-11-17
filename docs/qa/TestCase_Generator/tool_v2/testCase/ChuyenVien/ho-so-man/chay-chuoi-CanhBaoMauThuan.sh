#!/bin/bash
# Chuỗi sinh bộ case màn "Cảnh báo mâu thuẫn" (moet-datalake) — chạy lại được từ đầu.
# Viết 2026-09-12: đây là màn DUY NHẤT trong 6 màn chưa có chuỗi, nên đường sinh mới của nó
# chưa từng được kiểm chứng. Theo huong-dan/HUONG-DAN-SU-DUNG.md §3 kịch bản A.
#
# Màn CHỈ-ĐỌC — 4 CN: Danh sách · Tìm kiếm & lọc · Xem chi tiết mâu thuẫn · Xem ma trận.
# Vì vậy CỐ Ý BỎ các bước chỉ dành cho màn có ghi dữ liệu (chạy vào cũng chỉ no-op, nhưng bỏ
# hẳn cho chuỗi đọc ra đúng phạm vi màn):
#   · `patch_form_huybo` · `patch_xoa_fn` · `fix_cn_sua` · `fix_macdinh_sua` — không có CN
#     Thêm/Sửa/Xoá nào;
#   · `patch_excel_cn` · `fix_cn_xuatexcel` — màn không có CN Xuất excel
#     (`grounding.khong_co` đã khai).
# Màn phụ `Chi tiết mâu thuẫn` để `noi_dat: cung_sheet` ⇒ không tách sheet riêng.
#
# ⚠️ `pipefail` BẮT BUỘC: mọi bước đều `| tail -N`, trạng thái thoát của pipeline là của lệnh
# CUỐI (`tail`, luôn 0) ⇒ chỉ `set -e` thì bước 1 chết mà chuỗi vẫn in "XONG".
set -eo pipefail
# Suy đường dẫn từ CHÍNH VỊ TRÍ file này, không cắm cứng: chuỗi nằm ở
# <repo>/testCase/<Role>/ho-so-man/ nên `../../..` là gốc repo. Bản cũ cắm
# `/home/khuetm/Desktop/tool_v2` ⇒ trên máy khác là gãy, mà TỆ HƠN: chạy từ một bản SAO trên
# cùng máy thì nó lặng lẽ ghi vào bộ case của bản GỐC (đã dính khi thử 2026-09-12).
# `QA_TESTCASE_DIR` vẫn cho đè bằng biến môi trường như cũ.
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
cd "$ROOT/tools"
export QA_PROJECT=moetdl QA_TESTCASE_DIR="${QA_TESTCASE_DIR:-$ROOT/testCase}"
R=ChuyenVien; F=CanhBaoMauThuan
SPEC="${1:-$QA_TESTCASE_DIR/$R/ho-so-man/Testcase-Role-$R-$F.json}"
OUT="$QA_TESTCASE_DIR/$R/testcase/Testcase-Role-$R-$F.xlsx"

step(){ echo; echo "########## $* ##########"; }

# TIỀN-BAY: khoá LibreOffice — kiểm CẢ THƯ MỤC vì lệnh chạy theo role bỏ qua mọi file đang mở.
LOCKS=$(ls -a "$(dirname "$OUT")" | grep -iE '^\.~lock.*#' || true)
if [ -n "$LOCKS" ]; then
  echo "DỪNG — còn file đang mở trong LibreOffice, đóng (KHÔNG lưu) rồi chạy lại:"
  echo "$LOCKS" | sed 's/^\.~lock\.//; s/#$//; s/^/   · /'
  exit 1
fi

step "1. DỰNG KHUNG"
python3 new_from_base.py --out "$OUT" --spec "$SPEC" --apply | tail -3
step "2. BƠM ĐỊNH MỨC"        ; python3 patch_quota.py $R $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "3. KHỐI CHỨC NĂNG"      ; python3 complete_func.py $R $F | tail -2
step "4. KHỐI ATTT"           ; python3 complete_attt.py $R $F | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "5a. TÌM KIẾM CHUNG"     ; python3 patch_timkiemchung.py  --role $R $F --apply | tail -2
step "5b. TÌM KIẾM ĐƠN LẺ"    ; python3 patch_timkiem_donle.py --role $R $F --create --apply | tail -2
step "5c. TÌM KIẾM KẾT HỢP"   ; python3 patch_kethop.py        $R $F --create | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "6. RÀNG BUỘC CẶP"       ; python3 patch_rangbuoc.py $R $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "7a. ATTT PER-FIELD"     ; python3 patch_attt_field.py      --role $R --only $F --apply | tail -2
step "7b. DỰNG DÒNG NHÓM"     ; python3 restructure_attt_field.py --role $R --only $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
# ── CHỈ THỊ 2026-09-10 — chạy SAU khi MỌI nhóm control đã có đủ ───────────────────────────
step "8a. BỎ/CHUẨN CASE 10/09"; python3 fix_chi_thi_0910.py    $R $F --apply | tail -2
step "8b. THỨ TỰ KHỐI VALIDATE"; python3 fix_thu_tu_validate.py $R $F --apply | tail -2
step "8c. LIỆT KÊ GIAO DIỆN"  ; python3 patch_giaodien.py      $R $F --apply --force | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "9a. CỜ CẦN VERIFY"      ; python3 fix_can_verify.py  $R $F --apply | tail -2
step "9b. HẬU TỐ nếu có"      ; python3 fix_hau_to.py      $R $F --apply | tail -2
step "10. A6 — NỘI DUNG THẬT"
A6="$QA_TESTCASE_DIR/$R/ho-so-man/a6-$F.py"
if [ -f "$A6" ]; then python3 "$A6" --apply | tail -3; else echo "  (chưa có a6-$F.py — bỏ qua)"; fi
# ── BẢN CHỮ MẪU + RÚT GỌN cột D — SAU A6, vì A6 mới là bước ghi nội dung thật vào C/D.
step "11a. BẢN CHỮ MẪU"       ; python3 fix_kq_mau.py $R $F --mau --de-mat-ground --khoi-khac --apply | tail -2
step "11b. BỔ SUNG Ý MẪU"     ; python3 fix_kq_mau.py $R $F --apply | tail -2
step "11c. RÚT GỌN CỘT D"     ; python3 fix_kq_validate.py $R $F --apply | tail -2
step "12. ÁP 6 LỚP CÔNG THỨC" ; python3 formula_layer.py "$OUT" | grep -E 'case, dong|ghi [0-9]'
echo; echo "########## XONG — $OUT ##########"

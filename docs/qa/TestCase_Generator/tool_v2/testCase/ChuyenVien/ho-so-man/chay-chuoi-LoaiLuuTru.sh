#!/bin/bash
# Chuỗi sinh bộ case màn "Loại lưu trữ" (moet-datalake) — chạy lại được từ đầu.
# Mỗi bước theo huong-dan/HUONG-DAN-SU-DUNG.md §3 kịch bản A (bản 2026-09-10).
#
# KHÁC chuỗi `chay-chuoi-LoaiNguon.sh`:
#   · 4 lệnh của chỉ thị 2026-09-10 đã DỜI xuống **bước 7b** (chúng đọc nhóm control ĐANG CÓ
#     trong file, mà bước 3→7 còn sinh thêm nhóm) — đúng thứ tự HDSD §3 hiện hành.
#   · `restructure_attt_field.py` CÓ `--only` -> bỏ hẳn mẹo `_hold/` (mẹo đó là để lách việc
#     script chạy cả role; đọc lại mã nguồn dòng 69/78 thì cờ này vốn đã có).
#   · KHÔNG chạy `patch_cn_trangthai.py`: màn này không có CN Chuyển trạng thái, mà lệnh đó
#     chỉ nhận `--role` nên chạy là sửa lây 2 file ngoài phạm vi.
#   · KHÔNG chạy `sync_gdc_zoom_steps.py`: đó là lệnh vá bộ case CŨ, đường sinh mới đã đúng.
# ⚠️ `pipefail` là BẮT BUỘC: mọi bước ở đây đều `| tail -N`, mà trạng thái thoát của một pipeline
# trong bash là của LỆNH CUỐI (`tail`, luôn 0) ⇒ chỉ `set -e` thì bước 1 CHẾT mà chuỗi vẫn chạy
# hết và in "XONG". Đã dính thật 2026-09-11 ở chuỗi `BaoCaoDong`: file đích đang mở trong
# LibreOffice nên `new_from_base` từ chối ghi, 10 bước sau im lặng no-op ("BỎ QUA (đang mở)"),
# chuỗi báo XONG mà bộ case trên đĩa vẫn là bản cũ.
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
R=ChuyenVien; F=LoaiLuuTru
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

# KHÔNG `rm -f $OUT`: new_from_base.py chép bản lùi vào `bak/` rồi mới đè khung mới.
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
step "7a. HỦY BỎ Ở FORM"      ; python3 patch_form_huybo.py --role $R $F --apply | tail -2
step "7b. CN XUẤT EXCEL"      ; python3 patch_excel_cn.py --role $R $F --apply | tail -2
step "7c. CHỨC NĂNG CN XÓA"   ; python3 patch_xoa_fn.py --role $R $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "8a. ATTT PER-FIELD"     ; python3 patch_attt_field.py      --role $R --only $F --apply | tail -2
step "8b. DỰNG DÒNG NHÓM"     ; python3 restructure_attt_field.py --role $R --only $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
# ── CHỈ THỊ 2026-09-10 — chạy SAU khi MỌI nhóm control đã có đủ (bước 2 → 8) ──────────────
step "9a. BỎ/CHUẨN CASE 10/09"; python3 fix_chi_thi_0910.py   $R $F --apply | tail -2
step "9b. CN XUẤT EXCEL 2 CASE"; python3 fix_cn_xuatexcel.py  $R $F --apply | tail -2
step "9c. THỨ TỰ KHỐI VALIDATE"; python3 fix_thu_tu_validate.py $R $F --apply | tail -2
step "9d. LIỆT KÊ GIAO DIỆN"  ; python3 patch_giaodien.py     $R $F --apply --force | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
# ── BA ĐIỂM §5.6 + hậu tố ────────────────────────────────────────────────────────────────
step "10a. §5.6 CN SỬA"       ; python3 fix_cn_sua.py      $R $F --apply | tail -2
step "10b. MẶC ĐỊNH CN SỬA"   ; python3 fix_macdinh_sua.py $R $F --mo-ho --apply | tail -2
step "10c. CỜ CẦN VERIFY"     ; python3 fix_can_verify.py  $R $F --apply | tail -2
step "10d. HẬU TỐ nếu có"     ; python3 fix_hau_to.py      $R $F --apply | tail -2
# ── A6 — NỘI DUNG THẬT (bổ sung 2026-09-14) ──────────────────────────────────────────────
#    Bốn chuỗi (LoaiLuuTru · LoaiNguon · NhomNguon · ViTriLuuTru) TỪNG THIẾU HẲN bước này, mà
#    chú thích ngay dưới vẫn ghi "chạy SAU A6" nên đọc qua tưởng là có. Hai trong bốn màn CÓ
#    sẵn `a6-<Màn>.py` mà chuỗi không bao giờ gọi ⇒ sinh lại là mất trắng nội dung A6, trong khi
#    14 bộ rà cấu trúc vẫn ra 0 (phủ grounding tụt 93% -> ~50%). Rà bằng `audit_chuoi.py`.
step "10d1. A6 — NỘI DUNG THẬT"
A6="$QA_TESTCASE_DIR/$R/ho-so-man/a6-$F.py"
if [ -f "$A6" ]; then python3 "$A6" --apply | tail -3; else echo "  (chưa có a6-$F.py — bỏ qua)"; fi
# ── BẢN CHỮ MẪU + RÚT GỌN cột D (chỉ thị 2026-09-11/12) — chạy SAU A6 vì A6 mới là bước
#    ghi nội dung thật vào cột C/D; rút gọn trước A6 thì A6 ghi đè lại chữ dài.
#    Thiếu hai bước này thì SINH MỚI ra bộ chưa gọt: đo 2026-09-12 trên 5 màn —
#    `quá chi tiết` 224 vs 85 của bộ đã gọt, `lạc mục đích` 22 vs 0.
step "10e. BẢN CHỮ MẪU"       ; python3 fix_kq_mau.py $R $F --mau --de-mat-ground --khoi-khac --apply | tail -2
step "10f. BỔ SUNG Ý MẪU"     ; python3 fix_kq_mau.py $R $F --apply | tail -2
step "10g. RÚT GỌN CỘT D"     ; python3 fix_kq_validate.py $R $F --apply | tail -2
step "11. ÁP 6 LỚP CÔNG THỨC" ; python3 formula_layer.py "$OUT" | grep -E 'case, dong|ghi [0-9]'
echo; echo "########## XONG — $OUT ##########"

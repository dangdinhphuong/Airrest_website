#!/bin/bash
# Chuỗi sinh bộ case màn "Loại nguồn" (moet-datalake) — chạy lại được từ đầu.
# Mỗi bước theo huong-dan/HUONG-DAN-SU-DUNG.md §3 kịch bản A.
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
R=ChuyenVien; F=LoaiNguon
# Mặc định lấy hồ sơ màn cạnh bộ case — đồng bộ với 4 chuỗi còn lại. Bản cũ để `SPEC="$1"`
# nên chạy không tham số là chết ngay bước 1 ("chưa khai báo CN nào"), phát hiện 2026-09-12.
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

# KHÔNG `rm -f $OUT`: new_from_base.py chép bản lùi vào `bak/` rồi mới đè khung mới,
# xoá trước là mất bộ case cũ không lùi lại được.
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
step "6a. RÀNG BUỘC CẶP"      ; python3 patch_rangbuoc.py $R $F --apply | tail -2
step "6b. LIỆT KÊ GIAO DIỆN"  ; python3 patch_giaodien.py $R $F --apply | tail -2
step "7a. HỦY BỎ Ở FORM"      ; python3 patch_form_huybo.py --role $R $F --apply | tail -2
step "7b. CHUYỂN TRẠNG THÁI"  ; python3 patch_cn_trangthai.py --role $R --apply | tail -2
# ⚠️ BƯỚC THIẾU trong HUONG-DAN-SU-DUNG.md §3 kịch bản A (phát hiện 09/10): `complete_func`
# chỉ sinh 4/9 mục của `Chức năng Xóa`; 5 mục còn lại (hủy bỏ thao tác xóa · icon đóng ·
# click liên tục · Tab+Enter · xoá trùng 2 tab) do `patch_xoa_fn.py` bơm. Thiếu bước này thì
# `audit_func` báo đỏ mà không script nào trong chuỗi vá được.
step "7d. CHỨC NĂNG CN XÓA"   ; python3 patch_xoa_fn.py --role $R --apply | tail -2
step "7c. CN XUẤT EXCEL"      ; python3 patch_excel_cn.py --role $R $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "8a. ATTT PER-FIELD"     ; python3 patch_attt_field.py --role $R --only $F --apply | tail -2
# ⚠️ restructure_attt_field.py CHỈ lọc được --role, không lọc tên màn -> chạy cả role và
# ĐÃ sửa lây file ngoài phạm vi (đo 09/10: chèn 1 dòng nhóm sai vào CanhBaoMauThuan).
# Xử theo HUONG-DAN-SU-DUNG.md §9: tạm chuyển file ngoài phạm vi sang _hold/ (glob không đệ quy).
step "8b. DỰNG DÒNG NHÓM"
HOLD="$QA_TESTCASE_DIR/$R/testcase/_hold"
mkdir -p "$HOLD"
for f in "$QA_TESTCASE_DIR/$R/testcase"/*.xlsx; do
  case "$f" in *"-$F.xlsx") ;; *) mv "$f" "$HOLD"/ ;; esac
done
python3 restructure_attt_field.py --role $R --apply | tail -2
mv "$HOLD"/*.xlsx "$QA_TESTCASE_DIR/$R/testcase/" 2>/dev/null || true
rmdir "$HOLD" 2>/dev/null || true
echo "   (đã trả file ngoài phạm vi về chỗ cũ)"
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "9a. §5.6 CN SỬA"        ; python3 fix_cn_sua.py      $R $F --apply | tail -2
step "9b. MẶC ĐỊNH CN SỬA"    ; python3 fix_macdinh_sua.py $R $F --mo-ho --apply | tail -2
step "9c. CỜ CẦN VERIFY"      ; python3 fix_can_verify.py  $R $F --apply | tail -2
# ── BỐN BƯỚC 2026-09-10 (bổ sung 12/09 — chuỗi này là bản CŨ NHẤT, thiếu so với 4 chuỗi kia).
step "9c1. BỎ/CHUẨN CASE 10/09"; python3 fix_chi_thi_0910.py    $R $F --apply | tail -2
step "9c2. CN XUẤT EXCEL"      ; python3 fix_cn_xuatexcel.py    $R $F --apply | tail -2
step "9c3. THỨ TỰ KHỐI VALIDATE"; python3 fix_thu_tu_validate.py $R $F --apply | tail -2
step "9c4. HẬU TỐ nếu có"      ; python3 fix_hau_to.py          $R $F --apply | tail -2
# ── A6 — NỘI DUNG THẬT (bổ sung 2026-09-14) ──────────────────────────────────────────────
#    Bốn chuỗi (LoaiLuuTru · LoaiNguon · NhomNguon · ViTriLuuTru) TỪNG THIẾU HẲN bước này, mà
#    chú thích ngay dưới vẫn ghi "chạy SAU A6" nên đọc qua tưởng là có. Hai trong bốn màn CÓ
#    sẵn `a6-<Màn>.py` mà chuỗi không bao giờ gọi ⇒ sinh lại là mất trắng nội dung A6, trong khi
#    14 bộ rà cấu trúc vẫn ra 0 (phủ grounding tụt 93% -> ~50%). Rà bằng `audit_chuoi.py`.
step "10d1. A6 — NỘI DUNG THẬT"
A6="$QA_TESTCASE_DIR/$R/ho-so-man/a6-$F.py"
if [ -f "$A6" ]; then python3 "$A6" --apply | tail -3; else echo "  (chưa có a6-$F.py — bỏ qua)"; fi
# ── BẢN CHỮ MẪU + RÚT GỌN cột D (chỉ thị 2026-09-11/12) — chạy SAU A6.
step "9d. BẢN CHỮ MẪU"        ; python3 fix_kq_mau.py $R $F --mau --de-mat-ground --khoi-khac --apply | tail -2
step "9e. BỔ SUNG Ý MẪU"      ; python3 fix_kq_mau.py $R $F --apply | tail -2
step "9f. RÚT GỌN CỘT D"      ; python3 fix_kq_validate.py $R $F --apply | tail -2
step "10. ÁP 6 LỚP CÔNG THỨC" ; python3 formula_layer.py "$OUT" | grep -E 'case, dong|ghi [0-9]'
echo; echo "########## XONG — $OUT ##########"

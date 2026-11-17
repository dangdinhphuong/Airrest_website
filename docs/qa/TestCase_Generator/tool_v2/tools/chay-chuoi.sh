#!/bin/bash
# CHUỖI SINH DÙNG CHUNG — mọi dự án, mọi vai trò, mọi máy.
#
#   QA_PROJECT=<dự án> bash tools/chay-chuoi.sh <Vai trò> <Tên màn> [đường/dẫn/hồ-sơ-màn.json]
#   ví dụ:  QA_PROJECT=moetdl bash tools/chay-chuoi.sh ChuyenVien LoaiLuuTru
#
# Vì sao có file này: trước 2026-09-12 mỗi màn một `chay-chuoi-<Màn>.sh` chép tay, nên chỉ dự án
# moetdl/ChuyenVien có chuỗi — dự án khác KHÔNG có đường sinh nào. Bản dùng chung này:
#   · suy đường dẫn từ CHÍNH VỊ TRÍ file (không cắm cứng máy), `QA_TESTCASE_DIR` vẫn đè được;
#   · hỏi hồ sơ dự án để biết thư mục con chứa bộ case (`subdir_src` mỗi dự án một khác);
#   · chạy ĐỦ mọi bước. Bước không áp dụng cho màn là **no-op sạch** — đã đo 2026-09-12 trên màn
#     chỉ-đọc `CanhBaoMauThuan`: 6 bước ghi-dữ-liệu đều ra `0 file · +0 case`, verify không đổi.
#
# ⚠️ `pipefail` BẮT BUỘC: mọi bước đều `| tail -N`, trạng thái thoát của pipeline là của lệnh
# CUỐI (`tail`, luôn 0) ⇒ chỉ `set -e` thì bước 1 chết mà chuỗi vẫn in "XONG".
set -eo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
cd "$HERE"

: "${QA_PROJECT:?DỪNG — đặt QA_PROJECT (vd: QA_PROJECT=moetdl)}"
R="${1:?DỪNG — thiếu <Vai trò>}"; F="${2:?DỪNG — thiếu <Tên màn>}"
export QA_TESTCASE_DIR="${QA_TESTCASE_DIR:-$ROOT/testCase}"

# Thư mục bộ case + tiền tố tên file lấy từ HỒ SƠ DỰ ÁN, không đoán: `subdir_src` và
# `file_prefix` mỗi dự án một khác (gstem dùng `testCase/`, moetdl dùng `testcase/`).
OUT=$(python3 -c "
import sys; sys.path.insert(0,'.')
import roles
r = roles.ROLES.get('$R')
if not r: raise SystemExit('DỪNG — vai trò \"$R\" không có trong dự án $QA_PROJECT: ' + ', '.join(roles.ROLES))
print(r['dir'].rstrip('/') + '/' + roles.PROJECT['file_prefix'] + '$R-$F.xlsx')")
SPEC="${3:-$QA_TESTCASE_DIR/$R/ho-so-man/$(basename "$OUT" .xlsx).json}"

step(){ echo; echo "########## $* ##########"; }
echo "dự án=$QA_PROJECT · vai trò=$R · màn=$F"
echo "hồ sơ màn = $SPEC"
echo "file đích = $OUT"
[ -f "$SPEC" ] || { echo "DỪNG — chưa có hồ sơ màn. Grounding trước (probe_fe/probe_live/probe_routes) rồi viết $SPEC"; exit 1; }

# TIỀN-BAY: khoá LibreOffice. Kiểm CẢ THƯ MỤC vì lệnh chạy theo role bỏ qua mọi file đang mở.
LOCKS=$(ls -a "$(dirname "$OUT")" 2>/dev/null | grep -iE '^\.~lock.*#' || true)
if [ -n "$LOCKS" ]; then
  echo "DỪNG — còn file đang mở trong LibreOffice, đóng (KHÔNG lưu) rồi chạy lại:"
  echo "$LOCKS" | sed 's/^\.~lock\.//; s/#$//; s/^/   · /'; exit 1
fi

step "1. DỰNG KHUNG"          ; python3 new_from_base.py --out "$OUT" --spec "$SPEC" --apply | tail -3
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
step "7a. CN CHUYỂN TRẠNG THÁI"; python3 patch_cn_trangthai.py --role $R $F --apply | tail -2
step "7b. HỦY BỎ Ở FORM"      ; python3 patch_form_huybo.py --role $R $F --apply | tail -2
step "7c. CN XUẤT EXCEL"      ; python3 patch_excel_cn.py   --role $R $F --apply | tail -2
step "7d. CHỨC NĂNG CN XÓA"   ; python3 patch_xoa_fn.py     --role $R $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "8a. ATTT PER-FIELD"     ; python3 patch_attt_field.py       --role $R --only $F --apply | tail -2
step "8b. DỰNG DÒNG NHÓM"     ; python3 restructure_attt_field.py --role $R --only $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
# ── Chạy SAU khi MỌI nhóm control đã có đủ (bước 2 → 8) ─────────────────────────────────
step "9a. BỎ/CHUẨN CASE 10/09"; python3 fix_chi_thi_0910.py    $R $F --apply | tail -2
step "9b. CN XUẤT EXCEL 2 CASE"; python3 fix_cn_xuatexcel.py   $R $F --apply | tail -2
step "9c. THỨ TỰ KHỐI VALIDATE"; python3 fix_thu_tu_validate.py $R $F --apply | tail -2
                                python3 formula_layer.py "$OUT" | grep -E 'case, dong'
step "10a. §5.6 CN SỬA"       ; python3 fix_cn_sua.py      $R $F --apply | tail -2
step "10b. MẶC ĐỊNH CN SỬA"   ; python3 fix_macdinh_sua.py $R $F --mo-ho --apply | tail -2
step "10c. CỜ CẦN VERIFY"     ; python3 fix_can_verify.py  $R $F --apply | tail -2
step "10d. HẬU TỐ nếu có"     ; python3 fix_hau_to.py      $R $F --apply | tail -2
# A6 là bước DUY NHẤT bơm nội dung THẬT của màn (nhãn, thông báo, giá trị) vào cột C/D.
# Chạy HAI lượt: lượt tự động đọc thẳng `grounding` của hồ sơ màn (dùng chung mọi dự án),
# rồi lượt viết tay ghi ĐÈ lên phần hành vi riêng mà máy không suy được.
step "10e. A6 TỰ ĐỘNG (hồ sơ màn)"; python3 a6_auto.py $R $F --apply | tail -4
step "10e+. A6 VIẾT TAY"
A6="$QA_TESTCASE_DIR/$R/ho-so-man/a6-$F.py"
if [ -f "$A6" ]; then python3 "$A6" --apply | tail -3; else
  # Thiếu A6 tay thì chuỗi vẫn chạy trọn và mọi bộ rà cấu trúc vẫn ra 0 — phần hành vi riêng
  # của màn (ô bị khoá khi sửa · xoá mềm · wizard…) vẫn là chữ CHUNG CHUNG. Đo 2026-09-12:
  # `LoaiLuuTru` sinh không A6 phủ grounding 49% (bản có người soạn A6: 93%), `LoaiNguon` 45%
  # (thật 74%). Bước 10e tự động đã kéo phần lớn khoảng đó, phần còn lại BÁO TO ở đây.
  echo "  ####################################################################"
  echo "  ## CHƯA CÓ a6-$F.py — phần HÀNH VI RIÊNG của màn vẫn là chữ chung ##"
  echo "  ## chung. Đọc danh sách [KHÔNG GẮN ĐƯỢC] ở bước 10e rồi soạn      ##"
  echo "  ## $QA_TESTCASE_DIR/$R/ho-so-man/a6-$F.py"
  echo "  ####################################################################"
fi
# ── BẢN CHỮ MẪU + RÚT GỌN cột D — SAU A6, vì A6 mới là bước ghi nội dung thật vào C/D;
#    rút gọn trước A6 thì A6 ghi đè lại chữ dài.
step "10f. LIỆT KÊ GIAO DIỆN"; python3 patch_giaodien.py      $R $F --apply --force | tail -2
step "10g. VAI TRÒ Ở BƯỚC 1"; python3 fix_vai_tro_buoc1.py $R $F --apply | tail -2
step "11a. BẢN CHỮ MẪU"       ; python3 fix_kq_mau.py $R $F --mau --de-mat-ground --khoi-khac --apply | tail -2
step "11b. BỔ SUNG Ý MẪU"     ; python3 fix_kq_mau.py $R $F --apply | tail -2
step "11c. RÚT GỌN CỘT D"     ; python3 fix_kq_validate.py $R $F --apply | tail -2
# ⛔ LUẬT CỨNG UI — chạy CUỐI CÙNG trong nhóm nội dung, SAU `fix_kq_mau` và `fix_kq_validate`:
#    hai bước đó ghi đè / rút gọn cột D nên đặt trước chúng là bị xoá mất. Không bước nào khác
#    đảm bảo được ô chọn mặc định + số bản ghi/trang, vì bank chỉ bơm cho nhóm CÒN THIẾU case.
step "11d. LUẬT CỨNG UI"      ; python3 fix_luat_cung.py $R $F --apply | tail -2
step "12. ÁP 6 LỚP CÔNG THỨC" ; python3 formula_layer.py "$OUT" | grep -E 'case, dong|ghi [0-9]'
step "13. RÀ LUẬT CỨNG"       ; python3 audit_luat_cung.py $R $F | tail -3
echo; echo "########## XONG — $OUT ##########"

# -*- coding: utf-8 -*-
"""ĐỐI CHIẾU nhóm control trong file test case với FE THẬT (chỉ đọc).

Lớp lỗi này **không bộ rà nào khác bắt được**: mọi phép rà hiện có chỉ kiểm *cấu trúc* và *số
lượng* — chúng không biết màn thật có gì. Viết case cho một control **không tồn tại** thì
`audit_validate_quota` vẫn ra `0·0·0·0·0·0`, `nghiemthu_0806` vẫn 0 lỗi. Luật §0.1 cấm đúng việc
đó ("hệ thống thật thắng tài liệu"), nhưng trước 2026-09-08 không có cách nào kiểm tự động.

Hai chiều:
  ① [KHÔNG THẤY]  nhóm control khai trong `.xlsx` mà nhãn KHÔNG xuất hiện trong bundle FE
                  -> ứng viên **control ma** (case viết cho thứ không có thật)
  ② [CHƯA CÓ CASE] nhãn ô nhập / placeholder có trong FE mà không nhóm nào phủ   (cờ `--reverse`)
                  -> ứng viên **bỏ sót control**. NHIỄU NẶNG: đo trên `QuanTri/ChucVu` ra **116
                  nhãn**, gần hết là nút / tiêu đề / thông báo của chunk anh em. Dùng để lướt mắt,
                  đừng coi là danh sách việc.

⚠️ Đây là bộ **GỢI Ý, không phải phán quyết** — phải soi tay từng dòng. Ba nguồn sai đã biết:
  · nhãn trong file diễn đạt khác FE ("Ô tìm kiếm" vs placeholder "Tìm theo tiêu đề");
  · control render bởi component dùng chung nằm ở **bundle entry** (cố ý không đọc, xem `probe_fe`);
  · chuỗi bị FE ghép động (`"Mã " + tên`) nên không có mặt nguyên vẹn trong mã.
Vì vậy KHÔNG có mục nào của bộ này được dùng làm căn cứ XOÁ case. Xác nhận bằng mắt trên app trước.

    python3 audit_control_that.py <Role> <Tên màn> <url màn> [--reverse] [--save <thư mục>]

Độ chính xác đo được 2026-09-08 (chiều ①):
    · 0 báo nhầm / 110 nhóm control THẬT — `Admin/BaiViet` (93) + `QuanTri/ChucVu` (17), 2 hệ khác nhau
    · 9/10 nhãn BỊA đặt bị bắt đúng. Ca trượt: "Ngày hết hạn bảo hành" — mọi từ của nó
      (`ngày`·`hết`·`hạn`·`bảo`·`hành`) đều là từ phổ thông có sẵn trên màn đó. Siết ngưỡng để bắt
      nốt ca này thì mất độ chính xác ở trên — CỐ Ý chọn thà bỏ sót còn hơn kêu oan.

Ví dụ đã chạy:
    python3 audit_control_that.py Admin BaiViet https://gstem.saas.coquan.vn/admin/cms/articles
"""
import argparse
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_fe
import qalib
import roles

# Nhóm KHÔNG phải control của màn -> không đối chiếu (khối bao, control khung do luật quy định)
BO_QUA = ('validate cac truong', 'giao dien chung', 'chuc nang', 'an toan thong tin',
          'phan trang', 'danh sach', 'hien thi dac thu', 'icon thao tac', 'nut thao tac',
          'checkbox chon tat ca', 'checkbox ban ghi', 'so ban ghi tren trang', 'tai file mau',
          'file excel', 'hop xac nhan', 'hop thoai', 'nap san', 'prefill')
# Nhãn quá chung -> có mặt ở mọi bundle, đối chiếu vô nghĩa
QUA_CHUNG = ('trang thai', 'ten', 'ma', 'mo ta', 'ghi chu', 'ngay', 'loai', 'so', 'tim kiem')

RX_LABEL = re.compile(r'(?:label|placeholder)\s*:\s*["\'`]([^"\'`{}]{2,60})["\'`]')
RX_CHILD = re.compile(r'children\s*:\s*"([^"{}]{2,60})"')
VN = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ'


def khong_dau(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def nhan_cua(gname):
    """Nhãn cần tìm trong FE: bỏ tiền tố loại control, bỏ chú thích trong ngoặc, bỏ nháy."""
    f = qalib.field_of(gname)
    f = re.sub(r'\s*[\(\[].*?[\)\]]\s*', ' ', f)      # bỏ "(chỉ hiện khi tạo mới)"
    f = f.strip(' "\'«»').strip()
    return re.sub(r'\s+', ' ', f)


# Từ VỰNG CỦA QA, không phải nhãn trên giao diện -> cắt khỏi đầu tên nhóm trước khi đối chiếu
MO_TA = ('khối lặp', 'thông số', 'khối', 'vùng', 'nhóm', 'bộ', 'trường', 'ô', 'cột', 'tab')
# Từ phổ thông -> có ở mọi bundle, không mang thông tin nhận dạng
STOP = {'của', 'các', 'khi', 'hoặc', 'cho', 'trên', 'dưới', 'mỗi', 'một', 'với', 'theo',
        'trong', 'ngoài', 'bị', 'là', 'và', 'thông', 'tin', 'dữ', 'liệu', 'giá', 'trị',
        'nhập', 'chọn', 'có', 'không', 'này', 'đã', 'được', 'ở', 'từ', 'đến'}


def bo_mo_ta(nhan):
    n = nhan.strip()
    doi = True
    while doi:
        doi = False
        for w in MO_TA:
            if n.lower().startswith(w + ' '):
                n = n[len(w) + 1:].strip()
                doi = True
    return n or nhan


def tokens(nhan):
    """Từ mang thông tin, GIỮ DẤU. Bỏ dấu là tiếng Việt đụng nhau hàng loạt
    (`bảo`↔`báo`, `hành`↔`hạnh`) nên phép 'vắng mặt' mất hết giá trị."""
    return [w for w in re.split(r'[^0-9a-zA-ZÀ-ỹ]+', bo_mo_ta(nhan).lower())
            if len(w) >= 2 and w not in STOP]


def co_trong(nhan, blob, blob_kd, blob_low=None):
    """(có mặt?, số từ khớp / tổng) — khớp NGUYÊN TỪ trên bundle có dấu.

    Tiêu chí: **từ dài nhất phải có mặt** và **>= một nửa số từ có mặt**. Hai lần hiệu chỉnh:
      · bản 1 đòi khớp nguyên chuỗi -> 4/4 báo nhầm trên `Admin/BaiViet`;
      · bản 2 nới thành "khớp 1 từ bất kỳ, bỏ dấu" -> hết báo nhầm nhưng chỉ bắt 1/4 control ma
        trong phép thử (từ bỏ dấu như `ngay`·`bao`·`han` có ở mọi bundle).
    """
    low = blob_low if blob_low is not None else blob.lower()
    n = nhan.strip()
    if len(n) < 3:
        return True, (0, 0)
    if n.lower() in low or khong_dau(n) in blob_kd:
        return True, (1, 1)
    tu = tokens(n)
    if not tu:
        return True, (0, 0)
    co = {w: bool(re.search(r'(?<![0-9a-zA-ZÀ-ỹ])%s(?![0-9a-zA-ZÀ-ỹ])' % re.escape(w), low)) for w in tu}
    hit = sum(co.values())
    dai_nhat = max(tu, key=len)
    return (co[dai_nhat] and hit * 2 >= len(tu)), (hit, len(tu))


def quet_nhom(tc):
    """[(CN, tên nhóm, số case)] — nhóm control trong khối Giao diện/Validate."""
    out, cn, grp, cur, n = [], None, None, None, 0
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'case':
            if cur:
                n += 1
            continue
        if cur:
            out.append((cn, cur, n))
            cur, n = None, 0
        if lv == 'cn':
            cn, grp = b, None
        elif lv == 'grp':
            grp = khong_dau(b)
        elif lv in ('sub', 'sub2'):
            if grp and 'giao dien' in grp and not any(k in khong_dau(b) for k in BO_QUA):
                cur, n = b, 0
    if cur:
        out.append((cn, cur, n))
    return out


def main():
    ap = argparse.ArgumentParser(description='Đối chiếu nhóm control trong .xlsx với FE thật')
    ap.add_argument('role')
    ap.add_argument('man', help='tên màn (khớp chuỗi con trong tên file)')
    ap.add_argument('url', help='URL đầy đủ của màn trên hệ thống thật')
    ap.add_argument('--reverse', action='store_true', help='thêm chiều ②: nhãn FE chưa có case')
    ap.add_argument('--save', help='giữ lại .js đã tải')
    a = ap.parse_args()
    roles.get(a.role)

    # MỘT url = MỘT màn. `--man` khớp chuỗi con nên "BaiViet" ôm luôn "DanhMucBaiViet" — màn khác,
    # chunk khác, mọi control của nó tất nhiên "không thấy" ⇒ 4 dòng rác (đo 2026-09-08).
    # Khớp nhiều file thì DỪNG, bắt gõ rõ tên, thay vì in báo cáo sai.
    khop = [sh.name for sh in qalib.iter_role_files(a.role, a.man)]
    chinh_xac = [n for n in set(khop) if n.lower() == a.man.lower()]
    if chinh_xac:
        khop = chinh_xac                              # gõ đúng tên màn thì lấy đúng màn đó
    if len(set(khop)) > 1:
        raise SystemExit('LỖI: "%s" khớp %d màn: %s\n'
                         '      Một lần chạy chỉ đối chiếu ĐÚNG MỘT màn với ĐÚNG MỘT url.'
                         % (a.man, len(set(khop)), ', '.join(sorted(set(khop)))))
    if not khop:
        raise SystemExit('LỖI: không thấy màn nào khớp "%s" trong role %s' % (a.man, a.role))

    blob, _, _, _ = probe_fe.thu_thap(a.url, save=a.save)
    blob_kd = khong_dau(blob)
    blob_low = blob.lower()

    tong_nhom = t_ma = 0
    nhan_da_phu = []
    for sh in qalib.iter_role_files(a.role, a.man):
        if sh.name not in khop:
            continue
        ra = []
        for cn, g, ncase in quet_nhom(sh.tc):
            nhan = nhan_cua(g)
            tong_nhom += 1
            nhan_da_phu.append(khong_dau(nhan))
            if khong_dau(nhan) in QUA_CHUNG:
                continue                              # nhãn chung chung -> bỏ, tránh kết luận bừa
            ok, (hit, tong) = co_trong(nhan, blob, blob_kd, blob_low)
            if not ok:
                ra.append((cn, g, nhan, ncase, hit, tong))
                t_ma += 1
        if ra:
            print('####', sh.name)
            for cn, g, nhan, ncase, hit, tong in ra:
                print('   [KHÔNG THẤY] %-32s %-32s "%s" — %d/%d từ khớp · %d case'
                      % (cn[:32], g[:32], nhan[:24], hit, tong, ncase))

    print('\n=== %s/%s — đối chiếu %d nhóm control: %d nhóm KHÔNG thấy nhãn trong FE ==='
          % (a.role, a.man, tong_nhom, t_ma))
    if t_ma:
        print('⚠️  GỢI Ý, không phải phán quyết. Mở app xác nhận bằng mắt rồi mới sửa file —')
        print('    nhãn diễn đạt khác / component dùng chung / chuỗi ghép động đều gây báo nhầm.')

    if a.reverse:
        print('\n--- ② NHÃN CÓ TRONG FE MÀ CHƯA NHÓM NÀO PHỦ (nhiễu cao, chỉ để gợi ý) ---')
        cand = set()
        for rx in (RX_LABEL, RX_CHILD):
            for m in rx.finditer(blob):
                t = m.group(1).strip()
                if 2 < len(t) < 46 and any(c in VN for c in t.lower()):
                    cand.add(t)
        thieu = [t for t in sorted(cand)
                 if not any(khong_dau(t) in p or p in khong_dau(t) for p in nhan_da_phu if p)]
        for t in thieu[:40]:
            print('   [CHƯA CÓ CASE]', t)
        print('   (%d nhãn — phần lớn là nút/tiêu đề/thông báo, KHÔNG phải ô nhập)' % len(thieu))


if __name__ == '__main__':
    main()

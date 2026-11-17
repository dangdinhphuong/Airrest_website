# -*- coding: utf-8 -*-
"""Rà NỘI DUNG cột C/D so với dữ kiện đã ground ở hồ sơ màn (chỉ đọc, offline).

Đây là điểm mù LỚN NHẤT của bộ tool tính tới 2026-09-09: 11 bộ rà kia đo **cấu trúc + định mức**,
không đo **nội dung**. Đo thật: bộ `TrinhDoNgoaiNgu` phải ghi lại **57%** số case ở cột C/D,
bộ `Dữ liệu lỗi` lượt đầu **79%** — trong khi cả 11 bộ đều báo `0`. Nghĩa là **bỏ hẳn bước
grounding vẫn nghiệm thu sạch**, nội dung là chữ chay mà không ai biết.

Không thể rà "nội dung đúng màn hay không" bằng máy. Nhưng rà được **bốn thứ đo được**, tất cả
dựa trên chính hồ sơ màn — nơi bước A6 đã ground:

  ① **PHỦ GROUNDING** — chuỗi verbatim đã ground (`grounding.verbatim`, `hang_so`) mà **không
     case nào dùng**. Đây là con số quan trọng nhất: dữ kiện đã lấy về mà không đưa vào case
     thì bước A6 chưa xong. In tỉ lệ dùng/tổng.
  ② **CHỮ CHAY** — case nói về *thông báo / báo lỗi* mà cột D **không chứa** một chuỗi thông báo
     verbatim nào, trong khi hồ sơ CÓ khai. Đúng lớp *"Hệ thống báo lỗi"* chung chung mà §8.2 cấm.
  ③ **NGƯỠNG CHAY** — C/D còn `N ký tự` · `tối đa N` · `X chữ số` (chữ thay số) trong khi hồ sơ
     đã khai `hang_so`.
  ④ **CHỖ GIỮ KHÔNG CỜ** — C/D còn chỗ giữ **của dữ kiện phải hỏi dev** (tên bảng · tên cột ·
     ngưỡng độ dài) mà cột T không mang cờ `[CẦN VERIFY]`/`[RỦI RO]`. §11.4 cho phép *"thà gắn
     cờ hơn bịa"*, nhưng chỗ giữ **không cờ** là nợ ẩn.
     ⚠️ KHÔNG xét chỗ giữ **giá trị lúc chạy** (`<tên tệp>` · `<từ ngày>` · `<giá trị>`): đó là
     cách viết ĐÚNG cho dữ liệu thay đổi theo lần chạy. Bản đầu xét mọi `<…>` và báo oan 4/4 ca
     trên bộ đã nghiệm thu — thu hẹp về đúng lớp mà cờ `[CẦN VERIFY]` sinh ra để gắn.

File không có hồ sơ màn ⇒ **KHÔNG ĐO ĐƯỢC** (in riêng, không tính sạch) — cùng lối
`audit_man_phu.py`.

    python3 audit_noi_dung.py <role> [tên màn] [--chi-tiet]
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import roles

norm = qalib.norm
CHI_TIET = '--chi-tiet' in sys.argv

# Chuỗi quá ngắn thì so đâu cũng khớp -> không tính vào phép phủ.
# ⚠️ 2026-09-14: hai hằng + phép gom đã DỜI về `qalib` (luật dùng chung phải ở thư viện) — ba
# nơi cần chúng: bộ rà này, `fix_kq_validate` (che khi cắt) và `audit_extra` ⑳ (che khi đo).
# Giữ tên cũ ở đây để mọi lệnh đã nghiệm thu không phải sửa.
MIN_LEN = qalib.GROUND_MIN_LEN
BO_QUA_KHOA = qalib.GROUND_BO_QUA_KHOA
# Case nói về thông báo -> cột D phải mang chữ verbatim
RX_THONGBAO = re.compile(r'th[oô]ng b[aá]o|b[aá]o l[oỗ]i|c[aả]nh b[aá]o|message', re.I)
# ⚠️ KHÔNG dò chuỗi thông báo theo TÊN KHOÁ: đã thử và báo oan ngay — `selectbox_khong_thay`
# ("Không tìm thấy") không khớp danh sách khoá nào nên case dùng ĐÚNG chuỗi đó vẫn bị kêu.
# Câu thông báo cũng không chứa chữ "thông báo" ("Không tải được danh sách dữ liệu lỗi"), nên dò
# theo NỘI DUNG cũng trượt. ⇒ Lấy TẤT CẢ chuỗi nằm dưới nhánh `verbatim` của hồ sơ màn: đó
# chính là định nghĩa của verbatim — chữ HIỂN THỊ trên màn.
# Thẻ HTML — `<b>1</b>` trong payload §7.2 KHÔNG phải chỗ giữ (bản đầu báo oan 6 case ATTT).
THE_HTML = ('b', 'i', 'u', 'p', 'a', 'br', 'div', 'span', 'script', 'img', 'svg', 'iframe',
            'body', 'html', 'h1', 'h2', 'input', 'form', 'style', 'link', 'object', 'embed')
# Ngưỡng còn viết bằng CHỮ thay vì số thật
RX_NGUONG = re.compile(r'\b(?:N|X|M)\s*(?:ký tự|chữ số|bản ghi|ngày)\b|tối đa\s*(?:N|X|M)\b')
RX_CHO_GIU = re.compile(r'<[^<>]{2,60}>')
# Chỗ giữ CẦN DEV XÁC NHẬN (khác chỗ giữ giá trị lúc chạy): tên bảng/cột/trường trong DB,
# ngưỡng độ dài. Đây đúng là lớp mà cờ `[CẦN VERIFY]` sinh ra để gắn.
CHO_GIU_CAN_HOI = ('bang', 'cot', 'truong', 'schema', 'enum', 'nguong', 'gioi han',
                   'so ky tu', 'do dai', 'kieu du lieu')
# `[FIXED RULE VIOLATION]` thêm 2026-09-12: bước A6 gắn cờ này vào cột T khi hồ sơ màn ground
# được một giá trị TRÁI luật cứng UI (vd `page_size_mac_dinh: 10`). Thiếu ở đây thì phép ④ coi
# case đó là "chỗ giữ không cờ".
CO_HOP_LE = ('[CẦN VERIFY]', '[RỦI RO]', '[Lệch BA - theo Code]', '[FIXED RULE VIOLATION]')


def ho_so_cua(path):
    d = os.path.dirname(os.path.abspath(path))
    p = os.path.join(os.path.dirname(d), 'ho-so-man',
                     os.path.basename(path).replace('.xlsx', '.json'))
    if not os.path.exists(p):
        return None
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return None


gom_verbatim = qalib.gom_ground_verbatim


def dung_duoc(chuoi, blob):
    """Chuỗi verbatim này có xuất hiện trong nội dung bộ case không.

    So theo bản đã chuẩn hoá; chuỗi dài (câu thông báo, có chỗ giữ `{N}`) thì so **mẩu dài nhất**
    không chứa chỗ giữ — người viết case hay chèn giá trị thật vào giữa câu.
    """
    n = norm(chuoi).strip()
    if not n:
        return False
    if len(n) >= MIN_LEN and n in blob:
        return True
    manh = [m for m in re.split(r'\{[^}]*\}|<[^>]*>|\.\.\.|…', n) if len(m.strip()) >= 12]
    if manh:
        return any(m.strip() in blob for m in manh)
    # CHUỖI NGẮN — thực tế chỉ còn các HẰNG SỐ của `hang_so` (`gom_verbatim` đã bỏ mọi chuỗi
    # chữ ngắn hơn MIN_LEN, nhưng nhánh số thì thu nhận không xét độ dài). Trước 2026-09-10
    # nhánh này rơi thẳng xuống `False`: `20` · `250` · `1000` · `1500` · `3` · `4` KHÔNG BAO
    # GIỜ đếm được là đã dùng, dù case ghi đúng con số đó. Đo trên `LoaiLuuTru`: 11/112 mục
    # đứng vĩnh viễn ở cột "chưa dùng" = mất trắng 10 điểm phần trăm PHỦ GROUNDING, và
    # người sửa case cứ đuổi theo một con số không bao giờ lên được.
    # So bằng RANH GIỚI TỪ để `20` không khớp nhầm bên trong `200` hay `2026`.
    return re.search(r'(?<![0-9A-Za-z])%s(?![0-9A-Za-z])' % re.escape(n), blob) is not None


def cho_giu_that(txt):
    """[chỗ giữ] cần dev xác nhận. Bỏ thẻ HTML (`<b>1</b>` §7.2) và chỗ giữ giá trị lúc chạy."""
    ra = []
    for m in RX_CHO_GIU.finditer(txt or ''):
        trong = m.group(0)[1:-1].strip().lstrip('/')
        dau = re.split(r'[\s=>/]', trong, 1)[0].lower()
        if dau in THE_HTML:
            continue
        n = norm(trong)
        if any(k in n for k in CHO_GIU_CAN_HOI):
            ra.append(m.group(0))
    return ra


def main():
    role = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
    only = next((a for a in sys.argv[2:] if not a.startswith('--')), None)
    roles.get(role)

    t_phu = t_chay = t_nguong = t_giu = 0
    tong_vb = tong_dung = 0
    khong_ho_so = []
    # Hồ sơ màn CÓ nhưng KHÔNG có nhánh `grounding.verbatim` -> `gom_verbatim` trả rỗng, phép ①②
    # không có gì để xét và bộ rà in `0/0 (0%)` như thể sạch. Đo 2026-09-09: 2 hồ sơ
    # `QuanTri` (viết trước khi có quy ước `grounding`) nghiệm thu "sạch" trong im lặng.
    # ⇒ Cùng lớp lỗi đã vá ở `qalib.iter_role_files` ("0 vì KHÔNG ĐỌC GÌ, không phải vì sạch").
    khong_verbatim = []
    for sh in qalib.iter_role_files(role, only):
        tc, nm = sh.tc, (sh.name + ('/' + sh.bp if sh.multi else ''))
        spec = ho_so_cua(tc.path)
        if spec is None:
            khong_ho_so.append(nm)
            continue
        # Theo dõi KHỐI để miễn trừ ATTT ở phép ④: payload §7.2 là verbatim và CÓ chỗ giữ
        # (`<tiêu chí tìm kiếm>' or '1%'='1`) — bản đầu báo oan đúng các case injection.
        cases, _blk = [], None
        for rn in tc.order:
            if rn < 12:
                continue
            lv = tc.lvl(rn)
            if lv == 'grp':
                _blk = norm(tc.c(rn, 'B') or '')
            elif lv == 'cn':
                _blk = None
            elif lv == 'case':
                cases.append((rn, tc.c(rn, 'B') or '', tc.c(rn, 'C') or '', tc.c(rn, 'D') or '',
                              tc.c(rn, 'T') or '', 'an toan thong tin' in (_blk or '')))
        blob = norm(' | '.join(b + ' ' + c + ' ' + d for _r, b, c, d, _t, _a in cases))
        vb = gom_verbatim(spec)
        if not vb:
            khong_verbatim.append(nm)
            continue
        chua_dung = [(k, v) for k, v in vb if not dung_duoc(v, blob)]
        tong_vb += len(vb)
        tong_dung += len(vb) - len(chua_dung)
        # chuỗi HIỂN THỊ đã ground -> dùng cho phép ②
        tb = [v for k, v in vb if 'verbatim' in norm(k)]

        ra = []
        for rn, b, c, d, t, la_attt in cases:
            nd = norm(d)
            # Miễn trừ ca "kết quả đúng LÀ không có thông báo nào" — luật ở
            # `qalib.noi_khong_co_thong_bao()` (đặt ở qalib để bộ rà khác dùng lại được).
            # Miễn trừ thứ hai (2026-09-14): case đã tự khai `[CẦN VERIFY] … nội dung thông
            # báo …` — tức chính câu thông báo là thứ CHƯA ground được. Luật ở
            # `qalib.cho_verify_thong_bao()`; HẸP có chủ ý, xem chú thích ở đó.
            if (tb and RX_THONGBAO.search(d)
                    and not qalib.noi_khong_co_thong_bao(d, RX_THONGBAO)
                    and not qalib.cho_verify_thong_bao(t)
                    and not any(dung_duoc(v, nd) for v in tb)):
                ra.append(('CHỮ CHAY', rn, '%s <- cột D nói về thông báo mà không dùng chuỗi '
                                           'verbatim nào đã ground' % b[:44]))
                t_chay += 1
            if RX_NGUONG.search(c + ' ' + d) and (spec.get('grounding') or {}).get('hang_so'):
                ra.append(('NGƯỠNG', rn, '%s <- còn ngưỡng viết bằng CHỮ (N/X ký tự) trong khi '
                                         'hồ sơ đã khai hằng số' % b[:44]))
                t_nguong += 1
            gi = [] if la_attt else cho_giu_that(c + ' ' + d)
            if gi and not any(x in t for x in CO_HOP_LE):
                ra.append(('CHỖ GIỮ', rn, '%s <- %s chưa xác nhận mà cột T không có cờ '
                                          '[CẦN VERIFY]' % (b[:34], ' '.join(gi[:2]))))
                t_giu += 1
        t_phu += len(chua_dung)
        if ra or chua_dung:
            print('#### %s' % nm)
            pct = (100.0 * (len(vb) - len(chua_dung)) / len(vb)) if vb else 100.0
            print('   PHỦ GROUNDING: %d/%d chuỗi verbatim được dùng trong case (%.0f%%)'
                  % (len(vb) - len(chua_dung), len(vb), pct))
            for k, v in (chua_dung if CHI_TIET else chua_dung[:8]):
                print('   [CHƯA DÙNG] %-30s %s' % (k[-30:], v.replace('\n', ' / ')[:60]))
            if not CHI_TIET and len(chua_dung) > 8:
                print('   … còn %d chuỗi nữa (--chi-tiet để xem hết)' % (len(chua_dung) - 8))
            for tag, rn, d in (ra if CHI_TIET else ra[:10]):
                print('   [%-8s] r%-4d %s' % (tag, rn, d))
            if not CHI_TIET and len(ra) > 10:
                print('   … còn %d ca nữa (--chi-tiet để xem hết)' % (len(ra) - 10))

    if khong_ho_so:
        print('\n--- KHÔNG ĐO ĐƯỢC: không có hồ sơ màn cạnh bộ case (%d file) ---'
              % len(khong_ho_so))
        print('   %s' % ', '.join(khong_ho_so[:12]))
    if khong_verbatim:
        print('\n!! KHÔNG ĐO ĐƯỢC: hồ sơ màn KHÔNG có nhánh `grounding.verbatim` (%d file) --- '
              % len(khong_verbatim))
        print('   %s' % ', '.join(khong_verbatim[:12]))
        print('   Con số dưới đây là 0 vì KHÔNG CÓ DỮ KIỆN ĐỂ SO, không phải vì bộ case sạch.')

    pct = (100.0 * tong_dung / tong_vb) if tong_vb else 0.0
    print('\n=== %s — NỘI DUNG: phủ grounding %d/%d (%.0f%%) · chưa dùng %d · chữ chay %d '
          '· ngưỡng chay %d · chỗ giữ không cờ %d ==='
          % (role, tong_dung, tong_vb, pct, t_phu, t_chay, t_nguong, t_giu))
    print('⚠️ Phép rà này KHÔNG kết luận "nội dung đúng màn" — nó chỉ đo *dữ kiện đã ground có '
          'được đưa vào case hay không*. Đọc từng ca rồi sửa, đừng chạy theo con số.')


if __name__ == '__main__':
    main()

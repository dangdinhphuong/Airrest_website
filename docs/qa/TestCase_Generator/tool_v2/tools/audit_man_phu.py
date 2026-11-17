# -*- coding: utf-8 -*-
"""Rà MÀN PHỤ — bộ case có bỏ sót màn nào không (chỉ đọc, chạy offline).

Vì sao có bộ này (chỉ thị người đặt việc 2026-09-09): màn `Chi tiết lỗi`
(`/quarantine-list/:batchId`) của màn `Dữ liệu lỗi` **thiếu hẳn** khỏi bộ case đầu tiên, mà
**10/10 bộ rà đều báo sạch** — vì cả 10 bộ chỉ soi những gì ĐÃ CÓ trong file, không bộ nào biết
màn nào **đáng lẽ phải có**. Đây là phép rà duy nhất chặn được lớp lỗi "thiếu hẳn một màn".

Nguồn sự thật: **hồ sơ màn** (`<Role>/ho-so-man/<tên .xlsx>.json`) — bộ rà chạy offline, không
lên domain. Bản đồ màn do `probe_routes.py` dò (đọc bảng route + menu trong bundle FE) rồi
NGƯỜI khai vào hồ sơ màn:

    "man_phu": [
      {"route": "/quarantine-list/<mã tập>",
       "ten":   "Chi tiết lỗi",
       "vao_tu": "/quarantine-list · bấm 1 bản ghi hoặc icon Xem chi tiết lỗi",
       "cn":    "XEM CHI TIẾT LỖI CỦA TẬP DỮ LIỆU"},
      {"route": "/quarantine-list/<mã tập>/export", "bo_qua": "chưa phát hành, FE chặn ở menu"}
    ]

  · `"man_phu": []` = **đã dò, màn này không có màn phụ** (khai rỗng là một khẳng định).
  · **THIẾU HẲN khoá** = chưa dò ⇒ báo `[CHƯA KHAI]`, vì im lặng ở đây đúng là chỗ đã mất màn.
  · `bo_qua` = cố ý không làm, **phải ghi lý do** — in ra để người nghiệm thu thấy, không tính lỗi.
  · `noi_dat` = chỗ đặt CN của màn phụ: `"cung_sheet"` (chung sheet, chung dãy mã case) hoặc
    `"sheet_rieng"` (sheet BP thứ hai trong cùng file). `new_from_base.py` **DỪNG LẠI HỎI** khi
    chưa khai; phép ④ ở đây rà xem file có ĐÚNG như đã chọn không — chọn xong rồi sửa tay lệch
    đi thì không phép nào khác thấy.

    python3 audit_man_phu.py <role> [tên màn]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import roles

norm = qalib.norm


def ho_so_cua(path):
    """(đường dẫn hồ sơ màn, dữ liệu) theo chuẩn 2026-09-09 — cạnh bộ case, tên trùng .xlsx."""
    d = os.path.dirname(os.path.abspath(path))
    p = os.path.join(os.path.dirname(d), 'ho-so-man',
                     os.path.basename(path).replace('.xlsx', '.json'))
    if not os.path.exists(p):
        return p, None
    try:
        return p, json.load(open(p, encoding='utf-8'))
    except Exception as e:
        return p, {'_loi': '%s: %s' % (type(e).__name__, e)}


def ten_cn(tc):
    """[tên CN] của một sheet — dòng vàng, chỉ lấy dòng ĐẦU (dòng sau là khối bước §4.1)."""
    return [(tc.c(rn, 'B') or '').split('\n')[0].strip()
            for rn in tc.order if rn >= 12 and tc.lvl(rn) == 'cn']


def cn_muon(muc):
    """[tên CN] mà mục màn phụ này đòi hỏi.

    Khoá `cn` có HAI dạng hợp lệ (vá 2026-09-10 — trước đó chỉ nhận dạng chuỗi rồi chết
    `AttributeError` khi gặp dạng danh sách):
      · chuỗi        — lối `cung_sheet`: tên CN nằm ngay trong sheet chính;
      · danh sách CN — lối `sheet_rieng`: chính là khối `cn` dựng nên sheet BP thứ hai.
    """
    want = muc.get('cn')
    if isinstance(want, str):
        return [want]
    if isinstance(want, list):
        return [c['ten'] for c in want if isinstance(c, dict) and c.get('ten')]
    return []


def khop_cn(cns, muc, want=None):
    """Tên CN phủ màn phụ này, hoặc None. Khớp theo `cn` đã khai; không khai thì theo `ten`."""
    if want:
        n = norm(want)
        return next((c for c in cns if norm(c) == n), None)
    ten = muc.get('ten') or ''
    if not ten:
        return None
    tokens = [t for t in norm(ten).split() if len(t) > 2]
    if not tokens:
        return None
    for c in cns:
        nc = norm(c)
        if all(t in nc for t in tokens):
            return c
    return None


def main():
    role = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
    only = sys.argv[2] if len(sys.argv) > 2 else None
    roles.get(role)

    t_chua = t_thieu = t_la = t_nd = 0
    bo_qua, khong_ho_so = [], []
    # ⚠️ Vá 2026-09-10: gom CN theo FILE chứ không theo từng SHEET. `iter_role_files` sinh
    # TỪNG sheet BP, nên với lối `noi_dat: "sheet_rieng"` (CN màn phụ nằm ở sheet thứ hai)
    # bản cũ soi sheet 1 là báo `[THIẾU CN]` oan, soi sheet 2 lại báo oan các màn phụ khác.
    # Gom trước theo đường dẫn file rồi mới xét một lần cho cả file.
    theo_file = {}
    for sh in qalib.iter_role_files(role, only):
        theo_file.setdefault(sh.tc.path, []).append(sh)
    for _path, shs in sorted(theo_file.items()):
        sh = shs[0]
        tc, nm = sh.tc, sh.name
        p_hs, hs = ho_so_cua(tc.path)
        if hs is None:
            khong_ho_so.append(nm)
            continue
        if hs.get('_loi'):
            print('#### %s\n   [HỎNG   ] hồ sơ màn đọc không được — %s' % (nm, hs['_loi']))
            continue
        ra = []
        if 'man_phu' not in hs:
            ra.append(('CHƯA KHAI', '—', 'hồ sơ màn chưa có khoá "man_phu" — dò bằng '
                                         '`probe_routes.py <url màn> --sau` rồi khai vào đó'))
            t_chua += 1
        # {tên CN: tên sheet chứa nó} — gom từ MỌI sheet BP của file
        cn_o_sheet = {}
        for x in shs:
            for c in ten_cn(x.tc):
                cn_o_sheet.setdefault(c, x.bp)
        cns = list(cn_o_sheet)
        nhieu_sheet = len(shs) > 1
        for muc in (hs.get('man_phu') or []):
            if isinstance(muc, str):
                muc = {'route': muc}
            r = muc.get('route') or '(không ghi route)'
            if muc.get('bo_qua'):
                bo_qua.append((nm, r, muc['bo_qua']))
                continue
            muon = cn_muon(muc)
            thieu = [w for w in muon if khop_cn(cns, muc, w) is None]
            cn = None if thieu else (khop_cn(cns, muc, muon[0]) if muon
                                     else khop_cn(cns, muc))
            if cn is None:
                ra.append(('THIẾU CN', r[:40],
                           'màn phụ này KHÔNG có CN nào trong bộ case%s'
                           % (' (khai cn=%s)' % ' + '.join('"%s"' % w for w in thieu) if thieu
                              else ' (chưa khai "cn" nên dò theo "ten")')))
                t_thieu += 1
            elif muon and norm(muon[0]) != norm(cn):
                ra.append(('LẠ', r[:40], 'khai cn="%s" mà file có "%s"' % (muon[0], cn)))
                t_la += 1
            else:
                # Phép ④ CHỖ ĐẶT (2026-09-10) — `new_from_base` bắt người đặt việc chọn
                # `cung_sheet` / `sheet_rieng`; ở đây rà xem file có ĐÚNG như đã chọn không.
                # Không có phép này thì câu trả lời kia chỉ là ghi chép, sửa tay lệch đi
                # cũng không ai biết.
                nd, o_sheet = muc.get('noi_dat'), cn_o_sheet.get(cn)
                if nd == 'cung_sheet' and nhieu_sheet and o_sheet != shs[0].bp:
                    ra.append(('CHỖ ĐẶT', r[:40],
                               'khai noi_dat="cung_sheet" mà CN "%s" đang nằm ở sheet KHÁC (%s)'
                               % (cn, o_sheet)))
                    t_nd += 1
                elif nd == 'sheet_rieng' and o_sheet == shs[0].bp:
                    ra.append(('CHỖ ĐẶT', r[:40],
                               'khai noi_dat="sheet_rieng" mà CN "%s" vẫn nằm CHUNG sheet chính '
                               '(%s)' % (cn, o_sheet)))
                    t_nd += 1
                elif nd is None:
                    ra.append(('CHỖ ĐẶT', r[:40],
                               'chưa khai "noi_dat" — cung_sheet hay sheet_rieng? '
                               '(new_from_base.py sẽ DỪNG LẠI HỎI ở lần dựng sau)'))
                    t_nd += 1
        if ra:
            print('#### %s' % nm)
            for tag, r, d in ra:
                print('   [%-9s] %-42s %s' % (tag, r, d))

    if bo_qua:
        print('\n--- màn phụ CỐ Ý bỏ (có ghi lý do — không tính lỗi) ---')
        for nm, r, ly in bo_qua:
            print('   %-22s %-40s %s' % (nm[:22], r[:40], ly[:60]))
    if khong_ho_so:
        print('\n--- KHÔNG ĐO ĐƯỢC: không có hồ sơ màn cạnh bộ case (%d file) ---'
              % len(khong_ho_so))
        print('   %s' % ', '.join(khong_ho_so[:12]) + (' …' if len(khong_ho_so) > 12 else ''))
        print('   Chuẩn chỗ đặt: <QA_TESTCASE_DIR>/<Role>/ho-so-man/<tên trùng file .xlsx>.json')

    print('\n=== %s — MÀN PHỤ: chưa khai %d · thiếu CN %d · khai lệch tên CN %d · '
          'chỗ đặt %d ==='
          % (role, t_chua, t_thieu, t_la, t_nd))
    if t_chua or t_thieu:
        print('Dò bản đồ màn: python3 probe_routes.py <url màn> --sau [--spec <hồ sơ>.json]')
        print('Soi màn phụ  : python3 probe_live.py <url màn cha> --sau')


if __name__ == '__main__':
    main()

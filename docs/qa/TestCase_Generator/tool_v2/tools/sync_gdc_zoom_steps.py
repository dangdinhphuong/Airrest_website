# -*- coding: utf-8 -*-
"""Đồng bộ BẢN CHỮ CỐ ĐỊNH của khối `Giao diện chung` về verbatim mẫu — 2 case zoom và (từ
2026-09-11) case `Kiểm tra tổng thể giao diện màn hình`.

Mẫu (r19–r20):
    zoom in  → C: "Ấn vào biểu tượng zoom in hoặc nhấn Ctrl+ chuột theo chiều hướng vào trong"
    zoom out → C: "Ấn vào biểu tượng zoom out hoặc nhấn Ctrl+ chuột theo chiều hướng ra ngoài"

Chỉ thị 2026-09-04: cột C bám verbatim mẫu; cột D dùng bản đúng nghĩa (zoom in = phóng to).
Lý do: mẫu ghi zoom in → "hiển thị nhỏ lại" là SAI SỰ THẬT — chính lỗi mô tả ngược nghĩa này
đã phải sửa 922 case ngày 2026-08-28 (xem DINH-MUC §2).

⚠️ **Mở rộng 2026-09-09 — sửa CẢ CỘT D khi nó còn NGƯỢC.** Bản trước cố ý không đụng cột D vì
giả định corpus cũ đã sửa đúng hết. Giả định đó SAI với bộ case sinh mới: `file-nen/file-nen.xlsx`
vẫn ghi zoom in → *"Giao diện thu nhỏ theo độ zoom"*, `new_from_base.lift()` chép verbatim nên
MỌI bộ mới thừa hưởng (×2 case × số CN), và không phép rà nào soi. Nay:
  · gốc đã vá: `new_from_base.sua_zoom()` áp §5.5 ngay khi trích 6 case `Giao diện chung`;
  · script này lo file ĐÃ SINH — chỉ ghi lại cột D khi phát hiện **ngược nghĩa**, D đã đúng thì
    KHÔNG đụng (an toàn với 922 case đã sửa tay);
  · `audit_extra` phép ⑨ chặn tái diễn.

Không thêm/xoá case, không đụng cột B.

    python3 sync_gdc_zoom_steps.py --role Admin          # xem trước
    python3 sync_gdc_zoom_steps.py --role Admin --apply  # ghi
"""
import os, sys, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, qalib

def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

# Bản chữ chuẩn §5.5 nằm ở `qalib` (dùng chung với `new_from_base` + `audit_extra` phép ⑨)
C_IN, C_OUT = qalib.ZOOM_C['in'], qalib.ZOOM_C['out']
D_IN, D_OUT = qalib.ZOOM_D['in'], qalib.ZOOM_D['out']
d_nguoc = qalib.zoom_d_nguoc

APPLY = '--apply' in sys.argv
ROLE = 'Admin'
if '--role' in sys.argv: ROLE = sys.argv[sys.argv.index('--role') + 1]
CFG = roles.get(ROLE)

tot = tot_file = 0
for p in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
    base = os.path.basename(p)
    # `--include-skip` để với tới FILE NỀN (`Testcase-Role-NCC-mau.xlsx` nằm trong `skip`):
    # nền còn chuỗi cột C cũ thì `new_from_base.py` chép verbatim sang MỌI bộ case mới
    # ⇒ lỗi tái sinh dù 918 case cũ đã đồng bộ (phát hiện 2026-09-07).
    if base in CFG['skip'] and '--include-skip' not in sys.argv: continue
    if os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % base)):
        print('  BỎ QUA (đang mở):', base); continue
    nm = base.replace(CFG['strip'], '').replace('.xlsx', '')
    try: bps = tcfix.load(p).bpsheets
    except Exception as e:
        print('  LỖI đọc %s: %s' % (base, e)); continue

    file_n = 0
    for bp in bps:
        tc = tcfix.load(p, bp)
        fixes = []
        ingdc = False
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn); t = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv in ('sub', 'sub2'): ingdc = 'giao dien chung' in norm(t)
            elif lv in ('cn', 'grp'): ingdc = False
            elif lv == 'case' and ingdc:
                n = norm(t)
                # Case `Kiểm tra tổng thể giao diện màn hình` — bản chữ CỐ ĐỊNH của mẫu, ghi đè
                # CẢ C và D khi lệch (chỉ thị người đặt việc 2026-09-11, luật ở `qalib`).
                if qalib.la_case_tong_the(t):
                    if qalib.tong_the_lech(t, tc.c(rn, 'C'), tc.c(rn, 'D')):
                        fixes.append((rn, qalib.TONG_THE_C, qalib.TONG_THE_D))
                    continue
                kieu = 'in' if 'zoom in' in n else ('out' if 'zoom out' in n else None)
                if not kieu: continue
                want_c = C_IN if kieu == 'in' else C_OUT
                cur_c = (tc.c(rn, 'C') or '').strip()
                c_moi = want_c if cur_c != want_c else None
                # Cột D: CHỈ sửa khi đang ngược nghĩa — đã đúng thì không đụng (§5.5)
                d_moi = (D_IN if kieu == 'in' else D_OUT) if d_nguoc(kieu, tc.c(rn, 'D')) else None
                if c_moi or d_moi:
                    fixes.append((rn, c_moi, d_moi))
        if not fixes: continue
        file_n += len(fixes)
        if APPLY:
            for rn, c_moi, d_moi in fixes: tc.retext(rn, buoc=c_moi, kq=d_moi)
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn >= 12: pl.keep(rn)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if file_n:
        tot_file += 1; tot += file_n
        print('   %-24s %d case' % (nm[:24], file_n))

print('\n=== %s: %d file · %d case `Giao diện chung` sửa về bản chữ mẫu ===%s'
      % (ROLE, tot_file, tot, '' if APPLY else '   (xem trước, chưa ghi)'))

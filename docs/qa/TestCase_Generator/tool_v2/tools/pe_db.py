# -*- coding: utf-8 -*-
"""CASE ĐỐI CHIẾU CSDL → chấm `PE` khi chạy live  (chỉ thị người đặt việc 2026-09-14).

Luật nằm ở `qalib` §4b — script này KHÔNG có luật riêng, đúng nguyên tắc *luật dùng chung phải
ở `qalib`, không ở script*. Ba việc:

  ① BƠM    case `toan_bo` (kỳ vọng nằm HẲN ở CSDL) -> cột chạy = `PE`, cột T = khối
            `[DB ACCESS REQUIRED]` nêu **đã thử gì** và **cần gì để chốt**.
  ② CẮM CỜ case `mot_phan` (chỉ MỘT bước là đối chiếu CSDL) -> cột T = khối `[DB PARTIAL]`,
            **không** chấm mark: lượt chạy vẫn chấm P/F theo phần kiểm được trên màn.
  ③ RÀ     `--check`: case `toan_bo` còn bị chấm P/F · case `mot_phan` có kết quả mà mất cờ ·
            case mang **tiêu đề DB nhưng bước viết lối API** (không có câu truy vấn — chấm P/F
            được, nhưng là chỗ bộ case viết LỆCH nhau giữa các màn).

    python3 pe_db.py <Role> [tên màn]                  # xem trước (mặc định, không ghi gì)
    python3 pe_db.py <Role> [tên màn] --apply          # ghi, rồi tự chạy formula_layer + postfix_cache
    python3 pe_db.py <Role> [tên màn] --check          # bộ rà sau lượt chạy — mốc chốt: 2 số 0 đầu
    python3 pe_db.py <Role> [tên màn] --apply --ghi-de # ghi đè cả dòng ĐÃ CÓ kết quả
    python3 pe_db.py <Role> --col G [--apply]          # lượt 2 ghi cột G
    python3 pe_db.py <Role> --which ket-qua-test-thu-cong
    python3 pe_db.py <Role> [tên màn] --nguon          # soi trên bộ case NGUỒN (chỉ đọc)
    python3 pe_db.py <Role> [tên màn] --theo-tieu-de   # nới phạm vi sang case viết lối API (TẮT mặc định)

KHÔNG ghi đè ô đã có kết quả: dòng nào cột chạy đã có giá trị thì BỎ QUA và đếm riêng — dự án
QA **có quyền truy vấn CSDL** thì cứ chấm P/F như cũ, đừng chạy `--apply` cho màn đó.

`--check` in kèm **hai số PE**: PE do thiếu quyền CSDL (lý do cố định) và PE còn lại — ngưỡng
≤ 10 % của §dinh_nghia_hoan_thanh chỉ tính số thứ hai. Số *lệch lối API* là việc của BỘ CASE,
không chặn nghiệm thu lượt chạy (mã thoát chỉ khác 0 khi có SAI LUẬT PE hoặc MẤT CỜ).
"""
import argparse
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib          # noqa: E402
import tcfix          # noqa: E402
import roles          # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def sheets_cua(path):
    """(bp, tc) từng sheet test case của MỘT file — file gộp màn phụ có nhiều sheet BP.

    ⚠️ `tcfix.load(path)` trơn chỉ trả sheet ĐẦU: đó là lối đã làm 5 chỗ im lặng báo 0/OK.
    """
    first = tcfix.load(path)
    bps = first.bpsheets or [None]
    for i, bp in enumerate(bps):
        yield bp, (first if i == 0 else tcfix.load(path, bp))


def ten(path, role):
    try:
        return qalib.ten_man(path, role)
    except Exception:
        return os.path.basename(path)


def quet(path, col, ghi_de=False, theo_tieu_de=False):
    """-> (kế hoạch PE, kế hoạch cờ một phần, bỏ qua vì đã có kết quả, lệch lối API) theo sheet."""
    for bp, tc in sheets_cua(path):
        pe, co, da_co, lech = [], [], [], []
        for rn in qalib.dong_case(tc):
            b = (tc.c(rn, 'B') or '').strip()
            muc, tv = qalib.muc_case_db(tc, rn, theo_tieu_de)
            if muc == 'toan_bo':
                cu = (tc.c(rn, col) or '').strip()
                if cu and not ghi_de:
                    da_co.append((rn, b, cu))
                else:
                    pe.append((rn, 'PE', qalib.bao_pe_db(b, tv)))
            elif muc == 'mot_phan' and qalib.CO_DB_MOT_PHAN not in (tc.c(rn, 'T') or ''):
                co.append((rn, None, qalib.bao_db_mot_phan(tv)))
            elif not muc and qalib.tieu_de_noi_db(b):
                lech.append((rn, b))
        yield bp, tc, pe, co, da_co, lech


def ra_soat(path, col, theo_tieu_de=False):
    """Bộ rà sau lượt chạy -> (sai luật PE, mất cờ, lệch lối API, đếm PE).

    `dem` = (tổng case, PE do thiếu quyền CSDL, PE còn lại) — §dinh_nghia_hoan_thanh mục 2 đòi
    báo cáo tách HAI số: PE-CSDL có lý do cố định, không tính vào ngưỡng 10 %.
    """
    sai, mat, lech = [], [], []
    n_case = n_pe_db = n_pe_khac = 0
    for bp, tc in sheets_cua(path):
        for rn in qalib.dong_case(tc):
            n_case += 1
            b = (tc.c(rn, 'B') or '').strip()
            muc, _ = qalib.muc_case_db(tc, rn, theo_tieu_de)
            v = (tc.c(rn, col) or '').strip().upper()
            t = tc.c(rn, 'T') or ''
            if v == 'PE':
                n_pe_db += 1 if muc == 'toan_bo' else 0
                n_pe_khac += 0 if muc == 'toan_bo' else 1
            if muc == 'toan_bo' and v in ('P', 'F'):
                sai.append((bp, rn, b, v))
            elif muc == 'mot_phan' and v and qalib.CO_DB_MOT_PHAN not in t:
                mat.append((bp, rn, b, v))
            elif not muc and qalib.tieu_de_noi_db(b):
                lech.append((bp, rn, b))
    return sai, mat, lech, (n_case, n_pe_db, n_pe_khac)


def hau_ky(path):
    """Cột R là CÔNG THỨC: ghi mark xong phải dựng lại cache R + D4:D8 + sheet Tổng hợp."""
    for sc in ('formula_layer.py', 'postfix_cache.py'):
        r = subprocess.run([sys.executable, os.path.join(HERE, sc), path],
                           capture_output=True, text=True)
        if r.returncode:
            print('    !! %s lỗi: %s' % (sc, (r.stderr or r.stdout).strip().splitlines()[-1:]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('role')
    ap.add_argument('man', nargs='?')
    ap.add_argument('--col', default='F', help='cột chạy (F = lần 1, G = lần 2)')
    ap.add_argument('--which', help='thư mục kết quả (vd ket-qua-test-thu-cong)')
    ap.add_argument('--nguon', action='store_true', help='soi bộ case NGUỒN, chỉ đọc')
    ap.add_argument('--check', action='store_true', help='bộ rà sau lượt chạy')
    ap.add_argument('--theo-tieu-de', dest='theo_tieu_de', action='store_true',
                    help='nới phạm vi: PE cả case mang TIÊU ĐỀ đối chiếu CSDL mà bước viết lối API')
    ap.add_argument('--ghi-de', dest='ghi_de', action='store_true',
                    help='ghi đè cả dòng ĐÃ CÓ kết quả (dùng khi lượt trước lỡ chấm P/F cho case CSDL)')
    ap.add_argument('--apply', action='store_true', help='ghi thật (mặc định là xem trước)')
    a = ap.parse_args()
    roles.get(a.role)                      # nạp hồ sơ dự án / báo lỗi sớm nếu role sai

    if a.nguon:
        n_f = t_pe = t_co = t_lech = 0
        for sh in qalib.iter_role_files(a.role, only=a.man):
            ds = [qalib.muc_case_db(sh.tc, rn, a.theo_tieu_de)[0] for rn in qalib.dong_case(sh.tc)]
            pe = [x for x in ds if x == 'toan_bo']
            mp = [x for x in ds if x == 'mot_phan']
            n_f += 1
            t_pe += len(pe)
            t_co += len(mp)
            if pe or mp:
                print('#### %-22s %s PE(toàn bộ): %-3d  cờ(một phần): %d'
                      % (sh.name[:22], (sh.bp + ' ') if sh.multi else '', len(pe), len(mp)))
        print('\n=== BỘ CASE NGUỒN: %d case PE-CSDL · %d case một phần  (%d sheet)'
              % (t_pe, t_co, n_f))
        if not n_f:
            print('!! KHÔNG đọc được sheet nào — đừng tin số 0 ở trên.')
        return 0

    n_f = t_pe = t_co = t_da_co = t_sai = t_mat = t_lech = 0
    t_case = t_pe_db = t_pe_khac = 0
    for path in qalib.iter_result_files(a.role, only=a.man, which=a.which):
        n_f += 1
        nm = ten(path, a.role)
        if a.check:
            sai, mat, lech, (nc, npe_db, npe_kh) = ra_soat(path, a.col, a.theo_tieu_de)
            t_case += nc
            t_pe_db += npe_db
            t_pe_khac += npe_kh
            t_sai += len(sai)
            t_mat += len(mat)
            t_lech += len(lech)
            for bp, rn, b, v in sai:
                print('   [SAI LUẬT PE] %-20s dòng %-4d %-46s đang chấm %s'
                      % (nm[:20], rn, b.replace('\n', ' ')[:46], v))
            for bp, rn, b, v in mat:
                print('   [MẤT CỜ %s] %-20s dòng %-4d %-46s'
                      % (qalib.CO_DB_MOT_PHAN.strip('[]'), nm[:20], rn, b.replace('\n', ' ')[:46]))
            for bp, rn, b in lech:
                print('   [LỆCH LỐI API] %-20s dòng %-4d %-46s (tiêu đề nói CSDL, bước không có '
                      'truy vấn)' % (nm[:20], rn, b.replace('\n', ' ')[:46]))
            continue

        if a.apply and qalib.is_locked(path):
            print('  BỎ QUA (đang mở trong LibreOffice):', os.path.basename(path))
            continue
        da_ghi = False
        for bp, tc, pe, co, da_co, lech in quet(path, a.col, a.ghi_de, a.theo_tieu_de):
            t_pe += len(pe)
            t_co += len(co)
            t_da_co += len(da_co)
            t_lech += len(lech)
            nhan = '%s%s' % (nm[:22], (' · ' + bp) if bp and len(tc.bpsheets) > 1 else '')
            if pe or co or da_co:
                print('#### %-30s PE: %-3d  cờ một phần: %-3d  đã có kết quả (bỏ qua): %d'
                      % (nhan, len(pe), len(co), len(da_co)))
            for rn, b, v in da_co:
                print('     · dòng %-4d đang là %-2s — KHÔNG ghi đè: %s'
                      % (rn, v, b.replace('\n', ' ')[:52]))
            if not a.apply:
                continue
            if pe:
                qalib.write_marks(path, pe, backup_suffix='pe_db',
                                  cols=(a.col, 'T'), bp=bp)
                da_ghi = True
            if co:
                # cờ của CASE, không phải ghi chú lượt chạy -> KHÔNG gắn tiền tố `[Lần N]`
                qalib.write_marks(path, co, backup_suffix='pe_db',
                                  cols=(a.col, 'T'), lan_prefix=False, bp=bp)
                da_ghi = True
        if da_ghi:
            hau_ky(path)
            print('     ĐÃ GHI + dựng lại cache cột R:', os.path.basename(path))

    if a.check:
        print('\n=== RÀ CASE CSDL (cột %s): sai luật PE %d · mất cờ %s %d · lệch lối API %d  (%d file)'
              % (a.col, t_sai, qalib.CO_DB_MOT_PHAN, t_mat, t_lech, n_f))
        if n_f:
            print('    PE: %d = %d do thiếu quyền CSDL (lý do cố định) + %d còn lại — %.1f %% trên '
                  '%d case  ⇒ ngưỡng 10 %% của §dinh_nghia_hoan_thanh tính trên số SAU dấu +'
                  % (t_pe_db + t_pe_khac, t_pe_db, t_pe_khac,
                     100.0 * t_pe_khac / t_case if t_case else 0, t_case))
        if not n_f:
            print('!! KHÔNG rà được file kết quả nào — đừng tin 3 số 0 ở trên.')
        elif not (t_sai or t_mat):
            print('   ✓ mốc chốt đạt: mọi case đối chiếu CSDL đều đúng luật 14/09.')
        if t_sai:
            print('   Sửa: python3 pe_db.py %s [tên màn] --apply --ghi-de   (dòng đã có P/F chỉ bị '
                  'ghi đè khi có --ghi-de)' % a.role)
            print('        Giữ P/F thì cột T phải có bằng chứng ĐÃ CHẠY được truy vấn thật — bộ rà '
                  'này không đọc hộ được bằng chứng, nó chỉ nêu chỗ phải giải trình.')
        if t_lech:
            print('   ⚠️ LỆCH LỐI API không tự sửa: case mang tiêu đề đối chiếu CSDL nhưng cột C '
                  'viết "đối chiếu dữ liệu máy chủ".')
            print('      Chỉ thị 14/09 chốt phạm vi PE theo CÂU TRUY VẤN ⇒ các case này vẫn chấm '
                  'P/F. Muốn PE thì sửa BỘ CASE cho có truy vấn, không nới luật ở đây.')
            print('      Muốn PE cả nhóm này: thêm --theo-tieu-de (cờ nới phạm vi, mặc định TẮT).')
        return 1 if (t_sai or t_mat) else 0

    print('\n=== %s: %d case PE-CSDL · %d cờ %s · %d dòng đã có kết quả (bỏ qua) · %d case lệch '
          'lối API  (%d file)'
          % ('ĐÃ GHI' if a.apply else 'XEM TRƯỚC', t_pe, t_co, qalib.CO_DB_MOT_PHAN,
             t_da_co, t_lech, n_f))
    if not n_f:
        print('!! KHÔNG có file kết quả nào — dựng bằng `python3 ket_qua.py %s --create --apply`.'
              % a.role)
    elif not a.apply:
        print('   (xem trước, chưa ghi — thêm --apply để ghi)')
    return 0


if __name__ == '__main__':
    sys.exit(main())

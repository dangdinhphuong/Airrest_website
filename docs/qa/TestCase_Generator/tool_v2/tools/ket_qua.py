# -*- coding: utf-8 -*-
"""Dựng & đồng bộ FILE KẾT QUẢ chạy live (`*_ket_qua.xlsx`) — cho MỌI dự án, MỌI máy.

Trước 2026-09-12 việc này **không có script nào làm được một cách di động**: `sync_ncc_0821.py`
đóng đinh vào role NCC + layout `../../testCase/NCC/`, còn quy trình thì bảo người chạy tự `cp`.
Hệ quả: sang dự án khác là không ai biết file kết quả phải tên gì, nằm đâu — và `cp` đè lên bản
đã có kết quả là mất trắng cột F/G/S/T.

Đường dẫn lấy từ hồ sơ dự án qua `qalib` (`file_prefix` · `result_suffix` · `subdir_result`),
KHÔNG ghép chuỗi trong script này.

    python3 ket_qua.py <Role> [Màn]                     # xem trạng thái (chỉ đọc)
    python3 ket_qua.py <Role> [Màn] --create            # xem trước việc dựng file còn thiếu
    python3 ket_qua.py <Role> [Màn] --create --apply    # dựng thật
    python3 ket_qua.py <Role> [Màn] --sync              # nguồn đã đổi -> xem trước việc đồng bộ
    python3 ket_qua.py <Role> [Màn] --sync --apply      # đồng bộ thật, GIỮ kết quả theo NỘI DUNG
    python3 ket_qua.py <Role> --which ket-qua-test-thu-cong --sync   # chọn thư mục kết quả khác

`--create` **KHÔNG BAO GIỜ đè** file đã có (đó là đường mất dữ liệu); file đã có mà nguồn đổi
thì dùng `--sync`.
"""
import argparse
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix          # noqa: E402
import qalib          # noqa: E402
import roles          # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def _chay(script, *args):
    r = subprocess.run([sys.executable, os.path.join(HERE, script), *args],
                       capture_output=True, text=True)
    if r.returncode:
        print('    !! %s lỗi: %s' % (script, (r.stderr or r.stdout).strip().splitlines()[-1:]))
    return r.returncode == 0


def _hau_ky(path):
    """Sau MỌI lần ghi: áp lại 6 lớp công thức rồi dựng lại cache cột R + D4:D8 + Tổng hợp."""
    _chay('formula_layer.py', path)
    _chay('postfix_cache.py', path)


def dem_case(path):
    try:
        n = 0
        for bp in (tcfix.load(path).bpsheets or [None]):
            tc = tcfix.load(path, bp)
            n += sum(1 for r in tc.order if r >= 12 and tc.c(r, 'C'))
        return n
    except Exception as e:
        return '✘ %s' % type(e).__name__


def dem_da_cham(path, cols=('F', 'G')):
    try:
        n = 0
        for bp in (tcfix.load(path).bpsheets or [None]):
            tc = tcfix.load(path, bp)
            n += sum(1 for r in tc.order if r >= 12 and any((tc.c(r, c) or '').strip() for c in cols))
        return n
    except Exception:
        return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('role')
    ap.add_argument('man', nargs='?', help='lọc theo tên màn (khớp một phần)')
    ap.add_argument('--which', help='tên thư mục kết quả khi dự án khai nhiều (vd ket-qua-test-thu-cong)')
    ap.add_argument('--create', action='store_true', help='dựng file kết quả còn thiếu')
    ap.add_argument('--sync', action='store_true', help='nguồn đã đổi: dựng lại khung, giữ F/G/S/T')
    ap.add_argument('--apply', action='store_true', help='ghi thật; bỏ cờ này là xem trước')
    a = ap.parse_args()

    cfg = roles.get(a.role)
    ds = qalib.res_dirs(a.role)
    if a.which:
        ds = [d for d in ds if os.path.basename(d).lower() == a.which.lower()] or ds[:1]
    if not ds:
        sys.exit('Hồ sơ dự án "%s" không khai `subdir_result` và không suy được thư mục kết quả.'
                 % roles.PROJECT.get('name'))
    dst_dir = ds[0]

    # `iter_role_files` sinh từng SHEET; ở đây chỉ cần từng FILE (file gộp màn phụ có 2 sheet BP).
    srcs = sorted({s.path for s in qalib.iter_role_files(a.role, only=a.man)})
    if not srcs:
        sys.exit('Không có file nguồn nào khớp.')

    print('Dự án %s · role %s · thư mục kết quả: %s\n'
          % (roles.PROJECT.get('name'), a.role, dst_dir))
    print('%-44s %6s  %-34s %s' % ('MÀN', 'nguồn', 'FILE KẾT QUẢ', 'trạng thái'))

    n_tao = n_dong_bo = 0
    for src in srcs:
        man = qalib.ten_man(src, a.role)
        dst = os.path.join(dst_dir, os.path.basename(src)[:-5] + qalib.res_suffix() + '.xlsx')
        co = os.path.exists(dst)
        n_src = dem_case(src)
        if not co:
            tt = 'CHƯA CÓ' + ('  -> sẽ dựng' if a.create else '  (chạy --create)')
        else:
            n_dst, n_cham = dem_case(dst), dem_da_cham(dst)
            tt = '%s · %d đã chấm' % (
                '%s case, khớp nguồn' % n_dst if n_dst == n_src
                else 'LỆCH nguồn (kết quả %s vs nguồn %s case)' % (n_dst, n_src), n_cham)
            if a.sync:
                tt += '  -> sẽ đồng bộ'
        print('%-44s %6s  %-34s %s' % (man[:44], n_src, os.path.basename(dst)[:34], tt))

        if a.create and not co:
            n_tao += 1
            if a.apply:
                os.makedirs(dst_dir, exist_ok=True)
                if qalib.is_locked(src):
                    print('    BỎ QUA: nguồn đang mở trong LibreOffice'); continue
                shutil.copy2(src, dst)
                _hau_ky(dst)
                print('    → ĐÃ DỰNG')
        elif a.create and co:
            print('    (đã có — `--create` không đè; dùng `--sync` nếu nguồn đã đổi)')

        if a.sync and co:
            n_dong_bo += 1
            if qalib.is_locked(dst):
                print('    BỎ QUA: file kết quả đang mở trong LibreOffice'); continue
            bps = tcfix.load(dst).bpsheets or [None]
            marks = {bp: qalib.doc_marks(dst, bp) for bp in bps}
            ke_hoach, mat = {}, []
            for bp in (tcfix.load(src).bpsheets or [None]):
                tc = tcfix.load(src, bp)
                chat, long_ = marks.get(bp) or (list(marks.values())[0] if len(marks) == 1
                                                else ({}, {}))
                rows, tk = qalib.khop_marks(tc, chat, long_)
                ke_hoach[bp] = rows
                mat += tk['khong_con']
                print('    %-14s khớp chặt %3d · khớp lỏng %3d · chưa chạy %3d · không còn %3d'
                      % (bp or '(sheet đầu)', tk['chat'], tk['long'], tk['chua_chay'],
                         len(tk['khong_con'])))
            if mat:
                print('    ⚠ %d case CŨ có kết quả nhưng không còn chỗ trong khung mới'
                      ' — bản lùi giữ ở bak/' % len(mat))
            if a.apply:
                qalib.backup(dst, tag='ket_qua_sync', quiet=False)
                shutil.copy2(src, dst)                    # khung = nguồn mới (đủ lớp công thức)
                for bp, rows in ke_hoach.items():
                    if not rows:
                        continue
                    tc = tcfix.load(dst, bp)
                    for rn, vals in rows.items():
                        for col, v in vals.items():
                            qalib.ghi_o(tc, rn, col, v)
                    pl = tcfix.Plan(tc)
                    pl.items = [r for r in tc.order if r >= 12]   # KHÔNG bỏ dòng: Plan khởi tạo RỖNG
                    tc.rebuild(pl).save(quiet=True, sync=False)
                _hau_ky(dst)
                print('    → ĐÃ ĐỒNG BỘ')

    print('\n=== %s ===  dựng %d · đồng bộ %d'
          % ('ĐÃ GHI' if a.apply else 'XEM TRƯỚC (thêm --apply để ghi)', n_tao, n_dong_bo))
    return 0


if __name__ == '__main__':
    sys.exit(main())

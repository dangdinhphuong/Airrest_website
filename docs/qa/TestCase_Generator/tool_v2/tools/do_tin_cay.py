#!/usr/bin/env python3
"""do_tin_cay.py — Đo độ tin cậy của lượt chạy tự động, lấy lượt thủ công làm chuẩn.

Đọc cột F (Lần 1 — agent chạy) và cột G (Lần 2 — người chạy) trong các file
`*_ket_qua.xlsx`, dựng ma trận nhầm lẫn và tính Accuracy / Precision / Recall /
F1 / NPV.

    python3 do_tin_cay.py Admin                      # cả role
    python3 do_tin_cay.py Admin --min-precision 60   # lọc màn đạt ngưỡng
    python3 do_tin_cay.py NCC --dir Ket-qua-test-thu-cong --tsv bao-cao.tsv
    python3 do_tin_cay.py Admin --list-fn            # xem case bỏ lọt
    python3 do_tin_cay.py Admin --list-fp KhaoSat    # xem case báo oan của 1 màn

Chỉ ĐỌC — không ghi vào file test case. Python 3 thuần, không cần openpyxl.
"""
import argparse, glob, os, re, sys, zipfile
import xml.etree.ElementTree as ET
from collections import Counter

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
SKIP_SHEET = {'Bìa', 'Trang bìa', 'Tổng hợp', 'Hình ảnh', 'Chú giải'}

# ⚠️ VÁ 2026-09-12 — trước đây:  ROOT = <tools>/../../testCase
# Đường dẫn đó chỉ đúng với layout GSTEM cũ (`docs/qa-doc/tools/`); ở mọi layout khác nó trỏ ra
# NGOÀI repo nên script thoát ngay với `Không thấy thư mục kết quả` — đo được trên chính repo
# này: `do_tin_cay.py ChuyenVien` không chạy nổi một dòng. Script cũng bỏ qua `QA_TESTCASE_DIR`
# và chốt cứng tiền tố tên file `Testcase-Role-<role>-`. Nay lấy tất cả từ hồ sơ dự án qua
# `qalib` (cùng nguồn với mọi bộ rà) ⇒ chạy được trên mọi dự án, mọi máy.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib          # noqa: E402
import roles          # noqa: E402

# Nhóm case theo mục đích kiểm thử — dùng để chỉ ra rủi ro bỏ lọt tập trung ở đâu.
NHOM = [('Zoom / phóng to thu nhỏ',      r'zoom'),
        ('Dữ liệu dài / vỡ layout',      r'dữ liệu dài|vỡ layout|quá dài|độ dài'),
        ('Tổng thể giao diện / hiển thị', r'tổng thể giao diện|hiển thị đầy đủ|bố cục')]
NHOM_CON_LAI = 'Chức năng · dữ liệu · phân quyền'


def doc_xlsx(path):
    """Trả về {tên sheet: {số dòng: {cột: giá trị}}}. Không cần openpyxl."""
    z = zipfile.ZipFile(path)
    ss = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')):
            ss.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    rels = {r.get('Id'): r.get('Target')
            for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}

    def val(c):
        t = c.get('t')
        if t == 's':
            v = c.find(NS + 'v')
            return ss[int(v.text)] if v is not None else ''
        if t == 'inlineStr':
            return ''.join(x.text or '' for x in c.iter(NS + 't'))
        v = c.find(NS + 'v')
        return v.text if v is not None else ''

    out = {}
    for sh in ET.fromstring(z.read('xl/workbook.xml')).iter(NS + 'sheet'):
        tgt = rels[sh.get(RNS + 'id')].lstrip('/')
        if not tgt.startswith('xl/'):
            tgt = 'xl/' + tgt
        rows = {}
        for r in ET.fromstring(z.read(tgt)).iter(NS + 'row'):
            d = {}
            for c in r.iter(NS + 'c'):
                d[re.match(r'[A-Z]+', c.get('r')).group()] = val(c)
            rows[int(r.get('r'))] = d
        out[sh.get('name')] = rows
    return out


def nhom_cua(muc_dich):
    t = (muc_dich or '').lower()
    for ten, pat in NHOM:
        if re.search(pat, t):
            return ten
    return NHOM_CON_LAI


def quet_file(path):
    """Trả về list case: (mã, mục đích, F, G, mã lỗi)."""
    cases = []
    wb = doc_xlsx(path)
    for sn in [n for n in wb if n not in SKIP_SHEET and wb[n]]:
        rows = wb[sn]
        for i in range(12, max(rows) + 1):
            d = rows.get(i, {})
            f = (d.get('F') or '').strip().upper()
            g = (d.get('G') or '').strip().upper()
            # Dòng tiêu đề nhóm chỉ có cột B → loại. KHÔNG lọc theo cột A:
            # cột A là công thức, nhiều dòng chưa có giá trị lưu đệm.
            if not ((d.get('C') or '').strip() or (d.get('D') or '').strip() or f or g):
                continue
            cases.append((d.get('A') or f'dòng {i}',
                          (d.get('B') or '').replace('\n', ' ').strip(),
                          f, g, (d.get('S') or '').strip()))
    return cases


def do_mot_man(cases):
    c = Counter()
    for _, _, f, g, _ in cases:
        c['n'] += 1
        c['F_' + (f or 'TRONG')] += 1
        c['G_' + (g or 'TRONG')] += 1
        if f in ('P', 'F') and g in ('P', 'F'):
            c['m_' + f + g] += 1
    return c


def chi_so(TP, FP, FN, TN):
    tot = TP + FP + FN + TN
    acc = (TP + TN) / tot * 100 if tot else None
    pre = TP / (TP + FP) * 100 if TP + FP else None
    rec = TP / (TP + FN) * 100 if TP + FN else None
    npv = TN / (TN + FN) * 100 if TN + FN else None
    f1 = 2 * pre * rec / (pre + rec) if pre and rec else None
    return acc, pre, rec, f1, npv


def fmt(x):
    return f'{x:.2f}%' if x is not None else '—'


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('role', help='Admin · NCC · Teacher …')
    ap.add_argument('ten', nargs='?', help='lọc theo tên màn (khớp một phần)')
    ap.add_argument('--dir', default=None,
                    help='thư mục kết quả: tên con hoặc đường dẫn đầy đủ '
                         '(mặc định: theo `subdir_result` của hồ sơ dự án, ưu tiên bộ thủ công)')
    ap.add_argument('--min-precision', type=float, default=None,
                    help='chỉ gộp các màn có Precision >= ngưỡng (%%)')
    ap.add_argument('--tsv', help='ghi bảng ra file TSV để dán vào Sheets')
    ap.add_argument('--list-fn', action='store_true', help='liệt kê case bỏ lọt (FN)')
    ap.add_argument('--list-fp', nargs='?', const='*', help='liệt kê case báo oan (FP)')
    a = ap.parse_args()

    base = qalib.role_dir(a.role)
    if a.dir:
        thumuc = a.dir if os.path.isdir(a.dir) else os.path.join(base, a.dir)
        if not os.path.isdir(thumuc):
            sys.exit(f'Không thấy thư mục kết quả: {thumuc}')
    else:
        # Ưu tiên bộ THỦ CÔNG (cột G là chuẩn đối chứng), rồi tới bộ thường — theo đúng
        # `subdir_result` của hồ sơ dự án, không đoán tên.
        co = qalib.res_dirs(a.role, ton_tai=True)
        thumuc = next((d for d in co if 'thu-cong' in os.path.basename(d).lower()),
                      co[0] if co else None)
        if not thumuc:
            sys.exit(f'Không thấy thư mục kết quả nào của role {a.role} trong {base}\n'
                     f'   ⇒ dựng bằng: python3 ket_qua.py {a.role} --create --apply')

    files = sorted(glob.glob(os.path.join(thumuc, '*' + qalib.res_suffix() + '.xlsx')))
    if a.ten:
        files = [f for f in files if a.ten.lower() in os.path.basename(f).lower()]
    if not files:
        sys.exit(f'Không có file nào khớp trong {thumuc}')

    print(f'Nguồn: {thumuc}   ({len(files)} file)\n')

    mans, fn_all, fp_all, nhom = [], [], [], Counter()
    for p in files:
        ten = qalib.ten_man(p, a.role)
        cases = quet_file(p)
        c = do_mot_man(cases)
        TP, FP, FN, TN = c['m_FF'], c['m_FP'], c['m_PF'], c['m_PP']
        mans.append(dict(ten=ten, c=c, TP=TP, FP=FP, FN=FN, TN=TN, cases=cases))

    if a.min_precision is not None:
        giu, bo = [], []
        for m in mans:
            p = m['TP'] / (m['TP'] + m['FP']) * 100 if m['TP'] + m['FP'] else None
            (giu if p is not None and p >= a.min_precision else bo).append(m)
        print(f'Ngưỡng Precision >= {a.min_precision:g}%: giữ {len(giu)} màn, '
              f'loại {len(bo)} màn ({", ".join(m["ten"] for m in bo) or "—"})\n')
        mans = giu
        if not mans:
            sys.exit('Không màn nào đạt ngưỡng.')

    for m in mans:
        for ma, mm, f, g, s_ in m['cases']:
            if f == 'P' and g == 'F':
                fn_all.append((m['ten'], ma, mm, s_))
            if f == 'F' and g == 'P':
                fp_all.append((m['ten'], ma, mm, s_))
            if f == 'P' and g in ('P', 'F'):
                nhom[(nhom_cua(mm), g)] += 1

    hdr = (f"{'Màn':<26}{'Tổng':>6}{'F:P':>6}{'F:F':>5}{'F:PE':>6}{'F:-':>5} | "
           f"{'G:P':>6}{'G:F':>5}{'G:PE':>6}{'G:-':>5} | {'TP':>4}{'FP':>4}{'FN':>4}{'TN':>6}"
           f"{'Acc':>9}{'Prec':>9}{'Rec':>9}")
    print(hdr)
    print('-' * len(hdr))
    tsv = ['Màn hình\tTổng TC\tF:P\tF:F\tF:PE\tF:trống\tG:P\tG:F\tG:PE\tG:trống\t'
           'TP\tFP\tFN\tTN\tAccuracy\tPrecision\tRecall']
    tong = Counter()
    for m in sorted(mans, key=lambda x: -x['c']['n']):
        c = m['c']
        acc, pre, rec, _, _ = chi_so(m['TP'], m['FP'], m['FN'], m['TN'])
        cols = [c['n'], c['F_P'], c['F_F'], c['F_PE'], c['F_TRONG'],
                c['G_P'], c['G_F'], c['G_PE'], c['G_TRONG'],
                m['TP'], m['FP'], m['FN'], m['TN']]
        print(f"{m['ten']:<26}{cols[0]:>6}{cols[1]:>6}{cols[2]:>5}{cols[3]:>6}{cols[4]:>5} | "
              f"{cols[5]:>6}{cols[6]:>5}{cols[7]:>6}{cols[8]:>5} | "
              f"{cols[9]:>4}{cols[10]:>4}{cols[11]:>4}{cols[12]:>6}"
              f"{fmt(acc):>9}{fmt(pre):>9}{fmt(rec):>9}")
        tsv.append('\t'.join([m['ten']] + [str(x) for x in cols]
                             + [fmt(acc).replace('.', ','), fmt(pre).replace('.', ','),
                                fmt(rec).replace('.', ',')]))
        for k, v in zip(['n', 'FP_', 'FF', 'FPE', 'FX', 'GP', 'GF', 'GPE', 'GX',
                         'TP', 'FP', 'FN', 'TN'], cols):
            tong[k] += v

    TP, FP, FN, TN = tong['TP'], tong['FP'], tong['FN'], tong['TN']
    acc, pre, rec, f1, npv = chi_so(TP, FP, FN, TN)
    print('-' * len(hdr))
    print(f"{'TỔNG':<26}{tong['n']:>6}{tong['FP_']:>6}{tong['FF']:>5}{tong['FPE']:>6}{tong['FX']:>5} | "
          f"{tong['GP']:>6}{tong['GF']:>5}{tong['GPE']:>6}{tong['GX']:>5} | "
          f"{TP:>4}{FP:>4}{FN:>4}{TN:>6}{fmt(acc):>9}{fmt(pre):>9}{fmt(rec):>9}")

    loai = tong['n'] - (TP + FP + FN + TN)
    print(f"\nCặp hợp lệ: {TP+FP+FN+TN}/{tong['n']}  (loại {loai} case: PE ở một trong hai cột, hoặc cột G trống)")
    print(f"  Accuracy  = (TP+TN)/(TP+TN+FP+FN) = ({TP}+{TN})/{TP+FP+FN+TN} = {fmt(acc)}")
    print(f"  Precision = TP/(TP+FP)            = {TP}/{TP+FP} = {fmt(pre)}")
    print(f"  Recall    = TP/(TP+FN)            = {TP}/{TP+FN} = {fmt(rec)}")
    print(f"  F1        = 2·P·R/(P+R)           = {fmt(f1)}")
    print(f"  NPV       = TN/(TN+FN)            = {TN}/{TN+FN} = {fmt(npv)}"
          f"   ← độ tin cậy khi agent báo P")

    chua = tong['FP_'] - TN - FN
    if chua > 0:
        print(f"\n⚠ Vùng chưa kiểm chứng: {chua}/{tong['FP_']} case agent báo P "
              f"({chua/tong['FP_']*100:.1f}%) chưa có đối chứng thủ công (PE hoặc trống).")
        print("  Mọi chỉ số trên CHỈ nói về phần đã đối chứng.")

    if nhom:
        print('\nRủi ro bỏ lọt theo nhóm case (chỉ tính case agent báo P đã được đối chứng):')
        print(f"  {'Nhóm':<36}{'Đã kiểm':>9}{'Bỏ lọt':>8}{'NPV':>10}")
        for ten in [n for n, _ in NHOM] + [NHOM_CON_LAI]:
            tn, fn = nhom[(ten, 'P')], nhom[(ten, 'F')]
            if tn + fn:
                print(f"  {ten:<36}{tn+fn:>9}{fn:>8}{tn/(tn+fn)*100:>9.3f}%")

    if a.list_fn and fn_all:
        print(f'\n--- {len(fn_all)} case BỎ LỌT (agent P · thủ công F) ---')
        for t, ma, mm, s in fn_all:
            print(f'  {t:<24} {ma:<26} {mm[:62]}  [mã lỗi: {s or "—"}]')
    if a.list_fp:
        sel = [x for x in fp_all if a.list_fp == '*' or a.list_fp.lower() in x[0].lower()]
        print(f'\n--- {len(sel)} case BÁO OAN (agent F · thủ công P) ---')
        co_ma = sum(1 for x in sel if x[3])
        for t, ma, mm, s in sel:
            print(f'  {t:<24} {ma:<26} {mm[:62]}  [mã lỗi: {s or "—"}]')
        if sel:
            print(f'\n  Có mã lỗi: {co_ma}/{len(sel)}. Case KHÔNG có mã lỗi thường là bug đã được vá')
            print('  giữa hai lượt đo, không phải agent nhận định sai — xem §5 của hướng dẫn.')

    if a.tsv:
        tsv += ['', 'BẢNG 1 — TỔNG HỢP TRẠNG THÁI', 'Chỉ số\tTự động (Lần 1)\tThủ công (Lần 2)',
                f"P\t{tong['FP_']}\t{tong['GP']}", f"F\t{tong['FF']}\t{tong['GF']}",
                f"PE\t{tong['FPE']}\t{tong['GPE']}", f"Chưa chạy\t{tong['FX']}\t{tong['GX']}",
                f"Tổng\t{tong['n']}\t{tong['n']}", '',
                'BẢNG 2 — ĐỘ TIN CẬY', 'Metric\tGiá trị\tÝ nghĩa thực tế',
                f'True Positive (TP)\t{TP}\tSố bug agent bắt trúng',
                f'False Positive (FP)\t{FP}\tSố lần agent báo lỗi oan',
                f'False Negative (FN)\t{FN}\tSố bug agent bỏ lọt',
                f'True Negative (TN)\t{TN}\tSố case Pass agent xác nhận đúng',
                f'Accuracy\t{fmt(acc).replace(".", ",")}\tĐộ chính xác tổng thể',
                f'Precision\t{fmt(pre).replace(".", ",")}\tTrong các lỗi agent báo, bao nhiêu % là lỗi thật',
                f'Recall\t{fmt(rec).replace(".", ",")}\tTrong tổng số lỗi thực tế, agent bắt được bao nhiêu %',
                f'F1-score\t{fmt(f1).replace(".", ",")}\tCân bằng giữa Precision và Recall',
                f'NPV\t{fmt(npv).replace(".", ",")}\tKhi agent báo P thì tin được bao nhiêu %']
        with open(a.tsv, 'w') as fh:
            fh.write('\n'.join(tsv))
        print(f'\n→ đã ghi {a.tsv}')


if __name__ == '__main__':
    main()

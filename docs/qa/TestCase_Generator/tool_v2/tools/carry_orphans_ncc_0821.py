# -*- coding: utf-8 -*-
"""Mang case "chỉ có ở FILE KẾT QUẢ" ngược về bộ NGUỒN trước khi đồng bộ.

Bộ nguồn và bộ kết quả của NCC đã lệch nhau từ trước đợt này: QA chạy live có viết thêm
case ngay trên file kết quả mà không cập nhật ngược về nguồn. Nếu đồng bộ luôn thì những
case đó (kèm P/F/PE và ghi chú) biến mất.

Script tìm chúng, xác định CN + nhóm cha trong file kết quả, rồi chèn vào ĐÚNG nhóm cùng
tên bên nguồn. Case thuộc diện LUẬT MỚI ĐÃ LOẠI (nhóm "đang tải / lỗi tải", case phân trang
đặt ở khối Chức năng/ATTT) thì KHÔNG mang về.

    python3 carry_orphans_ncc_0821.py            # dry-run
    python3 carry_orphans_ncc_0821.py --apply
"""
import os, re, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../testCase/NCC/')
SRC, DST = BASE + 'testCase/', BASE + 'Ket-qua-test/'
APPLY = '--apply' in sys.argv
ONLY = [a for a in sys.argv[1:] if not a.startswith('--')]

PAGING_KW = ['phan trang', 'sang trang', 've trang', 'trang sau', 'trang truoc', 'chuyen trang',
             'so ban ghi moi trang', 'so dong moi trang', 'trang dau', 'trang cuoi',
             'trang 1', 'trang 2', 'reset trang']
PAGING_BLACK = ['trang thai', 'tai lai trang', 'trang chu', 'trang thiet bi']


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()


def loai_bo(b, grp, sub):
    """Case thuộc diện luật mới đã loại — không mang về nguồn."""
    nb, ng, ns = norm(b), norm(grp), norm(sub)
    if 'dang tai' in nb or 'tai loi' in nb or 'loi khi tai' in nb or 'loi tai' in nb:
        return 'đang tải / lỗi tải'
    if ('trang thai tai' in ns and ('rong' in ns or 'loi' in ns)):
        return 'nhóm trạng thái tải bị cấm'
    if ('chuc nang' in ng or 'an toan thong tin' in ng) \
            and any(k in nb for k in PAGING_KW) and not any(x in nb for x in PAGING_BLACK):
        return 'phân trang sai khối'
    return None


def walk(tc):
    """[(rn, CN, nhóm cha, B, C, D)] cho mọi dòng case."""
    out, cn, grp, sub = [], '', '', ''
    for rn in tc.order:
        if rn < 12:
            continue
        lv, txt = tc.lvl(rn), (tc.c(rn, 'B') or '')
        if lv == 'cn':   cn, grp, sub = txt.split('\n')[0].strip(), '', ''
        elif lv == 'grp': grp, sub = txt, ''
        elif lv in ('sub', 'sub2'): sub = txt
        elif lv == 'case' and tc.c(rn, 'C'):
            out.append((rn, cn, grp, sub, txt, tc.c(rn, 'C'), tc.c(rn, 'D')))
    return out


def run(src_path, dst_path):
    name = os.path.basename(src_path)
    sheets = tcfix.load(src_path).bpsheets
    dsheets = tcfix.load(dst_path).bpsheets
    tot_add = tot_skip = tot_nogroup = 0
    for bp in sheets:
        dbp = bp if bp in dsheets else (dsheets[0] if len(sheets) == 1 == len(dsheets) else None)
        if dbp is None:
            continue
        src, dst = tcfix.load(src_path, bp), tcfix.load(dst_path, dbp)
        have = {}
        for _, _, _, _, b, c, _ in walk(src):
            have[(norm(b), norm(c)[:220])] = have.get((norm(b), norm(c)[:220]), 0) + 1
        seen = {}
        add = {}                      # rn nguồn (cuối nhóm) -> [case]
        for rn, cn, grp, sub, b, c, d in walk(dst):
            k = (norm(b), norm(c)[:220])
            seen[k] = seen.get(k, 0) + 1
            if seen[k] <= have.get(k, 0):
                continue              # đã có bên nguồn
            why = loai_bo(b, grp, sub)
            if why:
                tot_skip += 1
                continue
            # tìm nhóm cùng tên trong CN cùng tên bên nguồn
            rows = [r for r in src.order if r >= 12]
            pos, in_cn, in_grp = None, False, False
            for r in rows:
                lv, txt = src.lvl(r), (src.c(r, 'B') or '')
                if lv == 'cn':
                    in_cn = norm(txt.split('\n')[0]) == norm(cn); in_grp = False
                elif lv == 'grp' and in_cn:
                    in_grp = norm(txt) == norm(grp)
                elif lv in ('sub', 'sub2') and in_cn and in_grp:
                    if norm(txt) == norm(sub):
                        pos = r
                elif lv == 'case' and pos is not None and r > pos:
                    pos = r
                if lv in ('cn', 'grp', 'sub', 'sub2') and pos is not None \
                        and not (lv in ('sub', 'sub2') and norm(txt) == norm(sub)):
                    if r > pos:
                        break
            if pos is None:
                tot_nogroup += 1
                continue
            add.setdefault(pos, []).append((b, c, d))
            tot_add += 1
        if not add:
            continue
        print('   [%s] mang về %d case vào %d nhóm' % (bp, sum(len(v) for v in add.values()), len(add)))
        if not APPLY:
            continue
        pl = tcfix.Plan(src)
        for r in src.order:
            if r < 12:
                continue
            pl.keep(r)
            for b, c, d in add.get(r, []):
                pl.case(b, c, d)
        src.rebuild(pl).save(quiet=True, sync=False)
    if tot_add or tot_skip or tot_nogroup:
        print('%-46s mang về %3d · bỏ theo luật %3d · không thấy nhóm %3d'
              % (name[:46], tot_add, tot_skip, tot_nogroup))
    return tot_add


if __name__ == '__main__':
    tot = 0
    for f in sorted(os.listdir(DST)):
        if not f.endswith('.xlsx'):
            continue
        stem = f.replace('_ket_qua', '').replace('.xlsx', '')
        cand = [SRC + stem + '.xlsx', SRC + stem + '-mau.xlsx']
        src = next((c for c in cand if os.path.exists(c)), None)
        if not src or os.path.basename(src) == 'Testcase-Role-NCC-mau.xlsx':
            continue
        if ONLY and not any(o.lower() in f.lower() for o in ONLY):
            continue
        tot += run(src, DST + f)
    print('\n=== %s: %d case mang về nguồn ===' % ('ĐÃ GHI' if APPLY else 'DRY-RUN', tot))

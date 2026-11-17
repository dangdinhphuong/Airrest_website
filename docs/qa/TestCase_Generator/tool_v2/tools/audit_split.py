# -*- coding: utf-8 -*-
"""Dò các CN bị DỒN nhiều thao tác — ứng viên cần tách nhỏ (chỉ đọc).

Tín hiệu chấm điểm:
  A. CN chứa >1 loại thao tác chuẩn khác nhau (Thêm/Sửa/Xóa/Chi tiết/Xuất/Nhập/Tìm kiếm/Danh sách)
  B. CN chiếm tỷ trọng case lớn bất thường trong file
  C. Tiêu đề CN có dấu hiệu ghép nhiều việc ("/", "&", "·", " và ")
  D. CN không có nhóm An toàn thông tin (thường do bị tách dở hoặc gộp vào CN khác)
  E. Nhóm sub trong "Chức năng" không thuộc checklist chuẩn nào (thao tác lạ bị nhét chung)
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, glob, re, unicodedata
import qalib
import roles

ROLE = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
CFG = roles.get(ROLE)


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def kind(sub):
    """Cùng bộ phân loại với complete_func.py."""
    n = re.sub(r'^chuc nang\s*', '', norm(sub)).strip()
    if not n or '/' in n:
        return None
    if n.startswith(('dang xuat', 'dang nhap', 'dang bai', 'xuat ban', 'luu tru', 'luu nhap',
                     'luu tam', 'chan ', 'dong ', 'huy', 'doi mat khau', 'dieu huong')):
        return None
    if 'don le' in n: return None
    if 'ket hop' in n: return 'TìmKếtHợp'
    if n.startswith('tim kiem') or n.startswith('tra cuu'): return 'TìmKiếm'
    if 'danh sach' in n: return 'DanhSách'
    if 'chi tiet' in n: return 'ChiTiết'
    if n.startswith(('them', 'tao', 'khoi tao', 'khai bao')): return 'Thêm'
    if n.startswith(('cap nhat', 'chinh sua', 'sua', 'luu', 'ghi nhan')): return 'Sửa'
    if n.startswith('xoa'): return 'Xóa'
    if 'nhap excel' in n or 'nhap file' in n or n.startswith('import'): return 'Nhập'
    if n.startswith('xuat') or n.startswith('tai ve'): return 'Xuất'
    return None


# thao tác "nặng" — mỗi cái xứng đáng 1 CN riêng theo mau
HEAVY = {'Thêm', 'Sửa', 'Xóa', 'ChiTiết', 'Xuất', 'Nhập', 'TìmKiếm', 'DanhSách'}
SPLIT_MARK = re.compile(r'\s[/&·]\s|\s+VÀ\s+|\s+và\s+')

rows = []
_BROKEN = []   # (tên file, lý do) — xem chú thích ở audit_func.py
for path in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
    base = os.path.basename(path)
    if base in CFG['skip']:
        continue
    key = base.replace(CFG['strip'], '').replace('.xlsx', '')
    try:
        _bps = tcfix.load(path).bpsheets
    except Exception as e:
        _BROKEN.append((base, '%s: %s' % (type(e).__name__, e))); continue
    for bp in _bps:
        try:
            tc = tcfix.load(path, bp=bp)
        except Exception as e:
            _BROKEN.append((base, '%s: %s' % (type(e).__name__, e))); continue
        cns = []                                   # [tiêu đề, số case, {loại}, có ATTT, [sub lạ]]
        cur = None; grp = None
        for rn in tc.order:
            if rn < 12: continue
            B, C = tc.c(rn, 'B'), tc.c(rn, 'C')
            lv = tc.lvl(rn)
            if not C:
                if lv == 'cn':
                    cur = [B.splitlines()[0], 0, set(), False, []]
                    cns.append(cur); grp = None
                elif lv == 'grp' and cur:
                    grp = norm(B)
                    if grp.startswith('an toan'): cur[3] = True
                elif lv == 'sub' and cur and grp and grp.startswith('chuc nang'):
                    k = kind(B)
                    if k: cur[2].add(k)
                    elif norm(B) not in ('chuc nang huy bo',): cur[4].append(B)
            elif cur:
                cur[1] += 1
        tot = sum(c[1] for c in cns) or 1
        for title, n, kinds, attt, odd in cns:
            heavy = kinds & HEAVY
            score = 0; why = []
            # (A) tín hiệu THẬT: 1 CN ôm nhiều thao tác nặng -> mau tách mỗi thao tác 1 CN
            if len(heavy) > 1:
                score += 5 * (len(heavy) - 1)
                why.append('GỘP %d thao tác: %s' % (len(heavy), ' + '.join(sorted(heavy))))
            # (B) kích thước CHỈ tính khi đã có dấu hiệu gộp — CN thêm mới to là bình thường
            if len(heavy) > 1 and n >= 60:
                score += 2; why.append('%d case' % n)
            # (C) tiêu đề ghép — BỎ QUA các mẫu tên chuẩn của mau
            CANON = re.compile(r'^(t[ìi]m ki[ếe]m\s*&\s*l[ọo]c|danh s[áa]ch)', re.I)
            if SPLIT_MARK.search(title) and not CANON.match(title.strip()):
                score += 1; why.append('tiêu đề ghép nhiều việc')
            # (D) thiếu nhóm An toàn thông tin — mau có ATTT ở MỌI CN, TRỪ CN Xuất excel:
            # chỉ thị 2026-09-10 bỏ hẳn khối `Validate` và `An toàn thông tin` khỏi CN đó
            # (`fix_cn_xuatexcel.py`). Thiếu miễn trừ này thì MỌI màn có CN Xuất excel đều bị
            # báo đỏ oan — đã dính ở cả `LoaiNguon` lẫn `LoaiLuuTru` (moetdl). Dùng CHUNG
            # `qalib.is_export_cn` với bộ bơm để hai bên không bao giờ lệch nhau.
            if not attt and n and not qalib.is_export_cn(title):
                score += 2; why.append('THIẾU nhóm An toàn thông tin')
            if len(odd) >= 3:
                score += 1; why.append('%d nhóm chức năng ngoài chuẩn' % len(odd))
            if score >= 2:
                rows.append((score, key, bp, title, n, '; '.join(why), len(heavy) > 1, not attt))

rows.sort(reverse=True)
print('%-3s %-26s %-5s %s' % ('Đ', 'FILE', 'case', 'CN / lý do'))
print('-' * 116)
for sc, key, bp, title, n, why, gop, noattt in rows:
    print('%-3d %-26s %-5d %s' % (sc, key, n, title[:60]))
    print('%-36s %s' % ('', why))
print('-' * 116)
print('role %s: %d CN GỘP nhiều thao tác (cần tách) | %d CN thiếu nhóm ATTT'
      % (ROLE, sum(1 for r in rows if r[6]), sum(1 for r in rows if r[7])))

if _BROKEN:
    print('!!! %d file KHÔNG rà được (kết quả trên CHƯA phủ hết role):' % len(_BROKEN))
    for _b, _w in _BROKEN:
        print('    - %-52s %s' % (_b[:52], _w))

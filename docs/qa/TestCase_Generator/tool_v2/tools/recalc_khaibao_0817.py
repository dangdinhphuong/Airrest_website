# -*- coding: utf-8 -*-
"""B4b — vá 2 thứ mà `tcfix.rebuild()/save()` không lo được cho 4 file Quản lý khai báo.

1. **Công thức trỏ tên sheet CŨ.** Sheet test case đã đổi tên thành `BP-AD-<Tên>` nhưng
   sheet `Tổng hợp` vẫn còn `'<tên cũ>'!D2..D8` → mở lên là `#REF!`. Tên trong công thức
   có thể bị mã hoá thực thể (`N&#259;ng...`) nên phải giải mã trước khi so.

2. **Giá trị đã tính (cached) sai.** `rebuild()` ghi đè cache của D7/D8, còn `save(sync=True)`
   của patch_quota ghi nhầm cache D5 sheet Tổng hợp. Bản thân công thức vẫn đúng nên Excel
   tính lại là hết, nhưng mọi script đọc thẳng .xlsx (kể cả bộ QA này) đọc phải số sai.
   Ở đây tính lại từ cột R rồi ghi lại cache cho khớp.

    python3 recalc_khaibao_0817.py [--apply]
"""
import os, re, sys, html, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roles

DIR = roles.get('Admin')['dir']
OLD = {'LoaiThietBi': 'Loại thiết bị', 'NamHocHocKy': 'Năm học và Học kỳ',
       'NangLucCotLoi': 'Năng lực cốt lõi', 'XuatXu': 'Xuất xứ'}


def sheets_of(z):
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    r2t = {}
    for m in re.finditer(r'<Relationship\b[^>]*/>', rels):
        i = re.search(r'Id="([^"]+)"', m.group(0)); t = re.search(r'Target="([^"]+)"', m.group(0))
        if i and t:
            p = t.group(1).lstrip('/')
            r2t[i.group(1)] = p if p.startswith('xl/') else 'xl/' + p
    out = []
    for m in re.finditer(r'<sheet\b[^>]*/>', z.read('xl/workbook.xml').decode()):
        nm = re.search(r'name="([^"]+)"', m.group(0)).group(1)
        rid = re.search(r'r:id="(rId\d+)"', m.group(0)).group(1)
        out.append((html.unescape(nm), r2t[rid]))
    return out


def cell(body, col, rn):
    m = re.search(r'<c r="%s%d"[^>]*?(?:/>|>.*?</c>)' % (col, rn), body, re.S)
    return m.group(0) if m else None


SS = []          # bảng shared string của workbook đang xử lý


def val(c):
    """Giá trị hiển thị của một ô — đỡ cả inlineStr lẫn shared string.

    2/4 file ghi cột kết quả bằng shared string; nếu không tra bảng thì đọc ra CHỈ SỐ
    ("61") chứ không phải "P", làm phép đếm lại sai toàn bộ."""
    if not c:
        return ''
    inner = re.sub(r'<f[^>]*(?:/>|>.*?</f>)', '', c, flags=re.S)
    txt = html.unescape(re.sub(r'<[^>]+>', '', inner)).strip()
    if 't="s"' in c and txt.isdigit() and int(txt) < len(SS):
        return SS[int(txt)]
    return txt


def set_v(c, new):
    """Đặt lại <v> của một ô công thức (giữ nguyên <f>)."""
    if '<v>' in c:
        return re.sub(r'<v>.*?</v>', '<v>%s</v>' % new, c, flags=re.S)
    return c.replace('</c>', '<v>%s</v></c>' % new)


BROWSERS = [('F', 'G', 'H'), ('I', 'J', 'K'), ('L', 'M', 'N'), ('O', 'P', 'Q')]


def derive_r(body, rn):
    """Kết quả hiện tại = lần chạy MỚI NHẤT của mỗi trình duyệt (Lần 3 > 2 > 1);
    F thắng PE, PE thắng P; chưa trình duyệt nào chạy thì rỗng. Đúng công thức ô R."""
    latest = []
    for c1, c2, c3 in BROWSERS:
        v = ''
        for c in (c3, c2, c1):
            x = val(cell(body, c, rn))
            if x:
                v = x
                break
        latest.append(v)
    if 'F' in latest: return 'F'
    if 'PE' in latest: return 'PE'
    if not any(latest): return ''
    return 'P'


def run(name, apply=False):
    path = os.path.join(DIR, 'Testcase-Role-Admin-%s.xlsx' % name)
    new_sheet = 'BP-AD-%s' % name
    z = zipfile.ZipFile(path)
    global SS
    SS = ([html.unescape(re.sub('<[^>]+>', '', x)) for x in
           re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode(), re.S)]
          if 'xl/sharedStrings.xml' in z.namelist() else [])
    sh = dict(sheets_of(z))
    tc_path, sum_path = sh[new_sheet], sh['Tổng hợp']
    tcx = z.read(tc_path).decode()

    # ── tính lại cột R từ chính các cột lần chạy (2/4 file chưa từng được Excel tính,
    #    cache <v> rỗng nên đọc thẳng .xlsx sẽ ra 0 P / 0 F dù cột F đầy kết quả)
    P = F = PE = blank = total = 0
    for rm in list(re.finditer(r'<row r="(\d+)"[^>]*>(.*?)</row>', tcx, re.S)):
        rn, body = int(rm.group(1)), rm.group(2)
        if rn < 12 or not val(cell(body, 'C', rn)):
            continue
        total += 1
        v = derive_r(body, rn)
        if v == 'P': P += 1
        elif v == 'F': F += 1
        elif v == 'PE': PE += 1
        else: blank += 1
        rc = cell(body, 'R', rn)
        if rc and '<f' in rc:
            tcx = tcx.replace(rc, set_v(rc, v))
    print('%-14s R: %d P · %d F · %d PE · %d chưa chạy / %d case' % (name, P, F, PE, blank, total))

    repl = {}
    # ── 1. cache D4..D8 của sheet test case
    for ref, num in (('D4', P), ('D5', F), ('D6', PE), ('D7', blank), ('D8', total)):
        m = re.search(r'<c r="%s"[^>]*?(?:/>|>.*?</c>)' % ref, tcx, re.S)
        if m and '<f' in m.group(0):
            tcx = tcx.replace(m.group(0), set_v(m.group(0), num))
    repl[tc_path] = tcx.encode()

    # ── 2. sheet Tổng hợp: sửa tên sheet trong công thức + cache
    sx = z.read(sum_path).decode()
    old = OLD[name]
    n_ref = 0

    def fix_f(m):
        nonlocal n_ref
        body = html.unescape(m.group(1))
        new = re.sub(r"'?" + re.escape(old) + r"'?!", "'%s'!" % new_sheet, body)
        if new == body:
            return m.group(0)
        n_ref += 1
        return '<f%s>%s</f>' % (m.group(2), new.replace('&', '&amp;').replace('<', '&lt;'))

    sx = re.sub(r'<f([^>]*)>(.*?)</f>', lambda m: fix_f(type('M', (), {
        'group': lambda s, i: {0: m.group(0), 1: m.group(2), 2: m.group(1)}[i]})()), sx, flags=re.S)

    row4 = {'C': P, 'D': F, 'E': PE, 'F': blank, 'G': total,
            'H': round(P / total, 10) if total else 0,
            'I': round(F / total, 10) if total else 0,
            'J': round((P + F) / total, 10) if total else 0}
    for rn in (4, 5):
        rm = re.search(r'<row r="%d"[^>]*>(.*?)</row>' % rn, sx, re.S)
        if not rm:
            continue
        body = rm.group(1)
        nb = body
        for col, num in row4.items():
            c = cell(body, col, rn)
            if c and '<f' in c:
                nb = nb.replace(c, set_v(c, num))
        sx = sx.replace(body, nb)
    repl[sum_path] = sx.encode()
    z.close()
    print('               sửa %d công thức trỏ sheet "%s" → "%s"' % (n_ref, old, new_sheet))
    if not apply:
        return

    tmp = path + '.tmp'
    zin = zipfile.ZipFile(path)
    zo = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
    for it in zin.infolist():
        zo.writestr(it, repl.get(it.filename, zin.read(it.filename)))
    zo.close(); zin.close(); os.replace(tmp, path)
    print('               ĐÃ GHI')


if __name__ == '__main__':
    ap = '--apply' in sys.argv
    for n in OLD:
        run(n, apply=ap)
    print('===', 'ĐÃ GHI' if ap else 'dry-run (thêm --apply)', '===')

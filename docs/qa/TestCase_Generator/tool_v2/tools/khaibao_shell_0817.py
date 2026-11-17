# -*- coding: utf-8 -*-
"""B2 — chuyển 4 file test case nhóm "Quản lý khai báo" sang KHUNG chuẩn Admin.

4 file gốc (`test_cases_<slug>_ket_qua_ptpt.xlsx`) do bên ngoài sinh, nội dung đúng khuôn
cột A..T như bộ Admin nhưng KHÔNG dùng được với `tcfix` vì:

  1. sheet test case không đặt tên bắt đầu bằng `BP` -> `tcfix.load()` không tìm ra sheet.
  2. khối `An toàn thông tin` dùng style RIÊNG (thứ 5) -> `TC.LV` chỉ nhận 4 style đầu nên
     `lvl()` trả 'case' cho dòng tiêu đề đó, hỏng toàn bộ phép rà.
     ĐÃ VÁ Ở GỐC 2026-09-10: `TC.LV` suy cấp từ `outlineLevel` chứ không theo thứ tự số
     style-id nữa, và dòng đệm (ô B rỗng) không còn bị đếm là một cấp -> `strip_trailing()`
     dưới đây chỉ còn để dọn file cho gọn, KHÔNG còn là điều kiện để tcfix đọc được nữa.
     Đừng chép lại mẹo đó sang script mới.
  3. cột R (Kết quả hiện tại) là CÔNG THỨC CHIA SẺ (`<f t="shared" ref=... si=...>`).
     `tcfix.rebuild()` chỉ đổi thuộc tính `r=` của ô, không đổi tham chiếu bên trong công
     thức -> dòng bị dời chỗ sẽ đọc kết quả của dòng khác. Phải hạ về công thức thường
     theo từng dòng trước, và vá lại sau mỗi lần rebuild (xem `fix_r_column`).

Chạy:
    python3 khaibao_shell_0817.py            # dry-run
    python3 khaibao_shell_0817.py --apply
"""
import os, re, sys, shutil, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roles

DIR = roles.get('Admin')['dir']

# slug file gốc -> (tên sheet TC gốc, hậu tố tên file chuẩn Admin)
FILES = [
    ('loai-thiet-bi',    'Loại thiết bị',      'LoaiThietBi'),
    ('nam-hoc-hoc-ky',   'Năm học và Học kỳ',  'NamHocHocKy'),
    ('nang-luc-cot-loi', 'Năng lực cốt lõi',   'NangLucCotLoi'),
    ('xuat-xu',          'Xuất xứ',            'XuatXu'),
]

# Công thức cột R (Kết quả hiện tại): lấy lần chạy MỚI NHẤT của từng trình duyệt
# (Lần 3 > Lần 2 > Lần 1), rồi F thắng PE thắng P; chưa chạy trình duyệt nào -> rỗng.
_TRIO = ['IF(H{r}="",IF(G{r}="",IF(F{r}="","",F{r}),G{r}),H{r})',
         'IF(K{r}="",IF(J{r}="",IF(I{r}="","",I{r}),J{r}),K{r})',
         'IF(N{r}="",IF(M{r}="",IF(L{r}="","",L{r}),M{r}),N{r})',
         'IF(Q{r}="",IF(P{r}="",IF(O{r}="","",O{r}),P{r}),Q{r})']


def r_formula(rn):
    t = [x.format(r=rn) for x in _TRIO]
    eq = lambda v: 'OR(%s)=TRUE()' % ','.join('%s="%s"' % (x, v) for x in t)
    empty = 'AND(%s)=TRUE()' % ','.join('%s=""' % x for x in t)
    return 'IF(%s,"F",IF(%s,"PE",IF(%s,"","P")))' % (eq('F'), eq('PE'), empty)


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def _sheet_path(z, name):
    """Trả đường dẫn xml của sheet theo tên (rels có thể ghi Target dạng /xl/... hoặc worksheets/...)."""
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    r2t = {}
    for m in re.finditer(r'<Relationship\b[^>]*/>', rels):
        i = re.search(r'Id="([^"]+)"', m.group(0))
        t = re.search(r'Target="([^"]+)"', m.group(0))
        if i and t:
            p = t.group(1).lstrip('/')
            r2t[i.group(1)] = p if p.startswith('xl/') else 'xl/' + p
    wb = z.read('xl/workbook.xml').decode()
    for m in re.finditer(r'<sheet\b[^>]*/>', wb):
        if re.search(r'name="([^"]+)"', m.group(0)).group(1) == name:
            return r2t[re.search(r'r:id="(rId\d+)"', m.group(0)).group(1)]
    raise KeyError(name)


def _write(path, repl, add=None):
    """Ghi lại .xlsx với một số phần tử được thay nội dung; `add` = phần tử mới cần thêm."""
    z = zipfile.ZipFile(path)
    have = set(z.namelist())
    tmp = path + '.tmp'
    zo = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
    for it in z.infolist():
        zo.writestr(it, repl.get(it.filename, z.read(it.filename)))
    for name, data in (add or {}).items():
        if name not in have:
            zo.writestr(name, data)
    zo.close(); z.close(); os.replace(tmp, path)


SST_EMPTY = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
             'count="0" uniqueCount="0"/>')


def ensure_shared_strings(path):
    """`tcfix.TC.__init__` đọc thẳng `xl/sharedStrings.xml`; 2/4 file dùng toàn inlineStr nên
    không có phần tử này và load() ném KeyError. Thêm bảng rỗng hợp lệ thay vì sửa tcfix
    (thư viện đang dùng chung cho ~60 file của 3 role)."""
    z = zipfile.ZipFile(path)
    if 'xl/sharedStrings.xml' in z.namelist():
        z.close(); return False
    ct = z.read('[Content_Types].xml').decode()
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    z.close()
    ct = ct.replace('</Types>',
                    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.'
                    'openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')
    rid = 'rId%d' % (max(int(x) for x in re.findall(r'Id="rId(\d+)"', rels)) + 1)
    rels = rels.replace('</Relationships>',
                        '<Relationship Id="%s" Type="http://schemas.openxmlformats.org/'
                        'officeDocument/2006/relationships/sharedStrings" '
                        'Target="sharedStrings.xml"/></Relationships>' % rid)
    _write(path, {'[Content_Types].xml': ct.encode(), 'xl/_rels/workbook.xml.rels': rels.encode()},
           add={'xl/sharedStrings.xml': SST_EMPTY.encode()})
    return True


def cell_has_value(body, col, rn):
    """Ô có nội dung thật không — đỡ cả shared string (<v>) lẫn inlineStr (<is><t>)."""
    cm = re.search(r'<c r="%s%d"[^>]*?(?:/>|>(.*?)</c>)' % (col, rn), body, re.S)
    if not cm or not cm.group(1):
        return False
    inner = re.sub(r'<f[^>]*(?:/>|>.*?</f>)', '', cm.group(1), flags=re.S)   # bỏ phần công thức
    return bool(re.sub(r'<[^>]+>', '', inner).strip())


def last_content_row(xml):
    """Dòng cuối cùng CÓ nội dung ở B/C/D — dưới nó là dòng trống đệm, phải cắt bỏ."""
    last = 11
    for rm in re.finditer(r'<row r="(\d+)"[^>]*>(.*?)</row>', xml, re.S):
        rn, body = int(rm.group(1)), rm.group(2)
        if rn >= 12 and any(cell_has_value(body, c, rn) for c in 'BCD'):
            last = rn
    return last


def header_styles(xml, upto):
    """Style cột B của các dòng TIÊU ĐỀ (12..upto, không có giá trị ở cột C), theo số lần dùng."""
    from collections import Counter
    cnt = Counter()
    for rm in re.finditer(r'<row r="(\d+)"[^>]*>(.*?)</row>', xml, re.S):
        rn, body = int(rm.group(1)), rm.group(2)
        if rn < 12 or rn > upto or cell_has_value(body, 'C', rn):
            continue
        bc = re.search(r'<c r="B%d"([^>]*?)(?:/>|>)' % rn, body)
        if bc:
            st = re.search(r's="(\d+)"', bc.group(1))
            if st:
                cnt[st.group(1)] += 1
    return cnt


def strip_trailing(xml, upto):
    """Xoá các dòng đệm rỗng phía dưới dòng `upto` (2 file có tới 737/610 dòng như vậy).

    Trước 2026-09-10 đây là điều BẮT BUỘC: `TC.LV` suy 4 cấp tiêu đề từ style cột B của MỌI
    dòng không có cột C, nên dòng đệm mang style riêng chen vào là lệch toàn bộ bảng cấp.
    Nay tcfix đã tự loại dòng đệm (ô B rỗng) và suy cấp từ `outlineLevel`, nên việc xoá ở đây
    chỉ còn để file gọn.
    """
    n = [0]

    def drop(m):
        if int(m.group(1)) > upto:
            n[0] += 1
            return ''
        return m.group(0)

    xml = re.sub(r'<row r="(\d+)"[^>]*?(?:/>|>.*?</row>)', drop, xml, flags=re.S)
    xml = re.sub(r'<dimension ref="A1:([A-Z]+)\d+"/>', r'<dimension ref="A1:\g<1>%d"/>' % upto, xml)
    return xml, n[0]


def fix_r_column(path, sheet_name):
    """Hạ cột R về công thức THƯỜNG theo đúng dòng của nó; giữ nguyên giá trị đã tính.

    Gọi lại sau MỖI lần `tcfix.rebuild().save()` — rebuild dời dòng nhưng không dời tham
    chiếu trong công thức. Dòng case mới (chưa có ô R) được cấp công thức với giá trị rỗng.
    """
    z = zipfile.ZipFile(path)
    sp = _sheet_path(z, sheet_name)
    xml = z.read(sp).decode()
    z.close()

    # style của ô R trên dòng case — lấy từ ô R đầu tiên đang mang công thức
    m = re.search(r'<c r="R\d+" s="(\d+)"[^>]*>\s*<f', xml)
    r_st = m.group(1) if m else '38'
    n_fix = 0

    def one_row(rm):
        nonlocal n_fix
        rn = int(rm.group(2))
        body = rm.group(3)
        if rn < 12:
            return rm.group(0)
        cc = re.search(r'<c r="C%d"[^>]*?(?:/>|>(.*?)</c>)' % rn, body, re.S)
        is_case = bool(cc and cc.group(1) and cc.group(1).strip())
        rc = re.search(r'<c r="R%d"[^>]*?(?:/>|>.*?</c>)' % rn, body, re.S)
        if not rc:
            return rm.group(0)
        if not is_case:
            # dòng tiêu đề: bỏ hẳn công thức, để ô trống
            new = '<c r="R%d" s="%s"/>' % (rn, re.search(r's="(\d+)"', rc.group(0)).group(1)
                                          if re.search(r's="(\d+)"', rc.group(0)) else r_st)
        else:
            vm = re.search(r'<v>(.*?)</v>', rc.group(0), re.S)
            val = vm.group(1) if vm else ''
            st = re.search(r's="(\d+)"', rc.group(0))
            new = ('<c r="R%d" s="%s" t="str"><f>%s</f><v>%s</v></c>'
                   % (rn, st.group(1) if st else r_st, esc(r_formula(rn)), val))
            n_fix += 1
        return rm.group(0).replace(rc.group(0), new)

    xml = re.sub(r'(<row r="(\d+)"[^>]*>)(.*?)</row>', one_row, xml, flags=re.S)
    _write(path, {sp: xml.encode()})
    return n_fix


def _apply(m, fn):
    return fn(m)


def convert(slug, sheet_old, name, apply=False):
    src = os.path.join(DIR, 'test_cases_%s_ket_qua_ptpt.xlsx' % slug)
    dst = os.path.join(DIR, 'Testcase-Role-Admin-%s.xlsx' % name)
    sheet_new = 'BP-AD-%s' % name
    if not os.path.exists(src):
        print('  BỎ QUA (không có): %s' % os.path.basename(src)); return
    z = zipfile.ZipFile(src)
    sp = _sheet_path(z, sheet_old)
    xml = z.read(sp).decode()
    wb = z.read('xl/workbook.xml').decode()
    z.close()

    upto = last_content_row(xml)
    hs = header_styles(xml, upto)
    keys = sorted(hs, key=int)
    print('  %-16s sheet %-20s -> %-22s' % (slug, sheet_old, sheet_new))
    print('      dòng cuối có nội dung: %d · style tiêu đề: %s' % (upto, dict(hs)))
    if len(keys) < 5:
        print('      (%d style tiêu đề — không cần gộp)' % len(keys))
        merge_from, merge_to = None, None
    else:
        # style thứ 5 trở đi = khối ATTT tự đặt style riêng -> gộp về style 'grp' (thứ 2)
        merge_from, merge_to = keys[4:], keys[1]
        print('      gộp style %s -> %s (khối ATTT về cấp grp)' % (merge_from, merge_to))
    if not apply:
        return

    if merge_from:
        def fix_style(rm):
            rn = int(rm.group(2)); body = rm.group(3)
            if rn < 12:
                return rm.group(0)
            bc = re.search(r'<c r="B%d"([^>]*?)(?:/>|>)' % rn, body)
            if not bc:
                return rm.group(0)
            st = re.search(r's="(\d+)"', bc.group(1))
            if not st or st.group(1) not in merge_from:
                return rm.group(0)
            # đổi style của TOÀN BỘ ô B..E trên dòng đó cho đồng bộ viền
            out = rm.group(0)
            for col in 'BCDE':
                cm = re.search(r'<c r="%s%d" s="\d+"' % (col, rn), out)
                if cm:
                    out = out.replace(cm.group(0), '<c r="%s%d" s="%s"' % (col, rn, merge_to))
            return out
        xml = re.sub(r'(<row r="(\d+)"[^>]*>)(.*?)</row>', lambda m: _apply(m, fix_style), xml, flags=re.S)

    # tiêu đề khối ATTT: rút gọn về đúng cụm chuẩn của bộ Admin
    xml = re.sub(r'(<is><t[^>]*>)An toàn thông tin \([^<]*\)(</t></is>)', r'\g<1>An toàn thông tin\g<2>', xml)

    xml, n_drop = strip_trailing(xml, upto)
    if n_drop:
        print('      cắt %d dòng đệm rỗng ở cuối bảng' % n_drop)

    wb_new = wb.replace('name="%s"' % sheet_old, 'name="%s"' % sheet_new)
    # tcfix chỉ nhận Target dạng TƯƠNG ĐỐI ("worksheets/sheetN.xml"); 2/4 file ghi dạng
    # tuyệt đối ("/xl/worksheets/sheetN.xml") nên load() không tìm ra sheet nào.
    z = zipfile.ZipFile(src)
    rels = z.read('xl/_rels/workbook.xml.rels').decode(); z.close()
    rels_new = re.sub(r'Target="/xl/([^"]+)"', r'Target="\g<1>"', rels)
    # ...và tcfix đọc rels bằng regex `Id="rIdN" ... Target="..."` nên thứ tự thuộc tính
    # phải là Id TRƯỚC Target; 2/4 file ghi Type-Target-Id.
    def _reorder(m):
        el = m.group(0)
        g = lambda k: (re.search(r'%s="([^"]*)"' % k, el) or [None, ''])[1]
        return ('<Relationship Id="%s" Type="%s" Target="%s"%s/>'
                % (g('Id'), g('Type'), g('Target'),
                   ' TargetMode="%s"' % g('TargetMode') if 'TargetMode=' in el else ''))
    rels_new = re.sub(r'<Relationship\b[^>]*/>', _reorder, rels_new)
    shutil.copy2(src, dst)
    _write(dst, {sp: xml.encode(), 'xl/workbook.xml': wb_new.encode(),
                 'xl/_rels/workbook.xml.rels': rels_new.encode()})
    # sharedStrings có thể chứa tiêu đề ATTT dài -> sửa nốt
    z = zipfile.ZipFile(dst)
    ss = z.read('xl/sharedStrings.xml').decode() if 'xl/sharedStrings.xml' in z.namelist() else None
    z.close()
    if ss is not None:
        ss_new = re.sub(r'(<t[^>]*>)An toàn thông tin \([^<]*\)(</t>)', r'\g<1>An toàn thông tin\g<2>', ss)
        if ss_new != ss:
            _write(dst, {'xl/sharedStrings.xml': ss_new.encode()})
    if ensure_shared_strings(dst):
        print('      thêm xl/sharedStrings.xml rỗng (file dùng toàn inlineStr)')
    n = fix_r_column(dst, sheet_new)
    print('      -> %s  (cột R: %d dòng case hạ về công thức thường)' % (os.path.basename(dst), n))
    os.remove(src)


if __name__ == '__main__':
    ap = '--apply' in sys.argv
    for f in FILES:
        convert(f[0], f[1], f[2], apply=ap)
    print('\n=== %s ===' % ('ĐÃ GHI' if ap else 'dry-run, chưa ghi (thêm --apply)'))

# -*- coding: utf-8 -*-
"""Tính lại GIÁ TRỊ CACHE của cột R + D4:D8 + sheet `Tổng hợp` cho file kết quả.

Cần chạy sau khi bơm lại cột F/G vào file mới: ô R là CÔNG THỨC, cache `<v>` của nó vẫn
rỗng nên mọi công cụ đọc cache (kể cả openpyxl data_only) thấy "chưa chạy". `formula_layer`
cố ý KHÔNG đụng số liệu nên không làm việc này (xem README § Lớp công thức, điều 1).

Mô phỏng đúng công thức trong file: 4 cụm (F,G,H) (I,J,K) (L,M,N) (O,P,Q), mỗi cụm lấy
giá trị của cột SAU CÙNG có dữ liệu; có 'F' → F, có 'PE' → PE, rỗng hết → rỗng, còn lại P.

    python3 postfix_cache.py <thư mục hoặc file> [...]

Đổi tên 2026-09-12 (cũ: `postfix_cache_ncc_0821.py`). Logic vốn đã di động — nhận path bất
kỳ, mọi dự án — chỉ cái TÊN là gắn role NCC + đợt 08/21 nên người mới không dám dùng.
`postfix_cache_ncc_0821.py` giữ lại làm shim mỏng để 13 chỗ tài liệu/script cũ không gãy.
"""
import os, re, sys, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix
import qalib

GROUPS = [('F', 'G', 'H'), ('I', 'J', 'K'), ('L', 'M', 'N'), ('O', 'P', 'Q')]


def verdict(tc, rn):
    vals = []
    for a, b, c in GROUPS:
        v = ''
        for col in (a, b, c):                      # cột sau đè cột trước
            x = (tc.c(rn, col) or '').strip()
            if x:
                v = x
        vals.append(v)
    if 'F' in vals:  return 'F'
    if 'PE' in vals: return 'PE'
    if not any(vals): return ''
    return 'P'


def fix(path):
    tc = tcfix.load(path)
    marks = {}
    for bp in tc.bpsheets:
        t = tcfix.load(path, bp)
        marks[t.tcf] = {rn: verdict(t, rn) for rn in t.order if rn >= 12 and t.c(rn, 'C')}

    z = zipfile.ZipFile(path)
    # Nen P/F/PE cua o cot R nam trong STYLE cua o, khong phai conditional formatting
    # (CF cua LibreOffice ve de len vien -> chay live xong la mat lui ke). Script nay chay
    # NGAY SAU `write_marks_json.py` va la cho duy nhat biet ket qua moi, nen no phai to lai
    # nen; de mot minh `formula_layer` lo thi mau se dung o ket qua cua dot truoc.
    bm = qalib.BangMau(z.read('xl/styles.xml').decode())
    rels = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"',
                           z.read('xl/_rels/workbook.xml.rels').decode()))
    # thứ tự thuộc tính của <sheet> KHÔNG cố định (file do bên ngoài sinh đặt state= trước
    # name=) — bắt theo từng thẻ rồi dò từng thuộc tính, không dựa vào thứ tự.
    sheets = []
    for tag in re.findall(r'<sheet\b[^>]*/>', z.read('xl/workbook.xml').decode()):
        nm = re.search(r'name="([^"]+)"', tag)
        rid = re.search(r'r:id="([^"]+)"', tag)
        if nm and rid:
            sheets.append((nm.group(1), rid.group(1)))
    repl, tong = {}, [0, 0, 0, 0]                  # P F PE tổng
    for name, rid in sheets:
        part = 'xl/' + rels[rid].lstrip('/')
        if part.startswith('xl/xl/'): part = part[3:]
        s = z.read(part).decode()
        if part in marks:
            m = marks[part]
            p = sum(1 for v in m.values() if v == 'P')
            f = sum(1 for v in m.values() if v == 'F')
            pe = sum(1 for v in m.values() if v == 'PE')
            n = len(m); chua = n - p - f - pe
            tong[0] += p; tong[1] += f; tong[2] += pe; tong[3] += n
            for rn, v in m.items():                # ghi cache cho ô R (giữ nguyên công thức)
                def _sub(mm, v=v, rn=rn):
                    cell = mm.group(0)
                    # thẻ công thức có thể mang thuộc tính (<f aca="false"> của LibreOffice)
                    fm = re.search(r'<f\b[^>]*>.*?</f>', cell, re.S)
                    if not fm: return cell
                    attrs = re.match(r'<c [^>]*?>', cell).group(0)
                    attrs = re.sub(r'\st="[^"]*"', '', attrs)
                    sid = re.search(r's="(\d+)"', attrs)
                    moi = bm.style(int(sid.group(1)) if sid else 0, v)
                    attrs = (re.sub(r's="\d+"', 's="%d"' % moi, attrs, count=1) if sid
                             else attrs.replace('<c ', '<c s="%d" ' % moi, 1))
                    return attrs[:-1] + ' t="str">' + fm.group(0) + '<v>%s</v></c>' % v
                s = re.sub(r'<c r="R%d"[^>]*>.*?</c>' % rn, _sub, s, flags=re.S)
            for ref, val in (('D4', p), ('D5', f), ('D6', pe), ('D7', chua), ('D8', n)):
                s = re.sub(r'(<c r="%s"[^>]*>(?:<f[^>]*>.*?</f>)?<v>)-?[\d.]*(</v>)' % ref,
                           r'\g<1>%d\g<2>' % val, s, flags=re.S)
        elif name.strip().lower().startswith('tổng hợp'):
            repl[part] = None                      # xử lý sau khi biết tổng của mọi sheet BP
            continue
        repl[part] = s.encode()

    for name, rid in sheets:                       # sheet Tổng hợp
        if not name.strip().lower().startswith('tổng hợp'):
            continue
        part = 'xl/' + rels[rid].lstrip('/')
        if part.startswith('xl/xl/'): part = part[3:]
        s = z.read(part).decode()
        p, f, pe, n = tong
        chua = n - p - f - pe                      # cột H = "Chưa thực hiện", KHÔNG phải tổng
        for row in (5, 6):
            for col, val in (('D', n), ('E', p), ('F', f), ('G', pe), ('H', chua)):
                s = re.sub(r'(<c r="%s%d"[^>]*>(?:<f[^>]*>.*?</f>)?<v>)-?[\d.]*(</v>)' % (col, row),
                           r'\g<1>%d\g<2>' % val, s, flags=re.S)
            s = re.sub(r'(<c r="I%d"[^>]*>(?:<f[^>]*>.*?</f>)?<v>)[\d.]*(</v>)' % row,
                       r'\g<1>%s\g<2>' % (round(p / n, 6) if n else 0), s, flags=re.S)
        repl[part] = s.encode()

    if bm.doi:                                 # co style nen moi -> ghi lai bang style
        repl['xl/styles.xml'] = bm.xml.encode()
    tmp = path + '.tmp'
    zo = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
    for it in z.infolist():
        zo.writestr(it, repl.get(it.filename) or z.read(it.filename))
    zo.close(); z.close(); os.replace(tmp, path)
    print('%-52s %d case = %dP · %dF · %dPE · %d chưa chạy'
          % (os.path.basename(path)[:52], tong[3], tong[0], tong[1], tong[2],
             tong[3] - tong[0] - tong[1] - tong[2]))


if __name__ == '__main__':
    for arg in sys.argv[1:]:
        if os.path.isdir(arg):
            for f in sorted(os.listdir(arg)):
                if f.endswith('.xlsx') and not f.startswith('~'):
                    fix(os.path.join(arg, f))
        else:
            fix(arg)

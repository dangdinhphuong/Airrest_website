#!/usr/bin/env python3
"""Lop CONG THUC cua file test case (.xlsx) — ra soat + ap dat + sua lech hang.

Gop 2 cong cu cu (apply_mau_formulas.py, fix_formula_AR.py) thanh mot, va vá
cac thieu sot da tra gia:
  - nhan dien sheet test case KHONG chi dua vao tien to "BP-"  (17 file dung
    ten khac: "BP02-BaoHanh", "Lịch tập huấn", "Thông báo"...) va ho tro file
    co NHIEU sheet test case (Testcase-Role-NCC-KyThi.xlsx co 3 sheet)
  - ho tro CA HAI layout sheet "Tổng hợp" (kieu NCC hang 4/5/6, kieu Admin hang 3/4/5)
  - dataValidation dropdown P/F/PE khong duoc lan sang cot R (o cong thuc)
  - KHONG to mau cot R bang conditional formatting: LibreOffice ve nen CF de len
    vien o -> chay live xong la mat lui ke o cot R (chi tiet: qalib.BangMau)
  - chay lai nhieu lan van dung (idempotent): cong thuc bi lech hang do chen/xoa
    dong se duoc viet lai theo dung hang

Hop dong file mau (docs/qa-doc/Mau-ket-qua-test/):
  A  cong thuc sinh ma case tu $D$3   |  R  cong thuc suy P/F/PE tu F..Q
  Mau P/F/PE to thang vao style o R   |  DV dropdown P,F,PE chi tren F..Q
  D4:D8 COUNTIF/COUNTA                |  sheet Tổng hợp lien ket cong thuc

Gia tri cache <v> luon duoc GIU NGUYEN => moi parser doc <v> van ra dung so lieu.

Cach chay:
  python3 formula_layer.py --check <file...>     # chi ra soat, in bang, khong ghi
  python3 formula_layer.py --dry-run <file...>   # in viec se lam, khong ghi
  python3 formula_layer.py <file...>             # ap dat (tu luu ban lui vao bak/)
  python3 formula_layer.py --formula-only <file> # chi cot A/R + CF (khong dung DV/Tổng hợp)
  python3 formula_layer.py --check <thu_muc>     # ra soat de quy ca thu muc
"""

import glob
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib          # noqa: E402  — ban lui dung chung (thu muc rieng, khong canh file goc)

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

FIRST_DATA_ROW = 12
HEADER_LAST_ROW = 11
COVER_SHEETS = {'Trang bìa', 'Bìa', 'Tổng hợp', 'Hình ảnh', 'Chú giải'}
MARK_COLS = 'FGHIJKLMNOPQ'

# Mau P/F/PE cua cot R do `qalib.BangMau` to THANG vao style cua o (khong dung
# conditional formatting — xem giai thich day du o `qalib`, muc MAU KET QUA COT R).
BangMau = qalib.BangMau


def esc(t):
    return (t.replace('&', '&amp;').replace('<', '&lt;')
             .replace('>', '&gt;').replace('"', '&quot;'))


def formula_a(row):
    return (f'IF(AND(D{row}="",D{row}=""),"",$D$3&"_"&ROW()-{HEADER_LAST_ROW}'
            f'-COUNTBLANK($D${FIRST_DATA_ROW}:D{row}))')


def formula_r(row):
    def latest(a, b, c):
        return (f'IF({c}{row}="",IF({b}{row}="",IF({a}{row}="","",{a}{row}),'
                f'{b}{row}),{c}{row})')
    br = [latest('F', 'G', 'H'), latest('I', 'J', 'K'),
          latest('L', 'M', 'N'), latest('O', 'P', 'Q')]
    f = ','.join(f'{b}="F"' for b in br)
    pe = ','.join(f'{b}="PE"' for b in br)
    empty = ','.join(f'{b}=""' for b in br)
    return (f'IF(OR({f})=TRUE(),"F",IF(OR({pe})=TRUE(),"PE",'
            f'IF(AND({empty})=TRUE(),"","P")))')


def blocks_of(rows):
    out = []
    for r in rows:
        if out and out[-1][1] == r - 1:
            out[-1][1] = r
        else:
            out.append([r, r])
    return out


def cell(ref, style, formula, cached):
    return (f'<c r="{ref}" s="{style}" t="str">'
            f'<f>{esc(formula)}</f><v>{esc(cached)}</v></c>')


def shrink_sqref(sqref):
    """Bo cot R khoi mot sqref, giu nguyen cac vung con lai.

    Mot so file thu cong co conditionalFormatting to mau o ket qua F..Q nhung
    vung phu lan ca cot R ("F15:R1000", "G245:R245", "R12:R998") — de nguyen thi
    no da len 3 luat chuan cua cot R.
    """
    out = []
    for tok in sqref.split():
        m = re.fullmatch(r'([A-Z]+)(\d+):([A-Z]+)(\d+)', tok)
        if not m:
            if re.fullmatch(r'R\d+', tok):
                continue
            out.append(tok)
            continue
        c1, r1, c2, r2 = m.groups()
        if len(c1) == 1 and len(c2) == 1:
            if c1 == 'R' and c2 == 'R':
                continue
            if c1 <= 'Q' and c2 >= 'R':
                c2 = 'Q'
            elif c1 == 'R':
                c1 = 'S'
                if c1 > c2:
                    continue
        out.append(f'{c1}{r1}:{c2}{r2}')
    return ' '.join(out)


class Book:
    def __init__(self, path):
        self.path = path
        self.bak = None                 # duong dan ban lui, dat trong save()
        self._rows_cache = {}
        src = zipfile.ZipFile(path)
        self.order = src.namelist()
        self.parts = {n: src.read(n) for n in self.order}
        src.close()
        self.shared = []
        if 'xl/sharedStrings.xml' in self.parts:
            self.shared = [''.join(t.text or '' for t in si.iter(NS + 't'))
                           for si in ET.fromstring(self.parts['xl/sharedStrings.xml'])]
        wb = ET.fromstring(self.parts['xl/workbook.xml'])
        rels = {r.get('Id'): r.get('Target')
                for r in ET.fromstring(self.parts['xl/_rels/workbook.xml.rels'])}
        self.sheets = {}
        for sh in wb.find(NS + 'sheets'):
            t = rels.get(sh.get(RNS + 'id'))
            if not t:
                continue
            # Target co 3 dang: "worksheets/s.xml", "xl/worksheets/s.xml", "/xl/worksheets/s.xml"
            t = t.lstrip('/')
            self.sheets[sh.get('name')] = t if t.startswith('xl/') else 'xl/' + t

    def value(self, c):
        if c is None:
            return ''
        t, v, i = c.get('t'), c.find(NS + 'v'), c.find(NS + 'is')
        if i is not None:
            return ''.join(x.text or '' for x in i.iter(NS + 't')).strip()
        if v is None:
            return ''
        return (self.shared[int(v.text)] if t == 's' else (v.text or '')).strip()

    def rows_of(self, name):
        # Cache: tc_sheets() da parse moi sheet mot lan, scan_sheet() parse lai chinh
        # cac sheet do -> moi sheet test case bi doc 2 lan. Giu ket qua lai.
        hit = self._rows_cache.get(name)
        if hit is not None:
            return hit
        out = {}
        for r in ET.fromstring(self.parts[self.sheets[name]]).find(NS + 'sheetData'):
            out[int(r.get('r'))] = {re.match(r'[A-Z]+', c.get('r')).group(): c for c in r}
        self._rows_cache[name] = out
        return out

    def tc_sheets(self):
        """Sheet test case = sheet co ma case o D3 va co dong du lieu tu 12 tro di.

        KHONG dua vao tien to ten sheet: nhieu file dat ten "BP02-BaoHanh",
        "Lịch tập huấn", "Thông báo"...
        """
        out = []
        for name in self.sheets:
            if name in COVER_SHEETS:
                continue
            try:
                rows = self.rows_of(name)
            except Exception:
                continue
            if not self.value(rows.get(3, {}).get('D')):
                continue
            if any(r >= FIRST_DATA_ROW and self.value(rows[r].get('D')) for r in rows):
                out.append(name)
        return out

    def save(self, backup=True):
        # ban lui vao qalib.bak_dir() — KHONG de canh file goc trong thu muc bo case
        self.bak = qalib.backup(self.path, tag='formula') if backup else None
        with zipfile.ZipFile(self.path, 'w', zipfile.ZIP_DEFLATED) as out:
            for n in self.order:
                out.writestr(n, self.parts[n])


def scan_sheet(bk, name):
    """Tra ve trang thai lop cong thuc cua 1 sheet test case."""
    rows = bk.rows_of(name)
    xml = bk.parts[bk.sheets[name]].decode('utf-8')
    last = max(rows)
    cases = sorted(r for r in rows if r >= FIRST_DATA_ROW
                   and bk.value(rows[r].get('D')))
    st = {'sheet': name, 'last': last, 'ncase': len(cases), 'cases': cases}

    def col(c, only_cases):
        have = wrong = plain = 0
        for r in (cases if only_cases else sorted(k for k in rows if k >= FIRST_DATA_ROW)):
            cc = rows[r].get(c)
            if cc is None:
                continue
            f = cc.find(NS + 'f')
            if f is None:
                plain += 1
                continue
            have += 1
            body = re.sub(r'\$D\$3|\$D\$12', '', f.text or '')
            refs = set(int(m) for m in re.findall(r'[A-Q](\d+)', body))
            if refs and refs != {r}:
                wrong += 1
        return {'formula': have, 'wrong': wrong, 'plain': plain}

    st['A'] = col('A', False)
    st['R'] = col('R', True)
    cf = re.findall(r'<conditionalFormatting sqref="([^"]*)">', xml)
    st['cf'] = cf
    # dat khi: KHONG con khoi CF nao phu len cot R. Nen CF de len vien o (LibreOffice) nen
    # mau P/F/PE phai nam trong style cua o — `shrink_sqref` tra ve chuoi KHAC khi sqref
    # cham toi cot R, ke ca 3 luat R12:R<last> ma chinh tool nay tung dat truoc 12/09.
    st['cf_ok'] = all(shrink_sqref(s) == s for s in cf)
    dv = re.findall(r'<dataValidation[^>]*sqref="([^"]*)"', xml)
    st['dv'] = dv
    want_dv = ' '.join(f'F{a}:Q{b}' for a, b in blocks_of(cases))
    st['dv_ok'] = bool(dv) and dv[0] == want_dv
    st['dv_hits_R'] = any(re.search(r':R\d+|\bR\d+:', s) for s in dv)
    d = {}
    for n in (4, 5, 6, 7, 8):
        c = rows.get(n, {}).get('D')
        f = c.find(NS + 'f') if c is not None else None
        d[n] = f.text if f is not None else None
    st['D_ok'] = (all(d[n] for n in (4, 5, 6, 7, 8))
                  and f'$R${FIRST_DATA_ROW}:$R${last}' in (d[4] or '')
                  and f'$D${FIRST_DATA_ROW}:$D${last}' in (d[8] or ''))
    # so lieu that (suy tu F..Q) de doi chieu / ghi cache
    tally = {'P': 0, 'F': 0, 'PE': 0, '': 0}
    mismatch = []
    bm = BangMau(bk.parts['xl/styles.xml'].decode('utf-8'))    # ban nhap, chi de RA SOAT
    mau_sai = []
    for r in cases:
        cs = rows[r]
        br = []
        for trio in (('F', 'G', 'H'), ('I', 'J', 'K'), ('L', 'M', 'N'), ('O', 'P', 'Q')):
            v = ''
            for c in trio:
                t = bk.value(cs.get(c))
                if t:
                    v = t
            br.append(v)
        mark = 'F' if 'F' in br else ('PE' if 'PE' in br else ('' if not any(br) else 'P'))
        cur = bk.value(cs.get('R'))
        c_r = cs.get('R')
        if bm.sai_mau(int((c_r.get('s') or 0)) if c_r is not None else 0, cur):
            mau_sai.append(r)                  # nen dang to khong dung voi ket qua dang hien
        if cur != mark:
            # O nay QA ghi tay khac voi gia tri suy tu F..Q => GIU NGUYEN, khong ap
            # cong thuc; tally van dem theo gia tri dang hien thi de cache khong lech.
            mismatch.append(r)
            tally[cur if cur in tally else ''] += 1
        else:
            tally[mark] += 1
    st['tally'] = tally
    st['mismatch'] = mismatch      # danh sach dong co R khac gia tri suy tu F..Q
    st['mau_sai'] = mau_sai        # danh sach dong co NEN o R khong khop ket qua dang hien
    return st


def dat_style(cell_xml, sid):
    """Dat lai `s=` cho MOT o, chi dung trong the mo `<c ...>` (dung cham vao ruot o)."""
    moi, n = re.subn(r'(<c\b[^>]*?)\bs="\d+"', r'\g<1>s="%d"' % sid, cell_xml, count=1)
    if n:
        return moi
    return re.sub(r'<c\b', '<c s="%d"' % sid, cell_xml, count=1)


def apply_sheet(bk, name, st, formula_only=False):
    """Viet lai cot A, cot R, mau o R (+ DV neu khong formula_only). Tra ve so viec da lam."""
    rows = bk.rows_of(name)
    xml = bk.parts[bk.sheets[name]].decode('utf-8')
    case_set = set(st['cases'])
    keep_rows = set(st['mismatch'])
    done = {'A': 0, 'R': 0, 'keep': 0, 'D23': 0, 'mau': 0}
    bm = BangMau(bk.parts['xl/styles.xml'].decode('utf-8'))

    def rewrite(m):
        col, row, attrs = m.group(1), int(m.group(2)), m.group(3)
        if row < FIRST_DATA_ROW or col not in ('A', 'R'):
            return m.group(0)
        style = (re.search(r's="(\d+)"', attrs) or [None, '0'])[1]
        cached = bk.value(rows.get(row, {}).get(col))
        if col == 'A':
            done['A'] += 1
            return cell(f'A{row}', style, formula_a(row), cached)
        if row not in case_set:
            return m.group(0)          # dong tieu de nhom: cot R de trong
        # nen P/F/PE nam trong STYLE cua o (khong dung CF — CF de mat vien, xem qalib.BangMau)
        sid = bm.style(int(style), cached)
        if sid != int(style):
            done['mau'] += 1
        if row in keep_rows:
            done['keep'] += 1          # QA ghi tay khac F..Q: giu NGUYEN VAN, chi to lai nen
            return dat_style(m.group(0), sid)
        done['R'] += 1
        return cell(f'R{row}', sid, formula_r(row), cached)

    xml = re.sub(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>.*?</c>)', rewrite, xml, flags=re.S)

    # Chi thi 2026-09-12: can giua CA D2 VA D3 (ten man hinh + ma truong hop kiem thu).
    # D4:D8 von da can giua san. Lay nguyen style id cua D4 thay vi hardcode so: moi file mot
    # bang cellXfs khac nhau, ghi cung mot so la doi nham dinh dang o file khac.
    _d4 = re.search(r'<c r="D4"[^>]*?s="(\d+)"', xml)
    if _d4:
        for _ref in ('D2', 'D3'):
            xml, _n = re.subn(r'(<c r="%s"[^>]*?)s="\d+"' % _ref,
                              r'\1s="%s"' % _d4.group(1), xml, count=1)
            done['D23'] += _n

    # don 3 khoi CF cot R ma ban truoc 12/09 cua chinh tool nay da dat (chung xoa vien)
    xml = re.sub(r'<conditionalFormatting sqref="R\d+:R\d+">.*?</conditionalFormatting>',
                 '', xml, flags=re.S)

    # ...con cac khoi CF khac (to mau o ket qua F..Q) thi GIU, chi CAT COT R ra khoi vung phu.
    # Khong dat lai luat CF nao cho cot R: mau P/F/PE da nam trong style cua o (BangMau).
    def clean_cf(m):
        sq = shrink_sqref(m.group(1))
        if not sq:
            return ''
        return f'<conditionalFormatting sqref="{sq}">{m.group(2)}</conditionalFormatting>'

    xml = re.sub(r'<conditionalFormatting sqref="([^"]*)">(.*?)</conditionalFormatting>',
                 clean_cf, xml, flags=re.S)

    if not formula_only:
        sqref = ' '.join(f'F{a}:Q{b}' for a, b in blocks_of(st['cases']))
        xml = re.sub(r'(<dataValidation[^>]*?)sqref="[^"]*"',
                     lambda m: m.group(1) + f'sqref="{sqref}"', xml, count=1)
        # D4..D8 dung vung toi dong cuoi
        for n, f in ((4, f'COUNTIF($R$12:$R${st["last"]},"P")'),
                     (5, f'COUNTIF($R$12:$R${st["last"]},"F")'),
                     (6, f'COUNTIF($R$12:$R${st["last"]},"PE")'),
                     (7, 'D8-D4-D5-D6'),
                     (8, f'COUNTA($D$12:$D${st["last"]})')):
            cached = {4: st['tally']['P'], 5: st['tally']['F'], 6: st['tally']['PE'],
                      7: st['tally'][''], 8: st['ncase']}[n]
            c = rows.get(n, {}).get('D')
            style = (c.get('s') or '0') if c is not None else '0'
            new = f'<c r="D{n}" s="{style}"><f>{esc(f)}</f><v>{cached}</v></c>'
            xml = re.sub(r'<c r="D%d"[^>]*?(?:/>|>.*?</c>)' % n, new, xml, count=1, flags=re.S)

    bk.parts[bk.sheets[name]] = xml.encode('utf-8')
    bk._rows_cache.pop(name, None)      # XML doi -> cache cua sheet nay khong con dung

    if bm.doi:                          # co style nen moi -> ghi lai bang style
        bk.parts['xl/styles.xml'] = bm.xml.encode('utf-8')
    return done


def _doi_so_dong(row_xml, cu, moi):
    """Doi so dong cua mot khoi <row> (ca thuoc tinh r cua row lan cua tung <c>)."""
    out = re.sub(r'(<row\b[^>]*?\br=")%d(")' % cu, lambda m: m.group(1) + str(moi) + m.group(2),
                 row_xml, count=1)
    return re.sub(r'(<c r="[A-Z]+)%d(")' % cu, lambda m: m.group(1) + str(moi) + m.group(2), out)


def _dat_o(row_xml, col, rn, noi_dung):
    """Thay RUOT cua mot o trong khoi <row> (giu nguyen thuoc tinh s=, bo t= va aca=)."""
    pat = r'<c r="%s%d"([^>]*?)(?:/>|>.*?</c>)' % (col, rn)
    m = re.search(pat, row_xml, flags=re.S)
    if not m:
        return row_xml
    st = re.search(r's="(\d+)"', m.group(1))
    new = '<c r="%s%d" s="%s">%s</c>' % (col, rn, st.group(1) if st else '0', noi_dung)
    return row_xml[:m.start()] + new + row_xml[m.end():]


def no_rong_bang_tong_hop(sxml, hrow, data_rows, total_row, states):
    """Nhan ban dong du lieu cua sheet 'Tổng hợp' cho du MOT DONG MOI SHEET test case.

    Vi sao can (10/09): sheet 'Tổng hợp' chep tu file nen chi co DUNG MOT dong du lieu. File co
    2 sheet TC (man co 2 THE, vd `BaoCaoDong`) thi `apply_summary` thay `1 dong / 2 sheet` roi
    **bo qua** -> lop cong thuc 6 KHONG duoc ap chut nao, sheet Tổng hợp van tro ve sheet dau va
    thieu han mot man. Nguoi doc bang tong hop khong co cach nao biet.

    Chi dam sua khi bang co dang chuan: dong du lieu LIEN TUC tu hrow+1, dong tong ngay sau, va
    KHONG con dong nao phia sau dong tong. Khong dung dang do -> tra None de giu loi bao cu.
    Tra (sxml moi, data_rows moi, total_row moi).
    """
    n_can = len(states)
    if not data_rows or n_can <= len(data_rows) or total_row is None:
        return None
    if data_rows != list(range(hrow + 1, hrow + 1 + len(data_rows))):
        return None
    if total_row != data_rows[-1] + 1:
        return None
    khoi = {}
    for rn in data_rows + [total_row]:
        m = re.search(r'<row\b[^>]*?\br="%d".*?</row>' % rn, sxml, flags=re.S)
        if not m:
            return None
        khoi[rn] = (m.start(), m.end(), m.group(0))
    # con dong nao SAU dong tong thi khong dam sua
    if re.search(r'<row\b[^>]*?\br="%d"' % (total_row + 1), sxml):
        return None

    mau_dl = khoi[data_rows[-1]][2]
    mau_tong = khoi[total_row][2]
    cu_dl, cu_tong = data_rows[-1], total_row
    moi_data = list(range(hrow + 1, hrow + 1 + n_can))
    moi_total = moi_data[-1] + 1

    ra = []
    for i, rn in enumerate(moi_data):
        goc = khoi[rn][2] if rn in khoi and rn in data_rows else mau_dl
        x = _doi_so_dong(goc, rn if (rn in data_rows) else cu_dl, rn)
        # cot A = STT, cot B = ten man (tro sang o D2 cua chinh sheet do) — hai o nay KHONG
        # nam trong `plan` cua apply_summary nen phai tu dat, khong thi dong moi trong rong.
        x = _dat_o(x, 'A', rn, '<v>%d</v>' % (i + 1))
        x = _dat_o(x, 'B', rn, '<f>%s</f>' % esc("'%s'!D2" % states[i]['sheet']))
        ra.append(x)
    ra.append(_doi_so_dong(mau_tong, cu_tong, moi_total))

    dau, cuoi = khoi[data_rows[0]][0], khoi[total_row][1]
    sxml = sxml[:dau] + ''.join(ra) + sxml[cuoi:]
    # o gop cua dong tong (A:B) va vung du lieu cua sheet phai doi theo so dong moi
    sxml = sxml.replace('ref="A%d:B%d"' % (cu_tong, cu_tong),
                        'ref="A%d:B%d"' % (moi_total, moi_total))
    sxml = re.sub(r'(<dimension ref="A1:[A-Z]+)%d(")' % cu_tong,
                  lambda m: m.group(1) + str(moi_total) + m.group(2), sxml, count=1)
    return sxml, moi_data, moi_total


def apply_summary(bk, states):
    """Lien ket sheet 'Tổng hợp' sang cac sheet test case.

    Ho tro 2 layout va file co NHIEU sheet test case (moi sheet mot dong):
      kind 'ncc'  : header hang 4, cot D=Tong E=P F=F G=PE H=Chua I=Ti le
      kind 'admin': header hang 3, cot C=P D=F E=PE F=Chua G=Tong H/I/J=Ti le
    Dong tong cuoi bang (TỔNG CỘNG / Total) duoc thay bang SUM cua cac dong tren.
    """
    if 'Tổng hợp' not in bk.sheets:
        return 'khong co sheet Tổng hợp'
    rows = bk.rows_of('Tổng hợp')
    sxml = bk.parts[bk.sheets['Tổng hợp']].decode('utf-8')

    kind = hrow = None
    for r in (3, 4, 5):
        h = {c: bk.value(rows.get(r, {}).get(c)) for c in 'ABCDEFGHIJ'}
        if h.get('D', '').startswith('Tổng') and h.get('E', '').startswith('Đạt'):
            kind, hrow = 'ncc', r
            break
        if h.get('C', '').startswith('Số') and h.get('G', '').startswith('Tổng'):
            kind, hrow = 'admin', r
            break
    if not kind:
        return 'layout la, bo qua'

    # cac dong du lieu = tu hrow+1 den truoc dong tong
    label_col = 'C' if kind == 'ncc' else 'A'
    data_rows, total_row = [], None
    for r in range(hrow + 1, hrow + 2 + len(states) + 3):
        if r not in rows:
            continue
        lab = bk.value(rows[r].get(label_col)).strip().lower()
        if lab.startswith('tổng cộng') or lab in ('total', 'tổng'):
            total_row = r
            break
        if any(bk.value(c) for c in rows[r].values()):
            data_rows.append(r)
    rows_cu_dem = list(data_rows)
    them = 0
    if len(data_rows) < len(states):
        # Thieu dong -> NHAN BAN cho du mot dong moi sheet (xem `no_rong_bang_tong_hop`).
        moi = no_rong_bang_tong_hop(sxml, hrow, data_rows, total_row, states)
        if moi:
            sxml, data_rows, total_row = moi
            them = len(states) - len(rows_cu_dem)
            rows = {int(r.get('r')): {re.match(r'[A-Z]+', c.get('r')).group(): c for c in r}
                    for r in ET.fromstring(sxml.encode('utf-8')).find(NS + 'sheetData')}
    if len(data_rows) != len(states):
        return f'{len(data_rows)} dong du lieu / {len(states)} sheet test case — bo qua, can lam tay'

    # map dong -> sheet: uu tien khop ma phan he (cot B) voi ten sheet
    order = []
    for r in data_rows:
        code = bk.value(rows[r].get('B')).strip()
        hit = next((s for s in states if s['sheet'] == code), None)
        order.append(hit)
    if any(o is None for o in order):
        order = list(states)                      # khong khop ma -> theo thu tu

    cols = ({'tong': 'D', 'P': 'E', 'F': 'F', 'PE': 'G', 'todo': 'H'} if kind == 'ncc'
            else {'P': 'C', 'F': 'D', 'PE': 'E', 'todo': 'F', 'tong': 'G'})
    src = {'P': 'D4', 'F': 'D5', 'PE': 'D6', 'todo': 'D7', 'tong': 'D8'}
    plan = {}
    for r, st in zip(data_rows, order):
        ref = f"'{st['sheet']}'!"
        n = st['ncase'] or 1
        for key, col in cols.items():
            cached = {'P': st['tally']['P'], 'F': st['tally']['F'], 'PE': st['tally']['PE'],
                      'todo': st['tally'][''], 'tong': st['ncase']}[key]
            plan[f'{col}{r}'] = (ref + src[key], str(cached))
        if kind == 'ncc':
            plan[f'I{r}'] = (f'IF(D{r}=0,0,E{r}/D{r})', f"{st['tally']['P'] / n:.6g}")
        else:
            plan[f'H{r}'] = (f'C{r}/G{r}', f"{st['tally']['P'] / n:.6g}")
            plan[f'I{r}'] = (f'D{r}/G{r}', f"{st['tally']['F'] / n:.6g}")
            plan[f'J{r}'] = (f'(C{r}+D{r})/G{r}',
                             f"{(st['tally']['P'] + st['tally']['F']) / n:.6g}")

    if total_row:
        tot = {k: sum(s['tally'][v] for s in states) for k, v in
               (('P', 'P'), ('F', 'F'), ('PE', 'PE'), ('todo', ''))}
        tot['tong'] = sum(s['ncase'] for s in states)
        n = tot['tong'] or 1
        a, b = data_rows[0], data_rows[-1]
        for key, col in cols.items():
            plan[f'{col}{total_row}'] = (f'SUM({col}{a}:{col}{b})', str(tot[key]))
        if kind == 'ncc':
            plan[f'I{total_row}'] = (f'IF(D{total_row}=0,0,E{total_row}/D{total_row})',
                                     f"{tot['P'] / n:.6g}")
        else:
            plan[f'H{total_row}'] = (f'C{total_row}/G{total_row}', f"{tot['P'] / n:.6g}")
            plan[f'I{total_row}'] = (f'D{total_row}/G{total_row}', f"{tot['F'] / n:.6g}")
            plan[f'J{total_row}'] = (f'(C{total_row}+D{total_row})/G{total_row}',
                                     f"{(tot['P'] + tot['F']) / n:.6g}")

    for cref, (f, cached) in plan.items():
        row = int(cref[1:])
        c = rows.get(row, {}).get(cref[0])
        style = (c.get('s') or '0') if c is not None else '0'
        new = f'<c r="{cref}" s="{style}"><f>{esc(f)}</f><v>{cached}</v></c>'
        pat = r'<c r="%s"[^>]*?(?:/>|>.*?</c>)' % cref
        if re.search(pat, sxml, flags=re.S):
            sxml = re.sub(pat, new, sxml, count=1, flags=re.S)
    bk.parts[bk.sheets['Tổng hợp']] = sxml.encode('utf-8')
    bk._rows_cache.pop('Tổng hợp', None)
    return (f'layout {kind}, {len(data_rows)} dong du lieu, lien ket {len(plan)} o'
            + (f' (+{them} dong MOI cho sheet TC chua co dong)' if them else ''))


def check_line(path, bk, states):
    name = os.path.basename(path)
    if not states:
        return f'{name[:52]:54} (khong co sheet test case)'
    # MAU: so o cot R mang nen khong khop ket qua (0 = dung). Cot CF ben canh phai OK,
    # nghia la KHONG con luat CF nao phu len cot R — CF to nen se xoa vien o.
    mau = sum(len(s['mau_sai']) for s in states)
    A = sum(s['A']['formula'] for s in states)
    Aw = sum(s['A']['wrong'] for s in states)
    Ap = sum(s['A']['plain'] for s in states)
    R = sum(s['R']['formula'] for s in states)
    Rw = sum(s['R']['wrong'] for s in states)
    Rp = sum(s['R']['plain'] for s in states)
    n = sum(s['ncase'] for s in states)
    ok = lambda b: 'OK' if b else '--'
    return (f'{name[:52]:54}{n:5d}'
            f'{A:6d}{Ap:6d}{Aw:5d}'
            f'{R:7d}{Rp:6d}{Rw:5d}'
            f'{ok(all(s["cf_ok"] for s in states)):>4}'
            f'{ok(all(s["dv_ok"] for s in states)):>4}'
            f'{ok(all(s["D_ok"] for s in states)):>4}'
            f'{sum(len(s["mismatch"]) for s in states):5d}'
            f'{mau:6d}')


CHECK_HEADER = (f'{"FILE":54}{"case":>5}{"A-ct":>6}{"A-chay":>6}{"A-sai":>5}'
                f'{"R-ct":>7}{"R-chay":>6}{"R-sai":>5}{"CF":>4}{"DV":>4}{"D48":>4}{"R<>FQ":>5}'
                f'{"MAU":>6}')


def main(argv):
    check = '--check' in argv
    dry = '--dry-run' in argv
    fonly = '--formula-only' in argv
    targets = []
    for a in argv:
        if a.startswith('--'):
            continue
        if os.path.isdir(a):
            targets += sorted(f for f in glob.glob(a + '/**/*.xlsx', recursive=True)
                              if not os.path.basename(f).startswith('~'))
        else:
            targets.append(a)
    if check:
        print(CHECK_HEADER)
    # ── LƯỚI CHẮN LOCK (vá 2026-09-14) ───────────────────────────────────────────────────
    # Script này là bước BẮT BUỘC sau mọi lượt ghi, nên nó chạy trên MỌI file, MỌI lần — mà
    # nó lại là script ghi DUY NHẤT không hỏi `qalib.is_locked`. Đã dính thật: bộ sửa đúng mực
    # bỏ qua file đang mở trong LibreOffice, rồi chính lệnh `formula_layer` ngay sau đó ghi đè
    # lên file ấy. Người dùng bấm Lưu trong LibreOffice là bản ghi của ta mất trắng — tệ hơn,
    # mất IM LẶNG. Chỉ chắn khi GHI; `--check` chỉ đọc nên vẫn chạy được trên file đang mở.
    if not check and not dry:
        khoa = [p for p in targets if qalib.is_locked(p)]
        if khoa:
            for p in khoa:
                print('  BỎ QUA (đang mở trong LibreOffice): %s' % os.path.basename(p))
            print('  ⛔ Đóng file rồi chạy lại — ghi đè file đang mở là mất bản ghi IM LẶNG.')
            targets = [p for p in targets if p not in set(khoa)]
    for path in targets:
        try:
            bk = Book(path)
            names = bk.tc_sheets()
            states = [scan_sheet(bk, n) for n in names]
        except Exception as e:
            print(f'{os.path.basename(path)[:52]:54}  LOI: {e}')
            continue
        if check:
            print(check_line(path, bk, states))
            continue
        if not states:
            print(f'{os.path.basename(path)}: khong co sheet test case -> bo qua')
            continue
        todo = []
        for st in states:
            todo.append(f'  [{st["sheet"]}] {st["ncase"]} case, dong 12..{st["last"]}: '
                        f'A {st["A"]["plain"]} chay/{st["A"]["wrong"]} lech, '
                        f'R {st["R"]["plain"]} chay/{st["R"]["wrong"]} lech, '
                        f'CF-tren-R {"khong" if st["cf_ok"] else "CO -> go"}, '
                        f'nen R sai {len(st["mau_sai"])}, '
                        f'DV {"OK" if st["dv_ok"] else "sua"}, '
                        f'D4:D8 {"OK" if st["D_ok"] else "sua"}, '
                        f'R<>F..Q {len(st["mismatch"])}')
        print(os.path.basename(path))
        print('\n'.join(todo))
        for st in states:
            if st['mismatch']:
                print(f'  !! [{st["sheet"]}] {len(st["mismatch"])} o cot R QA ghi tay khac gia tri '
                      f'suy tu F..Q (dong {st["mismatch"][:8]}) — GIU NGUYEN cac o nay, '
                      f'khong ap cong thuc de khong doi ket qua.')
        if dry:
            print('  DRY-RUN: khong ghi')
            continue
        for st in states:
            d = apply_sheet(bk, st['sheet'], st, formula_only=fonly)
            keep = f', giu nguyen {d["keep"]} o' if d['keep'] else ''
            mau = f', to lai nen {d["mau"]} o cot R' if d['mau'] else ''
            print(f'  [{st["sheet"]}] ghi {d["A"]} o cot A, {d["R"]} o cot R{keep}{mau}')
        if not fonly:
            print('  Tổng hợp:', apply_summary(bk, states))
        bk.save()
        if bk.bak:
            print(f'  ban lui: {qalib.bak_show(bk.bak)}')


if __name__ == '__main__':
    main(sys.argv[1:])

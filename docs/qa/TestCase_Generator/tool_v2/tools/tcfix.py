# -*- coding: utf-8 -*-
"""Thư viện dùng chung để tái cấu trúc file test case .xlsx theo chuẩn mau.xlsx.

Dùng:
    import tcfix
    tc = tcfix.load('/path/file.xlsx')
    tc.dump()                       # xem cấu trúc hiện tại
    tc.rename(120, 'Tên mới')
    tc.retext(130, md=..., buoc=..., kq=...)
    plan = tcfix.Plan(tc)
    plan.keep_range(12, 60)
    plan.add_sub('Chức năng Tìm kiếm chung')
    plan.keep(61, 65)
    plan.case('MĐ', 'Bước', 'KQ')
    tc.rebuild(plan).save()
"""
import zipfile, re, html, os
import xml.dom.minidom as minidom

def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


class TC:
    def __init__(self, path, bp=None):
        self.path = path
        self.bp_want = bp
        self.z = zipfile.ZipFile(path)
        self.wb = self.z.read('xl/workbook.xml').decode()
        rels = self.z.read('xl/_rels/workbook.xml.rels').decode()
        r2t = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(worksheets/sheet\d+\.xml)"', rels))
        self.tcf = self.cover = self.summary = None
        self.bpsheets = []
        for m in re.finditer(r'<sheet\b[^>]*/>', self.wb):
            nm = re.search(r'name="([^"]+)"', m.group(0)).group(1)
            rid = re.search(r'r:id="(rId\d+)"', m.group(0)).group(1)
            if nm.startswith('BP') and rid in r2t:
                self.bpsheets.append(nm)
                if self.bp_want is None:
                    if self.tcf is None:                    # mac dinh: sheet BP dau tien
                        self.tcf = 'xl/' + r2t[rid]; self.bpname = nm
                elif nm == self.bp_want:
                    self.tcf = 'xl/' + r2t[rid]; self.bpname = nm
            elif rid in r2t:
                low = nm.lower()
                if 'bìa' in low: self.cover = 'xl/' + r2t[rid]
                elif 'tổng hợp' in low: self.summary = 'xl/' + r2t[rid]
        self.sheet = self.z.read(self.tcf).decode()
        self.ss = [html.unescape(re.sub('<[^>]+>', '', x)) for x in
                   re.findall(r'<si>(.*?)</si>', self.z.read('xl/sharedStrings.xml').decode(), re.S)]
        self.head, rest = self.sheet.split('<sheetData>', 1)
        rows_xml, self.tail = rest.split('</sheetData>', 1)
        self.rows, self.order = {}, []
        for m in re.finditer(r'(<row r="(\d+)"[^>]*>)(.*?)</row>', rows_xml, re.S):
            rn = int(m.group(2))
            self.rows[rn] = {'attrs': m.group(1), 'body': m.group(3)}
            self.order.append(rn)
        # ── SUY CẤP DÒNG TIÊU ĐỀ (cn/grp/sub/sub2) ─────────────────────────────────────
        # Vá 2026-09-10. Bản cũ gom style-id ô B của MỌI dòng không có cột C rồi map theo
        # THỨ TỰ SỐ style-id (`sorted(hs, key=int)`), và bỏ trắng `LV` khi có < 4 style.
        # Cả hai giả định đều sai với file nền thật; ba đường lỗi, đường nào cũng ra
        # **0 case mà không báo gì** (đo 2026-09-10 trên bản sao `file-nen.xlsx`):
        #   A. dòng ĐỆM/dòng trắng có ô B RỖNG nhưng mang style riêng số thấp bị đếm là một
        #      cấp -> bảng cấp lệch 1 (cn <- style dòng đệm, sub2 bị `zip()` cắt mất)
        #      -> `new_from_base.lift()` trả 0 case cho CẢ `Giao diện chung` (luật: đúng 6)
        #      lẫn `An toàn thông tin`. Đã dính từ 2026-08-17 nhưng vá ở SCRIPT:
        #      `khaibao_shell_0817.strip_trailing()` phải xoá 737/610 dòng đệm cho tcfix đọc
        #      được — nên máy/nền khác lại dính lại.
        #   B. Excel/LibreOffice ĐÁNH SỐ LẠI `cellXfs` sau round-trip -> thứ tự số style-id
        #      không còn theo cấp -> map chéo cấp, `lift()` cũng ra 0.
        #   C. nền có < 4 style tiêu đề (hai cấp dùng chung style) -> `LV = {}` -> `lvl()`
        #      trả 'case' cho MỌI dòng tiêu đề, hỏng toàn bộ phép rà. Biến thể ngược: khối
        #      `An toàn thông tin` mang style thứ 5 (`khaibao_shell_0817.py` §2).
        # Bản này suy cấp từ `outlineLevel` — CẤU TRÚC do chính Excel lưu, không đổi khi
        # cellXfs bị đánh số lại — chỉ rơi về thứ tự XUẤT HIỆN (cn ở dòng đầu khối, rồi
        # grp/sub/sub2) khi outline không dùng được. Thứ tự số style-id không còn được tin.
        hs = {}
        for rn in self.order:
            if rn < 12: continue
            if self.c(rn, 'C'): continue
            if not (self.c(rn, 'B') or '').strip(): continue      # dòng đệm (đường lỗi A)
            bc = re.search(r'<c r="B%d"[^>]*?(?:/>|>.*?</c>)' % rn, self.rows[rn]['body'], re.S)
            if not bc: continue
            st = re.search(r's="(\d+)"', bc.group(0))
            if not st: continue
            d = hs.setdefault(st.group(1), {'n': 0, 'r0': rn, 'ol': set()})
            d['n'] += 1
            o = re.search(r'outlineLevel="(\d+)"', self.rows[rn]['attrs'])
            d['ol'].add(int(o.group(1)) if o else 0)   # mẫu KHÔNG ghi ol cho dòng CN == 0
        self.LV, self.LV_nguon = self._suy_cap(hs)
        # style của dòng case + cột A
        self.case_st, self.a_st = '72', '71'
        for rn in self.order:
            if rn >= 12 and self.c(rn, 'C'):
                bc = re.search(r'<c r="B%d"[^>]*?(?:/>|>.*?</c>)' % rn, self.rows[rn]['body'], re.S)
                self.case_st = re.search(r's="(\d+)"', bc.group(0)).group(1)
                ac = re.search(r'<c r="A%d"[^>]*?(?:/>|>.*?</c>)' % rn, self.rows[rn]['body'], re.S)
                if ac:
                    m = re.search(r's="(\d+)"', ac.group(0))
                    if m: self.a_st = m.group(1)
                break
        self.tpl = {}        # 'case' | 'cn'|'grp'|'sub'|'sub2'  ->  [(col, style), ...]
        st2lv = {v: k for k, v in self.LV.items()}
        for rn in self.order:
            if rn < 12: continue
            body = self.rows[rn]['body']
            cols = re.findall(r'<c r="([A-Z]+)%d"(?: s="(\d+)")?' % rn, body)
            if len(cols) < 6: continue
            if self.c(rn, 'C'):
                self.tpl.setdefault('case', cols)
            else:
                bs = re.search(r'<c r="B%d" s="(\d+)"' % rn, body)
                if bs and bs.group(1) in st2lv:
                    self.tpl.setdefault(st2lv[bs.group(1)], cols)
        m3 = re.search(r'<row r="3"[^>]*>(.*?)</row>', self.sheet, re.S)
        self.prefix = self._val(re.search(r'<c r="D3"[^>]*?(?:/>|>.*?</c>)', m3.group(1), re.S).group(0)) or 'TC'

    LV_TEN = ('cn', 'grp', 'sub', 'sub2')

    @classmethod
    def _suy_cap(cls, hs):
        """{style: {'n', 'r0', 'ol'}} -> ({cấp: style}, tên tín hiệu đã dùng).

        KHÔNG bao giờ trả {} khi file có dòng tiêu đề: thiếu cấp thì trả các cấp đọc được,
        để `lvl()` còn phân biệt được tiêu đề với case. Bản cũ trả {} là mất trắng cả bảng
        cấp (đường lỗi C ở `__init__`).
        """
        if not hs:
            return {}, 'không có dòng tiêu đề'
        # (1) outlineLevel: nhận khi mỗi style ứng ĐÚNG MỘT cấp, các cấp đôi một khác nhau
        #     và phủ liên tục từ 0 (0=cn · 1=grp · 2=sub · 3=sub2). Cấp > 3 thì bỏ qua.
        if all(len(v['ol']) == 1 for v in hs.values()):
            theo = {next(iter(v['ol'])): st for st, v in hs.items()}
            ols = sorted(theo)
            if len(theo) == len(hs) and ols[:4] == list(range(min(4, len(ols)))):
                return {cls.LV_TEN[o]: theo[o] for o in ols[:4]}, 'outlineLevel'
        # (2) THỨ TỰ XUẤT HIỆN: nền chuẩn mở đầu bằng cn (r12) > grp > sub > sub2.
        keys = sorted(hs, key=lambda st: hs[st]['r0'])[:4]
        return dict(zip(cls.LV_TEN, keys)), 'thứ tự xuất hiện'

    def _val(self, cell):
        m = re.search(r't="inlineStr"><is><t[^>]*>(.*?)</t>', cell, re.S)
        if m: return html.unescape(re.sub('<[^>]+>', '', m.group(1)))
        m = re.search(r't="s"[^>]*><v>(\d+)</v>', cell)
        if m: return self.ss[int(m.group(1))]
        if 't="s"' in cell: return ''       # shared string lạ khuôn -> đừng trả về CHỈ SỐ
        # Ô CÔNG THỨC: đọc cache <v>. Thiếu nhánh này thì mọi ô của 6 lớp công thức đọc ra ''
        # (vá 2026-09-08) — hai hậu quả đã đo được:
        #   · `nghiemthu_0806.py` báo "case mất mã cột A" cho MỌI file đã áp lớp công thức,
        #     dù cột A đang có đúng công thức lớp 1 + cache `prefix_1..N` liên tục.
        #   · `tach_cn_timkiem` · `restructure_lienhe_0813` · `fix_cn_danhsach_kpi` đếm P/F/PE
        #     theo cột R ra RỖNG HẾT -> ghi cache thống kê "chưa thực hiện = toàn bộ".
        m = re.search(r'<v>(.*?)</v>', cell, re.S)
        if m: return html.unescape(m.group(1))
        return ''

    def c(self, rn, col):
        if rn not in self.rows: return None
        cc = re.search(r'<c r="%s%d"[^>]*?(?:/>|>.*?</c>)' % (col, rn), self.rows[rn]['body'], re.S)
        return self._val(cc.group(0)) if cc else None

    def lvl(self, rn):
        bc = re.search(r'<c r="B%d"[^>]*?(?:/>|>.*?</c>)' % rn, self.rows[rn]['body'], re.S)
        if not bc: return None
        st = re.search(r's="(\d+)"', bc.group(0))
        st = st.group(1) if st else None
        for k, v in self.LV.items():
            if v == st: return k
        # Dòng ĐỆM: không có cột C mà ô B cũng rỗng -> không phải tiêu đề, cũng không phải
        # case. Bản cũ trả 'case' nên `new_from_base.lift()` nhặt nó thành 1 case RỖNG (đo
        # 2026-09-10: nền thêm 1 dòng đệm cuối sheet -> khối ATTT lift ra 8 case thay vì 7).
        # Mọi chỗ dùng `lvl()` đều so `== 'case'` hoặc `in ('sub','sub2')...` nên giá trị mới
        # chỉ có tác dụng LOẠI dòng đệm ra, không đổi hành vi với file không có dòng đệm.
        if not (self.c(rn, 'C') or '').strip() and not (self.c(rn, 'B') or '').strip():
            return 'dem'
        return 'case'

    def dump(self, lo=12, hi=10**9, cases=True):
        for rn in self.order:
            if rn < max(12, lo) or rn > hi: continue
            B, C = self.c(rn, 'B'), self.c(rn, 'C')
            lv = self.lvl(rn)
            ind = {'cn': '', 'grp': '  ', 'sub': '    ', 'sub2': '      '}.get(lv, '        ')
            if not C:
                print(f"{ind}▸ [{rn}] {(B or '').split(chr(10))[0][:72]}")
            elif cases:
                print(f"{ind}[{rn}] {(B or '')[:72]}")

    def rename(self, rn, txt):
        b = self.rows[rn]['body']
        cm = re.search(r'<c r="B%d"[^>]*?(?:/>|>.*?</c>)' % rn, b, re.S)
        st = re.search(r's="(\d+)"', cm.group(0)).group(1)
        self.rows[rn]['body'] = b.replace(cm.group(0),
            '<c r="B%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>' % (rn, st, esc(txt)))

    def retext(self, rn, md=None, buoc=None, kq=None, ghi_chu=None):
        # `ghi_chu` -> cột T. Thêm 2026-09-11 cho `fix_kq_validate.py`: phần dữ kiện bị cắt
        # khỏi cột D phải có chỗ ĐỖ, mà §8.3 chốt chỗ đó là cột T (T được phép mang chi tiết
        # kỹ thuật, cột D thì tuyệt đối không). Trước đó chỉ `Plan.case()` ghi được T, tức là
        # chỉ ghi được lúc BƠM case mới — sửa case đã có thì không có đường vào.
        b = self.rows[rn]['body']
        for col, val in (('B', md), ('C', buoc), ('D', kq), ('T', ghi_chu)):
            if val is None: continue
            cm = re.search(r'<c r="%s%d"[^>]*?(?:/>|>.*?</c>)' % (col, rn), b, re.S)
            if not cm:
                raise KeyError('dòng %d không có ô %s — chạy tcfix.verify() trước' % (rn, col))
            st = re.search(r's="(\d+)"', cm.group(0)).group(1)
            b = b.replace(cm.group(0),
                '<c r="%s%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
                % (col, rn, st, esc(val)))
        self.rows[rn]['body'] = b

    # ---------------- rebuild ----------------
    def ht_mac_dinh(self):
        """`defaultRowHeight` của sheet — mốc để biết dòng nào bị ÉP cao hơn 1 dòng chữ."""
        m = re.search(r'defaultRowHeight="([\d.]+)"', self.head or '')
        return float(m.group(1)) if m else 15.0

    def _ht_ep(self, tag):
        """Thẻ <row> này có bị ép cao hơn 1 dòng chữ không.

        Nới 1pt: file đi qua LibreOffice bị ghi `ht` cho MỌI dòng (13.8 / 15.75) — đó là
        chiều cao 1 dòng, không phải phình, gỡ đi cũng không đổi gì mà lại làm file lệch
        khỏi bản LibreOffice ghi ra.
        """
        m = re.search(r'ht="([\d.]+)"', tag)
        return bool(m and 'customHeight' in tag and float(m.group(1)) > self.ht_mac_dinh() + 1)

    def rebuild(self, plan):
        self._ht_go = 0
        items = plan.items
        used = [x for x in items if isinstance(x, int)]
        assert len(used) == len(set(used)), \
            "row trùng: %s" % [x for x in used if used.count(x) > 1][:5]
        hdr_rows = [r for r in self.order if r < 12]
        dropped = sorted(set(self.order) - set(used) - set(hdr_rows))
        orig_merges = re.findall(r'<mergeCell ref="([^"]+)"/>', self.sheet)
        merges = [m for m in orig_merges if all(int(x) < 12 for x in re.findall(r'[A-Z]+(\d+)', m))]
        body, i = [], 11
        for it in items:
            i += 1
            if isinstance(it, int):
                attrs, bd = self.rows[it]['attrs'], self.rows[it]['body']
                if it != i:
                    attrs = re.sub(r'^<row r="%d"' % it, '<row r="%d"' % i, attrs)
                    bd = re.sub(r'r="([A-Z]+)%d"' % it, lambda m: 'r="%s%d"' % (m.group(1), i), bd)
                if not self.c(it, 'C'):
                    merges.append('B%d:E%d' % (i, i))
                body.append(attrs + bd + '</row>')
            else:
                body.append(it['attrs'].replace('{r}', str(i)) + it['body'].replace('{r}', str(i)) + '</row>')
                if it['hdr']: merges.append('B%d:E%d' % (i, i))
        last = i
        # ── CHUẨN HOÁ `outlineLevel` theo CẤU TRÚC (vá 2026-09-09) ──────────────────────
        # Khuôn của mẫu/file nền: cn = không có · grp = 1 · sub = 2 · sub2 = 3 ·
        # **case = cấp của DÒNG TIÊU ĐỀ gần nhất + 1** ⇒ case dưới `sub2` phải là **4**,
        # case nằm thẳng dưới `grp` (khối ATTT) là **2**.
        # `Plan.case()` chốt cứng `outlineLevel="3"` cho MỌI case, nên MỌI bộ case tool sinh
        # có case dưới `sub2` cùng cấp với chính dòng `sub2` ⇒ **dòng nhóm (màu xám) không có
        # cấp gom nhóm bên dưới**, bấm dấu trừ không thu được nhóm control nào. Đo 2026-09-09:
        # `file-nen` có 31 case ở ol=4 + 7 case ở ol=2; mọi file tool sinh có 100% case ở ol=3.
        # Không phép rà nào bắt (bộ rà đọc cột B/C/D, không đọc thuộc tính dòng).
        # Chuẩn hoá ở ĐÂY (thay vì ở `Plan.case()`) để mỗi lần chạy patcher là file cũ tự
        # được sửa theo — `rebuild()` nằm trên đường đi của mọi lần ghi.
        HDR_OL = {'cn': None, 'grp': 1, 'sub': 2, 'sub2': 3}
        cap = 0                      # cấp của dòng tiêu đề gần nhất (0 = dòng CN)
        body2 = []
        for xml in body:
            rn = int(re.search(r'<row r="(\d+)"', xml).group(1))
            bc = re.search(r'<c r="B%d"[^>]*?(?:/>|>.*?</c>)' % rn, xml, re.S)
            st = re.search(r's="(\d+)"', bc.group(0)) if bc else None
            lv = next((k for k, v in self.LV.items() if st and v == st.group(1)), 'case')
            if lv in HDR_OL:
                cap = HDR_OL[lv] or 0
                ol = HDR_OL[lv]
            else:
                ol = cap + 1
            # ⚠️ Phải gỡ `outlineLevel` Ở BẤT KỲ ĐÂU trong thẻ <row>, không chỉ ngay sau
            # `r="N"`. Bản cũ dùng `^(<row r="N")( outlineLevel="\d+")?` nên chỉ gỡ được khi
            # thuộc tính nằm SÁT sau `r="N"` — đúng thứ tự mà tool này ghi ra. File nào đã mở
            # và lưu bằng LibreOffice/soffice thì thuộc tính bị xếp lại
            # (`<row r="13" customFormat="false" ht="13.8" … outlineLevel="1" collapsed="false">`)
            # ⇒ regex không thấy, CHÈN THÊM một cái nữa ⇒ `<row>` có HAI `outlineLevel` ⇒
            # `minidom.parseString` ở cuối `rebuild()` ném `duplicate attribute` và mọi phép
            # sửa file đó chết giữa chừng. Gặp ngày 2026-09-11 trên `BaoCaoDong` ngay sau khi
            # người đặt việc mở file bằng LibreOffice.
            _m_open = re.match(r'<row\b[^>]*>', xml)
            if _m_open:
                _tag = re.sub(r'\s+outlineLevel="\d+"', '', _m_open.group(0))
                if ol is not None:
                    _tag = re.sub(r'^(<row r="%d")' % rn,
                                  r'\g<1> outlineLevel="%d"' % ol, _tag, count=1)
                # ── GỠ CHIỀU CAO BỊ ÉP Ở DÒNG TIÊU ĐỀ (vá 2026-09-14) ──────────────────
                # Cùng lý do đặt chuẩn hoá `outlineLevel` ở đây: `rebuild()` nằm trên đường
                # đi của MỌI lần ghi, nên bộ case cũ tự được sửa theo ở lần chạy patcher kế
                # tiếp, không phải đi sửa từng file. Chỉ đụng dòng TIÊU ĐỀ — dòng case cao
                # 109.5pt là đúng mẫu (ô liệt kê thành phần màn), gỡ là hỏng.
                if lv in HDR_OL and self._ht_ep(_tag):
                    _tag = re.sub(r'\s+ht="[\d.]+"', '', _tag)
                    _tag = re.sub(r'\s+customHeight="(?:true|1)"', '', _tag)
                    self._ht_go += 1
                xml = _tag + xml[_m_open.end():]
            body2.append(xml)
        body = body2
        out, n = [], 0
        for xml in body:
            rn = int(re.search(r'<row r="(\d+)"', xml).group(1))
            cc = re.search(r'<c r="C%d"[^>]*?(?:/>|>.*?</c>)' % rn, xml, re.S)
            # nhan dien dong case: doc GIA TRI o C (ho tro ca inlineStr lan shared string,
            # vi file bi mo/luu lai bang LibreOffice se chuyen sang shared string)
            is_case = bool(cc and (self._val(cc.group(0)) or '').strip())
            am = re.search(r'<c r="A%d"[^>]*?(?:/>|>.*?</c>)' % rn, xml, re.S)
            if am:
                if is_case:
                    n += 1
                    new = ('<c r="A%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s_%d</t></is></c>'
                           % (rn, self.a_st, self.prefix, n))
                else:
                    new = '<c r="A%d" s="%s"/>' % (rn, self.a_st)
                xml = xml.replace(am.group(0), new)
            out.append(xml)
        hdr_xml = ''.join(self.rows[r]['attrs'] + self.rows[r]['body'] + '</row>' for r in hdr_rows)
        s = self.head + '<sheetData>' + hdr_xml + ''.join(out) + '</sheetData>' + self.tail
        s = re.sub(r'<mergeCells count="\d+">.*?</mergeCells>',
                   '<mergeCells count="%d">%s</mergeCells>'
                   % (len(merges), ''.join('<mergeCell ref="%s"/>' % m for m in merges)), s, flags=re.S)
        s = re.sub(r'<dimension ref="A1:([A-Z]+)\d+"/>', r'<dimension ref="A1:\g<1>%d"/>' % last, s)
        s = re.sub(r'\$R\$12:\$R\$\d+', '$R$12:$R$%d' % last, s)
        s = re.sub(r'\$D\$12:\$D\$\d+', '$D$12:$D$%d' % last, s)
        for ref in ('D7', 'D8'):
            s = re.sub(r'(<c r="%s"[^>]*>.*?<v>)\d+(</v></c>)' % ref, r'\g<1>%d\g<2>' % n, s, flags=re.S)
        minidom.parseString(s.encode())
        self._new_sheet, self._n, self._last, self._dropped = s, n, last, dropped
        return self

    # Ô cache "tổng số case" + "chưa thực hiện" của sheet Tổng hợp — KHÁC NHAU theo layout,
    # đúng hai layout mà `formula_layer.apply_summary()` nhận (giữ một chỗ khai, đừng chép):
    #   ncc    — header hàng 4, dữ liệu 5, tổng 6 · cột D=Tổng H=Chưa
    #   mẫu    — header hàng 3, dữ liệu 4, tổng 5 · cột G=Tổng F=Chưa  (khung của
    #            `DanhMucTuDienDungChung.xlsx`, cũng là khung của `file-nen/`)
    # Chốt cứng D5/H5/D6/H6 cho MỌI file là ghi số case đè lên ô F (không đạt) và ô %P của
    # layout mẫu — cache sai im lặng cho tới lần mở file kế tiếp.
    SUM_REFS = {'ncc': ('D5', 'H5', 'D6', 'H6'), 'mau': ('G4', 'F4', 'G5', 'F5')}

    def _sum_refs(self, s2):
        def txt(ref):
            cm = re.search(r'<c r="%s"[^>]*?(?:/>|>(.*?)</c>)' % ref, s2, re.S)
            if not cm or not cm.group(1):
                return ''
            v = re.search(r'<v>(\d+)</v>', cm.group(1))
            if v and 't="s"' in cm.group(0):
                return self.ss[int(v.group(1))]
            return html.unescape(re.sub('<[^>]+>', '', cm.group(1)))
        if txt('C3').startswith('Số') and txt('G3').startswith('Tổng'):
            return self.SUM_REFS['mau']
        return self.SUM_REFS['ncc']

    def save(self, out=None, quiet=False, sync=True):
        out = out or self.path
        repl = {self.tcf: self._new_sheet.encode()}
        names = set(self.z.namelist()) if sync else set()
        if self.summary in names:                               # sheet Tong hop (neu co)
            s2 = self.z.read(self.summary).decode()
            for ref in self._sum_refs(s2):
                cm = re.search(r'<c r="%s"[^>]*?(?:/>|>.*?</c>)' % ref, s2, re.S)
                if cm: s2 = s2.replace(cm.group(0), re.sub(r'<v>\d+</v>', '<v>%d</v>' % self._n, cm.group(0)))
            repl[self.summary] = s2.encode()
        if self.cover in names:                                 # Trang bia (neu co)
            s1 = self.z.read(self.cover).decode()
            s1 = re.sub(r'(<c r="D18"[^>]*t="inlineStr"><is><t[^>]*>)\d+(</t>)', r'\g<1>%d\g<2>' % self._n, s1)
            repl[self.cover] = s1.encode()
        tmp = out + '.tmp'
        zo = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
        for it in self.z.infolist():
            zo.writestr(it, repl.get(it.filename) or self.z.read(it.filename))
        zo.close(); self.z.close(); os.replace(tmp, out)
        if not quiet:
            print(f"  → {os.path.basename(out)}: {self._n} case, dòng cuối {self._last}"
                  + (f", bỏ {self._dropped}" if self._dropped else "")
                  + (f", gỡ ép cao {self._ht_go} dòng tiêu đề"
                     if getattr(self, '_ht_go', 0) else ""))
        return self


# ── CHIEU CAO DONG TIEU DE: KHONG EP ──────────────────────────────────────────────
# Go bo 2026-09-14 theo chi thi *"cac dong nhom deu bi [phinh], de tu dong nhu mau
# DanhMucTuDienDungChung"*. Ban cu co `HT_HDR = {3: '39.55', 4: '52.2'}` va ep
# `ht`/`customHeight` cho MOI dong tieu de nhieu dong chu, voi ly do "khong thi chu bi che".
# Do lai tren chinh mau (2026-09-14) thi ly do do SAI voi khuon cua mau:
#   · mau: 9 dong CN deu mang 3-4 dong chu, ht = 15.75 hoac khong ghi -> CAO DUNG 1 DONG,
#     phan buoc 1./2./3. co y bi che (`B12:E12` gop nen Excel/LO khong tu gian o gop).
#   · tool: ep 39.55 (3 dong) · 52.2 (4 dong) · noi suy 13.05/dong -> co dong 91.35pt,
#     phinh gap 6 lan dong ben canh. Do duoc 51 dong bi ep / 6 file (Desktop) + 66 dong /
#     7 file (hub); bo qa-doc doi truoc khi co HT_HDR thi 0 dong.
# Khong ghi `ht` -> dong ve defaultRowHeight cua sheet (13.8) = dung 1 dong chu, GIONG mau.
# Kiem chung: bo `ht` khoi 4 dong CN cua `TangDuLieuDanhMuc`, doi sang .fods bang LibreOffice
# roi doc lai style dong: 39.55/52.2 -> 13.80pt, khong dong nao bi gian ra.
# Phep ra di kem: `audit_cn_buoc.py` ma 'HT' (nay bat chieu NGUOC — dong tieu de con `ht` ep).


class Plan:
    def __init__(self, tc):
        self.tc = tc; self.items = []
    def keep(self, *rns): self.items.extend(rns); return self
    def keep_range(self, a, b):
        # `rebuild()` GIỮ SẴN mọi dòng header `r < 12`; keep thêm chúng vào Plan là NHÂN ĐÔI
        # header và hỏng file (../README.md: bẫy `Plan.keep_range(1, 11)`). Chặn ngay tại đây
        # thay vì để tài liệu nhắc suông.
        if a < 12:
            raise AssertionError(
                'Plan chỉ chứa nội dung TỪ DÒNG 12: keep_range(%r, %r) đang keep cả header '
                'r<12 -> rebuild() sẽ nhân đôi header. Dùng keep_range(12, ...).' % (a, b))
        self.items.extend(r for r in self.tc.order if a <= r <= b)
        return self
    def keep_rest(self, frm):
        self.items.extend(r for r in self.tc.order if r >= frm and r not in self.items); return self
    def _row(self, tplkey, fill, dflt):
        """Sinh 1 dong du cot theo khuon cua file; fill = {'B': text, ...}."""
        cols = self.tc.tpl.get(tplkey)
        if not cols:                              # khong co khuon -> toi thieu A..T
            cols = [(chr(65 + i), None) for i in range(20)]
        out = []
        for col, st in cols:
            st = st or dflt
            if col in fill:
                out.append('<c r="%s{r}" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
                           % (col, st, esc(fill[col])))
            else:
                out.append('<c r="%s{r}" s="%s"/>' % (col, st))
        return ''.join(out)

    def _hdr(self, text, lvl):
        # Thiếu cấp -> nói RÕ nền thiếu gì và suy cấp bằng tín hiệu nào; `KeyError: 'sub2'`
        # trần của bản cũ không chỉ ra được là lỗi FILE NỀN (vá 2026-09-10).
        st = self.tc.LV.get(lvl)
        if st is None:
            raise AssertionError(
                'file nền thiếu cấp tiêu đề %r (đọc được: %s · suy từ %s) nên không dựng '
                'được dòng %r. Nền phải có đủ 4 cấp cn/grp/sub/sub2, mỗi cấp một style.'
                % (lvl, ', '.join(self.tc.LV) or 'không cấp nào', self.tc.LV_nguon,
                   (text or '').split(chr(10))[0][:40]))
        ol = {'cn': 0, 'grp': 1, 'sub': 2, 'sub2': 3}[lvl]
        # KHONG ghi `ht`/`customHeight` — xem khoi chu thich "CHIEU CAO DONG TIEU DE" o tren.
        # Dong CN mang khoi buoc nhieu dong (PROMPT v3 §4) van cao 1 dong DUNG NHU MAU.
        attrs = ('<row r="{r}">' if ol == 0
                 else '<row r="{r}" outlineLevel="%d">' % ol)
        self.items.append({'attrs': attrs,
                           'body': self._row(lvl, {'B': text}, st), 'hdr': True})
        return self

    def add_cn(self, t): return self._hdr(t, 'cn')
    def add_grp(self, t): return self._hdr(t, 'grp')
    def add_sub(self, t): return self._hdr(t, 'sub')
    def add_sub2(self, t): return self._hdr(t, 'sub2')
    # Chỗ giữ dữ kiện PHẢI HỎI DEV (tên bảng/cột/ngưỡng) — khác chỗ giữ giá trị lúc chạy
    # (`<tên tệp>`, `<từ ngày>`). §11.4: *"thà gắn cờ hơn bịa"* ⇒ case còn chỗ giữ loại này thì
    # cột T phải mang `[CẦN VERIFY]`. Vá 2026-09-09: gắn TỰ ĐỘNG ở đây thay vì trông vào từng
    # patcher nhớ truyền `ghi_chu` — `audit_noi_dung.py` đo được 7 case bơm ra thiếu cờ (SQL
    # mang `<bảng dữ liệu của màn>`), mà mỗi patcher tự lo thì lần sau lại quên chỗ khác.
    RX_CAN_HOI = re.compile(r'<[^<>]{2,60}>')
    KW_CAN_HOI = ('bang', 'cot', 'truong', 'schema', 'enum', 'nguong', 'gioi han', 'do dai')
    CO_VERIFY = ('✿✿ [CẦN VERIFY] Tên bảng/cột trong câu truy vấn đối chiếu cần xác nhận với dev '
                 'trước khi thực thi.')

    @classmethod
    def _can_verify(cls, *txts):
        import unicodedata as _ud
        for t in txts:
            for m in cls.RX_CAN_HOI.finditer(t or ''):
                n = ''.join(c for c in _ud.normalize('NFD', m.group(0)[1:-1].lower()
                                                     .replace('đ', 'd'))
                            if _ud.category(c) != 'Mn')
                if any(k in n for k in cls.KW_CAN_HOI):
                    return True
        return False

    def case(self, md, buoc, kq, ghi_chu=None):
        # `outlineLevel="3"` dưới đây chỉ là giá trị TẠM: `rebuild()` chuẩn hoá lại theo CẤU
        # TRÚC (case dưới `sub2` -> 4 · case dưới `grp` -> 2). Đừng sửa con số ở đây, sửa ở
        # phần chuẩn hoá của `rebuild()` — nếu không thì hai chỗ lệch nhau.
        if ghi_chu is None and self._can_verify(buoc, kq):
            ghi_chu = self.CO_VERIFY
        fill = {'B': md, 'C': buoc, 'D': kq}
        if ghi_chu: fill['T'] = ghi_chu
        self.items.append({'attrs': '<row r="{r}" outlineLevel="3">',
                           'body': self._row('case', fill, self.tc.case_st), 'hdr': False})
        return self


def load(path, bp=None): return TC(path, bp)


def verify(path):
    z = zipfile.ZipFile(path)
    errs = []
    if z.testzip(): errs.append('zip hỏng')
    for f in z.namelist():
        if f.endswith('.xml') or f.endswith('.rels'):
            try: minidom.parseString(z.read(f))
            except Exception as e: errs.append(f'XML {f}: {e}')
    wb = z.read('xl/workbook.xml').decode()
    sheets = re.findall(r'<sheet[^>]*name="([^"]+)"', wb)
    if sheets[0] not in ('Trang bìa', 'Bìa') or sheets[1] != 'Tổng hợp':
        errs.append(f'sheet: {sheets}')
    # ⚠️ Vá 2026-09-10: nghiệm thu MỌI sheet BP, không chỉ sheet đầu. File hai sheet (màn có
    # 2 thẻ, vd `BaoCaoDong`) trước bản này chỉ được kiểm sheet đầu — `verify: OK` mà sheet thứ
    # hai có thể lệch mã case / D-leak / outline mà không ai biết.
    _first = TC(path)
    _bps = _first.bpsheets or [None]
    _tong = 0
    for _i, _bp in enumerate(_bps):
        tc = _first if _i == 0 else TC(path, _bp)
        _pre = ('[%s] ' % _bp) if len(_bps) > 1 else ''
        _n, _e = _verify_sheet(tc)
        _tong += _n
        errs.extend(_pre + x for x in _e)
    return _tong, errs


def _verify_sheet(tc):
    """Nghiệm thu MỘT sheet TC đã load — (số mã case, [lỗi])."""
    errs = []
    codes = [int(x) for x in re.findall(r'<t[^>]*>[A-Za-z]+_(\d+)</t>', tc.sheet)]
    if codes and sorted(codes) != list(range(1, len(codes) + 1)):
        errs.append('mã case không liên tục')
    if not codes:                       # cot A con la cong thuc -> dem theo cot C
        codes = [1] * sum(1 for rn in tc.order if rn >= 12 and tc.c(rn, 'C'))
    BAD = re.compile(r'\.tsx|\.go\b|\bbadge\b|\btoast\b|\bmock\b|isDev|===|!==|=>|'
                     r'/supplier/|/teacher/|/admin/|/shared/', re.I)
    leaks = [rn for rn in tc.order if rn >= 12 and tc.c(rn, 'C') and (tc.c(rn, 'D') or '')
             and BAD.search(tc.c(rn, 'D'))]
    if leaks: errs.append(f'D-leak dòng {leaks[:5]}')
    # ── outline: dòng nhóm phải CÓ cấp gom nhóm bên dưới (vá 2026-09-09) ──────────────────
    # Chuẩn của mẫu: cn = không có · grp = 1 · sub = 2 · sub2 = 3 · case = cấp tiêu đề gần
    # nhất + 1. Trước bản này `Plan.case()` chốt cứng 3 cho mọi case ⇒ case dưới `sub2` cùng
    # cấp với chính dòng `sub2`, nên **dòng nhóm màu xám không thu/mở được** trên Excel — mà
    # không phép rà nào bắt (bộ rà đọc cột B/C/D, không đọc thuộc tính dòng).
    HDR_OL = {'cn': None, 'grp': 1, 'sub': 2, 'sub2': 3}
    sai, cap = [], 0
    for rn in tc.order:
        if rn < 12: continue
        lv = tc.lvl(rn)
        if lv == 'dem': continue            # dòng đệm không thuộc cây gom nhóm
        ol = re.search(r'outlineLevel="(\d+)"', tc.rows[rn]['attrs'])
        ol = int(ol.group(1)) if ol else None
        if lv in HDR_OL:
            can = HDR_OL[lv]; cap = can or 0
        else:
            can = cap + 1
        # Dòng CN: mẫu KHÔNG ghi thuộc tính, còn LibreOffice sau round-trip ghi
        # `outlineLevel="0"` — hai bản là một, đừng báo lỗi bản đã mở/lưu bằng soffice.
        if can is None and ol in (None, 0): continue
        if ol != can: sai.append(rn)
    if sai:
        errs.append('outline sai %d dòng (vd %s) — chạy lại patcher/rebuild để chuẩn hoá'
                    % (len(sai), sai[:5]))
    return len(codes), errs

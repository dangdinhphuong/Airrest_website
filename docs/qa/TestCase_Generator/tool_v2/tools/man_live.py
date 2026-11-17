# -*- coding: utf-8 -*-
"""BỘ PHÉP ĐO Ở MỨC MÀN — phân trang · liệt kê thành phần · chuyển trạng thái  (2026-09-16).

Ba lớp case còn lại sau khi `truong_live` phủ xong phần trường:

  · **Phân trang** (38 case) — style của cụm phân trang và chuyện *"có bị lưu cache không"*.
  · **Giao diện chung** (20 case) — liệt kê từng thành phần cột D đòi. `chay_live.
    liet_ke_thanh_phan` đã có, nhưng nó đọc `kho_control()` — kho ấy **không bao giờ** sinh
    nhãn `Phân trang`, không sinh tên bảng/lưới, và không quét control NẰM TRONG DÒNG BẢNG.
    Hậu quả đo được ngày 15/09: mọi case liệt kê có hai dòng đó đều bị báo THIẾU dù ảnh chụp
    có đủ. Phép ở đây dựng kho từ MÀN THẬT, gồm cả ba nguồn bị bỏ sót.
  · **Chuyển trạng thái** (32 case) — hộp xác nhận, huỷ bỏ, đổi trạng thái thật rồi đổi lại.

Luật chung của cả file, giống hệt `truong_live`: kỳ vọng lấy từ cột D -> `grounding` -> luật
cứng; không nguồn nào nói thì trả `None`. Mọi thao tác đổi dữ liệu đi qua `ctx.ghi()` và chỉ
chạm bản ghi QA của chính lượt chạy.
"""
import re
import time

import hanh_dong as hd
import live_ui as ui
import qalib

_s = ui._s


def _n(s):
    return qalib.norm(s or '')


def _co(nb, *kw):
    return all(k in nb for k in kw)


def _bat_ky(nb, *kw):
    return any(k in nb for k in kw)


PHEP_MAN = []


def phep(ten, can_ghi=False, loai='UI'):
    """Đăng ký phép đo. `loai` = measurement_type ghi vào `cases.json` (§2 chỉ thị 16/09 l3)."""
    def deco(f):
        PHEP_MAN.append({'ten': ten, 'can_ghi': can_ghi, 'nhan': f.nhan, 'chay': f,
                          'loai': loai})
        return f
    return deco


def nhan_dien(f_nhan):
    def deco(f):
        f.nhan = f_nhan
        return f
    return deco


def _nhom(case):
    return case.nhom.get('sub2') or case.nhom.get('sub') or ''


# ══════════════════════════════════════════════════════════════════════════════
# 1. PHÂN TRANG
# ══════════════════════════════════════════════════════════════════════════════
def _cum_phan_trang(c):
    """Đọc cụm phân trang THẬT: từng nút, toạ độ, chiều cao, trạng thái, con trỏ.

    Khoanh vùng bằng chính nút số trang + nhãn `Tổng số bản ghi` chứ không bằng một class
    nào: mỗi app đặt tên class một kiểu, còn *"khối chứa các nút số trang"* thì app nào cũng có.
    """
    return ui._js(c, """
      const so=[...document.querySelectorAll('button,[role=button],a')].filter(HIEN)
        .filter(b=>/^\\d+$/.test(TXT(b)));
      let goc=null;
      if(so.length){goc=so[0].parentElement;
        for(let k=0;k<4&&goc;k++){ if(so.every(b=>goc.contains(b))) break; goc=goc.parentElement;}
        /* Khối nhỏ nhất chứa các nút số trang thường CHỈ có các nút ấy (app hay bọc chúng
           trong một <span> riêng). Cụm phân trang mà case nói tới còn gồm nhãn `Số bản
           ghi/trang`, ô nhập và nhãn `Tổng số bản ghi` — nằm ở khối CHA. Đo được trên app
           giả: bản đầu đọc ra ĐÚNG 2 thành phần rồi kết luận về "thẳng hàng" trên hai nút.
           Nới lên trên cho tới khi thấy các nhãn ấy, tối đa 3 cấp. */
        for(let k=0;k<3&&goc&&goc.parentElement;k++){
          if(/t[oổ]ng s[oố] b[aả]n ghi|b[aả]n ghi\/trang|s[oố] d[oò]ng/i.test(TXT(goc))) break;
          goc=goc.parentElement;}}
      if(!goc){goc=[...document.querySelectorAll('div,nav,footer')]
        .filter(e=>HIEN(e)&&/t[oổ]ng s[oố] b[aả]n ghi|s[oố] b[aả]n ghi\\/trang/i.test(e.innerText||''))
        .sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length)[0]||null;}
      if(!goc) return 'null';
      const el=[...goc.querySelectorAll('button,[role=button],a,input,select,label,span')]
        .filter(HIEN).filter(e=>e.children.length===0||e.tagName==='BUTTON'||e.tagName==='INPUT');
      const mo_ta=e=>{const r=e.getBoundingClientRect(), s=getComputedStyle(e);
        return {chu:(TXT(e)||e.value||e.placeholder||e.getAttribute('aria-label')||'').slice(0,40),
          the:e.tagName.toLowerCase(), top:Math.round(r.top), cao:Math.round(r.height),
          rong:Math.round(r.width), vo_hieu:!!e.disabled||e.getAttribute('aria-disabled')==='true',
          con_tro:s.cursor, do_mo:s.opacity, nen:s.backgroundColor, chu_mau:s.color,
          dang_chon:(e.getAttribute('aria-current')==='page'
            ||/\\b(active|selected)\\b/i.test(e.className||'')
            ||e.getAttribute('data-state')==='active')};};
      return JSON.stringify({txt:TXT(goc).slice(0,300), tp:el.map(mo_ta)});""")


@phep('phan_trang_style')
@nhan_dien(lambda cs: 'phan trang' in _n(_nhom(cs)) and _bat_ky(
    _n(cs.b), 'style cua paging', 'cach hien thi cua chuc nang phan trang', 'style phan trang'))
def p_phan_trang_style(case, ctx):
    """Cụm phân trang: thẳng hàng · cùng chiều cao · nút đang chọn tô khác · nút vô hiệu mờ."""
    ctx.ve_danh_sach(lam_moi=True)
    cum = _cum_phan_trang(ctx.c)
    if not cum or not cum.get('tp'):
        khong = [x for x in (ctx.khong_co or []) if 'phan trang' in _n(x)]
        if khong:
            return 'F', ('Màn KHÔNG có cụm phân trang — `grounding.khong_co` đã ground: %s. '
                         'Đề nghị BA sửa đặc tả.' % khong[0]), {'khong_co': khong[:3]}
        return None
    tp = [x for x in cum['tp'] if x.get('cao')]
    if len(tp) < 2:
        return None
    nut_so = [x for x in tp if re.fullmatch(r'\d+', (x.get('chu') or '').strip())]
    vo_hieu = [x for x in tp if x.get('vo_hieu')]
    dang_chon = [x for x in nut_so if x.get('dang_chon')]
    tops = sorted({x['top'] for x in tp})
    # "Thẳng hàng" đo bằng toạ độ TRÊN: lệch ≤ 6px là cùng một hàng (bù cho căn giữa theo
    # chiều dọc của từng thẻ). Không đo bằng class hay bằng mắt.
    hang = []
    for t in tops:
        if not hang or t - hang[-1] > 6:
            hang.append(t)
    caos = sorted({x['cao'] for x in tp if x['cao'] > 4})
    du = {'so_thanh_phan': len(tp), 'so_hang': len(hang), 'chieu_cao': caos,
          'nut_so': [x['chu'] for x in nut_so], 'so_nut_vo_hieu': len(vo_hieu),
          'nut_dang_chon': [x['chu'] for x in dang_chon],
          'con_tro_nut_vo_hieu': sorted({x['con_tro'] for x in vo_hieu}),
          'do_mo_nut_vo_hieu': sorted({x['do_mo'] for x in vo_hieu}),
          'muc_bang_chung': 'UI', 'txt': cum.get('txt')}
    loi = []
    if len(hang) > 2:
        loi.append('các thành phần nằm trên %d hàng khác nhau, không thẳng hàng' % len(hang))
    if caos and (max(caos) - min(caos)) > 10:
        loi.append('chiều cao lệch nhau (%s px)' % ' · '.join(str(x) for x in caos))
    if nut_so and not dang_chon:
        loi.append('không nút số trang nào được đánh dấu "đang chọn"')
    if dang_chon and len(nut_so) > 1:
        nen_chon = dang_chon[0].get('nen')
        khac = [x for x in nut_so if not x.get('dang_chon')]
        if khac and all(x.get('nen') == nen_chon for x in khac):
            loi.append('nút đang chọn tô NỀN GIỐNG HỆT các nút khác (%s)' % nen_chon)
    if vo_hieu:
        ct = {x['con_tro'] for x in vo_hieu}
        mo = {x['do_mo'] for x in vo_hieu}
        if not (ct & {'not-allowed', 'no-drop'}):
            loi.append('nút bị vô hiệu KHÔNG đổi con trỏ thành dấu cấm (đang %s)'
                       % ' · '.join(sorted(ct)))
        if all(float(x or 1) >= 0.95 for x in mo):
            loi.append('nút bị vô hiệu KHÔNG mờ đi (opacity %s)' % ' · '.join(sorted(mo)))
    if loi:
        return 'F', ('Cụm phân trang (%d thành phần): %s.' % (len(tp), ' · '.join(loi))), du
    return 'P', ('Cụm phân trang %d thành phần: thẳng hàng (%d hàng), chiều cao đồng nhất %s px, '
                 'nút đang chọn %s được tô khác, %d nút vô hiệu mờ và đổi con trỏ thành dấu cấm.'
                 % (len(tp), len(hang), '/'.join(str(x) for x in caos),
                    ' · '.join(x['chu'] for x in dang_chon) or '-', len(vo_hieu))), du


@phep('phan_trang_cache')
@nhan_dien(lambda cs: 'phan trang' in _n(_nhom(cs)) and _co(_n(cs.b), 'luu cache'))
def p_phan_trang_cache(case, ctx):
    """Đặt cỡ trang + sang trang 2, rồi NẠP LẠI màn — trạng thái phải trở về mặc định.

    "Không bị lưu cache" của cột D nghĩa là: mở lại màn thì danh sách dựng lại từ máy chủ
    với cỡ trang mặc định và trang 1, không giữ trạng thái cũ của phiên trước.
    """
    ctx.ve_danh_sach(lam_moi=True)
    pt0 = ui.doc_phan_trang(ctx.c) or {}
    if not ui.so_trang(pt0):
        return None
    lat = ui.lat_trang(ctx.c, 2)
    if not (lat and lat.get('ok')):
        return None
    pt1 = ui.doc_phan_trang(ctx.c) or {}
    ctx.c.go(ctx.url)
    ctx.c.wait("document.querySelectorAll('table th').length?1:0", 30)
    time.sleep(1.4)
    pt2 = ui.doc_phan_trang(ctx.c) or {}
    mac_dinh = qalib.SO_BAN_GHI_MAC_DINH if hasattr(qalib, 'SO_BAN_GHI_MAC_DINH') else 20
    du = {'truoc': pt0, 'sau_khi_lat': pt1, 'sau_khi_nap_lai': pt2,
          'cho_phep_mac_dinh': mac_dinh, 'muc_bang_chung': 'UI'}
    if str(pt1.get('trang_hien') or '') not in ('2', ''):
        return None                  # không lật được thật -> không dựng được ca
    ve_trang_1 = str(pt2.get('trang_hien') or '1') in ('', '1')
    if ve_trang_1:
        return 'P', ('Sang trang 2 rồi nạp lại màn: hệ thống trở về trang 1 (%s dòng/trang) — '
                     'không giữ trạng thái cũ, không bị lưu cache.'
                     % pt2.get('so_dong')), du
    return 'F', ('Sang trang 2 rồi nạp lại màn mà hệ thống VẪN ở trang %s — trạng thái phân '
                 'trang bị lưu lại.' % pt2.get('trang_hien')), du


# ══════════════════════════════════════════════════════════════════════════════
# 2. Ô SỐ BẢN GHI / TRANG
# ══════════════════════════════════════════════════════════════════════════════
def _o_page_size(c):
    """Ô nhập cỡ trang — tìm theo NHÃN đứng cạnh, không theo thứ tự DOM."""
    return ui._js(c, """
      const ds=[...document.querySelectorAll('input')].filter(HIEN);
      const hop=e=>{const t=QN(NHAN(e)+' '+(e.placeholder||'')+' '
          +(e.getAttribute('aria-label')||''));
        return /(so ban ghi|ban ghi\\/trang|so dong|dong\\/trang|page size)/.test(t);};
      let e=ds.find(hop);
      if(!e){
        /* App hay viết `<span>Số bản ghi/trang: <input></span>` — nhãn và ô nằm trong CÙNG
           một thẻ, nên thẻ ấy KHÔNG phải thẻ lá và lối dò "thẻ lá rồi đi lên" trượt sạch.
           Tìm thẻ NHỎ NHẤT vừa mang chữ ấy vừa chứa một ô nhập. */
        const ung=[...document.querySelectorAll('span,div,label,li,td')].filter(HIEN)
          .filter(x=>/so ban ghi\\/trang|so ban ghi tren trang|so dong\\/trang/.test(QN(TXT(x)))
                     && x.querySelector('input'));
        if(ung.length){ung.sort((a,b)=>TXT(a).length-TXT(b).length);
          e=ung[0].querySelector('input');}}
      if(!e) return 'null';
      /* Đánh dấu chính ô vừa tìm được. Ô này thường KHÔNG có `<label for>` (app viết nhãn
         bằng chữ trong cùng một thẻ), nên `live_ui.dien(nhãn)` không bao giờ tìm lại được
         nó — đo được trên app giả: phép `o_page_size_nhap` trả `None` ở MỌI ca vì bước gõ
         trượt. Có dấu thì bước gõ nhắm đúng ô đã đo, không phải một ô khác cùng tên. */
      e.setAttribute('data-qa-pagesize','1');
      return JSON.stringify({nhan:NHAN(e)||'', gia_tri:(e.value||''), the:e.type||'text',
        min:(e.min||''), max:(e.max||''), maxlength:(e.maxLength>0&&e.maxLength<1e6?e.maxLength:'')});""")


def _dien_page_size(c, gia_tri):
    """Gõ vào ĐÚNG ô cỡ trang đã đánh dấu ở `_o_page_size`. -> giá trị đọc lại, hoặc None."""
    return ui._js(c, """
      const e=document.querySelector('input[data-qa-pagesize]');
      if(!e) return 'null';
      e.focus(); set(e,%s); e.blur();
      return JSON.stringify({gia_tri:(e.value||''), do_dai:(e.value||'').length});"""
                  % _s(gia_tri))


@phep('o_page_size_nhap')
@nhan_dien(lambda cs: 'so ban ghi tren trang' in _n(_nhom(cs))
           or 'so dong cua bang danh sach' in _n(_nhom(cs)))
def p_o_page_size(case, ctx):
    """Ô `Số bản ghi/trang`: mặc định · ký tự khác số · số âm · 0 · vượt trần."""
    ctx.ve_danh_sach(lam_moi=True)
    o = _o_page_size(ctx.c)
    if not o:
        return None
    nb = _n(case.b)
    nhan = o.get('nhan') or 'Số bản ghi/trang'
    du = {'o': nhan, 'the': o.get('the'), 'min': o.get('min'), 'max': o.get('max'),
          'muc_bang_chung': 'UI'}
    # ── mặc định: LUẬT CỨNG §0a thắng mọi nguồn khác
    if _co(nb, 'gia tri mac dinh'):
        mong = 20
        gt = (o.get('gia_tri') or '').strip()
        du['gia_tri'] = gt
        if gt == str(mong):
            return 'P', ('Mở màn: ô "%s" mặc định %s — đúng luật cứng UI (§0a).'
                         % (nhan, mong)), du
        return 'F', (qalib.khoi_luat_cung('Số bản ghi trên trang', str(mong), gt or '(trống)',
                                          (ctx.anh or {}).get('man') if ctx.anh else None)
                     if hasattr(qalib, 'khoi_luat_cung')
                     else ('Mở màn: ô "%s" mặc định %r, luật cứng UI đòi %s.'
                           % (nhan, gt, mong))), du
    mau, mo_ta = None, None
    if _co(nb, 'ky tu khac so'):
        mau, mo_ta = 'abc@#', 'chữ và ký tự đặc biệt'
    elif _co(nb, 'so am'):
        mau, mo_ta = '-5', 'số âm'
    elif _bat_ky(nb, 'nhap 0 vao', 'gia tri = 0'):
        mau, mo_ta = '0', 'giá trị 0'
    elif _bat_ky(nb, 'vuot', 'qua 18 chu so', 'gia tri lon'):
        mau, mo_ta = '9' * 20, 'số rất lớn'
    elif _co(nb, 'so thap phan'):
        mau, mo_ta = '1.5', 'số thập phân'
    if mau is None:
        return None
    dong_truoc = len(ui.doc_bang(ctx.c) or [])
    x = _dien_page_size(ctx.c, mau)
    if x is None:
        return None
    time.sleep(1.2)
    giu = (x.get('gia_tri') or '')
    loi = ui.doc_loi(ctx.c, 'man') or []
    dong_sau = len(ui.doc_bang(ctx.c) or [])
    ctx.ve_danh_sach(lam_moi=True)
    du.update({'gui': mau, 'o_giu': giu, 'loi_tren_man': loi[:3],
               'dong_truoc': dong_truoc, 'dong_sau': dong_sau})
    cau = None
    m = re.findall(r'["“”]([^"“”]{6,120})["“”]', case.d or '')
    if m:
        cau = m[0]
    nd = _n(case.d)
    doi_chan = _bat_ky(nd, 'khong cho phep nhap', 'khong nhan ky tu khac so', 'khong cho nhap')
    if doi_chan:
        if giu.strip() != mau.strip():
            return 'P', ('Nhập %s vào ô "%s": ô không nhận (giữ %r) — đúng cột D.'
                         % (mo_ta, nhan, giu)), du
        if cau and any(_n(cau) in _n(y) for y in loi):
            return 'P', ('Nhập %s vào ô "%s": hiện đúng thông báo nguyên văn %r.'
                         % (mo_ta, nhan, cau)), du
        return 'F', ('Nhập %s vào ô "%s" mà ô NHẬN nguyên %r và không báo lỗi.'
                     % (mo_ta, nhan, giu)), du
    if cau:
        if any(_n(cau) in _n(y) for y in loi):
            giu_ds = (dong_sau == dong_truoc)
            return 'P', ('Nhập %s vào ô "%s": hiện đúng dòng chữ %r%s.'
                         % (mo_ta, nhan, cau,
                            ', danh sách giữ nguyên %d dòng' % dong_sau if giu_ds else '')), du
        return 'F', ('Nhập %s vào ô "%s": KHÔNG thấy dòng chữ %r (đọc được: %s).'
                     % (mo_ta, nhan, cau, ' | '.join(loi[:2]) or 'không có')), du
    return None


# ══════════════════════════════════════════════════════════════════════════════
# 3. LIỆT KÊ THÀNH PHẦN CỦA MÀN  ("Giao diện chung")
# ══════════════════════════════════════════════════════════════════════════════
# Cột D viết theo khuôn `N. [Loại control] Nhãn *` (chỉ thị 10/09 lượt 2m). Đọc đúng khuôn ấy
# rồi tìm từng nhãn trên màn bằng NHIỀU nguồn — đây là chỗ bản cũ hụt:
#   · `kho_control()` không bao giờ sinh nhãn `Phân trang`;
#   · nó không sinh TÊN BẢNG/LƯỚI (chỉ sinh từng tên cột);
#   · nó không quét control NẰM TRONG DÒNG (icon Sửa/Xóa của từng bản ghi).
# Ba chỗ đó làm mọi case liệt kê bị báo THIẾU dù ảnh chụp có đủ (đo được 15/09).
_RX_DONG_TP = re.compile(r'(?m)^\s*(\d{1,2})\s*[.)]\s*(?:\[([^\]]{1,30})\]\s*)?(.+?)\s*$')


def thanh_phan_cot_d(d):
    """Cột D -> [{'stt','loai','nhan','bat_buoc'}]. [] nếu không phải khuôn liệt kê."""
    ra = []
    for m in _RX_DONG_TP.finditer(str(d or '')):
        nhan = m.group(3).strip()
        if not nhan or len(nhan) > 90:
            continue
        bb = nhan.endswith('*')
        ra.append({'stt': int(m.group(1)), 'loai': (m.group(2) or '').strip(),
                   'nhan': nhan.rstrip('*').strip(), 'bat_buoc': bb})
    return ra


def kho_tren_man(c, trong_hop=False):
    """Mọi nhãn ĐỌC ĐƯỢC trên màn, gom từ 8 nguồn. Đây là kho để đối chiếu cột D."""
    return ui._js(c, """
      const trong=%s; const g=trong?(HOP()||document):document;
      const lay=sel=>[...g.querySelectorAll(sel)].filter(HIEN);
      const chu=e=>(TXT(e)||e.getAttribute('aria-label')||e.getAttribute('title')
        ||e.placeholder||e.value||'').trim();
      const ra=[];
      const day=(nguon,ten)=>{ten=(ten||'').trim(); if(ten&&ten.length<120) ra.push({nguon:nguon,nhan:ten});};
      lay('h1,h2,[role=heading]').forEach(e=>day('tieu_de',TXT(e)));
      lay('button,[role=button],a[href]').forEach(e=>day('nut',chu(e)));
      lay('input,select,textarea,[role=combobox],[role=switch],[role=checkbox]')
        .forEach(e=>{day('o',NHAN(e)); if(e.placeholder) day('goi_y',e.placeholder);});
      lay('table thead th').forEach(e=>day('cot',TXT(e)));
      /* ① control NẰM TRONG DÒNG BẢNG — nguồn mà kho cũ không hề quét */
      const tr=[...g.querySelectorAll('table tbody tr')].filter(r=>r.querySelectorAll('td').length>1)[0];
      if(tr) [...tr.querySelectorAll('button,[role=button],a,input,[role=switch]')]
        .forEach(e=>day('trong_dong',(e.getAttribute('title')||e.getAttribute('aria-label')
          ||TXT(e)||'').trim()));
      /* ② CỤM PHÂN TRANG — kho cũ không bao giờ sinh nhãn này */
      const so=[...g.querySelectorAll('button,[role=button],a')].filter(HIEN)
        .filter(b=>/^\\d+$/.test(TXT(b)));
      if(so.length||/t[oổ]ng s[oố] b[aả]n ghi|b[aả]n ghi\\/trang/i.test(g.innerText||'')){
        day('phan_trang','Phân trang'); day('phan_trang','Paging');
        day('phan_trang','Số bản ghi/trang'); day('phan_trang','Tổng số bản ghi');}
      /* ③ TÊN BẢNG/LƯỚI — kho cũ chỉ sinh từng tên cột */
      if(g.querySelector('table')){day('bang','Bảng danh sách'); day('bang','Danh sách');
        day('bang','Bảng dữ liệu'); day('bang','Lưới dữ liệu');}
      lay('[class*=card i],[class*=stat i]').slice(0,12).forEach(e=>day('the',TXT(e).split('\\n')[0]));
      lay('nav,ol').slice(0,4).forEach(e=>day('breadcrumb',TXT(e)));
      const thay=new Set(); const kq=[];
      for(const x of ra){const k=x.nguon+'|'+QN(x.nhan); if(!thay.has(k)){thay.add(k); kq.push(x);}}
      return JSON.stringify(kq);""" % ('true' if trong_hop else 'false')) or []


def _khop_kho(kho, nhan):
    """Thành phần này có trên màn không? -> nguồn tìm thấy, hoặc None.

    Khớp ĐÚNG BẰNG trước, rồi mới "chứa" và chỉ khi nhãn đủ dài (≥ 4 ký tự) — khớp lỏng hai
    chiều là chỗ `[Checkbox] Bản ghi` từng khớp nhầm vào `Số bản ghi trên trang` (15/09).
    """
    n = _n(nhan).rstrip('*: ').strip()
    if not n:
        return None
    for x in kho:
        if _n(x['nhan']).rstrip('*: ').strip() == n:
            return x['nguon']
    if len(n) >= 4:
        for x in kho:
            t = _n(x['nhan'])
            if n in t or (len(t) >= 4 and t in n):
                return x['nguon']
    return None


@phep('giao_dien_liet_ke')
@nhan_dien(lambda cs: 'giao dien chung' in _n(_nhom(cs)) and _bat_ky(
    _n(cs.b), 'hien thi day du cac thong tin', 'tong the giao dien'))
def p_giao_dien(case, ctx):
    """Đối chiếu từng dòng liệt kê của cột D với màn thật."""
    ds = thanh_phan_cot_d(case.d)
    # Ngưỡng 1, không phải 2. `thanh_phan_cot_d` chỉ nhận đúng khuôn `N. [Loại] Nhãn`, nên
    # một dòng phân tích được đã là một bản liệt kê thật — không phải cột D chữ chay bị vơ
    # nhầm. Ngưỡng 2 làm 2 case của `ViTriLuuTru` (cột D liệt kê đúng một nút) về CHƯA ĐO
    # trong khi thứ phải đối chiếu đã nằm sờ sờ ở đó.
    if len(ds) < 1:
        return None
    from truong_live import pv_form
    trong_hop = pv_form(case) in ('them', 'sua', 'hop')
    if trong_hop:
        if not ui.hop_cua_ta_con_mo(ctx.c):
            hop = ui.mo_hop(ctx.c, ctx.nut_them())
            if not hop:
                return None
    else:
        ctx.ve_danh_sach(lam_moi=True)
    kho = kho_tren_man(ctx.c, trong_hop)
    if trong_hop and ui.co_hop_thoai(ctx.c):
        ui.dong_hop(ctx.c)
    if not kho:
        return None
    co, thieu = [], []
    for x in ds:
        ng = _khop_kho(kho, x['nhan'])
        (co if ng else thieu).append(dict(x, nguon=ng))
    du = {'so_thanh_phan_cot_D': len(ds), 'co': [x['nhan'] for x in co],
          'thieu': [x['nhan'] for x in thieu], 'kho_doc_duoc': len(kho),
          'muc_bang_chung': 'UI'}
    if not thieu:
        return 'P', ('Màn hiện đủ %d/%d thành phần cột D liệt kê (%s).'
                     % (len(co), len(ds), ' · '.join(x['nhan'] for x in co[:6])
                        + (' …' if len(co) > 6 else ''))), du
    return 'F', ('Màn thật THIẾU %d/%d thành phần cột D yêu cầu: %s.'
                 % (len(thieu), len(ds), ' · '.join(x['nhan'] for x in thieu[:8]))), du


# ══════════════════════════════════════════════════════════════════════════════
# 4. CHUYỂN TRẠNG THÁI
# ══════════════════════════════════════════════════════════════════════════════
def _la_chuyen_tt(cs):
    return 'chuyen trang thai' in _n(_nhom(cs))


def _cot_trang_thai(dong):
    for k, v in (dong.get('o') or {}).items():
        if 'trang thai' in _n(k):
            return k, str(v or '').strip()
    return None, None


def _nut_chuyen(ctx, ma):
    """Tên nút/icon chuyển trạng thái ĐANG CÓ trên dòng bản ghi QA — đọc từ chính dòng đó."""
    ds = ui.control_trong_dong(ctx.c, 0) or []
    vb = [str(x) for x in (ctx.vb('icon_ban_ghi') or [])]
    uu_tien = [x for x in vb if _bat_ky(_n(x), 'kich hoat', 'ngung hoat dong',
                                        'chuyen trang thai', 'khoi phuc')]
    for ten in uu_tien:
        for x in ds:
            if _n(ten) == _n(x.get('nhan') or ''):
                return ten
    for x in ds:
        if _bat_ky(_n(x.get('nhan') or ''), 'kich hoat', 'ngung hoat dong',
                   'chuyen trang thai', 'khoi phuc'):
            return x.get('nhan')
    return None


def _khai_khong_hop_xac_nhan(ctx):
    """Hồ sơ màn có KHẲNG ĐỊNH thao tác chuyển trạng thái không có hộp xác nhận không?

    Trả nguyên văn dòng khai trong `grounding.khong_co`, hoặc `''`.

    Vì sao phải hỏi TRƯỚC KHI BẤM (vá 16/09): trên màn như thế, cú bấm icon Kích hoạt / Ngừng
    hoạt động **gọi API ngay** — một mutation nằm NGOÀI mọi cửa sổ ghi (cửa sổ chỉ mở quanh
    bước xác nhận, vì phép đo giả định có bước ấy). Sổ mạng xếp đúng nó là `WRITE` và DỪNG cả
    lượt chạy; workbook chỉ được ghi ở cuối lượt nên **mất trắng mọi mark đã chấm** — đo được
    trên màn `Vị trí lưu trữ`: dừng ở case 424/469.

    Không bấm thì không có mutation nào để phải hợp thức hoá, và kết luận vẫn có bằng chứng:
    `grounding.khong_co` là dữ kiện đã ground từ bundle FE (§chinh_sach_PE mục 6).
    """
    for x in (ctx.khong_co or []):
        nb = _n(x)
        if _co(nb, 'hop xac nhan') and _bat_ky(nb, 'kich hoat', 'ngung hoat dong',
                                               'chuyen trang thai'):
            return str(x)
    return ''


@phep('chuyen_trang_thai_huy', can_ghi=True)
@nhan_dien(lambda cs: _la_chuyen_tt(cs) and _bat_ky(
    _n(cs.b), 'huy bo thao tac chuyen trang thai', 'click icon dong tren hop xac nhan'))
def p_chuyen_tt_huy(case, ctx):
    """Mở hộp xác nhận chuyển trạng thái rồi HUỶ — trạng thái không được đổi.

    Không có request ghi nào được phép bay đi trong case này; `so_request_ghi` phải là 0,
    và cửa sổ ghi vẫn mở vì đây là chỗ *chứng minh* điều đó, không phải chỗ tin lời hứa.
    """
    khai = _khai_khong_hop_xac_nhan(ctx)
    if khai:
        return 'F', ('Màn KHÔNG có hộp xác nhận cho thao tác chuyển trạng thái nên không có gì '
                     'để huỷ — hồ sơ màn đã ground: %s. Đề nghị BA sửa đặc tả hoặc bỏ case này '
                     'khỏi màn.' % khai[:200]), \
            {'nguon': 'grounding.khong_co', 'khai': khai, 'da_cham_app': False,
             'muc_bang_chung': 'grounding (bundle FE)'}
    m = ctx.ban_ghi(case)
    ma = m['ma']
    if not ctx.hien_ban_ghi_qa(ma, lam_moi=True):
        return None
    dong0 = ui.doc_dong(ctx.c, ma)
    cot, tt0 = _cot_trang_thai(dong0 or {})
    nut = _nut_chuyen(ctx, ma)
    if not nut:
        return None
    r = ui.bam_trong_dong(ctx.c, ma, nut)
    if not (r and r.get('ok')):
        return None
    time.sleep(1.0)
    if not ui.hop_cua_ta_con_mo(ctx.c):
        return 'F', ('Bấm "%s" trên bản ghi %s: KHÔNG mở hộp xác nhận nào — thao tác đổi trạng '
                     'thái chạy thẳng, không có bước xác nhận.' % (nut, ma)), \
            {'nut': nut, 'ban_ghi': ma, 'trang_thai_truoc': tt0}
    hop = ui.doc_hop_thoai(ctx.c)
    dong_bang_x = _co(_n(case.b), 'icon dong')
    with ctx.ghi(case, 'sua', ma, so_toi_da=1,
                 mo_ta='mở hộp xác nhận chuyển trạng thái rồi HUỶ') as cs:
        if dong_bang_x:
            ok = _bam_icon_dong(ctx.c)
        else:
            ok = ui.dong_hop(ctx.c)
        time.sleep(1.2)
    so_ghi = len(cs.cs.da_dung) if cs.cs else 0
    con_mo = ui.co_hop_thoai(ctx.c)
    if con_mo:
        ui.dong_hop(ctx.c)
    ctx.hien_ban_ghi_qa(ma, lam_moi=True)
    dong1 = ui.doc_dong(ctx.c, ma)
    _, tt1 = _cot_trang_thai(dong1 or {})
    ctx.ve_danh_sach()
    du = {'ban_ghi': ma, 'nut': nut, 'hop': (hop or {}).get('tieu_de'),
          'cach_dong': 'icon X' if dong_bang_x else 'nút Hủy', 'dong_duoc': bool(ok),
          'hop_con_mo': con_mo, 'trang_thai_truoc': tt0, 'trang_thai_sau': tt1,
          'so_request_ghi': so_ghi, 'muc_bang_chung': 'UI + mạng'}
    if not ok or con_mo:
        return 'F', ('Bấm %s trên hộp xác nhận chuyển trạng thái mà hộp KHÔNG đóng.'
                     % ('icon X' if dong_bang_x else 'nút Hủy')), du
    if so_ghi:
        return 'F', ('Huỷ hộp xác nhận chuyển trạng thái mà hệ thống VẪN gửi %d request ghi.'
                     % so_ghi), du
    if tt0 is not None and tt1 is not None and tt0 != tt1:
        return 'F', ('Huỷ hộp xác nhận mà trạng thái bản ghi %s vẫn đổi: %r -> %r.'
                     % (ma, tt0, tt1)), du
    return 'P', ('Mở hộp xác nhận chuyển trạng thái của bản ghi %s rồi đóng bằng %s: hộp đóng, '
                 '0 request ghi, trạng thái giữ nguyên%s.'
                 % (ma, 'icon X' if dong_bang_x else 'nút Hủy',
                    ' (%r)' % tt0 if tt0 else '')), du


def _bam_icon_dong(c):
    """Bấm icon X của hộp thoại — không phải nút Hủy."""
    return bool(ui._js(c, """
      const h=HOP(); if(!h) return 'null';
      const b=[...h.querySelectorAll('button,[role=button]')].filter(HIEN).find(x=>{
        const t=QN(TXT(x)), a=QN(x.getAttribute('aria-label')||x.getAttribute('title')||'');
        return t==='x'||t==='×'||/dong|close/.test(a)||(!t&&x.querySelector('svg'));});
      if(!b) return 'null'; b.click(); return JSON.stringify({ok:true});"""))


@phep('chuyen_trang_thai_that', can_ghi=True)
@nhan_dien(lambda cs: _la_chuyen_tt(cs) and _bat_ky(
    _n(cs.b), 'chuyen trang thai thanh cong', 'chuyen trang thai tro lai'))
def p_chuyen_tt_that(case, ctx):
    """Đổi trạng thái THẬT trên bản ghi QA rồi đọc lại cột Trạng thái.

    Chỉ chạm bản ghi `zzqa_…` của chính lượt chạy — bản ghi thật không bao giờ đi qua đây,
    và bước dọn cuối lượt vẫn xoá được bản ghi sau khi nó đã đổi trạng thái.

    KHÔNG ĐO khi hồ sơ màn khai màn không có hộp xác nhận (xem `_khai_khong_hop_xac_nhan`):
    ở đó cú bấm icon gọi API NGAY, tức mutation bay đi TRƯỚC khi có cửa sổ ghi nào mở. Thà
    để TRỐNG còn hơn gửi một lệnh ghi ngoài cửa sổ — "tool chưa có cách" khác "không đo được",
    và cả hai đều không được phép thành một mutation không khai báo.
    """
    khong_hop = _khai_khong_hop_xac_nhan(ctx)
    m = ctx.ban_ghi(case)
    ma = m['ma']
    if not ctx.hien_ban_ghi_qa(ma, lam_moi=True):
        return None
    dong0 = ui.doc_dong(ctx.c, ma)
    cot, tt0 = _cot_trang_thai(dong0 or {})
    if not cot:
        return None
    nut = _nut_chuyen(ctx, ma)
    if not nut:
        return None
    toast_mong = ctx.vb('toast_chuyen_trang_thai') or ctx.vb('toast_thanh_cong')
    if khong_hop:
        # ⚠️ VÁ 2026-09-17 lượt 2. Màn này KHÔNG có hộp xác nhận (hồ sơ màn khai, và
        # `control_trong_dong` đọc ra đúng một nút "Kích hoạt" trên dòng): cú bấm icon gọi API
        # NGAY. Bản trước bỏ đo hẳn để khỏi bắn một mutation ngoài cửa sổ ghi — đúng về an
        # toàn nhưng để 4 case CHƯA ĐO vĩnh viễn.
        #
        # Lời giải không phải né mà là KHAI TRƯỚC: mở cửa sổ ghi quanh CHÍNH cú bấm icon.
        # Mutation vẫn trên bản ghi `zzqa_…` của lượt chạy, vẫn qua đủ ba điều kiện của
        # `Cong.ghi()`, vẫn nằm trong sổ mạng đã khai endpoint — không hàng rào nào bị nới.
        nut_chot = nut
        with ctx.ghi(case, 'sua', ma, so_toi_da=1,
                     mo_ta='chuyển trạng thái (màn không có hộp xác nhận)') as cs:
            r = ui.bam_trong_dong(ctx.c, ma, nut, giay_phep=cs.giay_phep, bat_buoc_phep=True)
            if not (r and r.get('ok')):
                return None
            tb = ui.cho_thong_bao(ctx.c, giay=6.0)
        so_ghi = len(cs.cs.da_dung) if cs.cs else 0
    else:
        r = ui.bam_trong_dong(ctx.c, ma, nut)
        if not (r and r.get('ok')):
            return None
        time.sleep(1.0)
        if not ui.hop_cua_ta_con_mo(ctx.c):
            return None
        nut_chot = _nut_chot_hop(ctx)
        with ctx.ghi(case, 'sua', ma, so_toi_da=1, mo_ta='chuyển trạng thái bản ghi QA') as cs:
            ui.bam_ghi(ctx.c, nut_chot, cs.giay_phep, 'hop', cho=1.8, thuc=True)
            tb = ui.cho_thong_bao(ctx.c, giay=6.0)
        so_ghi = len(cs.cs.da_dung) if cs.cs else 0
    if ui.co_hop_thoai(ctx.c):
        ui.dong_hop(ctx.c)
    ctx.hien_ban_ghi_qa(ma, lam_moi=True)
    dong1 = ui.doc_dong(ctx.c, ma)
    _, tt1 = _cot_trang_thai(dong1 or {})
    icon_sau = [x.get('nhan') for x in (ui.control_trong_dong(ctx.c, 0) or []) if x.get('nhan')]
    ctx.ve_danh_sach()
    du = {'ban_ghi': ma, 'nut_mo': nut, 'nut_chot': nut_chot, 'cot': cot,
          'man_co_hop_xac_nhan': not khong_hop,
          'ho_so_khai_khong_co_hop': khong_hop or None,
          'trang_thai_truoc': tt0, 'trang_thai_sau': tt1, 'thong_bao': tb,
          'icon_tren_dong_sau': icon_sau[:8], 'so_request_ghi': so_ghi,
          'muc_bang_chung': 'UI + mạng'}
    if so_ghi == 0:
        return None                # cú bấm không tới nút -> phép chưa xảy ra
    if tt0 == tt1:
        return 'F', ('Bấm "%s" rồi "%s" trên bản ghi %s: cột %s VẪN là %r — trạng thái không '
                     'đổi.' % (nut, nut_chot, ma, cot, tt1)), du
    if toast_mong and not (tb and any(_n(toast_mong) in _n(x) for x in tb.get('chu', []))):
        return 'F', ('Chuyển trạng thái bản ghi %s: cột %s đổi %r -> %r nhưng KHÔNG hiện thông '
                     'báo nguyên văn %r (đọc được: %s).'
                     % (ma, cot, tt0, tt1, toast_mong,
                        ' | '.join((tb or {}).get('chu', []))[:90] or 'không có')), du
    return 'P', ('Bấm "%s" rồi "%s" trên bản ghi %s: cột %s đổi %r -> %r%s, đúng 1 request ghi.'
                 % (nut, nut_chot, ma, cot, tt0, tt1,
                    ', hiện thông báo %r' % (tb['chu'][0][:60]) if tb else '')), du


# Nút ĐÓNG của hộp thoại thường không có chữ, chỉ một ký hiệu (`×` · `✕` · `X`) hoặc một
# icon SVG. Bản đầu chỉ loại theo chữ `huy`/`dong` nên `×` lọt qua và trở thành "nút chốt"
# — phép chuyển trạng thái bấm vào đó, hộp đóng, 0 request ghi, rồi phép tự trả `None`.
# Tức là một lỗi im lặng: case về CHƯA ĐO mà không ai biết vì sao. Đo được trên app giả.
_KY_HIEU_DONG = {'x', '×', '✕', '✖', '╳', ''}


def _nut_chot_hop(ctx):
    """Nút chốt của hộp xác nhận đang mở — KHÔNG phải Hủy, KHÔNG phải nút đóng ký hiệu."""
    hop = ui.doc_hop_thoai(ctx.c) or {}
    for b in (hop.get('nut') or []):
        chu = (b.get('chu') or '').strip()
        if not chu or _n(chu) in _KY_HIEU_DONG or len(chu) < 2:
            continue
        if qalib.chua_tu(chu, 'huy', 'huy bo', 'dong', 'cancel', 'quay lai', 'close'):
            continue
        return chu
    return 'Xác nhận'


# ══════════════════════════════════════════════════════════════════════════════
# 5. XUẤT EXCEL VỚI DỮ LIỆU LỚN
# ══════════════════════════════════════════════════════════════════════════════
@phep('xuat_excel_du_lieu_lon', can_ghi=True)
@nhan_dien(lambda cs: 'xuat excel' in _n(_nhom(cs)) and _bat_ky(
    _n(cs.b), 'xuat du lieu lon', 'nhieu ban ghi'))
def p_xuat_lon(case, ctx):
    """Dựng danh sách NHIỀU bản ghi bằng mô phỏng mạng rồi bấm Xuất Excel.

    ⚠️ `can_ghi=True` là CÓ CHỦ Ý. Sự cố 15/09: phép `xuat_excel` khai `can_ghi=False` với lý
    do *"tải tệp là GET"*, nhưng moetdl xuất Excel bằng **POST …:export** và một lượt chỉ-đọc
    đã phát một `POST` lên hệ thống thật. Luật rút ra, áp cho mọi dự án: **nút Xuất Excel mặc
    định coi là GHI cho tới khi `grounding.api` chứng minh được nó là GET.**
    """
    import mock_live
    api = [str(x) for x in ((ctx.hs.get('grounding') or {}).get('api') or [])]
    ep_xuat = [re.match(r'\s*(GET|POST)\s+(\S+)', x) for x in api]
    ep_xuat = [(m.group(1).upper(), m.group(2)) for m in ep_xuat if m and ':export' in m.group(2)]
    if not ep_xuat:
        return None
    method, ep = ep_xuat[0]
    eps_doc = mock_live.endpoints_doc(ctx.hs)
    if not eps_doc:
        return None
    nut = None
    for x in (ctx.vb('nut_dau_man') or []):
        if 'excel' in _n(x) or 'xuat' in _n(x):
            nut = x
            break
    if not nut:
        return None
    cs_mock = qalib.CuaSoMock(case.key, 'nhieu_ban_ghi', eps_doc,
                              'API trả nhiều bản ghi để dựng ca xuất dữ liệu lớn')
    with mock_live.Mock(ctx.c, cs_mock, cong=ctx.cong, so_ban_ghi=300) as mk:
        ctx.c.go(ctx.url)
        mk.cho("document.querySelectorAll('table th').length?1:0", giay=20)
        mk.nghi(1.2)
        pt = ui.doc_phan_trang(ctx.c) or {}
        if not mk.da_dung:
            return None
        t0 = time.time()
        if method == 'GET':
            ctx.cong.hanh_dong('tai_tep', 'Xuất Excel (GET) với %s bản ghi' % pt.get('tong'))
            bam = ui.bam(ctx.c, nut, 'man', cho=2.0)
            gp = None
        else:
            # POST -> đi qua cổng ghi như mọi mutation. Bản ghi đích là chính lượt chạy QA:
            # không có id bản ghi nào bị đụng, nhưng cửa sổ ghi vẫn phải mở để sổ mạng có
            # chỗ hợp lệ cho request và để nó được ĐẾM.
            m = ctx.ban_ghi(case)
            with ctx.ghi(case, 'tao', m['ma'], so_toi_da=2,
                         mo_ta='bấm Xuất Excel (POST %s)' % ep) as cg:
                gp = cg.giay_phep
                bam = ui.bam_ghi(ctx.c, nut, gp, 'man', cho=2.5, thuc=True)
        mk.nghi(3.0)
        giay = round(time.time() - t0, 1)
        tb = ui.doc_thong_bao(ctx.c)
        loi = ui.doc_loi(ctx.c, 'man')
        tt = ui.trang_thai_tai(ctx.c)
    ctx.ve_danh_sach(lam_moi=True)
    tep = _tep_moi(ctx)
    du = {'mock': cs_mock.khoi(), 'so_ban_ghi_dung': pt.get('tong'), 'nut': nut,
          'endpoint_xuat': '%s %s' % (method, ep), 'giay': giay, 'thong_bao': tb[:3],
          'loi': loi[:2], 'tep_tai_ve': tep, 'trang_thai': tt,
          'muc_bang_chung': 'MOCK + UI'}
    if not (bam and bam.get('ok')):
        return 'F', ('%s\nKhông bấm được nút %r (nút không có hoặc bị vô hiệu) khi danh sách có '
                     '%s bản ghi.' % (cs_mock.nhan_xet(), nut, pt.get('tong'))), du
    if loi:
        return 'F', ('%s\nBấm %r khi danh sách có %s bản ghi: màn báo lỗi %r.'
                     % (cs_mock.nhan_xet(), nut, pt.get('tong'), loi[0][:100])), du
    return 'P', ('%s\nBấm %r khi danh sách có %s bản ghi: hệ thống nhận yêu cầu xuất (%s s)%s, '
                 'màn không lỗi.'
                 % (cs_mock.nhan_xet(), nut, pt.get('tong'), giay,
                    ', tệp nhận được: %s' % tep if tep else
                    ', chưa nhận được tệp trong thời gian chờ')), du


def _tep_moi(ctx):
    import os
    d = getattr(ctx, 'thu_muc_tai', None)
    if not d or not os.path.isdir(d):
        return None
    ds = sorted((f for f in os.listdir(d) if not f.endswith('.crdownload')),
                key=lambda f: os.path.getmtime(os.path.join(d, f)), reverse=True)
    return ds[0] if ds else None


# ══════════════════════════════════════════════════════════════════════════════
def phep_cua(case, cho_phep_ghi=True):
    for p in PHEP_MAN:
        if p['can_ghi'] and not cho_phep_ghi:
            continue
        try:
            if p['nhan'](case):
                return p['ten']
        except Exception:
            continue
    return None

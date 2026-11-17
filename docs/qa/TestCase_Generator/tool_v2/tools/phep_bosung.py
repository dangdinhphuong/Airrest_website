# -*- coding: utf-8 -*-
"""BỘ PHÉP ĐO BỔ SUNG — lấp đúng các nhóm case còn CHƯA ĐO  (mới 2026-09-16 lượt 3).

Mỗi phép trong file này sinh ra từ một nhóm case CỤ THỂ đếm được trên lượt chạy 16/09 của
`ViTriLuuTru` (499 case · 113 CHƯA ĐO), không phải từ phỏng đoán về "còn thiếu gì":

    §6  hộp thoại Xem chi tiết        5 case   -> `xem_chi_tiet_modal` · `xem_chi_tiet_dong`
    §8  thao tác song song 2 tab      5 case   -> `song_song_hai_tab`
    §9  hình học (chú thích · nút)    5 case   -> `hinh_hoc_nut` · `hinh_hoc_chu_thich`
    §10 thao tác lặp nhanh            4 case   -> `lap_nhanh_icon_dong` · `lap_nhanh_tab_enter`
    §11 thẻ số liệu ↔ dữ liệu         4 case   -> `the_so_lieu_vs_du_lieu`
    §12 nhóm lẻ                       6 case   -> `ky_tu_dac_biet_luu_lai` · `ma_da_ton_tai` ·
                                                  `chan_xoa_dang_dung` · `o_chon_mac_dinh_form`
    §5  ô chọn động / nhiều lựa chọn           -> `o_chon_tuy_chon_dong` · `o_chon_nhieu_gia_tri`

Ba luật chung, không phép nào được nới:

  ① **Không tự viết Expected Result.** Kỳ vọng lấy từ cột D của case hoặc `grounding.verbatim`
     của hồ sơ màn. Không có kỳ vọng thì trả `None` (CHƯA ĐO có lý do), tuyệt đối không tự
     đặt một ngưỡng rồi chấm theo ngưỡng ấy — §9 và §10 của chỉ thị nói thẳng điều này.
  ② **Không biến "thiếu bằng chứng" thành P.** Mỗi nhánh `P` phải kèm dữ kiện ĐO ĐƯỢC in ra
     trong ghi chú; nhánh nào chỉ có "không thấy lỗi gì" thì trả `None`.
  ③ **Mutation nào cũng đi qua cổng cũ** — `ctx.ghi()` -> `Cong.ghi()` -> `CuaSoGhiQA`, và
     đích luôn là bản ghi QA của chính lượt chạy. File này không mở một đường ghi nào mới.
"""
import re
import time

import live_ui as ui
import qalib

PHEP_BOSUNG = []


def phep(ten, can_ghi=False, loai='UI'):
    def deco(f):
        PHEP_BOSUNG.append({'ten': ten, 'can_ghi': can_ghi, 'nhan': f.nhan, 'chay': f,
                            'loai': loai})
        return f
    return deco


def nhan_dien(f_nhan):
    def deco(f):
        f.nhan = f_nhan
        return f
    return deco


def _n(s):
    return qalib.norm(s or '')


def _co(nb, *kw):
    return all(k in nb for k in kw)


def _bat_ky(nb, *kw):
    return any(k in nb for k in kw)


def _nhom(cs):
    return cs.nhom.get('sub2') or cs.nhom.get('sub') or ''


def _pv(case):
    from chay_live import pham_vi
    return pham_vi(case)


def _loi_thao_tac(msg):
    from phep_live import LoiThaoTac
    return LoiThaoTac(msg)


# ══════════════════════════════════════════════════════════════════════════════
# §6. HỘP THOẠI XEM CHI TIẾT
# ══════════════════════════════════════════════════════════════════════════════
def _nhan_icon_xem(ctx):
    """Nhãn biểu tượng *Xem chi tiết* theo hồ sơ màn — không chốt cứng chuỗi nào."""
    for x in (ctx.vb('icon_ban_ghi') or []):
        if qalib.chua_tu(str(x), 'xem chi tiet', 'xem', 'chi tiet'):
            return str(x)
    return 'Xem chi tiết'


def _kho_chi_tiet(ctx):
    """Khối `grounding.verbatim.xem_chi_tiet` — `{}` nếu hồ sơ màn chưa khai."""
    return ctx.vb('xem_chi_tiet') or ctx.vb('chi_tiet') or {}


def _doc_hop_chi_tiet(c):
    """Đọc hộp thoại chi tiết thành cặp nhãn→giá trị + số đo khung. `None` nếu không có hộp."""
    return ui._js(c, """
      const h=HOP(); if(!h) return 'null';
      const r=h.getBoundingClientRect();
      /* Cặp nhãn→giá trị: khối lá nào có ĐÚNG hai mẩu chữ con thì mẩu đầu là nhãn. Không
         dựa vào class của app — mỗi app đặt một kiểu, và đoán class là đoán sai lặng lẽ. */
      const cap=[]; const nhan=[];
      for(const e of h.querySelectorAll('*')){
        if(e.children.length!==2) continue;
        const a=TXT(e.children[0]), b=TXT(e.children[1]);
        if(!a||a.length>60) continue;
        if(e.querySelector('input,select,textarea')) continue;
        cap.push({nhan:a, gia_tri:b});}
      for(const e of h.querySelectorAll('dt,th,label,[class*=label i]')){
        const t=TXT(e); if(t&&t.length<60&&nhan.indexOf(t)<0) nhan.push(t);}
      const tran=[...h.querySelectorAll('*')].filter(e=>{
        const q=e.getBoundingClientRect();
        return q.width>0 && (q.right>r.right+2 || q.left<r.left-2);}).length;
      return JSON.stringify({
        tieu_de:TXT(h.querySelector('h1,h2,h3,[role=heading]')||{}),
        cap:cap.slice(0,60), nhan:nhan.slice(0,60), txt:TXT(h).slice(0,2000),
        nut:[...h.querySelectorAll('button')].filter(HIEN).map(TXT),
        rong:Math.round(r.width), cao:Math.round(r.height),
        cao_khung:Math.round(innerHeight), ti_le_cao:Math.round(r.height*100/innerHeight),
        cuon_doc:h.scrollHeight>h.clientHeight+2, so_tran_ngang:tran,
        cuon_ngang_con:[...h.querySelectorAll('*')].filter(e=>
          e.scrollWidth>e.clientWidth+2).length});""")


def _mo_hop_chi_tiet(ctx, ma=None):
    """Bấm biểu tượng Xem chi tiết của một dòng rồi trả nội dung hộp. -> (dict, mã dòng)|(None, …).

    `ma=None` thì lấy DÒNG ĐẦU của bảng (case chỉ-đọc). Có `ma` thì tìm đúng bản ghi QA ấy —
    case nào đụng tới dữ liệu cụ thể phải mở đúng bản ghi của mình, không mượn dòng đầu.
    """
    nhan = _nhan_icon_xem(ctx)
    # Ghi tên hộp app tự mở TRƯỚC cú bấm: hộp của ta là hộp MỚI XUẤT HIỆN, không phải hộp
    # cuối cùng trong DOM. Thiếu bước này thì `HOP()` trỏ vào hộp "Hướng dẫn sử dụng" và cả
    # hàm đọc lẫn hàm đóng bên dưới làm việc với nhầm hộp.
    ui.nho_hop_app(ctx.c)
    if ma:
        r = ui.bam_trong_dong(ctx.c, ma, nhan)
    else:
        # Tìm icon · lấy toạ độ · bấm trong MỘT lượt gọi. Bản trước dán mốc `data-qa-moc` rồi
        # bấm theo mốc ở lượt gọi sau — cùng cuộc đua đã làm hỏng 18 lượt tạo dữ liệu QA.
        r = ui._js(ctx.c, """
          const tr=[...document.querySelectorAll('table tbody tr')].find(x=>{
            const td=[...x.querySelectorAll('td')];
            return td.length>=2 && !td.some(y=>parseInt(y.getAttribute('colspan')||'1',10)>1);});
          if(!tr) return 'null';
          const ds=[...tr.querySelectorAll('button,[role=button],a')].filter(HIEN);
          const t=ds.find(b=>QN((b.getAttribute('title')||'')+' '+(b.getAttribute('aria-label')||'')
              +' '+TXT(b)).includes(QN(%s)))||ds[0];
          if(!t) return 'null';
          t.scrollIntoView({block:'center'}); const q=t.getBoundingClientRect();
          const x=q.left+q.width/2, y=q.top+q.height/2;
          DANH_DAU(t,'icon-xem');
          return JSON.stringify({ok:true, chu:(t.getAttribute('title')||TXT(t)),
            x:Math.round(x), y:Math.round(y),
            trong_khung:(x>=0&&y>=0&&x<=innerWidth&&y<=innerHeight)});"""
                   % ui._s(nhan))
        if r and r.get('ok') and r.get('trong_khung'):
            for kieu, nut, bits in (('mouseMoved', 'none', 0), ('mousePressed', 'left', 1),
                                    ('mouseReleased', 'left', 0)):
                ctx.c.ws.call('Input.dispatchMouseEvent', type=kieu, x=r['x'], y=r['y'],
                              button=nut, buttons=bits, clickCount=1)
        elif r and r.get('ok'):
            ui.bam_thuc(ctx.c, "THEO_MOC('icon-xem')")
    # Chờ ĐÚNG hộp của ta, không chờ "có hộp nào đó": hộp app đã có sẵn từ đầu nên phép chờ
    # rộng trả về ngay lập tức kể cả khi hộp Chi tiết chưa kịp mở.
    ui.cho_hop_cua_ta(ctx.c, 8.0)
    time.sleep(0.6)
    return _doc_hop_chi_tiet(ctx.c), (r or {})


def _dong_hop_chi_tiet(ctx, bang_nen=False):
    """Đóng hộp chi tiết. `bang_nen=True` thì bấm vùng nền mờ thay vì dấu X. -> bool đã đóng."""
    if bang_nen:
        ok = ui._js(ctx.c, """
          const h=HOP(); if(!h) return 'null';
          const nen=[...document.querySelectorAll('[data-radix-dialog-overlay],'
            +'[class*=overlay i],[class*=backdrop i],[class*=nen-mo i]')].filter(HIEN)[0];
          if(!nen) return JSON.stringify({co_nen:false});
          DANH_DAU(nen,'nen-mo'); return JSON.stringify({co_nen:true});""")
        if ok and ok.get('co_nen'):
            ui.bam_thuc(ctx.c, "THEO_MOC('nen-mo')")
            time.sleep(0.8)
            # Hỏi về ĐÚNG hộp của ta. Câu rộng `co_hop_thoai()` luôn trả lời CÓ vì hộp app
            # tự mở chưa bao giờ đóng ⇒ hàm này báo "không đóng được" cho một hộp đã đóng.
            if not ui.hop_cua_ta_con_mo(ctx.c):
                ui.quen_hop_cua_ta(ctx.c)
                return True
    for chu in ('Đóng', 'Close', '×', 'Hủy', 'Huỷ', 'Hủy bỏ'):
        if ui.co_nut(ctx.c, chu, 'hop'):
            ui.bam(ctx.c, chu, 'hop', cho=0.8)
            if not ui.hop_cua_ta_con_mo(ctx.c):
                ui.quen_hop_cua_ta(ctx.c)
                return True
    ui.go_phim(ctx.c, 'Escape')
    time.sleep(0.6)
    if ui.hop_cua_ta_con_mo(ctx.c):
        return False
    ui.quen_hop_cua_ta(ctx.c)
    return True


def _la_case_chi_tiet(cs):
    nhom = _n(_nhom(cs))
    return ('chi tiet' in nhom and _bat_ky(_n(cs.b), 'hien thi chi tiet', 'chi tiet',
                                           'xem & dong', 'xem va dong'))


@phep('xem_chi_tiet_modal', loai='UI')
@nhan_dien(lambda cs: (_la_case_chi_tiet(cs)
                       and _bat_ky(_n(cs.b), 'khi co truong khong co du lieu',
                                   'khi tat ca cac truong deu co du lieu',
                                   'khi du lieu qua dai',
                                   'khop du lieu trong he thong')))
def p_xem_chi_tiet(case, ctx):
    """Mở hộp thoại Chi tiết bằng THAO TÁC THẬT rồi đối chiếu đúng nhánh mà case hỏi.

    Bốn nhánh, mỗi nhánh một kỳ vọng lấy từ cột D / hồ sơ màn — không nhánh nào tự đặt
    tiêu chuẩn:

      · *trường không có dữ liệu*  -> ô rỗng phải hiện đúng ký tự `gia_tri_rong` của hồ sơ màn
      · *mọi trường có dữ liệu*    -> đủ các nhãn khai ở `xem_chi_tiet.nhan_truong`
      · *dữ liệu quá dài*          -> khung không tràn ngang, chiều cao ≤ ngưỡng cột D nêu
      · *khớp dữ liệu hệ thống*    -> từng dòng khớp đúng ô tương ứng trên bảng danh sách
    """
    kho = _kho_chi_tiet(ctx)
    nb = _n(case.b)
    ma = None
    if ctx.cho_phep_ghi and 'khop du lieu trong he thong' not in nb:
        try:
            ma = ctx.ban_ghi(case)['ma']
            ctx.hien_ban_ghi_qa(ma)
        except Exception:
            ma = None
    dong_bang = ui.doc_dong(ctx.c, ma) if ma else (ui.doc_bang(ctx.c) or [None])[0]
    hop, bam = _mo_hop_chi_tiet(ctx, ma)
    try:
        if not hop:
            return 'F', ('Bấm biểu tượng "%s" trên một bản ghi: hộp thoại chi tiết KHÔNG mở ra.'
                         % _nhan_icon_xem(ctx)), {'bam': bam, 'ban_ghi': ma,
                                                  'muc_bang_chung': 'UI'}
        du = {'ban_ghi': ma, 'tieu_de_hop': hop.get('tieu_de'), 'so_dong_thong_tin':
              len(hop.get('cap') or []), 'rong': hop.get('rong'), 'cao': hop.get('cao'),
              'ti_le_cao_%': hop.get('ti_le_cao'), 'muc_bang_chung': 'UI'}
        cap = {_n(x['nhan']): (x.get('gia_tri') or '').strip() for x in (hop.get('cap') or [])}
        # ── nhánh ①: trường rỗng hiện đúng ký tự quy ước ─────────────────────────
        if 'khong co du lieu' in nb:
            rong = str(kho.get('gia_tri_rong') or '').strip()
            if not rong:
                return None                     # hồ sơ màn chưa khai -> không tự đặt ký tự
            trong = [k for k, v in cap.items() if not v]
            du.update({'ky_tu_rong_khai': rong, 'o_trong_hoan_toan': trong[:8],
                       'gia_tri_doc_duoc': dict(list(cap.items())[:20])})
            if trong:
                return 'F', ('Hộp "%s": %d dòng để TRỐNG hẳn thay vì hiện ký tự %r như cột D '
                             'yêu cầu (%s).'
                             % (hop.get('tieu_de'), len(trong), rong,
                                ' · '.join(trong[:4]))), du
            co_dau = [k for k, v in cap.items() if v == rong]
            if not co_dau:
                return None                     # không có trường nào rỗng -> ca chưa dựng được
            return 'P', ('Hộp "%s": %d dòng chưa có dữ liệu đều hiện ký tự %r đúng quy ước '
                         '(%s).' % (hop.get('tieu_de'), len(co_dau), rong,
                                    ' · '.join(co_dau[:4]))), du
        # ── nhánh ②: đủ nhãn trường ──────────────────────────────────────────────
        if 'tat ca cac truong deu co du lieu' in nb:
            mong = [str(x) for x in (kho.get('nhan_truong') or [])]
            if not mong:
                return None
            co = set(cap) | {_n(x) for x in (hop.get('nhan') or [])}
            thieu = [x for x in mong if _n(x) not in co]
            du.update({'nhan_mong_doi': mong, 'nhan_thieu': thieu})
            if thieu:
                return 'F', ('Hộp "%s" THIẾU %d/%d dòng thông tin hồ sơ màn khai: %s.'
                             % (hop.get('tieu_de'), len(thieu), len(mong),
                                ' · '.join(thieu[:6]))), du
            return 'P', ('Hộp "%s" hiện đủ %d dòng thông tin đúng bản khai của hồ sơ màn.'
                         % (hop.get('tieu_de'), len(mong))), du
        # ── nhánh ③: dữ liệu quá dài -> đo HÌNH HỌC ──────────────────────────────
        if 'du lieu qua dai' in nb:
            m = re.search(r'(\d{1,3})\s*%\s*chi[eề]u cao', case.d or '', re.I)
            nguong = int(m.group(1)) if m else None
            du.update({'so_o_tran_ngang': hop.get('so_tran_ngang'),
                       'cuon_doc_duoc': hop.get('cuon_doc'),
                       'so_khoi_cuon_ngang': hop.get('cuon_ngang_con'),
                       'nguong_cao_cot_D_%': nguong})
            loi = []
            if hop.get('so_tran_ngang'):
                loi.append('%d phần tử tràn ra ngoài khung hộp' % hop['so_tran_ngang'])
            if nguong is not None and (hop.get('ti_le_cao') or 0) > nguong:
                loi.append('hộp cao %d%% chiều cao màn hình, vượt ngưỡng %d%% cột D nêu'
                           % (hop['ti_le_cao'], nguong))
            if loi:
                return 'F', ('Hộp "%s" với dữ liệu dài: %s.'
                             % (hop.get('tieu_de'), ' · '.join(loi))), du
            return 'P', ('Hộp "%s" với dữ liệu dài: không phần tử nào tràn ngang, hộp cao '
                         '%d%% chiều cao màn hình%s, cuộn dọc %s.'
                         % (hop.get('tieu_de'), hop.get('ti_le_cao') or 0,
                            ' (ngưỡng cột D: %d%%)' % nguong if nguong else '',
                            'được' if hop.get('cuon_doc') else 'không cần')), du
        # ── nhánh ④: khớp dữ liệu đang hiện trên danh sách ───────────────────────
        if 'khop du lieu trong he thong' in nb:
            o_bang = (dong_bang or {}).get('o') or {}
            if not o_bang:
                return None
            lech, da_so = [], []
            for cot, gt in o_bang.items():
                gt = (gt or '').strip()
                if not gt or len(gt) > 120 or _bat_ky(_n(cot), 'hanh dong', 'stt', 'chon'):
                    continue
                ung = [v for k, v in cap.items() if k == _n(cot)]
                if not ung:
                    continue
                da_so.append(cot)
                if _n(ung[0]) != _n(gt):
                    lech.append('%s: bảng %r ≠ chi tiết %r' % (cot, gt, ung[0]))
            du.update({'cot_da_so': da_so, 'cot_lech': lech})
            if not da_so:
                return None
            if lech:
                return 'F', ('Hộp chi tiết LỆCH danh sách ở %d/%d cột đối chiếu được: %s.'
                             % (len(lech), len(da_so), ' | '.join(lech[:3]))), du
            return 'P', ('Hộp chi tiết khớp đúng danh sách ở cả %d cột đối chiếu được (%s).'
                         % (len(da_so), ' · '.join(da_so[:6]))), du
        return None
    finally:
        _dong_hop_chi_tiet(ctx)
        ctx.ve_danh_sach()


@phep('xem_chi_tiet_dong', loai='UI')
@nhan_dien(lambda cs: (_la_case_chi_tiet(cs)
                       and _bat_ky(_n(cs.b), 'xem & dong', 'xem va dong', 'dong man chi tiet',
                                   'dong hop thoai chi tiet')))
def p_xem_chi_tiet_dong(case, ctx):
    """Mở chi tiết rồi ĐÓNG — màn phải quay về đúng trang và đúng bộ lọc đang áp.

    Case viết *"ở trang 2, khi đang áp bộ lọc"*. Trạng thái ấy do `tien_dieu_kien` dựng
    trước (đủ bản ghi để có trang 2); ở đây chỉ lật sang trang 2 rồi đo.
    """
    pt0 = ui.doc_phan_trang(ctx.c) or {}
    if ui.nhieu_trang(pt0):
        ui.lat_trang(ctx.c, 2)
        time.sleep(0.8)
    truoc = ui.doc_phan_trang(ctx.c) or {}
    dong_truoc = [r['txt'] for r in (ui.doc_bang(ctx.c) or [])]
    hop, bam = _mo_hop_chi_tiet(ctx)
    if not hop:
        return 'F', ('Bấm "%s" trên một bản ghi: hộp thoại chi tiết KHÔNG mở ra.'
                     % _nhan_icon_xem(ctx)), {'bam': bam, 'muc_bang_chung': 'UI'}
    da_dong = _dong_hop_chi_tiet(ctx, bang_nen=True)
    time.sleep(0.8)
    sau = ui.doc_phan_trang(ctx.c) or {}
    dong_sau = [r['txt'] for r in (ui.doc_bang(ctx.c) or [])]
    du = {'tieu_de_hop': hop.get('tieu_de'), 'trang_truoc': truoc.get('trang_hien'),
          'trang_sau': sau.get('trang_hien'), 'con_hop': ui.co_hop_thoai(ctx.c),
          'giu_nguyen_danh_sach': dong_truoc == dong_sau, 'muc_bang_chung': 'UI'}
    if not da_dong or ui.co_hop_thoai(ctx.c):
        return 'F', 'Đóng hộp chi tiết (dấu X / bấm nền mờ) nhưng hộp thoại VẪN mở.', du
    if truoc.get('trang_hien') and sau.get('trang_hien') != truoc.get('trang_hien'):
        return 'F', ('Đóng hộp chi tiết thì danh sách nhảy từ trang %s về trang %s.'
                     % (truoc.get('trang_hien'), sau.get('trang_hien'))), du
    return 'P', ('Mở rồi đóng hộp "%s": danh sách quay lại đúng trang %s và giữ nguyên %d dòng '
                 'đang hiện.' % (hop.get('tieu_de'), sau.get('trang_hien') or '1',
                                 len(dong_sau))), du


# ══════════════════════════════════════════════════════════════════════════════
# §8. THAO TÁC SONG SONG — HAI TAB
# ══════════════════════════════════════════════════════════════════════════════
def _la_case_song_song(cs):
    return _bat_ky(_n(cs.b), 'cung luc tu 2 client', 'cung luc tu 2 tab', 'tu 2 tab',
                   'tu 2 client', 'cung mot luc tu 2') or (
        _bat_ky(_n(cs.c), '2 tab', '2 may', 'client 1') and
        _bat_ky(_n(cs.b), 'trung', 'cung luc', 'dong thoi'))


def _tab_b(ctx):
    """Tab thứ hai của CÙNG trình duyệt, đã ở đúng màn. -> `TabPhu` hoặc `None`."""
    t = getattr(ctx, '_tab_b', None)
    if t is not None:
        return t
    t = ctx.c.mo_tab_phu(ctx.url)
    if t is None:
        return None
    try:
        t.wait("document.querySelectorAll('table th').length?1:0", 25)
        time.sleep(1.0)
    except Exception:
        pass
    ctx._tab_b = t
    return t


@phep('song_song_hai_tab', can_ghi=True, loai='MULTI_SESSION')
@nhan_dien(lambda cs: _la_case_song_song(cs))
def p_song_song(case, ctx):
    """Hai tab cùng thao tác lên CÙNG một bản ghi QA -> đo phản hồi của cả hai.

    Vì sao TAB chứ không phải máy thứ hai: bộ case viết *"từ 2 tab (hoặc 2 máy)"*, và tab
    cùng trình duyệt giữ được ba thứ mà tiến trình thứ hai không giữ — cùng phiên đăng nhập,
    **cùng một sổ mạng**, cùng một cổng an toàn (xem `browser_manager.mo_tab_phu`).

    Đích LUÔN là bản ghi QA do chính lượt chạy tạo. Không có nhánh nào chạm bản ghi nghiệp vụ.
    """
    tab = _tab_b(ctx)
    if tab is None:
        return None
    nb = _n(case.b)
    m = ctx.ban_ghi(case, moi=True)
    ma = m['ma']
    ctx.hien_ban_ghi_qa(ma, lam_moi=True)
    tab.go(ctx.url)
    tab.wait("document.querySelectorAll('table th').length?1:0", 25)
    time.sleep(1.0)
    ui.tim_kiem(tab, ma, cho=ctx.hs_so('tim_kiem_debounce_ms'))
    dong_b = ui.doc_dong(tab, ma)
    du = {'ban_ghi_qa': ma, 'tab_b_thay_ban_ghi': bool(dong_b), 'muc_bang_chung': 'UI + 2 TAB'}
    if not dong_b:
        return None                 # tab 2 chưa thấy bản ghi -> chưa dựng được ca tranh chấp
    if _bat_ky(nb, 'xoa trung', 'xoa cung luc', 'khi xoa trung du lieu'):
        return _song_song_xoa(case, ctx, tab, ma, du)
    if _bat_ky(nb, 'chuyen trang thai cung mot ban ghi', 'chuyen trang thai cung luc'):
        return _song_song_trang_thai(case, ctx, tab, ma, du)
    if _bat_ky(nb, 'nhap trung cung luc', 'sua trung cung luc'):
        return _song_song_tao_trung(case, ctx, tab, ma, du)
    return None


def _song_song_xoa(case, ctx, tab, ma, du):
    """Tab A xoá bản ghi QA -> tab B xoá lại CHÍNH bản ghi ấy -> phải thất bại, có thông báo."""
    from phep_live import _nut_xoa_trong
    kh = ctx.vb('xoa_don_le') or {}
    nut_xoa = _nut_xoa_trong(kh)
    # Tab B mở sẵn hộp xác nhận TRƯỚC (đúng kịch bản cột C: cả hai cùng mở rồi mới bấm)
    ui.bam_trong_dong(tab, ma, _nhan_icon_xoa(ctx))
    time.sleep(1.0)
    co_hop_b = ui.co_hop_thoai(tab)
    # Tab A xoá thật
    ui.bam_trong_dong(ctx.c, ma, _nhan_icon_xoa(ctx))
    time.sleep(0.9)
    with ctx.ghi(case, 'xoa', ma, mo_ta='tab A xoá bản ghi QA (ca tranh chấp)') as cs:
        ui.bam_ghi(ctx.c, nut_xoa, cs.giay_phep, 'hop', cho=2.0, thuc=True)
    time.sleep(1.2)
    tb_a = ui.doc_thong_bao(ctx.c)
    # Tab B bấm Xoá lên bản ghi đã biến mất
    du.update({'co_hop_xac_nhan_o_tab_B': co_hop_b, 'thong_bao_tab_A': tb_a[:2]})
    if not co_hop_b:
        return None
    # ⚠️ THỨ TỰ quan trọng (vá 18/09). Bản trước ghi nhận xoá vào sổ NGAY sau khi tab A xoá,
    # rồi mới mở cửa sổ ghi cho tab B — và BA hàng rào độc lập đều chặn đúng: `chung_minh`
    # (bản ghi không còn sống), `auto_confirm.mutation` (UNKNOWN_WRITE), `Cong.so_huu` (không
    # thuộc dữ liệu QA còn sống). Cả ba đều đúng, nên lời giải KHÔNG phải nới bypass qua từng
    # tầng — đã thử và phải rút lại — mà là ghi nhận xoá ĐÚNG LÚC: sau khi cả hai tab thao tác
    # xong. Trong suốt thao tác, bản ghi vẫn là bản ghi sống của lượt chạy, đúng như sổ hiểu,
    # nên không hàng rào nào phải nhân nhượng.
    with ctx.ghi(case, 'xoa', ma, mo_ta='tab B xoá lại bản ghi đã bị tab A xoá') as cs:
        ui.bam_ghi(tab, nut_xoa, cs.giay_phep, 'hop', cho=2.0, thuc=True)
    time.sleep(1.4)
    # Giờ mới ghi nhận: tab A đã xoá thật, cả hai tab đã thao tác xong.
    ctx.so.ghi_xoa(ma, case.key, boi_cleanup=False, thanh_cong=True)
    loi_b = ui.doc_loi(tab, 'hop') + ui.doc_thong_bao(tab)
    con_hop_b = ui.co_hop_thoai(tab)
    du.update({'loi_tab_B': loi_b[:3], 'hop_tab_B_con_mo': con_hop_b})
    cau = str((ctx.vb('xoa_don_le') or {}).get('toast_thanh_cong') or '')
    if cau and not any(_n(cau) in _n(x) for x in tb_a):
        du['canh_bao'] = 'tab A không hiện toast thành công nguyên văn'
    if loi_b:
        return 'P', ('Xoá cùng lúc từ 2 tab lên bản ghi %s: tab 1 xoá thành công%s; tab 2 KHÔNG '
                     'xoá được và hộp xác nhận báo %r%s.'
                     % (ma, ' (toast %r)' % tb_a[0][:40] if tb_a else '', loi_b[0][:80],
                        ', hộp không tự đóng' if con_hop_b else ', nhưng hộp đã tự đóng')), du
    return 'F', ('Xoá cùng lúc từ 2 tab lên bản ghi %s: tab 2 bấm Xoá lên bản ghi ĐÃ BỊ XOÁ mà '
                 'KHÔNG có thông báo lỗi nào (hộp %s).'
                 % (ma, 'vẫn mở' if con_hop_b else 'tự đóng như một lần xoá thành công')), du


def _nhan_icon_xoa(ctx):
    for x in (ctx.vb('icon_ban_ghi') or []):
        if qalib.chua_tu(str(x), 'xoa'):
            return str(x)
    return 'Xóa'


def _song_song_trang_thai(case, ctx, tab, ma, du):
    """Hai tab cùng đổi trạng thái một bản ghi -> tab sau phải nhận thông báo thất bại."""
    icon = _icon_chuyen_tt(ctx, ctx.c, ma)
    if not icon:
        return None
    with ctx.ghi(case, 'sua', ma, mo_ta='tab A đổi trạng thái bản ghi QA') as cs:
        ui.bam_ghi(ctx.c, icon, cs.giay_phep, 'man', cho=2.0, thuc=False)
    time.sleep(1.6)
    tb_a = ui.doc_thong_bao(ctx.c)
    with ctx.ghi(case, 'sua', ma, mo_ta='tab B đổi trạng thái CÙNG bản ghi') as cs:
        r = ui.bam_trong_dong(tab, ma, icon)
        du['bam_tab_B'] = r
    time.sleep(1.6)
    tb_b = ui.doc_thong_bao(tab) + ui.doc_loi(tab, 'man')
    du.update({'thong_bao_tab_A': tb_a[:2], 'thong_bao_tab_B': tb_b[:3]})
    that_bai = str((ctx.vb('kich_hoat') or {}).get('toast_that_bai')
                   or (ctx.vb('ngung_hoat_dong') or {}).get('toast_that_bai') or '')
    if not tb_a:
        return None
    if that_bai and any(_n(that_bai) in _n(x) for x in tb_b):
        return 'P', ('Đổi trạng thái cùng lúc từ 2 tab lên bản ghi %s: tab 1 đổi được (%r), '
                     'tab 2 nhận đúng thông báo thất bại %r.'
                     % (ma, tb_a[0][:50], that_bai)), du
    if tb_b:
        return 'F', ('Đổi trạng thái cùng lúc từ 2 tab lên bản ghi %s: tab 2 hiện %r — không '
                     'đúng bản verbatim %r mà hồ sơ màn khai.'
                     % (ma, tb_b[0][:60], that_bai or '(chưa khai)')), du
    return 'F', ('Đổi trạng thái cùng lúc từ 2 tab lên bản ghi %s: tab 1 đổi được nhưng tab 2 '
                 'KHÔNG nhận được thông báo nào.' % ma), du


def _icon_chuyen_tt(ctx, c, ma):
    for x in (ctx.vb('icon_ban_ghi') or []):
        if qalib.chua_tu(str(x), 'kich hoat', 'ngung hoat dong'):
            if ui._js(c, "const t=%s; return JSON.stringify(!!t);"
                      % _js_icon_dong(ma, str(x))):
                return str(x)
    return None


def _js_icon_dong(ma, nhan):
    return ("(()=>{const tr=[...document.querySelectorAll('table tbody tr')]"
            ".find(r=>QN(TXT(r)).includes(QN(%s))); if(!tr) return null;"
            "return [...tr.querySelectorAll('button,[role=button],a')].find(b=>"
            "QN((b.getAttribute('title')||'')+' '+(b.getAttribute('aria-label')||'')+' '+TXT(b))"
            ".includes(QN(%s)))||null;})()" % (ui._s(ma), ui._s(nhan)))


def _song_song_tao_trung(case, ctx, tab, ma, du):
    """Hai tab cùng tạo/sửa về CÙNG một mã -> chỉ một bên được, bên kia nhận lỗi trùng."""
    ma2, ten2 = ctx.so.cap_ma()
    ctx.so.khai_tao(ma2, ten2, case.key, 'bản ghi QA cho ca tạo trùng 2 tab')
    hop_a = ui.mo_hop(ctx.c, ctx.nut_them())
    if not hop_a:
        return None
    ctx.dien_form(ma=ma2, ten=ten2)
    hop_b = ui.mo_hop(tab, ctx.nut_them())
    if hop_b:
        _dien_tab_b(ctx, tab, ma2, ten2)
    with ctx.ghi(case, 'tao', ma2, mo_ta='tab A tạo bản ghi QA (ca trùng mã)') as cs:
        ui.bam_ghi(ctx.c, ctx.nut_luu_them(), cs.giay_phep, 'hop', cho=2.2)
    time.sleep(1.2)
    ctx.so.xac_nhan_tao(ma2, co_tren_app=bool(ctx.hien_ban_ghi_qa(ma2)))
    tb_a = ui.doc_thong_bao(ctx.c)
    du.update({'ban_ghi_trung': ma2, 'thong_bao_tab_A': tb_a[:2], 'tab_B_mo_form': bool(hop_b)})
    if not hop_b:
        return None
    with ctx.ghi(case, 'tao', ma2, mo_ta='tab B tạo TRÙNG mã của tab A') as cs:
        ui.bam_ghi(tab, ctx.nut_luu_them(), cs.giay_phep, 'hop', cho=2.2)
    time.sleep(1.4)
    loi_b = ui.doc_loi(tab, 'hop') + ui.doc_thong_bao(tab)
    con_hop_b = ui.co_hop_thoai(tab)
    du.update({'loi_tab_B': loi_b[:3], 'hop_tab_B_con_mo': con_hop_b})
    if ui.co_hop_thoai(tab):
        ui.dong_hop(tab)
    if ui.co_hop_thoai(ctx.c):
        ui.dong_hop(ctx.c)
    ctx.ve_danh_sach(lam_moi=True)
    if loi_b:
        return 'P', ('Hai tab cùng tạo mã %r: tab 1 tạo được%s, tab 2 bị chặn với thông báo '
                     '%r — không sinh ra hai bản ghi trùng mã.'
                     % (ma2, ' (%r)' % tb_a[0][:40] if tb_a else '', loi_b[0][:90])), du
    return 'F', ('Hai tab cùng tạo mã %r: tab 2 KHÔNG nhận thông báo trùng nào (hộp %s) — '
                 'không chứng minh được hệ thống chặn tạo trùng.'
                 % (ma2, 'vẫn mở' if con_hop_b else 'đã đóng như một lần tạo thành công')), du


def _dien_tab_b(ctx, tab, ma, ten):
    if ctx.o_ma():
        ui.dien(tab, ctx.o_ma(), ma, 'hop')
    if ctx.o_ten():
        ui.dien(tab, ctx.o_ten(), ten, 'hop')
    for nhan in ctx.o_bat_buoc():
        if ctx.o_ma() and _n(nhan) == _n(ctx.o_ma()):
            continue
        if ctx.o_ten() and _n(nhan) == _n(ctx.o_ten()):
            continue
        o = ui.doc_o(tab, nhan, 'hop') or {}
        if str(o.get('the') or '').startswith('select') or ctx._la_o_chon(nhan):
            ui.chon_dau_tien(tab, nhan, 'hop')
        else:
            ui.dien(tab, nhan, qalib.gia_tri_qa_cho_o(nhan, o, ma, ten), 'hop')


def dong_tab_b(ctx):
    """Đóng tab thứ hai ở cuối lượt chạy — gọi từ `chay_live` cùng chỗ đóng phiên đối chứng."""
    if getattr(ctx, '_tab_b', None) is None:
        return False
    try:
        ctx.c.dong_tab_phu()
    except Exception:
        pass
    ctx._tab_b = None
    return True


# ══════════════════════════════════════════════════════════════════════════════
# §9. HÌNH HỌC — số đo thật, không nhận xét bằng mắt
# ══════════════════════════════════════════════════════════════════════════════
def _do_nut(c, chu, pv='man'):
    """Số đo THẬT của một nút: hộp bao · căn lề chữ · quan hệ với khối chứa nó."""
    return ui._js(c, """
      const b=NUT(%s,%s); if(!b) return 'null';
      b.scrollIntoView({block:'center'});
      const r=b.getBoundingClientRect(); const st=getComputedStyle(b);
      const p=b.parentElement; const pr=p?p.getBoundingClientRect():null;
      /* Khối chữ bên trong nút: dùng Range để lấy hộp bao CỦA CHỮ, không phải của thẻ —
         chữ căn giữa hay không là quan hệ giữa hai hộp ấy, không phải một thuộc tính CSS. */
      let cr=null;
      try{const rg=document.createRange(); rg.selectNodeContents(b);
        const q=rg.getBoundingClientRect(); if(q.width>0) cr=q;}catch(e){}
      return JSON.stringify({chu:TXT(b),
        x:Math.round(r.left), y:Math.round(r.top),
        rong:Math.round(r.width), cao:Math.round(r.height),
        can_le:st.textAlign, justify:st.justifyContent, align:st.alignItems,
        dem_trai:st.paddingLeft, dem_phai:st.paddingRight,
        khoi_chua:pr?{x:Math.round(pr.left), rong:Math.round(pr.width)}:null,
        chu_x:cr?Math.round(cr.left):null, chu_rong:cr?Math.round(cr.width):null,
        lech_trai:cr?Math.round(cr.left-r.left):null,
        lech_phai:cr?Math.round(r.right-cr.right):null});""" % (ui._s(chu), ui._s(pv)))


_JS_DO_ICON_DONG = """
  /* Nút CHỈ CÓ ICON ở cột Hành động: hộp bao nút · hộp bao icon · nhãn trợ năng · tooltip.
     Không có chữ trong nút thì "text trong button căn lề giữa" phải hiểu là ICON căn giữa
     trong nút, còn phần "đúng chính tả" nằm ở nhãn trợ năng / tooltip. Đo cả hai. */
  const nhan=%s, ma=%s;
  const dong=[...document.querySelectorAll('tr')].find(t=>TXT(t).includes(ma));
  if(!dong) return JSON.stringify({loi:'không thấy dòng '+ma});
  const nut=[...dong.querySelectorAll('button,[role=button],a')].filter(HIEN).find(b=>{
    const t=(b.getAttribute('title')||b.getAttribute('aria-label')||TXT(b)||'');
    return QN(t)===QN(nhan)||QN(t).includes(QN(nhan));});
  if(!nut) return JSON.stringify({loi:'dòng không có nút '+nhan,
    co:[...dong.querySelectorAll('button,[role=button],a')].filter(HIEN)
        .map(b=>b.getAttribute('title')||b.getAttribute('aria-label')||TXT(b)||'(không nhãn)')});
  nut.scrollIntoView({block:'center'});
  const r=nut.getBoundingClientRect();
  const ve=nut.querySelector('svg,img,i,[class*=icon]');
  const ir=ve?ve.getBoundingClientRect():null;
  let cr=null;
  try{const rg=document.createRange(); rg.selectNodeContents(nut);
      const q=rg.getBoundingClientRect(); if(q.width>0) cr=q;}catch(e){}
  return JSON.stringify({
    nhan_tro_nang:(nut.getAttribute('aria-label')||'').trim(),
    title:(nut.getAttribute('title')||'').trim(), chu_trong_nut:TXT(nut),
    x:Math.round(r.left), y:Math.round(r.top),
    rong:Math.round(r.width), cao:Math.round(r.height),
    co_icon:!!ve, the_icon:ve?ve.tagName.toLowerCase():null,
    icon_lech_trai:ir?Math.round(ir.left-r.left):null,
    icon_lech_phai:ir?Math.round(r.right-ir.right):null,
    icon_lech_tren:ir?Math.round(ir.top-r.top):null,
    icon_lech_duoi:ir?Math.round(r.bottom-ir.bottom):null,
    chu_lech_trai:cr?Math.round(cr.left-r.left):null,
    chu_lech_phai:cr?Math.round(r.right-cr.right):null});"""


def _do_icon_dong(c, nhan, ma):
    """Số đo nút chỉ-có-icon trên MỘT dòng. -> dict, luôn có `loi` khi không đo được."""
    kq = ui._js(c, _JS_DO_ICON_DONG % (ui._s(nhan), ui._s(ma)))
    return kq if isinstance(kq, dict) else {'loi': 'không đọc được số đo'}


_JS_TIM_ICON_DONG = ("[...document.querySelectorAll('tr')]"
                     ".filter(t=>TXT(t).includes(%s))"
                     ".flatMap(t=>[...t.querySelectorAll('button,[role=button],a')])"
                     ".filter(HIEN).find(b=>{const t=(b.getAttribute('title')||"
                     "b.getAttribute('aria-label')||TXT(b)||'');"
                     "return QN(t)===QN(%s)||QN(t).includes(QN(%s));})")


def _js_tim_icon(nhan, ma):
    """Đoạn JS trả về đúng nút icon `nhan` trên dòng mang mã `ma`."""
    return _JS_TIM_ICON_DONG % (ui._s(ma), ui._s(nhan), ui._s(nhan))


def _hien_thanh_hang_loat(ctx):
    """Tích một dòng để thanh thao tác hàng loạt hiện ra. -> mã dòng đã tích, hoặc `None`.

    Ba case *"căn lề, chính tả của button"* (Bỏ chọn · Xóa tất cả) trước nay về CHƯA ĐO vì
    nút chỉ xuất hiện SAU khi có bản ghi được tích — phép đo tìm nút trên màn mặc định thì
    không bao giờ thấy. Đây là tiền điều kiện của case, và cột C nói thẳng ra nó.
    """
    bang = ui.doc_bang(ctx.c) or []
    for r in bang:
        ma = (r.get('o') or {}).get('Code') or (r.get('o') or {}).get('code')
        ma = (ma or '').strip()
        if not ma:
            continue
        kq = ui.tich_dong(ctx.c, ma)
        if kq and kq.get('ok'):
            time.sleep(0.6)
            return ma
    return None


def _quet_dong_co_icon(ctx, ten):
    """Quét TRANG HIỆN TẠI tìm dòng đang hiện nút icon `ten`. -> mã dòng | None."""
    for r in (ui.doc_bang(ctx.c) or []):
        o = r.get('o') or {}
        ma = str(o.get('Code') or o.get('code') or o.get('Mã') or '').strip()
        if not ma:
            continue
        if not (_do_icon_dong(ctx.c, ten, ma) or {}).get('loi'):
            return ma
    return None


def _dong_co_icon(ctx, ten):
    """Mã của một dòng ĐANG hiện nút icon `ten`. -> str | None. Thao tác CHỈ ĐỌC.

    Cột C bảo *"tìm một bản ghi …"* chứ không bảo tạo. Dòng có sẵn thì dùng dòng có sẵn: đo
    hình học và rê chuột đều không đổi dữ liệu, nên không phải dựng gì và không cần quyền ghi.

    Mã dòng lấy qua `ui.doc_bang` — bộ đọc bảng đã biết cột nào là Code. Tự bốc `<td>` đầu
    tiên là sai ở mọi màn có ô tích chọn ở cột đầu (ô ấy không có chữ).

    ⚠️ VÁ 18/09 lượt 4. Quét mỗi TRANG HIỆN TẠI là không đủ, và chỗ này hỏng đúng lúc cần
    nhất: giữa một lượt chạy, màn đã có hàng chục bản ghi QA (đều `Chờ kết nối`) chiếm trọn
    trang 1, còn bản ghi nghiệp vụ đang Hoạt động — thứ duy nhất hiện nút `Ngừng hoạt động` —
    nằm ở trang 2, 3. Đo trên app thật 21/09: 15 bản ghi thật có 7 dòng mang nút ấy, mà lượt
    chạy vẫn báo *"không thấy"* rồi đi dựng dữ liệu. Nên sau khi quét trang hiện tại thì LỌC
    theo đúng trạng thái làm nút hiện ra, dùng chính bộ lọc của màn.
    """
    ma = _quet_dong_co_icon(ctx, ten)
    if ma:
        return ma
    # Điều kiện hiện nút khai ở hồ sơ màn (*"Ngừng hoạt động hiện khi trạng thái Hoạt
    # động…"*); lấy trạng thái từ chính câu khai ấy, không tự nghĩ ra.
    tt = _trang_thai_lam_hien(ctx, ten)
    if not tt:
        return None
    o_loc = ctx.o_loc_trang_thai() if hasattr(ctx, 'o_loc_trang_thai') else 'trạng thái'
    try:
        kq = ui.dat_o_chon(ctx.c, o_loc, tt, 'loc',
                           tuy_chon=[str(x) for x in (ctx.vb('tuy_chon_loc_trang_thai') or [])])
        if not (kq or {}).get('ok'):
            return None
        time.sleep(1.2)
        return _quet_dong_co_icon(ctx, ten)
    except Exception:
        return None


def _trang_thai_lam_hien(ctx, ten):
    """Trạng thái mà hồ sơ màn khai là làm nút `ten` hiện ra. -> str | None.

    Đọc từ `dieu_kien_hien_icon` (*"Ngừng hoạt động hiện khi trạng thái Hoạt động VÀ không
    được sử dụng"*) rồi đối chiếu với danh sách tuỳ chọn của ô lọc — không đoán tên trạng thái.
    """
    dk = str(ctx.vb('dieu_kien_hien_icon') or '')
    tuy = [str(x) for x in (ctx.vb('tuy_chon_loc_trang_thai') or [])]
    for menh in dk.split('·'):
        if not qalib.chua_tu(menh, _n(ten)) and _n(ten) not in _n(menh):
            continue
        sau = menh.split('trạng thái', 1)[-1] if 'trạng thái' in menh else menh
        # Mệnh đề phủ định (*"KHÁC Hoạt động"*) không cho ta một trạng thái cụ thể nào.
        if qalib.chua_tu(sau, 'khac'):
            return None
        for t in tuy:
            if _n(t) in _n(sau):
                return t
    return None


def _hinh_hoc_icon_dong(case, ctx, ten, do_nut=None):
    """Nút CHỈ-CÓ-ICON trên một dòng: đo icon căn giữa trong nút + chính tả ở chú thích.

    Cột D đòi hai điều — *"đúng chính tả"* và *"text trong button được căn lề giữa"*. Nút
    không có chữ nào bên trong, nên:

      · **căn lề** đo trên ICON: lệch trái ≈ lệch phải và lệch trên ≈ lệch dưới trong hộp nút;
      · **chính tả** đọc ở CHÚ THÍCH hiện khi rê chuột (thứ người dùng thật sự đọc), đối
        chiếu với bản verbatim của hồ sơ màn.

    Không suy ra kết luận từ việc không tìm thấy: không dựng được dòng đúng trạng thái thì
    `bo_qua` kèm dữ kiện, chứ không chấm.
    """
    from phep_live import bo_qua
    # ① Đo trên một dòng CÓ SẴN trước. Đo hình học + rê chuột đọc chú thích là thao tác
    #    CHỈ ĐỌC, không đụng gì tới bản ghi, nên không cần dựng dữ liệu và không cần quyền
    #    ghi. Cột C cũng nói đúng vậy: *"TÌM một bản ghi Hoạt động…"*.
    # Bảng phải SẠCH LỌC trước khi tìm: bằng chứng lượt 3 cho thấy màn còn nguyên bộ lọc của
    # case trước (*"1 dòng · tổng 1 · lọc 1"*), và tìm một dòng đúng trạng thái trên một bảng
    # đang bị lọc còn một dòng thì hầu như chắc chắn không thấy — rồi phép đo đi dựng dữ liệu
    # mà lẽ ra không cần dựng.
    ctx.ve_danh_sach(lam_moi=True)
    ma = _dong_co_icon(ctx, ten)
    du_tim = {'nguon_dong': 'bản ghi có sẵn trên bảng' if ma else None}
    if not ma:
        # ② Không dòng nào đang ở trạng thái làm icon hiện ra thì mới dựng. Bước này CÓ GHI,
        #    và `hinh_hoc_nut` khai `can_ghi=False` (nhánh nút-có-chữ không ghi gì), nên phải
        #    tự hỏi — không được lặng lẽ ghi trong một lượt chỉ-đọc và làm con số đếm trước
        #    của `--dry-run` sai đi.
        if not ctx.cho_phep_ghi:
            return bo_qua(ctx, 'không dòng nào trên bảng đang hiện nút %r, mà lượt chạy này '
                               'không cho ghi nên không dựng được bản ghi QA' % ten,
                          nut=ten, can_ghi_moi_do_duoc=True)
        m = ctx.tao_ban_ghi(case)
        if not m:
            return bo_qua(ctx, 'không tạo được bản ghi QA để đo icon trên dòng', nut=ten)
        ma = m['ma']
        du_tim['nguon_dong'] = 'bản ghi QA %s do lượt chạy tự tạo' % ma
        ctx.ve_danh_sach(lam_moi=True)
        ctx.hien_ban_ghi_qa(ma)
    d = _do_icon_dong(ctx.c, ten, ma)
    if d.get('loi'):
        # Icon "Ngừng hoạt động" chỉ hiện khi bản ghi ĐANG Hoạt động — hồ sơ màn khai vậy.
        nut_kich = _nhan_kich_hoat(ctx)
        if nut_kich:
            try:
                with ctx.ghi(case, 'sua', ma, so_toi_da=1,
                             mo_ta='kích hoạt bản ghi QA để icon %s hiện' % ten) as cs:
                    ui.bam_trong_dong(ctx.c, ma, nut_kich,
                                      giay_phep=cs.giay_phep, bat_buoc_phep=True)
                    time.sleep(1.2)
                    if ui.hop_cua_ta_con_mo(ctx.c):
                        ui.bam_ghi(ctx.c, _nut_xac_nhan(ctx), cs.giay_phep, 'hop', cho=1.6)
            except Exception as e:
                return bo_qua(ctx, 'không kích hoạt được bản ghi QA: %s' % str(e)[:120],
                              nut=ten, ban_ghi=ma, do_icon=d)
            ctx.ve_danh_sach(lam_moi=True)
            ctx.hien_ban_ghi_qa(ma)
            d = _do_icon_dong(ctx.c, ten, ma)
    if d.get('loi'):
        return bo_qua(ctx, 'không thấy nút %r trên dòng bản ghi QA: %s'
                           % (ten, d['loi']), nut=ten, ban_ghi=ma, **d)
    tt = ui.tooltip_cua(ctx.c, _js_tim_icon(ten, ma), cho=2.5) or {}
    chu_tt = (tt.get('txt') or '').strip()
    kho = _moi_verbatim(ctx)
    khop = bool([x for x in kho if _n(x) == _n(chu_tt)]) if chu_tt else False
    # Icon có HAI hình hài, và phép đo phải nhận cả hai — đây là chỗ bản trước bỏ cuộc:
    #   · phần tử con (`<svg>`/`<img>`/`<i>`) — app thật dựng bằng lucide/heroicons;
    #   · KÝ TỰ HÌNH (`⏹`) nằm thẳng trong nút — không có phần tử con nào để đo.
    # Với ký tự hình thì thứ đo được là HỘP BAO CHỮ của chính nó (`Range`), và đó vẫn là một
    # số đo hình học thật, không phải suy diễn. Bản trước chỉ biết hình hài thứ nhất nên trả
    # *"nút không chứa phần tử icon nào"* rồi bỏ cuộc — đúng số đo `the_icon: null` đọc được.
    theo_ky_tu = d.get('icon_lech_trai') is None
    if theo_ky_tu:
        lt, lp = d.get('chu_lech_trai'), d.get('chu_lech_phai')
        tr = du_ = None
    else:
        lt, lp = d.get('icon_lech_trai'), d.get('icon_lech_phai')
        tr, du_ = d.get('icon_lech_tren'), d.get('icon_lech_duoi')
    du = dict(du_tim)
    du.update({'nut': ten, 'ban_ghi': ma, 'chi_co_icon': True, 'the_icon': d.get('the_icon'),
               'hop_nut': {'x': d['x'], 'y': d['y'], 'rong': d['rong'], 'cao': d['cao']},
               'do_tren': 'ký tự hình trong nút' if theo_ky_tu else 'phần tử icon con',
               'icon_le_ngang': 'trái %spx · phải %spx' % (lt, lp),
               'icon_le_doc': ('không đo được chiều dọc cho ký tự hình'
                               if theo_ky_tu else 'trên %spx · dưới %spx' % (tr, du_)),
               'quan_he_mong_doi': ('lệch trái ≈ lệch phải (icon căn giữa)' if theo_ky_tu else
                                    'lệch trái ≈ lệch phải VÀ lệch trên ≈ lệch dưới'),
               'chu_trong_nut': d.get('chu_trong_nut'), 'nhan_tro_nang': d.get('nhan_tro_nang'),
               'title': d.get('title'), 'chu_tren_chu_thich': chu_tt,
               'loai_chu_thich': tt.get('loai'), 'khop_verbatim': khop,
               'so_chuoi_verbatim': len(kho), 'muc_bang_chung': 'GEOMETRY'})
    if lt is None or lp is None:
        return bo_qua(ctx, 'nút không có phần tử icon lẫn ký tự hình nào để đo hộp bao', **du)
    lech_doc = (tr is not None and du_ is not None and abs(tr - du_) > 2)
    if abs(lt - lp) > 2 or lech_doc:
        return 'F', ('Nút %r ở cột Hành động chỉ có biểu tượng, và biểu tượng KHÔNG căn giữa '
                     'trong nút: lệch trái %spx / phải %spx%s (nút %sx%spx).'
                     % (ten, lt, lp,
                        '' if tr is None else ', lệch trên %spx / dưới %spx' % (tr, du_),
                        d['rong'], d['cao'])), du
    if not chu_tt:
        return 'F', ('Nút %r chỉ có biểu tượng và biểu tượng căn giữa đúng (lệch trái %spx ≈ '
                     'phải %spx), nhưng rê chuột lên KHÔNG hiện chú thích nào — không có chữ '
                     'nào để đối chiếu chính tả.' % (ten, lt, lp)), du
    if kho and not khop:
        return 'F', ('Nút %r: biểu tượng căn giữa đúng nhưng chú thích hiện chữ %r — không '
                     'khớp chuỗi nào trong bản verbatim của hồ sơ màn.' % (ten, chu_tt)), du
    return 'P', ('Nút %r ở cột Hành động: biểu tượng căn giữa trong nút (lệch trái %spx ≈ '
                 'phải %spx%s) và chú thích khi rê chuột hiện đúng nguyên văn %r.'
                 % (ten, lt, lp,
                    '' if tr is None else ', trên %spx ≈ dưới %spx' % (tr, du_),
                    chu_tt)), du


@phep('hinh_hoc_nut', loai='GEOMETRY')
@nhan_dien(lambda cs: (_co(_n(cs.b), 'can le, chinh ta cua button')
                       or _co(_n(cs.b), 'can le chinh ta cua button')))
def p_hinh_hoc_nut(case, ctx):
    """Nút: SỐ ĐO thật của hộp bao chữ so với hộp bao nút -> căn giữa hay không.

    Khác `can_le_chinh_ta_nut` (đọc `text-align` tính toán) ở chỗ: phép này đo **hộp bao của
    chính đoạn chữ** bằng `Range`, nên nó trả lời được cả khi nút dùng flexbox, và nó để lại
    con số trong evidence thay vì một tên thuộc tính CSS. §9 của chỉ thị đòi đúng điều đó:
    *"không dùng nhận xét bằng mắt kiểu trông có vẻ căn giữa"*.

    Nút chỉ hiện sau khi tích một dòng (thanh thao tác hàng loạt) thì tích trước rồi mới đo.
    """
    ten = qalib.field_of(_nhom(case))
    if not ten:
        return None
    da_tich = None
    try:
        kq = _do_nut(ctx.c, ten, 'man')
        if not kq:
            da_tich = _hien_thanh_hang_loat(ctx)
            kq = _do_nut(ctx.c, ten, 'man')
        if not kq:
            # ⚠️ VÁ 18/09 lượt 2. Nút không nằm trên màn vì nó là ICON TRONG DÒNG (cột Hành
            # động) — đúng thứ cột C của r581 tả: *"Rê chuột lên biểu tượng hai vạch dừng ở
            # cột Hành động"*. Bản trước tìm nút theo CHỮ trên màn, không thấy, rồi `return
            # None` ⇒ case nằm CHƯA ĐO. Đo ở đúng chỗ nó ở.
            return _hinh_hoc_icon_dong(case, ctx, ten)
        # ⚠️ VÁ 18/09 lượt 3. Điều kiện cũ (`chu_x is None`) là SAI TÍN HIỆU: ký tự hình
        # (`⏹`) vẫn có hộp bao chữ, nên nút chỉ-có-icon đi thẳng vào nhánh đối chiếu chính tả
        # và ra F cho một nút không hề sai chính tả. `kiem_phep_moi` bắt lại đúng câu ấy ở
        # lượt 2 sau khi tôi đã vá `can_le_chinh_ta_nut` — cùng một lỗi, hai chỗ. Hỏi đúng
        # câu cần hỏi: nút có CHỮ nào không.
        if kq.get('chu_x') is None or not qalib.co_chu(kq.get('chu')):
            return _hinh_hoc_icon_dong(case, ctx, ten, do_nut=kq)
        trai, phai = kq.get('lech_trai'), kq.get('lech_phai')
        du = {'nut': ten, 'chu': kq.get('chu'), 'hop_nut': {'x': kq['x'], 'y': kq['y'],
              'rong': kq['rong'], 'cao': kq['cao']},
              'hop_chu': {'x': kq['chu_x'], 'rong': kq['chu_rong']},
              'le_trai_px': trai, 'le_phai_px': phai,
              'khoi_chua': kq.get('khoi_chua'),
              'quan_he_mong_doi': 'lệch trái ≈ lệch phải (chữ căn giữa nút)',
              'quan_he_do_duoc': 'lệch trái %spx · lệch phải %spx' % (trai, phai),
              'can_le_css': kq.get('can_le'), 'justify_css': kq.get('justify'),
              'da_tich_dong': da_tich, 'muc_bang_chung': 'GEOMETRY'}
        kho = _moi_verbatim(ctx)
        chu = (kq.get('chu') or '').strip()
        du['khop_verbatim'] = bool([x for x in kho if _n(x) == _n(chu)])
        # Ngưỡng 2px = sai số làm tròn của trình duyệt, KHÔNG phải một tiêu chuẩn tự đặt:
        # lệch trái và lệch phải của một khối căn giữa chỉ khác nhau do subpixel.
        if abs((trai or 0) - (phai or 0)) > 2:
            return 'F', ('Chữ %r trên nút KHÔNG căn giữa: cách mép trái %spx nhưng cách mép '
                         'phải %spx (nút rộng %spx).'
                         % (chu, trai, phai, kq['rong'])), du
        if kho and not du['khop_verbatim']:
            return 'F', ('Nút hiện chữ %r — căn giữa đúng (lệch trái %spx ≈ lệch phải %spx) '
                         'nhưng không khớp chuỗi nào trong bản verbatim của hồ sơ màn.'
                         % (chu, trai, phai)), du
        return 'P', ('Nút %r: chữ căn giữa (cách mép trái %spx, cách mép phải %spx trong nút '
                     'rộng %spx) và viết đúng nguyên văn bản khai.'
                     % (chu, trai, phai, kq['rong'])), du
    finally:
        # ⚠️ VÁ 18/09. Khối này chỉ DỌN, không được nuốt gì: một ngoại lệ ném ra ở thân phép
        # đo sẽ chạy qua đây rồi biến mất, và bộ dò dòng chỉ ghi được dòng CUỐI của `finally`
        # — đúng lý do r581 nhiều vòng liền không lộ được chỗ hỏng thật.
        try:
            if da_tich:
                ui.tich_dong(ctx.c, da_tich, bo=True)
                time.sleep(0.4)
        except Exception as _e:
            from phep_live import bo_qua
            bo_qua(ctx, 'dọn sau đo hỏng: %s' % str(_e)[:120])


def _moi_verbatim(ctx):
    from phep_live import _moi_verbatim as f
    return f(ctx)


@phep('hinh_hoc_chu_thich', loai='GEOMETRY')
@nhan_dien(lambda cs: (_n(_nhom(cs)) in ('icon', 'bieu tuong')
                       and _bat_ky(_n(cs.b), 'chieu rong va chieu cao cua chu thich',
                                   'can le van ban tren chu thich',
                                   'chu thich an di ngay khi bo chuot')))
def p_hinh_hoc_chu_thich(case, ctx):
    """Khung chú thích: SỐ ĐO thật (rộng · cao · căn lề) hoặc nói rõ nó là chú thích GỐC.

    Ba case của nhóm `Icon` đều rơi về CHƯA ĐO ở lượt 16/09 vì phép cũ đọc một lần sau 1,2
    giây và chỉ tìm `[role=tooltip]`. Nay dùng `ui.tooltip_cua` (dời chuột · poll · nhận cả
    chú thích gốc của trình duyệt), và nhánh "chú thích gốc" ra `PE` có lý do thay vì `F` cho
    một khung không tồn tại trong DOM.
    """
    from phep_live import JS_ICON_DONG_DAU
    nb = _n(case.b)
    tt = ui.tooltip_cua(ctx.c, JS_ICON_DONG_DAU)
    if tt is None:
        return None
    du = {'loai_chu_thich': tt.get('loai'), 'chu': tt.get('txt'),
          'thuoc_tinh_nut': tt.get('thuoc_tinh'), 'muc_bang_chung': 'GEOMETRY'}
    if 'an di ngay khi bo chuot' in nb:
        if tt.get('loai') == 'native':
            ui.thoi_re_chuot(ctx.c)
            return 'PE', ('Biểu tượng dùng CHÚ THÍCH GỐC của trình duyệt (title = %r): việc ẩn '
                          'đi khi bỏ chuột do trình duyệt lo, không quan sát được bằng DOM.'
                          % (tt.get('txt') or '')[:60]), du
        if tt.get('loai') != 'dom':
            return 'F', ('Rê chuột vào biểu tượng: KHÔNG có chú thích nào hiện ra nên không có '
                         'gì để kiểm việc ẩn đi.'), du
        ui.thoi_re_chuot(ctx.c)
        time.sleep(1.0)
        con = ui._js(ctx.c, """
          const t=[...document.querySelectorAll('[role=tooltip],[data-radix-popper-content-wrapper]'
            +',[data-state=delayed-open],[class*=tooltip i]')].filter(HIEN).map(TXT).filter(x=>x);
          return JSON.stringify(t);""") or []
        du['con_hien_sau_khi_bo_chuot'] = con
        if con:
            return 'F', ('Bỏ chuột khỏi biểu tượng nhưng chú thích VẪN hiện: %s.'
                         % ' · '.join(con[:2])), du
        return 'P', ('Rê chuột thì chú thích %r hiện ra, bỏ chuột thì ẩn đi ngay.'
                     % (tt.get('txt') or '')[:50]), du
    if tt.get('loai') == 'native':
        ui.thoi_re_chuot(ctx.c)
        return 'PE', ('Biểu tượng dùng CHÚ THÍCH GỐC của trình duyệt (title = %r): khung do '
                      'trình duyệt vẽ ngoài trang nên kích thước và căn lề KHÔNG đo được bằng '
                      'DOM.' % (tt.get('txt') or '')[:60]), du
    if tt.get('loai') != 'dom':
        ui.thoi_re_chuot(ctx.c)
        return 'F', 'Rê chuột vào biểu tượng: KHÔNG có khung chú thích nào hiện ra.', du
    ui.thoi_re_chuot(ctx.c)
    n_ky_tu = len(tt.get('txt') or '')
    co_chu = float(re.sub(r'[^\d.]', '', tt.get('co_chu') or '14') or 14)
    du.update({'rong_px': tt.get('rong'), 'cao_px': tt.get('cao'),
               'x': tt.get('x'), 'y': tt.get('y'), 'so_ky_tu': n_ky_tu,
               'co_chu_px': co_chu, 'can_le': tt.get('can'),
               'xuong_dong': tt.get('xuong_dong')})
    if 'can le van ban' in nb:
        du['quan_he_mong_doi'] = 'text-align = left|start (cột D: căn lề trái)'
        du['quan_he_do_duoc'] = 'text-align = %s' % tt.get('can')
        if tt.get('can') in ('left', 'start'):
            return 'P', ('Văn bản trong khung chú thích (%spx × %spx) căn lề trái '
                         '(text-align: %s).' % (tt.get('rong'), tt.get('cao'),
                                                tt.get('can'))), du
        return 'F', ('Văn bản trong khung chú thích căn %s, không phải căn lề trái.'
                     % tt.get('can')), du
    # rộng/cao "theo độ dài văn bản": một dòng chữ -> cao ≈ 1 dòng, rộng ≈ số ký tự × cỡ chữ
    cao_mot_dong = tt.get('cao', 0) <= co_chu * 3
    uoc = n_ky_tu * co_chu * 0.62
    du.update({'uoc_rong_theo_chu_px': round(uoc),
               'quan_he_mong_doi': 'rộng ≈ số ký tự × cỡ chữ; cao ≈ 1 dòng',
               'quan_he_do_duoc': 'rộng %spx (ước %dpx) · cao %spx (1 dòng ≈ %dpx)'
                                  % (tt.get('rong'), round(uoc), tt.get('cao'),
                                     round(co_chu * 1.6))})
    if cao_mot_dong and tt.get('rong', 0) <= max(uoc + 60, 120):
        return 'P', ('Khung chú thích %spx × %spx ôm theo độ dài văn bản (%d ký tự, cỡ chữ '
                     '%gpx).' % (tt.get('rong'), tt.get('cao'), n_ky_tu, co_chu)), du
    return 'F', ('Khung chú thích %spx × %spx KHÔNG ôm theo độ dài văn bản (%d ký tự, cỡ chữ '
                 '%gpx — ước lượng rộng %dpx, cao một dòng %dpx).'
                 % (tt.get('rong'), tt.get('cao'), n_ky_tu, co_chu, round(uoc),
                    round(co_chu * 1.6))), du


# ══════════════════════════════════════════════════════════════════════════════
# §10. THAO TÁC LẶP NHANH
# ══════════════════════════════════════════════════════════════════════════════
# §10 cấm tự đặt N khi case có nêu. Case của bộ này viết *"bấm liên tục nhiều lần"* — KHÔNG
# nêu số — nên con số dưới đây là **quy ước của tool**, và mọi evidence đều ghi rõ nguồn của
# nó là quy ước chứ không phải cột C. Ai đọc kết luận biết ngay nó đã bấm mấy lần.
SO_LAN_LAP = int(re.sub(r'\D', '', '4') or 4)
CACH_MS = 90


def _so_lan_cua_case(case):
    """(N, nguồn) — số lần lặp case QUY ĐỊNH; không quy định thì quy ước của tool."""
    m = re.search(r'(\d+)\s*l[aầ]n', _n(case.c) + ' ' + _n(case.b))
    if m and 2 <= int(m.group(1)) <= 50:
        return int(m.group(1)), 'cột C của case'
    return SO_LAN_LAP, 'quy ước của tool (case chỉ ghi "liên tục nhiều lần", không nêu số)'


def _dem_mutation(ctx, truoc):
    """Số request GHI phát sinh kể từ mốc `truoc` — đọc từ CỬA SỔ GHI đang mở."""
    cs = ctx.cong.cua_so_mo
    return len(getattr(cs, 'da_dung', []) or []) - truoc if cs is not None else None


def _la_case_lap_nhanh(cs):
    return _bat_ky(_n(cs.b), 'click lien tuc vao button', 'tab va enter lien tuc vao button',
                   'click lien tuc vao icon', 'tab va enter lien tuc vao icon',
                   'tab va enter lien tuc vao nut')


@phep('lap_nhanh_icon_dong', can_ghi=True, loai='UI')
@nhan_dien(lambda cs: (_la_case_lap_nhanh(cs)
                       and _bat_ky(_n(cs.b), 'click lien tuc')))
def p_lap_nhanh_icon(case, ctx):
    """Bấm liên tục một BIỂU TƯỢNG TRONG DÒNG -> đếm request, đếm lần đổi trạng thái.

    Phép `click_lien_tuc` đã có chỉ bấm được nút trên biểu mẫu (tìm theo chữ). Nhóm case
    *"click liên tục vào button Chuyển trạng thái"* bấm một biểu tượng **nằm trong dòng**,
    không có chữ — nên nó không bao giờ khớp, và 4 case rơi về CHƯA ĐO.
    """
    m = ctx.ban_ghi(case, moi=True)
    ma = m['ma']
    if not ctx.hien_ban_ghi_qa(ma, lam_moi=True):
        return None
    icon = _icon_chuyen_tt(ctx, ctx.c, ma) or _nhan_icon_xoa(ctx)
    js = _js_icon_dong(ma, icon)
    if not ui._js(ctx.c, "return JSON.stringify(!!%s);" % js):
        return None
    n, nguon_n = _so_lan_cua_case(case)
    tt_truoc = _trang_thai_dong(ctx.c, ma)
    with ctx.ghi(case, 'sua', ma, so_toi_da=max(2, n),
                 mo_ta='bấm liên tục %d lần vào biểu tượng %r' % (n, icon)) as cs:
        # `da_dung` nằm ở CỬA SỔ GHI (`cs.cs`), không ở context manager `_CuaGhi`.
        # Viết `cs.da_dung` ném `AttributeError` NGAY TRONG cửa sổ ghi ⇒ case vào lớp
        # `LỖI` (đo 18/09: r563 · r564 · r588 · r589).
        truoc = len(cs.cs.da_dung)
        ui._js(ctx.c, "const t=%s; if(t) DANH_DAU(t,'icon-lap'); return '1';" % js)
        for _ in range(n):
            ui.bam_thuc(ctx.c, "THEO_MOC('icon-lap')")
            time.sleep(CACH_MS / 1000.0)
        time.sleep(2.0)
        so_req = len(cs.cs.da_dung) - truoc
    tt_sau = _trang_thai_dong(ctx.c, ma)
    tb = ui.doc_thong_bao(ctx.c)
    du = {'ban_ghi': ma, 'bieu_tuong': icon, 'so_lan_bam': n, 'nguon_so_lan': nguon_n,
          'cach_nhau_ms': CACH_MS, 'so_request_ghi': so_req,
          'trang_thai_truoc': tt_truoc, 'trang_thai_sau': tt_sau,
          'so_thong_bao': len(tb), 'thong_bao': tb[:3], 'muc_bang_chung': 'UI + SỔ MẠNG'}
    if so_req is None:
        return None
    if so_req <= 1:
        return 'P', ('Bấm %d lần liên tục (cách nhau %dms) vào biểu tượng %r của bản ghi %s: '
                     'hệ thống chỉ gửi %d yêu cầu, trạng thái đổi đúng một lần (%r → %r), %d '
                     'thông báo.'
                     % (n, CACH_MS, icon, ma, so_req, tt_truoc, tt_sau, len(tb))), du
    return 'F', ('Bấm %d lần liên tục vào biểu tượng %r của bản ghi %s: hệ thống gửi %d yêu '
                 'cầu ghi (đáng lẽ 1) — biểu tượng không bị khoá sau lần bấm đầu.'
                 % (n, icon, ma, so_req)), du


def _trang_thai_dong(c, ma):
    d = ui.doc_dong(c, ma) or {}
    for k, v in (d.get('o') or {}).items():
        if qalib.chua_tu(k, 'trang thai', 'status'):
            return (v or '').strip()
    return None


@phep('lap_nhanh_tab_enter', can_ghi=True, loai='UI')
@nhan_dien(lambda cs: (_la_case_lap_nhanh(cs)
                       and _bat_ky(_n(cs.b), 'tab va enter lien tuc')))
def p_lap_nhanh_tab_enter(case, ctx):
    """Tab tới biểu tượng/nút rồi nhấn Enter liên tục -> phải chỉ gửi đúng một yêu cầu."""
    m = ctx.ban_ghi(case, moi=True)
    ma = m['ma']
    if not ctx.hien_ban_ghi_qa(ma, lam_moi=True):
        return None
    icon = _icon_chuyen_tt(ctx, ctx.c, ma) or _nhan_icon_xoa(ctx)
    js = _js_icon_dong(ma, icon)
    dat = ui._js(ctx.c, """
      const t=%s; if(!t) return 'null';
      t.scrollIntoView({block:'center'}); t.focus();
      return JSON.stringify({focus:document.activeElement===t,
        chu:(t.getAttribute('title')||TXT(t))});""" % js)
    if not dat:
        return None
    if not dat.get('focus'):
        # Không đưa được tiêu điểm tới biểu tượng thì mọi cú Enter sau đó rơi vào phần tử
        # khác — kết luận sẽ nói về một thứ không phải thứ case hỏi.
        return None
    n, nguon_n = _so_lan_cua_case(case)
    tt_truoc = _trang_thai_dong(ctx.c, ma)
    with ctx.ghi(case, 'sua', ma, so_toi_da=max(2, n),
                 mo_ta='Tab tới %r rồi nhấn Enter %d lần' % (icon, n)) as cs:
        # `da_dung` nằm ở CỬA SỔ GHI (`cs.cs`), không ở context manager `_CuaGhi`.
        # Viết `cs.da_dung` ném `AttributeError` NGAY TRONG cửa sổ ghi ⇒ case vào lớp
        # `LỖI` (đo 18/09: r563 · r564 · r588 · r589).
        truoc = len(cs.cs.da_dung)
        ui.go_phim(ctx.c, 'Enter', so_lan=n, nghi=CACH_MS / 1000.0)
        time.sleep(2.0)
        so_req = len(cs.cs.da_dung) - truoc
    tt_sau = _trang_thai_dong(ctx.c, ma)
    tb = ui.doc_thong_bao(ctx.c)
    du = {'ban_ghi': ma, 'phan_tu': dat.get('chu'), 'so_lan_enter': n, 'nguon_so_lan': nguon_n,
          'so_request_ghi': so_req, 'trang_thai_truoc': tt_truoc, 'trang_thai_sau': tt_sau,
          'thong_bao': tb[:3], 'muc_bang_chung': 'UI + SỔ MẠNG'}
    if so_req is None:
        return None
    if so_req <= 1:
        return 'P', ('Tab tới %r rồi nhấn Enter %d lần liên tục trên bản ghi %s: hệ thống chỉ '
                     'gửi %d yêu cầu, trạng thái đổi một lần (%r → %r).'
                     % (dat.get('chu'), n, ma, so_req, tt_truoc, tt_sau)), du
    return 'F', ('Tab tới %r rồi nhấn Enter %d lần trên bản ghi %s: hệ thống gửi %d yêu cầu '
                 'ghi (đáng lẽ 1).' % (dat.get('chu'), n, ma, so_req)), du


# ══════════════════════════════════════════════════════════════════════════════
# §11. THẺ SỐ LIỆU ↔ DỮ LIỆU THẬT
# ══════════════════════════════════════════════════════════════════════════════
def _so_tren_the(c, ten_the):
    """Con số trên một thẻ số liệu. `None` nếu không đọc được — KHÔNG đoán bằng 0."""
    return ui._js(c, """
      const n=QN(%s);
      const ds=[...document.querySelectorAll('div,section,article,li')].filter(e=>{
        if(e.children.length>4) return false;
        const t=QN(TXT(e)); return t.includes(n) && /\\d/.test(TXT(e));});
      if(!ds.length) return 'null';
      ds.sort((a,b)=>TXT(a).length-TXT(b).length);
      const e=ds[0]; const m=(TXT(e).match(/(\\d[\\d.,]*)/g)||[]);
      if(!m.length) return 'null';
      return JSON.stringify({the:TXT(e).slice(0,80),
        so:parseInt(m[m.length-1].replace(/[.,]/g,''),10)});""" % ui._s(ten_the))


@phep('the_so_lieu_vs_du_lieu', loai='DATA')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith('the so lieu')
                       and _co(_n(cs.b), 'khop du lieu trong he thong')))
def p_the_vs_du_lieu(case, ctx):
    """Con số trên thẻ ↔ số bản ghi thật, đối chiếu theo ĐÚNG điều kiện cột C nêu.

    Thứ tự nguồn đối chiếu (§11): API → CSDL → UI. Ở đây dùng **UI** vì:
      · lượt chạy không có quyền truy vấn CSDL (hồ sơ dự án khai `TABLE` trống);
      · thẻ số liệu và thanh phân trang đọc từ CÙNG một endpoint, nên so hai con số của
        cùng một nguồn không chứng minh được gì — phải áp ĐÚNG bộ lọc mà cột C nêu rồi đọc
        `Tổng số bản ghi`, tức là bắt máy chủ đếm lại theo điều kiện ấy.

    Không tự đặt điều kiện lọc: điều kiện lấy nguyên từ cột C (*"Lọc … = Hoạt động"*).
    """
    from phep_live import bo_qua, ten_the_so_lieu
    ten_the = ten_the_so_lieu(ctx, case)
    if not ten_the:
        return bo_qua(ctx, 'không suy ra được TÊN THẺ từ nhóm case',
                      nhom=_nhom(case), the_khai=ctx.vb('the_so_lieu'))
    the = _so_tren_the(ctx.c, ten_the)
    if not the:
        return bo_qua(ctx, 'không đọc được con số trên thẻ %r' % ten_the,
                      the=ten_the, the_khai=ctx.vb('the_so_lieu'),
                      van_ban_man=(ui.doc_van_ban(ctx.c) or '')[:300])
    du = {'the': ten_the, 'so_tren_the': the.get('so'), 'chu_tren_the': the.get('the'),
          'nguon_doi_chieu': 'UI (áp bộ lọc rồi đọc "Tổng số bản ghi")',
          'muc_bang_chung': 'DATA'}
    gia_tri = _gia_tri_loc_cua_case(ctx, case)
    if gia_tri is None:
        # Thẻ TỔNG: so với tổng khi KHÔNG áp bộ lọc, và với tổng các thẻ còn lại.
        ctx.ve_danh_sach(lam_moi=True)
        pt = ui.doc_phan_trang(ctx.c) or {}
        tong = re.sub(r'[^\d]', '', str(pt.get('tong') or ''))
        if not tong:
            return None
        tong = int(tong)
        con = []
        for x in (ctx.vb('the_so_lieu') or []):
            if _n(str(x)) == _n(ten_the):
                continue
            s = _so_tren_the(ctx.c, str(x))
            if s:
                con.append((str(x), s['so']))
        du.update({'tong_phan_trang': tong, 'cac_the_con_lai': con,
                   'tong_cac_the_con_lai': sum(v for _, v in con) if con else None})
        if the['so'] != tong:
            return 'F', ('Thẻ "%s" hiện %d nhưng "Tổng số bản ghi" ở thanh phân trang (chưa áp '
                         'bộ lọc) là %d.' % (ten_the, the['so'], tong)), du
        if con and sum(v for _, v in con) != the['so']:
            return 'F', ('Thẻ "%s" hiện %d, bằng tổng số bản ghi, nhưng KHÔNG bằng tổng các thẻ '
                         'còn lại (%s = %d).'
                         % (ten_the, the['so'], ' + '.join('%s %d' % (k, v) for k, v in con),
                            sum(v for _, v in con))), du
        return 'P', ('Thẻ "%s" = %d, khớp "Tổng số bản ghi" = %d%s.'
                     % (ten_the, the['so'], tong,
                        ' và bằng tổng các thẻ còn lại (%d)' % sum(v for _, v in con)
                        if con else '')), du
    # Thẻ theo trạng thái: áp đúng bộ lọc cột C nêu rồi đọc lại tổng.
    o_loc, gt = gia_tri
    r = ui.dat_o_chon(ctx.c, o_loc, gt, 'loc', _goi_y(ctx, o_loc))
    time.sleep(1.6)
    pt = ui.doc_phan_trang(ctx.c) or {}
    tong = re.sub(r'[^\d]', '', str(pt.get('tong') or ''))
    du.update({'o_loc': o_loc, 'gia_tri_loc': gt, 'ket_qua_chon': r,
               'tong_sau_khi_loc': tong})
    ctx.ve_danh_sach(lam_moi=True)
    if not (isinstance(r, dict) and r.get('ok')) or not tong:
        # Không áp được bộ lọc -> không có con số thứ hai để đối chiếu. Giữ CẢ kết quả thao
        # tác lẫn con số đọc được: thiếu chúng thì không phân biệt nổi "chọn không ăn" với
        # "chọn ăn nhưng không đọc được tổng".
        from phep_live import bo_qua
        return bo_qua(ctx, 'áp bộ lọc %r=%r không thành hoặc không đọc được tổng' % (o_loc, gt),
                      **du)
    tong = int(tong)
    if the['so'] != tong:
        return 'F', ('Thẻ "%s" hiện %d nhưng lọc %s = %r rồi đọc "Tổng số bản ghi" được %d.'
                     % (ten_the, the['so'], o_loc, gt, tong)), du
    return 'P', ('Thẻ "%s" = %d, khớp đúng số bản ghi máy chủ trả về khi lọc %s = %r (%d).'
                 % (ten_the, the['so'], o_loc, gt, tong)), du


def _goi_y(ctx, ten):
    from phep_live import _goi_y_o_chon
    return _goi_y_o_chon(ctx, ten, 'loc')


def _gia_tri_loc_cua_case(ctx, case):
    """(nhãn ô lọc, giá trị) mà cột C bảo áp — `None` nếu case không nêu bộ lọc nào.

    Đọc NGUYÊN VĂN từ cột C (*'Lọc "-- Chọn trạng thái --" = Hoạt động'*), không suy từ tên
    thẻ: tên thẻ viết HOA (`HOẠT ĐỘNG`) còn giá trị trong ô chọn viết thường, và ghép hai thứ
    ấy bằng phỏng đoán là chỗ sinh ra sai lặng lẽ.
    """
    m = re.search(r'L[oọ]c\s*"([^"]+)"\s*=\s*([^\n.,]+)', case.c or '', re.I)
    if not m:
        return None
    o = m.group(1).strip()
    gt = m.group(2).strip().strip('."\'')
    # ⚠️ VÁ 18/09. `[^\n.,]+` ngoạm hết phần còn lại của câu: cột C viết *'Lọc "-- Chọn trạng
    # thái --" = Hoạt động rồi đọc "Tổng số bản ghi:" ở thanh phân trang'*, và tool đi tìm một
    # tuỳ chọn mang nguyên cái tên dài ấy ⇒ `chon_trong_o` trả *"không thấy lựa chọn"* và 3
    # case thẻ số liệu nằm CHƯA ĐO. Cắt ở từ nối, rồi CHỐT lại bằng danh sách tuỳ chọn mà hồ
    # sơ màn đã khai — giá trị lọc hợp lệ chỉ có thể là một trong số đó.
    gt = re.split(r'\s+(?:r[ồo]i|sau đó|xong|và)\s+', gt)[0].strip().strip('."\'')
    # Hồ sơ màn khai tuỳ chọn của Ô LỌC ở `tuy_chon_loc_trang_thai` (đo trên ViTriLuuTru:
    # ['Chờ kết nối','Hoạt động','Ngừng hoạt động'] — khớp đúng danh sách `chon_trong_o` đọc
    # được trên app). Tuỳ chọn của BIỂU MẪU là danh sách khác, chỉ dùng khi màn không khai
    # danh sách lọc.
    khai = [str(x) for x in (ctx.vb('tuy_chon_loc_trang_thai')
                             or ctx.vb('form_them', 'tuy_chon_trang_thai') or [])]
    for k in khai:
        if _n(gt).startswith(_n(k)) or _n(k) == _n(gt):
            gt = k
            break
    # Nhãn ô lọc trong cột C là CHỮ GỢI Ý ("-- Chọn trạng thái --"); bộ tìm ô chọn nhận cả
    # chữ gợi ý lẫn tên trường, nên truyền thẳng cũng được — nhưng rút về tên trường thì
    # thông báo dễ đọc hơn.
    ten = re.sub(r'^[-\s]*[Cc]h[oọ]n\s*', '', o).strip(' -')
    return (ten or o), gt


# ══════════════════════════════════════════════════════════════════════════════
# §12. NHÓM CASE LẺ
# ══════════════════════════════════════════════════════════════════════════════
_RX_MAU_DAC_BIET = re.compile(r'"([^"]{2,60})"')


def _o_cua_case(case):
    from phep_live import _o_cua_nhom
    return _o_cua_nhom(case)


@phep('ky_tu_dac_biet_luu_lai', can_ghi=True, loai='UI')
@nhan_dien(lambda cs: (_bat_ky(_n(cs.b), 'nhap ky tu dac biet, the html, script',
                               'nhap ky tu dac biet')
                       and _pv(cs) in ('them', 'sua')
                       and 'khong bi ma hoa' in _n(cs.d)))
def p_ky_tu_dac_biet(case, ctx):
    """Nhập ký tự đặc biệt/thẻ HTML -> LƯU -> MỞ LẠI -> giá trị đọc lên phải ĐÚNG chuỗi đã nhập.

    Cột D của lớp case này nói một điều rất cụ thể: *"các ký tự đặc biệt, thẻ html không bị
    mã hoá khi view lên"*. Chỉ gõ vào ô rồi đọc lại ô (việc mà `truong_xss` làm) không trả
    lời được câu đó — phải đi trọn vòng **nhập → lưu → mở lại**. Đó là lý do 14 case của
    nhóm này rơi về CHƯA ĐO.
    """
    o = _o_cua_case(case)
    if not o:
        return None
    mau = _RX_MAU_DAC_BIET.findall(case.c or '')
    gia_tri = None
    for x in mau:
        if re.search(r'[<>&%\'"]', x):
            gia_tri = x
            break
    nguon_gt = 'nguyên văn cột C'
    if not gia_tri:
        # Cột C của phần lớn case lớp này chỉ tả LOẠI chuỗi (*"chuỗi có ký tự đặc biệt và thẻ
        # html"*) chứ không nêu chuỗi cụ thể — chỉ vài case kèm ví dụ (`"Kho <b>1</b>"`). Bản
        # trước bỏ cuộc ở đây, và đó là chỗ 6/13 case `truong_nhap_gia_tri` nằm lại CHƯA ĐO.
        # Lấy chuỗi từ bảng KHAI SẴN ở `qalib`, và NÓI RA nguồn trong evidence: kỳ vọng vẫn
        # đọc nguyên văn cột D, chỉ có dữ liệu gõ vào là của tool.
        gia_tri = qalib.mau_nhap_khai(case.b or '') or qalib.mau_nhap_khai(case.c or '')
        nguon_gt = 'bảng chuỗi mẫu khai ở qalib'
    if not gia_tri:
        return None
    r = _nhap_luu_doc_lai(case, ctx, o, gia_tri, nguon_gt)
    if r is None:
        return None
    du, doc_lai, nguon = r['du'], r['doc_lai'], r['nguon']
    if r.get('ket'):
        return r['ket']
    if doc_lai is None:
        return None
    if doc_lai == gia_tri:
        return 'P', ('Nhập %r vào ô "%s", lưu rồi mở lại (%s): giá trị đọc lên ĐÚNG nguyên '
                     'chuỗi đã nhập — ký tự đặc biệt và thẻ html không bị mã hoá.'
                     % (gia_tri, o, nguon)), du
    return 'F', ('Nhập %r vào ô "%s", lưu rồi mở lại (%s): giá trị đọc lên là %r — khác chuỗi '
                 'đã nhập.' % (gia_tri, o, nguon, doc_lai)), du


def _nhap_luu_doc_lai(case, ctx, o, gia_tri, nguon_gt='nguyên văn cột C'):
    """Vòng NHẬP → LƯU → MỞ LẠI → ĐỌC cho một ô. -> {'du','doc_lai','nguon','ket'} | None.

    Tách khỏi `p_ky_tu_dac_biet` vì bốn lớp case khác nhau (ký tự đặc biệt · tiếng Việt có
    dấu · cắt khoảng trắng hai đầu · gõ chữ vào ô số) đi CHUNG một vòng thao tác và chỉ khác
    nhau ở chuỗi gõ vào với cách so sánh lúc đọc lên. Chép vòng này ra bốn bản là bốn chỗ để
    lệch nhau — đúng cái đã xảy ra với lớp ô chọn.

    `ket` khác `None` nghĩa là vòng thao tác đã tự kết luận được (lưu không thành) và người
    gọi trả thẳng kết quả ấy, không so sánh gì nữa.
    """
    sua = _pv(case) == 'sua'
    m = ctx.ban_ghi(case, moi=not sua)
    ma = m['ma']
    from phep_live import _icon_sua
    if sua:
        if not ctx.hien_ban_ghi_qa(ma, lam_moi=True):
            return None
        r = ui.mo_hop_theo_dong(ctx.c, ma, _icon_sua(ctx))
        if not (isinstance(r, dict) and r.get('ok')):
            return None
    else:
        ma, ten = ctx.so.cap_ma()
        ctx.so.khai_tao(ma, ten, case.key, 'bản ghi QA cho ca nhập giá trị đặc thù')
        if not ui.mo_hop(ctx.c, ctx.nut_them()):
            return None
        ctx.dien_form(ma=ma, ten=ten)
    da_go = ui.dien(ctx.c, o, gia_tri, 'hop')
    if da_go is None:
        # Ô mà case nói tới KHÔNG có trên biểu mẫu. Đây là một KẾT LUẬN về bộ case, không
        # phải lý do bỏ đo — nhưng phải nêu ra những ô THẬT SỰ có, nếu không thì người đọc
        # không phân biệt được "case sai" với "tool tìm hụt". Cùng luật với `_khong_thay`.
        hop = ui.doc_hop_thoai(ctx.c) or {}
        co = [x.get('nhan') for x in (hop.get('o') or []) if x.get('nhan')]
        ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()
        return {'du': {'o': o, 'o_that_su_co': co[:12], 'muc_bang_chung': 'UI'},
                'doc_lai': None, 'nguon': '',
                'ket': ('F', ('Biểu mẫu %s KHÔNG có ô "%s" để nhập — các ô đang có: %s.'
                              % (hop.get('tieu_de') or 'đang mở', o,
                                 ' · '.join(co[:10]) or '(không đọc được ô nào)')),
                        {'o': o, 'o_that_su_co': co[:12], 'muc_bang_chung': 'UI'})}
    nut = ctx.nut_luu_sua() if sua else ctx.nut_luu_them()
    with ctx.ghi(case, 'sua' if sua else 'tao', ma,
                 mo_ta='lưu giá trị đặc thù vào ô %r' % o) as cs:
        ui.bam_ghi(ctx.c, nut, cs.giay_phep, 'hop', cho=2.2)
    time.sleep(1.2)
    loi = ui.doc_loi(ctx.c, 'hop') if ui.co_hop_thoai(ctx.c) else []
    du = {'o': o, 'gia_tri_nhap': gia_tri, 'nguon_gia_tri': nguon_gt, 'da_go': da_go,
          'ban_ghi': ma, 'loi_khi_luu': loi[:3], 'muc_bang_chung': 'UI'}
    if ui.co_hop_thoai(ctx.c):
        ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()
        return {'du': du, 'doc_lai': None, 'nguon': '',
                'ket': ('F', ('Nhập %r vào ô "%s" rồi bấm %r: KHÔNG lưu được (%s).'
                              % (gia_tri, o, nut, ' | '.join(loi)[:150] or 'hộp thoại còn mở')),
                        du)}
    if not sua:
        ctx.so.xac_nhan_tao(ma, co_tren_app=bool(ctx.hien_ban_ghi_qa(ma)))
    doc_lai, nguon = _doc_lai_gia_tri(ctx, ma, o)
    du.update({'gia_tri_doc_lai': doc_lai, 'nguon_doc_lai': nguon})
    return {'du': du, 'doc_lai': doc_lai, 'nguon': nguon, 'ket': None}


def _doc_lai_gia_tri(ctx, ma, nhan_o):
    """Giá trị của một ô SAU KHI LƯU — mở lại bằng hộp Chi tiết, không được thì bằng Sửa."""
    from phep_live import _icon_sua
    ctx.hien_ban_ghi_qa(ma, lam_moi=True)
    hop, _ = _mo_hop_chi_tiet(ctx, ma)
    if hop:
        for x in (hop.get('cap') or []):
            if _n(x['nhan']).rstrip(':') == _n(nhan_o):
                _dong_hop_chi_tiet(ctx)
                return (x.get('gia_tri') or '').strip(), 'hộp Chi tiết'
        _dong_hop_chi_tiet(ctx)
    r = ui.mo_hop_theo_dong(ctx.c, ma, _icon_sua(ctx))
    if isinstance(r, dict) and r.get('ok'):
        x = ui.doc_o(ctx.c, nhan_o, 'hop') or {}
        ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()
        return (x.get('gia_tri') or '').strip(), 'biểu mẫu Chỉnh sửa'
    ctx.ve_danh_sach()
    return None, ''


@phep('ma_da_ton_tai', can_ghi=True, loai='UI')
@nhan_dien(lambda cs: (_co(_n(cs.b), 'du lieu da ton tai')
                       and _pv(cs) in ('them', 'sua')))
def p_ma_da_ton_tai(case, ctx):
    """Nhập mã ĐÃ TỒN TẠI -> lưu -> phải nhận đúng thông báo trùng của máy chủ.

    Mã trùng lấy từ **bản ghi QA thứ hai do chính lượt chạy tạo** — không mượn mã của dữ
    liệu nghiệp vụ, vì chỉ cần một lần hệ thống *chấp nhận* là dữ liệu thật bị đụng.
    """
    o_ma = ctx.o_ma()
    if not o_ma:
        return None
    goc = ctx.ban_ghi(case)            # bản ghi QA đã có -> lấy mã của nó làm mã trùng
    ma_trung = goc['ma']
    sua = _pv(case) == 'sua'
    from phep_live import _icon_sua
    if sua:
        m2 = ctx.tao_ban_ghi(case)     # bản ghi thứ hai để đem đi sửa thành trùng
        if not ctx.hien_ban_ghi_qa(m2['ma'], lam_moi=True):
            return None
        r = ui.mo_hop_theo_dong(ctx.c, m2['ma'], _icon_sua(ctx))
        if not (isinstance(r, dict) and r.get('ok')):
            return None
        dich = m2['ma']
    else:
        if not ui.mo_hop(ctx.c, ctx.nut_them()):
            return None
        _, ten = ctx.so.cap_ma()
        ctx.dien_form(ma=ma_trung, ten=ten)
        dich = ma_trung
    o_khoa = (ui.doc_o(ctx.c, o_ma, 'hop') or {})
    if o_khoa.get('vo_hieu') or o_khoa.get('chi_doc'):
        ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()
        return 'P', ('Ô "%s" bị KHOÁ ở biểu mẫu này nên không có đường nhập mã trùng — hệ '
                     'thống chặn trùng mã từ giao diện.' % o_ma), {
            'o': o_ma, 'bi_khoa': True, 'muc_bang_chung': 'UI'}
    ui.dien(ctx.c, o_ma, ma_trung, 'hop')
    nut = ctx.nut_luu_sua() if sua else ctx.nut_luu_them()
    with ctx.ghi(case, 'sua' if sua else 'tao', dich,
                 mo_ta='lưu với mã TRÙNG %r' % ma_trung) as cs:
        ui.bam_ghi(ctx.c, nut, cs.giay_phep, 'hop', cho=2.4)
    time.sleep(1.4)
    loi = ui.doc_loi(ctx.c, 'hop') + ui.doc_thong_bao(ctx.c)
    con_hop = ui.co_hop_thoai(ctx.c)
    du = {'o': o_ma, 'ma_trung': ma_trung, 'loi': loi[:3], 'hop_con_mo': con_hop,
          'muc_bang_chung': 'UI'}
    if con_hop:
        ui.dong_hop(ctx.c)
    ctx.ve_danh_sach(lam_moi=True)
    if loi and con_hop:
        return 'P', ('Nhập mã %r đã tồn tại rồi bấm %r: hệ thống CHẶN, hộp thoại giữ nguyên và '
                     'hiện thông báo %r.' % (ma_trung, nut, loi[0][:110])), du
    if loi:
        return 'F', ('Nhập mã %r đã tồn tại: hệ thống hiện %r nhưng hộp thoại vẫn tự đóng như '
                     'một lần lưu thành công.' % (ma_trung, loi[0][:90])), du
    return 'F', ('Nhập mã %r đã tồn tại rồi bấm %r: KHÔNG có thông báo trùng nào và hộp thoại '
                 'đã đóng — không chứng minh được hệ thống chặn trùng mã.'
                 % (ma_trung, nut)), du


# Icon + ô tích của TỪNG DÒNG bảng — dùng cả trước lẫn sau khi dựng trạng thái, nên phải là
# một bản duy nhất (chép tay hai bản là hai bản sẽ lệch nhau).
_JS_DONG_ICON = """
      const ra=[];
      for(const tr of document.querySelectorAll('table tbody tr')){
        const td=[...tr.querySelectorAll('td')];
        if(td.length<2||td.some(x=>parseInt(x.getAttribute('colspan')||'1',10)>1)) continue;
        const icon=[...tr.querySelectorAll('button,[role=button],a')].filter(HIEN)
          .map(b=>(b.getAttribute('title')||b.getAttribute('aria-label')||TXT(b)).trim())
          .filter(x=>x);
        ra.push({txt:TXT(tr).slice(0,140), icon:icon,
          co_o_tich:!!tr.querySelector('input[type=checkbox]'),
          co_xoa:icon.some(x=>QN(x).includes(QN(%s)))});}
      return JSON.stringify(ra);"""


def _nhan_kich_hoat(ctx):
    """Nhãn nút KÍCH HOẠT trên dòng, theo hồ sơ màn. `''` nếu màn không có."""
    for x in (ctx.vb('icon_ban_ghi') or []):
        if qalib.chua_tu(str(x), 'kich hoat'):
            return str(x)
    return 'Kích hoạt'


def _nut_xac_nhan(ctx):
    """Nút chốt trong hộp xác nhận chuyển trạng thái, theo hồ sơ màn."""
    kh = ctx.vb('doi_trang_thai') or ctx.vb('xac_nhan') or {}
    for x in (kh.get('nut') or []):
        if not qalib.chua_tu(str(x), 'huy', 'huy bo', 'dong'):
            return str(x)
    return 'Xác nhận'


def _tt_hoat_dong(ctx):
    """Nhãn trạng thái "Hoạt động" đúng NGUYÊN VĂN hồ sơ màn khai. `None` nếu chưa khai."""
    for x in (ctx.vb('tuy_chon_loc_trang_thai') or ctx.vb('tuy_chon_trang_thai') or []):
        if qalib.chua_tu(str(x), 'hoat dong') and not qalib.chua_tu(str(x), 'ngung hoat dong'):
            return str(x)
    return None


@phep('chan_xoa_dang_dung', loai='UI')
@nhan_dien(lambda cs: _bat_ky(_n(cs.b), 'chan xoa khi ban ghi dang duoc su dung',
                              'chan xoa khi ban ghi dang duoc dung'))
def p_chan_xoa_dang_dung(case, ctx):
    """Bản ghi đang Hoạt động / đang được dùng phải KHÔNG có lối xoá trên giao diện.

    Cột D của case nói HAI ý, và phép đo trả lời cả hai trên dữ liệu NGHIỆP VỤ CÓ SẴN —
    không tạo, không sửa, không xoá gì:

      ① *"Bản ghi đang Hoạt động KHÔNG có biểu tượng thùng rác và cũng không có ô tích
         chọn"* — trạng thái đọc ở CỘT Trạng thái, lối xoá đọc ở cột Hành động;
      ② *"Bản ghi Hoạt động đang được sử dụng chỉ còn duy nhất biểu tượng Xem chi tiết"* —
         *"đang được sử dụng"* đọc ở hộp **Chi tiết** (hồ sơ màn khai `badge_dang_su_dung:
         ["Đang dùng","Không"]`), KHÔNG suy từ chính bộ icon đang cần kiểm.

    ⚠️ VÁ 18/09 lượt 4. Bản trước đọc bảng NGAY lúc vào phép, và giữa một lượt chạy thì màn
    còn nguyên bộ lọc của case trước: đo được *"1 dòng · tổng 1 · lọc 2"* trong khi màn thật
    có 15 bản ghi, 12 trong đó đang Hoạt động. Thấy 0 dòng, phép đi dựng dữ liệu QA rồi vẫn
    bỏ cuộc. Nay đưa màn về danh sách sạch trước đã.
    """
    from phep_live import bo_qua
    dk = str(ctx.vb('dieu_kien_hien_icon') or '')
    nhan_xoa = _nhan_icon_xoa(ctx)
    nhan_xem = _nhan_xem_chi_tiet(ctx)
    ctx.ve_danh_sach(lam_moi=True)
    bang = ui.doc_bang(ctx.c) or []
    kq = ui._js(ctx.c, _JS_DONG_ICON % ui._s(nhan_xoa)) or []
    du = {'dieu_kien_hien_icon_khai': dk[:220], 'so_dong': len(kq),
          'muc_bang_chung': 'UI', 'nguon': 'bản ghi nghiệp vụ có sẵn (chỉ đọc)'}
    if not kq:
        return bo_qua(ctx, 'không đọc được dòng nào trên bảng sau khi làm mới danh sách', **du)

    # Trạng thái lấy ở CỘT Trạng thái. Suy trạng thái từ bộ icon là vòng tròn: chính bộ icon
    # ấy mới là thứ case đang bắt kiểm.
    tt_theo_ma = {}
    for r in bang:
        o = r.get('o') or {}
        ma = str(o.get('Code') or o.get('code') or '').strip()
        if ma:
            tt_theo_ma[ma] = str(o.get('Trạng thái') or o.get('Trang thai') or '').strip()
    hoat_dong = []
    for r in kq:
        for ma, tt in tt_theo_ma.items():
            if ma and ma in r['txt'] and qalib.chua_tu(tt, 'hoat dong') \
                    and not qalib.chua_tu(tt, 'ngung hoat dong'):
                hoat_dong.append(dict(r, ma=ma, trang_thai=tt))
                break
    du.update({'so_dong_hoat_dong': len(hoat_dong),
               'vi_du': [{'ma': r['ma'], 'icon': r['icon'], 'co_xoa': r['co_xoa'],
                          'co_o_tich': r['co_o_tich']} for r in hoat_dong[:4]]})
    if not hoat_dong:
        return bo_qua(ctx, 'bảng không có bản ghi nào ở trạng thái Hoạt động để đo', **du)

    # ── ý ① — bản ghi Hoạt động không được có lối xoá ────────────────────────
    xau = [r for r in hoat_dong if r['co_xoa'] or r['co_o_tich']]
    if xau:
        return 'F', ('%d/%d bản ghi đang Hoạt động VẪN có lối xoá trên giao diện (%s).'
                     % (len(xau), len(hoat_dong),
                        ' · '.join('%s: %s' % (r['ma'], 'có biểu tượng %s' % nhan_xoa
                                               if r['co_xoa'] else 'có ô tích chọn')
                                   for r in xau[:2]))), du

    # ── ý ② — trong số đó, bản ghi ĐANG ĐƯỢC SỬ DỤNG chỉ còn "Xem chi tiết" ──
    dang_dung, loi_ct = [], None
    for r in hoat_dong[:6]:
        try:
            co = _dang_su_dung(ctx, r['ma'])
        except Exception as e:
            loi_ct = str(e)[:140]
            break
        if co is None:
            loi_ct = 'hộp Chi tiết không có trường "Đang sử dụng"'
            break
        if co:
            dang_dung.append(r)
    du['so_dong_dang_su_dung'] = len(dang_dung)
    du['doc_dang_su_dung_o'] = 'hộp Chi tiết, trường "Đang sử dụng"'
    if loi_ct:
        du['khong_doc_duoc_dang_su_dung'] = loi_ct
    if not dang_dung:
        # Ý ① đã đo trọn; ý ② không có dữ liệu để đo thì nói thẳng, không chấm thay.
        du['chua_chung_minh'] = ('ý 2 cột D — không tìm được bản ghi Hoạt động nào ĐANG ĐƯỢC '
                                 'SỬ DỤNG trong số đã soi (%s)'
                                 % (loi_ct or 'các bản ghi soi được đều không được dùng'))
        return 'P', ('Cả %d bản ghi đang Hoạt động đều KHÔNG có biểu tượng %r và KHÔNG có ô '
                     'tích chọn — không có lối xoá nào từ giao diện. (Ý 2 của cột D — bản ghi '
                     'ĐANG ĐƯỢC SỬ DỤNG — chưa đo được: %s.)'
                     % (len(hoat_dong), nhan_xoa,
                        loi_ct or 'không bản ghi nào soi được đang ở trạng thái đó')), du
    thua = [r for r in dang_dung
            if [x for x in r['icon'] if not qalib.chua_tu(x, _n(nhan_xem))]]
    du['vi_du_dang_dung'] = [{'ma': r['ma'], 'icon': r['icon']} for r in dang_dung[:3]]
    if thua:
        return 'F', ('%d/%d bản ghi Hoạt động ĐANG ĐƯỢC SỬ DỤNG còn biểu tượng khác ngoài '
                     '%r — cột D đòi chỉ còn duy nhất biểu tượng ấy (%s).'
                     % (len(thua), len(dang_dung), nhan_xem,
                        ' · '.join('%s: %s' % (r['ma'], ' + '.join(r['icon']))
                                   for r in thua[:2]))), du
    return 'P', ('%d bản ghi đang Hoạt động đều không có biểu tượng %r lẫn ô tích chọn; %d '
                 'bản ghi trong số đó ĐANG ĐƯỢC SỬ DỤNG (đọc ở hộp Chi tiết) và chỉ còn duy '
                 'nhất biểu tượng %r.'
                 % (len(hoat_dong), nhan_xoa, len(dang_dung), nhan_xem)), du


def _nhan_xem_chi_tiet(ctx):
    """Nhãn icon XEM CHI TIẾT trên dòng, theo hồ sơ màn."""
    for x in (ctx.vb('icon_ban_ghi') or []):
        if qalib.chua_tu(str(x), 'xem chi tiet', 'chi tiet'):
            return str(x)
    return 'Xem chi tiết'


def _dang_su_dung(ctx, ma):
    """Bản ghi `ma` có ĐANG ĐƯỢC SỬ DỤNG không, đọc ở hộp Chi tiết. -> True/False/None.

    `None` = hộp Chi tiết không có trường ấy (màn khác không khai `badge_dang_su_dung`), và
    khi ấy phép gọi phải nói là CHƯA ĐO chứ không được đoán.
    """
    nhan = _nhan_xem_chi_tiet(ctx)
    r = ui.mo_hop_theo_dong(ctx.c, ma, nhan)
    if not (isinstance(r, dict) and r.get('ok')):
        raise LoiDoc('không mở được hộp Chi tiết của %s' % ma)
    try:
        time.sleep(0.6)
        hop = ui.doc_hop_thoai(ctx.c) or {}
        chu = ' '.join([str(x) for x in (hop.get('chu') or [])]) or str(hop.get('txt') or '')
        if not qalib.chua_tu(chu, 'dang su dung'):
            return None
        kh = ctx.vb('xem_chi_tiet') or {}
        co, khong = (kh.get('badge_dang_su_dung') or ['Đang dùng', 'Không'])[:2]
        sau = chu.split('sử dụng', 1)[-1][:60] if 'sử dụng' in chu else chu
        if qalib.chua_tu(sau, _n(co)):
            return True
        if qalib.chua_tu(sau, _n(khong)):
            return False
        return None
    finally:
        if ui.hop_cua_ta_con_mo(ctx.c):
            ui.dong_hop(ctx.c)


class LoiDoc(RuntimeError):
    """Không đọc được thứ cần đọc — phép gọi phải bỏ cuộc kèm lý do, không chấm."""


@phep('o_chon_mac_dinh_form', loai='UI')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _co(_n(cs.b), 'gia tri mac dinh')
                       # ⚠️ KHÔNG nhận phạm vi `sua`. Phép này mở biểu mẫu **Thêm mới**, nên
                       # nhận case của biểu mẫu Chỉnh sửa là trả lời một câu hỏi bằng một
                       # control KHÁC — đúng lớp lỗi mà phép kiểm C4 của `kiem_chay_live`
                       # sinh ra để chặn, và nó bắt được ngay lần chạy đầu. Case `sua` do
                       # `mac_dinh_o_chon_sua` (cần ghi, mở đúng biểu mẫu Chỉnh sửa) lo.
                       and _pv(cs) in ('them', 'khac')))
def p_o_chon_mac_dinh(case, ctx):
    """Ô chọn trên biểu mẫu/popup phải ở chữ gợi ý, KHÔNG tự chọn giá trị đầu danh sách.

    Kỳ vọng lấy từ cột D (*"Mặc định là -- Chọn --"*) và từ luật cứng UI của `qalib` — hai
    nguồn nói cùng một điều, không nguồn nào do phép đo tự nghĩ ra.

    Mở đúng CHỖ mà CN của case nói tới: phạm vi `them` thì mở biểu mẫu Thêm mới; phạm vi
    `khac` (CN kiểu *Ngừng dùng…*, *Ánh xạ…*) thì mở popup CỦA CHÍNH CN ấy. Mở nhầm chỗ là
    đo một ô cùng tên nhưng khác màn.
    """
    ten = qalib.field_of(_nhom(case))
    if not ten:
        return None
    from phep_live import _goi_y_o_chon
    if _pv(case) == 'them':
        if not ui.mo_hop(ctx.c, ctx.nut_them()):
            return None
    elif not _mo_popup_cua_cn(ctx, case):
        return None
    try:
        x = ui.tim_o_chon(ctx.c, ten, 'hop', _goi_y_o_chon(ctx, ten, 'hop'))
        if not x:
            return None
        chu = (x.get('chu') or '').strip()
        goi_y = _goi_y_o_chon(ctx, ten, 'hop')
        mong = _RX_MAU_DAC_BIET.findall(case.d or '')
        du = {'o': ten, 'gia_tri_dang_hien': chu, 'duong_tim': x.get('duong'),
              'chu_goi_y_ho_so_man': goi_y, 'chu_mong_doi_cot_D': mong,
              'muc_bang_chung': 'UI'}
        if qalib.la_o_trong(chu, goi_y):
            return 'P', ('Mở biểu mẫu Thêm mới: ô "%s" đang ở chữ gợi ý %r — không tự chọn '
                         'giá trị đầu tiên của danh sách.' % (ten, chu)), du
        return 'F', ('Mở biểu mẫu Thêm mới: ô "%s" đã chọn sẵn %r thay vì để ở chữ gợi ý%s.'
                     % (ten, chu, ' %r' % goi_y if goi_y else '')), du
    finally:
        if ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


# ══════════════════════════════════════════════════════════════════════════════
# §5 (tiếp). Ô CHỌN ĐỘNG · Ô CHỌN NHIỀU GIÁ TRỊ
# ══════════════════════════════════════════════════════════════════════════════
def _o_chon(ctx, case):
    from phep_live import _o_chon_cua_case
    return _o_chon_cua_case(ctx, case)


@phep('o_chon_tuy_chon_dong', loai='API')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _bat_ky(_n(cs.b), 'cac gia tri co trong', 'cac gia tri trong')
                       and not _bat_ky(_n(cs.b), 'can le', 'sap xep')
                       and 'gia tri dong' in _n(cs.d)))
def p_o_chon_dong(case, ctx):
    """Ô chọn có danh sách ĐỘNG: đối chiếu lựa chọn trên màn với chính API nạp nó.

    Cột D của lớp case này ghi *"giá trị động, không cố định — đối chiếu trực tiếp với dữ
    liệu thật lúc chạy"*, nên không có danh sách nào để so verbatim. Nguồn đối chiếu đúng
    là endpoint mà hồ sơ màn khai là nguồn nạp ô chọn ấy (`grounding.api`).

    Gọi API bằng `ui.goi_api_doc` — `GET` trong chính phiên đang đăng nhập, không phải một
    đường mạng thứ hai.
    """
    ten, pv = _o_chon(ctx, case)
    if not ten:
        return None
    ep = _endpoint_nap(ctx, ten)
    if not ep:
        return None
    from phep_live import _mo_o_chon, _mo_form_cua_case, _dong_o_chon
    dong_form = False
    try:
        if pv == 'hop':
            if not _mo_form_cua_case(ctx, case):
                return None
            dong_form = True
        op = _mo_o_chon(ctx, case, ten, pv)
        if not op or not op.get('option'):
            return None
        tren_man = [x['chu'].strip() for x in op['option']
                    if (x.get('chu') or '').strip() and not qalib.la_o_trong(x['chu'], '')]
        _dong_o_chon(ctx)
        r = ui.goi_api_doc(ctx.c, _tuyet_doi(ctx, ep))
        du = {'o': ten, 'pham_vi': pv, 'duong_tim': op.get('duong'),
              'lua_chon_tren_man': tren_man, 'so_lua_chon': len(tren_man),
              'endpoint_nap': ep, 'phan_hoi_api': r, 'muc_bang_chung': 'UI + API'}
        if not r or not isinstance(r.get('ma'), int):
            return None
        if not (200 <= r['ma'] < 300):
            return 'F', ('Ô chọn "%s" nạp từ %s nhưng endpoint ấy trả mã %d — danh sách lựa '
                         'chọn không lấy được từ hệ thống.' % (ten, ep, r['ma'])), du
        if not tren_man:
            return 'F', ('Endpoint %s trả %d nhưng ô chọn "%s" KHÔNG hiện lựa chọn nào.'
                         % (ep, r['ma'], ten)), du
        return 'P', ('Ô chọn "%s" hiện %d lựa chọn lấy từ dữ liệu hệ thống (%s); endpoint nạp '
                     '%s trả %d.' % (ten, len(tren_man), ' · '.join(tren_man[:6]), ep,
                                     r['ma'])), du
    finally:
        if dong_form and ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


def _endpoint_nap(ctx, ten_o):
    """Endpoint `GET` mà hồ sơ màn khai là nguồn NẠP cho ô chọn này. `''` nếu không khai."""
    nb = _n(ten_o)
    for dong in ((ctx.hs.get('grounding') or {}).get('api') or []):
        m = re.match(r'\s*GET\s+(\S+)\s*(.*)', str(dong))
        if not m:
            continue
        mo_ta = _n(m.group(2))
        if nb and nb in mo_ta:
            return m.group(1)
    return ''


def _tuyet_doi(ctx, ep):
    if ep.startswith('http'):
        return ep
    m = re.match(r'^(https?://[^/]+)', ctx.url or '')
    goc = m.group(1) if m else ''
    tien_to = str(((ctx.hs.get('grounding') or {}).get('api_prefix')) or '')
    if not tien_to:
        for dong in ((ctx.hs.get('grounding') or {}).get('api') or []):
            g = re.search(r'g[oố]c REST:\s*(\S+)', str(dong))
            if g:
                tien_to = g.group(1)
                break
    return goc + tien_to.rstrip('/') + (ep if ep.startswith('/') else '/' + ep)


@phep('o_chon_nhieu_gia_tri', loai='UI')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _bat_ky(_n(cs.b), 'chon nhieu gia tri trong',
                                   'bo chon tung gia tri trong',
                                   'chon tat ca / bo chon tat ca',
                                   'chon tat ca / bo chon tat ca o')))
def p_o_chon_nhieu(case, ctx):
    """Ô chọn NHIỀU giá trị: chọn thêm không đóng danh sách · bỏ chọn từng cái · cụm nút bên.

    Kỳ vọng lấy từ cột D và `grounding.verbatim.multiselect_nut_ben` — cả hai đều là bản
    khai có sẵn, phép đo không tự đặt tên nút nào.
    """
    ten, pv = _o_chon(ctx, case)
    if not ten:
        return None
    from phep_live import _mo_o_chon, _dong_o_chon
    nb = _n(case.b)
    op = _mo_o_chon(ctx, case, ten, pv)
    if not op or not op.get('option'):
        return None
    ds = [x['chu'].strip() for x in op['option']
          if (x.get('chu') or '').strip() and not qalib.la_o_trong(x['chu'], '')]
    du = {'o': ten, 'pham_vi': pv, 'duong_tim': op.get('duong'), 'so_lua_chon': len(ds),
          'nut_ben_doc_duoc': op.get('nut_ben'), 'muc_bang_chung': 'UI'}
    try:
        # ── nhánh cụm nút "Chọn tất cả / Bỏ chọn tất cả" ────────────────────────
        if 'chon tat ca' in nb:
            mong = [str(x) for x in (ctx.vb('multiselect_nut_ben') or [])]
            if not mong:
                mong = _RX_MAU_DAC_BIET.findall(case.d or '')
            if not mong:
                return None
            co = [x for x in (op.get('nut_ben') or []) if x]
            thieu = [x for x in mong if not any(_n(x) == _n(y) for y in co)]
            du.update({'nut_mong_doi': mong, 'nut_thieu': thieu})
            if thieu:
                return 'F', ('Mở ô "%s": cụm nút bên danh sách THIẾU %s (đọc được: %s).'
                             % (ten, ' · '.join('"%s"' % x for x in thieu),
                                ' · '.join(co) or 'không nút nào')), du
            return 'P', ('Mở ô "%s": cụm nút bên danh sách có đủ %s.'
                         % (ten, ' · '.join('"%s"' % x for x in mong))), du
        if len(ds) < 2:
            return None                # cần ít nhất 2 lựa chọn mới đo được "chọn nhiều"
        # ── nhánh chọn nhiều: chọn 2 giá trị, danh sách KHÔNG được đóng ─────────
        if 'chon nhieu gia tri' in nb:
            ui.chon_trong_o(ctx.c, ds[0])
            con_mo_1 = bool(ui._js(ctx.c, "return JSON.stringify("
                                          "[...document.querySelectorAll('[role=option],"
                                          "[cmdk-item]')].filter(HIEN).length);"))
            if con_mo_1:
                ui.chon_trong_o(ctx.c, ds[1])
            _dong_o_chon(ctx)
            time.sleep(1.0)
            x = ui.tim_o_chon(ctx.c, ten, pv, _goi_y(ctx, ten)) or {}
            du.update({'chon_1': ds[0], 'chon_2': ds[1] if con_mo_1 else None,
                       'danh_sach_con_mo_sau_lan_1': con_mo_1, 'o_sau_khi_chon': x.get('chu')})
            if not con_mo_1:
                return 'F', ('Ô "%s": chọn %r xong danh sách TỰ ĐÓNG — không chọn thêm được '
                             'giá trị thứ hai như cột D yêu cầu.' % (ten, ds[0])), du
            hien = _n(x.get('chu') or '')
            ca_hai = _n(ds[0]) in hien and _n(ds[1]) in hien
            if ca_hai or re.search(r'\d', x.get('chu') or ''):
                return 'P', ('Ô "%s" cho chọn nhiều giá trị: chọn %r rồi %r, danh sách không tự '
                             'đóng và ô đang hiện %r.'
                             % (ten, ds[0], ds[1], x.get('chu'))), du
            return 'F', ('Ô "%s": chọn %r rồi %r nhưng ô chỉ hiện %r — không giữ được nhiều giá '
                         'trị.' % (ten, ds[0], ds[1], x.get('chu'))), du
        # ── nhánh bỏ chọn từng giá trị ──────────────────────────────────────────
        if 'bo chon tung gia tri' in nb:
            ui.chon_trong_o(ctx.c, ds[0])
            ui.chon_trong_o(ctx.c, ds[1])
            sau_chon = (ui.tim_o_chon(ctx.c, ten, pv, _goi_y(ctx, ten)) or {}).get('chu')
            ui.chon_trong_o(ctx.c, ds[0])          # bấm lại đúng giá trị đang chọn -> bỏ chọn
            _dong_o_chon(ctx)
            time.sleep(0.8)
            sau_bo = (ui.tim_o_chon(ctx.c, ten, pv, _goi_y(ctx, ten)) or {}).get('chu')
            du.update({'sau_khi_chon_2': sau_chon, 'sau_khi_bo_1': sau_bo,
                       'gia_tri_da_bo': ds[0], 'gia_tri_giu_lai': ds[1]})
            if sau_bo is None or sau_chon is None:
                return None
            if _n(ds[0]) in _n(sau_bo):
                return 'F', ('Ô "%s": bấm lại %r (đang chọn) nhưng ô vẫn hiện giá trị đó (%r).'
                             % (ten, ds[0], sau_bo)), du
            return 'P', ('Ô "%s": chọn %r + %r rồi bấm lại %r thì bỏ đúng giá trị đó, ô còn %r.'
                         % (ten, ds[0], ds[1], ds[0], sau_bo)), du
        return None
    finally:
        _dong_o_chon(ctx)
        ctx.ve_danh_sach(lam_moi=True)


@phep('o_chon_mac_dinh_loc', loai='UI')
@nhan_dien(lambda cs: (_n(_nhom(cs)).startswith(('selectbox', 'combobox', 'o chon'))
                       and _co(_n(cs.b), 'gia tri mac dinh')
                       and _pv(cs) in ('danh_sach', 'loc')
                       and 'so ban ghi' not in _n(_nhom(cs))
                       and 'the so lieu' not in _n(_nhom(cs))))
def p_o_chon_mac_dinh_loc(case, ctx):
    """Ô chọn trên THANH LỌC: giá trị đang hiện khi mở màn, và trạng thái sau khi bỏ chọn.

    Kỳ vọng lấy NGUYÊN từ cột D — màn này có một ô lọc (`Sắp xếp`) mà cột D khai rõ là *có*
    giá trị mặc định (`Mới nhất trước`), khác với các ô lọc còn lại. Phép đo không áp luật
    chung lên nó: cột D là kỳ vọng, và §"Tuyệt đối không tự suy diễn Expected Result" cấm
    thay cột D bằng một luật mà chính case không nói tới.
    """
    from phep_live import _goi_y_o_chon
    ten = qalib.field_of(_nhom(case))
    if not ten:
        return None
    ctx.mo_lai_man()
    goi_y = _goi_y_o_chon(ctx, ten, 'loc')
    # Kèm `tuy_chon` hồ sơ màn khai: ô như `Sắp xếp` hiện GIÁ TRỊ chứ không hiện chữ gợi ý,
    # thiếu đường tìm ⑥ thì không tìm ra ô và case về CHƯA ĐO (xem `TIM_CHON` ở live_ui).
    from phep_live import _tuy_chon_o
    x = ui.tim_o_chon(ctx.c, ten, 'loc', goi_y, _tuy_chon_o(ctx, ten, 'loc'))
    if not x:
        return None
    chu = (x.get('chu') or '').strip()
    mong = [m for m in _RX_MAU_DAC_BIET.findall(case.d or '') if m.strip()]
    du = {'o': ten, 'gia_tri_khi_mo_man': chu, 'duong_tim': x.get('duong'),
          'chu_goi_y_ho_so_man': goi_y, 'chu_trich_tu_cot_D': mong, 'muc_bang_chung': 'UI'}
    if not mong:
        # Cột D không nêu giá trị nào -> rơi về luật cứng UI (ô chọn không tự chọn sẵn).
        if qalib.la_o_trong(chu, goi_y):
            return 'P', ('Mở màn: ô lọc "%s" đang ở chữ gợi ý %r — không tự chọn sẵn giá trị '
                         'nghiệp vụ nào.' % (ten, chu)), du
        return 'F', ('Mở màn: ô lọc "%s" đã chọn sẵn %r thay vì để ở chữ gợi ý.'
                     % (ten, chu)), du
    mac_dinh = mong[0]
    if _n(mac_dinh) not in _n(chu):
        return 'F', ('Mở màn: ô lọc "%s" đang hiện %r, cột D yêu cầu hiện sẵn %r.'
                     % (ten, chu, mac_dinh)), du
    # Nửa thứ hai của cột D: bỏ lựa chọn thì phải quay về chữ gợi ý.
    goi_y_mong = next((m for m in mong[1:] if qalib.la_o_trong(m, m)), '')
    bo = ui._js(ctx.c, """
      const e=THEO_MOC('o-chon'); if(!e) return 'null';
      const kh=e.parentElement?e.parentElement:e;
      const t=[...kh.querySelectorAll('button,[role=button],svg')].filter(HIEN)
        .find(b=>/^(x|×|✕|clear|xoa)$/i.test(TXT(b).trim())
            ||/clear|xoa|remove/i.test((b.getAttribute('aria-label')||'')
                                       +(b.getAttribute('title')||'')));
      if(!t) return JSON.stringify({co_nut_bo:false});
      DANH_DAU(t,'nut-bo-chon'); return JSON.stringify({co_nut_bo:true});""")
    du['co_nut_bo_chon'] = bool(bo and bo.get('co_nut_bo'))
    if not du['co_nut_bo_chon']:
        return 'F', ('Ô lọc "%s" hiện sẵn %r đúng cột D, nhưng KHÔNG có dấu "x" để bỏ lựa chọn '
                     'như bước 2 của cột C yêu cầu.' % (ten, chu)), du
    ui.bam_thuc(ctx.c, "THEO_MOC('nut-bo-chon')")
    time.sleep(1.2)
    sau = (ui.tim_o_chon(ctx.c, ten, 'loc', goi_y) or {}).get('chu') or ''
    du['gia_tri_sau_khi_bo'] = sau
    du['chu_goi_y_mong_doi'] = goi_y_mong
    if goi_y_mong and _n(goi_y_mong) not in _n(sau):
        return 'F', ('Ô lọc "%s": bỏ lựa chọn xong ô hiện %r, cột D yêu cầu về chữ gợi ý %r.'
                     % (ten, sau, goi_y_mong)), du
    if not qalib.la_o_trong(sau, goi_y or goi_y_mong):
        return 'F', ('Ô lọc "%s": bỏ lựa chọn xong ô vẫn giữ %r.' % (ten, sau)), du
    return 'P', ('Ô lọc "%s" khi mở màn hiện sẵn %r (đúng cột D); bấm dấu "x" thì ô về chữ gợi '
                 'ý %r.' % (ten, chu, sau)), du


@phep('het_phien_xem_chi_tiet', loai='UI')
@nhan_dien(lambda cs: (_bat_ky(_n(cs.b), 'yeu cau dang nhap khi xem chi tiet')
                       or (_co(_n(cs.b), 'yeu cau dang nhap') and 'chi tiet' in _n(cs.b))))
def p_het_phien_chi_tiet(case, ctx):
    """Hết phiên rồi bấm Xem chi tiết -> phải bị đá về đăng nhập, KHÔNG lộ trường dữ liệu nào.

    Dựng trạng thái hết phiên bằng chính đường đã có (`xoa_phien_trinh_duyet` — thao tác trên
    TRÌNH DUYỆT, không chạm máy chủ), rồi đăng nhập lại ngay sau khi đo để case sau không
    chạy trong trạng thái mất phiên.
    """
    cau = str(ctx.vb('het_phien') or '')
    ctx.cong.hanh_dong('xoa_phien_trinh_duyet', 'dựng ca hết phiên cho hộp Chi tiết')
    ui.xoa_cookie_phien(ctx.c)
    ui.xoa_token_trong_trang(ctx.c)
    ctx.can_dang_nhap_lai = True
    hop, bam = _mo_hop_chi_tiet(ctx)
    van = ui.doc_van_ban(ctx.c) or ''
    url = ctx.c.js('location.href') or ''
    tb = ui.doc_thong_bao(ctx.c) + ui.doc_loi(ctx.c, 'man')
    du = {'cau_verbatim_ho_so_man': cau, 'url_sau_thao_tac': qalib.che_url(url),
          'thong_bao': tb[:3], 'hop_chi_tiet_mo_duoc': bool(hop),
          'so_dong_thong_tin_lo_ra': len((hop or {}).get('cap') or []),
          'muc_bang_chung': 'UI'}
    ve_dang_nhap = 'login' in url or 'dang-nhap' in _n(url) or bool(ui._js(
        ctx.c, "return JSON.stringify(document.querySelectorAll('input[type=password]').length);"))
    if hop and (hop.get('cap') or hop.get('txt')):
        return 'F', ('Phiên đã hết hạn nhưng bấm "%s" VẪN mở được hộp chi tiết với %d dòng '
                     'thông tin — dữ liệu bị lộ khi chưa có phiên hợp lệ.'
                     % (_nhan_icon_xem(ctx), len(hop.get('cap') or []))), du
    if not ve_dang_nhap:
        return 'F', ('Phiên đã hết hạn, bấm "%s": hộp chi tiết không mở (đúng) nhưng hệ thống '
                     'KHÔNG điều hướng về màn đăng nhập (đang ở %s).'
                     % (_nhan_icon_xem(ctx), qalib.che_url(url))), du
    if cau and not any(_n(cau) in _n(x) for x in tb) and _n(cau) not in _n(van):
        return 'F', ('Phiên đã hết hạn, bấm "%s": bị đưa về màn đăng nhập (đúng) nhưng KHÔNG '
                     'hiện thông báo nguyên văn %r (đọc được: %s).'
                     % (_nhan_icon_xem(ctx), cau, ' | '.join(tb[:2]) or 'không có thông báo')), du
    return 'P', ('Phiên đã hết hạn, bấm "%s": hộp chi tiết không mở, hệ thống đưa về màn đăng '
                 'nhập%s và không lộ trường dữ liệu nào.'
                 % (_nhan_icon_xem(ctx), ' kèm đúng thông báo nguyên văn' if cau else '')), du


@phep('xem_chi_tiet_xss', can_ghi=True, loai='UI')
@nhan_dien(lambda cs: (_bat_ky(_n(cs.b), 'chong xss o noi dung hien thi')
                       and 'chi tiet' in _n(cs.nhom.get('cn') or '')))
def p_xem_chi_tiet_xss(case, ctx):
    """Bản ghi mang thẻ HTML -> mở hộp Chi tiết -> chuỗi phải hiện NGUYÊN VĂN, không được dựng.

    Kỳ vọng của cột D có hai nhánh hợp lệ (*"không cho phép Insert"* HOẶC *"cho phép và hiển
    thị đúng chuỗi đã nhập"*) — phép đo phân biệt được cả hai, và chấm F cho đúng một thứ:
    chuỗi bị TRÌNH DUYỆT DỰNG THÀNH THẺ (đó mới là XSS).
    """
    mau = None
    for x in _RX_MAU_DAC_BIET.findall(case.c or ''):
        if '<' in x and '>' in x:
            mau = x
            break
    if not mau:
        m = re.search(r'(<[a-zA-Z][^>]*>[^<]*</[a-zA-Z]+>)', case.c or '')
        mau = m.group(1) if m else None
    if not mau:
        return None                # cột C không nêu chuỗi mẫu -> không tự chế payload
    o = ctx.o_ten() or ctx.o_ma()
    if not o:
        return None
    ma, ten = ctx.so.cap_ma()
    ctx.so.khai_tao(ma, ten, case.key, 'bản ghi QA mang thẻ HTML cho ca chống XSS')
    if not ui.mo_hop(ctx.c, ctx.nut_them()):
        return None
    ctx.dien_form(ma=ma, ten=ten)
    ui.dien(ctx.c, o, mau, 'hop')
    with ctx.ghi(case, 'tao', ma, mo_ta='tạo bản ghi QA mang thẻ HTML %r' % mau) as cs:
        ui.bam_ghi(ctx.c, ctx.nut_luu_them(), cs.giay_phep, 'hop', cho=2.2)
    time.sleep(1.2)
    du = {'o': o, 'chuoi_nhap': mau, 'ban_ghi': ma, 'muc_bang_chung': 'UI'}
    if ui.co_hop_thoai(ctx.c):
        loi = ui.doc_loi(ctx.c, 'hop')
        ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()
        du['loi_khi_luu'] = loi[:3]
        return 'P', ('Hệ thống KHÔNG cho lưu chuỗi %r vào ô "%s" (%s) — nhánh "không cho phép '
                     'Insert" của cột D.' % (mau, o, ' | '.join(loi)[:120] or 'hộp còn mở')), du
    ctx.so.xac_nhan_tao(ma, co_tren_app=bool(ctx.hien_ban_ghi_qa(ma)))
    hop, _ = _mo_hop_chi_tiet(ctx, ma)
    try:
        if not hop:
            return None
        # Chuỗi bị DỰNG THÀNH THẺ hay không: hỏi DOM, không đoán từ chữ đọc được.
        dung_the = ui._js(ctx.c, """
          const h=HOP(); if(!h) return 'null';
          const the=[...h.querySelectorAll('b,i,u,script,img,svg,iframe')].length;
          return JSON.stringify({so_the_dung:the, html:h.innerHTML.slice(0,600)});""") or {}
        txt = ' '.join((x.get('gia_tri') or '') for x in (hop.get('cap') or []))
        du.update({'so_the_html_duoc_dung': dung_the.get('so_the_dung'),
                   'chuoi_doc_lai': txt[:200],
                   'hien_nguyen_van': mau in txt})
        if mau in txt:
            return 'P', ('Hộp Chi tiết hiện chuỗi %r NGUYÊN VĂN (không bị mã hoá, không bị '
                         'dựng thành thẻ) — nhánh "hiển thị đúng chuỗi đã nhập" của cột D.'
                         % mau), du
        if dung_the.get('so_the_dung'):
            return 'F', ('Hộp Chi tiết DỰNG chuỗi %r thành %d thẻ HTML thật thay vì hiện nguyên '
                         'văn — nội dung người dùng nhập được thực thi như mã.'
                         % (mau, dung_the['so_the_dung'])), du
        return 'F', ('Hộp Chi tiết hiện %r thay vì nguyên văn chuỗi đã nhập %r.'
                     % (txt[:80], mau)), du
    finally:
        _dong_hop_chi_tiet(ctx)
        ctx.ve_danh_sach()


# ══════════════════════════════════════════════════════════════════════════════
# §12 (tiếp). Ô NGÀY · BẢNG PHỤ · BREADCRUMB THU HẸP
# ══════════════════════════════════════════════════════════════════════════════
def _truong_cua(case):
    from truong_live import truong_cua
    return truong_cua(case)


def _o_ngay_cua_case(case):
    loai, nhan = _truong_cua(case)
    return nhan if loai == 'ngay' else None


def _pv_o_ngay(case):
    return 'hop' if _pv(case) in ('them', 'sua') else 'man'


def _doc_o_ngay(c, nhan, pv):
    """Thuộc tính THẬT của một ô ngày: kiểu · khuôn · min/max · giá trị đang giữ."""
    return ui._js(c, """
      const e=TIM(%s,%s); if(!e) return 'null';
      return JSON.stringify({the:e.tagName.toLowerCase()+(e.type?'['+e.type+']':''),
        gia_tri:(e.value||''), min:(e.min||e.getAttribute('min')||''),
        max:(e.max||e.getAttribute('max')||''), goi_y:(e.placeholder||''),
        khuon:(e.getAttribute('pattern')||''), native:(e.type==='date'||e.type==='datetime-local'),
        vo_hieu:!!e.disabled, chi_doc:!!e.readOnly});""" % (ui._s(nhan), ui._s(pv)))


@phep('ngay_hop_le', can_ghi=False, loai='UI')
@nhan_dien(lambda cs: (_o_ngay_cua_case(cs) is not None
                       and _bat_ky(_n(cs.b), 'voi ngay hop le', 'chon 1 gia tri cua',
                                   'gioi han khoang ngay cho phep',
                                   'tren cac trinh duyet khac nhau')))
def p_ngay_hop_le(case, ctx):
    """Ô ngày: nhận ngày hợp lệ · giới hạn khoảng · khuôn hiển thị giữa các trình duyệt.

    Ba nhánh, cả ba đo bằng THUỘC TÍNH THẬT của ô (`type`, `min`, `max`, giá trị đọc lại) —
    không nhánh nào tự đặt một khoảng ngày rồi chấm theo khoảng ấy. Nhánh *"trên các trình
    duyệt khác nhau"* cố ý ra `PE`: một lượt chạy chỉ có Chrome thì câu trả lời về Firefox
    và Safari là chưa đo, không phải đạt.
    """
    nhan = _o_ngay_cua_case(case)
    pv = _pv_o_ngay(case)
    dong_form = False
    try:
        if pv == 'hop':
            from phep_live import _mo_form_cua_case
            if not _mo_form_cua_case(ctx, case):
                return None
            dong_form = True
        x = _doc_o_ngay(ctx.c, nhan, pv)
        if not x:
            return None
        nb = _n(case.b)
        du = {'o': nhan, 'pham_vi': pv, 'thuoc_tinh': x, 'muc_bang_chung': 'UI'}
        if 'tren cac trinh duyet khac nhau' in nb:
            return 'PE', ('Ô "%s" là ô ngày %s (type=%s). Lượt chạy tự động chỉ có Chrome nên '
                          'câu hỏi "trên các trình duyệt khác nhau" CHƯA đo được — cần chạy '
                          'lại trên Firefox/Safari, hoặc BA chốt lại phạm vi trình duyệt.'
                          % (nhan, 'GỐC của trình duyệt' if x.get('native') else 'dựng bằng HTML',
                             x.get('the'))), du
        if 'gioi han khoang ngay cho phep' in nb:
            mn, mx = x.get('min'), x.get('max')
            du.update({'gioi_han_min': mn, 'gioi_han_max': mx})
            if not mn and not mx:
                return 'F', ('Ô "%s" KHÔNG khai giới hạn khoảng ngày nào (không có min, không '
                             'có max) nên không chặn được ngày ngoài khoảng cho phép.'
                             % nhan), du
            return 'P', ('Ô "%s" có giới hạn khoảng ngày: min=%r · max=%r.'
                         % (nhan, mn or '(không đặt)', mx or '(không đặt)')), du
        # nhánh "với ngày hợp lệ" / "chọn 1 giá trị": đặt một ngày rồi đọc lại
        hom_nay = time.strftime('%Y-%m-%d')
        ui.dien(ctx.c, nhan, hom_nay if x.get('native') else time.strftime('%d/%m/%Y'), pv)
        time.sleep(0.8)
        sau = _doc_o_ngay(ctx.c, nhan, pv) or {}
        du['gia_tri_sau_khi_nhap'] = sau.get('gia_tri')
        loi = ui.doc_loi(ctx.c, pv if pv == 'hop' else 'man')
        du['loi'] = loi[:2]
        if not (sau.get('gia_tri') or '').strip():
            return 'F', ('Nhập ngày hợp lệ (%s) vào ô "%s" nhưng ô KHÔNG giữ giá trị nào.'
                         % (hom_nay, nhan)), du
        if loi:
            return 'F', ('Nhập ngày hợp lệ (%s) vào ô "%s" mà hệ thống báo lỗi: %r.'
                         % (hom_nay, nhan, loi[0][:90])), du
        return 'P', ('Ô "%s" nhận ngày hợp lệ: nhập %s, ô giữ %r, không có thông báo lỗi.'
                     % (nhan, hom_nay, sau.get('gia_tri'))), du
    finally:
        if dong_form and ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


@phep('rang_buoc_hai_ngay', loai='UI')
@nhan_dien(lambda cs: ('validate rang buoc' in _n(_nhom(cs))
                       and _bat_ky(_n(cs.b), 'lon hon ngay ket thuc', 'bang ngay ket thuc',
                                   'chi nhap ngay bat dau hoac chi nhap ngay ket thuc',
                                   'vung chon cua ngay ket thuc bi gioi han')))
def p_rang_buoc_hai_ngay(case, ctx):
    """Ràng buộc giữa HAI ô ngày của BIỂU MẪU — đo bằng `min`/`max` thật sau khi đặt ô đầu.

    Phép `validate_rang_buoc_ngay` đã có chỉ đọc hai ô ngày trên THANH LỌC (`Từ ngày` /
    `Đến ngày`). Nhóm case này nói về hai ô trong biểu mẫu (`Ngày bắt đầu` / `Ngày kết
    thúc`), nên nó không khớp và 4 case rơi về CHƯA ĐO.
    """
    from phep_live import _mo_form_cua_case
    nb = _n(case.b)
    if not _mo_form_cua_case(ctx, case):
        return None
    try:
        hop = ui.doc_hop_thoai(ctx.c) or {}
        o_ngay = [o.get('nhan') for o in (hop.get('o') or [])
                  if 'date' in str(o.get('the') or '') or qalib.chua_tu(o.get('nhan') or '', 'ngay')]
        o_ngay = [x for x in o_ngay if x]
        if len(o_ngay) < 2:
            return None
        dau = next((x for x in o_ngay if qalib.chua_tu(x, 'bat dau', 'tu')), o_ngay[0])
        cuoi = next((x for x in o_ngay if qalib.chua_tu(x, 'ket thuc', 'den')), o_ngay[-1])
        if _n(dau) == _n(cuoi):
            return None
        t0 = time.strftime('%Y-%m-%d')
        t1 = time.strftime('%Y-%m-%d', time.localtime(time.time() - 3 * 86400))
        du = {'o_dau': dau, 'o_cuoi': cuoi, 'muc_bang_chung': 'UI'}
        if 'vung chon cua ngay ket thuc bi gioi han' in nb:
            ui.dien(ctx.c, dau, t0, 'hop')
            time.sleep(0.7)
            x = _doc_o_ngay(ctx.c, cuoi, 'hop') or {}
            du.update({'dat_o_dau': t0, 'min_cua_o_cuoi': x.get('min'),
                       'max_cua_o_cuoi': x.get('max')})
            if (x.get('min') or '')[:10] == t0:
                return 'P', ('Đặt "%s" = %s thì "%s" bị giới hạn từ %s trở đi (min=%r).'
                             % (dau, t0, cuoi, t0, x.get('min'))), du
            return 'F', ('Đặt "%s" = %s nhưng vùng chọn của "%s" KHÔNG bị giới hạn theo nó '
                         '(min=%r).' % (dau, t0, cuoi, x.get('min') or '(không đặt)')), du
        # ba nhánh còn lại: đặt cả hai ô rồi bấm lưu, đọc thông báo lỗi
        if 'lon hon ngay ket thuc' in nb:
            ui.dien(ctx.c, dau, t0, 'hop')
            ui.dien(ctx.c, cuoi, t1, 'hop')
            mong_chan = True
        elif 'bang ngay ket thuc' in nb:
            ui.dien(ctx.c, dau, t0, 'hop')
            ui.dien(ctx.c, cuoi, t0, 'hop')
            mong_chan = None            # cột D quyết định, không tự đoán
        else:
            ui.dien(ctx.c, dau, t0, 'hop')
            ui.xoa_o(ctx.c, cuoi, 'hop')
            mong_chan = None
        time.sleep(0.8)
        loi = ui.doc_loi(ctx.c, 'hop')
        du.update({'gia_tri_dau': t0, 'gia_tri_cuoi': t1 if 'lon hon' in nb else t0,
                   'loi': loi[:3]})
        if mong_chan is True:
            if loi:
                return 'P', ('Đặt "%s" (%s) LỚN HƠN "%s" (%s): hệ thống chặn với thông báo %r.'
                             % (dau, t0, cuoi, t1, loi[0][:90])), du
            return 'F', ('Đặt "%s" (%s) LỚN HƠN "%s" (%s) mà hệ thống KHÔNG báo lỗi nào.'
                         % (dau, t0, cuoi, t1)), du
        # Cột D không nói rõ chặn hay không -> ghi nguyên quan sát, để người đọc đối chiếu.
        return 'PE', ('Đặt "%s" và "%s" theo đúng ca của cột C; hệ thống %s. Cột D chưa nói rõ '
                      'ca này phải chặn hay cho qua nên KHÔNG tự kết luận — cần BA chốt kỳ vọng.'
                      % (dau, cuoi,
                         'báo lỗi %r' % loi[0][:70] if loi else 'KHÔNG báo lỗi nào')), du
    finally:
        if ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
            ctx.ve_danh_sach()


def _bang_phu(c, ten_nhom):
    """Bảng PHỤ mang tên `ten_nhom` (lịch sử xuất / lịch sử thay đổi) — `None` nếu không có.

    Màn chi tiết của `TangDuLieuDanhMuc` có NHIỀU bảng. Mọi phép đo bảng đang có đều dùng
    `document.querySelector('table')` — tức là bảng ĐẦU TIÊN — nên 10 case của hai bảng phụ
    không có phép đo nào nhận. Ở đây khoanh bảng theo TIÊU ĐỀ đứng gần nó.
    """
    return ui._js(c, """
      const n=QN(%s);
      const bang=[...document.querySelectorAll('table')].filter(HIEN);
      if(!bang.length) return 'null';
      const diem=b=>{let p=b, buoc=0;
        while(p&&buoc<6){ if(QN(TXT(p)).includes(n)) return buoc; p=p.parentElement; buoc++;}
        return 99;};
      const cham=bang.map(b=>({b:b, d:diem(b)})).filter(x=>x.d<99);
      if(!cham.length) return 'null';
      cham.sort((x,z)=>x.d-z.d);
      const b=cham[0].b;
      const th=[...b.querySelectorAll('thead th')].map(TXT).filter(x=>x);
      const tr=[...b.querySelectorAll('tbody tr')].filter(r=>{
        const td=[...r.querySelectorAll('td')];
        return td.length>=2 && !td.some(x=>parseInt(x.getAttribute('colspan')||'1',10)>1);});
      const rong=[...b.querySelectorAll('tbody tr td[colspan]')].filter(HIEN).map(TXT);
      return JSON.stringify({co:true, cot:th, so_dong:tr.length,
        so_bang_tren_man:bang.length, chu_rong:rong.slice(0,2),
        stt:tr.slice(0,30).map(r=>{const td=r.querySelector('td'); return td?TXT(td):'';})});"""
                  % ui._s(ten_nhom))


@phep('bang_phu_tren_man', loai='UI')
@nhan_dien(lambda cs: (_bat_ky(_n(_nhom(cs)), 'danh sach lich su', 'lich su xuat',
                               'lich su thay doi')
                       and _bat_ky(_n(cs.b), 'tieu de cot cua', 'khi khong co du lieu',
                                   'so luong ban ghi tren')))
def p_bang_phu(case, ctx):
    """Bảng PHỤ (lịch sử xuất / lịch sử thay đổi): tiêu đề cột · trạng thái rỗng · số bản ghi.

    Ba nhánh, kỳ vọng lấy từ cột D. Không có bảng nào mang tên ấy trên màn thì trả `None`
    (CHƯA ĐO có lý do) — không mượn bảng đầu tiên, vì mượn là kết luận về một bảng khác.
    """
    ten = _nhom(case)
    b = _bang_phu(ctx.c, qalib.field_of(ten) or ten)
    if not b:
        return None
    nb = _n(case.b)
    du = {'bang': ten, 'so_bang_tren_man': b.get('so_bang_tren_man'),
          'cot_doc_duoc': b.get('cot'), 'so_dong': b.get('so_dong'),
          'muc_bang_chung': 'UI'}
    if 'tieu de cot cua' in nb:
        mong = _RX_MAU_DAC_BIET.findall(case.d or '')
        if not mong:
            mong = [x.strip(' -·') for x in re.split(r'[·,]|\n', case.d or '')
                    if 2 < len(x.strip(' -·')) < 40]
        if not mong:
            return None
        that = b.get('cot') or []
        thieu = [x for x in mong if not any(_n(x) == _n(y) for y in that)]
        du.update({'cot_mong_doi': mong, 'cot_thieu': thieu})
        if not that:
            return 'F', ('Bảng "%s" KHÔNG có tiêu đề cột nào.' % ten), du
        if thieu:
            return 'F', ('Bảng "%s" THIẾU %d/%d cột cột D khai: %s (đọc được: %s).'
                         % (ten, len(thieu), len(mong), ' · '.join(thieu[:5]),
                            ' · '.join(that[:8]))), du
        return 'P', ('Bảng "%s" có đủ %d cột đúng bản khai của cột D: %s.'
                     % (ten, len(mong), ' · '.join(that[:8]))), du
    if 'khi khong co du lieu' in nb:
        du['chu_khi_rong'] = b.get('chu_rong')
        if b.get('so_dong'):
            return None            # đang có dữ liệu -> ca "không có dữ liệu" chưa dựng được
        if b.get('chu_rong'):
            return 'P', ('Bảng "%s" không có dữ liệu: hiện dòng thông báo %r thay vì bảng trống.'
                         % (ten, b['chu_rong'][0][:80])), du
        return 'F', ('Bảng "%s" không có dòng nào nhưng cũng KHÔNG hiện thông báo "không có '
                     'dữ liệu" nào.' % ten), du
    # "số lượng bản ghi trên …"
    pt = ui.doc_phan_trang(ctx.c) or {}
    tong = re.sub(r'[^\d]', '', str(pt.get('tong') or ''))
    du.update({'tong_doc_duoc': tong, 'muc_trang': ctx.hs_so('page_size_mac_dinh', 20)})
    muc = int(ctx.hs_so('page_size_mac_dinh', 20) or 20)
    if b.get('so_dong', 0) > muc:
        return 'F', ('Bảng "%s" hiện %d dòng, vượt mức %d bản ghi/trang.'
                     % (ten, b['so_dong'], muc)), du
    return 'P', ('Bảng "%s" hiện %d dòng, không vượt mức %d bản ghi/trang%s.'
                 % (ten, b.get('so_dong'), muc,
                    ' (tổng %s)' % tong if tong else '')), du


@phep('bang_phu_phan_trang', loai='UI')
@nhan_dien(lambda cs: ('phan trang' in _n(_nhom(cs)) and _pv(cs) == 'chi_tiet'
                       and _bat_ky(_n(cs.b), 'cach danh so cac ban ghi', 'hien thi 20 ban ghi',
                                   'hien thi < 20 ban ghi', 'hien thi 21 ban ghi')))
def p_bang_phu_phan_trang(case, ctx):
    """Cụm phân trang của BẢNG TRONG MÀN CHI TIẾT — đo trên đúng bảng ấy, không mượn bảng đầu."""
    b = ui._js(ctx.c, """
      const bang=[...document.querySelectorAll('table')].filter(HIEN);
      if(!bang.length) return 'null';
      const b=bang[bang.length-1];
      const tr=[...b.querySelectorAll('tbody tr')].filter(r=>{
        const td=[...r.querySelectorAll('td')];
        return td.length>=2 && !td.some(x=>parseInt(x.getAttribute('colspan')||'1',10)>1);});
      return JSON.stringify({so_bang:bang.length, so_dong:tr.length,
        stt:tr.slice(0,30).map(r=>{const td=r.querySelector('td'); return td?TXT(td):'';})});""")
    if not b or not b.get('so_dong'):
        return None
    nb = _n(case.b)
    pt = ui.doc_phan_trang(ctx.c) or {}
    muc = int(ctx.hs_so('page_size_mac_dinh', 20) or 20)
    du = {'so_bang_tren_man': b.get('so_bang'), 'so_dong': b['so_dong'], 'muc_trang': muc,
          'so_nut_trang': pt.get('so_nut_trang'), 'muc_bang_chung': 'UI'}
    if 'cach danh so cac ban ghi' in nb:
        stt = [int(re.sub(r'\D', '', x)) for x in (b.get('stt') or []) if re.sub(r'\D', '', x)]
        du['stt_doc_duoc'] = stt[:25]
        if len(stt) < 2:
            return None
        mong = list(range(stt[0], stt[0] + len(stt)))
        if stt == mong:
            return 'P', ('Cột STT của bảng trong màn chi tiết đánh số tăng dần liên tục %d…%d.'
                         % (stt[0], stt[-1])), du
        return 'F', ('Cột STT của bảng trong màn chi tiết KHÔNG tăng dần liên tục: %s.'
                     % ', '.join(str(x) for x in stt[:12])), du
    nhieu = 'hien thi 21' in nb
    co_nut = ui.nhieu_trang(pt)
    if nhieu != (b['so_dong'] > muc) and nhieu:
        return None                # chưa dựng được ca >20 dòng trên bảng phụ
    if b['so_dong'] <= muc:
        if not co_nut:
            return 'P', ('Bảng trong màn chi tiết có %d dòng ≤ %d/trang: không hiện cụm phân '
                         'trang — đúng yêu cầu.' % (b['so_dong'], muc)), du
        return 'F', ('Bảng trong màn chi tiết có %d dòng ≤ %d/trang nhưng vẫn hiện %s nút trang.'
                     % (b['so_dong'], muc, pt.get('so_nut_trang'))), du
    if co_nut:
        return 'P', ('Bảng trong màn chi tiết có %d dòng > %d/trang: cụm phân trang hiện với %s '
                     'nút trang.' % (b['so_dong'], muc, pt.get('so_nut_trang'))), du
    return 'F', ('Bảng trong màn chi tiết có %d dòng > %d/trang nhưng KHÔNG thấy cụm phân trang.'
                 % (b['so_dong'], muc)), du


@phep('breadcrumb_thu_hep', loai='GEOMETRY')
@nhan_dien(lambda cs: (_n(_nhom(cs)) == 'breadcrumb'
                       and _bat_ky(_n(cs.b), 'thu hep cua so trinh duyet', 'thu nho man hinh',
                                   'man hinh nho')))
def p_breadcrumb_thu_hep(case, ctx):
    """Thu hẹp khung nhìn rồi đo breadcrumb — có xuống dòng/rút gọn hay tràn ngang.

    Đổi kích thước khung nhìn bằng `Emulation.setDeviceMetricsOverride` (thao tác của TRÌNH
    DUYỆT, không chạm máy chủ), và **trả khung nhìn về nguyên trạng** ở `finally` — case sau
    chạy trong một khung nhìn 500px thì mọi kết luận hình học đều sai.
    """
    truoc = ui.doc_breadcrumb(ctx.c)
    if not truoc:
        return None
    ctx.cong.hanh_dong('doi_zoom', 'thu hẹp khung nhìn để đo breadcrumb')
    rong_hep = 480
    try:
        ctx.c.ws.call('Emulation.setDeviceMetricsOverride', width=rong_hep, height=800,
                      deviceScaleFactor=1, mobile=False)
        time.sleep(1.0)
        do = ui._js(ctx.c, """
          const n=document.querySelector('nav[aria-label*="readcrumb" i],nav[aria-label*="ường dẫn" i],'
            +'[class*=breadcrumb i]');
          if(!n) return 'null';
          const r=n.getBoundingClientRect(); const st=getComputedStyle(n);
          return JSON.stringify({rong:Math.round(r.width), cao:Math.round(r.height),
            tran_ngang:r.right>innerWidth+2, cuon_ngang:n.scrollWidth>n.clientWidth+2,
            xuong_dong:st.flexWrap, chu:TXT(n).slice(0,160), khung:innerWidth});""")
        if not do:
            return None
        du = dict(do, breadcrumb_binh_thuong=truoc, khung_nhin_thu_hep=rong_hep,
                  muc_bang_chung='GEOMETRY')
        if do.get('tran_ngang'):
            return 'F', ('Thu hẹp cửa sổ còn %dpx: breadcrumb TRÀN ra ngoài khung nhìn '
                         '(rộng %dpx / khung %dpx).'
                         % (rong_hep, do.get('rong'), do.get('khung'))), du
        return 'P', ('Thu hẹp cửa sổ còn %dpx: breadcrumb vừa trong khung nhìn (rộng %dpx, '
                     'cao %dpx%s).'
                     % (rong_hep, do.get('rong'), do.get('cao'),
                        ', cuộn ngang được' if do.get('cuon_ngang') else '')), du
    finally:
        try:
            ctx.c.ws.call('Emulation.clearDeviceMetricsOverride')
            time.sleep(0.6)
        except Exception:
            pass


@phep('luoi_the_mac_dinh', loai='UI')
@nhan_dien(lambda cs: (_bat_ky(_n(_nhom(cs)), 'luoi the', 'the bo danh muc')
                       and _co(_n(cs.b), 'gia tri mac dinh')))
def p_luoi_the(case, ctx):
    """Lưới thẻ khi mở màn: có thẻ nào không, mỗi thẻ mang những gì — đối chiếu cột D."""
    kq = ui._js(ctx.c, """
      const ds=[...document.querySelectorAll('[class*=card i],[class*=grid i] > div,'
        +'[role=listitem],li')].filter(HIEN)
        .filter(e=>e.children.length>=1 && TXT(e).length>3 && TXT(e).length<260
                   && !e.closest('table') && !e.closest('nav'));
      const loc=ds.filter(e=>!ds.some(o=>o!==e&&e.contains(o)));
      return JSON.stringify({so_the:loc.length, mau:loc.slice(0,4).map(e=>TXT(e).slice(0,90))});""")
    if not kq or not kq.get('so_the'):
        return None
    du = dict(kq, muc_bang_chung='UI')
    mong = _RX_MAU_DAC_BIET.findall(case.d or '')
    du['chu_mong_doi_cot_D'] = mong
    if mong:
        chu = ' '.join(kq.get('mau') or [])
        thieu = [x for x in mong if _n(x) not in _n(chu)]
        du['thieu'] = thieu
        if thieu:
            return 'F', ('Lưới thẻ hiện %d thẻ nhưng THIẾU nội dung cột D khai: %s.'
                         % (kq['so_the'], ' · '.join(thieu[:4]))), du
    return 'P', ('Mở màn: lưới thẻ hiện sẵn %d thẻ (ví dụ: %s).'
                 % (kq['so_the'], ' | '.join((kq.get('mau') or [])[:2]))), du


@phep('giao_dien_liet_ke_popup', loai='UI')
@nhan_dien(lambda cs: ('giao dien chung' in _n(_nhom(cs))
                       and _co(_n(cs.b), 'hien thi day du cac thong tin')
                       and '[tieu de popup]' in _n(cs.d)))
def p_giao_dien_popup(case, ctx):
    """Liệt kê thành phần của một POPUP — mở popup rồi mới quét, không quét màn nền.

    Cột D của lớp case này mở đầu bằng dòng `[Tiêu đề popup] <tên>`, nghĩa là các thành phần
    được liệt kê nằm TRONG hộp thoại chứ không trên màn danh sách. `giao_dien_liet_ke` quét
    màn nền nên nó hoặc trả `None` hoặc chấm F cho một hộp thoại chưa từng được mở.

    Quét bằng `man_live.kho_tren_man(trong_hop=True)` — kho 8 nguồn đã có (nút · ô · cột ·
    control TRONG DÒNG · cụm phân trang · thẻ · breadcrumb), không phải `kho_control()` suy
    từ hồ sơ màn. §12.E của chỉ thị đòi đúng điều đó: đối chiếu với GIAO DIỆN ĐÃ RENDER.
    """
    from man_live import thanh_phan_cot_d, kho_tren_man, _khop_kho
    ds = thanh_phan_cot_d(case.d)
    tieu_de = ''
    m = re.search(r'\[Tiêu đề popup\]\s*([^\n]+)', case.d or '')
    if m:
        tieu_de = m.group(1).strip()
    if not ds and not tieu_de:
        return None
    mo_bang = _mo_popup_cua_cn(ctx, case)
    if not mo_bang:
        return None
    try:
        if not ui.hop_cua_ta_con_mo(ctx.c):
            return 'F', ('Không mở được popup %r của chức năng %r nên không đối chiếu được '
                         'danh sách thành phần cột D.'
                         % (tieu_de or '(chưa khai tên)', case.nhom.get('cn'))), {
                'cach_mo': mo_bang, 'muc_bang_chung': 'UI'}
        hop = ui.doc_hop_thoai(ctx.c) or {}
        kho = kho_tren_man(ctx.c, True) or []
        du = {'tieu_de_popup_cot_D': tieu_de, 'tieu_de_popup_that': hop.get('tieu_de'),
              'cach_mo': mo_bang, 'so_thanh_phan_cot_D': len(ds), 'kho_doc_duoc': len(kho),
              'muc_bang_chung': 'UI'}
        loi = []
        if tieu_de and _n(tieu_de) not in _n(hop.get('tieu_de') or ''):
            loi.append('tiêu đề popup là %r, cột D khai %r'
                       % (hop.get('tieu_de'), tieu_de))
        thieu = [x['nhan'] for x in ds if not _khop_kho(kho, x['nhan'])]
        du['thieu'] = thieu
        if thieu:
            loi.append('thiếu %d/%d thành phần: %s'
                       % (len(thieu), len(ds), ' · '.join(thieu[:6])))
        if loi:
            return 'F', ('Popup %r: %s.' % (hop.get('tieu_de'), ' · '.join(loi))), du
        return 'P', ('Popup %r hiện đủ %d/%d thành phần cột D liệt kê%s.'
                     % (hop.get('tieu_de'), len(ds), len(ds),
                        ', tiêu đề đúng nguyên văn' if tieu_de else '')), du
    finally:
        if ui.co_hop_thoai(ctx.c):
            ui.dong_hop(ctx.c)
        ctx.ve_danh_sach()


def _mo_popup_cua_cn(ctx, case):
    """Mở popup ỨNG VỚI chức năng của case. -> mô tả cách đã mở, hoặc `None`.

    Chọn lối mở theo TÊN CN (Xem chi tiết → biểu tượng xem · Thêm mới → nút đầu màn · Chỉnh
    sửa → biểu tượng sửa · Xoá → biểu tượng xoá · Kích hoạt/Ngừng → biểu tượng tương ứng),
    chứ không thử lần lượt mọi nút cho tới khi có hộp nào mở ra — thử mò là mở nhầm popup
    rồi đối chiếu danh sách thành phần của popup khác.
    """
    cn = _n(case.nhom.get('cn') or '')
    if qalib.chua_tu(cn, 'xem chi tiet', 'chi tiet'):
        hop, bam = _mo_hop_chi_tiet(ctx)
        return 'bấm biểu tượng %r ở dòng đầu' % _nhan_icon_xem(ctx) if hop else None
    if qalib.chua_tu(cn, 'them', 'them moi'):
        return 'bấm %r' % ctx.nut_them() if ui.mo_hop(ctx.c, ctx.nut_them()) else None
    dong = (ui.doc_bang(ctx.c) or [None])[0]
    ma = None
    if dong:
        for k, v in (dong.get('o') or {}).items():
            if qalib.chua_tu(k, 'code', 'ma'):
                ma = (v or '').strip()
                break
    nhan = None
    if qalib.chua_tu(cn, 'chinh sua', 'cap nhat', 'sua'):
        from phep_live import _icon_sua
        nhan = _icon_sua(ctx)
    elif qalib.chua_tu(cn, 'xoa'):
        nhan = _nhan_icon_xoa(ctx)
    else:
        for x in (ctx.vb('icon_ban_ghi') or []):
            if qalib.chua_tu(cn, *_n(str(x)).split()):
                nhan = str(x)
                break
    if not nhan:
        return None
    if ma:
        r = ui.bam_trong_dong(ctx.c, ma, nhan)
    else:
        r = ui.bam(ctx.c, nhan, 'man', cho=1.2)
    time.sleep(1.2)
    return 'bấm %r trên dòng %s' % (nhan, ma or 'đầu tiên') if r else None


# ── nhập giá trị đặc thù -> lưu -> mở lại (tiếng Việt · khoảng trắng · ô số) ──────────
_DAU_LUU_MO_LAI = (
    ('tieng viet', ('tieng viet co dau', 'chu tieng viet'),
     ('view len binh thuong', 'khong bi loi font', 'khong loi font')),
    ('cat_space', ('cat khoang trang', 'khoang trang o dau va cuoi', 'space o dau'),
     ('tu cat khoang trang', 'cat khoang trang')),
    ('o_so', ('nhap chu va ky tu dac biet', 'nhap chu'),
     ('khong bi ma hoa', 'thuc hien thanh cong')),
)


def _lop_luu_mo_lai(cs):
    """Case này thuộc lớp *nhập giá trị đặc thù rồi lưu* nào? -> tên lớp, hoặc `None`."""
    if _pv(cs) not in ('them', 'sua'):
        return None
    b, d = _n(cs.b), _n(cs.d)
    for ten, tu_b, tu_d in _DAU_LUU_MO_LAI:
        if qalib.chua_tu(b, *tu_b) and qalib.chua_tu(d, *tu_d):
            return ten
    return None


@phep('truong_luu_mo_lai', can_ghi=True, loai='UI')
@nhan_dien(lambda cs: _lop_luu_mo_lai(cs) is not None and _o_cua_case(cs) is not None)
def p_truong_luu_mo_lai(case, ctx):
    """Nhập giá trị đặc thù -> LƯU -> MỞ LẠI -> đọc lên có đúng như cột D đòi không.

    Ba lớp case dùng chung vòng thao tác với `ky_tu_dac_biet_luu_lai`, khác nhau ở phép SO
    SÁNH lúc đọc lên — và chính chỗ khác nhau ấy là lý do phải tách thành phép riêng:

      · `tieng viet`  — cột D đòi *"view lên bình thường, không bị lỗi font"*: chuỗi đọc lên
                        phải TRÙNG KHÍT, vì mất dấu là đổi ký tự chứ không đổi độ dài.
      · `cat_space`   — cột D đòi *"tự cắt khoảng trắng hai đầu"*: đọc lên phải bằng chuỗi đã
                        `strip()`, và NẾU còn nguyên khoảng trắng thì F.
      · `o_so`        — ô số: gõ chữ vào rồi lưu, cột D đòi lưu được bình thường.

    7 case của `ViTriLuuTru` nằm ở lớp này, trước đây rơi vào `truong_nhap_gia_tri` — phép ấy
    chỉ gõ vào ô rồi đọc lại ô, không đi qua bước LƯU, nên không trả lời được câu của cột D và
    trả `None`.
    """
    lop = _lop_luu_mo_lai(case)
    o = _o_cua_case(case)
    if not (lop and o):
        return None
    mau = _RX_MAU_DAC_BIET.findall(case.c or '')
    gia_tri, nguon_gt = None, 'nguyên văn cột C'
    for x in mau:
        if x.strip() and not _n(x).startswith(('chuoi ket noi', 'mo ta', 'port mac dinh',
                                               'database mac dinh', 'ten schema')):
            gia_tri = x
            break
    if gia_tri is None:
        gia_tri = qalib.mau_nhap_khai(case.b or '')
        nguon_gt = 'bảng chuỗi mẫu khai ở qalib'
    if gia_tri is None:
        return None
    r = _nhap_luu_doc_lai(case, ctx, o, gia_tri, nguon_gt)
    if r is None:
        return None
    du, doc_lai, nguon = r['du'], r['doc_lai'], r['nguon']
    du['lop_case'] = lop
    if r.get('ket'):
        return r['ket']
    if doc_lai is None:
        return None
    if lop == 'cat_space':
        if doc_lai == gia_tri.strip():
            return 'P', ('Nhập %r (có khoảng trắng hai đầu) vào ô "%s", lưu rồi mở lại (%s): '
                         'giá trị lưu là %r — hệ thống đã tự cắt khoảng trắng hai đầu.'
                         % (gia_tri, o, nguon, doc_lai)), du
        if doc_lai == gia_tri:
            return 'F', ('Nhập %r vào ô "%s", lưu rồi mở lại (%s): giá trị lưu GIỮ NGUYÊN cả '
                         'khoảng trắng hai đầu — cột D đòi phải tự cắt.'
                         % (gia_tri, o, nguon)), du
        return 'F', ('Nhập %r vào ô "%s", lưu rồi mở lại (%s): giá trị lưu là %r — không phải '
                     'chuỗi đã cắt khoảng trắng (%r).'
                     % (gia_tri, o, nguon, doc_lai, gia_tri.strip())), du
    if doc_lai == gia_tri:
        ly = ('hiển thị đúng, không lỗi font' if lop == 'tieng viet'
              else 'ô lưu và hiển thị lại đúng nguyên chuỗi')
        return 'P', ('Nhập %r vào ô "%s", lưu rồi mở lại (%s): giá trị đọc lên ĐÚNG nguyên '
                     'chuỗi đã nhập — %s.' % (gia_tri, o, nguon, ly)), du
    return 'F', ('Nhập %r vào ô "%s", lưu rồi mở lại (%s): giá trị đọc lên là %r — khác chuỗi '
                 'đã nhập.' % (gia_tri, o, nguon, doc_lai)), du


# ══════════════════════════════════════════════════════════════════════════════
def phep_cua(case, cho_phep_ghi=True):
    for p in PHEP_BOSUNG:
        if p['can_ghi'] and not cho_phep_ghi:
            continue
        try:
            if p['nhan'](case):
                return p['ten']
        except Exception:
            continue
    return None

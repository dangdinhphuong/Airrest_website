# -*- coding: utf-8 -*-
"""CỘT C -> HÀNH ĐỘNG CÓ CẤU TRÚC -> THAO TÁC THẬT  (mới 2026-09-16).

Bộ phép của `phep_live.py` nhận case bằng cách khớp LỜI VĂN CỘT B rồi tự viết kịch bản thao
tác cho từng lớp case. Cách ấy chính xác nhưng không nhân rộng được: mỗi lớp case mới là một
phép mới, và 867/3.365 case của bộ `ChuyenVien` không có phép nào nhận.

Khối này đọc **cột C — Các bước** và dịch sang một danh sách hành động có cấu trúc:

    navigate · click · input · select · check · upload · wait · search · filter ·
    sort · paginate · hover · scroll · key · verify · cleanup

Sau đó `thuc_thi()` chạy đúng danh sách ấy trên màn thật. Nhờ vậy một phép đo chỉ còn phải
lo phần *kỳ vọng* (cột D), còn phần *thao tác* thì dùng chung.

Bốn luật:

  ① **Không đoán.** Bước nào không dịch được ra hành động thì mang `loai='?'` và người gọi
     biết mình chưa chạy trọn cột C — trả `None` chứ không chấm.
  ② **Không tự nới quyền.** Mọi hành động đổi dữ liệu (`click` nút chốt) chỉ chạy khi người
     gọi đưa `cho_ghi` — cùng đường qua `Cong.ghi()` như mọi chỗ khác.
  ③ **Định vị theo NGỮ CẢNH.** Nhãn · chữ trên nút · placeholder · aria-label · vai trò ·
     href · dòng/cột của bảng. KHÔNG bao giờ dùng một selector kiểu `input[type=text]` để
     kết luận "màn không có control" — đó là lỗi đã ghi ở §giao_thuc_do_luong.
  ④ **Bỏ dấu trước khi so.** Mọi so khớp tiếng Việt đi qua `qalib.norm`.
"""
import re
import time

import qalib
import live_ui as ui

_s = ui._s


def _n(s):
    return qalib.norm(s or '')


# ══════════════════════════════════════════════════════════════════════════════
# 1. TÁCH BƯỚC
# ══════════════════════════════════════════════════════════════════════════════
# Cột C viết theo khuôn `1. …\n2. …`. Một số case viết liền một dòng có nhiều câu; tách theo
# số thứ tự TRƯỚC, không có số thì tách theo xuống dòng, vẫn không có thì để nguyên một bước.
_RX_STT = re.compile(r'(?m)^\s*(\d{1,2})\s*[.)]\s*')


def tach_buoc(c_text):
    """Cột C -> [chuỗi bước]. Giữ nguyên lời văn, chỉ bỏ số thứ tự."""
    t = str(c_text or '').replace('\r', '')
    if not t.strip():
        return []
    if _RX_STT.search(t):
        phan = _RX_STT.split(t)
        ra = []
        for i in range(1, len(phan), 2):
            x = (phan[i + 1] if i + 1 < len(phan) else '').strip()
            if x:
                ra.append(x)
        if ra:
            return ra
    return [x.strip() for x in t.split('\n') if x.strip()]


# ══════════════════════════════════════════════════════════════════════════════
# 2. DỊCH MỘT BƯỚC -> HÀNH ĐỘNG
# ══════════════════════════════════════════════════════════════════════════════
# Chuỗi trong ngoặc kép là NGUỒN CHÍNH của tên control: bộ case sinh ra luôn đặt nhãn ô và
# chữ trên nút trong ngoặc kép (`PROMPT-gen-testcase-v3` §7.3). Ngoặc đơn là chú thích, KHÔNG
# phải tên control — lấy nhầm nó là gõ vào một ô không tồn tại rồi báo "không thấy ô".
_RX_NHAY = re.compile(r'["“”]([^"“”]{1,80})["“”]')

# Nút CHỐT — bấm là dữ liệu đổi. Chia hai mức vì cùng một chữ mang hai nghĩa tuỳ chỗ đứng:
#   · `CHOT_LUON`  bấm ở đâu cũng là ghi (`Lưu` · `Cập nhật` · `Xóa` · `Xác nhận` …);
#   · `CHOT_TRONG_HOP` chỉ là ghi khi đứng TRONG hộp thoại. `Thêm mới` ở đầu màn danh sách
#     MỞ biểu mẫu (thao tác đọc, `probe_live` vẫn làm từ 09/09), còn `Thêm mới` trong hộp
#     thoại là nút chốt của chính biểu mẫu ấy (xem `form_them.nut` của hồ sơ màn ViTriLuuTru:
#     `["Hủy", "Thêm mới"]`). Đánh cứng một nghĩa thì hoặc chặn mất đường mở biểu mẫu, hoặc
#     bấm nút ghi mà không qua cổng.
CHOT_LUON = ('luu', 'cap nhat', 'xac nhan', 'dong y', 'duyet', 'tu choi', 'gui', 'xoa',
             'ap dung', 'kich hoat', 'ngung hoat dong')
CHOT_TRONG_HOP = ('tao', 'them', 'ghi lai', 'hoan tat', 'chuyen trang thai', 'khoi phuc')


def _la_nut_chot(ten, pham_vi):
    """Nút này bấm vào là ĐỔI DỮ LIỆU? — fail-closed khi không rõ phạm vi."""
    n = _n(ten or '')
    if not n:
        return False
    if any(re.search(r'(^|\W)%s(\W|$)' % k, n) for k in CHOT_LUON):
        return True
    if any(re.search(r'(^|\W)%s(\W|$)' % k, n) for k in CHOT_TRONG_HOP):
        # `man` = đang đứng ở màn danh sách -> mở biểu mẫu. `hop`/`auto` -> coi là chốt.
        return pham_vi != 'man'
    return False


class HanhDong(dict):
    """Một hành động: `{'loai','muc_tieu','gia_tri','pham_vi','ghi','buoc'}`."""

    def __repr__(self):
        return '<%s %s%s>' % (self.get('loai'), self.get('muc_tieu') or '',
                             (' = %r' % self['gia_tri']) if self.get('gia_tri') else '')


def _hd(loai, buoc, muc_tieu=None, gia_tri=None, pham_vi='auto', ghi=False, **kw):
    d = HanhDong(loai=loai, buoc=buoc, muc_tieu=muc_tieu, gia_tri=gia_tri,
                 pham_vi=pham_vi, ghi=ghi)
    d.update(kw)
    return d


def dich_buoc(buoc, pham_vi='auto'):
    """Một bước -> `HanhDong`. `loai='?'` khi không dịch được (luật ①)."""
    b = str(buoc or '').strip()
    nb = _n(b)
    nhay = _RX_NHAY.findall(b)
    ten, gia_tri_nhay = _o_va_gia_tri(b, nhay)

    # ── điều hướng ───────────────────────────────────────────────────────────
    if re.search(r'^(vao|mo|truy cap|dieu huong|chuyen den) ', nb) and 'man' in nb:
        return _hd('navigate', b, ten)
    if re.search(r'^(dang nhap|login)', nb):
        return _hd('login', b)
    if re.search(r'(tai lai trang|f5|refresh trang|nap lai trang)', nb):
        return _hd('navigate', b, None, lam_moi=True)

    # ── bàn phím ─────────────────────────────────────────────────────────────
    m = re.search(r'(nhan|go|bam) phim (tab|shift\s*\+\s*tab|enter|esc\w*|space)', nb)
    if m:
        bang = {'tab': 'Tab', 'enter': 'Enter', 'space': 'Space'}
        p = m.group(2)
        phim = ('Shift+Tab' if 'shift' in p else
                ('Escape' if p.startswith('esc') else bang.get(p, 'Tab')))
        return _hd('key', b, phim)

    # ── chuột ────────────────────────────────────────────────────────────────
    if re.search(r'(re chuot|di chuot|hover|tro chuot)', nb):
        return _hd('hover', b, ten, pham_vi=pham_vi)
    if re.search(r'(cuon (xuong|len|trang)|scroll)', nb):
        return _hd('scroll', b, 'dau' if 'len' in nb else 'cuoi')
    if re.search(r'(click|bam) (lien tuc|nhieu lan|nhanh|dup|hai lan|2 lan)', nb):
        so = 2 if re.search(r'(dup|hai lan|2 lan)', nb) else 4
        return _hd('click_nhieu', b, ten, so_lan=so, pham_vi=pham_vi, ghi=True)

    # ── tệp ──────────────────────────────────────────────────────────────────
    if re.search(r'(tai len|upload|chon (tep|file)|dinh kem|nhap excel|import)', nb):
        return _hd('upload', b, ten, pham_vi=pham_vi)

    # ── điền phần còn lại của biểu mẫu ───────────────────────────────────────
    # Bước `Các thông tin khác nhập hợp lệ` xuất hiện ở gần như MỌI case validate của bộ
    # case. Không dịch được nó thì phép đo tưởng mình đã chạy trọn cột C trong khi biểu mẫu
    # còn ô bắt buộc bỏ trống — và lỗi validate đọc được sẽ là lỗi của ô KHÁC.
    if re.search(r'(thong tin|truong|o) (khac|con lai).*(hop le|dung|day du)', nb) \
            or re.search(r'nhap.{0,20}(hop le|day du).{0,12}(cac )?(thong tin|truong|o)'
                         r'.{0,12}(khac|con lai)', nb) \
            or re.search(r'(nhap|chon).{0,3}(nhap|chon)? ?hop le cac (truong|thong tin|o)', nb) \
            or re.search(r'^nhap (du|day du|dung) (cac )?(truong|thong tin|o)', nb):
        return _hd('dien_con_lai', b, None, pham_vi=pham_vi)

    # ── ô nhập ───────────────────────────────────────────────────────────────
    if re.search(r'^(de trong|bo trong|xoa rong|xoa het|khong nhap|de rong)', nb):
        return _hd('input', b, ten, '', pham_vi=pham_vi)
    m = re.search(r'(copy|sao chep).*(dan|paste)', nb)
    if m:
        return _hd('paste', b, ten, _gia_tri_trong_buoc(b, ten), pham_vi=pham_vi)
    if re.search(r'^(nhap|go|dien|nhap vao|dan)', nb) and not re.search(r'^(nhap excel)', nb):
        if re.search(r'(tim kiem|o tim|tu khoa|tim theo)', nb):
            return _hd('search', b, ten, _gia_tri_trong_buoc(b, ten), pham_vi='man')
        return _hd('input', b, ten, _gia_tri_trong_buoc(b, ten), pham_vi=pham_vi)

    # ── ô chọn / tích chọn ───────────────────────────────────────────────────
    # ⚠️ Biên từ là bắt buộc ở đây. Bản đầu khớp `dong` trơn để bắt *"chọn dòng"*, và
    # `Chọn "Trạng thái" là "Hoạt động"` -> normalize thành `... hoat dong` ⇒ khớp ⇒ một
    # bước CHỌN GIÁ TRỊ bị dịch thành TÍCH CHỌN. Cùng lớp lỗi với `_DT_THAO_TAC` thiếu biên
    # từ ở `qalib.thao_tac_ghi` (chữ `an` khớp vào giữa chữ `màn`).
    if re.search(r'^(chon|lua chon)', nb):
        if len(nhay) >= 2:
            return _hd('select', b, ten, nhay[1], pham_vi=pham_vi)
        if re.search(r'(\bo tich\b|\bcheckbox\b|\btich chon\b|\bdong\b|\bban ghi\b)', nb):
            return _hd('check', b, ten, True, pham_vi=pham_vi)
        return _hd('select', b, ten, None, pham_vi=pham_vi)
    if re.search(r'^(bo tich|bo chon)', nb):
        return _hd('check', b, ten, False, pham_vi=pham_vi)
    if re.search(r'^(tich|danh dau)', nb):
        return _hd('check', b, ten, True, pham_vi=pham_vi)

    # ── bảng ─────────────────────────────────────────────────────────────────
    if re.search(r'(sap xep|sort|bam .*tieu de cot)', nb):
        return _hd('sort', b, ten, pham_vi='man')
    # ⚠️ `chuyen trang` KHÔNG được khớp trơn: `chuyển trạng thái` normalize thành
    # `chuyen trang thai` và bị nhận nhầm thành LẬT TRANG — một bước bấm icon đổi trạng thái
    # biến thành bấm nút số trang. Cùng lớp lỗi với `dong` khớp vào giữa `Hoạt động`.
    if re.search(r'(chuyen sang trang|lat trang|sang trang|trang (ke tiep|sau)\b'
                 r'|chuyen trang\s*\d|trang\s*\d)', nb) and 'trang thai' not in nb:
        m = re.search(r'trang\s*(\d+)', nb)
        return _hd('paginate', b, None, int(m.group(1)) if m else 2, pham_vi='man')
    if re.search(r'(loc|filter)', nb) and re.search(r'^(ap dung|chon bo loc|loc theo)', nb):
        return _hd('filter', b, ten, nhay[1] if len(nhay) > 1 else None, pham_vi='man')

    # ── bấm nút ──────────────────────────────────────────────────────────────
    if re.search(r'^(bam|click|nhan|chon nut|bam vao|click vao)', nb) or re.search(
            r'(bam nut|click nut|nhan nut)', nb):
        if ten is None:
            ten = _ten_nut_khong_ngoac(b)
        return _hd('click', b, ten, pham_vi=pham_vi, ghi=_la_nut_chot(ten, pham_vi))

    # ── đối chiếu ────────────────────────────────────────────────────────────
    if re.search(r'^(kiem tra|doi chieu|quan sat|xem|so sanh|xac nhan)', nb):
        return _hd('verify', b, ten, pham_vi=pham_vi)
    if re.search(r'^(xoa du lieu test|don du lieu|cleanup)', nb):
        return _hd('cleanup', b, ten)
    if re.search(r'^(cho|doi)\b', nb):
        m = re.search(r'(\d+)\s*(giay|s|ms|mili)', nb)
        return _hd('wait', b, None, float(m.group(1)) if m else 1.0)
    return _hd('?', b, ten)


# Chuỗi trong ngoặc kép nào là TÊN Ô: chuỗi đứng ngay sau `ô` / `trường` / `ô nhập` / `cột`.
_RX_LA_O = re.compile(r'(?:ô|o|trường|truong|cột|cot|mục|muc|nút|nut|icon)\s*'
                      r'["“”]([^"“”]{1,80})["“”]', re.I)


def _o_va_gia_tri(b, nhay):
    """(tên ô, giá trị) rút từ các chuỗi trong ngoặc kép của một bước.

    Bộ case viết cả hai thứ tự: `Nhập "abc" vào ô "Tên hiển thị"` và `Nhập vào ô "Code" giá
    trị "abc"`. Lấy cứng "chuỗi đầu là tên ô" thì ca thứ nhất gõ tên ô vào một ô không tồn
    tại rồi báo *"không thấy ô abc"* — một kết luận về bộ dò, không về app. Nên tên ô được
    nhận ra bằng TỪ DẪN đứng trước (`ô` · `trường` · `cột` · `nút`), còn lại là giá trị.
    """
    if not nhay:
        return None, None
    co_dan = _RX_LA_O.findall(b)
    if co_dan:
        ten = co_dan[0]
        con = [x for x in nhay if x != ten]
        return ten, (con[0] if con else None)
    return nhay[0], (nhay[1] if len(nhay) > 1 else None)


def _gia_tri_trong_buoc(b, ten):
    """Giá trị mà bước bảo nhập. `None` = phép đo tự dựng (ngưỡng, chuỗi tấn công…).

    Bước chỉ có một chuỗi trong ngoặc kép thì đó là TÊN Ô và giá trị do phép đo dựng — không
    được lấy tên ô làm giá trị (đã thấy ca gõ chữ "Code" vào chính ô Code rồi chấm F).
    """
    return _o_va_gia_tri(b, _RX_NHAY.findall(b))[1]


# Chữ nối cắt đuôi tên nút: `Bấm nút tìm kiếm hoặc nhấn Enter` -> nút là `tìm kiếm`.
# Không cắt thì tên nút thành cả câu và không locator nào khớp — rồi phép đo báo "không thấy
# nút", một kết luận về bộ dò chứ không về app.
_RX_CAT_NUT = re.compile(r'\s+(?:hoặc|hay|rồi|và|sau đó|để|trên|trong)\s', re.I)


def _ten_nut_khong_ngoac(b):
    """Chữ trên nút khi bộ case không đặt trong ngoặc kép (`Bấm nút Tìm kiếm`).

    Nhận cả chữ THƯỜNG: bộ case viết cả `Bấm nút "Lưu"` lẫn `Bấm nút tìm kiếm`. Đòi chữ hoa
    là bỏ sót nguyên một lối viết.
    """
    for rx in (r'(?:n[úu]t|button|bi[eể]u t[uượ]ợng|icon)\s+([^.,;\n"]{1,40})',
               r'^(?:B[ấa]m|Click|Nh[ấa]n)\s+(?:v[àa]o\s+)?([^.,;\n"]{1,40})'):
        m = re.search(rx, b.strip(), re.I)
        if not m:
            continue
        ten = _RX_CAT_NUT.split(m.group(1))[0].strip().rstrip('.').strip()
        if ten and len(ten) >= 2:
            return ten
    return None


def dich(c_text, pham_vi='auto'):
    """Cột C -> [HanhDong]."""
    return [dich_buoc(x, pham_vi) for x in tach_buoc(c_text)]


def chua_dich_duoc(ds):
    return [x for x in ds if x.get('loai') == '?']


# ══════════════════════════════════════════════════════════════════════════════
# 3. ĐỊNH VỊ CONTROL — nhiều lối, thử hết rồi mới nói "không có"
# ══════════════════════════════════════════════════════════════════════════════
def tim_control(c, ten, pham_vi='auto'):
    """Control khớp `ten` theo NHIỀU lối định vị. -> {'the','nhan','goi_y',…} hoặc `None`.

    Thứ tự thử (luật ③): nhãn `<label for>` -> nhãn của khối bọc -> `aria-label`/`title` ->
    `placeholder` -> `name`/`id` -> chữ ngay trước ô. Hết cả sáu lối mới trả `None`, và khi
    ấy phép đo được quyền nói "màn không có ô này" — một lối duy nhất thì không.
    """
    if not ten:
        return None
    return ui._js(c, """
      const n=QN(%s).replace(/[*:]+$/,'').trim();
      const g=PV(%s);
      const ds=[...g.querySelectorAll('input,select,textarea,[role=combobox],[role=switch],'+
        '[role=checkbox],[contenteditable=true]')].filter(HIEN);
      const mo_ta=e=>({the:e.tagName.toLowerCase()+(e.tagName==='INPUT'?'['+e.type+']':''),
        nhan:NHAN(e), gia_tri:GT(e), goi_y:(e.placeholder||'').trim(),
        vo_hieu:!!e.disabled, chi_doc:!!e.readOnly, bat_buoc:!!e.required||/\\*/.test(NHAN(e)),
        maxlength:(e.maxLength>0&&e.maxLength<1e6?e.maxLength:''),
        loai:(e.getAttribute('role')||e.type||e.tagName.toLowerCase()),
        aria:(e.getAttribute('aria-label')||''), ten_html:(e.name||e.id||'')});
      const lay=f=>{for(const e of ds){if(f(e))return mo_ta(e);}return null;};
      let r=lay(e=>QN(NHAN(e)).replace(/[*:]+$/,'').trim()===n); if(r)return JSON.stringify(r);
      r=lay(e=>QN(e.getAttribute('aria-label')||e.getAttribute('title')||'')===n);
      if(r)return JSON.stringify(r);
      r=lay(e=>QN(e.placeholder||'')===n); if(r)return JSON.stringify(r);
      r=lay(e=>QN(e.name||e.id||'')===n.replace(/ /g,'_')); if(r)return JSON.stringify(r);
      if(n.length>=4){
        r=lay(e=>{const t=QN(NHAN(e)).replace(/[*:]+$/,'').trim();
                  return t&&(t.includes(n)||n.includes(t));});
        if(r)return JSON.stringify(r);
        r=lay(e=>QN(e.placeholder||'').includes(n)); if(r)return JSON.stringify(r);}
      return 'null';""" % (_s(ten), _s(pham_vi)))


def tim_nut(c, chu, pham_vi='auto'):
    """Nút khớp `chu` — chữ · `aria-label` · `title` · `href` · vai trò. `None` nếu không có."""
    if not chu:
        return None
    return ui._js(c, """
      const n=QN(%s), g=PV(%s);
      const ds=[...g.querySelectorAll('button,[role=button],a[href],input[type=submit],'+
        '[role=menuitem],[role=tab]')].filter(HIEN);
      const mo_ta=e=>({chu:TXT(e), vo_hieu:!!e.disabled, href:(e.getAttribute('href')||''),
        vai_tro:(e.getAttribute('role')||e.tagName.toLowerCase()),
        aria:(e.getAttribute('aria-label')||e.getAttribute('title')||'')});
      const lay=f=>{for(const e of ds){if(f(e))return mo_ta(e);}return null;};
      let r=lay(e=>QN(TXT(e))===n); if(r) return JSON.stringify(r);
      r=lay(e=>QN(e.getAttribute('aria-label')||e.getAttribute('title')||'')===n);
      if(r) return JSON.stringify(r);
      r=lay(e=>QN(e.getAttribute('href')||'')===n); if(r) return JSON.stringify(r);
      if(n.length>=2){r=lay(e=>QN(TXT(e)).includes(n)); if(r) return JSON.stringify(r);
        r=lay(e=>QN((e.getAttribute('aria-label')||'')+' '+(e.getAttribute('title')||''))
              .includes(n)); if(r) return JSON.stringify(r);}
      return 'null';""" % (_s(chu), _s(pham_vi)))


def liet_ke_control(c, pham_vi='auto'):
    """Mọi control đang thấy trong phạm vi — dùng để NÊU RA khi không tìm thấy cái đang tìm.

    Một thông báo *"không thấy ô X"* kèm danh sách ô thật sự có trên màn là dữ kiện; không
    kèm thì người đọc không phân biệt được *lỗi của app* với *lỗi của bộ dò*.
    """
    return ui._js(c, """
      const g=PV(%s);
      return JSON.stringify([...g.querySelectorAll('input,select,textarea,[role=combobox],'+
        '[role=switch],[role=checkbox]')].filter(HIEN).map(e=>NHAN(e)||e.placeholder||e.name||'')
        .filter(Boolean).slice(0,40));""" % _s(pham_vi)) or []


# ══════════════════════════════════════════════════════════════════════════════
# 4. THỰC THI
# ══════════════════════════════════════════════════════════════════════════════
class KetQuaHD(dict):
    """Kết quả một hành động: `{'loai','ok','chi_tiet','ly_do'}`."""


def thuc_thi(c, hd, ctx=None, cho_ghi=None, thu_muc_anh=None):
    """Chạy MỘT hành động. -> `KetQuaHD`. Không bao giờ ném lỗi vì app cư xử lạ.

    `cho_ghi` là hàm `(hd) -> giấy phép` do người gọi đưa vào cho hành động đổi dữ liệu.
    Không đưa thì hành động ấy trả `ok=False, ly_do='chưa có quyền ghi'` — **không** tự bấm.
    """
    loai, mt, gt, pv = hd.get('loai'), hd.get('muc_tieu'), hd.get('gia_tri'), hd.get('pham_vi')
    r = KetQuaHD(loai=loai, muc_tieu=mt, ok=False, chi_tiet=None, ly_do='')
    try:
        if loai == 'navigate':
            url = (ctx.url if ctx is not None else None)
            if not url:
                r['ly_do'] = 'không biết URL của màn'
                return r
            c.go(url)
            c.wait("document.querySelector('h1,table')?1:0", 30)
            time.sleep(0.8)
            r.update(ok=True, chi_tiet={'url': url})
            return r
        if loai == 'wait':
            time.sleep(min(float(gt or 1.0), 8.0))
            r.update(ok=True)
            return r
        if loai == 'key':
            ui.go_phim(c, mt or 'Tab')
            r.update(ok=True, chi_tiet=ui.phan_tu_dang_focus(c))
            return r
        if loai == 'scroll':
            r.update(ok=True, chi_tiet=ui.cuon(c, mt or 'cuoi'))
            return r
        if loai == 'hover':
            x = ui.re_chuot(c, mt, pv) if mt else None
            r.update(ok=bool(x), chi_tiet=x, ly_do='' if x else 'không thấy phần tử để rê chuột')
            return r
        if loai in ('input', 'paste', 'search'):
            if not mt:
                r['ly_do'] = 'bước không nêu tên ô'
                return r
            if loai == 'search':
                x = ui.tim_kiem(c, gt if gt is not None else '',
                                nhan=mt if tim_control(c, mt, 'man') else None,
                                cho=(ctx.hs_so('tim_kiem_debounce_ms') if ctx else None))
            elif loai == 'paste':
                x = ui.dan(c, mt, gt if gt is not None else '', pv)
            else:
                x = ui.dien(c, mt, gt if gt is not None else '', pv)
            if x is None:
                r['ly_do'] = ('không thấy ô %r (phạm vi %s). Ô đang có: %s'
                              % (mt, pv, ' · '.join(liet_ke_control(c, pv)[:12]) or 'không có'))
                return r
            r.update(ok=True, chi_tiet=x)
            return r
        if loai == 'select':
            if not mt:
                r['ly_do'] = 'bước không nêu tên ô chọn'
                return r
            x = ui.chon(c, mt, gt, pv) if gt else None
            r.update(ok=bool(x and x.get('ok')), chi_tiet=x,
                     ly_do='' if x else 'không chọn được giá trị %r ở ô %r' % (gt, mt))
            return r
        if loai == 'check':
            x = _tich(c, mt, bool(gt), pv)
            r.update(ok=bool(x and x.get('ok')), chi_tiet=x,
                     ly_do='' if x else 'không thấy ô tích chọn %r' % mt)
            return r
        if loai == 'upload':
            t = hd.get('tep')
            if not t:
                r['ly_do'] = 'chưa có tệp mẫu để nạp'
                return r
            x = ui.nap_tep(c, t, hd.get('chi_so', 0), pv)
            r.update(ok=bool(x and x.get('so_tep')), chi_tiet=x,
                     ly_do='' if x else 'màn không có ô chọn tệp')
            return r
        if loai == 'sort':
            x = ui.bam_tieu_de_cot(c, mt) if mt else None
            if x:
                time.sleep(1.0)
            r.update(ok=bool(x), chi_tiet={'bam': x, 'sau': ui.doc_sap_xep_cot(c, mt) if mt else None},
                     ly_do='' if x else 'không thấy cột %r để sắp xếp' % mt)
            return r
        if loai == 'paginate':
            x = ui.lat_trang(c, int(gt or 2))
            r.update(ok=bool(x and x.get('ok')), chi_tiet=x,
                     ly_do='' if x else 'không thấy nút trang %s' % gt)
            return r
        if loai == 'filter':
            x = ui.chon(c, mt, gt, 'man') if (mt and gt) else None
            r.update(ok=bool(x and x.get('ok')), chi_tiet=x,
                     ly_do='' if x else 'không áp được bộ lọc %r = %r' % (mt, gt))
            return r
        if loai in ('click', 'click_nhieu'):
            if not mt:
                r['ly_do'] = 'bước không nêu chữ trên nút'
                return r
            if hd.get('ghi'):
                gp = cho_ghi(hd) if cho_ghi else None
                if not gp:
                    r['ly_do'] = 'nút CHỐT (%s) — chưa có giấy phép ghi, không bấm' % mt
                    return r
                x = (ui.bam_nhieu_lan(c, mt, hd.get('so_lan', 4), 90, pv)
                     if loai == 'click_nhieu' else ui.bam_ghi(c, mt, gp, pv, thuc=True))
            else:
                x = (ui.bam_nhieu_lan(c, mt, hd.get('so_lan', 4), 90, pv)
                     if loai == 'click_nhieu' else ui.bam(c, mt, pv))
            if not x:
                r['ly_do'] = 'không thấy nút %r (phạm vi %s)' % (mt, pv)
                return r
            r.update(ok=bool(x.get('ok')), chi_tiet=x,
                     ly_do='' if x.get('ok') else 'nút %r đang bị vô hiệu' % mt)
            return r
        if loai == 'verify':
            r.update(ok=True, chi_tiet={'loi': ui.doc_loi(c, pv),
                                        'thong_bao': ui.doc_thong_bao(c),
                                        'trang_thai': ui.trang_thai_tai(c)})
            return r
        if loai == 'dien_con_lai':
            # Người gọi đưa `dien_con_lai` qua `ctx` (phép đo biết ô nào là ô đang thử nên
            # phải chừa ra). Không có thì hành động vẫn hợp lệ nhưng không làm gì — và nói rõ.
            f = getattr(ctx, 'dien_con_lai', None) if ctx is not None else None
            if not callable(f):
                r.update(ok=True, ly_do='phép đo không cung cấp bộ điền ô còn lại')
                return r
            r.update(ok=True, chi_tiet=f())
            return r
        if loai in ('login', 'cleanup'):
            r.update(ok=True, ly_do='bước do khung lượt chạy lo, không chạy lại ở đây')
            return r
        r['ly_do'] = 'chưa dịch được bước này ra hành động'
        return r
    except Exception as e:
        r['ly_do'] = '%s: %s' % (type(e).__name__, str(e)[:200])
        return r


def _tich(c, nhan, bat, pv='auto'):
    """Tích/bỏ tích một ô checkbox hoặc switch theo nhãn."""
    return ui._js(c, """
      const n=QN(%s), g=PV(%s), bat=%s;
      const ds=[...g.querySelectorAll('input[type=checkbox],input[type=radio],[role=checkbox],'+
        '[role=switch]')].filter(HIEN);
      let e=ds.find(x=>QN(NHAN(x)).replace(/[*:]+$/,'').trim()===n);
      if(!e&&n.length>=3) e=ds.find(x=>QN(NHAN(x)).includes(n));
      if(!e&&ds.length===1) e=ds[0];
      if(!e) return 'null';
      const doc=()=>e.tagName==='INPUT'?!!e.checked
        :(e.getAttribute('aria-checked')==='true'||e.getAttribute('data-state')==='checked');
      const truoc=doc();
      if(truoc!==bat) e.click();
      return JSON.stringify({ok:true, nhan:NHAN(e), truoc:truoc, sau:doc(),
        the:e.tagName.toLowerCase(), vai_tro:(e.getAttribute('role')||'')});"""
                  % (_s(nhan or ''), _s(pv), 'true' if bat else 'false'))


def doc_tich(c, nhan, pv='auto'):
    """Trạng thái tích của một checkbox/switch — không đụng vào nó."""
    return ui._js(c, """
      const n=QN(%s), g=PV(%s);
      const ds=[...g.querySelectorAll('input[type=checkbox],input[type=radio],[role=checkbox],'+
        '[role=switch]')].filter(HIEN);
      let e=ds.find(x=>QN(NHAN(x)).replace(/[*:]+$/,'').trim()===n);
      if(!e&&n.length>=3) e=ds.find(x=>QN(NHAN(x)).includes(n));
      if(!e&&ds.length===1) e=ds[0];
      if(!e) return 'null';
      return JSON.stringify({nhan:NHAN(e), the:e.tagName.toLowerCase(),
        vai_tro:(e.getAttribute('role')||''), vo_hieu:!!e.disabled,
        tich:(e.tagName==='INPUT'?!!e.checked
          :(e.getAttribute('aria-checked')==='true'||e.getAttribute('data-state')==='checked'))});"""
                  % (_s(nhan or ''), _s(pv)))


def chay_den(c, ds, den_loai=None, ctx=None, cho_ghi=None):
    """Chạy danh sách hành động, DỪNG trước hành động loại `den_loai` (thường là nút chốt).

    Trả `(đã chạy, còn lại, [kết quả])`. Dùng khi phép đo muốn dựng sẵn trạng thái do cột C
    mô tả rồi mới tự tay làm bước cuối theo cách riêng (đo request, chụp ảnh, mở cửa sổ ghi).
    """
    ra, i = [], 0
    for i, hd in enumerate(ds):
        if den_loai and hd.get('loai') == den_loai:
            return ds[:i], ds[i:], ra
        ra.append(thuc_thi(c, hd, ctx, cho_ghi))
    return ds, [], ra

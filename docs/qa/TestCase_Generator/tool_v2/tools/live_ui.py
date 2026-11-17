# -*- coding: utf-8 -*-
"""LÁI MÀN THẬT — nguyên thao tác để CHẠY case, không phải để soi màn  (mới 2026-09-15 lượt 4).

`probe_live.py` đọc màn (lớp A) và `chay_live.py` chấm case (lớp B); chỗ còn thiếu là phần
**làm như người test**: gõ vào ô, bấm nút, đọc thông báo lỗi, tích chọn dòng, lật trang. Khối
này chỉ có thao tác, **không có luật nào** — luật nằm ở `qalib`, quyết định cho phép hay chặn
nằm ở `chay_live.Cong`, còn ở đây là tay chân.

Ba điều khối này KHÔNG làm, và không được thêm vào:

  · **không tự quyết định được bấm hay không** — mọi hàm đổi dữ liệu nhận sẵn một `cho_phep`
    đã qua cổng; gọi thẳng mà quên cổng thì hàm ném lỗi chứ không chạy;
  · **không đoán nhãn** — tìm control theo nhãn thật trên màn (label · aria-label · title ·
    placeholder), so khớp đã bỏ dấu; không thấy thì trả `None` để phép đo tự im;
  · **không nuốt lỗi** — thao tác không thực hiện được trả `None`/`False` kèm lý do, không bao
    giờ trả "coi như xong".

Một điểm kỹ thuật đã trả giá ở `<giao_thuc_do_luong>`: React không nhận `el.value = x`. Mọi
chỗ gõ chữ đều đi qua setter gốc của prototype rồi phát `input` + `change` (`_SET`), và các
case về chống bấm trùng dùng **chuột thật** qua CDP (`bam_chuot`) với khoảng cách ≥ 80 ms —
bốn cú `el.click()` trong cùng một tick lọt qua khoá nút và cho kết luận sai.
"""
import json
import re
import time

import qalib

# ── nền JS dùng chung cho mọi lệnh ────────────────────────────────────────────────────────
# Gói vào một chuỗi để mỗi lệnh `Runtime.evaluate` tự đủ: CDP không giữ biến giữa hai lần gọi.
JS_NEN = r"""
const QN=s=>((s||'')+'').toLowerCase().replace(/đ/g,'d').normalize('NFD')
    .replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const TXT=e=>(((e&&(e.innerText||e.textContent))||'')+'').replace(/\s+/g,' ').trim();
const HIEN=e=>{if(!e)return false;const r=e.getBoundingClientRect();
  return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
/* Hộp thoại đang mở là PHẠM VI mặc định: màn danh sách và biểu mẫu có ô trùng tên nhau
   (`Trạng thái`), trộn hai phạm vi là gõ vào nhầm ô mà báo cáo vẫn bình thường. */
/* ⚠️ VÁ 2026-09-17 lượt 2. "Hộp thoại đang mở" của bản trước = **hộp CUỐI CÙNG trong DOM**.
   Luật ấy đúng chừng nào chỉ có một hộp. Màn thật (và app giả dựng lại) tự mở hộp "Hướng dẫn
   sử dụng" nằm SAU chỗ app gắn form, nên `HOP()` luôn trả hộp hướng dẫn: `mo_hop` mô tả nhầm
   hộp, `dong_hop` bấm Đóng trong hộp hướng dẫn nên form của ta không bao giờ đóng, và mọi
   phép tìm ô ở phạm vi `hop` đi tìm trong một hộp không có ô nào.

   Nay hộp CỦA TA được ghi tên lúc mở (`__qaHop`), và ba mức ưu tiên:
     ① hộp mang đúng tiêu đề ta vừa mở;
     ② hộp KHÔNG nằm trong danh sách hộp đã có sẵn trước khi ta bấm (`__qaHopApp`);
     ③ hộp cuối cùng — như cũ, cho màn chỉ có một hộp.
   Ghi theo TIÊU ĐỀ chứ không theo thuộc tính dán lên phần tử: một lần vẽ lại là mất thuộc
   tính, còn tiêu đề thì không — đúng bài học của lớp ô chọn. */
const TIEU_DE_HOP=h=>TXT(h.querySelector('h1,h2,h3,[role=heading]')||{});
const HOP=()=>{const ds=[...document.querySelectorAll('[role=dialog],[role=alertdialog]')]
    .filter(HIEN);
  if(!ds.length) return null;
  const ta=QN(window.__qaHop||'');
  if(ta){const h=ds.find(x=>QN(TIEU_DE_HOP(x))===ta); if(h) return h;}
  const cua_app=(window.__qaHopApp||[]).map(QN);
  if(cua_app.length){const h=ds.filter(x=>cua_app.indexOf(QN(TIEU_DE_HOP(x)))<0);
    if(h.length) return h[h.length-1];}
  return ds[ds.length-1];};
const PV=s=>(s==='hop'?(HOP()||document)
  :((s==='man'||s==='loc')?document:(HOP()||document)));
const CTL='input,select,textarea,[role=combobox],button';
/* Nhãn của một control: chỉ nhận <label> của KHỐI BỌC chứa ĐÚNG MỘT control (cùng luật đã vá
   ở probe_live 14/09 — khối nhiều control thì nhãn trong đó là nhãn của ô khác). */
const NHAN=e=>{
  if(e.id){const l=document.querySelector('label[for="'+CSS.escape(e.id)+'"]');
    if(l&&TXT(l))return TXT(l);}
  let p=e.parentElement;
  for(let k=0;k<5&&p;k++,p=p.parentElement){
    if(p.querySelectorAll(CTL).length>1)break;
    const l=p.querySelector('label'); if(l&&TXT(l))return TXT(l);}
  return (e.getAttribute('aria-label')||e.getAttribute('title')||e.placeholder||'').trim();};
const GT=e=>{if(!e)return '';
  if(e.tagName==='SELECT'){const o=e.selectedOptions&&e.selectedOptions[0];
    return o?(o.text||'').trim():'';}
  if(e.tagName==='INPUT'||e.tagName==='TEXTAREA'){
    return e.type==='password'?(e.value?'(đã ẩn)':''):(e.value||'');}
  return TXT(e);};
/* Tìm control theo nhãn — khớp ĐÚNG BẰNG trước, chứa sau. Hai vòng chứ không một vòng "chứa":
   `Tên hiển thị` và `Tên` cùng có trên một biểu mẫu thì vòng "chứa" trả nhầm ô. */
const TIM=(nhan,pv)=>{const g=PV(pv);
  const ds=[...g.querySelectorAll(CTL)].filter(HIEN);
  const n=QN(nhan).replace(/[*:]+$/,'').trim();
  for(const e of ds){if(QN(NHAN(e)).replace(/[*:]+$/,'').trim()===n)return e;}
  for(const e of ds){const t=QN(NHAN(e));if(n.length>=4&&t&&(t.includes(n)||n.includes(t)))return e;}
  return null;};
const NUT=(chu,pv)=>{const g=PV(pv);
  const ds=[...g.querySelectorAll('button,[role=button],a[href]')].filter(HIEN);
  const n=QN(chu);
  for(const e of ds){if(QN(TXT(e))===n)return e;}
  for(const e of ds){const t=QN(TXT(e));if(t&&t===n.replace(/^\+\s*/,''))return e;}
  for(const e of ds){if(QN(TXT(e)).includes(n)&&n.length>=2)return e;}
  for(const e of ds){const a=QN(e.getAttribute('aria-label')||e.getAttribute('title')||'');
    if(a&&(a===n||a.includes(n)))return e;}
  return null;};
const set=(el,v)=>{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype
      :(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype);
  const d=Object.getOwnPropertyDescriptor(proto,'value');
  if(d&&d.set)d.set.call(el,v); else el.value=v;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));};
/* ── BA LOẠI VÙNG THÔNG BÁO, KHÔNG PHẢI MỘT ───────────────────────────────────────────
   ⚠️ VÁ 2026-09-16 lượt 3 (§13 của chỉ thị). Bản trước gom MỌI `[aria-live]` thành "toast",
   nên câu của **bộ báo tin điều hướng** (route announcer) — ở app này là *"Đã chuyển đến
   trang Trang mới"*, một `div` sr-only mà người dùng KHÔNG nhìn thấy — bị đọc thành thông
   báo nổi. Hậu quả đo được trên lượt chạy 16/09: 9 case `het_phien` + 1 case `xoa_ban_ghi`
   chấm **F** với lý do *"thông báo không đúng nguyên văn"* trong khi toast thật chưa từng
   được đọc tới. Đó là false F — tố cáo sản phẩm bằng đúng thứ không phải sản phẩm.

   Nay phân ba loại, và phân theo CẤU TRÚC (nơi phần tử nằm, nó có nhìn thấy được không)
   chứ không theo nội dung chữ — lọc theo chữ là tự quyết định trước câu nào "đáng kể":

     TOAST        — thông báo nổi của app, người dùng NHÌN THẤY. Chỉ nó được dùng để
                    đối chiếu `grounding.verbatim.toast_*`.
     PHAN_TRANG   — vùng `aria-live` của cụm phân trang ("đã sang trang N").
     TRO_NANG     — vùng chỉ dành cho trình đọc màn hình (route announcer, sr-only).

   `LOAI_BAO(e)` trả về đúng một trong ba. Thứ tự xét là thứ tự ưu tiên: một phần tử nằm
   trong hộp toast THẬT thì vẫn là toast kể cả khi nó mang `aria-live`. */
const SR_ONLY=e=>{
  if(!e) return true;
  const r=e.getBoundingClientRect();
  if(r.width<=1||r.height<=1) return true;
  const s=getComputedStyle(e);
  if(/inset\(\s*50%|inset\(\s*100%/.test(s.clipPath||'')) return true;
  if(/^rect\(\s*0(px)?[,\s]+0(px)?[,\s]+0(px)?[,\s]+0(px)?\s*\)$/.test((s.clip||'').trim()))
    return true;
  if((s.position==='absolute'||s.position==='fixed')&&
     (parseFloat(s.left)<=-9999||parseFloat(s.top)<=-9999)) return true;
  for(let p=e;p&&p!==document.body;p=p.parentElement){
    const cl=(typeof p.className==='string'?p.className:'')+' '+(p.id||'');
    if(/\b(sr[-_]?only|visually[-_]?hidden|visuallyhidden|screen[-_]?reader|a11y[-_]?hidden)\b/i
       .test(cl)) return true;}
  return false;};
/* Hộp toast THẬT — dấu hiệu của một thư viện toast, hoặc một khối nổi đặt cố định trên màn. */
const TRONG_HOP_TOAST=e=>{
  for(let p=e;p&&p!==document.body;p=p.parentElement){
    if(p.matches&&p.matches('[data-sonner-toast],[data-sonner-toaster],[data-radix-toast-root],'+
        '[data-radix-toast-viewport],.Toastify,.Toastify__toast,[class*=toast i],[id*=toast i],'+
        '[class*=snackbar i],[class*=notification i]')) return true;}
  return false;};
/* Cụm phân trang: `nav` phân trang, hoặc khối mang tên phân trang ở id/class/aria-label. */
const TRONG_PHAN_TRANG=e=>{
  for(let p=e;p&&p!==document.body;p=p.parentElement){
    const dau=[(p.id||''),(typeof p.className==='string'?p.className:''),
               (p.getAttribute?(p.getAttribute('aria-label')||''):'')].join(' ');
    if(/pagination|paging|pager|phan[-_]?trang/i.test(dau)) return true;}
  return false;};
/* "Nổi lên trên màn": chính nó HOẶC một tổ tiên được đặt cố định/tuyệt đối có z-index.
   Xét cả tổ tiên vì thư viện toast hay đặt khối nổi ở lớp BỌC còn `role=status` nằm bên
   trong — chỉ xét chính phần tử là đánh rơi toast thật, đúng thứ phải tránh khi vá §13. */
const NOI_TREN_MAN=e=>{
  for(let p=e;p&&p!==document.body;p=p.parentElement){
    const s=getComputedStyle(p);
    if((s.position==='fixed'||s.position==='absolute')&&(parseInt(s.zIndex,10)||0)>0)
      return true;}
  return false;};
const LOAI_BAO=e=>{
  if(TRONG_HOP_TOAST(e)) return 'TOAST';
  if(SR_ONLY(e)) return 'TRO_NANG';
  if(TRONG_PHAN_TRANG(e)) return 'PHAN_TRANG';
  /* Còn lại: chỉ nhận là toast khi nó THẬT SỰ nổi lên trên màn. Một `role=status` nằm im
     trong luồng trang là chú thích tại chỗ, không phải thông báo nổi. */
  if(NOI_TREN_MAN(e)) return 'TOAST';
  return 'TRO_NANG';};
/* Ứng viên: gom mọi lối đánh dấu thường gặp rồi mới phân loại. */
const UNG_VIEN_BAO=()=>[...document.querySelectorAll(
    '[role=status],[role=alert],[aria-live=polite],[aria-live=assertive],'+
    '[data-sonner-toast],[data-radix-toast-root],.Toastify__toast,'+
    '[class*=toast i],[class*=Toast],[id*=toast i] > *')].filter(HIEN);
const BAO_THEO_LOAI=()=>{const ra={TOAST:[],PHAN_TRANG:[],TRO_NANG:[]}; const da=new Set();
  for(const e of UNG_VIEN_BAO()){const t=TXT(e);
    if(!t||t.length>=300) continue;
    const l=LOAI_BAO(e); const k=l+''+t;
    if(da.has(k)) continue; da.add(k); ra[l].push(t);}
  return ra;};
/* Giữ tên cũ cho mã đã có: `HOP_BAO()` NAY chỉ trả về TOAST thật. */
const HOP_BAO=()=>UNG_VIEN_BAO().filter(e=>LOAI_BAO(e)==='TOAST');

/* ── Ô CHỌN: TÌM THEO NHIỀU ĐƯỜNG, KHÔNG CHỈ THEO <label> ─────────────────────────────
   ⚠️ VÁ 2026-09-16 lượt 3 (§5 của chỉ thị). `TIM()` tìm control theo `NHAN(e)`, mà `NHAN`
   của một <button> chỉ đọc `<label>` của khối bọc rồi tới `aria-label`/`title`/`placeholder`
   — nó KHÔNG đọc chữ trong nút. Ô lọc của app này lại chính là `<button>` mà chữ duy nhất
   là chữ gợi ý (`-- Chọn trạng thái --`), nên `TIM('Trạng thái','man')` trả `null`, `doc_o`
   trả `null`, và **11 case ô lọc** rơi về CHƯA ĐO với lý do "không kết luận được" trong khi
   control vẫn nằm sờ sờ trên màn.

   Tách bạch hai loại ô chọn, đúng §5:
     FORM_CONTROL  — ô chọn TRONG hộp thoại (pv='hop'), tìm theo nhãn như cũ;
     FILTER_CONTROL— ô lọc trên THANH LỌC của màn (pv='loc'), tìm theo chữ gợi ý + vị trí.

   `TIM_CHON` thử LẦN LƯỢT 5 đường và nói ra nó đã đi đường nào (`duong`), để evidence ghi
   được *"kết luận này dựa trên control tìm thấy bằng cách nào"* — một control tìm bằng
   đường đoán mò thì kết luận cũng chỉ đáng tin bằng đường ấy. */
const VUNG_LOC=()=>{
  const h=document.querySelector('h1'); const bang=document.querySelector('table');
  const canh=document.querySelector('aside');
  const yTren=h?h.getBoundingClientRect().top-4:0;
  const yDuoi=bang?bang.getBoundingClientRect().top
                  :(h?h.getBoundingClientRect().top+420:520);
  return [...document.querySelectorAll('select,[role=combobox],[aria-haspopup=listbox],button')]
    .filter(e=>{
      if(canh&&canh.contains(e)) return false;
      if(e.closest('table')||e.closest('[role=dialog]')||e.closest('header')) return false;
      if(!HIEN(e)) return false;
      const r=e.getBoundingClientRect();
      return r.top>=yTren && r.top<yDuoi;});};
/* Chữ nhận dạng của một ô chọn: chữ trong ô + mọi nhãn gián tiếp. Bỏ khuôn `-- Chọn … --`
   để so với TÊN TRƯỜNG mà bộ case dùng ("Trạng thái", "Loại DB", "Sắp xếp"). */
const CHU_CHON=e=>{
  const raw=[TXT(e),(e.getAttribute('aria-label')||''),(e.getAttribute('title')||''),
             (e.placeholder||''),(e.getAttribute('data-testid')||''),NHAN(e)];
  const ra=[];
  for(const t of raw){const q=QN(t); if(!q) continue;
    ra.push(q);
    const g=q.replace(/^[-\s]*chon\s*/,'').replace(/[-\s]*$/,'').trim();
    if(g&&ra.indexOf(g)<0) ra.push(g);}
  return ra;};
const LA_O_CHON=e=>e.tagName==='SELECT'||e.getAttribute('role')==='combobox'
  ||e.getAttribute('aria-haspopup')==='listbox'||!!e.querySelector('svg,[class*=chevron i]');
/* Danh sách TUỲ CHỌN đang hiện của một dropdown đã mở. Trước đây bộ chọn này được chép tay ở
   ba chỗ (`mo_o_chon`, `chon_trong_o`, `chon_dau_tien`) và ba bản đã lệch nhau — chỗ có
   `[role=menuitem]`, chỗ không — nên cùng một dropdown đọc ra số tuỳ chọn khác nhau tuỳ hàm
   nào hỏi. Một bản duy nhất ở đây. */
/* Cụm phân trang: dưới đáy bảng, hoặc trong `nav`/khối class `pagina*`. Khoanh vùng là điều
   kiện để mọi phép phân trang đúng — ngoài vùng ấy thì một con số chỉ là một con số, và bản
   cũ đã đọc huy hiệu "3" ở header thành "đang ở trang 3". */
const TRONG_VUNG_PT=e=>{
  if(e.closest('aside')||e.closest('header')||e.closest('[role=dialog]')) return false;
  if(e.closest('nav,[class*=pagina i],[class*=Pagina]')) return true;
  const bang=document.querySelector('table');
  const yDay=bang?bang.getBoundingClientRect().bottom-48:0;
  return e.getBoundingClientRect().top>=yDay;};
const NUT_PT=()=>[...document.querySelectorAll('button,[role=button],a')].filter(HIEN)
  .filter(TRONG_VUNG_PT);
const LA_NUT=(b,rx)=>rx.test(QN(TXT(b))+' '+QN(b.getAttribute('aria-label')||'')+' '
  +QN(b.getAttribute('title')||''));
const OPTION_HIEN=()=>[...document.querySelectorAll('[role=option],[role=menuitemradio],'+
  '[role=menuitemcheckbox],[role=menuitem],[cmdk-item],[role=listbox] li')].filter(HIEN);
const TIM_CHON=(nhan,pv,goi_y,tuy_chon)=>{
  const n=QN(nhan).replace(/[*:]+$/,'').trim();
  const g=QN(goi_y||'');
  const trong_hop=pv==='hop';
  let ds=trong_hop
    ? [...(HOP()||document).querySelectorAll('select,[role=combobox],[aria-haspopup=listbox],button')]
        .filter(HIEN)
    : VUNG_LOC();
  /* ① chữ gợi ý ĐÚNG NGUYÊN VĂN do hồ sơ màn khai — đường chắc chắn nhất, không suy diễn */
  if(g){for(const e of ds){if(CHU_CHON(e).indexOf(g)>=0) return {e:e,duong:'goi_y_verbatim'};}}
  /* ② nhãn <label> như cũ */
  const q=TIM(nhan,trong_hop?'hop':'man');
  if(q&&(!ds.length||LA_O_CHON(q)||q.tagName==='SELECT')) return {e:q,duong:'nhan_label'};
  /* ③ chữ trong ô khớp ĐÚNG BẰNG tên trường (sau khi bỏ khuôn "-- Chọn … --") */
  for(const e of ds){if(CHU_CHON(e).indexOf(n)>=0) return {e:e,duong:'chu_trong_o'};}
  /* ④ chữ trong ô CHỨA tên trường theo biên từ (tên trường >=4 ký tự để khỏi vơ bừa) */
  if(n.length>=4){for(const e of ds){
    if(CHU_CHON(e).some(t=>new RegExp('(^|[^a-z0-9])'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
        +'([^a-z0-9]|$)').test(t))) return {e:e,duong:'chu_chua_ten'};}}
  /* ⑥ ô chọn đang hiện ĐÚNG MỘT GIÁ TRỊ mà hồ sơ màn khai cho trường này.
     ⚠️ VÁ 2026-09-17 lượt 2. Năm đường trên đều giả định ô chọn hiện CHỮ GỢI Ý. Ô `Sắp xếp`
     của màn này thì không: nó hiện **giá trị đang chọn** ("Mới nhất trước"), nên không đường
     nào tìm ra, `tim_o_chon('Sắp xếp')` trả null, và 11 case ô chọn nằm CHƯA ĐO suốt lượt
     chạy 500 case — control thì vẫn sờ sờ trên thanh lọc.
     Căn cứ KHÔNG suy diễn: hồ sơ màn đã khai sẵn `tuy_chon_sap_xep` = ["Mới nhất trước",
     "Cũ nhất trước"]. Ô nào đang hiện một trong các giá trị ấy thì chính là ô ấy. Màn mới chỉ
     cần khai `tuy_chon_<tên trường>` là dùng được, không phải chốt cứng chữ nào vào tool. */
  const tc=(tuy_chon||[]).map(QN).filter(x=>x);
  if(tc.length){
    const hop=ds.filter(e=>CHU_CHON(e).some(t=>tc.indexOf(t)>=0));
    if(hop.length===1) return {e:hop[0],duong:'tuy_chon_khai'};}
  /* ⑤ đúng MỘT ô chọn trên thanh lọc -> không còn gì để nhầm */
  const chon=ds.filter(LA_O_CHON);
  if(chon.length===1) return {e:chon[0],duong:'o_chon_duy_nhat'};
  return null;};
/* Đánh dấu phần tử để lệnh sau tìm lại ĐÚNG nó (CDP không giữ tham chiếu giữa hai lần gọi) */
const DANH_DAU=(e,ten)=>{if(!e) return false;
  document.querySelectorAll('[data-qa-moc="'+ten+'"]').forEach(x=>x.removeAttribute('data-qa-moc'));
  e.setAttribute('data-qa-moc',ten); return true;};
const THEO_MOC=ten=>document.querySelector('[data-qa-moc="'+ten+'"]');
"""


def _js(c, than):
    """Chạy một khối JS có sẵn nền, nhận về JSON."""
    v = c.js('(()=>{%s\n%s\n})()' % (JS_NEN, than))
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return v
    return v


def _s(x):
    """Chuỗi JS an toàn cho mọi ký tự (nháy, xuống dòng, dấu tiếng Việt, `</script>`)."""
    return json.dumps(str(x), ensure_ascii=True)


def _ds(xs):
    """Mảng chuỗi sang literal JS an toàn."""
    return json.dumps([str(x) for x in (xs or [])], ensure_ascii=True)


# ══════════════════════════════════════════════════════════════════════════════
# 1. ĐỌC MÀN
# ══════════════════════════════════════════════════════════════════════════════
# Dòng "không có dữ liệu" nằm TRONG `<tbody>`: app vẽ nó bằng một `<tr>` có đúng một `<td>`
# `colspan` phủ hết bảng. Đếm nó là một dòng dữ liệu thì mọi phép "danh sách rỗng chưa" đọc ra
# **1 dòng** và chấm F cho một màn đang rỗng đúng cách — đã dính 8 case ở lượt chạy live 15/09.
_JS_DONG_THAT = ("const DONG=()=>[...document.querySelectorAll('table tbody tr')].filter(r=>{"
                 "const td=[...r.querySelectorAll('td')];"
                 "if(td.length<2) return false;"
                 "return !td.some(x=>parseInt(x.getAttribute('colspan')||'1',10)>1);});")


def doc_bang(c, toi_da=200):
    """[{'stt','o':{cột: giá trị}, 'txt', 'i'}] — CHỈ dòng dữ liệu thật của bảng."""
    return _js(c, """%s
      const th=[...document.querySelectorAll('table thead th')].map(TXT);
      const tr=DONG().slice(0,%d);
      return JSON.stringify(tr.map((r,i)=>{const td=[...r.querySelectorAll('td')];
        const o={}; td.forEach((x,j)=>{o[th[j]||('c'+j)]=TXT(x);});
        return {i:i, stt:TXT(td[0]||{}), o:o, txt:TXT(r)};}));"""
                  % (_JS_DONG_THAT, int(toi_da))) or []


def cot_bang(c):
    return _js(c, "return JSON.stringify([...document.querySelectorAll('table thead th')]"
                  ".map(TXT));") or []


def tim_dong(c, ma):
    """Chỉ số dòng có ô mang đúng chuỗi `ma` (khớp ĐÚNG BẰNG một ô) — `None` nếu không có.

    Khớp đúng bằng một Ô, không phải "chứa trong cả dòng": mã `zzqa_x_001` là chuỗi con của
    `zzqa_x_0010`, và một phép tìm rộng ở đây là một cú bấm Xoá vào nhầm bản ghi.
    """
    for r in doc_bang(c):
        if any(qalib.norm(v) == qalib.norm(ma) for v in (r.get('o') or {}).values()):
            return r['i']
    return None


def doc_dong(c, ma):
    for r in doc_bang(c):
        if any(qalib.norm(v) == qalib.norm(ma) for v in (r.get('o') or {}).values()):
            return r
    return None


def ma_tren_app(c, cot_ma=None):
    """[mã] đọc từ cột mã của bảng — nguồn để nghiệm thu dọn.

    ⚠️ Chỉ đọc TRANG ĐANG HIỆN. Người gọi phải tự lo đưa danh sách về trạng thái nhìn thấy
    được bản ghi QA (tìm kiếm theo dấu `zzqa`) — hàm này không tự lật trang, vì lật trang là
    thao tác có thể đổi trạng thái màn giữa lúc một phép đo khác đang dựa vào nó.
    """
    ra, cot = [], qalib.norm(cot_ma or '')
    for r in doc_bang(c):
        o = r.get('o') or {}
        for k, v in o.items():
            if cot and qalib.norm(k) != cot:
                continue
            v = (v or '').strip()
            if v.lower().startswith(qalib.QA_TIEN_TO):
                ra.append(v)
    return ra


def doc_o(c, nhan, pv='auto'):
    """Giá trị + thuộc tính của một ô theo nhãn — `None` nếu không tìm thấy."""
    return _js(c, """
      const e=TIM(%s,%s); if(!e) return 'null';
      return JSON.stringify({nhan:NHAN(e), the:e.tagName.toLowerCase()+
        (e.tagName==='INPUT'?'['+e.type+']':''), gia_tri:GT(e),
        goi_y:(e.placeholder||'').trim(), maxlength:(e.maxLength>0&&e.maxLength<1e6?e.maxLength:''),
        bat_buoc:!!e.required||/\\*/.test(NHAN(e)), vo_hieu:!!e.disabled,
        chi_doc:!!e.readOnly, sai:(e.getAttribute('aria-invalid')||'')==='true',
        focus:document.activeElement===e});""" % (_s(nhan), _s(pv)))


# ══════════════════════════════════════════════════════════════════════════════
# 1b. Ô CHỌN — tìm · mở · đọc lựa chọn · chọn · đóng   (§5 của chỉ thị 16/09 lượt 3)
# ══════════════════════════════════════════════════════════════════════════════
# Tách hẳn khỏi `doc_o`/`chon` (vốn đi qua `TIM`, chỉ tìm được ô có <label>): ô lọc trên
# thanh lọc của app này là `<button>` mang chữ gợi ý, không có nhãn nào. Mỗi hàm dưới đây
# **nói ra đường tìm** (`duong`) để phép đo đưa vào evidence.
def tim_o_chon(c, nhan, pv='loc', goi_y='', tuy_chon=()):
    """Mô tả ô chọn tìm được. -> {'co','duong','the','chu','vo_hieu','loai'} hoặc `None`.

    `pv='loc'` = thanh lọc của màn (FILTER_CONTROL) · `pv='hop'` = trong hộp thoại
    (FORM_CONTROL). Hai phạm vi KHÔNG được trộn: màn danh sách và biểu mẫu có ô trùng tên
    nhau, và trộn hai phạm vi là đo nhầm ô mà báo cáo vẫn bình thường.
    """
    return _js(c, """
      const k=TIM_CHON(%s,%s,%s,%s); if(!k) return 'null';
      const e=k.e; DANH_DAU(e,'o-chon');
      const r=e.getBoundingClientRect(); const st=getComputedStyle(e);
      return JSON.stringify({co:true, duong:k.duong,
        the:e.tagName.toLowerCase()+(e.getAttribute('role')?'[role='+e.getAttribute('role')+']':''),
        chu:TXT(e), gia_tri:GT(e), goi_y:(e.placeholder||''),
        vo_hieu:!!e.disabled||e.getAttribute('aria-disabled')==='true',
        loai:(e.tagName==='SELECT'?'native':'custom'),
        nhieu_lua_chon:(e.multiple===true||e.getAttribute('aria-multiselectable')==='true'),
        x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height),
        can_le:st.textAlign});""" % (_s(nhan), _s(pv), _s(goi_y or ''), _ds(tuy_chon)))


def _cho_option_on_dinh(c, han=2.5, nhip=0.25):
    """Chờ danh sách tuỳ chọn NGỪNG THAY ĐỔI rồi mới cho đọc. -> {'so','on_dinh','vong'}.

    ⚠️ VÁ 2026-09-17 lượt 2, truy từ 18 case `LỖI` của lượt chạy 500 case. Danh sách tuỳ chọn
    của ô `Loại database` nạp bằng một lệnh gọi API riêng; bản trước mở ô rồi `sleep(0.8)` rồi
    ĐỌC MỘT LẦN. Đọc trúng lúc danh sách mới vẽ được 1–2 mục thì SETUP bấm vào mục đang có,
    React vẽ lại cả danh sách, cú bấm rơi vào hư không, và log ghi đúng câu *"bấm hết 1 tuỳ
    chọn mà giá trị ô không đổi"* / *"bấm hết 2 tuỳ chọn…"* — 18/187 lần tạo dữ liệu QA hỏng,
    mỗi lần kéo theo một case về lớp `LỖI`.

    Điều kiện dừng là SỐ TUỲ CHỌN KHÔNG ĐỔI qua hai nhịp liên tiếp **và** không còn mục nào
    mang chữ "Đang tải" — không phải "đã chờ đủ N giây". Chờ theo đồng hồ thì máy chậm hơn
    hoặc mạng xấu hơn là hỏng lại, mà hỏng theo kiểu ngẫu nhiên nên rất khó lần ra.
    """
    truoc, on, i = -1, 0, 0
    het = time.time() + max(0.0, float(han))
    while True:
        i += 1
        d = _js(c, """
          const ds=OPTION_HIEN();
          /* ⚠️ VÁ 2026-09-17 lượt 2 (lần 3) — gốc THẬT của 18 case LỖI.
             Thư viện dropdown dựng popup NGOÀI MÀN trước (`left:-9999px`) để đo kích thước,
             rồi mới đặt nó vào đúng chỗ. Số tuỳ chọn đã ổn định từ khung hình ấy, nên phép
             chờ cũ (chỉ chờ SỐ MỤC không đổi) trả về khi popup còn nằm ở x âm. Mọi toạ độ đo
             sau đó là toạ độ ngoài màn: `bam_toa_do` bị lưới chắn `ngoai_khung` chặn, lớp lùi
             nới khung nhìn cũng vô ích vì nới rộng không kéo nổi một x ÂM vào khung.
             Chạy lẻ thì máy kịp định vị nên không ai thấy; chạy dài, máy tải nặng thì đo trúng
             khung hình chưa định vị — đúng kiểu hỏng theo cụm đã quan sát.
             Nay chờ tới khi popup ĐÃ ĐỊNH VỊ: mục đầu phải nằm trong khung nhìn. */
          const r=ds.length?ds[0].getBoundingClientRect():null;
          const dat_cho=!!r&&r.left>=0&&r.top>=0&&r.left<=innerWidth&&r.top<=innerHeight;
          return JSON.stringify({so:ds.length, dat_cho:dat_cho,
            x_dau:r?Math.round(r.left):null, y_dau:r?Math.round(r.top):null,
            khung:{rong:innerWidth, cao:innerHeight},
            dang_tai:ds.some(o=>/^dang tai|^loading/.test(QN(TXT(o))))
              ||!!document.querySelector('[role=listbox] [class*=skeleton i],'
                 +'[cmdk-list] [class*=skeleton i],[role=listbox] [aria-busy=true]')});""") or {}
        so = int(d.get('so') or 0)
        if so == truoc and so > 0 and not d.get('dang_tai') and d.get('dat_cho'):
            on += 1
            if on >= 1:
                return {'so': so, 'on_dinh': True, 'vong': i}
        else:
            on = 0
        truoc = so
        if time.time() >= het:
            return {'so': so, 'on_dinh': False, 'vong': i, 'dang_tai': bool(d.get('dang_tai')),
                    'dat_cho': bool(d.get('dat_cho')), 'x_dau': d.get('x_dau'),
                    'y_dau': d.get('y_dau'), 'khung': d.get('khung')}
        time.sleep(nhip)


def mo_o_chon(c, nhan, pv='loc', goi_y='', cho=0.8, thuc=True, tuy_chon=(), on_dinh=2.5):
    """Mở ô chọn rồi ĐỌC danh sách lựa chọn. -> {'the','duong','option':[…]} hoặc `None`.

    `<select>` gốc đọc thẳng `options`; ô chọn dựng bằng `button` thì phải BẤM THẬT
    (`Input.dispatchMouseEvent`) rồi mới đọc popup — `el.click()` không mở được những
    thư viện nghe `pointerdown`, và một ô "mở không ra" đọc thành "ô không có lựa chọn nào".
    """
    x = tim_o_chon(c, nhan, pv, goi_y, tuy_chon)
    if not x:
        return None
    if x.get('loai') == 'native':
        op = _js(c, """
          const e=THEO_MOC('o-chon'); if(!e) return 'null';
          const st=getComputedStyle(e);
          return JSON.stringify({the:'select', option:[...e.options].map(o=>({
            chu:(o.text||'').trim(), chon:!!o.selected, vo_hieu:!!o.disabled,
            can_le:st.textAlign}))});""")
        if op:
            op['duong'] = x['duong']
            op['o'] = x
        return op
    # ⚠️ ĐANG MỞ thì ĐỌC THẲNG, không bấm lại. Cú bấm thứ hai lên một ô chọn đang mở sẽ
    # ĐÓNG nó, và hàm đọc ra "ô không có lựa chọn nào" cho một ô vừa bày đủ danh sách — bắt
    # được ở bộ tự kiểm ④ (hai lần `mo_o_chon` liên tiếp thì lần thứ hai luôn rỗng). Không
    # chữa bằng cách gõ Escape trước: Escape đóng được dropdown của thư viện này nhưng không
    # đóng của thư viện khác, nên nó chỉ dời chỗ hỏng chứ không bịt.
    dang_mo = _js(c, """
      const e=THEO_MOC('o-chon');
      const op=[...document.querySelectorAll('[role=option],[cmdk-item],[role=menuitemradio],'
        +'[role=menuitemcheckbox]')].filter(HIEN).length;
      return JSON.stringify(op>0 && (!e || e.getAttribute('aria-expanded')!=='false'));""")
    if not dang_mo:
        # Đưa trigger lên phía trên khung nhìn TRƯỚC khi mở: popup mở xuống dưới, trigger
        # nằm sát đáy thì danh sách tràn khỏi khung và không tuỳ chọn nào bấm được.
        _js(c, """
          const e=THEO_MOC('o-chon'); if(!e) return 'null';
          const r=e.getBoundingClientRect();
          if(r.top>innerHeight*0.55) e.scrollIntoView({block:'start'});
          return '1';""")
        if thuc:
            r = bam_thuc(c, "THEO_MOC('o-chon')")
            if not (r and r.get('ok')):
                _js(c, "const e=THEO_MOC('o-chon'); if(e) e.click(); return '1';")
        else:
            _js(c, "const e=THEO_MOC('o-chon'); if(e) e.click(); return '1';")
        time.sleep(max(0.3, float(cho)))
        _cho_option_on_dinh(c, on_dinh)
    op = _js(c, """
      const ds=OPTION_HIEN();
      const hop=document.querySelector('[role=listbox],[cmdk-list],[role=menu]');
      return JSON.stringify({the:'combobox',
        option:ds.map(o=>{const st=getComputedStyle(o); const r=o.getBoundingClientRect();
          return {chu:TXT(o),
            chon:(o.getAttribute('aria-selected')==='true'
                ||o.getAttribute('data-state')==='checked'
                ||(o.getAttribute('data-selected')||'')==='true'
                ||(o.querySelector('input[type=checkbox]')||{}).checked===true),
            can_le:st.textAlign, dam:st.fontWeight, nen:st.backgroundColor,
            x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width)};}),
        mo_duoc:ds.length>0,
        co_o_tim:[...document.querySelectorAll('[role=listbox] input,[cmdk-input],'+
          '[role=dialog] input[placeholder*="ìm"],input[placeholder*="ìm kiếm"]')]
          .filter(HIEN).length>0,
        nut_ben:[...document.querySelectorAll('[role=listbox] button,[role=menu] button')]
          .filter(HIEN).map(TXT).filter(x=>x),
        cao_hop:hop?Math.round(hop.getBoundingClientRect().height):0,
        cuon_duoc:hop?(hop.scrollHeight>hop.clientHeight+2):false});""")
    if op:
        op['duong'] = x['duong']
        op['o'] = x
    return op


def cho_hinh_hoc_yen(c, js_tim, han=3.0, nhip=0.08):
    """Chờ một phần tử ĐỨNG YÊN rồi mới cho lấy toạ độ. -> {'yen','x','y','vong','lech'}.

    ⚠️ ROOT CAUSE của 18 case LỖI, chứng minh 18/09 bằng phép chụp theo mốc thời gian:
    hộp thoại của màn **trượt vào từ bên phải** bằng animation CSS —

        t=0ms    x=1598  transform: translateX(798px)
        t=345ms  x= 863  transform: translateX(63px)
        t=532ms  x= 800  transform: none      <- yên vị

    Mọi thứ NẰM TRONG hộp lệch theo, tới 798px. `mo_hop()` chờ hộp xuất hiện rồi ngủ 500ms —
    sát ngay ranh giới 532ms: máy nhàn thì kịp, lượt chạy dài tải nặng thì không, và toạ độ
    đo được lệch gần 800px. `Input.dispatchMouseEvent` bắn vào chỗ trống, còn `getBoundingClientRect`
    thì vẫn trả về một con số trông hoàn toàn hợp lệ.

    KHÔNG dùng `data-state`, `animationName` hay `transform` làm tín hiệu dừng:
      · `data-state` / `animationName` GIỮ NGUYÊN (`open` / `enter`) kể cả sau khi yên vị;
      · `transform` khác `none` KHÔNG có nghĩa là đang chuyển động — hộp căn giữa bằng
        `translateX(-50%)` mang `matrix(1,0,0,1,-204,0)` đứng yên vĩnh viễn (đo trên app giả
        18/09, và chính lưới chắn sai này đã làm phép kiểm treo 3s rồi báo "vẫn dịch chỗ" cho
        một hộp bất động).
    Tín hiệu đáng tin duy nhất: **hình chữ nhật không đổi qua hai lần đọc liên tiếp**.
    `dang_chuyen` vẫn được ĐO và trả về làm bằng chứng, nhưng không tham gia điều kiện dừng.
    """
    truoc, on, i = None, 0, 0
    het = time.time() + max(0.2, float(han))
    while True:
        i += 1
        r = _js(c, _JS_HINH % js_tim)
        if not r:
            return {'yen': False, 'ly_do': 'không thấy phần tử', 'vong': i}
        vt = (r.get('x'), r.get('y'))
        if truoc is not None:
            lech = max(abs(vt[0] - truoc[0]), abs(vt[1] - truoc[1]))
            if lech <= 1:
                on += 1
                if on >= 1:
                    return {'yen': True, 'x': vt[0], 'y': vt[1], 'vong': i, 'lech': lech}
            else:
                on = 0
        truoc = vt
        if time.time() >= het:
            return {'yen': False, 'x': vt[0], 'y': vt[1], 'vong': i,
                    'ly_do': 'phần tử vẫn đang dịch chỗ sau %.1fs' % han}
        time.sleep(nhip)


_JS_HINH = """
  const e=%s; if(!e) return 'null';
  const r=e.getBoundingClientRect(); const st=getComputedStyle(e);
  /* `transform` khác `none` trong lúc animation chạy — dùng làm tín hiệu PHỤ, không phải
     tín hiệu chính (xem ghi chú ở `cho_hinh_hoc_yen`). */
  const tf=st.transform;
  return JSON.stringify({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2),
    rong:Math.round(r.width), cao:Math.round(r.height),
    dang_chuyen:!!(tf&&tf!=='none'&&!/matrix\(1, 0, 0, 1, 0, 0\)/.test(tf))});"""


# Chuỗi sự kiện của một cú bấm, bắn THẲNG vào phần tử bằng JS.
#
# ⚠️ Vì sao cần, đo trên app thật 18/09 — ô `Loại database`:
#   · nó là `<button aria-haspopup=listbox>` KHÔNG id, KHÔNG `aria-controls`, và biểu mẫu
#     KHÔNG có `<select>`/input ẩn nào mang giá trị: giá trị nằm hoàn toàn trong state React;
#   · **bàn phím không ăn**: focus vào trigger rồi Enter mở ra 0 tuỳ chọn, `activeElement`
#     vẫn là button — component không nghe phím;
#   · `el.click()` cũng không ăn: nó chỉ phát `click`, mà component nghe `pointerdown`.
#
# Còn lại đúng một đường không phụ thuộc hình học. Đây KHÔNG phải gọi API của app hay chọc
# vào state: sự kiện vẫn đi qua chính handler mà người dùng thật kích hoạt, chỉ khác là không
# qua hit-test — nên nó miễn nhiễm với mọi chuyện toạ độ/che khuất/animation.
_JS_BAN_POINTER = """
  const t=%s; if(!t) return 'null';
  const r=t.getBoundingClientRect();
  const o={bubbles:true, cancelable:true, composed:true, pointerId:1, pointerType:'mouse',
           isPrimary:true, button:0, buttons:1,
           clientX:Math.round(r.left+r.width/2), clientY:Math.round(r.top+r.height/2)};
  const o0=Object.assign({}, o, {buttons:0});
  t.dispatchEvent(new PointerEvent('pointerover', o));
  t.dispatchEvent(new PointerEvent('pointerenter', o));
  t.dispatchEvent(new PointerEvent('pointerdown', o));
  t.dispatchEvent(new MouseEvent('mousedown', o));
  t.dispatchEvent(new PointerEvent('pointerup', o0));
  t.dispatchEvent(new MouseEvent('mouseup', o0));
  t.dispatchEvent(new MouseEvent('click', o0));
  return JSON.stringify({ok:true, chu:TXT(t)});"""


def bam_pointer_js(c, js_tim):
    """Bấm bằng chuỗi PointerEvent bắn thẳng vào phần tử. -> {'ok','chu'} | None.

    Lớp lùi cho những control chỉ nghe `pointerdown` và nằm ở chỗ chuột thật không tới được.
    Xem ghi chú ở `_JS_BAN_POINTER`.
    """
    return _js(c, _JS_BAN_POINTER % js_tim)


def _do_lua_chon(c, chu):
    """Tìm một tuỳ chọn theo chữ trong danh sách ĐANG MỞ và ĐO nó — không bấm.

    Tách riêng để ĐO LẠI được sau khi nới khung nhìn: nới khung là bố cục đổi, nên mọi
    toạ độ đo trước đó thành vô nghĩa.
    """
    return _js(c, """
      const op=OPTION_HIEN();
      const t=op.find(o=>QN(TXT(o))===QN(%s))||op.find(o=>QN(TXT(o)).includes(QN(%s)));
      if(!t) return JSON.stringify({ok:false, ly_do:'không thấy lựa chọn trong danh sách đang mở',
        co:op.map(TXT).slice(0,25)});
      /* ⚠️ VÁ 2026-09-17 lượt 2 — gốc của 18 case LỖI. Danh sách tuỳ chọn mở XUỐNG DƯỚI và
         tràn khỏi đáy khung nhìn; `scrollIntoView` cuộn TRANG, mà popup thường là
         `position:fixed` nên nó không nhúc nhích — tuỳ chọn vẫn nằm ngoài khung, lưới chắn
         `ngoai_khung` chặn đúng, và lượt tạo dữ liệu QA hỏng từ bản ghi thứ 65 trở đi (lúc
         bảng đã dài nên hộp thoại bị đẩy xuống).
         Cuộn BÊN TRONG hộp danh sách trước, rồi mới tính tới cuộn trang. */
      const cuon_trong = e=>{
        let a=e.parentElement;
        for(let k=0;k<6&&a;k++,a=a.parentElement){
          const st=getComputedStyle(a);
          if(/(auto|scroll)/.test(st.overflowY)&&a.scrollHeight>a.clientHeight+2){
            const ra=a.getBoundingClientRect(), re=e.getBoundingClientRect();
            a.scrollTop += (re.top-ra.top) - (ra.height/2 - re.height/2);
            return true;}}
        return false;};
      const trong_khung = e=>{const q=e.getBoundingClientRect();
        const cx=q.left+q.width/2, cy=q.top+q.height/2;
        return q.width>0&&q.height>0&&cx>=0&&cy>=0&&cx<=innerWidth&&cy<=innerHeight;};
      if(!trong_khung(t)) cuon_trong(t);
      if(!trong_khung(t)) t.scrollIntoView({block:'center', inline:'center'});
      if(!trong_khung(t)) cuon_trong(t);
      const r=t.getBoundingClientRect();
      const x=r.left+r.width/2, y=r.top+r.height/2;
      DANH_DAU(t,'lua-chon');
      /* AI đang nằm ở đúng điểm sắp bấm? Một cú `Input.dispatchMouseEvent` đi tới phần tử
         TRÊN CÙNG tại toạ độ ấy, không đi tới phần tử ta đã tìm. Toast chồng lên, lớp phủ của
         hộp thoại, tooltip — đều nuốt cú bấm mà CDP vẫn trả về bình thường, và hàm gọi chỉ
         đọc lại trigger thấy chưa đổi rồi kết luận "bấm không ăn" mà không biết vì sao. */
      const tren=document.elementFromPoint(x,y);
      const che=!(tren===t||t.contains(tren)||(tren&&tren.contains(t)));
      const hop=t.closest('[role=listbox],[cmdk-list],[role=menu]');
      const qh=hop?hop.getBoundingClientRect():null;
      /* Bố cục TOÀN MÀN tại đúng khoảnh khắc hỏng. Thiếu khối này, mỗi vòng chẩn đoán chỉ
         biết thêm một con số và tốn trọn một lượt chạy — đã mất 3 vòng vì đúng chuyện đó. */
      const dd=document.documentElement;
      const hth=[...document.querySelectorAll('[role=dialog]')]
        .filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0;});
      const rh=hth.length?hth[hth.length-1].getBoundingClientRect():null;
      const bo_cuc={rong_cuon:dd.scrollWidth, cao_cuon:dd.scrollHeight,
        cuonX:Math.round(scrollX), dpr:devicePixelRatio,
        zoom:getComputedStyle(dd).zoom+'/'+getComputedStyle(document.body).zoom,
        tf:getComputedStyle(dd).transform, so_hop:hth.length,
        hop_thoai:rh?{x:Math.round(rh.left), y:Math.round(rh.top),
                      rong:Math.round(rh.width)}:null};
      return JSON.stringify({ok:true, chu:TXT(t), x:Math.round(x), y:Math.round(y),
        ngoai_khung:!(x>=0&&y>=0&&x<=innerWidth&&y<=innerHeight),
        khung:{rong:innerWidth, cao:innerHeight, cuon_y:Math.round(scrollY),
               cao_trang:Math.round(document.documentElement.scrollHeight)},
        bo_cuc:bo_cuc,
        hop_ds:qh?{y:Math.round(qh.top), cao:Math.round(qh.height),
                   dinh_vi:getComputedStyle(hop).position}:null,
        bi_che:che,
        che_boi:che&&tren?((tren.tagName||'').toLowerCase()
          +(tren.getAttribute('role')?'[role='+tren.getAttribute('role')+']':'')
          +' '+(TXT(tren)||'').slice(0,60)+' | class='+((tren.className||'')+'').slice(0,60)):'',
        hop_le:r.width>0&&r.height>0});""" % (_s(chu), _s(chu)))


def chon_trong_o(c, chu, cho=0.6):
    """Bấm một lựa chọn trong danh sách ĐANG MỞ. -> {'ok','chon'} hoặc {'ok':False,'co':[…]}.

    ⚠️ VÁ 2026-09-17 lượt 2 — đây là gốc của 18 case `LỖI` ở lượt chạy 500 case.

    Bản trước đi HAI lượt gọi trình duyệt: lượt ① tìm tuỳ chọn theo chữ rồi dán mốc
    `data-qa-moc="lua-chon"` lên nó, lượt ② `bam_thuc(THEO_MOC('lua-chon'))` tra lại mốc để
    lấy toạ độ mà bấm. Giữa hai lượt ấy React có thể vẽ lại danh sách (nó vẽ lại thật, mỗi khi
    lệnh gọi API tuỳ chọn trả về muộn) — phần tử mang mốc bị thay bằng phần tử mới KHÔNG mốc,
    `THEO_MOC` trả `null`, `bam_thuc` trả `None`, rồi cả lớp lùi `e.click()` cũng bấm vào
    `null`. Không có cú bấm nào xảy ra, mà không lượt nào báo lỗi: hàm chỉ đọc lại trigger
    thấy chưa đổi rồi ghi *"chọn 'ClickHouse1' nhưng ô vẫn hiện 'Chọn loại database'"*.

    Nay tìm chữ · cuộn vào tầm nhìn · lấy toạ độ **trong đúng một lượt gọi**, rồi bấm thẳng
    vào toạ độ ấy. Toạ độ là toạ độ — một lần vẽ lại không làm nó sai chỗ, còn một cái mốc thì
    biến mất. Mốc vẫn dán để lớp lùi dùng, nhưng không còn là đường chính.
    """
    # Danh sách nằm TRONG hộp thoại; hộp trượt thì danh sách trượt theo. Chờ mục đầu đứng
    # yên rồi mới đo mục cần bấm.
    cho_hinh_hoc_yen(c, '(OPTION_HIEN()[0]||null)', han=2.5)
    kq = _do_lua_chon(c, chu)
    if not (isinstance(kq, dict) and kq.get('ok')):
        return kq
    if not kq.get('hop_le'):
        return {'ok': False, 'ly_do': 'lựa chọn %r có kích thước 0 (chưa vẽ xong)' % kq.get('chu')}
    # ⚠️ GỠ BỎ 2026-09-18 — lớp lùi "NỚI KHUNG NHÌN" từng nằm ở đây đã bị bỏ hẳn, không
    # phải vá thêm. Hai lý do, cả hai đều đo được:
    #
    #   · nó KHÔNG BAO GIỜ bắt kịp. Dropdown neo theo mép phải một khối co giãn theo khung,
    #     nên nới khung 1600→2236 thì tuỳ chọn dịch 1996→2791 — tỉ lệ 1,248 không đổi. Đuổi
    #     theo cái bóng.
    #   · nó LÀM BẨN PHIÊN CHẠY. Nhánh `except` không gọi `clearDeviceMetricsOverride`, nên
    #     một ngoại lệ sau khi đã đặt override là khung nhìn giả TỒN TẠI VĨNH VIỄN cho mọi
    #     case sau. Hậu quả đo được ở lượt 74 case (18/09): bước nghiệm thu dọn đọc ra "bảng
    #     rỗng cả khi bỏ lọc" và fail-closed, 11 bản ghi QA suýt nằm lại trên app; và chính
    #     các con số `khung 2236` mà tôi đã dùng để suy luận hai vòng trước là đo trong khung
    #     giả ấy, không phải trạng thái thật của app.
    #
    # Một lớp lùi vừa không cứu được ca nó nhắm tới, vừa làm hỏng phép đo của những ca khác,
    # thì giữ lại là lỗ ròng.
    noi_khung = False
    if kq.get('ngoai_khung'):
        # Popup có thể chưa định vị xong — chờ rồi ĐO LẠI. Đây là cách duy nhất còn lại, và
        # nó không đụng gì tới môi trường.
        _cho_option_on_dinh(c, 2.5)
        kq0 = _do_lua_chon(c, chu)
        if isinstance(kq0, dict) and kq0.get('ok') and not kq0.get('ngoai_khung'):
            kq = kq0
    if kq.get('ngoai_khung'):
        # Không bấm. Một cú `dispatchMouseEvent` ra ngoài khung nhìn không tới phần tử nào mà
        # CDP vẫn trả về bình thường — im lặng theo hướng tô hồng.
        return {'ok': False, 'ngoai_khung': True, 'chon': kq.get('chu'),
                'khung': kq.get('khung'), 'hop_ds': kq.get('hop_ds'),
                'ly_do': ('lựa chọn ở (x=%s, y=%s) ngoài khung nhìn %sx%s (trang cao %s, đã '
                          'cuộn %s); hộp danh sách: %s'
                          % (kq.get('x'), kq.get('y'),
                             (kq.get('khung') or {}).get('rong'),
                             (kq.get('khung') or {}).get('cao'),
                             (kq.get('khung') or {}).get('cao_trang'),
                             (kq.get('khung') or {}).get('cuon_y'), kq.get('hop_ds')))
                + ' || bố cục: ' + str(kq.get('bo_cuc'))[:260]}
    if kq.get('bi_che'):
        # Bấm vào đây là bấm vào thứ đang nằm đè lên, không phải vào tuỳ chọn. NÓI RA nó là
        # cái gì: "bấm không ăn" một mình không đủ để ai sửa được.
        return {'ok': False, 'bi_che': True, 'chon': kq.get('chu'),
                'che_boi': kq.get('che_boi'),
                'ly_do': 'điểm bấm của lựa chọn %r bị che bởi: %s'
                         % (kq.get('chu'), kq.get('che_boi') or '(không đọc được)')}
    for kieu, nut, bits in (('mouseMoved', 'none', 0), ('mousePressed', 'left', 1),
                            ('mouseReleased', 'left', 0)):
        c.ws.call('Input.dispatchMouseEvent', type=kieu, x=kq['x'], y=kq['y'],
                  button=nut, buttons=bits, clickCount=1)
    time.sleep(max(0.3, float(cho)))
    if noi_khung:
        try:
            c.ws.call('Emulation.clearDeviceMetricsOverride')
        except Exception:
            pass
        time.sleep(0.25)
    return {'ok': True, 'chon': kq.get('chu'), 'bam_thuc': True, 'noi_khung': noi_khung,
            'x': kq['x'], 'y': kq['y']}


def dat_o_chon(c, nhan, gia_tri, pv='loc', goi_y='', cho=0.8, tuy_chon=()):
    """Chọn một giá trị trong ô chọn (mở -> bấm -> đọc lại trigger). -> dict có `ok` + `sau`.

    Luôn ĐỌC LẠI ô sau khi bấm: dropdown dựng bằng `button` + `div` có nhiều lớp bọc trông y
    như lựa chọn; bấm trúng lớp bọc thì trình duyệt vẫn nhận cú click, hàm vẫn báo `ok` mà
    giá trị KHÔNG đổi — đúng loại "thành công giả" đã làm 115/115 case ghi của một màn hỏng.
    """
    x = tim_o_chon(c, nhan, pv, goi_y, tuy_chon)
    if not x:
        return {'ok': False, 'ly_do': 'không tìm thấy ô chọn %r ở phạm vi %s' % (nhan, pv)}
    truoc = x.get('chu')
    if x.get('loai') == 'native':
        kq = _js(c, """
          const e=THEO_MOC('o-chon'); if(!e) return 'null';
          const o=[...e.options].find(o=>QN(o.text)===QN(%s))
                ||[...e.options].find(o=>QN(o.text).includes(QN(%s)));
          if(!o) return JSON.stringify({ok:false, ly_do:'không có lựa chọn này',
            co:[...e.options].map(o=>o.text)});
          e.value=o.value; e.dispatchEvent(new Event('change',{bubbles:true}));
          return JSON.stringify({ok:true, chon:o.text});""" % (_s(gia_tri), _s(gia_tri)))
    else:
        op = mo_o_chon(c, nhan, pv, goi_y, cho=cho, tuy_chon=tuy_chon)
        if not op or not op.get('option'):
            return {'ok': False, 'ly_do': 'mở ô chọn nhưng không đọc được lựa chọn nào',
                    'duong': x.get('duong')}
        kq = chon_trong_o(c, gia_tri, cho=cho)
        # Lớp lùi PointerEvent — y như `bo_chon`. Ô lọc của app cùng loại control với ô trong
        # biểu mẫu: chỉ nghe `pointerdown`, không nghe phím, không nghe `click` (đo 18/09).
        # Thiếu lớp này thì mọi phép đo ĐẶT BỘ LỌC rồi đọc lại đều bỏ cuộc — 3 case thẻ số
        # liệu nằm CHƯA ĐO vì đúng chỗ này.
        if not (isinstance(kq, dict) and kq.get('ok')):
            r2 = bam_pointer_js(c, """(()=>{const op=OPTION_HIEN();
              return op.find(o=>QN(TXT(o))===QN(%s))||op.find(o=>QN(TXT(o)).includes(QN(%s)))
                ||null;})()""" % (_s(gia_tri), _s(gia_tri)))
            if r2 and r2.get('ok'):
                kq = {'ok': True, 'chon': r2.get('chu'), 'cach': 'su_kien_pointer'}
    time.sleep(max(0.3, float(cho)))
    # ĐỌC LẠI phải kèm chính GIÁ TRỊ VỪA CHỌN làm căn cứ tìm. Sau một cú chọn thành công,
    # trigger không còn hiện chữ gợi ý nữa mà hiện giá trị — nên năm đường tìm đầu đều trượt
    # và ô "biến mất" ngay sau khi ta đặt giá trị cho nó. Hậu quả đọc ra y hệt một cú bấm
    # trượt: *"chọn xong mà trigger vẫn hiện None"*, tức báo HỎNG cho việc đã xong.
    sau = tim_o_chon(c, nhan, pv, goi_y, list(tuy_chon or []) + [gia_tri]) or {}
    if isinstance(kq, dict) and kq.get('ok') and sau.get('chu') == truoc:
        # Bấm báo ăn mà giá trị KHÔNG đổi — thử nốt đường pointer rồi đọc lại lần cuối.
        r3 = bam_pointer_js(c, """(()=>{const op=OPTION_HIEN();
          return op.find(o=>QN(TXT(o))===QN(%s))||op.find(o=>QN(TXT(o)).includes(QN(%s)))
            ||null;})()""" % (_s(gia_tri), _s(gia_tri)))
        if r3 and r3.get('ok'):
            time.sleep(max(0.3, float(cho)))
            sau = tim_o_chon(c, nhan, pv, goi_y, list(tuy_chon or []) + [gia_tri]) or {}
    if isinstance(kq, dict):
        kq = dict(kq, truoc=truoc, sau=sau.get('chu'), duong=x.get('duong'),
                  ok=bool(kq.get('ok')) and sau.get('chu') != truoc)
    return kq


def dong_o_chon(c):
    go_phim(c, 'Escape')
    time.sleep(0.35)


def co_hop_thoai(c, tieu_de=None):
    """Có hộp thoại đang mở không? `tieu_de` -> chỉ tính hộp có TIÊU ĐỀ ấy.

    ⚠️ VÁ 2026-09-17 sau lượt PILOT trên app thật. Câu hỏi *"còn hộp thoại nào đang mở
    không?"* là câu SAI khi app tự mở một hộp của riêng nó. Màn này bật hộp **"Hướng dẫn sử
    dụng"** sau mỗi lần nạp trang; nó không chặn gì cả, nhưng nó làm `co_hop_thoai()` luôn
    trả `True`. Hậu quả đo được: `tao_ban_ghi` bấm Lưu -> form ĐÓNG -> bản ghi **ĐÃ TẠO**
    (sổ mạng có `POST /targets`, bước dọn xoá được nó) -> nhưng vì hộp hướng dẫn còn đó nên
    tool kết luận *"tạo bản ghi QA không thành công"* và ném case vào lớp `LỖI`.

    Sai theo hướng nguy nhất: **báo thất bại cho một thao tác đã thành công**, và bản ghi
    thật thì đã nằm trên hệ thống.
    """
    d = _js(c, """
      const ds=[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(HIEN);
      return JSON.stringify(ds.map(h=>({tieu_de:TXT(h.querySelector('h1,h2,h3,[role=heading]')||{}),
        txt:TXT(h).slice(0,200)})));""") or []
    if tieu_de is None:
        return bool(d)
    k = qalib.norm(tieu_de)
    return any(k and k in qalib.norm(x.get('tieu_de') or '') for x in d)


def hop_dang_mo(c):
    """[{'tieu_de','txt'}] của MỌI hộp thoại đang mở — để biết hộp nào là của ta, hộp nào không."""
    return _js(c, """
      const ds=[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(HIEN);
      return JSON.stringify(ds.map(h=>({tieu_de:TXT(h.querySelector('h1,h2,h3,[role=heading]')||{}),
        txt:TXT(h).slice(0,160)})));""") or []


# Nút đóng của một hộp CHẶN NGANG — danh sách ĐÓNG. Không bấm bừa nút nào khác: một hộp lạ
# có thể mang nút xác nhận xoá, và "đóng hộp lạ" không được phép biến thành "bấm bừa".
_NUT_DONG_CHAN_NGANG = ('Bỏ qua', 'Đóng', 'Skip', 'Close', 'Tôi đã hiểu', 'Đã hiểu',
                        'Bắt đầu', 'Không hiển thị lại')


def dong_hop_chan_ngang(c, bo_qua=()):
    """Đóng hộp thoại do CHÍNH APP tự mở (hướng dẫn / thông báo onboarding). -> [tiêu đề đã đóng].

    Gọi NGAY SAU mỗi lần nạp trang, trước khi đo bất cứ thứ gì. Một hộp có mặt khi ta chưa
    bấm gì thì theo định nghĩa không phải hộp của ta — người test thật cũng đóng nó đi trước
    khi làm việc. Chỉ bấm nút nằm trong danh sách ĐÓNG ở trên; không thấy nút nào hợp lệ thì
    để nguyên và trả về danh sách rỗng (thà vướng còn hơn bấm bừa).
    """
    da = []
    # Hàm này làm việc với hộp CỦA APP, nên phải quên mốc "hộp của ta" trước: còn mốc thì
    # phạm vi `hop` trỏ vào hộp của ta và `co_nut(..., 'hop')` đi tìm nút Đóng ở nhầm chỗ.
    quen_hop_cua_ta(c)
    for _ in range(3):
        ds = hop_dang_mo(c)
        if not ds:
            break
        t = (ds[-1].get('tieu_de') or '').strip()
        if any(qalib.norm(x) == qalib.norm(t) for x in bo_qua):
            break
        xong = False
        for chu in _NUT_DONG_CHAN_NGANG:
            if co_nut(c, chu, 'hop'):
                bam(c, chu, 'hop', cho=1.0)
                da.append(t or '(không tiêu đề)')
                xong = True
                break
        if not xong:
            break
        time.sleep(0.5)
    # Hộp nào CÒN MỞ sau bước này thì đích thị là hộp của APP: bước này chạy ngay sau mỗi lần
    # nạp trang, trước khi ta bấm bất cứ thứ gì. Ghi lại một lần ở đây để `HOP()` và
    # `hop_cua_ta_con_mo()` phân biệt đúng ở MỌI chỗ, khỏi phải ghim tay từng cú bấm — và chỗ
    # nào quên ghim thì lại hỏng đúng kiểu cũ.
    _js(c, """
      window.__qaHopApp=[...document.querySelectorAll('[role=dialog],[role=alertdialog]')]
        .filter(HIEN).map(TIEU_DE_HOP).filter(x=>x);
      return JSON.stringify(window.__qaHopApp);""")
    return da


def doc_hop_thoai(c):
    """{'tieu_de','txt','nut':[…],'o':[…]} của hộp thoại đang mở — `None` nếu không có."""
    return _js(c, """
      const h=HOP(); if(!h) return 'null';
      const o=[...h.querySelectorAll('input,select,textarea,[role=combobox]')].filter(HIEN)
        .map(e=>({nhan:NHAN(e), the:e.tagName.toLowerCase()+
            (e.tagName==='INPUT'?'['+e.type+']':''), gia_tri:GT(e),
            goi_y:(e.placeholder||'').trim(), bat_buoc:!!e.required||/\\*/.test(NHAN(e)),
            vo_hieu:!!e.disabled, chi_doc:!!e.readOnly,
            maxlength:(e.maxLength>0&&e.maxLength<1e6?e.maxLength:'')}));
      return JSON.stringify({tieu_de:TXT(h.querySelector('h1,h2,h3,[role=heading]')||{}),
        txt:TXT(h).slice(0,1200), nut:[...h.querySelectorAll('button')].filter(HIEN)
          .map(b=>({chu:TXT(b), vo_hieu:!!b.disabled})), o:o});""")


def doc_loi(c, pv='auto'):
    """[chuỗi lỗi] đang hiện — `role=alert` · `aria-invalid` + mô tả · class lỗi thường gặp.

    Gom nhiều nguồn vì mỗi thư viện UI đặt lỗi một kiểu; trùng thì bỏ. Không lọc theo nội
    dung: lọc theo nội dung là tự quyết định trước cái gì "đáng kể là lỗi".

    ⚠️ VÁ 2026-09-17 sau lượt PILOT. Một thứ DUY NHẤT bị loại: mẩu chữ **không có lấy một
    chữ cái hay chữ số nào** — trên thực tế là dấu `*` đánh dấu ô bắt buộc, vốn được tô đỏ
    nên lọt vào lưới `[class*=text-red]`. Đây không phải "lọc theo nội dung": `*` không mang
    thông tin nào để mà lọc, và nó **che mất câu lỗi thật** vì đứng đầu danh sách.

    Đo được ở pilot 17/09: 3 case GHI chết với chẩn đoán đúng một ký tự —
    *"tạo bản ghi QA không thành công, hộp thoại còn mở: `*`"*. Đọc xong không biết form
    trượt ở ô nào, và mọi case validate của màn đều nhận cùng câu ấy.
    """
    return _js(c, """
      const g=PV(%s); const ra=[];
      const CO_CHU=t=>/[0-9A-Za-zÀ-ỹ]/.test(t);
      const day=e=>{const t=TXT(e);
        if(t&&t.length<300&&CO_CHU(t)&&ra.indexOf(t)<0)ra.push(t);};
      [...g.querySelectorAll('[role=alert]')].filter(HIEN).forEach(day);
      [...g.querySelectorAll('[class*=destructive i],[class*=error i],[class*=invalid i],'+
        '[class*=text-red i],.text-danger')].filter(HIEN).forEach(day);
      [...g.querySelectorAll('[aria-invalid=true]')].forEach(e=>{
        const d=e.getAttribute('aria-describedby');
        if(d){d.split(/\\s+/).forEach(id=>{const x=document.getElementById(id); if(x)day(x);});}});
      return JSON.stringify(ra);""" % _s(pv)) or []


def doc_thong_bao(c):
    """[chuỗi] của **THÔNG BÁO NỔI THẬT** — nguồn để đối chiếu `grounding.verbatim.toast_*`.

    ⚠️ Từ 2026-09-16 lượt 3 hàm này KHÔNG còn trả câu của vùng phân trang hay vùng trợ năng
    (xem `LOAI_BAO` ở `JS_NEN`). Cần cả ba loại thì gọi `doc_bao_theo_loai()`.
    """
    return (doc_bao_theo_loai(c) or {}).get('TOAST') or []


def doc_bao_theo_loai(c):
    """{'TOAST':[…], 'PHAN_TRANG':[…], 'TRO_NANG':[…]} — ba loại vùng thông báo, tách bạch.

    Phép đo nào cần chứng minh *"toast nào đã hiện"* thì đọc `TOAST`; phép đo nào muốn nêu
    bằng chứng *"đã có thứ khác chiếm chỗ"* thì đọc thêm hai khoá kia để đưa vào `du_kien` —
    nhưng không được lấy chúng làm toast.
    """
    return _js(c, "return JSON.stringify(BAO_THEO_LOAI());") or {
        'TOAST': [], 'PHAN_TRANG': [], 'TRO_NANG': []}


def doc_phan_trang(c):
    """Trạng thái phân trang, ĐỌC TRONG ĐÚNG CỤM PHÂN TRANG.

    -> {'tong','moi_trang','so_trang','so_trang_tinh','trang_hien','nut_trang','so_nut_trang',
        'co_nut_sau','co_nut_truoc','so_dong','vung'}

    ⚠️ VÁ 2026-09-17 lượt 2 — gốc của 19 case phân trang nằm CHƯA ĐO ở lượt chạy 500 case.
    Bản trước đếm **mọi nút có chữ là một con số, ở bất cứ đâu trên trang**. Trên màn thật,
    nút số duy nhất là huy hiệu **"3" ở header (y=12)**, chả liên quan gì tới phân trang — nên
    tool đọc ra `so_nut_trang:1, trang_hien:"3"` cho một màn 15 bản ghi một trang, và mọi phép
    phân trang hoặc bỏ cuộc (`so_nut_trang < 2`) hoặc đi bấm nhầm huy hiệu ấy.

    Hai chỗ sửa, cả hai đều lấy từ màn thật:

      · **khoanh vùng**: chỉ đọc control nằm trong cụm phân trang (dưới đáy bảng, hoặc trong
        `nav`/khối có class `pagina*`). Ngoài vùng ấy thì một con số chỉ là một con số.
      · **đọc cỡ trang**: app này KHÔNG vẽ nút số trang — cụm phân trang của nó là ô nhập
        *"Số bản ghi/trang: 20"* + *"Tổng số bản ghi: 15"*. Số trang phải TÍNH ra
        (`ceil(tổng/cỡ)`), không có nút để đếm. Bản trước không đọc cỡ trang lần nào, nên
        không có đường nào biết màn đang có mấy trang.
    """
    return _js(c, _JS_DONG_THAT + """
      const bang=document.querySelector('table');
      const yDay=bang?bang.getBoundingClientRect().bottom-48:0;
      const trongVung=TRONG_VUNG_PT;      /* một bản duy nhất, ở JS_NEN */
      const txt=document.body.innerText||'';
      const mTong=txt.match(/T[oổ]ng s[oố] b[aả]n ghi[:\\s]*([\\d.,]+)/i);
      const tong=mTong?parseInt(mTong[1].replace(/[.,]/g,''),10):null;
      /* cỡ trang: ô nhập / ô chọn trong cụm phân trang, rơi về chữ "Số bản ghi/trang: N" */
      let moi=null;
      for(const e of [...document.querySelectorAll('input,select,[role=combobox],button')]
                      .filter(HIEN).filter(trongVung)){
        const v=(e.tagName==='INPUT'?(e.value||''):TXT(e)).trim();
        if(/^\\d{1,4}$/.test(v)){moi=parseInt(v,10); break;}}
      if(moi===null){const mM=txt.match(/S[oố] b[aả]n ghi\\/trang[:\\s]*(\\d+)/i);
        if(mM) moi=parseInt(mM[1],10);}
      const nut=NUT_PT().filter(b=>/^\\d+$/.test(TXT(b)));
      const dang=nut.filter(b=>(b.getAttribute('aria-current')||'')==='page'
         ||/(^|[^a-z])(active|selected|current)([^a-z]|$)/i.test(b.className||'')
         ||(b.getAttribute('data-state')||'')==='active');
      const dieu=NUT_PT();
      const la=LA_NUT;
      const tinh=(tong!==null&&moi)?Math.max(1,Math.ceil(tong/moi)):null;
      return JSON.stringify({tong:mTong?mTong[1]:'', tong_so:tong, moi_trang:moi,
        so_trang_tinh:tinh,
        /* ĐẾM nút là sai khi cụm phân trang rút gọn bằng dấu "…": màn 6 trang chỉ vẽ
           1 2 3 4 … 6, đếm ra 5. Lấy số LỚN NHẤT trên nút, và vẫn so với số tính được. */
        so_trang:Math.max(tinh||0, ...nut.map(b=>parseInt(TXT(b),10)||0), nut.length>=2?2:0)||tinh,
        trang_hien:dang.length?TXT(dang[0]):(nut.length?'':(tinh?'1':'')),
        nut_trang:nut.map(TXT), so_nut_trang:nut.length,
        co_nut_sau:dieu.some(b=>la(b,/(trang )?(tiep|sau|next)|^>$|^»$/)&&!b.disabled),
        co_nut_truoc:dieu.some(b=>la(b,/(trang )?(truoc|prev)|^<$|^«$/)&&!b.disabled),
        so_dong:DONG().length,
        vung:{day_bang:Math.round(yDay), so_control_trong_vung:dieu.length}});""")


def o_muc_trang(c):
    """Ô *Số bản ghi/trang* trong CỤM PHÂN TRANG. -> {'co','the','gia_tri','loai',...} | None.

    ⚠️ VÁ 2026-09-17 lượt 2 — gốc của 5 case `o_page_size_nhap` nằm CHƯA ĐO. Bản trước hỏi
    `doc_o('Số bản ghi/trang', 'man')`, mà `doc_o` đi qua `TIM()` -> `NHAN()`, và `NHAN()` chỉ
    nhận `<label for>` của khối bọc chứa ĐÚNG MỘT control. Trên màn thật chữ *"Số bản
    ghi/trang:"* là một `<span>` nằm CẠNH ô nhập chứ không phải `<label>` — nên `doc_o` trả
    `None` và phép đo bỏ cuộc trên một ô đang hiện sờ sờ. Cùng lớp lỗi với ô lọc dựng bằng
    `<button>` (vá 16/09 lượt 3).

    Tìm theo VỊ TRÍ + hình dạng thay vì theo nhãn: ô nhập/ô chọn nằm trong cụm phân trang mà
    giá trị là một số. Cụm phân trang đã được khoanh ở `TRONG_VUNG_PT`.
    """
    return _js(c, """
      const ds=[...document.querySelectorAll('input,select,[role=combobox],button')]
        .filter(HIEN).filter(TRONG_VUNG_PT);
      const e=ds.find(x=>/^[0-9]{1,4}$/.test((x.tagName==='INPUT'?(x.value||''):TXT(x)).trim()));
      if(!e) return 'null';
      DANH_DAU(e,'o-muc-trang');
      const r=e.getBoundingClientRect();
      return JSON.stringify({co:true,
        the:e.tagName.toLowerCase()+(e.tagName==='INPUT'?'['+e.type+']':''),
        gia_tri:(e.tagName==='INPUT'?(e.value||''):TXT(e)).trim(),
        loai:(e.tagName==='SELECT'?'native':(e.tagName==='INPUT'?'nhap':'custom')),
        maxlength:(e.maxLength>0&&e.maxLength<1e6?e.maxLength:''),
        vo_hieu:!!e.disabled, x:Math.round(r.left), y:Math.round(r.top)});""")


def dat_muc_trang(c, gia_tri, cho=1.6):
    """Đặt số bản ghi/trang rồi ĐỌC LẠI. -> {'ok','truoc','sau','phan_trang'}."""
    x = o_muc_trang(c)
    if not x:
        return {'ok': False, 'ly_do': 'không tìm thấy ô Số bản ghi/trang trong cụm phân trang'}
    truoc = x.get('gia_tri')
    _js(c, """
      const e=THEO_MOC('o-muc-trang'); if(!e) return 'null';
      e.focus(); set(e,%s); return '1';""" % _s(str(gia_tri)))
    go_phim(c, 'Enter')
    time.sleep(max(0.6, float(cho)))
    sau = o_muc_trang(c) or {}
    return {'ok': str(sau.get('gia_tri') or '').strip() == str(gia_tri).strip(),
            'truoc': truoc, 'sau': sau.get('gia_tri'), 'phan_trang': doc_phan_trang(c)}


def di_trang(c, dich='sau', cho=1.6):
    """Đi tới một trang khác bằng CỤM PHÂN TRANG. -> {'ok','cach','truoc','sau'} | {'ok':False}.

    `dich` = `'sau'` · `'truoc'` · hoặc số trang.

    ⚠️ VÁ 2026-09-17 lượt 2 — gốc của 8 case phân trang nằm CHƯA ĐO. Mỗi phép phân trang tự
    viết một đoạn JS *"tìm nút có chữ ĐÚNG BẰNG '2' rồi bấm"*. Màn thật KHÔNG vẽ nút số trang
    nào: cụm phân trang của nó là ô *Số bản ghi/trang* + chữ *Tổng số bản ghi* + hai nút
    trước/sau chỉ có icon. Nên đoạn JS ấy luôn trả `'0'` và phép đo trả `None` — cho một màn
    đang có 4 trang thật.

    Ba đường, xét theo thứ tự chắc chắn giảm dần, và **đường nào cũng phải đọc lại** để biết
    trang có đổi thật không: bấm một nút phân trang bị vô hiệu trông y hệt bấm thành công.
    """
    truoc = doc_phan_trang(c) or {}
    dau = (doc_bang(c) or [{}])[0]
    r = _js(c, """
      const dich=%s;
      const ds=NUT_PT();
      let t=null, cach='';
      if(typeof dich==='number'){
        t=ds.find(b=>TXT(b)===String(dich)&&!b.disabled); cach='nut_so_trang';}
      if(!t&&(dich==='sau'||typeof dich==='number')){
        t=ds.find(b=>LA_NUT(b,/(trang )?(tiep|sau|next)|^>$|^»$|^>>$/)&&!b.disabled);
        cach=cach||'nut_trang_sau';}
      if(!t&&dich==='truoc'){
        t=ds.find(b=>LA_NUT(b,/(trang )?(truoc|prev)|^<$|^«$|^<<$/)&&!b.disabled);
        cach='nut_trang_truoc';}
      if(!t) return JSON.stringify({ok:false,
        ly_do:'cụm phân trang không có nút đi tới '+dich,
        co:ds.map(b=>TXT(b)||b.getAttribute('aria-label')||b.getAttribute('title')||'(icon)')
             .slice(0,10)});
      t.scrollIntoView({block:'center'}); const q=t.getBoundingClientRect();
      const x=q.left+q.width/2, y=q.top+q.height/2;
      const tren=document.elementFromPoint(x,y);
      return JSON.stringify({ok:true, cach:cach, chu:TXT(t)||t.getAttribute('aria-label')||'',
        x:Math.round(x), y:Math.round(y),
        trong_khung:(x>=0&&y>=0&&x<=innerWidth&&y<=innerHeight),
        bi_che:!(tren===t||t.contains(tren)||(tren&&tren.contains(t)))});"""
            % (json.dumps(dich) if not isinstance(dich, int) else dich))
    if not (isinstance(r, dict) and r.get('ok')):
        return dict(r or {'ok': False, 'ly_do': 'không chạy được JS'}, truoc=truoc)
    if not r.get('trong_khung'):
        return {'ok': False, 'ly_do': 'nút %r nằm ngoài khung nhìn' % r.get('chu'), 'truoc': truoc}
    if r.get('bi_che'):
        return {'ok': False, 'ly_do': 'nút %r bị che' % r.get('chu'), 'truoc': truoc}
    for kieu, nut, bits in (('mouseMoved', 'none', 0), ('mousePressed', 'left', 1),
                            ('mouseReleased', 'left', 0)):
        c.ws.call('Input.dispatchMouseEvent', type=kieu, x=r['x'], y=r['y'],
                  button=nut, buttons=bits, clickCount=1)
    time.sleep(max(0.6, float(cho)))
    sau = doc_phan_trang(c) or {}
    dau2 = (doc_bang(c) or [{}])[0]
    doi = (sau.get('trang_hien') != truoc.get('trang_hien')) or (dau2 != dau)
    return {'ok': bool(doi), 'cach': r.get('cach'), 'nut': r.get('chu'),
            'truoc': truoc, 'sau': sau, 'dong_dau_doi': dau2 != dau,
            'ly_do': None if doi else 'bấm %r rồi mà cả trang hiện tại lẫn dòng đầu đều không '
                                      'đổi' % r.get('chu')}


def so_trang(pt):
    """Màn đang có mấy trang, theo bản đọc `doc_phan_trang`. `0` = chưa đọc được.

    Một chỗ duy nhất trả lời câu này. Trước đây mỗi phép tự hỏi `so_nut_trang >= 2`, mà app
    không vẽ nút số trang thì câu ấy luôn trả lời KHÔNG cho một màn đang có 4 trang thật.
    """
    if not isinstance(pt, dict):
        return 0
    for k in ('so_trang', 'so_trang_tinh'):
        v = pt.get(k)
        if v:
            return int(v)
    return int(pt.get('so_nut_trang') or 0)


def nhieu_trang(pt):
    """Màn có QUÁ MỘT trang không?"""
    return so_trang(pt) > 1


def doc_van_ban(c):
    return _js(c, "return JSON.stringify((document.body.innerText||'').slice(0,20000));") or ''


# ══════════════════════════════════════════════════════════════════════════════
# 2. THAO TÁC KHÔNG ĐỔI DỮ LIỆU  (gõ · mở hộp thoại · đóng · tìm kiếm · lật trang)
# ══════════════════════════════════════════════════════════════════════════════
def dien(c, nhan, gia_tri, pv='auto', blur=True):
    """Gõ vào một ô. -> giá trị ô ĐỌC LẠI sau khi gõ, hoặc `None` nếu không có ô đó.

    Đọc lại chứ không trả "đã gõ": ô có `maxlength` cắt bớt chuỗi, ô có mask đổi định dạng —
    thứ cần cho phép đo là cái ô ĐANG GIỮ, không phải cái ta đã gửi.
    """
    return _js(c, """
      const e=TIM(%s,%s); if(!e) return 'null';
      e.focus(); set(e,%s); %s
      return JSON.stringify({gia_tri:GT(e), maxlength:(e.maxLength>0&&e.maxLength<1e6?e.maxLength:''),
        do_dai:(e.value||'').length});""" % (_s(nhan), _s(pv), _s(gia_tri),
                                             'e.blur();' if blur else ''))


def xoa_o(c, nhan, pv='auto'):
    return dien(c, nhan, '', pv)


def dan(c, nhan, gia_tri, pv='auto'):
    """Dán chuỗi vào ô bằng ĐÚNG sự kiện `paste` — case *"copy dữ liệu dán vào ô"*.

    Gõ bằng `set()` không dựng lại được ca này: ô chặn `paste` hoặc lọc nội dung dán sẽ trông
    y hệt ô bình thường nếu ta chỉ gán giá trị.
    """
    return _js(c, """
      const e=TIM(%s,%s); if(!e) return 'null';
      e.focus();
      const dt=new DataTransfer(); dt.setData('text/plain',%s);
      const ev=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt});
      const nhan_su=e.dispatchEvent(ev);
      if(nhan_su&&!ev.defaultPrevented){
        /* Trình duyệt thật sẽ chèn tại con trỏ; ô rỗng thì chèn cả chuỗi. */
        const cu=e.value||''; const a=e.selectionStart==null?cu.length:e.selectionStart;
        const b=e.selectionEnd==null?cu.length:e.selectionEnd;
        set(e, cu.slice(0,a)+%s+cu.slice(b));}
      return JSON.stringify({gia_tri:GT(e), chan_paste:ev.defaultPrevented,
        do_dai:(e.value||'').length});""" % (_s(nhan), _s(pv), _s(gia_tri), _s(gia_tri)))


def chon(c, nhan, gia_tri, pv='auto'):
    """Chọn một giá trị trong ô chọn. `<select>` đặt thẳng; combobox thì mở rồi bấm option."""
    kq = _js(c, """
      const e=TIM(%s,%s); if(!e) return 'null';
      if(e.tagName==='SELECT'){
        const o=[...e.options].find(o=>QN(o.text)===QN(%s))||
                [...e.options].find(o=>QN(o.text).includes(QN(%s)));
        if(!o) return JSON.stringify({ok:false, ly_do:'không có option',
          co:[...e.options].map(o=>o.text)});
        e.value=o.value; e.dispatchEvent(new Event('change',{bubbles:true}));
        return JSON.stringify({ok:true, gia_tri:GT(e)});}
      e.click(); return JSON.stringify({ok:'mo_combobox'});"""
              % (_s(nhan), _s(pv), _s(gia_tri), _s(gia_tri)))
    if not isinstance(kq, dict) or kq.get('ok') != 'mo_combobox':
        return kq
    time.sleep(0.45)
    return _js(c, """
      const op=[...document.querySelectorAll('[role=option],[role=menuitem],li')].filter(HIEN);
      const t=op.find(o=>QN(TXT(o))===QN(%s))||op.find(o=>QN(TXT(o)).includes(QN(%s)));
      if(!t) return JSON.stringify({ok:false, ly_do:'không thấy option trong danh sách mở',
        co:op.map(TXT).slice(0,20)});
      t.click(); return JSON.stringify({ok:true, chon:TXT(t)});"""
                  % (_s(gia_tri), _s(gia_tri)))


def chon_dau_tien(c, nhan, pv='auto', cho=6.0, thu=6):
    """Chọn tuỳ chọn THẬT đầu tiên của một ô chọn (bỏ chữ gợi ý `-- Chọn … --`). -> dict.

    Dùng cho SETUP dữ liệu QA: ô chọn BẮT BUỘC phải có giá trị thì biểu mẫu mới lưu được, mà
    SETUP không quan tâm giá trị nghiệp vụ nào — bản ghi sẽ bị xoá ở bước dọn. Khác `chon()`
    ở chỗ không cần biết trước danh sách tuỳ chọn của màn.

    Ba lưới chắn, cả ba đều lấy từ màn thật (`Loại database` của `Vị trí lưu trữ`, 16/09):

      · danh sách tuỳ chọn nạp BẤT ĐỒNG BỘ (`Đang tải...`) -> chờ tới `cho` giây cho tới khi
        có tuỳ chọn thật, thay vì đọc một lần rồi báo "không có";
      · chữ gợi ý cũng là một tuỳ chọn -> loại theo khuôn `-- Chọn … --` · `Chọn …` · `Đang
        tải…`, nếu không thì SETUP "chọn" đúng cái rỗng mà biểu mẫu vẫn báo thiếu;
      · **bấm xong phải ĐỌC LẠI trigger**. Dropdown dựng bằng `button` + `div` (không phải
        `<select>`) có nhiều lớp bọc trông y như tuỳ chọn; bấm trúng lớp bọc thì trình duyệt
        vẫn nhận cú click, hàm vẫn trả `ok: true`, mà giá trị KHÔNG đổi — đúng loại "thành
        công giả" đã làm 115/115 case ghi của màn hỏng mà log không hề kêu. Không đổi thì thử
        ứng viên kế tiếp, hết ứng viên mới trả `ok: false`.
    """
    bo = (r"const BO=t=>{const q=QN(t).trim(); return !q||/^[-\s]*chon\b/.test(q)||"
          r"/^dang tai/.test(q)||/^-{2,}/.test(q);};")
    kq = _js(c, """
      %s
      const e=TIM(%s,%s); if(!e) return 'null';
      if(e.tagName==='SELECT'){
        const o=[...e.options].find(o=>o.value!==''&&!BO(o.text));
        if(!o) return JSON.stringify({ok:false, ly_do:'ô chọn chưa có tuỳ chọn thật',
          co:[...e.options].map(o=>o.text)});
        e.value=o.value; e.dispatchEvent(new Event('change',{bubbles:true}));
        return JSON.stringify({ok:true, chon:o.text, gia_tri:GT(e)});}
      return JSON.stringify({ok:'mo_combobox', truoc:GT(e)});"""
                % (bo, _s(nhan), _s(pv)))
    if not isinstance(kq, dict) or kq.get('ok') != 'mo_combobox':
        return kq
    truoc = str(kq.get('truoc') or '')
    # Mở danh sách bằng CHUỘT THẬT. `el.click()` mở được menu Radix nhưng cú bấm vào TUỲ CHỌN
    # thì không ăn (§giao_thuc_do_luong: *"Dropdown không bấm được"*) — đo 16/09 trên ô
    # `Loại database`: bấm hết 6 tuỳ chọn bằng `el.click()` mà giá trị ô không đổi một lần nào.
    if not bam_thuc(c, 'TIM(%s,%s)' % (_s(nhan), _s(pv))):
        return {'ok': False, 'ly_do': 'không bấm được ô chọn để mở danh sách'}

    # Ứng viên = phần tử LÁ (không chứa ứng viên khác) trong danh sách đang mở. Lấy cả lối
    # ARIA lẫn lối `cmdk`/`data-value`; `li`/`div` trơn chỉ nhận khi không còn lối nào khác.
    js_uv = """
      %s
      const S='[role=option],[cmdk-item],[data-value],[role=menuitem]';
      let ds=[...document.querySelectorAll(S)].filter(HIEN);
      if(!ds.length) ds=[...document.querySelectorAll('li')].filter(HIEN);
      ds=ds.filter(e=>!e.querySelector(S)).filter(e=>!BO(TXT(e)));
      return JSON.stringify(ds.slice(0,%d).map(TXT));""" % (bo, int(thu))
    t0 = time.time()
    uv = []
    while time.time() - t0 < cho:
        time.sleep(0.35)
        uv = _js(c, js_uv) or []
        if uv:
            break
    if not uv:
        return {'ok': False, 'ly_do': 'không thấy tuỳ chọn thật nào trong danh sách mở'}

    for chu in uv:
        r = _js(c, """
          %s
          const S='[role=option],[cmdk-item],[data-value],[role=menuitem]';
          let ds=[...document.querySelectorAll(S)].filter(HIEN);
          if(!ds.length) ds=[...document.querySelectorAll('li')].filter(HIEN);
          ds=ds.filter(e=>!e.querySelector(S)).filter(e=>!BO(TXT(e)));
          const t=ds.find(e=>QN(TXT(e))===QN(%s));
          return JSON.stringify(t?{ok:true, chon:TXT(t)}
            :{ok:false, ly_do:'tuỳ chọn biến mất khỏi danh sách'});""" % (bo, _s(chu)))
        if not (isinstance(r, dict) and r.get('ok')):
            continue
        tim_uv = ('(()=>{%s const S=\'[role=option],[cmdk-item],[data-value],[role=menuitem]\';'
                  'let ds=[...document.querySelectorAll(S)].filter(HIEN);'
                  'if(!ds.length) ds=[...document.querySelectorAll(\'li\')].filter(HIEN);'
                  'ds=ds.filter(e=>!e.querySelector(S)).filter(e=>!BO(TXT(e)));'
                  'return ds.find(e=>QN(TXT(e))===QN(%s))||null;})()' % (bo, _s(chu)))
        if not bam_thuc(c, tim_uv):
            continue
        time.sleep(0.5)
        sau = _js(c, "const e=TIM(%s,%s); return JSON.stringify({gt:e?GT(e):''});"
                  % (_s(nhan), _s(pv))) or {}
        sau = str(sau.get('gt') or '')
        if sau and sau != truoc:
            return {'ok': True, 'chon': r.get('chon'), 'gia_tri': sau}
        # bấm không ăn -> mở lại danh sách rồi thử ứng viên kế tiếp
        bam_thuc(c, 'TIM(%s,%s)' % (_s(nhan), _s(pv)))
        time.sleep(0.45)
    return {'ok': False, 'ly_do': 'bấm hết %d tuỳ chọn mà giá trị ô không đổi' % len(uv),
            'co': uv}


def bam(c, chu, pv='auto', cho=0.8):
    """Bấm một nút theo chữ (JS click). -> {'ok','chu','vo_hieu'} hoặc `None` nếu không có nút.

    ⚠️ KHÔNG dùng cho nút thay đổi dữ liệu: đường đó đi qua `chay_live.Cong.ghi()` rồi mới
    gọi `bam_ghi()`.
    """
    kq = _js(c, """
      const b=NUT(%s,%s); if(!b) return 'null';
      if(b.disabled) return JSON.stringify({ok:false, vo_hieu:true, chu:TXT(b)});
      b.click(); return JSON.stringify({ok:true, chu:TXT(b)});""" % (_s(chu), _s(pv)))
    if kq and kq.get('ok'):
        time.sleep(cho)
    return kq


def co_nut(c, chu, pv='auto'):
    return _js(c, """
      const b=NUT(%s,%s); if(!b) return 'null';
      return JSON.stringify({chu:TXT(b), vo_hieu:!!b.disabled,
        nhan_aria:(b.getAttribute('aria-label')||b.getAttribute('title')||'')});"""
                  % (_s(chu), _s(pv)))


def bam_chuot(c, chu, pv='auto'):
    """Bấm bằng CHUỘT THẬT qua CDP — bắt buộc cho case *"click liên tục"* (§giao_thuc_do_luong).

    Bốn cú `el.click()` trong cùng một tick đi lọt khoá nút của React và cho kết luận "không
    chống bấm trùng" sai. Chuột thật đi qua đúng đường sự kiện mà người dùng đi.
    """
    return bam_thuc(c, 'NUT(%s,%s)' % (_s(chu), _s(pv)))


def bam_thuc(c, js_tim):
    """Bấm CHUỘT THẬT lên phần tử mà biểu thức JS `js_tim` trả về. -> dict|None.

    Ruột của `bam_chuot`, tách ra để chỗ nào cần chuột thật lên một phần tử KHÔNG PHẢI nút
    tìm theo chữ (tuỳ chọn trong dropdown dựng bằng `div`) cũng đi đúng một đường: cuộn vào
    tầm nhìn -> kiểm khung nhìn -> `mouseMoved` + `mousePressed` + `mouseReleased`.
    """
    # Đo toạ độ NGAY TRƯỚC khi bấm, và chỉ đo khi phần tử đã đứng yên: một phần tử đang
    # trượt cho ra toạ độ trông hợp lệ nhưng đã cũ khi cú chuột tới nơi (xem
    # `cho_hinh_hoc_yen`).
    yen = cho_hinh_hoc_yen(c, js_tim, han=2.5)
    hop = _js(c, _JS_TOA_DO % js_tim)
    if not hop:
        return None
    if isinstance(hop, dict) and not yen.get('yen'):
        hop = dict(hop, chua_yen=True, ly_do_chua_yen=yen.get('ly_do'))
    if hop.get('vo_hieu'):
        return {'ok': False, 'vo_hieu': True, 'chu': hop.get('chu')}
    if hop.get('ngoai_khung'):
        # KHÔNG bấm. Một cú `Input.dispatchMouseEvent` ra ngoài khung nhìn không tới phần tử
        # nào, nhưng CDP vẫn trả về bình thường — phép đo đọc ra "đã bấm, 0 request" rồi kết
        # luận sai theo hướng tô hồng. Đo được 16/09: hộp `[role=alertdialog]` không được app
        # đặt `position:fixed` nằm ở y=843 trong khung 1000px sau khi trang đã cuộn.
        return {'ok': False, 'ngoai_khung': True, 'chu': hop.get('chu'),
                'x': hop.get('x'), 'y': hop.get('y'), 'khung': hop.get('khung')}
    # Chuỗi sự kiện ĐẦY ĐỦ của một cú bấm thật: di chuột tới, nhấn (kèm bitmask `buttons`),
    # rồi nhả. Thiếu `mouseMoved` hoặc thiếu `buttons` thì Chrome vẫn nhận lệnh nhưng trang
    # KHÔNG nhận được `click` — và một cú bấm không ăn làm phép "chống bấm trùng" đọc ra
    # 0 request rồi kết luận "nút có chống bấm trùng". Sai theo hướng tô hồng.
    c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=hop['x'], y=hop['y'],
              button='none', buttons=0)
    c.ws.call('Input.dispatchMouseEvent', type='mousePressed', x=hop['x'], y=hop['y'],
              button='left', buttons=1, clickCount=1)
    c.ws.call('Input.dispatchMouseEvent', type='mouseReleased', x=hop['x'], y=hop['y'],
              button='left', buttons=0, clickCount=1)
    return {'ok': True, 'chu': hop.get('chu'), 'x': hop['x'], 'y': hop['y']}


# Phím -> (mã ảo, `key`, `code`, `text`).
#   · `key`  là GIÁ TRỊ phím (`'Enter'`, `' '`) — đúng như thuộc tính `KeyboardEvent.key`;
#   · `code` là VỊ TRÍ phím trên bàn phím (`'Enter'`, `'Space'`);
#   · `text` là ký tự sinh ra, và nó mới là thứ làm Chrome chạy hành vi mặc định.
# Phím cách có `key=' '` nhưng `code='Space'` — đặt `key='Space'` thì Chrome coi là một phím
# lạ và nút đang giữ tiêu điểm KHÔNG bị kích hoạt (phép kiểm bắt được đúng ca này 21/09).
_PHIM = {'Tab': (9, 'Tab', 'Tab', ''), 'Enter': (13, 'Enter', 'Enter', '\r'),
         'Escape': (27, 'Escape', 'Escape', ''), 'Space': (32, ' ', 'Space', ' ')}


def go_phim(c, phim, so_lan=1, nghi=0.12):
    """Gõ phím thật (Tab · Shift+Tab · Enter · Escape · Space) — case điều hướng bàn phím.

    ⚠️ VÁ 2026-09-21. Bản trước gửi `keyDown`/`keyUp` mà KHÔNG kèm `text`. Qua CDP, một
    `keyDown` không có `text` chỉ là phím THÔ: Chrome không sinh sự kiện ký tự, nên **hành vi
    mặc định không chạy** — nút đang giữ tiêu điểm không bị kích hoạt, `<form>` không submit.
    Đo được trên app giả 21/09, cùng một nút, cùng một tiêu điểm:

        ① keyDown/keyUp không `text`      -> số lần nút bị kích hoạt = 0
        ② thêm `text='\r'` + `code`       -> số lần nút bị kích hoạt = 1

    Hậu quả trên app thật: case *"Tab tới nút Cập nhật rồi nhấn Enter liên tục"* (r472) đo ra
    `so_request_ghi: 0` với nút KHÔNG hề bị vô hiệu — và cả tháng 9 không vòng chẩn đoán nào
    phân biệt được "nút chống bấm trùng" với "Enter chưa từng tới nút". Lỗi này chạm MỌI case
    bàn phím của tool, không riêng r472.
    """
    ma, key, ma_phim, chu = _PHIM.get(phim, (0, phim, phim, ''))
    mod = 8 if phim == 'Shift+Tab' else 0
    if phim == 'Shift+Tab':
        ma, key, ma_phim, chu = 9, 'Tab', 'Tab', ''
    for _ in range(int(so_lan)):
        xuong = dict(type='keyDown', windowsVirtualKeyCode=ma, nativeVirtualKeyCode=ma,
                     key=key, code=ma_phim, modifiers=mod)
        if chu:
            xuong.update(text=chu, unmodifiedText=chu)
        c.ws.call('Input.dispatchKeyEvent', **xuong)
        c.ws.call('Input.dispatchKeyEvent', type='keyUp', windowsVirtualKeyCode=ma,
                  nativeVirtualKeyCode=ma, key=key, code=ma_phim, modifiers=mod)
        time.sleep(nghi)
    return True


def phan_tu_dang_focus(c):
    return _js(c, """
      const e=document.activeElement; if(!e||e===document.body) return 'null';
      return JSON.stringify({the:e.tagName.toLowerCase(), nhan:NHAN(e)||TXT(e).slice(0,40),
        trong_hop:!!(HOP()&&HOP().contains(e))});""")


def mo_hop(c, chu, cho=1.2):
    """Mở một hộp thoại bằng nút `chu` (Thêm mới / Chỉnh sửa). -> hộp thoại đọc được, hoặc None.

    Chỉ MỞ — đây vẫn là thao tác đọc (`probe_live` làm y hệt từ 09/09) và không gửi request
    ghi nào. Nút chốt (Lưu / Tạo / Xoá) nằm ở nhánh khác, có cổng riêng.

    Ghi lại hộp nào đã có TRƯỚC cú bấm: hộp MỚI XUẤT HIỆN sau cú bấm mới là hộp của ta. Không
    có mốc ấy thì mọi phép sau (`doc_hop_thoai`, `dong_hop`, tìm ô ở phạm vi `hop`) làm việc
    với hộp mà chính app tự mở — xem ghi chú ở `HOP()`.
    """
    nho_hop_app(c)
    if not bam(c, chu, 'man', cho=0.4):
        return None
    t0 = time.time()
    while time.time() - t0 < cho + 6:
        if chot_hop_cua_ta(c):
            # Chờ hộp ĐỨNG YÊN thay vì ngủ 0,5s. Hộp của màn này trượt vào trong ~532ms —
            # ngủ 500ms là sát ranh giới, và mọi toạ độ đọc sớm hơn đều lệch tới 798px.
            cho_hinh_hoc_yen(c, 'HOP()')
            return doc_hop_thoai(c)
        time.sleep(0.3)
    return None


def nho_hop_app(c):
    """Ghi tên các hộp ĐANG mở trước khi ta bấm — chúng là hộp của APP, không phải của ta."""
    return _js(c, """
      window.__qaHop='';
      window.__qaHopApp=[...document.querySelectorAll('[role=dialog],[role=alertdialog]')]
        .filter(HIEN).map(TIEU_DE_HOP).filter(x=>x);
      return JSON.stringify(window.__qaHopApp);""")


def chot_hop_cua_ta(c):
    """Có hộp MỚI (không nằm trong danh sách hộp của app) không? Có thì ghi tên nó lại."""
    return _js(c, """
      const cu=(window.__qaHopApp||[]).map(QN);
      const ds=[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(HIEN);
      const moi=ds.filter(x=>cu.indexOf(QN(TIEU_DE_HOP(x)))<0);
      if(!moi.length) return JSON.stringify(false);
      window.__qaHop=TIEU_DE_HOP(moi[moi.length-1]);
      return JSON.stringify(window.__qaHop||true);""")


def quen_hop_cua_ta(c):
    _js(c, "window.__qaHop=''; return '1';")


def hop_cua_ta_con_mo(c):
    """Hộp CỦA TA còn mở không? -> bool.

    Câu hỏi này KHÁC HẲN `co_hop_thoai()` không tham số, và chỗ nào hỏi nhầm câu thì hỏng
    theo hướng không sửa được: màn tự mở hộp "Hướng dẫn sử dụng" nên câu rộng trả lời CÓ mãi
    mãi, và mọi hàm dùng nó để kết luận *"đã đóng chưa"* sẽ trả lời KHÔNG cho một hộp đã đóng
    hẳn. Đó là cách `tao_ban_ghi` báo THẤT BẠI cho một bản ghi đã tạo xong trên app thật.
    """
    d = _js(c, """
      const ta=QN(window.__qaHop||'');
      const app=(window.__qaHopApp||[]).map(QN);
      const ds=[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(HIEN)
        .map(TIEU_DE_HOP);
      if(ta) return JSON.stringify(ds.some(t=>QN(t)===ta));
      return JSON.stringify(ds.some(t=>app.indexOf(QN(t))<0));""")
    return bool(d)


def cho_hop_cua_ta(c, giay=8.0):
    """Chờ hộp CỦA TA hiện ra sau một cú bấm, rồi ghim tên nó. -> bool.

    Mọi chỗ mở hộp thoại phải đi qua đây. Chờ bằng `querySelector('[role=dialog]')` là chờ
    **bất kỳ hộp nào**, mà hộp app tự mở thì đã có sẵn từ đầu — nên vòng chờ ấy trả về ngay
    lập tức kể cả khi hộp của ta chưa mở, và mọi phép đọc sau đó đọc nhầm hộp.
    """
    het = time.time() + max(0.5, float(giay))
    while time.time() < het:
        if chot_hop_cua_ta(c):
            return True
        time.sleep(0.25)
    return False


def mo_hop_theo_dong(c, ma, tieu_de_icon='Chỉnh sửa', cho=1.2):
    """Mở hộp thoại của MỘT dòng (icon Chỉnh sửa/Xóa trên dòng mang mã `ma`).

    Tìm dòng theo mã rồi mới bấm icon **trong dòng đó** — không bao giờ bấm icon của dòng đầu
    tiên. Đây đúng là chỗ một phép tìm lỏng biến case sửa bản ghi QA thành sửa bản ghi thật.
    """
    kq = _js(c, """
      const ma=QN(%s);
      const tr=[...document.querySelectorAll('table tbody tr')].find(r=>
        [...r.querySelectorAll('td')].some(td=>QN(TXT(td))===ma));
      if(!tr) return JSON.stringify({ok:false, ly_do:'không thấy dòng mang mã'});
      const nhan=QN(%s);
      window.__qaHop='';
      window.__qaHopApp=[...document.querySelectorAll('[role=dialog],[role=alertdialog]')]
        .filter(HIEN).map(TIEU_DE_HOP).filter(x=>x);
      const b=[...tr.querySelectorAll('button,[role=button],a')].find(x=>
        QN(x.getAttribute('title')||'')===nhan||QN(x.getAttribute('aria-label')||'')===nhan
        ||QN(TXT(x))===nhan)
        ||[...tr.querySelectorAll('button,[role=button],a')].find(x=>
        QN((x.getAttribute('title')||'')+' '+(x.getAttribute('aria-label')||'')+' '+TXT(x))
          .includes(nhan));
      if(!b) return JSON.stringify({ok:false, ly_do:'dòng không có icon '+%s,
        co:[...tr.querySelectorAll('button')].map(x=>x.getAttribute('title')||TXT(x))});
      b.click(); return JSON.stringify({ok:true});"""
              % (_s(ma), _s(tieu_de_icon), _s(tieu_de_icon)))
    if not (isinstance(kq, dict) and kq.get('ok')):
        return kq if isinstance(kq, dict) else {'ok': False, 'ly_do': 'không chạy được JS'}
    t0 = time.time()
    while time.time() - t0 < cho + 6:
        # Cùng luật với `mo_hop`: hộp của ta là hộp MỚI XUẤT HIỆN, không phải hộp cuối trong
        # DOM — hộp app tự mở nằm sau chỗ app gắn hộp của mình.
        if chot_hop_cua_ta(c):
            cho_hinh_hoc_yen(c, 'HOP()')
            return {'ok': True, 'hop': doc_hop_thoai(c)}
        time.sleep(0.3)
    return {'ok': False, 'ly_do': 'bấm rồi nhưng không thấy hộp thoại mở'}


def dong_hop(c, chu_huy=('Hủy bỏ', 'Hủy', 'Huỷ', 'Đóng', 'Cancel')):
    """Đóng hộp thoại CỦA TA bằng nút Hủy (không bao giờ bằng nút chốt). -> True nếu đã đóng.

    Câu hỏi "đã đóng chưa" hỏi về ĐÚNG hộp của ta, không hỏi "còn hộp nào trên màn không":
    hộp app tự mở luôn còn đó, nên câu hỏi rộng trả lời KHÔNG mãi mãi và hàm này gõ Escape
    thêm một lần vô ích sau mỗi lần đóng thành công.
    """
    for chu in chu_huy:
        if bam(c, chu, 'hop', cho=0.6):
            if not hop_cua_ta_con_mo(c):
                quen_hop_cua_ta(c)
                return True
    go_phim(c, 'Escape')
    time.sleep(0.6)
    if not hop_cua_ta_con_mo(c):
        quen_hop_cua_ta(c)
        return True
    return False


def tich_dong(c, ma, bo=False):
    """Tích (hoặc bỏ tích) ô chọn của dòng mang mã `ma`."""
    return _js(c, """
      const ma=QN(%s);
      const tr=[...document.querySelectorAll('table tbody tr')].find(r=>
        [...r.querySelectorAll('td')].some(td=>QN(TXT(td))===ma));
      if(!tr) return JSON.stringify({ok:false, ly_do:'không thấy dòng'});
      const cb=tr.querySelector('input[type=checkbox],[role=checkbox]');
      if(!cb) return JSON.stringify({ok:false, ly_do:'dòng không có ô tích chọn'});
      const dang=cb.type==='checkbox'?cb.checked:(cb.getAttribute('aria-checked')==='true');
      if(dang!==%s) cb.click();
      const sau=cb.type==='checkbox'?cb.checked:(cb.getAttribute('aria-checked')==='true');
      return JSON.stringify({ok:true, tich:sau});""" % (_s(ma), 'false' if bo else 'true'))


def tim_kiem(c, tu_khoa, nhan=None, cho=None):
    """Gõ vào ô tìm kiếm rồi CHỜ HẾT DEBOUNCE. -> {'gia_tri','so_dong'}.

    `cho` lấy từ `grounding.hang_so.tim_kiem_debounce_ms` — gõ xong đo ngay là cách đo sai đã
    ghi ở `<giao_thuc_do_luong>`.
    """
    o = nhan or _tim_o_tim_kiem(c)
    if not o:
        return None
    kq = dien(c, o, tu_khoa, 'man', blur=False)
    if kq is None:
        return None
    time.sleep(max(0.8, float(cho or 0) / 1000.0 + 0.9))
    pt = doc_phan_trang(c) or {}
    return {'o': o, 'gia_tri': kq.get('gia_tri'), 'so_dong': pt.get('so_dong'),
            'tong': pt.get('tong'), 'van_ban': doc_van_ban(c)[:4000]}


def _tim_o_tim_kiem(c):
    """Nhãn của ô tìm kiếm trên thanh lọc — `None` nếu màn không có ô nào.

    ⚠️ Vá ngay trong lượt dựng (15/09): bản đầu khớp `/tim|search/i` lên chuỗi CÓ DẤU nên
    `"Tìm kiếm theo mã, tên hiển thị..."` **không khớp** (`tim` ≠ `tìm`) và hàm trả `None`.
    Hậu quả dây chuyền chứ không phải một lỗi lẻ: `tim_kiem()` không chạy → không phép nào
    tìm được bản ghi QA vừa tạo → 7/12 case thành LỖI, rồi bước dọn đọc danh sách cũng
    không thấy bản ghi nào và **báo ĐÃ DỌN SẠCH trong khi app còn nguyên 8 bản ghi QA**.
    Đúng lớp lỗi im lặng nguy hiểm nhất: một phép so chuỗi hỏng làm cả phép an toàn nói dối.
    Nay so trên chuỗi đã BỎ DẤU (`QN`), và nhận thêm vài lối viết nhãn thường gặp.
    """
    return _js(c, """
      /* ⚠️ Vá sau lượt chạy live 15/09 (lỗi thứ hai của cùng hàm này). Bản trước lấy ô đầu
         tiên theo THỨ TỰ TÀI LIỆU, mà ô đầu tiên của app này là ô tìm kiếm TOÀN CỤC ở khung
         điều hướng — không phải ô lọc của màn. Hậu quả: 12 case tìm kiếm gõ vào nhầm ô, bảng
         không đổi, và tool chấm F cho một màn đang chạy đúng. Nay loại hẳn vùng khung
         (header/aside/nav/footer) và ưu tiên ô nằm TRONG vùng giữa `h1` và bảng dữ liệu. */
      const khung=e=>!!e.closest('header,aside,nav,footer,[role=banner],[role=navigation]');
      const h=document.querySelector('h1');
      const bang=document.querySelector('table');
      const tren=h?h.getBoundingClientRect().top:0;
      const duoi=bang?bang.getBoundingClientRect().top:1e9;
      const hop_le=e=>{const t=QN((e.placeholder||'')+' '+(e.getAttribute('aria-label')||'')+' '
                   +(e.getAttribute('title')||'')+' '+NHAN(e));
        return /(^|[^a-z])(tim kiem|tim|search|tu khoa|keyword)([^a-z]|$)/.test(t);};
      const ds=[...document.querySelectorAll('input')].filter(HIEN).filter(hop_le)
        .filter(e=>!khung(e));
      const trong_vung=ds.filter(e=>{const r=e.getBoundingClientRect();
        return r.top>=tren-8 && r.top<=duoi+8;});
      const chon=(trong_vung[0]||ds[0]);
      return JSON.stringify(chon?(NHAN(chon)||chon.placeholder||null):null);""")


def dat_zoom(c, ti_le):
    """Đặt mức phóng của trang (case zoom in/out). -> True/False."""
    try:
        c.ws.call('Emulation.setPageScaleFactor', pageScaleFactor=float(ti_le))
        return True
    except Exception:
        try:
            c.js('document.body.style.zoom=%s' % json.dumps(str(ti_le)))
            return True
        except Exception:
            return False


def do_tran_ngang(c):
    """Đo hiện tượng TRÀN NGANG + chồng lấn — dữ kiện của case zoom / căn lề.

    Không kết luận "giao diện đẹp/xấu" (máy không kết luận được), chỉ đo hai thứ đo được:
    trang có thanh cuộn ngang không, và phần tử nào tràn khỏi khung nhìn.
    """
    return _js(c, """
      const de=document.documentElement;
      const tran=[...document.querySelectorAll('table,main,header,h1,button,input')]
        .filter(HIEN).filter(e=>{const r=e.getBoundingClientRect();
          return r.right>de.clientWidth+2||r.left<-2;})
        .slice(0,12).map(e=>e.tagName.toLowerCase()+':'+TXT(e).slice(0,26));
      return JSON.stringify({rong_trang:de.scrollWidth, rong_khung:de.clientWidth,
        cuon_ngang:de.scrollWidth>de.clientWidth+2, tran:tran});""")


def mang_offline(c, tat=True):
    """Bật/tắt chế độ MẤT MẠNG của trình duyệt — case *"khi mất kết nối mạng"*.

    Đây là thao tác trên TRÌNH DUYỆT, không phải trên app: không request nào được gửi đi,
    không dữ liệu nào đổi. Nhờ vậy case ngoại lệ chạy được thật thay vì phải chấm PE.
    """
    try:
        c.ws.call('Network.emulateNetworkConditions', offline=bool(tat), latency=0,
                  downloadThroughput=-1, uploadThroughput=-1)
        return True
    except Exception:
        return False


def xoa_cookie_phien(c):
    """Xoá cookie của trình duyệt — dựng ca *"thao tác khi hết phiên"*.

    Cũng là thao tác trên trình duyệt. KHÔNG gọi API đăng xuất (đó là request ghi) và không
    đụng tới tài khoản.
    """
    for m in ('Network.clearBrowserCookies', 'Storage.clearCookies'):
        try:
            c.ws.call(m)
            return True
        except Exception:
            continue
    return False


def xoa_token_trong_trang(c):
    """Xoá token lưu ở `localStorage`/`sessionStorage` — app SPA giữ phiên ở đây chứ không ở cookie.

    KHÔNG in giá trị token ra bất cứ đâu: hàm chỉ trả về SỐ khoá đã xoá.
    """
    return _js(c, """
      let n=0;
      for(const kho of [localStorage,sessionStorage]){
        const k=Object.keys(kho||{}).filter(x=>/token|auth|session|jwt/i.test(x));
        k.forEach(x=>{kho.removeItem(x); n++;});}
      return JSON.stringify({da_xoa:n});""")


# ══════════════════════════════════════════════════════════════════════════════
# 3. THAO TÁC ĐỔI DỮ LIỆU  — chỉ gọi được khi đã có giấy thông hành
# ══════════════════════════════════════════════════════════════════════════════
class ChuaXinPhep(RuntimeError):
    """Gọi thao tác ghi mà không đưa giấy thông hành của `Cong` — lỗi lập trình, không phải
    lỗi vận hành. Ném thẳng chứ không chặn im: một đường ghi lách được cổng phải lộ ra ngay
    ở lần chạy thử đầu tiên."""


def bam_ghi(c, chu, giay_phep, pv='hop', cho=1.6, thuc=False):
    """Bấm nút CHỐT (Lưu · Tạo · Cập nhật · Xóa). `giay_phep` là vật chứng đã qua `Cong.ghi()`.

    Không có giấy phép thì ném `ChuaXinPhep` — không có nhánh nào chạy tiếp.
    """
    if not giay_phep:
        raise ChuaXinPhep('bấm nút ghi %r mà không có giấy thông hành từ Cong.ghi()' % chu)
    kq = (bam_chuot(c, chu, pv) if thuc else bam(c, chu, pv, cho=0.2))
    if kq and kq.get('ok'):
        time.sleep(cho)
    return kq


# ══════════════════════════════════════════════════════════════════════════════
# 4. THAO TÁC NGƯỜI DÙNG NÂNG CAO  (mới 2026-09-16 — chỉ thị "nâng cấp live test")
# ══════════════════════════════════════════════════════════════════════════════
# Vì sao tách khối: mục 2 ở trên là thao tác một-lần (gõ, bấm, mở hộp). Khối này là những
# thao tác mà **cách làm quyết định kết luận** — bấm đúp bằng `el.click()` hai lần trong một
# tick cho kết luận ngược hẳn với hai cú chuột thật cách nhau 90 ms; hover bằng
# `dispatchEvent(new MouseEvent('mouseover'))` không kích hoạt `:hover` của CSS nên mọi case
# đổi màu khi rê chuột đều đọc ra "không đổi". Cả hai lỗi đều *tô hồng hoặc bôi đen* kết quả
# mà không để lại dấu vết, nên chúng phải có đường riêng, đi bằng CDP `Input.*`.

# Toạ độ TÂM của một phần tử, SAU KHI đã cố đưa nó vào khung nhìn — và nói thẳng ra khi
# không đưa được. Hai lần cuộn chứ không một: `scrollIntoView` không có tác dụng với phần tử
# `position:fixed` (và với phần tử nằm trong một khối cuộn riêng), nên phải kiểm lại bằng
# toạ độ thật rồi mới quyết định.
_JS_TOA_DO = """
  const b=%s; if(!b) return 'null';
  b.scrollIntoView({block:'center', inline:'center'});
  let r=b.getBoundingClientRect();
  if(r.width<=0||r.height<=0) return 'null';
  const trong=()=>{r=b.getBoundingClientRect();
    const x=r.left+r.width/2, y=r.top+r.height/2;
    return x>=0&&y>=0&&x<=innerWidth&&y<=innerHeight;};
  if(!trong()){ window.scrollBy(0, Math.round(r.top-innerHeight/2)); }
  const ok=trong();
  return JSON.stringify({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2),
    chu:TXT(b)||NHAN(b)||'', vo_hieu:!!b.disabled, ngoai_khung:!ok,
    khung:{rong:innerWidth, cao:innerHeight}});"""


def _hop_cua(c, chu, pv='auto', la_o=False):
    """Toạ độ TÂM của một control/nút sau khi đã cuộn nó vào tầm nhìn. -> {'x','y',…}|None.

    Mang thêm cờ `ngoai_khung`: người gọi PHẢI xét nó trước khi bấm/rê chuột. Bấm ra ngoài
    khung nhìn không báo lỗi ở đâu cả — nó chỉ làm thao tác không xảy ra.
    """
    tim = 'TIM(%s,%s)' % (_s(chu), _s(pv)) if la_o else 'NUT(%s,%s)' % (_s(chu), _s(pv))
    return _js(c, _JS_TOA_DO % tim)


def re_chuot(c, chu, pv='auto', la_o=False, cho=0.5):
    """Rê chuột THẬT lên một phần tử rồi đọc lại kiểu hiển thị. -> {'truoc','sau','doi'}|None.

    Phải là chuột thật: `:hover` của CSS chỉ bật khi Chrome tự cập nhật trạng thái chuột.
    Một `dispatchEvent(new MouseEvent('mouseover'))` không bật `:hover`, nên mọi case
    *"đổi màu khi rê chuột"* đo bằng cách ấy đều ra "không đổi" — F oan có hệ thống.
    """
    hop = _hop_cua(c, chu, pv, la_o)
    if not hop or hop.get('ngoai_khung'):
        return None
    js_doc = ("""const b=%s; if(!b) return 'null'; const s=getComputedStyle(b);
      return JSON.stringify({nen:s.backgroundColor, chu_mau:s.color, vien:s.borderColor,
        con_tro:s.cursor, do_mo:s.opacity, bong:s.boxShadow, gach:s.textDecorationLine});"""
              % ('TIM(%s,%s)' % (_s(chu), _s(pv)) if la_o else 'NUT(%s,%s)' % (_s(chu), _s(pv))))
    truoc = _js(c, js_doc)
    # Đưa chuột ra chỗ khác trước: nếu con trỏ đang sẵn ở đó thì `mouseMoved` không đổi gì và
    # "trước" đã là trạng thái hover — phép đo sẽ kết luận "không đổi màu" cho một nút có đổi.
    c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=2, y=2, button='none', buttons=0)
    time.sleep(0.15)
    c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=hop['x'], y=hop['y'],
              button='none', buttons=0)
    time.sleep(cho)
    sau = _js(c, js_doc)
    if not truoc or not sau:
        return None
    doi = [k for k in sau if truoc.get(k) != sau.get(k)]
    return {'chu': hop.get('chu'), 'truoc': truoc, 'sau': sau, 'doi': doi,
            'co_doi': bool(doi), 'x': hop['x'], 'y': hop['y']}


def tooltip_cua(c, js_tim, cho=2.5, moi=0.25):
    """Rê chuột lên phần tử rồi CHỜ chú thích hiện. -> dict mô tả chú thích, luôn có `loai`.

    ⚠️ Gom về một chỗ 2026-09-16 lượt 3. Hai phép đo chú thích trước đây mỗi phép tự dựng
    một đoạn JS, và cả hai đều thiếu ba thứ khiến chúng kết luận *"KHÔNG có chú thích nào
    hiện ra"* cho những màn có chú thích:

      ① **không dời chuột đi trước.** Con trỏ đang sẵn ở đó thì `mouseMoved` tới cùng toạ độ
         không sinh ra `pointerenter`, và thư viện chú thích không có gì để nghe.
      ② **đọc đúng MỘT lần sau 1,2 giây.** Radix/Floating-UI mặc định trễ 700 ms và còn thêm
         một nhịp chuyển cảnh — đọc một lần là bắt trượt. Nay POLL cho tới `cho` giây.
      ③ **chỉ tìm `[role=tooltip]`.** Chú thích còn có thể là chú thích GỐC CỦA TRÌNH DUYỆT
         (thuộc tính `title`) — thứ không tạo ra phần tử DOM nào. Kết luận "không có chú
         thích" cho một nút có `title` là sai, và sai theo hướng tố cáo sản phẩm.

    `loai`: `'dom'` (phần tử thật, đo được hình học) · `'native'` (thuộc tính `title`, trình
    duyệt tự vẽ — KHÔNG đo được kích thước) · `''` (không có gì).
    """
    vt = _js(c, _JS_TOA_DO % js_tim)
    if not vt or vt.get('ngoai_khung'):
        return None
    js_doc = """
      const ds=[...document.querySelectorAll('[role=tooltip],[data-radix-popper-content-wrapper],'
        +'[data-state=delayed-open],[class*=tooltip i],[id^=radix-]')].filter(HIEN)
        .filter(e=>TXT(e));
      if(!ds.length) return 'null'; const e=ds[0]; const r=e.getBoundingClientRect();
      const st=getComputedStyle(e);
      return JSON.stringify({txt:TXT(e), rong:Math.round(r.width), cao:Math.round(r.height),
        x:Math.round(r.left), y:Math.round(r.top),
        can:st.textAlign, co_chu:st.fontSize, xuong_dong:st.whiteSpace});"""
    # ① dời chuột ra xa rồi mới rê vào — xem ghi chú trên
    c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=2, y=2, button='none', buttons=0)
    time.sleep(0.2)
    c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=vt['x'], y=vt['y'],
              button='none', buttons=0)
    tt, t0 = None, time.time()
    while time.time() - t0 < float(cho):        # ② poll thay vì đọc một lần
        tt = _js(c, js_doc)
        if tt:
            break
        time.sleep(moi)
    thuoc_tinh = _js(c, """
      const b=%s; if(!b) return 'null';
      const mo=b.getAttribute('aria-describedby');
      const x=mo?document.getElementById(mo):null;
      return JSON.stringify({title:(b.getAttribute('title')||''),
        aria:(b.getAttribute('aria-label')||''), mo_ta:x?TXT(x):''});""" % js_tim) or {}
    if tt:
        return dict(tt, loai='dom', sau_giay=round(time.time() - t0, 2),
                    thuoc_tinh=thuoc_tinh, vi_tri_nut=vt)
    native = (thuoc_tinh.get('title') or '').strip()        # ③ chú thích gốc của trình duyệt
    if native:
        return {'loai': 'native', 'txt': native, 'thuoc_tinh': thuoc_tinh, 'vi_tri_nut': vt}
    return {'loai': '', 'txt': '', 'thuoc_tinh': thuoc_tinh, 'vi_tri_nut': vt}


def thoi_re_chuot(c):
    """Đưa chuột về góc — trả màn về trạng thái không-hover trước khi đo thứ khác."""
    try:
        c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=2, y=2,
                  button='none', buttons=0)
        return True
    except Exception:
        return False


def bam_nhieu_lan(c, chu, so_lan=4, cach_ms=90, pv='auto'):
    """Bấm CHUỘT THẬT `so_lan` lần, giãn `cach_ms` — case *"click liên tục"* / bấm đúp.

    `cach_ms` mặc định 90: §giao_thuc_do_luong đòi 80–90 ms. Nhanh hơn thì Chrome gộp thành
    một cú bấm đúp và app chỉ thấy một sự kiện; chậm hơn thì khoá nút của app kịp nhả và
    phép đo không còn đo cái nó định đo.
    """
    hop = _hop_cua(c, chu, pv)
    if not hop:
        return None
    if hop.get('ngoai_khung'):
        return {'ok': False, 'ngoai_khung': True, 'chu': hop.get('chu'), 'so_lan': 0}
    if hop.get('vo_hieu'):
        return {'ok': False, 'vo_hieu': True, 'chu': hop.get('chu'), 'so_lan': 0}
    c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=hop['x'], y=hop['y'],
              button='none', buttons=0)
    n = 0
    for i in range(int(so_lan)):
        c.ws.call('Input.dispatchMouseEvent', type='mousePressed', x=hop['x'], y=hop['y'],
                  button='left', buttons=1, clickCount=1)
        c.ws.call('Input.dispatchMouseEvent', type='mouseReleased', x=hop['x'], y=hop['y'],
                  button='left', buttons=0, clickCount=1)
        n += 1
        if i < int(so_lan) - 1:
            time.sleep(max(0.0, float(cach_ms) / 1000.0))
    return {'ok': True, 'chu': hop.get('chu'), 'so_lan': n, 'cach_ms': cach_ms}


def bam_dup(c, chu, pv='auto'):
    """Bấm ĐÚP thật (`clickCount=2`) — khác hẳn hai cú bấm rời ở `bam_nhieu_lan`."""
    hop = _hop_cua(c, chu, pv)
    if not hop or hop.get('ngoai_khung'):
        return None
    c.ws.call('Input.dispatchMouseEvent', type='mouseMoved', x=hop['x'], y=hop['y'],
              button='none', buttons=0)
    for lan in (1, 2):
        c.ws.call('Input.dispatchMouseEvent', type='mousePressed', x=hop['x'], y=hop['y'],
                  button='left', buttons=1, clickCount=lan)
        c.ws.call('Input.dispatchMouseEvent', type='mouseReleased', x=hop['x'], y=hop['y'],
                  button='left', buttons=0, clickCount=lan)
        time.sleep(0.05)
    return {'ok': True, 'chu': hop.get('chu')}


def cuon(c, toi='cuoi', giay=0.5):
    """Cuộn trang (`'cuoi'` · `'dau'` · số pixel). -> {'y','cao','xem'} sau khi cuộn."""
    if toi == 'cuoi':
        js = 'window.scrollTo(0, document.body.scrollHeight);'
    elif toi == 'dau':
        js = 'window.scrollTo(0, 0);'
    else:
        js = 'window.scrollBy(0, %d);' % int(toi)
    _js(c, js + " return JSON.stringify(1);")
    time.sleep(giay)
    return _js(c, """return JSON.stringify({y:Math.round(window.scrollY),
      cao:document.body.scrollHeight, xem:window.innerHeight,
      cuoi_trang:(window.scrollY+window.innerHeight)>=document.body.scrollHeight-4});""")


def cuon_toi(c, chu, pv='auto', la_o=False):
    """Cuộn đúng một phần tử vào giữa tầm nhìn. -> True nếu thấy phần tử."""
    return bool(_hop_cua(c, chu, pv, la_o))


# ── TỆP ────────────────────────────────────────────────────────────────────────────────
def o_chon_tep(c, pv='auto'):
    """[{'nhan','chap_nhan','nhieu'}] các ô `<input type=file>` đang có (kể cả ô bị ẩn).

    KHÔNG lọc theo `HIEN`: biểu mẫu tải tệp gần như luôn giấu ô thật sau một nút bọc, nên
    lọc theo hiển thị là kết luận "màn không có chỗ tải tệp" cho mọi màn có chức năng đó.
    """
    return _js(c, """
      const g=PV(%s);
      return JSON.stringify([...g.querySelectorAll('input[type=file]')].map((e,i)=>({
        i:i, nhan:NHAN(e)||'', chap_nhan:(e.accept||''), nhieu:!!e.multiple,
        hien:HIEN(e), vo_hieu:!!e.disabled})));""" % _s(pv)) or []


def nap_tep(c, duong_dan, chi_so=0, pv='auto', giay_phep=None):
    """Đặt tệp vào ô `<input type=file>` — tương đương `setInputFiles` của Playwright.

    KHÔNG bấm nút gửi: đặt tệp là thao tác trên trình duyệt, gửi mới là thao tác ghi và phải
    đi qua `Cong.ghi()` + `bam_ghi()`. Tách hai bước để một case *"kiểm tra ô tải tệp nhận
    đúng định dạng"* chạy được mà không cần quyền ghi.

    Trả `{'ten','so_tep','nhan'}` đọc lại TỪ Ô — không trả "đã đặt": ô có `accept` lọc định
    dạng có thể từ chối tệp, và thứ phép đo cần là cái ô ĐANG GIỮ.
    """
    import os as _os
    if not _os.path.isfile(duong_dan):
        return None
    nut = _js(c, """
      const g=PV(%s); const ds=[...g.querySelectorAll('input[type=file]')];
      const e=ds[%d]; if(!e) return 'null';
      e.setAttribute('data-qa-tep','1');
      return JSON.stringify({nhan:NHAN(e)||'', chap_nhan:(e.accept||'')});"""
                % (_s(pv), int(chi_so)))
    if not nut:
        return None
    try:
        r = c.ws.call('DOM.getDocument', depth=-1, pierce=True)
        nid = c.ws.call('DOM.querySelector', nodeId=r['root']['nodeId'],
                        selector='input[type=file][data-qa-tep="1"]').get('nodeId')
        if not nid:
            return None
        c.ws.call('DOM.setFileInputFiles', files=[_os.path.abspath(duong_dan)], nodeId=nid)
    except Exception:
        return None
    finally:
        _js(c, """const e=document.querySelector('input[type=file][data-qa-tep]');
                  if(e) e.removeAttribute('data-qa-tep'); return JSON.stringify(1);""")
    time.sleep(0.4)
    return _js(c, """
      const g=PV(%s); const e=[...g.querySelectorAll('input[type=file]')][%d];
      if(!e) return 'null';
      return JSON.stringify({nhan:NHAN(e)||'', so_tep:(e.files?e.files.length:0),
        ten:(e.files&&e.files[0]?e.files[0].name:''),
        co:(e.files&&e.files[0]?e.files[0].size:0), chap_nhan:(e.accept||'')});"""
                  % (_s(pv), int(chi_so)))


# ── TRẠNG THÁI MÀN: đang tải · rỗng · lỗi ──────────────────────────────────────────────
# Ba trạng thái này là ba KẾT LUẬN khác nhau và hay bị trộn: bảng 0 dòng có thể là "đang tải"
# (chưa có dữ liệu), "rỗng" (có dữ liệu nhưng không khớp lọc) hoặc "lỗi tải". Trộn chúng là
# chấm F cho một màn đang tải bình thường.
def trang_thai_tai(c):
    """{'dang_tai','rong','loi','so_dong','chu_rong','chu_loi','nut_thu_lai'}."""
    return _js(c, _JS_DONG_THAT + """
      const g=document;
      const quay=[...g.querySelectorAll('[role=progressbar],[aria-busy=true],'+
        '[class*=spinner i],[class*=loading i],[class*=skeleton i],[class*=pulse i],'+
        '[class*=shimmer i],[data-loading=true]')].filter(HIEN);
      /* Ô `colspan` phủ hết bảng mang HAI nghĩa trái nhau và phải tách ra:
           · CÓ CHỮ  -> trạng thái RỖNG ("Không có dữ liệu");
           · KHÔNG CHỮ nhưng có khối con -> vạch xám ĐANG TẢI (skeleton).
         Gộp chúng là đọc một màn đang tải thành một màn rỗng rồi chấm F. Lối nhận skeleton
         theo tên class không đủ: mỗi app một tên (`sk`, `skeleton`, `animate-pulse`), và
         `sk` thì quá ngắn để khớp an toàn — hình dạng mới là dấu hiệu dùng chung được. */
      const o_colspan=[...g.querySelectorAll('table tbody tr td[colspan]')].filter(HIEN);
      const khung_tai=o_colspan.filter(td=>!TXT(td) && td.children.length>0);
      const o_rong=o_colspan.filter(td=>TXT(td))
        .concat([...g.querySelectorAll('[class*=empty i],[data-empty],[class*=no-data i]')]
          .filter(HIEN));
      const chu_rong=o_rong.map(TXT).filter(t=>t&&t.length<200);
      const bao=[...g.querySelectorAll('[role=alert],[class*=error i],[class*=destructive i]')]
        .filter(HIEN).map(TXT).filter(t=>t&&t.length<300);
      const thu=[...g.querySelectorAll('button,[role=button]')].filter(HIEN)
        .filter(b=>/thu lai|tai lai|retry|reload/i.test(QN(TXT(b))));
      return JSON.stringify({dang_tai:(quay.length+khung_tai.length)>0,
        so_quay:quay.length, so_khung_tai:khung_tai.length,
        so_dong:DONG().length, rong:DONG().length===0 && chu_rong.length>0,
        chu_rong:chu_rong.slice(0,3), loi:bao.length>0, chu_loi:bao.slice(0,3),
        nut_thu_lai:thu.map(TXT)});""")


def cho_thong_bao(c, giay=8.0, moi=0.3, chua=None):
    """Chờ toast hiện ra, POLL `moi` giây — §giao_thuc_do_luong: đo sau 8-9 giây là mất toast.

    `chua` (chuỗi đã bỏ dấu) lọc theo nội dung; không truyền thì nhận toast đầu tiên nào.
    Trả `{'chu':[…], 'sau_giay':…}` hoặc `None` nếu hết giờ mà không thấy.
    """
    t0 = time.time()
    while time.time() - t0 < giay:
        ds = doc_thong_bao(c) or []
        if ds:
            if chua is None:
                return {'chu': ds, 'sau_giay': round(time.time() - t0, 2)}
            k = qalib.norm(chua)
            hop = [x for x in ds if k in qalib.norm(x)]
            if hop:
                return {'chu': hop, 'moi_chu': ds, 'sau_giay': round(time.time() - t0, 2)}
        time.sleep(moi)
    return None


# ── BẢNG: sắp xếp · lật trang · thao tác trong dòng ────────────────────────────────────
def bam_tieu_de_cot(c, ten_cot):
    """Bấm tiêu đề cột để sắp xếp. -> {'cot','sap_xep','bam_duoc'} hoặc None nếu không có cột."""
    return _js(c, """
      const n=QN(%s);
      const th=[...document.querySelectorAll('table thead th')]
        .find(x=>QN(TXT(x))===n) || [...document.querySelectorAll('table thead th')]
        .find(x=>QN(TXT(x)).includes(n)&&n.length>=3);
      if(!th) return 'null';
      const bam=th.querySelector('button,[role=button]')||th;
      bam.click();
      return JSON.stringify({cot:TXT(th), bam_duoc:true,
        sap_xep:(th.getAttribute('aria-sort')||th.getAttribute('data-sort')||'')});"""
                  % _s(ten_cot))


def doc_sap_xep_cot(c, ten_cot):
    return _js(c, """
      const n=QN(%s);
      const ths=[...document.querySelectorAll('table thead th')];
      const i=ths.findIndex(x=>QN(TXT(x))===n);
      if(i<0) return 'null';
      const gt=[...document.querySelectorAll('table tbody tr')].map(r=>{
        const td=r.querySelectorAll('td'); return td[i]?TXT(td[i]):'';}).filter(x=>x!=='');
      return JSON.stringify({cot:TXT(ths[i]), chi_so:i, gia_tri:gt.slice(0,50),
        aria:(ths[i].getAttribute('aria-sort')||'')});""" % _s(ten_cot))


def lat_trang(c, so_trang=2):
    """Bấm sang một trang khác. -> {'truoc','sau','doi'} — `doi` nói dữ liệu có thay đổi không.

    So NỘI DUNG trang trước/sau chứ không chỉ so số trang: nút phân trang đổi trạng thái
    "đang chọn" mà bảng vẫn giữ nguyên dữ liệu là đúng lỗi mà case lật trang đi tìm.
    """
    truoc = [r['txt'] for r in (doc_bang(c) or [])]
    kq = _js(c, """
      const s=String(%d);
      const nut=[...document.querySelectorAll('button,[role=button],a')].filter(HIEN)
        .filter(b=>TXT(b).trim()===s);
      if(!nut.length) return 'null';
      if(nut[0].disabled) return JSON.stringify({ok:false, vo_hieu:true});
      nut[0].click(); return JSON.stringify({ok:true});""" % int(so_trang))
    if not kq or not kq.get('ok'):
        return kq
    time.sleep(1.4)
    sau = [r['txt'] for r in (doc_bang(c) or [])]
    return {'ok': True, 'trang': so_trang, 'so_dong_truoc': len(truoc), 'so_dong_sau': len(sau),
            'doi': truoc != sau, 'phan_trang': doc_phan_trang(c)}


def bam_trong_dong(c, ma, nhan, giay_phep=None, bat_buoc_phep=False):
    """Bấm một nút/icon NẰM TRONG dòng mang mã `ma` — không bao giờ bấm nút của dòng đầu.

    Cùng luật với `mo_hop_theo_dong`, tách riêng vì nhiều case chỉ cần BẤM (xem chi tiết,
    bật/tắt trạng thái) chứ không mở hộp thoại.

    ⚠️ VÁ 2026-09-17 lượt 2. Cú bấm này CÓ THỂ mở hộp thoại, nên nó phải ghi tên các hộp đang
    có TRƯỚC đó rồi ghim hộp mới xuất hiện — y như `mo_hop`. Thiếu bước ấy thì `HOP()` rơi về
    "hộp cuối cùng trong DOM", mà hộp app tự mở nằm sau chỗ app gắn hộp của mình: bấm icon
    Chỉnh sửa của một dòng xong, `doc_hop_thoai()` đọc ra hộp **"Hướng dẫn sử dụng"**, và phép
    đo kết luận về một biểu mẫu nó chưa hề nhìn thấy.
    """
    if bat_buoc_phep and not giay_phep:
        # Trên màn KHÔNG có hộp xác nhận, cú bấm icon này chính là lệnh ghi — nó phải nằm
        # trong một cửa sổ ghi đã khai, y như nút Lưu. Không có giấy phép thì dừng, không có
        # nhánh nào chạy tiếp.
        raise ChuaXinPhep('bấm icon %r trên dòng %r là một lệnh GHI mà không có giấy thông '
                          'hành từ Cong.ghi()' % (nhan, ma))
    nho_hop_app(c)
    kq = _js(c, """
      const ma=QN(%s), nhan=QN(%s);
      const tr=[...document.querySelectorAll('table tbody tr')].find(r=>
        [...r.querySelectorAll('td')].some(td=>QN(TXT(td))===ma));
      if(!tr) return JSON.stringify({ok:false, ly_do:'không thấy dòng mang mã'});
      const ds=[...tr.querySelectorAll('button,[role=button],a,input[type=checkbox],[role=switch]')];
      const b=ds.find(x=>QN(x.getAttribute('title')||'')===nhan
            ||QN(x.getAttribute('aria-label')||'')===nhan||QN(TXT(x))===nhan)
        ||ds.find(x=>QN((x.getAttribute('title')||'')+' '+(x.getAttribute('aria-label')||'')
            +' '+TXT(x)).includes(nhan));
      if(!b) return JSON.stringify({ok:false, ly_do:'dòng không có nút khớp',
        co:ds.map(x=>TXT(x)||x.getAttribute('title')||x.getAttribute('aria-label')||'')
              .filter(Boolean).slice(0,8)});
      b.click(); return JSON.stringify({ok:true, nhan:TXT(b)||b.getAttribute('title')||''});"""
                % (_s(ma), _s(nhan)))
    if isinstance(kq, dict) and kq.get('ok'):
        # Best-effort: cú bấm nào không mở hộp thì không ghim gì, và `HOP()` vẫn xử đúng nhờ
        # danh sách hộp-của-app vừa ghi ở trên.
        time.sleep(0.6)
        chot_hop_cua_ta(c)
    return kq


def control_trong_dong(c, chi_so=0):
    """[{'nhan','the'}] mọi control NẰM TRONG một dòng bảng — `kho_control` không quét chỗ này.

    Lỗ đã trả giá 15/09: phép `liet_ke_thanh_phan` báo màn *"THIẾU icon Sửa/Xóa"* trong khi
    ảnh chụp có đủ icon ở mọi dòng, chỉ vì kho control chỉ nạp thanh lọc · nút đầu màn · cột
    bảng. Hàm này là nguồn để vá chỗ đó.
    """
    return _js(c, """
      const tr=[...document.querySelectorAll('table tbody tr')].filter(r=>
        [...r.querySelectorAll('td')].length>1)[%d];
      if(!tr) return JSON.stringify([]);
      return JSON.stringify([...tr.querySelectorAll(
        'button,[role=button],a,input,select,textarea,[role=switch],[role=checkbox]')]
        .map(e=>({nhan:(e.getAttribute('title')||e.getAttribute('aria-label')||TXT(e)
                  ||e.placeholder||'').trim(),
          the:e.tagName.toLowerCase()+(e.tagName==='INPUT'?'['+e.type+']':''),
          hien:HIEN(e)})).filter(x=>x.nhan||x.the));""" % int(chi_so))


# ── BREADCRUMB ────────────────────────────────────────────────────────────────────────
def doc_breadcrumb(c):
    """[{'chu','href','cuoi'}] các chặng của breadcrumb — `None` nếu màn không có."""
    return _js(c, """
      const a=document.querySelector('aside');
      const ung=[...document.querySelectorAll('nav,ol,ul,div')].filter(e=>{
        if(a&&a.contains(e)) return false;
        const r=e.getBoundingClientRect();
        if(r.top>320||r.height>80||r.width<160) return false;
        return /trang ch|\\/|›|>/.test(QN(TXT(e)))||!!e.closest('[aria-label*=readcrumb]');});
      if(!ung.length) return 'null';
      const box=ung.sort((x,y)=>TXT(x).length-TXT(y).length)[0];
      const la=[...box.querySelectorAll('*')].filter(e=>e.children.length===0);
      const ds=la.map(e=>({chu:TXT(e), href:(e.closest('a')||{}).href||'',
          cuoi:false})).filter(x=>x.chu&&/[0-9A-Za-zÀ-ỹ]/.test(x.chu));
      if(ds.length) ds[ds.length-1].cuoi=true;
      return JSON.stringify({chang:ds, txt:TXT(box).slice(0,300)});""")


# ── ẢNH CHỤP TRƯỚC/SAU ────────────────────────────────────────────────────────────────
def anh(c, thu_muc, ten):
    """Chụp một ảnh vào `<thu_muc>/<ten>.png`. Trả đường dẫn tương đối để ghi vào evidence."""
    import os as _os
    if not thu_muc:
        return None
    p = _os.path.join(thu_muc, '%s.png' % re.sub(r'[^0-9A-Za-z_.-]+', '-', str(ten))[:80])
    return c.shot(p)


class AnhTruocSau:
    """Chụp ảnh TRƯỚC và SAU một thao tác — bằng chứng bắt buộc của case có thao tác.

        with live_ui.AnhTruocSau(c, thu_muc, 'r120-xoa') as a:
            ...thao tác...
        a.duong   # {'truoc': …, 'sau': …}

    Chụp cả khi thao tác ném lỗi: ảnh của một thao tác hỏng là ảnh cần nhất.
    """

    def __init__(self, c, thu_muc, ten):
        self.c, self.thu_muc, self.ten = c, thu_muc, ten
        self.duong = {}

    def __enter__(self):
        self.duong['truoc'] = anh(self.c, self.thu_muc, '%s-truoc' % self.ten)
        return self

    def __exit__(self, et, ev, tb):
        self.duong['sau'] = anh(self.c, self.thu_muc, '%s-sau' % self.ten)
        return False


# ── GỌI API TRONG CHÍNH PHIÊN ĐANG ĐĂNG NHẬP (CHỈ ĐỌC) ────────────────────────────────
def goi_api_doc(c, url, method='GET'):
    """Gọi API bằng `fetch` TRONG trang, dùng đúng phiên đang đăng nhập. CHỈ `GET`/`HEAD`.

    Dùng cho case ATTT *"vai trò B gọi API của tài nguyên A"*: UI có thể ẩn nút mà máy chủ
    vẫn cho — chỉ hỏi DOM thì không bao giờ thấy lỗ đó.

    ⛔ Hàm này **từ chối** mọi method khác `GET`/`HEAD`. Thao tác ghi bằng API không có đường
    nào ở đây: nó phải đi qua `Cong.ghi()` + cửa sổ ghi như mọi thao tác ghi khác, và trên
    UI thật chứ không phải bằng một lời gọi `fetch` do tool tự chế.

    Trả `{'ma','ok','loai','do_dai','tom_tat'}` — **không bao giờ trả thân đầy đủ**: thân
    phản hồi của API có thể mang token/cookie/dữ liệu cá nhân, và evidence không phải chỗ
    cho chúng. `tom_tat` chỉ giữ 200 ký tự đầu đã bỏ mọi chuỗi giống khoá bí mật.
    """
    m = str(method or 'GET').upper()
    if m not in ('GET', 'HEAD'):
        raise ValueError('goi_api_doc chỉ nhận GET/HEAD — thao tác ghi phải đi qua Cong.ghi()')
    v = c.js("""(async()=>{try{
        const r=await fetch(%s,{method:%s,credentials:'include',redirect:'manual'});
        let t=''; try{t=(await r.text()).slice(0,400);}catch(e){}
        return JSON.stringify({ma:r.status, ok:r.ok, loai:r.type,
          do_dai:t.length, tom_tat:t.slice(0,200)});
      }catch(e){return JSON.stringify({ma:0, ok:false, loi:String(e).slice(0,160)});}})()"""
             % (_s(url), _s(m)))
    try:
        d = json.loads(v) if isinstance(v, str) else v
    except Exception:
        return None
    if isinstance(d, dict) and d.get('tom_tat'):
        d['tom_tat'] = qalib.che_url(d['tom_tat'], 200) if '://' in d['tom_tat'] \
            else _che_bi_mat(d['tom_tat'])
    return d


_RX_BI_MAT = re.compile(
    r'("?(?:token|access_token|refresh_token|id_token|jwt|password|pass|pwd|secret|'
    r'api[_-]?key|authorization|cookie|otp)"?\s*[:=]\s*)("[^"]*"|[^,\s}]+)', re.I)
# Phần CHỮ KÝ của JWT có thể ngắn (bản rút gọn trong log, chuỗi mẫu trong tài liệu).
# Bản đầu đòi ≥ 4 ký tự nên `eyJhbGciOi.eyJzdWIi.sig` lọt qua — bộ tự kiểm ㉒ bắt được.
# Che THỪA một chuỗi vô hại rẻ hơn nhiều so với để lọt một token thật.
_RX_JWT = re.compile(r'\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{2,}')


def _che_bi_mat(s):
    """Che mọi khoá nhạy cảm trong một đoạn văn bản tự do — cùng luật với `qalib.che_url`."""
    s = _RX_JWT.sub('<JWT đã che>', str(s or ''))
    return _RX_BI_MAT.sub(lambda m: m.group(1) + '<đã che>', s)

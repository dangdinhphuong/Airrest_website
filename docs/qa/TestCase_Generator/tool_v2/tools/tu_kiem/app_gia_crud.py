#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ỨNG DỤNG GIẢ CÓ CRUD THẬT — để tự kiểm vòng đời dữ liệu QA  (mới 2026-09-15 lượt 4).

`app_gia.py` dựng đủ hình dạng DOM cho lớp A (SOI màn) nhưng **không có dữ liệu**: không tạo
được, không sửa được, không xoá được. Vì thế mọi phép kiểm của lớp ghi trước nay chỉ chạy được
trên app thật — tức là không ai chạy, và lỗi chỉ lộ ra khi đang thao tác trên dữ liệu thật.

App này có một kho dữ liệu thật trong bộ nhớ, **có chủ sở hữu (tenant)**, và cư xử đúng như màn
danh mục của app thật: validate mã theo `^[a-z0-9_]+$` ≤ 32 ký tự, chặn mã trùng, trả thông báo
nguyên văn, xoá đơn lẻ và xoá hàng loạt (gọi API **lặp từng dòng**), tìm kiếm phía trình duyệt
có ngưỡng 3 ký tự + debounce, phân trang, xuất Excel.

Hai thứ cố ý gài để phép kiểm an toàn có cái mà chặn:

  · mỗi tenant có sẵn **bản ghi THẬT** (`nguon_that_01`…) — không mang dấu QA. Mọi phép thử
    "sửa/xoá dữ liệu thật" phải bị hàng rào chặn TRƯỚC khi chạm tới đây;
  · hai tài khoản thuộc **hai tenant khác nhau**, dữ liệu không nhìn thấy nhau; API trả 403 khi
    thao tác lên bản ghi của tenant khác — để phép kiểm chứng minh được rằng khi hàng rào của
    tool hụt thì vẫn còn một tầng nữa, và quan trọng hơn: để đo xem hàng rào của tool có chặn
    TRƯỚC khi request kịp bay đi hay không.

    python3 tools/tu_kiem/app_gia_crud.py [--port 0]
"""
import argparse
import json
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TAI_KHOAN = {
    # tài khoản -> (mật khẩu, tenant, có quyền vào màn?)
    'qa@gia.vn': ('matkhau-QA', 'T1', True),
    'khac@gia.vn': ('matkhau-KHAC', 'T2', True),
    # Vai trò ĐỐI CHỨNG của phép kiểm ATTT: đăng nhập được, nhưng KHÔNG có quyền với màn.
    # Cùng tenant T1 với `qa@gia.vn` một cách cố ý — để phép đo phải phân biệt được
    # "không có quyền" với "khác phạm vi dữ liệu", hai thứ hay bị trộn làm một.
    'xem@gia.vn': ('matkhau-XEM', 'T1', False),
}
KHONG_DU_QUYEN = ('Không đủ quyền truy cập — Bạn không có quyền truy cập trang này. '
                  'Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là sự nhầm lẫn.')

MA_RX = re.compile(r'^[a-z0-9_]+$')
MA_MAX, TEN_MAX = 32, 100
TRANG_THAI = [('active', 'Đang hoạt động'), ('inactive', 'Không hoạt động'),
              ('archived', 'Đã lưu trữ')]
NHAN_TT = dict(TRANG_THAI)

LOI = {
    'ma_rong': 'Vui lòng nhập mã',
    'ma_sai': 'Chỉ dùng chữ thường, số và dấu _',
    'ma_dai': 'Tối đa 32 ký tự',
    'ten_rong': 'Vui lòng nhập tên hiển thị',
    'ten_dai': 'Tối đa 100 ký tự',
    'trung': 'Mã đã tồn tại trong hệ thống',
}


class Kho:
    """Kho dữ liệu theo tenant. Mọi thao tác đều đi qua đây nên đếm được số lần gọi."""

    def __init__(self):
        self.d = {}                 # tenant -> {id: bản ghi}
        self.seq = 0
        self.khoa = threading.Lock()
        self.dem = {'tao': 0, 'sua': 0, 'xoa': 0, 'doc': 0}
        for t in ('T1', 'T2'):
            for i in range(1, 26):
                self._them(t, 'nguon_that_%02d' % i, 'Nguồn dữ liệu thật %02d (%s)' % (i, t),
                           TRANG_THAI[i % 3][0])

    def _them(self, tenant, ma, ten, tt):
        self.seq += 1
        bg = {'id': str(self.seq), 'code': ma, 'title': ten, 'status': tt,
              'created': time.strftime('%d/%m/%Y'), 'tenant': tenant}
        self.d.setdefault(tenant, {})[bg['id']] = bg
        return bg

    def ds(self, tenant):
        return list(self.d.get(tenant, {}).values())

    def mot(self, ma_id):
        """Bản ghi theo id, KHÔNG lọc tenant — người gọi phải tự so `tenant` rồi mới trả.

        Cố ý tách hai bước: nếu tra theo (tenant, id) thì bản ghi của đơn vị khác trả về
        `None` và máy chủ đáp 404, không phân biệt được *"không có"* với *"không được xem"*.
        Phép kiểm IDOR cần đúng sự phân biệt ấy."""
        for kho in self.d.values():
            if ma_id in kho:
                return kho[ma_id]
        return None

    def theo_ma(self, tenant, ma):
        for x in self.ds(tenant):
            if x['code'] == ma:
                return x
        return None

    def tao(self, tenant, ma, ten, tt):
        with self.khoa:
            self.dem['tao'] += 1
            if self.theo_ma(tenant, ma):
                return None, LOI['trung']
            return self._them(tenant, ma, ten, tt), None

    def sua(self, tenant, ma_id, ten, tt):
        with self.khoa:
            self.dem['sua'] += 1
            bg = self.d.get(tenant, {}).get(ma_id)
            if not bg:
                return None, 'Không tìm thấy bản ghi'
            bg['title'], bg['status'] = ten, tt
            return bg, None

    def xoa(self, tenant, ma_id):
        with self.khoa:
            self.dem['xoa'] += 1
            bg = self.d.get(tenant, {}).pop(ma_id, None)
            if not bg:
                return None, 'Không tìm thấy bản ghi'
            return bg, None


KHO = Kho()


def kiem_tra(ma, ten):
    if not (ma or '').strip():
        return 'code', LOI['ma_rong']
    if len(ma) > MA_MAX:
        return 'code', LOI['ma_dai']
    if not MA_RX.match(ma):
        return 'code', LOI['ma_sai']
    if not (ten or '').strip():
        return 'title', LOI['ten_rong']
    if len(ten) > TEN_MAX:
        return 'title', LOI['ten_dai']
    return None, None


# ══════════════════════════════════════════════════════════════════════════════
# GIAO DIỆN
# ══════════════════════════════════════════════════════════════════════════════
LOGIN = """<!doctype html><meta charset="utf-8"><title>Đăng nhập — app giả CRUD</title>
<body style="font-family:sans-serif">
<div class="cursor-pointer" onclick="document.getElementById('f').style.display='block';
     this.style.display='none'">Phân hệ Cơ Sở Dữ Liệu</div>
<form id="f" style="display:none" onsubmit="return false">
  <label>Tài khoản</label><input name="u" type="text">
  <label>Mật khẩu</label><input name="p" type="password">
  <button type="button" onclick="vao()">Đăng nhập</button>
</form>
<script>
function vao(){const u=document.querySelector('[name=u]').value,
  p=document.querySelector('[name=p]').value;
 fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({u:u,p:p})}).then(r=>r.json()).then(j=>{
   if(j.ok){location.href=j.ve;} else {document.body.insertAdjacentHTML('beforeend',
     '<p id="loi">Sai tài khoản hoặc mật khẩu</p>');}});}
</script></body>"""

CHUA_DANG_NHAP = ('Bạn cần đăng nhập để truy cập trang này. Vui lòng đăng nhập bằng tài khoản '
                  'của bạn để tiếp tục.')

MAN = """<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Loại nguồn — app giả CRUD</title><style>
 *{box-sizing:border-box} body{font-family:sans-serif;margin:0;font-size:14px}
 aside{position:fixed;left:0;top:0;width:170px;height:100%;background:#eef}
 main{margin-left:180px;padding:12px;max-width:1100px}
 table{border-collapse:collapse;width:100%;table-layout:fixed}
 th,td{border:1px solid #ccc;padding:5px;overflow:hidden;text-overflow:ellipsis;
   white-space:nowrap}
 th{text-align:left} td.num,th.num{text-align:right} td.mid,th.mid{text-align:center}
 tbody tr{background:#fff} tbody tr:hover{background:#f2f6ff}
 .kpi{display:inline-block;width:170px;height:92px;border:1px solid #ddd;margin:4px;
   padding:8px;vertical-align:top;overflow:hidden}
 .kpi p:first-child{text-transform:uppercase;font-size:12px;color:#555;margin:0 0 6px}
 .kpi p:last-child{margin:0;font-size:22px}
 .bar{margin:10px 0;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
 /* Biểu mẫu TRƯỢT VÀO từ bên phải trong 900ms — dựng lại đúng hành vi app thật (đo
    18/09: hộp đi từ x=1598 về x=800 trong ~532ms, `transform` khác `none` suốt quãng
    ấy, còn `data-state`/`animationName` thì KHÔNG đổi). Toạ độ đọc giữa quãng này lệch
    tới gần 800px, và cú chuột theo toạ độ ấy rơi vào chỗ trống. 900ms > mọi phép ngủ
    cố định cũ, nên phép kiểm mới thật sự bắt được. */
 @keyframes truot-vao{from{transform:translateX(700px)}to{transform:translateX(0)}}
 /* Bật bằng `?truot=<ms>` để CHỈ phép kiểm cần nó phải trả giá thời gian; 10 bộ tự
    kiểm còn lại vẫn chạy với hộp thoại hiện ra tức thì. */
 html.truot #hop > [role=dialog]{animation:truot-vao var(--truot) ease-out}
 dialog,[role=dialog],[role=alertdialog]{border:1px solid #888;padding:14px;background:#fff;min-width:380px;
   position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:10;box-shadow:0 6px 24px #0003}
 .err{color:#dc2626;font-size:12px;margin:2px 0 0}
 button{cursor:pointer;text-align:center;justify-content:center;display:inline-flex;
   align-items:center;padding:4px 10px}
 button.icon{padding:3px 6px}
 .del{color:rgb(220,38,38)}
 .del:hover{color:rgb(153,27,27);background:#fee}
 #toast{position:fixed;right:12px;top:12px;z-index:50}
 #toast div{background:#111;color:#fff;padding:8px 12px;margin-bottom:6px;border-radius:4px}
 [role=listbox]{border:1px solid #bbb;background:#fff;position:absolute;z-index:20;
   min-width:190px;padding:2px}
 [role=option]{padding:4px 8px;text-align:left;cursor:pointer}
 [role=option][aria-selected=true]{background:#eef;font-weight:700}
 select,input,button[role=combobox]{padding:4px;max-width:220px;overflow:hidden;
   text-overflow:ellipsis;white-space:nowrap}
 [role=tooltip]{position:absolute;background:#222;color:#fff;padding:4px 8px;font-size:12px;
   text-align:left;z-index:40;white-space:nowrap}
 .sk{height:12px;background:#eee;margin:6px 0}
 .nen-mo{position:fixed;inset:0;background:#0006;z-index:9}
 .ct-dong{display:flex;gap:8px;padding:2px 0}
 .ct-nhan{width:130px;color:#555}
 .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;
   clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style></head><body>
<script>(()=>{const m=/[?&]truot=(\d+)/.exec(location.search);
  if(m){document.documentElement.classList.add('truot');
    document.documentElement.style.setProperty('--truot', m[1]+'ms');}})();</script>
<aside><div aria-current="page">Quản lý khai báo</div><div>Báo cáo</div></aside>
<!-- HUY HIỆU số ở đầu trang. Không liên quan gì tới phân trang, nhưng nó là một <button>
     mà chữ duy nhất là một con số — đúng thứ đã làm `doc_phan_trang` của bản cũ đọc ra
     "1 nút trang, đang ở trang 3" cho một màn MỘT trang trên app thật (17/09). -->
<header><button type="button" id="huy-hieu" aria-label="Thông báo chưa đọc">3</button></header>
<main>
<nav aria-label="Breadcrumb"><a href="/admin">Trang chủ</a><span> / </span><a href="/admin/khai-bao">Quản lý khai báo</a><span> / </span><span>Loại nguồn</span></nav>
<h1>Loại nguồn</h1>
<p>Quản lý các loại kênh ingestion dữ liệu</p>
<div class="bar">
  <button type="button" id="b-xuat">Xuất Excel</button>
  <button type="button" id="b-them">+ Thêm loại nguồn</button>
  <button type="button" class="icon" id="b-lam-moi" title="Làm mới dữ liệu"
     aria-label="Làm mới dữ liệu">&#8635;</button>
  <span id="cap-nhat"></span>
</div>
<div id="kpi"></div>
<div class="bar">
  <input type="text" id="tim" placeholder="Tìm kiếm theo mã, tên hiển thị..." style="width:240px">
  <label for="f-tu">Từ ngày</label><input type="date" id="f-tu">
  <label for="f-den">Đến ngày</label><input type="date" id="f-den">
  <div style="position:relative">
    <button type="button" role="combobox" id="loc-tt" aria-haspopup="listbox"
       aria-expanded="false">-- Chọn trạng thái --</button>
    <div id="loc-tt-ds" role="listbox" hidden></div>
  </div>
  <!-- Ô SẮP XẾP: không <label>, không chữ gợi ý — nó hiện GIÁ TRỊ ĐANG CHỌN. Năm đường tìm
       cũ của `TIM_CHON` đều giả định ô chọn hiện chữ gợi ý, nên ô này không đường nào tìm
       ra, và 11 case ô chọn của app thật nằm CHƯA ĐO suốt lượt chạy 500 case (17/09). -->
  <div style="position:relative">
    <button type="button" role="combobox" id="sap-xep" aria-haspopup="listbox"
       aria-expanded="false">Mới nhất trước</button>
    <div id="sap-xep-ds" role="listbox" hidden></div>
  </div>
</div>
<div id="hang-loat" hidden class="bar">
  <span id="da-chon"></span>
  <button type="button" id="b-xoa-tat">Xóa tất cả</button>
  <button type="button" id="b-bo-chon">Bỏ chọn</button>
</div>
<table><thead><tr>
  <th style="width:32px"><input type="checkbox" id="chon-tat"></th>
  <th class="num" style="width:52px">STT</th><th style="width:190px">Code</th>
  <th>Tên hiển thị</th><th style="width:130px">Trạng thái</th>
  <th class="mid" style="width:110px">Ngày tạo</th>
  <th class="mid" style="width:96px">Hành động</th>
</tr></thead><tbody id="tb"></tbody></table>
<div id="rong" hidden></div>
<div class="bar">
  <span>Tổng số bản ghi: <b id="tong">0</b></span>
  <span>Số bản ghi/trang: <input type="text" id="perpage" value="20" style="width:64px"></span>
  <div style="position:relative">
    <button type="button" class="icon" id="nhanh" aria-label="Chọn nhanh số bản ghi"
       title="Chọn nhanh số bản ghi" aria-haspopup="listbox">&#9662;</button>
    <div id="nhanh-ds" role="listbox" hidden></div>
  </div>
  <nav aria-label="Pagination" class="pagination">
    <span id="trang"></span>
    <span id="trang-bao" aria-live="polite"></span>
  </nav>
</div>
</main>
<div id="hop"></div><div id="toast"></div>
<div id="bao-dieu-huong" aria-live="assertive" class="sr-only"></div>
<!-- Hộp HƯỚNG DẪN tự mở sau mỗi lần nạp trang. Nó KHÔNG chặn gì, nhưng nó làm mọi
     câu hỏi "còn hộp thoại nào đang mở không" luôn trả lời CÓ — đúng lớp lỗi đã
     báo THẤT BẠI cho một thao tác tạo bản ghi ĐÃ THÀNH CÔNG trên app thật (17/09). -->
<div id="hop-huong-dan" role="dialog" aria-modal="false">
  <h2>Hướng dẫn sử dụng</h2>
  <p>Chào mừng đến hệ thống. Nhấn Bỏ qua để bắt đầu làm việc.</p>
  <button type="button" id="hd-bo-qua">Bỏ qua</button>
  <button type="button" id="hd-tiep">Tiếp tục</button>
</div>
<script>
const TT=__TT__, LOI=__LOI__;
let DS=[], loc='', tt_loc='', trang=1, perpage=20, chon=new Set(), dang_tai=false;
const $=s=>document.querySelector(s);
$('#hd-bo-qua').onclick=()=>{$('#hop-huong-dan').remove();};
const toast=t=>{const d=document.createElement('div');d.setAttribute('role','status');
  d.setAttribute('aria-live','polite');d.textContent=t;$('#toast').appendChild(d);
  setTimeout(()=>d.remove(),4000);};
/* Hai vùng KHÔNG PHẢI toast, cố ý dựng đúng như app thật để phép kiểm §13 có cái mà
   phân biệt: bộ báo tin điều hướng (sr-only, người dùng không nhìn thấy) và vùng
   aria-live của cụm phân trang. */
const bao_dieu_huong=t=>{$('#bao-dieu-huong').textContent=t;};
const bao_phan_trang=t=>{$('#trang-bao').textContent=t;};
bao_dieu_huong('Đã chuyển đến trang Trang mới');
const bo_dau=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
function tai(giu_trang){
  dang_tai=true; $('#b-lam-moi').disabled=true;
  $('#tb').innerHTML='<tr><td colspan="7"><div class="sk"></div><div class="sk"></div></td></tr>';
  fetch('/api/items').then(r=>{if(!r.ok)throw new Error('http');return r.json();})
   .then(j=>{DS=j.items; if(!giu_trang) trang=1; ve();
     $('#cap-nhat').textContent='Cập nhật: '+new Date().toLocaleString('vi-VN');})
   .catch(()=>{$('#tb').innerHTML='';
     $('#rong').hidden=false;
     $('#rong').textContent='Không thể kết nối đến máy chủ. Một số dữ liệu có thể không được '
       +'cập nhật. Vui lòng kiểm tra kết nối internet và thử lại.';
     $('#rong').className='err'; ve_lai_cu();})
   .finally(()=>{dang_tai=false; $('#b-lam-moi').disabled=false;});}
let CU=[];
function ve_lai_cu(){if(CU.length){$('#tb').innerHTML=CU.join('');}}
function loc_ds(){
  let a=DS.slice();
  if(loc.length>=3){const k=bo_dau(loc.trim());
    a=a.filter(x=>bo_dau(x.code).includes(k)||bo_dau(x.title).includes(k));}
  if(tt_loc) a=a.filter(x=>x.status===tt_loc);
  return a;}
function ve(){
  const a=loc_ds(); $('#tong').textContent=a.length;
  const sotrang=Math.max(1,Math.ceil(a.length/perpage));
  if(trang>sotrang) trang=sotrang;
  const p=a.slice((trang-1)*perpage, trang*perpage);
  CU=p.map((x,i)=>`<tr><td><input type="checkbox" data-ma="${x.code}"
      ${chon.has(x.id)?'checked':''}></td>
    <td class="num">${(trang-1)*perpage+i+1}</td><td>${esc(x.code)}</td>
    <td>${esc(x.title)}</td><td>${TT[x.status]||x.status}</td>
    <td class="mid">${x.created}</td>
    <td class="mid"><button class="icon" title="Xem chi tiết" data-xem="${x.id}">&#128065;</button><button class="icon" title="${x.status==='active'?'Ngừng hoạt động':'Kích hoạt'}"
      data-tt="${x.id}">${x.status==='active'?'&#9209;':'&#9654;'}</button>
      <button class="icon" title="Chỉnh sửa" data-sua="${x.id}">&#9998;</button>
      <button class="icon del" title="Xóa" data-xoa="${x.id}">&#128465;</button></td></tr>`);
  $('#tb').innerHTML=CU.join('');
  $('#rong').hidden=a.length>0;
  if(!a.length){$('#rong').className='';
    $('#rong').innerHTML=(loc||tt_loc)?'Không có loại nguồn khớp bộ lọc'
      :'Chưa có loại nguồn nào <button type="button" id="b-them2">+ Thêm loại nguồn</button>';}
  $('#kpi').innerHTML=[['TỔNG NGUỒN',DS.length],
     ['ĐANG HOẠT ĐỘNG',DS.filter(x=>x.status==='active').length],
     ['KHÔNG HOẠT ĐỘNG / LƯU TRỮ',DS.filter(x=>x.status!=='active').length]]
    .map(([t,n])=>`<div class="kpi"><p>${t}</p><p>${n.toLocaleString('vi-VN')}</p></div>`).join('');
  $('#trang').innerHTML=sotrang>1?Array.from({length:sotrang},(_,i)=>
     `<button type="button" ${i+1===trang?'aria-current="page"':''}>${i+1}</button>`).join(''):'';
  $('#perpage').value=perpage;
  bao_phan_trang(sotrang>1?('Đã sang trang '+trang+'/'+sotrang):'');
  $('#hang-loat').hidden=chon.size===0;
  $('#da-chon').textContent='Đã chọn '+chon.size+' mục';
  const tat=$('#chon-tat'); if(tat) tat.checked=p.length>0&&p.every(x=>chon.has(x.id));}
function esc(s){const d=document.createElement('span'); d.textContent=s; return d.innerHTML;}
/* ── HỘP THOẠI XEM CHI TIẾT ──────────────────────────────────────────────────────────
   Dựng để phép `xem_chi_tiet_modal` có chỗ chạy thật: tiêu đề mang tên bản ghi, trường
   chưa có dữ liệu hiện dấu "—", đóng được bằng dấu X hoặc bấm nền mờ. */
function hop_chi_tiet(x){
  const dong=(nhan,gt)=>`<div class="ct-dong"><span class="ct-nhan">${nhan}</span>`
    +`<span class="ct-gt">${gt===''||gt===null||gt===undefined?'—':esc(String(gt))}</span></div>`;
  $('#hop').innerHTML=`<div class="nen-mo" id="ct-nen"></div>`
    +`<div role="dialog" aria-modal="true" id="hop-chi-tiet">`
    +`<h2>Chi tiết: ${esc(x.title)}</h2>`
    +`<button type="button" id="ct-dong" aria-label="Đóng">&times;</button>`
    +`<h3>Thông tin cơ bản</h3>`
    +dong('Code',x.code)+dong('Tên hiển thị',x.title)+dong('Trạng thái',TT[x.status]||x.status)
    +dong('Mô tả',x.mo_ta||'')+dong('Ngày tạo',x.created)+dong('Ghi chú',x.ghi_chu||'')
    +`</div>`;
  $('#ct-dong').onclick=()=>{$('#hop').innerHTML='';};
  $('#ct-nen').onclick=()=>{$('#hop').innerHTML='';};}
function id_theo_ma(ma){const x=DS.find(y=>y.code===ma); return x?x.id:null;}
/* ── biểu mẫu ── */
function form(bg){
  const sua=!!bg;
  $('#hop').innerHTML=`<div role="dialog"><h2>${sua?'Chỉnh sửa: '+esc(bg.title)
      :'Thêm loại nguồn mới'}</h2>
    <p class="err" id="e-chung" hidden></p>
    <div><label for="f-ma">Code *</label><input id="f-ma" maxlength="250" required
       value="${sua?esc(bg.code):''}" ${sua?'disabled':''}><p class="err" id="e-ma" hidden></p></div>
    <div><label for="f-ten">Tên hiển thị *</label><input id="f-ten" maxlength="250" required
       value="${sua?esc(bg.title):''}"><p class="err" id="e-ten" hidden></p></div>
    <div><label for="f-tt">Trạng thái</label><select id="f-tt">`
      +Object.entries(TT).map(([k,v])=>`<option value="${k}"
         ${sua&&bg.status===k?'selected':''}>${v}</option>`).join('')
    +`</select></div>
    <div><label for="f-kho">Loại kho</label>
       <div style="position:relative">
         <button type="button" role="combobox" id="f-kho" aria-haspopup="listbox"
            aria-expanded="false">Chọn loại kho</button>
         <div id="f-kho-ds" role="listbox" hidden></div></div></div>
    <div><label for="f-mo-ta">Mô tả</label><textarea id="f-mo-ta" maxlength="250"
       placeholder="Mô tả ngắn về loại nguồn này"></textarea></div>
    <div><label for="f-ngay">Ngày bắt đầu</label><input type="date" id="f-ngay"></div>
    <div><label for="f-switch">Đang hoạt động</label>
       <input type="checkbox" id="f-switch" role="switch"></div>
    <div><label for="f-tep">Tệp đính kèm</label>
       <input type="file" id="f-tep" accept=".xlsx,.csv"></div>
    <button type="button" id="f-huy">Hủy</button>
    <button type="button" id="f-luu">${sua?'Lưu thay đổi':'Tạo loại nguồn'}</button></div>`;
  $('#f-huy').onclick=()=>{$('#hop').innerHTML='';};
  $('#f-luu').onclick=()=>luu(sua?bg.id:null);}
function loi_o(k,msg){const m={code:'#e-ma',title:'#e-ten'}[k]||'#e-chung';
  const e=$(m); e.hidden=false; e.textContent=msg; e.setAttribute('role','alert');
  const o={code:'#f-ma',title:'#f-ten'}[k]; if(o){$(o).setAttribute('aria-invalid','true');
    $(o).setAttribute('aria-describedby',m.slice(1)); $(o).focus();}}
function luu(id){
  ['#e-chung','#e-ma','#e-ten'].forEach(s=>{$(s).hidden=true;});
  const b=$('#f-luu'); if(b.disabled) return; b.disabled=true; b.textContent='Đang lưu...';
  const body={code:$('#f-ma').value, title:$('#f-ten').value, status:$('#f-tt').value};
  fetch(id?('/api/items/'+id):'/api/items',
     {method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)})
   .then(r=>r.json().then(j=>({ok:r.ok,j})))
   .then(({ok,j})=>{
     if(!ok){loi_o(j.field||'', j.error||'Lỗi'); return;}
     $('#hop').innerHTML=''; toast(id?'Cập nhật loại nguồn thành công'
        :'Thêm loại nguồn thành công'); tai(true);})
   .finally(()=>{b.disabled=false; b.textContent=id?'Lưu thay đổi':'Tạo loại nguồn';});}
/* ── đổi trạng thái ── */
function hop_tt(bg){
  const moi = bg.status==='active' ? 'inactive' : 'active';
  $('#hop').innerHTML=`<div role="alertdialog"><h2>Chuyển trạng thái?</h2>
    <button type="button" id="t-dong" aria-label="Đóng">&times;</button>
    <p>Chuyển &ldquo;${esc(bg.title)}&rdquo; sang ${TT[moi]}?</p>
    <button type="button" id="t-huy">Hủy</button>
    <button type="button" id="t-ok">Chuyển trạng thái</button></div>`;
  $('#t-huy').onclick=$('#t-dong').onclick=()=>{$('#hop').innerHTML='';};
  $('#t-ok').onclick=()=>{const b=$('#t-ok'); if(b.disabled) return; b.disabled=true;
    fetch('/api/items/'+bg.id,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code:bg.code,title:bg.title,status:moi})})
     .then(r=>r.json()).then(j=>{$('#hop').innerHTML='';
       if(j.id||j.ok){toast('Chuyển trạng thái thành công'); tai(true);}
       else toast(j.error||'Chuyển trạng thái thất bại');});};}
/* ── xoá ── */
function hop_xoa(bg){
  $('#hop').innerHTML=`<div role="alertdialog"><h2>Xóa loại nguồn?</h2>
    <button type="button" id="x-dong" aria-label="Đóng">&times;</button>
    <p>Bạn chắc chắn muốn xóa &ldquo;${esc(bg.title)}&rdquo;? Hành động này không thể hoàn tác.</p>
    <button type="button" id="x-huy">Hủy</button>
    <button type="button" id="x-ok">Xóa</button></div>`;
  $('#x-huy').onclick=$('#x-dong').onclick=()=>{$('#hop').innerHTML='';};
  $('#x-ok').onclick=()=>{const b=$('#x-ok'); if(b.disabled) return;
    b.disabled=true; b.textContent='Đang xóa...';
    fetch('/api/items/'+bg.id,{method:'DELETE'}).then(r=>r.json()).then(j=>{
      $('#hop').innerHTML=''; if(j.ok){toast('Xóa loại nguồn thành công'); tai(true);}
      else toast(j.error||'Xóa thất bại');});};}
function hop_xoa_nhieu(){
  const n=chon.size;
  $('#hop').innerHTML=`<div role="alertdialog"><h2>Xóa ${n} loại nguồn đã chọn?</h2>
    <p>Hành động này không thể hoàn tác.</p>
    <button type="button" id="x-huy">Huỷ</button>
    <button type="button" id="x-ok">Xóa</button></div>`;
  $('#x-huy').onclick=()=>{$('#hop').innerHTML='';};
  $('#x-ok').onclick=()=>{const b=$('#x-ok'); if(b.disabled) return; b.disabled=true;
    const ids=[...chon];
    /* xoá hàng loạt gọi API LẶP TỪNG DÒNG — đúng như app thật */
    Promise.all(ids.map(id=>fetch('/api/items/'+id,{method:'DELETE'}).then(r=>r.json())))
     .then(rs=>{const d=rs.filter(x=>!x.ok).length;
       $('#hop').innerHTML=''; chon.clear();
       toast(d?('Xóa thất bại '+d+'/'+ids.length+' mục'):('Đã xóa '+ids.length+' mục'));
       tai(true);});};}
/* ── ô chọn trạng thái ── */
function mo_ds(nut, hop, muc, dang, khi_chon){
  if(!hop.hidden){hop.hidden=true; nut.setAttribute('aria-expanded','false'); return;}
  hop.innerHTML=muc.map(([v,t])=>`<div role="option" data-v="${v}"
     aria-selected="${v===dang?'true':'false'}">${t}</div>`).join('');
  hop.hidden=false; nut.setAttribute('aria-expanded','true');
  hop.querySelectorAll('[role=option]').forEach(o=>o.onclick=()=>{
    hop.hidden=true; nut.setAttribute('aria-expanded','false'); khi_chon(o.dataset.v,
      o.textContent);});}
/* ── ô chọn NẠP CHẬM rồi VẼ LẠI ─────────────────────────────────────────────────────
   Dựng lại đúng hành vi đã làm hỏng 18/187 lượt tạo dữ liệu QA trên app thật (17/09):
   danh sách tuỳ chọn tới từ một lệnh gọi API riêng, nên lúc vừa mở nó mới có 1 mục, rồi
   được VẼ LẠI đủ. Mỗi lần vẽ lại thay hẳn nút DOM cũ bằng nút mới — nên mọi thuộc tính do
   tool dán lên (`data-qa-moc`) biến mất, và cú bấm theo mốc rơi vào hư không.
   Hai triệu chứng của app thật đều tái hiện được ở đây:
     · đọc quá sớm  -> "bấm hết 1 tuỳ chọn mà giá trị ô không đổi";
     · bấm theo mốc -> "chọn 'X' nhưng ô vẫn hiện 'Chọn ...'". */
function mo_ds_cham(nut, hop, muc, dang, khi_chon){
  if(!hop.hidden){hop.hidden=true; nut.setAttribute('aria-expanded','false'); return;}
  const ve_ds=n=>{
    hop.innerHTML=muc.slice(0,n).map(([v,t])=>`<div role="option" data-v="${v}"
       aria-selected="${v===dang?'true':'false'}">${t}</div>`).join('');
    /* ⚠️ Chỉ nghe `pointerdown` — KHÔNG nghe `click`, KHÔNG nghe phím. Đây đúng là kiểu
       control của ô `Loại database` trên app thật (đo 18/09: focus rồi Enter mở ra 0 tuỳ
       chọn; `el.click()` không đổi giá trị). Mọi lớp lùi dựa vào `click`/bàn phím đều vô
       hiệu với nó, nên phép kiểm phải dựng đúng như thế mới bắt được. */
    hop.querySelectorAll('[role=option]').forEach(o=>o.addEventListener('pointerdown',()=>{
      hop.hidden=true; nut.setAttribute('aria-expanded','false');
      khi_chon(o.dataset.v, o.textContent);}));};
  /* Dựng lại hành vi của thư viện dropdown thật: popup được gắn NGOÀI MÀN trước để đo kích
     thước, rồi mới định vị vào chỗ. Đây là gốc THẬT của 18 case LỖI trên app thật — số tuỳ
     chọn đã ổn định từ khung hình ngoài màn, nên phép chờ chỉ-đếm-mục trả về quá sớm và mọi
     toạ độ đo được đều là toạ độ ngoài màn (x ÂM). */
  hop.style.position='absolute'; hop.style.left='-9999px'; hop.style.top='0px';
  ve_ds(1); hop.hidden=false; nut.setAttribute('aria-expanded','true');
  setTimeout(()=>{if(!hop.hidden) ve_ds(muc.length);}, 380);
  setTimeout(()=>{if(!hop.hidden) ve_ds(muc.length);}, 760);
  /* Định vị MUỘN hơn hẳn thời gian tool chờ số mục ổn định — nếu không, phép kiểm không
     bao giờ đo trúng khung hình ngoài màn và nó chứng minh 0. */
  setTimeout(()=>{if(!hop.hidden){hop.style.left=''; hop.style.top='';}}, 2200);}
const KHO=[['ch','ClickHouse1'],['mg','MongoDB'],['my','MySQL'],['pg','PostgreSQL']];
const SAPXEP=[['moi','Mới nhất trước'],['cu','Cũ nhất trước']];
/* ── nối sự kiện ── */
let tmr=null;
document.addEventListener('input',e=>{
  if(e.target.id==='tim'){clearTimeout(tmr);
    tmr=setTimeout(()=>{loc=e.target.value.replace(/^\\s+/,''); if(e.target.value!==loc)
        e.target.value=loc; trang=1; ve();},1500);}
  if(e.target.id==='perpage'){}});
$('#tim').addEventListener('keydown',e=>{if(e.key===' '&&!e.target.value) e.preventDefault();});
$('#perpage').addEventListener('keydown',e=>{if(e.key==='Enter') ap_perpage();});
$('#perpage').addEventListener('blur',ap_perpage);
function ap_perpage(){
  const v=$('#perpage').value.trim();
  if(!/^\\d+$/.test(v)){$('#perpage').value=perpage; return;}
  const n=parseInt(v,10);
  if(n<=0){$('#perpage').value=perpage; return;}
  if(n>1000){toast('Số bản ghi/trang tối đa 1000 bản ghi'); $('#perpage').value=perpage; return;}
  perpage=n; trang=1; ve();}
document.addEventListener('click',e=>{
  const t=e.target.closest('button,[role=option],input[type=checkbox]');
  if(!t) return;
  if(t.id==='b-them'||t.id==='b-them2') return form(null);
  if(t.id==='b-lam-moi'){tai(true); setTimeout(()=>toast('Đã làm mới'),50); return;}
  if(t.id==='b-xuat'){xuat(); return;}
  if(t.dataset.xem){const x=DS.find(y=>y.id===t.dataset.xem); if(x) hop_chi_tiet(x); return;}
  if(t.dataset.sua){const x=DS.find(y=>y.id===t.dataset.sua); if(x) form(x); return;}
  if(t.dataset.tt){const x=DS.find(y=>y.id===t.dataset.tt); if(x) hop_tt(x); return;}
  if(t.dataset.xoa){const x=DS.find(y=>y.id===t.dataset.xoa); if(x) hop_xoa(x); return;}
  if(t.id==='chon-tat'){const a=loc_ds().slice((trang-1)*perpage,trang*perpage);
    if(t.checked) a.forEach(x=>chon.add(x.id)); else a.forEach(x=>chon.delete(x.id));
    ve(); return;}
  if(t.dataset.ma){const id=id_theo_ma(t.dataset.ma);
    if(id){t.checked?chon.add(id):chon.delete(id);} ve(); return;}
  if(t.id==='b-bo-chon'){chon.clear(); ve(); return;}
  if(t.id==='b-xoa-tat'){hop_xoa_nhieu(); return;}
  if(t.id==='loc-tt'){mo_ds(t,$('#loc-tt-ds'),TTL,tt_loc,(v,txt)=>{tt_loc=v;
     $('#loc-tt').textContent=txt; trang=1; ve();}); return;}
  if(t.id==='sap-xep'){mo_ds(t,$('#sap-xep-ds'),SAPXEP,sap,(v,txt)=>{sap=v;
     $('#sap-xep').textContent=txt; ve();}); return;}
  if(t.id==='f-kho'){mo_ds_cham(t,$('#f-kho-ds'),KHO,'',(v,txt)=>{
     $('#f-kho').textContent=txt; $('#f-kho').dataset.v=v;}); return;}
  if(t.id==='nhanh'){mo_ds(t,$('#nhanh-ds'),[20,50,100,200,500].map(x=>[String(x),String(x)]),
     String(perpage),(v)=>{perpage=parseInt(v,10); trang=1; ve();}); return;}
  if(t.tagName==='BUTTON'&&/^\\d+$/.test(t.textContent)&&t.closest('#trang')){
     trang=parseInt(t.textContent,10); ve(); return;}});
const TTL=Object.entries(TT).slice(0,2);
let sap='moi';
/* tooltip thật cho icon thao tác */
document.addEventListener('mouseover',e=>{
  const b=e.target.closest('button[title]'); if(!b) return;
  const d=document.createElement('div'); d.setAttribute('role','tooltip');
  d.textContent=b.getAttribute('title'); d.id='tt-live';
  const r=b.getBoundingClientRect(); d.style.left=r.left+'px'; d.style.top=(r.bottom+3)+'px';
  document.body.appendChild(d);});
document.addEventListener('mouseout',e=>{const d=document.getElementById('tt-live');
  if(d) d.remove();});
function xuat(){
  const b=$('#b-xuat'); if(b.disabled) return; b.disabled=true; b.textContent='Đang xuất...';
  const a=document.createElement('a'); a.href='/api/items:export?q='+encodeURIComponent(loc)
    +'&tt='+encodeURIComponent(tt_loc);
  a.download='danh_sach_loai_nguon.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>{b.disabled=false; b.textContent='Xuất Excel';
    toast('Xuất Excel thành công');},900);}
tai(false);
</script></body></html>"""


def _man():
    return (MAN.replace('__TT__', json.dumps(dict(TRANG_THAI), ensure_ascii=False))
               .replace('__LOI__', json.dumps(LOI, ensure_ascii=False)))


def _xlsx(ds):
    """Workbook .xlsx tối thiểu nhưng THẬT (đọc được bằng zipfile + XML)."""
    import io
    import zipfile
    cot = ['Code', 'Tên hiển thị', 'Trạng thái', 'Ngày tạo']
    dong = [cot] + [[x['code'], x['title'], NHAN_TT.get(x['status'], x['status']), x['created']]
                    for x in ds]

    def _o(v, i, r):
        return ('<c r="%s%d" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
                % (chr(65 + i), r, str(v).replace('&', '&amp;').replace('<', '&lt;')))
    sheet = ('<?xml version="1.0" encoding="UTF-8"?><worksheet '
             'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
             + ''.join('<row r="%d">%s</row>' % (r, ''.join(_o(v, i, r) for i, v in enumerate(d)))
                       for r, d in enumerate(dong, 1))
             + '</sheetData></worksheet>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml',
                   '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxml'
                   'formats.org/package/2006/content-types"><Default Extension="rels" '
                   'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxml'
                   'formats-officedocument.spreadsheetml.sheet.main+xml"/><Override '
                   'PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxml'
                   'formats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        z.writestr('_rels/.rels',
                   '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.'
                   'openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" '
                   'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
                   'officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr('xl/workbook.xml',
                   '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.open'
                   'xmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxml'
                   'formats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1"'
                   ' sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels',
                   '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.'
                   'openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" '
                   'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
                   'worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr('xl/worksheets/sheet1.xml', sheet)
    return buf.getvalue()


class Tay(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def _ra(self, ma, body, ctype='text/html; charset=utf-8', them=()):
        b = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(ma)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        for k, v in them:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b)

    def _js(self, ma, obj):
        return self._ra(ma, json.dumps(obj, ensure_ascii=False), 'application/json; charset=utf-8')

    def _tenant(self):
        m = re.search(r'phien=([^;]+)', self.headers.get('Cookie') or '')
        if not m:
            return None
        return (TAI_KHOAN.get(m.group(1)) or (None, None, None))[1]

    def _co_quyen(self):
        """Tài khoản của phiên có quyền với màn này không? (None = chưa đăng nhập)"""
        m = re.search(r'phien=([^;]+)', self.headers.get('Cookie') or '')
        if not m:
            return None
        x = TAI_KHOAN.get(m.group(1))
        return bool(x[2]) if x else None

    def _than(self):
        n = int(self.headers.get('Content-Length') or 0)
        try:
            return json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            return {}

    # ── ĐỌC ──────────────────────────────────────────────────────────────────
    def do_GET(self):
        p, _, qs = self.path.partition('?')
        if p in ('/', '/login'):
            return self._ra(200, LOGIN)
        t = self._tenant()
        if p.startswith('/admin'):
            if not t:
                return self._ra(200, '<!doctype html><meta charset="utf-8"><body>'
                                     '<p>%s</p><script>setTimeout(()=>location.href='
                                     '"/login",50)</script></body>' % CHUA_DANG_NHAP)
            if not self._co_quyen():
                return self._ra(403, '<!doctype html><meta charset="utf-8"><body>'
                                     '<h1>Không đủ quyền truy cập</h1><p>%s</p></body>'
                                     % KHONG_DU_QUYEN)
            return self._ra(200, _man())
        if p == '/api/_dem':
            # Bộ đếm của KHO — nguồn duy nhất chứng minh được "request có TỚI máy chủ hay
            # không". Phép kiểm mock đọc nó để khỏi phải tin lời khai của chính lớp mock.
            return self._js(200, dict(KHO.dem))
        if p == '/api/items':
            if not t:
                return self._js(401, {'error': CHUA_DANG_NHAP})
            if not self._co_quyen():
                return self._js(403, {'error': KHONG_DU_QUYEN})
            KHO.dem['doc'] += 1
            return self._js(200, {'items': KHO.ds(t)})
        m_id = re.match(r'^/api/items/([^/]+)$', p)
        if m_id:
            # Nền của phép IDOR: bản ghi của tenant khác trả 403, không trả nội dung.
            if not t:
                return self._js(401, {'error': CHUA_DANG_NHAP})
            if not self._co_quyen():
                return self._js(403, {'error': KHONG_DU_QUYEN})
            bg = KHO.mot(m_id.group(1))
            if not bg:
                return self._js(404, {'error': 'không thấy bản ghi'})
            if bg.get('tenant') != t:
                return self._js(403, {'error': 'bản ghi thuộc đơn vị khác'})
            return self._js(200, bg)
        if p == '/api/items:export':
            if not t:
                return self._js(401, {'error': CHUA_DANG_NHAP})
            # Lỗ này do CHÍNH phép `attt_vai_tro_khac` tìm ra ở lượt tự kiểm 16/09: màn bị
            # chặn ở giao diện nhưng endpoint xuất Excel không kiểm quyền, nên vai trò không
            # quyền vẫn tải được toàn bộ dữ liệu. Vá ở app giả để fixture là một app ĐÚNG;
            # ca "UI chặn mà API cho" vẫn được dựng lại có chủ ý ở `kiem_live_moi` phép ⑱.
            if not self._co_quyen():
                return self._js(403, {'error': KHONG_DU_QUYEN})
            import urllib.parse as up
            q = up.parse_qs(qs)
            ds = KHO.ds(t)
            tu = (q.get('q') or [''])[0].strip().lower()
            tt = (q.get('tt') or [''])[0]
            if len(tu) >= 3:
                ds = [x for x in ds if tu in x['code'].lower() or tu in x['title'].lower()]
            if tt:
                ds = [x for x in ds if x['status'] == tt]
            return self._ra(200, _xlsx(ds),
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            them=(('Content-Disposition',
                                   'attachment; filename="danh_sach_loai_nguon.xlsx"'),))
        return self._ra(404, '<h1>404</h1>')

    # ── GHI ──────────────────────────────────────────────────────────────────
    def do_POST(self):
        if self.path == '/api/login':
            d = self._than()
            u, pw = d.get('u') or '', d.get('p') or ''
            if (TAI_KHOAN.get(u) or ('',))[0] != pw:
                return self._js(200, {'ok': False})
            return self._ra(200, json.dumps({'ok': True, 've': '/admin/loai-nguon'}),
                            'application/json',
                            them=(('Set-Cookie', 'phien=%s; Path=/' % u),))
        if self.path != '/api/items':
            return self._js(404, {'error': 'không có endpoint'})
        t = self._tenant()
        if not t:
            return self._js(401, {'error': CHUA_DANG_NHAP})
        d = self._than()
        ma, ten = (d.get('code') or '').strip(), (d.get('title') or '').strip()
        f, msg = kiem_tra(ma, ten)
        if f:
            return self._js(400, {'field': f, 'error': msg})
        bg, loi = KHO.tao(t, ma, ten, d.get('status') or 'active')
        if loi:
            return self._js(409, {'error': loi})
        return self._js(200, {'ok': True, 'item': bg})

    def do_PUT(self):
        m = re.match(r'^/api/items/([^/?]+)$', self.path)
        if not m:
            return self._js(404, {'error': 'không có endpoint'})
        t = self._tenant()
        if not t:
            return self._js(401, {'error': CHUA_DANG_NHAP})
        if m.group(1) not in KHO.d.get(t, {}):
            # bản ghi của tenant khác -> 403, KHÔNG để lộ dữ liệu
            return self._js(403, {'error': 'Không đủ quyền truy cập'})
        d = self._than()
        ten = (d.get('title') or '').strip()
        f, msg = kiem_tra('hop_le', ten)
        if f:
            return self._js(400, {'field': f, 'error': msg})
        bg, loi = KHO.sua(t, m.group(1), ten, d.get('status') or 'active')
        if loi:
            return self._js(404, {'error': loi})
        return self._js(200, {'ok': True, 'item': bg})

    def do_DELETE(self):
        m = re.match(r'^/api/items/([^/?]+)$', self.path)
        if not m:
            return self._js(404, {'error': 'không có endpoint'})
        t = self._tenant()
        if not t:
            return self._js(401, {'error': CHUA_DANG_NHAP})
        if m.group(1) not in KHO.d.get(t, {}):
            return self._js(403, {'error': 'Không đủ quyền truy cập'})
        bg, loi = KHO.xoa(t, m.group(1))
        if loi:
            return self._js(404, {'error': loi})
        return self._js(200, {'ok': True})


def chay(port=0):
    srv = ThreadingHTTPServer(('127.0.0.1', port), Tay)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--port', type=int, default=0)
    a = ap.parse_args()
    srv = chay(a.port)
    print('APP GIẢ CRUD: http://127.0.0.1:%d/login' % srv.server_address[1], flush=True)
    print('   tài khoản: ' + ' · '.join('%s / %s (tenant %s)' % (k, v[0], v[1])
                                        for k, v in TAI_KHOAN.items()), flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        srv.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())

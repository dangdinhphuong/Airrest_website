#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ỨNG DỤNG GIẢ để tự kiểm lớp Live Test — thư viện chuẩn, không cần tài khoản thật.

Vì sao cần: mọi phép kiểm của `probe_live.py` trước nay đều phải có app thật + tài khoản thật,
nên trên thực tế **không ai chạy**, và các lỗi multi-session chỉ lộ ra khi đang chạy việc thật.
App này dựng đúng những hình dạng DOM mà `probe_live` đọc, nên chạy được ở máy nào cũng được:

  · `/login`                trang chọn phân hệ + biểu mẫu đăng nhập (2 ô + nút `Đăng nhập`)
  · `/admin/<màn>`          màn danh sách: `h1` · breadcrumb · bảng · thanh lọc · phân trang
  · `/admin/<màn>/ct/<id>`  màn phụ CHI TIẾT — **chỉ vào được từ DÒNG 3** (dòng 1,2 không có
                            lối vào). Đây là bẫy cố ý: bản cũ chỉ soi dòng đầu nên báo "không
                            có màn phụ" mà không nói gì thêm.
  · điều hướng bằng `history.pushState` (SPA) để thử đúng đường `history.back()` của §5.

Cookie phiên (`phien=<user>`) đặt lúc đăng nhập ⇒ đọc `cookies.json` của từng phiên là biết
ngay hai phiên có dùng chung `chrome-profile/` hay không.

    python3 tools/tu_kiem/app_gia.py [--port 0]      # in ra cổng đang nghe rồi chạy
"""
import argparse
import hashlib
import json
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TAI_KHOAN = {'admin@gia.vn': 'matkhau-A', 'teacher@gia.vn': 'matkhau-B',
             'ba@gia.vn': 'matkhau-C'}


def token(u):
    """Token phiên giả — cố định theo tài khoản để phép kiểm so được, nhưng KHÔNG đọc ra
    được từ tên tài khoản (đúng hình dạng một access token thật)."""
    return hashlib.sha256(('token-gia|' + u).encode()).hexdigest()[:40]

_KHUNG = """<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>App giả — tự kiểm tool_v2</title><style>
 body{font-family:sans-serif;margin:0} aside{position:fixed;left:0;top:0;width:180px;height:100%%;
 background:#eee} main{margin-left:190px;padding:12px}
 table{border-collapse:collapse;width:100%%} th,td{border:1px solid #ccc;padding:4px}
 .bar{margin:8px 0}</style></head><body>%s</body></html>"""

_ASIDE = """<aside><div aria-current="page">Danh mục</div><div>Báo cáo</div></aside>"""


def _trang(than):
    return _KHUNG % (_ASIDE + '<main>' + than + '</main>')


# ── trang đăng nhập ───────────────────────────────────────────────────────────────────
LOGIN = _trang("""
<div class="cursor-pointer" onclick="document.getElementById('f').style.display='block';
     this.parentElement.style.display='none'">Phân hệ Cơ Sở Dữ Liệu</div>
<div class="cursor-pointer">Phân hệ Khác</div>
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
</script>""")


def _bang(man, so_dong=5):
    """Bảng dữ liệu. **Chỉ dòng 3 trở đi** có nút `Xem chi tiết` — bẫy của §4."""
    d = []
    for i in range(1, so_dong + 1):
        thao_tac = ('<button title="Chỉnh sửa">✎</button>'
                    '<button title="Xóa">🗑</button>')
        if i >= 3:
            thao_tac = ('<button title="Xem chi tiết" onclick="sang(%d)">👁</button>' % i
                        + thao_tac)
        d.append('<tr><td>%d</td><td>MA-%03d</td><td>Bản ghi số %d</td>'
                 '<td>%s</td><td>%s</td></tr>'
                 % (i, i, i, 'Hoạt động' if i % 2 else 'Ngừng', thao_tac))
    return ('<table><thead><tr><th>STT</th><th>Mã</th><th>Tên</th><th>Trạng thái</th>'
            '<th>Thao tác</th></tr></thead><tbody>%s</tbody></table>' % ''.join(d))


# ── BA BẪY CỦA BIẾN THỂ `?bay=1` (thêm 2026-09-14) ───────────────────────────────────────
# Dựng đúng ba hình dạng DOM đã làm `probe_live` BỎ SÓT control trong im lặng trên app thật.
# Màn mặc định giữ nguyên hình dạng cũ để phép kiểm cũ không đổi nghĩa.
#   ① nút `Tải lại` CHỈ CÓ ICON — `innerText` rỗng, tên nằm ở `aria-label`
#   ② thẻ số liệu đẩy thanh lọc xuống quá 340px — dải toạ độ chốt cứng của `_JS_FILTERBAR`
#   ③ ô `Số bản ghi/trang` là TEXTBOX nhập tự do + nút mức gợi ý, KHÔNG phải `<select>`
_ICON_XOAY = ('<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">'
              '<path d="M8 3a5 5 0 1 0 5 5h-2" fill="none" stroke="currentColor"/></svg>')
_NUT_TAI_LAI = {
    False: '<button type="button">Tải lại</button>',
    True: '<button type="button" aria-label="Tải lại" title="Tải lại" '
          'style="width:36px;height:36px">%s</button>' % _ICON_XOAY,
}
_NUT_XOA_LOC = {
    False: '<button type="button">Xóa lọc</button>',
    True: '<button type="button" aria-label="Xóa lọc" title="Xóa lọc" '
          'style="width:32px;height:32px">%s</button>' % _ICON_XOAY,
}
_THE_SO_LIEU = ('<div style="height:170px">' + ''.join(
    '<div style="display:inline-block;width:150px;height:150px;border:1px solid #ccc">'
    '<p style="text-transform:uppercase">%s</p><p>%d</p></div>' % (t, n)
    for t, n in (('Tổng bản ghi', 5), ('Đang hoạt động', 3),
                 ('Ngừng hoạt động', 2), ('Chờ duyệt', 0))) + '</div>')
# ⚠️ Biến thể `ca_hai` thêm 2026-09-16. Hai biến thể cũ đều dựng cụm phân trang bằng ĐÚNG MỘT
# control, nên cả bộ tự kiểm lẫn `probe_live` sống yên với giả định "cụm = một ô". Màn thật của
# moet-datalake có **HAI**: ô nhập tự do + ô chọn nhanh, và hồ sơ màn khai đúng cả hai nhóm
# (`Textbox Số bản ghi trên trang` 10 case + `Selectbox Số bản ghi trên trang` 5 case). Với hình
# dạng đó bản cũ chỉ khoanh được ô NHẬP rồi tố hồ sơ khai sai loại cho nhóm Selectbox — báo động
# giả ở đúng chỗ người ta dùng để sửa hồ sơ, sửa theo là mất 5 case.
_CUM_PHAN_TRANG = {
    'select': '<select><option>20</option><option>50</option></select>',
    'input': '<input type="text" value="20" style="width:60px">'
             '<button type="button" aria-label="Mức gợi ý" aria-haspopup="listbox" '
             'style="width:24px">▾</button>',
    'ca_hai': '<input type="text" value="20" style="width:60px">'
              '<select><option>20</option><option>50</option><option>100</option>'
              '<option>200</option><option>500</option></select>',
}


def _man_danh_sach(man, bay=False, cum=None):
    return _trang("""
<nav><span>Trang chủ</span> <span>&gt;</span> <span>Danh mục</span> <span>&gt;</span>
 <span>%(ten)s</span></nav>
<h1>%(ten)s</h1>
<button>Thêm mới</button><button>Xuất excel</button>%(tai_lai)s
%(kpi)s
<div class="bar" style="margin-top:150px">
  <input type="text" placeholder="Nhập từ khoá tìm kiếm" style="width:220px">
  <select><option>-- Chọn Trạng thái --</option><option>Hoạt động</option></select>
  <button type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false"
          aria-controls="ds-nhom">-- Chọn Nhóm --</button>
  <ul id="ds-nhom" role="listbox" hidden><li role="option">Nhóm 1</li></ul>
  <button type="button">Tìm kiếm</button>
  %(xoa_loc)s
</div>
%(bang)s
<div>Tổng số bản ghi: 5 &nbsp; Số bản ghi/trang %(perpage)s
 &nbsp; Nhập số trang <input type="text" value="1"></div>
<div id="hop"></div>
<script>
function sang(i){history.pushState({},'', location.pathname.replace(/\\/$/,'')+'/ct/'+i);
  ve();}
function ve(){const m=location.pathname.match(/\\/ct\\/(\\d+)$/);
 if(m){document.querySelector('main').innerHTML=CHI_TIET.replace(/__ID__/g,m[1]);}
 else{location.reload();}}
window.addEventListener('popstate',()=>{location.reload();});
const CHI_TIET=`<nav><span>Trang ch\\u1ee7</span> <span>&gt;</span> <span>%(ten)s</span>
 <span>&gt;</span> <span>Chi ti\\u1ebft</span></nav>
<h1>Chi ti\\u1ebft b\\u1ea3n ghi __ID__</h1>
<button title="Quay l\\u1ea1i">Quay l\\u1ea1i</button>
<table><thead><tr><th>Tr\\u01b0\\u1eddng</th><th>Gi\\u00e1 tr\\u1ecb</th></tr></thead>
<tbody><tr><td>M\\u00e3</td><td>MA-00__ID__</td></tr></tbody></table>`;
if(/\\/ct\\/\\d+$/.test(location.pathname)) ve();
document.querySelector('button').addEventListener('click',function(){
  document.getElementById('hop').innerHTML=`
  <div role="dialog"><h2>Th\\u00eam m\\u1edbi %(ten)s</h2><form>
    <div><label>M\\u00e3 *</label><input type="text" maxlength="20" required></div>
    <div><label>T\\u00ean</label><input type="text" maxlength="250"></div>
    <div><label>Ghi ch\\u00fa</label><textarea maxlength="500"></textarea></div>
    <div><label>Tr\\u1ea1ng th\\u00e1i</label><select><option>-- Ch\\u1ecdn --</option></select></div>
    <div><label>Nh\\u00f3m</label><button type="button" role="combobox"
       aria-haspopup="listbox" aria-expanded="false">-- Ch\\u1ecdn Nh\\u00f3m --</button></div>
    <div><label>Ng\\u00e0y \\u00e1p d\\u1ee5ng</label><input type="date"></div>
    <button type="button">L\\u01b0u</button><button type="button"
      onclick="document.getElementById('hop').innerHTML=''">H\\u1ee7y b\\u1ecf</button>
  </form></div>`;});
</script>""" % {'ten': man, 'bang': _bang(man),
                    'tai_lai': _NUT_TAI_LAI[bool(bay)],
                    'xoa_loc': _NUT_XOA_LOC[bool(bay)],
                    'kpi': _THE_SO_LIEU if bay else '',
                    'perpage': _CUM_PHAN_TRANG[cum or ('input' if bay else 'select')]})


class Tay(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass                                  # im lặng — log của app giả không giúp gì

    def _ra(self, ma, body, ctype='text/html; charset=utf-8', them=()):
        b = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(ma)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        for k, v in them:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b)

    def _phien(self):
        m = re.search(r'phien=([^;]+)', self.headers.get('Cookie') or '')
        return m.group(1) if m else ''

    def do_GET(self):
        p, _, truy_van = self.path.partition('?')
        if p in ('/', '/login'):
            return self._ra(200, LOGIN)
        if p.startswith('/admin/'):
            if not self._phien():
                return self._ra(302, '', them=(('Location', '/login'),))
            man = p.split('/')[2].replace('-', ' ').title()
            return self._ra(200, _man_danh_sach(
                man, 'bay=1' in truy_van,
                'ca_hai' if 'cum=2' in truy_van else None))
        return self._ra(404, _trang('<h1>404</h1>'))

    def do_POST(self):
        if self.path != '/api/login':
            return self._ra(404, '{}', 'application/json')
        n = int(self.headers.get('Content-Length') or 0)
        try:
            d = json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            d = {}
        u, pw = d.get('u') or '', d.get('p') or ''
        if TAI_KHOAN.get(u) != pw:
            return self._ra(200, json.dumps({'ok': False}), 'application/json')
        ve = '/admin/danh-muc-nguon'
        # `tk` = token MỜ (không suy ra được từ tên tài khoản) — phép kiểm bảo mật dùng chính
        # giá trị này để chứng minh token không lọt vào log/báo cáo/kết quả.
        return self._ra(200, json.dumps({'ok': True, 've': ve}), 'application/json',
                        them=(('Set-Cookie', 'phien=%s; Path=/' % u),
                              ('Set-Cookie', 'tk=%s; Path=/' % token(u))))


def chay(port=0):
    srv = ThreadingHTTPServer(('127.0.0.1', port), Tay)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--port', type=int, default=0)
    a = ap.parse_args()
    srv = chay(a.port)
    print('APP GIẢ đang nghe: http://127.0.0.1:%d/login' % srv.server_address[1], flush=True)
    print('   tài khoản: ' + ' · '.join('%s / %s' % kv for kv in TAI_KHOAN.items()), flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        srv.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())

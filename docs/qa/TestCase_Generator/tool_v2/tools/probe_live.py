# -*- coding: utf-8 -*-
"""SOI MÀN THẬT (lớp L3) — đăng nhập rồi đọc DOM đã render. CHỈ ĐỌC, không ghi dữ liệu.

Bổ trợ cho `probe_fe.py` (đọc bundle FE tĩnh, không đăng nhập). Hai thứ `probe_fe` KHÔNG lấy
được, và chỉ màn thật mới trả lời (chỉ thị người đặt việc 2026-09-09 — xem
`../huong-dan/HO-SO-DU-AN.md` §B0):

  · `nav`  — đường dẫn menu KHÔNG có trong bundle, phải đọc breadcrumb thật
  · LOẠI control + nhãn UI + **THỨ TỰ trên màn** — bundle cho biết *component*, không cho biết
    cái gì HIỆN RA và xếp thứ tự nào. Thứ tự thật quyết định thứ tự nhóm con khối
    `Chức năng Tìm kiếm đơn lẻ` (PROMPT v3 §6).

Không cần `pip install` gì: điều khiển Chrome sẵn có bằng **CDP** qua client WebSocket viết
bằng thư viện chuẩn (giữ đúng cam kết "Python 3 thuần" của bộ tool).

    export ROLE_USER=... ROLE_PASS=...   # hoặc ROLE_<VAI TRÒ>_USER/_PASS
    python3 probe_live.py <url màn>                      # chỉ in báo cáo
    python3 probe_live.py <url màn> --spec <màn>.json    # + ĐỐI CHIẾU hồ sơ màn, báo chỗ LỆCH
    python3 probe_live.py <url màn> --sua                # soi thêm biểu mẫu CHỈNH SỬA
    python3 probe_live.py <url màn> --hien               # mở cửa sổ thật (gỡ lỗi)

**NHIỀU PHIÊN LÀM VIỆC (multi-session, mới 2026-09-12).** Soi nhiều màn / nhiều vai trò / nhiều
tài khoản CÙNG LÚC mà không phiên nào đụng phiên nào — mỗi phiên một Chrome (cổng CDP + hồ sơ
cookie riêng), một log, một bộ ảnh chụp, một kết quả, một trạng thái:

    python3 probe_live.py <url> --session session-001 --new --role Admin
    python3 probe_live.py <url> --session session-001 --resume      # chạy tiếp phiên dở
    python3 probe_live.py --sessions session-001,session-002 --parallel 2
    python3 probe_live.py --config sessions.json --parallel 3
    python3 probe_live.py --list-sessions
    python3 probe_live.py --delete-session session-001 --yes

Mỗi phiên nằm gọn trong `sessions/<id>/` (đổi chỗ bằng `QA_SESSION_DIR`): `config.json` ·
`state.json` (vòng đời CREATED→STARTING→LOGIN→READY→RUNNING→COMPLETED, lỗi thì FAILED, chạy
lại thì RESUMING) · `chrome-profile/` · `cookies/` · `screenshots/` · `evidence/` ·
`logs/live.log` · `result/`. Tài khoản riêng cho từng vai trò do `tools/tai_khoan.py` tìm —
khuôn tên CẤU HÌNH ĐƯỢC (`ROLE_<VAI TRÒ>_USER` · `<VAI TRÒ>_USER` · khuôn cũ `QA_USER_<ROLE>`),
đọc từ biến môi trường / tệp env NGOÀI repo / lệnh lấy bí mật. Không bao giờ viết mật khẩu vào
file cấu hình trong repo.

⚠️ Chạy **KHÔNG** kèm `--session` thì mọi thứ y như trước: cổng 9333, hồ sơ Chrome dùng chung,
và **không ghi một file nào** — đúng cam kết "chỉ đọc + chỉ in" ở đoạn cuối docstring này.

⚠️ **HÀNG RÀO AN TOÀN — script chỉ bấm 4 loại phần tử, không hơn:**
   ① thẻ chọn phân hệ  ② nút `Đăng nhập`  ③ nút `Thêm mới` / icon `Chỉnh sửa` (chỉ để MỞ biểu mẫu)
   ④ nút `Hủy bỏ` (để đóng lại).
   **TUYỆT ĐỐI không** bấm Lưu · Cập nhật · Xóa · Chuyển trạng thái · Nhập excel · Xuất excel.
   Không gọi API ghi, không sửa bản ghi nào.

Báo cáo là **GỢI Ý để khai hồ sơ màn**, không phải căn cứ tự động: script **không ghi gì vào bộ
case, hồ sơ màn hay dữ liệu của app** (chốt 2026-09-09 — "không nên cố định", mỗi lần cần thì soi
lại màn thật). Chạy có `--session` thì nó ghi log/ảnh/kết quả của PHIÊN vào `sessions/<id>/` —
thư mục của riêng nó, không đụng file nào khác.
"""
import argparse
import json
import os
import re
import shutil
import sys
import threading
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib          # noqa: E402  — dùng CHUNG `field_of()` để cắt tiền tố loại control
import session_manager as sm   # noqa: E402  — phiên làm việc: thư mục · vòng đời · log · song song
# `WS`/`Chrome` đã dời sang `browser_manager.py` ngày 2026-09-12 để MỖI PHIÊN một browser
# (cổng + `user-data-dir` riêng). Vẫn tái xuất ở đây cho chỗ nào đang `from probe_live import
# Chrome`, và `PORT`/`PROF`/`CHROME` giữ nguyên tên cho đường chạy CŨ.
import browser_manager as bm                                # noqa: E402
from browser_manager import WS, Chrome, PORT, PROF, CHROME   # noqa: E402,F401
# Tiền tố đường dẫn SAU KHI đăng nhập thành công. Mặc định `/admin` (app MOET học bạ số),
# nhưng đây là dữ kiện của DỰ ÁN chứ không phải của bộ tool: app datalake
# (moet-datalake) đặt mọi route ở GỐC (`/quarantine-list`) nên chốt cứng `/admin` là
# script báo "đăng nhập KHÔNG vào được" dù đã vào được màn. Đổi bằng QA_HOME_PREFIX.
HOME = os.environ.get('QA_HOME_PREFIX') or '/admin'
# Route trang đăng nhập — cần để phân biệt "đã có phiên" với "bị đá về đăng nhập"
# khi HOME là gốc `/` (app đặt route ở gốc thì mọi pathname đều khớp `/`).
LOGIN = os.environ.get('QA_LOGIN_PATH') or '/login'


def die(msg):
    raise SystemExit('LỖI: ' + msg)


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()


# ══════════════════════════════════════════════════════════════════════════════
# 3. ĐĂNG NHẬP  (bấm ① thẻ phân hệ  ② nút Đăng nhập — không gì khác)
# ══════════════════════════════════════════════════════════════════════════════
_SET = ("const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor("
        "el.constructor.prototype,'value'); d.set.call(el,v);"
        "el.dispatchEvent(new Event('input',{bubbles:true}));};")


def dang_nhap(c, url, user, pw, phan_he, home=None, login=None):
    # `home`/`login` truyền vào để MỖI PHIÊN soi được một app khác nhau (mỗi app một tiền tố
    # route). Không truyền thì vẫn là HOME/LOGIN đọc từ biến môi trường như trước.
    home, login = home or HOME, login or LOGIN
    c.go(url)
    time.sleep(5)
    if c.js("location.pathname.indexOf(%r)===0 && location.pathname.indexOf(%r)!==0 ? 1 : 0"
             % (home, login)):
        return 'đã có phiên sẵn (không cần đăng nhập lại)'
    if not user or not pw:
        # NGUỒN ④ của §1 (chỉ thị 17/09) là *"session đã đăng nhập"* — và nó vừa được hỏi ở
        # dòng trên. Tới đây nghĩa là hồ sơ trình duyệt KHÔNG còn phiên sống, mà cũng không có
        # tài khoản để đăng nhập lại. Phải dừng bằng câu có mã, KHÔNG được điền `None` vào ô
        # đăng nhập rồi để app trả về "sai tài khoản" — lỗi ấy đọc lên như lỗi của hệ thống.
        import tai_khoan as _tk
        die(_tk.thieu('') + '\n   (hồ sơ trình duyệt của phiên này cũng không còn phiên đăng '
                            'nhập sống để dùng lại)')

    # ① trang chọn phân hệ (thẻ cursor-pointer, khớp ĐẦU chuỗi)
    if c.wait("[...document.querySelectorAll('[class*=cursor-pointer]')]"
              ".some(e=>/^Phân hệ /i.test((e.innerText||'').trim())) ? 1 : 0", 20):
        r = c.js("""(()=>{const t=[...document.querySelectorAll('[class*=cursor-pointer]')]
          .find(e=>new RegExp(%r,'i').test((e.innerText||'').trim()));
          if(!t) return ''; t.click(); return (t.innerText||'').split('\\n')[0].trim();})()"""
                 % ('^' + re.escape(phan_he),))
        if not r:
            die('không thấy thẻ phân hệ khớp %r — mở --hien để xem trang chọn phân hệ' % phan_he)
        print('   ① chọn phân hệ    : %s' % r)

    # ② form đăng nhập
    if not c.wait("document.querySelectorAll('input:not([type=hidden])').length>=2 ? 1:0", 30):
        die('không thấy form đăng nhập (mở --hien để xem). Có thể trang chen ngang '
            '(đổi mật khẩu lần đầu / mã xác thực) — xem docstring.')
    c.js("(()=>{%s const ins=[...document.querySelectorAll('input:not([type=hidden])')];"
         "const u=ins.find(i=>i.type!=='password'),p=ins.find(i=>i.type==='password');"
         "if(u)set(u,%r); if(p)set(p,%r); return 1;})()" % (_SET, user, pw))
    time.sleep(0.6)
    r = c.js("""(()=>{const b=[...document.querySelectorAll('button')]
      .find(b=>/^\\s*đăng nhập\\s*$/i.test(b.innerText||''))
      || document.querySelector('button[type=submit]');
      if(!b) return ''; b.click(); return (b.innerText||'').trim();})()""")
    if not r:
        die('không thấy nút Đăng nhập')
    print('   ② bấm             : %s' % r)

    ok = c.wait("location.pathname.indexOf(%r)===0 && location.pathname.indexOf(%r)!==0"
                " ? location.pathname : ''" % (home, login), 45)
    if not ok:
        txt = (c.js('document.body.innerText') or '')[:200].replace('\n', ' / ')
        die('đăng nhập KHÔNG vào được %s.\n'
            '   URL hiện tại: %s\n   Trang đang hiện: %s\n'
            '   Nếu thấy CAPTCHA (Cloudflare Turnstile) hoặc màn đổi mật khẩu/mã xác thực thì '
            'chạy lại với --hien và xử tay, script không tự qua được.\n'
            '   Route của app KHÔNG nằm dưới %s thì đặt QA_HOME_PREFIX=<tiền tố thật>.'
            % (home, c.js('location.href'), txt, home))
    return ok


# ══════════════════════════════════════════════════════════════════════════════
# 4. SOI MÀN  (bấm ③ mở biểu mẫu  ④ Hủy bỏ để đóng — không gì khác)
# ══════════════════════════════════════════════════════════════════════════════
# Thứ tự trên màn tính theo toạ độ THẬT (trái->phải) sau khi đã render, không theo thứ tự DOM.
_JS_BREADCRUMB = """JSON.stringify((()=>{const a=document.querySelector('aside');
  const c=[...document.querySelectorAll('nav,ol,ul,div')].filter(e=>{
    if(a&&a.contains(e)) return false;
    const r=e.getBoundingClientRect();
    if(r.top>300||r.height>70||r.width<200) return false;
    return /Trang ch/.test(e.innerText||'');});
  if(!c.length) return [];
  const box=c.sort((x,y)=>x.innerText.length-y.innerText.length)[0];
  return [...box.querySelectorAll('*')].filter(e=>e.children.length===0)
    .map(e=>(e.innerText||'').trim())
    /* Dấu phân cách dựng bằng thẻ (`<span>></span>`, `<li>/</li>`) chứ không bằng CSS thì
       lọt vào nav và mục ⑤ tố hồ sơ "THIẾU breadcrumb: > · >". Mục nào không có lấy một
       chữ cái/chữ số nào thì không phải một chặng đường dẫn. */
    .filter(t=>t&&/[0-9A-Za-zÀ-ỹ]/.test(t));})())"""

_JS_SIDEBAR_ACTIVE = """JSON.stringify([...document.querySelectorAll(
  'aside [aria-current], aside [class*=active], aside [data-state=open]')]
  .map(e=>(e.innerText||'').trim().split(String.fromCharCode(10))[0])
  .filter(Boolean).filter((t,i,a)=>a.indexOf(t)===i).slice(0,6))"""

# ── TÍN HIỆU NHẬN DẠNG LOẠI CONTROL (dùng chung cho thanh lọc và biểu mẫu) ────────────────
# Vá 2026-09-14. Trước đó DOM chỉ trả về `the` = tên thẻ, và `loai_tu_the()` quy MỌI `<button>`
# thành `Selectbox`. Hậu quả: nút `Tìm kiếm`/`Xóa lọc`/`Tải lại` bị khai thành ô chọn ⇒ mục ⑤
# báo "hồ sơ khai sai loại" cho những chỗ hồ sơ khai ĐÚNG, và người đọc mất niềm tin vào bộ rà.
# Nay đọc thêm các dấu hiệu CHUẨN của ô chọn dựng tay (ARIA) để phân biệt, và chỗ nào không đủ
# căn cứ thì nói thẳng là KHÔNG RÕ thay vì đoán bừa (§7 yêu cầu 5).
_TIN_HIEU_JS = """
    const bo=(e,k)=>((e.getAttribute(k)||'')+'').trim().toLowerCase();
    const tin=e=>{const id=bo(e,'aria-controls');
      let dk=null; try{ dk=id?document.getElementById(id.split(/\\s+/)[0]):null; }catch(_){}
      const vai_dk=dk?bo(dk,'role'):'';
      return {vai:bo(e,'role'), popup:bo(e,'aria-haspopup'),
              mo:e.hasAttribute('aria-expanded'),
              vai_dieu_khien:vai_dk,
              kieu_nut:(e.tagName==='BUTTON'?(e.getAttribute('type')||'submit'):''),
              co_listbox:!!(e.querySelector&&e.querySelector('[role=listbox],[role=option]'))
                         || vai_dk==='listbox' || vai_dk==='menu'};};
"""

_JS_COLS = ("JSON.stringify([...document.querySelectorAll('table th')]"
            ".map(t=>(t.innerText||'').trim()))")

# ── VÙNG ĐẦU MÀN: nút thao tác + thanh lọc — đọc MỘT LẦN rồi tách theo HÀNG ──────────────
# ⚠️ Vá 2026-09-14. Hai bản cũ đều khoanh bằng DẢI TOẠ ĐỘ CHỐT CỨNG, và cả hai đều bỏ sót
# control trong im lặng — đúng lời báo của người đặt việc *"thỉnh thoảng nút button tải lại
# cũng không được phát hiện"*. Ba cơ chế rơi, dựng lại được trên `tu_kiem/app_gia.py?bay=1`:
#   ① `_JS_TOOLBAR` đòi `Math.abs(top - h1.top) < 44` ⇒ màn nào xuống dòng hàng nút (tiêu đề
#      dài, màn hẹp, hoặc app cố ý đặt nút ở hàng riêng) thì MẤT TRỌN hàng nút. Đo trên app
#      giả: `nút đầu màn` in ra RỖNG dù màn có `Thêm mới · Xuất excel · Tải lại`.
#   ② `_JS_TOOLBAR` đòi `innerText` khác rỗng ⇒ nút CHỈ CÓ ICON (⟳ dựng bằng <svg>) bị loại.
#      Tên của nó nằm ở `aria-label`/`title` — chỗ bản cũ không hề đọc.
#   ③ `_JS_FILTERBAR` đòi `top>140 && top<340` và `width>40` ⇒ màn có thẻ số liệu (KPI) đẩy
#      thanh lọc xuống quá 340px thì MẤT CẢ THANH LỌC (đo: 0 control), và nút icon rộng 32-36px
#      bị loại ngay cả khi thanh lọc nằm đúng dải.
# Nay: khoanh vùng theo MỐC THẬT TRÊN MÀN (từ `h1` tới đầu `table`), lấy hết phần tử tương tác
# trong đó, rồi để `tach_vung_dau()` tách nút/thanh lọc theo HÀNG. Không còn con số toạ độ nào
# quyết định một control có được nhìn thấy hay không ⇒ lớp lỗi "thỉnh thoảng mới sót" hết chỗ.
#
# `gia_tri` (2026-09-12) cho LUẬT CỨNG ①: phải đọc được ô đang HIỆN GÌ, không chỉ nhãn.
# Ba kiểu ô chọn trên thực tế, mỗi kiểu một chỗ giữ giá trị:
#   · <select>            -> text của option đang chọn
#   · combobox dựng bằng button/div -> innerText của chính nút
#   · <input readonly>    -> .value
# `nhan` giữ nguyên nghĩa cũ (`placeholder` trước) để phần đối chiếu control không đổi hành vi,
# chỉ NỐI THÊM `aria-label` vào lớp lùi — thứ duy nhất một nút icon có.
_JS_VUNG_DAU = """JSON.stringify((()=>{%s
  const h=document.querySelector('h1');
  const canh=document.querySelector('aside');
  const bang=document.querySelector('table');
  const yTren=h?h.getBoundingClientRect().top-4:0;
  /* Không có bảng (màn chi tiết/biểu mẫu) thì lấy một vùng rộng dưới tiêu đề — vẫn là mốc
     suy từ `h1` chứ không phải một dải cố định tính từ đỉnh cửa sổ. */
  const yDuoi=bang?bang.getBoundingClientRect().top
                  :(h?h.getBoundingClientRect().top+420:520);
  const ten=e=>{const t=((e.innerText||'').trim())
      ||((e.getAttribute('aria-label')||'').trim())
      ||((e.getAttribute('title')||'').trim());
    return t.split(String.fromCharCode(10))[0].trim().slice(0,44);};
  let els=[...document.querySelectorAll(
      'input,button,select,textarea,[role=combobox],[role=button]')]
    .filter(e=>{
      if(canh&&canh.contains(e)) return false;
      if(e.closest('table')||e.closest('[role=dialog]')||e.closest('header')) return false;
      if(e.type==='hidden'||e.offsetParent===null) return false;
      const r=e.getBoundingClientRect();
      if(r.width<8||r.height<8) return false;
      return r.top>=yTren && r.top<yDuoi;});
  /* `[role=combobox]`/`[role=button]` hay là thẻ BỌC quanh một <button> thật -> bỏ cái bọc,
     không thì một control đếm hai lần và thứ tự trái->phải sai. */
  els=els.filter(e=>!els.some(o=>o!==e&&e.contains(o)));
  /* Phần tử KHÔNG có tên gọi nào VÀ quá hẹp thì là icon trang trí nằm trong control khác
     (nút xoá chữ của ô tìm kiếm). Có tên gọi thì hẹp mấy cũng là control THẬT. */
  els=els.filter(e=>!!(ten(e)||e.placeholder)||e.getBoundingClientRect().width>=40);
  /* HÀNG = cụm phần tử CHỒNG LẤN NHAU theo chiều dọc, không phải `top` làm tròn. Nút icon
     cao 32px nằm cùng hàng với ô nhập cao 21px có `top` lệch nhau cả chục pixel (căn giữa
     theo trục dọc) — gom theo `top` là tách chúng thành hai hàng, và bản thử 14/09 đã cho ra
     đúng hậu quả đó: nút `Xóa lọc` dạng icon bị xếp sang hàng nút đầu màn, và thứ tự
     trái->phải của hàng nút vỡ. */
  els.sort((x,z)=>{const a=x.getBoundingClientRect(),b=z.getBoundingClientRect();
      return (a.top-b.top)||(a.left-b.left);});
  let hang=0, day=-1;
  const soHang=new Map();
  for(const e of els){const r=e.getBoundingClientRect();
    if(day<0||r.top>=day-4){hang++; day=r.bottom;} else {day=Math.max(day,r.bottom);}
    soHang.set(e,hang);}
  return els.sort((x,z)=>(soHang.get(x)-soHang.get(z))
      ||(x.getBoundingClientRect().left-z.getBoundingClientRect().left))
    .map(e=>{const t=e.tagName;
      let gt='';
      if(t==='SELECT'){const o=e.selectedOptions&&e.selectedOptions[0];gt=o?(o.text||'').trim():'';}
      else if(t==='INPUT'||t==='TEXTAREA') gt=(e.value||'').trim();
      else gt=(e.innerText||'').trim();
      return Object.assign({the:t.toLowerCase()+(t==='INPUT'?'['+e.type+']':''),
              nhan:(((e.placeholder||'')+'').trim().slice(0,44)||ten(e)),
              goi_y:((e.placeholder||'')+'').trim().slice(0,44),
              nhan_label:'',
              /* `chi_icon` chỉ có nghĩa với NÚT: <input> không bao giờ có `innerText`, gắn
                 cờ cho nó là in ra một lời cảnh báo sai. */
              chi_icon:(t==='BUTTON'||e.getAttribute('role')==='button')
                       &&!((e.innerText||'').trim()),
              hang:soHang.get(e),
              gia_tri:gt.split(String.fromCharCode(10))[0].slice(0,44)}, tin(e));});})())""" \
    % _TIN_HIEU_JS

_JS_ROW_ICONS = """JSON.stringify([...document.querySelectorAll('table tbody tr')].slice(0,3)
  .map(tr=>[...tr.querySelectorAll('button')]
    .map(b=>b.getAttribute('title')||(b.innerText||'').trim()||'(không có title)')))"""


def _la_o_nhap_lieu(x):
    """Phần tử này là Ô NHẬP / Ô CHỌN (tức thuộc thanh lọc), hay chỉ là một cái nút?"""
    t = (x.get('the') or '')
    if t.startswith('input['):
        return not t.startswith(('input[button', 'input[submit', 'input[reset', 'input[image'))
    if t.startswith(('select', 'textarea', '[role=combobox]')):
        return True
    return _la_o_chon(x)


def tach_vung_dau(items):
    """[phần tử vùng đầu màn] -> (nút đầu màn, thanh lọc). Tách theo HÀNG, không theo toạ độ.

    Thanh lọc bắt đầu ở HÀNG ĐẦU TIÊN có ô nhập/ô chọn; mọi hàng TRƯỚC nó là hàng nút thao tác
    của màn. Không hàng nào có ô nhập (màn chỉ có nút) thì tất cả là nút đầu màn — và KHÔNG
    phần tử nào bị vứt đi, khác hẳn hai dải toạ độ cũ.
    """
    items = items or []
    hang_loc = next((x.get('hang') for x in items if _la_o_nhap_lieu(x)), None)
    if hang_loc is None:
        return items, []
    return ([x for x in items if x.get('hang', 0) < hang_loc],
            [x for x in items if x.get('hang', 0) >= hang_loc])


def doc_vung_dau(c):
    """(nút đầu màn dạng chuỗi, thanh lọc dạng dict) — đọc DOM rồi tách."""
    nut, loc = tach_vung_dau(c.jsj(_JS_VUNG_DAU) or [])
    return [x['nhan'] for x in nut if x.get('nhan')], loc


# "Số bản ghi/trang" là VALUE của một ô nhập -> không có trong innerText, phải đọc .value.
_JS_PAGING = """JSON.stringify((()=>{%s
  const t=document.body.innerText||'';
  /* ⚠️ Vá 2026-09-14 — hai lớp lỗi của cách đọc cũ, cùng dẫn tới một hậu quả: mục ⑦ LUẬT CỨNG
     in ra giá trị của MỘT Ô KHÁC rồi kết luận "VI PHẠM" cho cụm phân trang đang để đúng.
     Issue sai gửi cho QA là cái giá đắt nhất một bộ rà có thể gây ra.
       ① leo tổ tiên 3 đời rồi nhận bừa: 3 đời đã chạm `<main>`/`<body>` (nơi chứa TOÀN BỘ chữ
          của trang) nên MỌI <select> đều "khớp", và cái trả về là cái đầu tiên trong DOM —
          thường là ô lọc Trạng thái. Chặn bằng `hep()`: mốc phải là khối NHỎ, không ôm bảng.
       ② cùng một khối chứa cả "Số bản ghi/trang" lẫn "Nhập số trang" (thanh phân trang một
          hàng, rất phổ biến) thì `gan()` trả ô nào gặp trước, không phải ô của nhãn đang hỏi.
          Chữa bằng `sauNhan()`: lấy control đứng NGAY SAU chữ nhãn, đúng cách người đọc màn
          hiểu. Cách cũ giữ lại làm lớp lùi -> màn nào đang đọc đúng thì vẫn đọc đúng như trước. */
  const hep=p=>p && (p.innerText||'').length<=160 && !p.querySelector('table')
             && p.tagName!=='MAIN' && p.tagName!=='BODY';
  const laCtl=e=>e&&e.nodeType===1&&(/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.tagName)
             ||e.getAttribute('role')==='combobox');
  const trongDo=e=>e&&e.querySelector
    ?e.querySelector('input,select,textarea,button,[role=combobox]'):null;
  const sauNhan=nhan=>{
    const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null);
    let n;
    while((n=tw.nextNode())){
      if(!((n.nodeValue||'').includes(nhan))) continue;
      let cur=n;
      for(let k=0;k<3&&cur;k++,cur=cur.parentNode){
        for(let sib=cur.nextSibling;sib;sib=sib.nextSibling){
          if(laCtl(sib)) return sib;
          const q=trongDo(sib); if(q) return q;
        }
      }
    }
    return null;};
  const doc=e=>{if(!e) return '';
    if(e.tagName==='SELECT'){const o=e.selectedOptions&&e.selectedOptions[0];
      return o?(o.text||'').trim():'';}
    if(e.tagName==='INPUT'||e.tagName==='TEXTAREA') return (e.value||'').trim();
    return (e.innerText||'').trim();};
  const ganEl=nhan=>{const q=sauNhan(nhan); if(q) return q;
    return [...document.querySelectorAll('input')]
    .find(i=>{let p=i.parentElement; for(let k=0;k<3&&p;k++,p=p.parentElement){
      if(hep(p)&&(p.innerText||'').includes(nhan)) return true;} return false;})||null;};
  const gan=nhan=>doc(ganEl(nhan));
  /* Cụm số bản ghi/trang dựng bằng <select> hoặc combobox-button thì KHÔNG có .value của
     input -> bản cũ trả rỗng và luật cứng ② mất chỗ đo. Thêm 2026-09-12. */
  const ganChonEl=nhan=>{for(const e of document.querySelectorAll('select,button,[role=combobox]')){
    let p=e.parentElement, ok=false;
    for(let k=0;k<3&&p;k++,p=p.parentElement){
      if(hep(p)&&(p.innerText||'').includes(nhan)){ok=true;break;} }
    if(!ok) continue;
    if(e.tagName==='SELECT'){const o=e.selectedOptions&&e.selectedOptions[0];
      if(o&&(o.text||'').trim()) return e;}
    else {const t=(e.innerText||'').trim(); if(/^\\d+$/.test(t)) return e;}
  } return null;};
  const ganChon=nhan=>doc(ganChonEl(nhan));
  /* ⚠️ Vá 2026-09-14 — LOẠI của ô này, không chỉ giá trị của nó. Trước bản này `probe_live`
     đọc được "đang là 20" mà KHÔNG hề cho biết 20 đó nằm trong <select> hay <input type=text>,
     nên hồ sơ màn khai `Selectbox Số bản ghi trên trang` cho một màn dùng TEXTBOX nhập tự do
     mà không phép rà nào kêu: `soi_cum_phan_trang` chỉ hỏi "có nhóm nào cho cụm này không",
     `audit_validate_quota` thì đếm đúng định mức của loại ĐÃ KHAI. Giá phải trả là cả bộ case
     validate của ô nhập (số âm · số 0 · ký tự khác số · vượt ngưỡng · số lẻ…) không sinh ra,
     và định mức tụt 10 -> 5 trong im lặng. */
  const NHAN_PP=['Số bản ghi/trang','Số bản ghi trên trang','bản ghi/trang'];
  const elPP=(()=>{for(const n of NHAN_PP){const e=ganEl(n); if(e) return e;}
    for(const n of NHAN_PP){const e=ganChonEl(n); if(e) return e;} return null;})();
  /* ⚠️ Vá 2026-09-16 — cụm phân trang có thể có HAI control, không phải một.
     Màn thật của moet-datalake: ô NHẬP tự do (gõ số bất kỳ) + ô CHỌN NHANH (20/50/100/200/500).
     Bộ case mẫu hoá điều đó thành HAI nhóm với hai định mức khác nhau (`Textbox Số bản ghi trên
     trang` 10 case · `Selectbox Số bản ghi trên trang` 5 case), nhưng bản cũ ở đây chỉ trả về
     ĐÚNG MỘT `o_so_ban_ghi` — và `ganEl()` ưu tiên <input> nên trên màn có cả hai thì cái được
     khoanh LUÔN LÀ ô nhập. Hậu quả đo được: ô chọn nhanh không bao giờ vào báo cáo soi màn, và
     `doi_chieu()` đem ô nhập ra so với nhóm `Selectbox …` rồi tố hồ sơ khai sai loại — báo động
     giả ở đúng chỗ người ta dùng để sửa hồ sơ, sửa theo là mất trắng 5 case. */
  const gan3=(e,nhan)=>{let p=e&&e.parentElement;
    for(let k=0;k<3&&p;k++,p=p.parentElement){
      if(hep(p)&&(p.innerText||'').includes(nhan)) return true;}
    return false;};
  const hien=e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0;};
  const dsOption=e=>e&&e.tagName==='SELECT'
    ?[...e.options].map(o=>(o.text||'').trim()).filter(Boolean):[];
  const oChonNhanh=(()=>{
    for(const n of NHAN_PP){const e=ganChonEl(n);
      if(e&&e!==elPP) return Object.assign({the:e.tagName==='SELECT'?'select'
          :(bo(e,'role')==='combobox'?'[role=combobox]':'button'),
        nhan:'Số bản ghi trên trang', nhan_label:'', goi_y:'',
        gia_tri:doc(e).slice(0,44), option:dsOption(e)}, tin(e));}
    /* hàng MỨC GỢI Ý dựng bằng nút số (20 · 50 · 100): không phải <select> nên `ganChonEl`
       chỉ nhận cái ĐẦU TIÊN; ở đây gom cả hàng và khai rõ nó đóng vai một ô chọn. */
    for(const n of NHAN_PP){
      const nut=[...document.querySelectorAll('button')]
        .filter(b=>/^\\d+$/.test((b.innerText||'').trim())&&hien(b)&&gan3(b,n));
      if(nut.length>=2) return {the:'button[]', nhan:'Số bản ghi trên trang', nhan_label:'',
        goi_y:'', gia_tri:'', option:nut.map(b=>(b.innerText||'').trim()),
        vai:'', popup:'', mo:false, vai_dieu_khien:'', kieu_nut:'button', co_listbox:true};}
    return null;})();
  const m2=t.match(/Tổng số bản ghi:?\\s*([\\d.,]+)/);
  return {so_ban_ghi_trang:gan('Số bản ghi/trang')||ganChon('Số bản ghi/trang')
                          ||ganChon('Số bản ghi trên trang')||ganChon('bản ghi/trang'),
          o_so_ban_ghi:elPP?Object.assign({
            the:elPP.tagName.toLowerCase()
                +(elPP.tagName==='INPUT'?'['+elPP.type+']':''),
            nhan:'Số bản ghi trên trang',
            nhan_label:'',
            goi_y:((elPP.placeholder||'')+'').trim().slice(0,44),
            gia_tri:doc(elPP).slice(0,44)}, tin(elPP)):null,
          o_chon_nhanh:oChonNhanh,
          tong:m2?m2[1]:'',
          o_nhap_trang:/Nhập số trang/.test(t)?('có, đang là '+(gan('Nhập số trang')||'?')):'không',
          muc_chon_nhanh:(oChonNhanh&&(oChonNhanh.option||[]).length
            ?oChonNhanh.option
            :[...document.querySelectorAll('button')]
              .filter(b=>/^\\d+$/.test((b.innerText||'').trim())&&hien(b)
                         &&NHAN_PP.some(n=>gan3(b,n)))
              .map(b=>b.innerText.trim())).join('/')};})())""" % _TIN_HIEU_JS


# THẺ SỐ LIỆU (KPI) — thêm 2026-09-10. Trước đó KHÔNG reader nào đọc được: bộ đọc nút chỉ
# lấy nút cùng hàng `h1`, bộ đọc thanh lọc chỉ lấy dải 140–340px, `_JS_COLS` chỉ lấy `th`.
# Màn chi tiết thường mang 4 thẻ số liệu và chúng là CONTROL có nhóm riêng (`Thẻ số liệu` định
# mức 4) ⇒ soi màn mà không thấy chúng thì khai thiếu hẳn 4 nhóm.
# Nhận dạng KHÔNG theo class của app: nhãn thẻ là chữ IN HOA (hoặc `text-transform:uppercase`),
# ngắn, nằm NGOÀI bảng và ngoài sidebar; lấy cả khối cha để ra `nhãn / giá trị / mô tả`.
_JS_THE_SO_LIEU = """JSON.stringify((()=>{const a=document.querySelector('aside');
  const h=document.querySelector('h1');
  const y=h?h.getBoundingClientRect().top:0;
  const ra=[], seen={};
  for(const e of document.querySelectorAll('p,span,div,h2,h3')){
    if(e.children.length) continue;
    if(a&&a.contains(e)) continue;
    if(e.closest('header')||e.closest('table')||e.closest('[role=dialog]')) continue;
    if(e.getBoundingClientRect().top<y) continue;
    const t=(e.innerText||'').trim();
    if(!t||t.length>44) continue;
    const st=getComputedStyle(e);
    if(st.textTransform!=='uppercase' && t!==t.toUpperCase()) continue;
    if(e.getBoundingClientRect().width<60) continue;
    let box=e.parentElement;
    for(let k=0;k<3&&box;k++,box=box.parentElement){
      const ln=(box.innerText||'').split(String.fromCharCode(10))
        .map(x=>x.trim()).filter(Boolean);
      if(ln.length>=2&&ln.length<=4&&ln[0]===t) {
        const key=ln.join(' | ');
        if(!seen[key]){seen[key]=1; ra.push({nhan:ln[0], gia_tri:ln[1],
                                             mo_ta:ln.slice(2).join(' ')});}
        break;
      }
    }
  }
  return ra.slice(0,8);})())"""

# Loại control trong biểu mẫu: đi theo TOẠ ĐỘ (trên->dưới) để ra ĐÚNG thứ tự trên màn.
_JS_FORM = """JSON.stringify((()=>{%s
  const box=document.querySelector('form')||document.querySelector('[role=dialog]');
  if(!box) return null;
  /* ⚠️ Vá 2026-09-14. Bản cũ leo 5 đời rồi nhận <label> ĐẦU TIÊN gặp được, không hỏi nhãn
     đó có phải của chính ô này không. Nút `Lưu`/`Hủy bỏ` nằm thẳng trong <form> (không có
     div bọc riêng) nên `closest('div')` nhảy lên cả hộp thoại và cả hai nhận nhãn "Mã" —
     ô đầu tiên của biểu mẫu. Hậu quả kép: mục ⑤ ghép chúng vào nhóm `Textbox Mã`, rồi
     `loai_tu_the` thấy có `nhan_label` nên xếp nút thành `Selectbox` ⇒ hai dòng "hồ sơ khai
     sai loại" HOÀN TOÀN SAI, ở đúng chỗ người đọc dùng để sửa hồ sơ.
     Nay chỉ nhận <label> của một KHỐI BỌC chứa ĐÚNG MỘT control — khuôn field wrapper
     `<div><label>Mã *</label><input></div>`. Khối chứa nhiều control thì nhãn trong đó là
     nhãn của ô khác, không phải của ô đang hỏi. */
  const CTL='input,select,textarea,button,[role=combobox]';
  const nhan=e=>{let p=e.parentElement;
    for(let k=0;k<5&&p;k++,p=p.parentElement){
      if(p.querySelectorAll(CTL).length>1) return '';
      const l=p.querySelector('label');
      if(l&&(l.innerText||'').trim()) return l.innerText.trim();} return '';};
  const els=[...box.querySelectorAll('input,textarea,select,[role=combobox],button')]
    .filter(e=>e.offsetParent!==null && e.type!=='hidden');
  return {tieu_de:((box.closest('[role=dialog]')||box).querySelector('h2,h3')||{}).innerText||'',
    control:els.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)
      .map(e=>{const l=nhan(e).replace(/\\s*\\*\\s*$/,'');
        const t=e.tagName; let gt='';
        if(t==='SELECT'){const o=e.selectedOptions&&e.selectedOptions[0];gt=o?(o.text||'').trim():'';}
        else if(t==='INPUT'||t==='TEXTAREA') gt=(e.value||'').trim();
        else gt=(e.innerText||'').trim();
        /* §6 — ô mật khẩu KHÔNG bao giờ đưa giá trị vào báo cáo/JSON của phiên */
        if(t==='INPUT'&&e.type==='password') gt=gt?'(đã ẩn)':'';
        return Object.assign({the:t.toLowerCase()+(t==='INPUT'?'['+e.type+']':''),
                nhan:(l||e.placeholder||(e.innerText||'').trim()||'').slice(0,44),
                nhan_label:l.slice(0,44),
                goi_y:((e.placeholder||'')+'').trim().slice(0,44),
                gia_tri:gt.split(String.fromCharCode(10))[0].slice(0,44),
                bat_buoc:!!(e.required)||/\\*/.test(nhan(e)),
                maxlength:(e.maxLength&&e.maxLength>0&&e.maxLength<1e6)?e.maxLength:''},
               tin(e));})};})())""" % _TIN_HIEU_JS


def _mo_form(c, cach):
    """Mở biểu mẫu (CHỈ để đọc). cach='them' -> nút Thêm mới; 'sua' -> icon Chỉnh sửa dòng 1."""
    if cach == 'them':
        r = c.js("""(()=>{const b=[...document.querySelectorAll('button')]
          .find(b=>/^\\s*Thêm mới\\s*$/i.test(b.innerText||''));
          if(!b) return ''; b.click(); return 'Thêm mới';})()""")
    else:
        r = c.js("""(()=>{const b=[...document.querySelectorAll('table tbody tr')][0];
          if(!b) return ''; const e=[...b.querySelectorAll('button')]
            .find(x=>/chỉnh sửa/i.test(x.getAttribute('title')||''));
          if(!e) return ''; e.click(); return 'Chỉnh sửa';})()""")
    if not r:
        return None
    if not c.wait("document.querySelector('form,[role=dialog]')?1:0", 20):
        return None
    time.sleep(1.2)
    dat = c.jsj(_JS_FORM)
    # ④ đóng lại bằng Hủy bỏ — KHÔNG bấm Lưu/Cập nhật
    c.js("""(()=>{const b=[...document.querySelectorAll('button')]
      .find(b=>/^\\s*Hủy bỏ\\s*$/i.test(b.innerText||''))
      || [...document.querySelectorAll('button')].find(b=>/^\\s*Hủy\\s*$/i.test(b.innerText||''));
      if(b){b.click();return 1;} return 0;})()""")
    time.sleep(0.8)
    return dat


# ── LUỒN SÂU (`--sau`, mới 2026-09-09) ────────────────────────────────────────────────────
# Chỉ thị người đặt việc: *"nâng cấp tool_v2 có thể lên domain luồn sâu vào các luồng, tránh
# thiếu sót màn phụ như màn chi tiết lỗi của màn Quản lý dữ liệu lỗi"*.
# `probe_routes.py` liệt kê ĐỦ màn phụ từ bảng route (tĩnh) nhưng KHÔNG cho biết nhãn UI và
# THỨ TỰ control của màn phụ — đúng hai thứ bundle không nói được. Phần này đi nốt bằng cách
# LÀM NHƯ TESTER: mở màn cha, bấm vào bản ghi đầu để sang màn chi tiết, đọc DOM, rồi quay lại.
#
# HÀNG RÀO AN TOÀN — chỉ bấm 3 loại phần tử ĐỌC:
#   · dòng đầu của bảng / icon có title chứa "xem|chi tiết|detail"
#   · `[role=tab]` (tab thật, không đoán theo hình dạng)
#   · nút có chữ `Mở rộng · Thu gọn · Xem thêm · Hiện thêm`
# Trước MỖI cú bấm, đọc chữ trên phần tử và **CHẶN** nếu khớp danh sách cấm. Tuyệt đối không
# Lưu · Cập nhật · Xóa · Chuyển trạng thái · Khôi phục · Duyệt · Nhập/Xuất excel.
_JS_CAM = r"/lưu|cập nhật|xóa|xoá|chuyển trạng thái|khôi phục|duyệt|nhập|xuất|gửi|phê duyệt|kích hoạt/i"

# ── ỨNG VIÊN màn phụ: LIỆT KÊ TRƯỚC, bấm sau (vá 2026-09-14, §4) ──────────────────────────
# Bản cũ chỉ có `document.querySelector('table tbody tr')` = **DÒNG ĐẦU**, và không một dòng
# log nào nói ra điều đó. Người đọc báo cáo `--sau` mặc nhiên hiểu là "đã luồn hết" trong khi
# màn phụ chỉ mở được từ dòng 2, dòng 3 (bản ghi ở trạng thái khác) thì không ai biết là thiếu
# — đúng lớp "tool báo xong mà thực ra chưa soi tới nơi".
# Nay: đếm ĐỦ số dòng, chấm từng dòng xem có lối vào chi tiết không, và **in rõ đã soi mấy
# dòng trên tổng bao nhiêu**. Số dòng thật sự bấm vào do `--sau-dong` quyết (mặc định 1 =
# GIỮ NGUYÊN hành vi cũ, không tự ý bấm thêm vào app thật của người ta).
_JS_UNG_VIEN = """JSON.stringify((()=>{
  const rows=[...document.querySelectorAll('table tbody tr')];
  const ra=[];
  rows.forEach((tr,i)=>{
    const ic=[...tr.querySelectorAll('button,a')].find(x=>
      /xem|chi tiết|chi tiet|detail/i.test((x.getAttribute('title')||'')+' '
        +(x.getAttribute('aria-label')||'')));
    const t=ic||tr;
    const txt=((t.innerText||'')+' '+(t.getAttribute('title')||''))
      .replace(/\s+/g,' ').trim().slice(0,60);
    ra.push({dong:i, co_icon:!!ic,
             loi_vao: ic?('icon "'
                          +(ic.getAttribute('title')||ic.getAttribute('aria-label')||'')+'"')
                        :'chính dòng',
             chan:%s.test(txt),
             tom_tat:(tr.innerText||'').replace(/\s+/g,' ').trim().slice(0,60)});});
  return {tong:rows.length, ung_vien:ra};})())""" % _JS_CAM

_JS_TABS = """JSON.stringify([...document.querySelectorAll('[role=tab]')]
  .map(x=>({nhan:(x.innerText||'').trim().slice(0,40),
            dang_chon:x.getAttribute('aria-selected')==='true'})).filter(x=>x.nhan))"""

_JS_MO_RONG = """JSON.stringify([...document.querySelectorAll('button')]
  .map(x=>(x.innerText||'').replace(/\s+/g,' ').trim())
  .filter(t=>/^(Mở rộng|Thu gọn|Xem thêm|Hiện thêm|Xem chi tiết)$/i.test(t)))"""

# Mốc nhận dạng MÀN CHA, chụp TRƯỚC khi đi sâu và kiểm lại SAU khi quay về (§5).
_JS_MOC = """JSON.stringify({pathname:location.pathname, search:location.search,
  hash:location.hash, href:location.href,
  h1:((document.querySelector('h1')||{}).innerText||'').trim().slice(0,80),
  so_cot:document.querySelectorAll('table th').length})"""


def _bam_tab(c, nhan):
    """Bấm đúng tab theo nhãn, trả nội dung xuất hiện sau đó (cột bảng + nút)."""
    r = c.js("""(()=>{const t=[...document.querySelectorAll('[role=tab]')]
      .find(x=>(x.innerText||'').trim()===%s);
      if(!t) return ''; if(%s.test(t.innerText||'')) return 'CHAN'; t.click(); return 'OK';})()"""
             % (json.dumps(nhan), _JS_CAM))
    if r != 'OK':
        return None
    time.sleep(1.0)
    return {'cot': [x for x in (c.jsj(_JS_COLS) or []) if x],
            'nut_dau_man': doc_vung_dau(c)[0]}


def _bam_dong(c, i):
    """Bấm vào dòng thứ `i` của bảng (0-based) để mở chi tiết. Cùng hàng rào cấm như dòng đầu."""
    return c.js("""(()=>{const tr=[...document.querySelectorAll('table tbody tr')][%d];
      if(!tr) return 'KHONG_CO_DONG';
      const ic=[...tr.querySelectorAll('button,a')].find(x=>
        /xem|chi tiết|chi tiet|detail/i.test((x.getAttribute('title')||'')+' '
          +(x.getAttribute('aria-label')||'')));
      const t=ic||tr;
      const txt=((t.innerText||'')+' '+(t.getAttribute('title')||''))
        .replace(/\\s+/g,' ').trim().slice(0,60);
      if(%s.test(txt)) return 'CHAN:'+txt;
      t.click();
      return 'OK:'+(ic?('icon "'+(ic.getAttribute('title')||'')+'"'):'chính dòng');})()"""
                % (i, _JS_CAM))


# ── §5 — QUAY VỀ MÀN CHA phải được CHỨNG MINH, không phải `sleep` rồi tin ──────────────────
# Bản cũ: bấm nút "Quay lại" nếu có, không thì `history.back()`, rồi `time.sleep(1.5)` và coi
# như đã về. Với SPA (react-router/pushState) điều đó sai theo nhiều kiểu: back về một route
# TRUNG GIAN, back bị router nuốt, hoặc trang cha còn đang tải khi ta đã bấm tiếp. Hậu quả:
# vòng sau bấm nhầm vào DOM của màn chi tiết, và mọi thứ đọc được sau đó đều gán cho màn cha.
MOC_HOP = ('pathname', 'search')       # hai mốc quyết định "đúng màn cha"; hash/h1 chỉ để in


def _ve_dung_cha(c, moc):
    """Đang đứng ĐÚNG màn cha chưa? So `pathname` + `search`, rồi mới xét dấu hiệu DOM."""
    nay = c.jsj(_JS_MOC) or {}
    if any((nay.get(k) or '') != (moc.get(k) or '') for k in MOC_HOP):
        return False, nay
    if moc.get('h1') and nay.get('h1') and moc['h1'] != nay['h1']:
        return False, nay                     # cùng route nhưng nội dung khác -> chưa render xong
    if moc.get('so_cot') and not nay.get('so_cot'):
        return False, nay                     # màn cha vốn có bảng mà giờ chưa có
    return True, nay


def quay_ve_cha(c, moc, giay=15):
    """Quay về màn cha và KIỂM CHỨNG. Trả `(ok, cách đã dùng, mốc đọc được)`.

    Ba nấc, dừng ngay khi nấc nào chứng minh được là đã về:
      ① nút `Quay lại`/`Trở về` của chính app   ② `history.back()`   ③ nạp thẳng URL màn cha.
    Không nấc nào đạt thì trả `False` — người gọi PHẢI dừng luồn sâu, không được đi tiếp như
    thể đang đứng ở màn cha.
    """
    def cho(t):
        het = time.time() + t
        while time.time() < het:
            ok, nay = _ve_dung_cha(c, moc)
            if ok:
                return True, nay
            time.sleep(0.4)
        return _ve_dung_cha(c, moc)

    co_nut = c.js("""(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>
      /quay lại|trở về|back/i.test((x.getAttribute('title')||'')+' '
        +(x.getAttribute('aria-label')||'')+' '+(x.innerText||'')));
      if(b){b.click();return 1;} return 0;})()""")
    if co_nut:
        ok, nay = cho(giay)
        if ok:
            return True, 'nút Quay lại của app', nay
    c.js('history.back()')
    ok, nay = cho(giay)
    if ok:
        them = ' (sau khi nút Quay lại không đưa về)' if co_nut else ''
        return True, 'history.back()' + them, nay
    # ③ nạp thẳng URL màn cha — chắc chắn nhất, nhưng mất trạng thái lọc/phân trang nên để cuối
    if moc.get('href'):
        c.go(moc['href'])
        ok, nay = cho(giay)
        if ok:
            return True, 'nạp lại URL màn cha (mất trạng thái lọc/trang đang xem)', nay
    return False, 'không cách nào', nay


def luon_sau(c, url, so_dong=1):
    """Đi sâu từ màn cha: màn chi tiết · tab · khu vực ẩn. Trả [(nhãn, dữ liệu)] — CHỈ ĐỌC.

    `so_dong` = số dòng của bảng được bấm vào (mặc định **1** = đúng hành vi trước 09/14).
    """
    ra = []
    # ① tab của chính màn cha
    tabs = c.jsj(_JS_TABS) or []
    if tabs:
        print('   TAB   : %s' % ' · '.join(('[%s]' if t['dang_chon'] else '%s') % t['nhan']
                                           for t in tabs))
        for t in tabs:
            if t['dang_chon']:
                continue
            d = _bam_tab(c, t['nhan'])
            if d is None:
                print('        !! không bấm được tab "%s" (hoặc bị chặn vì chữ nguy hiểm)' % t['nhan'])
                continue
            ra.append(('TAB "%s"' % t['nhan'], d))
        if tabs:
            _bam_tab(c, next((t['nhan'] for t in tabs if t['dang_chon']), tabs[0]['nhan']))
    else:
        print('   TAB   : không có phần tử [role=tab] nào trên màn này')
    # ② khu vực ẩn (Mở rộng / Xem thêm)
    mr = c.jsj(_JS_MO_RONG) or []
    print('   ẨN    : %s' % (' · '.join(mr) if mr else 'không có nút Mở rộng/Xem thêm'))

    # ③ màn chi tiết — LIỆT KÊ ứng viên trước, rồi bấm đúng số dòng được phép
    uv = c.jsj(_JS_UNG_VIEN) or {}
    tong = int(uv.get('tong') or 0)
    ds = uv.get('ung_vien') or []
    if not tong:
        print('   SÂU   : màn không có bảng dữ liệu -> không có lối bấm vào bản ghi')
        return ra
    chan = [x for x in ds if x.get('chan')]
    co_ic = [x for x in ds if x.get('co_icon')]
    print('   ỨNG VIÊN: %d dòng trong bảng · %d dòng có icon xem/chi tiết · %d dòng bị CHẶN '
          '(chữ khớp danh sách cấm)' % (tong, len(co_ic), len(chan)))
    n = max(1, int(so_dong or 1))
    di = [x for x in ds if not x.get('chan')][:n]
    print('   PHẠM VI: sẽ bấm %d/%d dòng%s.%s'
          % (len(di), tong, ' (mặc định 1 — giữ nguyên hành vi cũ)' if n == 1 else '',
             '' if len(di) >= tong else
             ' ⚠️ ĐÂY KHÔNG PHẢI QUÉT VÉT CẠN — màn phụ chỉ mở được từ bản ghi ở TRẠNG THÁI '
             'KHÁC (ví dụ dòng đã duyệt / đã khoá) thì lượt này KHÔNG thấy. '
             'Tăng bằng `--sau-dong N`.'))
    if chan:
        print('        (bị chặn: %s)' % ' · '.join('dòng %d' % (x['dong'] + 1) for x in chan[:8]))

    moc = c.jsj(_JS_MOC) or {}
    for x in di:
        i = x['dong']
        r = _bam_dong(c, i)
        if (r or '').startswith('CHAN'):
            print('   SÂU   : dòng %d — CHẶN không bấm, chữ khớp danh sách cấm (%s)'
                  % (i + 1, r[5:]))
            continue
        if not (r or '').startswith('OK'):
            print('   SÂU   : dòng %d — không bấm được (%s)' % (i + 1, r or 'rỗng'))
            continue
        print('   SÂU   : dòng %d/%d — đã bấm %s' % (i + 1, tong, r[3:]))
        doi = c.wait("location.pathname+location.search!==%s?1:0"
                     % json.dumps((moc.get('pathname') or '') + (moc.get('search') or '')), 15)
        if not doi:
            print('        -> URL KHÔNG đổi. Có thể mở modal chi tiết ngay tại màn: '
                  'đọc form đang hiện (nếu có).')
            dat = c.jsj(_JS_FORM)
            if dat:
                ra.append(('MODAL chi tiết (dòng %d, không đổi URL)' % (i + 1), {'form': dat}))
                # đóng modal cho vòng sau — chỉ bấm Hủy bỏ/Đóng, không bấm gì khác
                c.js("""(()=>{const b=[...document.querySelectorAll('button')].find(b=>
                  /^\\s*(Hủy bỏ|Hủy|Đóng)\\s*$/i.test(b.innerText||''));
                  if(b){b.click();return 1;} return 0;})()""")
                time.sleep(0.8)
            continue
        sau_url = c.js('location.href')
        print('        -> sang màn phụ: %s' % sau_url)
        time.sleep(1.2)
        d = soi(c, sau_url)
        ra.append(('MÀN PHỤ %s%s' % (c.js('location.pathname'),
                                     '' if len(di) == 1 else ' (từ dòng %d)' % (i + 1)), d))
        # Luôn quay về màn cha, kể cả ở dòng cuối: ảnh chụp `03-luon-sau.png` và mọi thứ
        # chạy sau `luon_sau()` đều ngầm định đang đứng ở màn cha.
        ok, cach, nay = quay_ve_cha(c, moc)
        if ok:
            print('        <- đã quay lại màn cha bằng %s (kiểm: %s)'
                  % (cach, nay.get('pathname') or '?'))
            continue
        print('        !! KHÔNG quay lại được màn cha: đang đứng ở %s (mong đợi %s). '
              'DỪNG luồn sâu ở đây — những gì đọc tiếp sẽ KHÔNG phải của màn cha.'
              % (nay.get('href') or '?', moc.get('href') or '?'))
        ra.append(('!! LUỒN SÂU DỪNG SỚM', {'ly_do': 'không quay lại được màn cha sau dòng %d'
                                            % (i + 1), 'dang_o': nay.get('href') or '',
                                            'mong_doi': moc.get('href') or ''}))
        break
    return ra


def soi(c, url, sua=False):
    c.go(url)
    if not c.wait("document.querySelectorAll('table th').length?1:0", 45):
        print('   ⚠ không thấy bảng dữ liệu — màn có thể không phải dạng bảng, '
              'hoặc chưa tải xong')
    time.sleep(1.0)
    d = {'url': url,
         'h1': (c.js("(document.querySelector('h1')||{}).innerText||''") or '').strip(),
         'breadcrumb': c.jsj(_JS_BREADCRUMB) or [],
         'sidebar_active': c.jsj(_JS_SIDEBAR_ACTIVE) or [],
         'cot': [x for x in (c.jsj(_JS_COLS) or []) if x],
         'icon_dong': c.jsj(_JS_ROW_ICONS) or [],
         'the_so_lieu': c.jsj(_JS_THE_SO_LIEU) or [],
         'phan_trang': c.jsj(_JS_PAGING) or {}}
    # MỘT lần đọc vùng đầu màn cho CẢ nút thao tác lẫn thanh lọc — hai dải toạ độ rời nhau của
    # bản cũ vừa bỏ sót (khe giữa chúng) vừa đếm trùng (chỗ chúng chồng nhau).
    d['nut_dau_man'], d['thanh_loc'] = doc_vung_dau(c)
    d['form_them'] = _mo_form(c, 'them')
    d['form_sua'] = _mo_form(c, 'sua') if sua else None
    return d


# ══════════════════════════════════════════════════════════════════════════════
# 5. IN BÁO CÁO
# ══════════════════════════════════════════════════════════════════════════════
def sec(t):
    print('\n' + '=' * 78 + '\n%s\n' % t + '=' * 78)


def in_form(f, ten):
    if not f:
        print('    (không mở được biểu mẫu %s)' % ten)
        return
    print('    %s' % (f.get('tieu_de') or ten).strip())
    for i, x in enumerate(f.get('control') or [], 1):
        print('    %2d. %-22s %-34s %s%s' % (
            i, x['the'], x['nhan'] or '(không nhãn)',
            'BẮT BUỘC' if x['bat_buoc'] else '',
            ('  maxlength=%s' % x['maxlength']) if x['maxlength'] else ''))


def khong_phai_man(d):
    """URL chỉ render VỎ app (header + sidebar) mà không có nội dung màn nào.

    Vì sao cần: `/admin/users` render vỏ nhưng KHÔNG có `h1` lẫn bảng — route thật là
    `/admin/citizen/users`. Bản đầu in ra các mục RỖNG mà không nói gì, người đọc dễ tưởng
    "màn này không có control" thay vì "mình đưa sai URL" — đúng lớp lỗi im lặng đang phải bịt.
    """
    return not d.get('h1') and not d.get('cot') and not d.get('breadcrumb')


def in_bao_cao(d):
    if khong_phai_man(d):
        print('\n    ' + '!' * 70)
        print('    !! URL NÀY KHÔNG PHẢI ROUTE CỦA MÀN: trang chỉ render vỏ app '
              '(header + sidebar),')
        print('    !! không có tiêu đề <h1>, không có bảng, không có breadcrumb.')
        print('    !! Lấy URL ĐÚNG bằng cách bấm mục trên sidebar rồi copy thanh địa chỉ —')
        print('    !! đường dẫn thật thường KHÁC đường dẫn đoán từ tên menu')
        print('    !! (đo 2026-09-09: "Quản lý người dùng" là /admin/citizen/users,')
        print('    !!  KHÔNG phải /admin/users).')
        print('    ' + '!' * 70)
        return
    sec('① nav — ĐƯỜNG DẪN MENU (breadcrumb THẬT trên màn)')
    bc = d['breadcrumb']
    if bc:
        print('    ' + ' > '.join(bc))
        goi = [x for x in bc if norm(x) != 'trang chu']
        print('\n    -> khai vào hồ sơ màn:')
        print('       "nav": %s' % json.dumps(goi, ensure_ascii=False))
    else:
        print('    (không đọc được breadcrumb — chạy --hien để xem màn)')
    if d['sidebar_active']:
        print('\n    sidebar đang chọn: %s' % ' · '.join(d['sidebar_active']))

    sec('② LOẠI CONTROL + NHÃN UI + THỨ TỰ (đọc từ DOM đã render)')
    print('  ── thanh lọc (trái -> phải, chính là thứ tự nhóm con khối Tìm kiếm đơn lẻ, §6)')
    if not d['thanh_loc']:
        print('    (không có ô nhập/ô chọn nào giữa tiêu đề và bảng)')
    for i, x in enumerate(d['thanh_loc'], 1):
        print('    %2d. %-16s %-34s %s' % (i, x['the'], x['nhan'] or '(không nhãn)',
                                           'CHỈ CÓ ICON' if x.get('chi_icon') else ''))
    print('\n  ── biểu mẫu THÊM MỚI (trên -> dưới)')
    in_form(d['form_them'], 'THÊM MỚI')
    if d['form_sua'] is not None:
        print('\n  ── biểu mẫu CHỈNH SỬA (trên -> dưới)')
        in_form(d['form_sua'], 'CHỈNH SỬA')

    sec('③ CỘT BẢNG · ICON TRÊN BẢN GHI · NÚT ĐẦU MÀN · PHÂN TRANG')
    print('    cột bảng      : %s' % ' | '.join(d['cot']))
    ics = d['icon_dong']
    if ics:
        print('    icon bản ghi  : %s' % ' · '.join(ics[0]))
        khac = [x for x in ics[1:] if x != ics[0]]
        if khac:
            print('                    ⚠ dòng khác có bộ icon KHÁC: %s' % khac)
            print('                      -> icon bật/tắt theo trạng thái dữ liệu, phải viết đủ tổ hợp')
    print('    nút đầu màn   : %s'
          % (' · '.join(d['nut_dau_man'])
             or '(KHÔNG có nút nào giữa tiêu đề và bảng — kiểm lại bằng mắt)'))
    icon = [x['nhan'] for x in (d.get('thanh_loc') or []) if x.get('chi_icon')]
    if icon:
        print('                    nút CHỈ CÓ ICON trên thanh lọc: %s' % ' · '.join(icon))
    for t in d.get('the_so_lieu') or []:
        print('    khối nhãn     : %-32s = %-14s %s'
              % (t['nhan'][:32], t['gia_tri'][:14], t.get('mo_ta', '')[:40]))
    p = d['phan_trang']
    print('    phân trang    : số bản ghi/trang=%s · tổng số bản ghi=%s · ô "Nhập số trang": %s'
          % (p.get('so_ban_ghi_trang') or '?', p.get('tong') or '?',
             p.get('o_nhap_trang') or '?'))
    # LOẠI của ô số-bản-ghi/trang quyết định định mức 5 (Selectbox) hay 10 (Textbox) case —
    # in thẳng ra để người khai hồ sơ không phải đoán từ con số "20".
    # Cụm có thể mang HAI ô (nhập tự do + chọn nhanh) -> in CẢ HAI, vì mỗi ô là một nhóm với
    # định mức riêng. In một dòng như bản cũ là người khai hồ sơ không biết ô kia tồn tại.
    o_in = [x for x in (p.get('o_so_ban_ghi') or {}, p.get('o_chon_nhanh') or {}) if x]
    for op in o_in:
        l = loai_tu_the(op.get('the') or '', op.get('nhan') or '', op)
        muc = ' · các mức: %s' % ' / '.join(op.get('option') or []) if op.get('option') else ''
        print('                    ô số bản ghi/trang là <%s> -> khai nhóm `%s Số bản ghi '
              'trên trang`%s' % (op.get('the') or '?', l, muc))
    if not o_in and p.get('so_ban_ghi_trang'):
        print('                    ⚠ đọc được giá trị nhưng KHÔNG khoanh được ô -> '
              'soi tay xem là Selectbox (5 case) hay Textbox (10 case)')

    sec('④ ĐIỀU MÀN THẬT KHÔNG TRẢ LỜI ĐƯỢC — vẫn phải hỏi/đọc code')
    print('    · tên BẢNG DB thật · giới hạn độ dài theo BYTE · ràng buộc chỉ server biết')
    print('    · hằng số QUYỀN gác màn  -> chạy `probe_fe.py` (đọc bundle FE) cho các mục này')
    print('    · thông báo lỗi verbatim -> `probe_fe.py` mục ⑤')


# ══════════════════════════════════════════════════════════════════════════════
# 6. ĐỐI CHIẾU với hồ sơ màn (chỉ BÁO, không sửa file)
# ══════════════════════════════════════════════════════════════════════════════
# Suy loại control chuẩn từ thẻ HTML thật -> để bắt chỗ hồ sơ khai sai LOẠI.
# ⚠️ Vá 2026-09-14 (§7). Bản cũ: `if the.startswith('button') … return 'Selectbox'` — MỌI nút
# đều thành ô chọn. Nút `Tìm kiếm`/`Xóa lọc`/`Tải lại`/`Xuất excel` trên biểu mẫu vì thế bị
# mục ⑤ tố "hồ sơ khai sai loại" trong khi hồ sơ khai đúng. Đó là báo động giả ở đúng chỗ
# người đọc dùng để sửa hồ sơ ⇒ sửa theo là hỏng hồ sơ đang đúng.
# Nay xếp loại theo NHIỀU tín hiệu, ưu tiên cái chắc chắn trước, và **không đoán** khi thiếu
# căn cứ: trả `KHONG_RO` để mục ⑤ ghi "cần xem tay" thay vì khẳng định sai.
KHONG_RO = 'Không rõ loại'

# Chữ trên nút cho biết đó là HÀNH ĐỘNG, không phải ô nhập liệu. Chỉ dùng khi nút KHÔNG mang
# dấu hiệu ARIA của ô chọn (ARIA thắng — ô chọn có thể mang nhãn "Chọn trạng thái").
# Danh sách DỜI sang `qalib` 2026-09-14: luật cứng ① (`qalib.soi_luat_cung_live`) cần đúng nó,
# giữ hai bản sao thì sửa một bên là lệch luật.
_NUT_HANH_DONG = qalib.NUT_HANH_DONG


# Định nghĩa "cái này là ô chọn" dời sang `qalib` 2026-09-14 — luật cứng ① cần đúng nó.
_la_o_chon = qalib.la_o_chon_aria


def loai_tu_the(the, nhan='', x=None):
    """`the` (+ nhãn + tín hiệu ARIA `x`) -> tên loại control theo từ điển của luật.

    `x` là cả dict phần tử do `_JS_FORM`/`_JS_VUNG_DAU` trả về. Bỏ trống thì vẫn chạy như
    trước với hai thứ cũ (thẻ + nhãn) — chữ ký cũ `loai_tu_the(the, nhan)` không gãy.
    """
    n = norm(nhan)
    the = the or ''
    if the.startswith('input[checkbox]'):
        return 'Checkbox'
    if the.startswith('input[radio]'):
        return 'Nút chọn'
    if the.startswith('textarea'):
        return 'Textarea'
    if the.startswith('select'):                     # <select> gốc — chắc chắn nhất
        return 'Selectbox'
    if the.startswith('input[date') or the.startswith('input[month'):
        return 'Datepicker'
    if the.startswith('input[file]'):
        return 'Upload file'
    if the.startswith('input[password]'):
        return 'Textbox'
    if _la_o_chon(x):                                # combobox dựng tay, có ARIA -> chắc
        return 'Selectbox'
    if the.startswith('[role=combobox]'):
        return 'Selectbox'
    if the.startswith('button'):
        if qalib.la_nut_hanh_dong(n):
            return 'Button'
        # Nút NẰM TRONG biểu mẫu và có <label> gắn kèm thì gần như chắc là ô chọn dựng tay
        # (khuôn `<label>Trạng thái</label><button>-- Chọn --</button>`); không có nhãn thì
        # đây là nút hành động của màn -> KHÔNG suy bừa thành Selectbox nữa.
        if isinstance(x, dict) and (x.get('nhan_label') or '').strip():
            return 'Selectbox'
        return KHONG_RO
    if the.startswith('input'):
        return 'Textbox số' if any(k in n for k in ('thu tu', 'so luong', 'gia', 'phi')) else 'Textbox'
    return the


def doi_chieu(d, spec):
    lech = []
    # ── nav
    khai = spec.get('nav') or []
    if isinstance(khai, str):
        khai = [x.strip() for x in khai.split('>') if x.strip()]
    that = [x for x in d['breadcrumb'] if norm(x) != 'trang chu']
    print('    nav hồ sơ  : %s' % (' > '.join(khai) or '(chưa khai)'))
    print('    nav màn    : %s' % (' > '.join(that) or '(không đọc được)'))
    if that and khai and [norm(x) for x in khai] != [norm(x) for x in that]:
        thieu = [x for x in that if norm(x) not in [norm(y) for y in khai]]
        thua = [x for x in khai if norm(x) not in [norm(y) for y in that]]
        lech.append(('nav', 'hồ sơ %s breadcrumb: %s' % (
            'THIẾU' if thieu else 'THỪA so với',
            ' · '.join(thieu or thua) or 'khác thứ tự')))
    elif that and not khai:
        lech.append(('nav', 'hồ sơ CHƯA KHAI nav — dòng CN sẽ thiếu khối bước (§4.1)'))

    # ── loại control của biểu mẫu THÊM MỚI
    f = d.get('form_them') or {}
    # Bên KHAI (`khai_c` dưới) bỏ MỌI nhóm `Button …`; bên MÀN THẬT phải bỏ đối xứng, không
    # thì nút nào không nằm trong danh sách chép tay cũng thành "màn CÓ mà hồ sơ KHÔNG khai"
    # vĩnh viễn. Đã dính đúng nút `Lưu` — nút submit phổ biến nhất của mọi biểu mẫu (đo
    # 2026-09-14). Nay hỏi chính `loai_tu_the`: xếp ra `Button` thì đây là nút, không phải ô.
    live = [x for x in (f.get('control') or [])
            if not (x['the'].startswith('button')
                    and (not norm(x['nhan'])
                         or loai_tu_the(x['the'], x['nhan'], x) == 'Button'))]
    cn_them = None
    for cn in spec.get('cn') or []:
        if 'them' in norm(cn.get('ten', '')):
            cn_them = cn
            break
    if cn_them and live:
        khai_c = [c for c in (cn_them.get('controls') or []) if not norm(c).startswith('button')]
        print('\n    biểu mẫu THÊM MỚI — %d control trên màn · %d nhóm khai trong hồ sơ'
              % (len(live), len(khai_c)))
        # Ghép cặp theo NHÃN đã cắt tiền tố loại control (`qalib.field_of`), khớp CHÍNH XÁC
        # trước rồi mới tới chuỗi con. Khớp chuỗi con bừa là báo nhầm: nhãn "Ngoại ngữ" nằm
        # trong tên nhóm "Textbox Mã trình độ ngoại ngữ" nên combobox bị ghép vào ô Mã.
        nhan_khai = {c: norm(qalib.field_of(c)) for c in khai_c}

        def ghep(nhan):
            n = norm(nhan)
            if not n:
                return None
            for c, f in nhan_khai.items():
                if f == n:
                    return c
            gan = [c for c, f in nhan_khai.items() if f and (f in n or n in f)]
            return gan[0] if len(gan) == 1 else None

        da_ghep = set()
        for x in live:
            loai = loai_tu_the(x['the'], x['nhan'], x)
            c = ghep(x['nhan'])
            if not c:
                lech.append(('control', 'màn CÓ "%s %s" mà hồ sơ KHÔNG khai'
                             % (loai, x['nhan'])))
                continue
            da_ghep.add(c)
            if loai == KHONG_RO:
                # §7 yêu cầu 5: thiếu căn cứ thì KHÔNG kết luận. Vẫn nêu ra để người soi kiểm
                # bằng mắt, nhưng gắn nhãn khác hẳn để không ai sửa hồ sơ theo một lời đoán.
                lech.append(('cần xem tay', 'hồ sơ khai "%s" · màn thật là <%s> không đủ dấu '
                             'hiệu để xếp loại (không phải <select>, không có role/aria-haspopup '
                             'của ô chọn) — mở màn xem tay rồi tự quyết' % (c, x['the'])))
            elif norm(loai).split()[0] not in norm(c):
                lech.append(('loại control', 'hồ sơ khai "%s" · màn thật là %s (%s)'
                             % (c, loai, x['the'])))
        for c in khai_c:
            if c not in da_ghep:
                lech.append(('control', 'hồ sơ khai "%s" mà KHÔNG thấy trên biểu mẫu' % c))

    # ── CỤM PHÂN TRANG vs control khai ở hồ sơ màn  (vá 2026-09-10)
    # `_JS_PAGING` đọc được ĐỦ BA dữ kiện của cụm từ 09/10, nhưng `doi_chieu()` chỉ đối chiếu
    # biểu mẫu THÊM MỚI và icon trên dòng ⇒ ba dữ kiện đó chỉ được IN RA. Hậu quả: màn CÓ ô
    # `Nhập số trang` mà hồ sơ không khai nhóm `Textbox Nhập số trang` thì mất trọn 7 case, và
    # màn có cụm phân trang mà không khai control số-bản-ghi/trang thì mất 5–10 case — cả hai
    # đều không phép rà nào kêu (nhóm THIẾU HẲN là điểm mù §1 của luật định mức).
    p = d.get('phan_trang') or {}
    khai_tat_ca = [c for cn in (spec.get('cn') or []) for c in (cn.get('controls') or [])]
    nn = [norm(c) for c in khai_tat_ca]
    if norm(p.get('o_nhap_trang') or '').startswith('co') \
            and not any('nhap so trang' in x for x in nn):
        lech.append(('phân trang', 'màn CÓ ô "Nhập số trang" mà hồ sơ KHÔNG khai nhóm '
                                   '`Textbox Nhập số trang` (7 case)'))
    if (p.get('so_ban_ghi_trang') or p.get('muc_chon_nhanh')) \
            and not any('so ban ghi tren trang' in x or 'so dong moi trang' in x for x in nn):
        lech.append(('phân trang', 'màn CÓ cụm số bản ghi/trang (đang là "%s", mức chọn nhanh '
                                   '%s) mà hồ sơ KHÔNG khai nhóm nào cho nó (5 hoặc 10 case)'
                     % (p.get('so_ban_ghi_trang') or '?', p.get('muc_chon_nhanh') or '?')))

    # ── LOẠI của ô số-bản-ghi/trang  (vá 2026-09-14)
    # Phép trên chỉ hỏi "có nhóm nào cho cụm này không". Khai ĐÚNG cụm nhưng SAI LOẠI thì nó
    # im, `soi_cum_phan_trang` cũng im (`NHOM_PERPAGE` nhận cả hai loại), và
    # `audit_validate_quota` đếm theo định mức của loại ĐÃ KHAI nên vẫn đủ. Hậu quả thật đã
    # gặp: màn dùng `<input type=text>` nhập tự do bị khai `Selectbox Số bản ghi trên trang`
    # ⇒ mất trọn bộ validate ô nhập (ký tự khác số · số âm · số 0 · vượt 1000 · số lẻ…) và
    # định mức tụt 10 -> 5 case mà 13/13 bộ rà ra 0.
    # ⚠️ Vá 2026-09-16 — cụm này có thể mang HAI control (ô nhập tự do + ô chọn nhanh), và bộ
    # case mẫu hoá chúng thành HAI nhóm định mức khác nhau. Bản cũ chỉ cầm `o_so_ban_ghi` rồi
    # đem so với MỌI nhóm khai cho cụm ⇒ màn có đủ cả hai, hồ sơ khai đúng cả hai, mà nhóm
    # `Selectbox …` vẫn bị tố "khai sai loại" (dựng lại được trên `app_gia.py?cum=2`). Nay ghép
    # theo LOẠI: nhóm nào khai trúng một ô CÓ THẬT trong cụm thì thôi.
    o_that = [x for x in (p.get('o_so_ban_ghi') or {}, p.get('o_chon_nhanh') or {}) if x]
    if o_that:
        loai_that = [(x, loai_tu_the(x.get('the') or '', x.get('nhan') or '', x))
                     for x in o_that]
        co = [(norm(l).split() or [''])[0] for _, l in loai_that if l != KHONG_RO]
        khai_pp = [x for x in khai_tat_ca if qalib.la_nhom_perpage(x)]
        ta_the = ' + '.join('<%s>' % (x.get('the') or '?') for x, _ in loai_that)
        for c in khai_pp:
            if any(k and k in norm(c) for k in co):
                continue
            if not co:
                lech.append(('cần xem tay', 'hồ sơ khai "%s" · ô số bản ghi/trang trên màn là '
                                            '%s, không đủ dấu hiệu để xếp loại — mở màn xem '
                                            'tay rồi tự quyết' % (c, ta_the)))
            else:
                lech.append(('loại control', 'hồ sơ khai "%s" · cụm số bản ghi/trang trên màn '
                                             'thật chỉ có %s (%s) — ĐỊNH MỨC KHÁC HẲN '
                                             '(Selectbox 5 case · Textbox 10 case)'
                             % (c, ' + '.join(l for _, l in loai_that), ta_the)))
        # Chiều NGƯỢC — chính là chỗ mất case trong im lặng: cụm CÓ một ô mà hồ sơ không khai
        # nhóm nào cho nó. Nhóm THIẾU HẲN là điểm mù §1 của luật định mức, không bộ rà nào kêu.
        for x, l in loai_that:
            if l == KHONG_RO:
                continue
            k = (norm(l).split() or [''])[0]
            if any(k and k in norm(c) for c in khai_pp):
                continue
            ten = '%s Số bản ghi trên trang' % l
            lech.append(('phân trang', 'cụm số bản ghi/trang CÓ một ô <%s> xếp loại %s mà hồ sơ '
                                       'KHÔNG khai nhóm nào cho nó — thiếu hẳn `%s` (%d case)'
                         % (x.get('the') or '?', l, ten, qalib.kind_of(ten)[1] or 0)))

    # ── NÚT TẢI LẠI  (vá 2026-09-14, theo lời báo "thỉnh thoảng nút tải lại không được phát hiện")
    # Nút này thường CHỈ CÓ ICON nên hai bộ đọc cũ bỏ sót nó trong im lặng; nay đọc được rồi thì
    # phải ĐỐI CHIẾU, không chỉ in ra — nhóm THIẾU HẲN là điểm mù §1 của luật định mức.
    ten_that = list(d.get('nut_dau_man') or []) \
        + [x.get('nhan') or '' for x in (d.get('thanh_loc') or [])]
    co_tai_lai = [t for t in ten_that if qalib.la_nut_tai_lai(t)]
    khai_tai_lai = [c for c in khai_tat_ca if qalib.la_nut_tai_lai(qalib.field_of(c))]
    if co_tai_lai and not khai_tai_lai:
        lech.append(('nút Tải lại', 'màn CÓ nút "%s" mà hồ sơ KHÔNG khai nhóm nào cho nó '
                                    '(`Button Tải lại` + `Chức năng Tải lại`)'
                     % co_tai_lai[0]))
    elif khai_tai_lai and not co_tai_lai:
        lech.append(('nút Tải lại', 'hồ sơ khai "%s" mà KHÔNG thấy nút nào như vậy giữa tiêu '
                                    'đề và bảng — kiểm bằng mắt trước khi bỏ nhóm'
                     % khai_tai_lai[0]))

    # ── icon trên bản ghi vs control khai ở CN Danh sách
    ics = (d['icon_dong'] or [[]])[0]
    if ics and any('xoa' in norm(i) for cn in (spec.get('cn') or [])
                   for i in (cn.get('controls') or [])):
        if not any('xoa' in norm(i) for i in ics):
            lech.append(('icon', 'hồ sơ có nhóm nhắc "xóa" mà icon trên bản ghi chỉ có: %s'
                         % ' · '.join(ics)))
    return lech


# ══════════════════════════════════════════════════════════════════════════════
# 7. MỘT LƯỢT SOI — thân việc dùng chung cho đường CŨ và cho PHIÊN làm việc
# ══════════════════════════════════════════════════════════════════════════════
# Toàn bộ phần soi màn ở trên KHÔNG đổi. Phần dưới chỉ bọc thêm: chỗ đặt file, vòng đời,
# ảnh chụp, và khả năng chạy nhiều phiên. `sid=None` ⇒ đúng hành vi bản cũ: cổng 9333, profile
# dùng chung, KHÔNG ghi một file nào (giữ cam kết "chỉ đọc + chỉ in" ở đầu file).
PHAN_HE_MAC_DINH = 'Phân hệ Cơ Sở Dữ Liệu'
TIMEOUT_MAC_DINH = int(os.environ.get('QA_SESSION_TIMEOUT', '900'))


class Viec:
    """Tham số của MỘT lượt soi."""

    def __init__(self, url=None, sid=None, role='', user=None, pw=None,
                 phan_he=PHAN_HE_MAC_DINH, spec=None, sua=False, sau=False, hien=False,
                 home=None, login=None, timeout=TIMEOUT_MAC_DINH, goc=None,
                 resume=False, moi=False, echo=True, dong_y=False, sau_dong=1):
        self.url, self.sid, self.role = url, sid, role or ''
        self.user, self.pw = user, pw
        self.phan_he, self.spec = phan_he, spec
        self.sua, self.sau, self.hien = sua, sau, hien
        self.sau_dong = max(1, int(sau_dong or 1))      # số DÒNG bảng được bấm khi `--sau`
        self.home, self.login = home, login
        self.timeout = int(timeout or 0)
        self.goc, self.resume, self.moi = goc, resume, moi
        self.echo, self.dong_y = echo, dong_y
        # Đường dẫn ảnh chụp màn dùng làm `Evidence:` của mục ⑦ LUẬT CỨNG. Chỉ có khi chạy
        # kèm `--session` (đường cũ KHÔNG ghi file nào — giữ cam kết "chỉ đọc + chỉ in").
        self.anh_luat_cung = None

    @classmethod
    def tu_json(cls, x, a):
        """Một mục của `sessions.json`. Cờ trên dòng lệnh là MẶC ĐỊNH, khai trong file thì ĐÈ."""
        lay = lambda k, mac: x[k] if k in x else mac          # noqa: E731
        user = x.get('user') or (os.environ.get(x['user_env']) if x.get('user_env') else None)
        pw = os.environ.get(x['pass_env']) if x.get('pass_env') else None
        return cls(url=x.get('url') or a.url, sid=x['session_id'], role=x.get('role') or a.role,
                   user=user or a.user, pw=pw or a.pw,
                   phan_he=lay('phan_he', a.phan_he), spec=lay('spec', a.spec),
                   sua=bool(lay('sua', a.sua)), sau=bool(lay('sau', a.sau)),
                   hien=bool(lay('hien', a.hien)),
                   home=x.get('home_prefix') or a.home_prefix,
                   login=x.get('login_path') or a.login_path,
                   timeout=lay('timeout', a.timeout), goc=a.session_dir,
                   sau_dong=lay('sau_dong', a.sau_dong),
                   resume=a.resume, moi=a.new, dong_y=a.yes)

    @classmethod
    def tu_phien(cls, sid, a):
        """Phiên đã có thì lấy URL/role/hồ sơ màn từ `config.json` của chính nó."""
        ss = sm.Session(sid, a.session_dir)
        cfg = ss.nap().cfg if ss.co else {}
        url = a.url or cfg.get('url')
        if not url:
            die('phiên %r chưa có URL — truyền <url> ở dòng lệnh, hoặc tạo phiên bằng '
                '`probe_live.py <url> --session %s --new`' % (sid, sid))
        return cls(url=url, sid=sid, role=a.role or cfg.get('role') or '',
                   user=a.user or cfg.get('user'), pw=a.pw,
                   phan_he=a.phan_he, spec=a.spec or cfg.get('spec'),
                   sua=a.sua or bool(cfg.get('sua')), sau=a.sau or bool(cfg.get('sau')),
                   hien=a.hien, home=a.home_prefix or cfg.get('home_prefix'),
                   login=a.login_path or cfg.get('login_path'),
                   timeout=a.timeout, goc=a.session_dir,
                   sau_dong=max(a.sau_dong, int(cfg.get('sau_dong') or 1)),
                   resume=a.resume, moi=a.new, dong_y=a.yes)


def tim_tai_khoan(role='', user=None, pw=None):
    """`tai_khoan.TaiKhoan` của một vai trò, hoặc `None`. KHÔNG `die()`, KHÔNG hỏi.

    Mọi việc tìm kiếm nằm ở `tools/tai_khoan.py` — một chỗ duy nhất biết khuôn tên biến,
    tệp env ngoài repo và lệnh lấy bí mật. Ở đây chỉ gọi lại.
    """
    import tai_khoan as _tk
    return _tk.tim(role, user, pw)


def tai_khoan(role='', user=None, pw=None):
    """(user, pass) của một vai trò. `die()` nếu không có — dùng cho ĐƯỜNG CLI.

    ⚠️ Vá 2026-09-17. Bản trước chốt cứng khuôn `QA_USER_<ROLE>`/`QA_PASS_<ROLE>` và coi
    *"phải có tài khoản QA"* là điều kiện. Người vận hành thực tế **không có tài khoản QA
    nào** — chỉ có tài khoản THẬT trên môi trường TEST/UAT, đặt tên theo quy ước của họ.
    Nay khuôn tên là CẤU HÌNH (`tai_khoan.khoa_ung_vien`), và lớp chạy case dùng
    `tim_tai_khoan()` để không bao giờ phải `die()` giữa lượt.
    """
    import tai_khoan as _tk
    tk = _tk.tim(role, user, pw)
    if not tk:
        die(_tk.thieu(role) + '\n   (hoặc truyền --user/--pass; không hardcode mật khẩu '
                              'vào script hay tài liệu)')
    return tk.user, tk.pw


def in_luat_cung(d, anh=None, ten_man=''):
    """Mục ⑦ — đối chiếu màn thật với LUẬT CỨNG UI. Trả số vi phạm.

    Luật ở `qalib` mục *0a. LUẬT CỨNG UI*; ở đây chỉ ĐỌC và IN. Ba điều script KHÔNG làm, theo
    đúng chỉ thị 2026-09-12: không sửa dữ liệu, không đụng UI, và **không bỏ qua chỉ vì code
    đang cấu hình khác** — cấu hình khác chính là nội dung của vi phạm.
    """
    vp = qalib.soi_luat_cung_live(d)
    sec('⑦ LUẬT CỨNG UI — ô chọn mặc định + số bản ghi trên trang')
    if not vp:
        print('    ✓ màn thật đúng cả hai luật cứng (ô chọn không chọn sẵn giá trị nghiệp vụ; '
              'số bản ghi/trang = %d)' % qalib.PAGE_SIZE_MAC_DINH)
        return 0
    bc = anh or ('(chạy có --session để tự lưu ảnh chụp làm bằng chứng)')
    for control, expected, actual in vp:
        print()
        for dong in qalib.bao_luat_cung('%s%s' % (ten_man and ten_man + ' › ', control),
                                        expected, actual, bc).split('\n'):
            print('    ' + dong if dong else '')
    print('\n=== %d VI PHẠM LUẬT CỨNG ===' % len(vp))
    print('Ghi nhận thành issue. KHÔNG tự sửa dữ liệu, KHÔNG đụng UI, và KHÔNG bỏ qua vì code')
    print('   đang cấu hình khác. BA/SRS đòi khác thì báo %s để QA/BA quyết.'
          % qalib.CO_XUNG_DOT)
    return len(vp)


def in_het(v, d, sau):
    """In báo cáo + (tuỳ chọn) mục ⑥ luồn sâu + mục ⑤ đối chiếu hồ sơ màn. Trả danh sách lệch."""
    in_bao_cao(d)
    if v.sau:
        sec('⑥ LUỒN SÂU — màn phụ / tab / khu vực ẩn đọc được')
        if not sau:
            print('    (không đi sâu được chỗ nào — xem dòng LUỒN SÂU ở trên để biết vì sao)')
        for nhan, dat in sau:
            print('\n  ▸ %s' % nhan)
            if 'form' in dat:
                in_form(dat['form'], 'khối chi tiết')
                continue
            # ⚠️ Vá 2026-09-10: chỗ này đọc khoá `tieu_de` trong khi `soi()` trả khoá `h1`
            # ⇒ TIÊU ĐỀ màn phụ KHÔNG BAO GIỜ được in, im lặng. Cùng lớp lỗi `a.url`/`url` đã
            # dính 2 lần (probe_fe kiểm chéo backRoute · probe_live main). Và mục ⑥ trước đó
            # chỉ in cột bảng + thanh lọc: màn chi tiết có breadcrumb · nút quay lại ·
            # 4 thẻ số liệu · icon trên bản ghi · phân trang thì mất sạch.
            if dat.get('h1'):
                print('    tiêu đề  : %s' % dat['h1'])
            if dat.get('breadcrumb'):
                print('    đường dẫn: %s' % ' > '.join(dat['breadcrumb']))
            if dat.get('the_so_lieu'):
                print('    khối nhãn IN HOA (ứng viên nhóm `Thẻ số liệu …` / '
                      '`Hiển thị chi tiết …`):')
                for t in dat['the_so_lieu']:
                    print('      · %-34s = %-14s %s'
                          % (t['nhan'][:34], t['gia_tri'][:14], t.get('mo_ta', '')[:44]))
            if dat.get('cot'):
                print('    cột bảng : %s' % ' · '.join(dat['cot']))
            if dat.get('icon_dong'):
                ic = sorted({x for row in dat['icon_dong'] for x in row if x})
                if ic:
                    print('    icon bản ghi: %s' % ' · '.join(ic))
            if dat.get('nut_dau_man'):
                print('    nút      : %s' % ' · '.join(dat['nut_dau_man']))
            if dat.get('thanh_loc'):
                print('    thanh lọc: %s' % ' · '.join(str(x) for x in dat['thanh_loc'])[:150])
            if dat.get('phan_trang'):
                pt = dat['phan_trang']
                print('    phân trang: số bản ghi/trang=%s · tổng=%s · ô "Nhập số trang": %s'
                      % (pt.get('so_ban_ghi_trang') or '?', pt.get('tong') or '?',
                         pt.get('o_nhap_trang') or '?'))
        print('\n    ⇒ Khai từng màn phụ vào hồ sơ màn ở khoá "man_phu" (route · ten · vao_tu · cn)')
        print('      rồi `audit_man_phu.py` mới chặn được lỗi thiếu hẳn màn.')

    if not khong_phai_man(d):
        in_luat_cung(d, getattr(v, 'anh_luat_cung', None), d.get('h1') or '')

    lech = []
    if v.spec and khong_phai_man(d):
        print('\n(bỏ qua ĐỐI CHIẾU: chưa soi được màn nào — xem cảnh báo URL ở trên)')
    elif v.spec:
        sec('⑤ ĐỐI CHIẾU HỒ SƠ MÀN  (chỉ BÁO — script KHÔNG sửa file)')
        try:
            spec = json.load(open(v.spec, encoding='utf-8'))
        except Exception as e:
            die('không đọc được %s: %s' % (v.spec, e))
        lech = doi_chieu(d, spec)
        print()
        if not lech:
            print('    ✓ không thấy chỗ lệch nào giữa hồ sơ màn và màn thật')
        else:
            for loai, msg in lech:
                print('    !! [%-12s] %s' % (loai, msg))
        print('\n=== %d chỗ LỆCH ===' % len(lech))
        print('Đây là GỢI Ý, không phải căn cứ tự động: xác nhận bằng mắt trên app trước khi sửa '
              'hồ sơ màn (cùng lối `audit_control_that.py`).')
    else:
        print('\n(thêm --spec <màn>.json để ĐỐI CHIẾU với hồ sơ màn đã khai)')
    return lech


def _cat_phien(c, ss):
    """Cất cookie + localStorage/sessionStorage của phiên — BẰNG CHỨNG hai phiên không dùng chung.

    Đây là bản TRÍCH để đọc bằng mắt; kho thật là `chrome-profile/` của riêng phiên.
    ⚠️ File này chứa token đăng nhập ⇒ đã cho `sessions/` vào `.gitignore`, đừng đẩy lên git.
    """
    ck = c.cookies()
    sm.khoa_thu_muc(ss.d_cookie)          # 0700 — §6, thư mục này giữ token đăng nhập
    # `mat=True`: file được TẠO ở 0600, không có một nhịp nào nằm trên đĩa ở 0644.
    sm.ghi_json(os.path.join(ss.d_cookie, 'cookies.json'),
                {'luc': time.strftime('%Y-%m-%d %H:%M:%S'), 'so_cookie': len(ck), 'cookies': ck},
                mat=True)
    sm.ghi_json(os.path.join(ss.d_cookie, 'storage.json'), c.storage(), mat=True)
    return ck


def _cat_kq(ss, v, d, sau):
    """Ghi `result/probe.json` NGAY sau mỗi bước — tiến trình chết giữa chừng vẫn resume được."""
    sm.ghi_json(os.path.join(ss.d_kq, 'probe.json'),
                {'luc': time.strftime('%Y-%m-%d %H:%M:%S'), 'session_id': ss.sid,
                 'url': v.url, 'role': v.role, 'man': d, 'sau': sau})


def _mo_chrome(v, ss):
    """Mở Chrome cho lượt này — hoặc ĐÍNH KÈM vào Chrome mà lượt `--hien` trước còn giữ.

    §1 — chỗ hở của bản trước. `--hien` giữ cửa sổ Chrome lại sau khi chạy xong, nhưng khoá
    phiên thì `finally` **thả ra**; lượt `--resume` kế tiếp lấy được khoá và mở Chrome THỨ HAI
    trên cùng `chrome-profile/`. Chrome không cho hai tiến trình dùng chung một `user-data-dir`:
    cái thứ hai thấy `SingletonLock`, bàn giao rồi TỰ THOÁT, nên lượt mới ngồi chờ một cổng CDP
    không bao giờ mở và chết bằng câu "không bật được Chrome" — không ai lần ra cửa sổ cũ.

    Nay `state.json` ghi đủ `cong`/`pid`/`pgid`/`chrome_giu`, và trước khi mở phải hỏi
    `browser_manager.chrome_con_giu()`:
      · `song` -> ĐÍNH KÈM, dùng lại đúng cửa sổ đó (giữ trọn ý nghĩa của `--hien`);
      · `treo` -> DỪNG kèm hướng dẫn — thà không chạy còn hơn giết cửa sổ người ta cố ý giữ,
                  và tuyệt đối không mở cái thứ hai;
      · rỗng -> đã chết hẳn, mở mới bình thường.
    """
    if not ss:
        return Chrome(hien=v.hien, port=None, profile=None, diet_cu=True)
    giu = bool(ss.st.get('chrome_giu'))
    cong, pid = ss.st.get('cong'), ss.st.get('pid')
    tinh = bm.chrome_con_giu(cong, pid, ss.profile) if (giu or pid) else ''
    if tinh == 'song':
        # Câu chữ phải đúng CẢ HAI ca: cửa sổ do `--hien` cố ý giữ lại, và Chrome MỒ CÔI của
        # một lượt bị `kill -9` giữa chừng (lớp B gặp ca này khi `--resume` — đo 2026-09-15).
        # Nói mỗi `--hien` thì người chạy lượt resume đọc xong không hiểu cửa sổ ở đâu ra.
        print('CHROME: dùng lại cửa sổ Chrome lượt trước còn mở (CDP cổng %s, PID %s) — '
              'KHÔNG mở Chrome thứ hai trên cùng chrome-profile/' % (cong, pid))
        return Chrome(hien=True, profile=ss.profile, dinh_kem=cong)
    if tinh == 'treo':
        die('phiên %r còn một Chrome ĐANG SỐNG trên chrome-profile/ (PID %s, cổng CDP %s) '
            'nhưng CDP không trả lời.\n'
            '   Hai Chrome cùng một `user-data-dir` là hỏng chắc ⇒ KHÔNG mở cái thứ hai.\n'
            '   Đóng cửa sổ đó (nó do lượt `--hien` trước giữ lại), hoặc `kill %s`, rồi chạy lại.'
            % (ss.sid, pid or '?', cong or '?', pid or '<pid>'))
    return Chrome(hien=v.hien,
                  port='auto',                       # phiên: Chrome TỰ chọn cổng (§2)
                  profile=ss.profile,                # phiên: cookie RIÊNG
                  diet_cu=False,                     # đường cũ mới `pkill` theo cổng
                  pgid_cu=ss.st.get('pgid'),         # dọn xác Chrome của lượt trước …
                  pid_cu=pid)                        # … nhưng chỉ khi CHỨNG MINH được là của nó


def _ghi_chrome(ss, c, giu):
    """Ghi dấu vết Chrome vào `state.json` — `giu=True` nghĩa là lượt sau phải đính kèm nó.

    Cổng/PID/PGID được GIỮ LẠI cả khi đã đóng: đó là hồ sơ "Chrome gần nhất của phiên này",
    dùng để (a) chứng minh hai phiên không dùng chung cổng, (b) dọn đúng cây tiến trình nếu
    lượt này bị `kill -9` trước khi kịp đóng. Xoá trắng như bản đầu là tự bịt mắt mình.
    `chrome_giu` mới là cờ quyết định lượt sau có đính kèm hay không; PID chết thì
    `chrome_con_giu()` tự thấy và mở mới.

    Lượt ĐÍNH KÈM (`c.p is None` — Chrome do lượt trước mở) thì GIỮ NGUYÊN pid/pgid đang có:
    ghi đè bằng `None` là vứt mất manh mối duy nhất để dọn đúng cây tiến trình đó về sau.
    """
    if not ss:
        return
    ss.st['cong'] = c.port
    if c.p is not None:                   # chính lượt này mở -> số liệu mới là số liệu đúng
        ss.st['pid'] = c.p.pid
        ss.st['pgid'] = c.pgid
    ss.st['chrome_giu'] = bool(giu)
    sm.ghi_json(ss.f_state, ss.st)


def _soi_bang_chrome(v, ss, user, pw, d=None, sau=None):
    """Mở Chrome -> đăng nhập -> soi (-> luồn sâu). Trả `(d, sau)`. Luôn dọn Chrome khi ra."""
    sau = list(sau or [])
    c = _mo_chrome(v, ss)
    # Ghi NGAY khi vừa mở: tiến trình bị `kill -9` giữa chừng thì lượt sau vẫn còn manh mối
    # để dọn đúng cây tiến trình này (và chỉ cây này).
    _ghi_chrome(ss, c, giu=v.hien)
    print('CHROME: %s  (CDP cổng %d, %s)'
          % (c.ver.get('Browser'), c.port, 'cửa sổ thật' if v.hien else 'headless'))
    print('⚠ CHỈ ĐỌC: script chỉ bấm thẻ phân hệ · Đăng nhập · Thêm mới/Chỉnh sửa (để MỞ) · Hủy bỏ.')
    # Hết giờ thì GIẾT Chrome của RIÊNG phiên này: lệnh CDP đang chờ bung lỗi -> phiên FAILED,
    # phiên khác không hề hấn. Không có cách nào ngắt một luồng Python đang chờ socket ngoài
    # việc đóng cái nó đang chờ.
    canh = None
    if v.timeout > 0:
        canh = threading.Timer(v.timeout, c.kill, kwargs={'het_gio': True})
        canh.daemon = True
        canh.start()
    try:
        print('\nĐĂNG NHẬP')
        if ss:
            ss.pha('đăng nhập')
            ss.dat(sm.LOGIN)
        print('   -> %s' % dang_nhap(c, v.url, user, pw, v.phan_he, v.home, v.login))
        if ss:
            c.shot(os.path.join(ss.d_shot, '01-sau-dang-nhap.png'))
            ck = _cat_phien(c, ss)
            print('   -> cất %d cookie + storage vào %s' % (len(ck), ss.d_cookie))
            ss.xong_buoc('login')
            ss.dat(sm.READY)
            ss.dat(sm.RUNNING)
        if d is None:
            if ss:
                ss.pha('soi màn')
            d = soi(c, v.url, sua=v.sua)
            if ss:
                # Ảnh này là BẰNG CHỨNG của mục ⑦ (luật cứng): chụp ngay sau khi soi, trước
                # mọi thao tác mở biểu mẫu, nên đúng trạng thái "vừa mở màn lần đầu".
                anh = os.path.join(ss.d_shot, '02-man.png')
                c.shot(anh)
                v.anh_luat_cung = anh
                ss.xong_buoc('soi')
                _cat_kq(ss, v, d, sau)
        if v.sau and not (ss and ss.da_xong('sau')):
            if ss:
                ss.pha('luồn sâu')
            print('\nLUỒN SÂU  (chỉ bấm: dòng/icon xem chi tiết · [role=tab] · Mở rộng/Xem thêm)')
            try:
                sau = luon_sau(c, v.url, so_dong=getattr(v, 'sau_dong', 1))
                if ss:
                    c.shot(os.path.join(ss.d_shot, '03-luon-sau.png'))
                    ss.xong_buoc('sau')
                    _cat_kq(ss, v, d, sau)
            except Exception as e:
                # Hết giờ thì KHÔNG được nuốt: watchdog giết Chrome làm `luon_sau` bung
                # EOFError, nuốt ở đây là phiên quá giờ vẫn báo COMPLETED (sai sự thật).
                if c.het_gio:
                    raise
                print('   !! dừng giữa đường: %s: %s — phần trên vẫn dùng được'
                      % (type(e).__name__, e))
    except BaseException:
        if ss:
            c.shot(os.path.join(ss.d_shot, '99-loi.png'))
        if c.het_gio:
            raise TimeoutError('quá %d giây (đổi bằng --timeout / QA_SESSION_TIMEOUT)' % v.timeout)
        raise
    finally:
        if canh:
            canh.cancel()
        if not v.hien:
            c.close()
            _ghi_chrome(ss, c, giu=False)     # đã đóng -> lượt sau mở mới, nhưng GIỮ số liệu
        else:
            _ghi_chrome(ss, c, giu=True)      # cửa sổ vẫn mở -> lượt sau phải đính kèm nó
            print('   (--hien: giữ nguyên cửa sổ Chrome cổng %d%s — nhớ đóng tay. Lượt sau '
                  'trên cùng phiên sẽ ĐÍNH KÈM vào chính cửa sổ này, không mở cái thứ hai.)'
                  % (c.port, (', PID %d' % c.p.pid) if c.p else ''))
    return d, sau


def _lam(v, ss=None):
    """Một lượt soi trọn vẹn. `ss=None` = đường chạy CŨ (không ghi file nào)."""
    user, pw = tai_khoan(v.role, v.user, v.pw)
    print('MÀN   : %s' % v.url)
    if v.role:
        print('ROLE  : %s   (tài khoản %s)' % (v.role, user))
    d, sau, con_viec = None, [], True
    # ── RESUME: dùng lại bước đã xong của lượt trước thay vì soi lại từ đầu
    if ss and v.resume and ss.da_xong('soi'):
        cu = sm.doc_json(os.path.join(ss.d_kq, 'probe.json')) or {}
        if cu.get('man'):
            d, sau = cu['man'], cu.get('sau') or []
            print('RESUME: dùng lại kết quả soi màn của lượt trước (ghi lúc %s) — không soi lại'
                  % (cu.get('luc') or '?'))
            if (not v.sau) or ss.da_xong('sau'):
                con_viec = False
                print('        mọi bước đã xong từ lượt trước — chỉ in lại báo cáo, '
                      'không mở Chrome')
    if con_viec:
        d, sau = _soi_bang_chrome(v, ss, user, pw, d=d, sau=sau)
    if ss:
        with ss.ghi_kem() as buf:
            lech = in_het(v, d, sau)
        with open(os.path.join(ss.d_kq, 'report.txt'), 'w', encoding='utf-8') as f:
            f.write(buf.getvalue())
        if v.spec:
            sm.ghi_json(os.path.join(ss.d_evi, 'lech.json'),
                        {'luc': time.strftime('%Y-%m-%d %H:%M:%S'), 'spec': v.spec,
                         'so_lech': len(lech),
                         'lech': [{'loai': a, 'mo_ta': b} for a, b in lech]})
        _cat_kq(ss, v, d, sau)
        ss.xong_buoc('bao_cao')
    else:
        in_het(v, d, sau)
    return d


def chay_mot(v):
    """Chạy MỘT lượt. Đường CŨ: lỗi bung ra ngoài y như bản cũ. Phiên: lỗi gói thành FAILED."""
    if not v.sid:
        _lam(v, None)
        return {'id': '-', 'trang_thai': sm.COMPLETED}
    return _chay_phien(v)


def _chay_phien(v):
    ss = sm.Session(v.sid, v.goc)
    if v.resume and not ss.co:
        die('không có phiên %r để --resume (xem `--list-sessions`). --resume KHÔNG tự tạo '
            'phiên mới — dùng --new nếu muốn tạo.' % v.sid)
    if v.moi and ss.co:
        if not v.dong_y:
            die('phiên %r ĐÃ CÓ ở %s. `--new` sẽ xoá sạch kết quả/log/cookie của nó ⇒ thêm '
                '`--yes` nếu thật sự muốn dựng lại, hoặc bỏ `--new` để chạy tiếp trên phiên '
                'đang có.' % (v.sid, ss.dir))
        if ss.dang_chay():
            die('SESSION BUSY — phiên %r đang chạy ở tiến trình %s, không dựng lại khi đang chạy'
                % (v.sid, ss.dang_chay()))
        # Cửa sổ `--hien` của lượt trước còn sống thì `rmtree` sẽ rút `user-data-dir` ngay dưới
        # chân nó (Chrome đang ghi vào đó) ⇒ đóng nó trước. `--new --yes` đã là ý định "dựng
        # lại từ đầu", nên đóng cửa sổ ở đây là đúng ý người dùng, không phải tự tiện.
        if bm.chrome_con_giu(ss.st.get('cong'), ss.st.get('pid'), ss.profile):
            print('   --new: đóng Chrome còn sót của lượt trước (PID %s) trước khi xoá phiên'
                  % (ss.st.get('pid') or '?'))
            bm._giet_lua_truoc(ss.st.get('pgid'), ss.st.get('pid'), ss.profile)
        shutil.rmtree(ss.dir)
    cfg = {'url': v.url, 'role': v.role, 'user': v.user, 'spec': v.spec,
           'phan_he': v.phan_he, 'sua': v.sua, 'sau': v.sau, 'sau_dong': v.sau_dong,
           'home_prefix': v.home, 'login_path': v.login, 'timeout': v.timeout}
    (ss.nap() if ss.co else ss.tao(cfg)).khoa()
    kq = {'id': ss.sid, 'trang_thai': sm.FAILED, 'ly_do': '', 'dir': ss.dir}
    try:
        ss.ghi_cfg(**{k: v_ for k, v_ in cfg.items() if v_ not in (None, '')})
        ss.st['lan'] = int(ss.st.get('lan') or 0) + 1
        ss.dat(sm.RESUMING if v.resume else sm.STARTING)
        with ss.mo_log(echo=v.echo):
            _lam(v, ss)
        ss.pha('xong')
        ss.dat(sm.COMPLETED)
        kq['trang_thai'] = sm.COMPLETED
    except BaseException as e:                  # noqa: BLE001 — một phiên hỏng KHÔNG kéo phiên khác
        # §10 — câu báo lỗi phải nói ĐỦ BA thứ: phiên nào · pha nào · nguyên nhân gần nhất.
        # Chạy 3 phiên song song mà bảng tổng kết chỉ có nguyên nhân thì không ai biết phiên
        # nào gục ở chỗ nào; `pha` được ghi xuống đĩa ngay từng mốc nên còn cả khi bị kill -9.
        ly_do = '[%s] %s' % (ss.st.get('pha') or 'chuẩn bị', _ly_do(e))
        try:
            ss.dat(sm.FAILED, ly_do=ly_do)
        except Exception:
            pass
        kq['ly_do'] = ly_do
        if isinstance(e, KeyboardInterrupt):
            raise
    finally:
        ss.mo_khoa()
    return kq


def _ly_do(e):
    """Một dòng gọn cho bảng tổng kết (bỏ tiền tố `LỖI: `, bỏ phần xuống dòng hướng dẫn)."""
    s = str(e).strip() or type(e).__name__
    s = s[5:].strip() if s.startswith('LỖI:') else s
    s = s.split('\n')[0].strip()
    if not isinstance(e, SystemExit):
        s = '%s: %s' % (type(e).__name__, s)
    return s[:160]


# ══════════════════════════════════════════════════════════════════════════════
# 8. main
# ══════════════════════════════════════════════════════════════════════════════
VD = """ví dụ:
  # ── một phiên, y như trước (không cần khai phiên nào) ──────────────────────────
  export ROLE_USER=... ROLE_PASS=...     # hoặc ROLE_<VAI TRÒ>_USER/_PASS
  python3 probe_live.py https://host/admin/cham-cong
  python3 probe_live.py https://host/admin/cham-cong --spec ho-so-man/ChamCong.json --sua --sau

  # ── nhiều PHIÊN làm việc độc lập (mỗi phiên một browser, một cookie, một log) ──
  python3 probe_live.py https://host/admin/A --session session-001 --new --role Admin
  python3 probe_live.py https://host/admin/A --session session-001 --resume
  python3 probe_live.py --sessions session-001,session-002,session-003 --parallel 3
  python3 probe_live.py --config sessions.json --parallel 3
  python3 probe_live.py --list-sessions
  python3 probe_live.py --delete-session session-001 --yes

  # tài khoản theo VAI TRÒ (không viết mật khẩu vào file cấu hình):
  export ROLE_ADMIN_USER=...   ROLE_ADMIN_PASS=...
  export ROLE_TEACHER_USER=... ROLE_TEACHER_PASS=..."""


def main():
    ap = argparse.ArgumentParser(
        description='Soi màn THẬT (đăng nhập + đọc DOM). CHỈ ĐỌC, không ghi dữ liệu.',
        epilog=VD, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('url', nargs='?', help='URL đầy đủ của màn')
    ap.add_argument('--spec', help='hồ sơ màn (JSON) để ĐỐI CHIẾU — không sửa file')
    ap.add_argument('--user', help='tài khoản (mặc định do tai_khoan.py tìm theo vai trò)')
    ap.add_argument('--pass', dest='pw', help='mật khẩu (mặc định do tai_khoan.py tìm)')
    ap.add_argument('--phan-he', default=PHAN_HE_MAC_DINH,
                    help='chữ đầu của thẻ phân hệ cần chọn ở trang cổng')
    ap.add_argument('--sua', action='store_true', help='soi thêm biểu mẫu CHỈNH SỬA (mở rồi Hủy bỏ)')
    ap.add_argument('--sau', action='store_true',
                    help='LUỒN SÂU: bấm vào bản ghi để sang màn chi tiết · tab · khu vực ẩn '
                         '(chỉ bấm phần tử ĐỌC, chặn theo danh sách cấm)')
    ap.add_argument('--sau-dong', type=int, default=1, metavar='N',
                    help='`--sau` bấm vào N dòng đầu của bảng (mặc định 1 = như trước). '
                         'Màn phụ chỉ mở từ bản ghi trạng thái khác thì phải tăng số này')
    ap.add_argument('--hien', action='store_true', help='mở cửa sổ Chrome thật (gỡ lỗi)')
    ap.add_argument('--home-prefix', help='tiền tố route sau đăng nhập (mặc định $QA_HOME_PREFIX)')
    ap.add_argument('--login-path', help='route trang đăng nhập (mặc định $QA_LOGIN_PATH)')

    g = ap.add_argument_group('CHẠY LIVE TEST NHIỀU PHIÊN LÀM VIỆC (multi-session)')
    g.add_argument('--session', help='chạy trong phiên <id>: browser · cookie · log · kết quả RIÊNG')
    g.add_argument('--sessions', help='nhiều phiên, ngăn bằng dấu phẩy: a,b,c')
    g.add_argument('--config', help='file JSON khai nhiều phiên (khoá "sessions": [...])')
    g.add_argument('--new', action='store_true', help='TẠO phiên mới (phiên đã có thì cần --yes)')
    g.add_argument('--resume', action='store_true',
                   help='CHẠY TIẾP phiên đang dở: bỏ qua bước đã xong, KHÔNG tạo phiên mới')
    g.add_argument('--parallel', type=int, default=1, metavar='N',
                   help='số phiên chạy cùng lúc (1 = tuần tự; trần %d, đổi bằng QA_MAX_PARALLEL)'
                        % sm.TRAN_SONG_SONG)
    g.add_argument('--role', default='', help='vai trò của phiên (chọn tài khoản tương ứng)')
    g.add_argument('--timeout', type=int, default=TIMEOUT_MAC_DINH, metavar='GIÂY',
                   help='hết giờ thì phiên đó FAILED (0 = không giới hạn). Mặc định %d'
                        % TIMEOUT_MAC_DINH)
    g.add_argument('--session-dir', help='thư mục chứa phiên (mặc định $QA_SESSION_DIR '
                                         'hoặc <gốc repo>/sessions)')
    g.add_argument('--list-sessions', action='store_true', help='liệt kê phiên rồi thoát')
    g.add_argument('--delete-session', metavar='ID', help='xoá hẳn một phiên rồi thoát')
    g.add_argument('--yes', action='store_true', help='khỏi hỏi lại khi xoá / dựng lại phiên')
    g.add_argument('-v', '--verbose', action='store_true',
                   help='chạy nhiều phiên: in luôn báo cáo của từng phiên ra màn hình')
    a = ap.parse_args()

    if a.list_sessions:
        return sm.in_danh_sach(a.session_dir)
    if a.delete_session:
        return sm.xoa(a.delete_session, a.session_dir, a.yes)

    nhieu = [x.strip() for x in (a.sessions or '').split(',') if x.strip()]
    if sum(bool(x) for x in (a.session, nhieu, a.config)) > 1:
        die('chọn MỘT trong: --session · --sessions · --config')
    if a.config:
        viec = [Viec.tu_json(x, a) for x in sm.doc_cau_hinh(a.config)]
    elif nhieu:
        viec = [Viec.tu_phien(s, a) for s in nhieu]
    elif a.session:
        viec = [Viec.tu_phien(a.session, a)]
    else:
        if not a.url:
            ap.error('thiếu URL (hoặc dùng --session/--sessions/--config/--list-sessions)')
        if a.new or a.resume:
            die('--new/--resume chỉ dùng kèm --session/--sessions/--config')
        viec = [Viec(url=a.url, role=a.role, user=a.user, pw=a.pw, phan_he=a.phan_he,
                     spec=a.spec, sua=a.sua, sau=a.sau, hien=a.hien, sau_dong=a.sau_dong,
                     home=a.home_prefix, login=a.login_path, timeout=0)]
    for v in viec:
        if not (v.url or '').lower().startswith(('http://', 'https://')):
            die('url phải bắt đầu bằng http:// hoặc https://%s'
                % (' (phiên %s)' % v.sid if v.sid else ''))
    if len(viec) > 1:
        for v in viec:
            v.echo = a.verbose
        if a.hien:
            die('--hien mở cửa sổ thật nên chỉ dùng cho MỘT phiên')

    if len(viec) == 1 and not viec[0].sid:          # ── đường CŨ: y nguyên bản trước
        chay_mot(viec[0])
        return 0
    kq = sm.chay_nhieu(viec, chay_mot, a.parallel)
    return sm.tom_tat(kq)


def _chay_an_toan():
    """Vỏ ngoài cùng — §10: KHÔNG bao giờ kết thúc bằng traceback trần.

    Hai đường vào rất hay gặp mà bản trước đổ traceback ra màn hình:
      · **Ctrl+C**: `KeyboardInterrupt` xuyên qua `chay_nhieu()` rồi qua cả `main()`. Phiên đã
        được ghi FAILED đúng, nhưng người dùng nhận về 20 dòng stack — đọc như thể tool hỏng.
      · **`| head`**: stdout đóng giữa chừng. `session_manager.in_ra()` đã nuốt cho đường có
        phiên, nhưng đường CŨ (`probe_live.py <url>`) in thẳng `print` nên `BrokenPipeError`
        vẫn bung, và Python còn kèm thêm "Exception ignored" lúc thoát.
    Mã thoát theo quy ước shell: 130 = Ctrl+C · 141 = SIGPIPE.
    """
    try:
        return main()
    except KeyboardInterrupt:
        sm.in_ra(sm.that_stdout(), '\n⏹  DỪNG theo Ctrl+C. Phiên đang chạy đã được ghi FAILED; '
                                   'chạy tiếp bằng `--resume`.\n')
        return 130
    except BrokenPipeError:
        try:                                     # chặn cả "Exception ignored" lúc thoát
            os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        except Exception:
            pass
        return 141


if __name__ == '__main__':
    sys.exit(_chay_an_toan())

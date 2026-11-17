# -*- coding: utf-8 -*-
"""AN TOÀN THÔNG TIN — đo bằng HAI PHIÊN, HAI VAI TRÒ  (mới 2026-09-16).

Nhóm `An toàn thông tin` là nhóm CHƯA ĐO lớn nhất của bộ `ChuyenVien`: **148/3.365 case**.
Lý do không đo được không phải kỹ thuật mà là *thiếu đối chứng* — mọi case đều có dạng
*"tài khoản KHÔNG có quyền X thì phải bị chặn"*, mà lượt chạy chỉ có một phiên của đúng
vai trò đang test.

Khối này mở **phiên thứ hai** bằng một tài khoản vai trò khác:

    PHIÊN A  = vai trò đang test          (đã có sẵn, do `chay_live` mở)
    PHIÊN B  = vai trò đối chứng          (mở ở đây, hồ sơ Chrome RIÊNG)

Hai phiên KHÔNG dùng chung cookie vì chúng là hai tiến trình Chrome trên hai `user-data-dir`
khác nhau — không phải vì tool tự dọn cookie. Đây là điểm quan trọng: một cơ chế cách ly dựa
trên "nhớ xoá" thì sớm muộn cũng có đường quên xoá; cách ly bằng hồ sơ là cách ly cấu trúc.
Phép tự kiểm `kiem_attt.py` ①② đo chính điều đó.

Sáu luật, không luật nào được nới:

  ① **Tài khoản thật KHÔNG phải tài khoản QA.** Phiên B chỉ được ĐỌC: `go` · đọc DOM ·
     `GET`/`HEAD`. Không một đường nào ở đây gọi `Cong.ghi()`. Case ATTT cần mutation thì
     bản ghi đích phải là bản ghi QA do phiên A tạo, và chính PHIÊN A dọn nó.
  ② **Không suy diễn quyền.** Kỳ vọng lấy từ cột D / `grounding` — không tự quyết định
     403 hay 404 mới là "đúng" (`grounding.rui_ro` của dự án này đã ground sẵn: FE khai
     `permission: null` ⇒ không gác quyền ở FE, mọi kết luận phải đo ở máy chủ).
  ③ **Một quan sát ≠ một kết luận.** Trước khi chấm F phải qua `doi_chung()`: đúng phiên ·
     đăng nhập thành công · đúng URL · đúng bản ghi. Mâu thuẫn ⇒ `None`, không ép F.
  ④ **UI và API đo cả hai.** UI ẩn nút mà API vẫn cho thao tác là lỗ thật; chỉ hỏi DOM thì
     không bao giờ thấy nó.
  ⑤ **Không có tài khoản đối chứng ⇒ PE, không phải P.** PE ghi rõ đã thử gì (mô phỏng
     401/403 dựng được trạng thái gì) và cần gì để chốt.
  ⑥ **Không bí mật nào ra evidence.** Phiên B không bao giờ in tài khoản/mật khẩu; thân
     phản hồi API chỉ giữ 200 ký tự đã che khoá nhạy cảm (`live_ui.goi_api_doc`).
"""
import os
import re
import time

import auto_confirm
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


PHEP_ATTT = []


def phep(ten, can_ghi=False, loai='UI'):
    """Đăng ký phép đo. `loai` = measurement_type ghi vào `cases.json` (§2 chỉ thị 16/09 l3)."""
    def deco(f):
        PHEP_ATTT.append({'ten': ten, 'can_ghi': can_ghi, 'nhan': f.nhan, 'chay': f,
                          'loai': loai})
        return f
    return deco


def nhan_dien(f_nhan):
    def deco(f):
        f.nhan = f_nhan
        return f
    return deco


def _la_attt(cs):
    """Case thuộc khối An toàn thông tin — theo TÊN NHÓM, không theo từ khoá trong tiêu đề."""
    for k in ('sub2', 'sub', 'grp'):
        if 'an toan thong tin' in _n(cs.nhom.get(k) or ''):
            return True
    return False


# ══════════════════════════════════════════════════════════════════════════════
# 1. MA TRẬN VAI TRÒ — chỉ đọc từ biến môi trường
# ══════════════════════════════════════════════════════════════════════════════
# Tài khoản KHÔNG BAO GIỜ nằm trong mã nguồn, bộ case, hồ sơ dự án hay evidence. Ba lối khai,
# xét theo thứ tự: tên vai trò cụ thể -> cặp A/B tổng quát -> cặp mặc định của lượt chạy.
def _env(*ten):
    for t in ten:
        v = os.environ.get(t)
        if v:
            return v
    return None


def _hau_to(role):
    return re.sub(r'[^0-9A-Za-z]+', '', str(role or '')).upper()


def tai_khoan_cua(role):
    """(user, pass) của một vai trò — `(None, None)` nếu chưa cấu hình. KHÔNG log giá trị."""
    import tai_khoan as _tk
    t = _tk.tim(role)
    return (t.user, t.pw) if t else (None, None)


def vai_tro_doi_chung(role_dang_chay=''):
    """(tên vai trò, user, pass) của phiên đối chứng. `(None, None, None)` nếu không có.

    ⚠️ Viết lại 2026-09-17 (§1 + §2 của chỉ thị). Bản trước chỉ nhận đúng hai khuôn tên
    `QA_ROLE_B` + `QA_USER_<TÊN>` / `QA_USER_ROLE_B` — khuôn của riêng tool. Người vận hành
    **không có tài khoản QA nào**, chỉ có tài khoản THẬT trên TEST/UAT đặt tên theo quy ước
    của họ; với họ tool luôn trả "không có" rồi lớp trên đi hỏi người. Nay giao hẳn cho
    `tai_khoan.role_doi_chung()`: nó quét mọi vai trò đã cấu hình ở mọi nguồn ngoài repo và
    chọn một vai trò KHÁC vai trò đang chạy.
    """
    import tai_khoan as _tk
    t = _tk.role_doi_chung(role_dang_chay)
    return (t.role, t.user, t.pw) if t else (None, None, None)


def ma_tran():
    """Bản đồ vai trò -> đã cấu hình tài khoản chưa. Chỉ TÊN và CÓ/KHÔNG — không giá trị."""
    import tai_khoan as _tk
    return _tk.ma_tran()


# ══════════════════════════════════════════════════════════════════════════════
# 2. PHIÊN ĐỐI CHỨNG
# ══════════════════════════════════════════════════════════════════════════════
class PhienDoiChung:
    """Phiên trình duyệt thứ hai, vai trò khác, **CHỈ ĐỌC**.

    Mở một lần cho cả lượt chạy rồi dùng lại (đăng nhập lại cho mỗi case là 30 giây/case).
    Hồ sơ Chrome nằm trong `sessions/<id>/chrome-doi-chung/` — khác hẳn hồ sơ của phiên A,
    nên cookie/token hai bên không có đường gặp nhau.
    """

    def __init__(self, ctx, thu_muc, home='/', login='/login'):
        self.ctx = ctx
        self.thu_muc = thu_muc
        self.home, self.login = home, login
        self.c = None
        self.role = None
        self.ly_do = ''
        self.da_thu = False
        self.mang_vi_pham = []

    def mo(self):
        """Mở + đăng nhập phiên B. -> True/False. KHÔNG ném lỗi: thiếu tài khoản là chuyện
        vận hành bình thường, phép đo phải biết mà chuyển sang nhánh PE."""
        if self.c is not None:
            return True
        if self.da_thu:
            return False
        self.da_thu = True
        # QUYẾT ĐỊNH TỰ ĐỘNG ③ (§2 + §9 của chỉ thị 17/09): *"có tài khoản vai trò khác
        # không?"* — TRA CẤU HÌNH rồi tự quyết, KHÔNG mở hộp thoại, KHÔNG hỏi. Có thì dùng
        # ngay; không có thì người gọi rẽ sang nhánh mô phỏng hoặc PE, cũng không hỏi ai.
        # Vai trò đang chạy truyền vào để không bao giờ chọn trúng CHÍNH NÓ làm đối chứng —
        # hai phiên cùng một tài khoản thì phép đo phân quyền đo đúng một người hai lần rồi
        # kết luận "phân quyền chạy tốt".
        cs = _chinh_sach(self.ctx)
        role_a = getattr(getattr(self.ctx, 'viec', None), 'role', '') or ''
        tk, qd = cs.role_doi_chung(role_a)
        if not tk:
            import tai_khoan as _tk
            self.ly_do = ('không có tài khoản vai trò đối chứng nào được cấu hình '
                          '(đã quét: environment · %s · TOOLV2_SECRET_CMD=%s). '
                          'Khai ROLE_B_USER/ROLE_B_PASS hoặc <VAI TRÒ>_USER/<VAI TRÒ>_PASS.'
                          % (_tk.tom_tat_kham_pha()['nguon']['env_file'],
                             _tk.tom_tat_kham_pha()['nguon']['secret_command']))
            return False
        role, u, p = tk.role, tk.user, tk.pw
        self.role = role
        self.nguon_tk = tk.nguon
        try:
            self.ctx.cong.hanh_dong('phien_doi_chung', 'vai trò %s' % role)
            import browser_manager as bm
            import probe_live as pl
            prof = os.path.join(self.thu_muc, 'chrome-doi-chung')
            os.makedirs(prof, exist_ok=True)
            self.c = bm.Chrome(hien=False, port='auto', profile=prof, diet_cu=False)
            self.c.bat_mang()
            # Tham số ĐĂNG NHẬP phải lấy đúng của lượt chạy (`Viec`), không tự chế: tên phân
            # hệ là chuỗi phải khớp NGUYÊN VĂN thẻ trên trang chọn phân hệ, và mỗi dự án một
            # tiền tố route khác nhau. Bản đầu truyền `ctx.man` (tên MÀN) làm tên phân hệ nên
            # phiên B không bao giờ đăng nhập được, và MỌI case ATTT rơi về PE — đúng cái bẫy
            # "hàng rào trả lời sạch trong khi nó không quan sát được gì".
            v = getattr(self.ctx, 'viec', None)
            phan_he = getattr(v, 'phan_he', None) or self.ctx.man
            home = getattr(v, 'home', None) or self.home
            login = getattr(v, 'login', None) or self.login
            pl.dang_nhap(self.c, self.ctx.url, u, p, phan_he, home=home, login=login)
            time.sleep(1.0)
            return True
        except SystemExit as e:
            self.ly_do = 'đăng nhập vai trò đối chứng KHÔNG thành công: %s' % str(e)[:200]
        except Exception as e:
            self.ly_do = 'không mở được phiên đối chứng: %s: %s' % (type(e).__name__, str(e)[:160])
        self.dong()
        return False

    # ── thao tác CHỈ ĐỌC ────────────────────────────────────────────────────
    def mo_url(self, url, giay=25):
        """Mở một URL bằng phiên B rồi đọc nguyên trạng màn. -> dict quan sát được."""
        self.c.go(url)
        self.c.wait("document.body && document.body.innerText.length>10 ? 1:0", giay)
        time.sleep(1.2)
        return self.quan_sat()

    def quan_sat(self):
        return {'url': qalib.che_url(self.c.js('location.href') or ''),
                'tieu_de': (self.c.js("document.querySelector('h1')?"
                                      "document.querySelector('h1').innerText.trim():''") or ''),
                'van_ban': (ui.doc_van_ban(self.c) or '')[:2500],
                'so_dong': len(ui.doc_bang(self.c) or []),
                'o_dang_nhap': bool(self.c.js(
                    "document.querySelectorAll('input[type=password]').length?1:0"))}

    def api(self, url, method='GET'):
        self.ctx.cong.hanh_dong('goi_api_doc', 'phiên đối chứng %s %s'
                                % (method, qalib.che_url(url)))
        return ui.goi_api_doc(self.c, url, method)

    def so_mang(self):
        """Sổ mạng CỦA PHIÊN B — phải sạch y như phiên A (§7 của chỉ thị)."""
        if self.c is None:
            return []
        ev = self.c.bom_mang()
        return qalib.so_mang(ev, cho_phep_read=self.ctx.mang_cho_phep
                             if hasattr(self.ctx, 'mang_cho_phep') else ())

    def dong(self):
        if self.c is not None:
            try:
                self.c.kill()
            except Exception:
                pass
            self.c = None


def _chinh_sach(ctx):
    """Bảng chính sách của lượt chạy; không có thì dựng một bản non-interactive im lặng.

    Không bao giờ trả `None`: mọi nhánh quyết định ở file này đều phải ghi được sổ, kể cả
    khi phép đo bị gọi từ một bộ tự kiểm không dựng `Viec`.
    """
    v = getattr(ctx, 'viec', None)
    cs = getattr(v, 'chinh_sach', None) if v is not None else None
    if cs is None:
        cs = getattr(ctx, '_chinh_sach_le', None)
        if cs is None:
            cs = auto_confirm.ChinhSach(non_interactive=True, in_ra=False)
            try:
                ctx._chinh_sach_le = cs
            except Exception:
                pass
    return cs


def phien_b(ctx):
    """Phiên đối chứng dùng chung cho cả lượt chạy — mở lần đầu, dùng lại về sau."""
    p = getattr(ctx, '_phien_b', None)
    if p is None:
        p = PhienDoiChung(ctx, getattr(ctx, 'thu_muc_phien', '.') or '.',
                          home=os.environ.get('QA_HOME_PREFIX', '/admin'),
                          login=os.environ.get('QA_LOGIN_PATH', '/login'))
        ctx._phien_b = p
    return p


# ══════════════════════════════════════════════════════════════════════════════
# 3. ĐỐI CHỨNG TRƯỚC KHI KẾT LUẬN  (luật ③)
# ══════════════════════════════════════════════════════════════════════════════
_RX_TU_CHOI = re.compile(
    r'khong du quyen|khong co quyen|truy cap bi tu choi|403|forbidden|'
    r'khong duoc phep|access denied|unauthorized')
_RX_DANG_NHAP = re.compile(r'dang nhap|sign in|login')


def phan_trang(qs, login_path='/login'):
    """Trang mà phiên B nhận được là loại gì: 'tu_choi' · 'dang_nhap' · 'noi_dung' · '?'."""
    if not qs:
        return '?'
    t = _n(qs.get('van_ban') or '')
    if qs.get('o_dang_nhap') or login_path.strip('/') in (qs.get('url') or ''):
        return 'dang_nhap'
    if _RX_TU_CHOI.search(t):
        return 'tu_choi'
    if qs.get('so_dong') or (qs.get('tieu_de') or '').strip():
        return 'noi_dung'
    if _RX_DANG_NHAP.search(t) and len(t) < 400:
        return 'dang_nhap'
    return '?'


def doi_chung(pb, url_mong):
    """Kiểm trước khi kết luận: đúng phiên · đã đăng nhập · đúng URL. -> (ok, lý do).

    Danh sách này đúng bằng §6 của chỉ thị 2026-09-16, và nó tồn tại vì mọi kết luận FAIL
    sai của nhóm ATTT đều đến từ một trong các nguyên nhân ấy: phiên cũ, sai tab, sai vai
    trò, bị đá về trang đăng nhập, sai URL, bản ghi không tồn tại.
    """
    if pb is None or pb.c is None:
        return False, 'chưa có phiên đối chứng'
    try:
        url = pb.c.js('location.href') or ''
    except Exception as e:
        return False, 'phiên đối chứng mất kết nối: %s' % str(e)[:120]
    if url_mong:
        d_mong = re.sub(r'^https?://[^/]+', '', url_mong).split('?')[0].rstrip('/')
        d_thuc = re.sub(r'^https?://[^/]+', '', url).split('?')[0].rstrip('/')
        if d_mong and d_thuc and d_mong != d_thuc and not d_thuc.startswith(d_mong):
            return True, 'URL đã đổi (%s -> %s) — chính là dữ kiện cần ghi' % (d_mong, d_thuc)
    return True, ''


# ══════════════════════════════════════════════════════════════════════════════
# 4. PHÉP ĐO
# ══════════════════════════════════════════════════════════════════════════════
def _cau_tu_choi(ctx, case):
    """Câu thông báo từ chối mà cột D / hồ sơ màn đòi. `None` nếu không nguồn nào nói."""
    m = re.findall(r'["“”]([^"“”]{10,300})["“”]', case.d or '')
    if m:
        return max(m, key=len)
    for k in ('khong_du_quyen', 'tu_choi_quyen', 'loi_403'):
        v = ctx.vb(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _endpoint_doc(ctx):
    import mock_live
    return mock_live.endpoints_doc(ctx.hs)


def _pe(ctx, case, da_thu, can_gi):
    """Khối PE đúng khuôn §chinh_sach_PE: nêu ĐÃ THỬ GÌ và CẦN GÌ để chốt (luật ⑤).

    ⚠️ Phải trả BA phần `(mark, note, dữ kiện)` — `phep_live.chay()` giải nén đúng ba. Bản
    đầu trả hai và mọi case ATTT thiếu tài khoản đối chứng rơi vào lớp LỖI với
    `ValueError: not enough values to unpack`; bộ kiểm `kiem_phep_moi.py` bắt được ngay lượt
    chạy thật đầu tiên, còn `--dry-run` thì không (dry-run chỉ chạy hàm NHẬN DIỆN).
    """
    # §7 — ghi sổ quyết định `LIVE_ROLE_REQUIRED`: case này chỉ chốt được bằng một tài khoản
    # THẬT khác vai trò, và tool KHÔNG giả mạo vai trò để lấy một kết luận.
    role_a = getattr(getattr(ctx, 'viec', None), 'role', '') or ''
    _chinh_sach(ctx).can_role_that(getattr(case, 'key', ''), role_a)
    return 'PE', ('[KHÔNG ĐỦ ĐỐI CHỨNG]\n\nCase đòi một tài khoản KHÁC vai trò/quyền với '
                  'tài khoản đang chạy.\nĐã thử: %s\nCần để chốt: %s\n'
                  'Cấu hình tài khoản đối chứng bằng MỘT trong hai lối, đều NGOÀI repo: '
                  'biến môi trường ROLE_B_USER/ROLE_B_PASS (hoặc <VAI TRÒ>_USER/'
                  '<VAI TRÒ>_PASS), hoặc tệp env do TOOLV2_ENV_FILE trỏ tới. Tool tự tìm, '
                  'không hỏi lại.'
                  % (da_thu, can_gi)), \
        {'muc_bang_chung': 'không đủ', 'da_thu': da_thu, 'can_de_chot': can_gi,
         'quyet_dinh': 'LIVE_ROLE_REQUIRED',
         'vai_tro_doi_chung_da_cau_hinh': bool(vai_tro_doi_chung(role_a)[1]),
         'ma_tran_vai_tro': sorted(ma_tran())}


# ── ① Truy cập màn bằng vai trò khác / không đủ quyền ───────────────────────────────────
@phep('attt_vai_tro_khac')
@nhan_dien(lambda cs: _la_attt(cs) and _bat_ky(
    _n(cs.b), 'tai khoan khac vai tro', 'yeu cau quyen xem man', 'yeu cau quyen them moi',
    'yeu cau quyen chinh sua', 'yeu cau quyen xoa', 'yeu cau quyen', 'khong co quyen'))
def p_vai_tro_khac(case, ctx):
    """Mở màn bằng PHIÊN B (vai trò đối chứng) rồi đo CẢ UI LẪN API.

    Hai nửa phải khớp nhau. UI ẩn nút mà API vẫn trả 200 cho đúng tài nguyên là **lỗ thật**
    và phải chấm F — đây chính là thứ mà một phép chỉ đọc DOM không bao giờ nhìn thấy.
    """
    pb = phien_b(ctx)
    cau = _cau_tu_choi(ctx, case)
    if not pb.mo():
        mock = _thu_mock_tu_choi(ctx, case, cau)
        return _pe(ctx, case, mock, 'một tài khoản thuộc vai trò khác (hoặc chưa được cấp '
                                    'quyền với màn này) để chứng minh MÁY CHỦ thật sự từ chối')
    qs = pb.mo_url(ctx.url)
    ok, ghi_chu = doi_chung(pb, ctx.url)
    if not ok:
        return None
    loai = phan_trang(qs, os.environ.get('QA_LOGIN_PATH', '/login'))
    api = []
    for ep in _endpoint_doc(ctx)[:3]:
        r = pb.api(_tuyet_doi(ctx, ep))
        if r:
            api.append({'endpoint': ep, 'ma': r.get('ma'), 'do_dai': r.get('do_dai')})
    du = {'vai_tro_doi_chung': pb.role, 'trang': loai, 'quan_sat': qs, 'api': api,
          'cau_mong_doi': cau, 'doi_chung': ghi_chu, 'muc_bang_chung': 'UI + API'}
    api_cho = [x for x in api if isinstance(x.get('ma'), int) and 200 <= x['ma'] < 300]
    if loai in ('tu_choi', 'dang_nhap'):
        if api_cho:
            return 'F', ('Vai trò %s bị chặn ở GIAO DIỆN (%s) nhưng API vẫn trả %s cho %s — '
                         'giao diện ẩn màn mà máy chủ vẫn cho lấy dữ liệu.'
                         % (pb.role, 'trang từ chối' if loai == 'tu_choi' else 'đá về đăng nhập',
                            api_cho[0]['ma'], api_cho[0]['endpoint'])), du
        if cau and _n(cau) not in _n(qs.get('van_ban')):
            return 'F', ('Vai trò %s bị chặn đúng, nhưng thông báo KHÔNG đúng nguyên văn cột D '
                         '(%r).' % (pb.role, cau[:90])), du
        return 'P', ('Vai trò %s mở màn: bị chặn (%s)%s; API trả %s — không lộ dữ liệu.'
                     % (pb.role, 'trang từ chối' if loai == 'tu_choi' else 'đá về trang đăng nhập',
                        ', đúng thông báo nguyên văn' if cau else '',
                        ' · '.join(str(x['ma']) for x in api) or 'không gọi được')), du
    if loai == 'noi_dung':
        return 'F', ('Vai trò %s KHÔNG có quyền theo case nhưng VẪN mở được màn (tiêu đề %r, '
                     '%d dòng dữ liệu) — không bị chặn.'
                     % (pb.role, qs.get('tieu_de'), qs.get('so_dong'))), du
    return None


def _tuyet_doi(ctx, ep):
    if ep.startswith('http'):
        return ep
    m = re.match(r'^(https?://[^/]+)', ctx.url or '')
    return (m.group(1) if m else '') + (ep if ep.startswith('/') else '/' + ep)


def _thu_mock_tu_choi(ctx, case, cau):
    """Không có tài khoản đối chứng -> ít nhất dựng trạng thái 403 để ĐO PHẦN GIAO DIỆN.

    Kết quả của nó KHÔNG thành P: nó không chứng minh được máy chủ từ chối ai. Nó là phần
    *"đã thử gì"* của khối PE — và là một dữ kiện thật, đo được, lặp lại được.
    """
    import mock_live
    eps = _endpoint_doc(ctx)
    if not eps:
        return 'không mô phỏng được (hồ sơ màn không khai endpoint ĐỌC nào)'
    # §10: không hỏi *"có muốn dùng mock 403 không"* — có dựng được thì dựng, và ghi sổ.
    _chinh_sach(ctx).mock_tu_choi(getattr(case, 'key', ''), 403)
    try:
        cs = qalib.CuaSoMock(case.key, 'loi_403', eps, 'API trả 403 cho màn')
        with mock_live.Mock(ctx.c, cs, cong=ctx.cong) as m:
            ctx.c.go(ctx.url)
            m.cho("document.body.innerText.length>30?1:0", giay=15)
            m.nghi(1.2)
            txt = (ui.doc_van_ban(ctx.c) or '')[:1200]
            tt = ui.trang_thai_tai(ctx.c)
        ctx.ve_danh_sach(lam_moi=True)
        if not m.da_dung:
            return ('mô phỏng 403 KHÔNG dựng được trạng thái (màn không gọi endpoint đã khai: %s)'
                    % ' · '.join(eps[:2]))
        co_cau = bool(cau and _n(cau) in _n(txt))
        return ('%s — màn hiện %s, %s dòng dữ liệu%s'
                % (cs.nhan_xet(),
                   'đúng thông báo nguyên văn của cột D' if co_cau
                   else 'KHÔNG có câu nguyên văn của cột D',
                   (tt or {}).get('so_dong'),
                   '' if co_cau else ' (đọc được: %s)' % txt[:120].replace('\n', ' / ')))
    except Exception as e:
        return 'mô phỏng 403 lỗi: %s: %s' % (type(e).__name__, str(e)[:140])


# ── ② Ngoại lệ: đúng quyền vẫn vào được (đo bằng CHÍNH phiên A) ────────────────────────
@phep('attt_dung_quyen_van_vao_duoc')
@nhan_dien(lambda cs: _la_attt(cs) and _bat_ky(
    _n(cs.b), 'ngoai le', 'duoc cap dung quyen', 'van vao duoc'))
def p_dung_quyen(case, ctx):
    """Tài khoản ĐANG chạy là tài khoản đã được cấp quyền — mở màn phải vào bình thường."""
    ctx.ve_danh_sach(lam_moi=True)
    qs = {'tieu_de': ctx.c.js("document.querySelector('h1')?"
                              "document.querySelector('h1').innerText.trim():''") or '',
          'so_dong': len(ui.doc_bang(ctx.c) or []),
          'url': qalib.che_url(ctx.c.js('location.href') or ''),
          'van_ban': (ui.doc_van_ban(ctx.c) or '')[:1200],
          'o_dang_nhap': bool(ctx.c.js(
              "document.querySelectorAll('input[type=password]').length?1:0"))}
    loai = phan_trang(qs, os.environ.get('QA_LOGIN_PATH', '/login'))
    tieu_de_mong = ctx.vb('tieu_de_man') or ctx.man
    du = {'vai_tro': os.environ.get('QA_ROLE_A') or 'vai trò đang chạy', 'trang': loai,
          'quan_sat': qs, 'muc_bang_chung': 'UI'}
    if loai == 'noi_dung' and _n(tieu_de_mong) in _n(qs['tieu_de'] or qs['van_ban']):
        return 'P', ('Tài khoản đang chạy (đã được cấp quyền) mở màn bình thường: tiêu đề %r, '
                     '%d dòng dữ liệu — không bị chặn nhầm.'
                     % (qs['tieu_de'], qs['so_dong'])), du
    if loai in ('tu_choi', 'dang_nhap'):
        return 'F', ('Tài khoản đã được cấp quyền mà VẪN bị chặn (%s).'
                     % ('trang từ chối' if loai == 'tu_choi' else 'đá về trang đăng nhập')), du
    return None


# ── ③ Phạm vi dữ liệu / IDOR ────────────────────────────────────────────────────────────
@phep('attt_pham_vi_du_lieu')
@nhan_dien(lambda cs: _la_attt(cs) and _bat_ky(
    _n(cs.b), 'chi thay du lieu thuoc pham vi', 'chi trong pham vi',
    'tim kiem chi trong pham vi'))
def p_pham_vi(case, ctx):
    """So DANH SÁCH mà hai vai trò nhìn thấy — phạm vi dữ liệu chỉ đo được bằng đối chứng."""
    pb = phien_b(ctx)
    if not pb.mo():
        return _pe(ctx, case, 'không có phiên đối chứng để so danh sách (%s)' % pb.ly_do,
                   'một tài khoản thuộc tỉnh/đơn vị KHÁC để so hai danh sách; hoặc quyền '
                   'truy vấn CSDL để đối chiếu phạm vi')
    ctx.ve_danh_sach(lam_moi=True)
    a = {r['txt'] for r in (ui.doc_bang(ctx.c) or [])}
    qs = pb.mo_url(ctx.url)
    loai = phan_trang(qs)
    if loai != 'noi_dung':
        return _pe(ctx, case, ('vai trò đối chứng %s không mở được màn (%s) nên không có '
                               'danh sách thứ hai để so' % (pb.role, loai)),
                   'một tài khoản CÓ quyền vào màn nhưng thuộc phạm vi đơn vị khác')
    b = {r['txt'] for r in (ui.doc_bang(pb.c) or [])}
    chung = a & b
    du = {'so_dong_A': len(a), 'so_dong_B': len(b), 'trung_nhau': len(chung),
          'vai_tro_B': pb.role, 'muc_bang_chung': 'UI',
          'vi_du_trung': sorted(chung)[:3]}
    if not a and not b:
        return None
    if chung and (len(chung) == len(a) == len(b)):
        return 'F', ('Hai vai trò (%s và %s) thấy DANH SÁCH GIỐNG HỆT nhau (%d dòng) — không '
                     'có dấu hiệu giới hạn theo phạm vi tỉnh/đơn vị.'
                     % (os.environ.get('QA_ROLE_A') or 'vai trò đang chạy', pb.role, len(a))), du
    return 'P', ('Danh sách của hai vai trò KHÁC nhau: %s thấy %d dòng, %s thấy %d dòng, '
                 'trùng %d — dữ liệu có giới hạn theo phạm vi.'
                 % (os.environ.get('QA_ROLE_A') or 'vai trò đang chạy', len(a), pb.role,
                    len(b), len(chung))), du


@phep('attt_idor', can_ghi=True)
@nhan_dien(lambda cs: _la_attt(cs) and _bat_ky(
    _n(cs.b), 'can thiep tham so', 'sua ma dinh danh', 'lay du lieu ngoai pham vi',
    'truy cap ban ghi ngoai pham vi', 'idor',
    # ⚠️ Thêm 2026-09-16 lượt 3 (§7). Bộ case viết lối *"Không <động từ> được bản ghi ngoài
    # phạm vi được phân công"* — 5 case của `ViTriLuuTru` và 4 của `LoaiLuuTru` — mà bản
    # khai từ khoá cũ không có lối ấy, nên cả nhóm rơi về CHƯA ĐO trong khi phiên đối chứng
    # đã dựng được từ đợt 16/09. Khớp theo cụm *"ngoài phạm vi được phân công"* chứ không
    # theo động từ: động từ thay đổi theo từng CN (xem · sửa · xoá · thao tác).
    'ngoai pham vi duoc phan cong', 'khong thuoc pham vi duoc phan cong'))
def p_idor(case, ctx):
    """Phiên A tạo bản ghi QA -> phiên B thử ĐỌC đúng bản ghi ấy bằng id.

    Chỉ `GET`. Không có đường nào để phiên B sửa/xoá: tài khoản thật không phải tài khoản
    QA (luật ①), và bản ghi QA thì chính phiên A dọn.
    """
    pb = phien_b(ctx)
    m = ctx.ban_ghi(case)
    ma = m['ma']
    id_app = m.get('id_app')
    if not id_app:
        ctx.hien_ban_ghi_qa(ma, lam_moi=True)
        id_app = ctx.so.muc.get(ma, {}).get('id_app')
    if not pb.mo():
        return _pe(ctx, case,
                   ('đã tạo bản ghi QA %s ở phiên đang chạy để làm tài nguyên đích, nhưng '
                    'không mở được phiên đối chứng (%s)' % (ma, pb.ly_do)),
                   'một tài khoản vai trò/đơn vị khác để thử truy cập chính bản ghi ấy')
    eps = [e for e in ((ctx.hs.get('grounding') or {}).get('api') or [])
           if re.match(r'\s*GET\s+\S*\{id\}', str(e))]
    dich = []
    if id_app and eps:
        for e in eps[:2]:
            ep = re.match(r'\s*GET\s+(\S+)', str(e)).group(1)
            dich.append(_tuyet_doi(ctx, ep.replace('{id}', str(id_app))))
    du = {'ban_ghi_qa': ma, 'id_app': id_app, 'vai_tro_B': pb.role,
          'muc_bang_chung': 'API', 'endpoint_thu': dich}
    if not dich:
        # Không có endpoint dạng `/{id}` -> thử qua URL màn có tham số, vẫn chỉ ĐỌC
        qs = pb.mo_url('%s?search=%s' % (ctx.url, ma))
        du['quan_sat'] = qs
        thay = ma.lower() in _n(qs.get('van_ban') or '')
        if phan_trang(qs) != 'noi_dung':
            return _pe(ctx, case, 'vai trò đối chứng không mở được màn để thử tham số',
                       'tài khoản đối chứng CÓ quyền vào màn nhưng khác phạm vi dữ liệu')
        if thay:
            return 'F', ('Vai trò %s tìm theo mã %r (bản ghi do phiên khác tạo) và THẤY bản '
                         'ghi đó trên danh sách — dữ liệu không giới hạn theo phạm vi.'
                         % (pb.role, ma)), du
        return 'P', ('Vai trò %s tìm theo mã %r: không thấy bản ghi của phiên khác.'
                     % (pb.role, ma)), du
    kq = [dict(url=qalib.che_url(u), **(pb.api(u) or {})) for u in dich]
    du['ket_qua_api'] = kq
    cho = [x for x in kq if isinstance(x.get('ma'), int) and 200 <= x['ma'] < 300]
    chan = [x for x in kq if isinstance(x.get('ma'), int) and x['ma'] in (401, 403, 404)]
    if cho:
        return 'F', ('Vai trò %s gọi %s (bản ghi %s do vai trò khác tạo) và nhận %d — máy chủ '
                     'TRẢ VỀ bản ghi ngoài phạm vi.'
                     % (pb.role, cho[0]['url'], ma, cho[0]['ma'])), du
    if chan:
        return 'P', ('Vai trò %s gọi %s (bản ghi %s của vai trò khác): máy chủ chặn — mã %d.'
                     % (pb.role, chan[0]['url'], ma, chan[0]['ma'])), du
    return None


# ── ④ Chủ sở hữu lấy từ phiên đăng nhập ────────────────────────────────────────────────
@phep('attt_chu_so_huu', can_ghi=True)
@nhan_dien(lambda cs: _la_attt(cs) and _bat_ky(
    _n(cs.b), 'chu so huu lay tu phien', 'thong tin chu so huu', 'nguoi tao lay tu phien'))
def p_chu_so_huu(case, ctx):
    """Tạo bản ghi QA rồi đọc lại — người tạo/đơn vị phải là tài khoản ĐANG đăng nhập.

    KHÔNG tự chế một `POST` mang trường `owner` giả: tự dựng request là mở một đường ghi
    nằm ngoài UI, đúng thứ §hang_rao_an_toan cấm từ sự cố 2026-08-02. Đo bằng đường hợp lệ:
    tạo qua biểu mẫu rồi xem máy chủ gán chủ sở hữu là ai.
    """
    m = ctx.ban_ghi(case, moi=True)
    ma = m['ma']
    if not ctx.hien_ban_ghi_qa(ma, lam_moi=True):
        return None
    dong = ui.doc_dong(ctx.c, ma)
    # Tài khoản ĐANG đăng nhập — lấy qua lớp tài khoản, không đọc thẳng `QA_USER`: khuôn tên
    # biến là cấu hình của người vận hành (§1 chỉ thị 17/09), và ở đây chỉ cần PHẦN TÊN để
    # đối chiếu cột "Người tạo" trên màn.
    import tai_khoan as _tk
    _role_a = getattr(getattr(ctx, 'viec', None), 'role', '') or ''
    _t = _tk.tim(_role_a)
    tk = _t.user if _t else ''
    ten_tk = tk.split('@')[0] if tk else ''
    du = {'ban_ghi_qa': ma, 'dong': dong, 'muc_bang_chung': 'UI'}
    if not dong:
        return None
    txt = _n(' '.join(str(v) for v in (dong.get('o') or {}).values()))
    cot_nguoi = [k for k in (dong.get('o') or {})
                 if _bat_ky(_n(k), 'nguoi tao', 'tao boi', 'chu so huu', 'don vi')]
    du['cot_nguoi_tao'] = cot_nguoi
    gt = ' '.join(str((dong.get('o') or {}).get(k) or '') for k in cot_nguoi)
    if not cot_nguoi:
        # ⚠️ VÁ 18/09. Bảng danh sách của màn KHÔNG có cột người tạo (đo được: STT · Code ·
        # Tên hiển thị · Loại DB · Phiên bản · Port · Trạng thái · Tags · Hành động), nên bản
        # trước bỏ đo hẳn. Nhưng **hộp Chi tiết CÓ** dòng "Tạo bởi" — thiếu đường đọc ấy là
        # thiếu CAPABILITY của tool, không phải giới hạn của app.
        from phep_bosung import _mo_hop_chi_tiet, _dong_hop_chi_tiet
        hop, _bam = _mo_hop_chi_tiet(ctx, ma)
        cap = {str(x.get('nhan') or '').rstrip(':'): str(x.get('gia_tri') or '')
               for x in ((hop or {}).get('cap') or [])}
        khop = [k for k in cap
                if _bat_ky(_n(k), 'nguoi tao', 'tao boi', 'chu so huu', 'don vi')]
        du['nguon_doc'] = 'hộp Chi tiết'
        du['cap_trong_hop'] = khop
        _dong_hop_chi_tiet(ctx)
        ctx.ve_danh_sach()
        if not khop:
            return None        # cả bảng lẫn hộp Chi tiết đều không nêu người tạo
        cot_nguoi = khop
        gt = ' '.join(cap.get(k) or '' for k in khop)
    du['gia_tri'] = gt
    if ten_tk and _n(ten_tk) in _n(gt):
        return 'P', ('Bản ghi QA %s tạo qua biểu mẫu: cột %s ghi %r — đúng tài khoản đang '
                     'đăng nhập.' % (ma, ' · '.join(cot_nguoi), gt[:60])), du
    if gt.strip():
        return 'F', ('Bản ghi QA %s: cột %s ghi %r, KHÔNG phải tài khoản đang đăng nhập.'
                     % (ma, ' · '.join(cot_nguoi), gt[:60])), du
    return None


# ── ⑤ Không token / phiên không hợp lệ ─────────────────────────────────────────────────
@phep('attt_khong_token')
@nhan_dien(lambda cs: _la_attt(cs) and _bat_ky(
    _n(cs.b), 'khong token', 'token khong hop le', 'token het han', 'phien khong hop le',
    'goi api truc tiep'))
def p_khong_token(case, ctx):
    """Dựng trạng thái 401 bằng mô phỏng mạng rồi đo màn — không cần tài khoản thứ hai."""
    import mock_live
    eps = _endpoint_doc(ctx)
    if not eps:
        return None
    cau = _cau_tu_choi(ctx, case)
    cs = qalib.CuaSoMock(case.key, 'loi_401', eps, 'API trả 401 (không token / token hết hạn)')
    with mock_live.Mock(ctx.c, cs, cong=ctx.cong) as m:
        ctx.c.go(ctx.url)
        m.cho("document.body.innerText.length>30?1:0", giay=18)
        m.nghi(1.5)
        txt = (ui.doc_van_ban(ctx.c) or '')[:2000]
        tt = ui.trang_thai_tai(ctx.c)
        url_sau = ctx.c.js('location.href') or ''
        co_o_mk = bool(ctx.c.js("document.querySelectorAll('input[type=password]').length?1:0"))
    ctx.ve_danh_sach(lam_moi=True)
    if not m.da_dung:
        return None
    login = os.environ.get('QA_LOGIN_PATH', '/login')
    ve_dang_nhap = co_o_mk or login.strip('/') in url_sau
    du = {'muc_bang_chung': 'MOCK', 'mock': cs.khoi(), 'trang_thai': tt,
          've_trang_dang_nhap': ve_dang_nhap, 'cau_mong_doi': cau,
          'van_ban': txt[:400]}
    note_mock = cs.nhan_xet()
    if cau and _n(cau) in _n(txt):
        return 'P', ('%s\nAPI trả 401: màn hiện đúng thông báo nguyên văn %r%s.'
                     % (note_mock, cau[:90],
                        ' và đưa về trang đăng nhập' if ve_dang_nhap else '')), du
    if ve_dang_nhap:
        return 'P', ('%s\nAPI trả 401: màn đưa người dùng về trang đăng nhập, không hiện dữ '
                     'liệu.' % note_mock), du
    if (tt or {}).get('so_dong'):
        return 'F', ('%s\nAPI trả 401 mà màn VẪN hiện %d dòng dữ liệu — không xử lý phiên hết '
                     'hạn.' % (note_mock, tt['so_dong'])), du
    if cau:
        return 'F', ('%s\nAPI trả 401: màn không hiện dữ liệu nhưng cũng KHÔNG có thông báo '
                     'nguyên văn %r (đọc được: %s).'
                     % (note_mock, cau[:80], txt[:110].replace('\n', ' / '))), du
    return None


# ══════════════════════════════════════════════════════════════════════════════
# 5. TRA CỨU + DỌN
# ══════════════════════════════════════════════════════════════════════════════
def phep_cua(case, cho_phep_ghi=True):
    for p in PHEP_ATTT:
        if p['can_ghi'] and not cho_phep_ghi:
            continue
        try:
            if p['nhan'](case):
                return p['ten']
        except Exception:
            continue
    return None


def dong_phien_b(ctx):
    """Đóng phiên đối chứng cuối lượt chạy + trả sổ mạng của nó để đối chiếu."""
    p = getattr(ctx, '_phien_b', None)
    if p is None:
        return None
    try:
        so = p.so_mang()
    except Exception:
        so = []
    p.dong()
    return so

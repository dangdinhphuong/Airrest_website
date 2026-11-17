# -*- coding: utf-8 -*-
"""LỚP TÀI KHOẢN — tìm tài khoản THẬT cho từng vai trò, KHÔNG hỏi người  (2026-09-17).

Vì sao viết lại. Bản trước chốt cứng khuôn tên `QA_USER_<ROLE>` / `QA_PASS_<ROLE>` và coi
*"có tài khoản QA riêng"* là điều kiện bắt buộc. Thực tế của người vận hành khác hẳn: họ
**không có tài khoản QA nào** — chỉ có tài khoản THẬT được cấp để dùng hệ thống trên môi
trường TEST/UAT, và tên biến của những tài khoản ấy không có lý do gì phải mang tiền tố `QA_`.
Hậu quả của việc chốt cứng: tool báo BLOCKED rồi **hỏi người** — mà hỏi trong một lượt chạy
3.365 case thì chính là cái hộp thoại mà §7 đã bỏ đi từ đợt 16/09 lượt 2.

    Tên biến là CẤU HÌNH, không phải luật. Thiếu tài khoản là một KẾT LUẬN (`MISSING_CREDENTIAL`),
    không phải một câu hỏi.

Bốn nguồn, xét theo thứ tự; nguồn nào cũng **nằm ngoài repo**:

  ① tham số dòng lệnh (`--user/--pass`) — chỉ dùng khi người chạy chủ động truyền
  ② biến môi trường
  ③ tệp env ngoài repo — `TOOLV2_ENV_FILE`, hoặc `~/.config/tool_v2/accounts.env`,
     hoặc `~/.tool_v2.env`. **Từ chối** tệp nằm trong repo (đó là đường để mật khẩu đi vào git).
  ④ lệnh lấy bí mật — `TOOLV2_SECRET_CMD` được gọi với TÊN KHOÁ, in giá trị ra stdout
     (cắm được vào `pass`, `vault`, `op`, `gopass`… mà tool không cần biết cái nào).

Khuôn tên biến — `TOOLV2_ACCOUNT_PREFIX` đổi được, mặc định phủ cả ba lối đặt tên đang gặp:

    ROLE_<VAI TRÒ>_USER / ROLE_<VAI TRÒ>_PASS      ← khuôn khuyến nghị
    <VAI TRÒ>_USER      / <VAI TRÒ>_PASS
    QA_USER_<VAI TRÒ>   / QA_PASS_<VAI TRÒ>        ← khuôn cũ, giữ để không gãy lượt đang chạy
    ROLE_A_USER/ROLE_A_PASS · ROLE_B_USER/ROLE_B_PASS   ← ô A/B tổng quát
    ROLE_USER / ROLE_PASS · QA_USER / QA_PASS           ← tài khoản mặc định của lượt chạy

Ba điều khối này KHÔNG làm:

  · **không in giá trị** — không vào log, evidence, `cases.json`, ảnh chụp, Excel. Chỉ ghi
    `credential_source=env` và `role=<tên>`. `TaiKhoan.__repr__` cũng không lộ.
  · **không hỏi** — không `input()`, không `die()` giữa lượt. Không tìm thấy thì trả `None`
    và người gọi ghi `MISSING_CREDENTIAL:<role>`.
  · **không tự chế vai trò** — không đổi role của tài khoản A để giả làm B. Thiếu B là thiếu
    B, và case đòi B thật thì ra `PE`, không bao giờ ra `P`.
"""
import os
import re
import subprocess

_KHOA_HOP_LE = re.compile(r'^[A-Z][A-Z0-9_]*$')

# Đuôi khoá. Tách riêng để một chỗ duy nhất biết "biến nào là tài khoản, biến nào là mật khẩu".
_USER, _PASS = 'USER', 'PASS'


def _hau_to(role):
    """Tên vai trò -> phần TÊN trong khoá môi trường. `Chuyên viên` -> `CHUYENVIEN`.

    Trả biến thể LIỀN (bỏ hết dấu ngăn). Biến thể có gạch dưới do `cac_hau_to()` sinh thêm.
    """
    import qalib
    return re.sub(r'[^0-9A-Za-z]+', '', qalib.norm(role or '')).upper()


def cac_hau_to(role):
    """Mọi biến thể TÊN của một vai trò, hẹp trước rộng sau. `ROLE_B` -> ['ROLE_B', 'ROLEB'].

    ⚠️ Hai biến thể chứ không một. Bản đầu chỉ bỏ hết dấu ngăn, nên vai trò tên `ROLE_B` ra
    `ROLEB` và khoá `ROLE_B_USER` — đúng cái khuôn §1 của chỉ thị đặt tên — KHÔNG khớp được.
    Người vận hành khai đúng như tài liệu bảo mà tool vẫn nói "không có tài khoản".
    """
    import qalib
    n = qalib.norm(role or '')
    gach = re.sub(r'[^0-9A-Za-z]+', '_', n).strip('_').upper()
    lien = re.sub(r'[^0-9A-Za-z]+', '', n).upper()
    return [x for i, x in enumerate([gach, lien]) if x and x not in [gach, lien][:i]]


def tien_to():
    """Danh sách tiền tố khoá, cấu hình bằng `TOOLV2_ACCOUNT_PREFIX` (ngăn bằng dấu phẩy).

    Mặc định `ROLE_,,QA_` — tức là thử `ROLE_…`, rồi tên trần, rồi khuôn cũ `QA_…`. Chuỗi
    rỗng giữa hai dấu phẩy là CÓ Ý: nó là khuôn `<VAI TRÒ>_USER` không tiền tố.
    """
    thô = os.environ.get('TOOLV2_ACCOUNT_PREFIX')
    if thô is None:
        return ['ROLE_', '', 'QA_']
    return [x.strip() for x in thô.split(',')]


def khoa_ung_vien(role=''):
    """[(khoá tài khoản, khoá mật khẩu)] sẽ được thử cho một vai trò — THEO THỨ TỰ.

    Chỉ trả về TÊN KHOÁ. Dùng cho cả việc tra lẫn việc in ra thông báo `MISSING_CREDENTIAL`
    (in tên biến cần khai là giúp người vận hành, không phải lộ bí mật).
    """
    hs = cac_hau_to(role)
    ra = []

    def them(u, p):
        if _KHOA_HOP_LE.match(u) and _KHOA_HOP_LE.match(p) and (u, p) not in ra:
            ra.append((u, p))

    for h in hs:
        for t in tien_to():
            them('%s%s_%s' % (t, h, _USER), '%s%s_%s' % (t, h, _PASS))
            them('%s%s_%s' % (t, _USER, h), '%s%s_%s' % (t, _PASS, h))   # QA_USER_<ROLE>
            them('%s%s_ROLE_%s' % (t, _USER, h), '%s%s_ROLE_%s' % (t, _PASS, h))
    if not hs:
        for t in tien_to():
            them('%s%s' % (t, _USER), '%s%s' % (t, _PASS))               # ROLE_USER / QA_USER
    return ra


def khoa_mac_dinh():
    """Khoá của tài khoản MẶC ĐỊNH (không gắn vai trò nào) — lớp lùi cuối cùng."""
    ra = []
    for t in tien_to():
        for u, p in (('%s%s' % (t, _USER), '%s%s' % (t, _PASS)),):
            if _KHOA_HOP_LE.match(u) and (u, p) not in ra:
                ra.append((u, p))
    return ra


# ══════════════════════════════════════════════════════════════════════════════
# NGUỒN BÍ MẬT  — môi trường · tệp env ngoài repo · lệnh lấy bí mật
# ══════════════════════════════════════════════════════════════════════════════
class TrongRepo(RuntimeError):
    """Tệp env nằm TRONG repo — từ chối đọc. Đó là đường mật khẩu đi vào git."""


_CACHE_TEP = None


def _goc_repo():
    import qalib
    return os.path.abspath(qalib.repo_root())


def duong_tep_env():
    """Đường dẫn tệp env sẽ đọc, hoặc `None`. Ném `TrongRepo` nếu người chạy trỏ vào repo."""
    khai = (os.environ.get('TOOLV2_ENV_FILE') or '').strip()
    ds = [khai] if khai else [os.path.expanduser('~/.config/tool_v2/accounts.env'),
                              os.path.expanduser('~/.tool_v2.env')]
    goc = _goc_repo()
    for p in ds:
        if not p:
            continue
        p = os.path.abspath(os.path.expanduser(p))
        if os.path.commonpath([p, goc]) == goc:
            raise TrongRepo(
                'TOOLV2_ENV_FILE trỏ vào TRONG repo (%s). Tệp chứa mật khẩu không được nằm '
                'trong thư mục có `.git` — đặt nó ở ~/.config/tool_v2/accounts.env hoặc nơi '
                'khác ngoài repo.' % p)
        if os.path.isfile(p):
            return p
    return None


def _doc_tep_env(lam_moi=False):
    """{khoá: giá trị} từ tệp env ngoài repo. Đọc một lần rồi giữ trong bộ nhớ."""
    global _CACHE_TEP
    if _CACHE_TEP is not None and not lam_moi:
        return _CACHE_TEP
    ra = {}
    try:
        p = duong_tep_env()
    except TrongRepo:
        raise
    if p:
        try:
            with open(p, encoding='utf-8') as f:
                for dong in f:
                    dong = dong.strip()
                    if not dong or dong.startswith('#'):
                        continue
                    if dong.lower().startswith('export '):
                        dong = dong[7:].strip()
                    if '=' not in dong:
                        continue
                    k, v = dong.split('=', 1)
                    k, v = k.strip(), v.strip()
                    if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
                        v = v[1:-1]
                    if _KHOA_HOP_LE.match(k):
                        ra[k] = v
        except OSError:
            pass
    _CACHE_TEP = ra
    return ra


def _lenh_bi_mat(khoa):
    """Giá trị lấy từ `TOOLV2_SECRET_CMD <KHOÁ>` — `None` nếu chưa khai lệnh hoặc lệnh trượt.

    Lệnh nhận TÊN KHOÁ, in giá trị ra stdout. Không log lệnh, không log đầu ra.
    """
    cmd = (os.environ.get('TOOLV2_SECRET_CMD') or '').strip()
    if not cmd:
        return None
    try:
        r = subprocess.run(cmd.split() + [khoa], capture_output=True, text=True, timeout=20)
    except Exception:
        return None
    if r.returncode != 0:
        return None
    v = (r.stdout or '').strip()
    return v or None


def _tra(khoa):
    """Giá trị của MỘT khoá + nguồn đã lấy được. -> (giá trị, nguồn) hoặc (None, '')."""
    v = os.environ.get(khoa)
    if v:
        return v, 'environment'
    v = _doc_tep_env().get(khoa)
    if v:
        return v, 'env file'
    v = _lenh_bi_mat(khoa)
    if v:
        return v, 'secret command'
    return None, ''


# ══════════════════════════════════════════════════════════════════════════════
# TÀI KHOẢN
# ══════════════════════════════════════════════════════════════════════════════
class TaiKhoan:
    """Một tài khoản đã tìm được. **Không bao giờ in giá trị** — kể cả khi ai đó `print()` nó.

    `repr`/`str` chỉ ra `<TaiKhoan role=ChuyenVien nguon=environment>`. Đây không phải trang
    trí: mọi lần lộ bí mật vào evidence trước nay đều đi qua một `print`/`repr` vô tình của
    một object mang mật khẩu.
    """

    __slots__ = ('role', 'user', 'pw', 'nguon', 'khoa_user', 'khoa_pass')

    def __init__(self, role, user, pw, nguon, khoa_user='', khoa_pass=''):
        self.role, self.user, self.pw = role, user, pw
        self.nguon = nguon
        self.khoa_user, self.khoa_pass = khoa_user, khoa_pass

    def __repr__(self):
        return '<TaiKhoan role=%s nguon=%s khoa=%s>' % (self.role, self.nguon, self.khoa_user)

    __str__ = __repr__

    def __bool__(self):
        return bool(self.user and self.pw)

    def khoi(self):
        """Khối ghi vào evidence — CHỈ nhãn, không giá trị (§5 của chỉ thị 17/09)."""
        return {'role': self.role, 'credential_source': self.nguon,
                'credential_key': self.khoa_user}


def tim(role='', user=None, pw=None):
    """Tài khoản của một vai trò. -> `TaiKhoan` hoặc `None`. KHÔNG ném lỗi, KHÔNG hỏi.

    `user`/`pw` truyền thẳng (từ `--user/--pass`) thắng mọi nguồn khác.
    """
    if user and pw:
        return TaiKhoan(role or '(dòng lệnh)', user, pw, 'tham số dòng lệnh')
    for ku, kp in khoa_ung_vien(role):
        u, nu = _tra(ku)
        p, _np = _tra(kp)
        if u and p:
            return TaiKhoan(role, u, p, nu, ku, kp)
    for ku, kp in khoa_mac_dinh():
        u, nu = _tra(ku)
        p, _np = _tra(kp)
        if u and p:
            return TaiKhoan(role or '(mặc định)', u, p, nu, ku, kp)
    return None


def thieu(role=''):
    """Câu BLOCKED cho một vai trò không có tài khoản — nêu TÊN BIẾN, không nêu giá trị."""
    ds = khoa_ung_vien(role)[:3] + khoa_mac_dinh()[:1]
    return ('MISSING_CREDENTIAL:%s — chưa cấu hình tài khoản cho vai trò này. Khai MỘT trong '
            'các cặp biến sau (ở biến môi trường, hoặc ở tệp ngoài repo do TOOLV2_ENV_FILE '
            'trỏ tới, hoặc qua TOOLV2_SECRET_CMD): %s'
            % (role or '(mặc định)',
               ' · '.join('%s + %s' % (u, p) for u, p in ds)))


def cac_role():
    """[(tên vai trò, khoá tài khoản)] mà môi trường/tệp/lệnh ĐANG có tài khoản.

    Quét theo KHUÔN TÊN, không theo một danh sách chốt cứng — người vận hành đặt tên vai trò
    gì thì tool nhận ra vai trò ấy. Chỉ trả TÊN, không trả giá trị.
    """
    kho = {}
    kho.update(_doc_tep_env())
    kho.update({k: v for k, v in os.environ.items() if v})
    # Gộp theo KHOÁ chứ không theo tên vai trò: tiền tố rỗng làm `ROLE_B_USER` vừa đọc ra
    # vai trò `B` (tiền tố `ROLE_`) vừa đọc ra vai trò `ROLE_B` (tiền tố rỗng) — cùng MỘT
    # tài khoản hiện hai lần, và bảng *account discovery* của báo cáo nói dối về số vai trò.
    ra, thay, khoa_da = [], set(), set()
    for t in tien_to():
        # khuôn ① <TIEN_TO><ROLE>_USER
        rx1 = re.compile(r'^%s([A-Z0-9_]+)_%s$' % (re.escape(t), _USER))
        # khuôn ② <TIEN_TO>USER_<ROLE>
        rx2 = re.compile(r'^%s%s_([A-Z0-9_]+)$' % (re.escape(t), _USER))
        for k in sorted(kho):
            for rx, kp in ((rx1, lambda g: '%s%s_%s' % (t, g, _PASS)),
                           (rx2, lambda g: '%s%s_%s' % (t, _PASS, g))):
                m = rx.match(k)
                if not m:
                    continue
                ten = m.group(1)
                if ten in (_PASS, _USER) or not kho.get(kp(ten)):
                    continue
                if ten in thay or k in khoa_da:
                    continue
                thay.add(ten)
                khoa_da.add(k)
                ra.append((ten, k))
    return ra


def role_doi_chung(role_dang_chay='', uu_tien=('B',)):
    """Tài khoản của một vai trò KHÁC vai trò đang chạy. -> `TaiKhoan` hoặc `None`.

    Thứ tự tìm — từ khai báo TƯỜNG MINH tới suy luận, không bao giờ ngược lại:

      ① `TOOLV2_ROLE_B` / `QA_ROLE_B` trỏ đích danh tên vai trò đối chứng
      ② ô tổng quát `ROLE_B_USER` / `ROLE_B_PASS` (và khuôn cũ `QA_USER_ROLE_B`)
      ③ bất kỳ vai trò nào đã cấu hình mà KHÁC vai trò đang chạy

    Nhánh ③ là điểm khác quan trọng so với bản cũ: người vận hành chỉ có tài khoản thật của
    hai phòng ban, đặt tên theo phòng ban, thì tool vẫn tự tìm ra cặp đối chứng — không bắt
    họ đặt lại tên biến cho giống một quy ước của tool.
    """
    dang = _hau_to(role_dang_chay)
    ten_khai = (os.environ.get('TOOLV2_ROLE_B') or os.environ.get('QA_ROLE_B')
                or _doc_tep_env().get('TOOLV2_ROLE_B') or _doc_tep_env().get('QA_ROLE_B') or '')
    if ten_khai:
        tk = tim(ten_khai)
        if tk and _hau_to(tk.role) != dang:
            return tk
    for o in uu_tien:
        tk = tim('ROLE_' + o) or tim(o)
        if tk and tk.khoa_user and _hau_to(tk.role) != dang:
            return tk
    for ten, _k in cac_role():
        if ten == dang or ten in ('A', 'ROLE_A'):
            continue
        tk = tim(ten)
        if tk and _hau_to(tk.role) != dang:
            return tk
    return None


def phien_san_co(duong_profile):
    """Hồ sơ Chrome này có dấu hiệu CÒN phiên đăng nhập không? -> bool.

    Nguồn ④ của §1: *"session đã đăng nhập"*. Đây chỉ là câu trả lời SƠ BỘ (có kho cookie
    không) — câu trả lời thật do chính app đưa ra ở `probe_live.dang_nhap`, nơi nó kiểm URL
    sau khi mở màn. Không đoán thay app: một cookie còn nằm trên đĩa không có nghĩa là phiên
    còn hiệu lực.
    """
    if not duong_profile or not os.path.isdir(duong_profile):
        return False
    for ten in ('Default/Cookies', 'Default/Network/Cookies', 'Cookies'):
        p = os.path.join(duong_profile, *ten.split('/'))
        try:
            if os.path.isfile(p) and os.path.getsize(p) > 0:
                return True
        except OSError:
            continue
    return False


def ma_tran():
    """Bản đồ vai trò -> ĐÃ có tài khoản chưa. Chỉ TÊN và CÓ/KHÔNG — không giá trị nào."""
    return {ten: True for ten, _ in cac_role()}


def tom_tat_kham_pha():
    """Khối *account discovery* cho báo cáo: nguồn nào đang bật, tìm ra vai trò nào.

    Không có giá trị bí mật nào trong khối này — chỉ tên biến, tên vai trò, tên nguồn.
    """
    try:
        tep = duong_tep_env()
        loi_tep = ''
    except TrongRepo as e:
        tep, loi_tep = None, str(e)
    return {
        'tien_to_khoa': tien_to(),
        'nguon': {
            'environment': True,
            'env_file': tep or '(không có)',
            'secret_command': bool(os.environ.get('TOOLV2_SECRET_CMD')),
        },
        'canh_bao': loi_tep,
        'vai_tro_tim_duoc': [ten for ten, _ in cac_role()],
        'role_b_khai_tuong_minh': (os.environ.get('TOOLV2_ROLE_B')
                                   or os.environ.get('QA_ROLE_B') or ''),
    }

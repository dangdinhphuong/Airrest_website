#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM NHIỀU PHIÊN — chạy THẬT: app giả + Chrome thật + `probe_live.py` thật.

Đây là phép kiểm cho phần khó nhất của Live Test: ba phiên chạy cùng lúc mà **không phiên nào
đụng phiên nào**, và những đường hỏng hay bị bỏ sót (phiên đang bận · một phiên chết · `--resume`
· cửa sổ `--hien` còn sót · Ctrl+C). Trước bản này không có phép kiểm nào cho chúng, nên mọi lỗi
multi-session chỉ lộ ra giữa việc thật.

Mỗi phép kiểm nói rõ nó CHỨNG MINH điều gì; thiếu điều kiện (không có Chrome) thì BỎ QUA và
nói thẳng là "không đo được", KHÔNG bao giờ tự nhận là đạt.

Mọi thứ ghi vào một thư mục tạm riêng (`QA_SESSION_DIR`), **không đụng `sessions/` của repo**.

    python3 tools/tu_kiem/kiem_da_phien.py           # exit 0 = đạt hết
    python3 tools/tu_kiem/kiem_da_phien.py --nhanh   # bỏ các phép kiểm chạy Chrome
"""
import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)
import app_gia                     # noqa: E402
import browser_manager as bm       # noqa: E402

PROBE = os.path.join(TOOLS, 'probe_live.py')
TK = {'A': ('admin@gia.vn', 'matkhau-A'),
      'B': ('teacher@gia.vn', 'matkhau-B'),
      'C': ('ba@gia.vn', 'matkhau-C')}

KQ = []


def kiem(ten, ham):
    t0 = time.time()
    try:
        ghi_chu = ham() or ''
        KQ.append((True, ten, ghi_chu))
        print('   ✔ %-52s %5.1fs %s' % (ten, time.time() - t0, ghi_chu))
    except _BoQua as e:
        KQ.append((None, ten, str(e)))
        print('   ⊘ %-52s BỎ QUA — %s (KHÔNG phải "đạt")' % (ten, e))
    except AssertionError as e:
        KQ.append((False, ten, str(e)))
        print('   ✘ %-52s %5.1fs\n       -> %s' % (ten, time.time() - t0, e))
    except Exception as e:                              # noqa: BLE001
        KQ.append((False, ten, '%s: %s' % (type(e).__name__, e)))
        print('   ✘ %-52s %5.1fs\n       -> %s: %s' % (ten, time.time() - t0,
                                                      type(e).__name__, e))


class _BoQua(Exception):
    pass


# ══════════════════════════════════════════════════════════════════════════════
# khung chạy
# ══════════════════════════════════════════════════════════════════════════════
class Khung:
    def __init__(self):
        self.srv = app_gia.chay(0)
        self.port = self.srv.server_address[1]
        self.goc = tempfile.mkdtemp(prefix='qa-kiem-phien-')

    def url(self, man='danh-muc-nguon'):
        return 'http://127.0.0.1:%d/admin/%s' % (self.port, man)

    def moi_truong(self, **kw):
        e = dict(os.environ, QA_SESSION_DIR=self.goc,
                 QA_HOME_PREFIX='/admin', QA_LOGIN_PATH='/login',
                 QA_SESSION_TIMEOUT='180')
        for k, (u, p) in TK.items():
            e['QA_USER_VAI' + k] = u
            e['QA_PASS_VAI' + k] = p
        e['QA_PASS_SAI'] = 'mat-khau-sai-hoan-toan'
        e.pop('QA_USER', None)          # không để tài khoản của máy lọt vào phép kiểm
        e.pop('QA_PASS', None)
        e.update(kw)
        return e

    def chay(self, args, env=None, giay=300, vao=None):
        return subprocess.run([sys.executable, PROBE] + args, env=env or self.moi_truong(),
                              capture_output=True, text=True, timeout=giay, input=vao)

    def st(self, sid):
        with open(os.path.join(self.goc, sid, 'state.json'), encoding='utf-8') as f:
            return json.load(f)

    def don(self):
        try:
            self.srv.shutdown()
        except Exception:
            pass
        for sid in os.listdir(self.goc):
            d = os.path.join(self.goc, sid)
            p = os.path.join(d, 'chrome-profile')
            if os.path.isdir(p):
                for q in bm._pid_theo_profile(p):
                    try:
                        os.kill(q, signal.SIGKILL)
                    except Exception:
                        pass
        shutil.rmtree(self.goc, ignore_errors=True)


K = None


def _co_chrome():
    if not shutil.which(bm.CHROME) and not os.path.isfile(bm.CHROME):
        raise _BoQua('không có %s trên máy' % bm.CHROME)


# ══════════════════════════════════════════════════════════════════════════════
# ① BA PHIÊN SONG SONG — cách ly thư mục · cổng · profile · cookie · log · trạng thái
# ══════════════════════════════════════════════════════════════════════════════
def t_song_song():
    """Chứng minh: A/B/C chạy cùng lúc, mỗi phiên MỘT browser + MỘT bộ cookie của riêng nó."""
    _co_chrome()
    cfg = {'sessions': [
        {'session_id': 'phien-A', 'url': K.url('danh-muc-nguon'), 'role': 'VaiA',
         'user_env': 'QA_USER_VAIA', 'pass_env': 'QA_PASS_VAIA'},
        {'session_id': 'phien-B', 'url': K.url('danh-muc-dich'), 'role': 'VaiB',
         'user_env': 'QA_USER_VAIB', 'pass_env': 'QA_PASS_VAIB'},
        {'session_id': 'phien-C', 'url': K.url('danh-muc-khac'), 'role': 'VaiC',
         'user_env': 'QA_USER_VAIC', 'pass_env': 'QA_PASS_VAIC'}]}
    f = os.path.join(K.goc, 'sessions.json')
    with open(f, 'w', encoding='utf-8') as fh:
        json.dump(cfg, fh, ensure_ascii=False)
    r = K.chay(['--config', f, '--parallel', '3'])
    assert r.returncode == 0, 'có phiên hỏng (exit %d)\n%s' % (r.returncode, r.stdout[-1500:])

    cong, cookie, thu_muc = {}, {}, {}
    for sid, (u, _) in zip(('phien-A', 'phien-B', 'phien-C'), TK.values()):
        st = K.st(sid)
        assert st['trang_thai'] == 'COMPLETED', '%s: %s %s' % (sid, st['trang_thai'],
                                                               st.get('ly_do'))
        cong[sid] = st.get('cong')
        thu_muc[sid] = os.path.join(K.goc, sid)
        # cookie đọc từ CHÍNH browser của phiên -> đây là bằng chứng profile không dùng chung
        with open(os.path.join(K.goc, sid, 'cookies', 'cookies.json'), encoding='utf-8') as fh:
            ck = json.load(fh)
        gt = {c['value'] for c in ck['cookies'] if c['name'] == 'phien'}
        assert len(gt) == 1, '%s: cookie phiên lạ %r' % (sid, gt)
        cookie[sid] = gt.pop()
        # log riêng
        lg = os.path.join(K.goc, sid, 'logs', 'live.log')
        assert os.path.isfile(lg) and os.path.getsize(lg) > 100, '%s: log rỗng' % sid

    assert len(set(cong.values())) == 3, 'CỔNG CDP TRÙNG NHAU: %r' % cong
    assert len(set(cookie.values())) == 3, \
        'BA PHIÊN DÙNG CHUNG COOKIE (profile bị dùng chung): %r' % cookie
    assert cookie['phien-A'] == TK['A'][0], 'phiên A đăng nhập nhầm tài khoản: %s' % cookie['phien-A']
    assert cookie['phien-B'] == TK['B'][0], 'phiên B đăng nhập nhầm tài khoản: %s' % cookie['phien-B']
    # mỗi phiên một thư mục, không phiên nào ghi vào thư mục phiên khác
    for sid in thu_muc:
        for khac in thu_muc:
            if khac != sid:
                assert not os.path.commonpath([thu_muc[sid], thu_muc[khac]]) == thu_muc[sid], \
                    'thư mục phiên lồng nhau: %s ⊂ %s' % (khac, sid)
    return 'cổng %s · 3 tài khoản khác nhau' % '/'.join(str(x) for x in cong.values())


# ══════════════════════════════════════════════════════════════════════════════
# ② PHIÊN ĐANG BẬN — không được mở Chrome/profile thứ hai
# ══════════════════════════════════════════════════════════════════════════════
def t_ban():
    """Chứng minh: tiến trình khác đang giữ phiên -> báo SESSION BUSY, KHÔNG mở browser nào."""
    sid = 'phien-A'
    d = os.path.join(K.goc, sid)
    assert os.path.isdir(d), 'chưa có phiên A (phép ① phải chạy trước)'
    prof = os.path.join(d, 'chrome-profile')
    truoc = len(bm._pid_theo_profile(prof, chi_chinh=True))
    giu = subprocess.Popen(
        [sys.executable, '-c',
         'import fcntl,sys,time;f=open(%r,"a+");fcntl.flock(f,fcntl.LOCK_EX);'
         'f.seek(0);f.truncate();f.write(str(__import__("os").getpid()));f.flush();'
         'print("GIU",flush=True);time.sleep(60)' % os.path.join(d, '.lock')],
        stdout=subprocess.PIPE, text=True)
    try:
        assert (giu.stdout.readline() or '').startswith('GIU'), 'không giữ được khoá'
        r = K.chay(['--session', sid, '--resume'], giay=90)
        assert r.returncode != 0, 'phiên đang bận mà vẫn chạy tiếp (exit 0)'
        ra = r.stdout + r.stderr
        assert 'SESSION BUSY' in ra, 'không báo SESSION BUSY:\n%s' % ra[-800:]
        assert str(giu.pid) in ra, 'không nói PID nào đang giữ:\n%s' % ra[-400:]
        time.sleep(1)
        sau = len(bm._pid_theo_profile(prof, chi_chinh=True))
        assert sau <= truoc, 'ĐÃ MỞ Chrome thứ hai trên profile đang bận (%d -> %d)' % (truoc, sau)
    finally:
        giu.kill()                      # SIGKILL = tiến trình chết BẤT THƯỜNG, không kịp dọn
        giu.wait(timeout=10)
    # §1E — chết bất thường KHÔNG được để phiên khoá vĩnh viễn. `flock` do kernel thả khi
    # tiến trình chết, nhưng file `.lock` vẫn còn và vẫn ghi PID cũ; phép kiểm này chốt rằng
    # cái còn lại đó không chặn được ai.
    import session_manager as sm
    for _ in range(20):
        if sm.Session(sid, K.goc).dang_chay() is None:
            break
        time.sleep(0.25)
    assert sm.Session(sid, K.goc).dang_chay() is None, \
        'giữ khoá bị kill -9 xong phiên vẫn báo BẬN -> khoá kẹt vĩnh viễn'
    r2 = K.chay(['--session', sid, '--resume'], giay=120)
    assert r2.returncode == 0, 'sau khi tiến trình giữ khoá chết, vẫn không vào lại được phiên'
    return 'báo đúng PID đang giữ, 0 browser mới, kill -9 không kẹt khoá'


# ══════════════════════════════════════════════════════════════════════════════
# ③ MỘT PHIÊN CHẾT — hai phiên còn lại vẫn chạy xong
# ══════════════════════════════════════════════════════════════════════════════
def t_mot_phien_chet():
    """Chứng minh §10/§11: A hỏng không kéo theo B/C, và câu lỗi nói rõ PHA hỏng."""
    _co_chrome()
    cfg = {'sessions': [
        # mật khẩu SAI + hạn 25s: phiên này chắc chắn gục ở PHA "đăng nhập", không phải lỗi
        # cấu hình -> đo được cả việc câu lỗi có nói đúng pha hay không.
        {'session_id': 'hong-A', 'url': K.url('m1'), 'role': 'Sai',
         'user_env': 'QA_USER_VAIA', 'pass_env': 'QA_PASS_SAI', 'timeout': 25},
        {'session_id': 'ok-B', 'url': K.url('m2'), 'role': 'VaiB',
         'user_env': 'QA_USER_VAIB', 'pass_env': 'QA_PASS_VAIB'},
        {'session_id': 'ok-C', 'url': K.url('m3'), 'role': 'VaiC',
         'user_env': 'QA_USER_VAIC', 'pass_env': 'QA_PASS_VAIC'}]}
    f = os.path.join(K.goc, 'hong.json')
    with open(f, 'w', encoding='utf-8') as fh:
        json.dump(cfg, fh, ensure_ascii=False)
    r = K.chay(['--config', f, '--parallel', '3'])
    assert r.returncode == 1, 'có phiên FAILED mà exit %d' % r.returncode
    a = K.st('hong-A')
    assert a['trang_thai'] == 'FAILED', 'phiên hỏng lại báo %s' % a['trang_thai']
    assert re.match(r'^\[[^\]]+\]', a.get('ly_do') or ''), \
        'câu lỗi KHÔNG nói pha nào: %r' % a.get('ly_do')
    assert 'đăng nhập' in (a.get('ly_do') or ''), \
        'câu lỗi nói sai pha (phải là đăng nhập): %r' % a.get('ly_do')
    for sid in ('ok-B', 'ok-C'):
        st = K.st(sid)
        assert st['trang_thai'] == 'COMPLETED', \
            'phiên A hỏng đã kéo theo %s (%s — %s)' % (sid, st['trang_thai'], st.get('ly_do'))
    assert 'hong-A' in r.stdout and 'Failed:    1' in r.stdout, \
        'bảng tổng kết không chỉ đúng phiên hỏng:\n%s' % r.stdout[-700:]
    return 'ly_do = %s' % (a.get('ly_do') or '')[:60]


# ══════════════════════════════════════════════════════════════════════════════
# ④ --resume — dùng lại kết quả, KHÔNG mở Chrome thứ hai
# ══════════════════════════════════════════════════════════════════════════════
def t_resume():
    """Chứng minh: phiên đã xong thì `--resume` in lại báo cáo mà không mở browser nào."""
    sid = 'phien-B'
    prof = os.path.join(K.goc, sid, 'chrome-profile')
    assert os.path.isdir(prof), 'chưa có phiên B (phép ① phải chạy trước)'
    r = K.chay(['--session', sid, '--resume'], giay=120)
    assert r.returncode == 0, 'resume hỏng (exit %d)\n%s' % (r.returncode, r.stdout[-900:])
    assert 'không mở Chrome' in r.stdout, 'resume vẫn mở Chrome:\n%s' % r.stdout[-900:]
    assert not bm._pid_theo_profile(prof), 'còn Chrome sống trên profile sau resume'
    # phiên C không bị resume của B đụng tới
    c_truoc = K.st('phien-C')
    assert c_truoc['trang_thai'] == 'COMPLETED', 'resume B làm hỏng trạng thái C'
    return 'không mở browser'


# ══════════════════════════════════════════════════════════════════════════════
# ⑤ CỬA SỔ --hien CÒN SỐNG — lượt sau ĐÍNH KÈM, không mở cái thứ hai
# ══════════════════════════════════════════════════════════════════════════════
def t_dinh_kem():
    """Chứng minh §1B: Chrome của lượt trước còn sống thì lượt sau dùng LẠI nó.

    Không chạy `--hien` thật (sẽ bật cửa sổ lên màn hình người dùng); dựng đúng tình huống ấy
    bằng một Chrome headless giữ nguyên + `state.json` ghi `chrome_giu`.
    """
    _co_chrome()
    import probe_live as pl
    import session_manager as sm
    sid = 'giu-chrome'
    ss = sm.Session(sid, K.goc).tao({'url': K.url()})
    c1 = bm.Chrome(hien=False, port='auto', profile=ss.profile, diet_cu=False)
    try:
        ss.st.update({'cong': c1.port, 'pid': c1.p.pid, 'pgid': c1.pgid, 'chrome_giu': True})
        sm.ghi_json(ss.f_state, ss.st)
        truoc = len(bm._pid_theo_profile(ss.profile, chi_chinh=True))
        v = pl.Viec(url=K.url(), sid=sid, hien=True, goc=K.goc)
        c2 = pl._mo_chrome(v, ss)
        assert c2.tu_mo is False, 'ĐÃ MỞ Chrome mới thay vì đính kèm cái đang sống'
        assert c2.port == c1.port, 'đính kèm nhầm cổng: %s != %s' % (c2.port, c1.port)
        assert c2.js('1+1') == 2, 'đính kèm xong không chạy được lệnh CDP'
        sau = len(bm._pid_theo_profile(ss.profile, chi_chinh=True))
        assert sau == truoc, 'số tiến trình Chrome trên profile tăng %d -> %d' % (truoc, sau)
        c2.close()
        assert bm.con_song(c1.p.pid), 'close() của bản ĐÍNH KÈM đã giết Chrome của lượt trước'

        # nhánh "treo": còn tiến trình nhưng CDP câm -> phải DỪNG, tuyệt đối không mở cái thứ hai
        ss.st['cong'] = 1            # cổng chắc chắn không có CDP nào
        sm.ghi_json(ss.f_state, ss.st)
        try:
            pl._mo_chrome(v, ss)
            raise AssertionError('CDP câm mà vẫn mở Chrome thứ hai trên cùng profile')
        except SystemExit as e:
            assert 'KHÔNG mở cái thứ hai' in str(e), 'câu báo không nói rõ lý do: %s' % e
        assert len(bm._pid_theo_profile(ss.profile, chi_chinh=True)) == truoc, \
            'vẫn lỡ mở thêm browser'
    finally:
        c1.close()
    return 'đính kèm đúng cổng, không sinh browser mới'


# ══════════════════════════════════════════════════════════════════════════════
# ⑥ HAI CHROME MỘT PROFILE — phải báo lỗi ĐỌC ĐƯỢC, không treo
# ══════════════════════════════════════════════════════════════════════════════
def t_hai_chrome_mot_profile():
    """Chứng minh §1A: mở Chrome thứ hai trên cùng `user-data-dir` thì báo lỗi nói rõ vì sao."""
    _co_chrome()
    prof = os.path.join(K.goc, 'profile-chung')
    c1 = bm.Chrome(hien=False, port='auto', profile=prof, diet_cu=False)
    try:
        t0 = time.time()
        try:
            c2 = bm.Chrome(hien=False, port='auto', profile=prof, diet_cu=False)
            c2.close()
            raise AssertionError('mở được HAI Chrome trên một user-data-dir mà không kêu gì')
        except SystemExit as e:
            assert 'user-data-dir' in str(e) or 'profile' in str(e), \
                'câu lỗi không chỉ ra nguyên nhân profile: %s' % e
        assert time.time() - t0 < 60, 'chờ quá lâu mới báo (%.0fs)' % (time.time() - t0)
    finally:
        c1.close()
    return 'báo đúng nguyên nhân, không treo'


# ══════════════════════════════════════════════════════════════════════════════
# ⑨ CỔNG CDP = ĐÚNG BROWSER CỦA MÌNH  (lớp lỗi im lặng nguy hiểm nhất của §2)
# ══════════════════════════════════════════════════════════════════════════════
def t_cong_dung_browser():
    """Chứng minh §2: mỗi phiên lái ĐÚNG browser của nó, và cổng bị chiếm thì DỪNG chứ không
    im lặng lái browser người khác.

    Đo được trên bản trước 2026-09-14: hai lượt cùng bốc phải cổng `N` (`bind(0)` rồi `close()`
    — khe hở không bịt được từ Python) thì Chrome thứ hai KHÔNG bind được `N` nhưng **vẫn chạy
    tiếp**, nên `/json/version` ở cổng đó vẫn có người trả lời. Lượt 2 lái đúng cái tab của
    lượt 1: `document.title` đọc ra `TAB-CUA-PHIEN-1` dù nó khai `user-data-dir` khác hẳn.
    Cả phiên chạy trên cookie của phiên khác, không một dòng lỗi.
    """
    _co_chrome()
    d = os.path.join(K.goc, 'cong')
    p1, p2 = os.path.join(d, 'p1'), os.path.join(d, 'p2')
    c1 = bm.Chrome(hien=False, port='auto', profile=p1, diet_cu=False)
    c2 = None
    try:
        c1.go('data:text/html,<title>TAB-CUA-PHIEN-1</title>')
        time.sleep(1.5)
        assert c1.js('document.title') == 'TAB-CUA-PHIEN-1', 'không đặt được mốc ở browser 1'
        c2 = bm.Chrome(hien=False, port='auto', profile=p2, diet_cu=False)
        assert c2.port != c1.port, 'HAI PHIÊN CHUNG MỘT CỔNG CDP: %d' % c1.port
        t = c2.js('document.title')
        assert t != 'TAB-CUA-PHIEN-1', \
            'phiên 2 đang lái BROWSER CỦA PHIÊN 1 (cổng %d/%d) — cách ly profile vô nghĩa' \
            % (c1.port, c2.port)
        # cổng đọc từ `DevToolsActivePort` của CHÍNH profile mình -> không thể là của ai khác
        for c, prof in ((c1, p1), (c2, p2)):
            f = os.path.join(prof, 'DevToolsActivePort')
            assert os.path.isfile(f), 'Chrome không ghi DevToolsActivePort ở %s' % prof
            assert int(open(f).readline().strip()) == c.port, \
                'cổng đang dùng KHÁC cổng Chrome tự ghi ra -> đang nói chuyện với browser khác'
        # đường cổng CỐ ĐỊNH (không có `--session`): cổng bị chiếm thì phải DỪNG, không lái nhầm
        try:
            c3 = bm.Chrome(hien=False, port=c1.port, profile=os.path.join(d, 'p3'),
                           diet_cu=False)
            c3.close()
            raise AssertionError('cổng đang bị chiếm mà vẫn mở, không cảnh báo gì')
        except SystemExit as e:
            assert 'cổng CDP' in str(e) and str(c1.port) in str(e), \
                'câu lỗi không nói rõ cổng nào: %s' % e
    finally:
        for c in (c1, c2):
            if c is not None:
                c.close()
    return 'cổng %d/%d, mỗi phiên một browser' % (c1.port, c2.port)


# ══════════════════════════════════════════════════════════════════════════════
# ⑦ QUYỀN FILE + KHÔNG RÒ TOKEN
# ══════════════════════════════════════════════════════════════════════════════
def t_bao_mat():
    """Chứng minh §6: file chứa token là 0600, thư mục 0700, và token KHÔNG lọt ra báo cáo."""
    if os.name != 'posix':
        raise _BoQua('không phải hệ POSIX')
    sid = 'phien-A'
    d = os.path.join(K.goc, sid)
    assert os.path.isdir(d), 'chưa có phiên A (phép ① phải chạy trước)'
    for ten in ('cookies/cookies.json', 'cookies/storage.json'):
        p = os.path.join(d, ten)
        assert os.path.isfile(p), 'thiếu %s' % ten
        m = os.stat(p).st_mode & 0o777
        assert m == 0o600, '%s có quyền %o (phải 600 — file này chứa token)' % (ten, m)
    for ten in ('cookies', 'chrome-profile', '.'):
        m = os.stat(os.path.join(d, ten)).st_mode & 0o777
        assert m == 0o700, 'thư mục %s có quyền %o (phải 700)' % (ten, m)
    # giá trị cookie THẬT không được nằm trong báo cáo / kết quả / log
    with open(os.path.join(d, 'cookies', 'cookies.json'), encoding='utf-8') as f:
        ck = json.load(f)['cookies']
    # Chỉ soi cookie TOKEN (`tk`) — giá trị mờ, không suy ra được từ tên tài khoản. Cookie
    # `phien` chứa chính email đăng nhập nên nó NẰM TRONG log là đúng (dòng "ROLE: … tài
    # khoản …"), không phải rò rỉ; soi cả hai là tự tạo báo động giả.
    gt = [c['value'] for c in ck if c.get('name') == 'tk' and len(c.get('value') or '') >= 16]
    assert gt, 'app giả không đặt cookie token -> phép kiểm này không chứng minh được gì'
    for f_ra in ('result/report.txt', 'result/probe.json', 'logs/live.log', 'config.json'):
        p = os.path.join(d, f_ra)
        if not os.path.isfile(p):
            continue
        noi_dung = open(p, encoding='utf-8', errors='replace').read()
        for v in gt:
            assert v not in noi_dung, 'GIÁ TRỊ COOKIE lọt vào %s' % f_ra
    # mật khẩu không bao giờ nằm trên đĩa
    cfg = open(os.path.join(d, 'config.json'), encoding='utf-8').read()
    for _u, pw in TK.values():
        assert pw not in cfg, 'MẬT KHẨU nằm trong config.json'
    return '600/700, không rò token'


# ══════════════════════════════════════════════════════════════════════════════
# ⑧ Ctrl+C — thoát sạch, không traceback, phiên được ghi FAILED
# ══════════════════════════════════════════════════════════════════════════════
def t_ctrl_c():
    """Chứng minh §10: SIGINT giữa chừng -> mã thoát 130, không đổ traceback."""
    _co_chrome()
    sid = 'ngat-ngang'
    p = subprocess.Popen([sys.executable, PROBE, K.url(), '--session', sid, '--new',
                          '--role', 'VaiA'],
                         env=K.moi_truong(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True)
    time.sleep(7)                       # để nó vào giữa lúc mở Chrome / đăng nhập
    p.send_signal(signal.SIGINT)
    try:
        ra = p.communicate(timeout=90)[0]
    except subprocess.TimeoutExpired:
        p.kill()
        raise AssertionError('Ctrl+C không dừng được — treo')
    assert p.returncode == 130, 'mã thoát %s (mong 130)' % p.returncode
    assert 'Traceback' not in ra, 'đổ traceback trần ra màn hình:\n%s' % ra[-800:]
    assert 'DỪNG theo Ctrl+C' in ra, 'không nói gì khi bị ngắt:\n%s' % ra[-500:]
    prof = os.path.join(K.goc, sid, 'chrome-profile')
    for _ in range(20):
        if not bm._pid_theo_profile(prof):
            break
        time.sleep(0.5)
    assert not bm._pid_theo_profile(prof), 'Ctrl+C xong vẫn còn Chrome mồ côi'
    return 'exit 130, dọn sạch Chrome'


# ══════════════════════════════════════════════════════════════════════════════
def main():
    global K
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--nhanh', action='store_true', help='bỏ các phép kiểm phải chạy Chrome')
    a = ap.parse_args()
    K = Khung()
    print('TỰ KIỂM NHIỀU PHIÊN — app giả ở cổng %d · thư mục phiên %s' % (K.port, K.goc))
    try:
        if a.nhanh:
            print('   (--nhanh: chỉ chạy phép kiểm không cần Chrome)')
        else:
            kiem('① 3 phiên song song: cổng/profile/cookie/log riêng', t_song_song)
            kiem('② phiên đang bận -> SESSION BUSY, 0 browser mới', t_ban)
            kiem('③ 1 phiên chết, 2 phiên kia vẫn xong', t_mot_phien_chet)
            kiem('④ --resume: dùng lại kết quả, không mở Chrome', t_resume)
            kiem('⑤ Chrome --hien còn sống -> ĐÍNH KÈM, không mở cái thứ 2', t_dinh_kem)
            kiem('⑥ 2 Chrome 1 user-data-dir -> báo lỗi rõ, không treo', t_hai_chrome_mot_profile)
            kiem('⑨ cổng CDP -> ĐÚNG browser của mình, cổng bận thì dừng',
                 t_cong_dung_browser)
            kiem('⑧ Ctrl+C -> exit 130, không traceback, dọn Chrome', t_ctrl_c)
        kiem('⑦ quyền file 600/700 + không rò token', t_bao_mat)
    finally:
        K.don()
    hong = [x for x in KQ if x[0] is False]
    bo = [x for x in KQ if x[0] is None]
    print('\n=== %d phép kiểm · %d ĐẠT · %d HỎNG · %d BỎ QUA ==='
          % (len(KQ), len(KQ) - len(hong) - len(bo), len(hong), len(bo)))
    if bo:
        print('   ⚠ %d phép BỎ QUA = KHÔNG ĐO ĐƯỢC, không phải "sạch".' % len(bo))
    return 1 if hong else 0


if __name__ == '__main__':
    sys.exit(main())

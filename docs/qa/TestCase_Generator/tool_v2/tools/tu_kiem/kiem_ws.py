#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM lớp WebSocket/CDP của `browser_manager.WS` — KHÔNG cần Chrome.

Dựng một máy chủ WebSocket giả trong luồng phụ, ép nó gửi đúng những khung mà bản cũ xử sai,
rồi đo hành vi. Mỗi phép kiểm gắn với một lỗi CỤ THỂ, không phải "chạy thử cho vui":

    ① khung text thường                 -> phải nhận đúng phản hồi theo `id`
    ② sự kiện KHÔNG có `id` chen vào    -> KHÔNG được nhận nhầm thành phản hồi
    ③ phản hồi của lệnh CŨ đến muộn     -> phải bỏ qua, lấy đúng phản hồi của lệnh đang chờ
    ④ khung PHÂN MẢNH (FIN=0 + 0x0)     -> phải ghép lại, KHÔNG `JSONDecodeError`
    ⑤ khung PING                        -> phải PONG lại, không chết, vẫn chạy tiếp
    ⑥ khung BINARY                      -> bỏ qua êm, không chết
    ⑦ khung CLOSE                       -> `MatKetNoi` có nghĩa, KHÔNG treo tới hết giờ
    ⑧ máy chủ im lặng                   -> `TimeoutError` kèm TÊN LỆNH, không treo vô hạn
    ⑨ máy chủ ngắt socket giữa chừng    -> `MatKetNoi`, không treo
    ⑩ CDP trả `error`                   -> `LoiCDP` kèm tên lệnh

    python3 tools/tu_kiem/kiem_ws.py          # exit 0 = đạt hết
"""
import base64
import hashlib
import json
import os
import socket
import struct
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import browser_manager as bm          # noqa: E402

GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


def _khung(op, payload=b'', fin=True):
    """Khung server->client: KHÔNG mask (đúng RFC 6455 §5.1)."""
    h = bytes([(0x80 if fin else 0) | op])
    n = len(payload)
    if n < 126:
        h += bytes([n])
    elif n < 65536:
        h += bytes([126]) + struct.pack('>H', n)
    else:
        h += bytes([127]) + struct.pack('>Q', n)
    return h + payload


class MayChuGia:
    """Máy chủ WS một kết nối; `kich_ban(conn, doc)` quyết định gửi gì."""

    def __init__(self, kich_ban):
        self.kich_ban = kich_ban
        self.srv = socket.socket()
        self.srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.srv.bind(('127.0.0.1', 0))
        self.srv.listen(1)
        self.port = self.srv.getsockname()[1]
        self.loi = None
        self.t = threading.Thread(target=self._chay, daemon=True)
        self.t.start()

    @property
    def url(self):
        return 'ws://127.0.0.1:%d/devtools/page/GIA' % self.port

    def _chay(self):
        try:
            conn, _ = self.srv.accept()
            buf = b''
            while b'\r\n\r\n' not in buf:
                buf += conn.recv(4096)
            key = ''
            for ln in buf.decode('latin1').split('\r\n'):
                if ln.lower().startswith('sec-websocket-key:'):
                    key = ln.split(':', 1)[1].strip()
            acc = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
            conn.sendall(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n'
                          'Connection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n'
                          % acc).encode())
            self.kich_ban(conn, lambda: _doc_khung(conn))
        except Exception as e:                    # noqa: BLE001 — ghi lại để phép kiểm thấy
            self.loi = '%s: %s' % (type(e).__name__, e)
        finally:
            try:
                self.srv.close()
            except Exception:
                pass


def _doc_khung(conn):
    """Đọc một khung client->server (luôn có mask) -> (opcode, payload)."""
    def need(n):
        b = b''
        while len(b) < n:
            d = conn.recv(n - len(b))
            if not d:
                raise EOFError('client đóng')
            b += d
        return b
    h = need(2)
    op, ln = h[0] & 0x0f, h[1] & 0x7f
    if ln == 126:
        ln = struct.unpack('>H', need(2))[0]
    elif ln == 127:
        ln = struct.unpack('>Q', need(8))[0]
    mask = need(4) if h[1] & 0x80 else b'\0\0\0\0'
    pay = need(ln)
    return op, bytes(b ^ mask[i % 4] for i, b in enumerate(pay))


KQ = []


def kiem(ten, ham):
    try:
        ham()
        KQ.append((True, ten, ''))
        print('   ✔ %s' % ten)
    except AssertionError as e:
        KQ.append((False, ten, str(e)))
        print('   ✘ %s  -> %s' % (ten, e))
    except Exception as e:                        # noqa: BLE001
        KQ.append((False, ten, '%s: %s' % (type(e).__name__, e)))
        print('   ✘ %s  -> %s: %s' % (ten, type(e).__name__, e))


# ── ① text thường + ② sự kiện không id + ③ phản hồi lệnh cũ ────────────────────────────
def _kb_co_ban(conn, doc):
    doc()                                          # lệnh 1
    conn.sendall(_khung(0x1, json.dumps({'method': 'Page.loadEventFired',
                                         'params': {}}).encode()))     # sự kiện, KHÔNG id
    conn.sendall(_khung(0x1, json.dumps({'id': 99, 'result': {'cu': 1}}).encode()))  # id lạ
    conn.sendall(_khung(0x1, json.dumps({'id': 1, 'result': {'ok': 'MOT'}}).encode()))
    time.sleep(5)


def t_co_ban():
    s = MayChuGia(_kb_co_ban)
    w = bm.WS(s.url, timeout=5)
    r = w.call('Runtime.evaluate', giay=8)
    assert r == {'ok': 'MOT'}, 'nhận nhầm: %r (sự kiện/phản hồi cũ bị coi là phản hồi)' % (r,)
    w.close()


# ── ④ phân mảnh ────────────────────────────────────────────────────────────────────────
def _kb_manh(conn, doc):
    doc()
    body = json.dumps({'id': 1, 'result': {'ok': 'GHEP', 'dem': 'x' * 300}}).encode()
    conn.sendall(_khung(0x1, body[:40], fin=False))
    conn.sendall(_khung(0x0, body[40:120], fin=False))
    conn.sendall(_khung(0x0, body[120:], fin=True))
    time.sleep(5)


def t_manh():
    s = MayChuGia(_kb_manh)
    w = bm.WS(s.url, timeout=5)
    r = w.call('Runtime.evaluate', giay=8)
    assert r.get('ok') == 'GHEP', 'không ghép được khung phân mảnh: %r' % (r,)
    w.close()


# ── ⑤ ping -> pong + ⑥ binary ──────────────────────────────────────────────────────────
_PONG = {}


def _kb_ping(conn, doc):
    doc()
    conn.sendall(_khung(0x9, b'song-khong'))                 # PING
    op, pay = _doc_khung(conn)
    _PONG['op'], _PONG['pay'] = op, pay
    conn.sendall(_khung(0x2, b'\x00\x01\x02nhi phan'))       # BINARY -> phải bỏ qua êm
    conn.sendall(_khung(0x1, json.dumps({'id': 1, 'result': {'ok': 'PONG'}}).encode()))
    time.sleep(5)


def t_ping():
    s = MayChuGia(_kb_ping)
    w = bm.WS(s.url, timeout=5)
    r = w.call('Runtime.evaluate', giay=8)
    assert _PONG.get('op') == 0xA, 'client KHÔNG pong lại ping (nhận %r)' % (_PONG.get('op'),)
    assert _PONG.get('pay') == b'song-khong', 'pong sai payload: %r' % (_PONG.get('pay'),)
    assert r.get('ok') == 'PONG', 'khung nhị phân làm hỏng luồng: %r' % (r,)
    w.close()


# ── ⑦ close ────────────────────────────────────────────────────────────────────────────
def _kb_close(conn, doc):
    doc()
    conn.sendall(_khung(0x8, struct.pack('>H', 1001) + 'trinh duyet tat'.encode()))
    time.sleep(5)


def t_close():
    s = MayChuGia(_kb_close)
    w = bm.WS(s.url, timeout=5)
    t0 = time.time()
    try:
        w.call('Runtime.evaluate', giay=30)
        raise AssertionError('nuốt mất khung CLOSE — không báo lỗi gì')
    except bm.MatKetNoi as e:
        assert 'Runtime.evaluate' in str(e), 'lỗi không nói lệnh nào: %s' % e
        assert '1001' in str(e), 'lỗi không nói mã đóng: %s' % e
    assert time.time() - t0 < 10, 'chờ hết %.0fs mới báo (phải báo NGAY)' % (time.time() - t0)
    w.close()


# ── ⑧ im lặng -> hết giờ ───────────────────────────────────────────────────────────────
def _kb_im(conn, doc):
    doc()
    time.sleep(20)


def t_het_gio():
    s = MayChuGia(_kb_im)
    w = bm.WS(s.url, timeout=2)
    t0 = time.time()
    try:
        w.call('Page.navigate', giay=3)
        raise AssertionError('không hết giờ — treo hoặc trả bừa')
    except TimeoutError as e:
        assert 'Page.navigate' in str(e), 'lỗi hết giờ không nói lệnh nào: %s' % e
    d = time.time() - t0
    assert 2.0 < d < 8.0, 'hết giờ sai nhịp: %.1fs (đặt 3s)' % d
    w.close()


# ── ⑨ đứt socket giữa chừng ────────────────────────────────────────────────────────────
def _kb_dut(conn, doc):
    doc()
    time.sleep(0.3)
    conn.close()


def t_dut():
    s = MayChuGia(_kb_dut)
    w = bm.WS(s.url, timeout=5)
    t0 = time.time()
    try:
        w.call('Runtime.evaluate', giay=20)
        raise AssertionError('socket đứt mà vẫn trả kết quả')
    except bm.MatKetNoi as e:
        assert 'Runtime.evaluate' in str(e), 'lỗi không nói lệnh nào: %s' % e
    assert time.time() - t0 < 10, 'đứt socket mà chờ tới %.0fs' % (time.time() - t0)
    w.close()


# ── ⑩ CDP trả error ────────────────────────────────────────────────────────────────────
def _kb_loi(conn, doc):
    doc()
    conn.sendall(_khung(0x1, json.dumps(
        {'id': 1, 'error': {'code': -32000, 'message': 'Cannot find context'}}).encode()))
    time.sleep(5)


def t_loi_cdp():
    s = MayChuGia(_kb_loi)
    w = bm.WS(s.url, timeout=5)
    try:
        w.call('Runtime.evaluate', giay=8)
        raise AssertionError('CDP báo error mà client coi là thành công')
    except bm.LoiCDP as e:
        assert 'Cannot find context' in str(e), 'mất nội dung lỗi: %s' % e
    # LoiCDP phải là RuntimeError để chỗ cũ `except RuntimeError` không đổi hành vi
    assert issubclass(bm.LoiCDP, RuntimeError), 'LoiCDP không còn là RuntimeError'
    w.close()


def main():
    print('TỰ KIỂM WebSocket/CDP (máy chủ giả, không cần Chrome)')
    kiem('① text + ② sự kiện không id + ③ phản hồi lệnh cũ', t_co_ban)
    kiem('④ khung phân mảnh (FIN=0 + continuation)', t_manh)
    kiem('⑤ PING -> PONG  · ⑥ khung nhị phân bỏ qua êm', t_ping)
    kiem('⑦ khung CLOSE -> báo ngay, đúng nguyên nhân', t_close)
    kiem('⑧ máy chủ im -> TimeoutError kèm tên lệnh', t_het_gio)
    kiem('⑨ socket đứt -> MatKetNoi, không treo', t_dut)
    kiem('⑩ CDP trả error -> LoiCDP kèm tên lệnh', t_loi_cdp)
    hong = [x for x in KQ if not x[0]]
    print('\n=== %d phép kiểm · %d ĐẠT · %d HỎNG ===' % (len(KQ), len(KQ) - len(hong), len(hong)))
    return 1 if hong else 0


if __name__ == '__main__':
    sys.exit(main())

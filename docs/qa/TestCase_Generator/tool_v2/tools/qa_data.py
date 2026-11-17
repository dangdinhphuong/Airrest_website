# -*- coding: utf-8 -*-
"""SỔ DỮ LIỆU QA — vòng đời bản ghi do tool tự tạo để chạy case GHI  (mới 2026-09-15 lượt 4).

Vì sao có file này: `chay_live.py` chặn ĐÚNG mọi thao tác ghi, nhưng vì không có cách nào tạo
ra dữ liệu của chính nó nên 69/297 case của `LoaiNguon` phải để trống — "tool chưa làm" bị đọc
thành "không đo được". Khối này là thứ còn thiếu: **dữ liệu QA có chủ, có sổ, có hạn dọn**.

    SETUP  →  CHẠY CASE  →  NGHIỆM THU  →  DỌN  →  NGHIỆM THU DỌN

Ba câu hỏi mà mọi thao tác ghi phải trả lời được TRƯỚC khi chạm app, và sổ này giữ câu trả lời:

    ① bản ghi này do AI tạo?        -> `ma` mang dấu của CHÍNH lượt chạy (`qalib.la_ma_cua_run`)
    ② tạo trong lượt nào, case nào? -> mục trong sổ, có `run_id` · `case` · `luc`
    ③ ai là chủ?                    -> `van_tay` = băm(tài khoản + origin + run) của phiên tạo

Không đủ ba là **CHẶN** — không có nhánh nào trong file này trả về "thôi cứ cho qua".

Sổ nằm ở `sessions/<id>/qa-data/so.json`, ghi lại sau MỖI thay đổi (không gom cuối lượt): tiến
trình chết giữa chừng thì thứ còn lại trên đĩa phải đủ để lượt sau dọn được rác của lượt trước.
Đó cũng là nguồn của `--resume` (§16 của chỉ thị): cùng một phiên thì **dùng lại `run_id` cũ**,
nên bản ghi tạo ở lượt trước vẫn chứng minh được quyền sở hữu thay vì thành rác vô chủ.
"""
import json
import os
import time

import qalib
from qalib import norm as qalib_norm

# ── trạng thái một bản ghi QA trong sổ ────────────────────────────────────────────────────
DINH = 'DINH_TAO'      # đã khai ý định tạo, CHƯA xác nhận có trên app (chết ở đây = phải soi)
SONG = 'CON_SONG'      # đã xác nhận có trên app, đang dùng
DA_XOA = 'DA_XOA'      # chính case đã xoá (case "xóa thành công") — coi như đã dọn
DA_DON = 'DA_DON'      # bước CLEANUP đã xoá
KHONG_THAY = 'KHONG_THAY'   # dọn tới nơi thì bản ghi đã không còn -> vẫn là CLEAN (§8)
DON_HONG = 'DON_HONG'  # dọn thất bại -> CLEANUP_FAILED, dừng mọi mutation khác (§8)

# CÒN TỒN = còn nằm trên hệ thống, còn phải dọn. `DON_HONG` **nằm trong đây**: một bản ghi
# dọn hỏng vẫn đang ở trên app, nên nó là thứ cần dọn nhất chứ không phải thứ để bỏ qua.
# ⚠️ Bản đầu để `DON_HONG` ra ngoài ⇒ sau một `CLEANUP_FAILED`, lệnh `--don-du-lieu-qa` báo
# "không còn gì để dọn" trong khi bản ghi vẫn nằm trên hệ thống thật (bắt được ở lượt chạy
# live 15/09). Lối dọn sau sự cố mà không dọn được chính thứ gây sự cố thì vô dụng.
CON_TON = (DINH, SONG, DON_HONG)
SACH = (DA_XOA, DA_DON, KHONG_THAY)

# TRẦN SỐ BẢN GHI QA một lượt chạy được tạo. Van an toàn cho ca "phép đo nào đó lặp vô hạn
# vì màn không như hồ sơ khai": mỗi vòng lặp hỏng là một bản ghi thật nằm lại trên hệ thống
# của người ta. Chạm trần là DỪNG — dừng sớm thì còn dọn được, chạy tiếp thì không.
# Bộ `LoaiNguon` (297 case) dùng hết ~40 bản ghi; để 200 là rộng gấp năm lần nhu cầu thật.
TRAN_BAN_GHI = int(os.environ.get('QA_TRAN_BAN_GHI', '200') or 200)


class LoiSoQA(RuntimeError):
    """Sổ dữ liệu QA từ chối một thao tác. KHÔNG được bắt rồi đi đường khác."""


def _gio():
    return time.strftime('%Y-%m-%d %H:%M:%S')


class SoQA:
    """Sổ dữ liệu QA của MỘT lượt chạy (một phiên, một màn).

    `duong` là file JSON; `None` thì sổ chỉ nằm trong bộ nhớ (dùng cho `--dry-run` và tự kiểm).
    """

    def __init__(self, duong=None, run_id=None, tai_khoan='', origin='', thuc_the='',
                 ngan=None):
        self.duong = duong
        self.thuc_the = thuc_the
        # Ngăn cách của mã bản ghi — suy từ `code_regex` của MÀN (qalib.qa_ngan_cach).
        # Nằm ở sổ chứ không ở từng phép đo vì `cap_ma()` được gọi từ 15 chỗ, không chỗ
        # nào biết ràng buộc mã của màn; và vì bước DỌN ở lượt sau phải sinh lại đúng
        # thứ mã đã tạo -> giá trị này đi xuống đĩa cùng sổ.
        self.ngan = ngan if ngan in qalib.QA_NGAN_CACH else None
        self.muc = {}                 # ma -> mục
        self.seq = 0
        self.run_id = None
        self.van_tay = ''
        self.tai_khoan_bam = ''
        self.lich_su = []
        cu = self._doc()
        if cu and cu.get('run_id'):
            # RESUME — dùng lại run id cũ. Sinh run mới ở đây là biến bản ghi lượt trước thành
            # rác không ai chứng minh được quyền sở hữu, và §16 cấm đúng điều đó.
            self.run_id = cu['run_id']
            self.seq = int(cu.get('seq') or 0)
            self.muc = {k: dict(v) for k, v in (cu.get('muc') or {}).items()}
            self.lich_su = list(cu.get('lich_su') or [])
            self.van_tay = cu.get('van_tay') or ''
            # RESUME giữ ngăn cách của lượt gốc: đổi giữa chừng là sinh ra một HỌ mã thứ
            # hai mà bước dọn không đối chiếu được với bản ghi đã nằm trên app.
            if cu.get('ngan') in qalib.QA_NGAN_CACH:
                self.ngan = cu['ngan']
        else:
            self.run_id = run_id or qalib.qa_run_id()
        if tai_khoan or origin:
            vt = qalib.dau_van_tay(tai_khoan, origin, self.run_id)
            if self.van_tay and vt != self.van_tay:
                raise LoiSoQA(
                    'SỔ DỮ LIỆU QA của phiên này được tạo bởi một CHỦ KHÁC (tài khoản/origin '
                    'khác). Bản ghi trong sổ không thuộc quyền thao tác của lượt chạy hiện tại '
                    '⇒ không được sửa/xoá gì.\n'
                    '   Muốn dọn rác của chủ cũ: chạy lại đúng tài khoản đã tạo chúng.\n'
                    '   Muốn chạy mới: đổi --session (sổ mới, run id mới).')
            self.van_tay = vt
        if not self.thuc_the:
            self.thuc_the = (cu or {}).get('thuc_the') or ''

    # ── đĩa ──────────────────────────────────────────────────────────────────
    def _doc(self):
        if not self.duong or not os.path.exists(self.duong):
            return None
        try:
            with open(self.duong, encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return None

    def cat(self):
        """Ghi sổ xuống đĩa NGAY. Gọi sau mỗi thay đổi, không gom cuối lượt."""
        if not self.duong:
            return
        os.makedirs(os.path.dirname(os.path.abspath(self.duong)), exist_ok=True)
        tam = self.duong + '.tmp'
        with open(tam, 'w', encoding='utf-8') as f:
            json.dump(self.khoi(), f, ensure_ascii=False, indent=1)
        os.replace(tam, self.duong)      # thay một nhát: chết giữa chừng không để lại sổ nửa vời

    def khoi(self):
        return {'luc': _gio(), 'run_id': self.run_id, 'van_tay': self.van_tay,
                'thuc_the': self.thuc_the, 'seq': self.seq, 'ngan': self.ngan,
                'muc': self.muc, 'lich_su': self.lich_su[-400:],
                'tom_tat': self.tom_tat()}

    def _ghi_su(self, viec, ma='', chi_tiet=''):
        self.lich_su.append({'luc': _gio(), 'viec': viec, 'ma': ma, 'chi_tiet': str(chi_tiet)[:200]})

    # ── cấp mã ───────────────────────────────────────────────────────────────
    def cap_ma(self, hau=''):
        """(mã, tên hiển thị) cho một bản ghi QA MỚI. Chưa ghi gì vào sổ — xem `khai_tao`."""
        if self.seq >= TRAN_BAN_GHI:
            raise LoiSoQA(
                'lượt chạy đã cấp %d mã bản ghi QA — chạm TRẦN %d (QA_TRAN_BAN_GHI). Con số này '
                'lớn bất thường: nhiều khả năng một phép đo đang lặp vì màn thật khác hồ sơ màn. '
                'DỪNG để còn dọn được; nâng trần chỉ khi đã biết vì sao cần nhiều đến thế.'
                % (self.seq, TRAN_BAN_GHI))
        self.seq += 1
        return (qalib.qa_ma_ban_ghi(self.run_id, self.seq, self.ngan),
                qalib.qa_ten_hien_thi(self.run_id, self.seq, hau, self.ngan))

    # ── vòng đời ─────────────────────────────────────────────────────────────
    def khai_tao(self, ma, ten, case_key, ghi_chu=''):
        """Khai Ý ĐỊNH tạo — ghi sổ TRƯỚC khi bấm nút Lưu.

        Thứ tự này không đảo được: bấm trước rồi ghi sổ sau thì một lần chết giữa chừng để lại
        bản ghi trên app mà **không có dòng nào** trên đĩa nói nó tồn tại — đúng định nghĩa
        rác không ai dọn được.
        """
        if not qalib.la_ma_cua_run(ma, self.run_id):
            raise LoiSoQA('mã %r không mang dấu của lượt chạy %s ⇒ không được ghi vào sổ QA'
                          % (ma, self.run_id))
        if ma in self.muc and self.muc[ma]['trang_thai'] in CON_TON:
            raise LoiSoQA('mã %r đã có trong sổ và đang còn sống — không tạo trùng (§16)' % ma)
        self.muc[ma] = {'ma': ma, 'ten': ten, 'thuc_the': self.thuc_the,
                        'trang_thai': DINH, 'id_app': None,
                        'case_tao': case_key, 'tao_luc': _gio(), 'don_luc': None,
                        'van_tay': self.van_tay, 'ghi_chu': ghi_chu,
                        'hanh_dong': [{'luc': _gio(), 'case': case_key, 'viec': 'khai_tao'}]}
        self._ghi_su('khai_tao', ma, case_key)
        self.cat()
        return self.muc[ma]

    def xac_nhan_tao(self, ma, id_app=None, co_tren_app=True):
        """Xác nhận bản ghi ĐÃ có thật trên app (VERIFY của lifecycle)."""
        m = self._can(ma)
        if not co_tren_app:
            # Không xác nhận được là **không** hạ trạng thái xuống "sạch": bản ghi có thể đã
            # tạo mà danh sách chưa kịp làm mới. Giữ DINH_TAO để bước dọn vẫn đi tìm nó.
            m['hanh_dong'].append({'luc': _gio(), 'viec': 'xac_nhan_tao', 'ket_qua': 'KHÔNG THẤY'})
            self._ghi_su('xac_nhan_tao_that_bai', ma)
            self.cat()
            return False
        m['trang_thai'] = SONG
        if id_app:
            m['id_app'] = str(id_app)
        m['hanh_dong'].append({'luc': _gio(), 'viec': 'xac_nhan_tao', 'id_app': m['id_app']})
        self._ghi_su('xac_nhan_tao', ma, m['id_app'] or '')
        self.cat()
        return True

    def buoc_id(self, ma, id_app):
        """Buộc id thật của app vào bản ghi — id là thứ hàng rào MẠNG đối chiếu được."""
        if not id_app:
            return None
        m = self._can(ma)
        if m.get('id_app') and str(m['id_app']) != str(id_app):
            raise LoiSoQA('bản ghi %r đã buộc id %r, nay app trả id %r — không ghi đè, dừng '
                          'để người soi' % (ma, m['id_app'], id_app))
        m['id_app'] = str(id_app)
        self.cat()
        return m['id_app']

    def ghi_hanh_dong(self, ma, viec, case_key='', ket_qua='', chi_tiet=''):
        m = self._can(ma)
        m['hanh_dong'].append({'luc': _gio(), 'viec': viec, 'case': case_key,
                               'ket_qua': ket_qua, 'chi_tiet': str(chi_tiet)[:200]})
        self._ghi_su(viec, ma, '%s %s' % (case_key, ket_qua))
        self.cat()
        return m

    def ghi_xoa(self, ma, case_key='', boi_cleanup=False, thanh_cong=True, ly_do=''):
        """Bản ghi đã bị xoá — bởi chính case, hoặc bởi bước dọn."""
        m = self._can(ma)
        if thanh_cong:
            m['trang_thai'] = DA_DON if boi_cleanup else DA_XOA
            m['don_luc'] = _gio()
        elif boi_cleanup:
            m['trang_thai'] = DON_HONG
        else:
            # Một case bấm xoá KHÔNG thành công không làm bản ghi biến mất: nó vẫn SỐNG và
            # vẫn phải được bước dọn xử lý. Hạ xuống `DON_HONG` ở đây là đẩy nó ra khỏi
            # `con_ton()` ⇒ dọn bỏ sót trong im lặng (ca thật, bắt được khi tự kiểm 15/09).
            pass
        m['hanh_dong'].append({'luc': _gio(), 'viec': 'don' if boi_cleanup else 'xoa',
                               'case': case_key, 'ket_qua': 'OK' if thanh_cong else 'HỎNG',
                               'ly_do': str(ly_do)[:200]})
        self._ghi_su('don' if boi_cleanup else 'xoa', ma, m['trang_thai'])
        self.cat()
        return m

    def danh_dau_khong_thay(self, ma, ly_do=''):
        """Dọn tới nơi thì bản ghi đã không còn -> CLEAN (§8: cleanup idempotent)."""
        m = self._can(ma)
        m['trang_thai'] = KHONG_THAY
        m['don_luc'] = _gio()
        m['hanh_dong'].append({'luc': _gio(), 'viec': 'don', 'ket_qua': 'KHÔNG CÒN',
                               'ly_do': str(ly_do)[:200]})
        self._ghi_su('don_khong_thay', ma, ly_do)
        self.cat()
        return m

    # ── chứng minh quyền sở hữu ──────────────────────────────────────────────
    def chung_minh(self, ma, hanh_dong='thao tác'):
        """Bản ghi này có được phép `hanh_dong` không? Trả mục trong sổ, hoặc ném `LoiSoQA`.

        Ba lớp của §4d được xét ở đây và **xét đủ cả ba** — mỗi lớp trả lời một câu hỏi khác
        nhau, không lớp nào suy ra được lớp nào:
          ① mã mang dấu của CHÍNH lượt chạy (không phải "một dấu QA nào đó");
          ② mã có trong sổ và đang còn sống;
          ③ vân tay chủ sở hữu của mục khớp vân tay phiên đang chạy.
        """
        ma = str(ma or '').strip()
        if not ma:
            raise LoiSoQA('không có mã bản ghi ⇒ không chứng minh được quyền sở hữu, CHẶN %s'
                          % hanh_dong)
        if not qalib.la_ma_cua_run(ma, self.run_id):
            raise LoiSoQA(
                'bản ghi %r KHÔNG mang dấu của lượt chạy này (%s) ⇒ không phải dữ liệu do tool '
                'tạo, CHẶN %s. Đây là hàng rào chính: dữ liệu thật không bao giờ đi qua được.'
                % (ma, self.run_id, hanh_dong))
        m = self.muc.get(ma)
        if not m:
            raise LoiSoQA('bản ghi %r mang dấu đúng nhưng KHÔNG có trong sổ dữ liệu QA ⇒ không '
                          'chứng minh được là do lượt chạy này tạo, CHẶN %s' % (ma, hanh_dong))
        if m['trang_thai'] not in CON_TON:
            raise LoiSoQA('bản ghi %r đang ở trạng thái %s (không còn sống) ⇒ CHẶN %s'
                          % (ma, m['trang_thai'], hanh_dong))
        if self.van_tay and m.get('van_tay') and m['van_tay'] != self.van_tay:
            raise LoiSoQA('bản ghi %r do một CHỦ KHÁC tạo (vân tay tài khoản/origin khác) ⇒ '
                          'CHẶN %s — kiểm tenant/owner là điều kiện bắt buộc trước mutation'
                          % (ma, hanh_dong))
        return m

    def _can(self, ma):
        m = self.muc.get(str(ma or '').strip())
        if not m:
            raise LoiSoQA('bản ghi %r không có trong sổ dữ liệu QA' % ma)
        return m

    # ── truy vấn ─────────────────────────────────────────────────────────────
    def con_ton(self):
        return [m for m in self.muc.values() if m['trang_thai'] in CON_TON]

    def ids_qa(self):
        """Id app của MỌI bản ghi QA còn sống — dùng khai cho cửa sổ ghi ở tầng mạng."""
        return [str(m['id_app']) for m in self.muc.values()
                if m['trang_thai'] in CON_TON and m.get('id_app')]

    def tom_tat(self):
        d = {'tong': len(self.muc), 'con_ton': 0, 'da_don': 0, 'da_xoa_boi_case': 0,
             'khong_thay': 0, 'don_hong': 0}
        for m in self.muc.values():
            t = m['trang_thai']
            d['con_ton'] += 1 if t in CON_TON else 0        # gồm cả DON_HONG (vẫn trên hệ thống)
            d['da_don'] += 1 if t == DA_DON else 0
            d['da_xoa_boi_case'] += 1 if t == DA_XOA else 0
            d['khong_thay'] += 1 if t == KHONG_THAY else 0
            d['don_hong'] += 1 if t == DON_HONG else 0
        return d


# ══════════════════════════════════════════════════════════════════════════════
# DỌN — idempotent, và KHÔNG BAO GIỜ dọn bằng cách đoán
# ══════════════════════════════════════════════════════════════════════════════
def doi_soat(so, doc_ma_tren_app, case_key='doi-soat', ghi=print):
    """ĐỐI SOÁT sổ với app: nhận lại bản ghi mang dấu lượt chạy mà SỔ đã mất dấu. -> [mã nhận lại]

    Vì sao cần: `don()` chỉ đi theo SỔ, mà sổ chỉ có thứ `cap_ma()` đã cấp. Case *"bấm Lưu
    liên tục nhiều lượt"* / *"click liên tục vào button"* làm app đẻ THÊM bản ghi trùng mã cho
    MỘT lần cấp mã — sổ đếm 1, app có 2. Dọn xong, sổ tự nhận là sạch, còn `nghiem_thu_don`
    đọc app và thấy vẫn còn (lượt chạy 16/09: `CLEANUP_FAILED — còn 2 bản ghi`, mà
    `--don-du-lieu-qa` chạy lại thì báo *"không còn gì để dọn"* — sổ và app nói hai điều khác
    nhau, và cái sai là SỔ).

    Hàng rào KHÔNG nới một li: chỉ nhận lại mã `la_ma_cua_run(ma, so.run_id)` — tức mang dấu
    của CHÍNH lượt chạy này. Bản ghi thật không mang dấu ấy nên không có đường lọt vào đây, và
    mã của lượt chạy KHÁC cũng không. Sau khi nhận lại, bản ghi đi qua đúng `chung_minh()` +
    `don()` như mọi bản ghi khác.
    """
    try:
        tren_app = [str(x).strip() for x in (doc_ma_tren_app() or [])]
    except Exception as e:
        ghi('   ĐỐI SOÁT: không đọc được danh sách trên app (%s: %s) — bỏ qua, KHÔNG kết luận sạch'
            % (type(e).__name__, e))
        return []
    nhan = []
    for ma in tren_app:
        if not qalib.la_ma_cua_run(ma, so.run_id):
            continue
        m = so.muc.get(ma)
        if m and m['trang_thai'] in CON_TON:
            continue                      # sổ đang theo dõi rồi, `don()` lo
        # Mất dấu: hoặc chưa từng vào sổ (bản sinh thêm do bấm trùng), hoặc sổ tưởng đã xong.
        so.muc[ma] = {'ma': ma, 'ten': (m or {}).get('ten') or ma, 'thuc_the': so.thuc_the,
                      'trang_thai': DINH, 'id_app': (m or {}).get('id_app'),
                      'case_tao': case_key, 'tao_luc': _gio(), 'don_luc': None,
                      'van_tay': so.van_tay, 'ghi_chu': 'nhận lại khi đối soát sổ với app',
                      'hanh_dong': list((m or {}).get('hanh_dong') or [])}
        so._ghi_su('doi_soat', ma, case_key)
        nhan.append(ma)
    if nhan:
        so.cat()
        ghi('   ĐỐI SOÁT: nhận lại %d bản ghi app CÓ mà sổ đã mất dấu: %s'
            % (len(nhan), ' · '.join(nhan[:10])))
    return nhan


def don(so, xoa_mot, doc_ma_tren_app=None, ghi=print):
    """Dọn mọi bản ghi QA còn tồn. -> dict kết quả.

    `xoa_mot(muc) -> (thành công, ghi chú)` do lớp thi hành cung cấp (bấm UI / gọi API). Ở đây
    chỉ có LUẬT dọn:

      · **idempotent** (§8): chạy nhiều lần không lỗi. Bản ghi đã ở trạng thái sạch thì bỏ qua;
        bản ghi không còn trên app (danh sách đọc được mà không thấy mã) là **CLEAN**, không
        phải lỗi — đó chính là ca "đã bị xoá từ lượt trước";
      · **fail-stop** (§8): một bản ghi dọn hỏng là `CLEANUP_FAILED` và **dừng ngay**, không
        dọn tiếp bản ghi khác và không cho lượt chạy đi tiếp sang mutation nào nữa. Dọn tiếp
        khi chưa hiểu vì sao bản trước hỏng là lối làm mất dữ liệu;
      · **không đoán**: `doc_ma_tren_app` (nếu có) chỉ dùng để kết luận "đã không còn", không
        bao giờ dùng để tìm thêm bản ghi để xoá.
    """
    kq = {'da_don': 0, 'khong_thay': 0, 'hong': 0, 'con_ton': 0, 'chi_tiet': [], 'dung': False}
    con = so.con_ton()
    if not con:
        return kq
    # ⚠️ KHÔNG dùng danh sách đọc được để BỎ QUA việc dọn (đó là bản 15/09 đầu tiên, và nó
    # đã nói dối ngay lần chạy thử đầu): phép đọc hỏng thì mọi bản ghi đều "không thấy" và
    # cả bước dọn báo SẠCH trong khi app còn nguyên 8 bản ghi QA. Một phép an toàn không
    # được phép kết luận từ chỗ nó KHÔNG quan sát được.
    #
    # Nay danh sách chỉ dùng để GHI CHÚ; quyết định "đã không còn" do chính `xoa_mot` đưa ra
    # sau khi nó tự đi tìm bản ghi trên màn — và `xoa_mot` có lưới chắn riêng cho ca đọc hỏng.
    tren_app = None
    if doc_ma_tren_app:
        try:
            tren_app = {str(x).strip().lower() for x in (doc_ma_tren_app() or [])}
        except Exception as e:
            ghi('    ⚠ không đọc được danh sách trên app để đối chiếu: %s' % e)
            tren_app = None
    for m in con:
        ma = m['ma']
        try:
            ok, ghi_chu = xoa_mot(m)
        except Exception as e:
            ok, ghi_chu = False, '%s: %s' % (type(e).__name__, e)
        if ok:
            mat_san = 'khong con' in qalib_norm(ghi_chu)
            if mat_san:
                so.danh_dau_khong_thay(ma, ghi_chu)
                kq['khong_thay'] += 1
                kq['chi_tiet'].append((ma, 'KHÔNG CÒN'))
                ghi('    · %s — đã không còn trên app ⇒ CLEAN' % ma)
                continue
            so.ghi_xoa(ma, boi_cleanup=True, thanh_cong=True, ly_do=ghi_chu)
            kq['da_don'] += 1
            kq['chi_tiet'].append((ma, 'ĐÃ DỌN'))
            ghi('    · %s — đã dọn' % ma)
        else:
            so.ghi_xoa(ma, boi_cleanup=True, thanh_cong=False, ly_do=ghi_chu)
            kq['hong'] += 1
            kq['chi_tiet'].append((ma, 'HỎNG: %s' % ghi_chu))
            kq['dung'] = True
            ghi('    ✘ %s — DỌN HỎNG: %s' % (ma, ghi_chu))
            break                       # fail-stop: không dọn tiếp, không mutation tiếp
    kq['con_ton'] = len(so.con_ton())
    return kq


def ban_do(so):
    """Bản đồ §7: testcase → thực thể → mã bản ghi QA → id app → hành động → trạng thái dọn.

    Một dòng cho MỘT lần một case chạm vào một bản ghi, kể cả lần chỉ dùng lại. Đây là thứ
    người đọc báo cáo cần khi hỏi *"case này đã đụng vào cái gì của hệ thống?"* — sổ đầy đủ
    thì trả lời được, sổ chỉ ghi lúc tạo thì không.
    """
    ra = []
    for m in so.muc.values():
        for h in (m.get('hanh_dong') or []):
            ra.append({'testcase': h.get('case') or m.get('case_tao') or '-',
                       'thuc_the': m.get('thuc_the'), 'ban_ghi': m['ma'],
                       'id_app': m.get('id_app'), 'hanh_dong': h.get('viec'),
                       'ket_qua': h.get('ket_qua') or '', 'luc': h.get('luc'),
                       'trang_thai_don': m['trang_thai']})
    return sorted(ra, key=lambda x: (x['luc'] or '', x['ban_ghi']))


def nghiem_thu_don(so, doc_ma_tren_app):
    """VERIFY CLEANUP — đọc lại app và chứng minh không còn bản ghi nào của lượt chạy.

    Trả `(đạt, còn sót, lý do)`. Đọc không được thì **KHÔNG đạt**: một phép nghiệm thu không
    quan sát được thứ nó phải nghiệm thu thì chưa chứng minh được gì (cùng luật với sổ mạng
    fail-closed ở `chay_live.kiem_so_mang`).
    """
    try:
        tren_app = [str(x).strip() for x in (doc_ma_tren_app() or [])]
    except Exception as e:
        # Đọc không được thì KHÔNG đạt — cùng luật fail-closed với sổ mạng. Câu "không thấy
        # bản ghi nào" phát ra từ một phép đọc hỏng nghe y hệt câu phát ra từ một app đã sạch.
        return False, [], 'không đọc được danh sách trên app để nghiệm thu: %s: %s' % (
            type(e).__name__, e)
    sot = [x for x in tren_app if qalib.la_ma_cua_run(x, so.run_id)]
    if sot:
        return False, sot, 'còn %d bản ghi mang dấu lượt chạy trên app' % len(sot)
    con_so = [m['ma'] for m in so.con_ton()]
    if con_so:
        return False, con_so, 'sổ còn %d bản ghi chưa dọn' % len(con_so)
    return True, [], 'không còn bản ghi nào mang dấu %s trên app' % so.run_id

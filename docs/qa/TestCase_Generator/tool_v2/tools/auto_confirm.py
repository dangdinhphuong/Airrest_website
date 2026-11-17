# -*- coding: utf-8 -*-
"""LỚP QUYẾT ĐỊNH TỰ ĐỘNG — chạy live test KHÔNG hỏi người  (mới 2026-09-16 lượt 2).

Trước bản này, lượt chạy live dừng lại ở ba chỗ để chờ người quyết định: *"có cho chạy phần
GHI không"* (phải tự tay thêm `--cho-phep-ghi`), *"có tài khoản vai trò khác không"*, *"tài
khoản đăng nhập lấy ở đâu"*. Không chỗ nào trong số đó là `input()` — chúng là những chỗ tool
**từ chối đi tiếp** và người vận hành phải đọc thông báo rồi chạy lại bằng cờ khác. Với một
lượt 3.365 case thì đó vẫn là một hộp thoại, chỉ là hộp thoại kéo dài vài phút.

Khối này thay cả ba bằng MỘT bảng chính sách. Luật xương sống, không có ngoại lệ:

    AUTO-CONFIRM quyết định Ý ĐỊNH.  HÀNG RÀO MÁY quyết định có được làm hay không.

Nghĩa là: `ALLOW_QA_WRITE` **không** cho phép ghi cái gì cả. Nó chỉ nói *"đừng dừng lượt chạy
lại để hỏi"*. Mỗi mutation vẫn phải đi trọn đường cũ — `chay_live.Cong.ghi()` (ba điều kiện
§4c) → `qalib.CuaSoGhiQA` (cửa sổ khai trước) → sổ mạng phân loại theo `networkId`. Bỏ một
mắt xích nào trong đó là mở đúng cái cửa mà sự cố 2026-08-02 đi qua.

Vì vậy ở đây **không có** và sẽ không bao giờ có: `--force-real-write`, `--allow-any-write`,
`--skip-guard`. Phép tự kiểm ⑦ của `kiem_auto_confirm.py` quét mã nguồn để chốt điều đó.

Mọi quyết định đều để lại một dòng log có khuôn cố định và một bản ghi trong sổ
`evidence/quyet-dinh.json`:

    [AUTO-CONFIRM] decision=ALLOW_QA_WRITE  reason=…
    [AUTO-DECISION] decision=MOCK_403       reason=…
    [SAFETY-BLOCK]  decision=BLOCK_WRITE    reason=…
"""
import os
import re
import time

import qalib

# ── TÊN QUYẾT ĐỊNH (đúng bảng §6 của chỉ thị) ────────────────────────────────────────────
ALLOW_QA_WRITE = 'ALLOW_QA_WRITE'
READ_ONLY = 'READ_ONLY'
QA_CREATE, QA_UPDATE, QA_DELETE = 'QA_CREATE', 'QA_UPDATE', 'QA_DELETE'
REAL_DATA_WRITE = 'REAL_DATA_WRITE'
UNKNOWN_WRITE, UNKNOWN = 'UNKNOWN_WRITE', 'UNKNOWN'
MISSING_GUARD = 'MISSING_GUARD'
MISSING_QA_REGISTRY = 'MISSING_QA_REGISTRY'
MISSING_CLEANUP = 'MISSING_CLEANUP'
ROLE_ACCOUNT_AVAILABLE = 'ROLE_ACCOUNT_AVAILABLE'
ROLE_ACCOUNT_MISSING = 'ROLE_ACCOUNT_MISSING'
USE_ROLE, MOCK = 'USE_ROLE', 'MOCK'
BLOCK_WRITE, BLOCKED = 'BLOCK_WRITE', 'BLOCKED'
PE_CHUA_DO = 'PE_CHUA_DO'
# ── mã của §7 chỉ thị 2026-09-17 ────────────────────────────────────────────────────────
USE_ROLE_B = 'USE_ROLE_B'                  # có tài khoản vai trò đối chứng -> mở phiên B
ROLE_B_MISSING = 'ROLE_B_MISSING'          # không có; người gọi rẽ mock hoặc PE
MOCK_403 = 'MOCK_403'                      # mô phỏng 403 để đo PHẦN GIAO DIỆN
LIVE_ROLE_REQUIRED = 'LIVE_ROLE_REQUIRED'  # case đòi tài khoản THẬT khác vai trò -> PE
MISSING_CREDENTIAL = 'MISSING_CREDENTIAL'  # chưa cấu hình tài khoản của một vai trò
AUTO_CREATE_QA_DATA = 'AUTO_CREATE_QA_DATA'

# Loại thao tác -> có được tự động cho qua (khi hàng rào máy PASS) hay không.
# Bảng này là NGUỒN DUY NHẤT; không nơi nào trong tool được tự quyết định lại.
BANG_CHINH_SACH = {
    READ_ONLY:           (True,  'thao tác chỉ đọc'),
    QA_CREATE:           (True,  'tạo bản ghi QA của chính lượt chạy'),
    QA_UPDATE:           (True,  'sửa bản ghi đã có trong sổ dữ liệu QA'),
    QA_DELETE:           (True,  'xoá bản ghi đã có trong sổ dữ liệu QA'),
    REAL_DATA_WRITE:     (False, 'đích là dữ liệu nghiệp vụ có sẵn'),
    UNKNOWN_WRITE:       (False, 'không chứng minh được đích thuộc phạm vi QA'),
    UNKNOWN:             (False, 'không phân loại được thao tác'),
    MISSING_GUARD:       (False, 'lượt chạy không có cổng an toàn'),
    MISSING_QA_REGISTRY: (False, 'lượt chạy không có sổ dữ liệu QA'),
    MISSING_CLEANUP:     (False, 'không chứng minh được sẽ dọn được dữ liệu QA'),
}

_RX_CAM = re.compile(r'--(force[-_]real[-_]write|allow[-_]any[-_]write|skip[-_]guard|'
                     r'no[-_]guard|bypass[-_]safety)')


class QuyetDinh(dict):
    """Một quyết định: `{'quyet_dinh','cho_phep','ly_do','muc','chi_tiet','luc'}`."""

    def __bool__(self):
        return bool(self.get('cho_phep'))

    def __repr__(self):
        return '<%s %s: %s>' % (self.get('muc'), self.get('quyet_dinh'), self.get('ly_do'))


class ChinhSach:
    """Bảng chính sách của MỘT lượt chạy. Dựng một lần, truyền đi khắp nơi.

        cs = auto_confirm.ChinhSach(non_interactive=True)
        if cs.cho_phep_ghi():           # -> ALLOW_QA_WRITE, không hỏi ai
            ...
        qd = cs.mutation(QA_DELETE, so_qa=so, ma='zzqa_x_001', cong=cong)
        if not qd: ...                  # -> BLOCK, và lý do đã nằm trong sổ

    `non_interactive=False` KHÔNG mở thêm quyền nào — nó chỉ cho phép hàm `hoi()` thật sự
    hỏi. Mọi nhánh ghi vẫn đi qua đúng bảng trên.
    """

    def __init__(self, non_interactive=True, chi_doc=False, in_ra=True):
        self.non_interactive = bool(non_interactive)
        # `chi_doc` là cách DUY NHẤT để tắt phần ghi trong chế độ tự động. Nó thu hẹp quyền,
        # không mở rộng — nên nó an toàn để có, khác hẳn một cờ `--force-…`.
        self.chi_doc = bool(chi_doc)
        self.in_ra = bool(in_ra)
        self.so = []
        self.dem = {}

    # ── ghi sổ ───────────────────────────────────────────────────────────────
    def _ghi(self, muc, quyet_dinh, cho_phep, ly_do, **chi_tiet):
        qd = QuyetDinh(muc=muc, quyet_dinh=quyet_dinh, cho_phep=bool(cho_phep),
                       ly_do=ly_do, chi_tiet=chi_tiet,
                       luc=time.strftime('%Y-%m-%d %H:%M:%S'))
        self.so.append(qd)
        self.dem[quyet_dinh] = self.dem.get(quyet_dinh, 0) + 1
        if self.in_ra:
            print('[%s] decision=%-22s reason=%s' % (muc, quyet_dinh, ly_do))
        return qd

    def khoi(self):
        """Sổ quyết định cho `evidence/quyet-dinh.json`. KHÔNG mang bí mật nào."""
        return {'non_interactive': self.non_interactive, 'chi_doc': self.chi_doc,
                'tong': len(self.so), 'theo_quyet_dinh': dict(self.dem),
                'quyet_dinh': list(self.so)}

    # ── ① có chạy phần GHI không ─────────────────────────────────────────────
    def cho_phep_ghi(self, so_case_ghi=0, cong_da_bat=None, endpoints_ghi=None):
        """*"Có cho chạy phần ghi bằng lớp dữ liệu QA không?"* — tự trả lời, không hỏi.

        `cong_da_bat` = người chạy đã tự tay khai `--cho-phep-ghi` chưa. Khai rồi thì giữ
        nguyên (không hạ quyền của người vận hành); chưa khai mà đang ở chế độ tự động thì
        quyết định `ALLOW_QA_WRITE`.

        ⚠️ Trả `True` KHÔNG có nghĩa là được ghi. Nó chỉ mở **ý định**: case ghi được đưa vào
        kế hoạch chạy thay vì bị xếp lớp `CHAN`. Từng mutation vẫn phải qua `mutation()` +
        `Cong.ghi()` + cửa sổ ghi.
        """
        if cong_da_bat:
            return self._ghi('AUTO-CONFIRM', ALLOW_QA_WRITE, True,
                             'người chạy đã khai --cho-phep-ghi', so_case_ghi=so_case_ghi)
        if self.chi_doc:
            return self._ghi('AUTO-CONFIRM', READ_ONLY, False,
                             'lượt chạy khai --chi-doc', so_case_ghi=so_case_ghi)
        if not self.non_interactive:
            return self._ghi('AUTO-CONFIRM', READ_ONLY, False,
                             'chế độ tương tác: phần ghi chỉ chạy khi có --cho-phep-ghi',
                             so_case_ghi=so_case_ghi)
        # ⚠️ Tự động KHÔNG có nghĩa là mù. Trước khi mở phần ghi, hỏi một câu kiểm được:
        # **màn này có dựng nổi một cửa sổ ghi hợp lệ không?** Cửa sổ ghi đòi danh sách
        # endpoint mutation, và danh sách ấy lấy từ `grounding.api` của hồ sơ màn. Hồ sơ màn
        # chưa khai endpoint nào thì mọi request ghi rơi ra ngoài cửa sổ ⇒ sổ mạng tố `WRITE`
        # ⇒ **DỪNG cả lượt chạy**. Đo được ngay ở bộ tự kiểm: một màn fixture không khai
        # `grounding.api` biến một lượt vốn sạch thành một lượt dừng-an-toàn.
        # Nên ở đây: không khai được endpoint ghi -> chạy CHỈ ĐỌC màn đó, ghi rõ lý do, và
        # lượt chạy vẫn đi tới cuối. Đây là `MISSING_CLEANUP` theo bảng §6 — không chứng minh
        # được sẽ dọn được thì không được tạo.
        if endpoints_ghi is not None and not any((endpoints_ghi or {}).values()):
            return self._ghi('AUTO-DECISION', MISSING_CLEANUP, False,
                             'hồ sơ màn không khai endpoint GHI nào (`grounding.api`) nên '
                             'không dựng được cửa sổ ghi -> chạy CHỈ ĐỌC màn này; bổ sung '
                             '`grounding.api` rồi chạy lại để đo phần ghi',
                             so_case_ghi=so_case_ghi)
        return self._ghi('AUTO-CONFIRM', ALLOW_QA_WRITE, True,
                         'chế độ tự động: case GHI chạy bằng dữ liệu QA của chính lượt chạy; '
                         'mọi mutation vẫn phải qua guard + cửa sổ ghi',
                         so_case_ghi=so_case_ghi)

    # ── ② một mutation cụ thể ────────────────────────────────────────────────
    def mutation(self, loai, ma=None, so_qa=None, cong=None, case_key='', thuc_the=''):
        """Quyết định cho MỘT thao tác đổi dữ liệu. -> `QuyetDinh` (dùng như boolean).

        Phân loại KHÔNG dựa vào cờ dòng lệnh mà dựa vào **dữ kiện kiểm được**:

          · không có cổng an toàn          -> `MISSING_GUARD`
          · không có sổ dữ liệu QA         -> `MISSING_QA_REGISTRY`
          · mã không mang dấu QA           -> `REAL_DATA_WRITE`
          · sổ không chứng minh được sở hữu-> `UNKNOWN_WRITE`
          · sổ không dọn được bản ghi này  -> `MISSING_CLEANUP`

        Đây chính là chỗ *"AUTO-CONFIRM ≠ AUTO-WRITE"* được thi hành.
        """
        if loai == READ_ONLY:
            return self._ghi('AUTO-CONFIRM', READ_ONLY, True, BANG_CHINH_SACH[READ_ONLY][1],
                             case=case_key)
        if loai not in BANG_CHINH_SACH:
            return self._ghi('SAFETY-BLOCK', UNKNOWN, False,
                             'thao tác %r không có trong bảng chính sách' % loai, case=case_key)
        if self.chi_doc:
            return self._ghi('SAFETY-BLOCK', BLOCK_WRITE, False,
                             'lượt chạy khai --chi-doc', case=case_key, loai=loai)
        if cong is None:
            return self._ghi('SAFETY-BLOCK', MISSING_GUARD, False,
                             BANG_CHINH_SACH[MISSING_GUARD][1], case=case_key, loai=loai)
        if so_qa is None:
            return self._ghi('SAFETY-BLOCK', MISSING_QA_REGISTRY, False,
                             BANG_CHINH_SACH[MISSING_QA_REGISTRY][1], case=case_key, loai=loai)
        ma = str(ma or '').strip()
        if loai in (QA_UPDATE, QA_DELETE, QA_CREATE):
            if not ma:
                return self._ghi('SAFETY-BLOCK', UNKNOWN_WRITE, False,
                                 'không biết bản ghi đích', case=case_key, loai=loai)
            if not qalib.la_ban_ghi_qa(ma):
                return self._ghi('SAFETY-BLOCK', REAL_DATA_WRITE, False,
                                 'bản ghi %r KHÔNG mang dấu QA — là dữ liệu nghiệp vụ có sẵn'
                                 % ma, case=case_key, loai=loai)
            # ⚠️ Dấu QA CHƯA ĐỦ. `la_ban_ghi_qa` trả lời *"có phải dữ liệu test không"*;
            # thứ cần ở đây là *"có phải của LƯỢT NÀY không"*. Bản đầu chỉ hỏi câu thứ nhất,
            # nên với `zzqa_<run khác>_001` bảng chính sách nói ALLOW trong khi `Cong.ghi()`
            # CHẶN — tức là tầng chính sách LỎNG HƠN cổng ghi. Chưa thành lỗ vì cổng ghi vẫn
            # chặn, nhưng một tầng chính sách lỏng hơn là lỗ đang chờ: chỉ cần ai đó về sau
            # tin nó mà bỏ qua cổng. Phép kiểm ⑭ của `kiem_auto_confirm.py` quét đủ 15 tổ hợp
            # (loại × mã) để chốt bất biến *"chính sách không bao giờ nới hơn cổng ghi"*.
            run = getattr(so_qa, 'run_id', None)
            if run and not qalib.la_ma_cua_run(ma, run):
                return self._ghi('SAFETY-BLOCK', UNKNOWN_WRITE, False,
                                 'bản ghi %r mang dấu QA nhưng KHÔNG phải của lượt chạy này'
                                 % ma, case=case_key, loai=loai)
            if loai in (QA_UPDATE, QA_DELETE):
                try:
                    so_qa.chung_minh(ma, loai)
                except Exception as e:
                    return self._ghi('SAFETY-BLOCK', UNKNOWN_WRITE, False,
                                     'sổ dữ liệu QA không chứng minh được quyền thao tác: %s'
                                     % str(e)[:160], case=case_key, loai=loai, ma=ma)
                if ma not in getattr(so_qa, 'muc', {}):
                    return self._ghi('SAFETY-BLOCK', MISSING_QA_REGISTRY, False,
                                     'bản ghi %r không có trong sổ' % ma,
                                     case=case_key, loai=loai)
            if not hasattr(so_qa, 'ghi_xoa'):
                return self._ghi('SAFETY-BLOCK', MISSING_CLEANUP, False,
                                 BANG_CHINH_SACH[MISSING_CLEANUP][1], case=case_key, loai=loai)
        return self._ghi('AUTO-CONFIRM', loai, True, BANG_CHINH_SACH[loai][1],
                         case=case_key, ma=ma, thuc_the=thuc_the)

    # ── ③ vai trò đối chứng ──────────────────────────────────────────────────
    def vai_tro(self, ten_vai_tro, co_tai_khoan, nguon='environment', bat_buoc=True):
        """*"Có tài khoản vai trò khác không?"* — tra biến môi trường, không hỏi.

        Có -> `USE_ROLE` (tự mở phiên). Không có -> `ROLE_ACCOUNT_MISSING`; người gọi tự
        chọn nhánh mock hoặc PE/CHƯA ĐO theo case, cũng không hỏi ai.
        """
        if co_tai_khoan:
            return self._ghi('AUTO-CONFIRM', USE_ROLE_B, True,
                             'tài khoản vai trò %s có sẵn (nguồn: %s)' % (ten_vai_tro, nguon),
                             role=ten_vai_tro, credential_source=nguon)
        return self._ghi('AUTO-DECISION', ROLE_B_MISSING, False,
                         'không có tài khoản vai trò đối chứng nào được cấu hình; case %s'
                         % ('đòi tài khoản THẬT khác vai trò -> PE' if bat_buoc
                            else 'đo được bằng mô phỏng -> MOCK_403'),
                         role=ten_vai_tro or '(chưa cấu hình)')

    def role_doi_chung(self, role_dang_chay='', bat_buoc=True):
        """Tự tìm vai trò đối chứng rồi GHI SỔ quyết định. -> (`TaiKhoan`|None, `QuyetDinh`).

        ⚠️ Vá 2026-09-17 (§2 + §9). Trước bản này câu trả lời phụ thuộc vào việc có biến
        `QA_USER_ROLE_B` hay không — một khuôn tên của riêng tool. Người vận hành chỉ có tài
        khoản THẬT đặt theo quy ước của họ, nên tool báo "không có" rồi HỎI NGƯỜI. Nay
        `tai_khoan.role_doi_chung()` quét MỌI vai trò đã cấu hình ở mọi nguồn ngoài repo, và
        đây là chỗ DUY NHẤT trong tool trả lời câu *"có vai trò đối chứng không"*.
        """
        import tai_khoan as _tk
        tk = _tk.role_doi_chung(role_dang_chay)
        qd = self.vai_tro(tk.role if tk else '', bool(tk),
                          nguon=(tk.nguon if tk else 'environment'), bat_buoc=bat_buoc)
        return tk, qd

    def mock_tu_choi(self, case_key='', ma=403):
        """Không có vai trò đối chứng nhưng case đo được bằng mô phỏng -> `MOCK_403`."""
        return self._ghi('AUTO-DECISION', MOCK_403 if ma == 403 else 'MOCK_%d' % ma, True,
                         'không có tài khoản vai trò đối chứng; dựng trạng thái %d bằng mô '
                         'phỏng mạng để đo PHẦN GIAO DIỆN (không chấm P cho phần máy chủ)'
                         % ma, case=case_key)

    def can_role_that(self, case_key='', role=''):
        """Case đòi tài khoản THẬT khác vai trò mà không có -> `LIVE_ROLE_REQUIRED` (PE)."""
        return self._ghi('AUTO-DECISION', LIVE_ROLE_REQUIRED, False,
                         'case chỉ chốt được bằng một tài khoản THẬT khác vai trò; chưa cấu '
                         'hình tài khoản nào như vậy -> PE, KHÔNG giả mạo vai trò',
                         case=case_key, role=role or '(chưa cấu hình)')

    # ── ④ tài khoản đăng nhập của lượt chạy ──────────────────────────────────
    def tai_khoan(self, role, user, pw, nguon='environment'):
        """Tìm tài khoản theo thứ tự đã quy định; KHÔNG in giá trị, chỉ in có/không.

        `nguon` chỉ là NHÃN để ghi sổ (`environment` · `tham số dòng lệnh`). Giá trị tài
        khoản không bao giờ đi vào sổ, vào log hay vào evidence — phép kiểm ⑫ quét đúng chỗ đó.
        """
        if user and pw:
            return self._ghi('AUTO-CONFIRM', 'USE_CREDENTIAL', True,
                             'tài khoản của vai trò %s lấy từ %s (không in giá trị)'
                             % (role, nguon), role=role, credential_source=nguon)
        import tai_khoan as _tk
        return self._ghi('SAFETY-BLOCK', '%s:%s' % (MISSING_CREDENTIAL, role or '(mặc định)'),
                         False, _tk.thieu(role) + ' — case cần đăng nhập chuyển BLOCKED, '
                         'KHÔNG hỏi người chạy', role=role)

    # ── ⑤ mô phỏng mạng ──────────────────────────────────────────────────────
    def mo_phong(self, kich_ban, ly_do, case_key=''):
        return self._ghi('AUTO-DECISION', 'MOCK_%s' % str(kich_ban).upper(), True, ly_do,
                         case=case_key, kich_ban=kich_ban)

    # ── ⑥ chỗ duy nhất được phép hỏi ─────────────────────────────────────────
    def hoi(self, cau, mac_dinh, la_cli=False):
        """Hỏi người dùng — TRONG chế độ tự động thì trả thẳng `mac_dinh`, không chờ.

        `la_cli=True` đánh dấu một thao tác CLI mà người dùng chủ động gọi (vd `--delete-session`).
        Chúng vẫn được hỏi khi chạy tương tác; ở chế độ tự động chúng trả mặc định AN TOÀN
        (thường là "không"), chứ không treo một tiến trình không ai ngồi xem.
        """
        if self.non_interactive:
            self._ghi('AUTO-DECISION', 'DEFAULT_ANSWER', bool(mac_dinh),
                      'chế độ non-interactive: trả lời mặc định cho %r' % cau[:80],
                      cli=la_cli)
            return mac_dinh
        try:
            tra = input('   %s ' % cau).strip().lower()
        except (EOFError, KeyboardInterrupt):
            return mac_dinh
        return tra in ('y', 'yes', 'c', 'co', 'có', 'go', 'ok', '1')


def _hau_to(role):
    return re.sub(r'[^0-9A-Za-z]+', '', str(role or '')).upper()


def khong_co_co_bypass(duong_dan_tools):
    """Quét mã nguồn: KHÔNG được tồn tại cờ nào cho phép bỏ qua hàng rào. -> [vi phạm].

    Đây là một bất biến, không phải một lời hứa trong tài liệu: `kiem_auto_confirm.py` gọi
    hàm này và phép kiểm đỏ ngay lần đầu ai đó thêm `--force-real-write`.
    """
    ra = []
    for ten in sorted(os.listdir(duong_dan_tools)):
        if not ten.endswith('.py'):
            continue
        p = os.path.join(duong_dan_tools, ten)
        try:
            noi = open(p, encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        for m in _RX_CAM.finditer(noi):
            dong = noi[:m.start()].count('\n') + 1
            # Chính file này khai chuỗi cấm trong regex và trong docstring — bỏ qua nó.
            if ten == os.path.basename(__file__):
                continue
            ra.append('%s:%d %s' % (ten, dong, m.group(0)))
    return ra


def quet_input_chan(duong_dan_tools, bo_qua=('session_manager.py',)):
    """Quét `input()` CHẶN trong luồng live test. -> [vi phạm].

    `session_manager.py` được chừa có chủ ý: `input()` ở đó thuộc `--delete-session`, một
    thao tác CLI người dùng chủ động gọi — và nó đã có `--yes`. Luồng chạy case không đi qua
    đó. Danh sách chừa là ĐÓNG: thêm tên vào đây là một quyết định, không phải một mặc định.
    """
    import ast
    ra = []
    for ten in sorted(os.listdir(duong_dan_tools)):
        if not ten.endswith('.py') or ten in bo_qua or ten == os.path.basename(__file__):
            continue
        p = os.path.join(duong_dan_tools, ten)
        try:
            cay = ast.parse(open(p, encoding='utf-8', errors='ignore').read())
        except Exception:
            continue
        # ⚠️ Quét bằng CÂY CÚ PHÁP, không bằng regex trên văn bản thô. Bản regex đếm cả chữ
        # `input()` nằm trong docstring — và docstring của lớp tài khoản có đúng câu *"không
        # `input()`, không `die()`"*, nên phép kiểm tố chính dòng tài liệu nói rằng nó không
        # gọi `input()`. Một phép an toàn báo động giả thì lần sau người ta tắt nó đi.
        for n in ast.walk(cay):
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) \
                    and n.func.id == 'input':
                ra.append('%s:%d' % (ten, n.lineno))
    return ra

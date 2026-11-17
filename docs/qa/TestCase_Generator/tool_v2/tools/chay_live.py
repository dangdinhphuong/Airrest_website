# -*- coding: utf-8 -*-
"""CHẠY CASE TRÊN HỆ THỐNG THẬT rồi GHI KẾT QUẢ vào `*_ket_qua.xlsx`  (LỚP B, 2026-09-15).

Đây là phần từ trước tới nay KHÔNG có script nào làm: `PROMPT-chay-live-test.md` mô tả trọn quy
trình cho người/agent, nhưng chỗ *thi hành* thì mỗi lượt lại phải dựng tay một harness Playwright
trong `~/.cache/qa-<role>/`, nên không lượt nào lặp lại được lượt trước và không có gì để resume.

    ┌ LỚP A `probe_live.py` ─ SOI MÀN, lấy grounding. KHÔNG chấm case, KHÔNG ghi kết quả.
    └ LỚP B `chay_live.py`  ─ CHẠY CASE, chấm P/F/PE, ghi vào file kết quả.

Hai lớp dùng CHUNG hạ tầng (`browser_manager` · `session_manager` · phần đọc DOM của `probe_live`)
nhưng KHÔNG trộn trách nhiệm: lớp B gọi lớp A như một THƯ VIỆN chỉ-đọc để lấy ảnh chụp trạng thái
màn, rồi tự chấm case trên dữ kiện đó. `probe_live.py` vẫn không ghi một ô nào của bộ case.

    python3 chay_live.py <Role> [Màn] --dry-run          # không mở browser: soát case · an toàn · mapping
    python3 chay_live.py <Role> [Màn]                    # chạy thật trên app, IN kế hoạch ghi (chưa ghi)
    python3 chay_live.py <Role> [Màn] --apply            # chạy + GHI kết quả + dựng lại cache/công thức
    python3 chay_live.py <Role> [Màn] --resume           # chạy tiếp phiên dở, không chạy lại case đã xong
    python3 chay_live.py <Role> --parallel 2             # nhiều màn, mỗi màn một phiên độc lập
    python3 chay_live.py <Role> --list                   # liệt kê phiên chạy case

**KHÔNG chấm P cho case không đo được.** Mỗi case ra một trong năm lớp, lớp nào cũng nói rõ lý do:

    ĐO ĐƯỢC   phép đo trên màn thật kết luận -> `P` / `F` kèm bằng chứng
    PE-CSDL   kỳ vọng nằm hẳn ở CSDL (`qalib` §4b) -> `PE` + khối `[DB ACCESS REQUIRED]`
    CHẶN      case đòi thao tác GHI mà chưa chứng minh được quyền sở hữu bản ghi (`qalib` §4c)
    CHƯA ĐO   chưa có phép đo nào cho lớp case này -> để TRỐNG cho người chạy, không đoán
    LỖI       phép đo chết giữa chừng -> để TRỐNG, ghi nguyên nhân

Ô trống là ô trống: `--apply` chỉ ghi những case có kết luận. "Không biết" không bao giờ thành `P`,
"không chạy được" không bao giờ thành `F` (§chinh_sach_PE mục 6).

**HÀNG RÀO AN TOÀN** (`qalib` §4c, luật gốc: PROMPT §hang_rao_an_toan — viết sau sự cố mất dữ liệu
thật 2026-08-02): mọi thao tác đi qua `Cong.hanh_dong()`; danh sách được phép là danh sách ĐÓNG và
toàn bộ là thao tác ĐỌC. Case đòi ghi thì dừng TRƯỚC khi chạm app. Muốn chạy phần ghi phải có
`--cho-phep-ghi` **và** bản ghi chứng minh được là do QA tạo (dấu `ZZQA…`) hoặc nằm trong
`--whitelist`. Không có đường nào để tool tự nới. Kèm theo là SỔ MẠNG đọc từ chính Chrome
(`browser_manager.Chrome.bat_mang`): mọi request khác `GET` phát sinh trong lượt chạy đều bị nêu
tên — chặn ở tầng ý định là lời hứa, sổ mạng mới là bằng chứng. Sổ được đối chiếu **SAU MỖI
CASE** (không phải cuối lượt): thấy `WRITE`/`UNKNOWN` là dừng ngay, case sau không chạy, workbook
không được ghi thêm dòng nào. Allowlist (`QA_AUTH_ENDPOINTS`, `--mang-cho-phep`) khớp **origin +
path ĐÚNG BẰNG** — `/foo/login` không mượn được suất của `/login`.

Mọi thứ của một lượt nằm trong `sessions/<id>/` (chung khuôn với lớp A) + hai file của riêng lớp B:
`result/cases.json` (trạng thái từng case — nguồn của `--resume`) và `result/bao-cao.md`.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib          # noqa: E402  — LUẬT dùng chung: §4b PE-CSDL · §4c hàng rào · §0a luật cứng
import tcfix          # noqa: E402
import roles          # noqa: E402
import session_manager as sm   # noqa: E402  — thư mục/vòng đời/log/khoá/chạy song song
import browser_manager as _bm  # noqa: E402  — CHỈ để bắt `MatKetNoi` (hạ tầng chết)
import probe_live as pl        # noqa: E402  — THƯ VIỆN chỉ-đọc: đăng nhập + đọc DOM
import live_ui                 # noqa: E402  — nguyên thao tác trên màn thật (gõ · bấm · đọc)
import phep_live               # noqa: E402  — bộ phép đo CHẠY THAO TÁC (§4d)
import attt_live               # noqa: E402  — lớp ATTT đa phiên (§4f)
import qa_data                 # noqa: E402  — sổ dữ liệu QA: tạo · chứng minh · dọn
import auto_confirm            # noqa: E402  — bảng chính sách TỰ QUYẾT ĐỊNH (§6)
import tien_dieu_kien          # noqa: E402  — phân tích tiền điều kiện + dựng fixture (§17)
import tai_khoan               # noqa: E402  — tìm tài khoản THẬT theo vai trò (§1 17/09)
import phep_bosung             # noqa: E402  — bộ phép bổ sung (hộp Chi tiết · 2 tab · hình học)
import dong_bang_ma            # noqa: E402  — chốt/đối chiếu mốc mã nguồn quanh lượt chạy (§14)
# Chrome/CDP đi qua `probe_live._mo_chrome` (đường đã có ĐÍNH KÈM cửa sổ `--hien` và dọn đúng
# cây tiến trình của phiên) nên không import `browser_manager` trực tiếp ở đây — một đường mở
# browser, không phải hai.

HERE = os.path.dirname(os.path.abspath(__file__))

# ── trạng thái một case (nằm trong `result/cases.json`) ───────────────────────────────────
XONG, DANG, CHAN, PE_DB, CHUA_DO, LOI = 'XONG', 'DANG', 'CHAN', 'PE_DB', 'CHUA_DO', 'LOI'
CAN_TAY = 'CAN_KIEM_TAY'        # case ghi đang dở khi tiến trình chết -> người phải xác minh
KE_HOACH = 'KE_HOACH'           # đã lên kế hoạch, CHƯA tới lượt chạy (không phải kết luận)
KET_THUC = (XONG, CHAN, PE_DB, CHUA_DO, CAN_TAY)


# ══════════════════════════════════════════════════════════════════════════════
# BẢN GHI THỰC THI  (§2 + §18 của chỉ thị 2026-09-16 lượt 3)
# ══════════════════════════════════════════════════════════════════════════════
# Mỗi case — KHÔNG trừ case nào — để lại đúng một bản ghi trong `result/cases.json` với đủ
# các trường dưới đây. Mục đích không phải làm đẹp báo cáo mà là trả lời được câu hỏi *"case
# này đã được làm gì?"* cho cả 100 % bộ case, thay cho một câu tiếng Việt dùng chung.
#
# Trước bản này, 113 case của `ViTriLuuTru` chia làm hai đống, phân biệt bằng chữ:
#     "chưa có phép đo cho lớp case này"                    (25 case)
#     "phép đo không kết luận được trên dữ kiện đọc được"   (88 case)
# Đống thứ hai gộp bốn nguyên nhân KHÁC HẲN nhau — thiếu dữ liệu, không khoanh được control,
# không có phiên đối chứng, phép đo trả None thật — nên đọc xong vẫn không biết phải làm gì.
#
# Nay `reason` là MÃ, và mã nói ra việc phải làm tiếp:
#     NO_MEASUREMENT_IMPLEMENTED  -> viết phép đo mới
#     measurement_returned_none   -> sửa phép đo đang có
#     precondition_unmet          -> mở đường dựng trạng thái (dữ liệu / quyền / phiên)
#     fixture_failed              -> SETUP hỏng, soi log dựng
#     measurement_error           -> lỗi lập trình, sửa mã
#     guard_blocked               -> hàng rào từ chối (đúng hay sai đều phải nêu)
#     db_expectation              -> kỳ vọng nằm ở CSDL, xin quyền truy vấn
#     concluded                   -> đã có P/F
CHUA_CHAY = 'planned_not_run'   # đã lên kế hoạch, chưa tới lượt (KHÔNG phải kết luận)
KQ_PASS, KQ_FAIL, KQ_PE = 'PASS', 'FAIL', 'PE'
KQ_CHUA_DO, KQ_LOI, KQ_CHAN = 'CHUA_DO', 'LOI', 'CHAN'
KQ_CLEANUP_FAILED = 'CLEANUP_FAILED'

_KQ_THEO_LOP = {XONG: None, PE_DB: KQ_PE, CHAN: KQ_CHAN, CHUA_DO: KQ_CHUA_DO,
                LOI: KQ_LOI, CAN_TAY: KQ_LOI}


def ban_ghi_thuc_thi(case, lop, mark=None, dau_vet=None, ly_do=None, chi_tiet='',
                     so_bang_chung=None):
    """Bản ghi thực thi của MỘT case — đúng khuôn §2, mọi trường đều có mặt.

    Trường nào chưa biết thì mang giá trị nói rõ *"chưa"* (`False` / `None` / `0`), không
    được vắng mặt: một khoá vắng mặt trong JSON đọc thành "không áp dụng", còn `False` đọc
    thành "đã hỏi, câu trả lời là không" — hai nghĩa khác nhau, và chỉ nghĩa thứ hai kiểm
    được.
    """
    dv = dau_vet or {}
    ten_phep = dv.get('phep_chay')
    kq = _KQ_THEO_LOP.get(lop)
    if kq is None:
        kq = {'P': KQ_PASS, 'F': KQ_FAIL, 'PE': KQ_PE}.get(mark, KQ_CHUA_DO)
    return {
        'tc_id': case.key,
        'measurement_attempted': bool(ten_phep or dv.get('phep_da_thu')),
        'measurement_name': ten_phep,
        'measurement_type': dv.get('loai_phep') or (
            phep_live.loai_phep(ten_phep) if ten_phep else None),
        'precondition': list(dv.get('tien_dieu_kien') or []),
        'fixture_created': dv.get('fixture'),
        'fixture_type': dv.get('fixture_loai'),
        'action_executed': bool(dv.get('da_thao_tac')),
        'evidence_count': int(so_bang_chung if so_bang_chung is not None
                              else dv.get('so_bang_chung') or 0),
        'result': kq,
        'reason': ly_do or dv.get('ly_do') or phep_live.PHEP_TRA_NONE,
        'reason_detail': chi_tiet or dv.get('chi_tiet_ly_do') or '',
        'fallback_used': dv.get('fallback'),
        'measurements_tried': list(dv.get('phep_da_thu') or []),
        # ── §C: bốn tình huống phải PHÂN BIỆT ĐƯỢC, không gộp ────────────────────────
        # `reason` một mình không đủ: nó nói *kết cục*, còn ba trường dưới nói *hỏng ở khâu
        # nào*. Lượt chạy 500 case ngày 17/09 có 63 case CHƯA ĐO và 26 case LỖI mà phải mở
        # log thô mới biết đâu là "chưa ai viết phép đo" (sửa bằng viết phép mới), đâu là
        # "dựng dữ liệu hỏng" (sửa bằng vá fixture), đâu là "phép đo chạy rồi nhưng không
        # kết luận được" (sửa bằng thêm fallback). Ba việc khác hẳn nhau.
        'fixture_name': dv.get('fixture_ten'),
        'fixture_status': dv.get('fixture_trang_thai'),
        'execution_status': dv.get('thuc_thi_trang_thai') or (
            'EXECUTED' if dv.get('da_thao_tac') else
            ('MEASURED_NO_ACTION' if ten_phep else 'NOT_EXECUTED')),
        'fallback_attempted': list(dv.get('fallback_da_thu') or []),
        'fallback_result': dv.get('fallback_ket_qua'),
        'evidence_at_none': dv.get('bang_chung_khi_none'),
        'final_reason': _ly_do_cuoi(lop, kq, ly_do or dv.get('ly_do'), dv),
    }


# Bốn tình huống của §C, xét theo thứ tự HẸP TRƯỚC — mỗi câu trả lời một việc phải làm khác
# nhau, nên câu nào nói rõ hơn thì thắng.
def _ly_do_cuoi(lop, kq, ly_do, dv):
    if kq in (KQ_PASS, KQ_FAIL, KQ_PE):
        return phep_live.DA_KET_LUAN
    ft = dv.get('fixture_trang_thai')
    if ft and ft not in ('TAO_DUOC', 'DUNG_LAI', 'TAO_DUOC_DOC_HUT') \
            and not str(ft).startswith('TAO_DUOC'):
        return phep_live.FIXTURE_HONG
    if kq == KQ_LOI:
        return 'execution_failed'
    if ly_do == phep_live.NO_MEASUREMENT or not (dv.get('phep_chay')
                                                 or dv.get('phep_da_thu')):
        return phep_live.NO_MEASUREMENT
    return ly_do or phep_live.PHEP_TRA_NONE


def die(msg):
    raise SystemExit('LỖI: ' + msg)


def _gio():
    return time.strftime('%Y-%m-%d %H:%M:%S')


# ══════════════════════════════════════════════════════════════════════════════
# 1. HÀNG RÀO AN TOÀN  — mọi thao tác phải xin phép ở đây
# ══════════════════════════════════════════════════════════════════════════════
class ThieuTaiKhoan(Exception):
    """Không tìm được tài khoản đăng nhập trong biến môi trường.

    Lớp riêng chứ không dùng `die()`: đây là chuyện VẬN HÀNH bình thường (chạy trên CI chưa
    cắm secret), và §4 của chỉ thị 16/09 lượt 2 đòi nó thành `BLOCKED` có lý do rõ ràng —
    không hỏi người, cũng không giả vờ là lỗi script. Thông báo KHÔNG bao giờ mang giá trị
    tài khoản, chỉ mang TÊN biến môi trường cần khai."""


class ChanAnToan(Exception):
    """Một thao tác bị hàng rào chặn. KHÔNG được bắt rồi chạy tiếp bằng đường khác."""


# Hạn mức số bản ghi được GHI XUỐNG ĐĨA cho một khối evidence. **0 = không hạn mức** và đó là
# mặc định (phương án A của chỉ thị 15/09 PHẦN 5: giữ trọn bằng chứng). Đặt `QA_MANG_EVIDENCE_MAX`
# chỉ khi kích thước file thật sự thành vấn đề — và khi đó khối evidence tự mang cờ
# `EVIDENCE_TRUNCATED` + `tong_request`/`so_luu`/`so_bo_qua` để không ai đọc nhầm một cái sổ
# bị cắt thành một cái sổ đầy đủ.
GIOI_HAN_EVIDENCE = int(os.environ.get('QA_MANG_EVIDENCE_MAX', '0') or 0)


class Cong:
    """Cổng an toàn của một lượt chạy — danh sách ĐÓNG các thao tác được phép.

    Vì sao là danh sách đóng (allowlist) chứ không phải danh sách cấm: sự cố 2026-08-02 xảy ra
    đúng vì luật lúc đó nêu *"ưu tiên thử ở tầng API"* mà không nêu **cấm ghi**, nên thao tác
    không được nghĩ tới mặc nhiên được phép. Ở đây ngược lại: thao tác không có tên trong
    `DUOC_PHEP` thì không chạy, kể cả khi case đòi (§hang_rao_an_toan mục 5).
    """

    # Toàn bộ là thao tác ĐỌC. Bốn thao tác đầu đúng bằng hàng rào của `probe_live`
    # (thẻ phân hệ · Đăng nhập · Thêm mới/Chỉnh sửa để MỞ · Hủy bỏ để đóng).
    DUOC_PHEP = {
        'dang_nhap': 'đăng nhập bằng tài khoản test',
        'mo_man': 'mở URL của màn (điều hướng)',
        'doc_dom': 'đọc DOM đã render',
        'mo_bieu_mau': 'mở biểu mẫu Thêm mới/Chỉnh sửa rồi Hủy bỏ (không Lưu)',
        'chup_anh': 'chụp màn hình làm bằng chứng',
        'doc_mang': 'đọc sổ request của Chrome',
        # ── thêm 2026-09-15 lượt 4: thao tác của người test trên chính màn đang mở.
        # Tất cả vẫn là thao tác KHÔNG đổi dữ liệu máy chủ (gõ vào ô, bấm nút mở/đóng, lật
        # trang, đổi mức phóng, ngắt mạng ở tầng trình duyệt). Thao tác đổi dữ liệu KHÔNG
        # nằm ở đây — nó đi qua `ghi()`, cổng riêng với ba điều kiện.
        'go_o': 'gõ/dán vào ô nhập trên màn (không gửi đi)',
        'bam_nut_doc': 'bấm nút KHÔNG đổi dữ liệu (tìm kiếm · lật trang · mở/đóng hộp thoại)',
        'ban_phim': 'gõ phím điều hướng (Tab · Shift+Tab · Enter · Escape)',
        'doi_zoom': 'đổi mức phóng của trang trong trình duyệt',
        'gia_lap_mang': 'bật/tắt chế độ mất mạng CỦA TRÌNH DUYỆT (không chạm máy chủ)',
        'xoa_phien_trinh_duyet': 'xoá cookie/token trong trình duyệt để dựng ca hết phiên',
        'tai_tep': 'nhận tệp do màn xuất ra (GET) vào thư mục của phiên',
        'don_du_lieu_qa': 'xoá bản ghi QA do chính lượt chạy tạo (bước CLEANUP)',
        # ── thêm 2026-09-16 (chỉ thị "nâng cấp live test") ──────────────────────────
        # Ba thao tác dưới đây vẫn KHÔNG đổi dữ liệu máy chủ. `mo_phong_mang` giữ request
        # lại ngay trong trình duyệt nên nó còn *ít* chạm máy chủ hơn một lượt đọc thường;
        # `nap_tep` đặt tệp vào ô chọn tệp mà KHÔNG bấm nút gửi; `chuot_nang_cao` là di
        # chuột/cuộn/bấm đúp — đường sự kiện của người dùng, không phải đường dữ liệu.
        'mo_phong_mang': 'giữ request tại trình duyệt và trả lời tại chỗ (page.route/mock)',
        'nap_tep': 'đặt tệp vào ô chọn tệp (KHÔNG bấm nút gửi)',
        'chuot_nang_cao': 'di chuột · cuộn · bấm đúp trên màn đang mở',
        'phien_doi_chung': 'mở phiên trình duyệt thứ hai bằng tài khoản vai trò đối chứng',
        'goi_api_doc': 'gọi API bằng GET/HEAD trong chính phiên đang đăng nhập (chỉ ĐỌC)',
    }

    def __init__(self, cho_phep_ghi=False, whitelist=(), ss=None, so=None, chinh_sach=None):
        # Bảng chính sách (`auto_confirm.ChinhSach`). Nó KHÔNG cấp thêm quyền nào — ba điều
        # kiện của `ghi()` vẫn nguyên; nó chỉ là chỗ ghi sổ *"đã tự quyết định gì, vì sao"*
        # để báo cáo minh bạch dù không ai ngồi xem lượt chạy.
        self.chinh_sach = chinh_sach
        self.cho_phep_ghi = bool(cho_phep_ghi)
        self.whitelist = {str(x).strip() for x in (whitelist or []) if str(x).strip()}
        self.ss = ss
        self.qa_tao = set()          # bản ghi do CHÍNH phiên này tạo (id/mã)
        self.nhat_ky = []            # mọi lần xin phép — vào `evidence/an-toan.json`
        self.so = so                 # SỔ dữ liệu QA (`qa_data.SoQA`) — nguồn chứng minh sở hữu
        self.cua_so = None           # cửa sổ ghi đang mở (`qalib.CuaSoGhiQA`), None = đang đóng
        self.cua_so_da_dung = []     # mọi cửa sổ đã đóng — vào evidence
        self.giay_phep_dem = 0

    # ── ghi nhận bản ghi do QA tạo trong phiên (mục 3 của hàng rào) ──────────────
    def them_ban_ghi_qa(self, ma, nhan=''):
        if not qalib.la_ban_ghi_qa(nhan or ma):
            raise ChanAnToan(
                'bản ghi %r không mang dấu nhận biết của QA (%s) — không được ghi nhận là dữ '
                'liệu do QA tạo' % (ma, '/'.join(t.upper() for t in qalib.TIEN_TO_QA[:3])))
        self.qa_tao.add(str(ma))
        self._ghi('tao_ban_ghi', ma, True, 'bản ghi QA tạo trong phiên')

    def so_huu(self, ma):
        """Có chứng minh được bản ghi này thuộc quyền thao tác của phiên không?

        Ba nguồn chứng minh, xét theo thứ tự chặt dần về sau:
          · SỔ DỮ LIỆU QA của lượt chạy (`qa_data.SoQA`) — nguồn chính từ 15/09 lượt 4: nó
            kiểm cả dấu của run, cả trạng thái còn sống, cả vân tay chủ sở hữu;
          · tập `qa_tao` trong bộ nhớ (đường cũ, giữ cho chỗ nào chưa có sổ);
          · `--whitelist` do người chạy khai tay.
        """
        ma = str(ma or '').strip()
        if not ma:
            return False
        if self.so is not None:
            try:
                self.so.chung_minh(ma)
                return True
            except Exception:
                pass
        return ma in self.qa_tao or ma in self.whitelist

    # ── xin phép một THAO TÁC ────────────────────────────────────────────────────
    def hanh_dong(self, ten, chi_tiet=''):
        ok = ten in self.DUOC_PHEP
        self._ghi(ten, chi_tiet, ok)
        if not ok:
            raise ChanAnToan(
                'thao tác %r KHÔNG nằm trong danh sách được phép của lượt chạy (%s). '
                'Hàng rào: PROMPT §hang_rao_an_toan + qalib §4c.'
                % (ten, ', '.join(sorted(self.DUOC_PHEP))))
        return True

    LOAI_THAO_TAC = {'tao': auto_confirm.QA_CREATE, 'sua': auto_confirm.QA_UPDATE,
                     'xoa': auto_confirm.QA_DELETE}

    def _loai_mutation(self, thao_tac):
        """Tên thao tác -> loại trong bảng chính sách. Không đoán ra được thì `UNKNOWN_WRITE`."""
        t = qalib.norm(thao_tac or '')
        for k, v in self.LOAI_THAO_TAC.items():
            if qalib.chua_tu(t, k) or t.startswith(k):
                return v
        return auto_confirm.UNKNOWN_WRITE

    def ghi(self, ma, thao_tac='ghi dữ liệu', nhan=''):
        """Cổng của MỌI thao tác thay đổi dữ liệu (PUT/DELETE/bấm Lưu/Xóa/Duyệt…).

        Ba điều kiện phải đủ CẢ BA, thiếu một là `ChanAnToan`:
          ① lượt chạy được bật `--cho-phep-ghi` (mặc định TẮT);
          ② bản ghi chứng minh được quyền sở hữu (QA tạo trong phiên, hoặc whitelist);
          ③ bản ghi mang dấu nhận biết QA — để một id whitelist chép nhầm cũng không lọt.

        ⚠️ Bảng chính sách tự động (`auto_confirm`) được hỏi TRƯỚC ba điều kiện này, và nó
        chỉ **thu hẹp** chứ không nới: nó chặn thêm những ca mà ba điều kiện cũ cho qua
        (sổ QA không dọn được, thao tác không phân loại được). Không có đường nào để một
        quyết định `ALLOW_*` bỏ qua ba điều kiện — chúng chạy ngay bên dưới, không rẽ nhánh.
        """
        ma = str(ma or '').strip()
        if self.chinh_sach is not None:
            qd = self.chinh_sach.mutation(self._loai_mutation(thao_tac), ma=ma, so_qa=self.so,
                                          cong=self, thuc_the=nhan or '')
            if not qd:
                self._ghi('ghi:' + thao_tac, ma, False, qd['ly_do'])
                raise ChanAnToan('%s: %s' % (qd['quyet_dinh'], qd['ly_do']))
        if not self.cho_phep_ghi:
            self._ghi('ghi:' + thao_tac, ma, False, 'lượt chạy không bật --cho-phep-ghi')
            raise ChanAnToan('lượt chạy KHÔNG bật --cho-phep-ghi: mọi thao tác %r bị chặn'
                             % thao_tac)
        if not self.so_huu(ma):
            self._ghi('ghi:' + thao_tac, ma, False, 'không chứng minh được quyền sở hữu')
            raise ChanAnToan(
                'bản ghi %r không thuộc dữ liệu do QA tạo trong phiên này và không có trong '
                '--whitelist ⇒ KHÔNG được %s (§hang_rao_an_toan mục 2)' % (ma or '(trống)', thao_tac))
        if not qalib.la_ban_ghi_qa(nhan or ma):
            self._ghi('ghi:' + thao_tac, ma, False, 'bản ghi không mang dấu QA')
            raise ChanAnToan('bản ghi %r không mang dấu nhận biết QA ⇒ không được %s (mục 3)'
                             % (ma, thao_tac))
        self.giay_phep_dem += 1
        self._ghi('ghi:' + thao_tac, ma, True, 'đã qua guard')
        # Trả một GIẤY PHÉP chứ không phải `True`: `live_ui.bam_ghi` đòi vật chứng này, nên
        # một đường ghi nào đó quên đi qua cổng sẽ ném lỗi ngay lần chạy đầu thay vì âm thầm
        # bấm được nút Lưu.
        return {'ma': ma, 'thao_tac': thao_tac, 'so': self.giay_phep_dem, 'luc': _gio()}

    # ── CỬA SỔ GHI (§4d) — mỗi thao tác đổi dữ liệu mở MỘT cửa sổ, đóng ngay sau đó ──
    def mo_cua_so(self, cs):
        """Mở cửa sổ ghi. Chỉ được MỘT cửa sổ mở tại một thời điểm.

        Vì sao chỉ một: cửa sổ là thứ duy nhất biến một request ghi thành hợp lệ. Hai cửa sổ
        chồng nhau thì một request không còn quy được về đúng case/bản ghi nào, và chính chỗ
        mập mờ ấy là chỗ một mutation lạ đi lọt.
        """
        if self.cua_so is not None and self.cua_so.dang_mo:
            raise ChanAnToan(
                'đã có một CỬA SỔ GHI đang mở (case %s · %s %s) — không mở chồng cửa sổ thứ hai'
                % (self.cua_so.case_key, self.cua_so.hanh_dong, self.cua_so.ma))
        self.cua_so = cs
        self._ghi('mo_cua_so_ghi', '%s %s (case %s)' % (cs.hanh_dong, cs.ma, cs.case_key), True,
                  'endpoint: %s' % ' · '.join(cs.endpoints))
        return cs

    def dong_cua_so(self, cs=None):
        cs = cs or self.cua_so
        if cs is None:
            return None
        cs.dong()
        self.cua_so_da_dung.append(cs.khoi())
        self._ghi('dong_cua_so_ghi', '%s %s' % (cs.hanh_dong, cs.ma), True,
                  '%d request ghi đã dùng' % len(cs.da_dung))
        self.cua_so = None
        return cs

    @property
    def cua_so_mo(self):
        return self.cua_so if (self.cua_so is not None and self.cua_so.dang_mo) else None

    def kiem_so_mang(self, so, ss=None, bo_roi=0, moc='', bom_hong=0):
        """Đối chiếu SỔ MẠNG với chính sách — thấy `WRITE`/`UNKNOWN` là DỪNG cả lượt chạy.

        Chỉ thị 2026-09-15 (PHẦN 5): *"Không tiếp tục chỉ vì testcase đang chạy"*. Lượt chỉ-đọc
        mà app phát sinh request ghi nghĩa là một trong hai điều, và điều nào cũng phải dừng:
        hoặc hàng rào ở tầng ý định đã hụt, hoặc app tự ghi dữ liệu khi chỉ mở màn — cái thứ hai
        là phát hiện đáng giá, không phải thứ để chạy lướt qua.

        Bằng chứng được ghi TRƯỚC khi ném lỗi: dừng mà không để lại sổ thì không ai lần ra được.

        `bo_roi` = số sự kiện hàng đợi của Chrome đã VỨT vì đầy (`Chrome.so_su_kien_bo()`).
        Khác 0 thì lượt chạy **fail-closed**: sổ thiếu bản ghi nào không ai biết, nên câu
        "0 WRITE" lúc này không chứng minh được điều gì — và một phép an toàn không chứng
        minh được gì thì phải dừng, không được trả lời "sạch". `moc` là mốc gọi (sau case
        nào) để đọc evidence biết vi phạm lộ ra ở đâu.
        """
        vp = qalib.vi_pham_mang(so)
        bo_roi = int(bo_roi or 0) + int(bom_hong or 0)
        if ss:
            sm.ghi_json(os.path.join(ss.d_evi, 'mang.json'),
                        dict(self.khoi_evidence(so, vp, bo_roi, moc), bom_hong=int(bom_hong or 0)))
        self._ghi('kiem_so_mang', '%d request%s' % (len(so), ' · %s' % moc if moc else ''),
                  not vp and not bo_roi,
                  ('vi phạm: %s' % ' · '.join('%s %s' % (x['method'], x['url'][:60])
                                              for x in vp[:3])) if vp else
                  ('hàng đợi sự kiện VỨT %d bản ghi' % bo_roi if bo_roi else ''))
        if bom_hong:
            raise ChanAnToan(
                'KHÔNG ĐỌC ĐƯỢC sổ mạng %d lần (lệnh CDP bơm sổ lỗi) — phần mạng của case vừa '
                'chạy KHÔNG quan sát được, nên "0 WRITE" lúc này không chứng minh được gì. '
                'Dừng theo hướng an toàn thay vì chấm tiếp trong mù.' % bom_hong)
        if bo_roi:
            raise ChanAnToan(
                'HÀNG ĐỢI SỰ KIỆN của Chrome đã vứt %d request vì đầy (QA_CDP_EVENTS=%s) — sổ '
                'mạng KHÔNG đầy đủ, nên không thể kết luận "lượt chạy không phát sinh WRITE". '
                'Dừng theo hướng an toàn.\n   Nâng hạn mức rồi chạy lại: '
                'QA_CDP_EVENTS=%d python3 chay_live.py …'
                % (bo_roi, os.environ.get('QA_CDP_EVENTS', '4000'),
                   max(20000, (len(so) + bo_roi) * 3)))
        if vp:
            raise ChanAnToan(
                'SỔ MẠNG tố %d request GHI/LẠ trong một lượt chạy CHỈ ĐỌC%s — dừng lượt chạy, '
                'không ghi kết quả.\n   %s\n   Nếu đây là endpoint ĐỌC dựng bằng POST thì khai '
                'tường minh: --mang-cho-phep <origin+path hoặc path ĐÚNG BẰNG> (mỗi lần khai '
                'đều vào evidence).'
                % (len(vp), ' (%s)' % moc if moc else '',
                   '\n   '.join('%-6s %s   [%s] %s'
                                % (x['method'], x['url'][:90], x['loai'], x['ly_do'])
                                for x in vp[:6])))
        return so

    def khoi_evidence(self, so, vp, bo_roi=0, moc=''):
        """Khối JSON của `evidence/mang.json` — nói THẬT về độ đầy đủ của chính nó.

        Bản cũ ghi `so[-500:]` rồi vẫn in "sổ mạng N request": 1200 request vào, 500 request
        xuống đĩa, không một dòng nào nói phần chênh đã đi đâu. Nay mặc định ghi **TOÀN BỘ**
        (phương án A của chỉ thị). Ai bắt buộc phải chặn kích thước thì đặt
        `QA_MANG_EVIDENCE_MAX`; khi đó khối này mang cờ `EVIDENCE_TRUNCATED` cùng
        `tong_request`/`so_luu`/`so_bo_qua`, và **mọi bản ghi VI PHẠM đều được giữ lại** —
        phần bị cắt chỉ có thể là request đã phân loại sạch.
        """
        gh = GIOI_HAN_EVIDENCE
        canh_bao = []
        if gh > 0 and len(so) > gh:
            i_vp = {i for i, x in enumerate(so) if x.get('loai') in (qalib.GHI, qalib.LA)}
            giu = sorted(i_vp)[:gh]
            con = [i for i in range(len(so)) if i not in i_vp]
            if gh > len(giu):
                giu = sorted(giu + con[-(gh - len(giu)):])
            luu = [so[i] for i in giu]
            canh_bao.append('EVIDENCE_TRUNCATED')
        else:
            luu = list(so)
        if bo_roi:
            canh_bao.append('EVENT_QUEUE_OVERFLOW')
        return {'luc': _gio(), 'moc': moc or '(cuối lượt)',
                'dem': qalib.dem_so_mang(so),
                'tong_request': len(so), 'so_luu': len(luu),
                'so_bo_qua': len(so) - len(luu),
                'su_kien_roi_hang_doi': int(bo_roi),
                'day_du': len(luu) == len(so) and not bo_roi,
                'canh_bao': canh_bao,
                'so_vi_pham': len(vp), 'so_mang': luu}

    def _ghi(self, ten, chi_tiet, ok, ly_do=''):
        self.nhat_ky.append({'luc': _gio(), 'thao_tac': ten, 'chi_tiet': str(chi_tiet)[:120],
                             'cho_phep': bool(ok), 'ly_do': ly_do})

    def cat_nhat_ky(self):
        if self.ss:
            gh = GIOI_HAN_EVIDENCE
            ky = self.nhat_ky if gh <= 0 else self.nhat_ky[-gh:]
            sm.ghi_json(os.path.join(self.ss.d_evi, 'an-toan.json'),
                        {'luc': _gio(), 'cho_phep_ghi': self.cho_phep_ghi,
                         'whitelist': sorted(self.whitelist),
                         'cua_so_ghi': self.cua_so_da_dung,
                         'so_mutation_qa': sum(len(x.get('mutation') or [])
                                               for x in self.cua_so_da_dung),
                         'tong_muc': len(self.nhat_ky), 'so_luu': len(ky),
                         'day_du': len(ky) == len(self.nhat_ky),
                         'canh_bao': [] if len(ky) == len(self.nhat_ky) else ['EVIDENCE_TRUNCATED'],
                         'nhat_ky': ky})


# ══════════════════════════════════════════════════════════════════════════════
# 2. ĐỌC CASE TỪ WORKBOOK  (schema: `tcfix` + `qalib`, KHÔNG tự đoán)
# ══════════════════════════════════════════════════════════════════════════════
class Case:
    """Một dòng case. `key` KHÔNG mang số dòng — mã case là công thức theo dòng (§ghi_ket_qua 4)."""

    def __init__(self, bp, rn, b, c, d, nhom, lan):
        self.bp, self.rn = bp, rn
        self.b, self.c, self.d = b, c, d
        self.nhom = nhom                      # {'cn','grp','sub','sub2'}
        self.lan = lan                        # lần xuất hiện của nội dung trùng nhau
        noi_dung = '\x1f'.join((qalib.norm(b), qalib.norm(c)[:220]))
        self.bam = hashlib.sha1(noi_dung.encode('utf-8')).hexdigest()[:16]
        self.key = '%s#%s#%d' % (bp or 'BP', self.bam, lan)
        self.muc_db, self.truy_van = None, []
        self.thao_tac_ghi = []

    @property
    def ten_nhom(self):
        return self.nhom.get('sub2') or self.nhom.get('sub') or self.nhom.get('grp') or ''

    def __repr__(self):
        return '<Case %s r%d %s>' % (self.bp, self.rn, self.b[:40])


def sheets_cua(path):
    """(bp, tc) từng sheet test case — file gộp màn phụ có NHIỀU sheet BP.

    ⚠️ `tcfix.load(path)` trơn chỉ trả sheet ĐẦU: lối đã làm 5 chỗ im lặng báo 0/OK (xem
    `qalib` §1 và `pe_db.sheets_cua`).
    """
    first = tcfix.load(path)
    for i, bp in enumerate(first.bpsheets or [None]):
        yield bp, (first if i == 0 else tcfix.load(path, bp))


_LV_SAU = {'cn': ('grp', 'sub', 'sub2'), 'grp': ('sub', 'sub2'), 'sub': ('sub2',), 'sub2': ()}


def doc_cases(path):
    """[Case] của cả file, kèm ngữ cảnh nhóm (CN / khối / nhóm / nhóm con) của từng case."""
    ra = []
    for bp, tc in sheets_cua(path):
        nhom, dem = {'cn': '', 'grp': '', 'sub': '', 'sub2': ''}, {}
        for rn in tc.order:
            if rn < 12:
                continue
            lv = tc.lvl(rn)
            if lv == 'dem':
                continue
            if not (tc.c(rn, 'C') or '').strip():
                if lv in _LV_SAU:
                    nhom[lv] = (tc.c(rn, 'B') or '').split('\n')[0].strip()
                    for sau in _LV_SAU[lv]:
                        nhom[sau] = ''
                continue
            c = Case(bp, rn, (tc.c(rn, 'B') or '').strip(), tc.c(rn, 'C') or '',
                     tc.c(rn, 'D') or '', dict(nhom), 0)
            c.lan = dem.get(c.bam, 0)
            dem[c.bam] = c.lan + 1
            c.key = '%s#%s#%d' % (bp or 'BP', c.bam, c.lan)
            c.muc_db, c.truy_van = qalib.muc_case_db(tc, rn)
            c.thao_tac_ghi = [ten for _, ten in qalib.thao_tac_ghi(c.c, c.b)]
            ra.append(c)
    return ra


def soat_mapping(cases):
    """Khoá case phải là DUY NHẤT — trùng khoá là ghi kết quả vào nhầm dòng, im lặng."""
    thay, trung = {}, []
    for c in cases:
        if c.key in thay:
            trung.append((c.key, thay[c.key].rn, c.rn))
        thay[c.key] = c
    return trung


# ══════════════════════════════════════════════════════════════════════════════
# 3. PHÉP ĐO  — mỗi phép nói rõ nó kết luận được điều gì, và im khi không kết luận được
# ══════════════════════════════════════════════════════════════════════════════
# Nguyên tắc chung của cả khối này: **không kết luận được thì trả None**, đừng đoán. `None` đẩy
# case về lớp CHƯA ĐO (ô trống, có lý do) — mất một case là mất một dòng công việc, còn chấm bừa
# một case là gửi cho QA một kết luận sai, đắt hơn nhiều.
class Nguon:
    """Dữ kiện màn thật của một lượt: ảnh chụp DOM (`d`), hồ sơ màn, ảnh màn hình, sổ mạng."""

    def __init__(self, d, hs=None, anh=None, man='', url='', c=None):
        self.d = d or {}
        # Trình duyệt của lượt chạy. Phép đo TĨNH không dùng tới, nhưng `phep_liet_ke` cần
        # đọc thêm từ màn thật (control trong dòng · cụm phân trang · tên bảng) — ba nguồn
        # mà ảnh chụp `kho_control()` không có.
        self.c = c
        self.hs = hs or {}
        self.anh = anh
        self.man, self.url = man, url
        self.kho = kho_control(self.d)
        self.kho_them = kho_control(self.d, 'them')
        g = (self.hs.get('grounding') or {})
        self.verbatim = [str(x) for x in (g.get('verbatim') or [])]
        self.khong_co = [str(x) for x in (g.get('khong_co') or [])]

    @property
    def rong(self):
        """Màn không đọc được gì -> mọi phép đo phải im, không được kết luận F."""
        return pl.khong_phai_man(self.d) or not (
            self.kho or self.d.get('cot') or self.d.get('h1'))


def kho_control(d, pham_vi='man'):
    """[(loại, nhãn, nguồn)] — thành phần đọc được, KHOANH THEO PHẠM VI.

    ⚠️ Phạm vi là bắt buộc, không phải trang trí. Màn nào cũng có ô `Trạng thái` ở THANH LỌC và
    một ô `Trạng thái` khác trong BIỂU MẪU THÊM MỚI; trộn chung một kho thì case của khối
    `CHỨC NĂNG THÊM MỚI` được trả lời bằng ô của thanh lọc — sai control, mà báo cáo trông vẫn
    bình thường. Đây đúng là lỗ đã phải vá ở bộ sinh 2026-09-10 (khoá `loai_control` phải mang
    phạm vi CN); lớp B thừa hưởng luôn bài học đó thay vì dính lại.
    """
    ra = []
    if pham_vi == 'them':
        for x in ((d.get('form_them') or {}).get('control') or []):
            ra.append((pl.loai_tu_the(x.get('the') or '', x.get('nhan') or '', x),
                       x.get('nhan') or '', 'biểu mẫu Thêm mới'))
        tieu_de = ((d.get('form_them') or {}).get('tieu_de') or '').strip()
        if tieu_de:
            ra.append(('Tiêu đề popup', tieu_de, 'biểu mẫu Thêm mới'))
        return [(l, n, ng) for l, n, ng in ra if (n or '').strip()]
    for x in d.get('thanh_loc') or []:
        ra.append((pl.loai_tu_the(x.get('the') or '', x.get('nhan') or '', x),
                   x.get('nhan') or '', 'thanh lọc'))
    for n in d.get('nut_dau_man') or []:
        ra.append(('Button', n, 'nút đầu màn'))
    for t in d.get('the_so_lieu') or []:
        ra.append(('Thẻ số liệu', t.get('nhan') or '', 'thẻ số liệu'))
    for c in d.get('cot') or []:
        ra.append(('Cột bảng', c, 'cột bảng'))
    p = d.get('phan_trang') or {}
    # Cụm phân trang có thể mang HAI control (ô nhập tự do + ô chọn nhanh) — bộ case mẫu hoá
    # chúng thành HAI nhóm, nên bản kiểm kê "màn thật có gì" phải đếm cả hai. Bản cũ chỉ lấy
    # `o_so_ban_ghi` ⇒ case *"hiển thị đầy đủ các thông tin"* liệt kê đủ hai dòng mà màn thật
    # chỉ đếm được một, phép `liet_ke_thanh_phan` báo THIẾU cho một màn đang đúng.
    for op in (p.get('o_so_ban_ghi') or {}, p.get('o_chon_nhanh') or {}):
        if not op:
            continue
        ra.append((pl.loai_tu_the(op.get('the') or '', op.get('nhan') or '', op),
                   'Số bản ghi trên trang', 'phân trang'))
    if (p.get('o_nhap_trang') or '').startswith('có'):
        ra.append(('Textbox', 'Nhập số trang', 'phân trang'))
    for b in d.get('breadcrumb') or []:
        ra.append(('Breadcrumb', b, 'breadcrumb'))
    if d.get('h1'):
        ra.append(('Tiêu đề màn', d['h1'], 'h1'))
    return [(l, n, ng) for l, n, ng in ra if (n or '').strip()]


# ── PHẠM VI của một case: nó nói về vùng nào của màn? ─────────────────────────────────────
# Suy từ TÊN KHỐI CN — đúng nguồn mà bộ sinh dùng để đặt nhóm. Case nằm trong khối `CHỈNH SỬA`
# hỏi về ô trong biểu mẫu Chỉnh sửa; lượt chạy này không mở biểu mẫu đó (chỉ mở Thêm mới), nên
# phải trả về `sua` để mọi phép đo TỰ IM — thà không đo còn hơn đo nhầm control.
_PV = (('them moi', 'them'), ('chinh sua', 'sua'), ('cap nhat', 'sua'),
       ('xoa', 'xoa'), ('xuat excel', 'excel'), ('nhap excel', 'excel'),
       ('tim kiem', 'loc'), ('loc ', 'loc'), ('chi tiet', 'chi_tiet'),
       ('danh sach', 'danh_sach'))

# Lớp thứ hai, khớp theo BIÊN TỪ trên tên CN. Thêm 2026-09-16 lượt 3 sau khi đo được lỗ này:
# bảng `_PV` ở trên là bảng CỤM CỐ ĐỊNH, nên một CN tên *"THÊM PHẦN TỬ DANH MỤC"* (không có
# chữ "mới") rơi vào `'khac'`, và **mọi** phép đo có điều kiện `_pv(cs) in ('them','sua',…)`
# từ chối nó. Đo trên `TangDuLieuDanhMuc`: 26/34 case chưa có phép đo là vì đúng chỗ này —
# không phải vì thiếu phép đo, mà vì case không được xếp vào phạm vi nào.
#
# Xét SAU bảng cụm cố định để không đổi kết luận của màn nào đang chạy đúng, và khớp theo
# biên từ (`qalib.chua_tu`) vì `'xoa'` trơn ăn vào `'xoá bỏ lọc'`, `'them'` trơn ăn vào
# `'thêm vào'`.
# ⚠️ Danh sách này CỐ Ý ngắn. Mỗi mục phải là một ĐỘNG TỪ chỉ thao tác của CN, không phải
# một danh từ có mặt trong tên CN: bản thử đầu có `('danh muc', 'danh_sach')` và nó kéo CN
# *"NGỪNG DÙNG PHẦN TỬ DANH MỤC"* (41 case) vào phạm vi DANH SÁCH, tức là mở đường cho các
# phép đo bảng chạy trên một CN đổi trạng thái rồi kết luận về thứ case không hỏi.
_PV_TU = (('them', 'them'), ('tao moi', 'them'), ('sua', 'sua'), ('dieu chinh', 'sua'),
          ('xem', 'chi_tiet'), ('lich su', 'danh_sach'))


def pham_vi(case):
    """Phạm vi màn của một case, suy từ TÊN CHỨC NĂNG (cột CN).

    Trả `'khac'` khi không xếp được — và `'khac'` là một câu trả lời thật, không phải giá trị
    mặc định vô hại: phép đo nào hỏi phạm vi sẽ từ chối case. Vì vậy hai lớp khớp ở trên phải
    phủ hết lối đặt tên CN của bộ case, còn phần không phủ được thì lộ ra ở `cases.json` dưới
    mã `NO_MEASUREMENT_IMPLEMENTED` chứ không tan vào một câu chung.
    """
    cn = qalib.norm(case.nhom.get('cn') or '')
    if not cn:
        return 'danh_sach'
    for kw, pv in _PV:
        if kw in cn:
            return pv
    for kw, pv in _PV_TU:
        if qalib.chua_tu(cn, kw):
            return pv
    return 'khac'


def _kho_cua(ng, pv):
    """Kho thành phần ứng với phạm vi — `None` nghĩa là lượt chạy KHÔNG đọc được vùng đó."""
    if pv in ('danh_sach', 'loc'):
        return ng.kho
    if pv == 'them':
        return ng.kho_them or None
    return None


def _khop_nhan(kho, nhan):
    """Tìm thành phần trên màn theo nhãn — khớp hai chiều vì nhãn UI hay bị cắt/thêm dấu `*`."""
    n = qalib.norm(nhan).strip(' *:')
    if not n:
        return None
    for loai, ten, ng in kho:
        t = qalib.norm(ten).strip(' *:')
        if t == n:
            return (loai, ten, ng)
    for loai, ten, ng in kho:
        t = qalib.norm(ten).strip(' *:')
        if len(n) >= 4 and (n in t or t in n):
            return (loai, ten, ng)
    return None


def _ct_tu_thanh_loc(d, nhan, pv='danh_sach'):
    """Phần tử THẬT (dict có `the`/`gia_tri`/`goi_y`) của một ô, TRONG ĐÚNG PHẠM VI của case.

    Không trộn thanh lọc với biểu mẫu: ô `Trạng thái` của thanh lọc và ô `Trạng thái` của biểu
    mẫu Thêm mới có luật mặc định KHÁC NHAU (`-- Chọn trạng thái --` vs `-- Chọn --`, §0a).
    """
    n = qalib.norm(nhan).strip(' *:')
    ds = (list((d.get('form_them') or {}).get('control') or []) if pv == 'them'
          else list(d.get('thanh_loc') or []))
    for x in ds:
        t = qalib.norm(x.get('nhan') or '').strip(' *:')
        if t and (t == n or (len(n) >= 4 and (n in t or t in n))):
            return x
    return None


# ── các phép đo ───────────────────────────────────────────────────────────────────────────
_RX_DONG_TP = re.compile(r'^\s*(\d+)\.\s*(?:\[([^\]]+)\]\s*)?(.+?)\s*\*?\s*$')


def phep_liet_ke(case, ng):
    """① Case *"hiển thị đầy đủ các thông tin trong màn hình chức năng"*.

    Cột D của case này là bản LIỆT KÊ thành phần theo khuôn `N. [Loại] Nhãn` (khuôn ⑭ của bộ
    sinh) ⇒ so được từng dòng với màn thật. Đây là case duy nhất mà cột D là một danh sách máy
    đọc được, nên cũng là phép đo bắt được nhiều lỗi nhất: thiếu hẳn một control trên màn.
    """
    if 'hien thi day du cac thong tin trong man hinh' not in qalib.norm(case.b):
        return None
    kho = _kho_cua(ng, pham_vi(case))
    if not kho:
        return None                        # khối CHỈNH SỬA/XÓA/EXCEL — vùng đó không mở tới
    muon = []
    for dong in (case.d or '').split('\n'):
        m = _RX_DONG_TP.match(dong)
        if not m:
            continue
        loai, nhan = (m.group(2) or '').strip(), m.group(3).strip()
        if 'popup' in qalib.norm(loai) or 'popup' in qalib.norm(nhan):
            continue                      # thành phần của hộp thoại, không có trên màn danh sách
        muon.append((loai, nhan))
    if len(muon) < 2:
        return None                        # cột D không theo khuôn liệt kê -> không đo bằng phép này
    # ⚠️ Vá 2026-09-16 — lỗ F OAN CÓ HỆ THỐNG, đo được hai lượt chạy thật (15/09).
    # `kho` ở đây dựng từ `kho_control()`, mà kho ấy KHÔNG BAO GIỜ sinh ba thứ: nhãn
    # `Phân trang`, TÊN BẢNG/LƯỚI (chỉ sinh từng tên cột), và control NẰM TRONG DÒNG BẢNG
    # (icon Sửa/Xóa của từng bản ghi). Case liệt kê nào kể tới chúng cũng bị báo THIẾU dù
    # ảnh chụp có đủ. Nay đối chiếu thêm kho đọc TRỰC TIẾP TỪ MÀN (`man_live.kho_tren_man`),
    # và chỉ những thành phần VẮNG Ở CẢ HAI kho mới bị coi là thiếu.
    kho_man = []
    try:
        import man_live
        kho_man = man_live.kho_tren_man(ng.c, pham_vi(case) in ('them', 'sua')) \
            if getattr(ng, 'c', None) is not None else []
    except Exception:
        kho_man = []
    def _co_tren_man(n):
        if _khop_nhan(kho, n):
            return True
        try:
            import man_live
            return bool(man_live._khop_kho(kho_man, n)) if kho_man else False
        except Exception:
            return False
    thieu = [(l, n) for l, n in muon if not _co_tren_man(n)]
    du_kien = {'pham_vi': pham_vi(case), 'so_thanh_phan_khai': len(muon),
               'so_doc_duoc_tren_man': len(kho), 'so_doc_tu_man_that': len(kho_man),
               'thieu': ['%s%s' % (('[%s] ' % l) if l else '', n) for l, n in thieu][:12]}
    if not thieu:
        return 'P', ('Đối chiếu %d thành phần khai ở cột D với màn thật: có đủ.' % len(muon)), du_kien
    ghi_chu = ''
    for l, n in thieu[:3]:
        if any(qalib.norm(n) in qalib.norm(k) for k in ng.khong_co):
            ghi_chu = ' Hồ sơ màn đã ghi màn KHÔNG CÓ thành phần này (grounding.khong_co).'
            break
    return 'F', ('Màn thật THIẾU %d/%d thành phần cột D yêu cầu: %s.%s'
                 % (len(thieu), len(muon),
                    ' · '.join('%s' % n for _, n in thieu[:6]), ghi_chu)), du_kien


def phep_so_ban_ghi_trang(case, ng):
    """② Số bản ghi/trang khi mở màn lần đầu — LUẬT CỨNG ② (`qalib` §0a: bắt buộc 20).

    Luật THẮNG mọi dữ kiện (kể cả hồ sơ màn và cấu hình app), nên phép này chấm thẳng F khi
    màn chạy khác — và ghi đúng khối `[FIXED RULE VIOLATION]` mà PROMPT §0a-bis đòi.
    """
    nb, nhom = qalib.norm(case.b), qalib.norm(case.ten_nhom)
    if 'so ban ghi' not in nhom and 'so ban ghi' not in nb:
        return None
    if 'mac dinh' not in nb:
        return None
    if pham_vi(case) not in ('danh_sach', 'loc'):
        return None
    p = ng.d.get('phan_trang') or {}
    sbg = (p.get('so_ban_ghi_trang') or '').strip()
    if not sbg:
        return None                        # không khoanh được ô -> im, để CHƯA ĐO
    du_kien = {'so_ban_ghi_trang': sbg, 'luat': qalib.PAGE_SIZE_MAC_DINH,
               'the': (p.get('o_so_ban_ghi') or {}).get('the')}
    if sbg.replace('.', '').replace(',', '') == str(qalib.PAGE_SIZE_MAC_DINH):
        return 'P', ('Mở màn lần đầu: số bản ghi/trang = %s, đúng luật cứng.' % sbg), du_kien
    return 'F', qalib.bao_luat_cung(
        '%s › Số bản ghi trên trang' % (ng.man or 'màn'),
        'mặc định %d khi mở màn lần đầu' % qalib.PAGE_SIZE_MAC_DINH, sbg, ng.anh), du_kien


def phep_o_chon_mac_dinh(case, ng):
    """③ Giá trị mặc định của một Ô CHỌN — LUẬT CỨNG ① (không chọn sẵn giá trị nghiệp vụ)."""
    if 'gia tri mac dinh' not in qalib.norm(case.b):
        return None
    nhom = case.ten_nhom
    if not re.match(r'^(selectbox|combobox|ô chọn|o chon)', qalib.norm(nhom)):
        return None
    pv = pham_vi(case)
    if pv not in ('danh_sach', 'loc', 'them'):
        return None                        # ô của biểu mẫu Chỉnh sửa/hộp Xóa: không mở tới
    truong = qalib.field_of(nhom)
    x = _ct_tu_thanh_loc(ng.d, truong, pv)
    if not x:
        return None                        # không khoanh được ô -> im (có thể do probe bỏ sót)
    gt, goi_y = (x.get('gia_tri') or '').strip(), x.get('goi_y') or ''
    du_kien = {'o': truong, 'the': x.get('the'), 'gia_tri': gt, 'goi_y': goi_y}
    if qalib.la_o_trong(gt, goi_y):
        return 'P', ('Ô chọn "%s" đang ở trạng thái chưa chọn ("%s") — đúng luật cứng.'
                     % (truong, gt or goi_y or '(trống)')), du_kien
    mong = ('mặc định "%s", không tự chọn option đầu tiên' % qalib.PLACEHOLDER_CHON if pv == 'them'
            else 'chữ gợi ý "%s Chọn <nội dung cần tìm> %s", không chọn sẵn giá trị nghiệp vụ'
                 % (qalib.DAU_PLACEHOLDER, qalib.DAU_PLACEHOLDER))
    return 'F', qalib.bao_luat_cung(
        '%s › Ô chọn "%s" (%s)' % (ng.man or 'màn', truong,
                                   'biểu mẫu Thêm mới' if pv == 'them' else 'vùng tìm kiếm'),
        mong, gt, ng.anh), du_kien


def phep_the_so_lieu(case, ng):
    """④ Thẻ số liệu: có đúng nhãn và giá trị là một con số."""
    if not qalib.norm(case.ten_nhom).startswith('the so lieu'):
        return None
    if 'gia tri mac dinh' not in qalib.norm(case.b):
        return None
    if pham_vi(case) not in ('danh_sach', 'loc'):
        return None
    ten = qalib.field_of(case.ten_nhom)
    if not (ng.d.get('the_so_lieu') or []):
        return None                        # màn không đọc được thẻ nào -> im
    hit = None
    for t in ng.d['the_so_lieu']:
        if _khop_nhan([('Thẻ số liệu', t.get('nhan') or '', 'kpi')], ten):
            hit = t
            break
    if not hit:
        return 'F', ('Màn thật KHÔNG có thẻ số liệu "%s" (đọc được: %s).'
                     % (ten, ' · '.join((t.get('nhan') or '') for t in ng.d['the_so_lieu'])[:120])), \
               {'the': ten, 'doc_duoc': [t.get('nhan') for t in ng.d['the_so_lieu']]}
    gt = (hit.get('gia_tri') or '').strip()
    du_kien = {'the': hit.get('nhan'), 'gia_tri': gt}
    if re.match(r'^[\d.,\s]+$', gt) and re.search(r'\d', gt):
        return 'P', ('Thẻ "%s" hiện giá trị số: %s.' % (hit.get('nhan'), gt)), du_kien
    return 'F', ('Thẻ "%s" không hiện một con số nguyên mà là %r.'
                 % (hit.get('nhan'), gt[:40])), du_kien


def phep_hien_thi(case, ng):
    """⑤ Case *"Kiểm tra hiển thị <control>"* — control có mặt trên màn hay không.

    Chỉ chạy khi case gắn vào một NHÓM CON mang tên control (khuôn `<Loại> <Tên>`); nhóm là thứ
    duy nhất cho biết case đang hỏi về cái gì, vì tiêu đề case thường không nhắc lại tên control.
    """
    if not _khop_loi_van('hien_thi_control', case):
        return None
    nhom = case.nhom.get('sub2') or ''
    kho = _kho_cua(ng, pham_vi(case))
    if not kho:
        return None
    truong = qalib.field_of(nhom)
    hit = _khop_nhan(kho, truong)
    if hit:
        return 'P', ('Màn thật có %s "%s" (đọc ở %s).' % (hit[0], hit[1], hit[2])), \
               {'tim': truong, 'thay': {'loai': hit[0], 'nhan': hit[1], 'o': hit[2]}}
    them = ''
    if any(qalib.norm(truong) in qalib.norm(k) for k in ng.khong_co):
        them = ' Hồ sơ màn cũng ghi màn KHÔNG CÓ thành phần này (grounding.khong_co).'
    return 'F', ('Không tìm thấy "%s" trên màn thật (đã soi %d thành phần đọc được ở phạm vi '
                 '%s).%s' % (truong, len(kho), pham_vi(case), them)), \
           {'tim': truong, 'so_thanh_phan_doc_duoc': len(kho)}


PHEP = [('liet_ke_thanh_phan', phep_liet_ke),
        ('luat_cung_so_ban_ghi', phep_so_ban_ghi_trang),
        ('luat_cung_o_chon', phep_o_chon_mac_dinh),
        ('the_so_lieu', phep_the_so_lieu),
        ('hien_thi_control', phep_hien_thi)]


# Phạm vi mà mỗi phép đo ĐỌC ĐƯỢC. Khai ở đây để `--dry-run` và lượt chạy thật nói CÙNG một
# con số: bản đầu chỉ chặn phạm vi bên trong hàm đo, nên dry-run hứa 23 case rồi lượt thật chỉ
# kết luận được 14 — con số hứa hẹn sai là thứ người chạy dùng để lập kế hoạch.
_PV_CUA_PHEP = {
    'liet_ke_thanh_phan': ('danh_sach', 'loc', 'them'),
    'luat_cung_so_ban_ghi': ('danh_sach', 'loc'),
    'luat_cung_o_chon': ('danh_sach', 'loc', 'them'),
    'the_so_lieu': ('danh_sach', 'loc'),
    'hien_thi_control': ('danh_sach', 'loc', 'them'),
}


def _khop_loi_van(ten, case):
    """Phần khớp LỜI VĂN + PHẠM VI của từng phép — tách riêng để `--dry-run` đếm được mà
    không cần mở app."""
    if pham_vi(case) not in _PV_CUA_PHEP.get(ten, ()):
        return False
    nb, nhom = qalib.norm(case.b), qalib.norm(case.ten_nhom)
    if ten == 'liet_ke_thanh_phan':
        return 'hien thi day du cac thong tin trong man hinh' in nb
    if ten == 'luat_cung_so_ban_ghi':
        return ('so ban ghi' in nhom or 'so ban ghi' in nb) and 'mac dinh' in nb
    if ten == 'luat_cung_o_chon':
        return 'gia tri mac dinh' in nb and bool(re.match(r'^(selectbox|combobox|o chon)', nhom))
    if ten == 'the_so_lieu':
        return nhom.startswith('the so lieu') and 'gia tri mac dinh' in nb
    if ten == 'hien_thi_control':
        sub2 = case.nhom.get('sub2') or ''
        if not sub2 or not nb.startswith('kiem tra hien thi'):
            return False
        if any(k in qalib.norm(sub2) for k in ('hop xac nhan', 'popup', 'thong bao', 'hop thoai')):
            return False
        # ⚠️ HAI LƯỚI CHẶN, cả hai đều sinh ra từ ca thật đo được trên `LoaiNguon`:
        #  ① tiêu đề phải GỌI TÊN control. Nhóm `Phân trang` có case *"Kiểm tra hiển thị 20 bản
        #     ghi"* — đó là case về HÀNH VI phân trang, không phải về sự tồn tại của một control;
        #     nhận nó là đi tìm một thành phần tên "Phân trang" rồi chấm F cho màn đang đúng.
        #  ② tiêu đề có mệnh đề điều kiện (`khi …`, `sau khi …`, `với …`) là case về TRẠNG THÁI
        #     (giá trị quá dài, sau khi lọc…), phép đo "có/không có" không trả lời được.
        truong = qalib.norm(qalib.field_of(sub2))
        if not truong or truong not in nb:
            return False
        if re.search(r'(?:^|\s)(khi|sau khi|voi|neu|luc)\s', nb):
            return False
        return True
    return False


def do_case(case, ng):
    """Chạy phép đo hợp với case -> (mark, note, dữ kiện, tên phép) hoặc None nếu không kết luận."""
    for ten, ham in PHEP:
        if not _khop_loi_van(ten, case):
            continue
        kq = ham(case, ng)
        if kq is None:
            return None
        mark, note, du_kien = kq
        return mark, note, du_kien, ten
    return None


# ══════════════════════════════════════════════════════════════════════════════
# 4. PHÂN LOẠI CASE  (trước khi chạm app — quyết định case nào ĐƯỢC chạy)
# ══════════════════════════════════════════════════════════════════════════════
def phan_loai(case, cong):
    """(lớp, lý do) — thứ tự xét là thứ tự ưu tiên của luật, không đảo được.

    PE-CSDL xét TRƯỚC mọi thứ: case *"xóa bản ghi trong database"* vừa đòi thao tác ghi vừa
    đòi truy vấn CSDL; luật 14/09 (§4b) chốt nó là PE, và PE nói đúng hơn về việc phải làm gì
    tiếp theo (xin quyền truy vấn) so với "bị chặn".

    ⚠️ Đảo thứ tự 2026-09-15 lượt 4. Bản trước xét *"case có đòi thao tác ghi không"* TRƯỚC
    khi hỏi *"có phép đo nào chạy được case này không"*, nên 69/297 case của `LoaiNguon` bị
    chặn **kể cả khi** lượt chạy đã được cấp quyền ghi và đã có dữ liệu QA của chính nó. Nay
    hỏi phép đo trước: lượt chạy có `--cho-phep-ghi` thì case ghi đi thẳng vào kế hoạch chạy
    (dữ liệu do tool tự tạo, xem `qa_data`), và `CHAN` chỉ còn đúng nghĩa *"hàng rào đang
    TẮT"* chứ không còn nghĩa *"tool chưa làm"*.
    """
    if case.muc_db == 'toan_bo':
        return PE_DB, 'kỳ vọng nằm hẳn ở CSDL (§4b)', phep_live.KY_VONG_CSDL
    if _phep_cua(case, cong.cho_phep_ghi):
        return None, '', ''
    if case.thao_tac_ghi and not cong.cho_phep_ghi:
        return CHAN, ('đòi thao tác ghi (%s) mà lượt chạy KHÔNG bật --cho-phep-ghi'
                      % ' · '.join(case.thao_tac_ghi)), phep_live.HANG_RAO_CHAN
    return CHUA_DO, ('chưa có phép đo cho lớp case này'
                     + (' (case có thao tác ghi: %s)' % ' · '.join(case.thao_tac_ghi)
                        if case.thao_tac_ghi else '')), phep_live.NO_MEASUREMENT


def _phep_cua(case, cho_phep_ghi=True):
    """Tên phép đo ĐẦU TIÊN nhận case — soi CẢ hai bộ (bộ tĩnh cũ + bộ chạy thao tác mới)."""
    for ten, _ in PHEP:
        if _khop_loi_van(ten, case):
            return ten
    return phep_live.phep_cua(case, cho_phep_ghi)


def _cac_phep_cua(case, cho_phep_ghi=True):
    """TẤT CẢ phép đo nhận case, theo thứ tự sẽ được thử. -> [tên phép]

    Khác `_phep_cua` (chỉ trả phép đầu tiên) vì `phep_live.chay()` **thử lần lượt** cho tới
    khi có phép kết luận: một case có thể được đo bằng phép thứ ba trong danh sách. Bảng
    PILOT phải hỏi *"nhóm này có case nào KHÔNG"*, và hỏi bằng phép đầu tiên thì trả lời sai —
    ví dụ `ma_da_ton_tai` luôn đứng sau `validate_o_nhap`, nên nhóm *"dữ liệu trùng"* trông
    như không có case nào trong khi nó có.
    """
    ra = [ten for ten, _ in PHEP if _khop_loi_van(ten, case)]
    for p in phep_live.PHEP:
        if p['can_ghi'] and not cho_phep_ghi:
            continue
        try:
            if p['nhan'](case):
                ra.append(p['ten'])
        except Exception:
            continue
    return ra


# ══════════════════════════════════════════════════════════════════════════════
# 5. GHI KẾT QUẢ  — đi ĐÚNG pipeline đang có, không mở đường ghi Excel thứ hai
# ══════════════════════════════════════════════════════════════════════════════
def hau_ky(path):
    """Cột R là CÔNG THỨC: ghi mark xong phải áp lại lớp công thức rồi dựng lại cache.

    Giống hệt `ket_qua._hau_ky` và `pe_db.hau_ky` — cùng một thứ tự, cùng hai script.
    """
    ok = True
    for sc in ('formula_layer.py', 'postfix_cache.py'):
        r = subprocess.run([sys.executable, os.path.join(HERE, sc), path],
                           capture_output=True, text=True)
        if r.returncode:
            ok = False
            print('    !! %s lỗi: %s' % (sc, (r.stderr or r.stdout).strip().splitlines()[-1:]))
    return ok


def nghiem_thu_ghi(path):
    """`formula_layer --check` sau khi ghi — §ghi_ket_qua mục 6 đòi A-sai 0 · R-sai 0."""
    r = subprocess.run([sys.executable, os.path.join(HERE, 'formula_layer.py'), '--check', path],
                       capture_output=True, text=True)
    dong = [x for x in (r.stdout or '').strip().splitlines() if x.strip()]
    return r.returncode, (dong[-1] if dong else '(không có đầu ra)')


def ghi_ket_qua(path, cases, trang_thai, col, ss=None, ghi_lai=False):
    """Ghi mark + ghi chú vào file kết quả. Trả (số dòng đã ghi, danh sách sheet đã ghi).

    Ba luật của §ghi_ket_qua được thi hành ở đây, KHÔNG viết lại logic nào:
      · không đụng cột R  -> dùng `qalib.write_marks` (ghi F/T, giữ style ô)
      · gộp nhiều phép đo trên một dòng, F thắng PE thắng P -> `qalib.build_marks`
      · dựng lại cache    -> `hau_ky()`
    """
    if qalib.is_locked(path):
        die('file kết quả đang mở trong LibreOffice, không ghi được: %s' % path)
    theo_bp = {}
    for c in cases:
        st = trang_thai.get(c.key) or {}
        if not st.get('mark'):
            continue
        theo_bp.setdefault(c.bp, {})[c.key] = {'mark': st['mark'], 'note': st.get('note') or ''}
    n_ghi, da_ghi = 0, []
    for bp, res in theo_bp.items():
        moc = 'ghi:%s:%s' % (col, bp or 'BP')
        if ss and ss.da_xong(moc) and not ghi_lai:
            # Ghi hai lần là `write_marks` thấy ô đã có giá trị rồi gắn tiền tố `[Lần 2]` cho
            # chính lượt này -> lịch sử chạy sai. Resume phải nhớ mình đã ghi.
            print('    (sheet %s đã được ghi ở lượt trước — bỏ qua, thêm --ghi-lai để ghi đè)'
                  % (bp or 'BP'))
            continue
        row_map = {c.key: c.rn for c in cases if c.bp == bp and c.key in res}
        plan = qalib.build_marks(res, row_map)
        if not plan:
            continue
        qalib.write_marks(path, plan, backup_suffix='chay_live', cols=(col, 'T'), bp=bp)
        n_ghi += len(plan)
        da_ghi.append(bp or 'BP')
        if ss:
            ss.xong_buoc(moc)
    if n_ghi:
        hau_ky(path)
    return n_ghi, da_ghi


# ══════════════════════════════════════════════════════════════════════════════
# 6. MỘT LƯỢT CHẠY  (một màn = một phiên)
# ══════════════════════════════════════════════════════════════════════════════
class Viec:
    """Tham số của MỘT lượt chạy case (song song `probe_live.Viec` nhưng của lớp B)."""

    def __init__(self, role, man, src, dst, sid, url=None, col='F', apply=False, dry=False,
                 resume=False, hien=False, spec=None, phan_he=pl.PHAN_HE_MAC_DINH,
                 home=None, login=None, timeout=pl.TIMEOUT_MAC_DINH, goc=None,
                 cho_phep_ghi=False, whitelist=(), user=None, pw=None, ghi_lai=False,
                 dong_y=False, pe_chan=False, mang_cho_phep=(), chi_don=False, so_case=0,
                 verify=False, dong='',
                 pilot=False,
                 chinh_sach=None):
        self.role, self.man, self.src, self.dst = role, man, src, dst
        self.sid, self.url, self.col = sid, url, col
        self.apply, self.dry, self.resume = apply, dry, resume
        self.hien, self.spec, self.phan_he = hien, spec, phan_he
        self.home, self.login, self.timeout = home, login, int(timeout or 0)
        self.goc = goc
        self.cho_phep_ghi, self.whitelist = cho_phep_ghi, list(whitelist or [])
        self.user, self.pw, self.ghi_lai, self.dong_y = user, pw, ghi_lai, dong_y
        self.pe_chan = pe_chan
        self.chi_don = bool(chi_don)      # chỉ chạy bước DỌN dữ liệu QA còn tồn rồi thoát
        self.verify = bool(verify)        # --don-du-lieu-qa --verify: chỉ ĐỌC, không xoá
        self.dong = dong or ''            # --dong: chỉ chạy các dòng Excel nêu đích danh
        # Lô nhỏ: chạy tối đa `so_case` case rồi dừng (vẫn DỌN đầy đủ). Dùng cho bước "chạy
        # thử 5–10 case trước khi chạy cả bộ" — bắt buộc trước lượt đầu tiên trên app thật.
        self.so_case = int(so_case or 0)
        # §20 — lô PILOT: 1-2 case cho mỗi nhóm năng lực, chạy TRƯỚC lượt đầy đủ.
        self.pilot = bool(pilot)
        # Endpoint ĐỌC dựng bằng POST mà người chạy khai tường minh (mặc định RỖNG = chặt nhất).
        self.mang_cho_phep = list(mang_cho_phep or [])
        # Bảng chính sách TỰ QUYẾT ĐỊNH (§6). Mặc định: non-interactive — lượt chạy live
        # không bao giờ dừng lại chờ người trả lời.
        self.chinh_sach = chinh_sach or auto_confirm.ChinhSach()


def _nap_trang_thai(ss):
    return (sm.doc_json(os.path.join(ss.d_kq, 'cases.json')) or {}) if ss else {}


def _cat_trang_thai(ss, v, tt, tom):
    """Ghi `result/cases.json` NGAY sau mỗi case — tiến trình chết giữa chừng vẫn resume được."""
    if not ss:
        return
    sm.ghi_json(os.path.join(ss.d_kq, 'cases.json'),
                {'luc': _gio(), 'role': v.role, 'man': v.man, 'file': v.dst, 'col': v.col,
                 'url': v.url, 'tom_tat': tom, 'cases': tt})


def _mo_man(v, ss, cong):
    """Đăng nhập + đọc DOM màn -> (Nguon, Chrome, [vi phạm method]).

    Dùng `probe_live` như THƯ VIỆN: `dang_nhap()` và `soi()` là hai hàm chỉ-đọc. Lớp B không
    chép lại chúng (PHẦN 16: một hạ tầng, hai lớp dùng), và cũng không gọi bất cứ hàm nào của
    `probe_live` có ghi file/ghi kết quả.
    """
    # QUYẾT ĐỊNH TỰ ĐỘNG ②: tài khoản đăng nhập (§9 của chỉ thị 17/09). Tìm bằng
    # `tai_khoan.tim()` — biến môi trường, tệp env NGOÀI repo, hoặc lệnh lấy bí mật; khuôn
    # tên biến cấu hình được, KHÔNG chốt cứng tiền tố `QA_`. KHÔNG hỏi người, KHÔNG in giá
    # trị. Thiếu thì lượt chạy dừng bằng `ThieuTaiKhoan` mang mã `MISSING_CREDENTIAL:<role>`
    # — một KẾT LUẬN có mã máy đọc được, không phải một câu hỏi.
    tk = pl.tim_tai_khoan(v.role, v.user, v.pw)
    user, pw = (tk.user, tk.pw) if tk else (None, None)
    # NGUỒN ④ của §1 — *"session đã đăng nhập"*. Không có tài khoản nào nhưng hồ sơ Chrome
    # của phiên còn kho cookie thì VẪN thử: `probe_live.dang_nhap` mở màn rồi hỏi chính app
    # xem phiên còn sống không. Còn thì chạy tiếp; hết thì nó `die()` bằng đúng câu
    # `MISSING_CREDENTIAL`. Tool không tự phán cookie còn hiệu lực — app phán.
    phien_cu = (not tk) and ss is not None and tai_khoan.phien_san_co(ss.profile)
    if not v.chinh_sach.tai_khoan(v.role, user, pw,
                                  nguon=(tk.nguon if tk else
                                         ('session sẵn có' if phien_cu else 'environment'))):
        if not phien_cu:
            raise ThieuTaiKhoan(tai_khoan.thieu(v.role))
        print('   · không có tài khoản cấu hình — thử dùng PHIÊN ĐĂNG NHẬP SẴN CÓ của hồ sơ '
              'trình duyệt; hết phiên thì lượt chạy dừng bằng MISSING_CREDENTIAL')
    cong.hanh_dong('dang_nhap', v.url)
    c = pl._mo_chrome(pl.Viec(url=v.url, sid=v.sid, role=v.role, hien=v.hien, goc=v.goc), ss)
    pl._ghi_chrome(ss, c, giu=v.hien)
    canh = None
    if v.timeout > 0:
        canh = threading.Timer(v.timeout, c.kill, kwargs={'het_gio': True})
        canh.daemon = True
        canh.start()
    try:
        print('CHROME: %s  (CDP cổng %d, %s)'
              % (c.ver.get('Browser'), c.port, 'cửa sổ thật' if v.hien else 'headless'))
        co_so = c.bat_mang()
        print('SỔ MẠNG: %s' % ('bật — mọi request khác GET sẽ bị nêu tên'
                               if co_so else 'KHÔNG bật được (Network.enable bị từ chối)'))
        if ss:
            ss.pha('đăng nhập')
            ss.dat(sm.LOGIN)
        print('ĐĂNG NHẬP -> %s'
              % pl.dang_nhap(c, v.url, user, pw, v.phan_he, v.home, v.login))
        if ss:
            cong.hanh_dong('chup_anh', '01-sau-dang-nhap.png')
            c.shot(os.path.join(ss.d_shot, '01-sau-dang-nhap.png'))
            ss.xong_buoc('login')
            ss.dat(sm.READY)
            ss.dat(sm.RUNNING)
            ss.pha('đọc màn')
        # ⚠️ KHÔNG xoá sổ mạng ở đây (bản 15/09 lượt 1 có xoá — đã bỏ theo chỉ thị lượt 2).
        # `POST /api/login` được GIỮ trong sổ và được phân loại `AUTH` kèm lý do; một cái sổ có
        # thể xoá thì không còn là bằng chứng. Xem `qalib` §4c-bis.
        cong.hanh_dong('mo_man', v.url)
        cong.hanh_dong('doc_dom', 'soi() — h1/breadcrumb/cột/thanh lọc/nút/thẻ số liệu/phân trang')
        cong.hanh_dong('mo_bieu_mau', 'Thêm mới (mở rồi Hủy bỏ)')
        d = pl.soi(c, v.url, sua=False)
        anh = None
        if ss:
            cong.hanh_dong('chup_anh', '02-man.png')
            anh = c.shot(os.path.join(ss.d_shot, '02-man.png'))
            ss.xong_buoc('doc_man')
        cong.hanh_dong('doc_mang', 'Network.requestWillBeSent')
        so = qalib.so_mang(c.lay_mang(), v.mang_cho_phep)
        return Nguon(d, qalib.ho_so_man(v.src), anh, v.man, v.url, c=c), c, so
    except BaseException:
        if ss:
            c.shot(os.path.join(ss.d_shot, '99-loi.png'))
        if c.het_gio:
            raise TimeoutError('quá %d giây (đổi bằng --timeout / QA_SESSION_TIMEOUT)' % v.timeout)
        raise
    finally:
        if canh:
            canh.cancel()


def _bat_tai_tep(c, ss, cong):
    """Cho phép trang TẢI TỆP về thư mục của phiên (case Xuất excel). -> đường dẫn, hoặc None.

    Chỉ nhận tệp do màn tự xuất ra bằng `GET`; không tự gọi endpoint xuất, không mở tệp nào
    ngoài thư mục này.
    """
    d = os.path.join(ss.dir if ss else '.', 'tai-ve')
    os.makedirs(d, exist_ok=True)
    try:
        cong.hanh_dong('tai_tep', d)
        c.ws.call('Page.setDownloadBehavior', behavior='allow', downloadPath=d)
        return d
    except Exception:
        try:
            c.ws.call('Browser.setDownloadBehavior', behavior='allow', downloadPath=d)
            return d
        except Exception:
            return None


def _quet_ma_qa(ctx):
    """[mã QA còn trên app] — quét HẾT, không chỉ trang đang hiện. -> list | ném RuntimeError.

    ⚠️ VÁ 2026-09-17 lượt 2. `live_ui.ma_tren_app()` chỉ đọc TRANG ĐANG HIỆN (nó nói rõ thế
    trong docstring), mà bước dọn gọi nó để trả lời câu *"app còn bản ghi QA nào không"*. Một
    lượt chạy tạo hơn một trang dữ liệu QA thì phần thừa **không bao giờ vào tầm mắt**: đo
    được 17/09 — dọn 36 bản ghi, báo sạch, app còn đúng 20 bản ghi (vừa tròn một trang).

    Nâng cỡ trang cho phủ hết tổng rồi mới đọc. Dùng chính ô *Số bản ghi/trang* của app nên
    không cần lật trang — lật trang giữa lúc dọn là đổi trạng thái màn ngay dưới chân mình.
    """
    ctx.ve_danh_sach()
    goc = live_ui.doc_bang(ctx.c)
    live_ui.tim_kiem(ctx.c, qalib.QA_TIEN_TO, cho=ctx.hs_so('tim_kiem_debounce_ms'))
    pt = live_ui.doc_phan_trang(ctx.c) or {}
    tong = pt.get('tong_so')
    if tong and live_ui.so_trang(pt) > 1:
        # +5 cho chắc: tổng có thể nhích lên giữa chừng nếu một case còn đang chạy.
        live_ui.dat_muc_trang(ctx.c, int(tong) + 5, cho=1.6)
        pt = live_ui.doc_phan_trang(ctx.c) or {}
    ra = live_ui.ma_tren_app(ctx.c, _cot_ma(ctx))
    if not ra and not goc:
        raise RuntimeError('không đọc được danh sách trên app (bảng rỗng cả khi bỏ lọc)')
    if live_ui.so_trang(pt) > 1:
        raise RuntimeError('vẫn còn %s trang kết quả sau khi nâng cỡ trang — quét có thể sót'
                           % live_ui.so_trang(pt))
    return ra


def _cot_ma(ctx):
    """Tên CỘT MÃ trên bảng — để chỉ đọc mã ở đúng cột ấy khi quét dữ liệu QA còn sót.

    ⚠️ VÁ 2026-09-17 lượt 2. `ma_tren_app()` không truyền cột thì nó nhận MỌI ô có giá trị mở
    đầu bằng dấu `zzqa` — mà bản ghi QA mang dấu ấy ở CẢ cột `Code` LẪN cột `Tên hiển thị`
    (`ZZQA_… Dữ liệu QA tự động`). Hậu quả:

      · nghiệm thu đếm gấp đôi (20 bản ghi đọc ra "40");
      · **bước ĐỐI SOÁT trước khi dọn nạp tên hiển thị vào sổ như thể là MÃ bản ghi**, rồi đi
        tìm một bản ghi mang mã ấy — không bao giờ thấy ⇒ `CLEANUP_FAILED` cho một lượt dọn
        đã sạch, và dọn lại bao nhiêu lần cũng vẫn hỏng y như thế.

    Cột mã lấy từ hồ sơ màn (ô đầu của biểu mẫu), không chốt cứng chữ "Code".
    """
    try:
        return ctx.o_ma() or ''
    except Exception:
        return ''


def _nghiem_thu_don(v, ss, cong, so_qa, hs):
    """`--don-du-lieu-qa --verify`: CHỈ ĐỌC — quét app tìm dữ liệu QA còn sót, không xoá gì.

    §G của chỉ thị 17/09 lượt 2: **app là nguồn chân lý cuối cùng của bước dọn**. Một cái sổ
    nói "đã dọn sạch" chỉ là lời khai của tool về việc tool đã làm gì; nó không trả lời được
    câu *"trên hệ thống thật còn bản ghi QA nào không"*. Lượt chạy 500 case ngày 17/09 để lại
    đúng khoảng trống ấy: sổ ghi 51 DA_DON + 50 KHONG_THAY, mà app vẫn còn 4 bản ghi.

    Quét theo dấu QA CHUNG (`zzqa`), không theo `run_id`: rác của một lượt chạy chết giữa
    chừng từ hôm trước cũng phải hiện ra ở đây, nếu không thì lệnh nghiệm thu chỉ nghiệm thu
    được đúng lượt vừa chạy. Không xoá gì — người đọc quyết định, và lệnh dọn là lệnh khác.
    """
    print('\nNGHIỆM THU DỌN (chỉ đọc) — quét app tìm dữ liệu QA còn sót')
    ng, c, so_mang = _mo_man(v, ss, cong)
    tren_app, loi = [], ''
    try:
        ctx = phep_live.Ctx(c, ng, hs, so_qa, cong, v.url, v.man,
                            ghi_so_mang=lambda cs: None, anh=ng.anh, cho_phep_ghi=False)
        ctx.thu_muc_tai = None
        ctx.can_dang_nhap_lai = False
        try:
            tren_app = _quet_ma_qa(ctx)
        except RuntimeError as e:
            # Cùng lưới chắn "đọc mù" của bước dọn: không chứng minh được là đang nhìn thấy
            # màn thì "không thấy gì" KHÔNG phải là "sạch".
            tren_app, loi = [], str(e)
        ctx.ve_danh_sach()
    finally:
        if c is not None:
            c.close()
            pl._ghi_chrome(ss, c, giu=False)
        cong.cat_nhat_ky()
    trong_so = {m['ma'] for m in so_qa.con_ton()}
    la = [x for x in tren_app if x not in trong_so]
    print('   sổ phiên  : %d bản ghi còn tồn' % len(trong_so))
    print('   trên app  : %d bản ghi mang dấu %r' % (len(tren_app), qalib.QA_TIEN_TO))
    for x in tren_app[:40]:
        print('      · %s%s' % (x, '   (SỔ KHÔNG BIẾT)' if x in la else ''))
    dat = (not loi) and not tren_app
    print('   KẾT LUẬN  : %s' % ('SẠCH — app không còn bản ghi QA nào' if dat else
                                 (loi or 'CÒN %d bản ghi QA trên app' % len(tren_app))))
    return {'id': v.sid or '-', 'trang_thai': sm.COMPLETED if dat else sm.FAILED,
            'man': v.man,
            'tom_tat': {'nghiem_thu_don': {'tren_app': tren_app, 'trong_so': sorted(trong_so),
                                           'la_voi_so': la, 'dat': dat, 'loi': loi}},
            'ly_do': '' if dat else (loi or 'CLEANUP_VERIFY_FAILED')}


def _chi_don(v, ss, cong, so_qa, hs):
    """`--don-du-lieu-qa`: chỉ mở màn rồi DỌN nốt bản ghi QA còn tồn của lượt trước.

    Đường thoát cho hai tình huống: lượt trước `CLEANUP_FAILED`, hoặc tiến trình chết giữa
    chừng. Không chấm case nào, không ghi workbook — sổ dữ liệu QA là thứ duy nhất nó đọc,
    nên nó không bao giờ đi tìm bản ghi nào ngoài sổ.
    """
    con = so_qa.con_ton()
    print('\nCHỈ DỌN DỮ LIỆU QA — sổ %s' % so_qa.duong)
    print('   lượt chạy QA: %s · còn tồn trong sổ: %d bản ghi' % (so_qa.run_id, len(con)))
    if not v.cho_phep_ghi:
        die('dọn dữ liệu QA là thao tác XOÁ — phải chạy kèm --cho-phep-ghi')
    # Sổ RỖNG vẫn phải MỞ MÀN mà đối soát: chính ca `CLEANUP_FAILED` của lượt trước là ca sổ
    # nói "sạch" còn app còn rác (16/09 — 2 bản ghi trùng mã do case bấm Lưu liên tục sinh ra).
    # Tin sổ mà thoát sớm ở đây thì đường thoát duy nhất của `CLEANUP_FAILED` không bao giờ dọn
    # được đúng thứ nó sinh ra để dọn. Đối soát đọc app, và chỉ nhận mã mang dấu CHÍNH lượt này.
    if not con:
        print('   sổ rỗng — vẫn mở màn ĐỐI SOÁT với app trước khi kết luận sạch.')
    ng, c, so_mang = _mo_man(v, ss, cong)
    try:
        def _vet(cua_so=None, moc=''):
            them = qalib.so_mang(c.bom_mang(), v.mang_cho_phep, cua_so)
            if them:
                so_mang.extend(them)
            cong.kiem_so_mang(so_mang, ss, c.so_su_kien_bo(), moc, c.so_bom_hong())
        ctx = phep_live.Ctx(c, ng, hs, so_qa, cong, v.url, v.man,
                            ghi_so_mang=lambda cs: _vet(cs, 'cửa sổ dọn %s' % cs.ma),
                            anh=ng.anh, cho_phep_ghi=True)
        ctx.thu_muc_tai = None
        ctx.can_dang_nhap_lai = False
        don = _don_du_lieu_qa(ctx, v, ss, cong, _vet)
    finally:
        if c is not None:
            c.close()
            pl._ghi_chrome(ss, c, giu=False)
        cong.cat_nhat_ky()
    return {'id': v.sid or '-',
            'trang_thai': sm.FAILED if don.get('CLEANUP_FAILED') else sm.COMPLETED,
            'man': v.man, 'tom_tat': {'qa_data': so_qa.tom_tat(), 'don': don},
            'ly_do': 'CLEANUP_FAILED' if don.get('CLEANUP_FAILED') else ''}


def _dang_nhap_lai(v, c, cong, ctx):
    """Đăng nhập lại sau một case cố ý xoá phiên, rồi đưa màn về danh sách."""
    tk = pl.tim_tai_khoan(v.role, v.user, v.pw)
    if not tk:
        raise ThieuTaiKhoan(tai_khoan.thieu(v.role))
    user, pw = tk.user, tk.pw
    cong.hanh_dong('dang_nhap', 'đăng nhập lại sau case ngoại lệ phiên')
    pl.dang_nhap(c, v.url, user, pw, v.phan_he, v.home, v.login)
    c.go(v.url)
    c.wait("document.querySelectorAll('table th').length?1:0", 30)
    time.sleep(1.0)
    ctx.can_dang_nhap_lai = False


def _don_du_lieu_qa(ctx, v, ss, cong, vet_mang):
    """DỌN + NGHIỆM THU DỌN — bước cuối bắt buộc của vòng đời dữ liệu QA (§5, §8).

    Dọn từng bản ghi bằng ĐÚNG đường người dùng đi (tìm bản ghi trên danh sách → icon Xóa →
    xác nhận), mỗi bản ghi một cửa sổ ghi riêng. Ba tính chất §8 đòi:

      · **idempotent** — bản ghi đã không còn trên app là CLEAN, không phải lỗi;
      · **fail-stop**  — một bản ghi dọn hỏng là `CLEANUP_FAILED`: dừng ngay, không dọn tiếp;
      · **không đoán** — chỉ dọn thứ có tên trong sổ, không quét app tìm thêm gì để xoá.
    """
    so = ctx.so
    kq = {'con_truoc_khi_don': 0, 'da_don': 0, 'khong_thay': 0, 'hong': 0,
          'nghiem_thu': None, 'con_sot': [], 'ly_do': ''}
    kh = ctx.vb('xoa_don_le') or {}

    def _xoa_mot(m):
        cong.hanh_dong('don_du_lieu_qa', m['ma'])
        ctx.ve_danh_sach()
        dong = ctx.hien_ban_ghi_qa(m['ma'])
        if not dong:
            # LƯỚI CHẮN "ĐỌC MÙ" (vá ngay trong lượt dựng 15/09): "không tìm thấy" chỉ là một
            # kết luận khi phép đọc CHỨNG MINH được là nó đang nhìn thấy màn. Bảng rỗng hoàn
            # toàn nghĩa là hoặc app thật sự trống (hiếm — màn còn dữ liệu thật), hoặc phép
            # đọc/đăng nhập đã hỏng. Không phân biệt được hai ca đó thì phải coi là HỎNG.
            ctx.ve_danh_sach()
            if not live_ui.doc_bang(ctx.c):
                return False, ('KHÔNG đọc được danh sách trên app (bảng rỗng cả khi bỏ lọc) ⇒ '
                               'không kết luận được bản ghi còn hay mất')
            return True, 'không còn trên danh sách'
        r = live_ui.mo_hop_theo_dong(ctx.c, m['ma'], phep_live._icon_xoa(ctx))
        if not (isinstance(r, dict) and r.get('ok')):
            return False, 'không mở được hộp xác nhận Xóa: %s' % (r or {}).get('ly_do')
        dat, ly_do = phep_live.hop_xoa_dung_ban_ghi(ctx, m)
        if not dat:
            live_ui.dong_hop(ctx.c)
            return False, 'DỪNG trước khi bấm Xóa: %s' % ly_do
        with ctx.ghi(None, 'xoa', m['ma'], mo_ta='CLEANUP dọn dữ liệu QA') as cs:
            live_ui.bam_ghi(ctx.c, phep_live._nut_xoa_trong(kh), cs.giay_phep, cho=2.2)
        if live_ui.co_hop_thoai(ctx.c):
            live_ui.dong_hop(ctx.c)
        # NẠP LẠI trước khi kết luận: màn lọc phía trình duyệt nên dòng vừa xoá vẫn còn trong
        # mảng của FE cho tới khi FE gọi lại API (xem `Ctx.con_tren_app`).
        con_lai = ctx.con_tren_app(m['ma'])
        if con_lai:
            return False, 'đã bấm xác nhận Xóa nhưng bản ghi vẫn còn trên danh sách'
        return True, '%d request xoá' % len(cs.cs.da_dung)

    def _ma_tren_app():
        """[mã QA còn trên app] — ném lỗi khi KHÔNG chứng minh được là đang đọc được màn.

        Lưới chắn giống `_xoa_mot`: lọc theo dấu `zzqa` mà ra rỗng chỉ đáng tin khi bỏ lọc
        thì bảng CÓ dữ liệu. Bảng rỗng cả hai lần ⇒ ném lỗi để `nghiem_thu_don` trả KHÔNG
        ĐẠT thay vì trả "sạch".
        """
        return _quet_ma_qa(ctx)

    # ĐỐI SOÁT TRƯỚC KHI DỌN: sổ chỉ biết thứ nó đã cấp mã, còn case "bấm Lưu liên tục" làm
    # app đẻ thêm bản ghi trùng mã ⇒ dọn theo sổ xong vẫn còn rác mang dấu lượt chạy trên app
    # (16/09: CLEANUP_FAILED 2 bản ghi, mà `--don-du-lieu-qa` chạy lại báo "không còn gì để dọn").
    qa_data.doi_soat(so, _ma_tren_app, case_key='doi-soat-truoc-don', ghi=print)
    con = so.con_ton()
    kq['con_truoc_khi_don'] = len(con)
    if not con:
        # Sổ rỗng SAU khi đã đọc app — chỗ này mới được phép kết luận sạch, vì phép đọc đã
        # chạy. Bản trước thoát TRƯỚC khi đọc: "không có gì để dọn" phát ra từ một cái sổ,
        # không phải từ hệ thống thật.
        kq['nghiem_thu'] = True
        kq['ly_do'] = 'đối soát với app: không còn bản ghi nào mang dấu lượt chạy'
        print('   ĐỐI SOÁT: app không còn bản ghi nào mang dấu lượt chạy — SẠCH.')
        return kq
    print('\nDỌN DỮ LIỆU QA  (%d bản ghi còn tồn)' % len(con))
    r = qa_data.don(so, _xoa_mot, _ma_tren_app, ghi=print)
    kq.update({'da_don': r['da_don'], 'khong_thay': r['khong_thay'], 'hong': r['hong']})
    vet_mang(None, 'sau bước dọn dữ liệu QA')
    dat, sot, ly_do = qa_data.nghiem_thu_don(so, _ma_tren_app)
    ctx.ve_danh_sach()
    kq.update({'nghiem_thu': dat, 'con_sot': sot, 'ly_do': ly_do})
    print('   nghiệm thu dọn: %s — %s' % ('ĐẠT' if dat else 'KHÔNG ĐẠT', ly_do))
    if r['hong'] or not dat:
        # ⚠️ KHÔNG ném `ChanAnToan` ở đây, và đó là chủ ý. Dọn là bước CUỐI, chạy sau khi mọi
        # case đã chấm xong: ném lỗi lúc này sẽ vứt luôn kết quả đã đo được — phạt người đọc
        # báo cáo vì một sự cố của bước dọn. Thứ §8 đòi là "STOP, không tiếp tục mutation
        # khác", mà sau bước dọn thì không còn mutation nào để tiếp tục. Nên: cắm cờ, in to,
        # đưa vào báo cáo và mã thoát.
        kq['CLEANUP_FAILED'] = True
        print('\n' + '!' * 74)
        print('!! CLEANUP_FAILED — %s' % ly_do)
        print('!! %d bản ghi đã dọn · %d không còn sẵn · %d DỌN HỎNG'
              % (r['da_don'], r['khong_thay'], r['hong']))
        if sot:
            print('!! CÒN TỒN trên hệ thống: %s' % ' · '.join(sot[:10]))
        print('!! Sổ dữ liệu QA: %s' % so.duong)
        print('!! Dọn nốt bằng: python3 chay_live.py %s %s --don-du-lieu-qa --cho-phep-ghi'
              % (v.role, v.man))
        print('!' * 74)
    return kq


def chay_mot_man(v, ss=None):
    """Chạy trọn một màn. Trả dict tổng kết. Không bao giờ ném ra ngoài lớp trạng thái của case."""
    print('\n' + '=' * 78)
    print('MÀN   : %s   (role %s, cột %s)' % (v.man, v.role, v.col))
    print('NGUỒN : %s' % v.src)
    print('ĐÍCH  : %s' % v.dst)

    if not os.path.exists(v.dst):
        die('chưa có file kết quả cho màn này.\n'
            '   Dựng bằng: python3 ket_qua.py %s %s --create --apply' % (v.role, v.man))
    cases = doc_cases(v.dst)
    if not cases:
        die('file kết quả %s không đọc được case nào — đừng tin con số 0 ở đây, kiểm lại file.'
            % os.path.basename(v.dst))
    trung = soat_mapping(cases)
    if trung:
        die('%d case trùng KHOÁ trong file kết quả (ghi sẽ vào nhầm dòng): %s'
            % (len(trung), trung[:3]))
    # Khung kết quả phải khớp bộ case nguồn, nếu không thì đang chạy trên bản cũ.
    n_src = len(doc_cases(v.src)) if os.path.exists(v.src) else 0
    if n_src and n_src != len(cases):
        print('  ⚠ file kết quả có %d case, bộ case nguồn có %d — LỆCH.'
              '  Đồng bộ: python3 ket_qua.py %s %s --sync --apply'
              % (len(cases), n_src, v.role, v.man))

    hs, hs_path = qalib.ho_so_man(v.src), qalib.duong_ho_so_man(v.src)[0]
    if not hs:
        # §0 của PROMPT: chạy live mà không có hồ sơ màn là tự dựng lại dữ kiện bằng mắt —
        # đúng cách làm đã đẻ ra 24 % PE. Dừng, không chạy bừa.
        die('KHÔNG có hồ sơ màn: %s\n'
            '   PROMPT-chay-live-test §0 bắt đọc hồ sơ màn trước tiên (grounding.verbatim / '
            'hang_so / khong_co). Không có thì báo lại và dừng.' % hs_path)
    v.url = v.url or (hs.get('url') or [None])[0]
    if not v.url and not v.dry:
        die('không biết URL của màn: hồ sơ màn %s không khai `url`, và dòng lệnh không có --url'
            % os.path.basename(hs_path))

    # SỔ DỮ LIỆU QA — nguồn chứng minh quyền sở hữu cho mọi thao tác ghi, và là thứ bước DỌN
    # đọc lại ở lượt sau. Cùng một phiên thì dùng lại `run_id` cũ (§16: resume không được tạo
    # dữ liệu trùng, và bản ghi lượt trước vẫn phải chứng minh được là của ta).
    d_qa = os.path.join(ss.dir if ss else os.path.dirname(v.dst), 'qa-data')
    # Vân tay chủ sở hữu chỉ đóng được khi ĐÃ biết tài khoản. Thiếu tài khoản thì **không**
    # chết ở đây: lượt chạy vẫn phải phân loại case được, và chỗ bắt buộc phải có tài khoản
    # là `_mo_man` (nó `die()` trước khi chạm app). Bản đầu gọi thẳng `tai_khoan()` ở dòng này
    # và làm chết luôn các nhánh không mở browser — phép B5j của bộ tự kiểm cũ bắt được.
    user_ht = ''
    if not v.dry:
        _tk = pl.tim_tai_khoan(v.role, v.user, v.pw)
        user_ht = _tk.user if _tk else ''
    # Ngăn cách của mã bản ghi QA theo RÀNG BUỘC MÃ CỦA MÀN, không theo một khuôn đoán sẵn:
    # màn `LoaiLuuTru` cấm `_` nên bản chốt cứng `_` làm chết 72 case ở bước SETUP (16/09).
    ngan_qa = qalib.qa_ngan_cach((hs.get('grounding') or {}).get('hang_so', {}).get('code_regex'))
    so_qa = qa_data.SoQA(os.path.join(d_qa, 'so.json'), tai_khoan=user_ht,
                         origin=(v.url or '') if user_ht else '', thuc_the=v.man,
                         ngan=ngan_qa)
    # ── QUYẾT ĐỊNH TỰ ĐỘNG ①: có chạy phần GHI không (§2 của chỉ thị 16/09 lượt 2) ──────
    # Trước đây chỗ này là một hộp thoại: tool xếp case ghi vào lớp CHAN rồi in *"chạy lại
    # với --cho-phep-ghi"*, và người vận hành phải đọc, quyết, chạy lại. Nay bảng chính sách
    # tự trả lời. Nó mở Ý ĐỊNH, không mở quyền: `Cong.ghi()` vẫn giữ nguyên ba điều kiện và
    # nay còn hỏi thêm `ChinhSach.mutation()` trước khi xét chúng.
    ghi_case = [c for c in cases if c.thao_tac_ghi]
    v.cho_phep_ghi = bool(v.chinh_sach.cho_phep_ghi(
        len(ghi_case), v.cho_phep_ghi, endpoints_ghi=qalib.endpoints_ghi(hs)))
    cong = Cong(v.cho_phep_ghi, v.whitelist, ss, so=so_qa, chinh_sach=v.chinh_sach)
    if v.chi_don:
        if getattr(v, 'verify', False):
            return _nghiem_thu_don(v, ss, cong, so_qa, hs)
        return _chi_don(v, ss, cong, so_qa, hs)

    tt = _nap_trang_thai(ss).get('cases', {}) if (ss and v.resume) else {}
    if tt:
        print('RESUME: đã có %d case chấm ở lượt trước — chỉ chạy phần còn lại.' % len(tt))

    # ── phân loại trước khi chạm app ──────────────────────────────────────────────
    ke_hoach = []
    for c in cases:
        cu = tt.get(c.key)
        if cu and cu.get('tt') in KET_THUC:
            continue                        # đã có kết luận -> không chạy lại (resume)
        if cu and cu.get('tt') == DANG:
            if c.thao_tac_ghi:
                # Case ghi đang dở khi tiến trình chết: KHÔNG tự chạy lại (có thể đã ghi một
                # nửa). Người phải xác minh trạng thái bản ghi trước.
                tt[c.key] = dict(cu, tt=CAN_TAY, mark=None,
                                 ly_do='lượt trước chết giữa case có thao tác ghi — xác minh '
                                       'trạng thái bản ghi rồi chạy lại')
                continue
        lop, ly_do, ma_ly_do = phan_loai(c, cong)
        # BẢN KÊ TIỀN ĐIỀU KIỆN tính được mà không cần app -> có mặt kể cả ở `--dry-run` và
        # kể cả với case sẽ không chạy. Đó là thứ nói *"case này đòi trạng thái gì"*, và nó
        # đúng như nhau ở mọi lượt chạy.
        dv_tinh = {'tien_dieu_kien': tien_dieu_kien.doc(c), 'ly_do': ma_ly_do}
        if lop is None:
            ke_hoach.append(c)
            continue
        if lop == PE_DB:
            tt[c.key] = {'bp': c.bp, 'rn': c.rn, 'tt': PE_DB, 'mark': 'PE',
                         'note': qalib.bao_pe_db(c.b, c.truy_van), 'ly_do': ly_do,
                         'thuc_thi': ban_ghi_thuc_thi(c, PE_DB, 'PE', dv_tinh, ma_ly_do, ly_do),
                         'luc': _gio()}
        elif lop == CHAN:
            # ⚠️ MẶC ĐỊNH KHÔNG CHẤM PE. §chinh_sach_PE chỉ giữ PE cho "thao tác có thể phá dữ
            # liệu thật không hoàn tác được / chức năng chưa tồn tại / đối chiếu CSDL". Case ghi
            # bị chặn ở đây KHÔNG thuộc nhóm đó: người chạy tay tạo bản ghi `ZZQA…` là chạy được
            # bình thường. Chấm PE cho chúng là biến "tool này chưa làm" thành "không thể làm" —
            # đúng thứ §vai_tro cấm, và sẽ thổi tỉ lệ PE của bộ `ChuyenVien` lên +23,8 %.
            # Ai muốn file không còn ô trống thì bật `--pe-chan` (có ghi chú nêu đã thử gì).
            tt[c.key] = {'bp': c.bp, 'rn': c.rn, 'tt': CHAN,
                         'mark': 'PE' if v.pe_chan else None,
                         'note': qalib.bao_chan_at(c.b, c.thao_tac_ghi) if v.pe_chan else '',
                         'ly_do': ly_do,
                         'thuc_thi': ban_ghi_thuc_thi(c, CHAN, None, dv_tinh, ma_ly_do, ly_do),
                         'luc': _gio()}
        else:
            tt[c.key] = {'bp': c.bp, 'rn': c.rn, 'tt': CHUA_DO, 'mark': None,
                         'ly_do': ly_do,
                         'thuc_thi': ban_ghi_thuc_thi(c, CHUA_DO, None, dv_tinh, ma_ly_do,
                                                      ly_do),
                         'luc': _gio()}

    if getattr(v, 'dong', ''):
        # Lô CHỈ ĐÍCH DANH: chạy đúng những dòng Excel được nêu. Dùng để truy lại một nhóm
        # case đã hỏng ở lượt trước mà không phải chạy cả bộ — §K đòi soi từng case một, và
        # soi từng case bằng cách chạy lại 500 case thì không soi nổi.
        muon = set()
        for x in str(v.dong).replace(';', ',').split(','):
            x = x.strip()
            if not x:
                continue
            if '-' in x.strip('-'):
                a, b = x.split('-', 1)
                muon.update(range(int(a), int(b) + 1))
            else:
                muon.add(int(x))
        ke_hoach = [c for c in ke_hoach if c.rn in muon]
        thieu = sorted(muon - {c.rn for c in ke_hoach})
        if thieu:
            print('   ⚠ %d dòng nêu ở --dong KHÔNG có trong kế hoạch đo: %s'
                  % (len(thieu), ' '.join(str(x) for x in thieu[:30])))
    if v.pilot:
        ke_hoach = _chon_pilot(ke_hoach, v)
    if v.so_case and len(ke_hoach) > v.so_case:
        # Lô nhỏ: giữ MỘT case của mỗi phép đo trước, rồi mới lấp cho đủ — một lô 8 case mà
        # cả 8 đều là `validate_o_nhap` thì không chứng minh được gì về 63 phép còn lại.
        theo_phep, con = {}, []
        for c2 in ke_hoach:
            t = _phep_cua(c2, v.cho_phep_ghi)
            if t in theo_phep:
                con.append(c2)
            else:
                theo_phep[t] = c2
        # XEN KẼ đọc/ghi. Lấy theo thứ tự file thì 8 case đầu đều là case ĐỌC, và một lô
        # không có lấy một thao tác ghi thì không chứng minh được thứ đáng lo nhất: đường
        # tạo–sửa–xoá dữ liệu QA và bước dọn. Chỉ thị §19 đòi lô đầu phải có cả hai loại.
        doc = [c2 for t, c2 in theo_phep.items() if not phep_live.can_ghi(t)]
        ghi = [c2 for t, c2 in theo_phep.items() if phep_live.can_ghi(t)]
        uu_tien = []
        while doc or ghi:
            if doc:
                uu_tien.append(doc.pop(0))
            if ghi:
                uu_tien.append(ghi.pop(0))
        ke_hoach = (uu_tien + con)[:v.so_case]
        print('   (LÔ NHỎ: chạy %d/%d case đo được — %d phép đo khác nhau)'
              % (len(ke_hoach), len(uu_tien) + len(con), len({_phep_cua(c2, v.cho_phep_ghi)
                                                              for c2 in ke_hoach})))
    # BẢN GHI THỰC THI CHO CẢ CASE CHƯA CHẠY (§2 + §22: *100 % testcase có execution record*).
    # Không có khối này thì `cases.json` chỉ chứa case đã có kết luận, và một lượt chết giữa
    # chừng để lại một file không nói được gì về 400 case còn lại — kể cả việc tool ĐỊNH đo
    # chúng bằng phép nào. Trạng thái `KE_HOACH` không nằm trong `KET_THUC` nên `--resume`
    # vẫn chạy lại chúng bình thường.
    for c in ke_hoach:
        ten_phep = _phep_cua(c, cong.cho_phep_ghi)
        tt[c.key] = {'bp': c.bp, 'rn': c.rn, 'tt': KE_HOACH, 'mark': None,
                     'ly_do': 'đã lên kế hoạch, chưa chạy',
                     'thuc_thi': ban_ghi_thuc_thi(
                         c, CHUA_DO, None,
                         {'tien_dieu_kien': tien_dieu_kien.doc(c),
                          'phep_chay': ten_phep,
                          'loai_phep': phep_live.loai_phep(ten_phep) if ten_phep else None,
                          'phep_da_thu': []},
                         CHUA_CHAY, 'case nằm trong kế hoạch chạy, chưa tới lượt'),
                     'luc': _gio()}
    tom = _dem(cases, tt, ke_hoach)
    print('\nKẾ HOẠCH  %d case: %d đo được · %d PE-CSDL · %d chặn an toàn · %d chưa có phép đo%s'
          % (len(cases), len(ke_hoach), tom['PE_DB'], tom['CHAN'], tom['CHUA_DO'],
             (' · %d đã xong từ lượt trước' % tom['cu']) if tom['cu'] else ''))

    if v.dry:
        # Cất trạng thái ngay cả ở dry-run: phân loại là KẾT QUẢ CÔNG VIỆC (case nào bị chặn,
        # case nào là PE-CSDL), và `--resume` ở lượt sau đọc đúng file này. Dry-run không ghi
        # workbook, nhưng không có nghĩa là không ghi gì.
        _cat_trang_thai(ss, v, tt, tom)
        du_tk = _in_dry(cases, tt, ke_hoach, v, hs_path)
        if ss:
            # Dry-run cũng phải để lại SỔ QUYẾT ĐỊNH: nó chính là thứ người đọc cần để biết
            # lượt chạy thật sẽ tự quyết những gì — hỏi trước khi chạy, thay vì đọc sau.
            sm.ghi_json(os.path.join(ss.d_evi, 'quyet-dinh.json'), v.chinh_sach.khoi())
        if not du_tk:
            # Dry-run là phép TIỀN KIỂM, và một phép tiền kiểm báo "xong" khi vừa phát hiện
            # lượt chạy thật sẽ chết là vô dụng: người chạy đọc `Completed: 1` + mã thoát 0
            # rồi xếp lịch chạy thật, CI cũng vậy. Thiếu tài khoản -> BLOCKED, mã thoát ≠ 0
            # (chỉ thị 15/09 lượt 3, PHẦN 11). Vẫn KHÔNG mở Chrome và KHÔNG ghi workbook.
            print('\n⛔ BLOCKED: %s\n   Dry-run KHÔNG kết luận được là lượt chạy thật sẽ đi '
                  'qua bước đăng nhập.' % tai_khoan.thieu(v.role))
            return {'id': v.sid or '-', 'trang_thai': sm.FAILED, 'man': v.man, 'tom_tat': tom,
                    'dry': True, 'ly_do': 'BLOCKED: thiếu tài khoản test'}
        return {'id': v.sid or '-', 'trang_thai': sm.COMPLETED, 'man': v.man, 'tom_tat': tom,
                'dry': True}

    if not ke_hoach and not v.apply:
        print('   (không còn case nào phải chạy trên app)')

    # ── chạy thật ─────────────────────────────────────────────────────────────────
    # §14: CHỐT MỐC MÃ NGUỒN trước khi chạm app. Không chặn lượt chạy vì cây làm việc bẩn
    # (bẩn là bình thường trên một nhánh đang làm), nhưng đối chiếu lại ở cuối để báo cáo
    # nói được một câu kiểm được: *"toàn bộ case này chấm bằng CÙNG một phiên bản mã"*.
    moc_ma = dong_bang_ma.moc_ma(HERE)
    print('\nMỐC MÃ NGUỒN  %s' % dong_bang_ma.tom_tat(moc_ma))
    if ss:
        sm.ghi_json(os.path.join(ss.d_evi, 'moc-ma-nguon.json'), moc_ma)
    ng = c = ctx = None
    so_mang = []
    don = {}
    if ke_hoach:
        try:
            ng, c, so_mang0 = _mo_man(v, ss, cong)
        except ThieuTaiKhoan as e:
            # §4: không hỏi người, không `die()` trần. Case ĐỌC được cũng không chạy được vì
            # màn nào của app này cũng sau đăng nhập — nên cả lượt về BLOCKED, có lý do, và
            # trạng thái từng case giữ nguyên phân loại đã tính được (đó vẫn là kết quả).
            tom = _dem(cases, tt, [])
            tom['BLOCKED'] = str(e)
            _cat_trang_thai(ss, v, tt, tom)
            if ss:
                sm.ghi_json(os.path.join(ss.d_evi, 'quyet-dinh.json'), v.chinh_sach.khoi())
                ss.dat(sm.FAILED, str(e)[:300])
            print('\n⛔ BLOCKED: %s' % e)
            return {'id': v.sid or '-', 'trang_thai': sm.FAILED, 'man': v.man,
                    'tom_tat': tom, 'ly_do': 'BLOCKED: thiếu tài khoản'}
        so_mang.extend(so_mang0)     # NỐI THÊM — sổ tích luỹ không bao giờ bị gán đè

        def _vet_mang(cua_so=None, moc=''):
            """Bơm sổ mạng rồi PHÂN LOẠI ngay — gọi trong lúc cửa sổ ghi CÒN MỞ.

            Phân loại muộn là biến chính request của mình thành vi phạm: cửa sổ đóng rồi thì
            `qalib.phan_loai_request` không còn căn cứ nào để nói request đó thuộc phạm vi QA.
            """
            them = qalib.so_mang(c.bom_mang(), v.mang_cho_phep, cua_so)
            if them:
                so_mang.extend(them)
            cong.kiem_so_mang(so_mang, ss, c.so_su_kien_bo(), moc, c.so_bom_hong())
            return them

        ctx = phep_live.Ctx(c, ng, hs, so_qa, cong, v.url, v.man,
                            ghi_so_mang=lambda cs: _vet_mang(cs, 'trong cửa sổ ghi %s %s'
                                                             % (cs.hanh_dong, cs.ma)),
                            anh=ng.anh, cho_phep_ghi=v.cho_phep_ghi)
        ctx.thu_muc_tai = _bat_tai_tep(c, ss, cong)
        ctx.can_dang_nhap_lai = False
        ctx.viec = v                 # để phép đo ca "hết phiên" tự đăng nhập lại mà kiểm chứng
        # Hai dữ kiện cho lớp ATTT đa phiên (2026-09-16): chỗ đặt hồ sơ Chrome của PHIÊN B
        # (phải nằm trong thư mục phiên để dọn cùng lượt chạy) và allowlist mạng để sổ của
        # phiên B đi qua ĐÚNG luật của phiên A — không có allowlist riêng cho phiên thứ hai.
        ctx.thu_muc_phien = ss.dir if ss else os.path.join(HERE, "..", "sessions", "_le")
        ctx.mang_cho_phep = v.mang_cho_phep
        ctx.thu_muc_anh = (ss.d_shot if ss else None)
        try:
            # Đối chiếu sổ mạng TRƯỚC khi chấm case nào: thấy request ghi thì dừng ở đây, chưa
            # có ô nào bị điền (§PHẦN 5 của chỉ thị 15/09).
            cong.kiem_so_mang(so_mang, ss, c.so_su_kien_bo(), 'mở màn — trước case đầu tiên')
            # Hộp thoại do CHÍNH APP tự mở (hướng dẫn / onboarding) phải được đóng TRƯỚC
            # case đầu tiên: để nó nằm đó thì mọi câu hỏi "hộp đã đóng chưa" đều trả lời về
            # nhầm hộp — pilot 17/09 đã chấm LỖI cho 3 thao tác tạo bản ghi ĐÃ THÀNH CÔNG.
            _da_dong = ctx.dong_hop_app()
            if _da_dong:
                print('   đã đóng hộp app tự mở: %s' % ' · '.join(_da_dong))
            if ng.rong:
                die('URL %s không render ra màn nào (không h1, không bảng, không breadcrumb) — '
                    'lấy URL đúng bằng cách bấm menu rồi copy thanh địa chỉ.' % v.url)
            print('\nCHẤM CASE  (%d case đo được)' % len(ke_hoach))
            for i, cs in enumerate(ke_hoach, 1):
                tt[cs.key] = {'bp': cs.bp, 'rn': cs.rn, 'tt': DANG, 'mark': None,
                              'bd': _gio()}
                _cat_trang_thai(ss, v, tt, tom)
                try:
                    # MỞ BẢN GHI THỰC THI trước khi chạm bất cứ thứ gì (§18: PREPARE). Mở ở
                    # đây chứ không ở trong phép đo vì case nào KHÔNG vào tới phép đo cũng
                    # phải có bản ghi — đó chính là lớp case trước nay biến mất khỏi báo cáo.
                    ctx.bat_dau_case(cs)
                    kq = do_case(cs, ng)
                    if kq is not None:
                        ctx.dau_vet['phep_chay'] = kq[3]
                        ctx.dau_vet['phep_da_thu'] = [kq[3]]
                        ctx.dau_vet['loai_phep'] = 'UI'
                        ctx.dau_vet['ly_do'] = phep_live.DA_KET_LUAN
                        ctx.dau_vet['da_thao_tac'] = True
                        ctx.dau_vet['so_bang_chung'] = phep_live.dem_bang_chung(
                            kq[2], co_anh=bool(ng.anh))
                    else:
                        kq = phep_live.chay(cs, ctx)
                    if getattr(ctx, 'can_dang_nhap_lai', False):
                        # Case vừa chạy đã cố ý xoá phiên (truy cập khi chưa đăng nhập / hết
                        # phiên). Không đăng nhập lại NGAY thì mọi case sau chạy trong trạng
                        # thái mất phiên và kết luận nào cũng sai — mà sai theo kiểu trông
                        # rất giống một loạt bug thật.
                        _dang_nhap_lai(v, c, cong, ctx)
                except ChanAnToan:
                    raise                       # hàng rào nói KHÔNG -> không nuốt thành "case lỗi"
                except _bm.MatKetNoi as e:
                    # HẠ TẦNG CHẾT, không phải case hỏng. §21 cho phép dừng cả lượt đúng ở
                    # đây — và phải dừng: Chrome đứt thì 400 case còn lại đều sẽ "LỖI" với
                    # cùng một thông báo, tạo ra một file kết quả trông như 400 phát hiện.
                    tt[cs.key] = {'bp': cs.bp, 'rn': cs.rn, 'tt': LOI, 'mark': None,
                                  'ly_do': 'MẤT KẾT NỐI CHROME: %s' % str(e)[:200],
                                  'thuc_thi': ban_ghi_thuc_thi(
                                      cs, LOI, None, getattr(ctx, 'dau_vet', None) or {},
                                      phep_live.PHEP_LOI,
                                      'hạ tầng chết giữa case: %s' % str(e)[:180]),
                                  'luc': _gio()}
                    _cat_trang_thai(ss, v, tt, tom)
                    print('\n⛔ DỪNG: mất kết nối tới Chrome ở case %d/%d (dòng %d) — %s'
                          % (i, len(ke_hoach), cs.rn, str(e)[:160]))
                    print('   Các case còn lại KHÔNG chạy (chúng sẽ chỉ lặp lại đúng lỗi này). '
                          'Chạy tiếp bằng --resume sau khi môi trường ổn định.')
                    raise SystemExit('hạ tầng: mất kết nối Chrome giữa lượt chạy')
                except Exception as e:
                    kq = e
                dv = getattr(ctx, 'dau_vet', None) or {}
                if isinstance(kq, Exception):
                    tt[cs.key] = {'bp': cs.bp, 'rn': cs.rn, 'tt': LOI, 'mark': None,
                                  'ly_do': '%s: %s' % (type(kq).__name__, kq),
                                  'thuc_thi': ban_ghi_thuc_thi(
                                      cs, LOI, None, dv, phep_live.PHEP_LOI,
                                      '%s: %s' % (type(kq).__name__, str(kq)[:220])),
                                  'luc': _gio()}
                    print('  %3d. r%-4d LỖI  %s: %s' % (i, cs.rn, type(kq).__name__, kq))
                elif kq is None:
                    # ⚠️ KHÔNG còn một câu dùng chung. `dau_vet` nói rõ case này dừng ở bước
                    # nào — chưa có phép đo, dựng trạng thái không nổi, hay phép đo đã chạy
                    # mà không kết luận được. Ba thứ đó cần ba việc làm tiếp khác nhau.
                    bg = ban_ghi_thuc_thi(cs, CHUA_DO, None, dv)
                    tt[cs.key] = {'bp': cs.bp, 'rn': cs.rn, 'tt': CHUA_DO, 'mark': None,
                                  'ly_do': '%s — %s' % (bg['reason'],
                                                        bg['reason_detail'] or '(không rõ thêm)'),
                                  'thuc_thi': bg, 'luc': _gio()}
                    print('  %3d. r%-4d --  [%s] %s' % (i, cs.rn, bg['reason'], cs.b[:48]))
                else:
                    mark, note, du_kien, phep = kq
                    if not isinstance(note, str):
                        # Bắt NGAY tại case thay vì để lỗi nổ ở bước ghi workbook (đã dính:
                        # một dấu phẩy thừa biến ghi chú thành tuple, cả lượt 273 case chạy
                        # xong mới chết ở dòng ghi Excel và mất trắng phần ghi).
                        note = ' '.join(str(x) for x in note) if isinstance(note, (list, tuple)) \
                            else str(note)
                        print('      ⚠ phép %s trả ghi chú KHÔNG phải chuỗi — đã ép về chuỗi'
                              % phep)
                    tt[cs.key] = {'bp': cs.bp, 'rn': cs.rn, 'tt': XONG, 'mark': mark,
                                  'note': note, 'phep': phep, 'du_kien': du_kien,
                                  'thuc_thi': ban_ghi_thuc_thi(cs, XONG, mark, dv,
                                                               phep_live.DA_KET_LUAN),
                                  'anh': ng.anh, 'luc': _gio()}
                    print('  %3d. r%-4d %-2s  [%s] %s' % (i, cs.rn, mark, phep, cs.b[:56]))
                _cat_trang_thai(ss, v, tt, tom)

                # ── ĐỐI CHIẾU SỔ MẠNG SAU MỖI CASE ────────────────────────────────────
                # Bản trước kiểm một lần ở đầu và một lần ở CUỐI vòng lặp: một `DELETE` phát
                # sinh ở case 4 chỉ lộ ra sau khi case 297 chạy xong. Đó không phải hàng rào,
                # đó là biên bản khám nghiệm. Chỉ thị 15/09 (PHẦN 2) chốt: chậm nhất là sau
                # MỖI case, và case sau không được chạy.
                #
                # `bom_mang()` (không phải `lay_mang()`) vì vòng chấm case đọc ảnh chụp DOM,
                # không gọi CDP lần nào ⇒ không bơm thì socket không được đọc và sổ luôn rỗng.
                # Một request chỉ được kết luận khi ĐÃ vào sổ: bơm xong mới phân loại, nên
                # mọi request của case này đều đã nằm trong `so_mang` trước lúc xét.
                # Gọi KỂ CẢ khi không có request mới: `so_su_kien_bo()` phải được soát sau
                # từng case, và một cái sổ tràn thì im lặng đúng như một cái sổ sạch.
                _vet_mang(None, 'sau case %d/%d (dòng %d)' % (i, len(ke_hoach), cs.rn))
            # Vét nốt phần phát sinh sau case cuối (app còn XHR bay muộn).
            _vet_mang(None, 'sau case cuối')
            # ── DỌN + NGHIỆM THU DỌN ────────────────────────────────────────────
            don = _don_du_lieu_qa(ctx, v, ss, cong, _vet_mang)
        except ChanAnToan as e:
            # DỪNG AN TOÀN — không phải một case FAIL. Ghi lại cho rõ đây là lượt chạy bị
            # hàng rào cắt ngang: `tom_tat` giữ nguyên kết quả các case ĐÃ chấm (chúng vẫn
            # đúng), nhưng lượt chạy KHÔNG đi tới đoạn ghi workbook ở dưới — không một ô
            # nào của case sau vi phạm được điền.
            tom = _dem(cases, tt, [])
            tom['DUNG_AN_TOAN'] = str(e)[:400]
            _cat_trang_thai(ss, v, tt, tom)
            if ss:
                ss.pha('DỪNG AN TOÀN — sổ mạng')
            print('\n⛔ DỪNG AN TOÀN (không ghi workbook): %s' % e)
            raise
        finally:
            # PHIÊN ĐỐI CHỨNG (lớp ATTT, 2026-09-16) đóng TRƯỚC phiên chính và sổ mạng của nó
            # nhập thẳng vào sổ chung: một phiên thứ hai không được có luật riêng, và cũng
            # không được có một cái sổ riêng mà không ai đối chiếu.
            try:
                # TAB THỨ HAI (case "2 tab") đóng trước cả phiên đối chứng. Sổ mạng của nó
                # đã nhập chung với tab chính ngay từ `bom_mang()` nên không có gì phải vét
                # thêm ở đây — đóng muộn mới là vấn đề: một tab còn sống là một nguồn request
                # mà vòng đối chiếu vừa kết thúc không còn ai đọc.
                if ctx is not None:
                    phep_bosung.dong_tab_b(ctx)
            except Exception as e:
                print('   !! đóng tab thứ hai lỗi: %s: %s' % (type(e).__name__, str(e)[:120]))
            try:
                so_b = attt_live.dong_phien_b(ctx) if ctx is not None else None
                if so_b:
                    so_mang.extend(so_b)
                    print('   phiên đối chứng: %d request (đã nhập vào sổ chung)' % len(so_b))
                    cong.kiem_so_mang(so_mang, ss, 0, 'sổ của phiên đối chứng')
            except ChanAnToan:
                raise
            except Exception as e:
                print('   !! đóng phiên đối chứng lỗi: %s: %s' % (type(e).__name__, str(e)[:120]))
            if c is not None and not v.hien:
                c.close()
                pl._ghi_chrome(ss, c, giu=False)
            elif c is not None:
                pl._ghi_chrome(ss, c, giu=True)
            cong.cat_nhat_ky()

    if so_mang:
        dem = qalib.dem_so_mang(so_mang)
        print('\nSỔ MẠNG  %d request quan sát được — GIỮ NGUYÊN, phân loại:' % len(so_mang))
        print('     READ %d · AUTH %d · %s %d · %s %d · WRITE %d · UNKNOWN %d'
              % (dem[qalib.READ], dem[qalib.AUTH], qalib.CHO_PHEP_READ,
                 dem[qalib.CHO_PHEP_READ], qalib.QA_GHI, dem.get(qalib.QA_GHI, 0),
                 dem[qalib.GHI], dem[qalib.LA]))
        for x in [y for y in so_mang if y['loai'] == qalib.AUTH][:3]:
            print('     %-6s %-70s [%s] %s' % (x['method'], x['url'][:70], x['loai'], x['ly_do']))
        if ss:
            print('     bằng chứng đầy đủ: %s' % os.path.join(ss.d_evi, 'mang.json'))

    tom = _dem(cases, tt, [])
    _cat_trang_thai(ss, v, tt, tom)
    if ss:
        # Sổ QUYẾT ĐỊNH: báo cáo phải nói rõ tool đã tự quyết những gì và vì sao. Không hỏi
        # người KHÔNG có nghĩa là không ai kiểm được — nó có nghĩa là việc kiểm chuyển từ
        # lúc chạy sang lúc đọc bằng chứng.
        sm.ghi_json(os.path.join(ss.d_evi, 'quyet-dinh.json'), v.chinh_sach.khoi())
    if ss and ng:
        sm.ghi_json(os.path.join(ss.d_evi, 'man.json'),
                    {'luc': _gio(), 'url': v.url, 'h1': ng.d.get('h1'),
                     'breadcrumb': ng.d.get('breadcrumb'), 'cot': ng.d.get('cot'),
                     'phan_trang': ng.d.get('phan_trang'),
                     'thanh_loc': [{k: x.get(k) for k in ('the', 'nhan', 'gia_tri', 'goi_y')}
                                   for x in (ng.d.get('thanh_loc') or [])],
                     'nut_dau_man': ng.d.get('nut_dau_man'),
                     'the_so_lieu': ng.d.get('the_so_lieu')})

    # ── ghi ───────────────────────────────────────────────────────────────────────
    co_mark = sum(1 for c2 in cases if (tt.get(c2.key) or {}).get('mark'))
    print('\nKẾT QUẢ  %d P · %d F · %d PE  (còn %d case chưa có kết luận -> để TRỐNG)'
          % (tom['P'], tom['F'], tom['PE'], len(cases) - co_mark))
    if v.apply:
        n_ghi, sheets = ghi_ket_qua(v.dst, cases, tt, v.col, ss, v.ghi_lai)
        print('ĐÃ GHI %d dòng vào %s (sheet: %s) + dựng lại cache cột R'
              % (n_ghi, os.path.basename(v.dst), ' · '.join(sheets) or '-'))
        ma, dong = nghiem_thu_ghi(v.dst)
        print('NGHIỆM THU  formula_layer --check: %s' % dong[:120])
    else:
        print('(xem trước — chưa ghi vào file kết quả. Thêm --apply để ghi.)')

    tom['qa_data'] = so_qa.tom_tat()
    tom['don'] = don
    if ss and so_qa.muc:
        # Bản đồ §7 để riêng một file: `so.json` là sổ của MÁY (trạng thái), file này là bản
        # tra của NGƯỜI (case nào đụng vào bản ghi nào, làm gì, đã dọn chưa).
        sm.ghi_json(os.path.join(ss.dir, 'qa-data', 'ban-do-case-ban-ghi.json'),
                    {'luc': _gio(), 'run_id': so_qa.run_id, 'man': v.man,
                     'dong': qa_data.ban_do(so_qa)})
    # §14: ĐỐI CHIẾU LẠI MỐC MÃ NGUỒN. Lệch nghĩa là file kết quả đang trộn bằng chứng của
    # hai phiên bản mã — chuyện không phát hiện được sau, vì bằng chứng của cả hai đều hợp lệ.
    lech_ma = dong_bang_ma.doi_chieu(moc_ma, HERE)
    if ss:
        sm.ghi_json(os.path.join(ss.d_evi, 'moc-ma-nguon.json'),
                    dict(moc_ma, doi_chieu_cuoi_luot={'luc': _gio(), 'so_lech': len(lech_ma),
                                                      'lech': lech_ma}))
    if lech_ma:
        print('\n⚠️  MÃ NGUỒN ĐÃ ĐỔI GIỮA LƯỢT CHẠY — %d tệp:' % len(lech_ma))
        for x in lech_ma[:8]:
            print('     %-12s %s' % (x['viec'], x['tep']))
        print('     => kết quả lượt này TRỘN bằng chứng của hai phiên bản mã. Chạy lại trọn '
              'lượt sau khi mã đã ổn định.')
    bc = _bao_cao_md(v, cases, tt, tom, so_mang, don, so_qa, moc_ma, lech_ma)
    if ss:
        with open(os.path.join(ss.d_kq, 'bao-cao.md'), 'w', encoding='utf-8') as f:
            f.write(bc)
        print('BÁO CÁO   %s' % os.path.join(ss.d_kq, 'bao-cao.md'))
    if v.apply:
        p = os.path.join(os.path.dirname(v.dst),
                         '_KET-QUA-CHAY-%s.md' % datetime.date.today().isoformat())
        with open(p, 'a', encoding='utf-8') as f:
            f.write(bc + '\n')
        print('          %s' % p)
    return {'id': v.sid or '-',
            'trang_thai': (sm.FAILED if (don or {}).get('CLEANUP_FAILED') else sm.COMPLETED),
            'man': v.man, 'tom_tat': tom,
            'ly_do': 'CLEANUP_FAILED: %s' % (don or {}).get('ly_do', '')
                     if (don or {}).get('CLEANUP_FAILED') else ''}


# ── §20: LÔ PILOT theo ĐÚNG 10 nhóm chỉ thị nêu ─────────────────────────────────────────
# Mỗi nhóm nhận diện bằng CỜ TIỀN ĐIỀU KIỆN hoặc TÊN PHÉP ĐO — hai thứ đã có sẵn, không đặt
# thêm một cách phân loại thứ ba. Mục đích của pilot không phải "chạy thử vài case" mà là
# **chứng minh từng năng lực mới thật sự chạy được trên app thật** trước khi bỏ ra vài giờ
# cho lượt đầy đủ.
NHOM_PILOT = (
    ('1. phân trang',        {'co': (tien_dieu_kien.CAN_NHIEU_TRANG,), 'phep': ()}),
    ('2. ô lọc / ô chọn',    {'co': (), 'phep': ('o_chon_tuy_chon', 'o_chon_thao_tac',
                                                 'o_chon_loc_ket_qua', 'o_chon_nhieu_gia_tri',
                                                 'o_chon_mac_dinh_loc', 'o_chon_tuy_chon_dong')}),
    ('3. hộp Chi tiết',      {'co': (tien_dieu_kien.CAN_HOP_CHI_TIET,),
                              'phep': ('xem_chi_tiet_modal', 'xem_chi_tiet_dong')}),
    ('4. vai trò đối chứng', {'co': (tien_dieu_kien.CAN_VAI_TRO_B,), 'phep': ()}),
    ('5. hai phiên song song', {'co': (tien_dieu_kien.CAN_HAI_PHIEN,),
                                'phep': ('song_song_hai_tab',)}),
    ('6. hình học',          {'co': (), 'phep': ('hinh_hoc_nut', 'hinh_hoc_chu_thich',
                                                 'tooltip_kich_thuoc', 'breadcrumb_thu_hep')}),
    ('7. thao tác lặp nhanh', {'co': (tien_dieu_kien.CAN_LAP_NHANH,),
                               'phep': ('lap_nhanh_icon_dong', 'lap_nhanh_tab_enter',
                                        'click_lien_tuc')}),
    ('8. thẻ số liệu ↔ dữ liệu', {'co': (), 'phep': ('the_so_lieu_vs_du_lieu',
                                                     'the_so_lieu_khop')}),
    ('9. dữ liệu trùng',     {'co': (tien_dieu_kien.CAN_TRUNG,), 'phep': ('ma_da_ton_tai',)}),
    ('10. chặn xoá khi đang dùng', {'co': (tien_dieu_kien.CAN_PHU_THUOC,),
                                    'phep': ('chan_xoa_dang_dung',)}),
)
SO_CASE_MOI_NHOM = 2


def _chon_pilot(ke_hoach, v):
    """Lấy tối đa `SO_CASE_MOI_NHOM` case cho MỖI nhóm §20. -> danh sách case đã lọc.

    Nhóm nào không có case nào trên màn này thì in ra rõ ràng — *"pilot xanh"* mà thiếu hẳn
    một nhóm thì nó không chứng minh được điều nó trông như đang chứng minh.
    """
    chon, da = [], set()
    bang = []
    for ten, dk in NHOM_PILOT:
        lay = []
        for c in ke_hoach:
            if c.key in da:
                continue
            if set(_cac_phep_cua(c, v.cho_phep_ghi)) & set(dk['phep']):
                lay.append(c)            # khớp theo TÊN PHÉP ĐO — chắc chắn nhất
                if len(lay) >= SO_CASE_MOI_NHOM:
                    break
        for c in ke_hoach:               # chưa đủ thì mới xét tới cờ tiền điều kiện
            if len(lay) >= SO_CASE_MOI_NHOM:
                break
            if c.key in da or c in lay:
                continue
            if dk['co'] and set(tien_dieu_kien.doc(c)) & set(dk['co']):
                lay.append(c)
        for c in lay:
            da.add(c.key)
            chon.append(c)
        bang.append((ten, len(lay), [c.rn for c in lay]))
    print('\nLÔ PILOT (§20) — %d case cho %d nhóm:' % (len(chon), len(NHOM_PILOT)))
    for ten, n, rns in bang:
        print('   %-28s %d case%s%s'
              % (ten, n, ('  (dòng %s)' % ', '.join(str(x) for x in rns)) if rns else '',
                 '   ⚠ KHÔNG có case nào trên màn này' if not n else ''))
    return chon


def _dem(cases, tt, ke_hoach):
    """Đếm theo LỚP và theo MARK — hai trục khác nhau, đừng trộn: một case CHẶN có thể có mark
    `PE` (khi bật `--pe-chan`) hoặc không có mark nào (mặc định)."""
    d = {k: 0 for k in ('P', 'F', 'PE', 'PE_DB', 'CHAN', 'CHUA_DO', 'LOI', 'CAN_KIEM_TAY',
                        'XONG', KE_HOACH, 'cu', 'trong')}
    cho = {c.key for c in ke_hoach}
    for c in cases:
        st = tt.get(c.key) or {}
        if st.get('mark') in ('P', 'F', 'PE'):
            d[st['mark']] += 1
        else:
            d['trong'] += 1
        t = st.get('tt')
        if t in d:
            d[t] += 1
        if t == XONG and c.key not in cho:
            d['cu'] += 1
    return d


def _in_dry(cases, tt, ke_hoach, v, hs_path):
    """In bảng tiền kiểm. -> True nếu ĐỦ tài khoản để lượt chạy thật đi tiếp được."""
    print('\nDRY-RUN — KHÔNG mở browser, KHÔNG chạm app, KHÔNG ghi file kết quả.')
    print('  ✓ đọc được %d case từ %s' % (len(cases), os.path.basename(v.dst)))
    print('  ✓ khoá case duy nhất (map theo NỘI DUNG, không theo số dòng)')
    print('  ✓ hồ sơ màn: %s' % os.path.basename(hs_path))
    print('  ✓ URL: %s' % (v.url or '(chưa biết — bắt buộc khi chạy thật)'))
    print('  ✓ cột ghi: %s   file đích ghi được: %s'
          % (v.col, 'có' if os.access(v.dst, os.W_OK) else 'KHÔNG'))
    print('  ✓ hàng rào: cho phép ghi = %s · whitelist %d id'
          % ('BẬT' if v.cho_phep_ghi else 'TẮT', len(v.whitelist)))
    # Cùng một đường quyết định với lượt chạy thật (`_mo_man`) — dry-run phải nói ĐÚNG thứ
    # lượt thật sẽ làm, kể cả ở nhánh thiếu tài khoản.
    _tk = pl.tim_tai_khoan(v.role, v.user, v.pw)
    du_tk = bool(v.chinh_sach.tai_khoan(v.role, _tk.user if _tk else None,
                                        _tk.pw if _tk else None,
                                        nguon=(_tk.nguon if _tk else 'environment')))
    print('  %s tài khoản: %s' % ('✓' if du_tk else '✗',
                                  'có, lấy từ %s (không in giá trị)' % _tk.nguon if du_tk
                                  else 'THIẾU — chạy thật sẽ BLOCKED ở bước đăng nhập'))
    # §11 — KHÁM PHÁ TÀI KHOẢN: in ra tool tìm thấy vai trò nào, ở nguồn nào. Chỉ TÊN.
    _kp = tai_khoan.tom_tat_kham_pha()
    print('  · nguồn: environment=%s · env file=%s · secret command=%s'
          % (_kp['nguon']['environment'], _kp['nguon']['env_file'],
             _kp['nguon']['secret_command']))
    print('  · vai trò có tài khoản: %s'
          % (' · '.join(_kp['vai_tro_tim_duoc']) or '(không có vai trò nào)'))
    _b = tai_khoan.role_doi_chung(v.role)
    print('  · vai trò ĐỐI CHỨNG: %s'
          % ('%s (nguồn %s)' % (_b.role, _b.nguon) if _b
             else 'KHÔNG có — case đòi vai trò thật khác sẽ ra PE, case mô phỏng được vẫn chạy'))
    if _kp.get('canh_bao'):
        print('  ⚠ %s' % _kp['canh_bao'])
    theo_phep = {}
    for c in ke_hoach:
        theo_phep[_phep_cua(c)] = theo_phep.get(_phep_cua(c), 0) + 1
    print('\n  Phép đo sẽ chạy:')
    for ten, n in sorted(theo_phep.items(), key=lambda x: -x[1]):
        print('     %-24s %4d case' % (ten, n))
    chan = [c for c in cases if (tt.get(c.key) or {}).get('tt') == CHAN]
    if chan:
        print('\n  Bị hàng rào an toàn chặn (%d case) — ví dụ:' % len(chan))
        for c in chan[:5]:
            print('     r%-4d %-52s <- %s' % (c.rn, c.b[:52], ' · '.join(c.thao_tac_ghi)))
    return du_tk


def _bao_cao_md(v, cases, tt, tom, so_mang, don=None, so_qa=None, moc_ma=None,
                lech_ma=None):
    n = len(cases)
    qa = (so_qa.tom_tat() if so_qa else {})
    ra = ['# Kết quả chạy live — %s / %s' % (v.role, v.man), '',
          '- Lúc: %s' % _gio(), '- File: `%s`' % os.path.basename(v.dst),
          '- Cột chạy: %s · URL: %s' % (v.col, v.url or '-'),
          '- Phiên: `%s`' % (v.sid or '(không dùng phiên)'), '',
          '## Tổng hợp', '',
          '| Lớp | Số case | Ghi vào file |', '|---|---:|---|',
          '| Đo được: P | %d | `%s` = P |' % (tom['P'], v.col),
          '| Đo được: F | %d | `%s` = F |' % (tom['F'], v.col),
          '| PE-CSDL (§4b) | %d | `%s` = PE + `[DB ACCESS REQUIRED]` |' % (tom['PE_DB'], v.col),
          '| Chặn an toàn (§4c) | %d | %s |'
          % (tom['CHAN'], ('`%s` = PE + `[SAFETY BLOCKED]`' % v.col) if v.pe_chan
             else 'để TRỐNG (chạy tay được — xem ghi chú dưới)'),
          '| Chưa có phép đo | %d | để TRỐNG |' % tom['CHUA_DO'],
          '| LỖI khi đo | %d | để TRỐNG |' % tom['LOI'],
          '| Cần kiểm tay (chết giữa case ghi) | %d | để TRỐNG |' % tom['CAN_KIEM_TAY'], '',
          '> Tỉ lệ PE ghi vào file: %d/%d = %.1f %%, trong đó PE-CSDL %d (lý do cố định, không '
          'tính vào ngưỡng 10 %% của §dinh_nghia_hoan_thanh).'
          % (tom['PE'], n, 100.0 * tom['PE'] / n if n else 0, tom['PE_DB']),
          '>', '> %d case còn TRỐNG — đó là việc CHƯA LÀM, không phải kết luận. Ô trống không '
          'bao giờ được đọc thành P.' % tom['trong'], '']
    f = [(c, tt[c.key]) for c in cases if (tt.get(c.key) or {}).get('mark') == 'F']
    if f:
        ra += ['## Case chấm F (%d)' % len(f), '']
        for c, st in f:
            ra.append('- **r%d** %s  \n  _phép đo_: `%s` · _kết luận_: %s'
                      % (c.rn, c.b, st.get('phep') or '-',
                         (st.get('note') or '').split('\n')[0][:200]))
        ra.append('')
    if so_mang:
        dem = qalib.dem_so_mang(so_mang)
        ra += ['## Sổ mạng — %d request quan sát được (GIỮ NGUYÊN, không xoá bản ghi nào)'
               % len(so_mang), '',
               '| Lớp | Số request | Nghĩa |', '|---|---:|---|',
               '| READ | %d | GET/HEAD/OPTIONS |' % dem[qalib.READ],
               '| AUTH | %d | POST tới endpoint đăng nhập đã quy định (`ALLOWLISTED_AUTH`) |'
               % dem[qalib.AUTH],
               '| %s | %d | endpoint đọc khai tường minh khi chạy |'
               % (qalib.CHO_PHEP_READ, dem[qalib.CHO_PHEP_READ]),
               '| %s | %d | mutation trong CỬA SỔ GHI đã khai (case + thực thể + hành động) |'
               % (qalib.QA_GHI, dem.get(qalib.QA_GHI, 0)),
               '| **WRITE** | **%d** | mutating method ngoài allowlist — vi phạm |' % dem[qalib.GHI],
               '| **UNKNOWN** | **%d** | method lạ — vi phạm |' % dem[qalib.LA], '']
        qw = [x for x in so_mang if x.get('loai') == qalib.QA_GHI]
        if qw:
            ra += ['Mutation trong phạm vi QA (%d):' % len(qw), '']
            for x in qw[:40]:
                q = x.get('qa') or {}
                ra.append('- `%s` %s — case `%s` · thực thể `%s` · hành động `%s` · bản ghi `%s`'
                          % (x['method'], x['url'][:90], q.get('case'), q.get('thuc_the'),
                             q.get('hanh_dong'), q.get('ban_ghi')))
            ra.append('')
        for x in [y for y in so_mang if y['loai'] in (qalib.AUTH, qalib.CHO_PHEP_READ)][:10]:
            ra.append('- `%s` %s — **%s**: %s' % (x['method'], x['url'][:110], x['loai'], x['ly_do']))
        ra.append('')
    if so_qa is not None:
        d = don or {}
        ra += ['## Dữ liệu QA — vòng đời SETUP → TEST → VERIFY → CLEANUP → VERIFY CLEANUP', '',
               '- Mã lượt chạy QA: `%s`' % so_qa.run_id,
               '- Sổ dữ liệu QA: `%s`' % (so_qa.duong or '(chỉ trong bộ nhớ)'), '',
               '| Mục | Số |', '|---|---:|',
               '| Bản ghi QA đã tạo | %d |' % qa.get('tong', 0),
               '| Đã dọn ở bước CLEANUP | %d |' % qa.get('da_don', 0),
               '| Chính case đã xoá (không phải rác) | %d |' % qa.get('da_xoa_boi_case', 0),
               '| Dọn tới nơi thì đã không còn (CLEAN) | %d |' % qa.get('khong_thay', 0),
               '| **Còn tồn trên hệ thống** | **%d** |' % qa.get('con_ton', 0),
               '| Dọn HỎNG | %d |' % qa.get('don_hong', 0), '',
               '- Nghiệm thu dọn: **%s** — %s'
               % ('ĐẠT' if d.get('nghiem_thu') else
                  ('KHÔNG ĐẠT' if d.get('nghiem_thu') is False else 'chưa chạy'),
                  d.get('ly_do') or '-')]
        if d.get('CLEANUP_FAILED'):
            ra += ['', '> ⛔ **CLEANUP_FAILED** — còn %d bản ghi QA trên hệ thống: %s. '
                   'Dọn nốt: `python3 chay_live.py %s %s --don-du-lieu-qa --cho-phep-ghi`.'
                   % (len(d.get('con_sot') or []), ' · '.join((d.get('con_sot') or [])[:8]),
                      v.role, v.man)]
        ra.append('')
    ra += _bang_tai_khoan(v, tt)
    ra += _bang_thuc_thi(cases, tt, moc_ma, lech_ma)
    return '\n'.join(ra)


def _bang_tai_khoan(v, tt):
    """Phần *account discovery · role sessions · mock fallback · PE do thiếu role* (§11 17/09).

    Chỉ NHÃN: tên vai trò, tên biến, tên nguồn. Không một giá trị bí mật nào — phép tự kiểm ⑤
    của `kiem_tai_khoan.py` quét đúng khối này.
    """
    import collections
    kp = tai_khoan.tom_tat_kham_pha()
    b = tai_khoan.role_doi_chung(v.role)
    qd = (v.chinh_sach.khoi() if getattr(v, 'chinh_sach', None) else {'quyet_dinh': []})
    dem_qd = collections.Counter(x['quyet_dinh'] for x in qd.get('quyet_dinh') or [])
    pe_thieu_role = sum(1 for x in tt.values()
                        if (x.get('du_kien') or {}).get('quyet_dinh') == 'LIVE_ROLE_REQUIRED')
    ra = ['## Tài khoản & vai trò (§11)', '',
          '| Mục | Giá trị |', '|---|---|',
          '| Vai trò đang chạy | `%s` |' % v.role,
          '| Nguồn tài khoản | environment · env file: `%s` · secret command: %s |'
          % (kp['nguon']['env_file'], 'CÓ' if kp['nguon']['secret_command'] else 'không'),
          '| Khuôn tên biến | %s |'
          % ' · '.join('`%sUSER`/`%sPASS`' % (t, t) for t in kp['tien_to_khoa']),
          '| Vai trò có tài khoản | %s |'
          % (' · '.join('`%s`' % x for x in kp['vai_tro_tim_duoc']) or '_(không có)_'),
          '| Vai trò ĐỐI CHỨNG dùng được | %s |'
          % ('`%s` (nguồn %s)' % (b.role, b.nguon) if b
             else '**KHÔNG có** — case đòi vai trò thật khác ra `PE`, case mô phỏng được vẫn chạy'),
          '| Phiên vai trò đã mở | %d (A%s) |'
          % (1 + (1 if dem_qd.get('USE_ROLE_B') else 0),
             ' + B' if dem_qd.get('USE_ROLE_B') else ''),
          '| Mô phỏng thay vai trò (`MOCK_403`) | %d lần |' % dem_qd.get('MOCK_403', 0),
          '| PE do thiếu vai trò thật (`LIVE_ROLE_REQUIRED`) | %d case |' % pe_thieu_role,
          '']
    if kp.get('canh_bao'):
        ra += ['> ⚠ %s' % kp['canh_bao'], '']
    if dem_qd:
        ra += ['Sổ quyết định tự động: '
               + ' · '.join('`%s` %d' % (k, n) for k, n in dem_qd.most_common()), '']
    ra += ['> Tài khoản KHÔNG bao giờ đi vào báo cáo, evidence, `cases.json`, ảnh chụp hay '
           'Excel — chỉ nhãn `credential_source` và `role`. Lượt chạy cũng KHÔNG hỏi người: '
           'thiếu tài khoản là kết luận `MISSING_CREDENTIAL:<role>`, không phải một câu hỏi.',
           '']
    return ra


def _bang_thuc_thi(cases, tt, moc_ma=None, lech_ma=None):
    """Phần §23 của báo cáo — BẢN GHI THỰC THI, đọc từ khoá `thuc_thi` của từng case.

    Khác hẳn mục *"Việc chưa làm"* của bản cũ (một dòng đếm `CHUA_DO`): chỗ này trả lời được
    *từng case đã được làm gì*, và quan trọng hơn — **vì sao** case còn lại chưa có kết luận,
    bằng mã máy đọc được thay vì một câu tiếng Việt dùng chung cho bốn nguyên nhân khác nhau.
    """
    import collections
    bg = []
    for c in cases:
        st = tt.get(c.key) or {}
        x = st.get('thuc_thi')
        if not x:
            # Case chưa có bản ghi thực thi (chạy dở, hoặc resume từ file của bản cũ): vẫn
            # phải có một dòng — §22 đòi 100 % case có bản ghi, và một case vắng mặt là một
            # case không ai biết đã làm gì với nó.
            x = ban_ghi_thuc_thi(c, st.get('tt') or CHUA_DO, st.get('mark'),
                                 {'ly_do': 'khong_co_ban_ghi_thuc_thi'})
        bg.append((c, x))
    n = len(bg) or 1
    da_thu = [x for _, x in bg if x['measurement_attempted']]
    da_tt = [x for _, x in bg if x['action_executed']]
    theo_kq = collections.Counter(x['result'] for _, x in bg)
    theo_ly_do = collections.Counter(x['reason'] for _, x in bg)
    theo_phep = collections.Counter(x['measurement_name'] for _, x in bg if x['measurement_name'])
    theo_loai = collections.Counter(x['measurement_type'] for _, x in bg if x['measurement_type'])
    fixture = collections.Counter(x['fixture_type'] for _, x in bg if x['fixture_type'])
    fallback = collections.Counter(x['fallback_used'] for _, x in bg if x['fallback_used'])
    tdk_dem = collections.Counter(k for _, x in bg for k in (x['precondition'] or []))
    # NHÓM = khối chức năng của case (cột CN) — đúng trục mà §23 đòi báo cáo theo.
    nhom = collections.OrderedDict()
    for c, x in bg:
        k = (c.nhom.get('cn') or '(không rõ CN)')[:40]
        d = nhom.setdefault(k, collections.Counter())
        d['tong'] += 1
        d[x['result']] += 1
        if x['action_executed']:
            d['executed'] += 1
    ra = ['## Bản ghi thực thi (§23) — mọi case đều có một dòng', '',
          '| Nhóm | Tổng | Executed | PASS | FAIL | PE | CHƯA ĐO | LỖI | CHẶN |',
          '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for k, d in nhom.items():
        ra.append('| %s | %d | %d | %d | %d | %d | %d | %d | %d |'
                  % (k, d['tong'], d['executed'], d[KQ_PASS], d[KQ_FAIL], d[KQ_PE],
                     d[KQ_CHUA_DO], d[KQ_LOI], d[KQ_CHAN]))
    ra += ['', '### Số tổng hợp', '',
           '| Mục | Số | Ghi chú |', '|---|---:|---|',
           '| Tổng testcase | %d | |' % len(bg),
           '| Có BẢN GHI THỰC THI | %d | %.1f %% |'
           % (len(bg), 100.0),
           '| Có THỬ phép đo | %d | %.1f %% |' % (len(da_thu), 100.0 * len(da_thu) / n),
           '| Đã THAO TÁC trên app | %d | %.1f %% |' % (len(da_tt), 100.0 * len(da_tt) / n),
           '| Chưa có phép đo (`NO_MEASUREMENT_IMPLEMENTED`) | %d | phải viết phép đo mới |'
           % theo_ly_do.get(phep_live.NO_MEASUREMENT, 0),
           '| Phép đo trả None (`measurement_returned_none`) | %d | phải sửa phép đo đang có |'
           % theo_ly_do.get(phep_live.PHEP_TRA_NONE, 0),
           '| Không dựng được trạng thái (`precondition_unmet`) | %d | phải mở đường dựng |'
           % theo_ly_do.get(phep_live.TIEN_DK_THIEU, 0),
           '| Kỳ vọng nằm ở CSDL (`db_expectation`) | %d | xin quyền truy vấn |'
           % theo_ly_do.get(phep_live.KY_VONG_CSDL, 0),
           '| Hàng rào chặn (`guard_blocked`) | %d | lượt chạy đang chỉ-đọc |'
           % theo_ly_do.get(phep_live.HANG_RAO_CHAN, 0),
           '| Phép đo lỗi (`measurement_error`) | %d | lỗi lập trình |'
           % theo_ly_do.get(phep_live.PHEP_LOI, 0), '']
    if fixture:
        ra += ['### Trạng thái đã dựng', '', '| Loại | Số case |', '|---|---:|']
        ra += ['| %s | %d |' % (k, v) for k, v in fixture.most_common()]
        ra.append('')
    if fallback:
        ra += ['Fallback đã dùng: ' + ' · '.join('%s (%d case)' % (k, v)
                                                 for k, v in fallback.most_common()), '']
    if tdk_dem:
        ra += ['### Tiền điều kiện đọc được từ case', '',
               ' · '.join('`%s` %d' % (k, v) for k, v in tdk_dem.most_common()), '']
    ra += ['### Phép đo đã chạy (%d phép khác nhau)' % len(theo_phep), '',
           '| Phép đo | Loại | Số case |', '|---|---|---:|']
    for k, v in theo_phep.most_common(40):
        ra.append('| `%s` | %s | %d |' % (k, phep_live.loai_phep(k), v))
    if theo_loai:
        ra += ['', 'Theo loại phép đo: ' + ' · '.join('%s %d' % (k, v)
                                                      for k, v in theo_loai.most_common()), '']
    # ── Case còn CHƯA ĐO: nêu ĐÍCH DANH, kèm lý do máy đọc được + đã thử phép nào ──
    # Tách `planned_not_run` ra khỏi danh sách: chúng KHÔNG phải "chưa đo được" mà là "chưa
    # tới lượt" (lượt chạy dở hoặc dry-run). Trộn hai thứ là biến một bảng dùng để sửa tool
    # thành một bảng 500 dòng nói cùng một câu.
    chua_chay = [(c, x) for c, x in bg if x['reason'] == CHUA_CHAY]
    con = [(c, x) for c, x in bg
           if x['result'] == KQ_CHUA_DO and x['reason'] != CHUA_CHAY]
    if chua_chay:
        ra += ['> %d case CHƯA TỚI LƯỢT CHẠY (`planned_not_run`) — lượt chạy dở hoặc dry-run. '
               'Chạy tiếp bằng `--resume`.' % len(chua_chay), '']
    ra += ['### %d case CHƯA ĐO — từng case, lý do, đã thử gì' % len(con), '']
    if not con:
        ra.append('_Không còn case nào chưa đo._')
    else:
        ra += ['| Dòng | Case | Lý do (mã) | Đã thử phép đo | Chi tiết |',
               '|---|---|---|---|---|']
        for c, x in con[:200]:
            ra.append('| r%d | %s | `%s` | %s | %s |'
                      % (c.rn, c.b.replace('\n', ' ')[:60].replace('|', '/'),
                         x['reason'],
                         ' · '.join('`%s`' % t for t in x['measurements_tried'][:3]) or '—',
                         (x['reason_detail'] or '')[:130].replace('\n', ' ').replace('|', '/')))
        if len(con) > 200:
            ra.append('| … | _còn %d case nữa — xem `result/cases.json`_ | | | |'
                      % (len(con) - 200))
    ra.append('')
    ra += ['### Mốc mã nguồn (§14)', '',
           '- Trước lượt chạy: %s' % dong_bang_ma.tom_tat(moc_ma)]
    if lech_ma:
        ra += ['- ⛔ **MÃ ĐỔI GIỮA LƯỢT CHẠY** — %d tệp: %s'
               % (len(lech_ma), ' · '.join('%s (%s)' % (x['tep'], x['viec'])
                                           for x in lech_ma[:6])),
               '- Kết quả lượt này TRỘN bằng chứng của hai phiên bản mã. Chạy lại trọn lượt.']
    else:
        ra += ['- Sau lượt chạy: **KHÔNG đổi** — toàn bộ case chấm bằng cùng một phiên bản mã.']
    ra.append('')
    return ra


# ══════════════════════════════════════════════════════════════════════════════
# 7. PHIÊN + CLI
# ══════════════════════════════════════════════════════════════════════════════
def _chay_phien(v):
    """Bọc một lượt trong phiên: khoá · vòng đời · log riêng (dùng chung `session_manager`)."""
    ss = sm.Session(v.sid, v.goc)
    if not ss.co:
        ss.tao({'role': v.role, 'man': v.man, 'url': v.url, 'file': v.dst, 'col': v.col,
                'lop': 'B — chạy case', 'cho_phep_ghi': v.cho_phep_ghi})
    else:
        ss.nap()
        ss.ghi_cfg(role=v.role, man=v.man, url=v.url, file=v.dst, col=v.col)
    ss.khoa()
    try:
        with ss.mo_log(echo=True):
            ss.dat(sm.RESUMING if v.resume else sm.STARTING)
            ss.st['lan'] = int(ss.st.get('lan') or 0) + 1
            try:
                kq = chay_mot_man(v, ss)
                # ⚠️ Vá 2026-09-17 — TÔN TRỌNG trạng thái mà lượt chạy TRẢ VỀ. Bản trước luôn
                # đặt `COMPLETED` miễn là `chay_mot_man` không ném lỗi, nhưng nhánh BLOCKED
                # (thiếu tài khoản) và nhánh CLEANUP_FAILED **trả về** trạng thái chứ không
                # ném. Hậu quả: `state.json` ghi COMPLETED cho một lượt chưa chạy case nào —
                # `--list-sessions` đọc thành "xong", và `--resume` tưởng không còn gì để làm.
                # Bắt được ngay ở lượt PILOT đầu tiên: bảng tổng kết in `FAILED` còn state.json
                # in `COMPLETED`, hai nguồn nói ngược nhau về cùng một lượt chạy.
                tt_kq = (kq or {}).get('trang_thai') or sm.COMPLETED
                ss.dat(tt_kq, (kq or {}).get('ly_do', '')[:300] if tt_kq != sm.COMPLETED else '')
                return kq
            except KeyboardInterrupt:
                ss.dat(sm.FAILED, 'người dùng dừng (Ctrl+C)')
                raise
            except SystemExit as e:
                ss.dat(sm.FAILED, '[%s] %s' % (ss.st.get('pha') or '?', e))
                return {'id': v.sid, 'trang_thai': sm.FAILED, 'ly_do': str(e)}
            except BaseException as e:
                ss.dat(sm.FAILED, '[%s] %s: %s' % (ss.st.get('pha') or '?', type(e).__name__, e))
                return {'id': v.sid, 'trang_thai': sm.FAILED,
                        'ly_do': '[%s] %s: %s' % (ss.st.get('pha') or '?', type(e).__name__, e)}
    finally:
        ss.mo_khoa()


def _slug(s):
    return re.sub(r'[^A-Za-z0-9._-]+', '-', str(s or '')).strip('-')[:40] or 'x'


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('role', nargs='?')
    ap.add_argument('man', nargs='?', help='tên màn (khớp một phần); bỏ trống = mọi màn của role')
    ap.add_argument('--url', help='URL màn (mặc định lấy `url` trong hồ sơ màn)')
    ap.add_argument('--col', default='F', help='cột ghi kết quả: F = lần 1, G = lần 2 (mặc định F)')
    ap.add_argument('--which', help='thư mục kết quả khi dự án khai nhiều')
    ap.add_argument('--dry-run', dest='dry', action='store_true',
                    help='KHÔNG mở browser: chỉ soát case · an toàn · mapping · đường ghi')
    ap.add_argument('--apply', action='store_true', help='ghi kết quả thật (mặc định xem trước)')
    ap.add_argument('--ghi-lai', dest='ghi_lai', action='store_true',
                    help='ghi lại sheet đã ghi ở lượt trước (mặc định bỏ qua để khỏi thành [Lần 2])')
    ap.add_argument('--resume', action='store_true', help='chạy tiếp phiên dở')
    ap.add_argument('--pilot', action='store_true',
                    help='§20 — lô PILOT: tối đa %d case cho MỖI nhóm năng lực (phân trang · '
                         'ô lọc · hộp Chi tiết · vai trò đối chứng · hai phiên · hình học · '
                         'lặp nhanh · thẻ số liệu · trùng dữ liệu · chặn xoá). Chạy lô này '
                         'XANH rồi mới chạy toàn bộ.' % SO_CASE_MOI_NHOM)
    ap.add_argument('--dong', metavar='DS',
                    help='chỉ chạy ĐÍCH DANH các dòng Excel này (vd `97,98,113-117`) — dùng để '
                         'truy lại một nhóm case đã hỏng mà không phải chạy cả bộ')
    ap.add_argument('--so-case', dest='so_case', type=int, default=0, metavar='N',
                    help='LÔ NHỎ: chỉ chạy N case đo được (ưu tiên mỗi phép đo một case) rồi '
                         'dừng — vẫn dọn dữ liệu QA đầy đủ. Dùng cho lượt chạy thử đầu tiên '
                         'trên app thật trước khi chạy cả bộ')
    ap.add_argument('--session', help='tên phiên (mặc định `live-<role>-<màn>`)')
    ap.add_argument('--session-dir', help='thư mục chứa phiên ($QA_SESSION_DIR)')
    ap.add_argument('--parallel', type=int, default=1, metavar='N',
                    help='số màn chạy cùng lúc (mỗi màn một phiên, một Chrome)')
    ap.add_argument('--hien', action='store_true', help='mở cửa sổ Chrome thật (gỡ lỗi)')
    ap.add_argument('--timeout', type=int, default=pl.TIMEOUT_MAC_DINH, metavar='GIÂY')
    ap.add_argument('--phan-he', default=pl.PHAN_HE_MAC_DINH)
    ap.add_argument('--home-prefix', help='tiền tố route sau đăng nhập ($QA_HOME_PREFIX)')
    ap.add_argument('--login-path', help='route trang đăng nhập ($QA_LOGIN_PATH)')
    ap.add_argument('--user'); ap.add_argument('--pass', dest='pw')
    g = ap.add_argument_group('HÀNG RÀO AN TOÀN (mặc định: chỉ đọc)')
    g.add_argument('--cho-phep-ghi', dest='cho_phep_ghi', action='store_true',
                   help='cho phép case có thao tác GHI — vẫn phải qua guard quyền sở hữu')
    g.add_argument('--whitelist', help='file JSON/text liệt kê id bản ghi QA được phép thao tác')
    g.add_argument('--mang-cho-phep', dest='mang_cho_phep', action='append', metavar='ENDPOINT',
                   help='endpoint ĐỌC dựng bằng POST được phép. Khớp CHÍNH XÁC, KHÔNG phải '
                        'chuỗi con: "/api/x" cho đúng path /api/x (mọi origin), '
                        '"https://host/api/x" đòi đúng cả origin lẫn path. '
                        '/api/evil/x · /api/x-extra · /foo/api/x đều KHÔNG khớp. '
                        'Khai được nhiều lần; mỗi lần khai đều ghi vào evidence kèm lý do')
    g.add_argument('--don-du-lieu-qa', dest='chi_don', action='store_true',
                   help='CHỈ dọn nốt bản ghi QA còn tồn trong sổ của phiên rồi thoát '
                        '(dùng sau CLEANUP_FAILED hoặc sau khi lượt trước chết giữa chừng); '
                        'phải kèm --cho-phep-ghi')
    ap.add_argument('--verify', action='store_true',
                    help='đi kèm --don-du-lieu-qa: CHỈ ĐỌC — quét app tìm bản ghi QA còn sót '
                         'rồi đối chiếu với sổ, KHÔNG xoá gì. Mã thoát ≠ 0 nếu app còn sót.')
    g.add_argument('--chi-doc', dest='chi_doc', action='store_true',
                   help='CHỈ ĐỌC: tắt hẳn phần ghi kể cả ở chế độ tự động. Cờ này THU HẸP '
                        'quyền — không có cờ nào làm ngược lại (xem `auto_confirm`)')
    g.add_argument('--pe-chan', dest='pe_chan', action='store_true',
                   help='chấm PE + [SAFETY BLOCKED] cho case bị chặn (mặc định: để TRỐNG, vì '
                        '"tool chưa làm" KHÁC "không thể làm" — xem §chinh_sach_PE)')
    ap.add_argument('--list', action='store_true', help='liệt kê phiên rồi thoát')
    m = ap.add_argument_group('CHẾ ĐỘ CHẠY')
    m.add_argument('--non-interactive', dest='non_interactive', action='store_true',
                   default=True,
                   help='KHÔNG hỏi người trong lúc chạy — MẶC ĐỊNH. Mọi câu hỏi xác nhận đi '
                        'qua bảng chính sách `auto_confirm`; tình huống không quyết được an '
                        'toàn thì BLOCKED và ghi lý do, không treo tiến trình')
    m.add_argument('--interactive', dest='non_interactive', action='store_false',
                   help='chế độ cũ: phần ghi chỉ chạy khi tự tay khai --cho-phep-ghi')
    a = ap.parse_args()

    if a.list:
        return sm.in_danh_sach(a.session_dir)
    if not a.role:
        ap.error('thiếu <Role>')
    roles.get(a.role)                    # nạp hồ sơ dự án / báo lỗi sớm nếu role sai

    wl = []
    if a.whitelist:
        if not os.path.exists(a.whitelist):
            die('không có file whitelist: %s' % a.whitelist)
        raw = open(a.whitelist, encoding='utf-8').read().strip()
        try:
            x = json.loads(raw)
            wl = x if isinstance(x, list) else (x.get('ids') or [])
        except ValueError:
            wl = [l.strip() for l in raw.splitlines() if l.strip()]

    srcs = sorted({s.path for s in qalib.iter_role_files(a.role, only=a.man)})
    if not srcs:
        die('không có file nguồn nào khớp role %s / màn %r' % (a.role, a.man or '(mọi màn)'))

    viec = []
    for src in srcs:
        man = qalib.ten_man(src, a.role)
        ds = qalib.res_dirs(a.role)
        if a.which:
            ds = [d for d in ds if os.path.basename(d).lower() == a.which.lower()] or ds[:1]
        if not ds:
            die('hồ sơ dự án không khai `subdir_result` và không suy được thư mục kết quả')
        dst = os.path.join(ds[0], os.path.basename(src)[:-5] + qalib.res_suffix() + '.xlsx')
        sid = a.session or ('live-%s-%s' % (_slug(a.role), _slug(man)))
        viec.append(Viec(a.role, man, src, dst, sid, url=a.url, col=a.col, apply=a.apply,
                         dry=a.dry, resume=a.resume, hien=a.hien, phan_he=a.phan_he,
                         home=a.home_prefix, login=a.login_path, timeout=a.timeout,
                         goc=a.session_dir, cho_phep_ghi=a.cho_phep_ghi, whitelist=wl,
                         user=a.user, pw=a.pw, ghi_lai=a.ghi_lai, pe_chan=a.pe_chan,
                         mang_cho_phep=a.mang_cho_phep or [], chi_don=a.chi_don,
                         verify=a.verify, dong=a.dong,
                         so_case=a.so_case, pilot=a.pilot,
                         # MỘT bảng chính sách cho mỗi màn: sổ quyết định đi cùng phiên của
                         # màn đó, không trộn giữa các màn khi chạy --parallel.
                         chinh_sach=auto_confirm.ChinhSach(
                             non_interactive=a.non_interactive, chi_doc=a.chi_doc)))
    if len(viec) > 1 and a.session:
        die('nhiều màn mà chỉ một --session: mỗi màn phải một phiên riêng '
            '(bỏ --session để tool tự đặt tên theo màn)')

    print('Dự án %s · role %s · %d màn · cột %s%s%s'
          % (roles.PROJECT.get('name'), a.role, len(viec), a.col,
             '  [DRY-RUN]' if a.dry else ('  [GHI THẬT]' if a.apply else '  [xem trước]'),
             '  [TỰ ĐỘNG — không hỏi]' if a.non_interactive else '  [TƯƠNG TÁC]'))
    # ⚠️ Vá 2026-09-16 lượt 3. `--dry-run` trước đây LUÔN chạy không phiên, nên khối
    # `_cat_trang_thai` trong `chay_mot_man` — có ghi chú hẳn hoi *"dry-run vẫn phải cất
    # trạng thái"* — không bao giờ ghi được gì: `ss` là `None`. Bản kê tiền kiểm (case nào
    # có phép đo, case nào PE-CSDL, tiền điều kiện của từng case) biến mất ngay khi lệnh
    # kết thúc. Nay: người chạy khai `--session` thì dry-run dùng đúng phiên ấy và để lại
    # `result/cases.json` + `evidence/quyet-dinh.json`; không khai thì giữ nguyên nếp cũ.
    ham = (lambda v: chay_mot_man(v, None)) if (a.dry and not a.session) else _chay_phien
    kq = sm.chay_nhieu(viec, ham, a.parallel)
    # LUÔN in tổng kết, kể cả một màn / dry-run: `chay_nhieu` NUỐT `SystemExit` của từng lượt
    # (để một màn hỏng không kéo cả lô), nên bỏ bảng này là lỗi `die()` biến mất khỏi màn hình
    # và mã thoát vẫn 0 — đúng lớp "tool im lặng" đang phải bịt.
    return sm.tom_tat(kq)


def _chay_an_toan():
    try:
        return main()
    except KeyboardInterrupt:
        # Ctrl+C là NGƯỜI DÙNG dừng, không phải tool hỏng: mã 130, không traceback
        # (cùng hợp đồng với `probe_live.py` — xem `tu_kiem/kiem_da_phien.py` phép ⑧).
        sys.stderr.write('\n-- dừng theo Ctrl+C --\n')
        return 130


if __name__ == '__main__':
    sys.exit(_chay_an_toan())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM PHẦN SOI MÀN — chạy THẬT: app giả + Chrome thật + `probe_live.py` thật.

Vì sao có bộ này (lời báo của người đặt việc 2026-09-14: *"thỉnh thoảng nút button tải lại cũng
không được phát hiện"*, kèm ảnh một màn bị khai `Selectbox Số bản ghi trên trang` trong khi màn
thật là `Textbox`):

Lớp lỗi ở đây **không bộ rà nào bắt được**. `probe_live` bỏ sót một control thì nó vẫn in ra một
báo cáo trông bình thường — chỉ thiếu đúng dòng đó. Hồ sơ màn khai theo báo cáo thiếu ⇒ bộ case
thiếu hẳn một nhóm, mà nhóm THIẾU HẲN là điểm mù §1 của luật định mức: `audit_validate_quota`
đếm case của nhóm ĐÃ CÓ, 13/13 bộ rà vẫn ra 0. Cái giá: mất `Button Tải lại` + `Chức năng Tải
lại`, hoặc tụt định mức ô số-bản-ghi/trang từ 10 (Textbox) xuống 5 (Selectbox) cùng toàn bộ
validate ô nhập.

`app_gia.py?bay=1` dựng đúng ba hình dạng DOM đã làm bản cũ rơi; mỗi phép kiểm dưới đây đối
chiếu với hành vi ĐÚNG, và nói rõ nó chứng minh điều gì.

Thiếu Chrome thì BỎ QUA và nói thẳng là "không đo được", KHÔNG bao giờ tự nhận là đạt.

    python3 tools/tu_kiem/kiem_soi_man.py
"""
import json
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)
import app_gia                     # noqa: E402
import probe_live                  # noqa: E402

PROBE = os.path.join(TOOLS, 'probe_live.py')
TK = ('admin@gia.vn', 'matkhau-A')
KQ = []


class _BoQua(Exception):
    pass


def kiem(ten, ham):
    t0 = time.time()
    try:
        ghi_chu = ham() or ''
        KQ.append((True, ten))
        print('   ✔ %-54s %5.1fs %s' % (ten, time.time() - t0, ghi_chu))
    except _BoQua as e:
        KQ.append((None, ten))
        print('   ⊘ %-54s BỎ QUA — %s (KHÔNG phải "đạt")' % (ten, e))
    except Exception as e:                              # noqa: BLE001
        KQ.append((False, ten))
        print('   ✘ %-54s %5.1fs\n       -> %s: %s'
              % (ten, time.time() - t0, type(e).__name__, e))


HO_SO = {
    'man': 'Danh Muc Nguon',
    'nav': ['Danh mục', 'Danh Muc Nguon'],
    'cn': [
        {'ten': 'DANH SÁCH DANH MỤC NGUỒN',
         'controls': ['Textbox Nhập từ khoá tìm kiếm', 'Selectbox Trạng thái', 'Selectbox Nhóm',
                      'Button Tìm kiếm', 'Button Xóa lọc', 'Button Tải lại',
                      'Textbox Số bản ghi trên trang', 'Textbox Nhập số trang', 'Phân trang']},
        {'ten': 'THÊM MỚI DANH MỤC NGUỒN',
         'controls': ['Textbox Mã', 'Textbox Tên', 'Textarea Ghi chú', 'Selectbox Trạng thái',
                      'Selectbox Nhóm', 'Datepicker Ngày áp dụng']},
    ],
}


class Khung:
    def __init__(self):
        self.srv = app_gia.chay(0)
        self.port = self.srv.server_address[1]
        self.tmp = tempfile.mkdtemp(prefix='qa-kiem-soi-man-')
        self.ra = {}

    def url(self, bay, cum=None):
        q = [x for x in ('bay=1' if bay else '', 'cum=2' if cum else '') if x]
        return ('http://127.0.0.1:%d/admin/danh-muc-nguon%s'
                % (self.port, ('?' + '&'.join(q)) if q else ''))

    def hoso(self, doi=None, them=None):
        """Ghi hồ sơ màn ra file tạm.

        `doi` = {nhóm cũ: nhóm mới|None} để dựng ca khai SAI · `them` = nhóm khai THÊM vào CN
        đầu (dùng cho cụm phân trang có hai control).
        """
        d = json.loads(json.dumps(HO_SO))
        for t in (them or []):
            d['cn'][0]['controls'].append(t)
        for cu, moi in (doi or {}).items():
            for cn in d['cn']:
                if cu in cn['controls']:
                    i = cn['controls'].index(cu)
                    if moi is None:
                        cn['controls'].pop(i)
                    else:
                        cn['controls'][i] = moi
        p = os.path.join(self.tmp, 'hs-%d.json' % (len(os.listdir(self.tmp)) + 1))
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False)
        return p

    def soi(self, bay, spec=None, cum=None):
        """Chạy `probe_live.py` THẬT (tiến trình riêng, đúng đường người dùng chạy)."""
        khoa = (bay, spec, cum)
        if khoa in self.ra:
            return self.ra[khoa]
        e = dict(os.environ, QA_USER=TK[0], QA_PASS=TK[1],
                 QA_HOME_PREFIX='/admin', QA_LOGIN_PATH='/login')
        args = [sys.executable, PROBE, self.url(bay, cum)] + (['--spec', spec] if spec else [])
        r = subprocess.run(args, env=e, capture_output=True, text=True, timeout=300)
        if 'không thấy' in r.stderr and 'chrome' in r.stderr.lower():
            raise _BoQua('máy không có Chrome')
        self.ra[khoa] = r.stdout
        return r.stdout

    def don(self):
        try:
            self.srv.shutdown()
        except Exception:
            pass


def _dong(txt, moc):
    for d in txt.splitlines():
        if moc in d:
            return d.strip()
    return ''


def main():
    if not os.path.exists(probe_live.bm.CHROME) and not any(
            os.path.exists(os.path.join(p, probe_live.bm.CHROME))
            for p in (os.environ.get('PATH') or '').split(':')):
        print('⊘ không có Chrome — bộ này không đo được, KHÔNG coi là đạt')
        return 3
    k = Khung()
    print('TỰ KIỂM SOI MÀN — app giả ở cổng %d' % k.port)

    # ① Nút CHỈ CÓ ICON. Bản cũ đòi `innerText` khác rỗng nên nút ⟳ dựng bằng <svg> biến mất
    #    hoàn toàn khỏi báo cáo; tên của nó chỉ có ở `aria-label`.
    def p1():
        d = _dong(k.soi(True), 'nút đầu màn')
        assert 'Tải lại' in d, 'nút Tải lại CHỈ CÓ ICON không được phát hiện: %r' % d
        return d.split(':', 1)[1].strip()
    kiem('① nút Tải lại chỉ có icon vẫn được phát hiện', p1)

    # ② Hàng nút nằm ở DÒNG RIÊNG (không cùng hàng `h1`). Bản cũ đòi |top − h1.top| < 44 nên
    #    mất TRỌN hàng nút — in ra một dòng `nút đầu màn :` rỗng mà không cảnh báo gì.
    def p2():
        d = _dong(k.soi(False), 'nút đầu màn')
        for t in ('Thêm mới', 'Xuất excel', 'Tải lại'):
            assert t in d, 'mất nút %r khi hàng nút xuống dòng riêng: %r' % (t, d)
        return 'đủ 3 nút'
    kiem('② hàng nút ở dòng riêng vẫn đọc đủ', p2)

    # ③ Thẻ số liệu (KPI) đẩy thanh lọc xuống quá 340px. Bản cũ khoanh cứng `top>140 && top<340`
    #    nên MẤT CẢ THANH LỌC (đo: 0 control) — và không dòng nào nói là đã mất.
    def p3():
        txt = k.soi(True)
        khoi = txt.split('thanh lọc (trái')[1].split('biểu mẫu THÊM MỚI')[0]
        for t in ('Nhập từ khoá tìm kiếm', 'Trạng thái', 'Nhóm', 'Tìm kiếm', 'Xóa lọc'):
            assert t in khoi, 'thẻ số liệu đẩy thanh lọc ra khỏi dải -> mất %r' % t
        return '%d control' % len([x for x in khoi.splitlines() if x.strip()[:2].strip('.').isdigit()])
    kiem('③ thẻ số liệu đẩy thanh lọc xuống, vẫn đọc đủ', p3)

    # ④ Thứ tự trái->phải của một hàng phải ĐÚNG (thứ tự này quyết định thứ tự nhóm con khối
    #    `Tìm kiếm đơn lẻ`, PROMPT v3 §6). Nút icon cao 32px lệch `top` so với ô nhập cao 21px
    #    nên cách gom hàng theo `top` làm tròn từng đẩy `Xóa lọc` sang hàng nút đầu màn.
    def p4():
        d = _dong(k.soi(True), 'nút đầu màn')
        assert d.index('Thêm mới') < d.index('Xuất excel') < d.index('Tải lại'), \
            'thứ tự trái->phải của hàng nút sai: %r' % d
        khoi = k.soi(True).split('thanh lọc (trái')[1].split('biểu mẫu THÊM MỚI')[0]
        assert khoi.index('Tìm kiếm') < khoi.index('Xóa lọc'), 'thứ tự thanh lọc sai'
        assert 'Xóa lọc' in khoi, 'nút icon `Xóa lọc` bị xếp nhầm sang hàng nút đầu màn'
        return 'đúng thứ tự cả hai hàng'
    kiem('④ nút icon không làm vỡ thứ tự trái->phải của hàng', p4)

    # ⑤ LOẠI của ô số-bản-ghi/trang phải được in ra. Trước bản này báo cáo chỉ nói "đang là 20",
    #    người khai hồ sơ phải ĐOÁN là Selectbox (5 case) hay Textbox (10 case).
    def p5():
        assert 'input[text]' in _dong(k.soi(True), 'ô số bản ghi/trang'), 'không nhận ra Textbox'
        assert '<select>' in _dong(k.soi(False), 'ô số bản ghi/trang'), 'không nhận ra Selectbox'
        return 'phân biệt đúng cả hai'
    kiem('⑤ báo cáo nói rõ ô số bản ghi/trang là loại gì', p5)

    # ⑥ Khai SAI LOẠI ô số-bản-ghi/trang phải bị mục ⑤ tố. Đây chính là ca trong ảnh chỉ thị:
    #    `soi_cum_phan_trang` nhận CẢ HAI loại nên nó im, `audit_validate_quota` đếm theo loại
    #    ĐÃ KHAI nên cũng đủ — không chỗ nào khác bắt được.
    def p6():
        sp = k.hoso({'Textbox Số bản ghi trên trang': 'Selectbox Số bản ghi trên trang'})
        # Neo vào cụm chữ BẤT BIẾN của lời báo, không vào cả câu: câu văn đã đổi một lần
        # (16/09, khi cụm có thể mang hai ô) và phép kiểm khi đó im lặng HỎNG vì cớ văn phong.
        d = _dong(k.soi(True, sp), 'ĐỊNH MỨC KHÁC HẲN')
        assert 'Textbox' in d and 'Selectbox Số bản ghi trên trang' in d, \
            'khai sai loại mà không ai kêu: %r' % d
        return 'bắt đúng'
    kiem('⑥ khai Selectbox cho ô Textbox -> mục ⑤ tố', p6)

    # ⑦ Màn CÓ nút Tải lại mà hồ sơ không khai -> phải kêu (mất `Button` + `Chức năng Tải lại`).
    def p7():
        sp = k.hoso({'Button Tải lại': None})
        d = _dong(k.soi(True, sp), 'nút Tải lại')
        assert 'KHÔNG khai' in d, 'thiếu nhóm Tải lại mà không ai kêu: %r' % d
        return 'bắt đúng'
    kiem('⑦ màn có Tải lại mà hồ sơ thiếu -> mục ⑤ tố', p7)

    # ⑧ Hồ sơ ĐÚNG thì phải im. Báo động giả ở đúng chỗ người đọc dùng để sửa hồ sơ còn tai hại
    #    hơn bỏ sót: sửa theo là hỏng hồ sơ đang đúng (đã phải vá đúng lớp đó ngày 14/09).
    def p8():
        txt = k.soi(True, k.hoso())
        assert 'không thấy chỗ lệch nào' in txt, \
            'hồ sơ khai ĐÚNG mà vẫn bị tố:\n%s' % txt.split('⑤ ĐỐI CHIẾU')[-1][:900]
        return '0 chỗ lệch'
    kiem('⑧ hồ sơ khai đúng -> 0 báo động giả', p8)

    # ── Cụm phân trang có HAI control (`?cum=2`) — hình dạng của màn thật moet-datalake.
    # Ba phép dưới đây thêm 2026-09-16. Cả tám phép trên đều chạy trên màn có ĐÚNG MỘT ô, nên
    # giả định "cụm = một control" của `_JS_PAGING` sống sót qua toàn bộ bộ tự kiểm.
    SEL = 'Selectbox Số bản ghi trên trang'

    # ⑨ Ô CHỌN NHANH phải vào được báo cáo. Bản cũ: `ganEl()` ưu tiên <input> nên trên màn có
    #    cả hai, cái <select> không bao giờ xuất hiện — người khai hồ sơ không biết nó tồn tại.
    def p9():
        dong = [d for d in k.soi(False, cum=True).splitlines() if 'ô số bản ghi/trang là' in d]
        assert len(dong) == 2, 'cụm có 2 ô mà báo cáo in %d dòng:\n%s' % (len(dong),
                                                                          '\n'.join(dong))
        cả = ' '.join(dong)
        assert 'input[text]' in cả and '<select>' in cả, 'thiếu một loại: %r' % cả
        assert '500' in cả, 'không in ra các mức của ô chọn nhanh: %r' % cả
        return 'đọc đủ 2 ô'
    kiem('⑨ cụm có 2 ô -> báo cáo in cả ô nhập lẫn ô chọn nhanh', p9)

    # ⑩ Hồ sơ khai ĐÚNG CẢ HAI nhóm thì phải im. Bản cũ đem ô NHẬP so với nhóm `Selectbox …`
    #    rồi tố "khai sai loại" — báo động giả ở đúng chỗ người ta dùng để sửa hồ sơ; sửa theo
    #    là bỏ nhóm Selectbox và mất trắng 5 case.
    def p10():
        sp = k.hoso(them=[SEL])
        txt = k.soi(False, sp, cum=True)
        assert 'ĐỊNH MỨC KHÁC HẲN' not in txt, \
            'màn có đủ 2 ô, hồ sơ khai đúng cả 2, vẫn bị tố:\n%s' \
            % txt.split('⑤ ĐỐI CHIẾU')[-1][:700]
        return '0 báo động giả'
    kiem('⑩ khai đủ 2 nhóm cho cụm 2 ô -> không tố sai loại', p10)

    # ⑪ Chiều NGƯỢC — chỗ mất case trong im lặng: màn CÓ ô chọn nhanh mà hồ sơ chỉ khai ô nhập.
    #    Nhóm THIẾU HẲN là điểm mù §1 của luật định mức: `audit_validate_quota` đếm case của
    #    nhóm ĐÃ CÓ nên 13/13 bộ rà vẫn ra 0.
    def p11():
        txt = k.soi(False, k.hoso(), cum=True)
        d = _dong(txt, 'KHÔNG khai nhóm nào cho nó')
        assert d and SEL in d, 'thiếu hẳn nhóm cho ô chọn nhanh mà không ai kêu:\n%s' \
            % txt.split('⑤ ĐỐI CHIẾU')[-1][:700]
        return 'bắt đúng'
    kiem('⑪ màn có ô chọn nhanh mà hồ sơ thiếu nhóm -> bị tố', p11)

    k.don()
    dat = sum(1 for x in KQ if x[0] is True)
    hong = sum(1 for x in KQ if x[0] is False)
    bo = sum(1 for x in KQ if x[0] is None)
    print('\n=== %d phép kiểm · %d ĐẠT · %d HỎNG · %d BỎ QUA ===' % (len(KQ), dat, hong, bo))
    return 1 if hong else 0


if __name__ == '__main__':
    sys.exit(main())

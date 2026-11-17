# -*- coding: utf-8 -*-
"""Bộ chọn dùng chung — §D + §J của chỉ thị 17/09 lượt 2.

Một ô chọn được đặt giá trị qua ĐÚNG một đường trong cả tool, và đường ấy đi trọn sáu bước:

    LOCATE → OPEN → VERIFY OPEN → DISCOVER OPTIONS → SELECT → VERIFY SELECTED

Vì sao phải gom lại: lượt chạy 500 case ngày 17/09 hỏng 18 case ở bước SETUP, tất cả cùng
một câu — *"chọn 'ClickHouse1' nhưng ô vẫn hiện 'Chọn loại database'"*. Lúc ấy có BA bản chép
tay cùng một việc (`ui.chon_dau_tien` cũ, `ui.dat_o_chon`, `Ctx.chon_o_bat_buoc`), mỗi bản
bấm một kiểu và mỗi bản chắn một nửa số lỗi, nên vá bản này thì bản kia vẫn hỏng.

Hai luật của bộ này:

  · **Không verify được giá trị thì KHÔNG báo thành công.** Ô chọn dựng bằng `button`+`div`
    có nhiều lớp bọc trông y hệt tuỳ chọn; bấm trúng lớp bọc thì trình duyệt vẫn nhận cú
    click. Thành công phải đọc lại được ở trigger, không phải suy ra từ "đã bấm".
  · **Bấm không ăn thì đổi CÁCH bấm, không bấm lại y nguyên.** Chuỗi lùi có thứ tự cố định
    (§D) và mỗi cách đều ghi lại vào `buoc[]` để evidence nói được *kết luận này dựa trên
    thao tác nào*.

`buoc[]` là bản kê từng bước — đủ để `result/cases.json` trả lời `fallback_attempted` /
`fallback_result` mà không phải đoán lại từ log.
"""
import time

import live_ui as ui
import qalib


def _n(x):
    return qalib.norm(x or '')


# Chữ KHÔNG phải một giá trị thật: chữ gợi ý và mục đang tải.
def la_gia(chu):
    q = _n(chu).strip()
    return (not q) or q.startswith('chon ') or q == 'chon' or q.startswith('dang tai') \
        or q.startswith('-- chon') or q.startswith('loading') or q.startswith('khong tim thay') \
        or q.startswith('khong co du lieu')


class KetQuaChon(dict):
    """Kết quả một lượt đặt giá trị. `ok` chỉ `True` khi VERIFY SELECTED đạt."""

    @property
    def ok(self):
        return bool(self.get('ok'))

    def __str__(self):
        if self.ok:
            return str(self.get('sau') or self.get('chon') or '')
        return 'HỎNG: %s' % (self.get('ly_do') or 'không rõ')


class BoChon:
    """Một ô chọn cụ thể trên màn/biểu mẫu đang mở.

    `tuy_chon` = danh sách giá trị hồ sơ màn khai cho trường này (`tuy_chon_<tên>`). Nó phục vụ
    đường tìm ⑥: ô nào đang HIỆN một trong các giá trị ấy thì chính là ô ấy — cần cho những ô
    hiện giá trị đang chọn thay vì chữ gợi ý (ô `Sắp xếp`), vốn không đường nào khác tìm ra.
    """

    def __init__(self, c, nhan, pv='loc', goi_y='', tuy_chon=()):
        self.c, self.nhan, self.pv = c, nhan, pv
        self.goi_y = goi_y or ''
        self.tuy_chon = list(tuy_chon or [])
        self.buoc = []
        self._o = None

    # ── bản kê ───────────────────────────────────────────────────────────────
    def _ghi(self, ten, ok, **kw):
        m = {'buoc': ten, 'ok': bool(ok)}
        m.update({k: v for k, v in kw.items() if v not in (None, '', [], {})})
        self.buoc.append(m)
        return m

    # ── ① LOCATE ─────────────────────────────────────────────────────────────
    def tim(self, lai=False):
        if self._o is not None and not lai:
            return self._o
        o = ui.tim_o_chon(self.c, self.nhan, self.pv, self.goi_y, self.tuy_chon)
        self._o = o
        self._ghi('LOCATE', bool(o), duong=(o or {}).get('duong'), the=(o or {}).get('the'),
                  chu=(o or {}).get('chu'),
                  ly_do=None if o else 'không tìm thấy ô chọn %r ở phạm vi %s' % (self.nhan, self.pv))
        return o

    def loai(self):
        return ((self.tim() or {}).get('loai')) or ''

    # ── ② OPEN + ③ VERIFY OPEN + ④ DISCOVER ──────────────────────────────────
    def mo(self, cho=0.8):
        """Mở ô rồi đọc danh sách tuỳ chọn ĐÃ ỔN ĐỊNH. -> dict của `ui.mo_o_chon` | None."""
        if not self.tim():
            return None
        op = ui.mo_o_chon(self.c, self.nhan, self.pv, self.goi_y, cho=cho,
                          tuy_chon=self.tuy_chon)
        ds = [x.get('chu') for x in ((op or {}).get('option') or [])]
        that = [x for x in ds if not la_gia(x)]
        self._ghi('OPEN', bool(op))
        self._ghi('VERIFY_OPEN', bool(op and op.get('mo_duoc') is not False and ds),
                  so_option=len(ds),
                  ly_do=None if ds else 'mở ô chọn nhưng không đọc được lựa chọn nào')
        self._ghi('DISCOVER', bool(that), so_that=len(that), option=that[:25],
                  ly_do=None if that else 'danh sách chỉ có chữ gợi ý / mục đang tải')
        return op

    def dong(self):
        ui.dong_o_chon(self.c)

    # ── ⑥ VERIFY SELECTED ────────────────────────────────────────────────────
    def _doc_lai(self, mong=None):
        """Đọc lại ô — kèm GIÁ TRỊ VỪA CHỌN làm căn cứ tìm.

        Sau một cú chọn thành công, trigger hiện giá trị chứ không còn hiện chữ gợi ý, nên
        mọi đường tìm theo chữ gợi ý đều trượt và ô "biến mất" đúng vào lúc ta cần xác nhận.
        Đọc ra y hệt một cú bấm trượt — tức là báo HỎNG cho việc đã xong.
        """
        tc = list(self.tuy_chon)
        if mong:
            tc.append(mong)
        return ui.tim_o_chon(self.c, self.nhan, self.pv, self.goi_y, tc) or {}

    def _da_dat(self, mong, truoc):
        """Giá trị đã vào ô chưa? -> (bool, chữ đọc lại, cách xác nhận).

        Ba cách xác nhận, xét theo thứ tự chắc chắn giảm dần. Ô nhiều lựa chọn không hiện
        nguyên văn giá trị mà hiện bản tóm ("... 2 lựa chọn"), nên chỉ so chữ là chấm hỏng
        OAN cho một lần chọn đã ăn; ngược lại chấp nhận "chữ có đổi" cho ô một lựa chọn thì
        lại nhận nhầm một cú bấm trượt làm thành công. Tách hai đường ra.
        """
        sau = self._doc_lai(mong)
        chu = sau.get('chu') or ''
        gt = sau.get('gia_tri') or ''
        if mong and (_n(mong) in _n(chu) or _n(mong) in _n(gt)):
            return True, chu, 'chu_trigger'
        if sau.get('nhieu_lua_chon') and _n(chu) != _n(truoc) and not la_gia(chu):
            return True, chu, 'trigger_doi_o_nhieu_lua_chon'
        return False, chu, ''

    # ── ⑤ SELECT — chuỗi lùi §D ──────────────────────────────────────────────
    def chon(self, gia_tri=None, dau_tien=False, cho=0.8):
        """Đặt `gia_tri` (hoặc tuỳ chọn THẬT đầu tiên) vào ô. -> `KetQuaChon`.

        Chuỗi lùi, đúng thứ tự §D, dừng ngay khi VERIFY SELECTED đạt:

            ① native `<select>`      — đặt `value` + `change`, không cần mở popup
            ② bấm toạ độ             — mở · chờ ổn định · bấm CHUỘT THẬT vào tâm tuỳ chọn
            ③ sự kiện pointer        — bắn `pointerdown/up` thẳng vào phần tử bằng JS; KHÔNG
                                       qua hit-test nên miễn nhiễm toạ độ/che khuất/animation
            ④ mở lại rồi bấm lại     — chắn đúng ca danh sách vừa bị vẽ lại
            ⑤ bàn phím               — focus trigger · ArrowDown tới mục · Enter
            ⑥ click DOM              — `el.click()`, cho thư viện chỉ nghe `click`
            ⑦ giá trị kế tiếp        — mục đầu vô hiệu/không bấm được thì thử mục sau
        """
        o = self.tim()
        if not o:
            return KetQuaChon(ok=False, buoc=self.buoc,
                              ly_do='không tìm thấy ô chọn %r ở phạm vi %s' % (self.nhan, self.pv),
                              ma_ly_do='KHONG_TIM_THAY_O')
        if o.get('vo_hieu'):
            return KetQuaChon(ok=False, buoc=self.buoc, duong=o.get('duong'),
                              ly_do='ô chọn %r đang bị vô hiệu' % self.nhan,
                              ma_ly_do='O_VO_HIEU')
        truoc = o.get('chu') or ''

        # ① native
        if o.get('loai') == 'native':
            kq = ui.dat_o_chon(self.c, self.nhan, gia_tri or '', self.pv, self.goi_y,
                               cho=cho, tuy_chon=self.tuy_chon)
            dat, sau, cach_xn = self._da_dat(gia_tri or (kq or {}).get('chon'), truoc)
            self._ghi('SELECT', bool(dat), cach='native')
            self._ghi('VERIFY_SELECTED', dat, sau=sau, cach_xac_nhan=cach_xn)
            return KetQuaChon(ok=dat, buoc=self.buoc, cach='native', truoc=truoc, sau=sau,
                              chon=(kq or {}).get('chon'), duong=o.get('duong'),
                              ly_do=None if dat else 'đặt value cho <select> mà đọc lại không đổi',
                              ma_ly_do=None if dat else 'SELECT_KHONG_AN')

        op = self.mo(cho=cho)
        ds = [x.get('chu') for x in ((op or {}).get('option') or []) if not la_gia(x.get('chu'))]
        if not ds:
            self.dong()
            return KetQuaChon(ok=False, buoc=self.buoc, duong=o.get('duong'), truoc=truoc,
                              ly_do='ô chọn %r không có tuỳ chọn thật nào (%d mục đọc được)'
                                    % (self.nhan, len((op or {}).get('option') or [])),
                              ma_ly_do='KHONG_CO_TUY_CHON')
        if dau_tien or not gia_tri:
            ung_vien = ds[:3]
        else:
            khop = [x for x in ds if _n(gia_tri) == _n(x)] or [x for x in ds if _n(gia_tri) in _n(x)]
            if not khop:
                self.dong()
                return KetQuaChon(ok=False, buoc=self.buoc, duong=o.get('duong'), truoc=truoc,
                                  co=ds[:25],
                                  ly_do='ô %r không có lựa chọn %r (có: %s)'
                                        % (self.nhan, gia_tri, ' · '.join(ds[:8])),
                                  ma_ly_do='KHONG_CO_GIA_TRI')
            ung_vien = khop[:1]

        for gt in ung_vien:
            for cach in ('bam_toa_do', 'su_kien_pointer', 'bam_lai', 'ban_phim',
                         'dom_click'):
                if cach != 'bam_toa_do':
                    # Mọi cách sau cách ① đều cần danh sách đang mở và VỪA ĐƯỢC ĐỌC LẠI:
                    # cú bấm trượt của lượt trước có thể đã đóng popup.
                    if not self.mo(cho=cho):
                        break
                r = self._thu(cach, gt, ds)
                self._ghi('SELECT', bool(r.get('bam')), cach=cach, gia_tri=gt,
                          ly_do=r.get('ly_do'))
                if not r.get('bam'):
                    continue
                time.sleep(0.45)
                dat, sau, cach_xn = self._da_dat(gt, truoc)
                self._ghi('VERIFY_SELECTED', dat, cach=cach, sau=sau, cach_xac_nhan=cach_xn)
                if dat:
                    return KetQuaChon(ok=True, buoc=self.buoc, cach=cach, chon=gt, sau=sau,
                                      truoc=truoc, duong=o.get('duong'),
                                      cach_xac_nhan=cach_xn)
        self.dong()
        sau = (self._doc_lai(gia_tri) or {}).get('chu') or ''
        return KetQuaChon(
            ok=False, buoc=self.buoc, duong=o.get('duong'), truoc=truoc, sau=sau, co=ds[:25],
            ly_do='thử %d giá trị × 4 cách bấm mà ô vẫn hiện %r (đường tìm %s, %d tuỳ chọn)'
                  % (len(ung_vien), sau, o.get('duong'), len(ds)),
            ma_ly_do='BAM_KHONG_AN')

    # ── các cách bấm ─────────────────────────────────────────────────────────
    def _thu(self, cach, gt, ds):
        c = self.c
        if cach in ('bam_toa_do', 'bam_lai'):
            r = ui.chon_trong_o(c, gt)
            return {'bam': bool(r and r.get('ok')), 'ly_do': (r or {}).get('ly_do')}
        if cach == 'ban_phim':
            # Điều hướng bằng phím trong popup đang mở: xuống tới đúng mục rồi Enter. Chắn ca
            # tuỳ chọn bị một lớp phủ trong suốt che mất cú bấm chuột.
            i = next((k for k, x in enumerate(ds) if _n(x) == _n(gt)), 0)
            ui.go_phim(c, 'ArrowDown', so_lan=i + 1, nghi=0.1)
            ui.go_phim(c, 'Enter')
            return {'bam': True}
        if cach == 'su_kien_pointer':
            # Bắn chuỗi PointerEvent thẳng vào tuỳ chọn — không qua hit-test, nên không phụ
            # thuộc toạ độ/che khuất/animation. Đây là đường DUY NHẤT ăn với ô `Loại database`
            # của app thật: nó không nghe phím, không nghe `click`, chỉ nghe `pointerdown`
            # (đo 18/09). Vẫn đi qua handler của chính app, không chọc vào state.
            r = ui.bam_pointer_js(c, """(()=>{const op=OPTION_HIEN();
              return op.find(o=>QN(TXT(o))===QN(%s))||op.find(o=>QN(TXT(o)).includes(QN(%s)))
                ||null;})()""" % (ui._s(gt), ui._s(gt)))
            return {'bam': bool(r and r.get('ok')),
                    'ly_do': None if (r and r.get('ok')) else 'không còn thấy lựa chọn'}
        if cach == 'dom_click':
            r = ui._js(c, """
              const op=OPTION_HIEN();
              const t=op.find(o=>QN(TXT(o))===QN(%s))||op.find(o=>QN(TXT(o)).includes(QN(%s)));
              if(!t) return JSON.stringify({bam:false, ly_do:'không còn thấy lựa chọn'});
              t.click(); return JSON.stringify({bam:true});""" % (ui._s(gt), ui._s(gt)))
            return r if isinstance(r, dict) else {'bam': False, 'ly_do': 'JS không trả lời'}
        return {'bam': False, 'ly_do': 'cách bấm không biết: %s' % cach}


def dat(c, nhan, gia_tri=None, pv='loc', goi_y='', tuy_chon=(), dau_tien=False, cho=0.8):
    """Lối vào ngắn: đặt một giá trị vào ô chọn. -> `KetQuaChon`."""
    return BoChon(c, nhan, pv, goi_y, tuy_chon).chon(gia_tri, dau_tien=dau_tien, cho=cho)

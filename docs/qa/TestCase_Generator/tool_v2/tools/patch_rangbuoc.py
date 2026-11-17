# -*- coding: utf-8 -*-
"""Dựng nhóm `Validate ràng buộc giữa các trường` cho mọi CN có CẶP trường quan hệ.

Chỉ thị người đặt việc 2026-09-09: *"thiếu phần ràng buộc mối quan hệ giữa các trường: ví dụ
từ ngày > tới ngày"*. Trước bản này KHÔNG chỗ nào của tool nói về quan hệ GIỮA hai ô — bank
`DATEPICKER` (11 mục) chỉ soi MỘT ô nên màn có cặp `Từ ngày`/`Đến ngày` vẫn nghiệm thu sạch
mà thiếu hẳn phép kiểm cặp (đo 09/09 trên `moetdl/DuLieuLoi`: 22 case datepicker, 0 case cặp).

Cặp nhận diện theo NHÃN UI (`qalib.field_of`), 3 khuôn:
    · `Từ <X>`  ↔ `Đến <X>` / `Tới <X>`      (Từ ngày ↔ Đến ngày · Từ giờ ↔ Đến giờ)
    · `<X> bắt đầu` ↔ `<X> kết thúc`          (Ngày bắt đầu ↔ Ngày kết thúc)
    · `<X> từ` ↔ `<X> đến`                    (Hiệu lực từ ↔ Hiệu lực đến)
Không nhận diện được thì KHÔNG bơm và KHÔNG đoán — `audit_extra` phép 7 sẽ nhắc nếu có cặp
mà thiếu nhóm.

Nhóm đặt ở CUỐI khối `Validate các trường thông tin` của chính CN đó (sau các nhóm control),
cấp `sub2` như mọi nhóm control. Mỗi cặp 4 case (`quota_cases.RANGBUOC`) — định mức là SÀN.

    python3 patch_rangbuoc.py <role> [tên màn]            # XEM TRƯỚC
    python3 patch_rangbuoc.py <role> [tên màn] --apply    # ghi
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import quota_cases
import roles
import tcfix

norm = qalib.norm
NHOM = 'Validate ràng buộc giữa các trường'

# Khuôn cặp: (tiền tố/hậu tố đầu, các biến thể của đầu SAU)
_DAU = ('tu ',)
_CUOI = ('den ', 'toi ')
_HAU_DAU = (' bat dau', ' tu')
_HAU_CUOI = (' ket thuc', ' den')


def _nhan(gname):
    """Nhãn UI của nhóm control — bỏ tiền tố loại control bằng `qalib.field_of` (bản DUY NHẤT)."""
    return (qalib.field_of(gname) or '').strip()


def tim_cap(groups):
    """[(nhãn đầu, nhãn sau)] — ghép cặp trong danh sách nhóm control của MỘT CN.

    Ghép theo nhãn đã chuẩn hoá, so khớp CHÍNH XÁC phần còn lại (không dùng chuỗi con: nhãn
    `Ngoại ngữ` nằm trong `Mã trình độ ngoại ngữ` — bài học của `probe_live` 09/09).
    """
    nhan = [(_nhan(g), g) for g in groups]
    nhan = [(n, g) for n, g in nhan if n]
    ra, da_dung = [], set()
    for n1, g1 in nhan:
        if g1 in da_dung: continue
        a = norm(n1)
        cho, kieu = None, None
        for pre_a, pres_b in ((_DAU, _CUOI),):
            for p in pre_a:
                if a.startswith(p):
                    cho, kieu = a[len(p):].strip(), ('pre', pres_b)
        if cho is None:
            for h in _HAU_DAU:
                if a.endswith(h):
                    cho, kieu = a[:-len(h)].strip(), ('suf', _HAU_CUOI)
        if cho is None: continue
        for n2, g2 in nhan:
            if g2 == g1 or g2 in da_dung: continue
            b = norm(n2)
            khop = False
            if kieu[0] == 'pre':
                khop = any(b.startswith(p) and b[len(p):].strip() == cho for p in kieu[1])
            else:
                khop = any(b.endswith(h) and b[:-len(h)].strip() == cho for h in kieu[1])
            if khop:
                ra.append((n1, n2)); da_dung.add(g1); da_dung.add(g2); break
    return ra


def cases_cho_cap(a, b):
    return [(t.format(a=a, b=b), c.format(a=a, b=b), d.format(a=a, b=b))
            for _k, t, c, d in quota_cases.RANGBUOC]


def quet(tc):
    """[(tên CN, [cặp], dòng chèn, đã có nhóm chưa)] — thuần đọc."""
    out = []
    cn = grp = sub = None
    ctrls, moc, co_nhom = [], None, False

    def xong():
        if cn is not None and ctrls:
            out.append((cn, tim_cap(ctrls), moc, co_nhom))

    for rn in tc.order:
        if rn < 12: continue
        lv = tc.lvl(rn); b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            xong()
            cn, grp, sub, ctrls, moc, co_nhom = b, None, None, [], None, False
        elif lv == 'grp':
            grp = norm(b); sub = None
        elif lv == 'sub':
            sub = norm(b)
        elif lv in ('sub2',):
            if grp and 'giao dien' in grp and sub and 'validate cac truong' in sub:
                if norm(b) == norm(NHOM) or 'rang buoc giua cac truong' in norm(b):
                    co_nhom = True
                else:
                    ctrls.append(b)
        # mốc chèn = dòng CUỐI của khối Validate (case cuối của nhóm control cuối)
        if grp and 'giao dien' in grp and sub and 'validate cac truong' in sub:
            moc = rn
    xong()
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 patch_rangbuoc.py <%s> [tên màn] [--apply]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv

    tot_case = tot_file = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=True):
        tc, nm = sh.tc, sh.name
        ins = {}
        for cn, caps, moc, co_nhom in quet(tc):
            if not caps or moc is None: continue
            if co_nhom:
                print('   %-18s %-34s [đã có nhóm] bỏ qua' % (nm[:18], cn[:34]))
                continue
            cases = []
            for a, b in caps:
                cases += cases_cho_cap(a, b)
            ins.setdefault(moc, []).append(cases)
            print('   %-18s %-34s +%d case · %d cặp: %s'
                  % (nm[:18], cn[:34], len(cases), len(caps),
                     ' | '.join('%s ↔ %s' % c for c in caps)[:44]))
        if not ins: continue
        n = sum(len(cs) for v in ins.values() for cs in v)
        tot_case += n; tot_file += 1
        if not apply_: continue
        pl = tcfix.Plan(tc)
        for rn in tc.order:
            if rn < 12: continue
            pl.keep(rn)
            for cases in ins.get(rn, []):
                pl.add_sub2(NHOM)
                for c in cases: pl.case(*c)
        tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)

    print('=== %d file · +%d case%s ===' % (tot_file, tot_case, '' if apply_ else ' (XEM TRƯỚC)'))
    if tot_case and not apply_:
        print('Ghi thật: python3 patch_rangbuoc.py %s%s --apply'
              % (role, ' ' + only if only else ''))


if __name__ == '__main__':
    main()

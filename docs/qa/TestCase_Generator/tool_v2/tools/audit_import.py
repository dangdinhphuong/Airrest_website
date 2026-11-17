# -*- coding: utf-8 -*-
"""Rà luồng NHẬP EXCEL theo mẫu `DanhMucTuDienDungChung.xlsx` r488–r578 (chỉ đọc).

Mẫu có, trong khối `Validate` của CN NHẬP EXCEL, **một nhóm cho MỖI CỘT của file excel**
(r515 `Textbox Mã…` 9 · r525 `Textbox Tên…` 8 · r534 `Textbox số thứ tự…` 9 · r544 `Selectbox…` 4)
và **một nhóm ATTT 4 case cho mỗi cột chữ** (r569 · r574). Định mức: `v3` §5.4.

⚠️ ĐIỂM MÙ bộ rà cũ (phát hiện 2026-09-07): `audit_validate_quota` · `audit_func` · `audit_attt`
đều báo `0` cho 9/9 CN Nhập Excel của dự án dù **thiếu hẳn** nhóm cột — vì cả ba **chỉ kiểm nhóm
ĐÃ TỒN TẠI**. Đây là lần thứ ba cùng một loại điểm mù (trước đó: `audit_func` không thấy CN thiếu
hẳn nhóm `Chức năng Hủy bỏ`; `audit_attt` không rà injection per-field).

Cột của file excel = **mọi ô nhập trong `Validate` của CN THÊM MỚI tương ứng** (ghép cặp theo thực
thể, dùng chung `patch_sua_validate.entity/is_input`).

    python3 audit_import.py [Admin|NCC|Teacher] [tên file]
"""
import os
import sys
import glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix
import roles
import qalib
from qalib import norm, needs_attt
from patch_sua_validate import entity, is_input

# ── 13 mục của MẪU cho nhóm `File excel` (r502–r514) ──────────────────────────────────
# Rà theo MỤC, không theo SỐ: 9/9 CN của dự án đủ 13 case nhưng thiếu 5 mục mẫu, vì bank
# `quota_cases.EXCEL_IMPORT` bù bằng mục riêng của dự án. `audit_validate_quota` chỉ ĐẾM
# nên báo sạch (anti-pattern §11.3 mục 3). Needle rộng để nhận cả cách diễn đạt tương đương.
FILE_EXCEL_MUC = [
    ('giá trị mặc định',              ['gia tri mac dinh']),
    ('là trường bắt buộc',            ['la truong bat buoc', 'chua chon tep', 'bat buoc chon tep']),
    ('tải lên 1 tệp',                 ['tai len 1 tep', 'tai len 1 file', 'tai len mot tep',
                                       'chon 1 tep', 'chon dung mot tep']),
    ('đúng định dạng ĐÚNG mẫu',       ['dung mau', 'dung cau truc mau']),
    ('đúng định dạng SAI mẫu',        ['sai mau', 'khong dung mau']),
    ('tệp giả định dạng',             ['gia duoi', 'gia dinh dang', 'dinh dang gia']),
    ('hợp lệ nhưng KHÔNG có dữ liệu', ['khong co dong du lieu', 'khong co du lieu', 'tep rong']),
    ('thiếu ô/cột bắt buộc trên tệp', ['bo trong o bat buoc', 'thieu cot bat buoc',
                                       'thieu truong bat buoc']),
    ('có cả dòng đúng và dòng lỗi',   ['ca dong dung va dong loi', 'hop le va khong hop le',
                                       'ca ban ghi hop le']),
    ('vượt dung lượng cho phép',      ['vuot qua dung luong', 'vuot dung luong', '10 mb', '10mb']),
    ('TRONG dung lượng cho phép',     ['trong dung luong cho phep', '<= 10mb', 'nho hon hoac bang nguong']),
    ('KHÔNG đúng định dạng xls/xlsx', ['khong dung dinh dang', 'chi nhan tep dung dinh dang',
                                       'ngoai .xlsx']),
    ('tải lên tệp nhiều lần',         ['nhieu lan', 'chon lai tep khac', 'chon lai file']),
]

# định mức nhóm cột theo loại control (v3 §5.4)
QUOTA_COL = [(('selectbox', 'combobox', 'nut chon', 'checkbox'), 8, 'Selectbox'),
             # tên ô số của dự án thường KHÔNG chứa chữ 'số': Thứ tự hiển thị · Số lượng · Đơn giá
             (('o so', 'textbox so', 'thu tu', 'so luong', 'don gia', 'gia (', 'so tien'),
              9, 'Textbox số'),
             ((), 8, 'Textbox chữ')]
UNIQUE_KW = ('ma ', 'ma_', 'code', 'email', 'slug', 'so hieu')
ATTT_COL_CASES = 4          # mẫu r569/r574: SQLi + 3 XSS, KHÔNG có alert


def quota_of(field):
    n = norm(field)
    for kws, q, lab in QUOTA_COL:
        if kws and any(k in n for k in kws):
            return q, lab
    q, lab = 8, 'Textbox chữ'
    if any(k in n for k in UNIQUE_KW):
        return 9, 'Textbox chữ unique'
    return q, lab


# Chỉ thị 2026-09-07: nhóm validate của CN NHẬP EXCEL đặt tên theo LOẠI CONTROL THẬT
# (`Textbox Mã môn học` · `Selectbox Trạng thái`…), KHÔNG dùng tiền tố "Cột" nữa.
# Giữ nhận diện tiền tố "Cột" để còn đọc được các bộ case cũ chưa đổi tên.
_CTRL_PREFIX = ('textbox', 'textarea', 'selectbox', 'combobox', 'checkbox',
                'datepicker', 'upload', 'o nhap', 'o so')


def is_col_group(name):
    n = norm(name)
    if n.startswith(('tai file mau', 'file excel', 'file nhap', 'button ', 'nut ')):
        return False                      # 3 nhóm KHÔNG phải cột nhập
    return (n.startswith('cot ') or 'trong file' in n or 'cot excel' in n
            or n.startswith(_CTRL_PREFIX))


def scan(tc):
    """-> {cn: {'inp': [ô nhập], 'col': {tên nhóm cột: số case}, 'attt': {nhóm: số case}}}"""
    D, cn, blk, inval, cur = {}, None, None, False, None
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        h = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        n = norm(h)
        if lv == 'case':
            if cur and cur[1] == '__fx__':
                cur[0].setdefault('fx', []).append(h)
            elif cur:
                cur[0][cur[1]] = cur[0].get(cur[1], 0) + 1
            continue
        cur = None
        if lv == 'cn':
            cn = h
            blk, inval = None, False
            D[cn] = {'inp': [], 'col': {}, 'attt': {}}
        elif lv == 'grp':
            blk, inval = n, False
        elif lv in ('sub', 'sub2') and blk and cn:
            if 'giao dien' in blk:
                if 'validate' in n:
                    inval = True
                    continue
                if lv == 'sub':
                    inval = False
                if not inval:
                    continue
                if 'file excel' in n and 'tai file' not in n and 'tai len' not in n:
                    D[cn]['fx'] = D[cn].get('fx', [])
                    cur = None
                    D[cn]['_fxname'] = h
                    cur = (D[cn], '__fx__')          # đánh dấu: case sau thuộc nhóm File excel
                elif is_col_group(h):
                    D[cn]['col'].setdefault(h, 0)
                    cur = (D[cn]['col'], h)
                elif is_input(h) and not any(k in n for k in ('file excel', 'file mau', 'tai file')):
                    D[cn]['inp'].append(h)
            elif 'an toan thong tin' in blk:
                D[cn]['attt'].setdefault(h, 0)
                cur = (D[cn]['attt'], h)
    return D


def main(argv):
    role = argv[1] if len(argv) > 1 else 'Admin'
    only = argv[2] if len(argv) > 2 else None
    CFG = roles.get(role)
    t_miss = t_thin = t_merge = t_attt = t_cn = t_muc = 0

    # ⚠️ Vá 2026-09-14 — ĐỌC ĐỦ MỌI SHEET BP (xem chú thích cùng ngày ở `audit_content.py`).
    _broken = []
    for _sh in qalib.iter_role_files(role, only=only, broken=_broken):
        p, tc = _sh.path, _sh.tc
        nm = _sh.name + ((' [%s]' % _sh.bp) if _sh.multi else '')
        D = scan(tc)
        imp = [(c, d) for c, d in D.items() if 'nhap excel' in norm(c) or 'import' in norm(c)]
        them = [(c, d) for c, d in D.items()
                if any(k in norm(c) for k in ('them', 'tao ', 'khoi tao')) and 'nhap excel' not in norm(c)]
        for c, d in imp:
            t_cn += 1
            es = entity(c)
            cand = [x for x, _y in them if entity(x) == es] or \
                   [x for x, _y in them if entity(x) and (entity(x) in es or es in entity(x))]
            src = dict(them).get(cand[0]) if cand else None
            out = []
            if not src:
                out.append('(!) không ghép được CN Thêm mới ⇒ không suy ra được danh sách cột')
            else:
                have = {norm(g): (g, n) for g, n in d['col'].items()}
                for f in src['inp']:
                    want, lab = quota_of(f)
                    key = [k for k in have if norm(f).split()[-1] in k or
                           all(w in k for w in norm(f).split()[1:3])]
                    if not key:
                        out.append('THIẾU nhóm cột cho ô "%s" (chuẩn %d case — %s)' % (f[:34], want, lab))
                        t_miss += 1
                        continue
                    g, n = have[key[0]]
                    if n < want:
                        out.append('nhóm cột "%s" chỉ %d/%d case (%s)' % (g[:30], n, want, lab))
                        t_thin += 1
            fx = d.get('fx') or []
            if fx:
                j = norm(' ¦ '.join(fx))
                miss_muc = [lab for lab, kws in FILE_EXCEL_MUC if not any(k in j for k in kws)]
                if miss_muc:
                    out.append('nhóm "%s" %d case nhưng THIẾU %d/13 mục mẫu: %s'
                               % (d.get('_fxname', 'File excel')[:26], len(fx), len(miss_muc),
                                  ', '.join(miss_muc)))
                    t_muc += len(miss_muc)
            for g in d['col']:
                if '/' in g or ' và ' in g.lower():
                    out.append('nhóm cột GỘP nhiều cột: "%s"' % g[:44])
                    t_merge += 1
            # ATTT chỉ đòi cho cột GÕ ĐƯỢC — mẫu r569/r574 chỉ có cho 2 cột chữ, không có cho
            # cột số / Selectbox. Dùng `qalib.needs_attt` để cùng luật với audit_attt phép [B].
            n_attt_col = sum(1 for g in d['attt']
                             if is_col_group(g) or norm(g).startswith(('textbox', 'textarea')))
            need_attt = [f for f in (src['inp'] if src else []) if needs_attt(f)] or \
                        [g for g in d['col'] if needs_attt(g.replace('Cột ', 'Textbox '))]
            if need_attt and n_attt_col < len(need_attt):
                out.append('khối ATTT thiếu %d nhóm cột gõ được (mỗi cột %d case): %s'
                           % (len(need_attt) - n_attt_col, ATTT_COL_CASES,
                              ', '.join(x[:22] for x in need_attt[:3])))
                t_attt += len(need_attt) - n_attt_col
            if out:
                print('#### %-22s %s' % (nm[:22], c[:44]))
                for o in out:
                    print('     · %s' % o)

    print('\n=== %s — NHẬP EXCEL (%d CN): mục "File excel" thiếu %d · thiếu nhóm cột %d · '
          'nhóm cột mỏng %d · nhóm gộp %d · ATTT cột thiếu %d ==='
          % (role, t_cn, t_muc, t_miss, t_thin, t_merge, t_attt))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))

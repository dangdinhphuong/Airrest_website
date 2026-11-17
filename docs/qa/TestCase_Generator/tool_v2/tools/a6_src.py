# -*- coding: utf-8 -*-
"""Sửa MÃ NGUỒN của script A6 tại chỗ — phần dùng chung của `fix_a6_*.py`.

Tách ra 2026-09-14 khi có script A6 thứ hai cần cùng phép sửa: chép hai bản là chép luôn hai
bẫy đã trả giá bên dưới.

Hai bẫy, đều đã làm hỏng tệp nguồn thật một lần:
  · `ast` trả `col_offset` theo **byte UTF-8**, KHÔNG theo ký tự — cắt theo chỉ số ký tự thì với
    chữ Việt là lệch, đã làm mất dấu `)` cuối lệnh `r(...)` của `a6-BaoCaoDong.py`;
  · lưới chắn cú pháp phải chạy **TRƯỚC** `write()`, không phải sau — kiểm sau là tệp thật đã ở
    trạng thái hỏng, phải đi lùi tay từ `bak/`.

Hai khuôn script A6 đều phải đọc được: `r()` / `ro()` và bảng `SUA = {dòng: (C, D, T)}`. Bỏ sót
khuôn `SUA` nghĩa là báo "0 chỗ cần sửa" trên đúng tệp đang sai — số 0 vì không quét tới nơi.
"""
import ast

RONG = 96          # bề ngang tối đa của một dòng literal sinh ra


def ve_cd(cay):
    """-> [(tên vế, node)] cho MỌI vế cột C/D của một cây cú pháp A6, cả hai khuôn."""
    ra = list(o_sua(cay))
    for node in ast.walk(cay):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                and node.func.id in ('r', 'ro')):
            ra.extend(o_cd(node))
    return ra


def _thoat(s):
    return s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')

def emit(val, thut):
    """Sinh literal Python cho `val`, ngắt dòng theo bề ngang — trả về chuỗi mã nguồn."""
    tho = _thoat(val)
    rong = RONG - thut - 2
    if len(tho) <= rong:
        return "'%s'" % tho
    manh, dong = [], ''
    for tu in tho.split(' '):
        if dong and len(dong) + len(tu) + 1 > rong:
            manh.append(dong + ' ')
            dong = tu
        else:
            dong = (dong + ' ' + tu).strip()
    if dong:
        manh.append(dong)
    noi = ('\n' + ' ' * thut).join("'%s'" % m for m in manh)
    return noi

def o_cd(call):
    """-> [(tên vế, node)] cho vế C và D của một lệnh r()/ro()."""
    ra = []
    for i, ten in ((4, 'C'), (5, 'D')):
        if len(call.args) > i:
            ra.append((ten, call.args[i]))
    for kw in call.keywords:
        if kw.arg in ('C', 'D'):
            ra.append((kw.arg, kw.value))
    return ra

def o_sua(cay):
    """-> [(tên vế, node)] cho bảng `SUA = {dòng: (C, D, T)}` — đời script A6 khoá theo SỐ DÒNG.

    `a6-NhomNguon.py` / `a6-ViTriLuuTru.py` dùng khuôn này (neo lại bằng `a6-<Màn>.neo.json`),
    KHÔNG dùng `r()`. Bản đầu chỉ quét `r()`/`ro()` nên báo *"0 vế lẫn"* trên đúng tệp đang còn
    đường dẫn `/api/db-tool/v1/ingestion/source-groups` ở vế C — số 0 vì không quét tới nơi,
    đúng lớp điểm mù README đã gọi tên.
    """
    ra = []
    for node in ast.walk(cay):
        if not isinstance(node, ast.Dict):
            continue
        for val in node.values:
            if isinstance(val, ast.Tuple) and len(val.elts) >= 2:
                for i, ten in ((0, 'C'), (1, 'D')):
                    ra.append((ten, val.elts[i]))
    return ra

def thay(src, span, moi):
    """Thay đoạn mã nguồn ứng với `span` bằng literal mới.

    ⚠️ `ast` trả `col_offset` theo **byte UTF-8**, KHÔNG theo ký tự. Bản đầu cắt chuỗi theo chỉ
    số ký tự nên với chữ Việt là lệch — đã làm mất dấu `)` cuối lệnh `r(...)` của
    `a6-BaoCaoDong.py` và tệp hỏng cú pháp ngay. Vì vậy mọi phép cắt ở đây chạy trên BYTE.
    """
    b = src.encode('utf-8')
    dau_dong = [0]
    for i, ch in enumerate(b):
        if ch == 0x0a:
            dau_dong.append(i + 1)
    l1, c1, l2, c2 = span
    i1 = dau_dong[l1 - 1] + c1
    i2 = dau_dong[l2 - 1] + c2
    thut = len(b[dau_dong[l1 - 1]:i1].decode('utf-8'))
    tho = emit(moi, thut).encode('utf-8')
    return (b[:i1] + tho + b[i2:]).decode('utf-8')

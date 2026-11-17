# -*- coding: utf-8 -*-
"""Kiểm CÚ PHÁP mọi đoạn JS nhúng trong `probe_live.py` + `browser_manager.py` (`node --check`).

Vì sao cần: `probe_live` bơm JS vào Chrome qua CDP `Runtime.evaluate`. Đoạn JS thiếu một dấu
`}` thì CDP trả **None KHÔNG kèm lỗi** nếu người gọi không đọc `exceptionDetails` — đã trả giá
đúng lần này với `_JS_FORM` (2026-09-09): script chạy êm, in ra rỗng, và mất cả buổi mới thấy.
Đây là phép kiểm rẻ nhất chặn được lớp đó, chạy trước khi lên màn thật.

Không có `node` thì BỎ QUA và nói rõ (không giả vờ sạch).

    python3 check_js.py
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import browser_manager
import probe_live


def doan_js():
    """[(tên, mã JS)] — hằng `_JS_*` của CẢ HAI module + đoạn JS sinh động trong `_bam_tab`.

    `browser_manager` vào danh sách từ 2026-09-12: phần đọc localStorage/sessionStorage của
    phiên nằm ở đó, bỏ sót là đúng điểm mù mà script này sinh ra để bịt.
    """
    ra = [('%s.%s' % (m.__name__.split('_')[0], k) if m is browser_manager else k, v)
          for m in (probe_live, browser_manager)
          for k, v in sorted(vars(m).items())
          if k.startswith('_JS_') and isinstance(v, str)]
    ra.append(('_bam_tab (JS sinh động)',
               """(()=>{const t=[...document.querySelectorAll('[role=tab]')]
      .find(x=>(x.innerText||'').trim()===%s);
      if(!t) return ''; if(%s.test(t.innerText||'')) return 'CHAN'; t.click(); return 'OK';})()"""
               % (json.dumps('Tab thử'), probe_live._JS_CAM)))
    # Hai đoạn sinh động thêm 2026-09-14 (§4/§5 — luồn sâu nhiều dòng + quay về có kiểm chứng).
    # Chúng cũng bơm qua `Runtime.evaluate` nên sai cú pháp là trả None IM LẶNG y hệt.
    ra.append(('_bam_dong (JS sinh động)', _ma_bam_dong()))
    ra.append(('quay_ve_cha (JS nút quay lại)',
               """(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>
      /quay lại|trở về|back/i.test((x.getAttribute('title')||'')+' '
        +(x.getAttribute('aria-label')||'')+' '+(x.innerText||'')));
      if(b){b.click();return 1;} return 0;})()"""))
    ra += doan_js_lop_b()
    return ra


def doan_js_lop_b():
    """JS của LỚP B (`live_ui` · `phep_live`) — thêm 2026-09-15 lượt 4.

    Khác `probe_live`: JS ở đây không nằm trong hằng `_JS_*` mà là **chuỗi truyền thẳng** cho
    `live_ui._js(c, …)`, và đoạn nào cũng được ghép sau `JS_NEN`. Bỏ chúng ra ngoài phép kiểm
    là để nguyên lớp lỗi mà chính script này sinh ra để bịt — mà lần này nguy hiểm hơn, vì
    lớp B **bấm nút ghi**: một đoạn JS hỏng ở đây trả `None` im lặng ngay giữa một thao tác
    đổi dữ liệu.

    Lấy bằng cách đọc cây cú pháp (`ast`), không bằng regex: đối số thứ hai của mọi lời gọi
    `_js(...)` mà là hằng chuỗi.
    """
    import ast
    import live_ui
    ra = []
    # `hanh_dong` + `truong_live` + `attt_live` thêm 2026-09-16 — cùng lối gọi `_js(c, …)`,
    # nên bỏ sót chúng là để nguyên đúng lớp lỗi script này sinh ra để bịt.
    for ten_mod in ('live_ui', 'phep_live', 'hanh_dong', 'truong_live', 'man_live',
                    'attt_live'):
        f = os.path.join(os.path.dirname(os.path.abspath(__file__)), ten_mod + '.py')
        if not os.path.exists(f):
            continue
        cay = ast.parse(open(f, encoding='utf-8').read(), filename=f)
        for nut in ast.walk(cay):
            if not isinstance(nut, ast.Call):
                continue
            ten = getattr(nut.func, 'attr', None) or getattr(nut.func, 'id', None)
            if ten != '_js' or len(nut.args) < 2:
                continue
            a = nut.args[1]
            ma = None
            if isinstance(a, ast.Constant) and isinstance(a.value, str):
                ma = a.value
            elif isinstance(a, ast.BinOp) and isinstance(a.op, ast.Mod) \
                    and isinstance(a.left, ast.Constant) and isinstance(a.left.value, str):
                # `"…%s…" % (…)` — thay chỗ trống bằng một chuỗi JS hợp lệ để kiểm CÚ PHÁP
                ma = re.sub(r'%[sdrf]', '"x"', a.left.value)
                ma = ma.replace('%%', '%')
            if ma:
                ra.append(('%s:%d' % (ten_mod, nut.lineno), live_ui.JS_NEN + '\n' + ma))
    return ra


def _ma_bam_dong():
    """Chính đoạn JS mà `probe_live._bam_dong` bơm vào Chrome, dựng lại với dòng 0."""
    return """(()=>{const tr=[...document.querySelectorAll('table tbody tr')][%d];
      if(!tr) return 'KHONG_CO_DONG';
      const ic=[...tr.querySelectorAll('button,a')].find(x=>
        /xem|chi tiết|chi tiet|detail/i.test((x.getAttribute('title')||'')+' '
          +(x.getAttribute('aria-label')||'')));
      const t=ic||tr;
      const txt=((t.innerText||'')+' '+(t.getAttribute('title')||''))
        .replace(/\\s+/g,' ').trim().slice(0,60);
      if(%s.test(txt)) return 'CHAN:'+txt;
      t.click();
      return 'OK:'+(ic?('icon "'+(ic.getAttribute('title')||'')+'"'):'chính dòng');})()""" \
        % (0, probe_live._JS_CAM)


def main():
    node = shutil.which('node') or shutil.which('nodejs')
    ds = doan_js()
    if not node:
        print('!! không có `node` trên máy — BỎ QUA phép kiểm cú pháp JS (%d đoạn chưa kiểm).'
              % len(ds))
        print('   Đây là "không đo được", KHÔNG phải "sạch".')
        return 1
    loi = 0
    with tempfile.TemporaryDirectory() as d:
        for ten, ma in ds:
            f = os.path.join(d, re.sub(r'[^A-Za-z0-9_.-]+', '_', ten.strip('_')) + '.js')
            with open(f, 'w', encoding='utf-8') as fh:
                fh.write('(function(){ return %s })' % ma)
            r = subprocess.run([node, '--check', f], capture_output=True, text=True)
            if r.returncode:
                loi += 1
                print('   ✘ %-28s %s' % (ten, (r.stderr or '').strip().splitlines()[:2]))
            else:
                print('   ✔ %-28s cú pháp OK' % ten)
    print('\n=== %d đoạn JS · %d lỗi cú pháp ===' % (len(ds), loi))
    return 1 if loi else 0


if __name__ == '__main__':
    sys.exit(main())

# -*- coding: utf-8 -*-
"""Rà CHUỖI SINH `chay-chuoi-<Màn>.sh` — bắt bước bị thiếu hẳn khỏi chuỗi.

Vì sao cần một bộ rà riêng: **mọi bộ rà khác đều soi `.xlsx`**, tức soi SẢN PHẨM. Chuỗi sinh
thiếu một bước thì sản phẩm của lượt sinh sau mới hỏng, mà lúc ấy không ai còn nhớ để ngờ tới
chuỗi. Đo 2026-09-14: **4/6** chuỗi của role `ChuyenVien` thiếu hẳn bước **A6** — hai trong số
đó *có sẵn* `a6-<Màn>.py` mà chuỗi không bao giờ gọi, và chú thích ngay dưới chỗ thiếu vẫn ghi
*"chạy SAU A6"* nên đọc lướt tưởng là có. Hậu quả: sinh lại màn = mất trắng nội dung A6
(phủ grounding 93% → ~50%) trong khi 14 bộ rà cấu trúc vẫn in 0.

Bốn phép:
  ① mỗi chuỗi phải gọi `a6-<Màn>.py` — và gọi ở đúng chỗ: SAU bước bơm case, TRƯỚC bước rút gọn
     cột D (rút gọn trước A6 thì A6 ghi đè lại chữ dài — chính chú thích trong chuỗi đã nói).
  ② có `a6-<Màn>.py` trên đĩa mà chuỗi không gọi (lớp lỗi nặng nhất: công viết A6 đổ sông).
  ③ chuỗi phải `set -eo pipefail` — gãy bước 1 mà chạy tiếp thì bước sau làm việc trên file dở.
  ④ sau mỗi lệnh có `rebuild()` phải có `formula_layer.py` khép lại.

    python3 audit_chuoi.py <Role>
"""
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roles

# Bước RÚT GỌN cột D — mốc để biết bước A6 có nằm ĐÚNG PHÍA TRƯỚC không.
RUT_GON = ('fix_kq_mau.py', 'fix_kq_validate.py')


def main():
    role = sys.argv[1] if len(sys.argv) > 1 else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 audit_chuoi.py <%s>' % '|'.join(roles.ROLES))
    cfg = roles.get(role)
    goc = os.path.join(getattr(cfg, 'testcase_dir', None) or os.environ.get('QA_TESTCASE_DIR', ''),
                       role, 'ho-so-man')
    if not os.path.isdir(goc):
        raise SystemExit('DỪNG — không có thư mục %s. Đặt QA_TESTCASE_DIR cho đúng; in 0 ở đây '
                         'chỉ có nghĩa là KHÔNG ĐỌC GÌ.' % goc)
    chuoi = sorted(glob.glob(os.path.join(goc, 'chay-chuoi-*.sh')))
    a6_co = {os.path.basename(p)[3:-3] for p in glob.glob(os.path.join(goc, 'a6-*.py'))
             if not p.endswith('.neo.json')}
    if not chuoi:
        raise SystemExit('DỪNG — %s không có chuỗi `chay-chuoi-*.sh` nào để rà.' % goc)

    t_a6 = t_bo = t_set = t_fl = t_thu_tu = 0
    for p in chuoi:
        man = os.path.basename(p)[len('chay-chuoi-'):-3]
        s = open(p, encoding='utf-8').read()
        loi = []
        goi_a6 = re.search(r'a6-(\$F|%s)\.py' % re.escape(man), s)
        if not goi_a6:
            loi.append('THIẾU HẲN bước A6')
            t_a6 += 1
            if man in a6_co:
                loi.append('mà `a6-%s.py` CÓ trên đĩa — công viết A6 đổ sông' % man)
                t_bo += 1
        else:
            i_a6 = goi_a6.start()
            i_rg = min([s.index(x) for x in RUT_GON if x in s] or [len(s)])
            if i_a6 > i_rg:
                loi.append('bước A6 nằm SAU bước rút gọn cột D — A6 sẽ ghi đè lại chữ dài')
                t_thu_tu += 1
        # ⚠️ Chỉ soi DÒNG LỆNH, bỏ dòng chú thích. Bản đầu tìm chuỗi trên cả tệp nên khớp phải
        #    chính câu chú thích *"chỉ `set -e` thì bước 1 CHẾT mà chuỗi vẫn chạy"* nằm ở đầu mỗi
        #    chuỗi ⇒ gieo lỗi (xoá hẳn dòng `set -eo pipefail`) mà phép rà vẫn in 0. Số 0 phải
        #    chứng minh được là đã quét tới nơi.
        lenh = [d.split('#')[0].strip() for d in s.split('\n')]
        if not any(d.startswith('set -') and 'e' in d.split()[1] for d in lenh
                   if d.startswith('set -') and len(d.split()) > 1):
            loi.append('thiếu `set -eo pipefail` — gãy bước đầu vẫn chạy tiếp')
            t_set += 1
        if 'formula_layer.py' not in s:
            loi.append('không gọi `formula_layer.py` — rebuild() đã xoá lớp công thức cột A')
            t_fl += 1
        if loi:
            print('#### %s' % os.path.basename(p))
            for x in loi:
                print('   %s' % x)

    print('\n=== %s — CHUỖI SINH (%d chuỗi): thiếu bước A6 %d · có A6 mà không gọi %d '
          '· A6 sai thứ tự %d · thiếu set -e %d · thiếu formula_layer %d ==='
          % (role, len(chuoi), t_a6, t_bo, t_thu_tu, t_set, t_fl))


if __name__ == '__main__':
    main()

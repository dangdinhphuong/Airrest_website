# -*- coding: utf-8 -*-
"""Bơm case cho các nhóm ô giờ (input type=time) sinh ra khi tách nhóm gộp
"Ô Ngày / giờ Bắt đầu / giờ Kết thúc". quota_cases chưa có bộ cho ô giờ."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix
import roles
def check_lock(path):
    lock=os.path.join(os.path.dirname(path), '.~lock.%s#'%os.path.basename(path))
    if os.path.exists(lock): raise SystemExit('DỪNG: file đang mở trong LibreOffice -> '+lock)
# Lấy từ hồ sơ dự án — bản cũ hardcode '/home/khuetm/projects/gstem/docs/qa-doc/...' nên đổi máy
# hoặc đổi chỗ checkout là gãy, đúng lỗi `roles.py` đã sửa từ 2026-08-22.
ROLE = 'Admin'
DIR = roles.get(ROLE)['dir']
APPLY = '--apply' in sys.argv     # mặc định XEM TRƯỚC (đảo 2026-09-08, như patch_quota)

def gio(f, other):
    return [
     ('Kiểm tra giá trị mặc định %s' % f, '1. Mở biểu mẫu, xem ô "%s".' % f,
      'Ô hiện giá trị giờ mặc định của hệ thống hoặc để trống theo thiết kế, kèm chữ gợi ý định dạng giờ:phút.'),
     ('Kiểm tra %s là trường bắt buộc' % f, '1. Xoá trống ô "%s".\n2. Bấm lưu.' % f,
      'Không lưu được; hiện thông báo phải nhập giờ ngay dưới ô.'),
     ('Kiểm tra nhập giờ hợp lệ vào %s' % f, '1. Nhập một giờ hợp lệ trong ngày.\n2. Bấm lưu.',
      'Lưu thành công; giờ hiển thị lại đúng giá trị vừa nhập.'),
     ('Kiểm tra nhập giờ không hợp lệ vào %s' % f, '1. Thử nhập 25:00 và 12:70.',
      'Ô không nhận giá trị ngoài khoảng giờ hợp lệ; giữ nguyên giá trị trước đó hoặc báo lỗi định dạng.'),
     ('Kiểm tra quan hệ giữa %s và %s' % (f, other),
      '1. Nhập %s muộn hơn (hoặc sớm hơn) %s theo hướng không hợp lệ.\n2. Bấm lưu.' % (f, other),
      'Bị chặn kèm thông báo giờ kết thúc phải sau giờ bắt đầu; không lưu được buổi có khung giờ ngược.'),
     ('Kiểm tra nhập bằng bàn phím và xoá giá trị %s' % f,
      '1. Gõ giờ bằng bàn phím.\n2. Xoá hết bằng phím Backspace.',
      'Nhập và xoá được bằng bàn phím; sau khi xoá ô trở về trạng thái trống.'),
    ]

def main():
  JOB={'KeHoachTapHuan':[('Ô giờ Bắt đầu','giờ Kết thúc'),('Ô giờ Kết thúc','giờ Bắt đầu')],
       'LichTapHuan':[('Ô giờ Bắt đầu','giờ Kết thúc'),('Ô giờ Kết thúc','giờ Bắt đầu')]}
  for name, groups in JOB.items():
      P=DIR+'Testcase-Role-Admin-%s.xlsx'%name; check_lock(P); tc=tcfix.load(P)
      ins={}
      for gname, other in groups:
          rn=None; have=[]
          rows=[r for r in tc.order if r>=12]
          for i,r in enumerate(rows):
              if tc.lvl(r) in ('sub','sub2') and (tc.c(r,'B') or '').split('\n')[0].strip()==gname:
                  rn=r
                  for r2 in rows[i+1:]:
                      if tc.lvl(r2)=='case': have.append((tc.c(r2,'B') or '').strip())
                      else: break
                  break
          if rn is None: print('  !! %s: không thấy %r'%(name,gname)); continue
          need=[c for c in gio(gname.replace('Ô ',''), other) if c[0] not in have]
          last=rn
          for r2 in tc.order:
              if r2<=rn: continue
              if tc.lvl(r2)=='case': last=r2
              else: break
          if need: ins[last]=need
      if not ins: continue
      n=sum(len(v) for v in ins.values())
      print('%-16s +%d case'%(name,n))
      p=tcfix.Plan(tc)
      for rn in tc.order:
          if rn<12: continue
          p.keep(rn)
          for c in ins.get(rn,[]): p.case(*c)
      if APPLY:
        tc.rebuild(p).save(quiet=True, sync=len(tc.bpsheets)==1)


if __name__ == '__main__':
    main()
    if not APPLY:
        print('(XEM TRƯỚC — thêm --apply để ghi)')

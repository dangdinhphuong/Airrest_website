# -*- coding: utf-8 -*-
"""Bổ sung MỤC còn thiếu cho Email · Số điện thoại · Ngày sinh · Giới tính · Upload ảnh · Upload file
theo đúng chuẩn `templateTestcase/DanhMucTuDienDungChung.xlsx` (dòng 194-259).
Chỉ bơm mục CHƯA CÓ; giữ nguyên case cũ."""
import sys, os, re, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles
# BẮT BUỘC truyền role — bản cũ hardcode Admin nên chạy "patch_dict.py NCC" vẫn ghi vào
# bộ Admin (đợt 21/08 đã bơm nhầm 6 case, phải khôi phục tay).
_args = [a for a in sys.argv[1:] if not a.startswith('--')]
ROLE = _args[0] if _args else None
if ROLE not in roles.ROLES:
    raise SystemExit('Dùng: python3 patch_dict.py <%s> [Tên màn] [--apply]'
                     % '|'.join(roles.ROLES))
DIR = roles.ROLES[ROLE]['dir']
SKIP = set(roles.ROLES[ROLE]['skip'])
# ĐẢO MẶC ĐỊNH 2026-09-08: mặc định XEM TRƯỚC, phải `--apply` mới ghi — bằng với `patch_quota`
# và 6 script `patch_*` khác (đợt đảo 08/09). Trước đó script này GHI THẲNG và `--dry` mới là xem,
# nên `../README.md` phải ghi cảnh báo *"patch_dict không có dry-run"*. `--dry` vẫn nhận để lệnh
# cũ không gãy. Kèm bộ lọc TÊN MÀN để không ghi lan ra cả role.
DRY = '--apply' not in sys.argv
_ARGS = [a for a in sys.argv[1:] if not a.startswith('--') and a not in roles.ROLES]
ONLY = _ARGS[0] if _ARGS else None
def n(s):
    s=(s or '').lower().replace('đ','d')
    return ''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn')
def lock(p):
    l=os.path.join(os.path.dirname(p),'.~lock.%s#'%os.path.basename(p))
    if os.path.exists(l): raise SystemExit('DỪNG: đang mở '+l)

# (khoá nhận diện, tiêu đề, bước, kết quả)  — wording bám từ điển
EMAIL=[
 ('da ton tai','Kiểm tra email đã tồn tại','1. Nhập một địa chỉ email đã có tài khoản trên hệ thống.\n2. Bấm lưu.',
  'Hiển thị thông báo email đã tồn tại và đặt con trỏ vào ô lỗi; không tạo được bản ghi trùng email.'),
 ('vuot qua do dai','Kiểm tra nhập vượt quá độ dài cho phép của phần trước dấu @ (trên 64 ký tự)',
  '1. Nhập email có phần trước dấu @ dài hơn 64 ký tự.\n2. Bấm lưu.',
  'Hiển thị thông báo email không đúng định dạng và đặt con trỏ vào ô lỗi.'),
 ('nho hon do dai','Kiểm tra nhập nhỏ hơn độ dài cho phép của phần trước dấu @ (không có ký tự nào)',
  '1. Nhập email chỉ gồm dấu @ và tên miền, không có ký tự nào trước dấu @.\n2. Bấm lưu.',
  'Hiển thị thông báo email không đúng định dạng và đặt con trỏ vào ô lỗi.'),
 ('do dai cho phep','Kiểm tra nhập đúng độ dài cho phép của phần trước dấu @ (từ 1 đến 64 ký tự)',
  '1. Nhập email có phần trước dấu @ dài đúng 64 ký tự.\n2. Bấm lưu.','Lưu thành công.'),
 ('khong dung dinh dang','Kiểm tra nhập email không đúng định dạng',
  '1. Lần lượt nhập: thiếu @, thiếu tên miền, có khoảng trắng giữa, hai dấu @, tên miền không có dấu chấm.\n2. Bấm lưu.',
  'Mỗi lần đều hiển thị thông báo email không đúng định dạng và đặt con trỏ vào ô lỗi.'),
 ('dung dinh dang','Kiểm tra nhập email đúng định dạng','1. Nhập một email đúng định dạng.\n2. Bấm lưu.','Lưu thành công.'),
]
PHONE=[
 ('dung dau so','Kiểm tra nhập đúng đầu số cho phép',
  '1. Nhập số điện thoại bắt đầu bằng đầu số hợp lệ của nhà mạng (10 chữ số).\n2. Bấm lưu.','Giá trị hợp lệ; lưu thành công.'),
 ('sai so ky tu','Kiểm tra nhập đúng đầu số cho phép nhưng sai số ký tự',
  '1. Nhập đầu số hợp lệ nhưng tổng cộng 9 chữ số, rồi thử 11 chữ số.\n2. Bấm lưu.',
  'Hiển thị thông báo số điện thoại không đúng định dạng và đặt con trỏ vào ô lỗi.'),
 ('sai dau so','Kiểm tra nhập sai đầu số cho phép',
  '1. Nhập số bắt đầu bằng đầu số không thuộc nhà mạng nào (ví dụ bắt đầu bằng 1 hoặc 2).\n2. Bấm lưu.',
  'Hiển thị thông báo số điện thoại không đúng định dạng và đặt con trỏ vào ô lỗi.'),
 ('trim','Kiểm tra chức năng Trim space','1. Nhập số điện thoại có khoảng trắng ở đầu và cuối.\n2. Bấm lưu.',
  'Lưu thành công; hệ thống tự cắt khoảng trắng hai đầu trước khi lưu.'),
]
DATE=[
 ('mac dinh','Kiểm tra giá trị mặc định','1. Mở biểu mẫu, xem ô ngày.',
  'Ô trống, hiện chữ gợi ý định dạng ngày/tháng/năm.'),
 ('da co','Kiểm tra mở hộp lịch khi ô đã có dữ liệu','1. Ô đang có sẵn một ngày.\n2. Bấm mở hộp lịch.',
  'Hộp lịch mở đúng tháng của ngày đang có và ngày đó được đánh dấu.'),
 ('chon ngay','Kiểm tra hoạt động của hộp lịch','1. Mở hộp lịch.\n2. Chọn một ngày bất kỳ.',
  'Hộp lịch tự đóng lại; ngày vừa chọn hiện trong ô đúng định dạng ngày/tháng/năm.'),
 ('ban phim','Kiểm tra nhập và xoá ngày bằng bàn phím','1. Gõ ngày trực tiếp từ bàn phím.\n2. Xoá giá trị đang hiển thị.',
  'Cho phép nhập và xoá bằng bàn phím; ô trở về trạng thái trống sau khi xoá.'),
 ('khong dung dinh dang','Kiểm tra nhập ngày không đúng định dạng','1. Nhập chuỗi không phải ngày, ví dụ 12-2020 hoặc abc.',
  'Đặt con trỏ vào ô lỗi kèm thông báo ngày không đúng định dạng ngày/tháng/năm hoặc không tồn tại.'),
 ('khong ton tai','Kiểm tra nhập ngày không tồn tại','1. Lần lượt nhập 31/04, 30/02 và 29/02 của một năm không nhuận.',
  'Mỗi lần đều báo ngày không đúng định dạng hoặc không tồn tại; không nhận giá trị.'),
 ('dung dinh dang','Kiểm tra nhập ngày đúng định dạng','1. Nhập một ngày hợp lệ đúng định dạng ngày/tháng/năm.',
  'Ngày hiển thị đúng định dạng và được nhận.'),
 ('qua khu','Kiểm tra nhập ngày trong quá khứ','1. Nhập một ngày nhỏ hơn ngày hiện tại.\n2. Bấm lưu.','Lưu thành công.'),
 ('tuong lai','Kiểm tra nhập ngày lớn hơn ngày hiện tại','1. Nhập một ngày lớn hơn ngày hiện tại.\n2. Bấm lưu.',
  'Hiển thị thông báo ngày sinh không được lớn hơn ngày hiện tại; không lưu được.'),
]
GENDER=[('bat buoc','Kiểm tra không phải là trường bắt buộc','1. Không chọn giới tính.\n2. Bấm lưu.',
         'Lưu thành công vì giới tính không phải trường bắt buộc.')]
IMG=[
 ('dinh dang hop le','Kiểm tra tải ảnh có định dạng hợp lệ','1. Chọn ảnh có đuôi jpg, png, jpeg hoặc webp.','Ảnh được tải lên và hiển thị trên màn.'),
 ('dinh dang gia','Kiểm tra tải ảnh có định dạng giả','1. Đổi đuôi một tệp bất kỳ thành .jpg rồi tải lên.',
  'Hiển thị thông báo ảnh không hợp lệ và đặt con trỏ vào ô lỗi; không nhận tệp.'),
 ('khong hop le','Kiểm tra tải ảnh có định dạng không hợp lệ','1. Chọn tệp có đuôi không nằm trong danh sách cho phép.',
  'Hiển thị thông báo nêu rõ định dạng không hợp lệ và các định dạng được phép.'),
 ('dung luong','Kiểm tra tải ảnh có dung lượng lớn hơn mức tối đa','1. Chọn ảnh đúng định dạng nhưng vượt dung lượng tối đa cho phép.',
  'Hiển thị thông báo vượt dung lượng cho phép; không tải lên.'),
 ('nhieu anh','Kiểm tra tải nhiều ảnh liên tiếp','1. Tải một ảnh.\n2. Tải tiếp ảnh thứ hai.',
  'Ảnh chọn sau cùng thay thế ảnh trước đó.'),
 ('go anh','Kiểm tra gỡ ảnh đã tải','1. Bấm biểu tượng gỡ ảnh.','Ảnh được xoá khỏi biểu mẫu, ô trở về trạng thái chưa có ảnh.'),
]
FILE=[
 ('mac dinh','Kiểm tra giá trị mặc định','1. Mở biểu mẫu, xem khối tệp đính kèm.','Mặc định chưa có tệp nào được đính kèm.'),
 ('bat buoc','Kiểm tra không phải là trường bắt buộc','1. Không đính kèm tệp nào.\n2. Bấm lưu.','Lưu thành công vì tệp đính kèm không bắt buộc.'),
 ('dinh dang hop le','Kiểm tra tải tệp có định dạng hợp lệ','1. Chọn tệp đúng định dạng hệ thống cho phép.','Tệp được tải lên và hiển thị trong danh sách đính kèm.'),
 ('khong hop le','Kiểm tra tải tệp có định dạng không hợp lệ','1. Chọn tệp có đuôi không nằm trong danh sách cho phép.',
  'Hiển thị thông báo nêu rõ định dạng không hợp lệ và các định dạng được phép.'),
 ('dinh dang gia','Kiểm tra tải tệp có định dạng giả','1. Đổi đuôi một tệp thực thi thành .pdf rồi tải lên.',
  'Hiển thị thông báo tệp không hợp lệ; không nhận tệp.'),
 ('dung luong','Kiểm tra tải tệp có dung lượng lớn hơn mức tối đa','1. Chọn tệp đúng định dạng nhưng vượt dung lượng tối đa.',
  'Hiển thị thông báo vượt dung lượng cho phép; không tải lên.'),
 ('nhieu file','Kiểm tra tải nhiều tệp','1. Tải lần lượt nhiều tệp.','Hiển thị đủ các tệp đã tải; tệp mới không xoá tệp cũ.'),
 ('tai xuong','Kiểm tra tải tệp đính kèm về máy','1. Bấm biểu tượng tải xuống ở một tệp.','Tệp được tải về đúng nội dung và đúng tên.'),
 ('xoa file','Kiểm tra xoá tệp đính kèm','1. Bấm biểu tượng xoá ở một tệp.','Tệp bị gỡ khỏi danh sách đính kèm.'),
]
BOOK={'EMAIL':EMAIL,'PHONE':PHONE,'DATE':DATE,'GENDER':GENDER,'IMG':IMG,'FILE':FILE}
# (file, khoá tên nhóm, bộ) — chỉ những nhóm là Ô NHẬP thật trên màn
JOBS=[
 ('NCC','Email liên hệ','EMAIL'), ('NCC','Textbox Email Admin NCC','EMAIL'),
 ('NCC','Textbox Email admin NCC','EMAIL'), ('NCC','Textbox Điện thoại liên hệ','PHONE'),
 ('NPP','Textbox Email','EMAIL'), ('NPP','Textbox Email tài khoản Admin','EMAIL'),
 ('NPP','Textbox Số điện thoại','PHONE'),
 ('Onboarding','Textbox Email Admin','EMAIL'),
 ('TaiKhoan','Textbox Email','EMAIL'), ('TaiKhoan','Textbox Email (sửa)','EMAIL'),
 ('TaiKhoan','Textbox Số điện thoại','PHONE'),
 ('TaiKhoan','Ô ngày Ngày sinh','DATE'), ('TaiKhoan','Ô ngày Ngày sinh (sửa từ danh sách)','DATE'),
 ('TaiKhoan','Ô ngày Ngày sinh khi sửa tại tab','DATE'),
 ('TaiKhoan','Selectbox Giới tính','GENDER'), ('TaiKhoan','Ảnh đại diện','IMG'),
 ('ThongTinLienHe','Textbox Email Liên hệ','EMAIL'), ('ThongTinLienHe','Textbox Email Hỗ trợ','EMAIL'),
 ('CaiDat','Ảnh đại diện','IMG'),
 ('DonHang','Hồ sơ đính kèm','FILE'), ('KeHoachTapHuan','Tài liệu đính kèm trong form','FILE'),
]
# Bảng công việc theo role — tên nhóm lấy từ chính bộ case (quét 2026-08-21).
JOBS_NCC = [
 ('BaoHanh','Upload ảnh','IMG'),
 ('BienSoanChuDe','Ảnh đại diện','IMG'), ('BienSoanChuDe','Upload file tài liệu','FILE'),
 ('CaiDat','Ảnh đại diện','IMG'),
 ('TaiKhoan','Textbox Email','EMAIL'), ('TaiKhoan','Textbox Số điện thoại','PHONE'),
 ('TaiKhoan','Ô ngày Ngày sinh','DATE'), ('TaiKhoan','Selectbox Giới tính','GENDER'),
]
JOBS = {'Admin': JOBS, 'NCC': JOBS_NCC}.get(ROLE, [])

TOT=0
by_file={}
for f,g,k in JOBS: by_file.setdefault(f,[]).append((g,k))
_BROKEN=[]
for f, jobs in sorted(by_file.items()):
    if ONLY and ONLY.lower() not in f.lower():
        continue
    p=DIR+roles.ROLES[ROLE]['strip']+'%s.xlsx'%f
    # Bảng JOBS là danh sách CỐ ĐỊNH quét từ bộ case 2026-08-21; màn nào đã đổi tên / chưa tồn tại
    # trong thư mục role thì `tcfix.load` ném lỗi và DỪNG cả đợt bơm. Bỏ qua + báo ở cuối.
    if not os.path.exists(p):
        _BROKEN.append((os.path.basename(p), 'không có file')); continue
    lock(p)
    try:
        tc=tcfix.load(p)
    except Exception as e:
        _BROKEN.append((os.path.basename(p), '%s: %s' % (type(e).__name__, e))); continue
    ins={}
    rows=[r for r in tc.order if r>=12]
    for gname, kind in jobs:
        for i,rn in enumerate(rows):
            if tc.lvl(rn) not in ('sub','sub2'): continue
            b=(tc.c(rn,'B') or '').split('\n')[0].strip()
            if not b.lower().startswith(gname.lower()[:26]): continue
            cases=[]; last=rn
            for r2 in rows[i+1:]:
                if tc.lvl(r2)=='case': cases.append(n(tc.c(r2,'B') or '')+' '+n(tc.c(r2,'C') or '')); last=r2
                else: break
            blob=' | '.join(cases)
            need=[(t,s,r) for key,t,s,r in BOOK[kind] if key not in blob]
            if need: ins.setdefault(last,[]).extend(need)
    if not ins: continue
    cnt=sum(len(v) for v in ins.values()); TOT+=cnt
    print('%-16s +%d case'%(f,cnt))
    if DRY: continue
    pl=tcfix.Plan(tc)
    for rn in tc.order:
        if rn<12: continue
        pl.keep(rn)
        for c in ins.get(rn,[]): pl.case(*c)
    tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets)==1)
print('=== TỔNG +%d case ==='%TOT)
if DRY:
    print('   (XEM TRƯỚC — thêm --apply để ghi)')
if _BROKEN:
    print('!!! %d file bỏ qua:' % len(_BROKEN))
    for _b,_w in _BROKEN: print('    - %-46s %s' % (_b[:46], _w))

# -*- coding: utf-8 -*-
"""Rà khối An toàn thông tin theo chuẩn mau.xlsx (chỉ đọc) — HAI phép, cộng nhau.

  [A] PHÂN QUYỀN & PHIÊN : theo ngữ cảnh CN (quyền · ngoài phạm vi · hết phiên · IDOR …)
  [B] INJECTION PER-FIELD: **mọi ô GÕ ĐƯỢC** trong khối Validate phải có DÒNG NHÓM riêng ở khối
      ATTT + đủ số case (CN Thêm/Sửa 5 · CN Tìm kiếm/Nhập Excel 4) — luật §7.1 + §7 của
      `../prompts/PROMPT-gen-testcase-v3.md`, chỉ thị 2026-09-04 *"ATTT phải kiểm cả các ô nhập"*.

⚠️ Ô đếm **CN LẠC LUẬT** thêm 2026-09-16: số CN có ô gõ được trong `Validate` mà KHÔNG luật
ATTT nào nhận ra tên CN (rơi vào rọ `Thao tác khác`). Trước đó phép [B] gặp `attt_kind_of_cn()
= None` thì `continue` trơn — mà `patch_attt_field` dùng CHUNG hàm đó nên nó cũng không bơm:
bơm và rà cùng mù một chỗ, khối ATTT của CN rỗng vĩnh viễn mà bộ rà vẫn in 0. Đo 2026-09-16:
CN **"TRA CỨU CƠ SỞ GIÁO DỤC"** mất trắng 4 case injection của ô tìm kiếm theo đúng đường đó.
Số 0 chỉ có nghĩa khi CHỨNG MINH được phép rà đã quét tới nơi — xem `qalib.la_cn_tim_kiem()`.

⚠️ Phép [B] thêm 2026-09-07 — trước đó KHÔNG bộ rà nào kiểm: bộ này chỉ rà [A], còn `audit_sua.py`
chỉ so CN Sửa với CN Thêm nên khi CẢ HAI cùng thiếu thì trượt cả. Ô nào cần ATTT do
`qalib.needs_attt()` quyết định — dùng CHUNG với `patch_attt_field.py` (script bơm), nên rà và bơm
không bao giờ lệch luật nhau.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, glob, os, unicodedata, qalib
def norm(s):
    s=(s or '').lower().replace('đ','d')
    return ''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn')

# bộ ATTT theo loại CN (rút từ mau; bản Admin: "NCC khác" -> "tổ chức/bản ghi không thuộc phạm vi")
LIST_ = [('chưa đăng nhập',['chua dang nhap','khong dang nhap','dang xuat']),
         ('yêu cầu quyền xem',['quyen xem','yeu cau quyen']),
         ('vai trò khác',['khac vai tro','vai tro khac','tai khoan khac']),
         ('ngoại lệ đúng quyền vẫn vào',['ngoai le','dung quyen van','van vao duoc']),
         ('phạm vi dữ liệu',['pham vi','chi thay','chi tra','co lap']),
         ('can thiệp tham số',['tham so','id ','dinh danh','truy cap cheo']),
         ('hết phiên',['het phien'])]
SEARCH= [('SQL injection',['sql injection','cau lenh truy van']),
         ('XSS phản chiếu',['xss','the script','the html']),
         ('phạm vi dữ liệu',['pham vi','chi trong','co lap']),
         ('hết phiên',['het phien'])]
ADD_  = [('yêu cầu quyền thêm',['quyen them','quyen tao','quyen khoi tao']),
         ('gán chủ sở hữu theo phiên',['theo phien','tu phien','gan dung']),
         ('chống XSS trường nhập',['xss','the script','the html','hexa']),
         ('hết phiên',['het phien'])]
UPD_  = [('yêu cầu quyền sửa',['quyen sua','quyen cap nhat']),
         ('không sửa được ngoài phạm vi',['ngoai pham vi','khong thuoc','khong sua duoc']),
         ('hết phiên',['het phien'])]
DET_  = [('yêu cầu đăng nhập',['dang nhap','quyen xem']),
         ('không xem được ngoài phạm vi',['ngoai pham vi','khong thuoc','khong xem duoc']),
         ('chống XSS hiển thị',['xss','the script','the html'])]
DEL_  = [('yêu cầu quyền xóa',['quyen xoa']),
         ('không xóa được ngoài phạm vi',['ngoai pham vi','khong thuoc','khong xoa duoc']),
         ('hết phiên',['het phien'])]
EXP_  = [('yêu cầu quyền xuất',['quyen xuat']),
         ('file đúng phạm vi',['pham vi','chi chua','dung du lieu','co lap']),
         ('hết phiên',['het phien'])]
IMP_  = [('chặn định dạng file lạ',['dinh dang','ngoai .xlsx','file thuc thi','.exe']),
         ('SQL injection cột dữ liệu',['sql injection','cau lenh truy van']),
         ('XSS thẻ HTML/Script',['the html','the script','xss']),
         ('hexa URL',['hexa dang url','hexa url']),
         ('hexa HTML',['hexa dang html','hexa html']),
         ('yêu cầu quyền nhập',['quyen nhap','quyen import']),
         ('hết phiên',['het phien'])]

ACT_  = [('yêu cầu quyền thao tác',['quyen ','khong du quyen']),
         ('không thao tác được ngoài phạm vi',['ngoai pham vi','khong thuoc','khong thao tac duoc','tham so','dinh danh','co lap']),
         ('hết phiên',['het phien'])]
def pick(cn):
    n=norm(cn)
    if n.startswith('an toan thong tin'): return None,None      # CN chuyên về ATTT, không tự đối chiếu
    if 'nhap excel' in n or 'import' in n: return 'Nhập Excel',IMP_
    if 'nhap excel' in n or 'import' in n: return 'Nhập Excel',IMP_
    # 'xuất bản' / 'xuất xứ' KHÔNG phải CN Xuất Excel — bẫy trùng từ khoá (luật §0.6).
    # Trước 2026-09-04 màn XUẤT XỨ bị xếp thành Xuất Excel ⇒ 7 CN báo oan 'thiếu quyền xuất'.
    if 'xuat' in n and not any(k in n for k in ('xuat ban', 'xuat xu')):
        # 2026-09-10 — CN Xuất excel KHÔNG còn khối ATTT (chỉ thị *"bỏ ATTT tại chức năng
        # Xuất excel"*). Trả None để bộ rà bỏ qua thay vì đòi 3 case `EXP_` mãi mãi. Giữ
        # `EXP_` lại để đọc hiểu lịch sử — xoá hẳn thì lần sau không ai biết đã từng có gì.
        return None,None
    if 'xoa' in n: return 'Xóa',DEL_
    if 'chi tiet' in n: return 'Xem chi tiết',DET_
    if 'cap nhat' in n or 'sua ' in n or 'chinh sua' in n or 'sua/' in n: return 'Cập nhật',UPD_
    if 'them' in n or 'tao ' in n or 'khoi tao' in n or 'khai bao' in n: return 'Thêm mới',ADD_
    if qalib.la_cn_tim_kiem(cn): return 'Tìm kiếm',SEARCH
    if any(k in n for k in ('danh sach','quan ly','tong quan','bang dieu khien','xem tab','man ')):
        return 'Danh sách',LIST_
    return 'Thao tác khác',ACT_        # đổi trạng thái, duyệt, gán... -> bộ rút gọn

import roles
ROLE = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
CFG = roles.get(ROLE)
D = CFG['dir']
SKIP = CFG['skip']
STRIP = CFG['strip']
tot=0; nocn=0; bykind={}; tot_pf=0; tot_lac=0
for p in sorted(glob.glob(D+'*.xlsx')):
    if os.path.basename(p) in SKIP: continue
    nm=os.path.basename(p).replace('Testcase-Role-Admin-','').replace('.xlsx','')
    try:
        tc=tcfix.load(p)
    except Exception as e:            # sheet TC không mang tiền tố BP- (2 file Teacher) —
        print('\n##### %s\n   ✘ KHÔNG ĐỌC ĐƯỢC: %s  (kết quả CHƯA phủ hết role)' % (nm, e))
        continue
    cn=None; on=False; cases=[]; miss=[]; seen=set()
    def flush():
        if cn is None: return
        k,spec=pick(cn)
        if not spec: return
        j=[norm(c) for c in cases]
        m=[l for l,kws in spec if not any(any(x in s for x in kws) for s in j)]
        if m: miss.append((k,cn,len(cases),m))
    for rn in tc.order:
        if rn<12: continue
        B,C=tc.c(rn,'B'),tc.c(rn,'C'); lv=tc.lvl(rn)
        if not C:
            if lv=='cn':
                if on: flush()
                cn=B.splitlines()[0]; on=False; cases=[]; seen.add(cn)
            elif lv=='grp':
                if on: flush(); cases=[]
                on = norm(B).startswith('an toan')
        elif on: cases.append(B)
    if on: flush()
    # ── [B] INJECTION PER-FIELD: mọi ô gõ được phải có dòng nhóm ATTT + đủ số case ──
    pf = []; lac = []
    try:
        bps = tcfix.load(p).bpsheets or [None]
    except Exception as e:                      # sheet không mang tiền tố BP- (2 file Teacher)
        print('   [PER-FIELD   ] ✘ KHÔNG ĐỌC ĐƯỢC %s: %s' % (nm, e)); bps = []
    for bp in bps:
        t2 = tcfix.load(p, bp) if bp else tc
        cur_cn = None; blk = None; inval = False
        fields = {}; agrp = {}; last_g = None
        for rn in t2.order:
            if rn < 12: continue
            lv = t2.lvl(rn); h = (t2.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'cn':
                cur_cn = h; blk = None; inval = False; last_g = None
                fields.setdefault(cur_cn, []); agrp.setdefault(cur_cn, {})
            elif lv == 'grp':
                blk = norm(h); inval = False; last_g = None
            elif lv in ('sub', 'sub2') and blk and 'giao dien' in blk:
                if 'validate' in norm(h): inval = True; continue
                if lv == 'sub': inval = False
                if inval and qalib.needs_attt(h) and h not in fields[cur_cn]:
                    fields[cur_cn].append(h)
            elif lv in ('sub', 'sub2') and blk and 'an toan thong tin' in blk:
                last_g = norm(qalib.attt_field_label(h)); agrp[cur_cn][last_g] = 0
            elif lv == 'case' and blk and 'an toan thong tin' in blk and last_g is not None:
                agrp[cur_cn][last_g] += 1
        for c, fs in fields.items():
            if not fs: continue
            kind, want = qalib.attt_kind_of_cn(c)
            if not kind:
                # `attt_kind_of_cn` chỉ biết 4 loại CN CÓ khối injection per-field. Trả None
                # có HAI nghĩa hoàn toàn khác nhau, tách ra mới dùng được:
                #   · loại CN ĐÃ BIẾT mà theo thiết kế không có khối đó (`Danh sách`,
                #     `Xem chi tiết`, `Xóa`) hoặc được MIỄN có chủ đích (`Xuất excel`,
                #     CN chuyên về ATTT -> `pick()` trả None)  -> ĐÚNG, im lặng;
                #   · rơi vào rọ `Thao tác khác` của `pick()` — tức KHÔNG luật nào nhận ra
                #     tên CN này                                -> LẠC LUẬT, phải kêu.
                # Không tách thì ô đếm này báo 14 trên bộ ChuyenVien mà 12 là ô `Số bản ghi
                # /trang` của CN Danh sách — một con số luôn đỏ là con số người ta học cách
                # bỏ qua, tức là mất luôn tác dụng của chính phép rà này.
                if pick(c)[0] != 'Thao tác khác': continue
                # Ô ĐẾM CHỐNG IM LẶNG (2026-09-16). `attt_kind_of_cn` trả None nghĩa là bộ rà
                # KHÔNG BIẾT CN này thuộc loại nào — mà `patch_attt_field.spec_of_cn()` cũng
                # dùng chung hàm đó nên nó cũng không bơm gì. Trước đây chỗ này `continue`
                # trơn: bơm và rà cùng mù, khối ATTT của CN rỗng vĩnh viễn mà bộ rà vẫn in 0.
                # Đúng lớp lỗi đã trả giá ở khối `Validate` (ô thứ 7 `Nhóm không rõ loại`):
                # số 0 chỉ có nghĩa khi CHỨNG MINH được phép rà đã quét tới nơi.
                # Đây KHÔNG phải case thiếu — là CN chưa có luật, phải khai thêm từ khoá ở
                # `qalib.CN_TIM_KIEM` / `attt_kind_of_cn` rồi chạy lại.
                lac.append((c, len(fs))); continue
            for f in fs:
                lab = norm(qalib.attt_field_label(f))
                if lab not in agrp[c]:
                    pf.append((c, f, kind, 'THIẾU dòng nhóm ATTT'))
                elif agrp[c][lab] < want:
                    # định mức §5 là SÀN: nhiều hơn chuẩn là ĐẠT (dự án thêm mục riêng),
                    # chỉ ÍT hơn mới là thiếu. Bản đầu 2026-09-07 dùng `!=` nên báo oan 8 nhóm.
                    pf.append((c, f, kind, 'chỉ %d/%d case' % (agrp[c][lab], want)))
    if miss or pf or lac:
        print(f"\n##### {nm}")
    for k,c,n,m in miss:
        print(f"   [{k:13}] {c[:44]:46} ({n:>2} case) thiếu: {', '.join(m)}")
        tot+=len(m); bykind[k]=bykind.get(k,0)+len(m)
    for c, f, kind, why in pf:
        print(f"   [PER-FIELD   ] {c[:30]:32} {f[:28]:30} [{kind}] {why}")
        tot_pf += 1
    for c, nf in lac:
        print(f"   [CN LẠC LUẬT ] {c[:44]:46} có {nf} ô gõ được mà KHÔNG luật ATTT nào nhận ra CN")
        tot_lac += 1
print(f"\n=== TỔNG CASE ATTT CÒN THIẾU: {tot} · Ô NHẬP THIẾU/SAI KHỐI INJECTION: {tot_pf} · CN LẠC LUẬT: {tot_lac} ===")
for k,v in sorted(bykind.items(),key=lambda x:-x[1]): print(f"   {k:15} {v}")

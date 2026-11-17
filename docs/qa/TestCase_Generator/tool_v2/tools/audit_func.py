# -*- coding: utf-8 -*-
"""Rà độ đầy đủ các nhóm CHỨC NĂNG so với checklist mau.xlsx (chỉ đọc, không ghi)."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, glob, os, unicodedata
import qalib

def norm(s):
    s=(s or '').lower().replace('đ','d')
    return ''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn')

# ⚠️ Mục 'thống kê khớp DB' ĐÃ GỠ 2026-09-09 (chỉ thị người đặt việc: "bỏ case dư thừa").
# Vì sao dư: (a) việc ĐẾM đã có mục *số lượng bản ghi* của nhóm `Danh sách …` ở khối **Validate**
# (mẫu r26: đếm bản ghi hiển thị rồi đối chiếu tổng số bản ghi trên màn); (b) việc ĐỐI CHIẾU DB
# đã có mục 2 ngay dưới đây (`dữ liệu khớp DB` so cả số dòng lẫn từng cột). Màn CÓ thẻ số liệu
# (KPI) thì thẻ là CONTROL -> khai nhóm riêng ở khối Validate, không nhét vào khối Chức năng.
# prompt v3 §6 vốn chỉ đòi **1** case cho `Chức năng` (CN Danh sách) — bộ rà đang đòi 3 là cao
# hơn luật.
# ⚠️ 2026-09-10 — BỎ mục `tải danh sách mặc định` (chỉ thị *"Bỏ case Tải danh sách mặc định"*).
# Bộ RÀ và bộ BƠM (`complete_func.FUNC`) phải bỏ CÙNG MỘT LÚC: bỏ mỗi một bên thì hoặc rà đòi
# mãi một case không ai bơm, hoặc bơm ra một case không ai rà — cả hai đều đã xảy ra trước đây.
DS   = [('dữ liệu khớp DB',['khop db','khop du lieu','dung database','khop he thong'])]
# ⚠️ 2026-09-16 — mục *số liệu thẻ KPI khớp DB* QUAY LẠI (chỉ thị người đặt việc: *"bổ sung
# thêm case db cho các thẻ KPI tại phần chức năng"*), nhưng CÓ ĐIỀU KIỆN: chỉ đòi khi CN đó
# THẬT khai nhóm control thẻ KPI — xem `DS_KPI` và chỗ dùng trong `flush()`. Đòi vô điều
# kiện chính là lý do mục cũ bị gỡ ngày 09/09 (màn không KPI thì đó là case chết).
# Lớp BƠM là `complete_func.ds_kpi_db`; cả hai hỏi chung `qalib.nhan_the_kpi` để không lệch nhau.
DS_KPI = ('số liệu thẻ KPI khớp DB', ['the kpi','so lieu thong ke','the thong ke','the so lieu'])
# Tìm kiếm chung = ĐÚNG 4 mục như mẫu (bổ sung 2 mục cuối ngày 2026-09-04; trước đó bộ rà
# chỉ đòi 2 mục nên 34/43 nhóm thiếu case mà vẫn báo sạch).
TKC  = [('tìm theo giá trị mặc định',['gia tri mac dinh','gia tri mac dinh']),
        ('tìm không ra kết quả',['khong ra ket qua','khong co ket qua','khong tim thay']),
        ('kết hợp tất cả điều kiện',['ket hop tat ca','ket hop moi dieu kien','tat ca cac dieu kien',
                                     'ket hop tat ca cac tieu chi']),
        ('2 điều kiện khác nhau cùng số bản ghi',['2 dieu kien khac nhau','hai dieu kien khac nhau',
                                                  'cung so ban ghi','so ban ghi ket qua giong nhau'])]
# ⚠️ 2026-09-09 (lượt 2): tiêu đề case tổ hợp nay là tên CHUNG `Kiểm tra tìm kiếm kết hợp N tiêu
# chí` (chỉ thị người đặt việc: *"còn cụ thể tiêu chí nào kết hợp thì do tester sẽ điền"*), nên
# câu đối chiếu DB chuyển xuống **cột C**. Nhóm này vì thế được soi trên **B + C** — xem `flush()`.
# Bỏ mục 2 đi thì mất hẳn phép kiểm "có đối chiếu DB không"; soi B+C giữ được phép kiểm mà không
# buộc tiêu đề phải mang chữ đó.
TKK  = [('kết hợp nhiều trường',['ket hop']),
        # 'voi db' / 'doi chieu' THÊM 2026-09-09 (lượt 2): khi mục này nằm ở cột C thì lối viết
        # chuẩn của các bank là *"Đối chiếu kết quả với DB theo cùng điều kiện đang lọc"* — không
        # có chữ "khớp". Thiếu khoá này thì bộ rà báo thiếu oan đúng cái case vừa sinh.
        ('kết quả kết hợp khớp DB',['khop db','khop du lieu','khop he thong',
                                    'voi db','doi chieu ket qua'])]
THEM = [('lưu OK (tối đa độ dài)',['thanh cong khi nhap day du','toi da do dai','day du cac truong']),
        ('lưu đúng database',['dung vao database','dung database','khop db','luu dung']),
        ('chỉ trường bắt buộc',['chi nhap cac truong bat buoc','chi cac truong bat buoc','chi nhap truong bat buoc']),
        ('không nhập bắt buộc',['khong nhap cac truong bat buoc','bo trong truong bat buoc','thieu truong bat buoc']),
        ('click liên tục',['lien tuc']),
        ('Tab + Enter',['tab + enter','tab va enter']),
        ('trùng từ 2 client',['2 client','hai client','dong thoi'])]
CAPN = [('cập nhật OK (tối đa độ dài)',['thanh cong khi sua','toi da do dai','sua hop le']),
        ('lưu đúng database',['dung vao database','dung database','khop db','luu dung']),
        ('chỉ sửa trường bắt buộc',['chi sua cac truong bat buoc','chi cac truong bat buoc','chi nhap truong bat buoc']),
        ('không nhập bắt buộc',['khong nhap cac truong bat buoc','bo trong truong bat buoc','thieu truong bat buoc']),
        ('click liên tục',['lien tuc']),
        ('Tab + Enter',['tab + enter','tab va enter']),
        ('trùng từ 2 client',['2 client','hai client','dong thoi'])]
CTIET= [('xem & đóng chi tiết',['xem','mo ']),
        ('chi tiết khớp DB',['khop db','khop du lieu','khop he thong','dung database'])]
# CN XÓA — 8 mục của mẫu (r451–r458) + 2 mục riêng của dự án (bổ sung 2026-09-04; trước đó bộ rà
# chỉ đòi 4 mục nên thiếu hẳn: hủy bỏ · đóng popup · chọn nhiều bản ghi · click liên tục ·
# Tab+Enter · 2 client).
XOA  = [('hủy bỏ thao tác xóa',['huy bo thao tac xoa','huy bo xoa','huy xoa','huy bo']),
        ('click icon đóng trên màn hình xóa',['icon dong','dong popup','dong hop thoai','icon x']),
        ('xóa thành công',['xoa mem','xoa thanh cong','xoa vinh vien','xoa 1','xoa mot']),
        # 'chọn nhiều bản ghi để xóa' KHÔNG nằm trong checklist bắt buộc (chỉ thị 2026-09-04):
        # chỉ viết case này khi màn THẬT có tích chọn dòng + xoá hàng loạt (luật §0.4.1 — không
        # viết case cho control không tồn tại). `patch_xoa_fn.py` tự dò trước khi bơm.
        ('khớp DB sau xóa',['khop db','khop du lieu','dung database','trong database']),
        ('click liên tục vào button Xóa',['lien tuc']),
        ('Tab + Enter liên tục',['tab + enter','tab va enter','tab vao button','enter lien tuc']),
        ('xóa trùng từ 2 tab / 2 client',['2 client','hai client','2 tab','dong thoi']),
        ('chặn xóa khi đang dùng',['chan xoa','dang dung','dang su dung','rang buoc','lien quan']),
        ('xóa bản ghi không tồn tại',['khong ton tai','da bi xoa','da xoa'])]
XUAT = [('dữ liệu xuất khớp hệ thống',['khop he thong','khop man hinh','khop danh sach']),
        # 'trong db' thêm 2026-09-08: NGUYÊN VĂN MẪU r589 là "khớp với dữ liệu trong DB" —
        # chữ "với" chen vào giữa nên cả 'khop db' lẫn 'khop du lieu' đều trượt, tức file
        # viết ĐÚNG MẪU vẫn bị báo thiếu.
        ('khớp DB',['khop db','khop du lieu','dung database','trong db']),
        ('xuất theo bộ lọc hiện tại',['bo loc','dieu kien loc','theo loc']),
        ('chặn xuất khi rỗng',['rong','khong co du lieu','khong co ban ghi']),
        ('xuất dữ liệu lớn',['du lieu lon','nhieu ban ghi']),
        ('giới hạn tần suất xuất',['tan suat','gioi han xuat','lien tiep']),
        ('click liên tục',['lien tuc'])]
NHAP = [('import thành công',['thanh cong']),
        ('dữ liệu sau import',['sau khi import','sau import','du lieu sau']),
        ('lưu đúng database',['dung database','khop db','dung vao database']),
        ('nhấn liên tục',['lien tuc']),
        ('Tab + Enter',['tab + enter','tab va enter']),
        ('import thất bại (thiếu bắt buộc)',['that bai','bo trong','thieu truong']),
        ('>=2 bản ghi trùng trong file',['trung']),
        ('>=2 bản ghi lỗi',['ban ghi bi loi','ban ghi loi','nhieu dong loi']),
        ('import nhiều bản ghi',['nhieu ban ghi','so luong']),
        ('file vượt ngưỡng (chạy nền)',['chay nen','> 200','vuot nguong','file lon'])]
HUY  = [('hủy bỏ thao tác',['huy','dong hop thoai','dong bieu mau'])]

def pick(g):
    n=norm(g)
    if not n.startswith('chuc nang'): return None,None
    if 'danh sach'   in n: return 'Danh sách',DS
    if 'tim kiem chung' in n: return 'Tìm kiếm chung',TKC
    if 'tim kiem ket hop' in n: return 'Tìm kiếm kết hợp',TKK
    if 'tim kiem don le' in n: return None,None
    if any(k in n for k in ('them moi','tao moi','them ','khoi tao')): return 'Thêm mới',THEM
    # 'chinh sua' THÊM 2026-09-12: tên nhóm chuẩn của mẫu là `Chức năng Chỉnh sửa`, mà bản
    # cũ chỉ bắt 'cap nhat' / 'chuc nang sua' ⇒ khối Chức năng của MỌI CN Sửa chưa từng
    # được rà thiếu mục (phép đếm nhóm lạ ở cuối file lộ ra).
    if 'cap nhat' in n or 'chinh sua' in n or n.startswith('chuc nang sua'): return 'Cập nhật',CAPN
    if 'chi tiet' in n: return 'Xem chi tiết',CTIET
    if 'xoa' in n:  return 'Xóa',XOA
    # 'xuất bản' (publish) KHÔNG phải CN Xuất Excel — cùng luật với audit_validate_quota
    if 'xuat' in n and not any(k in n for k in ('xuat ban','xuat xu')): return 'Xuất Excel',XUAT
    if 'nhap excel' in n or 'import' in n: return 'Nhập Excel',NHAP
    if 'huy' in n:  return 'Hủy bỏ',HUY
    return None,None

import roles
ROLE = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
CFG = roles.get(ROLE)
D = CFG['dir']
SKIP = CFG['skip']
STRIP = CFG['strip']
tot=0; bykind={}
_LA = []       # (file, tên nhóm, số case) — nhóm `Chức năng …` không tra được bộ mục nào
_BROKEN = []   # (tên file, lý do) — file không đọc được; in ở cuối để không báo cáo THIẾU
               # SAI cho phần chưa rà được (điểm mù 4 của ../README.md).

for p in sorted(glob.glob(D+'*.xlsx')):
    if os.path.basename(p) in SKIP: continue
    nm=os.path.basename(p).replace('Testcase-Role-Admin-','').replace('.xlsx','')
    # Bọc `tcfix.load`: sheet TC thiếu tiền tố `BP` (vd `Teacher-LichTapHuan`) làm `load()` ném
    # KeyError và TRƯỚC 2026-09-08 nó dừng CẢ đợt rà -> bộ rà in `0` cho phần chưa chạy tới.
    # ⚠️ Vá 2026-09-10: rà MỌI sheet BP của file, không chỉ sheet đầu. Bản trước gọi
    # `tcfix.load(p)` trơn nên với file HAI SHEET (màn có 2 thẻ, vd `BaoCaoDong`) toàn bộ khối
    # `Chức năng` của sheet thứ hai KHÔNG được rà mà bộ rà vẫn in `0` — đúng lớp lỗi im lặng
    # mà `qalib.iter_role_files` đã bịt cho các bộ rà khác từ trước.
    try:
        _first = tcfix.load(p)
        _bps = _first.bpsheets or [None]
    except Exception as e:
        _BROKEN.append((os.path.basename(p), '%s: %s' % (type(e).__name__, e))); continue
    for _i, _bp in enumerate(_bps):
      try:
        tc = _first if _i == 0 else tcfix.load(p, bp=_bp)
      except Exception as e:
        _BROKEN.append(('%s [%s]' % (os.path.basename(p), _bp),
                        '%s: %s' % (type(e).__name__, e))); continue
      nm_sheet = nm if len(_bps) < 2 else '%s [%s]' % (nm, _bp)
      ingrp=False; cur=None; cases=[]; miss=[]
      # Nhãn thẻ KPI của CN đang duyệt — khối `Validate` (nơi khai nhóm thẻ) luôn đứng TRƯỚC
      # khối `Chức năng` trong cùng một CN nên tới lúc flush là đã gom đủ.
      cn_kpi=[]
      def flush(cur=None, cases=None, miss=None, kpi=None):
        if not cur: return
        k,spec=pick(cur)
        if spec is DS and kpi:
            spec = DS + [DS_KPI]        # CN danh sách CÓ thẻ KPI -> đòi thêm mục đối soát thẻ
        if not spec:
            # Nhóm `Chức năng …` mà `pick()` không tra ra bộ mục nào: KHÔNG patcher nào bơm và
            # bộ rà này cũng không đòi -> nhóm rỗng vĩnh viễn. Trước 2026-09-12 chỗ này `return`
            # lặng lẽ; đo trên đường sinh mới: khai `"Chức năng Tìm kiếm"` (thiếu chữ "chung")
            # mất đúng 4 case của mẫu mà bộ rà vẫn in 0.
            if qalib.cn_khong_tra_duoc_bo_muc(cur):
                _LA.append((nm_sheet, cur, len(cases or [])))
            return
        # Mặc định soi TIÊU ĐỀ (cột B). Riêng nhóm `Tìm kiếm kết hợp` soi **B + C** vì mục
        # *khớp DB* của nó nằm ở cột C từ 2026-09-09 (xem ghi chú ở `TKK`).
        j=[norm(b) for b, _c in cases]
        if spec is TKK:
            j=[norm(b + ' ' + c) for b, c in cases]
        m=[l for l,kws in spec if not any(any(x in s for x in kws) for s in j)]
        if m: miss.append((k,cur,len(cases),m))
      for rn in tc.order:
        if rn<12: continue
        B,C=tc.c(rn,'B'),tc.c(rn,'C'); lv=tc.lvl(rn)
        if not C:
            _k=qalib.nhan_the_kpi(B)
            if _k and _k not in cn_kpi: cn_kpi.append(_k)
            if lv!='sub2': flush(cur, cases, miss, cn_kpi)
            keep=cases; cases=[] if lv!='sub2' else cases
            if lv=='grp': ingrp=norm(B).startswith('chuc nang'); cur=None
            # dọn `cn_kpi` SAU flush: nhóm cuối của CN trước còn cần thẻ của chính CN đó
            elif lv=='cn': ingrp=False; cur=None; cn_kpi=[]
            elif lv=='sub': cur=B if ingrp else None
            elif lv=='sub2': cases=keep; continue
        else:
            cases.append((B, C or ''))
      flush(cur, cases, miss, cn_kpi)
      if miss:
        print(f"\n##### {nm_sheet}")
        for k,g,n,m in miss:
            print(f"   [{k:16}] {g[:44]:46} ({n:>2} case) thiếu: {', '.join(m)}")
            tot+=len(m); bykind[k]=bykind.get(k,0)+len(m)
# Nhóm lạ mà ĐÃ CÓ case là chức năng riêng của dự án, người soạn tự viết — chỉ in để biết.
# Nhóm lạ RỖNG mới là lỗ hổng: không patcher nào bơm, không bộ rà nào đòi.
_LA_RONG = [t for t in _LA if not t[2]]
_LA_TAY = [t for t in _LA if t[2]]
if _LA_RONG:
    print("\n!! %d nhóm `Chức năng …` RỖNG và KHÔNG tra được bộ mục của mẫu — không patcher nào "
          "bơm, cũng không bộ rà nào đòi. Đổi về tên chuẩn (xem qalib.TEN_NHOM_CN_CHUAN) hoặc "
          "viết case tay:" % len(_LA_RONG))
    for _f, _g, _n in _LA_RONG:
        print("   %-28s %-44s (0 case)" % (_f[:28], _g[:44]))
if _LA_TAY:
    print("\n   (%d nhóm chức năng riêng của dự án, đã có case viết tay — không tính lỗi: %s)"
          % (len(_LA_TAY), ' · '.join('%s %d case' % (g[:30], n) for _f, g, n in _LA_TAY)))
print(f"\n=== TỔNG CASE CHỨC NĂNG CÒN THIẾU: {tot} · nhóm chức năng lạ RỖNG: {len(_LA_RONG)} ===")
if _BROKEN:
    print('!!! %d file KHÔNG rà được (kết quả trên CHƯA phủ hết role):' % len(_BROKEN))
    for _b, _w in _BROKEN:
        print('    - %-52s %s' % (_b[:52], _w))

for k,v in sorted(bykind.items(),key=lambda x:-x[1]): print(f"   {k:18} {v}")

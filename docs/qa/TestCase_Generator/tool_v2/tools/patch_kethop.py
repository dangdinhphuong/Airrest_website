# -*- coding: utf-8 -*-
"""Bổ sung nhóm `Chức năng Tìm kiếm kết hợp` cho mọi CN Tìm kiếm có >= 2 tiêu chí.

ĐỊNH MỨC (chỉ thị người đặt việc 2026-09-09): **n tiêu chí ⇒ n−1 case tổ hợp** — mỗi cỡ k
ĐÚNG MỘT case, cộng 1 case *bỏ dần từng tiêu chí* ⇒ tổng **n** case, để THẲNG dưới nhóm cha
(không có cấp nhóm con).

TIÊU ĐỀ (chỉ thị 2026-09-09, lượt 2): ghi tên **CHUNG theo SỐ tiêu chí**, KHÔNG nêu tiêu chí nào —
`Kiểm tra tìm kiếm kết hợp 2 tiêu chí` · `… 3 tiêu chí` · … *"còn cụ thể tiêu chí nào kết hợp thì
do tester sẽ điền"*. Bản trước ghi thẳng tên tiêu chí vào tiêu đề (`Kết hợp: Bảng đích + Đơn vị`)
⇒ khoá cứng vào một tổ hợp cụ thể trong khi mọi tổ hợp cùng cỡ đều kiểm cùng một việc.
Bản trước nữa liệt kê đủ `2^n − n − 1` tổ hợp (n=5 -> 26 case) và tách nhóm con từ k>=3."""
import sys, os, re, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, qalib
# BẮT BUỘC truyền role — bản cũ hardcode Admin (cùng lỗi với patch_dict, xem đợt 21/08).
_args = [a for a in sys.argv[1:] if not a.startswith('--')]
ROLE = _args[0] if _args else None
if ROLE not in roles.ROLES:
    raise SystemExit('Dùng: python3 patch_kethop.py <%s> [--dry]' % '|'.join(roles.ROLES))
DIR = roles.ROLES[ROLE]['dir']
_SKIPF = set(roles.ROLES[ROLE]['skip'])
DRY='--dry' in sys.argv
# Lọc TÊN MÀN — thêm 2026-09-09. Trước đó script chỉ nhận `--role` nên LUÔN chạy cho CẢ role:
# lần chạy 09/09 (sinh màn `Danh mục trình độ ngoại ngữ`) `patch_timkiem_donle` định sửa lây
# `TrinhDoDaoTao` (+1 case) — đúng lớp sự cố "sửa lây file ngoài phạm vi" mà 3 script `complete_*`
# đã vá 08/09. Cùng lối đặt tham số với `patch_cn_trangthai.py` / `audit_*`.
ONLY = None
for _a in sys.argv[1:]:
    if not _a.startswith('--') and _a != ROLE:
        ONLY = _a
# `--create`: DỰNG khối `Chức năng Tìm kiếm kết hợp` khi CN có >= 2 bộ lọc mà thiếu hẳn nó.
# Không có cờ này thì script chỉ bơm vào khối ĐÃ CÓ (nó lấy mốc chèn = case cuối của khối đó),
# nên màn chưa từng có khối kết hợp thì ra `+0` và không ai biết — đúng ca `QuanTri/ChucVu`.
CREATE='--create' in sys.argv
# 'datepicker' THÊM 2026-09-09 — cùng lỗ với `patch_timkiem_donle.PREFIX`: `qalib.QUOTA` gọi loại
# control này là `Datepicker` nên tên nhóm là `Datepicker <Nhãn UI>`, thiếu ở đây thì tên tổ hợp
# in ra "Kết hợp: Bảng đích + Datepicker Từ ngày" (lẫn tên loại control vào tên tiêu chí).
PREFIX=re.compile(r'^(textbox số|textbox|textarea|selectbox|combobox|checkbox|datepicker|bộ lọc|tab|ô ngày|ô chọn|ô|multiselect|cụm nút|nút chọn)\s*', re.I)
def short(s):
    s=PREFIX.sub('', s.split('\n')[0].strip())
    s=re.sub(r'\s*\(.*?\)\s*$','',s).strip()
    return s or 'tiêu chí'
def lock(p):
    l=os.path.join(os.path.dirname(p),'.~lock.%s#'%os.path.basename(p))
    if os.path.exists(l): raise SystemExit('DỪNG: đang mở '+l)

# Câu đối chiếu DB cho case tổ hợp đầy đủ. Tên bảng lấy từ `table` của hồ sơ dự án; chưa khai
# (hoặc `verify_all`) thì để chỗ giữ + gắn cờ [CẦN VERIFY] — cùng lối `complete_func.Ctx`.
_TB = roles.ROLES[ROLE].get('table') or {}
_VERIFY = ('✿✿ [CẦN VERIFY] Tên bảng/cột trong câu truy vấn đối chiếu cần xác nhận với dev '
           'trước khi thực thi.')

TOT=0; TOTF=0
# ⚠️ Vá 2026-09-10: dựng danh sách đích theo TỪNG SHEET BP, không theo từng FILE. Bản trước
# gọi `tcfix.load(p)` trơn nên với file HAI SHEET (màn có 2 thẻ, vd `BaoCaoDong`) khối
# `Chức năng Tìm kiếm kết hợp` chỉ được dựng ở sheet ĐẦU; chạy lại lần hai ra `+0` vì sheet
# đầu đã có, còn sheet thứ hai thì THIẾU HẲN khối — chỉ `audit_timkiem` phát hiện.
_TARGETS=[]
for _p0 in sorted(glob.glob(DIR+'*.xlsx')):
    try: _bps0 = tcfix.load(_p0).bpsheets or [None]
    except Exception: _bps0 = [None]
    _TARGETS += [(_p0, _b0) for _b0 in _bps0]
for p, _BP in _TARGETS:
    if os.path.basename(p) in _SKIPF: continue      # file mẫu (có thể đang mở trong LibreOffice)
    # Cắt cứng 20 ký tự chỉ đúng với tiền tố `Testcase-Role-Admin-`; role khác (QuanTri: 22)
    # ra tên rác kiểu "i-ChucVu". Dùng `strip` của hồ sơ dự án như các script khác.
    nm=os.path.basename(p).replace(roles.ROLES[ROLE]['strip'],'').replace('.xlsx','')
    if ONLY and ONLY.lower() not in nm.lower():
        continue
    if nm=='GoiSTEM': continue
    _t = _TB.get(nm)
    SQL = ('select * from %s\nwhere "deleted_at" is null\n'
           '    and /* các điều kiện đang lọc trên màn */ true;'
           % (_t or '<bảng dữ liệu của màn>'))
    NOTE = None if (_t and not roles.ROLES[ROLE].get('verify_all')) else _VERIFY
    lock(p); tc=tcfix.load(p, _BP) if _BP else tcfix.load(p)
    if len(tc.bpsheets or []) > 1: nm = '%s [%s]' % (nm, tc.bpname)
    rows=[r for r in tc.order if r>=12]
    # tìm CN có nhóm "Chức năng Tìm kiếm đơn lẻ" -> lấy tiêu chí; mốc chèn = case cuối của
    # nhóm "Chức năng Tìm kiếm kết hợp tất cả các trường"
    jobs=[]; cn=None; insingle=False; crit=[]; anchor=None; have=set(); fn_last=None; grp=None
    for i,rn in enumerate(rows):
        lv=tc.lvl(rn); b=(tc.c(rn,'B') or '').split('\n')[0].strip()
        if lv=='cn':
            if crit and (anchor or (CREATE and fn_last)):
                jobs.append((cn,crit,anchor or fn_last,have,anchor is None))
            cn=b; crit=[]; anchor=None; insingle=False; have=set(); fn_last=None; grp=None
        elif lv=='grp':
            grp=b.lower()
        elif lv=='sub':
            insingle = 'tìm kiếm đơn lẻ' in b.lower()
            if 'kết hợp' in b.lower():
                if b.lower().startswith('kết hợp'): have.add(b.lower())
                else:
                    anchor=rn
                    for r2 in rows[i+1:]:
                        if tc.lvl(r2)=='case': anchor=r2
                        else: break
        elif lv=='case':
            # màn 2 tiêu chí: case tổ hợp nằm THẲNG dưới nhóm cha -> nhận diện qua tiêu đề
            # `Kết hợp:` để lần chạy thứ hai không bơm trùng (không có dòng nhóm để dò).
            # Dò trùng theo CẢ HAI lối đặt tiêu đề: bản mới `Kiểm tra tìm kiếm kết hợp N tiêu
            # chí` và bản cũ `Kết hợp: <A> + <B>` (bộ case sinh trước 09/09 lượt 2).
            _n = qalib.norm(b)
            if _n.startswith('ket hop:') or 'tim kiem ket hop' in _n and 'tieu chi' in _n:
                have.add('~phang')
        elif lv=='sub2':
            if insingle: crit.append(b)
            # Nhóm "Kết hợp N thông tin" nằm ở cấp **sub2** (đúng mẫu). Bản trước chỉ dò `have`
            # ở cấp `sub` nên sau khi đổi cấp thì lần chạy thứ hai lại bơm tiếp -> đẻ nhóm trùng.
            elif b.lower().startswith('kết hợp'): have.add(b.lower())
        if grp and 'chức năng' in grp: fn_last=rn      # mốc dự phòng cho --create
    if crit and (anchor or (CREATE and fn_last)):
        jobs.append((cn,crit,anchor or fn_last,have,anchor is None))

    ins={}
    for cn_, crit, anchor, have, phai_dung in jobs:
        names=[short(c) for c in crit]
        N=len(names)
        if N < 2: continue
        # §6 — CHỈ THỊ NGƯỜI ĐẶT VIỆC 2026-09-09: **n tiêu chí ⇒ ĐÚNG n−1 case tổ hợp**
        # (*"case1: Kết hợp 2 tiêu chí, case2: kết hợp 3 tiêu chí, …"*), mỗi cỡ k **một** case
        # LŨY TIẾN (case cỡ k lấy k tiêu chí ĐẦU theo thứ tự thật trên thanh lọc), nằm THẲNG
        # dưới nhóm cha — **bỏ hẳn cấp nhóm con** `Kết hợp N tiêu chí`.
        #
        # Bản trước liệt kê ĐỦ tổ hợp `2^N − N − 1` (N=5 -> 26 case) và tách nhóm con từ k>=3.
        # Đo 2026-09-09 trên `moetdl/DuLieuLoi` (5 bộ lọc): 27 case tổ hợp cho một nhóm, trong
        # đó 22 case chỉ khác nhau ở việc CHỌN tiêu chí nào — cùng một việc "áp đồng thời k
        # tiêu chí rồi đối chiếu", không thêm rủi ro nào. Nay còn 4 + 1 = 5 case.
        # Dò trùng: '~phang' = đã có case `Kết hợp:` nằm phẳng · tên nhóm con `kết hợp N
        # tiêu chí` = bộ case sinh bằng bản CŨ (2^n−n−1). Cả hai đều KHÔNG bơm lại.
        if '~phang' in have or any(h.startswith('kết hợp') for h in have): continue
        cases=[]
        for k in range(2, N+1):
            # Tiêu đề CHUNG theo SỐ tiêu chí; tiêu chí cụ thể do tester chọn và ghi lại khi chạy.
            # Danh sách tiêu chí của màn để ở cột C (dạng liệt kê để chọn), KHÔNG ở tiêu đề.
            td = 'Kiểm tra tìm kiếm kết hợp %d tiêu chí' % k
            ds = ' · '.join(names)
            if k==N:
                # Case cỡ ĐỦ n gánh luôn mục "kết quả kết hợp khớp dữ liệu trong hệ thống"
                # (`audit_func` TKK mục 2) — mục đó nay nằm ở cột C nên `audit_func` soi B+C
                # cho nhóm này; trước 09/09 nó là case RIÊNG (`complete_func.tkk_db`), trùng
                # nội dung với chính case này.
                cases.append((td,
                    '1. Nhập/chọn đồng thời ĐỦ %d tiêu chí của màn: %s.\n'
                    '2. Đối chiếu kết quả với DB theo cùng điều kiện đang lọc:\n%s\n'
                    '3. Ghi rõ giá trị đã dùng cho từng tiêu chí vào cột kết quả thực tế.'
                    % (N, ds, SQL),
                    '1. Danh sách chỉ còn bản ghi thoả mãn ĐỒNG THỜI cả %d tiêu chí\n'
                    '2. Kết quả khớp với dữ liệu đang lưu trong hệ thống, không thừa không thiếu'
                    % k, NOTE))
                continue
            cases.append((td,
                          '1. Chọn %d tiêu chí bất kỳ trong các tiêu chí của màn: %s.\n'
                          '2. Nhập/chọn giá trị khớp bản ghi đang có cho cả %d tiêu chí đã chọn, '
                          'các tiêu chí còn lại để mặc định.\n'
                          '3. Quan sát kết quả lọc và ghi rõ %d tiêu chí đã dùng vào cột kết quả '
                          'thực tế.' % (k, ds, k, k),
                          'Danh sách chỉ còn bản ghi thoả mãn ĐỒNG THỜI cả %d tiêu chí; số lượng '
                          'thu hẹp dần khi thêm tiêu chí.' % k))
        # Case "đặt lại phân trang khi đổi bộ lọc" ĐÃ GỠ 2026-09-08: LUẬT 10 cấm đích danh
        # (*"đổi bộ lọc thì về trang 1" -> bỏ hẳn*) vì định mức nhóm `Phân trang` đã có mục
        # *vị trí trang sau 1 thao tác*. Case "bỏ dần từng tiêu chí" thì GIỮ (chỉ thị 09/09).
        cases.append(('Kiểm tra bỏ dần từng tiêu chí đang áp',
                      '1. Đang áp đủ %d tiêu chí.\n2. Bỏ lần lượt từng tiêu chí.' % N,
                      'Sau mỗi lần bỏ, số bản ghi tăng dần; bỏ hết thì danh sách trở lại đầy đủ như ban đầu.'))
        ins.setdefault(anchor, []).append((None, cases))
        if phai_dung and anchor in ins:
            # chưa có khối -> chèn dòng nhóm cha `Chức năng Tìm kiếm kết hợp` trước các case
            ins[anchor].insert(0, ('Chức năng Tìm kiếm kết hợp', []))
    if not ins: continue
    cnt=sum(len(cs) for v in ins.values() for _,cs in v); TOT+=cnt; TOTF+=1
    print('%-16s +%d case (%d nhóm)' % (nm, cnt, sum(len(v) for v in ins.values())))
    if DRY: continue
    pl=tcfix.Plan(tc)
    for rn in tc.order:
        if rn<12: continue
        pl.keep(rn)
        for gname, cases in ins.get(rn, []):
            # Mẫu `NCC-BienSoanChuDe`: "Kết hợp N thông tin" là **sub2** dưới dòng nhóm cha
            # `Chức năng Tìm kiếm kết hợp` (sub). Bản cũ dùng add_sub -> sai cấp, nhìn phẳng.
            # gname None = màn đúng 2 tiêu chí -> case nằm THẲNG dưới nhóm cha (mẫu r144).
            if gname is not None:
                (pl.add_sub if not cases else pl.add_sub2)(gname)
            for c in cases: pl.case(*c)
    tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets)==1)
print('=== %d file · +%d case ===' % (TOTF, TOT))

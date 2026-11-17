# -*- coding: utf-8 -*-
"""BẢN ĐỒ MÀN của cả app — đọc bảng route + menu trong bundle FE (chỉ GET, chỉ đọc).

Vì sao có bộ này (chỉ thị người đặt việc 2026-09-09: *"nâng cấp tool_v2 có thể lên domain luồn
sâu vào các luồng, tránh thiếu sót màn phụ như màn chi tiết lỗi của màn Quản lý dữ liệu lỗi"*):

`probe_fe.route_map()` **đã** đọc được cả bảng route (kể cả segment tham số `:id`) nhưng chỉ dùng
để chọn ĐÚNG MỘT chunk cho URL đang soi. Không chỗ nào liệt kê toàn bộ, không chỗ nào phân loại
màn CHÍNH / màn PHỤ, và không phép rà nào đối chiếu route với bộ case ⇒ **màn phụ chỉ lộ ra khi
người soi bằng mắt**. Đúng ca `/quarantine-list/:batchId` (Chi tiết lỗi): bộ case đầu tiên của màn
`Dữ liệu lỗi` thiếu hẳn nó, 10/10 bộ rà báo sạch.

Ba nguồn, đọc TĨNH nên không cần đăng nhập:
  ① **bảng route**  `{path:"quarantine-list/:batchId", lazy:()=>import("./QuarantineDetailPage-*.js")}`
  ② **menu sidebar** `[{id,title,moduleId,items:[{to:"/…",label:"…",permission:…}]}]`
  ③ **quan hệ CHA–CON** suy từ tiền tố route (`quarantine-list` ⟶ `quarantine-list/:batchId`)

Phân loại:
  · **CHÍNH**     — route có mục menu trỏ tới ⇒ chắc chắn phải có bộ case
  · **PHỤ**       — KHÔNG có trong menu nhưng có route CHA là màn chính (hoặc route cha cũng phụ)
                    ⇒ đây là lớp hay bị thiếu; vào bằng cách bấm từ màn cha
  · **CHƯA RÕ LỐI VÀO** — không menu, không route cha ⇒ hoặc vào bằng URL trực tiếp, hoặc route
                    chết. **Nói ra chứ không đoán** (đúng luật: tool không lấy được dữ kiện thì
                    phải báo, không im lặng).

    python3 probe_routes.py https://host/duong-dan-mot-man        # bản đồ + màn phụ của màn đó
    python3 probe_routes.py https://host --tat-ca                 # bản đồ TOÀN APP
    python3 probe_routes.py https://host/man --spec <hồ sơ>.json  # + ĐỐI CHIẾU hồ sơ màn
    ... --save <thư mục>                                          # giữ .js đã tải để tự grep

⛔ KHÔNG ghi file nào (trừ `--save` giữ .js). Không sinh hồ sơ màn: `nav` và LOẠI control vẫn
phải lên màn thật soi (chốt 2026-09-09) — bản đồ này chỉ trả lời *"còn màn nào chưa biết tới"*.
"""
import argparse
import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_fe

# Mục menu — HAI khuôn đã gặp trên app thật:
#   A) {to:"/quarantine-list", icon:…, label:"Quản lý dữ liệu lỗi", permission:null}
#   B) {id:"...", title:"Danh mục trình độ", icon:…, path:"/categories/education"}
# Khuôn B dùng chính khoá `path:` như BẢNG ROUTE ⇒ phải loại trừ những object có `element:`
# (đó là route, không phải mục menu), không thì mọi route hoá "màn chính" và không còn màn phụ nào.
RX_MENU = re.compile(r'(?:to|path):"(/[^"]{0,90})"')
RX_NHAN = re.compile(r'(?:label|title):"([^"]{1,80})"')
# Nhóm menu (dùng để in GỢI Ý cho `nav`, KHÔNG tự điền vào hồ sơ màn)
RX_SEC = re.compile(r'\{id:"([a-z0-9-]{2,40})",title:"([^"]*)",moduleId:"([^"]*)"')
# Lối vào màn khác đọc từ chunk. ⚠️ KHÔNG bắt theo TÊN HÀM (`navigate(`/`push(`): bundle đã
# minify nên lệnh điều hướng thật của màn `Dữ liệu lỗi` là `r(`/quarantine-list/${e.batchId}`)`
# — hàm còn đúng MỘT chữ. Dấu hiệu chắc chắn duy nhất là **chuỗi có dạng đường dẫn**; lọc nhiễu
# bằng cách chỉ giữ chuỗi KHỚP một mẫu trong bảng route.
RX_STR = re.compile(r'[`"\'](/[A-Za-z0-9_./:${}\[\]|&?=-]{1,160})[`"\']')
# Đường dẫn KHÔNG phải route màn — API, asset, file tĩnh.
BO_QUA_DUONG = ('/api/', '/assets/', '/static/', '/favicon', '/robots', '/manifest')


def menu_items(blob):
    """[(đường dẫn, nhãn)] — mục menu sidebar đọc từ bundle entry (cả hai khuôn)."""
    out, seen = [], set()
    for m in RX_MENU.finditer(blob):
        p = m.group(1)
        truoc = blob[max(0, m.start() - 300):m.start()]
        sau = blob[m.end():m.end() + 220]
        if 'element:' in truoc[-120:] or 'element:' in sau[:120]:
            continue                     # đây là dòng của BẢNG ROUTE, không phải mục menu
        if not any(k in truoc + sau for k in ('icon:', 'label:"', 'permission')):
            continue                     # thiếu dấu hiệu menu -> không nhận, thà bỏ sót hơn báo sai
        # Nhãn NẰM GẦN NHẤT: khuôn A (`{to:…,label:…}`) nhãn ở SAU, khuôn B
        # (`{label:…,icon:…,path:…}`) nhãn ở TRƯỚC. Đừng cắt cửa sổ theo dấu `{`: `icon:` của
        # khuôn B là `s.jsx(Uf,{className:"w-5 h-5"})` — có `{` bên trong nên cắt kiểu đó lấy
        # nhầm nhãn của mục LIỀN SAU (đã đo: `/categories/education` ra "Danh mục trường học").
        ung = []
        mt = list(RX_NHAN.finditer(truoc))
        if mt:
            ung.append((len(truoc) - mt[-1].end(), mt[-1].group(1)))
        ms = RX_NHAN.search(sau)
        if ms:
            ung.append((ms.start(), ms.group(1)))
        if p in seen:
            continue
        seen.add(p)
        out.append((p, min(ung)[1] if ung else ''))
    return out


def menu_sections(blob):
    """[(id, tiêu đề nhóm, moduleId)] — nhóm menu sidebar; chỉ dùng để IN GỢI Ý."""
    return [m.groups() for m in RX_SEC.finditer(blob)]


def norm_route(p):
    return '/' + p.strip('/') if p.strip('/') else '/'


def cha_cua(route, tap):
    """Route CHA gần nhất có trong `tap` — theo tiền tố segment, bỏ segment tham số."""
    segs = [s for s in route.strip('/').split('/') if s]
    for i in range(len(segs) - 1, 0, -1):
        ung = '/' + '/'.join(segs[:i])
        if ung in tap and ung != route:
            return ung
    return None


def phan_loai(routes, menu, canh=None):
    """{route: (loại, nhãn menu, lối vào, nguồn lối vào)} — CHÍNH · PHỤ · CHƯA RÕ LỐI VÀO.

    `canh` = {route: [đường dẫn nó điều hướng tới]} đọc từ chunk (chỉ có khi chạy `--sau`).
    Có cạnh thì lối vào là **bằng chứng thật**; không có thì suy theo TIỀN TỐ route và nói rõ
    đó là suy đoán — đừng để người đọc tưởng hai thứ là một.
    """
    tap = set(routes)
    nhan = {norm_route(p): l for p, l in menu}
    canh = canh or {}
    vao_tu = {}
    for src, dsts in canh.items():
        for d in dsts:
            for r in routes:
                if r != src and khop_mau(d, r):
                    vao_tu.setdefault(r, []).append(src)
    ra = {}
    for r in routes:
        if r in nhan:
            ra[r] = ('CHÍNH', nhan[r], None, 'menu')
            continue
        if r in vao_tu:
            ra[r] = ('PHỤ', '', ', '.join(sorted(set(vao_tu[r]))), 'chunk')
            continue
        cha = cha_cua(r, tap)
        # cha là màn chính, hoặc cha cũng là màn phụ (chuỗi 3 cấp: /a -> /a/:id -> /a/:id/edit)
        ra[r] = ('PHỤ', '', cha, 'tiền tố') if cha else ('CHƯA RÕ LỐI VÀO', '', None, '')
    return ra


def co_tham_so(r):
    return [s for s in r.split('/') if s.startswith(':')]


def tach_base(routes, url_path):
    """(tiền tố app, đường dẫn theo BẢNG ROUTE) — app2 khai route KHÔNG có `/admin` mở đầu.

    `probe_fe.chunk_theo_route()` khớp mẫu route với ĐUÔI đường dẫn nên không dính lỗi này;
    bản đầu của `probe_routes` so từ ĐẦU nên `/admin/categories/education/training` trượt hết,
    in ra bản đồ RỖNG (lưới an toàn có kêu, nhưng vẫn là mất phép đo).
    """
    segs = [s for s in (url_path or '/').strip('/').split('/') if s]
    for i in range(len(segs)):
        con = '/' + '/'.join(segs[i:])
        if any(khop_mau(con, r) for r in routes) or any(
                r.startswith(con + '/') for r in routes):
            return '/' + '/'.join(segs[:i]) if i else '', con
    return '', '/' + '/'.join(segs)


def nhanh_cua(routes, url_path):
    """Các route thuộc CÙNG NHÁNH với đường dẫn đang soi (cha, chính nó, con)."""
    segs = [s for s in url_path.strip('/').split('/') if s]
    ra = []
    for r in routes:
        rs = [s for s in r.strip('/').split('/') if s]
        n = min(len(rs), len(segs))
        if n and all(p.startswith(':') or p == d for p, d in zip(rs[:n], segs[:n])):
            ra.append(r)
    return ra


def duong_dan_trong_chunk(txt):
    """[đường dẫn] — mọi chuỗi có dạng đường dẫn màn trong một chunk, đã chuẩn hoá tham số.

    `/quarantine-list/${e.batchId||e.key}${i}` -> `/quarantine-list/:param`
    """
    ra = set()
    for m in RX_STR.finditer(txt):
        p = m.group(1)
        if any(k in p for k in BO_QUA_DUONG):
            continue
        p = re.sub(r'\$\{[^}]*\}', ':param', p)
        p = p.split('?')[0]
        # `${a}${b}` liền nhau -> gộp về 1 tham số; bỏ đuôi rỗng
        p = re.sub(r'(?::param){2,}', ':param', p).rstrip('/') or '/'
        if re.search(r'[|&\[\]=]', p):        # còn ký tự biểu thức -> không phải đường dẫn sạch
            continue
        ra.add(p)
    return sorted(ra)


def chuan_khai(p):
    """Chuẩn hoá đường dẫn KHAI TRONG HỒ SƠ MÀN về dạng so khớp được.

    Hồ sơ màn viết chỗ giữ bằng tiếng Việt trong ngoặc nhọn (`/quarantine-list/<mã tập>`) —
    quy ước có sẵn của bộ tool. Không chuẩn hoá thì phép đối chiếu báo THIẾU oan đúng cái màn
    phụ đã khai.
    """
    p = urllib.parse.urlparse(p).path or p
    p = re.sub(r'<[^>]*>', ':param', p)
    return norm_route(p)


def khop_mau(duong, mau):
    """`/quarantine-list/:param` có khớp mẫu route `/quarantine-list/:batchId`?"""
    a = [s for s in duong.strip('/').split('/') if s]
    b = [s for s in mau.strip('/').split('/') if s]
    if len(a) != len(b):
        return False
    return all(x == y or x.startswith(':') or y.startswith(':') for x, y in zip(a, b))


def sec(t):
    print('\n' + '=' * 78 + '\n' + t + '\n' + '=' * 78)


def main():
    ap = argparse.ArgumentParser(description='Bản đồ màn của app — đọc bảng route + menu trong bundle')
    ap.add_argument('url', help='URL của MỘT màn (dò nhánh màn đó) hoặc gốc domain')
    ap.add_argument('--tat-ca', action='store_true', help='in bản đồ TOÀN APP, không chỉ nhánh')
    ap.add_argument('--spec', help='hồ sơ màn (JSON) để ĐỐI CHIẾU — không sửa file')
    ap.add_argument('--save', help='thư mục giữ .js đã tải')
    ap.add_argument('--sau', action='store_true',
                    help='tải thêm chunk của các màn trong nhánh để đọc LỆNH ĐIỀU HƯỚNG thật')
    a = ap.parse_args()

    cache = {}
    try:
        shell = probe_fe.get(a.url)
    except Exception as e:
        probe_fe.die('không tải được trang: %s' % e)
    # `entry_assets` trả [(ref thô, [url ứng viên])] — SPA đặt dưới thư mục con ghi asset tương
    # đối với BASE CỦA APP nên phải thử lần lượt các gốc, đúng lối `probe_fe.thu_thap`.
    assets = probe_fe.entry_assets(shell, a.url)
    if not assets:
        probe_fe.die('shell HTML không trỏ tới file .js nào — có thể không phải SPA, hoặc bị chặn.')
    blob, entry_url = '', None
    for ref, cands in assets:
        body, u2 = probe_fe.fetch_first(cands, cache, a.save)
        if body and probe_fe.RX_ROUTE.search(body):
            blob, entry_url = body, u2
            break
        if body and not blob:
            blob, entry_url = body, u2
    if not blob:
        probe_fe.die('không tải được bundle entry (đã thử %d asset)' % len(assets))
    print('ENTRY : %s (%d byte)' % (os.path.basename(entry_url), len(blob)))

    rmap = probe_fe.route_map(blob)
    if not rmap:
        probe_fe.die('KHÔNG đọc được bảng route trong bundle — app này đóng gói khác, '
                     'đừng tin phần dưới, soi tay bằng `probe_fe.py`')
    chunk_of, routes = {}, []
    for pat, ch in rmap:
        r = norm_route(pat)
        if r in ('/*', '/'):
            if r == '/*':
                continue
        if r not in chunk_of:
            routes.append(r)
        chunk_of[r] = os.path.basename(ch)
    menu = menu_items(blob)
    secs = menu_sections(blob)
    print('ROUTE : %d mẫu route · MENU: %d mục / %d nhóm' % (len(routes), len(menu), len(secs)))

    path = urllib.parse.urlparse(a.url).path or '/'
    base, path_route = tach_base(routes, path)
    if base:
        print('BASE  : app đặt route dưới "%s" — bảng route khai không có tiền tố này' % base)
    trong_nhanh = (nhanh_cua(routes, path_route)
                   if not a.tat_ca and path_route != '/' else routes)

    # `--sau`: tải chunk của từng màn trong phạm vi để đọc LỐI VÀO THẬT (chuỗi dạng route).
    canh = {}
    if a.sau:
        print('SAU   : tải %d chunk để đọc lối vào thật …' % len(trong_nhanh))
        for r in trong_nhanh:
            body, _u = probe_fe.fetch_chunk(entry_url, './' + chunk_of[r], cache, a.save,
                                            quiet=True)
            if body:
                canh[r] = duong_dan_trong_chunk(body)
            else:
                print('   !! không tải được chunk của %s — thiếu dữ kiện, không suy bừa' % r)
    loai = phan_loai(routes, menu, canh)
    if not a.tat_ca and path_route != '/' and not trong_nhanh:
        print('!! đường dẫn "%s" KHÔNG khớp mẫu route nào — kiểm lại URL (đường dẫn của màn '
              'không đoán được từ tên menu, phải bấm sidebar rồi copy thanh địa chỉ)' % path)

    sec('① BẢN ĐỒ MÀN%s' % ('' if a.tat_ca or path_route == '/' else ' — nhánh "%s"' % path_route))
    dem = {'CHÍNH': 0, 'PHỤ': 0, 'CHƯA RÕ LỐI VÀO': 0}
    for r in sorted(trong_nhanh):
        lo, nhan, vao, nguon = loai[r]
        dem[lo] += 1
        ts = co_tham_so(r)
        print('   %-9s %-44s %s' % (lo, r, chunk_of[r]))
        if nhan:
            print('             ↳ menu: "%s"' % nhan)
        if vao:
            print('             ↳ vào từ %s%s%s' % (
                vao,
                '  (cần %s thật)' % ', '.join(ts) if ts else '',
                '' if nguon == 'chunk' else '  [SUY theo tiền tố route — chạy --sau để lấy '
                                            'bằng chứng lối vào thật]'))
        if lo == 'CHƯA RÕ LỐI VÀO':
            print('             ↳ không có mục menu, không có route cha ⇒ vào bằng URL trực tiếp '
                  'hoặc route chết. PHẢI soi tay, tool không đoán.')
        if a.sau and lo == 'PHỤ' and nguon == 'tiền tố':
            print('             ↳ !! đã đọc chunk mà KHÔNG thấy chuỗi điều hướng nào tới màn này '
                  '— vào bằng URL trực tiếp, hoặc lối vào nằm ở chunk khác')
    print('   ── %d CHÍNH · %d PHỤ · %d CHƯA RÕ LỐI VÀO' %
          (dem['CHÍNH'], dem['PHỤ'], dem['CHƯA RÕ LỐI VÀO']))

    phu = [r for r in sorted(trong_nhanh) if loai[r][0] == 'PHỤ']
    co_ts = [r for r in phu if co_tham_so(r)]
    khong_ts = [r for r in phu if not co_tham_so(r)]
    sec('② MÀN PHỤ — lớp hay bị THIẾU HẲN khỏi bộ case')
    if not phu:
        print('   (không có màn phụ trong phạm vi này)')
    if co_ts:
        print('   ▸ CÓ THAM SỐ — chắc chắn là màn con, phải vào từ màn cha:')
    for r in co_ts:
        _lo, _n, vao, nguon = loai[r]
        print('     %-44s %s' % (r, chunk_of[r]))
        print('          vào từ %s · cần %s thật (bấm 1 bản ghi trên danh sách)%s'
              % (vao or '(chưa rõ)', ', '.join(co_tham_so(r)),
                 '' if nguon == 'chunk' else ' · [suy theo tiền tố]'))
    if khong_ts:
        print('   ▸ KHÔNG có tham số — route con của màn khác. Bundle KHÔNG phân biệt được')
        print('     "màn phụ thật" với "mục menu cấp sâu mà phép dò menu chưa thấy" ⇒ soi')
        print('     sidebar thật rồi quyết:')
    for r in khong_ts:
        _lo, _n, vao, nguon = loai[r]
        print('     %-44s %s' % (r, chunk_of[r]))
        print('          vào từ %s%s' % (vao or '(chưa rõ)',
                                         '' if nguon == 'chunk' else ' · [suy theo tiền tố]'))
    if phu:
        print('\n   ⇒ Mỗi màn phụ phải có CN riêng trong bộ case (hoặc ghi rõ lý do bỏ ở hồ sơ màn).')
        print('   ⇒ Soi control + nhãn + thứ tự THẬT: probe_live.py <url màn cha> --sau')

    if a.sau:
        sec('③ LỆNH ĐIỀU HƯỚNG đọc được trong chunk (kiểm chéo bảng route)')
        for r in sorted(trong_nhanh):
            ch = chunk_of[r]
            body, _u = probe_fe.fetch_chunk(entry_url, './' + ch, cache, a.save, quiet=True)
            if not body:
                print('   %-44s !! không tải được chunk' % r)
                continue
            dh = duong_dan_trong_chunk(body)
            di = [d for d in dh if any(khop_mau(d, x) for x in routes) and not khop_mau(d, r)]
            print('   %-44s -> %s' % (r, ', '.join(di) if di else '(không thấy lối sang màn khác)'))
            la = [d for d in dh if d != '/' and not any(khop_mau(d, x) for x in routes)]
            for d in la:
                print('        !! chuỗi đường dẫn "%s" KHÔNG khớp mẫu route nào — hoặc là route '
                      'chết, hoặc bảng route đọc chưa đủ' % d)

    if a.spec:
        sec('④ ĐỐI CHIẾU hồ sơ màn: %s' % os.path.basename(a.spec))
        try:
            spec = json.load(open(a.spec, encoding='utf-8'))
        except Exception as e:
            print('   !! đọc không được (%s) — bỏ qua phần đối chiếu' % type(e).__name__)
            return
        khai = spec.get('man_phu') or []
        khai_r = [chuan_khai(x['route'] if isinstance(x, dict) else x) for x in khai]
        urls = spec.get('url') or []
        urls = [urls] if isinstance(urls, str) else urls
        khai_url = [chuan_khai(u) for u in urls]
        thieu = [r for r in phu
                 if not any(khop_mau(r, k) for k in khai_r)
                 and not any(khop_mau(r, k) for k in khai_url)]
        thua = [k for k in khai_r if not any(khop_mau(k, r) for r in routes)]
        for r in thieu:
            print('   [THIẾU]  %-40s có route + có lối vào, hồ sơ màn CHƯA khai' % r)
        for k in thua:
            print('   [THỪA]   %-40s hồ sơ màn khai mà bảng route KHÔNG có' % k)
        if not khai:
            print('   !! hồ sơ màn chưa có khoá "man_phu" — khai vào đó thì `audit_man_phu.py`')
            print('      mới rà được (bộ rà chạy offline, không lên domain).')
        if not thieu and not thua and khai:
            print('   ✔ khớp: %d màn phụ đã khai, không thiếu không thừa' % len(khai_r))

    sec('GỢI Ý (đọc được từ bundle — vẫn phải soi màn thật, KHÔNG tự điền vào hồ sơ màn)')
    print('   Nhóm menu: %s' % ' · '.join('%s' % (t or i) for i, t, _m in secs))
    print('   ⚠️ `nav` (đường dẫn breadcrumb) và LOẠI control + THỨ TỰ trên màn vẫn phải lên màn')
    print('      thật soi — bundle cho biết *component*, không cho biết cái gì HIỆN ra và xếp')
    print('      thứ tự nào (chốt 2026-09-09). Dùng `probe_live.py`.')


if __name__ == '__main__':
    main()

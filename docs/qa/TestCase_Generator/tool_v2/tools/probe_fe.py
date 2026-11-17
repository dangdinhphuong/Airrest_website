# -*- coding: utf-8 -*-
"""LÊN DOMAIN ĐỌC MÀN THẬT — grounding L3 từ bundle FE (chỉ đọc, chỉ GET).

Vì sao có script này (2026-09-08): bộ case `Testcase-Role-QuanTri-ChucVu` sinh từ **ảnh chụp
màn hình** qua sạch `audit_validate_quota` nhưng còn 6 điểm phải đoán (icon ⟳ làm gì · ô nào
unique · cột file excel · ngưỡng dung lượng · thông báo verbatim). Lên domain đọc bundle FE trả
lời được **5/6** trong vài phút. Luật §0.1: **hệ thống thật thắng tài liệu** — nên đây là bước
BẮT BUỘC trước khi viết case, không phải tuỳ chọn. Xem `../huong-dan/HO-SO-DU-AN.md` §B.

SPA hiện đại code-split: shell HTML chỉ trỏ tới bundle entry, màn nằm ở chunk lazy-load riêng.
Script tự đi: shell -> entry -> chunk khớp route -> các chunk mà nó import -> rút chuỗi.

    python3 probe_fe.py https://dev-moet.coquan.vn/admin/categories/identity/position
    python3 probe_fe.py <url> --save /duong/dan     # giữ .js lại để tự grep
    python3 probe_fe.py <url> --depth 2             # đi sâu thêm một tầng import

⚠️ Chỉ lấy được thứ FE biết. Những thứ FE KHÔNG biết — tên bảng DB, giới hạn độ dài tính theo
BYTE, ràng buộc phía server — vẫn phải hỏi người/đọc migration, và vẫn gắn cờ `[CẦN VERIFY]`.
⚠️ Chỉ GET tài nguyên tĩnh công khai. Không đăng nhập, không gửi dữ liệu, không chạm API nghiệp vụ.
"""
import argparse
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

MATCH_OK = True
UA = 'tool_v2/probe_fe (QA grounding; read-only)'
VN = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ'
RX_VN = re.compile(r'["\'`]([^"\'`\n]{3,120}[%s][^"\'`\n]{0,120})["\'`]' % VN, re.I)
RX_CHUNK = re.compile(r'["\'`](\.{0,2}/?[A-Za-z0-9_.-]*[A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,10}\.js)["\'`]')
RX_ASSET = re.compile(r'(?:src|href)\s*=\s*["\']([^"\']+\.js)["\']', re.I)

# Cụm đáng chú ý -> nhãn nhóm khi in báo cáo
BUCKETS = [
    ('THÔNG BÁO LỖI',      re.compile(r'(?i)không đúng|không hợp lệ|thất bại|lỗi|vui lòng|đã tồn tại|quá|vượt')),
    ('THÔNG BÁO THÀNH CÔNG', re.compile(r'(?i)thành công|hoàn tất')),
    ('XÁC NHẬN',           re.compile(r'(?i)bạn có chắc|xác nhận')),
    ('NHÃN & NÚT',         re.compile(r'.')),
]
RX_NUM = re.compile(r'(?i)(\d+)\s*(mb|kb|ký tự|bản ghi|phút|giây|trang)')
RX_CFG = re.compile(r'\b(category|title|backRoute|importEndpoint|importSubmitEndpoint|'
                    r'exportFilename|importTemplateName|endpoint|initialPageSize|pageSize)\s*:\s*'
                    r'([`"\'][^`"\']{0,80}[`"\']|\d+)')
RX_SVC = re.compile(r'\b(list|create|update|delete|bulkDelete|changeStatus|bulkChangeStatus|'
                    r'bulkRestore|restore|getByID|selectList|export|import)\s*:\s*')
RX_REQ = re.compile(r'label\s*:\s*(`[^`]{0,60}`|"[^"]{0,60}")\s*,\s*required\s*:\s*!0')
RX_FIELD = re.compile(r'\bfield\s*:\s*"([A-Za-z0-9_]+)"')


def die(m):
    raise SystemExit('LỖI: ' + m)


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'ignore')


RX_BASE = re.compile(r'<base[^>]+href\s*=\s*["\']([^"\']+)["\']', re.I)


def base_candidates(page_url, shell):
    """Các gốc có thể dùng để giải đường dẫn tương đối của asset.

    SPA đặt dưới thư mục con (vd `/admin/`) ghi asset là `./assets/x.js` — tương đối với BASE
    CỦA APP, không phải route đang mở. Mở `/admin/categories/identity/position` rồi urljoin sẽ
    ra `/admin/categories/identity/assets/x.js` -> 404. Nên thử lần lượt: <base href> nếu có,
    rồi rút ngắn dần đường dẫn về gốc.
    """
    u = urllib.parse.urlparse(page_url)
    outs = []
    m = RX_BASE.search(shell)
    if m:
        outs.append(urllib.parse.urljoin(page_url, m.group(1)))
    segs = [x for x in u.path.split('/') if x]
    for i in range(len(segs), -1, -1):
        outs.append('%s://%s/%s' % (u.scheme, u.netloc, '/'.join(segs[:i]) + ('/' if i else '')))
    return uniq(outs)


def entry_assets(shell, page_url):
    """(ref thô, [url ứng viên]) cho từng .js mà shell HTML trỏ tới."""
    bases = base_candidates(page_url, shell)
    out = []
    for m in RX_ASSET.finditer(shell):
        ref = m.group(1)
        if ref.startswith(('http://', 'https://', '//')):
            out.append((ref, [urllib.parse.urljoin(page_url, ref)]))
        else:
            out.append((ref, uniq(urllib.parse.urljoin(b, ref.lstrip('./')) for b in bases)))
    return out


def fetch_first(cands, cache, save):
    """Tải URL đầu tiên trong danh sách ứng viên mà tải được."""
    for u in cands:
        body, u2 = fetch_chunk(u, '', cache, save, quiet=True)
        if body:
            return body, u2
    return '', cands[0] if cands else ''


def route_words(page_url):
    """Từ khoá suy từ đường dẫn — dùng để chấm điểm tên chunk."""
    segs = [s for s in urllib.parse.urlparse(page_url).path.split('/') if s and s != 'admin']
    return list(reversed(segs))          # đoạn cuối quan trọng nhất


def khoi_ngoac(txt, start, mo='{', dong='}', tran=200000):
    """Khoanh khối từ `start` tới ngoặc ĐÓNG KHỚP — thay cho lối cắt cứng N byte.

    Sự cố 2026-09-09 (`/admin/categories/education/language`): mục ① cắt cứng 900 byte từ
    `config:{`, màn có `extraFields` dài (cột + modal của ô `Ngoại ngữ` ~470 byte) nên `service:{`
    bị đẩy ra cuối cửa sổ; mục ② chỉ còn 295 byte để soi và kết luận SAI là màn KHÔNG nối
    `bulkChangeStatus`/`bulkRestore` — trong khi chunk riêng của màn nối CẢ HAI. Mục ② lại in kèm
    chỉ thị cứng "Đừng khai CN cho nó" ⇒ tin theo là mất 2 CN (~50 case) của màn CÓ chuyển trạng
    thái hàng loạt. Bỏ qua ngoặc nằm trong chuỗi và regex literal để không đếm lệch.
    """
    i = txt.find(mo, start)
    if i < 0:
        return txt[start:start + 900]
    d, j, n = 0, i, min(len(txt), i + tran)
    while j < n:
        c = txt[j]
        if c in '"\'`':                       # nhảy hết chuỗi literal
            q, j = c, j + 1
            while j < n and txt[j] != q:
                j += 2 if txt[j] == '\\' else 1
        elif c == mo:
            d += 1
        elif c == dong:
            d -= 1
            if d == 0:
                return txt[start:j + 1]
        j += 1
    return txt[start:n]                        # không khớp được -> trả phần đã quét


# Bảng route của SPA nằm ngay trong bundle entry. HAI khuôn đã gặp:
#   A) {path:"quarantine-list/:batchId", lazy:()=>import("./QuarantineDetailPage-x.js")}
#   B) {path:"/categories/education", element:jsx(Suspense,{children:jsx(h8,{})}), title:"…"}
#      + ở chỗ khác:  h8=u.lazy(()=>F(()=>import("./EducationPage-y.js"), …))
# ⚠️ Vá 2026-09-09: bản trước chỉ biết khuôn A và ghép `path:` với `import(` GẦN NHẤT trong
# 600 byte — trên app khuôn B nó ghép **SAI TRONG IM LẶNG** (`categories/administrative/
# notification-type` -> `ChatbotPage`, hai màn chẳng liên quan), mà `chunk_theo_route()` lại
# dùng chính hàm này để chọn chunk "đúng màn" ⇒ báo cáo grounding của màn KHÁC. Nay: khoanh
# đúng phạm vi MỘT route (tới `path:` kế tiếp), hỗ trợ cả hai khuôn, và **không tra được thì
# trả None** chứ không đoán.
RX_ROUTE = re.compile(r'path:\s*"([^"]{1,120})"')
RX_IMPORT = re.compile(r'import\("(\.{0,2}/[A-Za-z0-9_.-]+\.js)"\)')
RX_TITLE = re.compile(r'title:\s*"([^"]{1,80})"')
# h8=u.lazy(()=>F(()=>import("./EducationPage-Dy-PXMWN.js"), …))   — biến -> chunk
RX_LAZY_VAR = re.compile(r'([A-Za-z_$][\w$]{0,5})\s*=\s*[\w$.]{0,10}lazy\(\s*\(\)\s*=>'
                         r'[\s\S]{0,160}?import\("(\.{0,2}/[A-Za-z0-9_.-]+\.js)"')
# element:…jsx(h8,{…})   — TÊN BIẾN component. Lấy MỌI ứng viên rồi chỉ nhận cái nào THẬT LÀ
# một lazy import (`lz`): khuôn B bọc thêm Suspense + component "Đang tải…" nên ứng viên đầu
# tiên (`s.jsx(z,{message:"Đang tải..."})`) là component chờ, không phải màn.
RX_JSX_VAR = re.compile(r'jsx\w*\(\s*([A-Za-z_$][\w$]{0,5})\s*,')


def lazy_vars(blob):
    """{tên biến: chunk} — component nạp trễ khai ở nơi khác trong bundle (khuôn B)."""
    return {m.group(1): m.group(2) for m in RX_LAZY_VAR.finditer(blob)}


def route_table(blob):
    """[(mẫu route, chunk|None, title|None)] — bảng route đầy đủ, KHÔNG đoán khi tra không ra."""
    lz = lazy_vars(blob)
    ms = list(RX_ROUTE.finditer(blob))
    out = []
    for i, m in enumerate(ms):
        # Phạm vi của MỘT route: tới `path:` kế tiếp, tối đa 600 byte (không tràn sang route sau)
        het = min(ms[i + 1].start() if i + 1 < len(ms) else len(blob), m.end() + 600)
        win = blob[m.end():het]
        ch = None
        # Khuôn B TRƯỚC vì nó TỰ KIỂM: chỉ nhận biến nào thật sự là một lazy import.
        for v in RX_JSX_VAR.findall(win):
            if v in lz:
                ch = lz[v]
                break
        if ch is None:
            # Khuôn A: `lazy:()=>import(...)` nằm NGAY sau `path:` (đo trên app thật: ~40 byte).
            # Giới hạn 200 byte để không vớ `import(` của khai báo lazy khác đứng gần —
            # chính chỗ này làm bản trước ghép sai trong im lặng.
            im = RX_IMPORT.search(win[:200])
            if im:
                ch = im.group(1)
        ti = RX_TITLE.search(win)
        out.append((m.group(1).strip('/'), ch, ti.group(1) if ti else None))
    return out


def route_map(blob):
    """[(mẫu route, chunk)] — chỉ những route tra được chunk (giữ API cũ cho các script cũ)."""
    return [(r, c) for r, c, _t in route_table(blob) if c]


def chunk_theo_route(blob, page_url):
    """Chunk của ĐÚNG màn, tra theo bảng route (khớp cả segment tham số `:id`).

    Vì sao cần (đo 2026-09-09): đường dẫn `/quarantine-list/<uuid>` có segment ĐỘNG. `pick_chunks`
    chấm điểm theo TÊN chunk nên từ khoá `quarantine-list` khớp `QuarantineListPage` (màn DANH
    SÁCH) và KHÔNG khớp `QuarantineDetailPage` (màn CHI TIẾT) ⇒ báo cáo grounding là của MÀN ANH
    EM mà không hề cảnh báo — đúng lớp lỗi "không chắc đúng màn" đã vá cho route CHA hồi sáng,
    nhưng route CON có tham số thì vẫn lọt. Ở đây khớp theo bảng route nên không phải đoán.
    """
    segs = [x for x in urllib.parse.urlparse(page_url).path.split('/') if x]
    best = None
    for pat, chunk in route_map(blob):
        ps = [x for x in pat.split('/') if x]
        if not ps or len(ps) > len(segs):
            continue
        duoi = segs[len(segs) - len(ps):]
        if any(not p.startswith(':') and p != d for p, d in zip(ps, duoi)):
            continue
        diem = sum(1 for p in ps if not p.startswith(':'))
        if diem and (best is None or (len(ps), diem) > (best[0], best[1])):
            best = (len(ps), diem, chunk, pat)
    return (best[2], best[3]) if best else (None, None)


def pick_chunks(chunks, words, limit):
    """Chunk nào có tên khớp từ khoá route thì lấy — đoạn cuối của route ưu tiên cao nhất."""
    scored = []
    for c in chunks:
        base = os.path.basename(c).lower()
        sc = 0
        for i, w in enumerate(words):
            key = re.sub(r'[^a-z0-9]', '', w.lower())
            if key and key.rstrip('s') in base.replace('-', ''):
                sc += (len(words) - i) * 10
        if sc:
            scored.append((sc, c))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [c for _, c in scored[:limit]]


def fetch_chunk(base_url, ref, cache, save, quiet=False):
    url = urllib.parse.urljoin(base_url, ref) if ref else base_url
    if url in cache:
        return cache[url], url
    try:
        body = get(url)
    except (urllib.error.HTTPError, urllib.error.URLError, OSError) as e:
        cache[url] = ''
        if not quiet:
            print('   ! không tải được %s (%s)' % (os.path.basename(url), e))
        return '', url
    cache[url] = body
    if save:
        os.makedirs(save, exist_ok=True)
        with open(os.path.join(save, os.path.basename(url)), 'w', encoding='utf-8') as f:
            f.write(body)
    return body, url


def uniq(seq):
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def thu_thap(url, save=None, depth=1, max_chunks=6, max_files=25, verbose=True):
    """Tải bundle FE của một màn -> (blob chuỗi mã của MÀN, words route, entry_url, số file).

    Tách khỏi `main()` 2026-09-08 để `audit_control_that.py` dùng lại — đừng chép lại logic này.
    `blob` CỐ Ý không chứa bundle entry: đó là mã dùng chung cả app, gộp vào thì chuỗi của màn
    chìm nghỉm và phép đối chiếu "nhãn có thật hay không" mất hết ý nghĩa.
    """
    def say(*a):
        if verbose:
            print(*a)

    say('MÀN  : %s' % url)
    try:
        shell = get(url)
    except Exception as e:
        die('không tải được màn: %s' % e)

    assets = entry_assets(shell, url)
    if not assets:
        die('shell HTML không trỏ tới file .js nào — có thể màn không phải SPA, hoặc bị chặn.')
    say('SHELL: %d byte · %d asset' % (len(shell), len(assets)))

    cache, bodies = {}, []
    entry_url = None
    for ref, cands in assets:
        body, u2 = fetch_first(cands, cache, save)
        if not body:
            say('   ! không tải được %s (đã thử %d gốc)' % (ref, len(cands)))
            continue
        if entry_url is None and RX_CHUNK.search(body):
            entry_url = u2
        bodies.append((u2, body))
    if entry_url is None and bodies:
        entry_url = bodies[0][0]
    if not bodies:
        die('không tải được bundle nào.')
    say('ENTRY: %s (%d byte)' % (os.path.basename(entry_url), len(cache.get(entry_url, ''))))

    all_chunks = uniq(sum([RX_CHUNK.findall(b) for _, b in bodies], []))
    words = route_words(url)
    picked = pick_chunks(all_chunks, words, max_chunks)
    # Bảng route của bundle THẮNG phép chấm điểm theo tên: đường dẫn có segment tham số
    # (`/quarantine-list/<uuid>`) làm phép chấm điểm vớ nhầm chunk của màn anh em.
    ch_route, pat_route = chunk_theo_route(cache.get(entry_url, ''), url)
    if ch_route:
        picked = uniq([ch_route] + picked)[:max_chunks]
        say('ROUTE: bảng route khớp "%s" -> %s' % (pat_route, os.path.basename(ch_route)))
    else:
        say('ROUTE: từ khoá %s  (không tra được bảng route)' % ' > '.join(words))
    say('CHUNK: %d chunk trong bundle · khớp route: %s'
        % (len(all_chunks), ', '.join(os.path.basename(c) for c in picked) or '(không có — dùng entry)'))

    screen, seen_ref, frontier = [], set(picked), list(picked)
    for _ in range(max(0, depth) + 1):
        nxt = []
        for ref in frontier:
            if len(screen) >= max_files:
                break
            body, u2 = fetch_chunk(entry_url, ref, cache, save)
            if not body:
                continue
            screen.append((u2, body))
            for r2 in RX_CHUNK.findall(body):
                if r2 not in seen_ref:
                    seen_ref.add(r2)
                    nxt.append(r2)
        frontier = nxt
    if not screen:
        say('   ! không có chunk nào khớp route — đọc tạm bundle entry (chuỗi sẽ nhiễu).')
        screen = bodies
    say('ĐÃ ĐỌC: %d file js của màn (bỏ qua bundle entry dùng chung)\n' % len(screen))
    return '\n'.join(b for _, b in screen), words, entry_url, len(screen)


def main():
    ap = argparse.ArgumentParser(description='Đọc bundle FE của một màn để grounding L3')
    ap.add_argument('url', help='URL đầy đủ của màn, vd https://host/admin/categories/identity/position')
    ap.add_argument('--save', help='thư mục giữ lại các .js đã tải (để tự grep)')
    ap.add_argument('--depth', type=int, default=1, help='đi theo import mấy tầng (mặc định 1)')
    ap.add_argument('--max-files', type=int, default=25, help='số file js của màn tải tối đa')
    ap.add_argument('--max-chunks', type=int, default=6, help='số chunk khớp route lấy tối đa')
    a = ap.parse_args()

    if not a.url.lower().startswith(('http://', 'https://')):
        die('url phải bắt đầu bằng http:// hoặc https://')

    blob, words, entry_url, n_file = thu_thap(
        a.url, save=a.save, depth=a.depth, max_chunks=a.max_chunks, max_files=a.max_files)
    bodies = [(entry_url, '')] * n_file


    def sec(t):
        print('\n' + '=' * 78 + '\n%s\n' % t + '=' * 78)

    sec('① CẤU HÌNH MÀN — trả lời câu 1 · 9 · 11 của §B')
    # Khoanh TRỌN khối `config` bằng ngoặc khớp (trước 2026-09-09 cắt cứng 900 byte ->
    # màn có `extraFields` dài bị mất khối `service`, mục ② kết luận sai thao tác).
    raw = [khoi_ngoac(blob, m.start()) for m in re.finditer(r'config\s*:\s*\{', blob)]
    # Nhiều màn anh em nằm chung một chunk cha -> chấm điểm theo từ khoá route, lấy khối khớp nhất
    def score(b):
        low = b.lower()
        return sum((len(words) - i) * 10 for i, w in enumerate(words)
                   if re.sub(r'[^a-z0-9]', '', w.lower()) in low)
    raw.sort(key=lambda b: -score(b))
    mine = raw[0] if raw and score(raw[0]) else ''
    if mine:
        print('    ' + mine[:700].replace('\n', ' '))
    else:
        cfg = uniq(['%s = %s' % (k, v.strip('`"\'')) for k, v in RX_CFG.findall(blob)
                    if k != 'title' or len(v) < 60])
        for x in cfg[:20]:
            print('    ', x)
        if not cfg:
            print('    (không thấy — màn có thể không dùng cấu hình khai báo)')
    if len(raw) > 1:
        print('\n    (chunk còn chứa %d màn anh em khác — đã chọn khối khớp route nhất)' % (len(raw) - 1))

    # Màn KHÔNG có chunk riêng thì chunk khớp route là của MÀN ANH EM -> báo cáo sẽ sai màn.
    # Kiểm chéo 1: `category` trong config phải dính với đoạn cuối của route.
    leaf = re.sub(r'[^a-z0-9]', '', (words[0] if words else '').lower())
    mcat = re.search(r'category\s*:\s*["\'`]([^"\'`]+)', mine) if mine else None
    cat = re.sub(r'[^a-z0-9]', '', mcat.group(1).lower()) if mcat else ''
    ok = bool(leaf and cat and (leaf in cat or cat in leaf
                                or leaf.rstrip('sy') in cat or cat.rstrip('s') in leaf))
    # Kiểm chéo 2 (thêm 2026-09-09): `backRoute` phải nằm TRONG đường dẫn đang dò.
    # Vì sao cần: phép kiểm 1 dùng CHỨA-CHUỖI nên quá lỏng — route cha
    # `/admin/categories/education` vớ config `education-center-models`, mà 'education' LÀ chuỗi
    # con của 'educationcentermodels' ⇒ ok=True, KHÔNG cảnh báo, và mục ①②③ báo sai màn trong im
    # lặng. `backRoute` của config đó là `/categories/school` — không dính route đang dò ⇒ bắt được.
    mback = re.search(r'backRoute\s*:\s*["\'`]([^"\'`]+)', mine) if mine else None
    if ok and mback:
        br = mback.group(1).rstrip('/')
        if br and br not in a.url.rstrip('/'):
            ok = False
    if mine and not ok:
        print('\n    ' + '!' * 70)
        print('    !! KHÔNG CHẮC ĐÚNG MÀN: route kết thúc bằng "%s" nhưng config lấy được là'
              ' category="%s"%s.' % (words[0] if words else '?', mcat.group(1) if mcat else '?',
              ', backRoute="%s" KHÔNG nằm trong đường dẫn đang dò' % mback.group(1) if mback
              and mback.group(1).rstrip('/') not in a.url.rstrip('/') else ''))
        print('    !! Nhiều khả năng màn này KHÔNG có chunk riêng và script vớ phải MÀN ANH EM.')
        print('    !! Đừng dùng mục ①②③ làm căn cứ. Chạy lại với --save rồi grep tay tên màn,')
        print('    !! hoặc mở màn trong trình duyệt xem tab Network nạp chunk nào.')
        print('    ' + '!' * 70)
    global MATCH_OK
    MATCH_OK = ok or not mine

    sec('② THAO TÁC ĐƯỢC NỐI VÀO MÀN — mỗi thao tác là MỘT CN (luật 13)')
    scope = mine or blob
    m = re.search(r'service\s*:\s*\{', scope)
    # Khoanh TRỌN khối `service` bằng ngoặc khớp. Cắt cứng 800 byte như bản trước là cách
    # BỎ SÓT thao tác cuối khối mà vẫn in ra kết luận "KHÔNG nối" -> xem `khoi_ngoac()`.
    svc_txt = khoi_ngoac(scope, m.start()) if m else scope
    kin = svc_txt.rstrip().endswith('}')       # khối có đóng ngoặc = khoanh ĐỦ
    svc = uniq(RX_SVC.findall(svc_txt))
    print('    CÓ :', ' · '.join(svc) if svc else '(không thấy)')
    if mine and m and kin:
        allsvc = ['list', 'create', 'update', 'delete', 'bulkDelete', 'changeStatus',
                  'bulkChangeStatus', 'bulkRestore', 'restore', 'getByID', 'selectList']
        thieu = [x for x in allsvc if x not in svc]
        print('    KHÔNG:', ' · '.join(thieu))
        print('\n    ⚠️ Thao tác KHÔNG được nối thì màn KHÔNG có chức năng đó — dù service có hàm.')
        print('    Đừng khai CN cho nó (vd không nối `delete` = màn không có chức năng Xoá).')
    elif mine and m:
        # Khoanh được `service:{` nhưng KHÔNG thấy ngoặc đóng -> danh sách "CÓ" có thể THIẾU.
        # Tuyệt đối không in danh sách "KHÔNG" trong ca này (đó chính là lỗi 2026-09-09).
        print('\n    ' + '!' * 70)
        print('    !! KHÔNG khoanh hết được khối `service` (không tìm thấy ngoặc đóng khớp).')
        print('    !! Danh sách "CÓ" ở trên có thể THIẾU thao tác -> KHÔNG kết luận màn thiếu gì.')
        print('    !! Chạy lại với --save rồi mở chunk riêng của màn (<Tên>Page-*.js) đọc tay.')
        print('    ' + '!' * 70)
    else:
        print('\n    ⚠️ Không khoanh được khối `service` của riêng màn — danh sách trên gộp cả')
        print('    chunk anh em, phải soi tay trước khi kết luận màn có thao tác nào.')

    sec('③ Ô BẮT BUỘC (label + required) — câu 5')
    req = uniq(RX_REQ.findall(blob))
    for x in req[:25]:
        print('    required:', x.strip('`"'))
    if not req:
        print('    (không bắt được — soi tay chuỗi `required` trong .js đã --save)')
    flds = uniq(RX_FIELD.findall(blob))
    if flds:
        print('\n    tên field trong payload:', ' · '.join(flds[:25]))

    sec('④ NGƯỠNG SỐ — câu 5 · 11')
    nums = uniq(['%s %s' % (n, u) for n, u in RX_NUM.findall(blob)])
    print('   ', ' · '.join(nums) if nums else '(không thấy)')

    sec('⑤ CHUỖI GIAO DIỆN VERBATIM — câu 6 · 7 (chép ĐÚNG vào cột D)')
    strings = uniq(s.strip() for s in RX_VN.findall(blob) if 2 < len(s.strip()) < 130)
    strings = [s for s in strings if not re.search(r'[{}<>]|\$\{|=>|function|jsx', s)]
    used = set()
    for name, rx in BUCKETS:
        grp = [s for s in strings if s not in used and rx.search(s)]
        if not grp:
            continue
        used |= set(grp)
        print('\n  --- %s (%d) ---' % (name, len(grp)))
        for s in sorted(grp)[:60]:
            print('     •', s)

    sec('⑥ FE KHÔNG TRẢ LỜI ĐƯỢC — vẫn phải hỏi người / đọc migration')
    print("""    · Tên BẢNG DB thật (FE chỉ lộ REST resource) -> để `table` trống trong hồ sơ dự án,
      `verify_all=True` sẽ tự gắn cờ [CẦN VERIFY] vào cột T.
    · Giới hạn độ dài tính theo BYTE của cột VARCHAR (validate thường nằm ở server).
    · Ràng buộc nghiệp vụ chỉ server biết (trùng theo phạm vi, quyền theo tenant).
    · Control chuẩn mà hệ thống CHƯA có -> vẫn viết case, gắn cờ [YÊU CẦU MONG ĐỢI].""")

    if a.save:
        print('\nĐã giữ %d file .js ở %s — grep tay khi cần chi tiết hơn.' % (len(bodies), a.save))
    print('\nTiếp: điền hồ sơ màn <màn>.json rồi chạy new_from_base.py --spec <màn>.json')


if __name__ == '__main__':
    main()

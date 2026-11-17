#!/usr/bin/env python3
"""Chống RƠI LUẬT khi rút gọn prompt — phép kiểm khách quan, không dựa vào cảm giác.

`check_prompt_coverage.py` chỉ rà được bảng định mức §5. Bộ này phủ phần còn lại
(§2 luật bất biến · §3 cấm · §6 định mức chức năng · §7 payload+ATTT · §8 wording):

  1. Trích mọi chuỗi VERBATIM của bản gốc — nội dung trong `code span` và **in đậm**.
     Đó chính là chỗ đặt payload, wording bắt buộc, tên nhóm cấm, con số định mức.
  2. Bản rút gọn phải còn ĐỦ các chuỗi đó, dù đã đổi cách trình bày hay gộp mục.

Chuỗi lặp 5 lần mà rút còn 1 lần thì vẫn ĐẠT — đúng ý đồ gỡ trùng lặp.
Chuỗi biến mất hẳn là RƠI LUẬT → báo đỏ.

    python3 check_prompt_invariants.py --baseline inv.json [prompt.md]   # chốt mốc
    python3 check_prompt_invariants.py --check    inv.json [prompt.md]   # kiểm bản mới
"""
import argparse, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PROMPT = ROOT / 'prompts' / 'PROMPT-gen-testcase-v3.md'

MIN_LEN = 3          # bỏ span quá ngắn ("6", "N") — nhiễu, không chứng minh được gì
SPAN_RE = re.compile(r'`([^`\n]+)`|\*\*(.+?)\*\*', re.S)


def flatten(text: str) -> str:
    """Bỏ dấu markdown + gộp khoảng trắng -> so nội dung, không so cách trình bày."""
    text = re.sub(r'[*`_]', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def extract(text: str) -> list[str]:
    """Mọi chuỗi verbatim của tài liệu, đã chuẩn hoá và khử trùng lặp."""
    seen, out = set(), []
    for m in SPAN_RE.finditer(text):
        s = flatten(m.group(1) or m.group(2) or '')
        if len(s) >= MIN_LEN and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def quota_pairs(text: str, start: str, stop: str) -> dict:
    """(tên hàng -> số case) của một bảng định mức — bắt việc sửa số cho dễ đạt."""
    out, on = {}, False
    for ln in text.splitlines():
        if re.search(start, ln):
            on = True
            continue
        if on and re.search(stop, ln):
            break
        if not on or not ln.lstrip().startswith('|'):
            continue
        cells = [c.strip() for c in ln.strip().strip('|').split('|')]
        if len(cells) < 2 or set(cells[0]) <= set('-: '):
            continue
        name = flatten(cells[0])
        m = re.search(r'(\d+)', cells[1])
        if name and m and name.lower() not in ('nhóm', 'ngữ cảnh', 'nhóm chức năng'):
            out.setdefault(name, int(m.group(1)))
    return out


def dead_script_refs(text: str):
    """Tên script `*.py` được tài liệu nhắc tới mà KHÔNG tồn tại ở đâu — "file ma".

    README từng bảo "dùng bản `write_marks_lh.py` / `write_marks_tc.py`" trong khi cả hai chưa bao
    giờ tồn tại. Tên bị ~~gạch ngang~~ là cố ý khai tử nên bỏ qua; script đã dời sang `tool_v1/`
    vẫn tính là còn.
    """
    here = Path(__file__).resolve().parent
    have = {q.name for d in (here, here / '_archive', here / '_ncc_sync_0821',
                             here / 'tu_kiem',          # bộ tự kiểm lớp Live Test (14/09)
                             here.parent.parent / 'tool_v1' / 'tools')
            if d.is_dir() for q in d.glob('*.py')}
    struck = set(re.findall(r'~~`([\w.]+\.py)`~~', text))
    return sorted({n for n in re.findall(r'`([a-z_0-9]+\.py)`', text)
                   if n not in have and n not in struck})


# Prompt đã khai tử — tài liệu ĐANG HOẠT ĐỘNG không được trỏ vào như chuẩn làm việc.
# (Chính chúng và các tài liệu lịch sử thì được — xem DEAD_PROMPT_OK.)
DEAD_PROMPTS = ('PROMPT-gen-testcase-v2.md', 'PROMPT-MASTER-sinh-testcase.md')
DEAD_PROMPT_OK = (
    'PROMPT-gen-testcase-v2.md', 'PROMPT-MASTER-sinh-testcase.md',   # tự nói về mình
    'PROMPT-gen-testcase-v3.md',                                     # "thay cho ..."
    'PROMPT-ENGINEERING-REVIEW-2026-08-22.md',                       # tài liệu lịch sử
    'DOI-CHIEU-LUAT-vs-PROMPT-v3.md',                                # ma trận hợp nhất
)


def dead_prompt_refs(text: str, filename: str = ''):
    """Dòng nào của tài liệu đang hoạt động còn trỏ prompt đã khai tử mà KHÔNG gạch ngang.

    Sự cố 2026-09-07: `PROMPT-gen-testcase-v3.md` thay `v2` + `MASTER` từ 04/09, nhưng 8 chỗ ở
    6 file vẫn ghi "Prompt chuẩn: v2" / "Chuẩn nội dung: MASTER" ⇒ người đọc đi thẳng vào prompt
    đã bỏ. Vá từng chỗ không đủ — phải rà máy.
    """
    if Path(filename).name in DEAD_PROMPT_OK:
        return []
    out = []
    for i, ln in enumerate(text.splitlines(), 1):
        if any(d in ln for d in DEAD_PROMPTS) and '~~' not in ln:
            out.append((i, ln.strip()[:110]))
    return out


MUC_RE = re.compile(r'^#{1,3}\s*(§?\s*[0-9]+[0-9.]*)', re.M)


def muc_cua_spans(text: str) -> dict:
    """{chuỗi verbatim -> MỤC (§N) nó nằm trong} — lần xuất hiện ĐẦU TIÊN.

    Vì sao cần (§9 — "fingerprint còn nhưng logic đã bị thay đổi"): phép `--check` chỉ hỏi
    chuỗi còn nằm ĐÂU ĐÓ trong tài liệu hay không. Dời một luật từ §7 (phần thi hành) xuống
    §14 (nhật ký lịch sử) thì chuỗi vẫn còn ⇒ **0 rơi luật**, trong khi luật đã hết hiệu lực
    trên thực tế. Ghi thêm MỤC là bắt được đúng kiểu dịch chuyển đó, mà không đụng gì tới cơ
    chế fingerprint đang dùng.
    """
    ra, muc = {}, '(đầu file)'
    for ln in text.splitlines():
        m = MUC_RE.match(ln)
        if m:
            muc = '§' + m.group(1).replace(' ', '').lstrip('§').rstrip('.')
        for sp in SPAN_RE.finditer(ln):
            k = flatten(sp.group(1) or sp.group(2) or '')
            if len(k) >= MIN_LEN:
                ra.setdefault(k, muc)
    return ra


def snapshot(text: str) -> dict:
    return {
        'spans': extract(text),
        'spans_muc': muc_cua_spans(text),
        'quota_func': quota_pairs(text, r'^## §6\.', r'^\*\*Bốn mục'),
        'quota_attt': quota_pairs(text, r'^### 7\.1\.', r'^\*\*Quy tắc đếm'),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--baseline'), ap.add_argument('--check')
    ap.add_argument('prompt', nargs='?', default=str(DEFAULT_PROMPT))
    a = ap.parse_args()
    text = Path(a.prompt).read_text(encoding='utf-8')

    if a.baseline:
        snap = snapshot(text)
        Path(a.baseline).write_text(json.dumps(snap, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f"đã chốt mốc: {len(snap['spans'])} chuỗi verbatim · "
              f"{len(snap['quota_func'])} định mức §6 · {len(snap['quota_attt'])} định mức §7.1")
        print(f"-> {a.baseline}")
        return 0

    if not a.check:
        ap.error('cần --baseline hoặc --check')
    base = json.loads(Path(a.check).read_text(encoding='utf-8'))
    hay = flatten(text)
    lost = [s for s in base['spans'] if s not in hay]

    now = snapshot(text)
    drift = []
    for key in ('quota_func', 'quota_attt'):
        for name, n in base[key].items():
            if now[key].get(name) not in (n, None):
                drift.append(f"{key} · {name}: mốc {n} -> nay {now[key][name]}")

    print(f"chuỗi verbatim ở mốc : {len(base['spans'])}")
    print(f"còn trong bản mới    : {len(base['spans']) - len(lost)}")
    print(f"\n[RƠI LUẬT] chuỗi biến mất hẳn: {len(lost)}")
    for s in lost:
        print(f"   - {s[:150]}")
    print(f"\n[LỆCH ĐỊNH MỨC]: {len(drift)}")
    for d in drift:
        print(f"   ! {d}")

    ghost = dead_script_refs(text)
    print(f"\n[SCRIPT MA] tài liệu nhắc mà không tồn tại: {len(ghost)}")
    for g in ghost:
        print(f"   ✘ {g}")

    dead = dead_prompt_refs(text, a.prompt)
    print(f"\n[PROMPT KHAI TỬ] còn trỏ v2/MASTER như chuẩn làm việc: {len(dead)}")
    for i, ln in dead:
        print(f"   ✘ dòng {i}: {ln}")

    # ── [ĐỔI MỤC] — chuỗi còn nguyên nhưng đã chuyển sang mục khác (§9) ────────────────
    doi_muc, dormant = [], 'spans_muc' not in base
    if not dormant:
        nay_muc = muc_cua_spans(text)
        for sp, cu in base['spans_muc'].items():
            m = nay_muc.get(sp)
            if m and m != cu:
                doi_muc.append((sp, cu, m))
    print(f"\n[ĐỔI MỤC] chuỗi còn nhưng đã chuyển sang mục khác: "
          f"{'(mốc cũ chưa ghi mục — chưa đo được)' if dormant else len(doi_muc)}")
    for sp, cu, m in doi_muc[:40]:
        print(f"   ~ {sp[:90]}   {cu} -> {m}")
    if dormant:
        print("     Đóng dấu lại mốc để bật phép này: "
              "python3 check_prompt_invariants.py --baseline ../prompts/.invariants-baseline.json")

    # §9 — nói thẳng phạm vi. Bộ này chứng minh chữ CÒN, không chứng minh luật còn ĐÚNG.
    print("\nPhép này chứng minh: chuỗi bắt buộc CÒN trong tài liệu · định mức §6/§7.1 không bị"
          " sửa số ·\n   tài liệu không trỏ script ma / prompt đã khai tử"
          f"{'' if dormant else ' · luật không bị dời sang mục khác'}.")
    print("   Nó KHÔNG chứng minh nội dung quanh chuỗi vẫn còn nghĩa cũ, cũng không thay được"
          " việc đọc\n   diff của prompt. Đây là lưới chặn RƠI LUẬT, không phải chứng nhận"
          " đúng nghĩa.")
    return 1 if (lost or drift or ghost or dead or doi_muc) else 0


if __name__ == '__main__':
    sys.exit(main())

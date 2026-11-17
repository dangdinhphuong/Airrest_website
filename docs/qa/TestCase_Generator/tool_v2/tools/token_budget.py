#!/usr/bin/env python3
"""Đo ngân sách token của tài liệu tool_v2 (prompts/ + luat/).

Không có tiktoken trong môi trường này nên dùng ước lượng ổn định:
tách chuỗi ASCII (code, đường dẫn, bảng) khỏi chuỗi tiếng Việt có dấu vì
hai loại có mật độ token rất khác nhau. Hằng số chỉ dùng để SO SÁNH
before/after trên cùng loại văn bản — tỉ lệ % giảm không phụ thuộc hằng số.

    python3 token_budget.py                      # đo mặc định prompts/ + luat/
    python3 token_budget.py --baseline b.json    # ghi mốc
    python3 token_budget.py --compare b.json     # so với mốc
"""
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASCII_CHARS_PER_TOKEN = 3.8   # văn bản latin / code
VI_TOKENS_PER_CHAR = 0.85     # ký tự ngoài ASCII (tiếng Việt có dấu, emoji, box-drawing)


def estimate_tokens(text: str) -> int:
    ascii_n = sum(1 for c in text if ord(c) < 128)
    other_n = len(text) - ascii_n
    return round(ascii_n / ASCII_CHARS_PER_TOKEN + other_n * VI_TOKENS_PER_CHAR)


def measure(paths):
    rows = []
    for p in paths:
        if not p.exists():
            continue
        t = p.read_text(encoding='utf-8')
        try:
            name = str(p.relative_to(ROOT))
        except ValueError:
            name = p.name          # file ngoài tool_v2 (vd trích đoạn trong scratchpad)
        rows.append({
            'file': name,
            'lines': t.count('\n') + 1,
            'bytes': len(t.encode('utf-8')),
            'tokens': estimate_tokens(t),
        })
    return rows


def default_paths():
    return sorted((ROOT / 'prompts').glob('*.md')) + sorted((ROOT / 'luat').glob('*.md'))


def render(rows, title):
    w = max((len(r['file']) for r in rows), default=10)
    print(f"\n=== {title} ===")
    print(f"{'file'.ljust(w)}  {'dòng':>6} {'bytes':>8} {'~token':>8}")
    for r in rows:
        print(f"{r['file'].ljust(w)}  {r['lines']:>6} {r['bytes']:>8} {r['tokens']:>8}")
    tot = sum(r['tokens'] for r in rows)
    print(f"{'TỔNG'.ljust(w)}  {sum(r['lines'] for r in rows):>6} "
          f"{sum(r['bytes'] for r in rows):>8} {tot:>8}")
    return tot


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='*', help='file cụ thể; bỏ trống = prompts/ + luat/')
    ap.add_argument('--baseline', help='ghi kết quả ra JSON làm mốc')
    ap.add_argument('--compare', help='so kết quả hiện tại với JSON mốc')
    a = ap.parse_args()

    paths = [Path(f).resolve() for f in a.files] if a.files else default_paths()
    rows = measure(paths)
    total = render(rows, 'HIỆN TẠI')

    if a.baseline:
        Path(a.baseline).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f"\n→ đã ghi mốc: {a.baseline}")

    if a.compare:
        old = json.loads(Path(a.compare).read_text(encoding='utf-8'))
        old_total = sum(r['tokens'] for r in old)
        delta = total - old_total
        pct = delta / old_total * 100 if old_total else 0
        print(f"\nMốc cũ : {old_total:>8} token")
        print(f"Hiện tại: {total:>8} token")
        print(f"Chênh   : {delta:>+8} token  ({pct:+.1f}%)")
    return 0


if __name__ == '__main__':
    sys.exit(main())

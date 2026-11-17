#!/usr/bin/env python3
"""Đối chiếu độ bao phủ giữa prompt và luật — chống rút gọn làm rơi luật.

So bảng định mức trong `luat/DINH-MUC-VALIDATE-testcase.md` §3 với bảng §5 của
`prompts/PROMPT-gen-testcase-v3.md`: loại control nào có trong luật mà prompt
không nhắc tới, và số case tối thiểu có khớp không.

    python3 check_prompt_coverage.py            # rà mặc định v3
    python3 check_prompt_coverage.py <prompt.md>

MÃ THOÁT: 1 khi có [THIẾU] (rơi luật) hoặc [LỆCH SỐ] (hai bên bảo hai con số khác nhau).
[LỆCH NHÃN] và [THÊM] chỉ để BIẾT — prompt được phép phủ rộng hơn luật, xem
`huong-dan/DOI-CHIEU-LUAT-vs-PROMPT-v3.md`.
"""
import re, sys, unicodedata
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
LUAT = ROOT / 'luat' / 'DINH-MUC-VALIDATE-testcase.md'
DEFAULT_PROMPT = ROOT / 'prompts' / 'PROMPT-gen-testcase-v3.md'

# vài tên luật dùng từ khác hẳn prompt — nối bằng tay, phần còn lại khớp tự động
ALIAS = {
    'textbox tim kiem loc': 'textbox o tim kiem',
    'icon nut thao tac tren dong': 'icon thao tac tren dong',
    'danh sach luoi': 'danh sach bang',
    'cot nhap excel': 'cot excel textbox chu thuong',
    # 2026-09-14: luật ghi kèm ĐỊNH DẠNG ô, prompt ghi kèm cờ OPT-IN -> hai nhãn không chung
    # một từ nào ngoài phần đầu, `match()` trượt và bộ rà báo [THIẾU] cho luật VẪN CÒN trong
    # prompt (đúng số 10/16). Xem thêm bucket [LỆCH NHÃN] bên dưới.
    'o ngay co gio dd mm yyyy hh mm': 'o ngay co gio opt in',
    'o ngay nhieu lua chon hop lich co muc chon nhanh': 'o ngay nhieu lua chon opt in',
}


def norm(s: str) -> str:
    s = re.sub(r'[*`_]', '', s)
    s = re.sub(r'\*\([^)]*\)\*', ' ', s)      # bỏ chú thích *(in nghiêng)*, GIỮ (thường)/(unique)
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('đ', 'd').replace('Đ', 'D')
    s = re.sub(r'[^a-zA-Z0-9]+', ' ', s).strip().lower()
    return s


# Cột thứ 2 của một bảng ĐỊNH MỨC luôn là con số tối thiểu — luật ghi "Tối thiểu", prompt ghi
# "Số case". Bảng nào có tiêu đề khác thì KHÔNG phải bảng định mức.
_COT_SO = ('toi thieu', 'so case')


def parse_quota_rows(text: str, start_pat: str, stop_pat: Optional[str] = None):
    """Trả về {tên loại control đã normalize: số case tối thiểu (int|None)}.

    ⚠️ Vá 2026-09-14 — chỉ đọc dòng của BẢNG ĐỊNH MỨC, nhận ra bằng chính DÒNG TIÊU ĐỀ của
    bảng. Bản cũ nuốt mọi dòng bắt đầu bằng `|` trong khoảng §5, nên bảng phụ *"Ca | Khai gì"*
    (§5.5 — hướng dẫn khai `loai_control`) cũng bị đọc thành 4 "loại control", và con số lấy
    được là số bạ đâu vớ đó trong câu văn (`"Textbox mã (unique)"` -> 10). Bốn dòng rác đó
    nằm trong bucket `[THÊM]` suốt, khiến `[THÊM]=7` trong khi thật ra chỉ có **3** loại
    prompt phủ rộng hơn luật. Bộ rà nói sai con số của chính nó thì không ai tin được nữa.
    """
    lines = text.splitlines()
    out, on, la_bang_dinh_muc = {}, False, False
    for ln in lines:
        if re.search(start_pat, ln):
            on = True
            continue
        if on and stop_pat and re.search(stop_pat, ln):
            break
        if not on:
            continue
        if not ln.lstrip().startswith('|'):
            la_bang_dinh_muc = False        # ra khỏi bảng -> chờ tiêu đề bảng kế tiếp
            continue
        cells = [c.strip() for c in ln.strip().strip('|').split('|')]
        if len(cells) < 2 or set(cells[0]) <= set('-: '):
            continue
        name = norm(cells[0])
        if not name:
            continue
        if name in ('loai control', 'nhom', 'ngu canh', 'cot', 'dong', 'ca', 'nhom chuc nang'):
            # Đây là dòng TIÊU ĐỀ: cột 2 của nó quyết định bảng này có phải bảng định mức không
            la_bang_dinh_muc = norm(cells[1]) in _COT_SO
            continue
        if not la_bang_dinh_muc:
            continue
        m = re.search(r'(\d+)', cells[1])
        out.setdefault(ALIAS.get(name, name), int(m.group(1)) if m else None)
    return out


def match(luat_name: str, prompt_names) -> Optional[str]:
    """Tên luật khớp tên prompt khi mọi từ của nó đều có trong tên prompt.
    Nhiều ứng viên thì lấy cái ít từ thừa nhất (khớp sát nghĩa nhất)."""
    if luat_name in prompt_names:
        return luat_name
    lw = set(luat_name.split())
    cands = [(len(set(p.split()) - lw), p) for p in prompt_names if lw <= set(p.split())]
    if not cands:   # prompt đặt tên gọn hơn luật ("File excel" ⊂ "File Excel (nhập)")
        cands = [(len(lw - set(p.split())), p) for p in prompt_names if set(p.split()) <= lw]
    return min(cands)[1] if cands else None


def main():
    prompt_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PROMPT
    luat = parse_quota_rows(LUAT.read_text(encoding='utf-8'),
                            r'^## 3\. ĐỊNH MỨC case theo loại control',
                            r'^### Định mức nhóm Chức năng')
    prompt = parse_quota_rows(prompt_path.read_text(encoding='utf-8'),
                              r'^## §5\. ĐỊNH MỨC CASE THEO LOẠI CONTROL',
                              r'^### 5\.5\.')

    pairs = {k: match(k, prompt) for k in luat}
    missing_raw = sorted(k for k, v in pairs.items() if v is None)
    mismatch = sorted((k, luat[k], prompt[pairs[k]]) for k in luat
                      if pairs[k] and luat[k] and prompt[pairs[k]] and luat[k] != prompt[pairs[k]])
    hit = {v for v in pairs.values() if v}
    extra = sorted(k for k in prompt if k not in hit)

    # ── [LỆCH NHÃN] — tách khỏi [THIẾU]  (vá 2026-09-14) ───────────────────────────────
    # Đổi CHỮ ở đầu dòng bảng (vd thêm cờ `(OPT-IN)`) làm `match()` trượt, và luật vẫn nằm
    # nguyên trong prompt lại bị in ra dưới nhãn [THIẾU] = "rơi luật". Đó là báo động giả ở
    # đúng chỗ nguy hiểm nhất: người đọc quen thấy [THIẾU] khác 0 sẽ thôi tin bộ rà. Nay:
    # luật chưa khớp + có dòng prompt chưa khớp mang ĐÚNG con số + chung 3 từ đầu ⇒ gọi tên
    # đúng là LỆCH NHÃN (sửa bằng cách thêm một dòng vào `ALIAS`), không phải rơi luật.
    lech_nhan = []
    for k in sorted(k for k, v in pairs.items() if v is None):
        for q in extra:
            _a, _b = k.split(), q.split()
            _chung = len(set(_a) & set(_b))
            if luat[k] is not None and prompt[q] == luat[k] \
                    and _a[:2] == _b[:2] \
                    and _chung >= max(2, min(len(_a), len(_b)) // 2):
                lech_nhan.append((k, q, luat[k]))
                break
    _ln_luat = {a for a, _b, _c in lech_nhan}
    _ln_prompt = {b for _a, b, _c in lech_nhan}
    extra = [k for k in extra if k not in _ln_prompt]

    print(f"luật §3 : {len(luat):>3} loại control")
    print(f"prompt  : {len(prompt):>3} loại control  ({prompt_path.name})")
    missing = [k for k in missing_raw if k not in _ln_luat]
    print(f"\n[THIẾU] có trong luật, prompt không nhắc: {len(missing)}")
    for k in missing:
        print(f"   - {k} (luật: {luat[k]})")
    print(f"\n[LỆCH NHÃN] luật CÒN trong prompt nhưng đặt tên khác: {len(lech_nhan)}")
    for a, b, n in lech_nhan:
        print(f"   ~ luật \"{a}\" = prompt \"{b}\" (cùng {n}) -> thêm vào ALIAS")
    print(f"\n[LỆCH SỐ] định mức khác nhau: {len(mismatch)}")
    for k, a, b in mismatch:
        print(f"   - {k}: luật {a} ≠ prompt {b}")
    print(f"\n[THÊM] prompt có, luật §3 chưa có (bao phủ RỘNG hơn luật): {len(extra)}")
    for k in extra:
        print(f"   + {k} (prompt: {prompt[k]})")

    # ── MÃ THOÁT — nói thẳng bucket nào là LỖI, bucket nào chỉ để biết  (chốt 2026-09-14) ──
    # · [THIẾU]   = rơi luật -> LỖI (như cũ).
    # · [LỆCH SỐ] = luật và prompt bảo hai con số khác nhau cho cùng một loại control. Đây là
    #   LỖI THẬT: `qalib.QUOTA` đi theo LUẬT còn phiên sinh case đi theo PROMPT, nên lệch số
    #   là bộ case sinh ra thiếu/thừa case mà không bộ rà nào kêu (đúng sự cố 12/09 → 14/09:
    #   `Textbox số` 10≠11 · `Textarea` 9≠10 · `Textbox ô tìm kiếm` 7≠9 · `File excel` 13≠18).
    #   Trước bản này nó CHỈ ĐƯỢC IN RA, mã thoát vẫn 0 ⇒ chạy trong CI là "xanh" trong khi
    #   prompt đã lệch luật. Nay tính vào mã thoát.
    # · [LỆCH NHÃN] = luật VẪN còn trong prompt, chỉ khác chữ ở đầu dòng bảng -> không phải rơi
    #   luật; sửa bằng một dòng `ALIAS`. Không tính lỗi.
    # · [THÊM] = prompt phủ RỘNG hơn luật. Đây là điều dự án CHỦ ĐÍCH cho phép — `huong-dan/
    #   DOI-CHIEU-LUAT-vs-PROMPT-v3.md` ghi nhận "+N loại v3 phủ rộng hơn luật" như kết quả
    #   bình thường, và §5 của v3 vốn được viết chi tiết hơn bảng §3. KHÔNG tính lỗi.
    loi = len(missing) + len(mismatch)
    print(f"\n=> MÃ THOÁT {1 if loi else 0}: [THIẾU]={len(missing)} + [LỆCH SỐ]={len(mismatch)} "
          f"là LỖI · [LỆCH NHÃN]={len(lech_nhan)} (thêm ALIAS) và [THÊM]={len(extra)} "
          f"(prompt phủ rộng hơn luật — chủ đích) KHÔNG tính lỗi")
    return 1 if loi else 0


if __name__ == '__main__':
    sys.exit(main())

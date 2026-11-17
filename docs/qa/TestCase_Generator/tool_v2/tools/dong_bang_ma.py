# -*- coding: utf-8 -*-
"""ĐÓNG BĂNG MÃ NGUỒN QUANH MỘT LƯỢT CHẠY LIVE  (§14 của chỉ thị 2026-09-16 lượt 3).

Vì sao cần. Một lượt chạy 3.365 case kéo dài hàng giờ, và trong lúc nó chạy thì người sửa
tool rất dễ *"vá nhanh một dòng"* rồi chạy tiếp. Hậu quả không hiện ra ở đâu cả: file kết
quả trộn bằng chứng của **hai phiên bản mã**, case r10 chấm bằng luật cũ và case r900 chấm
bằng luật mới, mà báo cáo vẫn chỉ có một dòng *"lượt chạy ngày …"*. Không có cách nào phát
hiện sau, vì bằng chứng của cả hai đều hợp lệ.

Khối này chốt mốc mã nguồn TRƯỚC lượt chạy và đối chiếu lại SAU lượt chạy:

    MOC = moc_ma(tools)          # trước khi chạm app
    ...chạy case...
    lech = doi_chieu(MOC, tools) # sau khi chạy xong

`lech` khác rỗng nghĩa là mã đã đổi giữa chừng ⇒ lượt chạy KHÔNG còn chứng minh được nó chạy
trên một phiên bản duy nhất, và báo cáo phải nói ra điều đó thay vì im.

Mốc gồm ba thứ, vì mỗi thứ bắt một lớp thay đổi khác nhau:
  · `sha` nội dung từng file `.py` — bắt mọi sửa nội dung, kể cả sửa rồi sửa lại;
  · `mtime` — bắt cả trường hợp file bị thay bằng bản khác cùng nội dung (chạm vào là thấy);
  · `git` (nhánh + HEAD + trạng thái sạch/bẩn) — để người đọc biết mốc ấy ứng với commit nào.

KHÔNG tự động chặn lượt chạy khi cây mã đang bẩn: bẩn là chuyện bình thường của một nhánh
đang làm việc. Thứ bị cấm là **đổi trong lúc chạy**, và đó là thứ khối này đo được.
"""
import hashlib
import os
import subprocess
import time

BO_QUA = ('__pycache__', 'tu_kiem')


def _sha(duong):
    h = hashlib.sha256()
    with open(duong, 'rb') as f:
        for k in iter(lambda: f.read(65536), b''):
            h.update(k)
    return h.hexdigest()[:16]


def _git(thu_muc, *args):
    try:
        r = subprocess.run(['git', '-C', thu_muc] + list(args),
                           capture_output=True, text=True, timeout=20)
        return r.stdout.strip() if r.returncode == 0 else ''
    except Exception:
        return ''


def moc_ma(thu_muc_tools, gom_tu_kiem=False):
    """Mốc mã nguồn của `tools/` — chụp TRƯỚC khi lượt chạy chạm app.

    `gom_tu_kiem=False` bỏ qua `tu_kiem/`: bộ tự kiểm không nằm trên đường chạy case, và
    sửa nó giữa chừng không làm lệch kết quả của lượt chạy.
    """
    thu_muc_tools = os.path.abspath(thu_muc_tools)
    tep = {}
    for goc, dirs, files in os.walk(thu_muc_tools):
        dirs[:] = [d for d in dirs
                   if d not in BO_QUA or (gom_tu_kiem and d == 'tu_kiem')]
        for ten in sorted(files):
            if not ten.endswith('.py'):
                continue
            p = os.path.join(goc, ten)
            rel = os.path.relpath(p, thu_muc_tools)
            try:
                tep[rel] = {'sha': _sha(p), 'mtime': round(os.path.getmtime(p), 3),
                            'bytes': os.path.getsize(p)}
            except OSError:
                continue
    repo = os.path.dirname(thu_muc_tools)
    return {
        'luc': time.strftime('%Y-%m-%d %H:%M:%S'),
        'thu_muc': thu_muc_tools,
        'so_tep': len(tep),
        'tep': tep,
        'van_tay': hashlib.sha256(
            ''.join('%s:%s' % (k, v['sha']) for k, v in sorted(tep.items())).encode()
        ).hexdigest()[:16],
        'git': {
            'nhanh': _git(repo, 'rev-parse', '--abbrev-ref', 'HEAD'),
            'head': _git(repo, 'rev-parse', '--short', 'HEAD'),
            'ban': bool(_git(repo, 'status', '--porcelain')),
            'so_tep_ban': len([x for x in _git(repo, 'status', '--porcelain').splitlines() if x]),
        },
    }


def doi_chieu(moc, thu_muc_tools=None, gom_tu_kiem=False):
    """So mốc cũ với hiện trạng. -> [{'tep','viec','sha_truoc','sha_sau'}] ([] = không đổi)."""
    if not moc:
        return []
    moi = moc_ma(thu_muc_tools or moc.get('thu_muc'), gom_tu_kiem)
    cu, sau = moc.get('tep') or {}, moi.get('tep') or {}
    ra = []
    for ten in sorted(set(cu) | set(sau)):
        a, b = cu.get(ten), sau.get(ten)
        if a and not b:
            ra.append({'tep': ten, 'viec': 'XOÁ', 'sha_truoc': a['sha'], 'sha_sau': None})
        elif b and not a:
            ra.append({'tep': ten, 'viec': 'THÊM', 'sha_truoc': None, 'sha_sau': b['sha']})
        elif a['sha'] != b['sha']:
            ra.append({'tep': ten, 'viec': 'SỬA', 'sha_truoc': a['sha'], 'sha_sau': b['sha']})
        elif a['mtime'] != b['mtime']:
            # Nội dung y nguyên nhưng file bị chạm vào: chưa làm lệch kết quả, nhưng phải nêu —
            # nó thường là dấu của một lần sửa rồi hoàn nguyên NGAY GIỮA lượt chạy.
            ra.append({'tep': ten, 'viec': 'CHẠM (nội dung không đổi)',
                       'sha_truoc': a['sha'], 'sha_sau': b['sha']})
    return ra


def tom_tat(moc):
    if not moc:
        return '(không chốt mốc mã nguồn)'
    g = moc.get('git') or {}
    return ('%d tệp .py · vân tay %s · nhánh %s @ %s%s'
            % (moc.get('so_tep', 0), moc.get('van_tay'), g.get('nhanh') or '?',
               g.get('head') or '?',
               ' · cây làm việc BẨN (%d tệp)' % g.get('so_tep_ban', 0) if g.get('ban') else ''))

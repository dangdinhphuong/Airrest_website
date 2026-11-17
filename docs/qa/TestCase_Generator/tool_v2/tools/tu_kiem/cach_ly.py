# -*- coding: utf-8 -*-
"""Cách ly môi trường cho bộ tự kiểm — MỘT chỗ duy nhất.

⚠️ Vá 2026-09-17 lượt 2. Mỗi bộ tự kiểm tự chép `dict(os.environ)` rồi tự xoá vài khoá tài
khoản; sáu bản chép tay ấy đã lệch nhau. Từ khi lớp tài khoản đổi sang khuôn `ROLE_*` + tệp
env ngoài repo, không bản nào chặn được **tệp** `~/.config/tool_v2/accounts.env`, nên:

  · `kiem_tai_khoan`   — 4 phép dựng kịch bản *"chỉ có MỘT tài khoản"* vẫn thấy tài khoản thật;
  · `kiem_auto_confirm`— phép *"thiếu tài khoản thì mã thoát ≠ 0"* chạy bằng tài khoản thật;
  · `kiem_chay_live`   — 5 phép đem tài khoản THẬT đi đăng nhập vào APP GIẢ rồi trượt.

Tức là kết quả bộ tự kiểm đổi theo **máy người chạy** chứ không theo mã nguồn: ĐẠT trên máy
chưa cắm credential, HỎNG trên máy đã cắm, cùng một commit. Một bộ kiểm như thế không chứng
minh được gì, và nó hỏng theo hướng tệ nhất — báo đỏ OAN, làm người sửa đi tìm lỗi ở chỗ
không có lỗi.

Luật: **mọi tiến trình con của bộ tự kiểm phải lấy môi trường từ `moi_truong_sach()`.**
"""
import os
import tempfile

# Khoá có thể mang tài khoản: khuôn mới (`ROLE_<VAI TRÒ>_USER`), khuôn cũ (`QA_USER_<…>`),
# và mọi biến do người chạy tự đặt kết thúc bằng `_USER`/`_PASS`.
TIEN_TO_TK = ('ROLE_', 'QA_USER', 'QA_PASS', 'QA_ROLE', 'TOOLV2_')


def moi_truong_sach(goc=None, **them):
    """`os.environ` đã BỎ mọi nguồn tài khoản của máy thật. -> dict.

    `goc` là thư mục tạm của phép kiểm; `TOOLV2_ENV_FILE` trỏ vào một tệp KHÔNG tồn tại trong
    đó. `tai_khoan.duong_tep_env()` khi có khai báo thì chỉ xét đúng tệp ấy chứ không rơi về
    danh sách mặc định, nên lớp tài khoản thành trắng thật — chứ không phải trắng một nửa.
    """
    e = dict(os.environ)
    for k in list(e):
        if k.startswith(TIEN_TO_TK) or k.endswith(('_USER', '_PASS')):
            e.pop(k, None)
    e['TOOLV2_ENV_FILE'] = os.path.join(goc or tempfile.gettempdir(), '_khong-ton-tai.env')
    e.update({k: v for k, v in them.items() if v is not None})
    return e


def don_env_trong_tien_trinh(goc=None):
    """Như trên nhưng áp thẳng vào tiến trình ĐANG chạy (cho phép kiểm gọi hàm trực tiếp)."""
    for k in list(os.environ):
        if k.startswith(TIEN_TO_TK) or k.endswith(('_USER', '_PASS')):
            os.environ.pop(k, None)
    os.environ['TOOLV2_ENV_FILE'] = os.path.join(goc or tempfile.gettempdir(),
                                                 '_khong-ton-tai.env')
    try:
        import tai_khoan
        tai_khoan._CACHE_TEP = None
    except Exception:
        pass
    return os.environ['TOOLV2_ENV_FILE']

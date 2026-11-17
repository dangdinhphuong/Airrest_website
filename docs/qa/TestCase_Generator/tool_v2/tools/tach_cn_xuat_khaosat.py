# -*- coding: utf-8 -*-
"""Tách CN `XUẤT EXCEL DỮ LIỆU PHIẾU` ra khỏi CN `XEM TAB DỮ LIỆU PHIẾU` — file Admin-KhaoSat.

Luật: `prompts/PROMPT-gen-testcase-v3.md` §5 dòng 211 — *NHẬP EXCEL và XUẤT EXCEL là HAI CN RIÊNG*;
cấu trúc CN Xuất (§6): `Giao diện chung` ĐÚNG 2 case (nói về FILE xuất, không phải màn) · Validate
miễn · `Chức năng Xuất excel` ≥5 case (bộ rà `audit_func.XUAT` đòi 7 mục) · ATTT 3 case
(`audit_attt.EXP_`: quyền xuất · file đúng phạm vi · hết phiên).

Xác nhận trên giao diện thật 07/09/2026: toàn cụm Khảo sát có ĐÚNG MỘT nút "Xuất Excel",
ở tab *Dữ liệu phiếu* của màn kết quả (7 tab còn lại và màn danh sách không có nút xuất).

CHUYỂN (không viết lại — luật 8) 4 case sẵn có, tìm theo NỘI DUNG nên không phụ thuộc số hàng:
  · nhóm `Button Xuất Excel` + 2 case (căn lề/chính tả · nút khi đang xử lý)
  · case `Xuất Excel dữ liệu phiếu theo bộ lọc đang đặt` (đang ở `Chức năng Xem tab Dữ liệu phiếu`)
  · case `Kiểm tra dữ liệu tệp xuất khớp dữ liệu trong hệ thống` — đang XẾP SAI ở CN `XUẤT BẢN ĐỢT
    KHẢO SÁT`, và SQL cột C của nó là câu lệnh của xuất-bản; chuyển sang đây + viết lại SQL cho
    đúng ngữ cảnh (đối chiếu bảng `survey_responses`).

    python3 tach_cn_xuat_khaosat.py            # xem trước
    python3 tach_cn_xuat_khaosat.py --apply
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix
import roles
import quota_cases

APPLY = '--apply' in sys.argv
CN_MOI = ('XUẤT EXCEL DỮ LIỆU PHIẾU\n'
          'Tiền điều kiện: đang ở tab Dữ liệu phiếu trên màn kết quả của một đợt khảo sát '
          'đã nhận phản hồi từ nhiều trường.')

# case cần bốc khỏi chỗ cũ — khớp theo tiền tố nội dung cột B
MOVE_BTN = ('Kiểm tra căn lề, chính tả của button',
            'Kiểm tra nút Xuất Excel khi đang xử lý')
MOVE_FN = 'Xuất Excel dữ liệu phiếu theo bộ lọc đang đặt'
MOVE_DB = 'Kiểm tra dữ liệu tệp xuất khớp dữ liệu trong hệ thống'

SQL_DB = ('1. Đặt một tiêu chí lọc rồi bấm nút Xuất Excel, mở tệp vừa tải về.\n'
          '2. Đối chiếu cơ sở dữ liệu bằng câu lệnh:\n'
          '-- Số dòng của tệp xuất phải bằng số phiếu đang lưu của đợt theo cùng bộ lọc\n'
          'select count(*) as so_dong\n'
          'from survey_responses\n'
          "where campaign_id = '<id đợt đang mở>';\n\n"
          '-- Đối chiếu từng dòng: trường, địa bàn, thời điểm gửi\n'
          'select ten_truong, area_key, submitted_at\n'
          'from survey_responses\n'
          "where campaign_id = '<id đợt đang mở>'\n"
          'order by submitted_at desc;')

# 7 mục khối Chức năng — từ khoá bám ĐÚNG `audit_func.XUAT` để sau khi tách bộ rà ra 0
FN_CASES = [
    # "khớp hệ thống" — KHÔNG thêm chữ "với": `audit_func.XUAT` dò cụm liền `khop he thong`
    ('Kiểm tra dữ liệu xuất ra khớp hệ thống về số lượng, sắp xếp và dữ liệu từng bản ghi',
     '1. Trên tab Dữ liệu phiếu, ghi lại số dòng và thứ tự đang hiển thị.\n'
     '2. Bấm nút Xuất Excel.\n3. Mở tệp vừa tải về và đối chiếu với màn hình.',
     'Tệp xuất khớp màn hình về số lượng dòng, thứ tự sắp xếp và dữ liệu của từng bản ghi.'),
    (MOVE_DB, SQL_DB, None),                     # None = giữ cột D của case cũ
    (MOVE_FN, None, None),                       # giữ nguyên cả C và D của case cũ
    ('Kiểm tra chặn xuất khi không có bản ghi nào thoả bộ lọc',
     '1. Đặt bộ lọc cho ra danh sách rỗng.\n2. Bấm nút Xuất Excel.',
     'Hệ thống báo không có dữ liệu để xuất và không tạo tệp rỗng; nút xuất bị vô hiệu '
     'hoặc hiện thông báo tương ứng.'),
    ('Kiểm tra xuất dữ liệu lớn (nhiều bản ghi)',
     '1. Bỏ hết bộ lọc để danh sách có nhiều bản ghi nhất.\n2. Bấm nút Xuất Excel.\n'
     '3. Mở tệp vừa tải về.',
     'Tệp tải xuống thành công, không treo màn và không mất dòng; số dòng khớp tổng số phiếu '
     'của đợt.'),
    ('Kiểm tra giới hạn tần suất xuất khi bấm nhiều lần liên tiếp',
     '1. Bấm nút Xuất Excel, chờ tệp xong.\n2. Lặp lại thao tác nhiều lần liên tiếp.',
     'Hệ thống hoặc phục vụ đủ mọi lần xuất, hoặc chặn kèm thông báo giới hạn tần suất rõ ràng; '
     'không lỗi máy chủ.'),
    ('Kiểm tra khi click liên tục vào nút xuất',
     '1. Bấm liên tục nút Xuất Excel (mỗi nhịp cách nhau dưới một giây).',
     'Hệ thống không gửi yêu cầu nhiều lần cho một lần xuất; không sinh nhiều tệp trùng nhau.'),
]

ATTT_CASES = [
    ('Yêu cầu quyền xuất dữ liệu phiếu',
     '1. Đăng nhập tài khoản KHÔNG có quyền xuất dữ liệu khảo sát.\n'
     '2. Mở tab Dữ liệu phiếu và tìm nút Xuất Excel.\n'
     '3. Gọi thẳng API xuất bằng tài khoản này.',
     'Nút Xuất Excel không hiển thị; gọi thẳng API bị chặn ở máy chủ và trả lỗi không đủ quyền.'),
    ('Tệp xuất chỉ chứa dữ liệu thuộc phạm vi quyền được cấp',
     '1. Đăng nhập tài khoản chỉ được cấp quyền trên một địa bàn.\n'
     '2. Xuất Excel rồi mở tệp.',
     'Tệp chỉ chứa phiếu của địa bàn được cấp quyền, không lộ phiếu của địa bàn khác.'),
    ('Thao tác khi hết phiên',
     '1. Để màn mở tới khi phiên hết hạn.\n2. Bấm nút Xuất Excel.',
     'Hệ thống không tải tệp, chuyển về màn đăng nhập hoặc báo phiên hết hạn; không rò dữ liệu.'),
]


def main():
    p = roles.get('Admin')['dir'] + 'Testcase-Role-Admin-KhaoSat.xlsx'
    base = os.path.basename(p)
    if os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % base)):
        sys.exit('DỪNG: file đang mở trong LibreOffice')
    tc = tcfix.load(p)

    drop = set()
    old = {}
    cn = grp = None
    cur_btn = False
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '')
        head = b.split('\n')[0].strip()
        if lv == 'cn':
            cn, cur_btn = head, False
            continue
        if lv in ('grp', 'sub', 'sub2'):
            grp = head
            cur_btn = head == 'Button Xuất Excel'
            if cur_btn:
                drop.add(rn)                      # bỏ luôn dòng nhóm ở chỗ cũ
            continue
        # case
        if cur_btn and head in MOVE_BTN:
            old[head] = (head, tc.c(rn, 'C') or '', tc.c(rn, 'D') or '')
            drop.add(rn)
        elif head in (MOVE_FN, MOVE_DB):
            old[head] = (head, tc.c(rn, 'C') or '', tc.c(rn, 'D') or '')
            drop.add(rn)
            print('   bốc "%s" khỏi CN %s / %s' % (head[:44], cn[:24], grp[:26]))

    missing = [k for k in list(MOVE_BTN) + [MOVE_FN, MOVE_DB] if k not in old]
    if missing:
        sys.exit('DỪNG: không tìm thấy case cần chuyển: %s' % missing)
    print('   gỡ %d dòng ở chỗ cũ (1 dòng nhóm + %d case)' % (len(drop), len(drop) - 1))

    n_new = 2 + len(MOVE_BTN) + len(FN_CASES) + len(ATTT_CASES)
    print('   CN mới: Giao diện chung 2 · Button Xuất Excel %d · Chức năng %d · ATTT %d = %d case'
          % (len(MOVE_BTN), len(FN_CASES), len(ATTT_CASES), n_new))
    if not APPLY:
        print('\n(xem trước, chưa ghi)')
        return

    pl = tcfix.Plan(tc)
    for rn in tc.order:
        if rn >= 12 and rn not in drop:
            pl.keep(rn)
    # ── CN mới, đặt ở cuối file ────────────────────────────────────────────────
    pl.add_cn(CN_MOI)
    pl.add_grp('Giao diện')
    pl.add_sub('Giao diện chung')
    for _k, md, buoc, kq in quota_cases.EXPORT_GDC:
        pl.case(md, buoc, kq)
    pl.add_sub('Button Xuất Excel')
    for k in MOVE_BTN:
        pl.case(*old[k])
    pl.add_grp('Chức năng')
    pl.add_sub('Chức năng Xuất excel')
    for md, buoc, kq in FN_CASES:
        o = old.get(md)
        pl.case(md, buoc if buoc is not None else o[1], kq if kq is not None else o[2])
    pl.add_grp('An toàn thông tin')
    for md, buoc, kq in ATTT_CASES:
        pl.case(md, buoc, kq)
    tc.rebuild(pl).save(quiet=True, sync=True)
    print('\nĐÃ GHI: tách CN XUẤT EXCEL DỮ LIỆU PHIẾU (+%d case, gỡ %d dòng cũ)'
          % (n_new, len(drop)))


if __name__ == '__main__':
    main()

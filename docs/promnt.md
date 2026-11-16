Hãy cập nhật khóa luận AIRREST cho khớp với mã nguồn hiện tại. Trả lời bằng tiếng Việt.

## Đầu vào
- Mã nguồn: dotnet/apps/newsroom-planning/dev-self-test-reports/Airrest_website/ (backend/, apps/web/, packages/)
- Tài liệu cần sửa: .../docs/KLTN.IT63.Nhom9.AIRREST_SUA_DO.docx
- Luồng/chức năng thay đổi (nếu tôi nêu): <MÔ TẢ NGẮN HOẶC "tự phát hiện bằng so sánh">

## Bước 1: Tìm điểm khác biệt giữa mã và tài liệu
1. Đọc tài liệu bằng cách giải nén word/document.xml (máy không có pandoc).
   Lập danh sách: FR-xx, UC-xx, DFD mức 1 (tiến trình 1–9), ERD (Hình 5.8–5.12),
   sơ đồ tuần tự (Hình 5.4–5.7), Bảng 4.12 (FR theo mã nguồn), Bảng 6.2 (phân hệ).
2. Đọc mã nguồn, không đoán từ tên file:
   - backend/api/modules/* và services/* (route, nghiệp vụ, quyền)
   - backend/database/migrations/* (bảng, cột mới)
   - backend/config/roles.ts, permissions.ts (vai trò, quyền)
   - backend/api/realtime/* (sự kiện socket)
   - apps/web/src/screens và components (màn hình mới)
   - git log và git diff (nếu repo cho phép; Airrest_website nằm ngoài git nên so
     sánh ngày sửa file với ngày tài liệu)
3. Lập bảng khác biệt: chức năng/bảng/route có trong mã mà chưa có trong tài liệu,
   và ngược lại. Mỗi dòng ghi file:dòng làm bằng chứng. Chưa sửa gì.
4. DỪNG và đưa bảng cho tôi xác nhận trước khi sửa.

## Bước 2: Sửa tài liệu (sau khi tôi xác nhận)
- KHÔNG ghi đè file gốc. Lưu bản mới: KLTN.IT63.Nhom9.AIRREST_SUA_DO_v<N>.docx.
- Nội dung mới hoặc sửa: chữ đỏ (FF0000). Nội dung cũ lỗi thời: đỏ gạch ngang,
  chuyển vào Phụ lục A. Thêm dòng ghi chú "[Sửa đổi] ..." ngay tại chỗ.
- Cập nhật theo chuỗi truy vết, không bỏ khâu nào:
  FR (Bảng 4.11, 4.12) → Use case (Bảng 4.13) → BFD (Hình 4.3–4.6)
  → DFD ngữ cảnh (Hình 4.7: mỗi luồng vào/ra là một mũi tên riêng, có nhãn riêng)
  → DFD mức 0 (Hình 4.8) → DFD mức 1 (số sơ đồ mức 1 = số tiến trình mức 0)
  → kho dữ liệu (Bảng 4.15) → ERD (Hình 5.8–5.12) → sơ đồ tuần tự (nếu là luồng lõi)
  → sitemap (Bảng 5.5) → ma trận truy vết (Bảng 4.16) → kiểm thử (Bảng 6.3–6.5).
- Mã FR/UC mới đánh tiếp số cuối cùng, không đổi mã cũ.
- Vẽ lại sơ đồ bị ảnh hưởng. Nếu script vẽ (dfd1.py, others.py, ...) còn thì chạy
  lại; nếu mất thì vẽ bằng cách khác, nhưng giữ đúng quy tắc DFD ở trên.
- Cập nhật mục "Phần thật và phần mô phỏng" (Bảng 4.0) nếu luồng mới có phần mô phỏng.
- Chạy lại typecheck và test. Ghi số liệu THẬT vào Bảng 6.3–6.5, kể cả test lỗi
  hoặc test không chạy được. Không viết "toàn bộ test đạt" khi chưa chạy.
- Ảnh chụp giao diện: chỉ dùng ảnh có sẵn hoặc ảnh tôi cung cấp; không tự bịa.

## Bước 3: Kiểm tra trước khi báo xong
- Xuất PDF bằng soffice, mở các trang đã sửa và nhìn bằng mắt.
- Cập nhật bảng "Ghi chú sửa đổi" ở đầu tài liệu (đã sửa gì, ở mục/hình nào).
- Báo cáo ngắn: đã sửa gì, chưa xác nhận gì, rủi ro. Nêu rõ phần nào là
  "đọc mã suy ra" và phần nào đã chạy thật.

## Ràng buộc
- Không sửa mã nguồn, không chạy lệnh ghi vào DB thật (.env trỏ Supabase).
  Test tích hợp chỉ chạy bằng Postgres nhúng (RUN_DB_TESTS=1, không đặt TEST_DATABASE_URL).
- Không dùng git commit/pull/push ở Airrest_website.
- Mục lục, số bảng, số hình để người dùng tự cập nhật bằng Ctrl+A, F9.

# RISKS — Rủi ro nâng cấp responsive / mobile UX / PWA

Mức: **Cao / Trung / Thấp**. Nguồn: [SRC] đã kiểm source · [AGENT] subagent báo · [PLAT] nền tảng, chưa kiểm.

## 1. Rủi ro dự án / quy trình

| ID | Rủi ro | Mức | Bằng chứng | Giảm thiểu |
|---|---|---|---|---|
| R-01 | **Hai bản `Airrest_website` đã phân kỳ** (169 file chỉ ở một bên, 268 file khác nội dung). Triển khai ở bản này có thể không vào bản kia | Cao | `diff -rq` [SRC] | Chủ sản phẩm chốt bản nguồn trước khi triển khai |
| R-02 | **Thư mục bị `.gitignore` của repo cha** (`.gitignore:41`) → sửa code và các báo cáo này **không vào git**, không có lịch sử/PR | Cao | `git check-ignore` [SRC] | Quyết định vị trí lưu trữ/versioning trước khi sửa |
| R-03 | Giả định "nhân sự dùng điện thoại" chưa có bằng chứng → có thể làm bottom nav cho nhóm không cần | Trung | Code chỉ có permission, không có mô tả người dùng [SRC] | Hỏi chủ sản phẩm; làm theo dữ liệu sử dụng |
| R-04 | Không có test e2e/viewport; audit này chưa chạy trình duyệt | Trung | [SRC] | Phase 5; dựng bộ ảnh chụp viewport trước khi sửa để có đường chuẩn |

## 2. Rủi ro kỹ thuật

| ID | Rủi ro | Mức | Bằng chứng | Giảm thiểu |
|---|---|---|---|---|
| T-01 | **Hai hệ CSS, breakpoint lệch**; gộp mốc có thể đổi layout ở 720–1100px | Trung | `styles.css` 11 mốc vs Tailwind 640/768/1024 [SRC] | Gộp từng khối, chụp trước/sau |
| T-02 | Nâng touch target lên 44px có thể làm vỡ layout dày (bảng, toolbar) | Trung | `.btn` 44→40 (`styles.css:67,556`) [SRC] | Chỉ áp ≤1023px; hoặc mở rộng vùng chạm bằng pseudo-element |
| T-03 | Bảng→thẻ thiếu `data-label` → ô mất ngữ cảnh | Trung | td > data-label ở `Bookings`, `Rooms`, `Fleet`, `Shuttle` [SRC đếm] | Rà từng bảng |
| T-04 | `:has([data-testid="room-row"])` làm logic layout phụ thuộc test id; `:has()` ở trình duyệt cũ | Thấp | `user.css:10-13` [SRC] | Thay bằng attribute riêng |
| T-05 | Bảng phụ thuộc `100vh`/safe-area trên iOS chưa kiểm chứng | Thấp | [AGENT] | Dùng `dvh`; thử máy thật |
| T-06 | Bỏ CSS chết có thể xoá nhầm lớp được dùng động (ghép chuỗi) | Thấp | `rg` chỉ tìm chuỗi tĩnh [SRC] | Xoá theo lô nhỏ, kiểm bằng ảnh chụp |
| T-07 | Hash-routing + `start_url` + `/payment/result` (đường dẫn thật, không hash) dễ xung đột phạm vi SW | Trung | `store.jsx:40-56` [SRC] | Loại `/payment/result` khỏi mọi fallback điều hướng; test luồng VNPay/MoMo |
| T-08 | Precache nhầm `public/ocr` (23MB, 3 biến thể core) làm nặng lần cài đầu và vượt quota iOS | Trung | `du -sh` [SRC] | Không precache; runtime cache theo nhu cầu |
| T-09 | Vá tạm `window.fetch` để lấy token (`useRealtime.js`) có thể xung đột với lớp chặn fetch mới | Thấp | [AGENT] | Không thêm interceptor trong trang; SW không chạm vào phần này |

## 3. Rủi ro bảo mật

| ID | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| S-01 | **Cache nhầm API có Bearer** → rò dữ liệu giữa người dùng trên thiết bị dùng chung; Cache Storage không tự xóa khi logout | **Cao** | Allowlist GET công khai; mặc định NetworkOnly; xóa cache khi logout nếu có |
| S-02 | **`sw.js`/`index.html` bị cache HTTP/CDN** → client kẹt bản cũ | **Cao** | `headers: Cache-Control: no-cache` trong `render.yaml` (hiện chưa có khối `headers:`) |
| S-03 | PII (họ tên + SĐT) còn trong `localStorage` sau logout (`airrest.guest`, `airrest.cart`) | Trung | Quyết định riêng (ngoài phạm vi): xóa khi logout; PWA làm dữ liệu bền hơn |
| S-04 | Token Bearer 1h, không refresh, không CSP cho web tĩnh; XSS đọc được `sessionStorage` | Trung | Ngoài phạm vi audit; cân nhắc CSP khi có SW |
| S-05 | Opaque response cross-origin (R2, fonts, tiles) phình quota; ToS tile OSM cấm tải trước hàng loạt | Thấp–Trung | Không cache tile; chỉ cache cross-origin có CORS |
| S-06 | Ảnh vé máy bay (OCR cục bộ) lọt vào cache/IndexedDB | Trung | Không đưa ảnh vào bất kỳ storage nào; kiểm tra khi code review |
| S-07 | Cập nhật SW tự reload giữa lúc thanh toán → mất phiên nhân sự trong bộ nhớ | Trung | `registerType: prompt`, chặn tải lại khi đang giao dịch |

## 4. Rủi ro tương thích

| ID | Rủi ro | Nền tảng | Ghi chú |
|---|---|---|---|
| C-01 | Không có `beforeinstallprompt`; cài thủ công; cần icon/meta iOS riêng | iOS | [PLAT]; repo thiếu icon/meta [SRC] |
| C-02 | `env(safe-area-inset-*)` = 0 nếu thiếu `viewport-fit=cover` | iOS | [SRC] `index.html:5` |
| C-03 | Safari có thể xóa dữ liệu script sau ~7 ngày không dùng với site chưa cài; cache OCR có thể mất | iOS | [PLAT] |
| C-04 | Camera (`getUserMedia`) trong standalone từng có lỗi cũ | iOS | [PLAT] — phải thử máy thật |
| C-05 | Thanh toán redirect (VNPay/MoMo) có thể mở ngoài scope hoặc overlay trong standalone | Cả hai | [PLAT] + `store.jsx:40` [SRC] |
| C-06 | Push: iOS chỉ khi đã cài và ≥16.4; backend **chưa có** hạ tầng push (VAPID, subscription) | iOS/Android | [SRC] backend; ngoài phạm vi, cần backend mới |
| C-07 | Phiên nhân sự mất khi app bị đóng/nền bị hệ điều hành thu hồi | Cả hai | [SRC] `api.js:16`; là thiết kế bảo mật hiện tại |
| C-08 | Tablet 768–1023 vẫn là drawer, khác nhánh người dùng | — | [AGENT] |

## 5. Rủi ro khi nâng cấp (hồi quy)

- **Desktop:** mọi thay đổi bọc trong breakpoint; mốc 720 → 768 là điểm có thể đổi hành vi ở 720–767px.
- **Phân quyền:** bottom nav mới phải lấy từ `visibleTabs`; sai chỗ có thể hiện tab người dùng không có quyền (backend vẫn chặn, nhưng UI sai).
- **Test hiện có:** `data-testid` được dùng cho cả test và CSS (`:has`); đổi tên sẽ vỡ một trong hai.
- **SW một khi đã đăng ký rất khó gỡ khỏi máy người dùng:** cần sẵn kế hoạch "kill switch" (SW tự hủy đăng ký) trước khi phát hành.

## 6. Điều chưa xác minh

Chưa chạy trình duyệt/thiết bị; chưa kiểm header thực tế của Render; chưa kiểm router backend; chưa đọc kỹ `Home.jsx`, `Pages.jsx`, `Login.jsx`, `Stays.jsx`.

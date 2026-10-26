# Implementation Report — Airrest MVP UI

Ngày 2026-10-26. Phạm vi: `go/apps/manufacture/test/Airrest_website`. Không sửa `docs/MVP.md`, `docs/srs/`, không có backend, không gọi dịch vụ ngoài. SRS đang **Not Ready** (7 quyết định P0 chưa chốt), nên bản này là **prototype có phần mô phỏng**, không phải bản sẵn sàng phát hành.

## 1. Màn hình đã triển khai

M0 tra cứu / nhập thủ công (`#/home`), M1 tình trạng + quyền lợi tham khảo, M2 gợi ý ở lại hay đi nghỉ, M3 danh sách nơi nghỉ + chip lọc, M4 chi tiết, M5 đặt chỗ 3 bước, M6 nhắc giờ, M7 thông tin nhà ga (một phần), M8 trợ giúp giản lược, M9 đề nghị hãng hỗ trợ (luồng L2). Điều hướng bằng trạng thái React, đồng bộ với hash để nút Quay lại của trình duyệt hoạt động; không thêm dependency.

## 2. Yêu cầu được hiện thực hóa

Ánh xạ chi tiết ở `SCREEN_REQUIREMENTS_MAP.md`. Tóm tắt: FR-001…FR-004, FR-006…FR-016, FR-019…FR-023 (theo trạng thái đề xuất), FR-005 và FR-017/FR-018 ở mức khung/giản lược; BR-001…BR-005, BR-008…BR-013; DR-001…DR-009 (dạng mock); NFR-001, NFR-002 (một phần), NFR-004, NFR-005, NFR-006, NFR-007 (NFR-008 chỉ ở mức khung), NFR-009; IFR-001, IFR-002.

## 3. Cách đã kiểm tra

Chạy ứng dụng bằng Vite dev server (cổng **5199**, vì cổng 5173 đang do một tiến trình khác chiếm; mình không động tới tiến trình đó) và điều khiển Google Chrome thật (headless) bằng `playwright-core` cài tạm ngoài repository. Kịch bản kiểm thử nằm ngoài repo (thư mục tạm của phiên), không đưa vào dự án.

| Nhóm | Kết quả |
|---|---|
| Tổng số kiểm tra tự động trong trình duyệt | **103/103 PASS** (lần chạy cuối, sau khi thêm bản đồ; trước đó 86/86 và 73/73) |
| Console | Không có lỗi/pageerror (đã sửa một lỗi 404 favicon bằng favicon nội tuyến) |
| Yêu cầu mạng | Không có yêu cầu nào tới host ngoài localhost, **ngoại trừ ô bản đồ từ `tile.openstreetmap.org` khi trang có bản đồ** (xem mục 9c). Trong kiểm thử, ô bản đồ được giả lập bằng ảnh 1×1 nên **chưa xem được bản đồ OSM thật** |
| Không cuộn ngang | 360 px và 768 px: M0–M6 và M9 ở 360 px; 1280 px: toàn luồng L1 |
| Vùng chạm ≥24×24 px | PASS ở 360 và 768 px |
| Thời gian tra cứu | Thẻ trạng thái hiện sau ~1,0 giây (đo cả thao tác nhập; độ trễ mock 350 ms) |
| Ảnh chụp | Ảnh trong `reports/ui_implementation/screenshots/` (desktop, tablet 768, mobile 360); ảnh trước khi đổi kiểu Couppa ở `screenshots-before-couppa/` |

Các luồng đã chạy thật: validation biểu mẫu; không tìm thấy; lỗi dịch vụ + Thử lại (dữ liệu nhập giữ nguyên); đang tải; L1 đầy đủ M0→M6 với VN218 (giá tổng nhất quán ở danh sách, chi tiết, đặt chỗ); chip lọc và trạng thái rỗng; không chấp nhận số điện thoại/email trong tên gọi; ≥2 cách trả; phòng vừa hết lúc xác nhận (không tạo mã); tải tệp .ics; bật nhắc giờ; giờ bay đổi (banner, tính lại giờ rời); tới giờ rời; L2 với 4 kịch bản (duyệt, từ chối, cơ sở hết phòng với ≤3 đề xuất, không phản hồi quá hạn); chuyển tự chi trả giữ mã và bộ lọc; M7 HAN/SGN; M8 không có số điện thoại; nguyên nhân chưa rõ / ngoài kiểm soát không kết luận; chuyến đúng giờ không gợi ý lưu trú; nhập thủ công và “chưa biết giờ”; cấp quyền thông báo.

## 4. Dữ liệu và dịch vụ mô phỏng

| Thành phần | Mô tả | Tệp |
|---|---|---|
| D1 chuyến bay | 20 chuyến tổng hợp, kịch bản L2 theo chuyến bay; mã `ER500` cố ý gây lỗi dịch vụ | `src/mock/flights.js` |
| D3 cơ sở lưu trú | 34 cơ sở **tổng hợp** (HAN 20, SGN 14), không dùng bản ghi A08 (D-23 phương án B); 1 cơ sở mỗi sân bay “vừa hết phòng khi xác nhận” | `src/mock/properties.js` |
| Mock service | Bất đồng bộ, độ trễ 350 ms, không gọi mạng; có công tắc mô phỏng lỗi | `src/mock/service.js` |
| Phản hồi hãng/cơ sở (L2) | Trạng thái suy ra từ giờ mô phỏng và kịch bản chọn trước | `src/lib/request.js` |
| Giờ mô phỏng, đổi giờ bay, lỗi dịch vụ | Chỉ có trong khung “Công cụ mô phỏng (chỉ để demo)”, không phải tính năng cho người dùng cuối | `src/components/SimTools.jsx` |
| Nội dung quyền lợi tham khảo | Cấu hình, không hard-code trong giao diện; có nguồn, ngày hiệu lực, ngày truy cập; gắn nhãn “Chờ PO duyệt” | `src/config/rights.js` |

Mọi nơi hiển thị dữ liệu mô phỏng đều có nhãn “Mô phỏng” hoặc “Dữ liệu mô phỏng”. Không có phần nào giả vờ kết nối hãng hay xác minh quyền lợi thật.

## 5. Chưa triển khai và lý do

| Nội dung | Lý do |
|---|---|
| Quyền lợi cụ thể được khẳng định (AC-010) | MB-03 Blocked; AC TBD |
| Giá, giờ mở, ngày cập nhật của tiện ích nhà ga (AC-033 đầy đủ) | D-09 Blocked, thiếu nguồn |
| Nhắc nền khi đóng trang | D-03* Blocked, cần máy chủ push |
| Số điện thoại/chat hỗ trợ | MB-10: không giả hotline |
| Hủy đặt chỗ, chứng từ, bản đồ, “Lưu nơi nghỉ”, tài khoản | Ngoài MVP hoặc đã loại |
| Ngưỡng khả dụng (AC-050, AC-052), công thức giá trị số (AC-012, AC-030) | TBD, chờ PO |

## 6. Quyết định còn chờ PO (ảnh hưởng giao diện)

P0: D-01 (điều kiện L2, hiện là thông tin không chặn), D-10 (quy tắc “chưa rõ nguyên nhân”, hiện theo chữ MVP), D-13 (gỡ Blocked MB-03/MB-20), OQ-04 (công thức giờ), OQ-08 (state machine L2), OQ-14, OQ-20. Phần giao diện phụ thuộc đều dùng khung trung lập hoặc tham số mô phỏng ghi rõ; khi PO chốt chỉ cần đổi cấu hình hoặc cập nhật `lib/request.js`, `config/rights.js`.

## 7. Build, lint, type-check

| Kiểm tra | Kết quả |
|---|---|
| `npm install` | Chạy được (21 gói); `package.json` và `package-lock.json` không đổi |
| `npm run build` | Thành công (JS 229,8 kB / gzip 69,7 kB; CSS 15,5 kB) |
| Lint | **Không chạy**: dự án không có script/công cụ lint |
| Type-check | **Không chạy**: dự án dùng JavaScript, không có TypeScript |
| Kiểm thử browser | 73/73 PASS (mục 3) |

## 8. Giới hạn của việc kiểm thử (không báo thành công quá mức)

- Chỉ Chrome headless trên Linux; chưa thử Firefox, Safari, thiết bị thật.
- **Không đo** tương phản WCAG (AC-053 phần 4,5:1), Lighthouse (AC-055), SUS/khả dụng với người dùng thật (AC-050).
- Thông báo trình duyệt: đã kiểm tra trạng thái quyền (bị từ chối / đã cấp) nhưng **chưa xác nhận** thông báo hiển thị thật; ở headless quyền mặc định là bị từ chối.
- Tệp .ics: đã kiểm tra cấu trúc, **chưa** kiểm tra báo thức trong ứng dụng lịch thật.
- Nội dung quyền lợi tham khảo lấy từ văn bản đã đọc ở các phiên SRS (một phần PDF ảnh quét cần đối chiếu độc lập — xem `docs/srs/READINESS_AUDIT.md` AUD-04); giao diện không nên được dùng làm nguồn pháp lý.
- Thời gian ≤3 giây (AC-054) đo bằng mock có độ trễ 350 ms, không phải 4G thật.

## 9. Tệp đã thay đổi

Mới hoặc ghi lại: `index.html` (favicon nội tuyến), `src/main.jsx`, `src/App.jsx`, `src/styles.css`, `src/config/{simulation,rights}.js`, `src/lib/{domain,ics,request,time}.js`, `src/mock/{flights,properties,service}.js`, `src/state/store.jsx`, `src/components/{Common,FlightStatusCard,Layout,PropertyCard,SimTools}.jsx`, `src/screens/{Home,Status,Advice,Stays,Detail,Booking,Reminder,Terminal,Support,Request}.jsx`, `reports/ui_implementation/*`.

Prototype gốc (`src/main.jsx`, `src/styles.css`) đã bị thay theo phương án đã thống nhất (tách component, giữ ngôn ngữ thiết kế). Vì `test/` bị Git bỏ qua, bản gốc được lưu ở `reports/ui_implementation/prototype-backup/`. Khác prototype gốc: bỏ import Google Fonts (không gọi ra ngoài), bỏ ảnh khách sạn thật, bỏ các phần tử ngoài MVP (xem mục 5). Ảnh `public/images/hanoi-night.jpg` được giữ cho trang chủ.

Không thay đổi: `docs/MVP.md`, `docs/srs/`, `BTHQUAN/`. `package.json` và `package-lock.json` đã đổi để thêm thư viện `leaflet` (mục 9c). `node_modules/` được tạo bởi `npm install` (Git bỏ qua).

## 9b. Cập nhật giao diện theo kiểu Couppa (lần 2)

Yêu cầu: bố cục giống trang chủ `HomePageV2` của app Couppa, trang chủ là `#/stays`; font, màu, icon giữ nguyên. Chỉ đọc mã Couppa để học bố cục; không sao chép mã hay tài sản, không thêm dependency (CSS thuần).

| Hạng mục | Thay đổi |
|---|---|
| Khung trang | Header (logo, chọn sân bay, ô tìm số hiệu chuyến bay), thanh icon bên trái 88 px (desktop), nội dung giữa, panel chi tiết bên phải 400 px (desktop), thanh điều hướng dưới (mobile) |
| Trang chủ | `#/stays` là trang đầu: banner, chip lọc, lưới thẻ nơi nghỉ kiểu `DealCardV2` (vùng hình gradient + icon, ribbon “Gần nhất”, chân thẻ có giá) |
| Chi tiết nơi nghỉ | Desktop: panel phải ngay trên trang chủ; mobile: trang riêng như trước |
| Tra cứu chuyến bay (M0) | Chuyển thành trang `#/home` trong khung mới, vào qua header, thanh bên hoặc nút “Nhập chuyến bay của bạn” |
| Công cụ mô phỏng | Thu gọn thành nút tròn ở góc dưới trái, tự đóng khi bấm ra ngoài hoặc Esc; có chấm đỏ khi đang mô phỏng lỗi |
| Giữ nguyên | Bảng màu xanh, font hệ thống, icon `lucide-react`, mọi nội dung nghiệp vụ, nhãn “Mô phỏng”, dữ liệu mock |

**Thay đổi so với MVP (cần PO biết):** MVP đặt lối vào luồng L1 là M0 (tra cứu chuyến bay). Theo yêu cầu, lối vào mặc định nay là M3 ở **chế độ duyệt**: chưa có chuyến bay thì danh sách tính theo giờ mô phỏng mặc định 23:08 (giả định, chưa duyệt), xem được chi tiết; muốn đặt chỗ, tính giờ nghỉ/giờ rời, nhắc giờ hoặc dùng luồng L2 thì phải nhập chuyến bay (nơi nghỉ đã chọn được giữ lại). Không thêm tính năng hay AC mới; các quyết định D-01…D-24 không đổi.

Kiểm thử bổ sung (T8): trang chủ mặc định là `#/stays`; bố cục 3 cột; chế độ duyệt; đổi sân bay HAN/SGN; panel chi tiết; đặt chỗ yêu cầu nhập chuyến bay và quay lại đúng nơi nghỉ; sidebar vô hiệu mục cần chuyến bay; ô tìm kiếm header điền sẵn số hiệu; mobile ẩn sidebar, hiện thanh dưới, không cuộn ngang ở 360 và 768 px. Trong lúc đó phát hiện và sửa hai lỗi bố cục thật: header tràn ngang 9–29 px ở 360 px, và khung công cụ mô phỏng che nút trong panel chi tiết.

Tệp đã đổi thêm: `src/App.jsx`, `src/styles.css`, `src/state/store.jsx`, `src/config/simulation.js` (thêm `BROWSE_NOW`), `src/components/{Layout,PropertyCard,SimTools,Common}.jsx`, `src/screens/{Stays,Detail,Home,Terminal,Support}.jsx`.

## 9c. Bản đồ OpenStreetMap (lần 3, theo yêu cầu làm giống Couppa)

Couppa dùng Leaflet 1.9.4 với ô bản đồ OpenStreetMap và ghim `divIcon` hiển thị giá; Airrest làm theo cách đó (thêm đúng phiên bản `leaflet@^1.9.4`, tương thích React 18, CSS thuần, không thêm thư viện khác; không dùng Nominatim, cụm ghim hay định tuyến của Couppa).

| Hạng mục | Nội dung |
|---|---|
| Bố cục | ≥1360 px: danh sách | chi tiết (khi chọn) | bản đồ. 1024–1359 px: danh sách | bản đồ, chi tiết thay danh sách (có nút đóng). <1024 px: hai tab “Danh sách / Bản đồ”, chi tiết là trang riêng |
| Ghim | Hiển thị giá (ví dụ 740k); bấm ghim → tô ghim, mở thẻ nổi, đồng bộ danh sách/chi tiết; chọn từ danh sách cũng tô ghim |
| Lọc và sắp xếp | 4 chip hiện có + “Gần nhất” (mặc định, theo AC-017) và “Xếp hạng” nằm trên bản đồ (desktop) hoặc đầu danh sách (mobile) |
| Vị trí | Hai sân bay dùng tọa độ thật làm tâm. **Vị trí từng nơi nghỉ là tổng hợp** (cách sân bay đúng `distanceKm` theo góc cố định), có ghi chú “minh họa (mô phỏng), không phải địa chỉ thật” trên bản đồ. Không dùng định vị người dùng |
| Ghi công | Hiển thị “© OpenStreetMap contributors” (Leaflet) |

**Các điểm lệch cần PO biết (đã được yêu cầu làm, chưa được phê duyệt):**
1. **MB-15 “Đã loại”:** bản đồ (FR-09) là tính năng đã loại khỏi MVP; bản đồ này là mở rộng theo yêu cầu của người dùng, chưa phải yêu cầu đã duyệt.
2. **AC-063 / IFR-001** (“không có lời gọi tới hệ thống bên ngoài”): trang có bản đồ tải ô bản đồ từ máy chủ OpenStreetMap; địa chỉ IP người dùng được gửi tới OSM. Nếu muốn giữ đúng AC-063, cần bỏ bản đồ thật hoặc dùng sơ đồ ngoại tuyến. Chính sách sử dụng ô OSM (lưu lượng thấp, có ghi công) cần được xem lại trước khi triển khai thật.
3. **Dữ liệu giả trên bản đồ thật:** các ghim là cơ sở mô phỏng đặt trên bản đồ thật; đã ghi chú nhưng vẫn có thể gây hiểu nhầm.
4. Không thay đổi SRS; không thêm AC; không có định vị, chỉ đường hay gọi xe (cùng nhóm MB-15).

Kiểm thử bản đồ (T9, ô bản đồ được giả lập): ghim bằng số nơi nhận khách; ghi công OSM; ô chỉ tải từ `tile.openstreetmap.org`; trang tra cứu không tải ô; chọn ghim ↔ danh sách ↔ chi tiết; chip lọc giảm ghim; sắp xếp Xếp hạng/Gần nhất; đổi sân bay đổi ghim; không có nút định vị; mobile có hai tab, không cuộn ngang, ghim → thẻ nổi → chi tiết. Phát hiện và sửa: bản đồ dựng khi đang ẩn (tab mobile) bị lệch khung nhìn; ghim trên mobile mở thẳng trang chi tiết thay vì thẻ nổi; popup bị cắt mép; hai ô thống kê nay rộng đủ hàng; thanh tìm kiếm chỉ còn một khung viền khi focus; banner và thẻ nơi nghỉ được thu gọn.

Tệp đã thêm: `src/components/StaysMap.jsx`, `src/lib/useBreakpoint.js`; đã đổi: `src/screens/Stays.jsx`, `src/components/PropertyCard.jsx`, `src/mock/properties.js` (tọa độ tổng hợp), `src/App.jsx`, `src/styles.css`, `package.json`, `package-lock.json`.

## 10. Vấn đề còn lại và bước tiếp theo

1. PO trả lời 7 quyết định P0 (xem `docs/srs/PRODUCT_DECISION_REGISTER.md`), sau đó cập nhật cấu hình/trạng thái L2.
2. Quyết định có giữ bản đồ thật hay không (mâu thuẫn MB-15 và AC-063, mục 9c).
2b. Đối chiếu độc lập nội dung quyền lợi với bản Công báo trước khi bỏ nhãn “Chờ PO duyệt”.
3. Đo tương phản, Lighthouse và kiểm thử khả dụng với người dùng thật; thử Firefox/Safari.
4. Thử tệp .ics trong ứng dụng lịch thật và quyết định có cần nhắc nền (cần hạ tầng push).
5. Cân nhắc thêm lint (ESLint) nếu nhóm muốn kiểm tra tĩnh; hiện chưa có trong dự án.
6. Cổng 5173 mặc định của Vite đang bị tiến trình khác chiếm trên máy này; dùng `npm run dev -- --port <cổng khác>` khi cần.


## 9d. Ba tác nhân: khách sạn (gồm lái xe), quản trị, người dùng cuối (ngoài MVP, Proposed)

Theo chỉ đạo của chủ sản phẩm ngày 26/10/2026 (SRS v0.6, mục 3.6). Triển khai theo các phương án khuyến nghị A của D-25…D-29, **chưa được PO phê duyệt**.

**Đã làm**
- Đăng nhập mô phỏng `#/login` (M12): 3 vai trò, chọn tài khoản có sẵn; không mật khẩu, không dữ liệu cá nhân; tài khoản bị khoá không vào được. Phân quyền: chưa đăng nhập → yêu cầu đăng nhập; sai vai trò → “không có quyền” (BR-015).
- Khu vực khách sạn `#/hotel` (M10): quản lý khách sạn sửa hồ sơ (giờ nhận khách cuối, lễ tân 24/24, huỷ, trả tại nơi nghỉ, xe đưa đón), phòng và giá, xử lý đặt chỗ (từ chối kèm lý do); lái xe chỉ có tab Đón khách (nhận chuyến → đang đến → đã đón → hoàn tất, hoặc không đón được kèm lý do).
- Khu vực quản trị `#/admin` (M11): cơ sở (khoá/kích hoạt có cảnh báo khi còn đặt chỗ, thêm cơ sở), tài khoản (tạo, khoá), tham số mô phỏng (5 tham số, giờ có mặt không dưới 40 phút) và nội dung (quyền lợi vẫn Chờ PO duyệt), giám sát, nhật ký và thống kê (BR-017).
- Người dùng cuối thấy tác động: cơ sở khoá/hết phòng biến khỏi danh sách; giá và hồ sơ đổi; đặt chỗ bị từ chối hiện lý do; khối Xe đón từ sân bay với trạng thái do lái xe cập nhật.
- Kho dữ liệu dùng chung `src/mock/partner.js` (chỉ trong bộ nhớ trang, mất khi tải lại, D-29 = A). `mock/service.js` đọc dữ liệu đã được khách sạn/quản trị sửa. `SIM` không còn đóng băng để quản trị đổi tham số lúc chạy (`setSimParam`, có kiểm tra khoảng).
- Header có nút “Đối tác” và đăng xuất.

**Kiểm thử trình duyệt thật** (`partner.mjs`): 57/57 PASS (đăng nhập, phân quyền, khoá cơ sở, thêm cơ sở, tham số, tài khoản, đặt chỗ → khách sạn thấy và từ chối → người dùng cuối thấy, phòng và giá, hồ sơ, đón khách, nhật ký, 360px không cuộn ngang, không lỗi console, không gọi mạng ngoài). Bộ cũ 103/103 vẫn đạt. Ảnh `50-` đến `59-`.

**Giới hạn và lệch so với SRS/MVP**
- Không có AC và TC cho M10–M12; ưu tiên và Sprint chưa xếp (D-28). Đây không phải triển khai “theo AC”.
- Dữ liệu không chia sẻ giữa các tab/trình duyệt khác nhau; tải lại trang là mất (D-29, OQ-42). Vì vậy chưa kiểm được kịch bản khách sạn và người dùng cuối ở hai thiết bị.
- FR-033: quản trị chỉ xem và giám sát; chưa có duyệt/từ chối thay hãng (D-27 = A giữ hãng mô phỏng). Hãng vẫn là mô phỏng.
- Lái xe không có liên lạc trực tiếp với người dùng cuối (BR-002 cấm thu số điện thoại); chỉ trạng thái và lý do (OQ-39). Chức năng đón khách vẫn mâu thuẫn MB-15 “gọi xe” (đã loại).
- Đăng nhập chỉ là mô phỏng, không có bảo mật thật (NFR-010 chưa có chỉ tiêu).
- Chưa đo tương phản, Lighthouse; chưa có quét trợ năng riêng cho M10–M12.
- Thao tác `SIM` mutable có thể ảnh hưởng mọi màn hình trong phiên (chủ ý, FR-032).

# Bổ sung báo cáo KLTN AIRREST — Công nghệ và cấu trúc dữ liệu

> Đối tượng đọc: nhóm 9 và GVHD, dùng để cập nhật các mục 4.5 và 5.1–5.11 của `Bao_cao_KLTN_AIRREST_Nhom9_IT63_rut_gon (1).pdf`.
> Cơ sở đối chiếu: mã nguồn hiện tại trong thư mục này (`package.json`, `.mise.toml`, `src/**`) và `reports/ui_implementation/IMPLEMENTATION_REPORT.md` (ngày 26/10/2026).
> Báo cáo PDF mô tả bản prototype ban đầu (một tệp `main.jsx`, 3 nơi nghỉ). Mã nguồn đã phát triển xa hơn nhiều, nên nhiều đoạn không còn đúng.

## 1. Kết luận kiểm tra

| Nội dung | Kết luận |
|---|---|
| Stack cốt lõi (React 18.3.1, Vite 6, lucide-react, không backend/CSDL/API thật, dữ liệu mô phỏng, không ghi localStorage) | **Đúng** |
| Danh sách thư viện và dịch vụ ngoài | **Thiếu** Leaflet và ô bản đồ OpenStreetMap; câu "không gọi hệ thống ngoài" không còn đúng khi mở trang có bản đồ |
| Tổ chức mã nguồn (5.3, Bảng 5.3) | **Sai** — không còn là một tệp `main.jsx` |
| Quản lý trạng thái (5.4, Bảng 5.4) | **Sai** — không còn 12 `useState` |
| Dữ liệu mẫu (5.1, 5.6) | **Sai** — không còn 3 nơi nghỉ; hiện có 20 chuyến bay và 34 cơ sở mô phỏng |
| Đặc tả thực thể (4.5, Bảng 23) | **Lệch** tên trường, kiểu dữ liệu và thiếu nhiều thực thể mới |
| Điểm cuối API dạng REST/JSON (Bảng 24) | **Lệch** — thực tế là hàm bất đồng bộ trong `src/mock/service.js`, không có tệp JSON hay HTTP |
| Máy trạng thái luồng hỗ trợ (5.7, Bảng 5.6) | **Sai** — đã lập trình, không còn chỉ là `supportSent` |
| Kiểm thử (5.9) | **Lỗi thời** — mã nguồn hiện có build và bộ kiểm thử trình duyệt (số liệu theo báo cáo triển khai, chưa chạy lại) |
| Phạm vi tác nhân và "không có auth" (5.10) | **Lệch** — có đăng nhập mô phỏng và RBAC 8 vai trò |

## 2. Công nghệ (thay cho mục 5.3)

### 2.1 Công nghệ thực tế

| Hạng mục | Giá trị trong mã nguồn | Nguồn |
|---|---|---|
| Ngôn ngữ | JavaScript (JSX), không TypeScript | `src/**/*.jsx`, không có `tsconfig` |
| UI | React `^18.3.1`, React DOM `^18.3.1` | `package.json` |
| Build/dev | Vite `^6.0.5`, cấu hình mặc định (không có `vite.config`), lệnh `vite` và `vite build` | `package.json` |
| Biểu tượng | `lucide-react ^0.468.0` | `package.json` |
| Bản đồ | `leaflet ^1.9.4`, ô bản đồ từ `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | `src/components/StaysMap.jsx` |
| Môi trường | Node 22 (tệp `.mise.toml` do Figma Make sinh tự động) | `.mise.toml` |
| CSS | CSS thuần một tệp `src/styles.css`, token màu theo walo-erp, không Tailwind | `src/styles.css` |
| Định tuyến | Tự viết, đồng bộ `window.location.hash` (`#/stays`, `#/home`, `#/hotel`, `#/admin`…) với nút Quay lại | `src/state/store.jsx` |
| Quản lý trạng thái | `useReducer` + Context cho phiên người dùng cuối; `useSyncExternalStore` cho kho đối tác | `src/state/store.jsx`, `src/mock/partner.js` |
| Lưu trữ | Chỉ trong bộ nhớ trang, mất khi tải lại; không `localStorage`, không cookie, không `fetch` | `store.jsx` (ghi chú D-18), `rg` không thấy `fetch`/`localStorage` |
| Backend, CSDL, API chuyến bay/tồn phòng/thanh toán | Không có | — |
| Lint, type-check, unit test trong repo | Không có script (theo báo cáo triển khai mục 7) | `package.json` |

Ảnh tĩnh trong `public/images/` gồm 4 tệp (`hotel-1/2/3.jpg`, `hanoi-night.jpg`), khớp báo cáo.

### 2.2 Cấu trúc thư mục `src/` (thay cho Bảng 5.3)

| Thư mục/tệp | Vai trò |
|---|---|
| `main.jsx`, `App.jsx` | Điểm vào và khung ứng dụng (header, thanh module, menu, breadcrumb, chọn màn hình) |
| `screens/` | 13 màn hình: Home, Status, Advice, Stays, Detail, Booking, Reminder, Terminal, Support, Request (người dùng cuối); Login, Hotel, Admin (đối tác) |
| `components/` | Layout, Common, FlightStatusCard, PropertyCard, StaysMap, BookingLive, SimTools |
| `components/partner/` | Giao diện tab của khách sạn (`HotelTabs1–3`) và quản trị (`AdminTabs1–3`), `ui.jsx` |
| `state/store.jsx` | Reducer, context, đồng bộ hash |
| `mock/` | `flights.js` (D1), `properties.js` (D3), `partner.js` (kho đối tác), `service.js` (dịch vụ mô phỏng) |
| `lib/` | `domain.js` (tính giờ nghỉ, giờ rời, chip lọc), `request.js` (trạng thái luồng L2), `rbac.js`, `ics.js`, `time.js`, `shellNav.js`, `partnerNav.js`, `useBreakpoint.js` |
| `config/` | `simulation.js` (tham số SIM), `rights.js` (quyền lợi tham khảo), `lockedRequirements.js` (thẻ "chờ quyết định") |

Tổng khoảng 4.900 dòng (gồm 558 dòng CSS). Nhận xét "độ kết dính cao, chưa tách component" ở 5.3 không còn đúng: component, dữ liệu và dịch vụ mô phỏng đã tách riêng.

## 3. Trạng thái và luồng dữ liệu (thay cho mục 5.4)

- Trạng thái người dùng cuối nằm trong một reducer (`state/store.jsx`) với các trường: `screen`, `flight`, `browseAirport`, `lookupPrefill`, `pendingProperty`, `simNow`, `chips`, `showAll`, `propertyId`, `booking`, `request`, `reminder`, `bannerClosedAt`, `refreshing`, `partnerTab`, `session`.
- Thời gian dùng **phút tuyệt đối** tính từ 00:00 hôm nay (`simNow`, `schedDep`, `newDep`), không dùng `Date`. Giờ mô phỏng mặc định khi duyệt là 23:08 (`BROWSE_NOW`).
- Luồng dữ liệu: màn hình → `dispatch` → reducer hoặc gọi `mock/service.js` (độ trễ `SIM.latencyMs` = 350 ms, có công tắc `setFailNext` mô phỏng lỗi dịch vụ) → cập nhật state.
- Danh sách nơi nghỉ lọc theo giờ mô phỏng bằng `isOpen()`, `CHIPS` và `restPlan()` trong `lib/domain.js`. Tham số tính toán nằm ở `config/simulation.js` (`SIM`), quản trị có thể đổi lúc chạy qua `setSimParam` (5 tham số có kiểm tra khoảng).
- Kho đối tác (`mock/partner.js`) là một store dùng chung ngoài React. Dữ liệu chỉ nằm trong bộ nhớ trang, không chia sẻ giữa các tab hay trình duyệt (D-29 phương án A).

## 4. Cấu trúc dữ liệu thực tế (thay cho Bảng 23 mục 4.5)

Quy ước: tên trường lấy đúng từ mã nguồn. Cột "Khác với báo cáo" so với Bảng 23 của PDF.

### 4.1 Chuyến bay (D1) — `mock/flights.js`, `mock/service.js`

| Trường | Kiểu / giá trị | Khác với báo cáo |
|---|---|---|
| `code` | Chuỗi, mẫu `^[A-Z]{2}\d{1,4}$`; nhập thủ công = `'Nhập thủ công'` | báo cáo: `so_hieu` |
| `dayOffset` | Số nguyên (độ lệch ngày so với hôm nay) | báo cáo: `ngay` (kiểu Ngày) |
| `origin`, `dest` | `'HAN'` hoặc `'SGN'` | báo cáo: `san_bay_di/den` (mã IATA) |
| `schedDep`, `newDep` | Số phút tuyệt đối; `newDep` có thể `null` | báo cáo: `gio_du_kien`, `gio_moi` (Giờ phút) |
| `status` | `delayed` / `ontime` / `cancelled` | khớp ý Đúng giờ/Chậm/Huỷ |
| `cause` | `airline` / `force` / `unknown` | báo cáo: `nguyen_nhan` |
| `updatedAt`, `now` | Số phút tuyệt đối | báo cáo: `cap_nhat_luc` |
| `distanceKm` | Số hoặc `null` | **Mới** (dùng cho mức bồi thường tham khảo) |
| `scenario` | `approve` / `reject` / `hotelfull` / `noreply` | **Mới** (kịch bản luồng hỗ trợ chọn trước theo chuyến bay, D-17 A) |
| `unknownTime`, `manual`, `cancelledAt`, `change {from,to,at}`, `airline` | Cờ/số | **Mới** |

Có 20 chuyến mẫu; mã `ER500` cố ý gây lỗi dịch vụ.

### 4.2 Cơ sở lưu trú (D3) — `mock/properties.js`

34 cơ sở **tổng hợp** (HAN 20, SGN 14), không dùng bản ghi A08 (quyết định D-23 phương án B). Báo cáo Bảng 24 ghi "mô phỏng từ bộ dữ liệu A08" cần sửa thành "tổng hợp, tham khảo phân bố của A08".

| Trường | Kiểu / giá trị | Khác với báo cáo |
|---|---|---|
| `id` | Chuỗi, vd `HAN-01` | báo cáo: `ma` |
| `airport`, `name`, `type`, `room` | Chuỗi | `ten`, `loai`; `room` thay một phần thực thể `Phong` |
| `area` | Chuỗi, ghi rõ "(mô phỏng)" | **thay** `dia_chi` (không có địa chỉ thật) |
| `distanceKm`, `travelMin` | Số | khớp `khoang_cach_km`, `phut_di_chuyen` |
| `shuttle` | `free` / `paid` / `none` | khớp `xe_dua_don` |
| `taxi` | Số (VNĐ) | **Mới** |
| `reception24`, `closeExtHour` | Cờ; giờ "mở rộng" (24 = 00:00, 26 = 02:00 hôm sau) | `closeExtHour` thay `gio_nhan_cuoi`; **không có** `gio_nhan_phong` |
| `freeCancel`, `payAtProperty` | Cờ | khớp `huy_mien_phi`, `tra_tai_cho` |
| `familyRoom`, `hourly`, `rating` | Cờ; cờ; chuỗi `"7.0"–"9.4"` | khớp `phu_hop_gia_dinh`, `thue_theo_gio`, `diem` |
| `price`, `roomsLeft` | Số (VNĐ); số phòng còn | `gia_tong`, `con_phong` nằm ngay trong bản ghi cơ sở |
| `amenities` | Mảng chuỗi | **Mới** |
| `lat`, `lng` | Số; toạ độ **tổng hợp** đặt cách sân bay đúng `distanceKm` | **Mới** (bản đồ) |
| `updatedAtOffsetMin`, `soldOutOnConfirm` | Số; cờ kịch bản "vừa hết phòng khi xác nhận" | **Mới** |
| — | — | **Không có** `khong_can_the` |

Toạ độ hai sân bay (`AIRPORT_COORDS`) là toạ độ thật, dùng làm tâm bản đồ.

### 4.3 Đặt chỗ — `mock/partner.js`

| Trường | Kiểu / giá trị | Khác với báo cáo |
|---|---|---|
| `code` | `DC-0001…` (báo cáo 5.7 ghi `AR-{id}028`, **không còn đúng**) | `ma_dat_cho` |
| `propertyId`, `typeId`, `dayIdx`, `nights` | Tham chiếu; số | **Mới** (gắn loại phòng và ngày) |
| `name` | Chuỗi (tên gọi, không SĐT/email) | `ten_goi` |
| `method` | Ví dụ `at-property`, `qr` | `phuong_thuc_tt` |
| `status` | `pending` / `confirmed` / `rejected` (kèm `checked_in` trong tính tồn phòng) | báo cáo: Đã đặt/Đã huỷ |
| `reason`, `price`, `cid`, `history`, `createdAt`, `seed` | Lý do từ chối, giá, correlation ID, lịch sử | **Mới** |

### 4.4 Yêu cầu hỗ trợ (luồng L2) — `lib/request.js`

- Bản ghi lưu: `code` (`HT-0001…`), `flightCode`, `scenario`, `airport`, `sentAt`, `proposedId`, `altId`, `altAt`, `switchedAt`, `changeSeen`.
- **Trạng thái được suy ra** (`deriveRequest`) từ giờ mô phỏng và kịch bản, không lưu: `waiting`, `airline_rejected`, `approved_waiting_property`, `property_rejected`, `confirmed`, `switched`. Báo cáo ghi "8 trạng thái (B03 mục 6.4)"; mã hiện có 6 trạng thái, thiếu bước bổ sung minh chứng, hết hạn (chỉ có cờ `expired`) và huỷ. Cần ghi rõ phần lệch này, không sửa số.
- Tham số thời gian: `SIM.airlineReplyMin` = 8, `propertyReplyMin` = 8, `requestExpiryMin` = 15.

### 4.5 Quyền lợi tham khảo, nhắc giờ, chứng từ

- **Quyền lợi** (`config/rights.js`, đối tượng `RIGHTS`): `delay[]` và `cancel[]` gồm `hours`, `title`, `cite`, `needsFault`, `cond`; `compensationDomestic[]` (220.000/330.000/440.000đ theo cự ly), `sources[]`, `effectiveFrom`, `accessed`. Đây là cấu hình, khớp tinh thần `QuyDinhQuyenLoi` nhưng khác tên trường (`hours` thay `moc_gio`; không có `khung_gio` riêng, khung 7h–22h nằm trong nội dung `title`).
- **Nhắc giờ**: trạng thái `reminder {browser, enabled, notifiedFor}`; xuất tệp `.ics` qua `lib/ics.js`. Không có `gio_co_mat`, `gio_roi`, `kenh` dạng bản ghi — các giá trị này được tính bằng `restPlan()` và `leaveTime()` trong `lib/domain.js`.
- **Chứng từ (`ChungTu`)**: **chưa có**. Đây là phần MB-15 "Đã loại".

### 4.6 Thực thể mới không có trong báo cáo (kho đối tác `mock/partner.js`)

Khoảng ngoài MVP, đề xuất theo SRS `docs/srs/extensions/hotel-admin`, chưa được PO duyệt.

| Thực thể | Trường chính |
|---|---|
| `accounts` | `id`, `role`, `propertyId`, `tenantId`, `status`, `identifier` (11 tài khoản mẫu) |
| `sessions` | phiên đăng nhập, có thể thu hồi |
| `profiles` | hồ sơ đối tác: `status` (Draft, PendingReview, NeedsInfo, Active, Rejected, Suspended, Deactivated), `name`, `type`, `address`, `contact`, `lat`, `lng`, `amenities`, `history` |
| `roomTypes` | `id`, `name`, `capacity`, `beds`, `area`, `amenities`, `rooms`, `baseBooked`, `status` |
| `rates` | `{ STD: { base, days } }` theo cơ sở; `rateLog` |
| `blackouts`, `closedDays` | đóng/ngừng bán theo loại phòng và ngày (14 ngày) |
| `pickups` | yêu cầu đón khách: waiting → accepted → enroute → picked → done, hoặc failed |
| `cases`, `incidents`, `quality` | ca hỗ trợ (New → … → Closed), sự cố, chất lượng đối tác |
| `flags`, `changes`, `catalogs` | cờ tính năng có phiên bản, yêu cầu thay đổi cấu hình, danh mục (lý do từ chối, loại ca, loại sự cố, tiện ích) |
| `log` | audit log: `who`, `role`, `action`, `target`, `result`, `reason`, `cid`, `before`, `after` |

Phân quyền (`lib/rbac.js`): 8 vai trò (`admin`, `ops`, `support`, `finance`, `auditor`, `manager`, `staff`, `driver`) × 19 tài nguyên, quyền theo ký tự C/R/U/S/A/X/E/M/V, deny by default, cách ly tenant trong hàm `authorize`/`guard`.

## 5. Điểm cuối "API" (thay cho Bảng 24)

Báo cáo ghi các điểm cuối dạng REST (`GET /flights/{so_hieu}`…) thay bằng "tệp JSON hoặc hàm mô phỏng". Thực tế chỉ có hàm; **không có tệp JSON, không có HTTP**.

| Điểm cuối trong báo cáo | Hiện thực trong mã |
|---|---|
| `GET /flights/{so_hieu}?ngay=` | `lookupFlight({code, dateIso})` |
| (nhập thủ công UC02) | `buildManualFlight(...)` |
| (làm mới trạng thái UC15) | `refreshFlight(flight, now)` |
| `GET /properties?airport=…` | `searchProperties({airport, now})`; lọc `open_at`, `family`, `hourly`, `free_cancel` thực hiện phía giao diện bằng `isOpen()` và `CHIPS` |
| `GET /properties/{ma}` | `getProperty(id, now)` |
| (đề xuất thay thế ≤3 nơi) | `alternatives({airport, now, excludeIds, limit})` |
| `POST /bookings` | `createBooking({propertyId, name, method, now})` → `addBooking` ở kho đối tác |
| `POST /support-requests`, `PATCH /support-requests/{id}` | `nextRequestCode()` + `createRequest()` + `deriveRequest()` trong `lib/request.js` |
| `GET /rules?…` | Đọc trực tiếp `RIGHTS` ở `config/rights.js` |
| `POST /reminders` | Reducer `reminderEnable`, tệp `.ics` |
| `GET /terminal-facilities` | Màn `Terminal.jsx`, dữ liệu cấu hình, chưa có giá/giờ mở có nguồn (D-09 Blocked) |

Chỉ có một lời gọi mạng ra ngoài: ô bản đồ OpenStreetMap khi trang có bản đồ. Điều này mâu thuẫn AC-063/IFR-001 và MB-15 (bản đồ đã loại), đã ghi ở mục 9c của báo cáo triển khai và đang chờ PO.

## 6. Đoạn văn đề xuất để thay vào báo cáo

### 5.1 Mục tiêu và phạm vi hiện thực (thay câu cuối)

Phạm vi là frontend prototype có dịch vụ mô phỏng phía client. Sản phẩm chưa có backend, cơ sở dữ liệu, API chuyến bay, API tồn phòng hay thanh toán thật. Dữ liệu nằm trong bộ nhớ trang và mất khi tải lại. Ngoài hai luồng người dùng cuối, prototype có thêm khu vực đối tác (khách sạn, lái xe) và quản trị với đăng nhập mô phỏng và phân quyền 8 vai trò; phần này nằm ngoài MVP, là đề xuất chưa được PO phê duyệt.

### 5.3 Công nghệ và tổ chức mã nguồn (thay đoạn đầu)

Prototype dùng React 18.3.1, React DOM 18.3.1, Vite 6, lucide-react và Leaflet 1.9.4 (bản đồ OpenStreetMap). Mã viết bằng JavaScript, CSS thuần, chạy trên Node 22. Mã nguồn tách thành màn hình (`screens/`), thành phần giao diện (`components/`), trạng thái (`state/`), dữ liệu và dịch vụ mô phỏng (`mock/`), logic nghiệp vụ (`lib/`) và cấu hình (`config/`). Không có framework backend, lint, kiểm tra kiểu hay thư viện kiểm thử trong kho mã.

### 5.4 Quản lý trạng thái (thay đoạn đầu)

Trạng thái người dùng cuối do một reducer toàn cục (`useReducer` kèm Context) quản lý, gồm khoảng 16 trường. Điều hướng đồng bộ với `window.location.hash`. Kho dữ liệu đối tác là một store ngoài React dùng `useSyncExternalStore`. Mọi trạng thái chỉ tồn tại trong phiên, không ghi `localStorage` hay cookie. Giờ được biểu diễn bằng số phút tuyệt đối và điều khiển bởi giờ mô phỏng `simNow`.

### 5.6 Danh sách nơi nghỉ (thay đoạn đầu)

Dữ liệu gồm 34 cơ sở tổng hợp (HAN 20, SGN 14) và 20 chuyến bay mô phỏng; không dùng bản ghi A08. Vị trí từng cơ sở trên bản đồ là toạ độ tổng hợp, không phải địa chỉ thật. Bộ lọc gồm bốn chip (huỷ miễn phí, thuê theo giờ, phù hợp gia đình, có xe đưa đón) cùng sắp xếp "Gần nhất" và "Xếp hạng". Giá và số phòng còn lại không phải tồn phòng thật.

### 5.7 Hai nhánh xác nhận (thay đoạn đầu)

Nhánh tự chi trả gồm ba bước: nhập tên gọi (kiểm tra độ dài, từ chối số điện thoại và email), chọn cách trả (≥2 cách), xác nhận và sinh mã `DC-xxxx`; có kịch bản phòng vừa hết khi xác nhận. Nhánh hãng hỗ trợ có trạng thái suy ra theo giờ mô phỏng và kịch bản chọn trước (`waiting`, `airline_rejected`, `approved_waiting_property`, `property_rejected`, `confirmed`, `switched`), có thời hạn chờ và chuyển sang tự chi trả. Phản hồi của hãng và cơ sở đều là mô phỏng. Các bước bổ sung minh chứng, huỷ và hết hạn đầy đủ vẫn chưa được lập trình.

### 5.9 Kiểm thử (cập nhật)

Báo cáo triển khai (26/10/2026) ghi `npm run build` thành công, bộ kiểm thử trình duyệt Chrome headless bằng `playwright-core` đạt 166/166 (`partner.mjs`) và 15/15 (`regress.mjs`). Các tệp kịch bản kiểm thử nằm ngoài kho mã và bộ 103 ca ban đầu đã mất, nên nhóm chưa chạy lại được. Kết quả nêu trên chưa được kiểm chứng lại độc lập khi lập bổ sung này. Chưa đo tương phản, Lighthouse, kiểm thử khả dụng với người dùng thật, và chưa thử Firefox/Safari.

## 6b. Các điểm khác trong báo cáo cần đồng bộ (ngoài phạm vi công nghệ/dữ liệu)

- Responsive (5.8): báo cáo ghi breakpoint 900 px và 620 px kèm thanh điều hướng dưới. Mã hiện dùng breakpoint 720/768/1024 px, không còn thanh điều hướng dưới; dưới 1024 px menu thành ngăn kéo, bố cục có 3 cột cộng bản đồ ở màn rộng.
- Hệ thống thiết kế (5.2): nền xanh navy đã đổi sang token walo-erp (xanh `#0066B3`, nền `#F5F7FA`).
- Mục 4.1 và 5.10 ghi "không có auth/tài khoản đối tác": hiện có đăng nhập mô phỏng, không có bảo mật thật.
- Ma trận truy vết 5.10: các tên thành phần mã nguồn (`runSearch`, `hotels`, `liked`, `openBooking`, `supportSent`) không còn tồn tại. Cần thay bằng tên hàm, tệp thực tế; ví dụ UC03 gợi ý → `restPlan` ở `lib/domain.js`, UC10–UC14 → `lib/request.js` và `screens/Request.jsx`.
- Tính năng "Lưu nơi nghỉ" (`liked`) đã bị bỏ theo báo cáo triển khai mục 5 (ngoài MVP).

## 7. Giới hạn của lần kiểm tra này

- Đã đọc: `package.json`, `.mise.toml`, `src/state/store.jsx`, `src/App.jsx`, `src/mock/{flights,properties,service,partner}.js`, `src/lib/{request,domain,rbac,shellNav}.js`, `src/config/{rights,simulation}.js` và phần đầu `Booking.jsx`.
- **Chưa** đọc: các màn hình còn lại, các tab đối tác, `lockedRequirements.js`, các tài liệu SRS/RTM, các phụ lục D–H và Bảng 4.10–4.15 của PDF; không chạy `npm run build` hay các bộ kiểm thử.
- Không đối chiếu ảnh/sơ đồ (Hình 2–6) trong PDF.

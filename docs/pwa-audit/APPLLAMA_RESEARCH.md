# APPLLAMA_RESEARCH — Nghiên cứu hai skill Appllama cho Airrest (React Web)

> Appllama chỉ là nguồn tham khảo UI/UX. **Không** thay đổi định hướng kỹ thuật: vẫn React Web + Vite + Tailwind, không React Native/Expo, không viết lại frontend.

## 1. Giới hạn dữ liệu — đọc trước

- **Không có dữ liệu Appllama nào được truy cập.** Không cài/kết nối MCP, không đăng ký Pro, không tiêu credit, không gọi tool `search_apps`, `list_app_screens`, `get_screen`, v.v.
- Vì vậy **không có tên ứng dụng, doanh thu, lượt tải, ảnh màn hình hay screen reference nào** trong báo cáo này, và không app thật nào được coi là "đã nghiên cứu trên Appllama".
- Nguồn duy nhất: nội dung chữ của hai skill đã cài (đã kiểm tra an toàn trước khi cài) và kiến thức UX phổ thông của người viết. Mục UX phổ thông được gắn nhãn **[UX chung]**; **chưa tra cứu nguồn trực tuyến nào** (không WebFetch/WebSearch), nên không dẫn URL Apple HIG/Material/WCAG như nguồn đã đọc.
- Hai skill này **không nói gì về PWA**. Phần PWA trong bộ báo cáo là kiến thức web chung, không lấy từ Appllama.

## 2. Hai skill cung cấp gì

| Skill | Bản chất | Dùng được không cần MCP trả phí? |
|---|---|---|
| `appllama-usage` | Hướng dẫn dùng MCP `mcp.appllama.io` như "design director": bản đồ tool, phân trang cursor, media hết hạn ~1 giờ, playbook build-từ-đầu / cải-thiện-màn-hình / nghiên cứu flow | **Gần như không.** Mọi playbook gọi tool của MCP (gói Pro, 1.500 credit/tháng). Chỉ còn phương pháp luận (cấu trúc thư mục ghi chú `research/`) |
| `appllama-app-design-skill` | Bộ luật thiết kế/triển khai **Expo / React Native / iOS** (native fidelity, navigation, anti-slop, motion, state, hiệu năng, "definition of done") | **Một phần.** Nguyên tắc UX dùng được; công cụ và API thì không |

## 3. Nguyên tắc có thể chuyển sang React Web / PWA

**Y** = dùng nguyên · **A** = dùng dạng điều chỉnh · **N** = không áp dụng cho web

| Nguyên tắc (từ skill) | Chuyển | Ánh xạ Airrest (đã xác minh file) |
|---|---|---|
| "Push đi sâu, replace đi tiếp; back chỉ hoàn tác điều hướng, không hoàn tác sự kiện" | A | Airrest **đã có** lịch sử trình duyệt: `store.jsx:45-56` dùng `pushState`/`replaceState` + `popstate`. *(Subagent từng ghi "chưa thấy URL/history" — sai; đã sửa.)* Cần rà chỗ nên dùng `replace` thay `push`: sau đăng nhập, sau đặt phòng/thanh toán xong |
| "Cửa một chiều": sau đăng nhập/thanh toán không cho back vào trạng thái cũ | A | `Login.jsx`, `BookingModal.jsx`, `BookingActions.jsx`, màn `payment`. Thay `Stack.Protected` bằng guard + `replace`. Với PWA Android, back từ màn chính nên thoát app, không hiện Login |
| "Presentation là ý nghĩa": modal / sheet / overlay | A | Đã có `role="dialog"`: `BookingModal.jsx` (căn đáy), `BookingActions.jsx`, `ScanTicket.jsx`, `PayerDelay.jsx` (căn giữa), `ChatBot.jsx`, `GuestsPicker.jsx` (popover). Thống nhất: tác vụ nhiều bước = modal đầy màn hình; lựa chọn ngắn = bottom sheet; xác nhận hủy = dialog nhỏ |
| "Back chỉ bị chặn khi đang gửi request không đảo ngược hoặc form chưa lưu" | A | `popstate` + `beforeunload`; sheet/modal mở nên đẩy một history entry để back đóng sheet |
| "Tab là đồng cấp, mỗi tab giữ stack riêng" | A | `adminNav.js`/`hotelNav.js` là tab đồng cấp theo quyền; `UserSite.jsx:84` đã có bottom bar 4 mục |
| "Màn hình toàn tâm nằm trên tab" (composer/checkout) | Y | `BookingModal` + thanh hành động dính ở đáy là đúng mẫu |
| Vòng trạng thái đầy đủ: loading / empty / error, skeleton đúng hình dạng | Y | Cần rà từng màn (chưa đánh giá chất lượng) |
| Touch target ≥ 44 | Y | Xem `RESPONSIVE_AUDIT.md` F6 (đã chứng minh `.btn` bị ghi đè xuống 40px) |
| Một accent, một họ xám, một thang bo góc, nhịp 4/8 | Y | `shellNav.js` dùng 3 màu module (`#0066b3`, `#047857`, `#6d28d9`) — cần quyết định có giữ không; `styles.css` có nhiều giá trị radius. Hai hệ CSS cần chốt token |
| Typography có thang bậc, `tabular-nums` cho giá/giờ | A | `font-variant-numeric: tabular-nums`; font Be Vietnam Pro đã nạp |
| Safe area / vùng an toàn | A | Cần `viewport-fit=cover` (đang thiếu, `index.html:5`) |
| Motion: <300ms, ease-out, tôn trọng Reduce Motion | A | Đã có `prefers-reduced-motion` (`styles.css:103,594`, gsap `matchMedia`) nhưng chưa phủ hết |
| Semantic color, light + dark | A | CSS variables + `prefers-color-scheme`; hiện nhiều màu cứng, dark mode là việc phụ — **không nằm trong phạm vi bắt buộc** |
| Control native thay vì dựng lại | A | Trên cảm ứng ưu tiên `<select>`, `<input type=date>`; `Select.jsx` tự dựng (xem F4) |
| Anti-slop: không gradient tím/glow, không glassmorphism tràn lan, một nhãn cho một ý định | Y | Có `backdrop-blur-sm` ở lớp phủ và nhiều gradient `.deal-visual` — cần đếm và quyết định |
| Optimistic update, tách server/client state | A | Không bắt buộc đổi sang TanStack Query |
| Thang spring theo vận tốc ngón tay, Reanimated worklet | **N** | Không có trên web; nếu cần kéo thả sheet thì CSS transform + pointer events ở mức tối thiểu |
| Expo Router (`Stack.Protected`, `formSheet`, `usePreventRemove`), SF Symbols, `borderCurve`, haptics, MMKV, FlashList, `expo-image`, Dynamic Island, `xcrun simctl` | **N** | Không dùng (đang dùng `lucide-react`) |
| Vòng lặp simulator, quay video 60fps | A | Thay bằng DevTools device mode + thiết bị thật + Lighthouse + Playwright viewport |

## 4. Gợi ý theo nhóm và màn hình (chỉ văn bản, dựa trên file nav đã đọc)

Điều hướng theo nhóm **suy từ `visibleTabs()`**, không gán cứng theo tên vai trò (vì code không có khái niệm vai trò, chỉ có permission).

| Nhóm | Bằng chứng | Gợi ý |
|---|---|---|
| Người dùng cuối | `UserSite.jsx:84`: bottom bar 4 mục, ẩn từ `md` | Giữ nguyên. Bổ sung `aria-current`/trạng thái active (mục "Nơi nghỉ" hiện thiếu trạng thái active [AGENT]); nhãn 9px → ≥11px |
| Cổng khách sạn | `hotelTabs`: tối đa 9 tab | Quá nhiều cho bottom nav: **tối đa 4 tab ưu tiên + "Thêm"** mở sheet; chỉ chọn trong tab mà `visibleTabs` trả về. Tài khoản chỉ có `trip:drive` có thể chỉ còn tab `trips` → **ẩn thanh nav khi ≤1 mục**; màn đó (bản đồ + realtime) hợp mô hình một tác vụ với nút hành động dính đáy |
| Cổng quản trị | `adminTabs`: tối đa 10 tab | Giữ **drawer làm chính** (đã có); thêm ô tìm/nhóm trong drawer. Bottom nav là tuỳ chọn thiết kế, không có bằng chứng bắt buộc |
| Tài khoản có cả hai khu vực | `areasOf()` + `App.jsx` có liên kết "Chuyển sang…" | Đưa bộ chuyển khu vực lên đầu drawer/sheet, không nhồi vào bottom nav |

**Ai thực sự dùng điện thoại ở cổng nhân sự là giả định chưa có bằng chứng trong code** — cần chủ sản phẩm xác nhận (xem `IMPLEMENTATION_PLAN.md`, câu hỏi mở).

Các mẫu khác:
- **Bảng → thẻ:** với màn hotel đã có `data-label`, chọn 2–3 trường chính cho thẻ (tên, trạng thái, thời gian); chi tiết mở bằng màn con. Với `admin/*` chưa có `data-label` — cần đọc từng file trước khi quyết.
- **Modal → bottom sheet:** <640px dùng sheet kéo từ đáy với nút đóng rõ; ≥640px dùng dialog giữa. `PayerDelay` đang căn giữa, chưa có `max-h`.
- **Thanh hành động dính:** đã có ở `BookingModal.jsx`; áp dụng cho form dài (hotel `Profile`, `Rooms`, admin `Accounts`).
- **Chip trạng thái:** đã có `StatusPill` (`components/hotel/kit.jsx`) và `Pill`/badge (`Common.jsx`); chuẩn hoá bảng nhãn–màu kèm chữ/icon, không chỉ dựa vào màu.
- **Hàng đợi việc cần xử lý:** `AppNav` đã có huy hiệu `count`; gom `changes`/`support` thành danh sách ở đầu `Overview`/`Dashboard` — **cần xác nhận nguồn dữ liệu** (chưa đọc `admin/Dashboard.jsx`, `hotel/Overview.jsx` kỹ).

## 5. Mẫu UX phổ thông theo chủ đề **[UX chung — không phải dữ liệu Appllama]**

- **Đặt phòng:** ô tìm kiếm gọn (ngày/số khách); kết quả dạng thẻ có ảnh, giá/đêm, chính sách hủy; bộ lọc mở bằng sheet và hiện số kết quả; tổng giá gồm thuế phí trước bước thanh toán; thanh hành động dính đáy.
- **Quản lý khách sạn:** hàng đợi việc trước; lịch tồn phòng dạng lưới cuộn ngang với cột đầu cố định; chỉnh giá hàng loạt.
- **Hỗ trợ khi chuyến bay delay:** trạng thái chuyến bay và hạn chót hành động nổi bật; một nút hành động chính; liên hệ hỗ trợ một chạm.
- **Quản lý đặt chỗ:** lọc theo trạng thái bằng chip cuộn ngang; tìm theo mã; chi tiết là màn con; thao tác hủy cần xác nhận kèm hậu quả.
- **Dashboard nhân viên:** vài chỉ số đầu trang, việc tới hạn; tránh biểu đồ dày đặc trên màn nhỏ (hiện app **không có thư viện biểu đồ**).
- **Thông báo/nhiệm vụ:** gom theo ưu tiên, đánh dấu đã xử lý, huy hiệu số; không dùng toast cho việc quan trọng.
- **Điều hướng mobile:** bottom nav 3–5 mục có nhãn chữ, trạng thái active rõ; nhiều hơn thì "Thêm"/drawer.
- **Tìm/lọc:** ô tìm cố định, nút xóa lọc, chip hiển thị lọc đang bật.
- **Form:** nhãn trên ô nhập, `inputmode`/`autocomplete` đúng, lỗi inline cụ thể, nút gửi dính đáy, không mất dữ liệu khi back.
- **Chỉ báo trạng thái:** màu + chữ/icon, nhất quán toàn app, tương phản WCAG AA.

## 6. Việc không nên làm theo skill

- Không dùng "study 20–30 màn hình trước khi viết" như điều kiện chặn — cần MCP trả phí, ngoài phạm vi.
- Không sao chép giao diện iOS/RN; chỉ lấy nguyên tắc.
- Không áp "simulator loop" của skill; dùng quy trình kiểm thử web ở `IMPLEMENTATION_PLAN.md` Phase 5.
- Skill `appllama-app-design-skill` có từ khoá kích hoạt rộng ("build a screen", "polish the UI"); nếu nó nhắc Expo/RN trong task web, bỏ qua.

## 7. Giới hạn của chính nghiên cứu này

1. Không có dữ liệu Appllama thật (mục 1).
2. Năm file `references/*.md` của `appllama-app-design-skill` chỉ được đọc ở mức quét an toàn khi cài, không phân tích sâu; theo mô tả đều hướng Expo/RN/iOS.
3. Chưa đọc kỹ `Login.jsx`, `Home.jsx`, `Stays.jsx`, `Pages.jsx`, `admin/*` (trừ `kit.jsx`), `hotel/Overview.jsx`.
4. Chưa chạy app, chưa đo Lighthouse/tương phản.

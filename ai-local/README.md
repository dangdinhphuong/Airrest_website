# ai-local: AI chạy trong Docker cho chatbot (Ollama + Qwen2.5 3B)

AI là một service của docker-compose (`ollama`), **khởi động cùng web/api**: `docker compose up -d`. Không cần cài Ollama trên máy host.
- Cổng 11434 KHÔNG mở ra host/LAN (service không khai `ports`): chỉ API gọi được qua mạng compose (`OLLAMA_URL=http://ollama:11434`). Khi dựng Cloudflare Tunnel chỉ mở web + API, tuyệt đối không mở Ollama.
- Model nằm ở `ai-local/models/` (mount vào container, giữ lại giữa các lần chạy). Máy mới: lần chạy đầu container tự `ollama pull qwen2.5:3b-instruct` (~2 GB), rồi tự làm nóng model.
- `restart: unless-stopped`: tự lên lại cùng Docker sau khi reboot máy.
- Ollama dùng `OLLAMA_CONTEXT_LENGTH=2048` (khớp `num_ctx` API gửi, lệch thì lần gọi đầu nạp lại model chậm 10 giây+) và `OLLAMA_NUM_PARALLEL=3` (mỗi loại prompt - hiểu ý, viết câu, dịch - giữ một ô nhớ đệm, không đọc lại prompt mỗi lần đổi loại). Khi API khởi động còn tự làm nóng cả hai loại prompt (`backend/services/chat/warmup.ts`).

## Bật / tắt
- Bật AI: `backend/.env` có `AI_CHAT_ENABLED=true` (xem `backend/.env.example`), rồi `docker compose up -d api`. Đổi `.env` hoặc compose thì phải TẠO LẠI container (`up -d`), `restart` không đọc lại `env_file`.
- Tắt AI: `AI_CHAT_ENABLED=false` (tạo lại container api). Ollama chết/chậm (quá `AI_CHAT_TIMEOUT_MS`, mặc định 15 giây) thì endpoint trả `other`/`null` và chatbot chạy bản từ khóa.
- Xem trạng thái: `docker exec airrest_website-ollama-1 ollama ps` (model đang nạp), `docker logs airrest_website-api-1 | rg "chat\."`.
- Chạy API ngoài Docker: `OLLAMA_URL=http://127.0.0.1:11434` và tự chạy Ollama (service `ollama` trong compose không mở cổng ra host; muốn thử thì thêm tạm `ports: ["127.0.0.1:11434:11434"]`).

## Luồng và lớp bảo vệ
`ChatBot` → `botEngine.reply()`: câu khớp regex đi đường cũ (không gọi AI). Câu không khớp → `POST /v1/chat/understand` (`backend/services/chat/understand.ts`):
1. **Lớp chặn regex trước model** (mật khẩu/token/dữ liệu hệ thống, thông tin người khác, tiêm lệnh, SQL) → `blocked`, không gọi model.
2. Che mã `AR-`/`SP-`, SĐT, email trước khi đưa model.
3. Model chỉ trả nhãn + tham số theo JSON schema; sai schema/timeout/lỗi → `other`. Tham số bịa (km, giá, số hiệu chuyến không có trong câu) bị bỏ.
4. Frontend quyết định câu trả lời: `blocked`/`offtopic` → từ chối cố định; ý định có luồng sẵn → chạy luồng đó (vẫn qua bước xác thực/xác nhận); `other` → hỏi lại như cũ.

## Đo lại chất lượng (sau khi đổi prompt/model)
```bash
cd backend && AI_CHAT_ENABLED=true JWT_SECRET=x...(>=16 ký tự) DATA_ENC_KEY=y...(>=16 ký tự) LOG_LEVEL=silent npx tsx ../ai-local/bench/run.ts
```
Ví dụ trong prompt (`SYSTEM` ở `understand.ts`) tự viết, không trùng câu kiểm thử ở `bench/run.ts`.

`backup-20261120/`: bản gốc các file đã sửa (thư mục này không có git). `dl/`: tệp tải Ollama, xóa được.

## Trả lời tự nhiên (pha 1+2)
Sau khi code chọn việc cần nói (hỏi sân bay/ngày/khách/yêu cầu thêm, chào, từ chối lạc đề, hỏi lại), `botEngine.naturalize()` gọi `POST /v1/chat/reply` (`backend/services/chat/reply.ts`) kèm 6 tin gần nhất để AI diễn đạt tự nhiên (nhắc lại điều khách vừa nói rồi hỏi tiếp). AI chỉ thay chữ; nút gợi ý, thẻ khách sạn, hành động giữ nguyên.
- **Câu AI viết phải qua `safeReply`:** ngắn, có câu hỏi, không link/liên hệ, không số lạ, không chữ Trung/Nga/Thái/Hàn, không tự nhận AI, và (với câu hỏi thông tin) đúng mục đang cần. Không đạt thì trả `null` và bot dùng câu mẫu.
- **Khách hỏi ngang** ("thanh toán online được không?"): code trả lời bằng dữ kiện thật viết sẵn (`FAQ` trong `botEngine.js`: đưa đón, thanh toán, hủy, tài khoản) rồi mới nối câu hỏi tiếp. AI không tự trả lời giá/chính sách.
- Lời khách có tiêm lệnh/bảo mật thì không gọi model, dùng câu mẫu.
- **Luồng tìm phòng:** sân bay → ngày → số khách → MỘT câu tùy chọn (ngân sách/khoảng cách/tiện ích, "Tìm luôn" để bỏ qua). Khách nói nhiều ý một lúc thì bỏ các câu đã có.
- Xem câu AI viết thật + đo tốc độ: `cd backend && OLLAMA_URL=http://172.18.0.1:11434 AI_CHAT_ENABLED=true ... npx tsx ../ai-local/bench/reply.ts`.
- **Cách giảm tính thất thường của 3B (đã làm):** lời ghi nhận điều khách vừa nói ("Mình ghi nhận sân bay Vinh rồi nhé.", đổi kiểu theo lượt) do **code** nói, AI chỉ viết câu hỏi tiếp; nhiệt độ thấp (0.3); câu AI viết không qua `safeReply` thì **thử lại một lần** (0.15) trong cùng ngân sách thời gian; lỗi mạng/quá hạn thì không thử lại. Đo 3 lần liên tiếp bằng `ai-local/bench/reply.ts`: 11/12 mỗi lần (ca còn lại là ca tiêm lệnh, cố ý dùng câu mẫu), trung vị 2,6 giây.
- Giới hạn còn lại: 3B chỉ diễn đạt lại câu hỏi theo từng mục nên giọng khá đều, ít biến hóa/đồng cảm; câu chào, từ chối lạc đề, "chưa hiểu" thì tự nhiên hơn. Muốn hay hơn nữa thì đổi model (`OLLAMA_MODEL` + service `ollama` pull model mới) và đo lại bằng `bench/reply.ts` trước khi dùng.

## Đặt phòng ngay trong chat (`botBook.js`)
Sau khi tìm phòng, khách bấm thẻ khách sạn (hoặc nhắn "Đặt <tên>", "đặt cái số 2", "đặt luôn" khi chỉ có một kết quả) thì vào luồng đặt:
1. Code thu họ tên, SĐT, email (tùy chọn) và hình thức thanh toán (nếu có nhiều cổng). **Họ tên/SĐT/email không đưa cho AI**; khách đã đăng nhập thì dùng sẵn thông tin tài khoản.
2. Bản tóm tắt có tổng tiền do **backend** tính (`POST /v1/bookings/quote`). **Chỉ đúng cụm "Xác nhận đặt"** (bấm nút hoặc gõ) mới tạo đơn; "ok/được/đặt đi" không tính.
3. `createBooking` với một `Idempotency-Key` cho mỗi bản tóm tắt: bấm đúp hoặc thử lại sau lỗi mạng không tạo hai đơn (đã kiểm với backend thật: cùng key trả cùng mã đơn).
4. Trả tại khách sạn: báo mã đơn + trạng thái. Trả online: đơn tạo xong mới chuyển sang `paymentLink.payUrl` (chỉ http/https), kèm nút "Thanh toán ngay" dự phòng. SePay đang `live` ở môi trường thật nên mọi đơn tạo từ chat là đơn thật.
- Chưa hỗ trợ: phòng theo giờ (chuyển sang trang khách sạn), xe đưa đón, đổi loại phòng/số phòng trong chat (mở trang khách sạn).
- Test: `apps/web/src/screens/user/botBook.test.js` (không tạo đơn thật). Thử hợp đồng với backend: dùng Postgres nhúng (`npm run dev:db`) + `SEPAY_MODE=mock`, KHÔNG thử trên API trỏ Supabase thật.

## Đa ngôn ngữ: tiếng Anh / Trung / Hàn (`botI18n.js`)
Bot nhận dạng ngôn ngữ từng tin gõ tay (Hàn → `ko`, chữ Hán → `zh`, tiếng Anh → `en`, tiếng Nhật và ngôn ngữ khác → trả lời tiếng Anh, có dấu tiếng Việt → `vi`) và nhớ ở `mem.lang`; tin mơ hồ ("hi", số, mã) giữ ngôn ngữ trước.
- **Hiểu lời khách:** tin tiếng nước ngoài được model dịch sang tiếng Việt chuẩn (`POST /v1/chat/normalize`, `backend/services/chat/normalize.ts`) rồi chạy qua đúng bộ phân tích tiếng Việt đã có (ngày, số khách, giá, sân bay, tiện ích), nên mọi luồng hiểu được mà không viết lại. Bản dịch phải qua kiểm tra (không lẫn chữ Trung/Hàn/Nga, giữ nguyên các chữ số; các từ ngày giờ Qwen hay để sót như 今晚/明天/내일 được quy đổi, còn sót ký tự khác thì bỏ bản dịch) và lớp chặn bảo mật chạy trên CẢ bản gốc lẫn bản dịch. Dịch lỗi/quá hạn: dùng nguyên văn.
- **Lời bot:** câu viết sẵn ba thứ tiếng (`L(mem, vi, en, zh, ko)`), KHÔNG để model 3B tự dịch (đặc biệt bản tóm tắt tiền và xác nhận đặt). Nút bấm hiển thị theo ngôn ngữ khách nhưng gửi giá trị tiếng Việt chuẩn (`{ label, text }`), nên ChatBot truyền `chip: true` để không dịch lại và không đổi ngôn ngữ. Thêm ngôn ngữ mới: thêm đối số vào các `L()/C()` và `detectLang`.
- **Đặt phòng trong chat:** tên/SĐT/email không bị dịch và không làm đổi ngôn ngữ (tên "Nguyễn Văn An" trong cuộc chat tiếng Anh không biến cuộc chat thành tiếng Việt). Xác nhận bằng đúng cụm của từng ngôn ngữ ("Confirm booking", "确认预订", "예약 확정" hoặc bấm nút); "ok/yes/好的/네" không tính. Số điện thoại phải là số Việt Nam (backend chỉ nhận `toE164VN`), câu hỏi đã nói rõ điều này.
- **Khách hỏi thông tin thuần** (xe đưa đón, thanh toán, tài khoản): trả lời dữ kiện thật bằng ngôn ngữ khách.
- **Chưa có bản đa ngôn ngữ:** hủy/đổi ngày, đặt xe, khiếu nại, ticket (xác thực, tiền, thông tin cá nhân). Khách nước ngoài vào các luồng này được báo rõ và chỉ tới trang theo dõi / trung tâm hỗ trợ. Câu hỏi/nút chat mở đầu theo ngôn ngữ trình duyệt chỉ với `zh`/`ko`.
- Mỗi tin nước ngoài tốn thêm một lần gọi dịch (khoảng 1-2 giây); câu lạc đề/hiểu ý qua AI thêm một lần nữa (tổng 3-6 giây).

## Giữ cuộc chat khi tải lại trang (`botStore.js`)
Tin nhắn và trạng thái hội thoại (mem: ngôn ngữ, bước đang hỏi, điều kiện tìm, kết quả tìm gần nhất, bản nháp đơn, lịch sử) được lưu vào `sessionStorage` (khóa `airrest-chat-v1`) sau mỗi tin mới và khôi phục khi `ChatBot` dựng lại. Mất khi đóng tab, không chia sẻ giữa các tab. Hết hạn sau 2 giờ không chat; mở trang mà chưa chat thì không ghi và không gia hạn.
- **Không lưu:** `redirect` (không chuyển sang trang thanh toán lần nữa sau khi tải lại), tệp đính kèm, kết quả tra booking đầy đủ (`mem.auth.full`, tra lại khi cần), cờ `busy` và danh sách cổng thanh toán.
- **Đang ở bước XÁC NHẬN đặt:** bản tóm tắt cũ có thể đã lỗi thời (giá, tồn phòng) nên luồng bị hủy, bot báo "chưa tạo đơn nào" và mời bấm "Đặt" lại để tóm tắt với giá mới. Các bước trước đó (tên, SĐT, email, thanh toán) chưa hiện tiền nên khôi phục nguyên trạng và giữ nguyên `idempotencyKey`.
- Thêm trường mới vào `mem` cần lưu: thêm vào `MEM_KEYS` trong `botStore.js`. Không đưa vào đó dữ liệu cá nhân không cần thiết.
- Chưa có: lưu phía máy chủ / nối cuộc chat giữa các thiết bị hoặc các phiên.

## Phòng theo giờ trong chat
Khách nói "theo giờ" (hoặc "hourly", "钟点房", "시간제") thì luồng tìm phòng đổi: hỏi **một ngày** (không còn nhận/trả phòng), kết quả chỉ gồm khách sạn có loại phòng bật giờ (`room.hourly`), thẻ ghi giá từ số giờ tối thiểu. Khi bấm "Đặt" có thêm hai bước trước tên/SĐT (`botBook.js`):
1. **Số giờ**: nút 2/3/4/6 giờ nằm trong [minHours, maxHours], kèm giá (`hourlyPriceOf`: giờ đầu + (giờ - 1) × giờ tiếp theo). Khách cũng gõ số tự do.
2. **Giờ vào**: nút là các khung còn trống thật lấy từ `GET /v1/hotels/:id/hourly-slots` (từ 8h, hoặc từ bây giờ nếu hôm nay), hoặc khách gõ giờ ("14:30", "14h30", "3pm", "下午3点", "오후 3시"). Khung đã kín hoặc không nằm trong lịch thì nói lý do và gợi ý 4 khung gần nhất còn trống; khung được kiểm lại ngay lúc chọn vì nút có thể đã cũ.
- Tóm tắt ghi khoảng giờ (có "hôm sau" nếu qua nửa đêm), báo giá và tạo đơn bằng dòng `{ kind: 'HOURLY', startsAt, hours }` (đã kiểm với backend thật: quote 200, tạo đơn 201, `stay.type = HOURLY`, cùng `Idempotency-Key` ra cùng mã đơn).
- Chưa có: đặt phòng giờ trộn với phòng đêm trong cùng đơn, khung giờ qua nhiều ngày, chữ số viết bằng chữ ("hai giờ", "两小时").

## Bộ phân tích ngày (`parseDates`)
Hiểu `20/11 - 22/11`, `20/11`, `24 tháng 11`, `ngày 24` / `mùng 5` (chỉ ngày trong tháng: tháng này nếu chưa qua, không thì tháng sau; ngày không có thật thì thử tháng sau), `hôm nay`, `ngày mai`, `ngày kia`, `N đêm`; gõ trần `24` khi đang hỏi ngày cũng được. Chưa hiểu "từ ngày 24 đến 26". **Câu trả lời mà code chưa đọc được thì bot xin lỗi và hỏi lại đúng câu mẫu, KHÔNG nhờ AI diễn đạt** (trước đây AI biến "ngày 24" thành "vào ngày 24 đúng không?" như thể đã hiểu, kèm nút Hôm nay/Ngày mai). `safeReply` cũng loại câu AI tự ghi nhận hoặc xác nhận ("đã ghi lại…", "đúng không?").

## Công tắc bật/tắt chatbot
Hai biến độc lập:
- `VITE_CHATBOT_ENABLED` trong `apps/web/.env` (mặc định `true`): `false` thì **không hiện bong bóng robot và khung chat** trên web (không mount `ChatBot`, nên không gọi API chat nào). Chỉ `false/0/off/no/disabled` mới tắt; giá trị gõ sai vẫn bật. Biến `VITE_*` do Vite đọc lúc khởi động: đổi xong chạy `docker compose restart web`; build production thì phải build lại. Đọc ở `apps/web/src/lib/features.js`.
- `AI_CHAT_ENABLED` trong `backend/.env` (mặc định `false`): chỉ bật/tắt phần AI (hiểu ý, viết câu, dịch). Tắt thì chatbot vẫn chạy bản từ khóa. Đổi xong phải tạo lại container api (`docker compose up -d api`).
Bảng: `VITE_CHATBOT_ENABLED=true` + `AI_CHAT_ENABLED=true` = chatbot có AI; `true` + `false` = chatbot từ khóa; `false` + bất kỳ = không có chatbot.

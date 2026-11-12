# Airrest
Monorepo (npm workspaces). Tài liệu nghiệp vụ & thiết kế: [docs/](docs/).


```
Airrest_website/
├── docs/                    SRS, BA, thiết kế dữ liệu (Mongo gốc + Postgres), UX, báo cáo (BTHQUAN, reports, figma)
├── apps/
│   ├── web/                 React + Vite, gọi API backend qua VITE_API_BASE_URL (apps/web/.env)
│   └── mobile/              React Native / Expo — chưa làm
├── packages/                mã TS nguồn dùng chung (không cần build; import bằng @airrest/<tên>)
│   ├── shared-types/        kiểu/enum dùng chung (BookingStatus, PaymentStatus...)
│   ├── validation/          zod schema (đặt phòng, tra cứu...)
│   ├── business-logic/      quy tắc thuần: tồn phòng (sweep-line), phí dịch vụ
│   ├── utils/               hàm tiện ích thuần (chuẩn hóa SĐT VN)
│   └── api-client/          client gọi API (fetch, lỗi chuẩn hóa ApiError, Idempotency-Key); không đọc env
├── backend/                 xem backend/README.md
│   ├── api/                 Express: app, server, middleware, router, Socket.io
│   ├── services/            nghiệp vụ: bookings, payments (VNPay), audit, authz, cấu hình
│   ├── database/            Postgres/Supabase: pool + transaction, migrations SQL, types, seed
│   ├── config/  lib/        env/quyền/vai trò · tiện ích hạ tầng (jwt, crypto, vnpay...)
│   └── tests/
├── docker-compose.yml       api + web (+ Postgres local qua profile `local`)
└── package.json             workspaces: apps/*, packages/*, backend
```

Quy tắc phụ thuộc: `packages/*` không import từ `backend` hay `apps`; `api → services → database`, `services` không import `api`.

## Cấu hình domain backend (BẮT BUỘC)

Giao diện không có địa chỉ backend trong mã. Đặt trong `apps/web/.env` (mẫu: `apps/web/.env.example`):

```
VITE_API_BASE_URL=http://localhost:3000   # production: https://<airrest-api>.onrender.com
```

- Thiếu hoặc sai URL: giao diện hiện màn "Chưa cấu hình địa chỉ máy chủ" thay vì chạy mù. Đổi giá trị thì khởi động lại dev server; khi triển khai phải build lại (Vite nhúng biến lúc build). Render: khai báo `VITE_API_BASE_URL` ở dịch vụ `airrest-web` trong `render.yaml`.
- Backend phải cho phép origin của giao diện: `CORS_ORIGINS` trong `backend/.env` (dev: `http://localhost:5173` khi chạy `npm run dev:web`, `http://localhost:5174` khi chạy bằng Docker).
- VNPay: `VNPAY_RETURN_URL` trỏ về `<origin giao diện>/payment/result` (giao diện đã có trang xử lý).
- Phân quyền menu và nút theo `permissions` trả về từ `POST /v1/auth/login` (lib/access.js); máy chủ vẫn kiểm quyền ở mọi route.

## Chạy nhanh

```bash
npm install                      # một lần ở gốc cho cả monorepo
docker compose up -d             # api (3000) + web (5174); DATABASE_URL (Supabase) đặt trong backend/.env
                                 # DB local thay Supabase: docker compose --profile local up -d
npm run dev:api                  # hoặc chạy API trên máy host (cần backend/.env)
npm run dev:web                  # cần apps/web/.env (VITE_API_BASE_URL)
# Không có Supabase/Docker? Postgres nhúng (dữ liệu ở backend/.data/pg, đã .gitignore):
npm run dev:db                 # in ra DATABASE_URL; đặt vào backend/.env rồi: npm run db:seed
npm run typecheck && npm test    # npm run test:db: thêm test tích hợp (tự bật Postgres nhúng, không cần Docker)
```

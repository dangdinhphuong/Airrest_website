# Airrest
Monorepo (npm workspaces). Tài liệu nghiệp vụ & thiết kế: [docs/](docs/).


```
Airrest_website/
├── docs/                    SRS, BA, thiết kế dữ liệu (Mongo gốc + Postgres), UX, báo cáo (BTHQUAN, reports, figma)
├── apps/
│   ├── web/                 React + Vite (hiện chạy trên dữ liệu mô phỏng src/mock)
│   └── mobile/              React Native / Expo — chưa làm
├── packages/                mã TS nguồn dùng chung (không cần build; import bằng @airrest/<tên>)
│   ├── shared-types/        kiểu/enum dùng chung (BookingStatus, PaymentStatus...)
│   ├── validation/          zod schema (đặt phòng, tra cứu...)
│   ├── business-logic/      quy tắc thuần: tồn phòng (sweep-line), phí dịch vụ
│   ├── utils/               hàm tiện ích thuần (chuẩn hóa SĐT VN)
│   └── api-client/          khung, chưa viết (FE chưa gọi API thật)
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

## Chạy nhanh

```bash
npm install                      # một lần ở gốc cho cả monorepo
docker compose up -d             # api (3000) + web (5174); DATABASE_URL (Supabase) đặt trong backend/.env
                                 # DB local thay Supabase: docker compose --profile local up -d
npm run dev:api                  # hoặc chạy API trên máy host (cần backend/.env)
npm run dev:web
npm run typecheck && npm test    # npm run test:db: thêm test tích hợp (tự bật Postgres nhúng, không cần Docker)
```

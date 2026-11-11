# Build từ GỐC monorepo:  docker build -f backend/Dockerfile -t airrest-api .
# shortcut: chạy bằng tsx (packages/* là mã TS nguồn, chưa có bước build ra JS); thêm bundler nếu cần giảm thời gian khởi động.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY apps/web/package.json apps/web/
COPY packages/utils/package.json packages/utils/
COPY packages/business-logic/package.json packages/business-logic/
COPY packages/validation/package.json packages/validation/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci --omit=dev -w @airrest/backend --include-workspace-root=false
COPY packages packages
COPY backend backend
USER node
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "--import", "tsx", "api/server.ts"]

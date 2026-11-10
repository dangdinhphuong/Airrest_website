import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false, // các test tích hợp dùng chung một database

    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      DATA_ENC_KEY: 'test-data-key-test-data-key',
      LOG_LEVEL: 'silent',
      MONGO_DB: process.env.MONGO_DB_TEST ?? 'airrest_test',
    },
  },
});

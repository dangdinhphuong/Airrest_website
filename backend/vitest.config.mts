import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false, // các test tích hợp dùng chung một database
    globalSetup: ['tests/support/globalSetup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      DATA_ENC_KEY: 'test-data-key-test-data-key',
      R2_ACCOUNT_ID: 'testaccount',
      R2_ACCESS_KEY_ID: 'testkey',
      R2_SECRET_ACCESS_KEY: 'testsecret',
      R2_BUCKET: 'test-bucket',
      R2_PUBLIC_BASE_URL: 'https://pub-test.r2.dev',
      VNPAY_ENABLED: 'true',
      VNPAY_MODE: 'mock',
      LOG_LEVEL: 'silent',
    },
  },
});

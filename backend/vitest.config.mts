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
      MOMO_ENABLED: 'true',
      MOMO_MODE: 'mock',
      LOG_LEVEL: 'silent',
    },
  },
});

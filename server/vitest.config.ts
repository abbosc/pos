import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/pos_test',
      UPLOAD_DIR: '/tmp/pos-test-uploads',
      ADMIN_PASSWORD: 'test-pass',
      SESSION_SECRET: 'test-secret',
    },
    fileParallelism: false,
    testTimeout: 20000,
  },
});

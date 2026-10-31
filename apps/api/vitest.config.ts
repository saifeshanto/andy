import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      CRON_SECRET: 'test-secret-test-secret-test-secret-00',
      JWT_SECRET: 'test-jwt-secret-test-jwt-secret-test-jwt',
      BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com',
      MAIL_TRANSPORT: 'log',
      LOG_LEVEL: 'silent',
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    fileParallelism: false,
    env: { NODE_ENV: 'test', CRON_SECRET: 'test-secret-test-secret-test-secret-00' },
  },
});

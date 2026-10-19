import { defineConfig } from 'vitest/config';

// API tests run against a separate MySQL database (MYSQL_DATABASE_TEST, default "bangbang_sgms_test")
// that is wiped and re-seeded at the start of the run. Never point this at real data.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    globalSetup: ['tests/globalSetup.ts'],
  },
});

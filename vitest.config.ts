import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['verify/tests/**/*.test.ts'],
    testTimeout: 20_000,
  },
});

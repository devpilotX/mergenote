import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ["packages/*/tests/**/*.test.ts","packages/*/src/**/*.test.ts","db/**/*.test.ts"],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'db/src/**/*.ts'],
    },
  },
});

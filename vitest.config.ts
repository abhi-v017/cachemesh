import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@cachemesh/shared': resolve(__dirname, './packages/shared/src/index.ts'),
      '@cachemesh/adapters': resolve(__dirname, './packages/adapters/src/index.ts'),
      '@cachemesh/core': resolve(__dirname, './packages/core/src/index.ts'),
      '@cachemesh/sdk': resolve(__dirname, './packages/sdk/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 10000,
  },
});

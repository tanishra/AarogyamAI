import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    globalSetup: ['./src/test/globalSetup.ts'],
    // Migration tests share one database — parallel files race on
    // CREATE/DROP of the same tables, so serialize file execution.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

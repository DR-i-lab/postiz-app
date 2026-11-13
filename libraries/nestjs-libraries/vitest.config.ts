import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Unit tests of the library (run with `pnpm exec vitest run --config
// libraries/nestjs-libraries/vitest.config.ts` from the repository root).
export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@gitroom/nestjs-libraries': resolve(__dirname, 'src'),
      '@gitroom/helpers': resolve(__dirname, '../helpers/src'),
    },
  },
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});

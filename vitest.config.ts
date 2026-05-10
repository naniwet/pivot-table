import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // 仅 components/ 下的测试需要 DOM；core/ 测试保持 node 跑得快
    environmentMatchGlobs: [
      ['src/components/**', 'jsdom'],
      ['src/hooks/**', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/core/**'],
      exclude: ['src/core/**/*.test.ts', 'src/core/**/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/parsers.ts', 'src/sourceSync.ts', 'src/requestHeaders.ts', 'src/renderHtml.ts', 'src/renderWiki.ts'],
      exclude: ['src/test/**'],
      thresholds: {
        lines: 70,
        functions: 75,
        branches: 50,
        statements: 70
      }
    }
  }
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['services/ai-api/server.test.mjs', '**/node_modules/**', '**/out/**'],
  },
});

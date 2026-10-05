import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['tests/unit/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/core/**/*.ts'],
        reporter: ['text', 'json-summary', 'html'],
        thresholds: {
          perFile: true,
          statements: 91,
          branches: 91,
          functions: 100,
          lines: 91,
        },
      },
    },
  }),
);

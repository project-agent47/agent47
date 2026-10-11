import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.{ts,tsx}'], fileParallelism: false, testTimeout: process.platform === 'win32' ? 60000 : 10000 } });

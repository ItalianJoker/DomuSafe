import { fileURLToPath } from 'node:url';
import { domusafeVitest } from '@domusafe/config/vitest';

const config = domusafeVitest({
  environment: 'node',
  include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  globalSetup: ['./test/global-setup.ts'],
  testTimeout: 30_000,
  hookTimeout: 60_000,
});

config.resolve = {
  ...config.resolve,
  alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
};

export default config;

import { domusafeVitest } from '@domusafe/config/vitest';

export default domusafeVitest({
  globalSetup: ['./test/global-setup.ts'],
  testTimeout: 30_000,
  hookTimeout: 60_000,
});

import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

const conditions = ['@domusafe/source', ...defaultServerConditions];

/**
 * Shared Vitest config: Node environment and the `@domusafe/source` export condition, so workspace
 * packages are tested from their TypeScript sources without a build step.
 *
 * @param {import('vitest/config').TestUserConfig} [test] - Per-package overrides of the `test` block.
 * @returns {import('vitest/config').UserConfig} Vitest config.
 */
export function domusafeVitest(test = {}) {
  return defineConfig({
    resolve: { conditions },
    ssr: { resolve: { conditions } },
    test: {
      environment: 'node',
      include: ['test/**/*.test.ts'],
      ...test,
    },
  });
}

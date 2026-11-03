import type { TestUserConfig, UserConfig } from 'vitest/config';

/**
 * Shared Vitest config with the `@domusafe/source` export condition.
 *
 * @param test - Per-package overrides of the `test` block.
 * @returns Vitest config.
 */
export declare function domusafeVitest(test?: TestUserConfig): UserConfig;

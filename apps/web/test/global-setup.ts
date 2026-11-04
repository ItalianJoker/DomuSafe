import {
  dropTemplateDatabase,
  prepareTemplateDatabase,
  requireAdminUrl,
} from '../../../packages/db/src/testing.js';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext {
    templateDatabase: string;
  }
}

/**
 * Migrates one PostgreSQL template for the web client flow test.
 *
 * @param project - Vitest project that receives the template name.
 * @returns Cleanup that drops the template.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const adminUrl = requireAdminUrl();
  const template = await prepareTemplateDatabase(adminUrl);
  project.provide('templateDatabase', template);
  return async () => {
    await dropTemplateDatabase(adminUrl, template);
  };
}

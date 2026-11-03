// Global setup runs outside the Vite resolver that applies the @domusafe/source condition.
import {
  dropTemplateDatabase,
  prepareTemplateDatabase,
  requireAdminUrl,
} from '../../../packages/db/src/testing.js';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    templateDatabase: string;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const adminUrl = requireAdminUrl();
  const template = await prepareTemplateDatabase(adminUrl);
  project.provide('templateDatabase', template);
  return async () => {
    await dropTemplateDatabase(adminUrl, template);
  };
}

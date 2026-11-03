import type { TestProject } from 'vitest/node';
import { dropTemplateDatabase, prepareTemplateDatabase, requireAdminUrl } from '../src/testing.js';

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

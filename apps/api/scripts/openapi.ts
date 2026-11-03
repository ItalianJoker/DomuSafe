import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryStore } from '../src/infra/kv.js';

const OUTPUT = new URL('../openapi.json', import.meta.url);

/**
 * Generates `apps/api/openapi.json` from the route schemas without touching a database.
 * `write` updates the file; `check` exits with code 1 when the file differs from the code (CI).
 *
 * @param mode - `write` or `check`.
 * @returns Process exit code.
 */
async function main(mode: string | undefined): Promise<number> {
  if (mode !== 'write' && mode !== 'check') {
    process.stderr.write('Usage: openapi.ts write|check\n');
    return 2;
  }
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    PUBLIC_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: 'postgres://domusafe_app@localhost:5432/domusafe',
    DOMUSAFE_MASTER_KEYS: `1:${randomBytes(32).toString('base64url')}`,
    DOMUSAFE_MASTER_KEY_ACTIVE: '1',
  });
  const app = await buildApp({ config, store: new MemoryStore() });
  try {
    await app.ready();
    const document = `${JSON.stringify(app.swagger(), null, 2)}\n`;
    if (mode === 'write') {
      await writeFile(OUTPUT, document);
      process.stdout.write('openapi.json written\n');
      return 0;
    }
    const current = await readFile(OUTPUT, 'utf8').catch(() => '');
    if (current !== document) {
      process.stderr.write('openapi.json is out of date: run `pnpm openapi:write`\n');
      return 1;
    }
    process.stdout.write('openapi.json is up to date\n');
    return 0;
  } finally {
    await app.close();
  }
}

process.exitCode = await main(process.argv[2]);

#!/usr/bin/env node
import { migrate } from './migrate.js';

const USAGE = 'Usage: domusafe-db migrate   (env: DATABASE_MIGRATION_URL, optional DOMUSAFE_APP_DB_PASSWORD)';

/**
 * Command-line entry point. `migrate` applies pending migrations using `DATABASE_MIGRATION_URL`.
 *
 * @param argv - Arguments after the script name.
 * @returns Process exit code.
 */
async function main(argv: readonly string[]): Promise<number> {
  if (argv[0] !== 'migrate') {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const connectionString = process.env.DATABASE_MIGRATION_URL;
  if (connectionString === undefined || connectionString === '') {
    process.stderr.write(`DATABASE_MIGRATION_URL is required.\n${USAGE}\n`);
    return 2;
  }
  const appPassword = process.env.DOMUSAFE_APP_DB_PASSWORD;
  const applied = await migrate({
    connectionString,
    ...(appPassword === undefined || appPassword === '' ? {} : { appPassword }),
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(applied.length === 0 ? 'database is up to date\n' : `${String(applied.length)} migrations applied\n`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));

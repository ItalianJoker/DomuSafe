#!/usr/bin/env node
import { ensureRoles, migrate } from './migrate.js';

const USAGE = [
  'Usage:',
  '  domusafe-db roles     create domusafe_owner and domusafe_app (run once per cluster)',
  '  domusafe-db migrate   apply pending migrations to the database of DATABASE_MIGRATION_URL',
  'Environment: DATABASE_MIGRATION_URL (superuser or CREATEROLE), optional DOMUSAFE_APP_DB_PASSWORD',
].join('\n');

/**
 * Command-line entry point for database administration.
 *
 * @param argv - Arguments after the script name.
 * @returns Process exit code.
 */
async function main(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  if (command !== 'migrate' && command !== 'roles') {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const connectionString = process.env.DATABASE_MIGRATION_URL;
  if (connectionString === undefined || connectionString === '') {
    process.stderr.write(`DATABASE_MIGRATION_URL is required.\n${USAGE}\n`);
    return 2;
  }
  const password = process.env.DOMUSAFE_APP_DB_PASSWORD;
  const appPassword = password === undefined || password === '' ? undefined : password;
  if (command === 'roles') {
    await ensureRoles(connectionString, appPassword);
    process.stdout.write('roles domusafe_owner and domusafe_app are ready\n');
    return 0;
  }
  const applied = await migrate({
    connectionString,
    ...(appPassword === undefined ? {} : { appPassword }),
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(
    applied.length === 0 ? 'database is up to date\n' : `${String(applied.length)} migrations applied\n`,
  );
  return 0;
}

process.exitCode = await main(process.argv.slice(2));

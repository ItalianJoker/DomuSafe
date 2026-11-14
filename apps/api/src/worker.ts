import { createDatabase, createPool } from '@domusafe/db';
import { loadConfig } from './config.js';
import { createWebPushSender } from './modules/notifications/push.js';
import { createNotificationsService } from './modules/notifications/service.js';
import { createTenancyService } from './modules/tenancy/service.js';

const INTERVAL_MS = 15 * 60 * 1000;

/**
 * Background worker: delivers browser push for overdue and this-week family deadlines.
 *
 * Preconditions: `DATABASE_URL` and optional VAPID keys are set (same variables as the API).
 * Postconditions: each cycle creates at most one notification per account and task per calendar day.
 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.databaseUrl, {
    max: Math.min(config.databasePoolSize, 4),
    applicationName: 'domusafe-worker',
  });
  const db = createDatabase(pool);
  const tenancy = createTenancyService(db);
  const pushSender =
    config.vapidPublicKey !== null && config.vapidPrivateKey !== null
      ? createWebPushSender({
          publicKey: config.vapidPublicKey,
          privateKey: config.vapidPrivateKey,
          subject: config.vapidSubject,
        })
      : null;
  const notifications = createNotificationsService(db, tenancy, {
    vapidPublicKey: config.vapidPublicKey,
    pushSender,
  });

  const run = async (): Promise<void> => {
    const summary = await notifications.processDeadlineAlerts();
    process.stdout.write(
      `${JSON.stringify({
        msg: 'deadline_push_cycle',
        ...summary,
        at: new Date().toISOString(),
      })}\n`,
    );
  };

  await run();
  const timer = setInterval(() => {
    void run().catch((error: unknown) => {
      process.stderr.write(`${JSON.stringify({ msg: 'deadline_push_failed', error: String(error) })}\n`);
    });
  }, INTERVAL_MS);

  const shutdown = async (): Promise<void> => {
    clearInterval(timer);
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

await main();

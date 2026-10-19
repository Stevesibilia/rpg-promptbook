import { ensureAdmin } from './accounts/users.js';
import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createDb } from './db.js';
import { AppError } from './errors.js';
import { runMigrations } from './migrate.js';
import { purge } from './projects.js';

const PURGE_INTERVAL_MS = 3_600_000;

async function main() {
  const config = loadConfig();
  const db = createDb(config.databaseUrl);
  await runMigrations(db, (line) => console.log(line));
  const admin = await ensureAdmin(db, config.admin).catch((error: unknown) => {
    if (!(error instanceof AppError)) throw error;
    throw new ConfigError(`Invalid configuration:\n  PROMPTBOOK_ADMIN_USERNAME or PROMPTBOOK_ADMIN_PASSWORD: ${error.message}`);
  });
  if (admin) console.log(`Created the account "${admin.username}" from PROMPTBOOK_ADMIN_USERNAME.`);

  const app = await buildApp({ config, db, logger: true });

  // The bin, old sign-in failures, expired handshakes and expired snapshots,
  // at start and every hour.
  const runPurge = () =>
    purge(db)
      .then((removed) => {
        if (removed.projects > 0 || removed.snapshots > 0) app.log.info(removed, 'Purged the bin and old snapshots');
      })
      .catch((error: unknown) => app.log.error({ err: error }, 'Purge failed'));
  await runPurge();
  const purgeTimer = setInterval(runPurge, PURGE_INTERVAL_MS);

  const stop = async () => {
    clearInterval(purgeTimer);
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  await app.listen({ host: '0.0.0.0', port: config.port });
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});

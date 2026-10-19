import { ensureAdmin } from './accounts/users.js';
import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createDb } from './db.js';
import { AppError } from './errors.js';
import { runMigrations } from './migrate.js';

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
  const stop = async () => {
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

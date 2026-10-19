import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { deleteOtherSessions } from './accounts/sessions.js';
import { createUser, findUserByUsername, setPassword } from './accounts/users.js';
import { ConfigError, loadDatabaseUrl } from './config.js';
import { createDb, type Db } from './db.js';
import { AppError } from './errors.js';
import { runMigrations } from './migrate.js';
import { seedProjects } from './seed.js';

const USAGE = `Usage: cli <command>

  migrate                                     apply the database migrations
  user:create <username> [--display-name <name>]
                                              create an account
  user:password <username>                    set an account's password and end its sessions
  seed <username>                             create the sample projects for an account with none

The password comes from PROMPTBOOK_PASSWORD, or is asked for.`;

export interface CliIo {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  // Asks for a password without echoing it.
  askPassword: (prompt: string) => Promise<string>;
}

async function password(io: CliIo): Promise<string> {
  const fromEnv = io.env.PROMPTBOOK_PASSWORD;
  if (fromEnv) return fromEnv;
  const first = await io.askPassword('Password: ');
  const again = await io.askPassword('Password again: ');
  if (first !== again) throw new AppError(400, 'mismatch', 'The two passwords differ.');
  return first;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new AppError(400, 'usage', `${name} needs a value.`);
  args.splice(index, 2);
  return value;
}

// Runs one command against the database and answers its exit status.
export async function runCli(argv: string[], db: Db, io: CliIo): Promise<number> {
  const [command, ...rest] = argv;
  const args = [...rest];
  switch (command) {
    case 'migrate': {
      const applied = await runMigrations(db, io.out);
      if (applied.length === 0) io.out('The database is up to date.');
      return 0;
    }
    case 'user:create': {
      const displayName = option(args, '--display-name');
      const [username] = args;
      if (!username || args.length > 1) break;
      await runMigrations(db);
      const user = await createUser(db, { username, password: await password(io), displayName });
      io.out(`Created the account "${user.username}".`);
      return 0;
    }
    case 'user:password': {
      const [username] = args;
      if (!username || args.length > 1) break;
      const user = await findUserByUsername(db, username);
      if (!user) throw new AppError(404, 'not_found', `There is no account "${username}".`);
      await setPassword(db, user.id, await password(io));
      const ended = await deleteOtherSessions(db, user.id, null);
      io.out(`Set the password of "${user.username}" and ended ${ended.length} session(s).`);
      return 0;
    }
    case 'seed': {
      const [username] = args;
      if (!username || args.length > 1) break;
      await runMigrations(db);
      const count = await seedProjects(db, username);
      io.out(`Created ${count} sample projects for "${username}".`);
      return 0;
    }
  }
  io.out(USAGE);
  return 2;
}

function askPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    let asked = false;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (text: string) => {
      // Show the prompt, then nothing of what is typed.
      if (!asked) write(text);
      asked = true;
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  let db: Db | null = null;
  try {
    db = createDb(loadDatabaseUrl());
    process.exitCode = await runCli(process.argv.slice(2), db, {
      env: process.env,
      out: (line) => console.log(line),
      askPassword,
    });
  } catch (error) {
    console.error(error instanceof ConfigError || error instanceof AppError ? error.message : error);
    process.exitCode = 1;
  } finally {
    await db?.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();

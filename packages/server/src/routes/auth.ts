import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { clearSessionCookie, requireSession, setSessionCookie } from '../accounts/auth.js';
import { burnVerificationTime, verifyPassword } from '../accounts/passwords.js';
import { createSession, deleteOtherSessions, deleteSession } from '../accounts/sessions.js';
import { releaseAttempt, reserveAttempt } from '../accounts/throttle.js';
import { findUserByUsername, setDisplayName, setPassword } from '../accounts/users.js';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { parseBody } from '../validation.js';

export const WRONG_CREDENTIALS = 'Wrong username or password.';

const loginBody = z.object({ username: z.string().max(256), password: z.string().max(4096) });
const meBody = z.object({ displayName: z.string().trim().min(1, 'is required').max(100) });
const passwordBody = z.object({ current: z.string().max(4096), next: z.string().max(4096) });

export async function authRoutes(app: FastifyInstance, { config, db }: { config: Config; db: Db }) {
  // Every failure answers the same message and spends comparable time, the
  // unknown username included: a faster or different answer for a username
  // with no account would let anyone list the accounts.
  app.post('/api/auth/login', async (req, reply) => {
    const { username, password } = parseBody(loginBody, req.body);
    const attempt = await reserveAttempt(db, username, req.ip);
    const user = await findUserByUsername(db, username);
    const valid = user ? await verifyPassword(user.passwordHash, password) : await burnVerificationTime(password);
    if (!user || !valid) throw new AppError(401, 'invalid_credentials', WRONG_CREDENTIALS);

    await releaseAttempt(db, attempt);
    const { token } = await createSession(db, user.id, config.sessionTtlHours);
    await db.query('update users set last_login_at = now() where id = $1', [user.id]);
    setSessionCookie(reply, req, token, config.sessionTtlHours);
    return { user: { id: user.id, username: user.username, displayName: user.displayName } };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const session = requireSession(req);
    await deleteSession(db, session.tokenHash);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  // Public: the sign-in page asks it whether there is a session at all.
  app.get('/api/auth/me', async (req) => ({ user: req.session?.user ?? null }));

  app.patch('/api/auth/me', async (req) => {
    const session = requireSession(req);
    const { displayName } = parseBody(meBody, req.body);
    return { user: await setDisplayName(db, session.user.id, displayName) };
  });

  // Ends every other session of the user; the one making the change stays.
  app.post('/api/auth/password', async (req, reply) => {
    const session = requireSession(req);
    const { current, next } = parseBody(passwordBody, req.body);
    const user = await findUserByUsername(db, session.user.username);
    if (!user || !(await verifyPassword(user.passwordHash, current))) {
      throw new AppError(400, 'wrong_password', 'The current password is wrong.');
    }
    await setPassword(db, user.id, next);
    await deleteOtherSessions(db, user.id, session.tokenHash);
    return reply.code(204).send();
  });
}

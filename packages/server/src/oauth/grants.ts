import type { Queryable } from '../db.js';
import { AppError } from '../errors.js';
import { isUuid } from '../projects.js';
import type { GrantScope } from './config.js';

// A grant is one approval: this user let this client act for them, at this
// scope (connector design decision 7). It is what Connected apps lists and
// revokes; codes and tokens cascade with it, so revoking takes effect on the
// next request. Deleting the user deletes their grants.

export interface GrantRow {
  id: string;
  client_name: string;
  client_uri: string | null;
  scope: GrantScope;
  // The desktop app's: Connected apps names the computer.
  first_party: boolean;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

// A second approval of the same client is a second row on purpose: the two
// may carry different scopes, and revoking one leaves the other's tokens.
// The device name is the desktop app's computer, null for anything else.
export async function createGrant(
  db: Queryable,
  userId: string,
  clientRowId: string,
  scope: GrantScope,
  deviceName: string | null = null,
): Promise<string> {
  const row = await db.queryOne<{ id: string }>(
    'insert into oauth_grants (user_id, client_id, scope, device_name) values ($1, $2, $3, $4) returning id',
    [userId, clientRowId, scope, deviceName],
  );
  return row!.id;
}

// The user's own approvals, newest first.
export async function listGrants(db: Queryable, userId: string): Promise<GrantRow[]> {
  const rows = await db.query<{
    id: string;
    client_name: string;
    client_uri: string | null;
    scope: GrantScope;
    first_party: boolean;
    device_name: string | null;
    created_at: Date;
    last_used_at: Date | null;
  }>(
    `select g.id, c.client_name, c.client_uri, g.scope, c.first_party, g.device_name, g.created_at, g.last_used_at
     from oauth_grants g join oauth_clients c on c.id = g.client_id
     where g.user_id = $1
     order by g.created_at desc, g.id`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    client_name: r.client_name,
    client_uri: r.client_uri,
    scope: r.scope,
    first_party: r.first_party,
    device_name: r.device_name,
    created_at: r.created_at.toISOString(),
    last_used_at: r.last_used_at?.toISOString() ?? null,
  }));
}

// Revokes one of the user's approvals. Another user's answers as one that
// does not exist, so ids cannot be probed.
export async function revokeGrant(db: Queryable, userId: string, id: string): Promise<void> {
  const deleted = isUuid(id)
    ? await db.queryOne('delete from oauth_grants where id = $1 and user_id = $2 returning id', [id, userId])
    : null;
  if (!deleted) throw new AppError(404, 'not_found', 'Not found.');
}

// The desktop app's approvals no token was ever issued under, past the
// lifetime of their codes: no exchange can still happen, so they are a sign-in
// that never finished (a closed app, or a page that opened the authorize URL
// on its own: the first-party client is approved without a click). Connected
// apps would otherwise keep them for good. Other clients' grants stay, since
// their users approved them by hand.
export async function sweepUnfinishedFirstPartyGrants(db: Queryable, codeTtlMs: number): Promise<number> {
  const rows = await db.query(
    `delete from oauth_grants g using oauth_clients c
     where c.id = g.client_id and c.first_party
       and g.created_at < now() - make_interval(secs => $1)
       and not exists (select 1 from oauth_tokens t where t.grant_id = g.id)
     returning g.id`,
    [codeTtlMs / 1000],
  );
  return rows.length;
}

// The user's desktop app approvals of the last minutes with no token yet:
// sign-ins under way, which the authorize route caps.
export async function countPendingFirstPartyGrants(db: Queryable, userId: string, withinMs: number): Promise<number> {
  const row = await db.queryOne<{ n: string }>(
    `select count(*) as n from oauth_grants g join oauth_clients c on c.id = g.client_id
     where g.user_id = $1 and c.first_party
       and g.created_at > now() - make_interval(secs => $2)
       and not exists (select 1 from oauth_tokens t where t.grant_id = g.id)`,
    [userId, withinMs / 1000],
  );
  return Number(row?.n ?? 0);
}

// By id alone, for the revocation endpoint and a reused refresh token: the
// credential presented is what entitles the caller to end it.
export async function deleteGrant(db: Queryable, grantId: string): Promise<void> {
  await db.query('delete from oauth_grants where id = $1', [grantId]);
}

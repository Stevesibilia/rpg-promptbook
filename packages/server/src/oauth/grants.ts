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

// By id alone, for the revocation endpoint and a reused refresh token: the
// credential presented is what entitles the caller to end it.
export async function deleteGrant(db: Queryable, grantId: string): Promise<void> {
  await db.query('delete from oauth_grants where id = $1', [grantId]);
}

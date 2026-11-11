// The OpenRouter client (board-image-generation design decisions 2, 9 and
// 10), on the global fetch. The key travels only in the Authorization header
// of the request; no error this module throws or returns carries a header,
// the key or the request. Redirects are refused, so the key is never sent
// to another host than the configured one.

const CHECK_TIMEOUT_MS = 10_000;

export type KeyCheck =
  | { ok: true; limitRemaining: number | null }
  | { ok: false; reason: 'key_rejected' | 'openrouter_unreachable' };

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

// GET {base}/key: 200 answers the credit left on the key (null without a
// limit); 401 or 403 is a rejected key; anything else, no answer or a
// timeout, an unreachable OpenRouter.
export async function checkKey(baseUrl: string, key: string, timeoutMs = CHECK_TIMEOUT_MS): Promise<KeyCheck> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/key`, {
      headers: bearer(key),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: 'openrouter_unreachable' };
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    return { ok: false, reason: 'key_rejected' };
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    return { ok: false, reason: 'openrouter_unreachable' };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: 'openrouter_unreachable' };
  }
  const data = (body as { data?: { limit_remaining?: unknown } } | null)?.data;
  return { ok: true, limitRemaining: finite(data?.limit_remaining) };
}

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

// One image (D9): POST {base}/images, one image per call, always at 1K.
export interface ImageRequest {
  // OpenRouter's model id.
  model: string;
  prompt: string;
  aspectRatio: string;
}

export type ImageResult = { ok: true; bytes: Buffer; cost: number | null } | { ok: false; error: string };

const GENERATE_TIMEOUT_MS = 180_000;
// Far above any image of FILE_LIMITS in base64; a larger answer is refused
// before it is read.
const MAX_ANSWER_BYTES = 64 * 1024 * 1024;

// D10's plain words.
export const IMAGE_ERRORS = {
  rejected: 'OpenRouter rejected your key. Check it in Settings → Image generation.',
  noCredit: 'OpenRouter refused: your key has no credit left. Add credit on openrouter.ai, then try again.',
  busy: 'OpenRouter is busy (rate limit). Try again in a minute.',
  content: 'OpenRouter refused this prompt (content policy).',
  noAnswer: 'OpenRouter did not answer. Try again.',
  noImage: 'OpenRouter sent no image. Try again.',
  quota: 'Your files have reached their quota.',
  boardFull: 'The board has no room for more files.',
  refused: (status: number) => `OpenRouter refused the request (HTTP ${status}).`,
} as const;

// The sentence for an answer that is not a 200.
export function errorFor(status: number, body: string): string {
  if (status === 401) return IMAGE_ERRORS.rejected;
  if (status === 402) return IMAGE_ERRORS.noCredit;
  if (status === 429) return IMAGE_ERRORS.busy;
  if (status === 400 && /moderation|content/i.test(body)) return IMAGE_ERRORS.content;
  if (status >= 500) return IMAGE_ERRORS.noAnswer;
  return IMAGE_ERRORS.refused(status);
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export async function generateImage(
  baseUrl: string,
  key: string,
  request: ImageRequest,
  timeoutMs = GENERATE_TIMEOUT_MS,
): Promise<ImageResult> {
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${baseUrl}/images`, {
      method: 'POST',
      headers: { ...bearer(key), 'content-type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        aspect_ratio: request.aspectRatio,
        resolution: '1K',
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (Number(response.headers.get('content-length') ?? 0) > MAX_ANSWER_BYTES) {
      await response.body?.cancel();
      return { ok: false, error: IMAGE_ERRORS.noImage };
    }
    text = await response.text();
  } catch {
    return { ok: false, error: IMAGE_ERRORS.noAnswer };
  }
  if (response.status !== 200) return { ok: false, error: errorFor(response.status, text) };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: IMAGE_ERRORS.noImage };
  }
  const answer = body as { data?: unknown; usage?: { cost?: unknown } } | null;
  const first = Array.isArray(answer?.data) ? (answer.data[0] as { b64_json?: unknown } | undefined) : undefined;
  const b64 = typeof first?.b64_json === 'string' ? first.b64_json.replace(/\s+/g, '') : '';
  if (b64 === '' || !BASE64.test(b64)) return { ok: false, error: IMAGE_ERRORS.noImage };
  const cost = finite(answer?.usage?.cost);
  return { ok: true, bytes: Buffer.from(b64, 'base64'), cost: cost !== null && cost >= 0 ? cost : null };
}

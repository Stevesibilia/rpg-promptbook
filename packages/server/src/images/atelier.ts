import { FILE_LIMITS, IMAGE_MODELS, imageModelKeys, type ImageModelKey } from 'promptbook-project';

// The Atelier client (atelier-image-provider design decisions 1 and 6), on
// the global fetch. `base` is the server's ATELIER_URL; the API is under
// /api/v1. The token travels only in the Authorization header; no error this
// module throws carries a header, the token or the request. Redirects are
// refused, so the token is never sent to another host than the configured
// one.

const JSON_TIMEOUT_MS = 10_000;
const FILE_TIMEOUT_MS = 120_000;
const MAX_JSON_BYTES = 1024 * 1024;

export class AtelierError extends Error {
  constructor(
    // Atelier's HTTP status; 0 when it did not answer.
    readonly status: number,
    // Atelier's `error`, or atelier_unreachable, atelier_refused,
    // atelier_bad_answer.
    readonly code: string,
    message: string,
    // Atelier's `field` on an invalid_request.
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = 'AtelierError';
  }
}

export const ATELIER_ERRORS = {
  unreachable: 'Atelier did not answer.',
  refused: (status: number) => `Atelier refused the request (${status}).`,
  badAnswer: 'Atelier sent an answer Promptbook cannot read.',
} as const;

const unreachable = () => new AtelierError(0, 'atelier_unreachable', ATELIER_ERRORS.unreachable);
const badAnswer = (status: number) => new AtelierError(status, 'atelier_bad_answer', ATELIER_ERRORS.badAnswer);

// Each call's limits; the tests shorten the timeout. `signal` stops a call
// early (a job's stop).
export interface CallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// The answer's bytes, or null past `max`: counted as they stream, so an
// answer without a Content-Length cannot fill the memory.
async function readCapped(response: Response, max: number): Promise<Buffer | null> {
  if (!response.body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > max) {
      await response.body.cancel().catch(() => {});
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

interface Request {
  method?: 'GET' | 'POST';
  body?: unknown;
  max: number;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}

// One call: the answer's status and bytes, or AtelierError for no answer, an
// answer past `max`, or an error answer.
async function call(base: string, token: string, path: string, request: Request): Promise<{ status: number; bytes: Buffer }> {
  const timeout = AbortSignal.timeout(request.timeoutMs);
  let status: number;
  let bytes: Buffer | null;
  try {
    const response = await fetch(`${base}/api/v1${path}`, {
      method: request.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
      redirect: 'error',
      signal: request.signal ? AbortSignal.any([timeout, request.signal]) : timeout,
    });
    status = response.status;
    // An error answer is JSON, whatever the route.
    bytes = await readCapped(response, status >= 200 && status < 300 ? request.max : MAX_JSON_BYTES);
  } catch {
    throw unreachable();
  }
  if (status >= 200 && status < 300) {
    if (bytes === null) throw badAnswer(status);
    return { status, bytes };
  }
  // Atelier's own errors are {error, message} with a plain sentence, and a
  // field on an invalid_request; anything else is a refusal.
  let answer: Record<string, unknown> | null = null;
  try {
    answer = bytes === null ? null : record(JSON.parse(bytes.toString('utf8')));
  } catch {
    answer = null;
  }
  if (answer && isText(answer.error) && answer.error !== '' && isText(answer.message) && answer.message !== '') {
    throw new AtelierError(status, answer.error, answer.message, isText(answer.field) ? answer.field : null);
  }
  throw new AtelierError(status, 'atelier_refused', ATELIER_ERRORS.refused(status));
}

async function callJson(base: string, token: string, path: string, options: CallOptions, body?: unknown) {
  const { status, bytes } = await call(base, token, path, {
    ...(body !== undefined ? { method: 'POST' as const, body } : {}),
    max: MAX_JSON_BYTES,
    timeoutMs: options.timeoutMs ?? JSON_TIMEOUT_MS,
    signal: options.signal,
  });
  try {
    const parsed = record(JSON.parse(bytes.toString('utf8')));
    if (parsed) return { status, answer: parsed };
  } catch {
    // Below.
  }
  throw badAnswer(status);
}

export interface TokenDescription {
  name: string;
  access: 'read' | 'write';
  // ISO; null for a token that never expires.
  expiresAt: string | null;
}

// Step 1: what a token is. A rejected token throws AtelierError with status
// 401 (invalid_token).
export async function describeToken(base: string, token: string, options: CallOptions = {}): Promise<TokenDescription> {
  const { status, answer } = await callJson(base, token, '/token', options);
  const { name, access, expiresAt } = answer;
  if (!isText(name) || (access !== 'read' && access !== 'write') || !(expiresAt === null || isText(expiresAt))) {
    throw badAnswer(status);
  }
  return { name, access, expiresAt };
}

// Step 2: this month's spend against the cap, in dollars.
export async function readMonth(base: string, token: string, options: CallOptions = {}): Promise<{ spent: number; cap: number }> {
  const { status, answer } = await callJson(base, token, '/spend', options);
  const month = record(answer.month);
  const spent = finite(month?.spent);
  const cap = finite(month?.cap);
  if (spent === null || cap === null) throw badAnswer(status);
  return { spent, cap };
}

// Step 3: Atelier's estimate per image for the models Promptbook offers; a
// model Atelier has not enabled is left out.
export async function readEstimates(
  base: string,
  token: string,
  options: CallOptions = {},
): Promise<Partial<Record<ImageModelKey, number>>> {
  const { status, answer } = await callJson(base, token, '/models', options);
  if (!Array.isArray(answer.models)) throw badAnswer(status);
  const estimates: Partial<Record<ImageModelKey, number>> = {};
  for (const key of imageModelKeys) {
    const model = answer.models.map(record).find((m) => m?.id === IMAGE_MODELS[key].id);
    const cost = finite(model?.estCostUsd);
    if (cost !== null && cost >= 0) estimates[key] = cost;
  }
  return estimates;
}

// Step 4: the collection of that name, made when there is none. Atelier
// refuses a second collection of a name in any letter case.
export async function ensureCollection(base: string, token: string, name: string, options: CallOptions = {}): Promise<string> {
  try {
    const { status, answer } = await callJson(base, token, '/collections', options, { name });
    if (!isUuid(answer.id)) throw badAnswer(status);
    return answer.id;
  } catch (error) {
    if (!(error instanceof AtelierError) || error.code !== 'collection_exists') throw error;
  }
  const { status, answer } = await callJson(base, token, '/collections', options);
  if (!Array.isArray(answer.collections)) throw badAnswer(status);
  const wanted = name.toLowerCase();
  const found = answer.collections.map(record).find((c) => isText(c?.name) && c.name.toLowerCase() === wanted);
  if (!found || !isUuid(found.id)) throw badAnswer(status);
  return found.id;
}

export interface GenerationRequest {
  prompt: string;
  // Atelier's model id: IMAGE_MODELS[key].id.
  model: string;
  aspectRatio: string;
  count: number;
  collectionId: string;
}

// Step 5: one generation of `count` images, filed into the collection.
export async function startGeneration(
  base: string,
  token: string,
  body: GenerationRequest,
  options: CallOptions = {},
): Promise<{ id: string }> {
  const { status, answer } = await callJson(base, token, '/generations', options, body);
  if (!isUuid(answer.id)) throw badAnswer(status);
  return { id: answer.id };
}

export interface AtelierImage {
  id: string;
  costUsd: number | null;
  mime: string;
}

export interface GenerationState {
  status: 'running' | 'done' | 'partial' | 'failed';
  images: AtelierImage[];
  failures: string[];
  error: string | null;
  costUsd: number | null;
}

const STATUSES = ['running', 'done', 'partial', 'failed'] as const;

// Step 6: where a generation is. An image without a uuid id is left out, so
// it counts as missing.
export async function readGeneration(base: string, token: string, id: string, options: CallOptions = {}): Promise<GenerationState> {
  const { status, answer } = await callJson(base, token, `/generations/${encodeURIComponent(id)}`, options);
  const state = answer.status;
  if (!(STATUSES as readonly unknown[]).includes(state) || !Array.isArray(answer.images)) throw badAnswer(status);
  const images: AtelierImage[] = [];
  for (const value of answer.images) {
    const image = record(value);
    if (!image || !isUuid(image.id)) continue;
    const cost = finite(image.costUsd);
    images.push({ id: image.id, costUsd: cost !== null && cost >= 0 ? cost : null, mime: isText(image.mime) ? image.mime : '' });
  }
  const failures = Array.isArray(answer.failures) ? answer.failures.filter((f): f is string => isText(f) && f !== '') : [];
  const cost = finite(answer.costUsd);
  return {
    status: state as GenerationState['status'],
    images,
    failures,
    error: isText(answer.error) && answer.error !== '' ? answer.error : null,
    costUsd: cost !== null && cost >= 0 ? cost : null,
  };
}

// Step 7: an image's bytes, at most FILE_LIMITS.image.
export async function downloadImage(base: string, token: string, id: string, options: CallOptions = {}): Promise<Buffer> {
  const { bytes } = await call(base, token, `/images/${encodeURIComponent(id)}/file`, {
    max: FILE_LIMITS.image,
    timeoutMs: options.timeoutMs ?? FILE_TIMEOUT_MS,
    signal: options.signal,
  });
  return bytes;
}

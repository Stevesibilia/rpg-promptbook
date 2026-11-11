import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readGenerationJobs,
  STALE_GENERATION_MS,
  type FileEntry,
  type GenerationJob,
  type Settings,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { api, ApiError, type GenerateBody, type ImageGenerationStatus, type SpendingTotal } from '../api.js';
import { platform } from '../platform/index.js';
import { useStore } from '../platform/hooks.js';
import { createStore } from '../platform/store.js';
import { endedJobs, generateDefaults, refusal, type GenerateChoice } from './generate.js';

// Image generation's data on the board (board-image-generation design
// decisions 2, 8, 11 and 13): the account's status and defaults, fetched once
// per page and per account; the session's last choice; the project's
// spending; the jobs in the project document; the starts on their way to the
// server. No key is ever held here: the server answers only its last four
// characters.

// --- The account's status ---------------------------------------------------

export type StatusState =
  | { state: 'loading' }
  | { state: 'ready'; status: ImageGenerationStatus }
  | { state: 'failed' };

interface Owned<T> {
  user: string;
  value: T;
}

const statusStore = createStore<Owned<StatusState> | null>(null);
// Bumped by every answer Settings hands over, so a plain read that started
// before a key was saved or removed never overwrites what came after.
let statusVersion = 0;
let statusLoading: string | null = null;

export function loadGenerationStatus(user: string): void {
  if (statusLoading === user) return;
  statusLoading = user;
  const version = statusVersion;
  const held = statusStore.get();
  if (!held || held.user !== user || held.value.state !== 'ready') statusStore.set({ user, value: { state: 'loading' } });
  api.imageGeneration().then(
    (status) => {
      if (statusLoading === user) statusLoading = null;
      if (version === statusVersion) statusStore.set({ user, value: { state: 'ready', status } });
    },
    () => {
      if (statusLoading === user) statusLoading = null;
      const now = statusStore.get();
      if (version === statusVersion && !(now?.user === user && now.value.state === 'ready')) {
        statusStore.set({ user, value: { state: 'failed' } });
      }
    },
  );
}

// What Settings learned (a check, a save, a removal) becomes the page's.
export function setGenerationStatus(user: string, status: ImageGenerationStatus): void {
  statusVersion += 1;
  statusStore.set({ user, value: { state: 'ready', status } });
}

// The status for this account: fetched once per page, again after a
// failure when `retry` is called. Offline on the desktop nothing is asked.
export function useGenerationStatus(user: string, offline: boolean): { status: StatusState; retry(): void } {
  const held = useStore(statusStore);
  const mine = held?.user === user ? held.value : null;
  useEffect(() => {
    if (!offline && mine === null) loadGenerationStatus(user);
  }, [user, offline, mine]);
  const retry = useCallback(() => {
    const now = statusStore.get();
    if (!offline && !(now?.user === user && now.value.state === 'ready')) loadGenerationStatus(user);
  }, [user, offline]);
  return { status: mine ?? { state: 'loading' }, retry };
}

// --- The account's defaults and the session's last choice --------------------

const defaultsStore = createStore<Owned<GenerateChoice> | null>(null);
let defaultsVersion = 0;
let defaultsLoading: string | null = null;

// The settings as Settings loaded or saved them.
export function noteSettings(user: string, settings: Partial<Settings>): void {
  defaultsVersion += 1;
  const choice = generateDefaults(settings);
  const held = defaultsStore.get();
  if (held?.user === user && held.value.model === choice.model && held.value.count === choice.count) return;
  defaultsStore.set({ user, value: choice });
}

function loadDefaults(user: string): void {
  if (defaultsLoading === user) return;
  defaultsLoading = user;
  const version = defaultsVersion;
  const settle = (choice: GenerateChoice) => {
    if (defaultsLoading === user) defaultsLoading = null;
    if (version === defaultsVersion) defaultsStore.set({ user, value: choice });
  };
  api.settings().then(
    (settings) => settle(generateDefaults(settings)),
    () => settle(generateDefaults(null)),
  );
}

export function useGenerateDefaults(user: string): GenerateChoice {
  const held = useStore(defaultsStore);
  const mine = held?.user === user ? held.value : null;
  useEffect(() => {
    if (mine === null) loadDefaults(user);
  }, [user, mine]);
  return mine ?? generateDefaults(null);
}

let lastChoice: Owned<GenerateChoice> | null = null;

export const lastChoiceOf = (user: string): GenerateChoice | null =>
  lastChoice?.user === user ? lastChoice.value : null;

export function rememberChoice(user: string, choice: GenerateChoice): void {
  lastChoice = { user, value: choice };
}

// --- The project's spending --------------------------------------------------

// «Generated here»: asked when the board opens and again when `version`
// changes (a job ended). Null offline, on a failure, or before the answer.
export function useProjectSpending(projectId: string, version: number, offline: boolean): SpendingTotal | null {
  const [held, setHeld] = useState<{ projectId: string; total: SpendingTotal } | null>(null);
  useEffect(() => {
    if (offline) return;
    let live = true;
    api.imageSpending(projectId).then(
      (total) => live && setHeld({ projectId, total }),
      () => live && setHeld(null),
    );
    return () => {
      live = false;
    };
  }, [projectId, version, offline]);
  return offline || held?.projectId !== projectId ? null : held.total;
}

// --- The jobs in the document --------------------------------------------------

const sameJobs = (a: readonly GenerationJob[], b: readonly GenerationJob[]) =>
  a.length === b.length && JSON.stringify(a) === JSON.stringify(b);

// The running jobs and the errors, read again on every change of the map, and
// once more when a running job would go stale, so a job whose server stopped
// drops out without another change.
export function useGenerationJobs(doc: Y.Doc): GenerationJob[] {
  const [jobs, setJobs] = useState(() => readGenerationJobs(doc));
  useEffect(() => {
    const map = doc.getMap('generationJobs');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      const now = Date.now();
      const next = readGenerationJobs(doc, new Date(now));
      setJobs((prev) => (sameJobs(prev, next) ? prev : next));
      const waits = next
        .filter((j) => j.finishedAt === null)
        .map((j) => Date.parse(j.startedAt) + STALE_GENERATION_MS + 1000 - now);
      if (waits.length > 0) timer = setTimeout(update, Math.min(STALE_GENERATION_MS, Math.max(1000, ...waits)));
    };
    update();
    map.observe(update);
    return () => {
      map.unobserve(update);
      clearTimeout(timer);
    };
  }, [doc]);
  return jobs;
}

// Calls `onEnd` with the jobs that ended since the last reading.
export function useJobEndings(
  jobs: readonly GenerationJob[],
  onEnd: (ended: { job: GenerationJob; error: string | null }[]) => void,
): void {
  const before = useRef(jobs);
  const handler = useRef(onEnd);
  handler.current = onEnd;
  useEffect(() => {
    const prev = before.current;
    before.current = jobs;
    if (prev === jobs) return;
    const ended = endedJobs(prev, jobs, Date.now());
    if (ended.length > 0) handler.current(ended);
  }, [jobs]);
}

// Generated images that arrive while the board is open are marked new, as
// dropped files are. Those already there when it opened are not.
export function useArrivals(files: readonly FileEntry[], mark: (fileId: string) => void): void {
  const seen = useRef<Set<string> | null>(null);
  const handler = useRef(mark);
  handler.current = mark;
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(files.map((f) => f.id));
      return;
    }
    for (const f of files) {
      if (seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      if (f.matchedBy === 'generated') handler.current(f.id);
    }
  }, [files]);
}

// --- Starting a job -------------------------------------------------------------

// A start the server took: shown as progress at once, until its job shows
// in the document (or a while passes, should the job end before this device
// ever sees it).
export interface PendingStart {
  model: GenerateChoice['model'];
  count: number;
  since: string;
  jobId: string;
}

// Why the server did not start a job: the panel shows it under its footer and
// stays open.
export interface Refused {
  code: string;
  message: string;
}

const PENDING_MS = 20_000;

export function useGenerate(
  projectId: string,
  jobs: readonly GenerationJob[],
): {
  pending: ReadonlyMap<string, PendingStart>;
  start(promptId: string, body: GenerateBody): Promise<Refused | null>;
} {
  const [pending, setPending] = useState<ReadonlyMap<string, PendingStart>>(new Map());
  const drop = useCallback((promptId: string, jobId: string) => {
    setPending((now) => {
      if (now.get(promptId)?.jobId !== jobId) return now;
      const next = new Map(now);
      next.delete(promptId);
      return next;
    });
  }, []);

  // A start whose job is in the document is shown from there.
  useEffect(() => {
    const ids = new Set(jobs.map((j) => j.id));
    for (const [promptId, p] of pending) if (ids.has(p.jobId)) drop(promptId, p.jobId);
  }, [jobs, pending, drop]);

  const start = useCallback(
    async (promptId: string, body: GenerateBody): Promise<Refused | null> => {
      const since = new Date().toISOString();
      try {
        const { jobId } = await api.generate(projectId, promptId, body);
        setPending((now) => new Map(now).set(promptId, { model: body.model, count: body.count, since, jobId }));
        setTimeout(() => drop(promptId, jobId), PENDING_MS);
        return null;
      } catch (error) {
        const code = error instanceof ApiError ? error.code : 'error';
        const message = error instanceof ApiError ? error.message : 'Generating failed.';
        return { code, message: refusal(code, message, platform.kind === 'desktop') };
      }
    },
    [projectId, drop],
  );

  return { pending, start };
}

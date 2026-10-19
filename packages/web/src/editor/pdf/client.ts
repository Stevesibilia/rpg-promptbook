import type { PdfAnswer, PdfBuild, PdfRequest, PdfSource } from './protocol.js';

// One worker, seen from the client: the real one in the browser, a fake in
// the tests.
export interface PdfWorkerPort {
  send(request: PdfRequest): void;
  dispose(): void;
}

export type PdfConnect = (receive: (answer: PdfAnswer) => void, fail: (reason: string) => void) => PdfWorkerPort;

export interface PdfSnapshot {
  // `idle` until the first request, `loading` until the worker first answers.
  engine: 'idle' | 'loading' | 'ready' | 'failed';
  // Why the engine failed.
  error: string | null;
  // The latest build answered, and the latest one that built with the
  // version of its request.
  latest: PdfBuild | null;
  good: PdfBuild | null;
  goodVersion: number | null;
}

export interface PdfClientOptions {
  connect: PdfConnect;
  // What to build, read when the request with this version is sent.
  read(version: number): PdfSource;
  delay?: number;
  // How long a request may go unanswered before the worker is given up.
  timeout?: number;
}

export interface PdfClient {
  get(): PdfSnapshot;
  subscribe(listener: () => void): () => void;
  // The pane or the review is open: builds are sent only then. Opening one
  // after a failure starts a new worker.
  setActive(active: boolean): void;
  // The text or the options changed: build again once still for the delay.
  changed(): void;
  // Build now, or as soon as the build in flight is answered.
  flush(): void;
  // The PDF of the text and options as they are now.
  pdf(): Promise<Uint8Array>;
  dispose(): void;
}

export const noAnswer = (seconds: number): string => `The PDF engine did not answer within ${seconds} seconds.`;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// The PDF worker's client (design decision 9), like the analysis client: a
// build after the text has been still for 400 ms, at most one in flight, and
// an answer dropped when a newer request is already waiting, so a late answer
// never overwrites a newer one. Nothing is sent while the pane and the review
// are closed; opening one builds what changed meanwhile. A request with no
// answer in 60 s, a worker that crashes or an engine that does not load
// ends the worker; the next opening starts a new one.
export function createPdfClient({ connect, read, delay = 400, timeout = 60_000 }: PdfClientOptions): PdfClient {
  let snapshot: PdfSnapshot = { engine: 'idle', error: null, latest: null, good: null, goodVersion: null };
  const listeners = new Set<() => void>();
  let port: PdfWorkerPort | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: number | null = null;
  let waiting = false;
  let dirty = true;
  let active = false;
  let version = 0;
  let disposed = false;
  const pdfs = new Map<number, { resolve(bytes: Uint8Array): void; reject(error: Error): void }>();
  // One per request waiting for its answer.
  const deadlines = new Map<number, ReturnType<typeof setTimeout>>();

  const update = (next: Partial<PdfSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };

  // Sends a request, its deadline running; throws when the worker cannot be
  // started.
  const post = (request: PdfRequest) => {
    if (!port) {
      port = connect(receive, fail);
      if (snapshot.engine === 'idle') update({ engine: 'loading' });
    }
    deadlines.set(
      request.version,
      setTimeout(() => fail(noAnswer(Math.round(timeout / 1000))), timeout),
    );
    port.send(request);
  };

  const answered = (request: number) => {
    const deadline = deadlines.get(request);
    if (deadline !== undefined) clearTimeout(deadline);
    deadlines.delete(request);
  };

  const send = () => {
    waiting = false;
    if (disposed || snapshot.engine === 'failed' || !active) return;
    dirty = false;
    version += 1;
    inFlight = version;
    try {
      post({ kind: 'build', version, ...read(version) });
    } catch (error) {
      answered(version);
      inFlight = null;
      fail(message(error));
    }
  };

  const due = () => {
    timer = null;
    if (inFlight !== null) waiting = true;
    else send();
  };

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  function receive(answer: PdfAnswer) {
    if (disposed) return;
    if (answer.kind === 'failed') return fail(answer.error);
    answered(answer.version);
    if (snapshot.engine === 'loading') update({ engine: 'ready' });
    if (answer.kind === 'pdf') {
      const pending = pdfs.get(answer.version);
      pdfs.delete(answer.version);
      if ('bytes' in answer) pending?.resolve(answer.bytes);
      else pending?.reject(new Error(answer.error));
      return;
    }
    if (answer.version !== inFlight) return;
    inFlight = null;
    if (waiting) return send();
    const { build } = answer;
    update(
      build.svg
        ? { latest: build, good: build, goodVersion: answer.version }
        : { latest: build },
    );
  }

  // The worker could not start or crashed, the engine could not load, or a
  // request went unanswered: the worker goes, rather than a request sent
  // again on every keystroke, and what waits is rejected.
  function fail(reason: string) {
    if (disposed || snapshot.engine === 'failed') return;
    clear();
    inFlight = null;
    waiting = false;
    dirty = true;
    for (const deadline of deadlines.values()) clearTimeout(deadline);
    deadlines.clear();
    const waitingPdfs = [...pdfs.values()];
    pdfs.clear();
    port?.dispose();
    port = null;
    update({ engine: 'failed', error: reason });
    for (const pending of waitingPdfs) pending.reject(new Error(reason));
  }

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setActive(next) {
      if (disposed || active === next) return;
      active = next;
      if (!active) {
        clear();
        return;
      }
      if (snapshot.engine === 'failed') update({ engine: 'idle', error: null });
      if (dirty || !snapshot.latest) {
        clear();
        due();
      }
    },
    changed() {
      if (disposed) return;
      dirty = true;
      if (!active) return;
      clear();
      timer = setTimeout(due, delay);
    },
    flush() {
      if (disposed || !active) return;
      clear();
      due();
    },
    pdf() {
      if (disposed) return Promise.reject(new Error('The page was closed.'));
      if (snapshot.engine === 'failed') return Promise.reject(new Error(snapshot.error ?? 'The PDF engine failed.'));
      version += 1;
      const request = version;
      return new Promise<Uint8Array>((resolve, reject) => {
        pdfs.set(request, { resolve, reject });
        try {
          post({ kind: 'pdf', version: request, ...read(request) });
        } catch (error) {
          answered(request);
          pdfs.delete(request);
          reject(new Error(message(error)));
          fail(message(error));
        }
      });
    },
    dispose() {
      disposed = true;
      clear();
      inFlight = null;
      for (const deadline of deadlines.values()) clearTimeout(deadline);
      deadlines.clear();
      for (const pending of pdfs.values()) pending.reject(new Error('The page was closed.'));
      pdfs.clear();
      listeners.clear();
      port?.dispose();
      port = null;
    },
  };
}

// The PDF worker of the browser, bundled by Vite as a same-origin file.
export const connectPdfWorker: PdfConnect = (receive, fail) => {
  const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<PdfAnswer>) => receive(event.data);
  worker.onerror = (event) => {
    event.preventDefault();
    fail(event.message || 'the PDF worker failed to load');
  };
  return {
    send: (request) => worker.postMessage(request),
    dispose: () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    },
  };
};

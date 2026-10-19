import type { ParseResult } from 'promptbook-format';

// The messages between the editor and the parse worker.
export interface ParseRequest {
  version: number;
  text: string;
}

export type ParseAnswer = { version: number; result: ParseResult } | { version: number; error: string };

// One worker, seen from the client: the real one in the browser, a fake in
// the tests.
export interface WorkerPort {
  send(request: ParseRequest): void;
  dispose(): void;
}

export type Connect = (receive: (answer: ParseAnswer) => void, fail: (reason: string) => void) => WorkerPort;

export interface AnalysisClientOptions<T> {
  connect: Connect;
  // The text to parse and a tag the answer is given back with, read when the
  // request is sent rather than when the text changed.
  read(): { text: string; tag: T };
  apply(tag: T, result: ParseResult): void;
  delay?: number;
}

export interface AnalysisClient {
  // The text changed: parse it once it has been still for the delay.
  changed(): void;
  // Parse now, or as soon as the request in flight is answered.
  flush(): void;
  dispose(): void;
}

// The worker's client (design decision 3): a request after the text has been
// still for 250 ms, at most one in flight, and an answer dropped when a newer
// text is already waiting to be sent, so a late answer never overwrites a
// newer one.
export function createAnalysisClient<T>({
  connect,
  read,
  apply,
  delay = 250,
}: AnalysisClientOptions<T>): AnalysisClient {
  let port: WorkerPort | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: { version: number; tag: T } | null = null;
  let waiting = false;
  let version = 0;
  let disposed = false;
  let broken = false;

  const send = () => {
    waiting = false;
    if (disposed || broken) return;
    const { text, tag } = read();
    version += 1;
    inFlight = { version, tag };
    port ??= connect(receive, fail);
    port.send({ version, text });
  };

  const due = () => {
    timer = null;
    if (inFlight) waiting = true;
    else send();
  };

  function receive(answer: ParseAnswer) {
    if (disposed || !inFlight || answer.version !== inFlight.version) return;
    const { tag } = inFlight;
    inFlight = null;
    if (waiting) return send();
    if ('result' in answer) apply(tag, answer.result);
    else console.error(`The document could not be checked: ${answer.error}`);
  }

  // The worker could not start or crashed: no checks for this editor, rather
  // than a request sent again on every keystroke.
  function fail(reason: string) {
    if (disposed) return;
    broken = true;
    inFlight = null;
    console.error(`The document checker stopped: ${reason}`);
  }

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    changed() {
      if (disposed) return;
      clear();
      timer = setTimeout(due, delay);
    },
    flush() {
      if (disposed) return;
      clear();
      due();
    },
    dispose() {
      disposed = true;
      clear();
      inFlight = null;
      port?.dispose();
      port = null;
    },
  };
}

// The parse worker of the browser, bundled by Vite as a same-origin file.
export const connectWorker: Connect = (receive, fail) => {
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<ParseAnswer>) => receive(event.data);
  worker.onerror = (event) => {
    event.preventDefault();
    fail(event.message || 'the worker failed to load');
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

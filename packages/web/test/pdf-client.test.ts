import { defaultLayoutOptions } from 'promptbook-layout';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPdfClient, noAnswer } from '../src/editor/pdf/client.js';
import type { PdfAnswer, PdfBuild, PdfRequest } from '../src/editor/pdf/protocol.js';

// A worker that answers only when the test says so.
function fakeWorker() {
  const sent: PdfRequest[] = [];
  let receive: (answer: PdfAnswer) => void = () => {};
  let fail: (reason: string) => void = () => {};
  let connections = 0;
  let disposed = false;
  return {
    sent,
    get connections() {
      return connections;
    },
    get disposed() {
      return disposed;
    },
    connect(r: typeof receive, f: typeof fail) {
      connections += 1;
      receive = r;
      fail = f;
      return { send: (request: PdfRequest) => sent.push(request), dispose: () => (disposed = true) };
    },
    receive: (answer: PdfAnswer) => receive(answer),
    // A build of the request's text, or a failed one.
    answer(request: PdfRequest, ok = true) {
      const build: PdfBuild = {
        svg: ok ? `<svg>${request.text}</svg>` : null,
        pages: [],
        positions: [],
        checks: [],
        diagnostics: ok ? [] : [{ severity: 'error', message: `bad ${request.text}` }],
      };
      receive({ kind: 'build', version: request.version, build });
    },
    crash: (reason = 'boom') => fail(reason),
  };
}

function setup() {
  const worker = fakeWorker();
  let text = 'a';
  let options = defaultLayoutOptions;
  const client = createPdfClient({
    connect: (r, f) => worker.connect(r, f),
    read: () => ({ text, options, project: { title: 'T' } }),
  });
  const builds = () => worker.sent.filter((r) => r.kind === 'build').map((r) => r.text);
  return {
    worker,
    client,
    builds,
    type(next: string) {
      text = next;
      client.changed();
    },
    setOptions(next: typeof options) {
      options = next;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the PDF worker client', () => {
  it('sends nothing until the pane or the review is open, then builds at once', () => {
    const { worker, client, builds, type } = setup();
    type('ab');
    vi.advanceTimersByTime(1000);
    expect(worker.connections).toBe(0);
    expect(client.get().engine).toBe('idle');
    client.setActive(true);
    expect(builds()).toEqual(['ab']);
    expect(client.get().engine).toBe('loading');
  });

  it('builds once the text has been still for 400 ms, one build in flight, dropping a stale answer', () => {
    const { worker, client, builds, type } = setup();
    client.setActive(true);
    worker.answer(worker.sent[0]!);
    expect(client.get().engine).toBe('ready');
    type('b');
    vi.advanceTimersByTime(300);
    type('bc');
    vi.advanceTimersByTime(300);
    expect(builds()).toEqual(['a']);
    vi.advanceTimersByTime(100);
    expect(builds()).toEqual(['a', 'bc']);

    type('bcd');
    vi.advanceTimersByTime(400);
    expect(builds()).toEqual(['a', 'bc']);
    worker.answer(worker.sent[1]!);
    // The answer for "bc" is dropped: a newer text was waiting.
    expect(client.get().latest?.svg).toBe('<svg>a</svg>');
    expect(builds()).toEqual(['a', 'bc', 'bcd']);
    worker.answer(worker.sent[2]!);
    expect(client.get().latest?.svg).toBe('<svg>bcd</svg>');
  });

  it('keeps the last good build when a build fails', () => {
    const { worker, client, type } = setup();
    client.setActive(true);
    worker.answer(worker.sent[0]!);
    type('broken');
    vi.advanceTimersByTime(400);
    worker.answer(worker.sent[1]!, false);
    expect(client.get().latest?.diagnostics[0]?.message).toBe('bad broken');
    expect(client.get().good?.svg).toBe('<svg>a</svg>');
  });

  it('builds what changed while closed when opened again, and nothing when nothing changed', () => {
    const { worker, client, builds, type } = setup();
    client.setActive(true);
    worker.answer(worker.sent[0]!);
    client.setActive(false);
    client.setActive(true);
    expect(builds()).toEqual(['a']);
    client.setActive(false);
    type('b');
    vi.advanceTimersByTime(1000);
    expect(builds()).toEqual(['a']);
    client.setActive(true);
    expect(builds()).toEqual(['a', 'b']);
  });

  it('does not lose a change made while a build was in flight and the pane closed', () => {
    const { worker, client, builds, type } = setup();
    client.setActive(true);
    type('b');
    vi.advanceTimersByTime(400);
    client.setActive(false);
    worker.answer(worker.sent[0]!);
    expect(builds()).toEqual(['a']);
    client.setActive(true);
    expect(builds()).toEqual(['a', 'b']);
  });

  it('flushes new options at once, reading them when the build is sent', () => {
    const { worker, client, setOptions } = setup();
    client.setActive(true);
    setOptions({ ...defaultLayoutOptions, paper: 'us-letter' });
    client.changed();
    client.flush();
    worker.answer(worker.sent[0]!);
    expect(worker.sent[1]?.options.paper).toBe('us-letter');
  });

  it('answers a PDF request with its own bytes, whatever builds are in flight', async () => {
    const { worker, client } = setup();
    client.setActive(true);
    const pdf = client.pdf();
    const request = worker.sent[1]!;
    expect(request.kind).toBe('pdf');
    worker.receive({ kind: 'pdf', version: request.version, bytes: new Uint8Array([37, 80]) });
    await expect(pdf).resolves.toEqual(new Uint8Array([37, 80]));
    // The build in flight is still answered.
    worker.answer(worker.sent[0]!);
    expect(client.get().latest?.svg).toBe('<svg>a</svg>');

    const failed = client.pdf();
    worker.receive({ kind: 'pdf', version: worker.sent[2]!.version, error: 'no' });
    await expect(failed).rejects.toThrow('no');
  });

  it('stops asking when the engine fails to load, and rejects what waits', async () => {
    const { worker, client, builds, type } = setup();
    client.setActive(true);
    const pdf = client.pdf();
    worker.receive({ kind: 'failed', error: 'CompileError: refused' });
    await expect(pdf).rejects.toThrow('CompileError: refused');
    expect(client.get()).toMatchObject({ engine: 'failed', error: 'CompileError: refused' });
    type('b');
    vi.advanceTimersByTime(1000);
    client.flush();
    expect(builds()).toEqual(['a']);
    await expect(client.pdf()).rejects.toThrow('CompileError: refused');
  });

  it('stops asking a worker that crashed, and lets it go', () => {
    const { worker, client, builds, type } = setup();
    client.setActive(true);
    worker.crash('the PDF worker failed to load');
    expect(client.get().engine).toBe('failed');
    expect(worker.disposed).toBe(true);
    type('b');
    vi.advanceTimersByTime(1000);
    expect(builds()).toEqual(['a']);
  });

  it('gives the shown build the version of its request', () => {
    const { worker, client, type } = setup();
    client.setActive(true);
    worker.answer(worker.sent[0]!);
    expect(client.get().goodVersion).toBe(worker.sent[0]!.version);
    type('broken');
    vi.advanceTimersByTime(400);
    worker.answer(worker.sent[1]!, false);
    expect(client.get().goodVersion).toBe(worker.sent[0]!.version);
  });

  it('ends a worker that does not answer in 60 s, and starts a new one at the next opening', async () => {
    const { worker, client, builds } = setup();
    client.setActive(true);
    const pdf = client.pdf();
    vi.advanceTimersByTime(59_999);
    expect(client.get().engine).toBe('loading');
    vi.advanceTimersByTime(1);
    await expect(pdf).rejects.toThrow(noAnswer(60));
    expect(client.get()).toMatchObject({ engine: 'failed', error: 'The PDF engine did not answer within 60 seconds.' });
    expect(worker.disposed).toBe(true);
    // A late answer from the old worker changes nothing.
    worker.answer(worker.sent[0]!);
    expect(client.get().latest).toBeNull();

    client.setActive(false);
    client.setActive(true);
    expect(worker.connections).toBe(2);
    expect(client.get().engine).toBe('loading');
    expect(builds()).toEqual(['a', 'a']);
    worker.answer(worker.sent[2]!);
    expect(client.get()).toMatchObject({ engine: 'ready', error: null });
  });

  it('clears the deadline of an answered request', () => {
    const { worker, client } = setup();
    client.setActive(true);
    worker.answer(worker.sent[0]!);
    vi.advanceTimersByTime(120_000);
    expect(client.get().engine).toBe('ready');
  });

  it('fails cleanly when the worker cannot even be created', async () => {
    let attempts = 0;
    const client = createPdfClient({
      connect: () => {
        attempts += 1;
        throw new Error('Worker refused');
      },
      read: () => ({ text: 'a', options: defaultLayoutOptions, project: { title: 'T' } }),
    });
    client.setActive(true);
    expect(client.get()).toMatchObject({ engine: 'failed', error: 'Worker refused' });
    client.setActive(false);
    client.setActive(true);
    expect(attempts).toBe(2);
    // Opened again and failed again: Save is refused, and nothing waits.
    await expect(client.pdf()).rejects.toThrow('Worker refused');
    vi.advanceTimersByTime(120_000);
    expect(attempts).toBe(2);
  });

  it('rejects a PDF whose request cannot be sent, and fails', async () => {
    let calls = 0;
    const client = createPdfClient({
      connect: () => ({
        send: () => {
          calls += 1;
          if (calls > 1) throw new Error('DataCloneError');
        },
        dispose: () => {},
      }),
      read: () => ({ text: 'a', options: defaultLayoutOptions, project: { title: 'T' } }),
    });
    client.setActive(true);
    await expect(client.pdf()).rejects.toThrow('DataCloneError');
    expect(client.get().engine).toBe('failed');
  });

  it('stops the worker on dispose; late answers are ignored and waiting PDFs rejected', async () => {
    const { worker, client, type } = setup();
    const listener = vi.fn();
    client.subscribe(listener);
    client.setActive(true);
    const pdf = client.pdf();
    client.dispose();
    expect(worker.disposed).toBe(true);
    await expect(pdf).rejects.toThrow('The page was closed.');
    worker.answer(worker.sent[0]!);
    expect(client.get().latest).toBeNull();
    type('b');
    vi.advanceTimersByTime(1000);
    expect(worker.sent).toHaveLength(2);
    listener.mockClear();
    await expect(client.pdf()).rejects.toThrow('The page was closed.');
    expect(listener).not.toHaveBeenCalled();
  });
});

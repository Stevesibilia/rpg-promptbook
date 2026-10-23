import { templates, type ParseResult } from 'promptbook-format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalysisClient, type ParseAnswer, type ParseRequest } from '../src/editor/analysis/client.js';

// A worker that answers only when the test says so.
function fakeWorker() {
  const sent: ParseRequest[] = [];
  let receive: (answer: ParseAnswer) => void = () => {};
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
      return { send: (request: ParseRequest) => sent.push(request), dispose: () => (disposed = true) };
    },
    answer(request: ParseRequest) {
      receive({ version: request.version, result: { text: request.text } as unknown as ParseResult });
    },
    crash() {
      fail('boom');
    },
  };
}

function setup() {
  const worker = fakeWorker();
  let text = 'a';
  const applied: string[] = [];
  const client = createAnalysisClient({
    connect: (r, f) => worker.connect(r, f),
    read: () => ({ text, template: templates.avventura, tag: text }),
    apply: (tag, result) => applied.push(`${tag}:${(result as unknown as { text: string }).text}`),
  });
  return {
    worker,
    client,
    applied,
    type(next: string) {
      text = next;
      client.changed();
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the parse worker client', () => {
  it('sends the text once it has been still for 250 ms', () => {
    const { worker, type } = setup();
    type('ab');
    vi.advanceTimersByTime(200);
    type('abc');
    vi.advanceTimersByTime(200);
    expect(worker.sent).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(worker.sent.map((r) => r.text)).toEqual(['abc']);
    expect(worker.sent[0]!.template).toBe(templates.avventura);
  });

  it('keeps one request in flight and sends the newest text after its answer, dropping the old answer', () => {
    const { worker, applied, type } = setup();
    type('one');
    vi.advanceTimersByTime(250);
    type('two');
    vi.advanceTimersByTime(250);
    type('three');
    vi.advanceTimersByTime(250);
    expect(worker.sent.map((r) => r.text)).toEqual(['one']);

    worker.answer(worker.sent[0]!);
    // The answer for "one" is dropped: a newer text was waiting.
    expect(applied).toEqual([]);
    expect(worker.sent.map((r) => r.text)).toEqual(['one', 'three']);

    worker.answer(worker.sent[1]!);
    expect(applied).toEqual(['three:three']);
  });

  it('applies an answer when nothing newer is due yet, and ignores one for an old version', () => {
    const { worker, applied, type } = setup();
    type('one');
    vi.advanceTimersByTime(250);
    type('two'); // still within the delay
    worker.answer({ version: 99, text: 'stray', template: templates.avventura });
    worker.answer(worker.sent[0]!);
    expect(applied).toEqual(['one:one']);
    worker.answer(worker.sent[0]!); // twice
    expect(applied).toEqual(['one:one']);
    vi.advanceTimersByTime(250);
    expect(worker.sent.map((r) => r.text)).toEqual(['one', 'two']);
  });

  it('starts the worker with the first request and stops it on dispose; late answers are ignored', () => {
    const { worker, client, applied } = setup();
    expect(worker.connections).toBe(0);
    client.flush();
    expect(worker.connections).toBe(1);
    client.dispose();
    expect(worker.disposed).toBe(true);
    worker.answer(worker.sent[0]!);
    expect(applied).toEqual([]);
    client.changed();
    vi.advanceTimersByTime(1000);
    expect(worker.sent).toHaveLength(1);
  });

  it('stops asking a worker that crashed', () => {
    const { worker, client, type } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    client.flush();
    worker.crash();
    type('next');
    vi.advanceTimersByTime(250);
    expect(worker.sent).toHaveLength(1);
  });
});

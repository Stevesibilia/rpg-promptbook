import { defineTemplate, templates, type AdventureTemplateInput } from 'promptbook-format';
import { adventureTemplateOf, createProjectDoc, readDocumentBoard } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import type { StoredTemplate, TemplateList } from '../src/api.js';
import { createTemplatesStore } from '../src/templates/store.js';

// An own template: Avventura with the appendix's heading renamed.
function own(version: number): StoredTemplate {
  const body = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  body.id = 't-kulthos0001';
  body.version = version;
  body.name = 'Avventura Kulthos';
  const appendix = body.sections.find((s) => s.role === 'appendix')!;
  appendix.name = 'Materiali';
  delete appendix.heading;
  return { id: body.id, version, body: defineTemplate(body), note: '', createdAt: '2026-10-24T09:00:00.000Z' };
}

// A server whose answers the test settles.
function fakeServer() {
  const calls: { resolve(list: TemplateList): void; reject(error: unknown): void }[] = [];
  const fetch = () => new Promise<TemplateList>((resolve, reject) => calls.push({ resolve, reject }));
  return { calls, fetch };
}

describe('the templates store', () => {
  it('reads the list, and reads it again on reload', async () => {
    const server = fakeServer();
    const store = createTemplatesStore(server.fetch);
    const seen: number[] = [];
    store.subscribe(() => seen.push(store.state().stored.length));
    expect(store.state()).toMatchObject({ loaded: false, templates: [] });

    const first = store.reload();
    server.calls[0]!.resolve({ templates: [own(1)], usage: { 't-kulthos0001@1': 2 } });
    await first;
    expect(store.state()).toMatchObject({ loaded: true, error: '', usage: { 't-kulthos0001@1': 2 } });
    expect(store.state().templates).toEqual([own(1).body]);

    const second = store.reload();
    server.calls[1]!.resolve({ templates: [own(1), own(2)], usage: {} });
    await second;
    expect(store.state().templates.map((t) => t.version)).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
  });

  it('keeps the newest answer when an older request answers last', async () => {
    const server = fakeServer();
    const store = createTemplatesStore(server.fetch);
    const old = store.reload();
    const fresh = store.reload();
    server.calls[1]!.resolve({ templates: [own(1), own(2)], usage: {} });
    await fresh;
    server.calls[0]!.resolve({ templates: [own(1)], usage: {} });
    await old;
    expect(store.state().stored.map((t) => t.version)).toEqual([1, 2]);
  });

  it('keeps what it had when a reload fails, and says so', async () => {
    const server = fakeServer();
    const store = createTemplatesStore(server.fetch, () => 'Offline.');
    const first = store.reload();
    server.calls[0]!.resolve({ templates: [own(1)], usage: {} });
    await first;
    const failed = store.reload();
    server.calls[1]!.reject(new Error('network'));
    await failed;
    expect(store.state()).toMatchObject({ loaded: true, error: 'Offline.' });
    expect(store.state().templates).toHaveLength(1);
  });

  it('reads the list again once for a template it lacks', async () => {
    const server = fakeServer();
    const store = createTemplatesStore(server.fetch);
    const first = store.reload();
    server.calls[0]!.resolve({ templates: [own(1)], usage: {} });
    await first;
    store.missing('t-kulthos0001@2');
    store.missing('t-kulthos0001@2');
    expect(server.calls).toHaveLength(2);
    server.calls[1]!.resolve({ templates: [own(1), own(2)], usage: {} });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.state().templates.map((t) => t.version)).toEqual([1, 2]);
    store.missing('t-kulthos0001@3');
    expect(server.calls).toHaveLength(3);
  });

  it("gives the readers a project's own template", async () => {
    const server = fakeServer();
    const store = createTemplatesStore(server.fetch);
    const done = store.reload();
    server.calls[0]!.resolve({ templates: [own(1)], usage: {} });
    await done;
    const text = ['## Scene', '', '### S1. Il molo', '', '## Materiali', '', '### S1. Il molo', '', 'visual: il porto di notte', ''].join('\n');
    const doc = createProjectDoc({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Il faro',
      category: 'adventure',
      status: 'draft',
      campaignId: null,
      system: '',
      todo: [],
      document: text,
      template: { id: 't-kulthos0001', version: 1 },
    });
    const meta = { category: 'adventure' as const, template: { id: 't-kulthos0001', version: 1 } };
    expect(adventureTemplateOf(meta, store.state().templates).name).toBe('Avventura Kulthos');
    // The board reads «## Materiali» as the appendix with the own template,
    // and finds no appendix with the built-in.
    expect(readDocumentBoard(doc, store.state().templates).rows.map((r) => r.sceneId)).toEqual(['S1']);
    expect(readDocumentBoard(doc).rows).toEqual([]);
  });
});

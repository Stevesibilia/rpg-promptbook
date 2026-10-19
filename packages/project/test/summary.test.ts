import { parseAdventure, templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { addSeedVersion, countWords, readTodo, summarize, updateTodo } from '../src/index.js';
import { fixture, project } from './helpers.js';

const campaign = { id: '00000000-0000-4000-8000-0000000000c1', title: 'Cronaca del Gabbiano' };

describe('summary', () => {
  it('summarises the Sabaoth fixture', () => {
    const text = fixture('l-ancora-di-sabaoth.converted.md');
    const doc = project({ document: text, seed: 'Prima idea' });
    addSeedVersion(doc, 'Un terremoto apre la prigione di Sabaoth', '2026-10-20T09:00:00.000Z');
    const todo = readTodo(doc);
    updateTodo(doc, todo[0]!.id, { done: true });
    updateTodo(doc, todo[1]!.id, { due: '2026-11-02' });
    updateTodo(doc, todo[2]!.id, { due: '2026-10-30' });

    const { problems } = parseAdventure(text, { template: templates.avventura });
    expect(summarize(doc, { campaigns: [] })).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      title: "L'Ancora di Sabaoth",
      category: 'one-shot',
      status: 'draft',
      campaignId: null,
      system: 'Kulthos',
      seed: 'Un terremoto apre la prigione di Sabaoth',
      todoDone: 1,
      todoTotal: 3,
      nextDue: '2026-10-30',
      scenes: 5,
      words: 4505,
      errors: problems.filter((p) => p.severity === 'error').length,
      warnings: problems.filter((p) => p.severity === 'warning').length,
    });
  });

  it('counts words after the front matter, tokens with a letter only', () => {
    expect(countWords('Il ballo — 3 · dei Lorenzetti, 1908')).toBe(4);
    const doc = project({ document: '---\ntitolo: Molte parole qui\n---\n\nDue parole\n' });
    expect(summarize(doc, { campaigns: [] }).words).toBe(2);
  });

  it('follows a tick', () => {
    const doc = project();
    expect(summarize(doc, { campaigns: [] })).toMatchObject({ todoDone: 0, todoTotal: 3 });
    updateTodo(doc, readTodo(doc)[1]!.id, { done: true });
    expect(summarize(doc, { campaigns: [] })).toMatchObject({ todoDone: 1, todoTotal: 3 });
  });

  it('keeps a valid campaign link', () => {
    const doc = project({ category: 'adventure', campaignId: campaign.id });
    expect(summarize(doc, { campaigns: [campaign] }).campaignId).toBe(campaign.id);
  });

  it('summarises invalid values as draft and stand-alone without rewriting the document', () => {
    const doc = project({ category: 'adventure', campaignId: '00000000-0000-4000-8000-0000000000ff' });
    doc.getMap('meta').set('status', 'finished');
    expect(summarize(doc, { campaigns: [campaign] })).toMatchObject({ status: 'draft', campaignId: null });
    expect(doc.getMap('meta').get('status')).toBe('finished');
    expect(doc.getMap('meta').get('campaignId')).toBe('00000000-0000-4000-8000-0000000000ff');
  });

  it('never nests a campaign', () => {
    const doc = project({ id: campaign.id, category: 'campaign', title: campaign.title });
    doc.getMap('meta').set('campaignId', '00000000-0000-4000-8000-0000000000c2');
    const other = { id: '00000000-0000-4000-8000-0000000000c2', title: 'Apocrypha' };
    expect(summarize(doc, { campaigns: [campaign, other] })).toMatchObject({
      campaignId: null,
      scenes: null,
      words: null,
      errors: null,
      warnings: null,
    });
  });
});

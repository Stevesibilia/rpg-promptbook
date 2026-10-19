import { describe, expect, it } from 'vitest';
import {
  addSeedVersion,
  createProjectDoc,
  exportFolderName,
  exportProject,
  prepareImport,
  readTodo,
  updateTodo,
} from '../src/index.js';
import { fixture, project } from './helpers.js';


const gabbiano = { id: '00000000-0000-4000-8000-0000000000c1', title: 'Cronaca del Gabbiano' };

describe('prepareImport', () => {
  it('imports Sabaoth as an adventure note through the converter', () => {
    const note = prepareImport(fixture('l-ancora-di-sabaoth.md'), {
      fileName: 'notes/l-ancora-di-sabaoth.md',
      campaigns: [gabbiano],
    });
    expect(note).toMatchObject({
      title: "L'Ancora di Sabaoth",
      category: 'one-shot',
      campaignId: null,
      isAdventureNote: true,
      imageRefs: [],
    });
    expect(note.text).toBe(fixture('l-ancora-di-sabaoth.converted.md'));
    expect(note.report.counts).toEqual({ frontMatter: 1, callout: 6, threat: 5, comment: 0 });
  });

  it('does not take a shopping list for an adventure, even with a title line', () => {
    const note = prepareImport('# Spesa\n\n- latte\n- uova\n', { fileName: 'Spesa.md', campaigns: [] });
    expect(note).toMatchObject({ title: 'Spesa', category: null, campaignId: null, isAdventureNote: false });
    expect(note.text).toContain('- latte\n- uova\n');
  });

  it('counts a note with front matter or a scene heading as an adventure note', () => {
    expect(prepareImport('---\ntitolo: Prova\n---\n\nTesto\n', { fileName: 'a.md', campaigns: [] }).isAdventureNote).toBe(true);
    expect(prepareImport('## Scene\n\n### S1. Il porto\n', { fileName: 'b.md', campaigns: [] }).isAdventureNote).toBe(true);
    expect(prepareImport('# Titolo\n\n**Sistema:** Kulthos\n', { fileName: 'c.md', campaigns: [] }).isAdventureNote).toBe(true);
  });

  it('takes the title from the front matter, then the first heading, then the file name', () => {
    expect(prepareImport('Solo testo\n', { fileName: 'cartella/Il pozzo di Ganzirri.md', campaigns: [] }).title).toBe(
      'Il pozzo di Ganzirri',
    );
    expect(prepareImport('Testo\n\n# Più sotto\n', { fileName: 'x.md', campaigns: [] }).title).toBe('Più sotto');
  });

  it('recognises the campaign and the category from the front matter', () => {
    const text = '---\ntitolo: Le ali di Ca\' Malamocco\nformato: avventura\ncampagna: Cronaca del Gabbiano\n---\n';
    expect(prepareImport(text, { fileName: 'x.md', campaigns: [gabbiano] })).toMatchObject({
      category: 'adventure',
      campaignId: gabbiano.id,
    });
    expect(prepareImport(text, { fileName: 'x.md', campaigns: [] }).campaignId).toBeNull();
    expect(prepareImport('---\ntitolo: A\nformato: campagna\ncampagna: Cronaca del Gabbiano\n---\n', {
      fileName: 'x.md',
      campaigns: [gabbiano],
    })).toMatchObject({ category: 'campaign', campaignId: null });
  });

  it('takes the system from the front matter, or leaves it empty', () => {
    expect(prepareImport('---\ntitolo: A\nsistema: " Not The End "\n---\n', { fileName: 'x.md', campaigns: [] }).system).toBe(
      'Not The End',
    );
    expect(prepareImport('# Spesa\n\n- latte\n', { fileName: 'spesa.md', campaigns: [] }).system).toBe('');
  });

  it('lists relative image references and leaves them in the text', () => {
    const body =
      '# Note\n\n![mappa](_resources/abc123.png)\n\n<img src="_resources/def456.jpg" width="300">\n\n' +
      '![web](https://example.com/x.png) ![abs](/tmp/y.png) ![asset](asset:01)\n';
    const note = prepareImport(body, { fileName: 'note.md', campaigns: [] });
    expect(note.imageRefs).toEqual(['_resources/abc123.png', '_resources/def456.jpg']);
    expect(note.text).toContain('![mappa](_resources/abc123.png)');
    expect(note.text).toContain('<img src="_resources/def456.jpg" width="300">');
  });
});

describe('exportProject', () => {
  it('re-imports an imported note byte for byte', () => {
    const first = prepareImport(fixture('l-ancora-di-sabaoth.md'), { fileName: 'sabaoth.md', campaigns: [] });
    const doc = createProjectDoc({
      id: '00000000-0000-4000-8000-000000000002',
      title: first.title,
      category: 'one-shot',
      status: 'draft',
      campaignId: null,
      system: '',
      todo: ['Rilettura'],
      document: first.text,
    });
    const files = exportProject(doc, { campaignTitle: null });
    const second = prepareImport(files['document.md']!, { fileName: 'document.md', campaigns: [] });
    expect(second.text).toBe(first.text);
    expect(second.report.counts).toEqual({ frontMatter: 0, callout: 0, threat: 0, comment: 0 });
  });

  it('writes the to-do list, every seed newest first and the metadata', () => {
    const doc = project({ category: 'adventure', campaignId: gabbiano.id, seed: 'Prima idea', document: 'Testo\n' });
    addSeedVersion(doc, 'Seconda idea', '2026-10-20T09:00:00.000Z');
    const [scene, suno] = readTodo(doc);
    updateTodo(doc, scene!.id, { done: true });
    updateTodo(doc, suno!.id, { due: '2026-10-25', note: 'tre brani\nuno per scena' });
    const files = exportProject(doc, { campaignTitle: gabbiano.title, editedAt: '2026-10-21T10:00:00.000Z' });
    expect(Object.keys(files)).toEqual(['document.md', 'todo.md', 'seed.md', 'project.json']);
    expect(files['document.md']).toBe('Testo\n');
    expect(files['todo.md']).toBe(
      '- [x] Scrivere le scene\n- [ ] Prompt Suno (due 2026-10-25)\n  tre brani\n  uno per scena\n- [ ] Rilettura\n',
    );
    expect(files['seed.md']).toBe(
      '## 2026-10-20T09:00:00.000Z\n\nSeconda idea\n\n## 2026-10-19T08:00:00.000Z\n\nPrima idea\n',
    );
    expect(JSON.parse(files['project.json']!)).toEqual({
      schema: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: "L'Ancora di Sabaoth",
      category: 'adventure',
      status: 'draft',
      campaign: 'Cronaca del Gabbiano',
      system: 'Kulthos',
      createdAt: '2026-10-19T08:00:00.000Z',
      editedAt: '2026-10-21T10:00:00.000Z',
    });
  });

  it('names folders after the title, safely and uniquely', () => {
    const taken = new Set<string>();
    expect(exportFolderName('Pioggia su Kenmore Street', taken)).toBe('Pioggia su Kenmore Street');
    expect(exportFolderName('Pioggia su Kenmore Street', taken)).toBe('Pioggia su Kenmore Street (2)');
    expect(exportFolderName('pioggia su kenmore street', taken)).toBe('pioggia su kenmore street (3)');
    expect(exportFolderName('A/B: "C"?', taken)).toBe('A-B- -C--');
    expect(exportFolderName('  ', taken)).toBe('Untitled');
  });
});

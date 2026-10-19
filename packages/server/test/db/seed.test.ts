import { prepareImport, readDocument, readTodo } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../src/cli.js';
import { fixture } from '../../src/fixtures.js';
import { listProjects, loadProjectDoc } from '../../src/projects.js';
import { db, steve } from './helpers.js';

function io(): CliIo & { lines: string[] } {
  const lines: string[] = [];
  return { env: {}, lines, out: (line) => lines.push(line), askPassword: async () => '' };
}

describe('seed', () => {
  it('creates the projects of the mockup for an account with none', async () => {
    const user = await steve();
    const out = io();
    expect(await runCli(['seed', 'steve'], db, out)).toBe(0);
    expect(out.lines).toEqual(['Created 8 sample projects for "steve".']);

    const projects = await listProjects(db, user.id, { bin: false });
    const byTitle = (title: string) => projects.filter((p) => p.title === title);
    const one = (title: string) => {
      const [project, ...more] = byTitle(title);
      expect(more).toEqual([]);
      return project!;
    };
    const blacksad = one('Blacksad - Il Continentale');
    const gabbiano = one('Cronaca del Gabbiano');
    expect(blacksad).toMatchObject({ category: 'campaign', status: 'in-progress', todoDone: 3, todoTotal: 5 });
    expect(one('Apocrypha')).toMatchObject({ category: 'campaign', status: 'complete', system: 'Vileborn' });
    expect(one('Il ballo dei Lorenzetti')).toMatchObject({
      category: 'adventure',
      status: 'draft',
      campaignId: blacksad.id,
      todoDone: 0,
      todoTotal: 9,
    });
    expect(one('Pioggia su Kenmore Street')).toMatchObject({ status: 'complete', campaignId: blacksad.id, todoDone: 4 });
    expect(one("Le ali di Ca' Malamocco")).toMatchObject({ status: 'in-progress', campaignId: gabbiano.id, todoDone: 4 });

    const sabaoth = one("L'Ancora di Sabaoth");
    const imported = one("L'Ancora di Sabaoth (esempio del modello)");
    expect(sabaoth).toMatchObject({ category: 'one-shot', status: 'in-progress', todoDone: 5, todoTotal: 9, scenes: 5 });
    expect(sabaoth.nextDue).toMatch(/^\d{4}-10-24$/);
    expect(readDocument((await loadProjectDoc(db, sabaoth.id))!)).toBe(fixture('l-ancora-di-sabaoth.converted.md'));
    expect(imported).toMatchObject({ category: 'one-shot', status: 'draft', campaignId: null, todoDone: 0, todoTotal: 4 });
    expect(readTodo((await loadProjectDoc(db, imported.id))!).map((t) => t.text)).toEqual([
      'Scrivere le scene',
      'Schede dei PNG',
      'PDF per il tavolo',
      'Rilettura',
    ]);
    // Renamed in the list only: the document is the imported note's.
    expect(readDocument((await loadProjectDoc(db, imported.id))!)).toBe(
      prepareImport(fixture('esempio.md'), { fileName: 'esempio.md', campaigns: [] }).text,
    );
    expect(projects).toHaveLength(8);
  });

  it('refuses an account that already has projects, and an unknown account', async () => {
    await steve();
    expect(await runCli(['seed', 'steve'], db, io())).toBe(0);
    await expect(runCli(['seed', 'steve'], db, io())).rejects.toMatchObject({ code: 'not_empty' });
    expect(await db.query('select id from projects')).toHaveLength(8);
    await expect(runCli(['seed', 'nobody'], db, io())).rejects.toMatchObject({ code: 'not_found' });
    expect(await runCli(['seed'], db, io())).toBe(2);
  });
});

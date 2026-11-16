import { readFileSync } from 'node:fs';
import {
  defineTemplate,
  parseAdventure,
  templates,
  type AdventureTemplate,
  type AdventureTemplateInput,
} from 'promptbook-format';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEngine, defaultLayoutOptions, toLayoutInput, type Engine, type LayoutInput } from '../src/index.js';
import { nodeAssets } from './helpers.js';

// One engine in this file: a second one keeps vitest from exiting.
let engine: Engine;

beforeAll(async () => {
  engine = await createEngine(await nodeAssets());
});

// An invented adventure with every night part and three scenes with all four
// placed fields; S2's cast cites a sheet, so S2 has a threat box.
const fixture = readFileSync(new URL('./fixtures/la-lanterna-spenta.md', import.meta.url), 'utf8');

function template(change: (t: AdventureTemplateInput) => void): AdventureTemplate {
  const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  change(definition);
  return defineTemplate(definition);
}

// The fixture with each pair rewritten once.
function edited(...pairs: [string | RegExp, string][]): string {
  let text = fixture;
  for (const [from, to] of pairs) {
    const out = text.replace(from, to);
    expect(out, `«${from}» is in the fixture`).not.toBe(text);
    text = out;
  }
  return text;
}

const inputOf = (text: string, t: AdventureTemplate = templates.avventura): LayoutInput =>
  toLayoutInput(parseAdventure(text, { template: t }).model, defaultLayoutOptions, { title: 'La lanterna spenta' }, t);

async function build(text: string, t: AdventureTemplate = templates.avventura) {
  const input = inputOf(text, t);
  const result = await engine.build(input);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  // A mark is a setting: nothing the template prints holds one.
  expect(JSON.stringify(input)).not.toMatch(/\{(laterale|principale)\}/);
  // The column a block printed in: the side column starts right of the middle
  // of the page, the main column at its left margin.
  const at = (from: number) => {
    const found = result.positions.find((p) => p.kind === 'block' && p.from === from);
    expect(found, `a position at ${JSON.stringify(text.slice(from, from + 30))}`).toBeDefined();
    const width = result.pages[found!.page - 1]!.width;
    return { ...found!, column: found!.x! > width / 2 ? 'side' : 'main' };
  };
  // The first block of a part, which every look prints with its position.
  const first = (part: { blocks: { from: number }[] } | null) => at(part!.blocks[0]!.from);
  const night = {
    revelations: first(input.night.revelations),
    reminders: first(input.night.reminders),
    clock: first(input.night.clock),
    truths: first(input.night.truths),
  };
  const columns = (parts: Record<string, { column: string }>) =>
    Object.fromEntries(Object.entries(parts).map(([name, p]) => [name, p.column]));
  const scenes = input.scenes.map((s) => ({
    mustHave: first(s.mustHave),
    happens: first(s.happens),
    cast: first(s.cast),
    clues: first(s.clues),
  }));
  return {
    input,
    result,
    night,
    scenes,
    nightColumns: columns(night),
    sceneColumns: scenes.map(columns),
  };
}

const TODAY = { revelations: 'side', reminders: 'side', clock: 'main', truths: 'main' };
const TODAY_SCENE = { mustHave: 'side', happens: 'main', cast: 'side', clues: 'main' };

describe('the placement of the parts in the PDF', () => {
  it('prints every part in today\'s column when the text has no mark', async () => {
    const built = await build(fixture);
    expect(built.nightColumns).toEqual(TODAY);
    expect(built.sceneColumns).toEqual([TODAY_SCENE, TODAY_SCENE, TODAY_SCENE]);
    // The main column starts at the left margin, where the overview does.
    const overview = built.result.positions.find((p) => p.kind === 'part' && p.id === 'night')!;
    expect(built.night.clock.x).toBeCloseTo(overview.x!, 0);
  });

  it('prints «Orologio» in the side column under «Da non perdere stasera» with a mark', async () => {
    const built = await build(edited([/^## Orologio$/m, '## Orologio {laterale}']));
    expect(built.nightColumns).toEqual({ ...TODAY, clock: 'side' });
    expect(built.night.clock.page).toBe(built.night.reminders.page);
    expect(built.night.clock.y).toBeGreaterThan(built.night.reminders.y);
  });

  it('prints the revelations in the main column with a mark on their label', async () => {
    const built = await build(edited([/^\*\*Rivelazioni\*\*$/m, '**Rivelazioni** {principale}']));
    expect(built.nightColumns).toEqual({ ...TODAY, revelations: 'main' });
    // Under a heading at their label, before «Orologio», as in the text.
    const heading = built.result.positions.find((p) => p.from === built.input.night.revelations!.from)!;
    expect(heading.x).toBeCloseTo(built.night.clock.x!, 0);
    expect(built.night.revelations.y).toBeLessThan(built.night.clock.y);
  });

  it('moves a marked field in its scene only', async () => {
    const built = await build(edited(['**Da non perdere qui**', '**Da non perdere qui** {principale}']));
    expect(built.sceneColumns).toEqual([{ ...TODAY_SCENE, mustHave: 'main' }, TODAY_SCENE, TODAY_SCENE]);
    // In the main column it follows the read-aloud and comes before the others.
    expect(built.scenes[0]!.mustHave.y).toBeLessThan(built.scenes[0]!.happens.y);
  });

  it('prints the parts a template moves, with no mark in the text', async () => {
    const moved = template((t) => {
      t.sections.find((s) => s.role === 'truths')!.pdf = { column: 'side' };
      t.overview.column = 'main';
      t.sceneFields.find((f) => f.role === 'cast')!.column = 'main';
      t.sceneFields.find((f) => f.role === 'clues')!.column = 'side';
    });
    const built = await build(fixture, moved);
    expect(built.nightColumns).toEqual({ revelations: 'main', reminders: 'side', clock: 'main', truths: 'side' });
    const scene = { mustHave: 'side', happens: 'main', cast: 'main', clues: 'side' };
    expect(built.sceneColumns).toEqual([scene, scene, scene]);
  });

  it('prints a night page with every part in the main column full width', async () => {
    const allMain = edited(
      [/^## Da non perdere stasera$/m, '## Da non perdere stasera {principale}'],
      [/^\*\*Rivelazioni\*\*$/m, '**Rivelazioni** {principale}'],
    );
    const wide = await build(allMain);
    expect(wide.nightColumns).toEqual({ revelations: 'main', reminders: 'main', clock: 'main', truths: 'main' });
    // The same parts beside a side box of the overview: the main column is
    // narrower there, so its text wraps more and the last part starts lower.
    const narrow = await build(
      allMain.replace('**Domanda drammatica:**', '> [!riquadro|laterale] Nota\n> Il faro si vede da tutto il lago.\n\n**Domanda drammatica:**'),
    );
    expect(narrow.nightColumns).toEqual(wide.nightColumns);
    expect(wide.night.truths.page).toBe(narrow.night.truths.page);
    expect(wide.night.truths.y).toBeLessThan(narrow.night.truths.y);
  });

  it('prints a scene with nothing in the side column full width', async () => {
    // S1 has no threat box and no side box.
    const s1 = (text: string) => text.replace(/(### S1[\s\S]*?)\*\*Chi c'è\*\*/, "$1**Chi c'è** {principale}");
    const allMain = s1(edited(['**Da non perdere qui**', '**Da non perdere qui** {principale}']));
    const wide = await build(allMain);
    expect(wide.sceneColumns[0]).toEqual({ mustHave: 'main', happens: 'main', cast: 'main', clues: 'main' });
    const narrow = await build(
      allMain.replace('**Cosa succede da sé**', '> [!riquadro|laterale] Nota\n> La nebbia sale piano.\n\n**Cosa succede da sé**'),
    );
    expect(narrow.sceneColumns[0]).toEqual(wide.sceneColumns[0]);
    expect(wide.scenes[0]!.clues.y).toBeLessThan(narrow.scenes[0]!.clues.y);
  });

  it('gives the same bytes on two builds', async () => {
    const text = edited([/^## Orologio$/m, '## Orologio {laterale}'], ['**Chi c\'è**', '**Chi c\'è** {principale}']);
    const a = await engine.pdf(inputOf(text));
    const b = await engine.pdf(inputOf(text));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

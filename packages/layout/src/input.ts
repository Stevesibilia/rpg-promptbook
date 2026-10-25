// What the template reads: the model's parts in the order the PDF prints
// them, each block with its source offset and its Markdown. The template
// stays declarative; every decision about what goes where is made here.

import {
  type AdventureTemplate,
  type Block,
  type JsonValue,
  type Model,
  type Reference,
  type Scene,
  type SceneField,
  type SceneFieldRole,
  type Section,
  type Sheet,
} from 'promptbook-format';
import { licenceShort, licenceUrl } from './licence.js';

export interface LayoutOptions {
  paper: 'a4' | 'us-letter';
  // Tints become white; text, rules and borders stay.
  inkSaver: boolean;
  // False leaves out the Pregenerati part.
  pregenerated: boolean;
  template: 'avventura@1';
}

export const defaultLayoutOptions: LayoutOptions = {
  paper: 'a4',
  inkSaver: false,
  pregenerated: true,
  template: 'avventura@1',
};

export interface LayoutBox {
  role: 'readAloud' | 'handout' | 'box' | 'quote';
  // What the box prints above its content: "Da leggere", "Documento da consegnare".
  label: string | null;
  title: string | null;
  side: boolean;
}

export interface LayoutBlock {
  from: number;
  kind: Block['kind'];
  markdown: string;
  // Set on callouts and quotes; their markdown is the content.
  box: LayoutBox | null;
}

export interface LayoutPart {
  // The heading the PDF prints: the template section's (template-editor
  // design decision 20).
  title: string;
  from: number;
  blocks: LayoutBlock[];
}

export interface LayoutField {
  label: string;
  from: number;
  blocks: LayoutBlock[];
}

export interface LayoutThreat {
  name: string;
  grade: string;
  pack: boolean;
  wounds: number;
  woundsPerCounter: number;
  afflictions: number;
  // More than two talents print as their names on one line.
  talentNames: string | null;
  talents: { name: string; text: string }[];
  // The label of the sheet, for «scheda completa, p. N».
  sheet: string;
}

export interface LayoutScene {
  id: string;
  title: string;
  from: number;
  // The offset where the scene's source ends.
  to: number;
  place: LayoutField | null;
  inPlay: LayoutField | null;
  // The side column.
  mustHave: LayoutField | null;
  cast: LayoutField | null;
  threats: LayoutThreat[];
  sideBoxes: LayoutBlock[];
  // The main column.
  // Every read-aloud of the scene, in the order written.
  readAlouds: LayoutBlock[];
  happens: LayoutField | null;
  clues: LayoutField | null;
  handouts: LayoutBlock[];
  boxes: LayoutBlock[];
  tests: LayoutField | null;
  reactions: LayoutBlock | null;
  tables: LayoutBlock[];
  derail: LayoutField | null;
  // Under both columns.
  situation: LayoutField | null;
  decides: LayoutField | null;
  // Bold labels the template does not know, in their order.
  others: LayoutField[];
}

export interface LayoutSheet {
  // The Typst label of the sheet: "sheet-tenente-donato".
  label: string;
  title: string;
  from: number;
  blocks: LayoutBlock[];
}

export interface LayoutPregenerated {
  title: string;
  from: number;
  blocks: LayoutBlock[];
  characters: { name: string; from: number; blocks: LayoutBlock[] }[];
}

export interface LayoutInput {
  options: LayoutOptions;
  title: string;
  subtitle: string | null;
  author: string | null;
  copyright: string | null;
  licence: { short: string; full: string; url: string | null } | null;
  // The edge tabs: "Notte", "S1"…"Sn", "Schede".
  tabs: string[];
  cover: {
    from: number;
    // The line above the title, and the lines under it.
    over: LayoutBlock[];
    meta: LayoutBlock[];
    synopsis: LayoutPart | null;
    backstory: LayoutPart | null;
  };
  night: {
    from: number;
    // «A colpo d'occhio» prints even when the document lacks it.
    overviewTitle: string;
    overview: LayoutPart | null;
    revelations: LayoutPart | null;
    sideBoxes: LayoutBlock[];
    reminders: LayoutPart | null;
    clock: LayoutPart | null;
    truths: LayoutPart | null;
  };
  start: {
    from: number;
    strongStart: LayoutPart | null;
    sceneMap: LayoutPart | null;
  };
  // The side column holds the side boxes; without any, the rules print full
  // width.
  rules: (LayoutPart & { sideBoxes: LayoutBlock[] }) | null;
  scenes: LayoutScene[];
  references: {
    from: number;
    clues: LayoutPart | null;
    npcs: LayoutPart | null;
    sheetsTitle: string;
    sheets: LayoutSheet[];
    pregenerated: LayoutPregenerated | null;
    before: LayoutPart | null;
  };
}

export interface LayoutProject {
  // The project's name: the title when the front matter has none.
  title: string;
}

// The front matter keys printed above the title, and under it. The others are
// the title, the footer's, or lists that are not printed.
const OVER = ['sistema', 'formato', 'durata', 'giocatori'];
const UNDER = ['ambientazione', 'tempi', 'campagna', 'arco'];

// The scene fields the PDF places, found by their role in the template; the
// others print after them, in their order.
const PLACED: readonly SceneFieldRole[] = [
  'place',
  'inPlay',
  'mustHave',
  'cast',
  'happens',
  'clues',
  'tests',
  'derail',
  'situation',
  'decides',
];
const roleField = (template: AdventureTemplate, role: SceneFieldRole) =>
  template.sceneFields.find((f) => f.role === role)?.label;

const text = (value: JsonValue | undefined): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const capitalised = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

export const sheetLabel = (id: string) => `sheet-${id}`;

function boxOf(template: AdventureTemplate, block: Block): LayoutBox | null {
  if (block.kind === 'quote') return { role: 'quote', label: null, title: null, side: false };
  if (block.kind !== 'callout') return null;
  const definition =
    template.callouts.find((c) => c.type === block.type && (c.meta ?? null) === block.meta) ??
    template.callouts.find((c) => c.type === block.type && !c.meta);
  const role = definition?.role ?? 'box';
  return {
    role,
    label: role === 'readAloud' || role === 'handout' ? (definition?.label ?? null) : null,
    title: block.title,
    side: definition?.column === 'side',
  };
}

function blockOf(template: AdventureTemplate, block: Block, references: Reference[] = []): LayoutBlock {
  const from = block.range.start.offset;
  const boxed = boxOf(template, block);
  const markdown = block.kind === 'callout' || block.kind === 'quote' ? block.content : block.text;
  // A box's content does not start where the block does: its references are
  // found again in the content by their text.
  const linked = boxed
    ? linkByText(template, markdown, references)
    : linkReferences(template, markdown, from, references);
  return { from, kind: block.kind, markdown: linked, box: boxed };
}

// "→ Schede: Tenente Donato" becomes a link to the sheet's label, which the
// template prints as «→ Tenente Donato, p. 12». Unresolved references stay as
// written.
function link(reference: Reference): string {
  return `→ [${reference.target}](#${sheetLabel(reference.sheet!)})`;
}

function linkReferences(template: AdventureTemplate, markdown: string, from: number, references: Reference[]): string {
  const inside = references
    .filter((r) => r.sheet && r.range.start.offset >= from && r.range.end.offset <= from + markdown.length)
    .sort((a, b) => b.range.start.offset - a.range.start.offset);
  let out = markdown;
  for (const reference of inside) {
    const start = reference.range.start.offset - from;
    const end = reference.range.end.offset - from;
    if (!out.slice(start).startsWith(template.references.marker)) continue;
    out = out.slice(0, start) + link(reference) + out.slice(end);
  }
  return out;
}

function linkByText(template: AdventureTemplate, markdown: string, references: Reference[]): string {
  let out = markdown;
  for (const reference of references) {
    if (!reference.sheet) continue;
    const written = new RegExp(`${escape(template.references.marker)}[ \\t]*${escape(reference.target)}`);
    out = out.replace(written, link(reference));
  }
  return out;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The heading of the template's section with this role, as the document
// writes it.
function headingOf(template: AdventureTemplate, role: Section['role'] | undefined, fallback: string): string {
  const section = role ? template.sections.find((s) => s.role === role) : undefined;
  return section ? (section.heading ?? section.name) : fallback;
}

function partOf(
  template: AdventureTemplate,
  section: Section | undefined,
  blocks: Block[] = section?.blocks ?? [],
  title: string = headingOf(template, section?.role, section?.heading ?? ''),
): LayoutPart | null {
  if (!section) return null;
  return { title, from: section.range.start.offset, blocks: blocks.map((b) => blockOf(template, b)) };
}

function field(template: AdventureTemplate, scene: Scene, found: SceneField | undefined): LayoutField | null {
  if (!found) return null;
  const from = found.range.start.offset;
  if (found.form === 'inline') {
    // The text after the label ends where the field does.
    const textFrom = found.range.end.offset - found.text.length;
    const markdown = linkReferences(template, found.text, textFrom, scene.references);
    return { label: found.label, from, blocks: [{ from, kind: 'paragraph', markdown, box: null }] };
  }
  return { label: found.label, from, blocks: found.blocks.map((b) => blockOf(template, b, scene.references)) };
}

// "La Maestà («Fermi»: chi non…)" gives the name and what is in brackets.
function talent(value: string): { name: string; text: string } {
  const open = value.indexOf('(');
  const close = value.lastIndexOf(')');
  if (open === -1 || close < open) return { name: value.trim(), text: '' };
  return { name: value.slice(0, open).trim(), text: value.slice(open + 1, close).trim() };
}

// The first sentence, for the short sheet in the side column.
function firstSentence(value: string): string {
  return /^(.+?[.!?])(\s|$)/.exec(value)?.[1] ?? value;
}

function threat(sheet: Sheet): LayoutThreat | null {
  const found = sheet.threat;
  if (!found?.counts || !found.grade) return null;
  const talents = found.talents.map(talent);
  const many = talents.length > 2;
  return {
    name: sheet.name,
    grade: found.grade,
    pack: found.pack !== null,
    wounds: found.counts.wounds,
    woundsPerCounter: found.counts.woundsPerCounter,
    afflictions: found.counts.afflictions,
    talentNames: many ? talents.map((t) => t.name).join(' · ') : null,
    talents: many ? [] : talents.map((t) => ({ name: t.name, text: firstSentence(t.text) })),
    sheet: sheetLabel(sheet.id),
  };
}

function scene(template: AdventureTemplate, model: Model, found: Scene): LayoutScene {
  const byRole = (role: SceneFieldRole) => {
    const label = roleField(template, role);
    return label === undefined ? undefined : found.fields.find((f) => f.label === label);
  };
  const get = (role: SceneFieldRole) => field(template, found, byRole(role));
  const cast = roleField(template, 'cast');
  const placed = new Set(PLACED.map((role) => roleField(template, role)).filter((l) => l !== undefined));

  // A threat box for each sheet the cast cites, once.
  const threats: LayoutThreat[] = [];
  const seen = new Set<string>();
  for (const reference of found.references) {
    if (cast === undefined || reference.field !== cast || !reference.sheet || seen.has(reference.sheet)) continue;
    seen.add(reference.sheet);
    const sheet = model.sheets.find((s) => s.id === reference.sheet);
    const box = sheet ? threat(sheet) : null;
    if (box) threats.push(box);
  }

  const boxes = found.boxes.map((b) => blockOf(template, b, found.references));
  const isReadAloud = (i: number) => found.readAlouds.includes(found.boxes[i]!.id);
  return {
    id: found.id ?? '',
    title: found.title,
    from: found.range.start.offset,
    to: found.range.end.offset,
    place: get('place'),
    inPlay: get('inPlay'),
    mustHave: get('mustHave'),
    cast: get('cast'),
    threats,
    sideBoxes: boxes.filter((b) => b.box?.side),
    readAlouds: boxes.filter((_, i) => isReadAloud(i)),
    happens: get('happens'),
    clues: get('clues'),
    handouts: boxes.filter((b) => b.box?.role === 'handout'),
    boxes: boxes.filter((b, i) => !isReadAloud(i) && !b.box?.side && b.box?.role !== 'handout'),
    tests: get('tests'),
    reactions: found.reactions ? blockOf(template, found.reactions, found.references) : null,
    tables: found.tables.map((t) => blockOf(template, t, found.references)),
    derail: get('derail'),
    situation: get('situation'),
    decides: get('decides'),
    others: found.fields.filter((f) => !placed.has(f.label)).map((f) => field(template, found, f)!),
  };
}

// A sheet's list items are its fields; they print again as a list, in their
// place among the sheet's other blocks.
function sheetBlocks(template: AdventureTemplate, sheet: Sheet): LayoutBlock[] {
  const items = sheet.fields.map((f) => ({
    from: f.range.start.offset,
    line: f.key === null ? `- ${f.value}` : `- **${f.key}:** ${f.value}`,
  }));
  const blocks = sheet.blocks.map((b) => blockOf(template, b));
  const out: LayoutBlock[] = [];
  let list: LayoutBlock | null = null;
  const all = [...items.map((i) => ({ from: i.from, item: i.line })), ...blocks.map((b) => ({ from: b.from, block: b }))];
  for (const entry of all.sort((a, b) => a.from - b.from)) {
    if ('item' in entry) {
      if (list) list.markdown += `\n${entry.item}`;
      else out.push((list = { from: entry.from, kind: 'list', markdown: entry.item, box: null }));
    } else {
      list = null;
      out.push(entry.block);
    }
  }
  return out;
}

// The template is the one the model was parsed with: sections and fields are
// found by their role, never by their label.
export function toLayoutInput(
  model: Model,
  options: LayoutOptions,
  project: LayoutProject,
  template: AdventureTemplate,
): LayoutInput {
  const values = model.meta.values;
  const metaValue = (name: 'title' | 'subtitle') => {
    const key = template.meta.find((m) => m.role === name)?.key;
    return key === undefined ? undefined : values[key];
  };
  const role = (name: Section['role']) => model.sections.find((s) => s.role === name);
  const box = (block: Block) => boxOf(template, block);
  const toBlock = (block: Block) => blockOf(template, block);
  const part = (section: Section | undefined, blocks?: Block[]) => partOf(template, section, blocks);
  const metaBlocks = (keys: string[]) =>
    model.meta.entries
      .filter((e) => keys.includes(e.key) && text(e.value))
      .map((e): LayoutBlock => ({
        from: e.range.start.offset,
        kind: 'paragraph',
        markdown: `**${capitalised(e.key)}:** ${text(e.value)}`,
        box: null,
      }));
  const start = model.meta.range?.start.offset ?? 0;
  const from = (...sections: (Section | undefined)[]) =>
    sections.find(Boolean)?.range.start.offset ?? start;

  // «A colpo d'occhio» prints without its revelations, which go to the side
  // column under their own heading.
  const overview = role('overview');
  const first = model.revelations[0]?.range.start.offset;
  const revealing = overview?.blocks.findIndex(
    (b) => first !== undefined && b.range.start.offset <= first && first < b.range.end.offset,
  );
  const split = revealing !== undefined && revealing >= 0 ? revealing : -1;
  const labelBefore = split > 0 && overview!.blocks[split - 1]!.kind === 'paragraph' ? split - 1 : split;
  const overviewBlocks = overview?.blocks.filter((b, i) => split < 0 || (i !== split && i !== labelBefore)) ?? [];
  const revelationBlocks = split >= 0 ? [overview!.blocks[split]!] : [];
  const overviewSide = overviewBlocks.filter((b) => box(b)?.side);

  const rules = role('rules');
  const rulesSide = rules?.blocks.filter((b) => box(b)?.side) ?? [];

  const synopsis = role('synopsis');
  const backstory = role('backstory');
  const strongStart = role('strongStart');
  const sceneMap = role('sceneMap');
  const clues = role('clues');
  const npcs = role('npcs');
  const sheets = role('sheets');
  const before = role('before');
  const ids = model.scenes.map((s) => s.id).filter((id): id is string => id !== null);

  return {
    options,
    title: text(metaValue('title')) ?? project.title,
    subtitle: text(metaValue('subtitle')),
    author: authors(values['autore']),
    copyright: text(values['copyright']),
    licence: model.meta.licence
      ? {
          short: licenceShort(model.meta.licence),
          full: model.meta.licence.text,
          url: licenceUrl(model.meta.licence),
        }
      : null,
    tabs: ['Notte', ...ids, 'Schede'],
    cover: {
      from: start,
      over: metaBlocks(OVER),
      meta: metaBlocks(UNDER),
      synopsis: part(synopsis),
      backstory: part(backstory),
    },
    night: {
      from: from(overview, role('reminders')),
      overviewTitle: headingOf(template, 'overview', "A colpo d'occhio"),
      overview: overview ? part(overview, overviewBlocks.filter((b) => !box(b)?.side)) : null,
      revelations:
        overview && revelationBlocks.length > 0
          ? partOf(template, overview, revelationBlocks, template.overview.revelations)
          : null,
      sideBoxes: overviewSide.map((b) => toBlock(b)),
      reminders: part(role('reminders')),
      clock: part(role('clock')),
      truths: part(role('truths')),
    },
    start: { from: from(strongStart, sceneMap), strongStart: part(strongStart), sceneMap: part(sceneMap) },
    rules: rules ? { ...part(rules, rules.blocks.filter((b) => !box(b)?.side))!, sideBoxes: rulesSide.map((b) => toBlock(b)) } : null,
    scenes: model.scenes.map((s) => scene(template, model, s)),
    references: {
      from: from(clues, npcs, sheets),
      clues: part(clues),
      npcs: part(npcs),
      sheetsTitle: headingOf(template, 'sheets', 'Schede'),
      sheets: model.sheets.map((s) => ({
        label: sheetLabel(s.id),
        title: s.title,
        from: s.range.start.offset,
        blocks: sheetBlocks(template, s),
      })),
      pregenerated:
        model.pregenerated && options.pregenerated
          ? {
              title: template.sheets.pregenerated,
              from: model.pregenerated.range.start.offset,
              blocks: model.pregenerated.blocks.map((b) => toBlock(b)),
              characters: model.pregenerated.characters.map((c) => ({
                name: c.name,
                from: c.range.start.offset,
                blocks: c.blocks.map((b) => toBlock(b)),
              })),
            }
          : null,
      before: part(before),
    },
  };
}

// `autore` is one name, or a list of names joined with «, ».
function authors(value: JsonValue | undefined): string | null {
  if (Array.isArray(value)) {
    const names = value.map((v) => text(v)).filter((v): v is string => v !== null);
    return names.length > 0 ? names.join(', ') : null;
  }
  return text(value);
}

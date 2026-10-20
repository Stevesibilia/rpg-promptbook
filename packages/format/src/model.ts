// The model built from an adventure, and the problems found in it. Everything
// here is plain data (JSON-safe): it crosses the Electron IPC and the MCP
// boundary. Every item keeps its position in the text.

import type { SectionRole } from './template/schema.js';

export interface Point {
  offset: number;
  // 1-based.
  line: number;
  // 1-based, in UTF-16 code units, like the editor's.
  column: number;
}

export interface Range {
  start: Point;
  end: Point;
}

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

export interface Fix {
  title: string;
  edits: TextEdit[];
}

export type Severity = 'error' | 'warning';

export interface Problem {
  // Stable, what callers match on: "scene.id.missing", "content.unplaced"…
  code: string;
  severity: Severity;
  // English, with the template's Italian labels quoted.
  message: string;
  range: Range;
  sceneId?: string;
  fixes?: Fix[];
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// Blocks keep their Markdown source in `text`, so a renderer can read them
// again without the model guessing what they mean.

export interface ParagraphBlock {
  kind: 'paragraph';
  range: Range;
  text: string;
}

export interface ListItem {
  range: Range;
  // The item's source without its marker and checkbox.
  text: string;
  checked: boolean | null;
  // The bold text the item opens with, without a trailing colon.
  label: string | null;
  // What follows the label, without the colon or comma after it.
  value: string;
}

export interface ListBlock {
  kind: 'list';
  range: Range;
  text: string;
  ordered: boolean;
  items: ListItem[];
}

export interface TableRow {
  range: Range;
  cells: string[];
}

export interface TableBlock {
  kind: 'table';
  range: Range;
  text: string;
  header: string[];
  rows: TableRow[];
}

// A blockquote whose first line is [!type], [!type] Title or [!type|meta] Title.
export interface CalloutBlock {
  kind: 'callout';
  // Owner id plus a 1-based index among the owner's boxes: "S3.2".
  id: string;
  range: Range;
  text: string;
  // The first line, [!type…].
  headerRange: Range;
  type: string;
  meta: string | null;
  title: string | null;
  // The body, without the quote markers.
  content: string;
}

// A blockquote that is not a callout.
export interface QuoteBlock {
  kind: 'quote';
  id: string;
  range: Range;
  text: string;
  content: string;
}

export interface HeadingBlock {
  kind: 'heading';
  range: Range;
  text: string;
  depth: number;
  title: string;
}

export interface OtherBlock {
  kind: 'code' | 'html' | 'thematicBreak' | 'other';
  range: Range;
  text: string;
}

export type BoxBlock = CalloutBlock | QuoteBlock;
export type Block = ParagraphBlock | ListBlock | TableBlock | BoxBlock | HeadingBlock | OtherBlock;

export interface MetaEntry {
  key: string;
  known: boolean;
  value: JsonValue;
  range: Range;
  keyRange: Range;
}

export interface Meta {
  // The front matter block, null when the document has none.
  range: Range | null;
  values: Record<string, JsonValue>;
  entries: MetaEntry[];
  licence: { text: string; spdx: boolean } | null;
}

export interface Section {
  // The template's name for a known section, the heading text otherwise.
  id: string;
  name: string | null;
  heading: string;
  known: boolean;
  role: SectionRole | null;
  range: Range;
  headingRange: Range;
  // The section's own content. Scenes, sheets and appendix rows are kept in
  // their own lists; what comes before the first of them stays here.
  blocks: Block[];
}

export interface SceneField {
  label: string;
  // False when the template has no such scene field.
  known: boolean;
  // inline: **Label:** text. block: **Label** then a list or a table.
  form: 'inline' | 'block';
  range: Range;
  labelRange: Range;
  // The text after the label, for an inline field.
  text: string;
  // The lists and tables that follow a block label.
  blocks: Block[];
}

export interface Reference {
  // The name after the marker, as written: "Tenente Donato", or
  // "Sabaoth, «Cosa offre»".
  target: string;
  range: Range;
  // The scene field the reference stands in, if any.
  field: string | null;
  // The id of the sheet it resolves to. Set by the parser when the name
  // resolves to exactly one sheet; absent when it is unresolved or ambiguous.
  sheet?: string;
}

export interface AssetImage {
  assetId: string;
  alt: string;
  range: Range;
}

export interface Scene {
  // "S1", or null when the heading has no id.
  id: string | null;
  title: string;
  heading: string;
  range: Range;
  headingRange: Range;
  fields: SceneField[];
  boxes: BoxBlock[];
  // The ids of the scene's read-aloud boxes, every callout with that role, in
  // document order.
  readAlouds: string[];
  // The table whose first header cell starts like the template's reactions table.
  reactions: TableBlock | null;
  tables: TableBlock[];
  references: Reference[];
  images: AssetImage[];
}

export interface Revelation {
  id: string;
  text: string;
  clues: string[];
  range: Range;
}

export interface Clue {
  id: string;
  text: string;
  revelations: string[];
  sceneId: string | null;
  range: Range;
}

export interface Reminder {
  text: string;
  checked: boolean | null;
  range: Range;
}

export interface SceneMapRow {
  sceneId: string | null;
  cells: Record<string, string>;
  range: Range;
}

export interface TrackerRow {
  clueId: string | null;
  text: string;
  revelations: string[];
  scenes: string[];
  done: boolean;
  cells: Record<string, string>;
  range: Range;
}

export interface NpcRow {
  name: string;
  cells: Record<string, string>;
  range: Range;
}

export interface SheetField {
  // The bold key the item opens with, null for an item without one.
  key: string | null;
  value: string;
  range: Range;
}

export interface Threat {
  type: string | null;
  grade: string | null;
  nature: string | null;
  wounds: string | null;
  afflictions: string | null;
  pack: string | null;
  talents: string[];
  // From the system's grade table, when the document names a system the
  // template knows and the grade is in its table.
  counts: { wounds: number; afflictions: number; woundsPerCounter: number } | null;
}

export interface Sheet {
  // A slug of the title before the comma: "tenente-donato".
  id: string;
  // The title before the comma: "Tenente Donato".
  name: string;
  title: string;
  range: Range;
  headingRange: Range;
  fields: SheetField[];
  // Present when the sheet has any of the template's threat keys.
  threat: Threat | null;
  // Everything in the sheet that is not a list item, #### headings included.
  blocks: Block[];
}

export interface Pregenerated {
  range: Range;
  headingRange: Range;
  // What comes before the first character.
  blocks: Block[];
  characters: { name: string; range: Range; headingRange: Range; blocks: Block[] }[];
}

export interface AppendixRow {
  sceneId: string | null;
  title: string;
  heading: string;
  range: Range;
  headingRange: Range;
  visual: { text: string; range: Range } | null;
  mood: { text: string; range: Range } | null;
}

export interface Unplaced {
  text: string;
  range: Range;
  sceneId: string | null;
  section: string | null;
}

export interface Model {
  // The template the document was read with: "avventura@1".
  template: string;
  meta: Meta;
  sections: Section[];
  scenes: Scene[];
  sheets: Sheet[];
  pregenerated: Pregenerated | null;
  revelations: Revelation[];
  clues: Clue[];
  reminders: Reminder[];
  sceneMap: SceneMapRow[];
  tracker: TrackerRow[];
  npcs: NpcRow[];
  appendix: AppendixRow[];
  unplaced: Unplaced[];
}

export interface ParseResult {
  model: Model;
  problems: Problem[];
}

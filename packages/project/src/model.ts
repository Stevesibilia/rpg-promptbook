// The values a project's metadata can take, and the plain shapes the readers
// return. Everything here is JSON-safe: it crosses the REST API and, later,
// the Electron IPC.

export const SCHEMA = 1;

export const categories = ['campaign', 'adventure', 'one-shot'] as const;
export type Category = (typeof categories)[number];

export const statuses = ['draft', 'in-progress', 'complete'] as const;
export type Status = (typeof statuses)[number];

export const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && (categories as readonly string[]).includes(value);

export const isStatus = (value: unknown): value is Status =>
  typeof value === 'string' && (statuses as readonly string[]).includes(value);

export interface ProjectMeta {
  schema: number;
  id: string;
  title: string;
  category: Category;
  status: Status;
  campaignId: string | null;
  system: string;
  // ISO date-time.
  createdAt: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  // May be empty.
  note: string;
  // YYYY-MM-DD.
  due: string | null;
  // Fractional index: items sort by pos, then id.
  pos: string;
}

export interface SeedVersion {
  text: string;
  // ISO date-time.
  at: string;
}

// One of the user's campaigns, as the server knows them: what a summary checks
// a campaign link against, and what an import matches `campagna` with.
export interface CampaignRef {
  id: string;
  title: string;
}

// Who wrote an item of the inspiration, the research or the brainstorm log.
export const authors = ['user', 'claude'] as const;
export type Author = (typeof authors)[number];

export const inspirationKinds = ['link', 'quote', 'image', 'note'] as const;
export type InspirationKind = (typeof inspirationKinds)[number];

export interface InspirationItem {
  id: string;
  kind: InspirationKind;
  // The title of a link or an image, the quote, or the note.
  text: string;
  // http or https for a link or an image, '' for the other kinds.
  url: string;
  why: string;
  by: Author;
  // ISO date-time.
  at: string;
}

export const topicStates = ['open', 'noted'] as const;
export type TopicState = (typeof topicStates)[number];

export interface ResearchTopic {
  id: string;
  name: string;
  state: TopicState;
  // ISO date-time.
  at: string;
}

export interface Source {
  title: string;
  url: string;
  // YYYY-MM-DD, or '' when not known.
  accessed: string;
}

export interface ResearchNote {
  id: string;
  topic: string;
  summary: string;
  facts: string[];
  sources: Source[];
  by: Author;
  // ISO date-times.
  at: string;
  editedAt: string;
}

export interface Rejected {
  idea: string;
  why: string;
}

export interface LogEntry {
  id: string;
  // ISO date-time.
  at: string;
  title: string;
  ideas: string[];
  decisions: string[];
  rejected: Rejected[];
  questions: string[];
  by: Author;
  // True once the open questions went to the to-do list.
  todoAdded: boolean;
}

// The limits the writers check and the server's tool schemas repeat (design
// decision 2): characters for texts, items for lists.
export const LIMITS = {
  text: 2000,
  summary: 10_000,
  name: 200,
  url: 2048,
  list: 50,
  sources: 30,
  // The board's prompts and file names (asset-board design decision 1).
  imagePrompt: 2000,
  trackTitle: 120,
  style: 1000,
  lyrics: 3000,
  fileName: 255,
} as const;

// The most items each collection takes; past it a writer refuses and a reader
// leaves out the items after the first ones.
export const CAPS = {
  inspiration: 500,
  topics: 200,
  notes: 500,
  brainstorm: 1000,
  files: 2000,
  // Image prompts of every category in one project (image-categories design
  // decision 1).
  imagePrompts: 500,
} as const;

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

// An ISO 8601 date-time with its offset, as toISOString writes it.
export function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

// The WHATWG URL parser, in browsers, Node and Electron alike; typed here for
// the same reason as randomId in doc.ts.
const parseUrl = (value: string): { protocol: string } =>
  new (globalThis as unknown as { URL: new (value: string) => { protocol: string } }).URL(value);

// An absolute http or https address, the only kind an item may link to.
export function isWebUrl(value: string): boolean {
  if (value.length > LIMITS.url) return false;
  try {
    const { protocol } = parseUrl(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

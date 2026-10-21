import { parseAdventure, templates } from 'promptbook-format';
import type * as Y from 'yjs';
import { currentSeed, readDocument, readMeta, readTodo } from './doc.js';
import { partitionProblems, readHidden } from './hidden.js';
import type { CampaignRef, Category, Status } from './model.js';

// The fields of the server's projects row, derived from the document, which
// stays the source (design decision 6).
export interface Summary {
  id: string;
  title: string;
  category: Category;
  status: Status;
  campaignId: string | null;
  system: string;
  seed: string;
  todoDone: number;
  todoTotal: number;
  // The earliest due date of an open item, YYYY-MM-DD.
  nextDue: string | null;
  // From parsing the document; null for a campaign, which has no checks.
  scenes: number | null;
  words: number | null;
  errors: number | null;
  warnings: number | null;
}

const LETTER = /\p{L}/u;

// Whitespace-separated tokens containing a letter.
export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => LETTER.test(token)).length;
}

export interface SummarizeOptions {
  // The user's campaigns. A campaign link to anything else, or from a
  // campaign, is summarised as stand-alone; the document is not rewritten.
  campaigns: readonly CampaignRef[];
  // The clock the hidden problems are judged by; a snooze that has ended
  // counts again. Defaults to the real one.
  now?: Date;
}

export function summarize(doc: Y.Doc, { campaigns, now = new Date() }: SummarizeOptions): Summary {
  const meta = readMeta(doc);
  const todo = readTodo(doc);
  const linked =
    meta.category !== 'campaign' &&
    meta.campaignId !== null &&
    meta.campaignId !== meta.id &&
    campaigns.some((c) => c.id === meta.campaignId);
  const due = todo
    .filter((t) => !t.done && t.due !== null)
    .map((t) => t.due!)
    .sort();
  const summary: Summary = {
    id: meta.id,
    title: meta.title,
    category: meta.category,
    status: meta.status,
    campaignId: linked ? meta.campaignId : null,
    system: meta.system,
    seed: currentSeed(doc),
    todoDone: todo.filter((t) => t.done).length,
    todoTotal: todo.length,
    nextDue: due[0] ?? null,
    scenes: null,
    words: null,
    errors: null,
    warnings: null,
  };
  if (meta.category === 'campaign') return summary;

  const text = readDocument(doc);
  const { model, problems } = parseAdventure(text, { template: templates.avventura });
  const body = model.meta.range ? text.slice(model.meta.range.end.offset) : text;
  summary.scenes = model.scenes.length;
  summary.words = countWords(body);
  // Problems the owner hid are left out of the counts (hide-problems design
  // decision 5).
  const { shown } = partitionProblems(problems, text, readHidden(doc), now);
  summary.errors = shown.filter((p) => p.severity === 'error').length;
  summary.warnings = shown.filter((p) => p.severity === 'warning').length;
  return summary;
}

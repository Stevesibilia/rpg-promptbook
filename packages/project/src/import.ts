import { convertNote, type ConvertReport } from 'promptbook-format';
import { parse } from 'yaml';
import type { CampaignRef, Category } from './model.js';

export interface PreparedImport {
  title: string;
  // From the front matter's `formato`; null leaves the choice to the user.
  category: Category | null;
  campaignId: string | null;
  // The converted note: the new project's document.
  text: string;
  report: ConvertReport;
  isAdventureNote: boolean;
  // Relative image targets, left in the text as they are: assets come later.
  imageRefs: string[];
}

export interface PrepareImportOptions {
  // The note's file name, or a name given to pasted text; may hold a path.
  fileName: string;
  campaigns: readonly CampaignRef[];
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

// The front matter as a plain object, or null when there is none or it is not
// a YAML mapping.
function frontMatterOf(text: string): Record<string, unknown> | null {
  const match = FRONT_MATTER.exec(text);
  if (!match) return null;
  try {
    const value: unknown = parse(match[1] ?? '');
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

const categoryOf: Record<string, Category> = {
  'one-shot': 'one-shot',
  avventura: 'adventure',
  campagna: 'campaign',
};

const SCENE_HEADING = /^### +S\d+\./m;
const TITLE_HEADING = /^# +(.+?)(?: +#+)? *$/m;

function stem(fileName: string): string {
  const base = fileName.split(/[\\/]/).at(-1) ?? '';
  return base.replace(/\.[^.]*$/, '').trim();
}

// Markdown image links and <img src>, keeping those whose target is a
// relative path: no scheme, no leading slash, not a fragment.
export function imageReferences(markdown: string): string[] {
  const targets: string[] = [];
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]*)>|([^\s)]+))/g)) {
    targets.push(match[1] ?? match[2] ?? '');
  }
  for (const match of markdown.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    targets.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return targets.filter((target) => target !== '' && !/^(?:[a-z][a-z0-9+.-]*:|[/\\#])/i.test(target));
}

// Converts one note and proposes how to import it. One note is always one
// new project: nothing here looks at existing projects other than campaigns.
export function prepareImport(note: string, { fileName, campaigns }: PrepareImportOptions): PreparedImport {
  const fallbackTitle = stem(fileName);
  const converted = convertNote(note, fallbackTitle ? { title: fallbackTitle } : {});
  const original = frontMatterOf(note);
  const meta = frontMatterOf(converted.text) ?? {};

  const title = text(meta.titolo) || TITLE_HEADING.exec(converted.text)?.[1]?.trim() || fallbackTitle;
  const category = categoryOf[text(meta.formato).toLowerCase()] ?? null;
  const campaignTitle = text(meta.campagna);
  const campaignId =
    category !== 'campaign' && campaignTitle
      ? (campaigns.find((c) => c.title.trim() === campaignTitle)?.id ?? null)
      : null;
  // A `# Title` alone is no sign of an adventure: Joplin exports open with one,
  // and the converter turns it into front matter.
  const isAdventureNote =
    original !== null || Object.keys(meta).some((key) => key !== 'titolo') || SCENE_HEADING.test(converted.text);

  return {
    title,
    category,
    campaignId,
    text: converted.text,
    report: converted.report,
    isAdventureNote,
    imageRefs: imageReferences(converted.text),
  };
}

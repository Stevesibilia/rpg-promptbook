import type * as Y from 'yjs';
import { migratedView } from './board-migration.js';
import { readDocumentBoard, type FileEntry, type NamedCategory, type PromptRow } from './board.js';
import {
  readDocument,
  readInspiration,
  readLog,
  readMeta,
  readNotes,
  readTodo,
  readTopics,
  seedVersions,
} from './doc.js';
import type { Author, InspirationItem, LogEntry, ResearchNote, ResearchTopic, TodoItem } from './model.js';

export interface ExportOptions {
  campaignTitle: string | null;
  // ISO date-time of the last stored edit, when the caller knows it.
  editedAt?: string;
}

// A GFM task list. A due date follows the text; a note is a continuation
// line of the item, one per line of the note.
export function todoMarkdown(items: readonly TodoItem[]): string {
  return items
    .map((item) => {
      const head = `- [${item.done ? 'x' : ' '}] ${item.text}${item.due ? ` (due ${item.due})` : ''}`;
      const note = item.note
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => `  ${line}`);
      return [head, ...note].join('\n') + '\n';
    })
    .join('');
}

// A list item whose text may run over several lines: the lines after the
// first are continuation lines.
const bullet = (text: string) => `- ${text.split('\n').join('\n  ')}\n`;

// Text printed as a heading stays on one line.
const oneLine = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ').trim();

const who = (by: Author) => (by === 'claude' ? 'by Claude' : 'by you');

const KIND_NAMES: Record<InspirationItem['kind'], string> = {
  link: 'Link',
  quote: 'Quote',
  image: 'Image link',
  note: 'Note',
};

// The sources of inspiration, newest first: kind, who and date, then the
// text, the URL and why it matters.
export function inspirationMarkdown(items: readonly InspirationItem[]): string {
  return items
    .map((item) => {
      const lines = [`## ${KIND_NAMES[item.kind]} · ${who(item.by)} · ${item.at}`, '', item.text];
      if (item.url) lines.push('', `URL: <${item.url}>`);
      if (item.why) lines.push('', `Why: ${item.why}`);
      return `${lines.join('\n')}\n`;
    })
    .join('\n');
}

// The topics with their state, then every note, newest edit first, with its
// summary, facts and sources.
export function researchMarkdown(topics: readonly ResearchTopic[], notes: readonly ResearchNote[]): string {
  const parts: string[] = [];
  if (topics.length > 0) {
    const list = topics.map((t) => bullet(`${t.name} (${t.state === 'noted' ? 'noted' : 'to research'})`)).join('');
    parts.push(`# Topics\n\n${list}`);
  }
  for (const note of notes) {
    const lines = [`# ${oneLine(note.topic)}`, '', `${who(note.by)} · created ${note.at} · edited ${note.editedAt}`];
    if (note.summary) lines.push('', note.summary);
    let text = `${lines.join('\n')}\n`;
    if (note.facts.length > 0) text += `\n## Facts\n\n${note.facts.map(bullet).join('')}`;
    if (note.sources.length > 0) {
      const sources = note.sources.map((s) =>
        bullet(`${s.title} <${s.url}>${s.accessed ? `, accessed ${s.accessed}` : ''}`),
      );
      text += `\n## Sources\n\n${sources.join('')}`;
    }
    parts.push(text);
  }
  return parts.join('\n');
}

// The entries, newest first, each part only when it has items.
export function logMarkdown(entries: readonly LogEntry[]): string {
  return entries
    .map((entry) => {
      let text = `# ${oneLine(entry.title)}\n\n${entry.at} · ${entry.by === 'claude' ? 'via Claude' : 'by you'}\n`;
      const part = (heading: string, items: readonly string[]) => {
        if (items.length > 0) text += `\n## ${heading}\n\n${items.map(bullet).join('')}`;
      };
      part('Ideas', entry.ideas);
      part('Decisions', entry.decisions);
      part(
        'Rejected',
        entry.rejected.map((r) => (r.why ? `${r.idea} (why: ${r.why})` : r.idea)),
      );
      part('Open questions', entry.questions);
      if (entry.todoAdded) text += '\nOpen questions added to the to-do list.\n';
      return text;
    })
    .join('\n');
}

// A name that stays inside its folder on every file system: no separators,
// reserved characters or control characters, and not empty, "." or "..".
function fileSafe(name: string, empty = 'file'): string {
  const clean = name
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '-')
    .trim()
    .replace(/[. ]+$/, '');
  return clean === '' ? empty : clean;
}

// " (2)", " (3)"… before the extension until the name is free in its folder.
function freeName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

// A PC's, an NPC's or a handout's folder: its name, made safe, «Untitled»
// when empty, with " (2)", " (3)"… when another of its category has it.
function freeFolder(name: string, taken: Set<string>): string {
  const base = fileSafe(name, 'Untitled');
  let candidate = base;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

// Text in a fenced block that no run of backticks inside it can close.
function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

export interface ExportFile {
  // Inside the project's folder: files/scenes/<scene id>/<n>/<name>,
  // files/scenes/<scene id>/music/<name>, files/pcs/<name>/<name>,
  // files/npcs/…, files/handouts/…, or files/unmatched/<name>.
  path: string;
  // The bytes are in the file store under this name.
  sha256: string;
}

const PARTS: [NamedCategory, string, string][] = [
  ['pc', 'PCs', 'pcs'],
  ['npc', 'NPCs', 'npcs'],
  ['handout', 'Handouts', 'handouts'],
];

// board.md and the list of the files to put beside it (asset-board design
// decision 16, image-categories design decision 6): a part per category,
// Scenes per appendix row with its image prompts numbered and its music,
// then PCs, NPCs and Handouts, every prompt with who wrote it and when and
// its chosen file; every image in its prompt's folder, every track in its
// scene's, the ones in the Unmatched tray in files/unmatched. A board from
// before image categories is read migrated, the document left as it is.
// Thumbnails are not listed. A campaign's board.md is empty.
export function exportBoard(doc: Y.Doc): { markdown: string; files: ExportFile[] } {
  const view = migratedView(doc);
  const { rows, named, unmatched } = readDocumentBoard(view);
  const taken = new Map<string, Set<string>>();
  const names = new Map<string, string>();
  const files: ExportFile[] = [];
  const place = (file: FileEntry, folder: string) => {
    const used = taken.get(folder) ?? new Set<string>();
    taken.set(folder, used);
    const name = freeName(fileSafe(file.name), used);
    names.set(file.id, name);
    files.push({ path: `files/${folder}/${name}`, sha256: file.sha256 });
  };
  for (const row of rows) {
    const scene = `scenes/${fileSafe(row.sceneId)}`;
    for (const prompt of row.prompts) for (const file of prompt.images) place(file, `${scene}/${prompt.number}`);
    for (const file of row.tracks) place(file, `${scene}/music`);
  }
  for (const [category, , folder] of PARTS) {
    const folders = new Set<string>();
    for (const prompt of named[category]) {
      const own = freeFolder(prompt.prompt.name ?? '', folders);
      for (const file of prompt.images) place(file, `${folder}/${own}`);
    }
  }
  for (const { file } of unmatched) place(file, 'unmatched');

  if (readMeta(view).category === 'campaign') return { markdown: '', files };
  const empty = rows.length === 0 && PARTS.every(([category]) => named[category].length === 0);
  if (empty) return { markdown: '', files };

  const chosen = (id: string | null) => (id === null ? [] : ['', `Chosen: ${names.get(id) ?? ''}`]);
  const promptLines = (row: PromptRow) => [
    ...(row.prompt.prompt === ''
      ? ['No prompt yet.']
      : [fenced(row.prompt.prompt), '', `${who(row.prompt.by)} · ${row.prompt.at}`]),
    ...chosen(row.chosen),
  ];
  const scenes = rows.map((row) => {
    const lines = [`## ${row.sceneId} · ${oneLine(row.title)}`, ''];
    for (const prompt of row.prompts) lines.push(`### Image prompt ${prompt.number}`, '', ...promptLines(prompt), '');
    if (row.prompts.length === 0) lines.push('No image prompts yet.', '');
    lines.push('### Music', '');
    if (row.music) {
      lines.push(
        `Title: ${oneLine(row.music.title)}`,
        '',
        'Style:',
        '',
        fenced(row.music.style),
        '',
        'Lyrics:',
        '',
        fenced(row.music.lyrics),
        '',
        `${who(row.music.by)} · ${row.music.at}`,
      );
    } else {
      lines.push('No prompt yet.');
    }
    lines.push(...chosen(row.chosenTrack));
    return `${lines.join('\n')}\n`;
  });
  const parts = [`# Scenes\n\n${scenes.length > 0 ? scenes.join('\n') : 'None yet.\n'}`];
  for (const [category, title] of PARTS) {
    const items = named[category].map(
      (row) => `${[`## ${oneLine(row.prompt.name ?? '') || 'Untitled'}`, '', ...promptLines(row)].join('\n')}\n`,
    );
    parts.push(`# ${title}\n\n${items.length > 0 ? items.join('\n') : 'None yet.\n'}`);
  }
  return { markdown: parts.join('\n'), files };
}

// The files of one project's folder: the document as stored, the to-do list,
// every seed version newest first, the sources of inspiration, the research,
// the brainstorm log, the board and the metadata. Snapshots stay on the
// server; the board's files come from exportBoard.
export function exportProject(doc: Y.Doc, { campaignTitle, editedAt }: ExportOptions): Record<string, string> {
  const meta = readMeta(doc);
  const seeds = seedVersions(doc)
    .reverse()
    .map((version) => `## ${version.at}\n\n${version.text}\n`)
    .join('\n');
  const project = {
    schema: meta.schema,
    id: meta.id,
    title: meta.title,
    category: meta.category,
    status: meta.status,
    campaign: meta.category === 'campaign' ? null : campaignTitle,
    system: meta.system,
    // The project's own link only: an inherited one is in its campaign's
    // folder (gdrarchive-link design decision 8).
    ...(meta.gdrarchive ? { gdrarchive: { url: meta.gdrarchive.url, label: meta.gdrarchive.label } } : {}),
    createdAt: meta.createdAt,
    ...(editedAt !== undefined ? { editedAt } : {}),
  };
  return {
    'document.md': readDocument(doc),
    'todo.md': todoMarkdown(readTodo(doc)),
    'seed.md': seeds,
    'inspiration.md': inspirationMarkdown(readInspiration(doc)),
    'research.md': researchMarkdown(readTopics(doc), readNotes(doc)),
    'brainstorm-log.md': logMarkdown(readLog(doc)),
    'board.md': exportBoard(doc).markdown,
    'project.json': `${JSON.stringify(project, null, 2)}\n`,
  };
}

// A folder name for a project in a zip: the title with the characters file
// systems refuse replaced by "-", made unique among the names already taken
// with " (2)", " (3)"… Adds the name it returns to `taken`.
export function exportFolderName(title: string, taken: Set<string>): string {
  const cleaned = title.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '-').trim();
  // "." and ".." would climb out of the folder the zip is extracted into.
  const base = cleaned === '' || /^\.+$/.test(cleaned) ? 'Untitled' : cleaned;
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})`;
  taken.add(name.toLowerCase());
  return name;
}

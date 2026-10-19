import type * as Y from 'yjs';
import { readDocument, readMeta, readTodo, seedVersions } from './doc.js';
import type { TodoItem } from './model.js';

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

// The files of one project's folder: the document as stored, the to-do list,
// every seed version newest first, and the metadata.
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
    createdAt: meta.createdAt,
    ...(editedAt !== undefined ? { editedAt } : {}),
  };
  return {
    'document.md': readDocument(doc),
    'todo.md': todoMarkdown(readTodo(doc)),
    'seed.md': seeds,
    'project.json': `${JSON.stringify(project, null, 2)}\n`,
  };
}

// A folder name for a project in a zip: the title with the characters file
// systems refuse replaced by "-", made unique among the names already taken
// with " (2)", " (3)"… Adds the name it returns to `taken`.
export function exportFolderName(title: string, taken: Set<string>): string {
  const base = title.replace(/[/\\:*?"<>|]/g, '-').trim() || 'Untitled';
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})`;
  taken.add(name.toLowerCase());
  return name;
}

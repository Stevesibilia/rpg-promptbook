import { useDeferredValue, useMemo, useRef, useState, type DragEvent } from 'react';
import { categories, prepareImport, type CampaignRef, type Category, type PreparedImport } from 'promptbook-project';
import type { ConvertEditKind, ConvertReport } from 'promptbook-format';
import { api, ApiError, type ImportNote, type ProjectRow } from '../api.js';
import { Modal } from '../ui/Modal.js';
import { categoryLabels, plural } from './list.js';

// Import Markdown: every note becomes one new project. The preview converts
// each note here with the same function the server runs when it stores it.

interface Note {
  key: string;
  fileName: string;
  text: string;
  prepared: PreparedImport;
  ticked: boolean;
  category: Category | '';
  // '' for stand-alone.
  campaignId: string;
  duplicate: boolean;
  expanded: boolean;
}

const editLabels: Record<ConvertEditKind, string> = {
  frontMatter: 'Header lines moved to front matter',
  callout: 'Quotes and boxes turned into callouts',
  threat: 'Threat lines split into fields',
  comment: 'Template comments removed',
};

const isMarkdown = (name: string) => /\.md$/i.test(name);

const changeCount = (report: ConvertReport) => Object.values(report.counts).reduce((a, b) => a + b, 0);
const needsYou = (report: ConvertReport) => [
  ...report.notices.map((n) => n.message),
  ...report.problems.map((p) => (p.sceneId ? `${p.sceneId}: ${p.message}` : p.message)),
];

// Every file below a dropped folder, read through the entries API.
async function filesFromEntry(entry: FileSystemEntry, path = ''): Promise<{ file: File; path: string }[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, path: path + file.name }];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries answers in batches until it answers none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const nested = await Promise.all(children.map((child) => filesFromEntry(child, `${path}${entry.name}/`)));
  return nested.flat();
}

function folderOf(paths: string[]): string | null {
  const first = paths.map((p) => (p.includes('/') ? p.split('/')[0]! : null));
  return first.length && first.every((f) => f !== null && f === first[0]) ? first[0]! : null;
}

export function ImportDialog({
  projects,
  onClose,
  onImported,
}: {
  projects: readonly ProjectRow[];
  onClose(): void;
  onImported(): void;
}) {
  const [tab, setTab] = useState<'files' | 'paste'>('files');
  const [notes, setNotes] = useState<Note[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteCategory, setPasteCategory] = useState<Category | ''>('');
  const [pasteCampaign, setPasteCampaign] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);

  const campaigns = useMemo(() => projects.filter((p) => p.category === 'campaign'), [projects]);
  const refs: CampaignRef[] = useMemo(() => campaigns.map((c) => ({ id: c.id, title: c.title })), [campaigns]);
  const titles = useMemo(() => new Set(projects.map((p) => p.title.trim().toLocaleLowerCase())), [projects]);

  async function addFiles(found: { file: File; path: string }[]) {
    // A slower earlier drop must not replace a newer one.
    const mine = ++generation.current;
    const markdown = found.filter((f) => isMarkdown(f.file.name));
    if (!markdown.length) return setError('No .md files there.');
    setError('');
    const read = await Promise.all(
      markdown.map(async ({ file, path }) => {
        const text = await file.text();
        const prepared = prepareImport(text, { fileName: path, campaigns: refs });
        return {
          key: `${path}:${file.size}:${file.lastModified}`,
          fileName: path,
          text,
          prepared,
          ticked: prepared.isAdventureNote,
          category: prepared.category ?? '',
          campaignId: prepared.campaignId ?? '',
          duplicate: titles.has(prepared.title.trim().toLocaleLowerCase()),
          expanded: false,
        } satisfies Note;
      }),
    );
    if (mine !== generation.current) return;
    read.sort((a, b) => a.fileName.localeCompare(b.fileName));
    setFolder(folderOf(read.map((n) => n.fileName)));
    setNotes(read);
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    const entries = [...event.dataTransfer.items]
      .map((item) => item.webkitGetAsEntry?.() ?? null)
      .filter((e): e is FileSystemEntry => e !== null);
    const found = entries.length
      ? (await Promise.all(entries.map((e) => filesFromEntry(e)))).flat()
      : [...event.dataTransfer.files].map((file) => ({ file, path: file.name }));
    await addFiles(found);
  }

  const update = (key: string, patch: Partial<Note>) =>
    setNotes((all) => all.map((n) => (n.key === key ? { ...n, ...patch } : n)));

  // Paste: converted as the user types, a little behind.
  const deferredPaste = useDeferredValue(pasted);
  const pastePrepared = useMemo(
    () => (deferredPaste.trim() ? prepareImport(deferredPaste, { fileName: 'pasted.md', campaigns: refs }) : null),
    [deferredPaste, refs],
  );
  const pasteCat = pasteCategory || pastePrepared?.category || '';
  const pasteCamp = pasteCat === 'campaign' ? '' : (pasteCampaign ?? pastePrepared?.campaignId ?? '');

  const ticked = notes.filter((n) => n.ticked);
  const blocked = ticked.some((n) => !n.category);
  // The preview runs a little behind the typing; importing waits for it, so
  // what the dialog shows is what is imported.
  const pasteCurrent = deferredPaste === pasted;
  const pasteDuplicate = !!pastePrepared && titles.has(pastePrepared.title.trim().toLocaleLowerCase());
  const canImport = tab === 'files' ? ticked.length > 0 && !blocked : pasteCurrent && !!pastePrepared && !!pasteCat;

  async function submit() {
    if (busy) return;
    let body: ImportNote[];
    if (tab === 'files') {
      body = ticked.map((n) => ({
        text: n.text,
        fileName: n.fileName,
        title: n.prepared.title,
        category: n.category as Category,
        campaignId: n.category === 'campaign' ? null : n.campaignId || null,
      }));
    } else {
      // Converted again from exactly the text that is sent.
      const prepared = pasted.trim() ? prepareImport(pasted, { fileName: 'pasted.md', campaigns: refs }) : null;
      const category = pasteCategory || prepared?.category;
      if (!prepared || !category) return;
      const campaignId = category === 'campaign' ? '' : (pasteCampaign ?? prepared.campaignId ?? '');
      body = [{ text: pasted, fileName: 'pasted.md', title: prepared.title, category, campaignId: campaignId || null }];
    }
    setBusy(true);
    setError('');
    try {
      await api.importNotes(body);
      onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Importing failed.');
      setBusy(false);
    }
  }

  const button =
    tab === 'paste'
      ? 'Import as a project'
      : `Import ${ticked.length === 1 ? '1 project' : `${ticked.length} projects`}`;

  return (
    <Modal
      title="Import Markdown"
      className="wide"
      onClose={onClose}
      footer={
        <>
          <span className="note">
            {blocked && tab === 'files'
              ? 'Choose a category for every ticked note.'
              : 'Nothing is dropped: what the converter cannot place stays in the text.'}
          </span>
          <button className="tb line" onClick={onClose}>
            Cancel
          </button>
          <button className="tb primary" onClick={() => void submit()} disabled={!canImport || busy}>
            {busy ? 'Importing…' : button}
          </button>
        </>
      }
    >
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'files'}
          className={tab === 'files' ? 'on' : ''}
          onClick={() => setTab('files')}
        >
          Files or folder
        </button>
        <button
          role="tab"
          aria-selected={tab === 'paste'}
          className={tab === 'paste' ? 'on' : ''}
          onClick={() => setTab('paste')}
        >
          Paste
        </button>
      </div>

      {tab === 'files' ? (
        <div>
          <div
            className={`drop${over ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => void onDrop(e)}
          >
            <b>Drop a .md file or a folder here</b>
            <div className="or">Joplin and Obsidian exports work. Images stay as references for now.</div>
            <button className="tb line" onClick={() => filesInput.current?.click()}>
              Choose files…
            </button>
            <button className="tb line" onClick={() => folderInput.current?.click()}>
              Choose a folder…
            </button>
            <input
              ref={filesInput}
              type="file"
              accept=".md,text/markdown"
              multiple
              hidden
              data-testid="import-files"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                void addFiles(files.map((file) => ({ file, path: file.name })));
              }}
            />
            <input
              ref={folderInput}
              type="file"
              hidden
              {...{ webkitdirectory: '' }}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                void addFiles(files.map((file) => ({ file, path: file.webkitRelativePath || file.name })));
              }}
            />
          </div>

          {notes.length > 0 && (
            <>
              <div className="found">
                {folder && <b>{folder}/</b>}
                <span>
                  {plural(notes.length, 'note')} found · each note becomes one project, converted to the adventure
                  format
                </span>
              </div>
              <div className="imp">
                <div className="ir hd">
                  <span />
                  <span>Project</span>
                  <span>Category</span>
                  <span>Campaign</span>
                  <span>Converter</span>
                </div>
                {notes.map((note) => (
                  <NoteRow
                    key={note.key}
                    note={note}
                    campaigns={campaigns}
                    onChange={(patch) => update(note.key, patch)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div>
          <div className="field">
            <label htmlFor="imp-paste">Markdown</label>
            <textarea id="imp-paste" className="paste" value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <span className="hint">
              Pasted text goes through the same converter. It becomes a new project; to paste into an existing one, use
              its page.
            </span>
          </div>
          <div className="field row2">
            <div className="field">
              <label htmlFor="imp-paste-cat">Category</label>
              <CategorySelect id="imp-paste-cat" value={pasteCat} onChange={setPasteCategory} />
            </div>
            <div className="field">
              <label htmlFor="imp-paste-camp">Campaign</label>
              <CampaignSelect
                id="imp-paste-camp"
                value={pasteCamp}
                disabled={pasteCat === 'campaign'}
                campaigns={campaigns}
                onChange={setPasteCampaign}
              />
            </div>
          </div>
          {pasteDuplicate && <p className="dup">A project with this title exists: this note becomes a new one.</p>}
          {pastePrepared && (
            <div className="repd" style={{ gridColumn: 'auto' }}>
              <ReportDetail prepared={pastePrepared} />
            </div>
          )}
        </div>
      )}
      {error && <p className="err">{error}</p>}
    </Modal>
  );
}

function NoteRow({
  note,
  campaigns,
  onChange,
}: {
  note: Note;
  campaigns: readonly ProjectRow[];
  onChange(patch: Partial<Note>): void;
}) {
  const changes = changeCount(note.prepared.report);
  const needs = needsYou(note.prepared.report).length;
  return (
    <div className="ir" data-testid="import-row">
      <input
        type="checkbox"
        checked={note.ticked}
        aria-label={`Import ${note.prepared.title}`}
        onChange={(e) => onChange({ ticked: e.target.checked })}
      />
      <div style={{ minWidth: 0 }}>
        <b>{note.prepared.title}</b>
        <div className="fn">
          {note.fileName}
          {!note.prepared.isAdventureNote && ' · not an adventure note'}
        </div>
        {note.duplicate && <div className="dup">A project with this title exists: this note becomes a new one.</div>}
      </div>
      <CategorySelect value={note.category} onChange={(category) => onChange({ category })} label="Category" />
      <CampaignSelect
        value={note.category === 'campaign' ? '' : note.campaignId}
        disabled={note.category === 'campaign'}
        campaigns={campaigns}
        onChange={(campaignId) => onChange({ campaignId })}
        label="Campaign"
      />
      <button className="rep" onClick={() => onChange({ expanded: !note.expanded })} aria-expanded={note.expanded}>
        {note.ticked ? (
          <>
            <span className="ok">{plural(changes, 'change')}</span>
            {needs > 0 && (
              <>
                {' · '}
                <span className="need">{needs} for you</span>
              </>
            )}{' '}
            ▾
          </>
        ) : (
          <span className="skip">skipped ▾</span>
        )}
      </button>
      {note.expanded && (
        <div className="repd">
          <ReportDetail prepared={note.prepared} />
        </div>
      )}
    </div>
  );
}

function ReportDetail({ prepared }: { prepared: PreparedImport }) {
  const { report } = prepared;
  const changed = (Object.keys(editLabels) as ConvertEditKind[]).filter((kind) => report.counts[kind] > 0);
  const needs = needsYou(report);
  const fromNote: string[] = [];
  if (prepared.category) fromNote.push(`Category ${categoryLabels[prepared.category]}, from formato`);
  if (prepared.campaignId) fromNote.push('Campaign recognised from campagna');
  if (prepared.system) fromNote.push(`sistema: ${prepared.system}`);
  return (
    <>
      <h6>Changed</h6>
      {changed.length ? (
        <ul>
          {changed.map((kind) => (
            <li key={kind}>
              {editLabels[kind]} ({report.counts[kind]})
            </li>
          ))}
        </ul>
      ) : (
        <ul>
          <li>Nothing: the note already follows the format.</li>
        </ul>
      )}
      {needs.length > 0 && (
        <>
          <h6>Needs you</h6>
          <ul>
            {needs.map((message, i) => (
              <li key={i} className="n">
                {message}
              </li>
            ))}
          </ul>
        </>
      )}
      {prepared.imageRefs.length > 0 && (
        <>
          <h6>Not imported</h6>
          <ul>
            <li className="n">
              {plural(prepared.imageRefs.length, 'image')} not imported: the references stay in the text, assets come in
              a later version.
            </li>
          </ul>
        </>
      )}
      {fromNote.length > 0 && (
        <>
          <h6>From the note</h6>
          <ul>
            {fromNote.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function CategorySelect({
  value,
  onChange,
  id,
  label,
}: {
  value: Category | '';
  onChange(value: Category | ''): void;
  id?: string;
  label?: string;
}) {
  return (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Category | '')}>
      <option value="">Choose…</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {categoryLabels[c]}
        </option>
      ))}
    </select>
  );
}

function CampaignSelect({
  value,
  onChange,
  campaigns,
  disabled,
  id,
  label,
}: {
  value: string;
  onChange(value: string): void;
  campaigns: readonly ProjectRow[];
  disabled: boolean;
  id?: string;
  label?: string;
}) {
  return (
    <select id={id} aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">Stand-alone</option>
      {campaigns.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </select>
  );
}

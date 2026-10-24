import { strToU8 } from 'fflate';
import type { Template } from 'promptbook-format';
import type * as Y from 'yjs';
import { readDocumentBoard, type FileEntry, type ImageCategory, type PromptRow } from './board.js';
import { migratedView } from './board-migration.js';
import { readMeta } from './doc.js';
import { LIMITS } from './model.js';
import { sha256Hex } from './sha256.js';

// The CueBard pack (cuebard-export design decisions 4 to 12): the project
// file CueBard opens at schemaVersion 5 and the list of the media to put
// beside it, planned from the board alone. The server and the desktop's main
// process stream the bytes; nothing here reads a file or writes the document.

export const CUEBARD_FOLDERS = {
  scene: 'Scenes',
  pc: 'PCs',
  npc: 'NPCs',
  handout: 'Handouts',
} as const satisfies Record<ImageCategory, string>;

const CATEGORIES = ['scene', 'pc', 'npc', 'handout'] as const satisfies readonly ImageCategory[];

export interface CuebardEntry {
  // In the zip: media/<name> or media/visuals/<uuid>_<name>.
  path: string;
  // The bytes in the file store.
  sha256: string;
  fileId: string;
  kind: 'audio' | 'image';
  // FileEntry.size; the callers check the real size (D13).
  size: number;
}

export type CuebardWarning =
  // label «S1. Title».
  | { kind: 'no-track'; sceneId: string; label: string }
  | { kind: 'no-image'; category: ImageCategory; label: string; number: number | null; name: string | null }
  | { kind: 'no-duration'; sceneId: string; label: string; fileId: string; fileName: string }
  // The bytes are not available (D14, D15).
  | { kind: 'missing'; fileId: string; fileName: string; label: string };

export interface CuebardSummary {
  // Cue groups: the scenes.
  groups: number;
  // Tracks in the project file.
  tracks: number;
  // Images per visual folder.
  images: Record<ImageCategory, number>;
  // The sum of the entries' sizes.
  bytes: number;
  // Nothing picked, no track and no image: nothing to export.
  empty: boolean;
  // In board order: the scenes, each its images then its music, then the
  // PCs, the NPCs and the handouts.
  warnings: CuebardWarning[];
}

export interface CuebardOptions {
  // ISO date-time for createdAt and lastModified.
  now: string;
  // File id → seconds read from the file (D10).
  durations?: ReadonlyMap<string, number>;
  // File ids whose bytes are not available.
  missing?: ReadonlySet<string>;
  // The account's own templates, among which the project's is resolved.
  templates?: readonly Template[];
}

export interface CuebardPack {
  // «<name>.cbpack».
  fileName: string;
  // «<name>.cuebard», the project as two-space JSON with a final newline.
  projectFile: { path: string; json: string };
  // The media, in project-file order.
  entries: CuebardEntry[];
  summary: CuebardSummary;
}

// Ids (D11): the first 32 hex digits of a SHA-256, laid out as a version 4
// UUID, so that the same board gives the same pack.
export function cuebardUuid(projectId: string, kind: 'group' | 'track' | 'visual', key: string): string {
  const hex = sha256Hex(strToU8(`promptbook/cuebard/${projectId}/${kind}/${key}`)).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Names (D12). CueBard loads media from unencoded file:/// URLs, so `#`, `%`
// and `?` go as well as what file systems refuse.
const UNSAFE = /[/\\:*?"<>|#%\u0000-\u001f\u007f-\u009f]/g;
const EXTENSION = /\.[A-Za-z0-9]{1,10}$/;
const STEM_MAX = 100;
// Bytes: a visual's name, with its uuid and extension, stays under the 255
// that file systems allow.
const STEM_BYTES = 150;
// Names Windows keeps for devices, whatever their extension.
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i;

const PLAYS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];
const SHOWS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const BY_MIME: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/flac': '.flac',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const dropTrailing = (name: string) => name.trim().replace(/[. ]+$/, '');

// At most `max` characters: a text from the document can be of any length.
const clip = (text: string, max: number) => (text.length <= max ? text : Array.from(text).slice(0, max).join(''));

const utf8Length = (text: string) => strToU8(text).length;

// The key two names share when a file system without case would take them
// as one.
const fold = (name: string) => name.normalize('NFKC').toUpperCase().toLowerCase();

const splitExtension = (name: string): [string, string] => {
  const ext = EXTENSION.exec(name)?.[0] ?? '';
  return ext !== '' && ext.length < name.length ? [name.slice(0, -ext.length), ext] : [name, ''];
};

// NFC, the unsafe characters as "-", trimmed, no leading or trailing dots,
// no trailing spaces, at most 100 characters and 150 bytes before the
// extension, "_" before a name Windows keeps for a device; the fallback for
// what is left empty.
function cuebardSafe(name: string, fallback: string): string {
  const clean = dropTrailing(clip(name, 4 * LIMITS.fileName).normalize('NFC').replace(UNSAFE, '-')).replace(/^[. ]+/, '');
  const [stem, ext] = splitExtension(clean);
  const chars = Array.from(stem).slice(0, STEM_MAX);
  while (utf8Length(chars.join('')) > STEM_BYTES) chars.pop();
  const cut = dropTrailing(chars.join(''));
  const safe = cut === '' ? `${fallback}${ext}` : `${cut}${ext}`;
  return RESERVED.test(safe) ? `_${safe}` : safe;
}

// The extension of the file's type, when its own is not one CueBard plays or
// shows for its kind.
function withExtension(name: string, file: FileEntry): string {
  const ext = splitExtension(name)[1].toLowerCase();
  if ((file.kind === 'audio' ? PLAYS : SHOWS).includes(ext)) return name;
  return `${name}${BY_MIME[file.mime] ?? ''}`;
}

// " (2)", " (3)"… before the extension until the name is free, compared
// without case.
function freeName(name: string, taken: Set<string>): string {
  const [stem, ext] = splitExtension(name);
  let candidate = name;
  for (let n = 2; taken.has(fold(candidate)); n++) candidate = `${stem} (${n})${ext}`;
  taken.add(fold(candidate));
  return candidate;
}

export const cuebardFileName = (title: string): string => `${cuebardSafe(title, 'Untitled')}.cbpack`;

// Labels and display names are clipped: the document's texts have no
// length a reader can count on.
const sceneLabel = (sceneId: string, title: string) => {
  const text = clip(title.trim(), LIMITS.name);
  return text === '' ? clip(sceneId, LIMITS.name) : `${clip(sceneId, LIMITS.name)}. ${text}`;
};
const promptName = (row: PromptRow) => clip(row.prompt.name?.trim() ?? '', LIMITS.name) || 'Untitled';
const fileLabel = (file: FileEntry) => clip(file.name, LIMITS.fileName);
const NAMED_LABEL = { pc: 'PC', npc: 'NPC', handout: 'Handout' } as const;

// What D1 picks: per prompt its chosen image, else all of them, oldest
// first; per scene its chosen track, else all of them.
const picked = (files: readonly FileEntry[], chosen: string | null) =>
  chosen === null ? files : files.filter((f) => f.id === chosen);

interface PlannedTrack {
  file: FileEntry;
  uuid: string;
  name: string;
  displayName: string;
}

interface PlannedVisual {
  file: FileEntry;
  category: ImageCategory;
  uuid: string;
  mediaFileName: string;
  displayName: string;
  prompt: PromptRow;
  // For a missing warning.
  label: string;
}

interface PlannedScene {
  sceneId: string;
  label: string;
  uuid: string;
  tracks: PlannedTrack[];
  prompts: PromptRow[];
  visuals: PlannedVisual[];
}

interface Plan {
  title: string;
  scenes: PlannedScene[];
  named: { category: Exclude<ImageCategory, 'scene'>; prompts: PromptRow[]; visuals: PlannedVisual[] }[];
}

// Names and ids over everything D1 picks, before anything is left out, so
// that a length or a missing file only removes items and never renames the
// others (D4's invariant). A file id met twice, which only a broken client
// writes, keeps its first place.
function plan(doc: Y.Doc, templates: readonly Template[] = []): Plan {
  const view = migratedView(doc);
  const meta = readMeta(view);
  const board = readDocumentBoard(view, templates);
  const seen = new Set<string>();
  const once = (files: readonly FileEntry[]) =>
    files.filter((f) => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  // "visuals" would meet the media/visuals/ folder.
  const trackNames = new Set<string>([fold('visuals')]);
  const visual = (
    { file, prompt }: { file: FileEntry; prompt: PromptRow },
    category: ImageCategory,
    displayName: string,
    label: string,
  ): PlannedVisual => {
    const uuid = cuebardUuid(meta.id, 'visual', file.id);
    const mediaFileName = `${uuid}_${withExtension(cuebardSafe(file.name, 'image'), file)}`;
    return { file, category, uuid, mediaFileName, displayName, prompt, label };
  };

  const scenes = board.rows.map((row): PlannedScene => {
    const label = sceneLabel(row.sceneId, row.title);
    const images = row.prompts.flatMap((prompt) => once(picked(prompt.images, prompt.chosen)).map((file) => ({ file, prompt })));
    const visuals = images.map((image, i) => visual(image, 'scene', i === 0 ? label : `${label} · ${i + 1}`, label));
    const music = clip(row.music?.title.trim() ?? '', LIMITS.trackTitle);
    const tracks = once(picked(row.tracks, row.chosenTrack)).map((file, i): PlannedTrack => {
      const name = freeName(withExtension(cuebardSafe(file.name, 'track'), file), trackNames);
      const own = splitExtension(fileLabel(file).trim())[0].trim() || splitExtension(name)[0];
      return {
        file,
        uuid: cuebardUuid(meta.id, 'track', file.id),
        name,
        displayName: music === '' ? own : i === 0 ? music : `${music} (${i + 1})`,
      };
    });
    return {
      sceneId: row.sceneId,
      label,
      uuid: cuebardUuid(meta.id, 'group', row.sceneId),
      tracks,
      prompts: row.prompts,
      visuals,
    };
  });

  const named = (['pc', 'npc', 'handout'] as const).map((category) => ({
    category,
    prompts: board.named[category],
    visuals: board.named[category].flatMap((prompt) => {
      const name = promptName(prompt);
      return once(picked(prompt.images, prompt.chosen)).map((file, i) =>
        visual({ file, prompt }, category, i === 0 ? name : `${name} (${i + 1})`, `${NAMED_LABEL[category]} "${name}"`),
      );
    }),
  }));

  const uuids = new Set<string>();
  for (const id of [
    ...scenes.flatMap((s) => [s.uuid, ...s.tracks.map((t) => t.uuid), ...s.visuals.map((v) => v.uuid)]),
    ...named.flatMap((n) => n.visuals.map((v) => v.uuid)),
  ]) {
    if (uuids.has(id)) throw new Error(`CueBard id ${id} given twice`);
    uuids.add(id);
  }
  return { title: meta.title, scenes, named };
}

// Every file D1 picks, in project-file order: each scene's tracks, then the
// images of the scenes, the PCs, the NPCs and the handouts.
export function cuebardFiles(doc: Y.Doc, templates: readonly Template[] = []): FileEntry[] {
  const { scenes, named } = plan(doc, templates);
  return [
    ...scenes.flatMap((s) => s.tracks.map((t) => t.file)),
    ...scenes.flatMap((s) => s.visuals.map((v) => v.file)),
    ...named.flatMap((n) => n.visuals.map((v) => v.file)),
  ];
}

const hasLength = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

// The tracks D1 picks whose length the board did not record (D10).
export const needsDuration = (doc: Y.Doc, templates: readonly Template[] = []): FileEntry[] =>
  cuebardFiles(doc, templates).filter((f) => f.kind === 'audio' && !hasLength(f.duration));

export function cuebardPack(doc: Y.Doc, opts: CuebardOptions): CuebardPack {
  const { title, scenes, named } = plan(doc, opts.templates);
  const missing = opts.missing ?? new Set<string>();
  const warnings: CuebardWarning[] = [];
  const entries: CuebardEntry[] = [];
  const images: Record<ImageCategory, number> = { scene: 0, pc: 0, npc: 0, handout: 0 };
  const visualMedia: Record<string, unknown>[] = [];
  let tracks = 0;
  let picks = 0;

  // Prompt by prompt: a warning for one with no image, one for each missing
  // image; the images kept.
  const kept = (category: ImageCategory, prompts: PromptRow[], visuals: PlannedVisual[], label: (row: PromptRow) => string) =>
    prompts.flatMap((row) => {
      if (row.images.length === 0) {
        const scene = category === 'scene';
        warnings.push({
          kind: 'no-image',
          category,
          label: label(row),
          number: scene ? row.number : null,
          name: scene ? null : promptName(row),
        });
      }
      return visuals.filter((v) => {
        if (v.prompt !== row) return false;
        picks++;
        if (!missing.has(v.file.id)) return true;
        warnings.push({ kind: 'missing', fileId: v.file.id, fileName: fileLabel(v.file), label: v.label });
        return false;
      });
    });

  const groupsAndVisuals = scenes.map((scene, g) => {
    const visuals = kept('scene', scene.prompts, scene.visuals, () => scene.label);
    if (scene.tracks.length === 0) warnings.push({ kind: 'no-track', sceneId: scene.sceneId, label: scene.label });
    const exported = scene.tracks.flatMap((track) => {
      picks++;
      const { file } = track;
      if (missing.has(file.id)) {
        warnings.push({ kind: 'missing', fileId: file.id, fileName: fileLabel(file), label: scene.label });
        return [];
      }
      const duration = hasLength(file.duration) ? file.duration : opts.durations?.get(file.id);
      if (!hasLength(duration)) {
        warnings.push({ kind: 'no-duration', sceneId: scene.sceneId, label: scene.label, fileId: file.id, fileName: fileLabel(file) });
        return [];
      }
      return [{ track, duration }];
    });
    const children = exported.map(({ track, duration }, c) => {
      entries.push({ path: `media/${track.name}`, sha256: track.file.sha256, fileId: track.file.id, kind: 'audio', size: track.file.size });
      tracks++;
      return {
        uuid: track.uuid,
        index: [g, c],
        displayName: track.displayName,
        color: '#6b7280',
        type: 'audio',
        mediaFileName: track.name,
        mediaPath: `media/${track.name}`,
        waveformPath: `${track.uuid}.json`,
        inPoint: 0,
        outPoint: duration,
        duration,
        volume: 1,
        endBehavior: { action: 'loop' },
        startBehavior: { action: 'nothing' },
        duckingBehavior: { mode: 'stop-all', duckFadeIn: 0.25, duckFadeOut: 1 },
        customActions: [],
        fadeOutDuration: 1,
        playFade: 0,
        stopFade: 0,
        crossFade: 0,
      };
    });
    const group = {
      uuid: scene.uuid,
      index: [g],
      displayName: scene.label,
      color: '#3300FF',
      type: 'group',
      children,
      isExpanded: true,
      startBehavior: { action: 'play-first' },
      endBehavior: { action: 'nothing' },
    };
    return { group, visuals, link: children[0]?.uuid };
  });

  const addVisual = (v: PlannedVisual, link: string | undefined) => {
    entries.push({
      path: `media/visuals/${v.mediaFileName}`,
      sha256: v.file.sha256,
      fileId: v.file.id,
      kind: 'image',
      size: v.file.size,
    });
    images[v.category]++;
    visualMedia.push({
      uuid: v.uuid,
      displayName: v.displayName,
      mediaFileName: v.mediaFileName,
      mediaPath: `media/visuals/${v.mediaFileName}`,
      mediaType: 'image',
      folder: CUEBARD_FOLDERS[v.category],
      ...(link !== undefined ? { linkedCueUuid: link } : {}),
      linkDelay: 0,
      fadeIn: 0,
      fadeOut: 0,
    });
  };
  for (const { visuals, link } of groupsAndVisuals) for (const v of visuals) addVisual(v, link);
  for (const { category, prompts, visuals } of named) {
    const label = (row: PromptRow) => `${NAMED_LABEL[category]} "${promptName(row)}"`;
    for (const v of kept(category, prompts, visuals, label)) addVisual(v, undefined);
  }

  const fileName = cuebardFileName(title);
  const project = {
    name: title.trim() === '' ? 'Untitled' : clip(title, LIMITS.name),
    version: '1.0.0',
    schemaVersion: 5,
    folderPath: '',
    items: groupsAndVisuals.map((g) => g.group),
    cartItems: [],
    cartOnlyItems: [],
    visualMedia,
    visualFolders: CATEGORIES.filter((c) => images[c] > 0).map((c) => CUEBARD_FOLDERS[c]),
    visualDisplayEnabled: true,
    theme: { mode: 'cobalt', accentColor: '' },
    createdAt: opts.now,
    lastModified: opts.now,
  };
  return {
    fileName,
    projectFile: { path: `${fileName.slice(0, -'.cbpack'.length)}.cuebard`, json: `${JSON.stringify(project, null, 2)}\n` },
    entries,
    summary: {
      groups: scenes.length,
      tracks,
      images,
      bytes: entries.reduce((sum, e) => sum + e.size, 0),
      empty: picks === 0,
      warnings,
    },
  };
}

// left-out.txt (D5): one line per track or image left out for its length or
// its bytes, null when nothing was.
export function cuebardLeftOut(pack: CuebardPack, missingReason: string): string | null {
  const lines = pack.summary.warnings.flatMap((w) =>
    w.kind === 'no-duration'
      ? [`${w.label}: ${w.fileName} (length unknown)`]
      : w.kind === 'missing'
        ? [`${w.label}: ${w.fileName} (${missingReason})`]
        : [],
  );
  return lines.length === 0 ? null : `${lines.join('\n')}\n`;
}

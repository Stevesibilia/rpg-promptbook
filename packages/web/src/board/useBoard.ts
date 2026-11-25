import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppendixRow, Model } from 'promptbook-format';
import {
  adventureTemplateOf,
  boardRows,
  generalMusic,
  matchFile,
  matchTargets,
  migrateImagePrompts,
  namedPrompts,
  needsImageMigration,
  readBoard,
  readFiles,
  readImagePrompts,
  readMeta,
  readMusicPrompts,
  unmatchedFiles,
  type BoardEntry,
  type BoardRow,
  type FileEntry,
  type ImagePromptEntry,
  type MusicCardRow,
  type MusicPromptEntry,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { connectWorker, createAnalysisClient, type Connect } from '../editor/analysis/client.js';
import { useTemplates } from '../templates/TemplatesContext.js';
import { shownPrompts, type Named, type ShownPrompt } from './summary.js';

// The board's data (asset-board design decision 2, image-categories design
// decisions 7 and 9): the appendix parsed by the editor's worker with the
// project's template, never on the main thread, joined to the image prompts and files of the Yjs
// document, which are read again on every change. A campaign is never parsed
// (campaign-board design decision 2): its appendix is empty from the first
// render, as readDocumentBoard reads it.

export interface Parsed {
  // The text the model was parsed from.
  text: string;
  model: Model;
}

export interface TrayFile {
  file: FileEntry;
  reason: string;
  // The shown prompts an image's name matches, when two or more do; derived
  // as the tray is drawn, never stored (design decision 3).
  candidates: string[];
}

export interface Board {
  // Null until the first parse is in.
  parsed: Parsed | null;
  // One per scene of the appendix, with its image prompts.
  rows: BoardRow[];
  // The General images, the PCs, the NPCs and the handouts.
  named: Named;
  // The General music prompts, in order.
  music: MusicCardRow[];
  // Every prompt shown, by id, for labels and menus.
  shown: Map<string, ShownPrompt>;
  tray: TrayFile[];
  files: FileEntry[];
  // Parse now; the promise gives the newest parse, whose text the caller
  // compares with the document's before using its positions.
  parseNow(): Promise<Parsed>;
}

const textOf = (doc: Y.Doc) => doc.getText('document');

// What a campaign's board reads instead of a parse: no scenes, no appendix.
const NOTHING_PARSED: Model = {
  template: '',
  meta: { range: null, values: {}, entries: [], licence: null },
  sections: [],
  scenes: [],
  sheets: [],
  pregenerated: null,
  revelations: [],
  revelationsLabel: null,
  clues: [],
  reminders: [],
  sceneMap: [],
  tracker: [],
  npcs: [],
  appendix: [],
  unplaced: [],
};
const unparsed = (doc: Y.Doc): Parsed => ({ text: textOf(doc).toString(), model: NOTHING_PARSED });

interface Read {
  files: FileEntry[];
  board: Map<string, BoardEntry>;
  prompts: ImagePromptEntry[];
  music: MusicPromptEntry[];
}

function useFilesAndBoard(doc: Y.Doc): Read {
  const read = (): Read => ({
    files: readFiles(doc),
    board: readBoard(doc),
    prompts: readImagePrompts(doc),
    music: readMusicPrompts(doc),
  });
  const [value, setValue] = useState(read);
  useEffect(() => {
    const files = doc.getArray('files');
    const board = doc.getMap('board');
    const prompts = doc.getMap('imagePrompts');
    const music = doc.getMap('musicPrompts');
    const update = () => setValue(read());
    update();
    files.observeDeep(update);
    board.observe(update);
    prompts.observe(update);
    music.observe(update);
    return () => {
      files.unobserveDeep(update);
      board.unobserve(update);
      prompts.unobserve(update);
      music.unobserve(update);
    };
  }, [doc]);
  return value;
}

// An older client (v0.6) may write a legacy key or a scene's image during a
// live session: the board migrates it as soon as it sees it (design
// decision 2), outside the observer that read it. Safe on every replica.
function useMigration(doc: Y.Doc, read: Read): void {
  useEffect(() => {
    try {
      if (needsImageMigration(doc)) migrateImagePrompts(doc);
    } catch {
      // A document the migration cannot read is shown as it is.
    }
  }, [doc, read.files, read.board]);
}

// The Unmatched tray: each file with its reason and, for an image whose name
// matches several shown prompts, those prompts. A file left unmatched at
// intake gets the reason matchFile gives now; '' when its name would match
// since (a prompt written after the drop).
export function trayFiles(
  appendix: readonly AppendixRow[],
  rows: readonly BoardRow[],
  named: Named,
  prompts: readonly ImagePromptEntry[],
  files: readonly FileEntry[],
  // The General music prompts as cards.
  music: readonly MusicCardRow[] = [],
): TrayFile[] {
  const targets = matchTargets({ rows, named, music });
  return unmatchedFiles(
    appendix,
    prompts,
    files,
    music.map((m) => m.prompt),
  ).map(({ file, reason }): TrayFile => {
    if (reason !== null) return { file, reason, candidates: [] };
    const match = matchFile(file.name, file.kind, targets);
    return 'reason' in match
      ? { file, reason: match.reason, candidates: match.candidates }
      : { file, reason: '', candidates: [] };
  });
}

export function useBoard(doc: Y.Doc, campaign: boolean, connect: Connect = connectWorker): Board {
  const [parsedHere, setParsed] = useState<Parsed | null>(null);
  const campaignParsed = useMemo(() => (campaign ? unparsed(doc) : null), [doc, campaign]);
  const parsed = campaignParsed ?? parsedHere;
  const read = useFilesAndBoard(doc);
  useMigration(doc, read);
  const { files, board, prompts, music: musicPrompts } = read;
  // Callers of parseNow waiting for the text they asked for.
  const waiting = useRef<{ resolve(p: Parsed): void }[]>([]);
  const client = useRef<ReturnType<typeof createAnalysisClient<string>> | null>(null);
  // The account's templates, read at each parse; a new list parses again.
  const { templates } = useTemplates();
  const extra = useRef(templates);
  extra.current = templates;
  useEffect(() => {
    client.current?.changed();
  }, [templates]);

  useEffect(() => {
    if (campaign) return;
    const text = textOf(doc);
    const analysis = createAnalysisClient<string>({
      connect,
      read: () => {
        const current = text.toString();
        return { text: current, template: adventureTemplateOf(readMeta(doc), extra.current), tag: current };
      },
      apply: (tag, result) => {
        const next = { text: tag, model: result.model };
        setParsed(next);
        // The newest parse answers every caller, who compares its text.
        const ready = waiting.current;
        waiting.current = [];
        for (const w of ready) w.resolve(next);
      },
    });
    client.current = analysis;
    const changed = () => analysis.changed();
    text.observe(changed);
    analysis.flush();
    return () => {
      text.unobserve(changed);
      analysis.dispose();
      client.current = null;
      waiting.current = [];
    };
  }, [doc, connect, campaign]);

  const rows = useMemo(
    () => (parsed ? boardRows(parsed.model.appendix, board, prompts, files, musicPrompts) : []),
    [parsed, board, prompts, files, musicPrompts],
  );
  const named = useMemo(() => namedPrompts(prompts, files), [prompts, files]);
  const music = useMemo(() => generalMusic(musicPrompts, files, rows), [musicPrompts, files, rows]);
  const shown = useMemo(() => shownPrompts(rows, named), [rows, named]);
  const tray = useMemo(
    () => (parsed ? trayFiles(parsed.model.appendix, rows, named, prompts, files, music) : []),
    [parsed, prompts, files, rows, named, music],
  );

  const parseNow = () =>
    new Promise<Parsed>((resolve) => {
      if (campaign) return resolve(unparsed(doc));
      const current = textOf(doc).toString();
      if (parsed && parsed.text === current) return resolve(parsed);
      waiting.current.push({ resolve });
      client.current?.flush();
    });

  return { parsed, rows, named, music, shown, tray, files, parseNow };
}

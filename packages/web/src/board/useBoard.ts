import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppendixRow, Model } from 'promptbook-format';
import {
  adventureTemplateOf,
  boardRows,
  matchFile,
  matchTargets,
  migrateImagePrompts,
  namedPrompts,
  needsImageMigration,
  readBoard,
  readFiles,
  readImagePrompts,
  readMeta,
  unmatchedFiles,
  type BoardEntry,
  type BoardRow,
  type FileEntry,
  type ImagePromptEntry,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { connectWorker, createAnalysisClient, type Connect } from '../editor/analysis/client.js';
import { shownPrompts, type Named, type ShownPrompt } from './summary.js';

// The board's data (asset-board design decision 2, image-categories design
// decisions 7 and 9): the appendix parsed by the editor's worker with the
// project's template, never on the main thread, joined to the image prompts and files of the Yjs
// document, which are read again on every change.

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
  // The PCs, the NPCs and the handouts.
  named: Named;
  // Every prompt shown, by id, for labels and menus.
  shown: Map<string, ShownPrompt>;
  tray: TrayFile[];
  files: FileEntry[];
  // Parse now; the promise gives the newest parse, whose text the caller
  // compares with the document's before using its positions.
  parseNow(): Promise<Parsed>;
}

const textOf = (doc: Y.Doc) => doc.getText('document');

interface Read {
  files: FileEntry[];
  board: Map<string, BoardEntry>;
  prompts: ImagePromptEntry[];
}

function useFilesAndBoard(doc: Y.Doc): Read {
  const read = (): Read => ({ files: readFiles(doc), board: readBoard(doc), prompts: readImagePrompts(doc) });
  const [value, setValue] = useState(read);
  useEffect(() => {
    const files = doc.getArray('files');
    const board = doc.getMap('board');
    const prompts = doc.getMap('imagePrompts');
    const update = () => setValue(read());
    update();
    files.observeDeep(update);
    board.observe(update);
    prompts.observe(update);
    return () => {
      files.unobserveDeep(update);
      board.unobserve(update);
      prompts.unobserve(update);
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
): TrayFile[] {
  const targets = matchTargets({ rows, named });
  return unmatchedFiles(appendix, prompts, files).map(({ file, reason }): TrayFile => {
    if (reason !== null) return { file, reason, candidates: [] };
    const match = matchFile(file.name, file.kind, targets);
    return 'reason' in match
      ? { file, reason: match.reason, candidates: match.candidates }
      : { file, reason: '', candidates: [] };
  });
}

export function useBoard(doc: Y.Doc, connect: Connect = connectWorker): Board {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const read = useFilesAndBoard(doc);
  useMigration(doc, read);
  const { files, board, prompts } = read;
  // Callers of parseNow waiting for the text they asked for.
  const waiting = useRef<{ resolve(p: Parsed): void }[]>([]);
  const client = useRef<ReturnType<typeof createAnalysisClient<string>> | null>(null);

  useEffect(() => {
    const text = textOf(doc);
    const analysis = createAnalysisClient<string>({
      connect,
      read: () => {
        const current = text.toString();
        return { text: current, template: adventureTemplateOf(readMeta(doc)), tag: current };
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
  }, [doc, connect]);

  const rows = useMemo(
    () => (parsed ? boardRows(parsed.model.appendix, board, prompts, files) : []),
    [parsed, board, prompts, files],
  );
  const named = useMemo(() => namedPrompts(prompts, files), [prompts, files]);
  const shown = useMemo(() => shownPrompts(rows, named), [rows, named]);
  const tray = useMemo(
    () => (parsed ? trayFiles(parsed.model.appendix, rows, named, prompts, files) : []),
    [parsed, prompts, files, rows, named],
  );

  const parseNow = () =>
    new Promise<Parsed>((resolve) => {
      const current = textOf(doc).toString();
      if (parsed && parsed.text === current) return resolve(parsed);
      waiting.current.push({ resolve });
      client.current?.flush();
    });

  return { parsed, rows, named, shown, tray, files, parseNow };
}

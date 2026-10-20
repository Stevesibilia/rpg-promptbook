import { useEffect, useMemo, useRef, useState } from 'react';
import type { Model } from 'promptbook-format';
import {
  boardRows,
  matchFile,
  matchTargets,
  namedPrompts,
  readBoard,
  readFiles,
  readImagePrompts,
  unmatchedFiles,
  type Author,
  type BoardEntry,
  type BoardRow as SceneBoardRow,
  type FileEntry,
  type HalfStatus,
  type ImagePromptEntry,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { connectWorker, createAnalysisClient, type Connect } from '../editor/analysis/client.js';

// The board's data (asset-board design decision 2): the appendix parsed by
// the editor's worker, never on the main thread, joined to the prompts and
// files of the Yjs document, which are read again on every change.

export interface Parsed {
  // The text the model was parsed from.
  text: string;
  model: Model;
}

// Until the board shows image categories (image-categories brief B), a scene
// shows its first image prompt as it showed its one prompt before.
export interface BoardRow extends SceneBoardRow {
  // The first prompt's id; null when the scene has none.
  promptId: string | null;
  image: { prompt: string; by: Author; at: string } | null;
  images: FileEntry[];
  chosenImage: string | null;
  imageStatus: HalfStatus;
}

export function withFirstPrompt(row: SceneBoardRow): BoardRow {
  const first = row.prompts[0];
  const text = first && first.prompt.prompt !== '' ? first.prompt : null;
  return {
    ...row,
    promptId: first?.prompt.id ?? null,
    image: text ? { prompt: text.prompt, by: text.by, at: text.at } : null,
    images: first?.images ?? [],
    chosenImage: first?.chosen ?? null,
    imageStatus: first?.status ?? 'wanted',
  };
}

export interface TrayFile {
  file: FileEntry;
  reason: string;
}

export interface Board {
  // Null until the first parse is in.
  parsed: Parsed | null;
  rows: BoardRow[];
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

// Why a file left unmatched at intake has no prompt or scene, as matchFile
// says now; '' when its name would match since (a prompt written after the
// drop).
function reasonOf(file: FileEntry, targets: ReturnType<typeof matchTargets>): string {
  const match = matchFile(file.name, file.kind, targets);
  return 'reason' in match ? match.reason : '';
}

export function useBoard(doc: Y.Doc, connect: Connect = connectWorker): Board {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const { files, board, prompts } = useFilesAndBoard(doc);
  // Callers of parseNow waiting for the text they asked for.
  const waiting = useRef<{ resolve(p: Parsed): void }[]>([]);
  const client = useRef<ReturnType<typeof createAnalysisClient<string>> | null>(null);

  useEffect(() => {
    const text = textOf(doc);
    const analysis = createAnalysisClient<string>({
      connect,
      read: () => {
        const current = text.toString();
        return { text: current, tag: current };
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

  const sceneRows = useMemo(
    () => (parsed ? boardRows(parsed.model.appendix, board, prompts, files) : []),
    [parsed, board, prompts, files],
  );
  const rows = useMemo(() => sceneRows.map(withFirstPrompt), [sceneRows]);
  const tray = useMemo(() => {
    if (!parsed) return [];
    const targets = matchTargets({ rows: sceneRows, named: namedPrompts(prompts, files) });
    return unmatchedFiles(parsed.model.appendix, prompts, files).map(({ file, reason }) => ({
      file,
      // Left unmatched at intake: the reason matchFile gives now.
      reason: reason ?? reasonOf(file, targets),
    }));
  }, [parsed, prompts, files, sceneRows]);

  const parseNow = () =>
    new Promise<Parsed>((resolve) => {
      const current = textOf(doc).toString();
      if (parsed && parsed.text === current) return resolve(parsed);
      waiting.current.push({ resolve });
      client.current?.flush();
    });

  return { parsed, rows, tray, files, parseNow };
}

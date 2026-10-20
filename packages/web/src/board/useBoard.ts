import { useEffect, useMemo, useRef, useState } from 'react';
import type { Model } from 'promptbook-format';
import {
  boardRows,
  matchFile,
  readBoard,
  readFiles,
  unmatchedFiles,
  type BoardEntry,
  type BoardRow,
  type FileEntry,
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

function useFilesAndBoard(doc: Y.Doc): { files: FileEntry[]; board: Map<string, BoardEntry> } {
  const read = () => ({ files: readFiles(doc), board: readBoard(doc) });
  const [value, setValue] = useState(read);
  useEffect(() => {
    const files = doc.getArray('files');
    const board = doc.getMap('board');
    const update = () => setValue({ files: readFiles(doc), board: readBoard(doc) });
    update();
    files.observeDeep(update);
    board.observe(update);
    return () => {
      files.unobserveDeep(update);
      board.unobserve(update);
    };
  }, [doc]);
  return value;
}

// Why a file left unmatched at intake has no scene, as matchFile says now; ''
// when its name would match since (a prompt written after the drop).
function reasonOf(file: FileEntry, rows: BoardRow[]): string {
  const match = matchFile(file.name, file.kind, rows);
  return 'reason' in match ? match.reason : '';
}

export function useBoard(doc: Y.Doc, connect: Connect = connectWorker): Board {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const { files, board } = useFilesAndBoard(doc);
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

  const rows = useMemo(() => (parsed ? boardRows(parsed.model.appendix, board, files) : []), [parsed, board, files]);
  const tray = useMemo(() => {
    if (!parsed) return [];
    return unmatchedFiles(parsed.model.appendix, files).map(({ file, reason }) => ({
      file,
      // Left unmatched at intake: the reason matchFile gives now.
      reason: reason ?? reasonOf(file, rows),
    }));
  }, [parsed, files, rows]);

  const parseNow = () =>
    new Promise<Parsed>((resolve) => {
      const current = textOf(doc).toString();
      if (parsed && parsed.text === current) return resolve(parsed);
      waiting.current.push({ resolve });
      client.current?.flush();
    });

  return { parsed, rows, tray, files, parseNow };
}

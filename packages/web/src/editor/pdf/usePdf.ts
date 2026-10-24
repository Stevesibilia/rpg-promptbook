import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { EditorView } from '@codemirror/view';
import type { AdventureTemplate } from 'promptbook-format';
import type { LayoutOptions, Position } from 'promptbook-layout';
import type { UpdateSource } from '../StatusBar.js';
import { connectPdfWorker, createPdfClient, type PdfClient, type PdfConnect, type PdfSnapshot } from './client.js';
import { OffsetTracker } from './offsets.js';

const none = () => () => {};
const nothing = () => null;

// The page's PDF client, created when a PDF is first opened and kept while
// the page is (design decision 9). It builds while `active`, from the
// editor's text, the options and the project's template as they are when a
// build is sent.
// `positions()` gives the shown build's positions with their offsets moved
// into the text as it is now.
export function usePdf({
  view,
  updates,
  active,
  options,
  title,
  template,
  connect = connectPdfWorker,
}: {
  view: EditorView | null;
  updates: UpdateSource;
  active: boolean;
  options: LayoutOptions;
  title: string;
  template: AdventureTemplate;
  connect?: PdfConnect;
}): { client: PdfClient | null; snapshot: PdfSnapshot | null; positions(): Position[] } {
  const source = useRef({ view, options, title, template });
  source.current = { view, options, title, template };

  // Never loaded before a PDF is opened; kept once it was.
  const [wanted, setWanted] = useState(false);
  if (active && !wanted) setWanted(true);

  const [client, setClient] = useState<PdfClient | null>(null);
  const tracker = useRef(new OffsetTracker());
  useEffect(() => {
    if (!wanted) return;
    // Versions start again with each client.
    tracker.current = new OffsetTracker();
    const created = createPdfClient({
      connect,
      read: (version) => {
        const doc = source.current.view?.state.doc;
        tracker.current.read(version, doc?.length ?? 0);
        return {
          text: doc?.toString() ?? '',
          options: source.current.options,
          project: { title: source.current.title },
          template: source.current.template,
        };
      },
    });
    setClient(created);
    return () => {
      created.dispose();
      setClient(null);
    };
  }, [wanted, connect]);

  useEffect(() => client?.setActive(active), [client, active]);

  useEffect(() => {
    if (!client) return;
    return updates((update) => {
      if (!update.docChanged) return;
      tracker.current.change(update.changes);
      client.changed();
    });
  }, [client, updates]);

  // New options, a new title or a new template build at once; the first run
  // is the client's own first build.
  const built = useRef<{
    client: PdfClient | null;
    options: LayoutOptions;
    title: string;
    template: AdventureTemplate;
  } | null>(null);
  useEffect(() => {
    const last = built.current;
    built.current = { client, options, title, template };
    if (!client || last?.client !== client) return;
    if (last.options === options && last.title === title && last.template === template) return;
    client.changed();
    client.flush();
  }, [client, options, title, template]);

  const snapshot = useSyncExternalStore(client?.subscribe ?? none, client?.get ?? nothing);
  const goodVersion = snapshot?.goodVersion ?? null;
  useEffect(() => {
    if (goodVersion !== null) tracker.current.shown(goodVersion);
  }, [goodVersion]);
  const positions = () => tracker.current.positions(goodVersion, snapshot?.good?.positions ?? []);
  return { client, snapshot, positions };
}

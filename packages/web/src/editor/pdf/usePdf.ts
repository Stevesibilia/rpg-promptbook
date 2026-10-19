import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { EditorView } from '@codemirror/view';
import type { LayoutOptions } from 'promptbook-layout';
import type { UpdateSource } from '../StatusBar.js';
import { connectPdfWorker, createPdfClient, type PdfClient, type PdfConnect, type PdfSnapshot } from './client.js';

const none = () => () => {};
const nothing = () => null;

// The page's PDF client, created when a PDF is first opened and kept while
// the page is (design decision 9). It builds while `active`, from the
// editor's text and the options as they are when a build is sent.
export function usePdf({
  view,
  updates,
  active,
  options,
  title,
  connect = connectPdfWorker,
}: {
  view: EditorView | null;
  updates: UpdateSource;
  active: boolean;
  options: LayoutOptions;
  title: string;
  connect?: PdfConnect;
}): { client: PdfClient | null; snapshot: PdfSnapshot | null } {
  const source = useRef({ view, options, title });
  source.current = { view, options, title };

  // Never loaded before a PDF is opened; kept once it was.
  const [wanted, setWanted] = useState(false);
  if (active && !wanted) setWanted(true);

  const [client, setClient] = useState<PdfClient | null>(null);
  useEffect(() => {
    if (!wanted) return;
    const created = createPdfClient({
      connect,
      read: () => ({
        text: source.current.view?.state.doc.toString() ?? '',
        options: source.current.options,
        project: { title: source.current.title },
      }),
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
      if (update.docChanged) client.changed();
    });
  }, [client, updates]);

  // New options or a new title build at once; the first run is the client's
  // own first build.
  const built = useRef<{ client: PdfClient | null; options: LayoutOptions; title: string } | null>(null);
  useEffect(() => {
    const last = built.current;
    built.current = { client, options, title };
    if (!client || last?.client !== client) return;
    if (last.options === options && last.title === title) return;
    client.changed();
    client.flush();
  }, [client, options, title]);

  const snapshot = useSyncExternalStore(client?.subscribe ?? none, client?.get ?? nothing);
  return { client, snapshot };
}

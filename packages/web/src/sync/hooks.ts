import { useEffect, useState, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import { registry, type DocStatus, type SyncSnapshot } from './registry.js';

export function useSync(): SyncSnapshot {
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot);
}

// A project's document for as long as the component shows it. Right after
// the id changes, and before the effect opens the new one, the previous
// project's document is not handed out under the new id.
export function useProjectDoc(id: string | null): { doc: Y.Doc | null; status: DocStatus } {
  const [open, setOpen] = useState<{ id: string; doc: Y.Doc } | null>(null);
  useSync();
  useEffect(() => {
    if (!id) return setOpen(null);
    const entry = registry.open(id);
    setOpen({ id, doc: entry.doc });
    return () => {
      setOpen(null);
      registry.release(id);
    };
  }, [id]);
  return { doc: open && open.id === id ? open.doc : null, status: id ? registry.docStatus(id) : 'loading' };
}

// A value read from a document, read again after every change to it. `read`
// must be a stable function.
export function useDocValue<T>(doc: Y.Doc, read: (doc: Y.Doc) => T): T {
  const [value, setValue] = useState(() => read(doc));
  useEffect(() => {
    const update = () => setValue(read(doc));
    update();
    doc.on('update', update);
    return () => doc.off('update', update);
  }, [doc, read]);
  return value;
}

import { useEffect, useState, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import { registry, type DocStatus, type SyncSnapshot } from './registry.js';

export function useSync(): SyncSnapshot {
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot);
}

// A project's document for as long as the component shows it.
export function useProjectDoc(id: string | null): { doc: Y.Doc | null; status: DocStatus } {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  useSync();
  useEffect(() => {
    if (!id) return setDoc(null);
    const entry = registry.open(id);
    setDoc(entry.doc);
    return () => {
      setDoc(null);
      registry.release(id);
    };
  }, [id]);
  return { doc, status: id ? registry.docStatus(id) : 'loading' };
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

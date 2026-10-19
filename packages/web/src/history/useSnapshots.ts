import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type SnapshotKind, type SnapshotRow } from '../api.js';
import { registry } from '../sync/registry.js';

export interface SnapshotList {
  snapshots: SnapshotRow[] | null;
  error: string | null;
  // Reads the list again; the answer of the latest read wins.
  refresh(): void;
}

// A project's snapshots, read on opening and again whenever the server says
// it made one (on this client, another, or for Claude). Answers that arrive
// out of order, or after the view closed, are dropped.
export function useSnapshots(projectId: string, query: { kind?: SnapshotKind; limit?: number } = {}): SnapshotList {
  const { kind, limit } = query;
  const [snapshots, setSnapshots] = useState<SnapshotRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const refresh = useCallback(() => {
    const ticket = ++latest.current;
    api
      .snapshots(projectId, { ...(kind ? { kind } : {}), ...(limit ? { limit } : {}) })
      .then(({ snapshots }) => {
        if (ticket !== latest.current) return;
        setSnapshots(snapshots);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ticket !== latest.current) return;
        setError(e instanceof ApiError ? e.message : 'The snapshots could not be read.');
      });
  }, [projectId, kind, limit]);

  useEffect(() => {
    refresh();
    const off = registry.onSnapshot((id) => {
      if (id === projectId) refresh();
    });
    return () => {
      off();
      // Whatever is still on its way is for a view that is gone.
      latest.current += 1;
    };
  }, [projectId, refresh]);

  return { snapshots, error, refresh };
}

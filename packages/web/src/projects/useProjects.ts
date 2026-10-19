import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type ProjectRow } from '../api.js';
import { registry } from '../sync/registry.js';

const POLL_MS = 10_000;

// The project list, from the summaries on the server. It is fetched again when
// the server says it stored an open project, and every 10 seconds while the
// page is visible (design decision 9).
export function useProjects({ bin = false } = {}) {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [binCount, setBinCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const [list, inBin] = await Promise.all([api.projects(bin), bin ? null : api.projects(true)]);
      if (mine !== generation.current) return;
      setProjects(list.projects);
      if (inBin) setBinCount(inBin.projects.length);
      setError('');
    } catch (e) {
      if (mine === generation.current) setError(e instanceof ApiError ? e.message : 'Loading the projects failed.');
    }
  }, [bin]);

  useEffect(() => {
    void refresh();
    const offStored = registry.onStored(() => void refresh());
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offStored();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { projects, binCount, error, refresh };
}

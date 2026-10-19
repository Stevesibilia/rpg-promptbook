import { useCallback, useState } from 'react';
import { defaultLayoutOptions, type LayoutOptions } from 'promptbook-layout';

// The print options, kept per project in this browser (design decision 6):
// paper and ink are the printer's business, not the adventure's.

export const pdfOptionsKey = (projectId: string): string => `promptbook.pdf.${projectId}`;

// What was stored, with anything missing or unknown at its default.
export function parsePdfOptions(stored: string | null): LayoutOptions {
  let value: Partial<Record<keyof LayoutOptions, unknown>> = {};
  try {
    const parsed: unknown = JSON.parse(stored ?? '{}');
    if (parsed && typeof parsed === 'object') value = parsed;
  } catch {
    // Not JSON: the defaults.
  }
  return {
    paper: value.paper === 'us-letter' ? 'us-letter' : 'a4',
    inkSaver: typeof value.inkSaver === 'boolean' ? value.inkSaver : defaultLayoutOptions.inkSaver,
    pregenerated: typeof value.pregenerated === 'boolean' ? value.pregenerated : defaultLayoutOptions.pregenerated,
    template: defaultLayoutOptions.template,
  };
}

export function usePdfOptions(projectId: string): [LayoutOptions, (change: Partial<LayoutOptions>) => void] {
  const [options, setOptions] = useState(() => {
    try {
      return parsePdfOptions(localStorage.getItem(pdfOptionsKey(projectId)));
    } catch {
      return parsePdfOptions(null);
    }
  });
  const set = useCallback(
    (change: Partial<LayoutOptions>) =>
      setOptions((current) => {
        const next = { ...current, ...change };
        try {
          localStorage.setItem(pdfOptionsKey(projectId), JSON.stringify(next));
        } catch {
          // Private windows may refuse; the options still hold for this page.
        }
        return next;
      }),
    [projectId],
  );
  return [options, set];
}

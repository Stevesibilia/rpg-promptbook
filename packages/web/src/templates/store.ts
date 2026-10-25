import type { Template } from 'promptbook-format';
import type { StoredTemplate, TemplateList } from '../api.js';

// The account's document templates as the pages read them (template-editor
// design decision 4): fetched once, and again after every save, duplicate or
// delete. Every reader of a project's document passes `templates` as the
// `extra` of templateOf, so a project on an own template is read with it.

export interface TemplatesState {
  // Every version of every template, as stored.
  stored: readonly StoredTemplate[];
  // Their bodies, for the readers.
  templates: readonly Template[];
  // The projects not in the bin per "<id>@<version>".
  usage: Readonly<Record<string, number>>;
  // False until the first answer: a reader should not call a pinned
  // template missing before then.
  loaded: boolean;
  error: string;
}

export interface TemplatesStore {
  state(): TemplatesState;
  subscribe(listener: () => void): () => void;
  // Fetches the list again; resolves once it is in.
  reload(): Promise<void>;
}

export const emptyTemplates: TemplatesState = { stored: [], templates: [], usage: {}, loaded: false, error: '' };

export function createTemplatesStore(
  fetch: () => Promise<TemplateList>,
  describe: (error: unknown) => string = () => 'The templates could not be read.',
): TemplatesStore {
  let state = emptyTemplates;
  const listeners = new Set<() => void>();
  const set = (next: TemplatesState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  // Only the newest request's answer is kept: a reload started after a save
  // must not be overwritten by an older one that answers later.
  let latest = 0;
  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async reload() {
      const request = ++latest;
      try {
        const list = await fetch();
        if (request !== latest) return;
        set({ stored: list.templates, templates: list.templates.map((t) => t.body), usage: list.usage, loaded: true, error: '' });
      } catch (error) {
        if (request !== latest) return;
        // What was read before stays: offline on the web, the readers keep
        // the templates they had.
        set({ ...state, loaded: true, error: describe(error) });
      }
    },
  };
}

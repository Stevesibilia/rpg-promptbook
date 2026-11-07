import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { AdventureTemplate, Template } from 'promptbook-format';
import { adventureTemplateOf, templateOf, type ProjectMeta } from 'promptbook-project';
import { api } from '../api.js';
import { createTemplatesStore, emptyTemplates, reloadOnReturn, type TemplatesState } from './store.js';

export interface TemplatesValue extends TemplatesState {
  reload(): Promise<void>;
  missing(ref: string): void;
}

const TemplatesContext = createContext<TemplatesValue | null>(null);

// The account's templates for the signed-in pages, fetched on mount: mounted
// once around the routes, so moving between pages does not read them again.
// Read again when the user comes back to the window, for versions saved
// elsewhere.
export function TemplatesProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createTemplatesStore(api.templates), []);
  useEffect(() => {
    void store.reload();
    return reloadOnReturn(() => void store.reload(), { win: window, doc: document });
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.state);
  const value = useMemo(() => ({ ...state, reload: store.reload, missing: store.missing }), [state, store]);
  return <TemplatesContext.Provider value={value}>{children}</TemplatesContext.Provider>;
}

const outside: TemplatesValue = { ...emptyTemplates, reload: async () => {}, missing: () => {} };

// Outside the provider (a page rendered on its own), no own templates: the
// readers fall back to the built-ins.
export function useTemplates(): TemplatesValue {
  return useContext(TemplatesContext) ?? outside;
}

// The template a project's document is read with (template-editor design
// decisions 4 and 13): its recorded one among the account's and the
// built-ins, else its kind's built-in, then `missing` once the list has been
// read. `template` is the adventure template the editor's analysis, preview
// and syntax use (the built-in adventure's for a campaign); `document` the
// project's own, a campaign's campaign template, which the PDF prints with
// (campaign-pdf design decision 10). Each the same object while its id and
// version stay: a version never changes, so a reload does not reconfigure the
// editor.
export function useProjectTemplate(meta: Pick<ProjectMeta, 'category' | 'template'>): {
  template: AdventureTemplate;
  document: Template;
  missing: boolean;
} {
  const { templates, loaded, missing: ask } = useTemplates();
  const { category } = meta;
  const { id, version } = meta.template;
  const resolved = adventureTemplateOf({ category, template: { id, version } }, templates);
  const resolvedDocument = templateOf({ category, template: { id, version } }, templates);
  const key = `${resolved.id}@${resolved.version}`;
  const documentKey = `${resolvedDocument.kind}:${resolvedDocument.id}@${resolvedDocument.version}`;
  // Kept by their keys alone: the keys say when they change.
  const template = useMemo(() => resolved, [key]);
  const document = useMemo(() => resolvedDocument, [documentKey]);
  const missing = loaded && (document.id !== id || document.version !== version);
  // Saved elsewhere since the list was read: read it again, once.
  useEffect(() => {
    if (missing) ask(`${id}@${version}`);
  }, [missing, ask, id, version]);
  return { template, document, missing };
}

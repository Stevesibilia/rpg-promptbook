import {
  defaultTemplateRef,
  defineTemplate,
  resolveTemplate,
  type Template,
  type TemplateInput,
  type TemplateRef,
} from 'promptbook-format';
import { templateKindOf, type Category, type Settings } from 'promptbook-project';
import type { Store } from './store.js';

// The account's document templates as this device last read them from the
// server (GET /api/templates, kept by the router), so the readers of a
// project's document resolve its template offline (template-editor design
// decision 5).

export const TEMPLATES_KEY = 'templates';

// What GET /api/templates answers while the device has never read it.
export const noTemplates = () => ({ templates: [], usage: {} });

const parsed = new WeakMap<object, { json: string; templates: Template[] }>();

// Every version the cache holds that still validates; none before the first
// read. Validated once per stored copy: two copies stored in the same
// millisecond are told apart by their text.
export function cachedTemplates(store: Pick<Store, 'getCache'>): Template[] {
  const cached = store.getCache(TEMPLATES_KEY);
  if (!cached) return [];
  const json = JSON.stringify(cached.value);
  const seen = parsed.get(store);
  if (seen && seen.json === json) return seen.templates;
  const list = (cached.value as { templates?: unknown } | null)?.templates;
  const templates = (Array.isArray(list) ? list : []).flatMap((stored) => {
    try {
      return [defineTemplate((stored as { body: unknown }).body as TemplateInput)];
    } catch {
      return [];
    }
  });
  parsed.set(store, { json, templates });
  return templates;
}

export class TemplateUnknownError extends Error {}

// The template a project made on this device starts from, as the server's
// createProject chooses it (design decision 6): the one asked for, among the
// cached and the built-ins and of the category's kind; else the kind's
// default from the settings at its latest cached version; else the built-in.
export function templateForNewProject(
  templates: readonly Template[],
  category: Category,
  settings: Partial<Pick<Settings, 'defaultTemplates'>>,
  ref?: TemplateRef,
): Template {
  const kind = templateKindOf(category);
  if (ref) {
    const found = resolveTemplate(ref, templates);
    if (found?.kind !== kind) {
      throw new TemplateUnknownError(`template: is not one of your ${kind} templates or a built-in.`);
    }
    return found;
  }
  const builtin = resolveTemplate(defaultTemplateRef(kind))!;
  // Settings cached from a server before templates could be chosen have no
  // defaults: the built-ins then.
  const id = settings.defaultTemplates?.[kind];
  const latest = templates
    .filter((t) => t.id === id && t.kind === kind)
    .reduce<Template | null>((best, t) => (best && best.version >= t.version ? best : t), null);
  return latest ?? builtin;
}

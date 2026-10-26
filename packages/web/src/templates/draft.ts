import {
  defineTemplate,
  isLocked,
  READ_KEYS,
  TemplateError,
  withPdf,
  type SectionPdfPatch,
  type AdventureTemplate,
  type CalloutDefinition,
  type MetaKeyDefinition,
  type SceneFieldDefinition,
  type SectionDefinition,
  type Template,
  type TemplateListItems,
  type TemplateListName,
} from 'promptbook-format';

// The template being edited (template-editor design decision 16): a copy of
// the saved version that every control changes, kept in the page's state
// only. It may be invalid while the user types (an empty heading, two equal
// names); `checkDraft` says so, and only a valid draft is previewed or saved.

export type ListName = TemplateListName;
export type ListItems = TemplateListItems;

// Locked rows (design decision 11) show a lock and cannot be removed; the
// server refuses a version that breaks them, so both read one definition.
export { isLocked, READ_KEYS };

// A change to a section's PDF options (template-pdf-layout design decision
// 1): the options that differ from their defaults, no `pdf` when none does,
// so turning an option back leaves the row as it was saved.
export function pdfAction(index: number, section: SectionDefinition, change: SectionPdfPatch): DraftAction {
  return { type: 'patch', list: 'sections', index, patch: { pdf: withPdf(section, change).pdf } };
}

// A locked key keeps its name: the code reads it by that name.
export const keyRenamable = (key: MetaKeyDefinition) => !isLocked('meta', key);

export type DraftAction =
  | { type: 'reset'; template: Template }
  | { type: 'name'; value: string }
  | { type: 'system'; value: string }
  | { type: 'move'; list: ListName; index: number; by: -1 | 1 }
  | { type: 'remove'; list: ListName; index: number }
  | { type: 'add'; list: ListName; name: string; uid: string }
  | { type: 'patch'; list: ListName; index: number; patch: Record<string, unknown> }
  | { type: 'limits'; patch: Partial<AdventureTemplate['limits']> }
  | { type: 'dashes'; on: boolean };

// The style warnings the dashes checkbox turns on and off.
export const DASHES: AdventureTemplate['style']['forbidden'] = [
  { text: '—', name: 'em dash' },
  { text: '–', name: 'en dash' },
];
export const warnsOnDashes = (t: AdventureTemplate) =>
  DASHES.every((d) => t.style.forbidden.some((f) => f.text === d.text));

const itemsOf = (t: Template, list: ListName): unknown[] | undefined =>
  list === 'sections' || list === 'meta'
    ? t[list]
    : t.kind === 'adventure'
      ? t[list]
      : undefined;

const withList = (t: Template, list: ListName, items: unknown[]): Template => ({ ...t, [list]: items }) as Template;

// A box's type from the name the user typed: lower case, no spaces.
export const boxType = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s|\]]+/g, '-');

function newItem(t: Template, list: ListName, name: string, uid: string): unknown {
  const text = name.trim();
  switch (list) {
    case 'sections':
      return { name: text, requirement: 'optional', uid } satisfies SectionDefinition;
    case 'sceneFields':
      return { label: text, form: 'inline', requirement: 'optional', climax: false, uid } satisfies SceneFieldDefinition;
    case 'callouts':
      return {
        type: boxType(text),
        role: 'box',
        column: 'main',
        label: text.charAt(0).toUpperCase() + text.slice(1),
        title: 'optional',
        allowedIn: ['scene'],
        perPlace: { min: 0, max: null },
        uid,
      } satisfies CalloutDefinition;
    case 'meta':
      return { key: text, requirement: 'optional', type: 'text', uid } satisfies MetaKeyDefinition;
  }
  void t;
}

export function draftReducer(t: Template, action: DraftAction): Template {
  switch (action.type) {
    case 'reset':
      return action.template;
    case 'name':
      return { ...t, name: action.value };
    case 'system': {
      if (t.kind !== 'adventure') return t;
      const { system: _, ...rest } = t;
      return action.value ? { ...rest, system: action.value } : rest;
    }
    case 'move': {
      const items = itemsOf(t, action.list);
      const to = action.index + action.by;
      if (!items || to < 0 || to >= items.length) return t;
      const next = [...items];
      [next[action.index], next[to]] = [next[to], next[action.index]];
      return withList(t, action.list, next);
    }
    case 'remove': {
      const items = itemsOf(t, action.list);
      const item = items?.[action.index];
      if (!items || item === undefined || isLocked(action.list, item as never)) return t;
      return withList(
        t,
        action.list,
        items.filter((_, i) => i !== action.index),
      );
    }
    case 'add': {
      const items = itemsOf(t, action.list);
      if (!items || !action.name.trim()) return t;
      const item = newItem(t, action.list, action.name, action.uid);
      const next = [...items];
      // A new section goes before the scenes, as the mockup adds it; in a
      // campaign, at the end.
      const scenes = action.list === 'sections' ? t.sections.findIndex((s) => s.role === 'scenes') : -1;
      next.splice(scenes === -1 ? next.length : scenes, 0, item);
      return withList(t, action.list, next);
    }
    case 'patch': {
      const items = itemsOf(t, action.list);
      if (!items?.[action.index]) return t;
      return withList(
        t,
        action.list,
        items.map((item, i) => (i === action.index ? { ...(item as object), ...action.patch } : item)),
      );
    }
    case 'limits':
      return t.kind === 'adventure' ? { ...t, limits: { ...t.limits, ...action.patch } } : t;
    case 'dashes': {
      if (t.kind !== 'adventure') return t;
      const others = t.style.forbidden.filter((f) => !DASHES.some((d) => d.text === f.text));
      return { ...t, style: { forbidden: action.on ? [...DASHES, ...others] : others } };
    }
  }
}

export type DraftCheck = { ok: true; template: Template } | { ok: false; issues: string[] };

// A draft as the server would take it: valid against the schema.
export function checkDraft(draft: Template): DraftCheck {
  try {
    return { ok: true, template: defineTemplate(draft) };
  } catch (error) {
    if (error instanceof TemplateError) return { ok: false, issues: error.issues };
    throw error;
  }
}

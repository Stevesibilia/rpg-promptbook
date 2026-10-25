import {
  defaultTemplateRef,
  resolveTemplate,
  type AdventureTemplate,
  type Template,
  type TemplateRef,
} from 'promptbook-format';
import type { Category, ProjectMeta } from './model.js';

// A project's document template (template-registry design decisions 5 and 6):
// the one way every reader of a project's document gets it.

export const templateKindOf = (category: Category): Template['kind'] =>
  category === 'campaign' ? 'campaign' : 'adventure';

// The built-in template a project of this category uses by default.
function builtinOf<K extends Template['kind']>(kind: K): Extract<Template, { kind: K }> {
  const template = resolveTemplate(defaultTemplateRef(kind));
  if (template?.kind !== kind) throw new Error(`No built-in ${kind} template`);
  return template as Extract<Template, { kind: K }>;
}

// What an id may be: the built-ins' and the server's ids, lower case.
const TEMPLATE_ID = /^[a-z][a-z0-9-]{0,63}$/;
// The largest version a database int column holds.
const MAX_VERSION = 2 ** 31 - 1;

// An id as templates have them and a positive whole version a database can
// store.
export function isTemplateRef(value: unknown): value is TemplateRef {
  if (typeof value !== 'object' || value === null) return false;
  const { id, version } = value as { id?: unknown; version?: unknown };
  return (
    typeof id === 'string' &&
    TEMPLATE_ID.test(id) &&
    typeof version === 'number' &&
    Number.isInteger(version) &&
    version > 0 &&
    version <= MAX_VERSION
  );
}

// The meta value as another client wrote it, else the category's built-in.
export function readTemplateRef(value: unknown, category: Category): TemplateRef {
  if (isTemplateRef(value)) return { id: value.id, version: value.version };
  return defaultTemplateRef(templateKindOf(category));
}

// The template the project records, among `extra` (the account's own) and
// the built-ins. One the device does not hold, or one of the wrong kind for
// the category, answers the category's built-in, so the project still opens.
export function templateOf(
  meta: Pick<ProjectMeta, 'template' | 'category'>,
  extra: readonly Template[] = [],
): Template {
  const kind = templateKindOf(meta.category);
  const found = resolveTemplate(meta.template, extra);
  return found?.kind === kind ? found : builtinOf(kind);
}

// For the readers that parse: they never see a campaign, and answer the
// built-in adventure template for one.
export function adventureTemplateOf(
  meta: Pick<ProjectMeta, 'template' | 'category'>,
  extra: readonly Template[] = [],
): AdventureTemplate {
  const template = templateOf(meta, extra);
  return template.kind === 'adventure' ? template : builtinOf('adventure');
}

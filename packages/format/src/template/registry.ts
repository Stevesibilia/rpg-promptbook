import { avventura } from './avventura.js';
import { campagna } from './campagna.js';
import type { Template } from './schema.js';

// A template as a project records it: its id and the version it was made with.
export interface TemplateRef {
  id: string;
  version: number;
}

export const builtinTemplates: readonly Template[] = [avventura, campagna];

// The template a reference names, exactly by id and version: first among
// `extra` (the account's own templates), then among the built-ins.
export function resolveTemplate(ref: TemplateRef, extra: readonly Template[] = []): Template | undefined {
  const matches = (t: Template) => t.id === ref.id && t.version === ref.version;
  return extra.find(matches) ?? builtinTemplates.find(matches);
}

// The built-in a project of this kind uses when it records no template.
export function defaultTemplateRef(kind: Template['kind']): TemplateRef {
  const template = kind === 'campaign' ? campagna : avventura;
  return { id: template.id, version: template.version };
}

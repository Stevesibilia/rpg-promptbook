import { avventura } from './avventura.js';
import { campagna, campagnaV2 } from './campagna.js';
import type { Template } from './schema.js';

// A template as a project records it: its id and the version it was made with.
export interface TemplateRef {
  id: string;
  version: number;
}

// Every built-in version. A built-in never changes in place: a new version
// sits beside the old one, which stays for the projects that record it.
export const builtinTemplates: readonly Template[] = [avventura, campagna, campagnaV2];

// The template a reference names, exactly by id and version: first among
// `extra` (the account's own templates), then among the built-ins.
export function resolveTemplate(ref: TemplateRef, extra: readonly Template[] = []): Template | undefined {
  const matches = (t: Template) => t.id === ref.id && t.version === ref.version;
  return extra.find(matches) ?? builtinTemplates.find(matches);
}

// A built-in id's versions, oldest first.
export function builtinVersions(id: string): Template[] {
  return builtinTemplates.filter((t) => t.id === id).sort((a, b) => a.version - b.version);
}

// The highest version of a built-in id.
export function latestBuiltin(id: string): Template | undefined {
  return builtinVersions(id).at(-1);
}

// The built-in a new project of this kind starts from: the latest version.
export function defaultTemplateRef(kind: Template['kind']): TemplateRef {
  const template = kind === 'campaign' ? campagnaV2 : avventura;
  return { id: template.id, version: template.version };
}

// What a project that records no template reads as: the built-in it was made
// with before projects recorded one, avventura@1 or campagna@1. A later
// version of the built-in never moves such a project.
export function implicitTemplateRef(kind: Template['kind']): TemplateRef {
  const template = kind === 'campaign' ? campagna : avventura;
  return { id: template.id, version: template.version };
}

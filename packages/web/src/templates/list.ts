import { builtinTemplates, defaultTemplateRef, type Template } from 'promptbook-format';
import type { Settings } from 'promptbook-project';
import type { StoredTemplate } from '../api.js';

// The rows of Settings → Document templates (mockup state 1): one per
// template at its latest version, built-ins first, the account's in the
// order they were made.

export type TemplateKind = Template['kind'];

export interface TemplateEntry {
  id: string;
  kind: TemplateKind;
  // The latest version's name, number and body.
  name: string;
  version: number;
  latest: Template;
  builtin: boolean;
  copiedFrom: string;
  system: string;
  // The projects on any version, those in the bin included.
  projects: number;
  isDefault: boolean;
}

export const kindLabels: Record<TemplateKind, string> = {
  adventure: 'Adventures and one-shots',
  campaign: 'Campaigns',
};

export const kinds: readonly TemplateKind[] = ['adventure', 'campaign'];

// Every version of every own template, the latest of each by id.
export function latestVersions(stored: readonly StoredTemplate[]): Map<string, StoredTemplate> {
  const latest = new Map<string, StoredTemplate>();
  for (const t of stored) {
    const seen = latest.get(t.id);
    if (!seen || t.version > seen.version) latest.set(t.id, t);
  }
  return latest;
}

// The versions of one template, oldest first.
export const versionsOf = (stored: readonly StoredTemplate[], id: string) =>
  stored.filter((t) => t.id === id).sort((a, b) => a.version - b.version);

// The projects on any version of a template.
export function projectsOn(usage: Readonly<Record<string, number>>, id: string): number {
  let total = 0;
  for (const [ref, count] of Object.entries(usage)) if (ref.slice(0, ref.lastIndexOf('@')) === id) total += count;
  return total;
}

// The default a kind's new projects start from: the settings' id when it
// names a template of that kind, else the kind's built-in, as the server
// resolves it (design decision 6).
export function defaultIdOf(
  kind: TemplateKind,
  settings: Pick<Settings, 'defaultTemplates'> | null,
  latest: ReadonlyMap<string, StoredTemplate>,
): string {
  const builtin = defaultTemplateRef(kind).id;
  const id = settings?.defaultTemplates[kind];
  if (!id || id === builtin) return builtin;
  return latest.get(id)?.body.kind === kind ? id : builtin;
}

export function templateEntries(
  stored: readonly StoredTemplate[],
  usage: Readonly<Record<string, number>>,
  settings: Pick<Settings, 'defaultTemplates'> | null,
): TemplateEntry[] {
  const latest = latestVersions(stored);
  const firstMade = new Map<string, string>();
  for (const t of stored) if (t.version === 1) firstMade.set(t.id, t.createdAt);
  const entry = (template: Template, builtin: boolean): TemplateEntry => ({
    id: template.id,
    kind: template.kind,
    name: template.name,
    version: template.version,
    latest: template,
    builtin,
    copiedFrom: template.copiedFrom ?? '',
    system: template.kind === 'adventure' ? (template.system ?? '') : '',
    projects: projectsOn(usage, template.id),
    isDefault: defaultIdOf(template.kind, settings, latest) === template.id,
  });
  const own = [...latest.values()]
    .sort((a, b) => (firstMade.get(a.id) ?? a.createdAt).localeCompare(firstMade.get(b.id) ?? b.createdAt))
    .map((t) => entry(t.body, false));
  return [...builtinTemplates.map((t) => entry(t, true)), ...own];
}

// The name a copy starts with, numbered when the account already has it.
export function copyName(source: string, taken: readonly string[]): string {
  const base = `Copia di ${source}`;
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base} (${n})`)) return `${base} (${n})`;
}

export const projectCount = (n: number) => (n ? `${n} project${n === 1 ? '' : 's'}` : 'no projects');

import type {
  CalloutDefinition,
  MetaKeyDefinition,
  SceneFieldDefinition,
  SectionDefinition,
  Template,
} from './schema.js';

// Locked rows (template-editor design decision 11), shared by the editor,
// which shows a lock and refuses to remove them, and the server, which
// refuses a version that breaks them (template-connector design decision 4).

export type TemplateListName = 'sections' | 'sceneFields' | 'callouts' | 'meta';

export interface TemplateListItems {
  sections: SectionDefinition;
  sceneFields: SceneFieldDefinition;
  callouts: CalloutDefinition;
  meta: MetaKeyDefinition;
}

// The front matter keys the app reads by name (template-registry design
// decision 10): renaming one would break what reads it.
export const READ_KEYS: ReadonlySet<string> = new Set([
  'titolo',
  'sottotitolo',
  'sistema',
  'formato',
  'durata',
  'giocatori',
  'ambientazione',
  'tempi',
  'campagna',
  'arco',
  'autore',
  'copyright',
  'licenza',
]);

// Sections and fields with a role, keys the app reads, and boxes every place
// needs.
export function isLocked<L extends TemplateListName>(list: L, item: TemplateListItems[L]): boolean {
  switch (list) {
    case 'sections':
    case 'sceneFields':
      return (item as SectionDefinition | SceneFieldDefinition).role !== undefined;
    case 'callouts':
      return (item as CalloutDefinition).perPlace.min >= 1;
    case 'meta': {
      const key = item as MetaKeyDefinition;
      return key.role !== undefined || READ_KEYS.has(key.key);
    }
  }
  return false;
}

interface Row {
  uid?: string | undefined;
  role?: string | undefined;
}

interface ListRules<T extends Row> {
  what: string;
  name: (item: T) => string;
  // How rows pair after the uid: by role, then by name, say.
  keys: ((item: T) => string | undefined)[];
  locked: (item: T) => boolean;
  // Rows whose uids differ never pair, as in templateChanges: one was
  // removed, the other added.
  strictUids?: boolean;
  // Whether a row keeps its role and no row gains one `base` lacks.
  roles: boolean;
  // What a paired row must keep besides, as the sentence that says it broke.
  keep?: (item: T, match: T) => string | undefined;
}

// Pairs every row of `base` with one of `next`: by uid, then by each key in
// turn. Answers, for each index in `base`, the row of `next` it pairs with.
function pairRows<T extends Row>(base: readonly T[], next: readonly T[], rules: ListRules<T>): Map<number, T> {
  const pairs = new Map<number, T>();
  const taken = new Set<number>();
  [(item: T) => item.uid, ...rules.keys].forEach((key, pass) => {
    base.forEach((item, b) => {
      if (pairs.has(b)) return;
      const value = key(item);
      if (value === undefined) return;
      const n = next.findIndex(
        (other, index) =>
          !taken.has(index) &&
          key(other) === value &&
          (pass === 0 || !rules.strictUids || item.uid === undefined || other.uid === undefined || item.uid === other.uid),
      );
      if (n === -1) return;
      pairs.set(b, next[n]!);
      taken.add(n);
    });
  });
  return pairs;
}

const roleText = (role: string | undefined) => (role === undefined ? 'none' : `the role ${role}`);

function listViolations<T extends Row>(base: readonly T[], next: readonly T[], rules: ListRules<T>): string[] {
  const { what, name } = rules;
  const pairs = pairRows(base, next, rules);
  const out: string[] = [];
  base.forEach((item, b) => {
    const match = pairs.get(b);
    if (!match) {
      if (rules.locked(item)) out.push(`${what} «${name(item)}» is locked: it cannot be removed`);
      return;
    }
    if (rules.roles && match.role !== item.role) {
      out.push(`roles cannot change: ${what} «${name(match)}» had ${roleText(item.role)}, now has ${roleText(match.role)}`);
    }
    const broken = rules.keep?.(item, match);
    if (broken) out.push(broken);
  });
  if (!rules.roles) return out;
  const roles = new Set(base.map((item) => item.role));
  const paired = new Set(pairs.values());
  for (const item of next) {
    if (paired.has(item) || item.role === undefined || roles.has(item.role)) continue;
    out.push(`roles cannot change: ${what} «${name(item)}» has the role ${item.role}, which no ${what} had`);
  }
  return out;
}

const calloutType = (c: CalloutDefinition) => (c.meta ? `${c.type}|${c.meta}` : c.type);

// The locks `next` breaks against `base`, the version it is based on, each a
// sentence naming the row. Locked sections, scene fields and keys stay,
// matched by uid, else by role, else by name; a matched row keeps its role,
// and no row gains a role `base` lacks; a locked key keeps its name. Boxes
// are locked only inside one draft, as the editor shows them: a box every
// place needs can be set to «any» and removed in the same save, so only its
// look is kept.
export function lockViolations(base: Template, next: Template): string[] {
  const out = [
    ...listViolations(base.sections, next.sections, {
      what: 'section',
      name: (s) => s.heading ?? s.name,
      keys: [(s) => s.role, (s) => s.name],
      locked: (s) => isLocked('sections', s),
      roles: true,
    }),
    ...listViolations(base.meta, next.meta, {
      what: 'key',
      name: (k) => k.key,
      keys: [(k) => k.role, (k) => k.key],
      locked: (k) => isLocked('meta', k),
      roles: true,
      keep: (key, match) =>
        match.key !== key.key && isLocked('meta', key)
          ? `key «${key.key}» is locked: the app reads it by that name, so it cannot become «${match.key}»`
          : undefined,
    }),
  ];
  if (base.kind !== 'adventure' || next.kind !== 'adventure') return out;
  return [
    ...out,
    ...listViolations(base.sceneFields, next.sceneFields, {
      what: 'scene field',
      name: (f) => f.label,
      keys: [(f) => f.role, (f) => f.label],
      locked: (f) => isLocked('sceneFields', f),
      roles: true,
    }),
    ...listViolations(base.callouts, next.callouts, {
      what: 'box',
      name: (c) => `[!${calloutType(c)}]`,
      keys: [calloutType],
      locked: () => false,
      strictUids: true,
      roles: false,
      keep: (box, match) =>
        match.role !== box.role ? `box «[!${calloutType(match)}]» keeps its look: it was ${box.role}, now ${match.role}` : undefined,
    }),
  ];
}

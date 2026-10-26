import { describe, expect, it } from 'vitest';
import {
  defineTemplate,
  lockViolations,
  templates,
  type AdventureTemplate,
  type AdventureTemplateInput,
  type CampaignTemplate,
  type CampaignTemplateInput,
} from '../src/index.js';

// A stored copy of the built-in: every row has a uid, as duplicateTemplate
// gives them.
function stored(): AdventureTemplateInput {
  const t = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  let n = 0;
  for (const list of [t.sections, t.meta, t.sceneFields, t.callouts] as { uid?: string }[][]) {
    for (const item of list) item.uid = `u${++n}`;
  }
  return t;
}

const base = defineTemplate(stored());

function edit(change: (t: AdventureTemplateInput) => void, from: AdventureTemplateInput = stored()): AdventureTemplate {
  const t = JSON.parse(JSON.stringify(from)) as AdventureTemplateInput;
  change(t);
  return defineTemplate(t);
}

const section = (t: AdventureTemplateInput, role: string) => t.sections.find((s) => s.role === role)!;
const field = (t: AdventureTemplateInput, role: string) => t.sceneFields.find((f) => f.role === role)!;
const key = (t: AdventureTemplateInput, name: string) => t.meta.find((k) => k.key === name)!;

describe('lockViolations', () => {
  it('finds none between a template and itself, or the built-in and its copy', () => {
    expect(lockViolations(base, base)).toEqual([]);
    expect(lockViolations(templates.avventura, base)).toEqual([]);
    expect(lockViolations(templates.campagna, templates.campagna)).toEqual([]);
  });

  it('refuses removing a section with a role', () => {
    const next = edit((t) => {
      t.sections = t.sections.filter((s) => s.role !== 'scenes');
    });
    expect(lockViolations(base, next)).toEqual(['section «Scene» is locked: it cannot be removed']);
  });

  it('refuses removing a scene field with a role', () => {
    const next = edit((t) => {
      t.sceneFields = t.sceneFields.filter((f) => f.role !== 'place');
    });
    expect(lockViolations(base, next)).toEqual(['scene field «Luogo e momento» is locked: it cannot be removed']);
  });

  it('refuses removing a key the app reads', () => {
    const next = edit((t) => {
      t.meta = t.meta.filter((k) => k.key !== 'durata');
    });
    expect(lockViolations(base, next)).toEqual(['key «durata» is locked: it cannot be removed']);
  });

  it('refuses moving a role to another row', () => {
    const next = edit((t) => {
      delete section(t, 'rules').role;
      t.sections.find((s) => s.name === 'Indizi')!.role = 'rules';
    });
    expect(lockViolations(base, next)).toEqual([
      'roles cannot change: section «Regole della notte» had the role rules, now has none',
      'roles cannot change: section «Indizi» had the role clues, now has the role rules',
    ]);
  });

  it('refuses a role the base version lacks', () => {
    const from = stored();
    from.sections = from.sections.filter((s) => s.role !== 'before');
    const next = edit((t) => {
      t.sections.push({ name: 'Preparativi', requirement: 'optional', role: 'before' });
    }, from);
    expect(lockViolations(defineTemplate(from), next)).toEqual([
      'roles cannot change: section «Preparativi» has the role before, which no section had',
    ]);
  });

  it('refuses renaming a key the app reads, naming it', () => {
    const next = edit((t) => {
      key(t, 'licenza').key = 'licence';
    });
    expect(lockViolations(base, next)).toEqual([
      'key «licenza» is locked: the app reads it by that name, so it cannot become «licence»',
    ]);
  });

  it('names a renamed key without a uid as removed', () => {
    const next = edit((t) => {
      key(t, 'licenza').key = 'licence';
    }, JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput);
    expect(lockViolations(templates.avventura, next)).toEqual(['key «licenza» is locked: it cannot be removed']);
  });

  it('refuses changing a box’s look', () => {
    const next = edit((t) => {
      t.callouts.find((c) => c.type === 'documento')!.role = 'box';
    });
    expect(lockViolations(base, next)).toEqual(['box «[!documento]» keeps its look: it was handout, now box']);
  });

  it('names every violation', () => {
    const next = edit((t) => {
      t.sections = t.sections.filter((s) => s.role !== 'scenes' && s.role !== 'npcs');
      field(t, 'derail').role = undefined;
    });
    expect(lockViolations(base, next)).toEqual([
      'section «Scene» is locked: it cannot be removed',
      'section «PNG» is locked: it cannot be removed',
      'roles cannot change: scene field «Se deragliano» had the role derail, now has none',
    ]);
  });

  it('lets the editor’s own operations through', () => {
    const next = edit((t) => {
      // A role section and a field renamed, a free key renamed.
      section(t, 'strongStart').name = 'Apertura';
      field(t, 'place').label = 'Dove e quando';
      key(t, 'fronti').key = 'minacce';
      // An own section added, a free key removed, rows moved.
      t.sections.splice(3, 0, { name: 'Atmosfera', requirement: 'optional', uid: 'new-1' });
      t.meta = t.meta.filter((k) => k.key !== 'linguetta');
      t.sceneFields.reverse();
      // A needed box set to «any» and removed, an unneeded one removed, a new
      // one added with any look.
      t.callouts = t.callouts.filter((c) => c.type !== 'leggi' && c.meta !== 'laterale');
      t.callouts.push({ ...t.callouts[0]!, type: 'mappa', label: 'Mappa', role: 'box', uid: 'new-2' });
    });
    expect(lockViolations(base, next)).toEqual([]);
    const own = edit((t) => {
      t.sections.splice(3, 0, { name: 'Atmosfera', requirement: 'optional', uid: 'new-1' });
    });
    const removed = edit((t) => {
      t.sections = t.sections.filter((s) => s.uid !== 'new-1');
    }, JSON.parse(JSON.stringify(own)) as AdventureTemplateInput);
    expect(lockViolations(own, removed)).toEqual([]);
  });

  it('keeps a campaign’s keys and leaves its sections free', () => {
    const campaign = (change: (t: CampaignTemplateInput) => void): CampaignTemplate => {
      const t = JSON.parse(JSON.stringify(templates.campagna)) as CampaignTemplateInput;
      change(t);
      return defineTemplate(t);
    };
    expect(lockViolations(templates.campagna, campaign((t) => (t.sections = t.sections.slice(1))))).toEqual([]);
    expect(lockViolations(templates.campagna, campaign((t) => (t.meta = t.meta.filter((k) => k.key !== 'autore'))))).toEqual([
      'key «autore» is locked: it cannot be removed',
    ]);
  });
});

import { z } from 'zod';

// A template definition is data: every label the parser and the checks match
// against comes from here, never from code. Roles are the English names the
// code uses to find what a label means.

const label = z.string().trim().min(1, 'expected a non-empty label');

export const requirementSchema = z.enum(['required', 'recommended', 'optional']);

export const sectionRoleSchema = z.enum([
  'synopsis',
  'overview',
  'reminders',
  'strongStart',
  'sceneMap',
  'rules',
  'scenes',
  'clues',
  'npcs',
  'sheets',
  'appendix',
]);

export const placeSchema = z.union([
  z.enum(['scene', 'sheet', 'anySection']),
  sectionRoleSchema,
]);

const metaKeySchema = z.object({
  key: label,
  requirement: requirementSchema,
  type: z.enum(['text', 'list', 'licence']),
  // What the code reads the key for: the title, the subtitle, or the game
  // system whose grade table the sheets use.
  role: z.enum(['title', 'subtitle', 'system']).optional(),
});

const sectionSchema = z.object({
  name: label,
  // The full heading when it says more than the name, as in
  // "Appendice: immagini e musica". A heading matches a section when it equals
  // the name or starts with the name followed by a colon or a space.
  heading: label.optional(),
  requirement: requirementSchema,
  role: sectionRoleSchema.optional(),
});

const sceneFieldSchema = z.object({
  label,
  // inline: **Label:** text. block: **Label** then a list or a table.
  form: z.enum(['inline', 'block']),
  requirement: requirementSchema,
  climax: z.boolean(),
  role: z.enum(['cast', 'clues']).optional(),
});

const calloutSchema = z.object({
  type: label,
  meta: label.optional(),
  role: z.enum(['readAloud', 'handout', 'box']),
  column: z.enum(['main', 'side']),
  label,
  title: z.enum(['none', 'optional', 'expected']),
  allowedIn: z.array(placeSchema).min(1, 'expected at least one place'),
  perPlace: z.object({
    min: z.int().nonnegative(),
    max: z.int().positive().nullable(),
  }),
});

const sheetKeySchema = z.object({
  key: label,
  role: z.enum(['type', 'grade', 'nature', 'wounds', 'afflictions', 'pack', 'talents']),
});

const gradeSchema = z.object({
  name: label,
  wounds: z.int().positive(),
  afflictions: z.int().nonnegative(),
});

const systemSchema = z.object({
  name: label,
  woundsPerCounter: z.int().positive(),
  grades: z.array(gradeSchema).min(1, 'expected at least one grade'),
});

const wordRange = z.object({ min: z.int().nonnegative(), max: z.int().positive() });

export const templateSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'expected a lower-case id'),
    version: z.int().positive(),
    name: label,
    ids: z.object({ scene: label, revelation: label, clue: label }),
    meta: z.array(metaKeySchema),
    sections: z.array(sectionSchema).min(1, 'expected at least one section'),
    sceneFields: z.array(sceneFieldSchema),
    callouts: z.array(calloutSchema),
    references: z.object({ marker: label }),
    assets: z.object({ scheme: label }),
    overview: z.object({ revelations: label }),
    tables: z.object({
      reactions: z.object({ firstHeader: label, requirement: requirementSchema }),
      sceneMap: z.object({ id: label }),
      tracker: z.object({
        id: label,
        text: label,
        revelations: label,
        scenes: label,
        done: label,
      }),
      npcs: z.object({ name: label }),
    }),
    sheets: z.object({
      keys: z.array(sheetKeySchema),
      listSeparator: z.string().min(1),
      pregenerated: label,
    }),
    systems: z.array(systemSchema),
    appendix: z.object({ visual: label, mood: label }),
    limits: z.object({
      synopsisWords: wordRange,
      preambleWords: z.int().positive(),
      reminders: z.int().positive(),
      // Clues a revelation needs, and the scenes they must be spread over.
      revelationClues: z.int().positive(),
      revelationScenes: z.int().positive(),
    }),
    style: z.object({
      forbidden: z.array(z.object({ text: z.string().min(1), name: label })),
    }),
  })
  .superRefine((template, ctx) => {
    const unique = <T>(
      items: T[],
      key: (item: T) => string | undefined,
      path: PropertyKey[],
      what: string,
    ) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        const value = key(item);
        if (value === undefined) return;
        if (seen.has(value)) {
          ctx.addIssue({ code: 'custom', path: [...path, index], message: `duplicate ${what} "${value}"` });
        }
        seen.add(value);
      });
    };
    unique(template.meta, (k) => k.key, ['meta'], 'key');
    unique(template.meta, (k) => k.role, ['meta'], 'role');
    unique(template.sections, (s) => s.name, ['sections'], 'section');
    unique(template.sections, (s) => s.role, ['sections'], 'role');
    unique(template.sceneFields, (f) => f.label, ['sceneFields'], 'label');
    unique(template.sceneFields, (f) => f.role, ['sceneFields'], 'role');
    unique(template.callouts, (c) => (c.meta ? `${c.type}|${c.meta}` : c.type), ['callouts'], 'type');
    unique(template.sheets.keys, (k) => k.key, ['sheets', 'keys'], 'key');
    unique(template.sheets.keys, (k) => k.role, ['sheets', 'keys'], 'role');
    unique(template.systems, (s) => s.name, ['systems'], 'system');
    template.systems.forEach((system, index) =>
      unique(system.grades, (g) => g.name, ['systems', index, 'grades'], 'grade'),
    );
    template.callouts.forEach((callout, index) => {
      const { min, max } = callout.perPlace;
      if (max !== null && max < min) {
        ctx.addIssue({ code: 'custom', path: ['callouts', index, 'perPlace'], message: 'max is below min' });
      }
    });
    const { min, max } = template.limits.synopsisWords;
    if (max < min) {
      ctx.addIssue({ code: 'custom', path: ['limits', 'synopsisWords'], message: 'max is below min' });
    }
  });

export type TemplateInput = z.input<typeof templateSchema>;
export type Template = z.output<typeof templateSchema>;
export type Requirement = z.output<typeof requirementSchema>;
export type SectionRole = z.output<typeof sectionRoleSchema>;
export type Place = z.output<typeof placeSchema>;
export type SectionDefinition = Template['sections'][number];
export type SceneFieldDefinition = Template['sceneFields'][number];
export type CalloutDefinition = Template['callouts'][number];
export type SheetKeyDefinition = Template['sheets']['keys'][number];
export type SystemDefinition = Template['systems'][number];

export class TemplateError extends Error {
  readonly issues: string[];

  constructor(name: string, issues: string[]) {
    super(`Invalid template definition ${name}: ${issues.join('; ')}`);
    this.name = 'TemplateError';
    this.issues = issues;
  }
}

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((out, part) => {
    if (typeof part === 'number') return `${out}[${part}]`;
    return out ? `${out}.${String(part)}` : String(part);
  }, '');
}

// Validates a definition and returns it typed. Throws a TemplateError whose
// message names every bad entry by its path, as in "sceneFields[3].label".
export function defineTemplate(definition: TemplateInput): Template {
  const result = templateSchema.safeParse(definition);
  if (result.success) return result.data;
  const raw = definition as { id?: unknown; version?: unknown } | null;
  const name =
    raw && typeof raw.id === 'string' ? `"${raw.id}@${String(raw.version ?? '?')}"` : '(no id)';
  const issues = result.error.issues.map((issue) => {
    const at = formatPath(issue.path);
    return at ? `${at}: ${issue.message}` : issue.message;
  });
  throw new TemplateError(name, issues);
}

// The name a document records for the template it was checked against.
export function templateName(template: Template): string {
  return `${template.id}@${template.version}`;
}

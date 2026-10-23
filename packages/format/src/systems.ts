import { z } from 'zod';
import { issuesOf, TemplateError, uniqueIn } from './template/schema.js';

// Game systems are a list beside the templates: any template can use any
// system. A system's grade table gives a threat's counters, found by the
// system the front matter names.

const label = z.string().trim().min(1, 'expected a non-empty label');

const gradeSchema = z.object({
  name: label,
  wounds: z.int().positive(),
  afflictions: z.int().nonnegative(),
});

export const systemSchema = z.object({
  name: label,
  woundsPerCounter: z.int().positive(),
  grades: z.array(gradeSchema).min(1, 'expected at least one grade'),
});

const systemsSchema = z.array(systemSchema).superRefine((systems, ctx) => {
  const unique = uniqueIn(ctx);
  unique(systems, (s) => s.name, [], 'system');
  systems.forEach((system, index) => unique(system.grades, (g) => g.name, [index, 'grades'], 'grade'));
});

export type SystemInput = z.input<typeof systemSchema>;
export type SystemDefinition = z.output<typeof systemSchema>;

// Validates a list of systems and returns it typed. Throws a TemplateError
// whose message names every bad entry by its path, as in "[0].grades[1].wounds".
export function defineSystems(definitions: SystemInput[]): SystemDefinition[] {
  const result = systemsSchema.safeParse(definitions);
  if (result.success) return result.data;
  throw new TemplateError('systems', issuesOf(result.error));
}

export const builtinSystems: readonly SystemDefinition[] = defineSystems([
  {
    name: 'Kulthos',
    woundsPerCounter: 3,
    grades: [
      { name: 'Ordinaria', wounds: 3, afflictions: 1 },
      { name: 'Straordinaria', wounds: 6, afflictions: 2 },
      { name: 'Leggendaria', wounds: 9, afflictions: 3 },
    ],
  },
]);

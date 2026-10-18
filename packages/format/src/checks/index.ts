import type { Model, Problem } from '../model.js';
import type { Template } from '../template/schema.js';
import type { Source } from '../parse/source.js';

export interface CheckInput {
  model: Model;
  template: Template;
  source: Source;
}

// A rule over the whole model. Checks read the template for every label and
// limit, and never report again what the parser already reported (unplaced
// content, invalid YAML, malformed callouts, scene headings without an id).
export type Check = (input: CheckInput) => Problem[];

// The rule checks (sections, scene fields, callouts, references, sheets, clues,
// appendix, limits and style) come in the plan's group 4.
export const checks: Check[] = [];

export function runChecks(input: CheckInput): Problem[] {
  return checks.flatMap((check) => check(input));
}

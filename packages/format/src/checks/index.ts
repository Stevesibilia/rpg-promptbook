import type { Model, Problem } from '../model.js';
import type { SystemDefinition } from '../systems.js';
import type { AdventureTemplate } from '../template/schema.js';
import type { Source } from '../parse/source.js';
import { checkAppendix } from './appendix.js';
import { checkCallouts } from './callouts.js';
import { checkClues } from './clues.js';
import { checkLimits } from './limits.js';
import { checkReferences } from './references.js';
import { checkScenes } from './scenes.js';
import { checkSections } from './sections.js';
import { checkSheets } from './sheets.js';
import { checkStyle } from './style.js';

export interface CheckInput {
  model: Model;
  template: AdventureTemplate;
  systems: readonly SystemDefinition[];
  source: Source;
}

// A rule over the whole model. Checks read the template for every label and
// limit, and never report again what the parser already reported (unplaced
// content, invalid YAML, malformed callouts, scene headings without an id).
export type Check = (input: CheckInput) => Problem[];

export const checks: Check[] = [
  checkSections,
  checkScenes,
  checkCallouts,
  checkReferences,
  checkSheets,
  checkClues,
  checkAppendix,
  checkLimits,
  checkStyle,
];

export function runChecks(input: CheckInput): Problem[] {
  return checks.flatMap((check) => check(input));
}

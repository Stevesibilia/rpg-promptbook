import { avventura } from './template/avventura.js';

export { parseAdventure, type ParseOptions } from './parse/index.js';
export { checks, runChecks, type Check, type CheckInput } from './checks/index.js';
export type * from './model.js';
export { defineTemplate, templateName, TemplateError } from './template/schema.js';
export type {
  CalloutDefinition,
  Place,
  Requirement,
  SceneFieldDefinition,
  SectionDefinition,
  SectionRole,
  SheetKeyDefinition,
  SystemDefinition,
  Template,
  TemplateInput,
} from './template/schema.js';

export const templates = { avventura } as const;

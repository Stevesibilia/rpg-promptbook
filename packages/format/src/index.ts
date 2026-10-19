import { avventura } from './template/avventura.js';

export { parseAdventure, type ParseOptions } from './parse/index.js';
export {
  convertNote,
  type ConvertEdit,
  type ConvertEditKind,
  type ConvertNotice,
  type ConvertOptions,
  type ConvertReport,
  type ConvertResult,
} from './convert/index.js';
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

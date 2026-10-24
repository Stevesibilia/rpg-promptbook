import { avventura } from './template/avventura.js';
import { campagna } from './template/campagna.js';

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
export {
  builtinTemplates,
  defaultTemplateRef,
  resolveTemplate,
  type TemplateRef,
} from './template/registry.js';
export { builtinSystems, defineSystems, type SystemDefinition, type SystemInput } from './systems.js';
export type {
  AdventureTemplate,
  AdventureTemplateInput,
  CalloutDefinition,
  CampaignTemplate,
  CampaignTemplateInput,
  Place,
  Requirement,
  SceneFieldDefinition,
  SceneFieldRole,
  SectionDefinition,
  SectionRole,
  SheetKeyDefinition,
  Template,
  TemplateInput,
} from './template/schema.js';

// The built-ins by id, for tests and fixtures; product code resolves a
// project's template instead.
export const templates = { avventura, campagna } as const;

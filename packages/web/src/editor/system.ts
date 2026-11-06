import {
  builtinSystems,
  findSystem,
  type AdventureTemplate,
  type Model,
  type SystemDefinition,
} from 'promptbook-format';

// The game system the document's front matter names, among the built-ins the
// parse worker reads sheets with; undefined when it names none or an unknown
// one.
export function projectSystem(model: Model | undefined, template: AdventureTemplate): SystemDefinition | undefined {
  const key = template.meta.find((m) => m.role === 'system')?.key;
  return model && key !== undefined ? findSystem(builtinSystems, model.meta.values[key]) : undefined;
}

// The key a sheet names its kind with: «Tipo».
export const typeKeyOf = (template: AdventureTemplate): string | undefined =>
  template.sheets.keys.find((k) => k.role === 'type')?.key;

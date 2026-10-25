import { Compartment, type Extension, type TransactionSpec } from '@codemirror/state';
import type { AdventureTemplate } from 'promptbook-format';
import { analysis, changeTemplate, type OnResult } from './analysis/field.js';
import type { Connect } from './analysis/client.js';
import { preview, previewConfigOf } from './cm/preview.js';
import { slashMenu } from './cm/slash.js';

// The editor's extensions that depend on the project's template: the live
// preview, the analysis and the `/` menu (template-editor design decision
// 14). They sit in a compartment, so a template change (Update to latest)
// reconfigures the view instead of making a new one, and the undo history,
// the selection and the scroll stay.

export interface TemplateParts {
  checked: boolean;
  connect: Connect;
  onResult?: OnResult;
}

export const templateCompartment = () => new Compartment();

function partsOf(template: AdventureTemplate, { checked, connect, onResult }: TemplateParts): Extension {
  return [
    preview(previewConfigOf(template, checked)),
    analysis({ checked, template, connect, ...(onResult ? { onResult } : {}) }),
    slashMenu(template, checked),
  ];
}

// The compartment with the parts of a template, for the new view.
export function templateExtension(compartment: Compartment, template: AdventureTemplate, parts: TemplateParts): Extension {
  return compartment.of(partsOf(template, parts));
}

// The transaction that moves the view to another template: the parts
// reconfigured, and the analysis started again from nothing, since its result
// was for the old one.
export function templateChange(compartment: Compartment, template: AdventureTemplate, parts: TemplateParts): TransactionSpec {
  return { effects: [compartment.reconfigure(partsOf(template, parts)), changeTemplate.of(template)] };
}

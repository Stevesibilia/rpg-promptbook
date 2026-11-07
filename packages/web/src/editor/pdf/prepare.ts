import { parseAdventure, parseCampaign } from 'promptbook-format';
import {
  campaignChecks,
  layoutChecks,
  toCampaignLayoutInput,
  toLayoutInput,
  type AnyLayoutInput,
  type LayoutCheck,
  type PageSize,
  type Position,
} from 'promptbook-layout';
import type { PdfSource } from './protocol.js';

// What the worker builds from a request, and the checks its review lists:
// for a campaign template the campaign's sections in the campaign layout
// (campaign-pdf design decisions 6, 10 and 11), else the adventure's as
// before. Apart from the worker so it is tested without the engine.
export interface Prepared {
  input: AnyLayoutInput;
  checks(positions: Position[], pages: PageSize[]): LayoutCheck[];
}

export function prepare({ text, options, project, template }: PdfSource): Prepared {
  if (template.kind === 'campaign') {
    const input = toCampaignLayoutInput(parseCampaign(text, { template }), options, project, template);
    return { input, checks: (positions) => campaignChecks(input, positions) };
  }
  const input = toLayoutInput(parseAdventure(text, { template }).model, options, project, template);
  return { input, checks: layoutChecks };
}

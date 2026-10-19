import type { Problem } from '../model.js';
import type { Check } from './index.js';
import { problem } from './util.js';

// Every character the template forbids, at its position.
export const checkStyle: Check = ({ template, source }) => {
  const out: Problem[] = [];
  for (const { text, name } of template.style.forbidden) {
    for (let at = source.text.indexOf(text); at !== -1; at = source.text.indexOf(text, at + text.length)) {
      out.push(problem('style.dash', 'error', `The ${name} (${text}) is not allowed.`, source.range(at, at + text.length)));
    }
  }
  return out;
};

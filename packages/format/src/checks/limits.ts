import type { Block } from '../model.js';
import type { Check } from './index.js';
import { countWords, plural, problem } from './util.js';

const words = (blocks: Block[]) => countWords(blocks.map((b) => b.text).join('\n'));

// The template's word and item limits.
export const checkLimits: Check = ({ model, template }) => {
  const out = [];
  const { synopsisWords, preambleWords, reminders } = template.limits;

  const synopsis = model.sections.find((s) => s.role === 'synopsis');
  if (synopsis) {
    const count = words(synopsis.blocks);
    if (count < synopsisWords.min || count > synopsisWords.max) {
      out.push(
        problem(
          'limit.synopsis.words',
          'warning',
          `"${synopsis.heading}" has ${plural(count, 'word')}; the template asks for ${synopsisWords.min} to ${synopsisWords.max}.`,
          synopsis.headingRange,
        ),
      );
    }
  }

  // From the overview to the strong start, in the order they stand.
  const from = model.sections.findIndex((s) => s.role === 'overview');
  const to = model.sections.findIndex((s) => s.role === 'strongStart');
  if (from !== -1 && to > from) {
    const span = model.sections.slice(from, to + 1);
    const count = span.reduce((sum, s) => sum + words(s.blocks), 0);
    if (count > preambleWords) {
      out.push(
        problem(
          'limit.preamble.words',
          'warning',
          `"${span[0]!.heading}" to "${span.at(-1)!.heading}" have ${plural(count, 'word')}; at most ${preambleWords}.`,
          span[0]!.headingRange,
        ),
      );
    }
  }

  const section = model.sections.find((s) => s.role === 'reminders');
  if (section && model.reminders.length > reminders) {
    out.push(
      problem(
        'limit.reminders.count',
        'error',
        `"${section.heading}" has ${plural(model.reminders.length, 'item')}; at most ${reminders}.`,
        model.reminders[reminders]!.range,
      ),
    );
  }
  return out;
};

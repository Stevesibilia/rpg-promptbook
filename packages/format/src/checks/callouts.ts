import type { Block, BoxBlock, CalloutBlock, Problem } from '../model.js';
import type { CalloutDefinition, Template } from '../template/schema.js';
import type { Check } from './index.js';
import { problem } from './util.js';

const header = (c: { type: string; meta?: string | null | undefined }) => `[!${c.type}${c.meta ? `|${c.meta}` : ''}]`;

const definitionOf = (template: Template, box: CalloutBlock): CalloutDefinition | undefined =>
  template.callouts.find((c) => c.type === box.type && (c.meta ?? null) === box.meta);

const boxes = (blocks: Block[]): BoxBlock[] =>
  blocks.filter((b): b is BoxBlock => b.kind === 'callout' || b.kind === 'quote');

// Callout counts per place, titles, unknown types and plain quotes in scenes.
export const checkCallouts: Check = ({ model, template }) => {
  const out: Problem[] = [];
  const valid = template.callouts.map(header).join(', ');

  const each = (list: BoxBlock[], sceneId: string | undefined) => {
    for (const box of list) {
      if (box.kind !== 'callout') continue;
      const definition = definitionOf(template, box);
      if (!definition) {
        out.push(
          problem(
            'callout.type.unknown',
            'error',
            `Callout type ${header(box)} is not in the template. Valid types: ${valid}.`,
            box.headerRange,
            { sceneId },
          ),
        );
      } else if (definition.title === 'expected' && !box.title) {
        out.push(
          problem(
            'callout.title.missing',
            'warning',
            `A "${definition.label}" box ${header(box)} should have a title.`,
            box.headerRange,
            { sceneId },
          ),
        );
      }
    }
  };

  // Exactly the number of boxes of each type the template wants in a place.
  const count = (list: BoxBlock[], place: string, where: string, range: Problem['range'], sceneId?: string) => {
    for (const definition of template.callouts) {
      const { min, max } = definition.perPlace;
      if (!definition.allowedIn.includes(place as never) || (min === 0 && max === null)) continue;
      const found = list.filter(
        (b): b is CalloutBlock => b.kind === 'callout' && definitionOf(template, b) === definition,
      );
      const want = max === null ? `at least ${min}` : min === max ? `${min}` : `${min} to ${max}`;
      if (found.length < min || (max !== null && found.length > max)) {
        const at = max !== null && found.length > max ? found[max]!.headerRange : range;
        out.push(
          problem(
            'callout.count',
            'error',
            `${where} has ${found.length} "${definition.label}" ${header(definition)} boxes; it needs ${want}.`,
            at,
            { sceneId },
          ),
        );
      }
    }
  };

  for (const scene of model.scenes) {
    const sceneId = scene.id ?? undefined;
    each(scene.boxes, sceneId);
    count(scene.boxes, 'scene', `Scene ${scene.id ?? `"${scene.heading}"`}`, scene.headingRange, sceneId);
    for (const box of scene.boxes) {
      if (box.kind !== 'quote') continue;
      const edit = (role: string) => {
        const target = template.callouts.find((c) => c.role === role && !c.meta);
        return target
          ? [{ title: `Make it a "${target.label}" box`, edits: [{ from: box.range.start.offset, to: box.range.start.offset, insert: `> ${header(target)}\n` }] }]
          : [];
      };
      const fixes = [...edit('readAloud'), ...edit('handout')];
      out.push(
        problem(
          'callout.quote.plain',
          'warning',
          'Plain quote in a scene: is it a read-aloud or a handout? Mark it with a callout type.',
          box.range,
          { sceneId, ...(fixes.length ? { fixes } : {}) },
        ),
      );
    }
  }

  for (const section of model.sections) {
    const list = boxes(section.blocks);
    each(list, undefined);
    if (section.role) count(list, section.role, `Section "${section.heading}"`, section.headingRange);
  }
  for (const sheet of model.sheets) each(boxes(sheet.blocks), undefined);
  if (model.pregenerated) {
    each(boxes(model.pregenerated.blocks), undefined);
    for (const character of model.pregenerated.characters) each(boxes(character.blocks), undefined);
  }
  return out;
};

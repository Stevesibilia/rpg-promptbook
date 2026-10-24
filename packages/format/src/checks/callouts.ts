import type { Block, BoxBlock, CalloutBlock, Problem } from '../model.js';
import type { AdventureTemplate, CalloutDefinition, Place } from '../template/schema.js';
import type { Check } from './index.js';
import { problem } from './util.js';

const header = (c: { type: string; meta?: string | null | undefined }) => `[!${c.type}${c.meta ? `|${c.meta}` : ''}]`;

const definitionOf = (template: AdventureTemplate, box: CalloutBlock): CalloutDefinition | undefined =>
  template.callouts.find((c) => c.type === box.type && (c.meta ?? null) === box.meta);

const boxes = (blocks: Block[]): BoxBlock[] =>
  blocks.filter((b): b is BoxBlock => b.kind === 'callout' || b.kind === 'quote');

// Where a box stands: a scene, a sheet, or a section with its role (null for a
// section the template gives no role).
type Where = { kind: 'scene' } | { kind: 'sheet' } | { kind: 'section'; role: Place | null };

const allowed = (definition: CalloutDefinition, where: Where): boolean =>
  where.kind === 'section'
    ? definition.allowedIn.includes('anySection') || (where.role !== null && definition.allowedIn.includes(where.role))
    : definition.allowedIn.includes(where.kind);

const placeName = (template: AdventureTemplate, place: Place): string => {
  if (place === 'scene') return 'scenes';
  if (place === 'sheet') return 'sheets';
  if (place === 'anySection') return 'any section';
  const section = template.sections.find((s) => s.role === place);
  return section ? `"${section.name}"` : place;
};

// Callout counts per place, titles, unknown types, places and plain quotes in
// scenes.
export const checkCallouts: Check = ({ model, template }) => {
  const out: Problem[] = [];
  const valid = template.callouts.map(header).join(', ');

  const each = (list: BoxBlock[], where: Where, sceneId: string | undefined) => {
    for (const box of list) {
      if (box.kind !== 'callout') continue;
      const definition = definitionOf(template, box);
      if (definition && !allowed(definition, where)) {
        out.push(
          problem(
            'callout.place',
            'warning',
            `A "${definition.label}" box ${header(box)} is not expected here; it belongs in ${definition.allowedIn.map((p) => placeName(template, p)).join(', ')}.`,
            box.headerRange,
            { sceneId },
          ),
        );
      }
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
    each(scene.boxes, { kind: 'scene' }, sceneId);
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
    each(list, { kind: 'section', role: section.role }, undefined);
    if (section.role) count(list, section.role, `Section "${section.heading}"`, section.headingRange);
  }
  // Pregenerated characters are sheets too.
  const sheet: Where = { kind: 'sheet' };
  for (const s of model.sheets) each(boxes(s.blocks), sheet, undefined);
  if (model.pregenerated) {
    each(boxes(model.pregenerated.blocks), sheet, undefined);
    for (const character of model.pregenerated.characters) each(boxes(character.blocks), sheet, undefined);
  }
  return out;
};

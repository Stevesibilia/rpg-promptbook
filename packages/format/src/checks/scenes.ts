import type { Problem, Scene, SceneField } from '../model.js';
import type { Source } from '../parse/source.js';
import { escapeRegExp } from '../parse/source.js';
import type { AdventureTemplate } from '../template/schema.js';
import type { Check } from './index.js';
import { missingSeverity, problem } from './util.js';

// The label paragraph of a field: up to the first blank line.
function paragraphEnd(source: Source, from: number): number {
  const blank = /\n[ \t]*\n/.exec(source.text.slice(from));
  return blank ? from + blank.index : source.text.length;
}

// Scene ids, fields (unknown, missing, run together) and the reactions table.
export const checkScenes: Check = ({ model, template, source }) => {
  const out: Problem[] = [];
  const seen = new Map<string, Scene>();
  const knownLabels = template.sceneFields.map((f) => f.label);
  const run = knownLabels.length
    ? new RegExp(`^\\*\\*(${knownLabels.map(escapeRegExp).join('|')})(?::|\\*\\*)`)
    : null;

  for (const scene of model.scenes) {
    const sceneId = scene.id ?? undefined;
    if (scene.id !== null) {
      if (seen.has(scene.id)) {
        out.push(
          problem('scene.id.duplicate', 'error', `Scene id ${scene.id} is used twice.`, scene.headingRange, { sceneId }),
        );
      } else seen.set(scene.id, scene);
    }

    for (const field of scene.fields) {
      if (!field.known) {
        out.push(
          problem(
            'scene.field.unknown',
            'error',
            `Scene field "${field.label}" is not in the template.`,
            field.labelRange,
            { sceneId, fixes: unknownFieldFixes(template, source, field) },
          ),
        );
      }
      if (run) out.push(...runTogether(source, field, run, sceneId));
    }

    for (const definition of template.sceneFields) {
      const severity = missingSeverity(definition.requirement);
      if (severity && !scene.fields.some((f) => f.label === definition.label)) {
        out.push(
          problem(
            'scene.field.missing',
            severity,
            `Scene ${scene.id ?? `"${scene.heading}"`} has no "${definition.label}" field.`,
            scene.headingRange,
            { sceneId },
          ),
        );
      }
    }

    const reactions = template.tables.reactions;
    const severity = missingSeverity(reactions.requirement);
    if (severity && !scene.reactions) {
      out.push(
        problem(
          'scene.reactions.missing',
          severity,
          `Scene ${scene.id ?? `"${scene.heading}"`} has no reactions table (first header starting "${reactions.firstHeader}").`,
          scene.headingRange,
          { sceneId },
        ),
      );
    }
  }
  return out;
};

// A second known label on a later line of the same paragraph.
function runTogether(source: Source, field: SceneField, run: RegExp, sceneId: string | undefined): Problem[] {
  const from = field.labelRange.start.offset;
  const paragraph = source.text.slice(from, paragraphEnd(source, from));
  const out: Problem[] = [];
  let offset = 0;
  for (const line of paragraph.split('\n')) {
    const match = offset > 0 ? run.exec(line) : null;
    if (match) {
      const start = from + offset;
      out.push(
        problem(
          'field.blank-line',
          'error',
          `"${match[1]}" starts on the line after "${field.label}"; a blank line is missing before it.`,
          source.range(start, start + 2 + match[1]!.length),
          { sceneId, fixes: [{ title: 'Add a blank line', edits: [{ from: start, to: start, insert: '\n' }] }] },
        ),
      );
    }
    offset += line.length + 1;
  }
  return out;
}

// Turns the field's paragraph, with the list or table that goes with it, into
// a "[!riquadro] Label" callout holding its text.
function unknownFieldFixes(template: AdventureTemplate, source: Source, field: SceneField) {
  const box = template.callouts.find((c) => c.role === 'box' && !c.meta);
  if (!box) return undefined;
  const bodyFrom = field.labelRange.end.offset + /^[:,]?[ \t]*/.exec(source.text.slice(field.labelRange.end.offset))![0].length;
  const body = source.text.slice(bodyFrom, field.range.end.offset).replace(/^\s*\n/, '').trimEnd();
  const lines = [`> [!${box.type}] ${field.label}`];
  if (body) lines.push(...body.split('\n').map((line) => (line.trim() ? `> ${line}` : '>')));
  return [
    {
      title: `Turn "${field.label}" into a "${box.label}" box`,
      edits: [{ from: field.labelRange.start.offset, to: field.range.end.offset, insert: lines.join('\n') }],
    },
  ];
}

import type { Problem } from '../model.js';
import { escapeRegExp } from '../parse/source.js';
import type { Check } from './index.js';
import { plural, problem } from './util.js';

// Revelations, clues in scenes, the tracker and the scene map against each
// other.
export const checkClues: Check = ({ model, template }) => {
  const out: Problem[] = [];
  const { revelationClues, revelationScenes } = template.limits;
  const revelationIds = new Set(model.revelations.map((r) => r.id));
  const sceneIds = new Set(model.scenes.flatMap((s) => (s.id ? [s.id] : [])));

  // Where each clue is written, by the scenes' own fields.
  const written = new Map<string, Set<string>>();
  for (const clue of model.clues) {
    if (clue.sceneId) written.set(clue.id, (written.get(clue.id) ?? new Set()).add(clue.sceneId));
  }
  const tracked = new Map(model.tracker.flatMap((row) => (row.clueId ? [[row.clueId, row] as const] : [])));

  for (const revelation of model.revelations) {
    // The clues the overview, the scenes and the tracker link to it.
    const ids = new Set(revelation.clues);
    for (const clue of model.clues) if (clue.revelations.includes(revelation.id)) ids.add(clue.id);
    for (const row of model.tracker) {
      if (row.clueId && row.revelations.includes(revelation.id)) ids.add(row.clueId);
    }
    if (ids.size < revelationClues) {
      out.push(
        problem(
          'clue.revelation.count',
          'error',
          `${revelation.id} has ${plural(ids.size, 'clue')} (minimum ${revelationClues}).`,
          revelation.range,
        ),
      );
      continue;
    }
    const scenes = new Set<string>();
    for (const id of ids) {
      for (const scene of written.get(id) ?? tracked.get(id)?.scenes ?? []) scenes.add(scene);
    }
    if (scenes.size > 0 && scenes.size < revelationScenes) {
      out.push(
        problem(
          'clue.revelation.scenes',
          'warning',
          `The clues of ${revelation.id} are all in ${[...scenes].join(', ')}; spread them over at least ${revelationScenes} scenes.`,
          revelation.range,
        ),
      );
    }
  }

  for (const clue of model.clues) {
    for (const id of clue.revelations) {
      if (!revelationIds.has(id)) {
        out.push(
          problem('clue.revelation.missing', 'error', `Clue ${clue.id} points at ${id}, which does not exist.`, clue.range, {
            sceneId: clue.sceneId ?? undefined,
          }),
        );
      }
    }
  }

  for (const row of model.tracker) {
    const name = row.clueId ?? 'A tracker row';
    for (const id of row.revelations) {
      if (!revelationIds.has(id)) {
        out.push(problem('clue.revelation.missing', 'error', `Clue ${name} points at ${id}, which does not exist.`, row.range));
      }
    }
    for (const id of row.scenes) {
      if (!sceneIds.has(id)) {
        out.push(problem('clue.scene.missing', 'error', `Clue ${name} points at scene ${id}, which does not exist.`, row.range));
      }
    }
    const where = row.clueId ? written.get(row.clueId) : undefined;
    if (row.clueId && !where) {
      out.push(problem('clue.tracker.unwritten', 'error', `Clue ${row.clueId} is in the tracker but written in no scene.`, row.range));
    } else if (where && row.scenes.some((s) => sceneIds.has(s) && !where.has(s))) {
      out.push(
        problem(
          'clue.tracker.scene',
          'warning',
          `The tracker puts ${row.clueId} in ${row.scenes.join(', ')}, but it is written in ${[...where].join(', ')}.`,
          row.range,
        ),
      );
    }
  }

  const mapped = new Set(model.sceneMap.flatMap((r) => (r.sceneId ? [r.sceneId] : [])));
  if (model.sections.some((s) => s.role === 'sceneMap')) {
    for (const scene of model.scenes) {
      if (scene.id && !mapped.has(scene.id)) {
        out.push(
          problem('map.scene.missing', 'error', `Scene ${scene.id} is not in the scene map.`, scene.headingRange, {
            sceneId: scene.id,
          }),
        );
      }
    }
    for (const row of model.sceneMap) {
      if (!row.sceneId || !sceneIds.has(row.sceneId)) {
        out.push(
          problem(
            'map.row.orphan',
            'error',
            `The scene map has a row for ${row.sceneId ?? 'no scene id'}, which is not a scene.`,
            row.range,
          ),
        );
      }
    }
  }

  // "Indizi qui" with clue numbers and no text.
  const label = template.sceneFields.find((f) => f.role === 'clues')?.label;
  const idPattern = `\\b(?:${escapeRegExp(template.ids.clue)}|${escapeRegExp(template.ids.revelation)})\\d+\\b`;
  const bare = (text: string) =>
    new RegExp(idPattern).test(text) && text.replace(new RegExp(idPattern, 'g'), '').replace(/[\s,;.()·\-*_]/g, '') === '';
  for (const scene of model.scenes) {
    for (const field of scene.fields.filter((f) => f.label === label)) {
      const items = field.blocks.flatMap((b) => (b.kind === 'list' ? b.items : []));
      const entries = [...(field.text ? [{ text: field.text, range: field.range }] : []), ...items];
      for (const entry of entries.filter((e) => bare(e.text))) {
        out.push(
          problem(
            'clue.text.missing',
            'error',
            `"${label}" in ${scene.id ?? 'a scene'} has clue numbers but no text: "${entry.text.trim()}".`,
            entry.range,
            { sceneId: scene.id ?? undefined },
          ),
        );
      }
    }
  }
  return out;
};

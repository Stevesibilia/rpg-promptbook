import type { Problem } from '../model.js';
import { escapeRegExp } from '../parse/source.js';
import type { Check } from './index.js';
import { problem } from './util.js';

// The appendix against the scenes, by id, and its keys outside it.
export const checkAppendix: Check = ({ model, template, source }) => {
  const out: Problem[] = [];
  const { visual, mood } = template.appendix;
  const appendices = model.sections.filter((s) => s.role === 'appendix');

  if (appendices.length > 0) {
    const sceneIds = new Set(model.scenes.flatMap((s) => (s.id ? [s.id] : [])));
    for (const scene of model.scenes) {
      if (scene.id && !model.appendix.some((r) => r.sceneId === scene.id)) {
        out.push(
          problem('appendix.row.missing', 'warning', `Scene ${scene.id} has no row in the appendix.`, scene.headingRange, {
            sceneId: scene.id,
          }),
        );
      }
    }
    for (const row of model.appendix) {
      const scene = model.scenes.find((s) => s.id !== null && s.id === row.sceneId);
      if (!scene) {
        out.push(
          problem(
            'appendix.row.orphan',
            'warning',
            `The appendix has a row "${row.heading}" that matches no scene id.`,
            row.headingRange,
          ),
        );
      } else if (scene.title !== row.title) {
        out.push(
          problem(
            'appendix.title.mismatch',
            'warning',
            `The appendix row for ${scene.id} is titled "${row.title}", the scene "${scene.title}".`,
            row.headingRange,
            { sceneId: scene.id! },
          ),
        );
      }
      for (const [key, value] of [[visual, row.visual], [mood, row.mood]] as const) {
        if (!value) {
          out.push(
            problem('appendix.key.missing', 'warning', `The appendix row "${row.heading}" has no "${key}:".`, row.headingRange, {
              sceneId: row.sceneId ?? undefined,
            }),
          );
        }
      }
    }
  }

  const inside = [model.meta.range, ...appendices.map((s) => s.range)].filter((r) => r !== null);
  const key = new RegExp(`^[ \\t]*(${escapeRegExp(visual)}|${escapeRegExp(mood)}):`, 'gm');
  for (const match of source.text.matchAll(key)) {
    const start = match.index + match[0].indexOf(match[1]!);
    if (inside.some((r) => r.start.offset <= start && start < r.end.offset)) continue;
    out.push(
      problem(
        'appendix.key.outside',
        'error',
        `"${match[1]}:" belongs in the appendix, under the scene's row.`,
        source.range(start, start + match[1]!.length + 1),
      ),
    );
  }
  return out;
};

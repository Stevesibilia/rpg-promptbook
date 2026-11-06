import { findSystem } from '../systems.js';
import type { Check } from './index.js';
import { problem } from './util.js';

// A front matter that names a game system no list holds: its sheets are then
// plain text, with no threat box.
export const checkSystem: Check = ({ model, template, systems }) => {
  const key = template.meta.find((m) => m.role === 'system')?.key;
  const entry = key === undefined ? undefined : model.meta.entries.find((e) => e.key === key);
  if (!entry || typeof entry.value !== 'string' || !entry.value.trim() || findSystem(systems, entry.value)) return [];
  const known = systems.map((s) => s.name).join(', ');
  return [
    problem(
      'system.unknown',
      'warning',
      `No game system is called "${entry.value.trim()}", so its sheets have no threat box. Known systems: ${known}.`,
      entry.keyRange,
    ),
  ];
};

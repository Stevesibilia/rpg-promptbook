import { ChangeSet, Text } from '@codemirror/state';
import { parseAdventure, templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { currentLicence, licenceEdits } from '../src/editor/licence.js';
import { LICENCES } from '../src/licence/licences.js';

const doc = (lines: string[]) => Text.of(lines);
// The text once the edits for `value` are applied.
const after = (lines: string[], value: string) => {
  const text = doc(lines);
  return ChangeSet.of(licenceEdits(text, value), text.length).apply(text).toString();
};

const fm = (...keys: string[]) => ['---', 'titolo: La casa', ...keys, '---', '', '## Scene', ''];

describe('licenceEdits', () => {
  it('replaces the value of the licenza line', () => {
    expect(after(fm('copyright: © 2026', 'licenza: CC-BY-4.0'), 'CC0-1.0')).toBe(
      fm('copyright: © 2026', 'licenza: CC0-1.0').join('\n'),
    );
  });

  it('fills an empty licenza line', () => {
    expect(after(fm('licenza:', 'autore: Stefano'), 'CC-BY-SA-4.0')).toBe(
      fm('licenza: CC-BY-SA-4.0', 'autore: Stefano').join('\n'),
    );
  });

  it('removes the other lines of a value on several lines', () => {
    expect(after(fm('licenza: Uso', '  personale', 'autore: Stefano'), 'CC-BY-4.0')).toBe(
      fm('licenza: CC-BY-4.0', 'autore: Stefano').join('\n'),
    );
    expect(after(fm('licenza: >-', '  Tutti i diritti', '', '  riservati'), 'CC-BY-4.0')).toBe(
      fm('licenza: CC-BY-4.0').join('\n'),
    );
  });

  it('ignores a licenza in the body or under another key', () => {
    const lines = ['---', 'titolo: La casa', 'extra:', '  licenza: no', 'copyright: © 2026', '---', 'licenza: body'];
    expect(after(lines, 'CC0-1.0')).toBe(
      ['---', 'titolo: La casa', 'extra:', '  licenza: no', 'copyright: © 2026', 'licenza: CC0-1.0', '---', 'licenza: body'].join(
        '\n',
      ),
    );
  });

  it('adds the line after copyright and its other lines', () => {
    expect(after(fm('copyright: © 2026', '  Stefano', 'autore: Stefano'), 'CC0-1.0')).toBe(
      fm('copyright: © 2026', '  Stefano', 'licenza: CC0-1.0', 'autore: Stefano').join('\n'),
    );
  });

  it('adds the line last without copyright, before --- or ...', () => {
    expect(after(fm('autore: Stefano'), 'CC0-1.0')).toBe(fm('autore: Stefano', 'licenza: CC0-1.0').join('\n'));
    expect(after(['---', 'titolo: La casa', '...', 'testo'], 'CC0-1.0')).toBe(
      ['---', 'titolo: La casa', 'licenza: CC0-1.0', '...', 'testo'].join('\n'),
    );
  });

  it('adds a front matter of its own when there is none', () => {
    expect(after(['## Scene', ''], 'CC0-1.0')).toBe(['---', 'licenza: CC0-1.0', '---', '## Scene', ''].join('\n'));
  });

  it('writes nothing for the value already there', () => {
    expect(licenceEdits(doc(fm('licenza: CC0-1.0')), 'CC0-1.0')).toEqual([]);
  });

  it('writes each of the eight values as the format reads it', () => {
    for (const { value } of LICENCES) {
      const text = after(fm('copyright: © 2026', 'licenza: Uso personale'), value);
      const result = parseAdventure(text, { template: templates.avventura });
      expect(result.model.meta.licence).toEqual({ text: value, spdx: value !== 'Tutti i diritti riservati' });
      expect(result.problems.filter((p) => p.code === 'meta.licence.unknown')).toEqual([]);
    }
  });
});

describe('currentLicence', () => {
  it('reads a plain or quoted value', () => {
    expect(currentLicence(doc(fm('licenza:   CC-BY-4.0  ')))).toBe('CC-BY-4.0');
    expect(currentLicence(doc(fm('licenza: "CC-BY-4.0"')))).toBe('CC-BY-4.0');
    expect(currentLicence(doc(fm("licenza: 'Uso personale'")))).toBe('Uso personale');
    expect(currentLicence(doc(fm('licenza: CC-BY-4.0 # mine')))).toBe('CC-BY-4.0');
    expect(currentLicence(doc(fm('licenza: "Uso # personale"')))).toBe('Uso # personale');
  });

  it('answers empty for an empty or missing line, or no front matter', () => {
    expect(currentLicence(doc(fm('licenza:')))).toBe('');
    expect(currentLicence(doc(fm('autore: Stefano')))).toBe('');
    expect(currentLicence(doc(['licenza: CC0-1.0']))).toBe('');
  });

  it('joins a value on several lines, without its block indicator', () => {
    expect(currentLicence(doc(fm('licenza: Uso', '  personale', 'autore: Stefano')))).toBe('Uso personale');
    expect(currentLicence(doc(fm('licenza: >-', '  Tutti i diritti', '  riservati')))).toBe('Tutti i diritti riservati');
    expect(currentLicence(doc(fm('licenza: >2-', '  Uso personale')))).toBe('Uso personale');
    expect(currentLicence(doc(fm('licenza: |+', '  Uso personale')))).toBe('Uso personale');
  });
});

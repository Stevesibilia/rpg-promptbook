import { describe, expect, it } from 'vitest';
import { parsePdfOptions, pdfOptionsKey } from '../src/editor/pdf/options.js';

describe('the print options', () => {
  it('are kept per project', () => {
    expect(pdfOptionsKey('abc')).toBe('promptbook.pdf.abc');
  });

  it('default to A4, ink saver off, pregenerated sheets on', () => {
    const defaults = { paper: 'a4', inkSaver: false, pregenerated: true, template: 'avventura@1' };
    expect(parsePdfOptions(null)).toEqual(defaults);
    expect(parsePdfOptions('not json')).toEqual(defaults);
    expect(parsePdfOptions('null')).toEqual(defaults);
    expect(parsePdfOptions('[1]')).toEqual(defaults);
  });

  it('read back what was stored, and nothing unknown', () => {
    expect(parsePdfOptions('{"paper":"us-letter","inkSaver":true,"pregenerated":false}')).toEqual({
      paper: 'us-letter',
      inkSaver: true,
      pregenerated: false,
      template: 'avventura@1',
    });
    expect(parsePdfOptions('{"paper":"a5","inkSaver":"yes","template":"other@9"}')).toEqual({
      paper: 'a4',
      inkSaver: false,
      pregenerated: true,
      template: 'avventura@1',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { licenceShort, licenceUrl } from '../src/index.js';

describe('licenceShort', () => {
  it('prints a Creative Commons id in its short form', () => {
    expect(licenceShort({ text: 'CC-BY-NC-SA-4.0', spdx: true })).toBe('CC BY-NC-SA 4.0');
    expect(licenceShort({ text: 'CC-BY-4.0', spdx: true })).toBe('CC BY 4.0');
  });

  it('prints any other SPDX id as it is', () => {
    expect(licenceShort({ text: 'MIT', spdx: true })).toBe('MIT');
    expect(licenceShort({ text: 'CC0-1.0', spdx: true })).toBe('CC0-1.0');
  });

  it('prints free text as written', () => {
    expect(licenceShort({ text: 'Tutti i diritti riservati', spdx: false })).toBe('Tutti i diritti riservati');
    expect(licenceShort({ text: 'CC-qualcosa', spdx: false })).toBe('CC-qualcosa');
  });
});

describe('licenceUrl', () => {
  it('links an SPDX id to its page', () => {
    expect(licenceUrl({ text: 'CC-BY-NC-SA-4.0', spdx: true })).toBe(
      'https://spdx.org/licenses/CC-BY-NC-SA-4.0.html',
    );
  });

  it('has no link for free text', () => {
    expect(licenceUrl({ text: 'Tutti i diritti riservati', spdx: false })).toBeNull();
  });
});

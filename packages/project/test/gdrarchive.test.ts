import { describe, expect, it } from 'vitest';
import { GDRARCHIVE_ORIGIN, gdrarchiveOf, parseGdrarchiveUrl, readGdrarchive } from '../src/index.js';

const UUID = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b';
const kulthos = { url: `${GDRARCHIVE_ORIGIN}/campaigns/12`, label: 'Kulthos' };
const own = { url: `${GDRARCHIVE_ORIGIN}/campaigns/31`, label: 'Serate Kulthos' };
const campaign = { id: 'c1', title: 'Kulthos', gdrarchive: kulthos };

describe('parseGdrarchiveUrl', () => {
  it('accepts a campaign address with a UUID or a short id', () => {
    expect(parseGdrarchiveUrl(`https://gdrarchive.siberio.eu/campaigns/${UUID}`)).toBe(
      `https://gdrarchive.siberio.eu/campaigns/${UUID}`,
    );
    expect(parseGdrarchiveUrl('https://gdrarchive.siberio.eu/campaigns/12')).toBe(kulthos.url);
    expect(parseGdrarchiveUrl(`https://gdrarchive.siberio.eu/campaigns/${'a'.repeat(64)}`)).not.toBeNull();
  });

  it('drops one trailing slash and trims spaces', () => {
    expect(parseGdrarchiveUrl('https://gdrarchive.siberio.eu/campaigns/12/')).toBe(kulthos.url);
    expect(parseGdrarchiveUrl('  https://gdrarchive.siberio.eu/campaigns/12/ \n')).toBe(kulthos.url);
  });

  it('refuses any other address', () => {
    for (const input of [
      'http://gdrarchive.siberio.eu/campaigns/12',
      'https://gdrarchive.example.eu/campaigns/12',
      'https://www.gdrarchive.siberio.eu/campaigns/12',
      'https://gdrarchiveXsiberio.eu/campaigns/12',
      'https://gdrarchive.siberio.eu/campaigns/12?tab=codex',
      'https://gdrarchive.siberio.eu/campaigns/12#sessions',
      'https://gdrarchive.siberio.eu/sessions/48',
      'https://gdrarchive.siberio.eu/campaigns/12/sessions/48',
      'https://gdrarchive.siberio.eu/campaigns/',
      'https://gdrarchive.siberio.eu/campaigns',
      `https://gdrarchive.siberio.eu/campaigns/${'a'.repeat(65)}`,
      'https://gdrarchive.siberio.eu/campaigns/12//',
      'https://gdrarchive.siberio.eu/campaigns/1 2',
      'https://user@gdrarchive.siberio.eu/campaigns/12',
      'https://gdrarchive.siberio.eu:443/campaigns/12',
      '',
    ]) {
      expect(parseGdrarchiveUrl(input), input).toBeNull();
    }
  });
});

describe('readGdrarchive', () => {
  it('reads a valid link', () => {
    expect(readGdrarchive(kulthos)).toEqual(kulthos);
    expect(readGdrarchive({ url: kulthos.url, label: '' })).toEqual({ url: kulthos.url, label: '' });
  });

  it('reads anything else as no link, whole', () => {
    for (const value of [
      undefined,
      null,
      kulthos.url,
      42,
      [],
      { url: 'https://example.com/campaigns/12', label: 'Kulthos' },
      { url: `${kulthos.url}/`, label: 'Kulthos' },
      { url: kulthos.url },
      { url: kulthos.url, label: 7 },
      { url: kulthos.url, label: ' Kulthos' },
      { url: kulthos.url, label: 'x'.repeat(41) },
      { label: 'Kulthos' },
    ]) {
      expect(readGdrarchive(value), JSON.stringify(value)).toBeNull();
    }
  });

  it('answers only the two fields', () => {
    expect(readGdrarchive({ ...kulthos, extra: true })).toEqual(kulthos);
  });
});

describe('gdrarchiveOf', () => {
  it('answers the own link over the campaign’s', () => {
    expect(gdrarchiveOf(own, 'adventure', campaign)).toEqual({ ...own, from: null });
  });

  it('lets an adventure or a one-shot inherit its campaign’s link', () => {
    expect(gdrarchiveOf(null, 'adventure', campaign)).toEqual({ ...kulthos, from: { id: 'c1', title: 'Kulthos' } });
    expect(gdrarchiveOf(null, 'one-shot', campaign)).toEqual({ ...kulthos, from: { id: 'c1', title: 'Kulthos' } });
  });

  it('answers null for a stand-alone project with no link', () => {
    expect(gdrarchiveOf(null, 'one-shot', null)).toBeNull();
  });

  it('never lets a campaign inherit', () => {
    expect(gdrarchiveOf(null, 'campaign', campaign)).toBeNull();
    expect(gdrarchiveOf(own, 'campaign', campaign)).toEqual({ ...own, from: null });
  });

  it('answers null for a campaign with no link, or a row from before the change', () => {
    expect(gdrarchiveOf(null, 'adventure', { id: 'c1', title: 'Kulthos', gdrarchive: null })).toBeNull();
    expect(gdrarchiveOf(null, 'adventure', { id: 'c1', title: 'Kulthos' })).toBeNull();
  });
});

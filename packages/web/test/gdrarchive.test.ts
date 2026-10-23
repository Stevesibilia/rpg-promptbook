import { describe, expect, it } from 'vitest';
import { formPreview, linkText, linkTitle, saveAction, WRONG_ADDRESS } from '../src/projects/gdrarchive.js';

const URL12 = 'https://gdrarchive.siberio.eu/campaigns/12';
const kulthos = { url: URL12, label: 'Kulthos' };
const from = { id: 'c1', title: 'Kulthos' };

describe('the gdrarchive link texts', () => {
  it('reads «gdrarchive · <label>», or «gdrarchive campaign» with no label', () => {
    expect(linkText('Kulthos')).toBe('gdrarchive · Kulthos');
    expect(linkText('')).toBe('gdrarchive campaign');
  });

  it('names the campaign of an inherited link in the top bar only', () => {
    expect(linkTitle({ ...kulthos, from: null }, false)).toBe(`Opens ${URL12} in a new tab`);
    expect(linkTitle({ ...kulthos, from: null }, true)).toBe(`Opens ${URL12} in a new tab`);
    expect(linkTitle({ ...kulthos, from }, false)).toBe(`Opens ${URL12} in a new tab`);
    expect(linkTitle({ ...kulthos, from }, true)).toBe(`From campaign Kulthos. Opens ${URL12} in a new tab`);
  });

  it('shows the error message of the mockup', () => {
    expect(WRONG_ADDRESS).toBe('Paste a gdrarchive campaign address, like https://gdrarchive.siberio.eu/campaigns/12');
  });
});

describe('formPreview', () => {
  it('shows the link as it will read, with the label trimmed', () => {
    expect(formPreview(URL12, '  Kulthos ', null)).toEqual({ shows: 'gdrarchive · Kulthos' });
    expect(formPreview(URL12, '   ', null)).toEqual({ shows: 'gdrarchive campaign' });
    expect(formPreview('', '', null)).toEqual({ shows: 'gdrarchive campaign' });
  });

  it('says what an empty address keeps on a project that inherits', () => {
    expect(formPreview('  ', 'Ancora', from)).toEqual({ keeps: 'Kulthos' });
    expect(formPreview(URL12, 'Ancora', from)).toEqual({ shows: 'gdrarchive · Ancora' });
  });
});

describe('saveAction', () => {
  it('writes a valid address without its trailing slash, the label trimmed', () => {
    expect(saveAction(` ${URL12}/ `, ' Kulthos ', null)).toEqual(kulthos);
    expect(saveAction(URL12, '', null)).toEqual({ url: URL12, label: '' });
  });

  it('refuses a wrong address', () => {
    expect(saveAction('https://gdrarchive.siberio.eu/sessions/48', 'Kulthos', null)).toBe('invalid');
    expect(saveAction('gdrarchive', '', kulthos)).toBe('invalid');
  });

  it('closes the form on an empty address without a link of its own', () => {
    expect(saveAction('', 'Kulthos', null)).toBe('cancel');
    expect(saveAction('   ', '', null)).toBe('cancel');
  });

  it('calls an empty address a wrong one when the project has a link of its own', () => {
    expect(saveAction('', '', kulthos)).toBe('invalid');
  });

  it('writes nothing when nothing changed', () => {
    expect(saveAction(`${URL12}/`, 'Kulthos ', kulthos)).toBe('unchanged');
    expect(saveAction(URL12, 'Gabbiano', kulthos)).toEqual({ url: URL12, label: 'Gabbiano' });
    expect(saveAction('https://gdrarchive.siberio.eu/campaigns/7', 'Kulthos', kulthos)).toEqual({
      url: 'https://gdrarchive.siberio.eu/campaigns/7',
      label: 'Kulthos',
    });
  });

  it('never answers a label longer than 40 characters', () => {
    const link = saveAction(URL12, 'x'.repeat(45), null);
    expect(link).toEqual({ url: URL12, label: 'x'.repeat(40) });
  });
});

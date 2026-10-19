import { describe, expect, it } from 'vitest';
import { baseKeymap, keyLabel, matchShortcut } from '../src/editor/cm/keymap.js';

const key = (init: Partial<KeyboardEvent>) =>
  ({ key: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...init }) as KeyboardEvent;

describe('the shortcut table', () => {
  it('labels keys as the keyboard shows them', () => {
    expect(keyLabel('Mod-k', true)).toBe('⌘K');
    expect(keyLabel('Mod-k', false)).toBe('Ctrl+K');
    expect(keyLabel('Shift-F8', true)).toBe('⇧F8');
    expect(keyLabel('Mod-.', false)).toBe('Ctrl+.');
    expect(keyLabel('Mod-Shift-p', true)).toBe('⌘⇧P');
    expect(keyLabel('Mod-Shift-p', false)).toBe('Ctrl+Shift+P');
  });

  it('matches Mod to ⌘ on the Mac and Ctrl elsewhere', () => {
    expect(matchShortcut(key({ key: '1', metaKey: true }), true)).toBe('outline');
    expect(matchShortcut(key({ key: '1', ctrlKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ key: '2', ctrlKey: true }), false)).toBe('inspector');
    expect(matchShortcut(key({ key: 'K', metaKey: true }), true)).toBe('palette');
    expect(matchShortcut(key({ key: 'P', metaKey: true, shiftKey: true }), true)).toBe('pdfReview');
    expect(matchShortcut(key({ key: 'P', ctrlKey: true, shiftKey: true }), false)).toBe('pdfReview');
    expect(matchShortcut(key({ key: 'p', metaKey: true }), true)).toBeNull();
  });

  it('ignores Shift for a key typed as a symbol, not for F8', () => {
    // "/" is Shift-7 on an Italian keyboard.
    expect(matchShortcut(key({ key: '/', metaKey: true, shiftKey: true }), true)).toBe('syntax');
    expect(matchShortcut(key({ key: 'F8' }), true)).toBe('nextProblem');
    expect(matchShortcut(key({ key: 'F8', shiftKey: true }), true)).toBe('previousProblem');
    expect(matchShortcut(key({ key: 'Escape' }), true)).toBe('escape');
    expect(matchShortcut(key({ key: 'k', metaKey: true, altKey: true }), true)).toBeNull();
  });

  it('leaves Mod-/ to the syntax sheet, not to comments', () => {
    expect(baseKeymap.some((b) => b.key === 'Mod-/')).toBe(false);
  });
});

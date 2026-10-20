import { describe, expect, it } from 'vitest';
import { noteLines } from '../src/desktop/Updates.js';

describe("What's new", () => {
  it('reads GitHub Markdown notes as list items, without headings', () => {
    expect(noteLines("## What's Changed\n* **History** shows this device.\n- Fixed: the outline.\n\nThanks")).toEqual([
      { item: true, text: '**History** shows this device.' },
      { item: true, text: 'Fixed: the outline.' },
      { item: false, text: 'Thanks' },
    ]);
  });

  it("reads electron-updater's HTML notes", () => {
    expect(noteLines('<ul><li>Sign out can remove the projects.</li><li>PDF: scene numbers.</li></ul>')).toEqual([
      { item: true, text: 'Sign out can remove the projects.' },
      { item: true, text: 'PDF: scene numbers.' },
    ]);
  });
});

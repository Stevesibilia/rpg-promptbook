import { describe, expect, it } from 'vitest';
import type { DesktopProjectStatus } from '../src/platform/bridge.js';
import { notOnServer, signOutTexts } from '../src/desktop/SignOutDialog.js';

const project = (title: string, patch: Partial<DesktopProjectStatus> = {}): DesktopProjectStatus => ({
  id: title,
  title,
  downloaded: true,
  bytes: 0,
  filesMissing: 0,
  fileBytes: 0,
  localOnly: false,
  refused: false,
  synced: true,
  unsynced: 0,
  notSaved: 0,
  ...patch,
});

const pending = [
  { title: "L'Ancora di Sabaoth", changes: 2 },
  { title: 'Il ballo dei Lorenzetti', changes: 1 },
];

describe('the sign-out dialog', () => {
  it('keeps the projects when not ticked, whatever is waiting', () => {
    expect(signOutTexts(false, pending)).toEqual({
      warning: null,
      note: 'Sign in again to sync. Nothing is downloaded twice.',
      action: 'Sign out',
      danger: false,
    });
  });

  it('warns in red, naming the changes, when ticked with changes not on the server', () => {
    expect(signOutTexts(true, pending)).toEqual({
      warning: "3 changes not yet on the server: L'Ancora di Sabaoth (2), Il ballo dei Lorenzetti (1).",
      note: 'Cancel, then sync when you are online, to keep them.',
      action: 'Sign out and remove',
      danger: true,
    });
  });

  it('removes without a warning when everything is on the server', () => {
    expect(signOutTexts(true, [])).toEqual({
      warning: null,
      note: 'Everything is on the server: signing in again downloads it.',
      action: 'Sign out and remove',
      danger: false,
    });
  });

  it('counts the board files not yet uploaded with the changes', () => {
    expect(signOutTexts(true, pending, 4).warning).toBe(
      "3 changes not yet on the server: L'Ancora di Sabaoth (2), Il ballo dei Lorenzetti (1), and 4 files not yet uploaded.",
    );
    expect(signOutTexts(true, [], 4)).toMatchObject({
      warning: '4 files not yet uploaded.',
      action: 'Sign out and remove',
      danger: true,
    });
    expect(signOutTexts(true, [], 1).warning).toBe('1 file not yet uploaded.');
    expect(signOutTexts(false, [], 4).warning).toBeNull();
  });

  it('counts edits, writes kept in memory and projects made here not uploaded', () => {
    expect(
      notOnServer([
        project('Synced'),
        project("L'Ancora di Sabaoth", { unsynced: 2 }),
        project('Disco pieno', { notSaved: 3, unsynced: 1 }),
        project('La fiera di Randazzo', { localOnly: true }),
      ]),
    ).toEqual([
      { title: "L'Ancora di Sabaoth", changes: 2 },
      { title: 'Disco pieno', changes: 3 },
      { title: 'La fiera di Randazzo', changes: 1 },
    ]);
  });
});

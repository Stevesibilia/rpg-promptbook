import { describe, expect, it } from 'vitest';
import { popoverLine, statusSyncText } from '../src/desktop/SyncStates.js';
import type { DesktopProjectStatus } from '../src/platform/bridge.js';
import { desktopSnapshot } from '../src/platform/desktopRegistry.js';
import { status } from './fake-bridge.js';

// The desktop's sync texts for the cases main's status alone decides.

const project = (patch: Partial<DesktopProjectStatus> = {}): DesktopProjectStatus => ({
  id: '7d1c2b3a-0000-4000-8000-000000000001',
  title: "L'Ancora di Sabaoth",
  downloaded: true,
  bytes: 1400,
  filesMissing: 0,
  fileBytes: 0,
  localOnly: false,
  refused: false,
  synced: false,
  unsynced: 0,
  notSaved: 0,
  ...patch,
});

const offline = (projects: DesktopProjectStatus[]) =>
  desktopSnapshot(status({ online: false, offlineSince: '2026-10-20T10:05:00.000Z', projects }), 'active');

describe('desktop sync texts', () => {
  it('says how many changes wait offline, or that none do', () => {
    expect(statusSyncText(offline([project({ unsynced: 3 })]))).toEqual({
      text: 'Offline · 3 changes on this device',
      tone: 'a',
    });
    expect(statusSyncText(offline([project()]))).toEqual({ text: 'Offline · nothing waiting to sync', tone: 'a' });
    expect(statusSyncText(offline([]))).toEqual({ text: 'Offline · nothing waiting to sync', tone: 'a' });
  });

  it('counts the board files waiting to upload while offline', () => {
    expect(statusSyncText(offline([project()]), 4)).toEqual({ text: 'Offline · 4 files waiting to upload', tone: 'a' });
    expect(statusSyncText(offline([project({ unsynced: 3 })]), 1)).toEqual({
      text: 'Offline · 3 changes on this device · 1 file waiting to upload',
      tone: 'a',
    });
  });

  it('keeps a refused project on this device instead of syncing for ever', () => {
    const snapshot = desktopSnapshot(
      status({ projects: [project({ localOnly: true, refused: true, unsynced: 1 }), project({ id: 'b', synced: true })] }),
      'active',
    );
    expect(snapshot.state).toBe('local');
    expect(popoverLine(snapshot)).toBe('The server refused this project; it stays on this computer.');
    expect(statusSyncText(snapshot)).toEqual({ text: 'On this device only', tone: 'a' });
  });

  it('reads offline as offline, refused project or not', () => {
    const snapshot = offline([project({ localOnly: true, refused: true, unsynced: 1 })]);
    expect(popoverLine(snapshot)).toMatch(/^Offline since \d\d:\d\d\. Everything is saved here/);
    expect(statusSyncText(snapshot).text).toBe('Offline · 1 change on this device');
  });
});

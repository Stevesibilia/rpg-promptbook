import { hideProblem, readHidden } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';
import { hidingActions } from '../src/editor/hiding.js';
import type { ToastAction } from '../src/ui/Toast.js';
import { parse } from './analysed.js';

// Hide, restore and Undo with their toasts (hide-problems design decisions 8
// and 14), on two replicas of one project.

const problems = parse(sabaoth).problems;
const unknown = problems.find((p) => p.code === 'scene.field.unknown')!;
const threat = problems.find((p) => p.code === 'ref.threat.outside')!;

function replicas() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (u: Uint8Array) => Y.applyUpdate(b, u, 'a'));
  b.on('update', (u: Uint8Array, origin: unknown) => origin !== 'a' && Y.applyUpdate(a, u));
  const toasts: { message: string; action?: ToastAction | undefined }[] = [];
  const actions = hidingActions(a, (message, action) => toasts.push({ message, action }));
  return { a, b, toasts, actions, last: () => toasts.at(-1)! };
}

const how = (doc: Y.Doc) => [...readHidden(doc).values()].map((e) => e.how);

describe('hiding with Undo', () => {
  it('dismisses, and Undo shows the problem again once', () => {
    const { a, actions, last, toasts } = replicas();
    actions.hide(unknown, sabaoth, 'dismiss');
    expect(last().message).toBe('Problem dismissed');
    expect(how(a)).toEqual(['dismissed']);
    const undo = last().action!;
    undo.run();
    expect(last().message).toBe('Undone');
    expect(how(a)).toEqual([]);
    // A second click does nothing more.
    const shown = toasts.length;
    undo.run();
    expect(toasts).toHaveLength(shown);
  });

  it('says when a snooze ends', () => {
    const { actions, last } = replicas();
    actions.hide(threat, sabaoth, 'week');
    expect(last().message).toMatch(/^Snoozed until \w{3} \d{1,2} \w{3}( \d{4})?$/);
  });

  it('leaves alone a key another device changed after a restore', () => {
    const { a, b, actions, last } = replicas();
    actions.hide(unknown, sabaoth, 'dismiss');
    const [key] = readHidden(a).keys();
    actions.restore(key!);
    expect(last().message).toBe('Problem restored');
    const undo = last().action!;
    hideProblem(b, unknown, sabaoth, 'snoozed', new Date(Date.now() + 86_400_000).toISOString(), new Date());
    undo.run();
    expect(last().message).toBe('Nothing undone: changed on another device');
    expect(how(a)).toEqual(['snoozed']);
    expect(how(b)).toEqual(['snoozed']);
  });

  it('leaves alone a key another device hid again after a hide', () => {
    const { a, b, actions, last } = replicas();
    actions.hide(unknown, sabaoth, 'week');
    const undo = last().action!;
    // Written a millisecond later, so its time differs.
    hideProblem(b, unknown, sabaoth, 'dismissed', null, new Date(Date.now() + 1));
    undo.run();
    expect(how(a)).toEqual(['dismissed']);
  });

  it('restores all, counting the rows, and Undo hides them again', () => {
    const { a, actions, last } = replicas();
    actions.hide(unknown, sabaoth, 'dismiss');
    actions.hide(threat, sabaoth, 'day');
    actions.restoreAll([...readHidden(a).keys()]);
    expect(last().message).toBe('2 problems restored');
    expect(how(a)).toEqual([]);
    last().action!.run();
    expect(how(a).sort()).toEqual(['dismissed', 'snoozed']);
  });
});

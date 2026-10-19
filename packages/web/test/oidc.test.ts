import { afterEach, describe, expect, it } from 'vitest';
import { announceSignedIn, onSignedInElsewhere } from '../src/auth/channel.js';
import { failureMessage, signInFailure, singleFlight, startUrl, withoutSignIn } from '../src/auth/oidc.js';

describe('the sign-in reason in the address', () => {
  it('reads the three reasons and ignores anything else', () => {
    expect(signInFailure('?sign_in=cancelled')).toBe('cancelled');
    expect(signInFailure('?a=1&sign_in=unreachable')).toBe('unreachable');
    expect(signInFailure('?sign_in=failed')).toBe('failed');
    expect(signInFailure('?sign_in=nope')).toBeNull();
    expect(signInFailure('')).toBeNull();
  });

  it('is removed, and the rest of the query kept', () => {
    expect(withoutSignIn('?sign_in=failed')).toBe('');
    expect(withoutSignIn('?bin=1&sign_in=failed')).toBe('?bin=1');
    expect(withoutSignIn('')).toBe('');
  });

  it('has the messages of the mockup', () => {
    expect(failureMessage('cancelled', 'Authentik')).toBe('Sign-in was cancelled or took too long. Try again.');
    expect(failureMessage('unreachable', 'Authentik')).toBe('Authentik could not be reached. Try again in a minute.');
    expect(failureMessage('failed', 'Authentik')).toBe('Sign-in failed. Try again.');
  });
});

describe('startUrl', () => {
  it('passes the address to come back to, encoded', () => {
    expect(startUrl('/projects/abc?x=1&y=2')).toBe('/api/auth/oidc/start?return_to=%2Fprojects%2Fabc%3Fx%3D1%26y%3D2');
    expect(startUrl('/signed-in')).toBe('/api/auth/oidc/start?return_to=%2Fsigned-in');
  });
});

describe('singleFlight', () => {
  it('runs once at a time and once more for calls made meanwhile', async () => {
    const releases: (() => void)[] = [];
    let runs = 0;
    const run = singleFlight(() => {
      runs++;
      return new Promise<void>((resolve) => releases.push(resolve));
    });
    const first = run();
    void run();
    void run();
    expect(runs).toBe(1);
    releases.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The two calls made during the first run make one more run.
    expect(runs).toBe(2);
    releases.shift()!();
    await first;
    expect(runs).toBe(2);
    void run();
    expect(runs).toBe(3);
    releases.shift()!();
  });

  it('survives a failing run', async () => {
    let runs = 0;
    const run = singleFlight(async () => {
      runs++;
      throw new Error('down');
    });
    await run();
    await run();
    expect(runs).toBe(2);
  });
});

describe('the tabs channel', () => {
  const opened: BroadcastChannel[] = [];
  const other = () => {
    const channel = new BroadcastChannel('promptbook-auth');
    opened.push(channel);
    return channel;
  };
  afterEach(() => {
    for (const channel of opened.splice(0)) channel.close();
  });

  it('tells other tabs that a session was opened', async () => {
    const tab = other();
    const heard = new Promise((resolve) => (tab.onmessage = (event) => resolve(event.data)));
    announceSignedIn();
    expect(await heard).toBe('signed-in');
  });

  it('calls the listeners on a message from another tab, and stops when asked', async () => {
    let calls = 0;
    const stop = onSignedInElsewhere(() => calls++);
    const tab = other();
    tab.postMessage('signed-in');
    tab.postMessage('something else');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toBe(1);
    stop();
    tab.postMessage('signed-in');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toBe(1);
  });
});

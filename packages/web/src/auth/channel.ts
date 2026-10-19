// Tabs of this site tell each other that a session was opened, so a tab whose
// session ended (or that shows the sign-in page) can pick the new one up. One
// channel per tab, used both ways: a channel never hears its own messages.

const NAME = 'promptbook-auth';
const SIGNED_IN = 'signed-in';

let channel: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

function open(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    channel = new BroadcastChannel(NAME);
    channel.onmessage = (event: MessageEvent) => {
      if (event.data === SIGNED_IN) for (const listener of listeners) listener();
    };
  }
  return channel;
}

export function announceSignedIn(): void {
  open()?.postMessage(SIGNED_IN);
}

export function onSignedInElsewhere(listener: () => void): () => void {
  open();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Single sign-on in the browser (design decision 7): the server's start
// route, the reasons it sends a failed sign-in back with, and the page a
// sign-in from the "Sign in to sync" dialog ends on.

export type SignInFailure = 'cancelled' | 'unreachable' | 'failed';

const PARAM = 'sign_in';
const failures: readonly SignInFailure[] = ['cancelled', 'unreachable', 'failed'];

// Where a sign-in started from the dialog's window comes back to.
export const SIGNED_IN_PATH = '/signed-in';

export function startUrl(returnTo: string): string {
  return `/api/auth/oidc/start?return_to=${encodeURIComponent(returnTo)}`;
}

// The reason in `?sign_in=…`, or null for none or an unknown one.
export function signInFailure(search: string): SignInFailure | null {
  const value = new URLSearchParams(search).get(PARAM);
  return failures.find((f) => f === value) ?? null;
}

// The query without `sign_in`, with its `?`, or '' when nothing is left.
export function withoutSignIn(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

export function failureMessage(failure: SignInFailure, providerName: string): string {
  switch (failure) {
    case 'cancelled':
      return 'Sign-in was cancelled or took too long. Try again.';
    case 'unreachable':
      return `${providerName} could not be reached. Try again in a minute.`;
    case 'failed':
      return 'Sign-in failed. Try again.';
  }
}

// Runs `task` once at a time. A call made while it runs asks for one more
// run after it, so a request sent before the latest event is never the last
// word; any number of such calls make one run.
export function singleFlight(task: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  const run = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await task().catch(() => {});
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  };
  return run;
}

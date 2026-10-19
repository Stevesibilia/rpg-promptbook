import type { Settings } from 'promptbook-project';

// Saving the settings, which the server takes as a whole object. One request
// at a time: a change made while one is in flight waits, and the latest local
// object goes once the previous request settles, so an older object can never
// be stored after a newer one. A failed save puts back the last object the
// server confirmed, so a value that failed is not sent again with the next
// change.

export interface SaverState {
  settings: Settings;
  saving: boolean;
  saved: boolean;
  error: string;
  // Changes when a failure put the confirmed settings back, so inputs that
  // keep their own value can start again from it.
  revision: number;
}

export interface SettingsSaver {
  save(next: Settings): void;
  state(): SaverState;
}

export function createSettingsSaver(
  initial: Settings,
  put: (settings: Settings) => Promise<Settings>,
  onChange: (state: SaverState) => void,
  describe: (error: unknown) => string = () => 'Saving failed.',
): SettingsSaver {
  let confirmed = initial;
  let current: SaverState = { settings: initial, saving: false, saved: false, error: '', revision: 0 };
  // Bumped by every local change; a response applies only if none came since.
  let version = 0;
  let sentVersion = 0;
  let inFlight = false;

  const set = (patch: Partial<SaverState>) => {
    current = { ...current, ...patch };
    onChange(current);
  };

  function flush(): void {
    inFlight = true;
    sentVersion = version;
    put(current.settings).then(
      (stored) => {
        confirmed = stored;
        inFlight = false;
        if (version === sentVersion) set({ settings: stored, saving: false, saved: true, error: '' });
        else flush();
      },
      (error: unknown) => {
        inFlight = false;
        // Newer local changes were made on top of the failed one: they go too.
        version += 1;
        set({
          settings: confirmed,
          saving: false,
          saved: false,
          error: describe(error),
          revision: current.revision + 1,
        });
      },
    );
  }

  return {
    save(next) {
      version += 1;
      set({ settings: next, saving: true, saved: false, error: '' });
      if (!inFlight) flush();
    },
    state: () => current,
  };
}

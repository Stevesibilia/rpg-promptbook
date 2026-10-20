## Why

The owner wants to see which release the site runs, as gdrarchive and
cronista show it: small and muted at the bottom of the sidebar (#29). Today
the release is visible only in `/api/health`, and the desktop app shows its
version only in Settings → This device.

## What Changes

- **Rail:** the release shows under Settings, at the bottom of the rail, on
  every page that has the rail.
- **Web client:** the release is the server's `version` from `/api/health`
  (`APP_VERSION`, for example `v0.5.1`), read once when the app loads.
  Nothing shows when the server reports `dev` or the request fails.
- **Desktop app:** the app's own version (`DeviceInfo.version`), shown as
  `v0.5.1`; it is there offline too.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `projects-screen`: the rail shows the release.

## Impact

- `packages/web/src/shell/Shell.tsx` and its CSS. A small hook or platform
  call for the version: `/api/health` in the browser, `DeviceInfo` on the
  desktop.
- No server change: `/api/health` already returns the version.
- The reference implementations are gdrarchive's `SidebarVersion`
  (`packages/frontend/src/components/AppLayout.tsx`) and cronista's
  `sidebar-version` (`src/web/templates/_macros.html`).

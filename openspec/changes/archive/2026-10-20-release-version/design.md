## Context

Issue #29. The server's `/api/health` returns `{ ok, version }`, where the
version comes from `APP_VERSION` and is `dev` when that is unset
(`packages/server/src/config.ts`). The chart sets `APP_VERSION` to the tag.
The rail (`packages/web/src/shell/Shell.tsx`) ends with the Settings entry.
The desktop's `DeviceInfo.version` is the app's version (package.json when
unpackaged).

## Goals / Non-Goals

**Goals:** the release is visible at a glance on every page with the rail,
in the browser and in the desktop app.

**Non-Goals:** a changelog or "what's new" link; showing the server's
version inside the desktop app (Settings → This device already names the
server).

## Decisions

1. **Where:** a muted label under the Settings entry at the bottom of the
   rail, in the gdrarchive and cronista manner: `font-size` 10–11 px, the
   muted text token, centred in the rail's width. It carries
   `role="note"` and `aria-label="Release v0.5.1"`; the tooltip (the rail's
   `data-tip`) reads "Release v0.5.1". It is not a link and takes no focus.
   On the phone layout, where the rail is hidden, it is not shown.
2. **Source:** a `releaseVersion()` on the platform seam.
   - The web platform fetches `/api/health` once, caches the result for the
     page's life, and answers `null` for `dev`, an empty value or an error.
   - The desktop platform answers `v` + `DeviceInfo.version`, or `null` when
     that is empty or `0.0.0`.
   - The `v` is added when missing, so both read `v0.5.1`.
3. **Rendering:** the label renders only when the version is known. The
   rail never waits for it and never moves when it arrives (the space under
   Settings is reserved by the rail's layout, or the label is absolutely
   positioned).

### Departures accepted in review (2026-10-20)

1. The desktop e2e checks that the unpackaged build (version `0.0.0`) shows
   no release; the positive desktop case is a unit test of the desktop
   platform.
2. `e2e/stack.ts` takes `E2E_PROJECT` (default `promptbook-e2e`), and
   teardown follows it, so two worktrees can run the suite at once.
3. `compose.yaml` passes `APP_VERSION` (default `dev`) to the app; the e2e
   stack sets `v9.9.9` and the browser e2e checks the rail reads it.
4. The "only when known" rendering is tested through an exported
   `ReleaseNote` rendered to static markup, since the web tests have no
   component harness.
5. The label's slot is always rendered (10 px), so the rail never moves; the
   rail has no phone layout, and the label hides with the rail in focus mode.

## Risks / Trade-offs

- [A cached service worker or tab may show an older release after a
  deploy] → The version is read at load; a reload shows the new one, as in
  gdrarchive.

## Migration Plan

None. Released with the next tag.

## Open Questions

None.

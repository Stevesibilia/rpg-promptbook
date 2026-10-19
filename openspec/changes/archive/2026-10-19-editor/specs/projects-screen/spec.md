## MODIFIED Requirements

### Requirement: Built from the agreed mockup

The web client SHALL follow [docs/mockups/projects.html](../../../docs/mockups/projects.html)
in the browser shell: the Emerald tokens of the mockups (dark by default,
light available), Barlow, Barlow Condensed, Spectral and IBM Plex Mono served
by the app itself, the top bar, the rail, the status bar, and the screens
below. Parts the mockup tags 2b and the rail's Inspiration, Research, Images
and music and Brainstorm log entries SHALL NOT appear. The ⌘K hint SHALL
appear only on the project page, where the command palette exists.

#### Scenario: Fonts offline from the internet

- **WHEN** the app is opened on a network with no internet access
- **THEN** every font loads from the app's own origin

## REMOVED Requirements

### Requirement: Project page with a plain editor

**Reason**: Replaced by the editor (#3).

**Migration**: The project page is specified by the `editor` capability's
«Project page» requirement, which keeps the «Edit in two tabs» scenario.

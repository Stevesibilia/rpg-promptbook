## MODIFIED Requirements

### Requirement: Section-scoped edits

`read_document` SHALL return the whole prep document, or one target's text,
with the SHA-256 of that text. A target SHALL be a template section's name,
a scene id such as `S3`, or a sheet's name, compared case and accent
insensitive; for a campaign, a `##` or `###` heading's text.
`replace_section` SHALL replace one target's text, heading included, only
when the hash sent equals the hash of the target's current text, and only
when the new text starts with a heading of the same level (for a scene, the
same id). Problems found by the checks SHALL never refuse an edit: for an
adventure or a one-shot, the result SHALL report the document's errors and
warnings before and after the edit and the problems in the edited text, as
information. For a campaign no check SHALL run. `add_scene` SHALL append a
scene with the next id at the end of the «Scene» section, reported the same
way. Every change to the prep document by a tool SHALL first store a
snapshot of the text it replaces, and SHALL apply as a Yjs change to the live
document so open editors see it at once.

#### Scenario: Section changed since read

- **WHEN** Claude reads S3, the user then types in S3, and Claude calls
  `replace_section` with the hash it read
- **THEN** the call fails with `changed_since_read` and the text is the
  user's

#### Scenario: Edit adding an error is written and reported

- **WHEN** Claude replaces S3 with text that has no read-aloud callout
- **THEN** the edit is written, and the result lists the new error and the
  error counts before and after

#### Scenario: Scene added before its appendix row

- **WHEN** Claude adds a scene with `add_scene` while the appendix has no row
  for it, then adds the row with `replace_section`
- **THEN** both edits are written, the first result reports the missing
  row, and the second reports it gone

#### Scenario: Edit seen live

- **WHEN** the project is open in the editor and Claude replaces S3 with a
  valid text and the right hash
- **THEN** the editor shows the new S3 without a reload, and History lists a
  Claude snapshot holding the text from before the edit

#### Scenario: Unknown target

- **WHEN** Claude reads the target «S9» in a document with five scenes
- **THEN** the call fails with `unknown_target` and lists the valid targets

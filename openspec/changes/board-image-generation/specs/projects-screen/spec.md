## MODIFIED Requirements

### Requirement: Settings page

The gear in the rail SHALL open Settings with the sections To-do templates
(a tab per category; items renamed in place, reordered by dragging, added and
removed; a note that editing never changes existing projects), Document
templates (read-only description of both skeletons), Author and licence
(author, copyright, licence, default system), Account (display name, change
password), Connected apps (the apps the user allowed, as the connector
capability defines), Image generation (the OpenRouter key, the defaults for
Generate and the spending), Sync and storage (the server address and Export
all projects), and Appearance (Dark, Light, System, remembered in the
browser). In the desktop app Settings SHALL also have This device, after Sync
and storage, as the desktop-app capability defines; Sync and storage SHALL
show the server the app syncs with and the lead «Projects live on this device
and sync with the server when online.» instead of the browser's.

#### Scenario: Template edit is saved

- **WHEN** the user adds «Stampare le schede» to the one-shot template and
  reloads the page
- **THEN** the item is still there

#### Scenario: Connected apps section

- **WHEN** the user opens Settings and presses Connected apps
- **THEN** the address is `/settings/apps` and the section lists the user's
  approved apps and how to connect Claude

#### Scenario: This device only on the desktop

- **WHEN** the user opens Settings in the browser
- **THEN** there is no This device section, and `/settings/device` shows
  To-do templates

#### Scenario: Image generation section

- **WHEN** the user opens Settings and presses Image generation
- **THEN** the address is `/settings/image-generation`, the entry sits after
  Connected apps, and on the desktop This device still sits after Sync and
  storage

## ADDED Requirements

### Requirement: Image generation settings

The section Image generation SHALL have the lead «Generate board images with
GPT Image or Nano Banana through OpenRouter, from any image prompt.» and three
cards. «OpenRouter key»: with a key saved, the key masked to its last four
characters, Replace, Remove, and «Works. $x.xx credit left on this key
(checked HH:MM).», or «Works. No spending limit on this key.» when the key has
no limit; without one, a password field, «Save and check» and the hint
«Create one at openrouter.ai/settings/keys. A spending limit on the key caps
what Promptbook can spend.»; under either, «Stored encrypted on the server
and used only to generate your images. It is never sent to the browser or
the desktop app. Images are billed to your OpenRouter account.». «Defaults
for Generate»: the model and «Images per Generate» from 1 to 4. «Spending»:
this month's cost and images, all time's, and a table of this month by
project, with «Costs as OpenRouter reports them for each image. Removing an
image does not remove its cost.». Months SHALL be calendar months in UTC.
When the server is not configured for image generation, the section SHALL
show one card saying so instead.

#### Scenario: Save a key

- **WHEN** the user pastes a key OpenRouter accepts with $12.40 left and
  presses «Save and check»
- **THEN** the toast reads «Key saved and checked: $12.40 credit left.» and
  the card shows the masked key and «Works. $12.40 credit left on this key»
  with the time of the check

#### Scenario: No spending limit

- **WHEN** the saved key has no spending limit
- **THEN** the card reads «Works. No spending limit on this key.»

#### Scenario: Remove the key

- **WHEN** the user presses Remove
- **THEN** the toast reads «Key removed. Generate asks for a key again.» and
  the card shows the key field

#### Scenario: Change the defaults

- **WHEN** the user picks Nano Banana 2.1 and 3 images per Generate and
  reloads the page
- **THEN** the defaults are still Nano Banana 2.1 and 3, and Generate's panel
  starts from them

#### Scenario: Spending by project

- **WHEN** this month the user generated 3 images for $0.12 in «L'Ancora di
  Sabaoth» and 2 for $0.08 in «Il Faro di Capo Peloro»
- **THEN** Spending shows $0.20 for the month with 5 images, and one row per
  project with its images and cost

#### Scenario: Server not set up

- **WHEN** the server runs without `PROMPTBOOK_SECRETS_KEY`
- **THEN** the section shows one card saying the server is not set up for
  image generation, with no key field

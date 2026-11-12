## ADDED Requirements

### Requirement: Generate through Atelier

When the account's provider is Atelier, Generate SHALL start one Atelier
generation with the text, model, shape and count it would send to OpenRouter,
into the project's Atelier collection (made on the first Generate, named after
the project), and SHALL add each image to the board as it arrives, with its
model, Atelier's cost and the Atelier image's id. Images missing at the end
SHALL fail with Atelier's reason.

#### Scenario: Two images through Atelier

- **WHEN** the account generates through Atelier and the user generates 2
  Nano Banana images for S2 · prompt 1
- **THEN** both images appear on the board as received images with the badge
  "Nano Banana · $0.04", they are in the Atelier collection «L'Ancora di
  Sabaoth», and the viewer shows "Through: Atelier" with a link to the image in
  Atelier

#### Scenario: The collection is reused

- **WHEN** the user generates again in the same project
- **THEN** the images go into the same Atelier collection and no new
  collection is made

#### Scenario: Atelier's cap is reached

- **WHEN** Atelier refuses the generation because it would pass the monthly
  cap
- **THEN** the prompt shows Atelier's sentence followed by "Nothing was
  charged.", and no image is added

### Requirement: The provider on the panel and in the viewer

The Generate panel SHALL say which provider it goes through, with that
provider's price estimates. The viewer SHALL show the provider of a generated
image and link an Atelier image to Atelier.

#### Scenario: The panel names the provider

- **WHEN** the user opens Generate with Atelier chosen
- **THEN** the panel shows "Through Atelier · into the collection «<project
  title>» · $<spent> of $<cap> used this month" with a Change link, and the
  model prices are Atelier's estimates

### Requirement: Spending by provider

Each generated image's cost SHALL be recorded with its provider. The Settings
spending table SHALL show this month's cost per project for Atelier and
OpenRouter beside the total, and the board's "Generated here" SHALL name the
providers that billed the project's images. Images generated before this
change SHALL count as OpenRouter's.

#### Scenario: Both providers in one project

- **WHEN** a project has one image generated through OpenRouter and two
  through Atelier this month
- **THEN** its row in Settings shows both costs and their total, and
  "Generated here" says "as billed by OpenRouter and Atelier"

## MODIFIED Requirements

### Requirement: Settings

Each user SHALL have settings holding one to-do template per category, the
defaults for author, copyright, licence and system, and the defaults for
Generate: a model (GPT Image 2.6 or Nano Banana 2.1) and a number of images
from 1 to 4. A new user's settings SHALL start from built-in defaults: for
adventures and one-shots «Scrivere le scene», «Schede dei PNG», «Prompt
Midjourney», «Immagini scelte», «Prompt Suno», «Brani scelti», «PDF per il
tavolo», «Export CueBard», «Rilettura»; for campaigns «Fronti e minacce»,
«PNG ricorrenti», «Mappa», «Fili aperti dopo ogni sessione», «Rileggere le
note prima di giocare»; for Generate GPT Image 2.6 and 2 images. Settings
saved by a client that does not know the defaults for Generate SHALL keep the
stored ones. The settings SHALL hold no secret.

#### Scenario: Defaults copied into front matter

- **WHEN** the settings hold author «Stefano Sibilia» and licence
  `CC-BY-NC-SA-4.0` and a one-shot is created
- **THEN** its front matter has `autore: Stefano Sibilia` and
  `licenza: CC-BY-NC-SA-4.0`

#### Scenario: Defaults for Generate

- **WHEN** a new user opens Generate for the first time
- **THEN** the panel shows GPT Image 2.6 and 2 images

#### Scenario: Older client saves

- **WHEN** the user's defaults for Generate are Nano Banana 2.1 and 4 images
  and a desktop app from before this change saves the settings
- **THEN** the defaults for Generate stay Nano Banana 2.1 and 4 images

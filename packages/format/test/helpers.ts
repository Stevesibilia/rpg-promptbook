import type { RootContent } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { parseAdventure, templates, type ParseResult, type Range } from '../src/index.js';

export function parse(text: string): ParseResult {
  return parseAdventure(text, { template: templates.avventura });
}

// A short adventure in the new format, with one of everything the parser reads.
export const sample = `---
titolo: La prova
sistema: Kulthos
licenza: CC-BY-NC-SA-4.0
---

## La vicenda in breve

**Il passato.** Qualcosa è successo.

## A colpo d'occhio

| Dove | Quando |
| ---- | ------ |
| qui  | ora    |

**Rivelazioni**

- **R1.** La verità. (I1, I2)

> [!riquadro|laterale] Promemoria
> Una nota a lato.

## Da non perdere stasera

- [ ] Il ritmo.
- [x] Il seme.

## Orologio

- [ ] **1. Primo passo.** Cambia qualcosa.

## Verità del mondo

- **Il luogo.** È vecchio.

## Inizio forte

> [!leggi]
> Il buio si muove.

**Sotto la superficie:** niente di buono.

## Mappa delle scene

| #   | Scena    | Indizi |
| --- | -------- | ------ |
| S1  | La porta | I1, I2 |

Ordine: S1 apre.

## Scene

### S1. La porta

**Luogo e momento:** la soglia, all'alba.

**In gioco:** chi entra.

**Da non perdere qui**

- [ ] La chiave → Schede: Guardiano.

> [!documento] La lettera
> Non aprite.

> [!leggi]
> Una porta socchiusa.

**Cosa succede da sé**

- La porta cigola.

**Chi c'è**

- **Il guardiano**, vuole silenzio. → Schede: Guardiano

**Indizi qui**

- **I1.** Un'impronta sulla soglia. (R1)
- **I2.** Una voce dietro la porta. (R1)

**Prove e regole:** aprire la porta [da manuale].

![La porta all'alba](asset:s1-porta)

| Se i PG…  | Allora…       |
| --------- | ------------- |
| bussano   | nessuno apre  |

| Chiave | Porta |
| ------ | ----- |
| ferro  | legno |

**Se deragliano:** la porta si apre da sola.

## Indizi

| ID  | Indizio      | Rivelazione | Dove | ✓   |
| --- | ------------ | ----------- | ---- | --- |
| I1  | L'impronta   | R1          | S1   | x   |
| I2  | La voce      | R1          | S1   |     |

## PNG

| PNG       | Ruolo  | Dove |
| --------- | ------ | ---- |
| Guardiano | custode | S1  |

**Nomi di riserva:** Turi.

## Schede

### Guardiano, il custode della porta

- **Tipo:** Minaccia
- **Grado:** Straordinaria
- **Natura:** non risvegliata
- **Ferite:** 2 contatori da 3
- **Talenti:** La Presenza · Il Nulla
- **Volontà:** che nessuno entri.

#### Il cane

Un cane nero.

### Pregenerati

Tre personaggi.

#### Elena

- **Legame:** allieva.

## Prima della sessione

**Da preparare:** la lettera.

## Appendice: immagini e musica

### S1. La porta

visual: an old door at dawn

mood: quiet, tense
`;

// Every range in the model that stands for content: all of them except the
// whole-span range of a container (a section, scene, sheet, appendix row,
// pregenerated block or character), which is recognised by its headingRange.
export function contentRanges(value: unknown, out: Range[] = []): Range[] {
  if (Array.isArray(value)) {
    for (const item of value) contentRanges(item, out);
  } else if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const container = 'headingRange' in object;
    for (const [key, item] of Object.entries(object)) {
      if (key === 'range' && container) continue;
      if (/[rR]ange$/.test(key) && item && typeof item === 'object' && 'start' in item) out.push(item as Range);
      else contentRanges(item, out);
    }
  }
  return out;
}

const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm);

// The top-level blocks of a document that neither the model nor a problem
// covers, character by character (spaces aside).
export function uncoveredBlocks(text: string, result: ParseResult): RootContent[] {
  const covered = new Uint8Array(text.length);
  const ranges = [...contentRanges(result.model), ...result.problems.map((p) => p.range)];
  for (const range of ranges) covered.fill(1, range.start.offset, range.end.offset);
  return processor.parse(text).children.filter((node) => {
    const start = node.position?.start.offset ?? 0;
    const end = node.position?.end.offset ?? 0;
    for (let i = start; i < end; i++) {
      if (!covered[i] && !/\s/.test(text[i]!)) return true;
    }
    return false;
  });
}

export function topLevelBlocks(text: string): RootContent[] {
  return processor.parse(text).children;
}

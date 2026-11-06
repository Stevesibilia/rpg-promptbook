import { readFileSync } from 'node:fs';

// The sample sheet of every built-in kind, from the agreed mockup
// docs/mockups/game-systems.html. A list value is written as sub-bullets.

export interface KindSample {
  system: string;
  kind: string;
  name: string;
  values: Record<string, string | string[]>;
}

// In a JSON fixture so the layout tests read the same samples.
export const kindSamples: KindSample[] = JSON.parse(
  readFileSync(new URL('../fixtures/kind-samples.json', import.meta.url), 'utf8'),
) as KindSample[];

// A sample as the sheet's Markdown, as the mockup writes it.
export function sheetMarkdown(sample: KindSample): string {
  const lines = [`### ${sample.name}`, '', `- **Tipo:** ${sample.kind}`];
  for (const [key, value] of Object.entries(sample.values)) {
    if (Array.isArray(value)) {
      lines.push(`- **${key}:**`, ...value.map((item) => `  - ${item}`));
    } else {
      lines.push(`- **${key}:** ${value}`);
    }
  }
  return lines.join('\n');
}

// A document of the system with these sheets under «Schede».
export function sheetsDocument(system: string, sheets: string[]): string {
  return `---\ntitolo: Prova\nsistema: ${system}\n---\n\n## Schede\n\n${sheets.join('\n\n')}\n`;
}

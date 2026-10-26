import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';

// Sabaoth with its Pregenerati block replaced by `block` (a `### Pregenerati`
// heading and what follows it): the fixture's block holds a table and a list,
// no `####` characters.
export function withBlock(block: string): string {
  const from = sabaoth.indexOf('### Pregenerati');
  const to = sabaoth.indexOf('## Prima della sessione');
  return sabaoth.slice(0, from) + block + '\n' + sabaoth.slice(to);
}

export const characters = `### Pregenerati

Tre personaggi.

> [!sconosciuto] Nota del blocco.

#### Ada Rossi

- **Legame:** allieva.

> [!inventato] Una scatola che non c'è.

#### Bruno Valli

- **Legame:** il fratello di Ada.

#### Carla Neri

- **Legame:** la vicina.
`;

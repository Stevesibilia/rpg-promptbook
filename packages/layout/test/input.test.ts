import { defineTemplate, parseAdventure, templates, type AdventureTemplateInput } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { defaultLayoutOptions, toLayoutInput, type LayoutBlock } from '../src/index.js';
import { sabaoth } from './helpers.js';

const project = { title: 'Nome del progetto' };
const layout = (text: string, options = defaultLayoutOptions) =>
  toLayoutInput(parseAdventure(text, { template: templates.avventura }).model, options, project, templates.avventura);
const markdown = (blocks: LayoutBlock[] | undefined) => (blocks ?? []).map((b) => b.markdown).join('\n\n');

describe('toLayoutInput on Sabaoth', () => {
  const text = sabaoth();
  const input = layout(text);

  it('takes the title and the footer from the front matter', () => {
    expect(input.title).toBe("L'Ancora di Sabaoth");
    expect(input.subtitle).toBeNull();
    expect(input.author).toBe('Stefano Sibilia');
    expect(input.copyright).toBe('© 2026 Stefano Sibilia');
    expect(input.licence).toEqual({
      short: 'CC BY-NC-SA 4.0',
      full: 'CC-BY-NC-SA-4.0',
      url: 'https://spdx.org/licenses/CC-BY-NC-SA-4.0.html',
    });
  });

  it('has a tab for the night, each scene and the sheets', () => {
    expect(input.tabs).toEqual(['Notte', 'S1', 'S2', 'S3', 'S4', 'S5', 'Schede']);
  });

  it('prints the system line above the title and the setting under it', () => {
    expect(markdown(input.cover.over)).toBe(
      '**Sistema:** Kulthos\n\n**Formato:** one-shot\n\n**Durata:** 4 ore\n\n**Giocatori:** 3 Dormienti pregenerati',
    );
    expect(input.cover.meta.map((b) => b.markdown.split(':**')[0])).toEqual(['**Ambientazione', '**Tempi']);
  });

  it('moves the revelations out of «A colpo d\'occhio» into the side column', () => {
    expect(markdown(input.night.overview?.blocks)).not.toContain('Rivelazioni');
    expect(markdown(input.night.overview?.blocks)).toContain('**Domanda drammatica:**');
    expect(input.night.revelations?.blocks).toHaveLength(1);
    expect(markdown(input.night.revelations?.blocks)).toMatch(/^- \*\*R1\.\*\*/);
  });

  it('keeps every block\'s source offset', () => {
    const s3 = input.scenes[2]!;
    expect(text.slice(s3.from)).toMatch(/^### S3\. Il cordone di Donato/);
    expect(text.slice(s3.readAlouds[0]!.from)).toMatch(/^> \[!leggi\]/);
    expect(s3.readAlouds[0]!.markdown).toMatch(/^Una piazza di macerie/);
    expect(text.slice(s3.cast!.from)).toMatch(/^\*\*Chi c'è\*\*/);
  });

  it('links references to the sheets\' labels', () => {
    const s3 = input.scenes[2]!;
    expect(markdown(s3.cast?.blocks)).toContain('→ [Tenente Donato](#sheet-tenente-donato)');
    expect(markdown(s3.cast?.blocks)).toContain('→ [Pattuglia di Quieti](#sheet-pattuglia-di-quieti)');
    expect(input.references.sheets.map((s) => s.label)).toEqual([
      'sheet-sabaoth',
      'sheet-dottor-umberto-salvi',
      'sheet-tenente-donato',
      'sheet-pattuglia-di-quieti',
      'sheet-il-circolo-dello-stretto',
    ]);
    // A reference outside «Chi c'è».
    expect(markdown(input.scenes[4]!.mustHave?.blocks)).toContain('(→ [Sabaoth, «Cosa offre»](#sheet-sabaoth))');
  });

  it('gives a threat box to each graded sheet the cast cites', () => {
    const [donato, quieti] = input.scenes[2]!.threats;
    expect(donato).toEqual({
      name: 'Tenente Donato',
      grade: 'Straordinaria',
      pack: false,
      wounds: 6,
      woundsPerCounter: 3,
      afflictions: 2,
      talentNames: null,
      talents: [
        { name: 'La Presenza', text: 'evoca una Pattuglia di Quieti' },
        { name: 'Il Nulla', text: 'separa i Dormienti' },
      ],
      sheet: 'sheet-tenente-donato',
    });
    expect(quieti?.name).toBe('Pattuglia di Quieti');
    // S5 cites Donato twice; one box.
    expect(input.scenes[4]!.threats.map((t) => t.name)).toEqual([
      'Dottor Umberto Salvi',
      'Il Circolo dello Stretto',
      'Tenente Donato',
    ]);
  });

  it('places the scene fields and keeps unknown ones apart', () => {
    const s5 = input.scenes[4]!;
    expect(s5.place?.blocks[0]?.markdown).toMatch(/^la punta di Capo Peloro/);
    expect(s5.situation?.label).toBe('Regole della situazione');
    expect(s5.decides?.label).toBe('Cosa decide la notte');
    expect(s5.reactions?.markdown).toMatch(/^\| Se i PG…/);
    expect(s5.others.map((f) => f.label)).toEqual(['Se il tempo stringe']);
  });

  it('prints a sheet\'s fields again as a list', () => {
    const donato = input.references.sheets[2]!;
    expect(donato.blocks).toHaveLength(1);
    expect(donato.blocks[0]!.markdown.split('\n')[0]).toBe('- **Tipo:** Minaccia');
    expect(text.slice(donato.blocks[0]!.from)).toMatch(/^- \*\*Tipo:\*\* Minaccia/);
  });

  it('carries the options, and leaves out the pregenerated when asked', () => {
    expect(input.options).toEqual(defaultLayoutOptions);
    expect(input.references.pregenerated?.blocks.map((b) => b.kind)).toEqual(['table', 'list', 'paragraph']);
    const without = layout(text, { ...defaultLayoutOptions, pregenerated: false, paper: 'us-letter' });
    expect(without.references.pregenerated).toBeNull();
    expect(without.options.paper).toBe('us-letter');
  });

  it('leaves the appendix out', () => {
    expect(JSON.stringify(input)).not.toContain('Appendice');
  });
});

describe('toLayoutInput on a small adventure', () => {
  const small = (front: string) => `---\n${front}---\n\n## Scene\n\n### S1. Il porto\n\n**In gioco:** la nave → Schede: Capitano.\n\n## Schede\n\n### Capitano, il vecchio\n\n- **Tipo:** Minaccia\n- **Grado:** Ordinaria\n`;

  it('falls back to the project\'s name and leaves out what the front matter does not set', () => {
    const input = layout(small(''));
    expect(input.title).toBe('Nome del progetto');
    expect([input.author, input.copyright, input.licence]).toEqual([null, null, null]);
  });

  it('prints free-text licences as written, without a link', () => {
    const input = layout(small('titolo: Il porto\nlicenza: Tutti i diritti riservati\n'));
    expect(input.licence).toEqual({ short: 'Tutti i diritti riservati', full: 'Tutti i diritti riservati', url: null });
  });

  it('joins several authors', () => {
    expect(layout(small('autore:\n  - Anna\n  - Bruno\n')).author).toBe('Anna, Bruno');
  });

  it('links a reference in an inline field', () => {
    const input = layout(small('titolo: Il porto\n'));
    expect(input.scenes[0]!.inPlay?.blocks[0]?.markdown).toBe('la nave → [Capitano](#sheet-capitano).');
  });
});

describe('Regole della notte', () => {
  const rules = (body: string) => layout(sabaoth().replace(/^## Scene/m, `## Regole della notte\n\n${body}\n\n## Scene`)).rules;

  it('moves the side boxes to the side column', () => {
    const input = rules('**Paura.** Si tira Volontà.\n\n> [!riquadro|laterale] Promemoria\n> La marea sale.\n\n**Marea.** Sale.');
    expect(markdown(input?.blocks)).toBe('**Paura.** Si tira Volontà.\n\n**Marea.** Sale.');
    expect(markdown(input?.sideBoxes)).toBe('La marea sale.');
    expect(input?.sideBoxes[0]!.box?.title).toBe('Promemoria');
  });

  it('has no side boxes when the section holds none', () => {
    expect(rules('**Paura.** Si tira Volontà.')?.sideBoxes).toEqual([]);
  });
});

describe('several read-alouds', () => {
  // A box of the given text put before the first read-aloud found after `after`.
  const withBoxBefore = (text: string, after: string, box: string) => {
    const at = text.indexOf('> [!leggi]', text.indexOf(after));
    return `${text.slice(0, at)}> [!leggi]\n> ${box}\n\n${text.slice(at)}`;
  };

  it('keeps every read-aloud of a scene in the slot, in order, none in the boxes', () => {
    const s1 = layout(withBoxBefore(sabaoth(), '### S1.', 'Un brano in più.')).scenes[0]!;
    expect(s1.readAlouds).toHaveLength(2);
    expect(s1.readAlouds[0]!.markdown).toBe('Un brano in più.');
    expect(s1.readAlouds[0]!.from).toBeLessThan(s1.readAlouds[1]!.from);
    expect(s1.boxes.filter((b) => b.box?.role === 'readAloud')).toEqual([]);
  });

  it('keeps every block of Inizio forte, two read-alouds in order', () => {
    const blocks = layout(withBoxBefore(sabaoth(), '## Inizio forte', 'Un brano in più.')).start.strongStart!.blocks;
    const reads = blocks.filter((b) => b.box?.role === 'readAloud');
    expect(reads).toHaveLength(2);
    expect(reads[0]!.markdown).toBe('Un brano in più.');
  });
});

describe('a template that renames a field', () => {
  // A copy of avventura whose mustHave field reads «Imperdibile», and Sabaoth
  // written with that label: the list goes where «Da non perdere qui» goes,
  // the scene's side column, and nowhere else.
  const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  definition.sceneFields.find((f) => f.role === 'mustHave')!.label = 'Imperdibile';
  const renamed = defineTemplate(definition);
  const text = sabaoth();
  const original = layout(text);
  const written = text.replaceAll('**Da non perdere qui**', '**Imperdibile**');
  const input = toLayoutInput(parseAdventure(written, { template: renamed }).model, defaultLayoutOptions, project, renamed);

  it('places the renamed field as the mustHave of every scene', () => {
    expect(written).not.toBe(text);
    expect(input.scenes).toHaveLength(original.scenes.length);
    input.scenes.forEach((scene, i) => {
      const before = original.scenes[i]!;
      expect(before.mustHave).not.toBeNull();
      expect(scene.mustHave?.label).toBe('Imperdibile');
      expect(markdown(scene.mustHave?.blocks)).toBe(markdown(before.mustHave?.blocks));
      expect(scene.others.map((f) => f.label)).toEqual(before.others.map((f) => f.label));
    });
  });

  it('finds the renamed sections by role too', () => {
    const sections = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
    sections.sections.find((s) => s.role === 'clock')!.name = 'Conto alla rovescia';
    const clock = defineTemplate(sections);
    const moved = text.replace('## Orologio', '## Conto alla rovescia');
    const result = toLayoutInput(parseAdventure(moved, { template: clock }).model, defaultLayoutOptions, project, clock);
    expect(markdown(result.night.clock?.blocks)).toBe(markdown(original.night.clock?.blocks));
    expect(original.night.clock).not.toBeNull();
  });
});

describe('the headings the PDF prints', () => {
  // Template-editor design decision 20: each heading is the template's.
  it('are the built-in\'s names for Avventura', () => {
    const input = layout(sabaoth());
    // Sabaoth has no synopsis.
    expect(input.cover.synopsis).toBeNull();
    expect([
      input.night.overviewTitle,
      input.night.overview?.title,
      input.night.revelations?.title,
      input.night.reminders?.title,
      input.night.clock?.title,
      input.night.truths?.title,
      input.start.strongStart?.title,
      input.start.sceneMap?.title,
      input.references.clues?.title,
      input.references.npcs?.title,
      input.references.sheetsTitle,
      input.references.pregenerated?.title,
    ]).toEqual([
      "A colpo d'occhio",
      "A colpo d'occhio",
      'Rivelazioni',
      'Da non perdere stasera',
      'Orologio',
      'Verità del mondo',
      'Inizio forte',
      'Mappa delle scene',
      'Indizi',
      'PNG',
      'Schede',
      'Pregenerati',
    ]);
  });

  it('follow a template that renames them', () => {
    const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
    const rename = (role: string, name: string) => (definition.sections.find((s) => s.role === role)!.name = name);
    rename('strongStart', 'Apertura');
    rename('overview', 'Panoramica');
    rename('sheets', 'Personaggi');
    definition.overview.revelations = 'Segreti';
    definition.sheets.pregenerated = 'Già pronti';
    const renamed = defineTemplate(definition);
    const written = sabaoth()
      .replace('## Inizio forte', '## Apertura')
      .replace("## A colpo d'occhio", '## Panoramica')
      .replace('## Schede', '## Personaggi')
      .replace('Rivelazioni', 'Segreti')
      .replace('### Pregenerati', '### Già pronti');
    const input = toLayoutInput(parseAdventure(written, { template: renamed }).model, defaultLayoutOptions, project, renamed);
    expect(input.start.strongStart?.title).toBe('Apertura');
    expect(input.night.overviewTitle).toBe('Panoramica');
    expect(input.night.overview?.title).toBe('Panoramica');
    expect(input.references.sheetsTitle).toBe('Personaggi');
    expect(input.night.revelations?.title).toBe('Segreti');
    expect(input.references.pregenerated?.title).toBe('Già pronti');
  });
});

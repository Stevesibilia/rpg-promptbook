import { describe, expect, it } from 'vitest';
import { parse } from './helpers.js';
import { applyEdits, base, change, codes, expectCase, type Case } from './checks.helpers.js';

const orologio = '## Orologio\n\n- [ ] **1. Primo passo.** Cambia qualcosa.\n\n';
const verita = '## Verità del mondo\n\n- **Il luogo.** È vecchio.\n\n';

const cases: Case[] = [
  {
    name: 'a required section is absent',
    code: 'section.missing',
    doc: change(orologio, ''),
    severity: 'error',
    at: '---',
  },
  {
    name: 'two sections swap places',
    code: 'section.order',
    doc: change(orologio + verita, verita + orologio),
    severity: 'error',
    at: '## Orologio',
  },
  {
    name: 'an unknown section comes before the synopsis',
    code: 'section.synopsis.first',
    doc: change('## La vicenda in breve', '## Note sparse\n\nTesto.\n\n## La vicenda in breve'),
    severity: 'error',
    at: '## La vicenda in breve',
  },
  {
    name: 'two scenes share an id',
    code: 'scene.id.duplicate',
    doc: change('## Indizi\n', `### S1. Altra\n\n## Indizi\n`),
    severity: 'error',
    at: '### S1. Altra',
    sceneId: 'S1',
  },
  {
    name: 'a scene label the template does not know',
    code: 'scene.field.unknown',
    doc: change('**Se deragliano:**', '**Se il tempo stringe:** ogni ora costa.\n\n**Se deragliano:**'),
    severity: 'error',
    at: '**Se il tempo stringe:**',
    sceneId: 'S1',
  },
  {
    name: 'a required scene field is missing',
    code: 'scene.field.missing',
    doc: change('**In gioco:** chi entra.\n\n', ''),
    severity: 'error',
    at: '### S1. La porta',
    sceneId: 'S1',
  },
  {
    name: 'a recommended scene field is missing',
    code: 'scene.field.missing',
    doc: change(
      '**Indizi qui**\n\n- **I1.** Un\'impronta sulla soglia. (R1)\n- **I2.** Una voce dietro la porta. (R1)\n\n',
      '',
    ),
    severity: 'warning',
    at: '### S1. La porta',
    sceneId: 'S1',
  },
  {
    name: 'a scene has no reactions table',
    code: 'scene.reactions.missing',
    doc: change('| Se i PG…  | Allora…       |\n| --------- | ------------- |\n| bussano   | nessuno apre  |\n\n', ''),
    severity: 'error',
    at: '### S1. La porta',
    sceneId: 'S1',
  },
  {
    name: 'a field label on the line after another field',
    code: 'field.blank-line',
    doc: change("**Luogo e momento:** la soglia, all'alba.\n\n**In gioco:**", "**Luogo e momento:** la soglia, all'alba.\n**In gioco:**"),
    severity: 'error',
    at: '**In gioco:**',
    sceneId: 'S1',
  },
];

describe('structure checks', () => {
  it.each(cases)('$code: $name', (c) => {
    expectCase(c);
  });

  it('finds no problem in the clean sample', () => {
    expect(parse(base).problems).toEqual([]);
  });

  it('reads a handout followed by a read-aloud with no problem', () => {
    expect(codes(parse(base).problems)).not.toContain('callout.count');
  });

  it('allows the climax fields in any scene and optional fields to be absent', () => {
    const doc = change('**Prove e regole:** aprire la porta [da manuale].\n\n', '**Cosa decide la notte:** la porta.\n\n');
    expect(parse(doc).problems).toEqual([]);
  });

  it('turns an unknown field into a box with a fix', () => {
    const doc = change('**Se deragliano:**', '**Se il tempo stringe:** ogni ora costa.\n\n**Se deragliano:**');
    const problem = parse(doc).problems.find((p) => p.code === 'scene.field.unknown')!;
    expect(problem.fixes).toHaveLength(1);
    const fixed = applyEdits(doc, problem.fixes![0]!.edits);
    expect(fixed).toContain('> [!riquadro] Se il tempo stringe\n> ogni ora costa.\n\n**Se deragliano:**');
    expect(codes(parse(fixed).problems)).toEqual([]);
  });

  it('quotes the list that goes with an unknown block field', () => {
    const doc = change('**Se deragliano:**', '**Contromisure**\n\n- una\n- due\n\n**Se deragliano:**');
    const problem = parse(doc).problems.find((p) => p.code === 'scene.field.unknown')!;
    const fixed = applyEdits(doc, problem.fixes![0]!.edits);
    expect(fixed).toContain('> [!riquadro] Contromisure\n> - una\n> - due\n\n**Se deragliano:**');
    expect(codes(parse(fixed).problems)).toEqual([]);
  });

  it('adds the missing blank line with a fix', () => {
    const doc = change("**Luogo e momento:** la soglia, all'alba.\n\n**In gioco:**", "**Luogo e momento:** la soglia, all'alba.\n**In gioco:**");
    const problem = parse(doc).problems.find((p) => p.code === 'field.blank-line')!;
    expect(parse(applyEdits(doc, problem.fixes![0]!.edits)).problems).toEqual([]);
  });

  it('lists the found and the expected order of sections', () => {
    const { problems } = parse(change(orologio + verita, verita + orologio));
    const message = problems.find((p) => p.code === 'section.order')!.message;
    const [found, expected] = message.split('Found:')[1]!.split('Expected:') as [string, string];
    expect(found.indexOf('"Verità del mondo"')).toBeLessThan(found.indexOf('"Orologio"'));
    expect(expected.indexOf('"Orologio"')).toBeLessThan(expected.indexOf('"Verità del mondo"'));
  });
});

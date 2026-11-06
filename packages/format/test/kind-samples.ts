// The sample sheet of every built-in kind, from the agreed mockup
// docs/mockups/game-systems.html. A list value is written as sub-bullets.

export interface KindSample {
  system: string;
  kind: string;
  name: string;
  values: Record<string, string | string[]>;
}

export const kindSamples: KindSample[] = [
  {
    system: 'Kulthos',
    kind: 'Minaccia',
    name: 'Tenente Donato, il Primo dei Quieti',
    values: {
      Grado: 'Straordinaria',
      Natura: 'non risvegliata',
      Branco: 'no',
      Volontà: 'che tutto sia fermo; chi si muove senza permesso è uno sciacallo.',
      Condotta: '1. Fermezza · 2. Impeto · 3. Prudenza · 4. Acume',
      Talenti: 'La Presenza (evoca una Pattuglia di Quieti) · Il Nulla (separa i Dormienti)',
    },
  },
  {
    system: 'Vileborn',
    kind: 'Sfida',
    name: 'Il Balivo Cavo',
    values: {
      Specie: 'Caduto',
      Motto: '«Il tuo debito è mio.»',
      Approcci: 'Forza 6 · Sotterfugio 5 · Precisione 6 · Ragione 4 · Influenza 5 · Volontà 7',
      Resistenze: 'Ferro freddo',
      Debolezze: 'Olio santo · Senso di colpa',
      Colpi: '6 (3)',
      Eventi: 'Al 3° colpo diventa incorporeo: da lì solo Volontà funziona.',
      'Regole uniche': 'Se il debito viene pagato, se ne va.',
      Complicazioni: [
        'Le catene ti sferzano; segna una ferita.',
        'Pronuncia il tuo nome; segna paura.',
        'Il registro si apre alla tua pagina; segna vergogna.',
      ],
      'Dado dell’oscurità': ['7+: sussurri; prova normale (5) di Volontà o segna paura', '10+: tutti segnano una ferita'],
    },
  },
  {
    system: 'Not the End',
    kind: 'Sfida',
    name: 'Il portone del Conte',
    values: {
      Descrizione: 'Quercia nera, borchie di ferro, un battente a forma di lupo.',
      Prove: ['Affrontarlo: difficile · poco pericolosa', 'Scassinare la serratura: media', 'Sfondarlo: difficilissima · molto pericolosa'],
      Sventure: 'Mani ferite · Rumore',
      Complicazioni: 'Il cane del custode si sveglia · La chiave si spezza dentro',
    },
  },
  {
    system: 'Outgunned',
    kind: 'Scagnozzi',
    name: 'I picchiatori del magazzino',
    values: { Grinta: '6', Difesa: 'Base', Attacco: '1 Base', Branco: 'sì' },
  },
  {
    system: 'Outgunned',
    kind: 'Cattivo',
    name: 'Lefty Moretti',
    values: {
      Grinta: '8 (8)',
      Difesa: 'Critico',
      Attacco: '2 Base',
      Talenti: 'Sparo alla cieca (spende 1 Adrenalina: colpisce tutti a portata)',
    },
  },
  {
    system: 'Outgunned',
    kind: 'Boss',
    name: 'Don Varga',
    values: {
      Grinta: '10 (8, 10)',
      Difesa: 'Critico',
      Attacco: '2 Critico',
      Talenti:
        'Scudo umano (un picchiatore prende il colpo al suo posto) · Ultima parola (a 0 Grinta fa ancora una mossa)',
    },
  },
  {
    system: 'D&D 5e',
    kind: 'Creatura',
    name: 'Ghoul della cantina',
    values: {
      'Taglia e tipo': 'Non morto Medio, caotico malvagio',
      CA: '12',
      PF: '22 (4d8+4)',
      Velocità: '9 m',
      Caratteristiche: 'FOR 13 (+1) · DES 15 (+2) · COS 10 (+0) · INT 7 (−2) · SAG 10 (+0) · CAR 6 (−2)',
      Abilità: 'Furtività +4',
      Immunità: 'veleno; affascinato, avvelenato',
      Sensi: 'scurovisione 18 m, Percezione passiva 10',
      Linguaggi: 'Comune',
      Sfida: '1',
      Tratti: 'Fame di tomba (vantaggio contro le creature sotto metà PF)',
      Azioni: 'Artigli (+4, portata 1,5 m; 7 (2d4+2) taglienti; TS COS CD 10 o paralizzato 1 minuto)',
    },
  },
  {
    system: 'Historia',
    kind: 'Creatura',
    name: 'Capitano Ottone Vairo',
    values: {
      'Taglia e tipo': 'Familia del Tasso, Medio, legale neutrale',
      CA: '16',
      PF: '52 (8d8+16)',
      Velocità: '7,5 m',
      Caratteristiche: 'FOR 16 (+3) · DES 11 (+0) · COS 14 (+2) · INT 12 (+1) · SAG 13 (+1) · CAR 14 (+2)',
      Sfida: '3',
      Tratti: 'Veterano di Vesteria (vantaggio ai TS contro la paura)',
      Azioni: 'Multiattacco (due attacchi di picca) · Picca (+5, portata 3 m; 8 (1d10+3) perforanti)',
    },
  },
  {
    system: 'Blades in the Dark',
    kind: 'Fazione',
    name: 'I Lampionai',
    values: {
      Livello: 'II',
      Presa: 'forte',
      Natura: 'contrabbandieri',
      Territorio: 'tre moli di Barrowcleft',
      Risorse: 'luci fantasma · squadre di funi',
      Obiettivi: ['Prendere il magazzino dei Portuali: 6', 'Comprare un ispettore: 4'],
      Alleati: 'Vetturini (+1)',
      Nemici: 'Portuali (−2)',
    },
  },
  {
    system: 'Blades in the Dark',
    kind: 'PNG',
    name: 'Mylera Klev',
    values: { Ruolo: 'capo dei Lampionai', Qualità: '2', Tratti: 'spietata · paziente · leale ai suoi', Vuole: 'i moli senza pagare pedaggio' },
  },
  {
    system: 'PbtA',
    kind: 'Minaccia',
    name: 'Dremmer',
    values: {
      'Tipo di minaccia': 'Signore della guerra (schiavista)',
      Impulso: 'possedere l’acqua',
      Danno: '2 (banda) · 3 (il suo fucile)',
      Armatura: '1',
      Mosse: 'manda squadre a prendere gli alambicchi · offre una pace falsa · rompe una promessa',
    },
  },
  {
    system: 'PbtA',
    kind: 'Mostro',
    name: 'Lo Spettro della palude',
    values: {
      Specie: 'spettro',
      Motivazione: 'trascinare i vivi sotto',
      Attacchi: 'mani che afferrano (2-danno, intimo, ignora-armatura)',
      'Capacità di danno': '7',
      Armatura: '0',
      Debolezza: 'acqua salata; le sue ossa nella buca',
      Poteri: 'tira sott’acqua · ruba un nome · svanisce nella nebbia',
    },
  },
  {
    system: 'Fate',
    kind: 'PNG principale',
    name: 'Capitana Ines Valdor',
    values: {
      Concetto: 'Ufficiale di marina caduta in disgrazia, ora contrabbandiera',
      Problema: 'L’Ammiragliato la rivuole',
      Aspetti: 'Non lascio indietro nessuno',
      Abilità: 'Ottimo (+4) Combattere · Buono (+3) Guidare, Volontà · Discreto (+2) Empatia, Notare',
      Stunt: 'Mano lesta (+2 a Sparare quando estrae per prima)',
      'Stress fisico': '3',
      'Stress mentale': '2',
    },
  },
  {
    system: 'Fate',
    kind: 'Comparsa',
    name: 'Marinai del molo',
    values: { Aspetti: 'Tanti e rumorosi', Abilità: 'Discreto (+2) Combattere', Stress: '2' },
  },
  {
    system: 'Call of Cthulhu',
    kind: 'Creatura',
    name: 'Servitore dei Profondi',
    values: {
      Caratteristiche: 'FOR 80 · COS 70 · TAG 70 · DES 55 · INT 60 · POT 55',
      PF: '14',
      PM: '11',
      Movimento: '8 (nuoto 10)',
      'Bonus al danno': '+1D4',
      Corporatura: '1',
      Attacchi: 'Artigli 45% (22/9) (1D6 + BD) · Morso 30% (15/6) (1D4 + BD)',
      Schivare: '30% (15/6)',
      Armatura: '1 (scaglie)',
      'Perdita di Sanità': '0/1D6',
    },
  },
  {
    system: 'Mörk Borg',
    kind: 'Creatura',
    name: 'Segugio della peste',
    values: { PF: '9', Morale: '8', Armatura: '−d2', Attacco: 'Morso d6', Speciale: 'Il morso infetta: prova di Robustezza CD 12.' },
  },
  {
    system: 'Coriolis',
    kind: 'PNG',
    name: 'Guardia della stazione',
    values: {
      Ruolo: 'sicurezza del Coriolis',
      Attributi: 'FOR 4 · AGI 3 · ACU 2 · EMP 2',
      Abilità: 'Combattimento ravvicinato 3 · A distanza 3 · Osservare 2',
      PF: '7',
      PM: '4',
      Armatura: '2',
      Armi: ['Manganello stordente: 1 · 2 · ravvicinata', 'Pistola vulcan: 2 · 3 · corta'],
      Talenti: 'Reazione rapida',
    },
  },
];

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

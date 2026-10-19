// What the template reads: the model's parts in the order the PDF prints
// them, each block with its source offset and its Markdown. The template
// stays declarative; every decision about what goes where is made here.

import type { Block } from 'promptbook-format';

export interface LayoutOptions {
  paper: 'a4' | 'us-letter';
  // Tints become white; text, rules and borders stay.
  inkSaver: boolean;
  // False leaves out the Pregenerati part.
  pregenerated: boolean;
  template: 'avventura@1';
}

export const defaultLayoutOptions: LayoutOptions = {
  paper: 'a4',
  inkSaver: false,
  pregenerated: true,
  template: 'avventura@1',
};

export interface LayoutBox {
  role: 'readAloud' | 'handout' | 'box' | 'quote';
  // What the box prints above its content: "Da leggere", "Documento da consegnare".
  label: string | null;
  title: string | null;
  side: boolean;
}

export interface LayoutBlock {
  from: number;
  kind: Block['kind'];
  markdown: string;
  // Set on callouts and quotes; their markdown is the content.
  box: LayoutBox | null;
}

export interface LayoutPart {
  from: number;
  blocks: LayoutBlock[];
}

export interface LayoutField {
  label: string;
  from: number;
  blocks: LayoutBlock[];
}

export interface LayoutThreat {
  name: string;
  grade: string;
  pack: boolean;
  wounds: number;
  woundsPerCounter: number;
  afflictions: number;
  // More than two talents print as their names on one line.
  talentNames: string | null;
  talents: { name: string; text: string }[];
  // The label of the sheet, for «scheda completa, p. N».
  sheet: string;
}

export interface LayoutScene {
  id: string;
  title: string;
  from: number;
  // The offset where the scene's source ends.
  to: number;
  place: LayoutField | null;
  inPlay: LayoutField | null;
  // The side column.
  mustHave: LayoutField | null;
  cast: LayoutField | null;
  threats: LayoutThreat[];
  sideBoxes: LayoutBlock[];
  // The main column.
  readAloud: LayoutBlock | null;
  happens: LayoutField | null;
  clues: LayoutField | null;
  handouts: LayoutBlock[];
  boxes: LayoutBlock[];
  tests: LayoutField | null;
  reactions: LayoutBlock | null;
  tables: LayoutBlock[];
  derail: LayoutField | null;
  // Under both columns.
  situation: LayoutField | null;
  decides: LayoutField | null;
  // Bold labels the template does not know, in their order.
  others: LayoutField[];
}

export interface LayoutSheet {
  // The Typst label of the sheet: "sheet-tenente-donato".
  label: string;
  title: string;
  from: number;
  blocks: LayoutBlock[];
}

export interface LayoutPregenerated {
  from: number;
  blocks: LayoutBlock[];
  characters: { name: string; from: number; blocks: LayoutBlock[] }[];
}

export interface LayoutInput {
  options: LayoutOptions;
  title: string;
  subtitle: string | null;
  author: string | null;
  copyright: string | null;
  licence: { short: string; full: string; url: string | null } | null;
  // The edge tabs: "Notte", "S1"…"Sn", "Schede".
  tabs: string[];
  cover: {
    from: number;
    // The line above the title, and the lines under it.
    over: LayoutBlock[];
    meta: LayoutBlock[];
    synopsis: LayoutPart | null;
    backstory: LayoutPart | null;
  };
  night: {
    from: number;
    overview: LayoutPart | null;
    revelations: LayoutPart | null;
    sideBoxes: LayoutBlock[];
    reminders: LayoutPart | null;
    clock: LayoutPart | null;
    truths: LayoutPart | null;
  };
  start: {
    from: number;
    strongStart: LayoutPart | null;
    sceneMap: LayoutPart | null;
  };
  rules: LayoutPart | null;
  scenes: LayoutScene[];
  references: {
    from: number;
    clues: LayoutPart | null;
    npcs: LayoutPart | null;
    sheets: LayoutSheet[];
    pregenerated: LayoutPregenerated | null;
    before: LayoutPart | null;
  };
}

export interface LayoutProject {
  // The project's name: the title when the front matter has none.
  title: string;
}

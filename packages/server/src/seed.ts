import { randomUUID } from 'node:crypto';
import {
  createProjectDoc,
  prepareImport,
  readTodo,
  setTitle,
  skeletonDocument,
  updateTodo,
  type Category,
  type Status,
} from 'promptbook-project';
import { findUserByUsername } from './accounts/users.js';
import type { Db } from './db.js';
import { AppError } from './errors.js';
import { fixture, type FixtureName } from './fixtures.js';
import { insertProject } from './projects.js';
import { getSettings } from './routes/settings.js';

// The sample projects of the agreed mockup (design decision 10), for trying
// the app locally.

interface Sample {
  key: string;
  title: string;
  category: Category;
  status: Status;
  campaign?: string;
  system: string;
  seed?: string;
  // Text and done; a due date as MM-DD, given the next such day.
  todo: Array<[string, boolean, string?]>;
  // The document, when not the category's skeleton.
  document?: FixtureName;
}

const samples: Sample[] = [
  {
    key: 'bl',
    title: 'Blacksad - Il Continentale',
    category: 'campaign',
    status: 'in-progress',
    system: 'Not The End',
    seed: 'Veridian anni ’50: i personaggi sono gli ultimi che possono testimoniare contro il Continentale. Ognuno ha un motivo per tacere.',
    todo: [
      ['Fronti e minacce', true],
      ['PNG ricorrenti', true],
      ['Mappa di Veridian', false],
      ['Fili aperti dopo la sessione 2', false],
      ['Rileggere le note', true],
    ],
  },
  {
    key: 'cg',
    title: 'Cronaca del Gabbiano',
    category: 'campaign',
    status: 'in-progress',
    system: 'Historia',
    seed: 'Giovani forestieri nella Venezia del Cinquecento, raccontati da Zenone Malamocco, che mente quando gli conviene.',
    todo: [
      ['Fronti e minacce', true],
      ['PNG ricorrenti', false],
      ['Mappa della laguna', false],
    ],
  },
  {
    key: 'ap',
    title: 'Apocrypha',
    category: 'campaign',
    status: 'complete',
    system: 'Vileborn',
    seed: 'Prima campagna di Vileborn.',
    todo: [['Epilogo', true]],
  },
  {
    key: 'lo',
    title: 'Il ballo dei Lorenzetti',
    category: 'adventure',
    status: 'draft',
    campaign: 'bl',
    system: 'Not The End',
    seed: 'Un ballo in maschera a Veridian dove il Continentale vende un ritratto rubato. I personaggi sono invitati come camerieri.',
    todo: [
      ['Scrivere le scene', false],
      ['Schede dei PNG', false],
      ['Prompt Midjourney', false],
      ['Immagini scelte', false],
      ['Prompt Suno', false],
      ['Brani scelti', false],
      ['PDF per il tavolo', false],
      ['Export CueBard', false],
      ['Rilettura', false],
    ],
  },
  {
    key: 'sp',
    title: 'Pioggia su Kenmore Street',
    category: 'adventure',
    status: 'complete',
    campaign: 'bl',
    system: 'Not The End',
    seed: 'Un pugile scompare la notte prima dell’incontro.',
    todo: [
      ['Scrivere le scene', true],
      ['Schede dei PNG', true],
      ['PDF per il tavolo', true],
      ['Rilettura', true],
    ],
  },
  {
    key: 'ca',
    title: "Le ali di Ca' Malamocco",
    category: 'adventure',
    status: 'in-progress',
    campaign: 'cg',
    system: 'Historia',
    seed: 'Una macchina volante di Leonardo, mai costruita, viene rubata dal palazzo di famiglia di Zenone.',
    todo: [
      ['Scrivere le scene', true],
      ['Schede dei PNG', true],
      ['Prompt Midjourney', true],
      ['Immagini scelte', false],
      ['Prompt Suno', true],
      ['Brani scelti', false],
      ['PDF per il tavolo', false],
      ['Export CueBard', false],
      ['Rilettura', false],
    ],
  },
  {
    key: 'sa',
    title: "L'Ancora di Sabaoth",
    category: 'one-shot',
    status: 'in-progress',
    system: 'Kulthos',
    seed: 'Messina, 28 dicembre 1908. Il terremoto non è un caso: qualcuno ha tirato l’ancora che teneva ferma la città. Colapesce non regge più la colonna.',
    todo: [
      ['Scrivere le scene', true],
      ['Schede dei PNG', true],
      ['Prompt Midjourney', true],
      ['Immagini scelte', true],
      ['Prompt Suno', true],
      ['Brani scelti', false],
      ['PDF per il tavolo', false, '10-24'],
      ['Export CueBard', false, '10-24'],
      ['Rilettura', false],
    ],
    document: 'l-ancora-di-sabaoth.converted.md',
  },
];

// The mockup's imported draft one-shot, from the format package's example
// note through the import path. The template's example is the same adventure
// as the Sabaoth above, so it is renamed to tell the two apart in the list.
const imported = {
  fileName: 'esempio.md',
  title: "L'Ancora di Sabaoth (esempio del modello)",
  todo: [
    ['Scrivere le scene', false],
    ['Schede dei PNG', false],
    ['PDF per il tavolo', false],
    ['Rilettura', false],
  ] as Array<[string, boolean]>,
};

// The next MM-DD on or after today, as YYYY-MM-DD.
function nextDay(monthDay: string, today = new Date()): string {
  const year = today.getUTCFullYear();
  const date = `${year}-${monthDay}`;
  return date >= today.toISOString().slice(0, 10) ? date : `${year + 1}-${monthDay}`;
}

// Creates the sample projects for a user who has none; answers how many.
export async function seedProjects(db: Db, username: string): Promise<number> {
  const user = await findUserByUsername(db, username);
  if (!user) throw new AppError(404, 'not_found', `There is no account "${username}".`);
  const settings = await getSettings(db, user.id);

  return db.withTransaction(async (tx) => {
    const existing = await tx.queryOne<{ count: string }>('select count(*) from projects where owner_id = $1', [
      user.id,
    ]);
    if (Number(existing?.count) > 0) {
      throw new AppError(409, 'not_empty', `"${user.username}" already has projects; the seed only fills an empty account.`);
    }

    const ids = new Map<string, string>();
    const titles = new Map<string, string>();
    for (const sample of samples) {
      const id = randomUUID();
      ids.set(sample.key, id);
      titles.set(sample.key, sample.title);
      const campaignTitle = sample.campaign ? titles.get(sample.campaign)! : null;
      const doc = createProjectDoc({
        id,
        title: sample.title,
        category: sample.category,
        status: sample.status,
        campaignId: sample.campaign ? ids.get(sample.campaign)! : null,
        system: sample.system,
        seed: sample.seed ?? '',
        todo: sample.todo.map(([text]) => text),
        document: sample.document
          ? fixture(sample.document)
          : skeletonDocument(sample.category, {
            title: sample.title,
            system: sample.system,
            campaignTitle,
            author: settings.author,
            copyright: settings.copyright,
            licence: settings.licence,
          }),
      });
      readTodo(doc).forEach((item, index) => {
        const [, done, due] = sample.todo[index]!;
        if (done || due) updateTodo(doc, item.id, { done, ...(due ? { due: nextDay(due) } : {}) });
      });
      await insertProject(tx, user.id, doc);
    }

    const note = prepareImport(fixture('esempio.md'), { fileName: imported.fileName, campaigns: [] });
    const doc = createProjectDoc({
      id: randomUUID(),
      title: note.title,
      category: 'one-shot',
      status: 'draft',
      campaignId: null,
      system: 'Kulthos',
      todo: imported.todo.map(([text]) => text),
      document: note.text,
    });
    setTitle(doc, imported.title);
    await insertProject(tx, user.id, doc);
    return samples.length + 1;
  });
}

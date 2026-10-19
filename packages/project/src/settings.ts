import type { Category } from './model.js';

// A user's settings: the to-do list each new project of a category starts
// from, and the defaults written into a new document's front matter.
export interface Settings {
  todoTemplates: Record<Category, string[]>;
  author: string;
  copyright: string;
  licence: string;
  system: string;
}

const adventureTodo = [
  'Scrivere le scene',
  'Schede dei PNG',
  'Prompt Midjourney',
  'Immagini scelte',
  'Prompt Suno',
  'Brani scelti',
  'PDF per il tavolo',
  'Export CueBard',
  'Rilettura',
];

const campaignTodo = [
  'Fronti e minacce',
  'PNG ricorrenti',
  'Mappa',
  'Fili aperti dopo ogni sessione',
  'Rileggere le note prima di giocare',
];

// What a new user starts from. A function, so no caller can change the
// defaults by editing what it was given.
export function defaultSettings(): Settings {
  return {
    todoTemplates: {
      campaign: [...campaignTodo],
      adventure: [...adventureTodo],
      'one-shot': [...adventureTodo],
    },
    author: '',
    copyright: '',
    licence: '',
    system: '',
  };
}

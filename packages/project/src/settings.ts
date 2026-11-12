import { defaultTemplateRef } from 'promptbook-format';
import type { ImageModelKey } from './images.js';
import type { Category } from './model.js';
import { isImageProvider, type ImageProvider } from './providers.js';

// A user's settings: the to-do list each new project of a category starts
// from, the document template each kind starts from (a template id, used at
// its latest version), the defaults written into a new document's front
// matter, and the defaults the Generate panel starts from
// (board-image-generation design decision 3), with the service Generate goes
// through (atelier-image-provider design decision 5). Nothing secret: the
// desktop keeps a copy on disk.
export interface Settings {
  todoTemplates: Record<Category, string[]>;
  defaultTemplates: { adventure: string; campaign: string };
  author: string;
  copyright: string;
  licence: string;
  system: string;
  imageGeneration: { model: ImageModelKey; count: 1 | 2 | 3 | 4; provider: ImageProvider };
}

// The provider of settings as another client or an older version saved them:
// OpenRouter unless they name a known one.
export function imageProviderOf(settings: unknown): ImageProvider {
  const generation =
    typeof settings === 'object' && settings !== null ? (settings as { imageGeneration?: unknown }).imageGeneration : null;
  const provider =
    typeof generation === 'object' && generation !== null ? (generation as { provider?: unknown }).provider : null;
  return isImageProvider(provider) ? provider : 'openrouter';
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
    defaultTemplates: {
      adventure: defaultTemplateRef('adventure').id,
      campaign: defaultTemplateRef('campaign').id,
    },
    author: '',
    copyright: '',
    licence: '',
    system: '',
    imageGeneration: { model: 'gpt', count: 2, provider: 'openrouter' },
  };
}

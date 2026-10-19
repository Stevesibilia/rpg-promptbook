import { parseAdventure, templates } from 'promptbook-format';
import type { ParseAnswer, ParseRequest } from './client.js';

// Parses adventures and one-shots off the main thread (design decision 3).
// Campaigns never reach it.
self.addEventListener('message', (event: MessageEvent<ParseRequest>) => {
  const { version, text } = event.data;
  let answer: ParseAnswer;
  try {
    answer = { version, result: parseAdventure(text, { template: templates.avventura }) };
  } catch (error) {
    answer = { version, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(answer);
});

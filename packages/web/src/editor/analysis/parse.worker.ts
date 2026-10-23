import { parseAdventure } from 'promptbook-format';
import type { ParseAnswer, ParseRequest } from './client.js';

// Parses adventures and one-shots off the main thread (design decision 3).
// Campaigns never reach it. Each request brings the project's template.
self.addEventListener('message', (event: MessageEvent<ParseRequest>) => {
  const { version, text, template } = event.data;
  let answer: ParseAnswer;
  try {
    answer = { version, result: parseAdventure(text, { template }) };
  } catch (error) {
    answer = { version, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(answer);
});

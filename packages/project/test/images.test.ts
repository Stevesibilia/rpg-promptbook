import { describe, expect, it } from 'vitest';
import { defaultShape, IMAGE_MODELS, imageModelKeys, sentPrompt } from '../src/index.js';

// The mockup's prompts (docs/mockups/image-generation.html).
const LIBRARY =
  'collapsed 1900s Sicilian library at night, broken beams, books buried in dust, oil lamp light, shadows stretching toward the sea, sepia and ash palette --ar 16:9 --v 8.1';
const CATHEDRAL =
  'collapsed cathedral facade, soldiers in 1908 Italian uniforms standing perfectly still among the ruins, survivors kneeling in rows, smoke and grey sky, desaturated --ar 3:2 --v 8.1 --no text, letters, modern buildings';
const FISHERWOMAN =
  'old Sicilian fisherwoman singing on the shore at dusk, black shawl, the sea glinting behind her like many eyes, melancholic --ar 2:3 --v 8.1';
const PROSE =
  'Wide shot of a collapsed 1900s Sicilian library at night. Broken ceiling beams, books buried in grey dust, one oil lamp on the floor throwing long shadows toward a broken window that opens on a black sea. Sepia and ash palette, 1900s glass-plate photograph, grain and soft vignette.';

describe('the models', () => {
  it('map each key to its OpenRouter id', () => {
    expect(imageModelKeys).toEqual(['gpt', 'nb']);
    expect(IMAGE_MODELS.gpt.id).toBe('openai/gpt-image-2.6-sunburst');
    expect(IMAGE_MODELS.nb.id).toBe('google/gemini-nano-banana-2.1');
  });
});

describe('sentPrompt (D5)', () => {
  it('sends a Midjourney prompt’s text before its flags', () => {
    expect(sentPrompt(LIBRARY)).toEqual({
      text: 'collapsed 1900s Sicilian library at night, broken beams, books buried in dust, oil lamp light, shadows stretching toward the sea, sepia and ash palette',
      base: 'collapsed 1900s Sicilian library at night, broken beams, books buried in dust, oil lamp light, shadows stretching toward the sea, sepia and ash palette',
      flags: '--ar 16:9 --v 8.1',
      no: null,
      ar: '16:9',
    });
  });

  it('turns --no into a sentence, its last comma into «or»', () => {
    const sent = sentPrompt(CATHEDRAL);
    expect(sent.text).toMatch(/, desaturated\. No text, letters or modern buildings\.$/);
    expect(sent.base).toMatch(/, desaturated$/);
    expect(sent.flags).toBe('--ar 3:2 --v 8.1 --no text, letters, modern buildings');
    expect(sent.no).toBe('text, letters or modern buildings');
    expect(sent.ar).toBe('3:2');
  });

  it('keeps the third mockup prompt’s shape', () => {
    const sent = sentPrompt(FISHERWOMAN);
    expect(sent.text).toMatch(/, melancholic$/);
    expect(sent.ar).toBe('2:3');
    expect(sent.no).toBeNull();
  });

  it('sends a prose prompt unchanged', () => {
    expect(sentPrompt(PROSE)).toEqual({ text: PROSE, base: PROSE, flags: '', no: null, ar: null });
    expect(sentPrompt(`  ${PROSE}\n`).text).toBe(PROSE);
  });

  it('takes a single --no item as it is', () => {
    expect(sentPrompt('a quiet harbour --no text').text).toBe('a quiet harbour. No text.');
    expect(sentPrompt('a quiet harbour --no text').no).toBe('text');
  });

  it('reads --no up to the next flag, wherever it stands', () => {
    const before = sentPrompt('a quiet harbour. --no boats, gulls --ar 21:9 --style raw');
    expect(before.text).toBe('a quiet harbour. No boats or gulls.');
    expect(before.ar).toBe('21:9');
    expect(sentPrompt('a quiet harbour --v 8.1 --no boats, gulls, people').text).toBe(
      'a quiet harbour. No boats, gulls or people.',
    );
  });

  it('sends no sentence for an empty --no, and leaves other words alone', () => {
    expect(sentPrompt('a quiet harbour --no --ar 3:2')).toMatchObject({ text: 'a quiet harbour', no: null, ar: '3:2' });
    expect(sentPrompt('a quiet harbour --normal')).toMatchObject({ text: 'a quiet harbour', no: null });
    expect(sentPrompt('a well-lit room -- with no flags')).toMatchObject({ text: 'a well-lit room -- with no flags', flags: '' });
  });
});

describe('defaultShape (D6)', () => {
  it('takes the prompt’s --ar when it is an allowed shape', () => {
    expect(defaultShape('npc', '16:9')).toEqual({ shape: '16:9', source: 'prompt' });
    expect(defaultShape('scene', '2:3')).toEqual({ shape: '2:3', source: 'prompt' });
  });

  it('maps another --ar to the nearest allowed shape', () => {
    expect(defaultShape('scene', '21:9')).toEqual({ shape: '16:9', source: 'nearest' });
    expect(defaultShape('scene', '4:5')).toEqual({ shape: '2:3', source: 'nearest' });
    expect(defaultShape('pc', '1:1')).toEqual({ shape: '1:1', source: 'prompt' });
    expect(defaultShape('pc', '9:10')).toEqual({ shape: '1:1', source: 'nearest' });
    expect(defaultShape('pc', '5:4')).toEqual({ shape: '3:2', source: 'nearest' });
  });

  it('falls back to the category’s shape', () => {
    expect(defaultShape('scene', null)).toEqual({ shape: '16:9', source: 'category' });
    expect(defaultShape('pc', null)).toEqual({ shape: '2:3', source: 'category' });
    expect(defaultShape('npc', '0:3')).toEqual({ shape: '2:3', source: 'category' });
    expect(defaultShape('handout', null)).toEqual({ shape: '1:1', source: 'category' });
  });
});

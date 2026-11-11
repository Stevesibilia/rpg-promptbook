import { describe, expect, it } from 'vitest';
import { errorFor, IMAGE_ERRORS } from '../../src/images/openrouter.js';

describe('OpenRouter’s answers in plain words (board-image-generation D10)', () => {
  it('maps each status', () => {
    expect(errorFor(401, '')).toBe('OpenRouter rejected your key. Check it in Settings → Image generation.');
    expect(errorFor(402, '')).toBe(
      'OpenRouter refused: your key has no credit left. Add credit on openrouter.ai, then try again.',
    );
    expect(errorFor(429, '')).toBe('OpenRouter is busy (rate limit). Try again in a minute.');
    expect(errorFor(400, '{"error":{"message":"Flagged by moderation"}}')).toBe(
      'OpenRouter refused this prompt (content policy).',
    );
    expect(errorFor(400, '{"error":{"message":"Content policy violation"}}')).toBe(IMAGE_ERRORS.content);
    expect(errorFor(400, '{"error":{"message":"bad aspect_ratio"}}')).toBe('OpenRouter refused the request (HTTP 400).');
    expect(errorFor(403, '')).toBe('OpenRouter refused the request (HTTP 403).');
    for (const status of [500, 502, 503, 504]) expect(errorFor(status, '')).toBe('OpenRouter did not answer. Try again.');
  });
});

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { errorFor, generateImage, IMAGE_ERRORS } from '../../src/images/openrouter.js';

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

describe('an answer too large to read', () => {
  it('is refused as it streams, without a Content-Length', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const chunk = Buffer.alloc(1024 * 1024, 0x41);
      let sent = 0;
      const more = () => {
        while (sent < 80) {
          sent++;
          if (!res.write(chunk)) return void res.once('drain', more);
        }
        res.end();
      };
      res.on('error', () => {});
      more();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const answer = await generateImage(`http://127.0.0.1:${port}/api/v1`, 'sk-or-v1-good', {
        model: 'openai/gpt-image-2.6-sunburst',
        prompt: 'a pier',
        aspectRatio: '1:1',
      });
      expect(answer).toEqual({ ok: false, error: IMAGE_ERRORS.noImage });
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

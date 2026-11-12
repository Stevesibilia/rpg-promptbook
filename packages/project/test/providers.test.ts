import { describe, expect, it } from 'vitest';
import { defaultSettings, imageProviderOf, IMAGE_PROVIDERS, isImageProvider, PROVIDER_NAMES } from '../src/index.js';

// The image provider (atelier-image-provider design decision 5).

describe('the image provider', () => {
  it('knows OpenRouter and Atelier by name', () => {
    expect(IMAGE_PROVIDERS).toEqual(['openrouter', 'atelier']);
    expect(PROVIDER_NAMES).toEqual({ openrouter: 'OpenRouter', atelier: 'Atelier' });
    expect(IMAGE_PROVIDERS.every(isImageProvider)).toBe(true);
    for (const value of ['Atelier', 'midjourney', '', null, undefined, 1]) expect(isImageProvider(value)).toBe(false);
  });

  it('is OpenRouter in the default settings', () => {
    expect(defaultSettings().imageGeneration.provider).toBe('openrouter');
    expect(imageProviderOf(defaultSettings())).toBe('openrouter');
  });

  it('reads settings saved before it as OpenRouter, and a chosen one as chosen', () => {
    const { imageGeneration: _left, ...older } = defaultSettings();
    expect(imageProviderOf(older)).toBe('openrouter');
    expect(imageProviderOf({ ...older, imageGeneration: { model: 'nb', count: 3 } })).toBe('openrouter');
    expect(imageProviderOf({ ...older, imageGeneration: { model: 'nb', count: 3, provider: 'flux' } })).toBe('openrouter');
    expect(imageProviderOf({ ...older, imageGeneration: { model: 'nb', count: 3, provider: 'atelier' } })).toBe('atelier');
    for (const value of [null, undefined, 'atelier', { imageGeneration: null }, { imageGeneration: 'atelier' }]) {
      expect(imageProviderOf(value)).toBe('openrouter');
    }
  });
});

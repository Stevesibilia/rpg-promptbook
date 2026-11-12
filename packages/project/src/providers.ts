// The services that generate board images (atelier-image-provider design
// decision 5): OpenRouter with the account's own key, or the owner's Atelier
// with an API token. Each account chooses one in Settings.

export const IMAGE_PROVIDERS = ['openrouter', 'atelier'] as const;
export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

export const isImageProvider = (value: unknown): value is ImageProvider =>
  typeof value === 'string' && (IMAGE_PROVIDERS as readonly string[]).includes(value);

export const PROVIDER_NAMES: Record<ImageProvider, string> = {
  openrouter: 'OpenRouter',
  atelier: 'Atelier',
};

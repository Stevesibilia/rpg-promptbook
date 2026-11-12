import {
  defaultSettings,
  defaultShape,
  IMAGE_MODELS,
  IMAGE_PROVIDERS,
  isImageModelKey,
  PROVIDER_NAMES,
  sentPrompt,
  STALE_GENERATION_MS,
  type FileEntry,
  type GenerationJob,
  type ImageCategory,
  type ImageModelKey,
  type ImageProvider,
  type ImageShape,
  type Settings,
  type ShapeSource,
} from 'promptbook-project';
import type { ImageGenerationStatus } from '../api.js';
import { categoryText, newName, type ShownPrompt } from './summary.js';

// The texts and choices of image generation on the board
// (board-image-generation design decisions 6, 10, 12 and 13, «The approved
// screens»), kept out of the components so they can be tested.

export type ImageCount = 1 | 2 | 3 | 4;
export const imageCounts = [1, 2, 3, 4] as const satisfies readonly ImageCount[];

export interface GenerateChoice {
  model: ImageModelKey;
  count: ImageCount;
}

const isCount = (value: unknown): value is ImageCount =>
  typeof value === 'number' && (imageCounts as readonly number[]).includes(value);

// The Settings defaults, read with care: a desktop that cached its settings
// before this change has none, and the panel then starts from the built-in
// ones.
export function generateDefaults(settings: Partial<Settings> | null | undefined): GenerateChoice {
  const fallback = defaultSettings().imageGeneration;
  const stored = settings?.imageGeneration as Partial<GenerateChoice> | undefined;
  return {
    model: isImageModelKey(stored?.model) ? stored.model : fallback.model,
    count: isCount(stored?.count) ? stored.count : fallback.count,
  };
}

// The panel starts from the session's last choice, else the defaults.
export const startChoice = (defaults: GenerateChoice, last: GenerateChoice | null): GenerateChoice => last ?? defaults;

export const money2 = (dollars: number): string => `$${dollars.toFixed(2)}`;
export const money3 = (dollars: number): string => `$${dollars.toFixed(3)}`;

// The short names on a thumbnail's badge: they live in the web client.
export const shortModel: Record<ImageModelKey, string> = { gpt: 'GPT', nb: 'Nano Banana' };

// The price estimates of the chosen provider (atelier-image-provider D13):
// Atelier's own, as its last check answered them, through Atelier; null for
// the built-in ones.
export type Estimates = Partial<Record<ImageModelKey, number>> | null;

export const providerEstimates = (
  status: Pick<ImageGenerationStatus, 'provider' | 'atelier'> | null | undefined,
): Estimates => (status?.provider === 'atelier' ? (status.atelier?.token?.estimates ?? null) : null);

// A model's estimate per image, falling back to the built-in one where the
// provider gave none.
export const estimateOf = (model: ImageModelKey, estimates: Estimates = null): number =>
  estimates?.[model] ?? IMAGE_MODELS[model].estimate;

// «≈ $0.04 · 53 s per image», under a model's name on its card.
export const modelLine = (model: ImageModelKey, estimates: Estimates = null): string =>
  `≈ ${money2(estimateOf(model, estimates))} · ${IMAGE_MODELS[model].seconds} s per image`;

// The footer: «About $0.08 · 1K», the estimate times the count. The tier,
// never a size in pixels: the two models answer different sizes (Q4).
export function priceLine(choice: GenerateChoice, estimates: Estimates = null): { amount: string; text: string } {
  const amount = money2(estimateOf(choice.model, estimates) * choice.count);
  return { amount, text: `About ${amount} · 1K` };
}

// The shape a prompt starts from and the hint after «Shape».
export function panelShape(
  category: ImageCategory,
  text: string,
): { shape: ImageShape; source: ShapeSource; hint: string } {
  const { ar } = sentPrompt(text);
  const { shape, source } = defaultShape(category, ar);
  return { shape, source, hint: shapeHint(category, source, ar) };
}

export function shapeHint(category: ImageCategory, source: ShapeSource, ar: string | null): string {
  if (source === 'prompt') return "from the prompt's --ar";
  if (source === 'nearest') return `nearest to the prompt's --ar ${ar ?? ''}`.trimEnd();
  return `default for ${categoryText[category].tab}`;
}

// «What is sent»: the text before the flags, the `--no` sentence added, the
// flags struck through.
export interface SentView {
  summary: string;
  open: boolean;
  base: string;
  added: string | null;
  dropped: string | null;
}

export function sentView(text: string): SentView {
  const sent = sentPrompt(text);
  const flagged = sent.flags !== '';
  return {
    summary: flagged ? 'What is sent: Midjourney flags left out' : 'What is sent',
    open: flagged,
    base: flagged ? sent.base : sent.text,
    added: sent.no === null ? null : `No ${sent.no}.`,
    dropped: flagged ? sent.flags : null,
  };
}

// Who generated an image: an image generated before Atelier came reads as
// OpenRouter's (atelier-image-provider D11).
export const viaOf = (file: Pick<FileEntry, 'generatedVia'>): ImageProvider => file.generatedVia ?? 'openrouter';

// A generated thumbnail's badge: «GPT · $0.04», its title «GPT Image 2.6
// Sunburst through Atelier, $0.081»; `short`, the cost alone, for a tile too
// narrow for the text. Null for every other file.
export function badge(
  file: Pick<FileEntry, 'generatedModel' | 'generatedVia' | 'cost'>,
): { model: ImageModelKey; text: string; short: string; title: string } | null {
  const model = file.generatedModel;
  if (model === null) return null;
  const known = file.cost !== null;
  return {
    model,
    text: `${shortModel[model]} · ${known ? money2(file.cost!) : 'cost unknown'}`,
    short: known ? money2(file.cost!) : '$?',
    title: `${IMAGE_MODELS[model].full} through ${PROVIDER_NAMES[viaOf(file)]}, ${known ? money3(file.cost!) : 'cost unknown'}`,
  };
}

// A row of the viewer; `link`, when there is one, follows the value.
export interface ViewerRow {
  label: string;
  value: string;
  link?: { href: string; text: string };
}

// The viewer's rows for a generated file, in place of «Matched by»: Source,
// Through, Model and Cost. An Atelier image links to Atelier when the
// server's Atelier address is known (D13).
export function generatedRows(
  file: Pick<FileEntry, 'generatedModel' | 'generatedVia' | 'atelierImageId' | 'cost'>,
  atelierUrl: string | null = null,
): ViewerRow[] | null {
  const model = file.generatedModel;
  if (model === null) return null;
  const via = viaOf(file);
  const through: ViewerRow = { label: 'Through', value: PROVIDER_NAMES[via] };
  if (via === 'atelier' && atelierUrl && file.atelierImageId) {
    through.link = {
      href: `${atelierUrl}/images/${encodeURIComponent(file.atelierImageId)}`,
      text: `No. ${file.atelierImageId.slice(0, 8)} in Atelier ↗`,
    };
  }
  return [
    { label: 'Source', value: 'Generated' },
    through,
    { label: 'Model', value: IMAGE_MODELS[model].full },
    { label: 'Cost', value: file.cost === null ? 'unknown' : money3(file.cost) },
  ];
}

// «Generated here»'s title: the providers that billed the images on the
// board, «OpenRouter and Atelier» (D13).
export function generatedHereTitle(files: readonly Pick<FileEntry, 'generatedModel' | 'generatedVia'>[]): string {
  const present = new Set(files.filter((f) => f.generatedModel !== null).map(viaOf));
  const names = IMAGE_PROVIDERS.filter((p) => present.has(p)).map((p) => PROVIDER_NAMES[p]);
  return names.length === 0 ? 'Generated in this project' : `Generated in this project, as billed by ${names.join(' and ')}`;
}

// The Atelier collection a project's images go into, as the server names it
// (D7): its title trimmed, at most 60 characters, never half of one.
export function collectionTitle(title: string): string {
  let name = title.trim();
  if (name.length > 60) {
    name = name.slice(0, 60);
    if (/[\uD800-\uDBFF]$/.test(name)) name = name.slice(0, -1);
  }
  return name.trim() || 'Promptbook project';
}

// «$20», «$20.50»: Atelier's cap, whole dollars without cents.
export const capDollars = (dollars: number): string => (Number.isInteger(dollars) ? `$${dollars}` : money2(dollars));

// The panel's first line (D13): which provider Generate goes through.
export function throughLine(
  status: Pick<ImageGenerationStatus, 'provider' | 'atelier'>,
  projectTitle: string,
): { provider: ImageProvider; rest: string } {
  if (status.provider === 'openrouter') return { provider: 'openrouter', rest: ' · billed to your OpenRouter key' };
  const month = status.atelier.token?.month ?? null;
  const used = month ? ` · ${money2(month.spent)} of ${capDollars(month.cap)} used this month` : '';
  return { provider: 'atelier', rest: ` · into the collection «${collectionTitle(projectTitle)}»${used}` };
}

// What the panel asks for when the chosen provider has no credential.
export const noCredential = (provider: ImageProvider): string =>
  provider === 'atelier'
    ? 'Add your Atelier API token first. Images are billed against your Atelier monthly cap.'
    : 'Add your OpenRouter key first. Images are billed to your OpenRouter account.';

// The images still to come on a running job.
export const slotsLeft = (job: Pick<GenerationJob, 'count' | 'done' | 'failed'>): number =>
  Math.max(0, job.count - job.done - job.failed);

// «Generating 2 of 4 with GPT Image 2.6 through Atelier · 47s. It keeps
// going if you leave this page.» The seconds since the server started it,
// never below 0 when the clocks differ.
export function progressLine(
  job: Pick<GenerationJob, 'count' | 'done' | 'failed' | 'model' | 'provider' | 'startedAt'>,
  now: number,
): string {
  const at = Math.min(job.done + job.failed + 1, job.count);
  const seconds = Math.max(0, Math.floor((now - Date.parse(job.startedAt)) / 1000));
  const through = PROVIDER_NAMES[job.provider];
  return `Generating ${at} of ${job.count} with ${IMAGE_MODELS[job.model].name} through ${through} · ${seconds}s. It keeps going if you leave this page.`;
}

// The error line under a prompt: the job's error as the server wrote it
// (with «Nothing was charged.» when that applies), its first sentence bold.
export function errorLine(job: Pick<GenerationJob, 'error'>): { strong: string; rest: string } | null {
  if (!job.error) return null;
  const cut = job.error.search(/\.(\s|$)/);
  const strong = cut === -1 ? job.error : job.error.slice(0, cut + 1);
  return { strong, rest: job.error.slice(strong.length).trim() };
}

// The job's images on its prompt: generated by its model, added since it
// started (the server's clock for both).
export function jobFiles(files: readonly FileEntry[], job: Pick<GenerationJob, 'promptId' | 'model' | 'startedAt'>): FileEntry[] {
  const since = Date.parse(job.startedAt);
  return files.filter(
    (f) =>
      f.promptId === job.promptId &&
      f.matchedBy === 'generated' &&
      f.generatedModel === job.model &&
      Date.parse(f.addedAt) >= since,
  );
}

// «S2 · prompt 1», «Padre Anselmo».
export const toastLabel = ({ row, scene }: ShownPrompt): string =>
  scene
    ? `${scene.sceneId} · prompt ${row.number}`
    : row.prompt.name || newName(row.prompt.category as Exclude<ImageCategory, 'scene'>);

// «2 images for S2 · prompt 1 · $0.08»; null when none arrived.
export function doneToast(label: string, files: readonly Pick<FileEntry, 'cost'>[]): string | null {
  if (files.length === 0) return null;
  const cost = files.reduce((sum, f) => sum + (f.cost ?? 0), 0);
  return `${files.length} ${files.length === 1 ? 'image' : 'images'} for ${label} · ${money2(cost)}`;
}

// The jobs that ended between two readings: running before, and now gone
// (finished without an error) or finished with one. A running job that went
// stale meanwhile did not end: the server that ran it stopped.
export function endedJobs(
  before: readonly GenerationJob[],
  after: readonly GenerationJob[],
  now: number,
): { job: GenerationJob; error: string | null }[] {
  const later = new Map(after.map((j) => [j.id, j]));
  const ended: { job: GenerationJob; error: string | null }[] = [];
  for (const job of before) {
    if (job.finishedAt !== null) continue;
    const next = later.get(job.id);
    if (next && next.finishedAt === null) continue;
    if (!next && isStale(job, now)) continue;
    ended.push({ job, error: next?.error ?? null });
  }
  return ended;
}

// As the project's rule: a start too far in the past, or in the future.
export const isStale = (job: Pick<GenerationJob, 'startedAt' | 'finishedAt'>, now: number): boolean =>
  job.finishedAt === null && Math.abs(now - Date.parse(job.startedAt)) > STALE_GENERATION_MS;

// The job a prompt shows: its running one, else its newest error.
export function jobsByPrompt(jobs: readonly GenerationJob[]): Map<string, GenerationJob> {
  const byPrompt = new Map<string, GenerationJob>();
  for (const job of jobs) {
    const held = byPrompt.get(job.promptId);
    if (!held || (held.finishedAt !== null && (job.finishedAt === null || job.startedAt >= held.startedAt))) {
      byPrompt.set(job.promptId, job);
    }
  }
  return byPrompt;
}

// Why Generate did not start, in plain words (the route's refusals, D7).
export function refusal(code: string, message: string, desktop: boolean, provider: ImageProvider = 'openrouter'): string {
  switch (code) {
    case 'busy':
      return 'Images are already being generated for this prompt.';
    case 'too_many_jobs':
      return 'Three generations are already running. Wait for one to finish.';
    case 'no_key':
      return noCredential(provider);
    case 'not_configured':
      return 'This server is not set up for image generation.';
    case 'quota':
      return 'Your files have reached their quota.';
    case 'prompt_not_found':
      return 'This prompt is no longer on the board.';
    case 'prompt_empty':
      return 'This prompt has no text to send.';
    case 'offline':
    case 'network':
      return desktop ? OFFLINE_TITLE : message;
    default:
      return message;
  }
}

// Generate, offline on the desktop (D15).
export const OFFLINE_TITLE = 'Generating needs the server. It comes back when this computer is online.';

// The thumbnail backfill's next file (D12): an image with no thumbnail, not
// tried yet on this page.
export function nextThumbless(files: readonly FileEntry[], tried: ReadonlySet<string>): FileEntry | null {
  return files.find((f) => f.kind === 'image' && f.thumbSha256 === null && !tried.has(f.id)) ?? null;
}

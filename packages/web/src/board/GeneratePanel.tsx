import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import {
  dismissGenerationError,
  IMAGE_MODELS,
  IMAGE_SHAPES,
  imageModelKeys,
  type FileEntry,
  type GenerationJob,
  type ImageShape,
} from 'promptbook-project';
import { CoinIcon, SparkIcon, WarningIcon } from '../ui/icons.js';
import { useBoardContext } from './context.js';
import {
  badge,
  errorLine,
  imageCounts,
  modelLine,
  money2,
  OFFLINE_TITLE,
  panelShape,
  priceLine,
  progressLine,
  sentView,
  startChoice,
  type GenerateChoice,
} from './generate.js';
import type { ShownPrompt } from './summary.js';
import { lastChoiceOf, loadGenerationStatus, rememberChoice, type Refused } from './useGeneration.js';

// Generate on an image prompt (board-image-generation design decision 13,
// «The approved screens», screens 2, 3, 7 and 8): the button, its panel,
// the progress of a job and its error.

export const SETTINGS_PATH = '/settings/image-generation';

// «16:9» as a CSS aspect ratio.
export const ratioOf = (shape: ImageShape) => shape.replace(':', ' / ');
export const isTall = (shape: ImageShape) => {
  const [w, h] = shape.split(':').map(Number) as [number, number];
  return h > w;
};

// After Copy and Edit. Disabled while a job runs on the prompt, and offline
// on the desktop.
export function GenerateButton({
  prompt,
  busy,
  button,
}: {
  prompt: ShownPrompt;
  busy: boolean;
  button: RefObject<HTMLButtonElement | null>;
}) {
  const { generation: gen } = useBoardContext();
  const id = prompt.row.prompt.id;
  const open = gen.open === id;
  const title = gen.offline ? OFFLINE_TITLE : busy ? 'Generating…' : undefined;
  return (
    <button
      ref={button}
      className="tb sm gen"
      disabled={gen.offline || busy}
      title={title}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={() => gen.setOpen(open ? null : id)}
    >
      <SparkIcon />
      Generate
    </button>
  );
}

// The panel under the prompt box: closed by ✕, Cancel, Esc or a second click
// on Generate.
export function GeneratePanel({
  prompt,
  button,
}: {
  prompt: ShownPrompt;
  button: RefObject<HTMLButtonElement | null>;
}) {
  const { generation: gen } = useBoardContext();
  const { status } = gen;
  const entry = prompt.row.prompt;
  const close = () => {
    gen.setOpen(null);
    button.current?.focus();
  };
  const latestClose = useRef(close);
  latestClose.current = close;

  // A failed status is asked again when the panel opens.
  const retry = gen.retryStatus;
  useEffect(() => retry(), [retry]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latestClose.current();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const head = (
    <h4>
      Generate images
      <button className="tb xs" title="Close" aria-label="Close" onClick={close}>
        ✕
      </button>
    </h4>
  );

  let body;
  if (status.state === 'loading') {
    body = <p className="nokey">Loading…</p>;
  } else if (status.state === 'ready' && !status.status.configured) {
    body = (
      <div className="nokey">
        <span>This server is not set up for image generation.</span>
      </div>
    );
  } else if (status.state === 'ready' && !status.status.key) {
    body = (
      <div className="nokey">
        <span>Add your OpenRouter key first. Images are billed to your OpenRouter account.</span>
        <span>
          <Link className="tb sm primary" to={SETTINGS_PATH} autoFocus>
            Open Settings → Image generation
          </Link>
        </span>
      </div>
    );
  } else {
    // Ready with a key, or a status that could not be read: the server
    // says what is missing when Generate is pressed.
    return (
      <div className="gpop" role="dialog" aria-label="Generate images">
        {head}
        <PanelBody prompt={prompt} text={entry.prompt} onDone={close} />
      </div>
    );
  }
  return (
    <div className="gpop" role="dialog" aria-label="Generate images">
      {head}
      {body}
    </div>
  );
}

function PanelBody({ prompt, text, onDone }: { prompt: ShownPrompt; text: string; onDone(): void }) {
  const { generation: gen } = useBoardContext();
  const entry = prompt.row.prompt;
  const [choice, setChoiceHere] = useState<GenerateChoice>(() => startChoice(gen.defaults, lastChoiceOf(gen.user)));
  const start = panelShape(entry.category, text);
  const [shape, setShape] = useState<ImageShape>(start.shape);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const setChoice = (next: GenerateChoice) => {
    setChoiceHere(next);
    rememberChoice(gen.user, next);
    setRefused(null);
  };
  const view = sentView(text);
  const price = priceLine(choice);

  async function go() {
    if (busy) return;
    setBusy(true);
    setRefused(null);
    const answer = await gen.start(entry.id, { model: choice.model, count: choice.count, shape });
    if (!live.current) return;
    setBusy(false);
    if (!answer) return onDone();
    setRefused(answer);
    // The account changed elsewhere (a key removed on another device): the
    // panel shows what is missing once the status is read again.
    if (answer.code === 'no_key' || answer.code === 'not_configured') loadGenerationStatus(gen.user);
  }

  return (
    <>
      <div>
        <div className="gl">Model</div>
        <div className="models">
          {imageModelKeys.map((key) => (
            <button
              key={key}
              className={`model${choice.model === key ? ' on' : ''}`}
              aria-pressed={choice.model === key}
              onClick={() => setChoice({ ...choice, model: key })}
            >
              <b>{IMAGE_MODELS[key].name}</b>
              <small>{IMAGE_MODELS[key].note}</small>
              <span className="mm">{modelLine(key)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grow">
        <div>
          <div className="gl">Images</div>
          <div className="seg" role="group" aria-label="Images">
            {imageCounts.map((n) => (
              <button
                key={n}
                className={choice.count === n ? 'on' : ''}
                aria-pressed={choice.count === n}
                onClick={() => setChoice({ ...choice, count: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="gl">
            Shape <span>{start.hint}</span>
          </div>
          <div className="seg" role="group" aria-label="Shape">
            {IMAGE_SHAPES.map((s) => (
              <button
                key={s}
                className={shape === s ? 'on' : ''}
                aria-pressed={shape === s}
                onClick={() => {
                  setShape(s);
                  setRefused(null);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <details open={view.open}>
        <summary>{view.summary}</summary>
        <div className="sent">
          {view.base}
          {view.added && (
            <>
              {' '}
              <ins>{view.added}</ins>
            </>
          )}
          {view.dropped && (
            <>
              {' '}
              <s>{view.dropped}</s>
            </>
          )}
        </div>
      </details>
      <div className="gfoot">
        <span className="est">
          About <b>{price.amount}</b> · 1K
        </span>
        <button className="tb sm line" onClick={onDone}>
          Cancel
        </button>
        <button className="tb sm primary" disabled={busy} autoFocus onClick={() => void go()}>
          <SparkIcon />
          Generate {choice.count}
        </button>
      </div>
      {refused && (
        <p className="gerr" role="alert">
          {refused.message}
        </p>
      )}
    </>
  );
}

// Whole seconds tick while a job runs.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// Under the images: «Generating 2 of 4 with GPT Image 2.6 · 47s. It keeps
// going if you leave this page.»
export function GenerationLine({
  job,
}: {
  job: Pick<GenerationJob, 'count' | 'done' | 'failed' | 'model' | 'startedAt'>;
}) {
  const now = useNow();
  return (
    <div className="genline" role="status">
      <span className="spin" />
      <span>{progressLine(job, now)}</span>
    </div>
  );
}

// Screen 8: the job's error, Try again and dismiss.
export function GenerationError({ job, onRetry }: { job: GenerationJob; onRetry(): void }) {
  const { doc, generation: gen } = useBoardContext();
  const line = errorLine(job);
  if (!line) return null;
  return (
    <div className="info err" role="alert">
      <WarningIcon className="ic" />
      <span>
        <b>{line.strong}</b>
        {line.rest && ` ${line.rest}`}
      </span>
      <button className="tb sm line" disabled={gen.offline} title={gen.offline ? OFFLINE_TITLE : undefined} onClick={onRetry}>
        Try again
      </button>
      <button
        className="tb xs x"
        title="Dismiss"
        aria-label="Dismiss"
        onClick={() => dismissGenerationError(doc, job.id)}
      >
        ✕
      </button>
    </div>
  );
}

// A generated thumbnail's model and cost.
export function GeneratedBadge({ file }: { file: FileEntry }) {
  const b = badge(file);
  if (!b) return null;
  return (
    <span className="badge gen" title={b.title}>
      {b.text}
    </span>
  );
}

// «Generated here: 3 images · $0.12», at the right end of the summary line.
// Shown while the count or the cost is above 0: the cost may hold images
// OpenRouter billed that then failed here.
export function GeneratedHere() {
  const { generation: gen } = useBoardContext();
  const total = gen.spending;
  if (!total || (total.images === 0 && total.cost <= 0)) return null;
  return (
    <span className="spend" title="Generated in this project, as billed by OpenRouter">
      <CoinIcon className="ic" />
      <span>
        Generated here:{' '}
        <b>
          {total.images} {total.images === 1 ? 'image' : 'images'} · {money2(total.cost)}
        </b>
      </span>
    </span>
  );
}

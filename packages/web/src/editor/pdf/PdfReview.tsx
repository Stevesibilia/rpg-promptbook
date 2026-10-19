import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { templates } from 'promptbook-format';
import type { LayoutOptions } from 'promptbook-layout';
import type { PdfSnapshot } from './client.js';
import { checkedPages, pageLabels, pagesLabel, shownPages, stepPage, type StageMode } from './pages.js';
import { NoticeError } from './notice.js';
import { PdfNotice, stale } from './PdfPane.js';
import { PdfSheet } from './PdfSheet.js';

const ZOOMS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300];
const GAP = 14;
const template = templates.avventura;

interface Size {
  width: number;
  height: number;
}

// The stage's room for pages, followed as the window changes.
function useRoom(): [RefObject<HTMLDivElement | null>, Size] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

// The width of each page on the stage at 100%: one page as tall as the
// stage, two side by side within it, or one as wide as it.
function baseWidth(mode: StageMode, room: Size, aspect: number, shown: number): number {
  if (room.width <= 0 || room.height <= 0) return 0;
  if (mode === 'fit') return room.width;
  const byHeight = room.height * aspect;
  if (mode === 'single') return Math.min(byHeight, room.width);
  return Math.min(byHeight, (room.width - GAP * (shown - 1)) / shown);
}

// The full-screen review (design decision 12): thumbnails, the stage, the
// layout checks, the options, Save PDF and Print.
export function PdfReview({
  snapshot,
  initialPage,
  options,
  setOptions,
  onClose,
  onJump,
  onSave,
  onPrint,
}: {
  snapshot: PdfSnapshot | null;
  initialPage: number;
  options: LayoutOptions;
  setOptions(change: Partial<LayoutOptions>): void;
  onClose(): void;
  onJump(page: number, y: number): void;
  onSave(): Promise<void>;
  onPrint(): Promise<void>;
}) {
  const good = snapshot?.good ?? null;
  const count = good?.pages.length ?? 0;
  const [page, setPage] = useState(initialPage);
  const [mode, setMode] = useState<StageMode>('spread');
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState<'save' | 'print' | null>(null);
  const [failure, setFailure] = useState<{ message: string; alone: boolean } | null>(null);
  const [roomRef, room] = useRoom();
  const thumbs = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);

  const current = Math.min(Math.max(page, 1), Math.max(count, 1));
  const shown = shownPages(mode, current, count);
  const labels = pageLabels(good?.positions ?? [], count);
  const marked = checkedPages(good?.checks ?? []);
  const checks = good?.checks ?? [];
  const first = good?.pages[0];
  const aspect = first ? first.width / first.height : 210 / 297;
  const width = Math.floor(baseWidth(mode, room, aspect, Math.max(shown.length, mode === 'spread' ? 2 : 1)) * (zoom / 100));

  // Focus comes in with the review, so Escape and the arrows reach it.
  useEffect(() => root.current?.focus(), []);

  useEffect(() => {
    thumbs.current?.querySelector('.th.cur')?.scrollIntoView({ block: 'nearest' });
  }, [current, mode]);

  const zoomBy = (step: 1 | -1) =>
    setZoom((value) => {
      const index = ZOOMS.indexOf(value);
      return ZOOMS[Math.min(Math.max(index + step, 0), ZOOMS.length - 1)]!;
    });

  // One at a time; the ref holds it before the buttons are disabled.
  const running = useRef(false);
  const run = (what: 'save' | 'print', action: () => Promise<void>) => async () => {
    if (running.current) return;
    running.current = true;
    setBusy(what);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure({
        message: error instanceof Error ? error.message : String(error),
        alone: error instanceof NoticeError,
      });
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
    const step =
      event.key === 'ArrowRight' || event.key === 'PageDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'PageUp'
          ? -1
          : 0;
    if (!step || !count) return;
    event.preventDefault();
    setPage(stepPage(mode, current, count, step));
  }

  return (
    <section className="review" aria-label="PDF review" ref={root} tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="thumbs-col" ref={thumbs} aria-label="Pages">
        {good?.pages.map((size, index) => {
          const number = index + 1;
          return (
            <button
              key={number}
              className={`th${shown.includes(number) ? ' cur' : ''}`}
              aria-label={`Page ${number}${labels[index] ? `, ${labels[index]}` : ''}`}
              onClick={() => setPage(number)}
            >
              <span className="mini">
                <PdfSheet number={number} page={size} />
                {marked.has(number) && <span className="warnmark" title="Layout check on this page" />}
              </span>
              {labels[index] ? `${number} · ${labels[index]}` : number}
            </button>
          );
        })}
      </div>

      <div className="stage">
        <div className="tools">
          <button onClick={onClose}>
            ← Editor <span className="kbd">Esc</span>
          </button>
          <span className="pages-label">{pagesLabel(shown, count)}</span>
          <span className="spacer" />
          <button aria-label="Zoom out" disabled={zoom === ZOOMS[0]} onClick={() => zoomBy(-1)}>
            −
          </button>
          <span className="zoom">{zoom}%</span>
          <button aria-label="Zoom in" disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => zoomBy(1)}>
            +
          </button>
          {(
            [
              ['single', 'Single'],
              ['spread', 'Spread'],
              ['fit', 'Fit width'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} className={mode === value ? 'on' : ''} aria-pressed={mode === value} onClick={() => setMode(value)}>
              {label}
            </button>
          ))}
        </div>
        <PdfNotice snapshot={snapshot} />
        <div className="room" ref={roomRef}>
          {good && width > 0 && (
            <div className={`spread${stale(snapshot) ? ' stale' : ''}`} style={{ gap: GAP }}>
              {shown.map((number) => (
                <PdfSheet
                  key={number}
                  number={number}
                  page={good.pages[number - 1]!}
                  style={{ width }}
                  className="staged"
                  onJump={onJump}
                />
              ))}
            </div>
          )}
        </div>
        {good && <p className="hint">Double-click any text to jump to it in the editor.</p>}
      </div>

      <aside className="side-col">
        <details className="acc" open>
          <summary>
            Layout checks <span className="cnt">{checks.length ? <span className="a">{checks.length}</span> : 'none'}</span>
          </summary>
          <div className="body">
            {checks.length === 0 ? (
              <p className="hint">Nothing to look at.</p>
            ) : (
              checks.map((check, i) => (
                <button key={i} className="prob" onClick={() => setPage(check.page)}>
                  <span className="dot" />
                  <span>
                    {check.message}
                    <span className="where">{check.where}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </details>
        <details className="acc" open>
          <summary>Options</summary>
          <div className="body">
            <label className="opt">
              Paper
              <select
                value={options.paper}
                onChange={(e) => setOptions({ paper: e.target.value === 'us-letter' ? 'us-letter' : 'a4' })}
              >
                <option value="a4">A4</option>
                <option value="us-letter">Letter</option>
              </select>
            </label>
            <label className="opt">
              Ink saver (no tints)
              <input type="checkbox" checked={options.inkSaver} onChange={(e) => setOptions({ inkSaver: e.target.checked })} />
            </label>
            <label className="opt">
              Pregenerated sheets
              <input
                type="checkbox"
                checked={options.pregenerated}
                onChange={(e) => setOptions({ pregenerated: e.target.checked })}
              />
            </label>
            <label className="opt">
              Template
              <select value={options.template} disabled>
                <option value="avventura@1">
                  {template.name} v{template.version}
                </option>
              </select>
            </label>
          </div>
        </details>
        <div className="actions">
          <button className="tb" disabled={!!busy || !good} onClick={run('print', onPrint)}>
            {busy === 'print' ? 'Opening…' : 'Print…'}
          </button>
          <button className="tb primary" disabled={!!busy || !good} onClick={run('save', onSave)}>
            {busy === 'save' ? 'Saving…' : 'Save PDF'}
          </button>
        </div>
        {failure && (
          <p className="pdf-note error side" role="alert">
            {failure.alone ? (
              <b>{failure.message}</b>
            ) : (
              <>
                <b>The PDF could not be made.</b>
                <span>{failure.message}</span>
              </>
            )}
          </p>
        )}
      </aside>
    </section>
  );
}

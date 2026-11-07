import type { EditorView } from '@codemirror/view';
import { matchSection, sectionPdf, type Template } from 'promptbook-format';
import { pageOf, type Position } from 'promptbook-layout';
import { keyLabel, shortcut } from '../cm/keymap.js';
import { useViewValue } from '../InspectorSection.js';
import { currentSection } from '../outline.js';
import type { UpdateSource } from '../StatusBar.js';
import type { PdfSnapshot } from './client.js';
import { PdfSheet } from './PdfSheet.js';

const head = (state: EditorView['state']) => state.selection.main.head;

// What the pane and the review show above the pages while there are none to
// show, or over the last good ones when the latest build failed.
export function PdfNotice({ snapshot }: { snapshot: PdfSnapshot | null }) {
  if (!snapshot || snapshot.engine === 'idle' || snapshot.engine === 'loading')
    return <p className="pdf-note">Loading the PDF engine…</p>;
  if (snapshot.engine === 'failed')
    return (
      <div className="pdf-note error" role="alert">
        <b>The PDF engine could not be loaded.</b>
        <span>{snapshot.error}</span>
      </div>
    );
  const error = snapshot.latest?.diagnostics.find((d) => d.severity === 'error');
  if (error)
    return (
      <div className="pdf-note error" role="alert">
        <b>The PDF could not be built.</b>
        <span>{error.message}</span>
      </div>
    );
  return null;
}

// Whether the pages on screen are older than the latest build, which failed.
export const stale = (snapshot: PdfSnapshot | null): boolean =>
  !!snapshot?.latest && snapshot.latest !== snapshot.good;

// What a campaign's pane says when the cursor's ## section does not print
// (campaign-pdf design decision 10): «the appendix», «Aggiornamenti» for a
// section left out; null when it prints, or for an adventure.
export function unprintedSection(template: Template, heading: string | null): string | null {
  if (template.kind !== 'campaign' || heading === null) return null;
  const definition = matchSection(template.sections, heading);
  if (!definition) return null;
  if (definition.role === 'appendix') return 'the appendix';
  return sectionPdf(definition, 'campaign').print ? null : `«${heading}»`;
}

// The PDF preview in place of the inspector (design decision 11): the page
// printing the text under the cursor.
export function PdfPane({
  view,
  updates,
  snapshot,
  positions,
  template,
  onReview,
  onClose,
  onJump,
}: {
  view: EditorView | null;
  updates: UpdateSource;
  snapshot: PdfSnapshot | null;
  // The project's own template: for a campaign, which sections print.
  template: Template;
  // The shown build's positions, in the text as it is now.
  positions(): Position[];
  onReview(page: number): void;
  onClose(): void;
  onJump(page: number, y: number): void;
}) {
  const cursor = useViewValue(view, updates, head, Object.is) ?? 0;
  // A campaign's ## heading under the cursor; an adventure's outline has no
  // heading items, so null there.
  const heading = useViewValue(view, updates, currentSection, Object.is) ?? null;
  const unprinted = unprintedSection(template, heading);
  const good = snapshot?.good ?? null;
  const count = good?.pages.length ?? 0;
  const number = good ? Math.min(pageOf(positions(), cursor), count) : 0;
  const page = good?.pages[number - 1];
  const review = shortcut('pdfReview');

  return (
    <div className="pdfpane" aria-label="PDF preview">
      <div className="bar2">
        <span>
          {unprinted
            ? `PDF preview · ${unprinted} is not printed`
            : page
              ? `PDF preview · page ${number} of ${count} · follows the cursor`
              : 'PDF preview'}
        </span>
        <span>
          <button
            className="tb"
            title={`Review the whole PDF (${keyLabel(review.keys)})`}
            onClick={() => onReview(number || 1)}
          >
            ⤢ Review
          </button>
          <button className="tb" title="Close the PDF preview" aria-label="Close the PDF preview" onClick={onClose}>
            ✕
          </button>
        </span>
      </div>
      <PdfNotice snapshot={snapshot} />
      {page && (
        <PdfSheet
          number={number}
          page={page}
          className={[stale(snapshot) ? 'stale' : '', unprinted ? 'unprinted' : ''].filter(Boolean).join(' ')}
          onJump={onJump}
        />
      )}
    </div>
  );
}

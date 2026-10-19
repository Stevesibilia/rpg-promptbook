import { useLayoutEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import { pageId } from './pages.js';
import type { SvgPage } from './protocol.js';

// The rendered document, inserted once and hidden (design decision 10): the
// pages on screen draw from it. It carries no script.
export function PdfSource({ svg }: { svg: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // A failed build keeps the last good document.
    if (host.current && svg) host.current.innerHTML = svg;
  }, [svg]);
  return <div className="pdf-source" ref={host} aria-hidden="true" />;
}

// One page of the document, as large as its box: an SVG cut to the page,
// using the page's group of the hidden document. A double-click gives the
// page and the point clicked, in points from the top of the page.
export function PdfSheet({
  number,
  page,
  style,
  className = '',
  onJump,
}: {
  number: number;
  page: SvgPage;
  style?: CSSProperties;
  className?: string;
  onJump?(page: number, y: number): void;
}) {
  const jump = (event: MouseEvent<SVGSVGElement>) => {
    if (!onJump) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.height <= 0) return;
    onJump(number, ((event.clientY - box.top) / box.height) * page.height);
  };
  return (
    <svg
      className={`pdf-sheet ${className}`}
      viewBox={`0 ${page.top} ${page.width} ${page.height}`}
      style={{ aspectRatio: `${page.width} / ${page.height}`, ...style }}
      role="img"
      aria-label={`Page ${number}`}
      data-page={number}
      onDoubleClick={onJump ? jump : undefined}
    >
      <use href={`#${pageId(number)}`} />
    </svg>
  );
}

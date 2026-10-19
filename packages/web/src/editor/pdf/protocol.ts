import type { Diagnostic, LayoutCheck, LayoutOptions, LayoutProject, Position } from 'promptbook-layout';

// The messages between the editor and the PDF worker (design decision 9).

export interface PdfSource {
  text: string;
  options: LayoutOptions;
  project: LayoutProject;
}

export type PdfRequest = ({ kind: 'build' } | { kind: 'pdf' }) & PdfSource & { version: number };

// A page of the SVG: where it starts in the stacked document and its size,
// in the SVG's units (points).
export interface SvgPage {
  top: number;
  width: number;
  height: number;
}

export interface PdfBuild {
  // The whole document, one `<g id="pb-page-N">` per page; null when it did
  // not build.
  svg: string | null;
  pages: SvgPage[];
  positions: Position[];
  checks: LayoutCheck[];
  diagnostics: Diagnostic[];
}

export type PdfAnswer =
  | { kind: 'build'; version: number; build: PdfBuild }
  | { kind: 'pdf'; version: number; bytes: Uint8Array }
  | { kind: 'pdf'; version: number; error: string }
  // The engine could not be loaded: no build will ever be answered.
  | { kind: 'failed'; error: string };

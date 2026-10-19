import { Fragment } from 'react';
import { paragraphs, type Inline } from './inline.js';

function Pieces({ pieces }: { pieces: Inline[] }) {
  return pieces.map((piece, i) => {
    switch (piece.kind) {
      case 'text':
        return <Fragment key={i}>{piece.text}</Fragment>;
      case 'code':
        return <code key={i}>{piece.text}</code>;
      case 'strong':
        return (
          <b key={i}>
            <Pieces pieces={piece.children} />
          </b>
        );
      case 'em':
        return (
          <i key={i}>
            <Pieces pieces={piece.children} />
          </i>
        );
      case 'break':
        return <br key={i} />;
    }
  });
}

// A seed's Markdown as paragraphs of text.
export function Markdown({ text }: { text: string }) {
  return paragraphs(text).map((pieces, i) => (
    <p key={i}>
      <Pieces pieces={pieces} />
    </p>
  ));
}

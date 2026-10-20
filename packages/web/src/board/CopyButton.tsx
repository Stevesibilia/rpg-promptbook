import { useEffect, useRef, useState, type RefObject } from 'react';
import { CopyIcon } from '../ui/icons.js';

// Copy, then «Copied» for a moment (asset-board specs, prompts with Copy).
// Outside a secure context the clipboard is missing: the text is copied
// through a hidden text area, which keeps the lyrics' line breaks; where that
// is refused too, the text is selected for ⌘C, as Connected apps does.

function copyThroughTextarea(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export function CopyButton({
  text,
  source,
  onFallback,
  label = 'Copy',
}: {
  text: string;
  // The element holding the text, selected when the clipboard is missing.
  source?: RefObject<HTMLElement | null>;
  onFallback(message: string): void;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const done = () => {
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1300);
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      if (copyThroughTextarea(text)) return done();
      const node = source?.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      onFallback('Press ⌘C to copy the selected text.');
    }
  }

  return (
    <button className={`tb sm line${copied ? ' ok' : ''}`} onClick={() => void copy()}>
      <CopyIcon />
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

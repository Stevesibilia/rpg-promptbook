import { useRef } from 'react';
import { Link } from 'react-router';
import { CopyButton } from './CopyButton.js';

// Screen 2: while no row has a prompt, where the prompts come from.
export function ClaudeCard({ title, onToast }: { title: string; onToast(message: string): void }) {
  const request = `Write the image and music prompts for the board of «${title}»`;
  const text = useRef<HTMLSpanElement>(null);
  return (
    <div className="card claude">
      <span className="avatar cl">C</span>
      <div>
        <h3>Prompts come from Claude</h3>
        <p>
          Claude reads each scene's <code>visual:</code> and <code>mood:</code> lines and writes one Midjourney prompt
          and one Suno prompt per row. Ask in a chat on claude.ai:
        </p>
        <div className="ask">
          <span ref={text}>{request}</span>
          <CopyButton text={request} source={text} onFallback={onToast} />
        </div>
        <p className="hint">
          Claude needs the Promptbook connector, with read and edit access.{' '}
          <Link to="/settings/apps">Settings → Connected apps</Link>
        </p>
      </div>
    </div>
  );
}

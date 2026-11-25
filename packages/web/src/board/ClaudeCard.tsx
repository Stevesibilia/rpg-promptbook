import { useRef } from 'react';
import { Link } from 'react-router';
import { CopyButton } from './CopyButton.js';

// Screen 2: while no image prompt has a text, no scene a music title and no
// General music prompt exists, where the prompts come from.
export function ClaudeCard({ title, onToast }: { title: string; onToast(message: string): void }) {
  const request = `Write the image and music prompts for the board of «${title}», with portraits of the PCs and NPCs, the handouts, and general images and music`;
  const text = useRef<HTMLSpanElement>(null);
  return (
    <div className="card claude">
      <span className="avatar cl">C</span>
      <div>
        <h3>Prompts come from Claude</h3>
        <p>
          Claude reads the document and writes Midjourney prompts for the scenes, the PCs, the NPCs and the handouts,
          one Suno prompt per scene from its <code>mood:</code> line, and General images and music for the whole
          adventure. Ask in a chat on claude.ai:
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

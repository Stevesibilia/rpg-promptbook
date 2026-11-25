import { useRef } from 'react';
import { Link } from 'react-router';
import { CopyButton } from './CopyButton.js';
import type { Whole } from './summary.js';

// The request to copy into a chat on claude.ai: a campaign's names no scene
// (campaign-board design decision 4, screen 11c).
export const claudeRequest = (title: string, whole: Whole) =>
  whole === 'campaign'
    ? `Write the image and music prompts for the board of «${title}»: general images and music, portraits of the PCs and NPCs, and the handouts`
    : `Write the image and music prompts for the board of «${title}», with portraits of the PCs and NPCs, the handouts, and general images and music`;

// Screen 2: while no image prompt has a text, no scene a music title and no
// General music prompt exists, where the prompts come from.
export function ClaudeCard({ title, whole, onToast }: { title: string; whole: Whole; onToast(message: string): void }) {
  const request = claudeRequest(title, whole);
  const text = useRef<HTMLSpanElement>(null);
  return (
    <div className="card claude">
      <span className="avatar cl">C</span>
      <div>
        <h3>Prompts come from Claude</h3>
        {whole === 'campaign' ? (
          <p>
            Claude reads the campaign and writes General images and music for it, like a cover and a main theme, and
            Midjourney prompts for the PCs, the NPCs and the handouts. Ask in a chat on claude.ai:
          </p>
        ) : (
          <p>
            Claude reads the document and writes Midjourney prompts for the scenes, the PCs, the NPCs and the handouts,
            one Suno prompt per scene from its <code>mood:</code> line, and General images and music for the whole
            adventure. Ask in a chat on claude.ai:
          </p>
        )}
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

import { ChangeSet, type ChangeDesc } from '@codemirror/state';
import type { Position } from 'promptbook-layout';

// The positions of a build are offsets into the text that request read. The
// tracker keeps, per request, every change made to the text since it was
// read, so an offset of the build on screen can be moved into the text as it
// is now (design decision 13).
export class OffsetTracker {
  private since = new Map<number, ChangeDesc>();

  // A request read a text of this length.
  read(version: number, length: number): void {
    this.since.set(version, ChangeSet.empty(length).desc);
  }

  // The text changed.
  change(changes: ChangeDesc): void {
    for (const [version, since] of this.since) this.since.set(version, since.composeDesc(changes));
  }

  // The build of `version` is now the one on screen: older requests are no
  // longer needed.
  shown(version: number): void {
    for (const known of this.since.keys()) if (known < version) this.since.delete(known);
  }

  // An offset of the build of `version`, in the text as it is now.
  map(version: number | null, offset: number): number {
    const since = version === null ? undefined : this.since.get(version);
    return since ? since.mapPos(offset, 1) : offset;
  }

  // The build's positions, their offsets in the text as it is now.
  positions(version: number | null, positions: readonly Position[]): Position[] {
    const since = version === null ? undefined : this.since.get(version);
    if (!since || since.empty) return positions as Position[];
    return positions.map((position) => ({ ...position, from: since.mapPos(position.from, 1) }));
  }
}

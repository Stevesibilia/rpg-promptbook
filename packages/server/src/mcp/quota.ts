// How many write tool calls one grant may make (connector design decision
// 11): 120 per 10 minutes, counted in memory, which one replica allows. A
// client in a loop stops here before it fills the document and the
// snapshots.

export const WRITES_PER_WINDOW = 120;
export const WRITE_WINDOW_MS = 600_000;

export class WriteQuota {
  private readonly calls = new Map<string, number[]>();

  constructor(
    private readonly limit = WRITES_PER_WINDOW,
    private readonly windowMs = WRITE_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  // Takes one write for the grant: null when it is let through, else the
  // seconds until the oldest write in the window leaves it.
  take(grantId: string): number | null {
    const now = this.now();
    const since = now - this.windowMs;
    const recent = (this.calls.get(grantId) ?? []).filter((at) => at > since);
    if (recent.length >= this.limit) {
      this.calls.set(grantId, recent);
      return Math.max(1, Math.ceil((recent[0]! + this.windowMs - now) / 1000));
    }
    recent.push(now);
    this.calls.set(grantId, recent);
    // Grants that wrote nothing for a window are forgotten.
    if (this.calls.size > 1000) {
      for (const [id, times] of this.calls) if (times.at(-1)! <= since) this.calls.delete(id);
    }
    return null;
  }
}

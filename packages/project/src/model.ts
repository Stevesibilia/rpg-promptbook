// The values a project's metadata can take, and the plain shapes the readers
// return. Everything here is JSON-safe: it crosses the REST API and, later,
// the Electron IPC.

export const SCHEMA = 1;

export const categories = ['campaign', 'adventure', 'one-shot'] as const;
export type Category = (typeof categories)[number];

export const statuses = ['draft', 'in-progress', 'complete'] as const;
export type Status = (typeof statuses)[number];

export const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && (categories as readonly string[]).includes(value);

export const isStatus = (value: unknown): value is Status =>
  typeof value === 'string' && (statuses as readonly string[]).includes(value);

export interface ProjectMeta {
  schema: number;
  id: string;
  title: string;
  category: Category;
  status: Status;
  campaignId: string | null;
  system: string;
  // ISO date-time.
  createdAt: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  // May be empty.
  note: string;
  // YYYY-MM-DD.
  due: string | null;
  // Fractional index: items sort by pos, then id.
  pos: string;
}

export interface SeedVersion {
  text: string;
  // ISO date-time.
  at: string;
}

// One of the user's campaigns, as the server knows them: what a summary checks
// a campaign link against, and what an import matches `campagna` with.
export interface CampaignRef {
  id: string;
  title: string;
}

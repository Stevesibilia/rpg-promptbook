// Dates as the list and the panels show them, in English.

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const fullDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86_400_000;

// «just now», «20 min ago», «2 h ago», «today 12:40», «yesterday», «3 days
// ago», «9 Aug», «Jan 2025».
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  if (Number.isNaN(ms)) return '';
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY);
  if (days === 0) return ms < 6 * 3_600_000 ? `${Math.floor(ms / 3_600_000)} h ago` : `today ${time.format(then)}`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (then.getFullYear() === now.getFullYear()) return dayMonth.format(then);
  return monthYear.format(then);
}

export const clockTime = (date: Date) => time.format(date);

// A YYYY-MM-DD due date as «24 Oct».
export function shortDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayMonth.format(new Date(y!, m! - 1, d!));
}

// The day a project in the bin is removed: 30 days after it was deleted.
export function purgeDate(deletedAt: string): string {
  return fullDate.format(new Date(new Date(deletedAt).getTime() + 30 * DAY));
}

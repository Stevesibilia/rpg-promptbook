// Dates as the list and the panels show them, in English.

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const fullDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const weekdayDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

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

// «19 Oct 2026».
export function longDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : fullDate.format(date);
}

// «19 Oct 2026 · 21:16», as the brainstorm log dates its entries.
export function dateAndTime(iso: string, separator = ' · '): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${fullDate.format(date)}${separator}${time.format(date)}`;
}

// «Today 21:14», «Yesterday 09:02», «17 Oct 22:40», «17 Oct 2025 22:40»: when
// a snapshot was made.
export function snapshotTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days === 0) return `Today ${time.format(date)}`;
  if (days === 1) return `Yesterday ${time.format(date)}`;
  const day = date.getFullYear() === now.getFullYear() ? dayMonth.format(date) : fullDate.format(date);
  return `${day} ${time.format(date)}`;
}

// «18 Nov», or «18 Nov 2027» in another year.
export function dayOf(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.getFullYear() === now.getFullYear() ? dayMonth.format(date) : fullDate.format(date);
}

// A YYYY-MM-DD day as «12 Oct 2026»; '' when it is not one.
export function longDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return '';
  return fullDate.format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

// «Wed 28 Oct», or «Wed 28 Oct 2027» in another year: when a snooze ends
// (hide-problems design decision 4). The year is added by hand, since en-GB
// puts a comma after the weekday when it formats one.
export function snoozeDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = weekdayDate.format(date);
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

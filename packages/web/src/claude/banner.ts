// When the Document view shows the Claude edit banner (connector design
// decision 13): the newest Claude snapshot, unless this device dismissed it
// or a later one.

export const dismissKey = (projectId: string) => `promptbook.claudeEdit.${projectId}`;

export interface Dismissed {
  id: string;
  // The dismissed snapshot's date.
  at: string;
}

export function readDismissed(raw: string | null): Dismissed | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Dismissed> | null;
    return typeof value?.id === 'string' && typeof value.at === 'string' ? { id: value.id, at: value.at } : null;
  } catch {
    return null;
  }
}

export function showBanner(newest: { id: string; createdAt: string } | null, dismissed: Dismissed | null): boolean {
  if (!newest) return false;
  if (!dismissed) return true;
  if (newest.id === dismissed.id) return false;
  const at = Date.parse(dismissed.at);
  return Number.isNaN(at) || Date.parse(newest.createdAt) > at;
}

export function loadDismissed(projectId: string): Dismissed | null {
  try {
    return readDismissed(localStorage.getItem(dismissKey(projectId)));
  } catch {
    return null;
  }
}

export function saveDismissed(projectId: string, snapshot: { id: string; createdAt: string }): void {
  try {
    localStorage.setItem(dismissKey(projectId), JSON.stringify({ id: snapshot.id, at: snapshot.createdAt }));
  } catch {
    // Private windows may refuse; the banner still hides for this page.
  }
}

// Dark, Light or System, remembered in this browser.

export type Theme = 'dark' | 'light' | 'system';

const KEY = 'promptbook.theme';

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'system' ? value : 'dark';
  } catch {
    return 'dark';
  }
}

const systemQuery = () => window.matchMedia('(prefers-color-scheme: light)');

let unwatch: (() => void) | null = null;

export function applyTheme(theme: Theme): void {
  unwatch?.();
  unwatch = null;
  const set = (light: boolean) => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
  };
  if (theme !== 'system') return set(theme === 'light');
  const query = systemQuery();
  set(query.matches);
  const onChange = (event: MediaQueryListEvent) => set(event.matches);
  query.addEventListener('change', onChange);
  unwatch = () => query.removeEventListener('change', onChange);
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private windows may refuse; the theme still applies to this page.
  }
  applyTheme(theme);
}

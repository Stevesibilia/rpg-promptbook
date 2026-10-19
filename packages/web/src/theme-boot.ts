import { applyTheme, storedTheme } from './theme.js';

// Runs before the app renders, so a light theme does not flash dark first.
applyTheme(storedTheme());

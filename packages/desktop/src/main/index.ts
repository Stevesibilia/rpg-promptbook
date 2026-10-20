import { app as electronApp, BrowserWindow, protocol } from 'electron';
import { join } from 'node:path';
import { privileges, SCHEME, serveApp } from './protocol.js';
import { createWindow, guardWebContents, lockPermissions } from './window.js';

// The app's lifecycle (desktop-app design decisions 1 to 3): one instance,
// the promptbook:// scheme and the window.
//
// PROMPTBOOK_USER_DATA sets the data folder.

electronApp.setName('Promptbook');
const userData = process.env.PROMPTBOOK_USER_DATA || join(electronApp.getPath('appData'), 'Promptbook');
electronApp.setPath('userData', userData);

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges }]);

let window: BrowserWindow | null = null;

if (!electronApp.requestSingleInstanceLock()) {
  electronApp.quit();
} else {
  electronApp.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  electronApp.on('web-contents-created', (_event, contents) => guardWebContents(contents));

  void electronApp.whenReady().then(() => {
    const root = join(__dirname, '..', 'app', 'web');
    protocol.handle(SCHEME, (request) => serveApp(root, request));
    lockPermissions();
    window = createWindow();
    window.on('closed', () => {
      window = null;
    });
  });

  electronApp.on('activate', () => {
    if (!window && electronApp.isReady()) window = createWindow();
  });

  electronApp.on('window-all-closed', () => {
    if (process.platform !== 'darwin') electronApp.quit();
  });
}

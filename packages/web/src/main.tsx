import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.js';
import { platform } from './platform/index.js';
import './styles/tokens.css';
import './styles/base.css';

// The platform knows its server and, on the desktop, the account before the
// first render.
void platform
  .init()
  .catch((error: unknown) => console.error(error))
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    ),
  );

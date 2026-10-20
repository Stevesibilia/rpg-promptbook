import type { PromptbookBridge } from 'promptbook-web/src/platform/bridge.js';

declare global {
  interface Window {
    promptbook: PromptbookBridge;
  }
  // Set by main under PROMPTBOOK_E2E.
  var __promptbookAuthorizeUrl: string | undefined;
}

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { toastDuration, ToastView } from '../src/ui/Toast.js';

// The toast's optional action (hide-problems design decision 16).
describe('the toast', () => {
  it('shows a message alone for 3.2 s, as before', () => {
    expect(renderToStaticMarkup(createElement(ToastView, { message: 'Saved.' }))).toBe(
      '<div class="toast" role="status">Saved.</div>',
    );
    expect(toastDuration()).toBe(3200);
  });

  it('adds the action as a button after the message, and stays 6 s', () => {
    const action = { label: 'Undo', run() {} };
    expect(renderToStaticMarkup(createElement(ToastView, { message: 'Problem dismissed', action }))).toBe(
      '<div class="toast act" role="status"><span>Problem dismissed</span><button type="button">Undo</button></div>',
    );
    expect(toastDuration(action)).toBe(6000);
  });
});

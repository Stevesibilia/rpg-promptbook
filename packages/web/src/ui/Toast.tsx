import { useCallback, useEffect, useRef, useState, type FocusEvent, type ReactElement } from 'react';

// A button after the toast's message, as the hidden problems' Undo
// (hide-problems design decision 16).
export interface ToastAction {
  label: string;
  run(): void;
}

// A toast with an action stays longer, so there is time to reach it.
export const toastDuration = (action?: ToastAction): number => (action ? 6000 : 3200);

// While the pointer or the focus is on a toast with an action, it stays.
type Holder = 'pointer' | 'focus';
interface Hold {
  onHold(by: Holder, focusFrom: Element | null): void;
  onRelease(by: Holder): void;
}

export function ToastView({
  message,
  action,
  onHold,
  onRelease,
}: { message: string; action?: ToastAction | undefined } & Partial<Hold>) {
  if (!action)
    return (
      <div className="toast" role="status">
        {message}
      </div>
    );
  return (
    <div
      className="toast act"
      role="status"
      onMouseEnter={() => onHold?.('pointer', null)}
      onMouseLeave={() => onRelease?.('pointer')}
      onFocus={(e: FocusEvent) => onHold?.('focus', e.relatedTarget instanceof Element ? e.relatedTarget : null)}
      onBlur={(e: FocusEvent) => {
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) onRelease?.('focus');
      }}
    >
      <span>{message}</span>
      <button type="button" onClick={() => action.run()}>
        {action.label}
      </button>
    </div>
  );
}

// A short line at the bottom of the page that goes away by itself, as the
// mockup's toast.
export function useToast(): [ReactElement | null, (message: string, action?: ToastAction) => void] {
  const [shown, setShown] = useState<{ message: string; action: ToastAction | undefined } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Where the focus was before it reached the toast: it goes back there when
  // the toast's button goes, rather than to the page's body.
  const focusFrom = useRef<Element | null>(null);
  const held = useRef(new Set<Holder>());
  const start = useCallback((action?: ToastAction) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), toastDuration(action));
  }, []);
  const show = useCallback(
    (message: string, action?: ToastAction) => {
      const back = focusFrom.current;
      focusFrom.current = null;
      if (document.activeElement?.closest('.toast') && back instanceof HTMLElement && back.isConnected) back.focus();
      held.current.clear();
      setShown({ message, action });
      start(action);
    },
    [start],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    shown ? (
      <ToastView
        message={shown.message}
        action={shown.action}
        onHold={(by, from) => {
          if (from && !from.closest('.toast')) focusFrom.current = from;
          held.current.add(by);
          clearTimeout(timer.current);
        }}
        onRelease={(by) => {
          held.current.delete(by);
          if (held.current.size === 0) start(shown.action);
        }}
      />
    ) : null,
    show,
  ];
}

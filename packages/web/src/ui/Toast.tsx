import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

// A short line at the bottom of the page that goes away by itself, as the
// mockup's toast.
export function useToast(): [ReactElement | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    message ? (
      <div className="toast" role="status">
        {message}
      </div>
    ) : null,
    show,
  ];
}

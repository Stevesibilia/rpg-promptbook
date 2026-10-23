import { useEffect, type ReactNode } from 'react';
import './modal.css';

// A dialog over the page: Escape, the ✕ and a click outside close it.
export function Modal({
  title,
  onClose,
  children,
  footer,
  className = '',
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        // The focus the caller gives back is not taken away by the click.
        event.preventDefault();
        onClose();
      }}
    >
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh">
          <h3>{title}</h3>
          <button className="tb" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}

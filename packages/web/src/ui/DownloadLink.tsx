import type { ReactNode } from 'react';
import { platform } from '../platform/index.js';

// A link to an export: the browser downloads it with the server's file name;
// the desktop app asks where to save it, offering `name`.
export function DownloadLink({
  href,
  name,
  className,
  disabled = false,
  children,
}: {
  href: string;
  name: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      className={`${className ?? ''}${disabled ? ' disabled' : ''}`}
      href={disabled ? undefined : href}
      download
      aria-disabled={disabled || undefined}
      onClick={(event) => {
        event.preventDefault();
        if (!disabled) void platform.download(href, name).catch(() => {});
      }}
    >
      {children}
    </a>
  );
}

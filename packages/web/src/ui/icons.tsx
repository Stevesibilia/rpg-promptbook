// The mockup's line icons.

const icon = (paths: React.ReactNode) =>
  function Icon({ className }: { className?: string }) {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        {paths}
      </svg>
    );
  };

export const ProjectsIcon = icon(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>,
);
export const DocumentIcon = icon(
  <>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 12h6M9 16h6M9 8h3" />
  </>,
);
export const SettingsIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </>,
);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-5-5" />
  </>,
);
export const ImportIcon = icon(<path d="M12 15V3M7 8l5-5 5 5M5 21h14" />);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const WarningIcon = icon(
  <>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18v.5" />
  </>,
);
export const InspirationIcon = icon(
  <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />,
);
export const LogIcon = icon(<path d="M4 5h16v11H8l-4 4z" />);
export const HistoryIcon = icon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </>,
);
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </>,
);

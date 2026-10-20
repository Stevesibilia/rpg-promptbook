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
// The board's: a picture and a note (asset-board design decision 12).
export const BoardIcon = icon(
  <>
    <rect x="3" y="4" width="13" height="11" rx="1.5" />
    <path d="M3 12l3.5-3 3 2.5 2-1.5L16 13" />
    <path d="M19 9v9.5" />
    <circle cx="17" cy="18.5" r="2" />
    <path d="M19 9l2.5-1" />
  </>,
);
export const ImageIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5L5 20" />
  </>,
);
export const MusicIcon = icon(
  <>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </>,
);
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </>,
);
export const EditIcon = icon(
  <>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M14 6l4 4" />
  </>,
);
export const HelpIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.5" />
  </>,
);
export const TrashIcon = icon(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />);
export const DropIcon = icon(
  <>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </>,
);
export const PrevIcon = icon(<path d="M15 5l-7 7 7 7" />);
export const NextIcon = icon(<path d="M9 5l7 7-7 7" />);
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
// The desktop app's (desktop.html).
export const ExternalIcon = icon(<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />);
export const CheckIcon = icon(<path d="M5 12l4 4 10-10" />);
export const UpIcon = icon(<path d="M12 19V7M7 12l5-5 5 5" />);
export const DownIcon = icon(<path d="M12 5v12M7 12l5 5 5-5" />);
export const DownloadIcon = icon(<path d="M12 3v12M7 10l5 5 5-5M5 21h14" />);
export const CloudIcon = icon(<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />);
export const LaptopIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="11" rx="1.5" />
    <path d="M2 19h20" />
  </>,
);
export const OfflineIcon = icon(
  <path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.2-1.6M12 20h.01" />,
);
export const DiskIcon = icon(
  <>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </>,
);

const PATHS = {
  arrowLeft: <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  chart: <path d="M4 19V5m5 14v-7m5 7V8m5 11v-4" />,
  chevronDown: <path d="m7 10 5 5 5-5" />,
  compare: <path d="M4 7h11m0 0-3-3m3 3-3 3M20 17H9m0 0 3-3m-3 3 3 3" />,
  download: <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 20h14" />,
  fileText: <path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6" />,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  refresh: <path d="M20 7v5h-5M4 17v-5h5m9.5-3A7 7 0 0 0 6 7l-2 5m2 3a7 7 0 0 0 12.5 2l1.5-5" />,
  table: <path d="M4 5h16v14H4V5Zm0 5h16M9 5v14" />,
  trash: <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />,
  store: <path d="M4 10h16l-2-5H6l-2 5Zm2 0v9h12v-9M9 19v-5h6v5" />,
  sparkle: <path d="m12 3 1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" />,
};

export default function ActionIcon({ name }) {
  return (
    <svg
      className="action-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name] || null}
    </svg>
  );
}

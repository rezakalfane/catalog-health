const PATHS = {
  arrowLeft: <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  chart: <path d="M4 19V5m5 14v-7m5 7V8m5 11v-4" />,
  compare: <path d="M4 7h11m0 0-3-3m3 3-3 3M20 17H9m0 0 3-3m-3 3 3 3" />,
  download: <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 20h14" />,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  table: <path d="M4 5h16v14H4V5Zm0 5h16M9 5v14" />,
  store: <path d="M4 10h16l-2-5H6l-2 5Zm2 0v9h12v-9M9 19v-5h6v5" />,
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

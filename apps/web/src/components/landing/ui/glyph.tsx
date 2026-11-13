const GLYPH_PATHS = {
  laptop: "M5 5.5h14a1 1 0 0 1 1 1V15H4V6.5a1 1 0 0 1 1-1Z M2.5 18.5h19",
  desktop:
    "M4 4.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z M9 19.5h6 M12 15.5v4",
  server:
    "M5 4.5h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z M5 13.5h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z M7.5 7.5h.01 M7.5 16.5h.01",
  lock: "M7 10.5h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  copy: "M9 8.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z M5 15.5v-10a1 1 0 0 1 1-1h10",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
};

export type TGlyph = keyof typeof GLYPH_PATHS;

interface IGlyph {
  name: TGlyph;
  className?: string;
}

export function Glyph(props: IGlyph) {
  const { name, className = "h-4 w-4" } = props;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d={GLYPH_PATHS[name]} />
    </svg>
  );
}

// Small inline stroke icons (Lucide-style, 1.75 stroke) — no emoji, themeable via currentColor.
const P: Record<string, string> = {
  upload: "M12 16V4M12 4l-4 4M12 4l4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  reset: "M4 9a8 8 0 1 1-1 4M4 9V4M4 9h5",
  sparkle: "M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z",
  download: "M12 4v10m0 0l-4-4m4 4l4-4M5 18h14",
  close: "M6 6l12 12M18 6L6 18",
  arrowUR: "M7 17L17 7M9 7h8v8",
  check: "M5 12l4 4L19 6",
  alert: "M12 4l9 16H3L12 4Zm0 6v4m0 3v.5",
};

export default function Icon({ name, size = 15, className }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "0 0 auto" }}
    >
      <path d={P[name] ?? ""} />
    </svg>
  );
}

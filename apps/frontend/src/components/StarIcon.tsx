export function StarIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      strokeLinejoin="round"
    >
      <path d="M10 1.667l2.575 5.217 5.758.836-4.166 4.062.983 5.735L10 14.825l-5.15 2.692.983-5.735L1.667 7.72l5.758-.836z" />
    </svg>
  );
}

// packages/web/src/components/StitchIcon.jsx
export default function StitchIcon({ className = '' }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 4 L12 12 M12 4 L4 12" strokeDasharray="3 2.5" />
    </svg>
  );
}

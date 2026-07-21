export default function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 dark:bg-neutral-700 ${className}`}
      {...props}
    />
  );
}

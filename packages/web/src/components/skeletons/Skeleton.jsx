export default function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`shimmer rounded ${className}`}
      {...props}
    />
  );
}

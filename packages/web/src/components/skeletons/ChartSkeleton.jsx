import Skeleton from './Skeleton.jsx';

export default function ChartSkeleton({ height = 260 }) {
  return (
    <div
      className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4"
      style={{ height }}
    >
      <div className="flex items-end justify-between h-full gap-2">
        {/* Simulated axis labels */}
        <div className="flex flex-col justify-between h-full py-2">
          <Skeleton className="h-3 w-6" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-4" />
        </div>

        {/* Simulated chart area — bars/lines */}
        <div className="flex-1 flex items-end justify-around gap-1 pb-6">
          {[0.3, 0.6, 0.45, 0.8, 0.55, 0.7, 0.4, 0.65, 0.5, 0.75].map((h, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-t"
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

import Skeleton from './Skeleton.jsx';

function ResultSectionSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-6" />
      </div>
      <div className="space-y-3">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserResultSkeleton({ rows = 2 }) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-6" />
      </div>
      <div className="space-y-3">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SearchResultsSkeleton() {
  return (
    <div className="space-y-8">
      <ResultSectionSkeleton rows={3} />
      <ResultSectionSkeleton rows={2} />
      <UserResultSkeleton rows={2} />
    </div>
  );
}

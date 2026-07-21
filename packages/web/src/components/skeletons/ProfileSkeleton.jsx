import Skeleton from './Skeleton.jsx';

export default function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      {/* Profile header card — matches rounded-3xl border bg-white p-6 */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {/* Avatar circle — 64x64 */}
            <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
            <div className="space-y-2 min-w-0">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>

          {/* Stats grid — 2 cards */}
          <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-64">
            <div className="rounded-2xl bg-gray-50 p-4 space-y-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-5 w-8" />
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 space-y-2">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar — 3 pill buttons */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-16 rounded-full" />
        <Skeleton className="h-9 w-22 rounded-full" />
      </div>

      {/* Content area — 3 post-like cards */}
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3 border border-gray-200 rounded-lg p-3 bg-white">
            <div className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-5 rounded" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-20 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <div className="pt-1">
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

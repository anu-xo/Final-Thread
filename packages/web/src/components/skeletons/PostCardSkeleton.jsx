import Skeleton from './Skeleton.jsx';

export default function PostCardSkeleton() {
  return (
    <div className="flex gap-3 border border-gray-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-900">
      {/* Vote column — matches VoteButton size="sm": 16px icons, p-0.5 */}
      <div className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="text-xs w-6 rounded" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Meta row — community badge + flair + author + time (text-xs text-gray-500) */}
        <div className="flex items-center gap-2 text-xs">
          <Skeleton className="h-4 w-20 rounded-full" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>

        {/* Title — matches font-medium text-gray-900 leading-snug */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Footer — matches flex items-center gap-4 mt-2 text-sm text-gray-500 */}
        <div className="flex items-center gap-4 pt-1">
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}

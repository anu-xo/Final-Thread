import Skeleton from './Skeleton.jsx';

export default function PostCardSkeleton() {
  return (
    <div className="flex gap-3 border border-gray-200 rounded-lg p-3 bg-white">
      {/* Vote column — matches VoteButton size="sm": 16px icons, flex-col */}
      <div className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-3 w-5 rounded" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Meta row — community badge + author + time */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20 rounded-full" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>

        {/* Title — two lines to handle wrapping */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Footer — comment count */}
        <div className="pt-1">
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}

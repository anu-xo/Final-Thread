import Skeleton from './Skeleton.jsx';

export default function CommunityCardSkeleton() {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 bg-white dark:bg-neutral-900">
      {/* Banner strip */}
      <div className="h-2 rounded-full mb-4 bg-neutral-100 dark:bg-neutral-800 animate-pulse" />

      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>

      {/* Description — matches line-clamp-2 text-sm */}
      <div className="mt-2 space-y-1">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>

      {/* Member count */}
      <div className="mt-3">
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

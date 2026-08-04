import Skeleton from './Skeleton.jsx';

export default function PostCardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 border border-gray-200 dark:border-white/10 rounded-xl p-3.5 bg-white dark:bg-slate">
      {/* Top row — avatar · community · time · online pill */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-12" />
        <div className="ml-auto flex items-center gap-1.5">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>

      {/* Title — matches text-[15px] font-medium leading-snug */}
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>

      {/* Preview — matches text-[13px] muted */}
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>

      {/* Footer — vote pill · comments · Ask AI pill */}
      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-6 w-36 rounded-full" />
      </div>
    </div>
  );
}

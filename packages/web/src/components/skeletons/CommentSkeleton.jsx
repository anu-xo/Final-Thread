import Skeleton from './Skeleton.jsx';

export default function CommentSkeleton({ depth = 0 }) {
  const borderColors = [
    'border-gray-300', 'border-blue-300', 'border-green-300',
    'border-yellow-300', 'border-purple-300', 'border-red-300',
  ];
  const borderColor = borderColors[Math.min(depth, borderColors.length - 1)];

  return (
    <div
      className={`pl-3 border-l-2 ${borderColor} ${depth > 0 ? 'mt-2' : 'mt-4'}`}
    >
      <div className="flex gap-2">
        {/* Vote column — small */}
        <div className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
          <Skeleton className="h-3.5 w-3.5 rounded" />
          <Skeleton className="h-3 w-4 rounded" />
          <Skeleton className="h-3.5 w-3.5 rounded" />
        </div>

        <div className="flex-1 space-y-1.5">
          {/* Username + time */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-10" />
          </div>

          {/* Body — two lines */}
          <div className="space-y-1">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

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
        {/* Vote column — matches VoteButton default size="md": 20px icons, p-1 */}
        <div className="shrink-0 flex flex-col items-center gap-0.5 p-1">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="text-xs w-6 rounded" />
          <Skeleton className="h-5 w-5 rounded" />
        </div>

        <div className="flex-1 space-y-1.5">
          {/* Username + time — matches text-xs text-gray-500 */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-10" />
          </div>

          {/* Body — matches text-sm mt-1 */}
          <div className="space-y-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>

          {/* Reply link — matches flex gap-3 mt-1 text-xs */}
          <div className="flex gap-3 mt-1">
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
      </div>
    </div>
  );
}

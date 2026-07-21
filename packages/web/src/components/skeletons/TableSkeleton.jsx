import Skeleton from './Skeleton.jsx';

export default function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-50 dark:bg-neutral-800">
            {[...Array(columns)].map((_, i) => (
              <th key={i} className="px-4 py-2">
                <Skeleton className="h-3 w-16 mx-auto" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...Array(rows)].map((_, r) => (
            <tr key={r} className="border-t border-neutral-100 dark:border-neutral-800">
              {[...Array(columns)].map((_, c) => (
                <td key={c} className="px-4 py-2.5">
                  <Skeleton className="h-3 w-20" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

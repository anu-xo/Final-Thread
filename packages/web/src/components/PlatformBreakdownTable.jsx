import { usePlatformStats } from '../hooks/usePlatformStats';

function badgeColor(platform) {
  return platform === 'desktop'
    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300';
}

export default function PlatformBreakdownTable() {
  const { data, isLoading } = usePlatformStats();

  if (isLoading) return <p className="text-sm text-neutral-500">Loading breakdown…</p>;
  if (!data) return null;

  const { eventsByType, uniqueUsersByPlatform, desktopVersions } = data;

  const uniqueMap = {};
  for (const row of uniqueUsersByPlatform) uniqueMap[row._id] = row.uniqueUsers;

  const events = [];
  const seen = new Set();
  for (const { _id, count } of eventsByType) {
    if (!seen.has(_id.event)) {
      events.push({ event: _id.event, desktop: 0, web: 0 });
      seen.add(_id.event);
    }
    const entry = events.find((e) => e.event === _id.event);
    if (entry) entry[_id.platform] = count;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
          <p className="text-sm text-neutral-500">Unique Users (30d)</p>
          <div className="flex gap-4 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor('desktop')}`}>
              Desktop: {uniqueMap.desktop ?? 0}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor('web')}`}>
              Web: {uniqueMap.web ?? 0}
            </span>
          </div>
        </div>
        {desktopVersions.length > 0 && (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
            <p className="text-sm text-neutral-500">Desktop App Versions</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {desktopVersions.map((v) => (
                <span
                  key={v._id}
                  className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                >
                  v{v._id} ({v.count})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {events.length > 0 && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800">
                <th className="text-left px-4 py-2 font-medium text-neutral-500">Event</th>
                <th className="text-right px-4 py-2 font-medium text-orange-600">Desktop</th>
                <th className="text-right px-4 py-2 font-medium text-indigo-600">Web</th>
                <th className="text-right px-4 py-2 font-medium text-neutral-500">Total</th>
              </tr>
            </thead>
            <tbody>
              {events.map((row) => (
                <tr key={row.event} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2 font-mono text-xs">{row.event}</td>
                  <td className="px-4 py-2 text-right">{row.desktop}</td>
                  <td className="px-4 py-2 text-right">{row.web}</td>
                  <td className="px-4 py-2 text-right font-medium">{row.desktop + row.web}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

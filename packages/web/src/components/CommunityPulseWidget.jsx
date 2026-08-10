import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { communityApi } from '../services/communityApi.js';

export function CommunityPulseWidget({ slug }) {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['community-pulse', slug],
    queryFn: () => communityApi.getPulse(slug).then((r) => r.data.data),
    // 1h — matches cron cadence, no point refetching sooner
    staleTime: 60 * 60 * 1000,
  });

  // Don't render an empty "trending" box — empty array is the intended fallback
  // from the server when there's no cached pulse (or too little activity).
  if (!data?.trending?.length) return null;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 mb-6">
      <h2 className="font-semibold text-sm mb-3">Trending this week</h2>
      <div className="flex flex-wrap gap-2">
        {data.trending.map(({ term, count }) => (
          <button
            key={term}
            type="button"
            onClick={() =>
              navigate(`/search?q=${encodeURIComponent(term)}&community=${slug}`)
            }
            className="text-xs font-medium rounded-full border border-neutral-300 dark:border-neutral-600 px-3 py-1 text-neutral-700 dark:text-neutral-200 hover:border-emerald hover:text-emerald dark:hover:border-emerald dark:hover:text-emerald transition-colors"
          >
            {term} · {count}
          </button>
        ))}
      </div>
    </div>
  );
}

export default CommunityPulseWidget;

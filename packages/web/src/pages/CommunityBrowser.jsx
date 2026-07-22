import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { communityApi } from '../services/communityApi.js';
import { useCommunityStore } from '../store/communityStore.js';
import SectionErrorBoundary from '../components/SectionErrorBoundary.jsx';
import { CommunityCardSkeleton } from '../components/skeletons/index.js';

function CommunityCard({ community }) {
  const isSubscribed = useCommunityStore((s) => s.isSubscribed(community.slug));

  return (
    <Link
      to={`/community/${community.slug}`}
      className="block border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 hover:border-orange-400 transition-colors bg-white dark:bg-neutral-900"
    >
      {/* Banner strip */}
      <div
        className="h-2 rounded-full mb-4 bg-gradient-to-r from-orange-400 to-red-400"
        style={community.banner ? { backgroundImage: `url(${community.banner})` } : {}}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-base">r/{community.slug}</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{community.name}</p>
        </div>
        {isSubscribed && (
          <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full font-medium shrink-0">
            Joined
          </span>
        )}
      </div>

      {community.description && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-2 line-clamp-2">
          {community.description}
        </p>
      )}

      <p className="text-xs text-neutral-400 mt-3">
        {community.members.toLocaleString()} member{community.members !== 1 ? 's' : ''}
      </p>
    </Link>
  );
}

export default function CommunityBrowser() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['communities'],
    queryFn: ({ pageParam }) => communityApi.browse(pageParam).then((r) => r.data),
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined,
  });

  const communities = data?.pages.flatMap((p) => p.data) ?? [];

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <CommunityCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <SectionErrorBoundary sectionName="Communities">
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Explore Communities</h1>
            <p className="text-sm text-neutral-500 mt-1">Find your people</p>
          </div>
          <Link
            to="/communities/create"
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            + Create Community
          </Link>
        </div>

        {communities.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-neutral-400 text-lg">No communities yet.</p>
            <Link to="/communities/create" className="text-orange-500 hover:underline mt-2 block">
              Be the first to create one
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {communities.map((c) => (
                <CommunityCard key={c._id} community={c} />
              ))}
            </div>

            {hasNextPage && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="px-6 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </SectionErrorBoundary>
  );
}
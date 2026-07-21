import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PostCard from '../components/PostCard.jsx';
import { PostCardSkeleton } from '../components/skeletons/index.js';
import { useHomeFeed } from '../hooks/useHomeFeed.js';
import { useFeedRealtimeVotes } from '../hooks/useFeedRealtimeVotes.js';

const SORT_OPTIONS = ['hot', 'new', 'top', 'rising'];

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = SORT_OPTIONS.includes(searchParams.get('sort')) ? searchParams.get('sort') : 'hot';
  const sentinelRef = useRef(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useHomeFeed(sort);

  useFeedRealtimeVotes();

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { rootMargin: '400px' });

    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const pages = data?.pages || [];
  const posts = pages.flatMap((page) => page.data || []);
  const noSubscriptions = pages[0]?.meta?.noSubscriptions === true;

  const updateSort = (nextSort) => {
    setSearchParams({ sort: nextSort }, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse" />
        <div className="space-y-3">
          {[...Array(6)].map((_, index) => (
            <PostCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error?.message || 'Unable to load your feed.'}
      </div>
    );
  }

  if (noSubscriptions && posts.length === 0) {
    return (
      <div className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Welcome to ThreadVerse</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Join some communities to build your feed</h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-600">
          Your home feed is personalized from the communities you subscribe to. Join a few spaces and we’ll start filling this page with posts that match your interests.
        </p>
        <div className="mt-6">
          <Link
            to="/communities"
            className="inline-flex items-center rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            Browse communities
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Your feed</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Home</h1>
          <p className="mt-1 text-sm text-gray-500">Personalized from communities you’ve joined.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => updateSort(option)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                sort === option
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {posts.map((post) => (
          <PostCard key={post._id} post={post} />
        ))}
      </div>

      <div ref={sentinelRef} className="h-4" />

      {isFetchingNextPage && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
          Loading more...
        </div>
      )}

      {!hasNextPage && posts.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-400">
          You&apos;ve reached the end.
        </div>
      )}
    </div>
  );
}
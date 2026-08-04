import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PostCard from '../components/PostCard.jsx';
import SectionErrorBoundary from '../components/SectionErrorBoundary.jsx';
import { PostCardSkeleton } from '../components/skeletons/index.js';
import { useHomeFeed } from '../hooks/useHomeFeed.js';
import { useFeedRealtimeVotes } from '../hooks/useFeedRealtimeVotes.js';

const SORT_OPTIONS = ['hot', 'new', 'top', 'rising'];
const FIRST_PAGE_STAGGER_MS = 40;

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

  // Stagger the fade-in by ~40ms per card only for the first page. Once a
  // later page lands (pages.length > 1) every delay collapses to 0; the
  // already-mounted cards keep their settled state (motion doesn't re-run on
  // an unchanged target), so only the new cards animate in.
  const isFirstPage = pages.length === 1;
  const revealDelayFor = (index) =>
    isFirstPage ? Math.min(index * FIRST_PAGE_STAGGER_MS, 600) : 0;

  const updateSort = (nextSort) => {
    setSearchParams({ sort: nextSort }, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="shimmer h-24 rounded-2xl border border-gray-200 dark:border-white/10 p-6 shadow-sm" />
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
      <div className="rounded-2xl border border-amaranth/30 bg-amaranth/10 p-6 text-sm text-amaranth">
        <p className="mb-2">{error?.message || 'Unable to load your feed.'}</p>
        <button onClick={() => window.location.reload()} className="text-sm px-3 py-1 rounded bg-emerald text-white hover:bg-emerald/90">Try again</button>
      </div>
    );
  }

  if (noSubscriptions && posts.length === 0) {
    return (
      <div className="rounded-3xl border border-violet/20 bg-gradient-to-br from-violet/10 to-white dark:from-violet/10 dark:to-slate p-8 shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-emerald">Welcome to ThreadVerse</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-gray-900 dark:text-mist">Join some communities to build your feed</h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-600 dark:text-mist/60">
          Your home feed is personalized from the communities you subscribe to. Join a few spaces and we&apos;ll start filling this page with posts that match your interests.
        </p>
        <div className="mt-6">
          <Link
            to="/communities"
            className="inline-flex items-center rounded-full bg-emerald px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald/90"
          >
            Browse communities
          </Link>
        </div>
      </div>
    );
  }

  if (!noSubscriptions && posts.length === 0 && !isFetchingNextPage) {
    return (
      <div className="rounded-3xl border border-dashed border-gray-300 dark:border-white/10 bg-white dark:bg-slate p-8 text-center shadow-sm">
        <p className="text-sm text-gray-500 dark:text-mist/60">
          No posts in your subscribed communities yet. Check back later or join more communities.
        </p>
        <div className="mt-4">
          <Link
            to="/communities"
            className="inline-flex items-center rounded-full bg-emerald px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald/90"
          >
            Browse communities
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SectionErrorBoundary sectionName="Feed">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wide text-emerald">Your feed</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-gray-900 dark:text-mist">Home</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-mist/60">Personalized from communities you&apos;ve joined.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => updateSort(option)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  sort === option
                    ? 'bg-emerald text-white'
                    : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-mist/70 hover:bg-gray-200 dark:hover:bg-white/15'
                }`}
              >
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {posts.map((post, index) => (
            <PostCard key={post._id} post={post} revealDelay={revealDelayFor(index)} />
          ))}
        </div>

        <div ref={sentinelRef} className="h-4" />

        {isFetchingNextPage && (
          <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate p-4 text-center text-sm text-gray-500 dark:text-mist/60">
            Loading more...
          </div>
        )}

        {!hasNextPage && posts.length > 0 && (
          <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate p-4 text-center text-sm text-gray-400 dark:text-mist/50">
            You&apos;ve reached the end.
          </div>
        )}
      </div>
    </SectionErrorBoundary>
  );
}

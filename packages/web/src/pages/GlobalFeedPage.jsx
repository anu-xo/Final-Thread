import { useEffect, useRef } from 'react';
import PostCard from '../components/PostCard.jsx';
import SectionErrorBoundary from '../components/SectionErrorBoundary.jsx';
import { PostCardSkeleton } from '../components/skeletons/index.js';
import { usePostFeed } from '../hooks/usePostFeed.js';
import { usePostRealtimeVotes } from '../hooks/usePostRealtimeVotes.js';

const FIRST_PAGE_STAGGER_MS = 40;

// Popular = every community, sorted by hotScore. All = every community,
// sorted by newest. Both reuse GET /posts with no community filter.
const MODE_CONFIG = {
  popular: { sort: 'hot', title: 'Popular', blurb: 'What is hot across every community right now.' },
  all: { sort: 'new', title: 'All', blurb: 'Every post, everywhere, newest first.' },
};

export default function GlobalFeedPage({ mode }) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.popular;
  const sentinelRef = useRef(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = usePostFeed({ sort: config.sort });

  usePostRealtimeVotes();

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
  const posts = pages.flatMap((page) => page.posts || []);
  const isFirstPage = pages.length === 1;
  const revealDelayFor = (index) =>
    isFirstPage ? Math.min(index * FIRST_PAGE_STAGGER_MS, 600) : 0;

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
        <p className="mb-2">{error?.message || 'Unable to load posts.'}</p>
        <button onClick={() => window.location.reload()} className="text-sm px-3 py-1 rounded bg-emerald text-white hover:bg-emerald/90">Try again</button>
      </div>
    );
  }

  return (
    <SectionErrorBoundary sectionName="Global feed">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold tracking-wide text-emerald">Everywhere</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-gray-900 dark:text-mist">{config.title}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-mist/60">{config.blurb}</p>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 dark:border-white/10 bg-white dark:bg-slate p-8 text-center shadow-sm">
            <p className="text-sm text-gray-500 dark:text-mist/60">
              No posts yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post, index) => (
              <PostCard key={post._id} post={post} revealDelay={revealDelayFor(index)} />
            ))}
          </div>
        )}

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

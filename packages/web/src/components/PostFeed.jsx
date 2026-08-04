// components/PostFeed.jsx

import { useCallback, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { List } from 'react-window';
import { usePostFeed } from '../hooks/usePostFeed';
import { usePostRealtimeVotes } from '../hooks/usePostRealtimeVotes';
import PostCard from './PostCard';
import { PostCardSkeleton } from './skeletons/index.js';

const ITEM_HEIGHT = 200;
const OVERSCAN = 5;
const STAGGER_MS = 40;
const STAGGER_CAP = 400;

// Stagger the fade-up for rows that belong to the first page — the same
// ~40ms cadence the non-virtualized Home feed uses. Rows loaded by later
// pages (index >= firstPageCount) mount instantly so infinite scroll never
// feels delayed; only the initial feed load cascades.
function PostRow({ index, style, posts, firstPageCount }) {
  const revealDelay =
    index < firstPageCount ? Math.min(index * STAGGER_MS, STAGGER_CAP) : 0;
  return (
    <div style={style}>
      <PostCard post={posts[index]} revealDelay={revealDelay} />
    </div>
  );
}

export default function PostFeed({ communityId, sort }) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = usePostFeed({ communityId, sort });

  usePostRealtimeVotes();

  const posts = data ? data.pages.flatMap((page) => page.posts) : [];
  const firstPageCount = data?.pages?.[0]?.posts?.length ?? 0;

  const [listHeight, setListHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight - 64 : 800
  );

  useEffect(() => {
    const updateHeight = () => setListHeight(window.innerHeight - 64);
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const handleRowsRendered = useCallback(
    ({ stopIndex }) => {
      if (
        stopIndex >= posts.length - 5 &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage();
      }
    },
    [posts.length, hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-amaranth/30 bg-amaranth/10 p-6 text-center">
        <p className="text-sm text-amaranth mb-3">Failed to load posts: {error.message}</p>
        <button onClick={() => window.location.reload()} className="text-sm px-3 py-1 rounded bg-emerald text-white hover:bg-emerald/90">Try again</button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-white/10 bg-white dark:bg-slate p-10 text-center">
        <p className="text-sm text-gray-500 dark:text-mist/60 mb-3">No posts yet. Be the first to post!</p>
        <Link to="/submit" className="inline-flex items-center rounded-full bg-emerald px-4 py-2 text-sm font-semibold text-white hover:bg-emerald/90 transition">Create a post</Link>
      </div>
    );
  }

  return (
    <List
      rowHeight={ITEM_HEIGHT}
      rowCount={posts.length}
      rowComponent={PostRow}
      rowProps={{ posts, firstPageCount }}
      overscanCount={OVERSCAN}
      onRowsRendered={handleRowsRendered}
      style={{ height: listHeight, width: '100%' }}
    />
  );
}
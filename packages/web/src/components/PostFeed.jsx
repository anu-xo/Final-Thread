// components/PostFeed.jsx

import { useCallback, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { List } from 'react-window';
import { usePostFeed } from '../hooks/usePostFeed';
import { usePostRealtimeVotes } from '../hooks/usePostRealtimeVotes';
import PostCard from './PostCard';
import { PostCardSkeleton } from './skeletons/index.js';

const ITEM_HEIGHT = 400;
const OVERSCAN = 5;

function PostRow({ index, style, posts }) {
  return (
    <div style={style}>
      <PostCard post={posts[index]} />
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
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">Failed to load posts: {error.message}</p>
        <button onClick={() => window.location.reload()} className="text-sm px-3 py-1 rounded bg-orange-500 text-white hover:bg-orange-600">Try again</button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 p-10 text-center">
        <p className="text-sm text-gray-500 dark:text-neutral-400 mb-3">No posts yet. Be the first to post!</p>
        <Link to="/submit" className="inline-flex items-center rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition">Create a post</Link>
      </div>
    );
  }

  return (
    <List
      rowHeight={ITEM_HEIGHT}
      rowCount={posts.length}
      rowComponent={PostRow}
      rowProps={{ posts }}
      overscanCount={OVERSCAN}
      onRowsRendered={handleRowsRendered}
      style={{ height: listHeight, width: '100%' }}
    />
  );
}
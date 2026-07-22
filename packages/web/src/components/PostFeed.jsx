// components/PostFeed.jsx

import { useCallback } from 'react';
import { List } from 'react-window';
import { usePostFeed } from '../hooks/usePostFeed';
import { usePostRealtimeVotes } from '../hooks/usePostRealtimeVotes';
import PostCard from './PostCard';
import { PostCardSkeleton } from './skeletons/index.js';

const ITEM_HEIGHT = 220;
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

  if (isError) return <>{error.message}</>;

  return (
    <List
      rowHeight={ITEM_HEIGHT}
      rowCount={posts.length}
      rowComponent={PostRow}
      rowProps={{ posts }}
      overscanCount={OVERSCAN}
      onRowsRendered={handleRowsRendered}
      style={{ height: typeof window !== 'undefined' ? window.innerHeight - 64 : 800, width: '100%' }}
    />
  );
}
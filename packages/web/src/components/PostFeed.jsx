// components/PostFeed.jsx

import { useCallback, useRef } from 'react';
import { VariableSizeList } from 'react-window';
import { usePostFeed } from '../hooks/usePostFeed';
import { usePostRealtimeVotes } from '../hooks/usePostRealtimeVotes';
import PostCard from './PostCard';
import { PostCardSkeleton } from './skeletons/index.js';

const ESTIMATED_ITEM_SIZE = 100;
const OVERSCAN = 5;

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

  const listRef = useRef(null);
  const itemSizeCache = useRef({});

  const posts = data ? data.pages.flatMap((page) => page.posts) : [];

  const getItemSize = useCallback(
    (index) => itemSizeCache.current[index] ?? ESTIMATED_ITEM_SIZE,
    []
  );

  const setItemSize = useCallback((index, size) => {
    if (itemSizeCache.current[index] !== size) {
      itemSizeCache.current[index] = size;
      listRef.current?.resetAfterIndex(index);
    }
  }, []);

  const handleItemsRendered = useCallback(
    ({ visibleStopIndex }) => {
      if (
        visibleStopIndex >= posts.length - 5 &&
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
    <VariableSizeList
      ref={listRef}
      height={typeof window !== 'undefined' ? window.innerHeight - 64 : 800}
      itemCount={posts.length}
      itemSize={getItemSize}
      width="100%"
      overscanCount={OVERSCAN}
      onItemsRendered={handleItemsRendered}
    >
      {({ index, style }) => (
        <MeasuredItem index={index} style={style} onSize={setItemSize}>
          <PostCard post={posts[index]} />
        </MeasuredItem>
      )}
    </VariableSizeList>
  );
}

function MeasuredItem({ index, style, onSize, children }) {
  const ref = useCallback(
    (node) => {
      if (!node) return;
      const ro = new ResizeObserver(([entry]) => {
        onSize(index, entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      });
      ro.observe(node);
      return () => ro.disconnect();
    },
    [index, onSize]
  );

  return (
    <div style={style}>
      <div ref={ref}>{children}</div>
    </div>
  );
}
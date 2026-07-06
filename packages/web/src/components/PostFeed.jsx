// components/PostFeed.jsx

import { useEffect, useRef } from 'react';
import { usePostFeed } from '../hooks/usePostFeed';
import { usePostRealtimeVotes } from '../hooks/usePostRealtimeVotes';
import PostCard from './PostCard';

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

  // Keeps the feed in sync with votes cast by other users via Socket.io
  usePostRealtimeVotes();

  const sentinelRef = useRef(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage
        ) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <>Loading...</>;

  if (isError) return <>{error.message}</>;

  const posts = data.pages.flatMap((page) => page.posts);

  return (
    <div className="space-y-2">
      {/* Each PostCard renders its own VoteButton which handles its own mutation */}
      {posts.map((post) => (
        <PostCard key={post._id} post={post} />
      ))}

      <div ref={sentinelRef} className="h-4" />

      {isFetchingNextPage && (
        <div className="p-4 text-center text-gray-500 text-sm">
          Loading more...
        </div>
      )}

      {!hasNextPage && posts.length > 0 && (
        <div className="p-4 text-center text-gray-400 text-sm">
          You've reached the end
        </div>
      )}
    </div>
  );
}
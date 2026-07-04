// components/PostFeed.jsx
import { useEffect, useRef } from 'react';
import { usePostFeed } from '../hooks/usePostFeed';
import PostCard from './PostCard';

export default function PostFeed({ communityId, sort, onVote }) {
  const {
    data, fetchNextPage, hasNextPage,
    isFetchingNextPage, isLoading, isError, error,
  } = usePostFeed({ communityId, sort });

  const sentinelRef = useRef(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px' } // start loading before it's on screen
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <div className="p-4 text-center text-gray-500">Loading...</div>;
  if (isError) return <div className="p-4 text-center text-red-500">{error.message}</div>;

  const posts = data.pages.flatMap((page) => page.posts);

  return (
    <div className="space-y-2">
      {posts.map((post) => (
        <PostCard key={post._id} post={post} onVote={onVote} />
      ))}

      <div ref={sentinelRef} className="h-4" />

      {isFetchingNextPage && (
        <div className="p-4 text-center text-gray-500 text-sm">Loading more...</div>
      )}
      {!hasNextPage && posts.length > 0 && (
        <div className="p-4 text-center text-gray-400 text-sm">You've reached the end</div>
      )}
    </div>
  );
}

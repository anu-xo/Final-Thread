import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { socket } from '../lib/socket.js';
import api from '../services/api.js';
import VoteButton from './VoteButton.jsx';
import CommentThread from './CommentThread.jsx';
import CommentBox from './CommentBox.jsx';
import SectionErrorBoundary from './SectionErrorBoundary.jsx';
import { PostCardSkeleton, CommentSkeleton } from './skeletons/index.js';

function CommentBoxSkeleton() {
  return (
    <div className="border border-gray-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-900">
      <div className="h-16 rounded bg-gray-200 dark:bg-neutral-700 animate-pulse" />
    </div>
  );
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const units = [
    ['y', 31536000], ['mo', 2592000], ['d', 86400],
    ['h', 3600], ['m', 60], ['s', 1],
  ];
  for (const [label, secs] of units) {
    const val = Math.floor(seconds / secs);
    if (val >= 1) return `${val}${label} ago`;
  }
  return 'just now';
}

/** Fetches the nested comment tree and renders one CommentThread per root */
function CommentList({ postId }) {
  const { data: comments, isLoading, isError } = useQuery({
    queryKey: ['comments', postId],
    queryFn: async () => {
      const { data } = await api.get(`/posts/${postId}/comments`);
      // Backend returns { comments: [...] } or { data: { comments: [...] } }
      return data?.data?.comments ?? data?.comments ?? [];
    },
    enabled: Boolean(postId),
  });

  if (isLoading) {
    return (
      <div>
        {[...Array(4)].map((_, i) => (
          <CommentSkeleton key={i} depth={i % 3} />
        ))}
      </div>
    );
  }
  if (isError)   return <p className="text-sm text-red-400">Could not load comments.</p>;
  if (!comments?.length) return <p className="text-sm text-gray-400">No comments yet. Be the first!</p>;

  return (
    <div>
      {comments.map((comment) => (
        <CommentThread
          key={comment._id}
          comment={comment}
          postId={postId}
          currentUserVote={0} /* fast-follow: needs backend $lookup to populate per-user vote */
        />
      ))}
    </div>
  );
}

export default function PostDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['posts', id],
    queryFn: async () => {
      const { data: response } = await api.get(`/posts/${id}`);
      return response.post;
    },
    enabled: Boolean(id),
  });

  // Socket.io: join the per-post room so vote:updated events update
  // the PostDetail score without a full refetch
  useEffect(() => {
    if (!id) return;

    socket.emit('join_post', { postId: id });

    const handleVoteUpdated = ({ postId }) => {
      if (postId !== id) return;
      queryClient.invalidateQueries({ queryKey: ['posts', id] });
    };

    socket.on('vote:updated', handleVoteUpdated);

    return () => {
      socket.off('vote:updated', handleVoteUpdated);
      socket.emit('leave_post', { postId: id });
    };
  }, [id, queryClient]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <PostCardSkeleton />
        <CommentBoxSkeleton />
        <div>
          <h2 className="text-sm font-semibold text-gray-600 dark:text-neutral-400 mb-2">Comments</h2>
          {[...Array(4)].map((_, i) => (
            <CommentSkeleton key={i} depth={i % 3} />
          ))}
        </div>
      </div>
    );
  }
  if (error)     return <div className="p-4 text-red-500">Unable to load post.</div>;

  return (
    <>
      <Helmet>
        <title>{post.title} — ThreadVerse</title>
        <meta name="description" content={post.body?.slice(0, 160)} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.body?.slice(0, 160)} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
      </Helmet>
      <SectionErrorBoundary sectionName="Post">
        <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* ── Post header ─────────────────────────────────────────────── */}
        <article className="flex gap-3 bg-white border border-gray-200 rounded-lg p-4">
          {/* Vote column */}
          <div className="shrink-0">
            <VoteButton
              targetId={post?._id}
              targetType="post"
              initialScore={post?.score ?? 0}
              initialUserVote={post?.userVote ?? 0}
            />
          </div>

          {/* Post body */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <span className="font-medium text-gray-700">
                r/{post?.community?.name}
              </span>
              <span>· u/{post?.author?.username}</span>
              <span>· {timeAgo(post?.createdAt)}</span>
            </div>

            <h1 className="text-xl font-semibold text-gray-900 leading-snug mb-2">
              {post?.title}
            </h1>

            {post?.media?.length > 0 && (
              <div className="mb-3 overflow-hidden rounded-lg border bg-gray-50">
                <img
                  src={post.media[0]}
                  alt={post.title}
                  className="max-h-[32rem] w-full object-contain bg-black/5"
                />
              </div>
            )}

            {post?.body && (
              <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                {post.body}
              </p>
            )}
          </div>
        </article>

        {/* ── Comment composer ────────────────────────────────────────── */}
        <CommentBox postId={id} parentId={null} />

        {/* ── Comment tree ────────────────────────────────────────────── */}
        <SectionErrorBoundary sectionName="Comments">
          <section>
            <h2 className="text-sm font-semibold text-gray-600 mb-2">
              Comments ({post?.commentCount ?? 0})
            </h2>
            <CommentList postId={id} />
          </section>
        </SectionErrorBoundary>
      </div>
      </SectionErrorBoundary>
    </>
  );
}
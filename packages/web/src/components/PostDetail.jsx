import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { socket } from '../lib/socket.js';
import api from '../services/api.js';
import VoteButton from './VoteButton.jsx';
import CommentThread from './CommentThread.jsx';
import CommentBox from './CommentBox.jsx';
import ReportDialog from './ReportDialog.jsx';
import AskAIPill from './AskAIPill.jsx';
import SectionErrorBoundary from './SectionErrorBoundary.jsx';
import { sanitizeHtml } from '../utils/sanitize.js';
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
function CommentList({ postId, newCommentId }) {
  const { data: comments, isLoading, isError } = useQuery({
    queryKey: ['comments', postId],
    queryFn: async () => {
      const { data } = await api.get(`/posts/${postId}/comments`);
      // Backend returns { data: <enriched comment tree array> }
      return data?.data ?? [];
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
  if (isError)   return <p className="text-sm text-amaranth">Could not load comments.</p>;
  if (!comments?.length) return <p className="text-sm text-gray-400">No comments yet. Be the first!</p>;

  return (
    <div>
      {comments.map((comment) => (
        <CommentThread
          key={comment._id}
          comment={comment}
          postId={postId}
          currentUserVote={comment.userVote ?? 0}
          newCommentId={newCommentId}
        />
      ))}
    </div>
  );
}

/** Immutably inserts a socket-arrived comment into the cached tree by parentId */
function insertComment(comments, newComment) {
  const node = { ...newComment, children: [] };
  const parentId = newComment.parent;
  if (!parentId) return [...comments, node];

  let inserted = false;
  const mapTree = (list) =>
    list.map((c) => {
      if (String(c._id) === String(parentId)) {
        inserted = true;
        return { ...c, children: [...(c.children ?? []), node] };
      }
      if (c.children?.length) {
        return { ...c, children: mapTree(c.children) };
      }
      return c;
    });

  const next = mapTree(comments);
  return inserted ? next : [...comments, node];
}

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showReport, setShowReport] = useState(false);
  const [newCommentId, setNewCommentId] = useState(null);

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['posts', id],
    queryFn: async () => {
      const { data: response } = await api.get(`/posts/${id}`);
      return response.data.post;
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

    const handleCommentNew = ({ postId: eventPostId, comment: newComment }) => {
      if (eventPostId !== id) return;
      setNewCommentId(newComment._id);
      queryClient.setQueryData(['comments', id], (old) =>
        Array.isArray(old) ? insertComment(old, newComment) : old
      );
      queryClient.setQueryData(['posts', id], (old) =>
        old ? { ...old, commentCount: (old.commentCount ?? 0) + 1 } : old
      );
    };

    socket.on('vote:updated', handleVoteUpdated);
    socket.on('comment:new', handleCommentNew);
    socket.on('comment:ai_posted', handleCommentNew);

    return () => {
      socket.off('vote:updated', handleVoteUpdated);
      socket.off('comment:new', handleCommentNew);
      socket.off('comment:ai_posted', handleCommentNew);
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
  if (error) {
    const is404 = error?.response?.status === 404;
    return (
      <div className="max-w-3xl mx-auto p-4 text-center py-20">
        <p className="text-5xl font-bold text-emerald mb-4">{is404 ? '404' : '500'}</p>
        <p className="text-lg text-gray-900 dark:text-neutral-100 mb-2">
          {is404 ? 'Post not found' : 'Something went wrong'}
        </p>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
          {is404 ? 'This post may have been deleted.' : 'Unable to load post. Please try again later.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => navigate(-1)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800">Go back</button>
          <button onClick={() => window.location.reload()} className="px-4 py-2 text-sm rounded-lg bg-emerald text-white hover:bg-emerald/90">Try again</button>
        </div>
      </div>
    );
  }

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
        <article className="flex gap-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg p-4">
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
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400 mb-2">
              <span className="font-medium text-gray-700 dark:text-neutral-300">
                {post?.community?.name}
              </span>
              <span>· {post?.author?.username}</span>
              <span>· {timeAgo(post?.createdAt)}</span>
            </div>

            <h1 className="text-xl font-semibold text-gray-900 dark:text-neutral-100 leading-snug mb-2">
              {post?.title}
            </h1>

            {post?.media?.length > 0 && (
              <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
                <img
                  src={post.media[0]}
                  alt={post.title}
                  className="max-h-[32rem] w-full object-contain bg-black/5"
                />
              </div>
            )}

            {post?.body && (
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-gray-700 dark:text-neutral-300"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body) }}
              />
            )}

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => setShowReport(true)}
                className="text-xs text-gray-400 hover:text-amaranth dark:hover:text-amaranth transition-colors"
              >
                Report
              </button>
            </div>
          </div>
        </article>

        {/* ── Ask AI about this thread ───────────────────────────────── */}
        <AskAIPill
          postId={post?._id}
          communityId={post?.community?._id}
          aiEnabled={post?.community?.aiEnabled}
          accent={post?.community?.accentColor ?? null}
          title={post?.title}
          variant="inline"
        />

        {/* ── Comment composer ────────────────────────────────────────── */}
        <CommentBox postId={id} parentId={null} />

        {/* ── Comment tree ────────────────────────────────────────────── */}
        <SectionErrorBoundary sectionName="Comments">
          <section>
            <h2 className="text-sm font-semibold text-gray-600 dark:text-neutral-400 mb-2">
              Comments ({post?.commentCount ?? 0})
            </h2>
            <CommentList postId={id} newCommentId={newCommentId} />
          </section>
        </SectionErrorBoundary>
      </div>
      </SectionErrorBoundary>
      {showReport && (
        <ReportDialog
          target={post._id}
          targetType="post"
          community={post.community?._id}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}
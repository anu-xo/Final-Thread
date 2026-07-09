import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import PostCard from '../components/PostCard.jsx';
import { userApi } from '../services/userApi.js';

function ProfileCommentCard({ comment }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">
            <Link
              to={`/posts/${comment.post?._id}`}
              className="font-medium text-orange-600 hover:text-orange-700"
            >
              {comment.post?.title || 'View post'}
            </Link>
            {comment.post?.community?.name && (
              <span className="ml-2 text-gray-400">r/{comment.post.community.name}</span>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</p>
        </div>

        <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          {comment.score}
        </span>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => userApi.getProfile(username).then((response) => response.data.data),
    enabled: Boolean(username),
  });

  const postsQuery = useInfiniteQuery({
    queryKey: ['profile', username, 'posts'],
    queryFn: ({ pageParam }) => userApi.getPosts(username, pageParam).then((response) => response.data),
    initialPageParam: null,
    enabled: activeTab === 'posts' && Boolean(username),
    getNextPageParam: (lastPage) => (lastPage?.meta?.hasMore ? lastPage.meta.cursor : undefined),
  });

  const commentsQuery = useInfiniteQuery({
    queryKey: ['profile', username, 'comments'],
    queryFn: ({ pageParam }) => userApi.getComments(username, pageParam).then((response) => response.data),
    initialPageParam: null,
    enabled: activeTab === 'comments' && Boolean(username),
    getNextPageParam: (lastPage) => (lastPage?.meta?.hasMore ? lastPage.meta.cursor : undefined),
  });

  if (profileLoading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse" />;
  }

  if (profileError || !profile) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        User not found.
      </div>
    );
  }

  const postItems = postsQuery.data?.pages.flatMap((page) => page.data || []) || [];
  const commentItems = commentsQuery.data?.pages.flatMap((page) => page.data || []) || [];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-xl font-bold text-orange-700">
              {profile.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Profile</p>
              <h1 className="truncate text-2xl font-bold text-gray-900">u/{profile.username}</h1>
              <p className="mt-1 text-sm text-gray-500">Joined {new Date(profile.createdAt).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-64">
            <div className="rounded-2xl bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Karma</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{profile.karma ?? 0}</div>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Role</div>
              <div className="mt-1 text-xl font-semibold text-gray-900 capitalize">{profile.role || 'user'}</div>
            </div>
          </div>
        </div>

        {profile.bio && (
          <p className="mt-4 max-w-3xl text-sm leading-6 text-gray-600">{profile.bio}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {['overview', 'posts', 'comments'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Overview</h2>
            <p className="mt-2 text-sm text-gray-600">
              Browse this user&apos;s posts and comments from the tabs above. Posts and comments load lazily so prolific profiles stay fast.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Posts</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{postItems.length}</div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Comments</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{commentItems.length}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'posts' && (
        <div className="space-y-3">
          {postsQuery.isLoading && postItems.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading posts…</div>
          ) : postItems.length > 0 ? (
            postItems.map((post) => <PostCard key={post._id} post={post} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
              No posts yet.
            </div>
          )}

          {postsQuery.hasNextPage && (
            <button
              type="button"
              onClick={() => postsQuery.fetchNextPage()}
              disabled={postsQuery.isFetchingNextPage}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {postsQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {activeTab === 'comments' && (
        <div className="space-y-3">
          {commentsQuery.isLoading && commentItems.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading comments…</div>
          ) : commentItems.length > 0 ? (
            commentItems.map((comment) => <ProfileCommentCard key={comment._id} comment={comment} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
              No comments yet.
            </div>
          )}

          {commentsQuery.hasNextPage && (
            <button
              type="button"
              onClick={() => commentsQuery.fetchNextPage()}
              disabled={commentsQuery.isFetchingNextPage}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {commentsQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
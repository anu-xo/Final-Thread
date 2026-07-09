import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api.js';
import PostCard from '../components/PostCard.jsx';

function ResultSection({ title, count, children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </h2>
        <span className="text-xs text-gray-400">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function CommunityResult({ community }) {
  return (
    <Link
      to={`/community/${community.slug}`}
      className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-gray-900">r/{community.name}</div>
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">
            {community.description || 'No description provided.'}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
          {community.members ?? 0} members
        </span>
      </div>
    </Link>
  );
}

function UserResult({ user }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
          {user.username?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">u/{user.username}</div>
          <div className="text-xs text-gray-500 capitalize">{user.role || 'user'}</div>
        </div>
        <div className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
          {user.karma ?? 0} karma
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q')?.trim() || '';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      const { data: response } = await api.get('/search', {
        params: { q: query, type: 'all', limit: 10 },
      });

      return response.data;
    },
    enabled: query.length >= 2,
  });

  const posts = data?.posts || [];
  const communities = data?.communities || [];
  const users = data?.users || [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Search</h1>
        <p className="mt-2 text-sm text-gray-500">
          {query
            ? `Results for “${query}”`
            : 'Type at least 2 characters in the header search box to search posts, communities, and users.'}
        </p>
      </div>

      {query.length < 2 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-sm text-gray-500">
          Search is ready, but it needs a slightly longer query.
        </div>
      ) : isLoading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading results…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {(error)?.message || 'Unable to load search results.'}
        </div>
      ) : (
        <div className="space-y-8">
          <ResultSection title="Posts" count={posts.length}>
            {posts.length > 0 ? (
              posts.map((post) => <PostCard key={post._id} post={post} />)
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
                No posts matched this query.
              </div>
            )}
          </ResultSection>

          <ResultSection title="Communities" count={communities.length}>
            {communities.length > 0 ? (
              communities.map((community) => (
                <CommunityResult key={community._id} community={community} />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
                No communities matched this query.
              </div>
            )}
          </ResultSection>

          <ResultSection title="Users" count={users.length}>
            {users.length > 0 ? (
              users.map((user) => <UserResult key={user._id || user.username} user={user} />)
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
                No users matched this query.
              </div>
            )}
          </ResultSection>
        </div>
      )}
    </div>
  );
}
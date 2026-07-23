import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../services/api.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { SearchResultsSkeleton } from './skeletons/index.js';

function ResultHeader({ title, count, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 text-left"
    >
      <span className="text-sm font-semibold text-gray-800 dark:text-neutral-200">{title}</span>
      <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
        {count}
        <span className="text-gray-300 dark:text-neutral-500">{open ? '−' : '+'}</span>
      </span>
    </button>
  );
}

function CompactPost({ post, onSelect }) {
  return (
    <Link
      to={`/posts/${post._id}`}
      onClick={onSelect}
      className="block rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 transition hover:border-orange-200 dark:hover:border-orange-700 hover:bg-orange-50/30 dark:hover:bg-orange-900/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-neutral-100 line-clamp-1">{post.title}</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400 line-clamp-1">
            r/{post.community?.name} · u/{post.author?.username}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 dark:bg-neutral-700 px-2 py-1 text-xs font-medium text-gray-600 dark:text-neutral-300">
          {post.score}
        </span>
      </div>
    </Link>
  );
}

function CompactCommunity({ community, onSelect }) {
  return (
    <Link
      to={`/community/${community.slug}`}
      onClick={onSelect}
      className="block rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 transition hover:border-orange-200 dark:hover:border-orange-700 hover:bg-orange-50/30 dark:hover:bg-orange-900/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-neutral-100 line-clamp-1">r/{community.name}</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400 line-clamp-2">
            {community.description || 'No description provided.'}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
          {community.members ?? 0}
        </span>
      </div>
    </Link>
  );
}

function CompactUser({ user, onSelect }) {
  return (
    <Link
      to={`/u/${user.username}`}
      onClick={onSelect}
      className="block rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 transition hover:border-orange-200 dark:hover:border-orange-700 hover:bg-orange-50/30 dark:hover:bg-orange-900/10"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-700 text-sm font-semibold text-gray-700 dark:text-neutral-300">
          {user.username?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900 dark:text-neutral-100 line-clamp-1">u/{user.username}</div>
          <div className="text-xs text-gray-500 dark:text-neutral-400 capitalize">{user.role || 'user'}</div>
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 dark:bg-neutral-700 px-2 py-1 text-xs font-medium text-gray-600 dark:text-neutral-300">
          {user.karma ?? 0} karma
        </span>
      </div>
    </Link>
  );
}

export default function SearchModal({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState({ posts: true, communities: true, users: true });
  const debouncedQuery = useDebouncedValue(query, 300);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: async () => {
      const { data: response } = await api.get('/search', {
        params: { q: debouncedQuery, type: 'all', limit: 8 },
      });

      return response.data;
    },
    enabled: open && debouncedQuery.length >= 2,
  });

  useEffect(() => {
    if (!open) {
      setQuery('');
      setExpanded({ posts: true, communities: true, users: true });
      return;
    }

    const focusId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusId);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const timer = window.setTimeout(() => {
      inputRef.current?.select?.();
    }, 10);

    return () => window.clearTimeout(timer);
  }, [open]);

  const results = data || { posts: [], communities: [], users: [] };

  const sections = useMemo(() => ([
    { key: 'posts', title: 'Posts', items: results.posts, renderItem: (post) => <CompactPost key={post._id} post={post} onSelect={onClose} /> },
    { key: 'communities', title: 'Communities', items: results.communities, renderItem: (community) => <CompactCommunity key={community._id} community={community} onSelect={onClose} /> },
    { key: 'users', title: 'Users', items: results.users, renderItem: (user) => <CompactUser key={user._id || user.username} user={user} onSelect={onClose} /> },
  ]), [onClose, results.communities, results.posts, results.users]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 px-4 py-10 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-gray-50 dark:bg-neutral-900 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-4">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts, communities, and users..."
            className="w-full bg-transparent text-base text-gray-900 dark:text-neutral-100 outline-none placeholder:text-gray-400 dark:placeholder:text-neutral-500"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 dark:text-neutral-400 transition hover:bg-gray-100 dark:hover:bg-neutral-700 hover:text-gray-900 dark:hover:text-neutral-100"
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          {query.length < 2 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 p-8 text-sm text-gray-500 dark:text-neutral-400">
              Type at least 2 characters to search.
            </div>
          ) : isLoading ? (
            <SearchResultsSkeleton />
          ) : isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">
              Unable to load results.
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.key} className="space-y-3">
                <ResultHeader
                  title={section.title}
                  count={section.items.length}
                  open={expanded[section.key]}
                  onToggle={() => setExpanded((current) => ({
                    ...current,
                    [section.key]: !current[section.key],
                  }))}
                />

                {expanded[section.key] && (
                  <div className="space-y-2">
                    {section.items.length > 0 ? (
                      section.items.map(section.renderItem)
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-500">
                        No {section.title.toLowerCase()} matched this query.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {query.length >= 2 && !isLoading && !isError && sections.every((section) => section.items.length === 0) && (
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 p-8 text-sm text-gray-500 dark:text-neutral-400">
              No matches for "{query}".
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 text-xs text-gray-500 dark:text-neutral-400">
          <span>Cmd/Ctrl+K opens this panel anywhere in the app.</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              if (query.trim().length >= 2) {
                navigate(`/search?q=${encodeURIComponent(query.trim())}`);
              }
            }}
            className="font-medium text-orange-600 hover:text-orange-700"
          >
            Open full search
          </button>
        </div>
      </div>
    </div>
  );
}
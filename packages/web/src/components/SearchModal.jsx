import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import api from '../services/api.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { SearchResultsSkeleton } from './skeletons/index.js';

const TABS = [
  { key: 'posts', label: 'Posts' },
  { key: 'communities', label: 'Communities' },
  { key: 'users', label: 'Users' },
];

function buildItemPath(tab, item) {
  if (tab === 'posts') return `/posts/${item._id}`;
  if (tab === 'communities') return `/community/${item.slug}`;
  return `/u/${item.username}`;
}

function PostBody({ post }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-neutral-100 line-clamp-1">{post.title}</div>
        <div className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400 line-clamp-1">
          r/{post.community?.name} Â· u/{post.author?.username}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-gray-100 dark:bg-neutral-700 px-2 py-1 text-xs font-medium text-gray-600 dark:text-neutral-300 tabular-nums">
        {post.score}
      </span>
    </div>
  );
}

function CommunityBody({ community }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-neutral-100 line-clamp-1">r/{community.name}</div>
        <div className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400 line-clamp-2">
          {community.description || 'No description provided.'}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-orange-50 px-2 py-1 text-xs font-medium text-emerald tabular-nums">
        {community.members ?? 0}
      </span>
    </div>
  );
}

function UserBody({ user }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-700 text-sm font-semibold text-gray-700 dark:text-neutral-300">
        {user.username?.[0]?.toUpperCase() || '?'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900 dark:text-neutral-100 line-clamp-1">u/{user.username}</div>
        <div className="text-xs text-gray-500 dark:text-neutral-400 capitalize">{user.role || 'user'}</div>
      </div>
      <span className="shrink-0 rounded-full bg-gray-100 dark:bg-neutral-700 px-2 py-1 text-xs font-medium text-gray-600 dark:text-neutral-300 tabular-nums">
        {user.karma ?? 0} karma
      </span>
    </div>
  );
}

// Row wrapper carries the shared highlight. When the active row changes the
// layoutId element slides between rows instead of snapping.
function ResultRow({ tab, item, index, activeIndex, onSelect, onHover, children }) {
  return (
    <motion.div layout className="relative" onMouseEnter={onHover}>
      {activeIndex === index && (
        <motion.div
          layoutId="search-result-highlight"
          className="absolute inset-0 rounded-lg bg-emerald/10 ring-1 ring-emerald/30"
          transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.9 }}
        />
      )}
      <Link
        to={buildItemPath(tab, item)}
        onClick={onSelect}
        className="relative z-10 block rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-100/70 dark:hover:bg-neutral-800/60"
      >
        {children}
      </Link>
    </motion.div>
  );
}

export default function SearchModal({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('posts');
  const [activeIndex, setActiveIndex] = useState(-1);
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

  const results = useMemo(() => data || { posts: [], communities: [], users: [] }, [data]);
  const items = useMemo(() => results[activeTab] || [], [results, activeTab]);
  const allEmpty = results.posts.length === 0 && results.communities.length === 0 && results.users.length === 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedQuery]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [activeTab]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (items.length === 0) return;
      event.preventDefault();
      setActiveIndex((prev) => {
        if (event.key === 'ArrowDown') {
          return prev >= items.length - 1 ? items.length - 1 : prev + 1;
        }
        return prev <= 0 ? -1 : prev - 1;
      });
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      // Only switch tabs once the user has entered the results; otherwise
      // let the arrow keys edit the query caret normally.
      if (activeIndex < 0) return;
      event.preventDefault();
      setActiveTab((tab) => {
        const i = TABS.findIndex((t) => t.key === tab);
        const next = event.key === 'ArrowRight' ? i + 1 : i - 1;
        if (next < 0 || next >= TABS.length) return tab;
        return TABS[next].key;
      });
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
      event.preventDefault();
      onClose();
      navigate(buildItemPath(activeTab, items[activeIndex]));
      return;
    }

    if (event.key === 'Tab') {
      const dialog = document.getElementById('search-modal-dialog');
      if (!dialog) return;
      const focusable = dialog.querySelectorAll(
        'input, button, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  }, [onClose, items, activeIndex, activeTab, navigate]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveTab('posts');
      setActiveIndex(-1);
      return;
    }

    const focusId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusId);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleKeyDown]);

  useEffect(() => {
    if (!open) return undefined;

    const timer = window.setTimeout(() => {
      inputRef.current?.select?.();
    }, 10);

    return () => window.clearTimeout(timer);
  }, [open]);

  const activeTabLabel = useMemo(
    () => TABS.find((t) => t.key === activeTab)?.label.toLowerCase() || '',
    [activeTab]
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[80] bg-black/50"
            initial={{ opacity: 0, ...(reduceMotion ? {} : { backdropFilter: 'blur(0px)' }) }}
            animate={{ opacity: 1, ...(reduceMotion ? {} : { backdropFilter: 'blur(6px)' }) }}
            exit={{ opacity: 0, ...(reduceMotion ? {} : { backdropFilter: 'blur(0px)' }) }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
          />

          <motion.div
            key="dialog"
            id="search-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="fixed inset-x-0 top-[12vh] z-[81] mx-auto flex w-[calc(100%-2rem)] max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-gray-50 dark:bg-neutral-900 shadow-2xl"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
            transition={
              reduceMotion
                ? { duration: 0.15 }
                : { type: 'spring', stiffness: 380, damping: 30 }
            }
          >
            {/* Input row */}
            <div className="flex items-center gap-3 bg-white dark:bg-neutral-800 px-4 py-4">
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(-1);
                }}
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

            {/* Tabs â€” shared emerald underline slides between them */}
            <div className="flex gap-1 border-b border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4">
              {TABS.map((tab) => {
                const count = results[tab.key]?.length ?? 0;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative -mb-px flex items-center gap-1.5 pb-2.5 pt-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-gray-900 dark:text-neutral-100'
                        : 'text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200'
                    }`}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                          isActive
                            ? 'bg-emerald/15 text-emerald'
                            : 'bg-gray-100 text-gray-500 dark:bg-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                    {isActive && (
                      <motion.span
                        layoutId="search-tab-underline"
                        className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-emerald"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Results */}
            <div className="max-h-[70vh] flex-1 overflow-y-auto p-4">
              {query.length < 2 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 p-8 text-sm text-gray-500 dark:text-neutral-400">
                  Type at least 2 characters to search.
                </div>
              ) : isLoading ? (
                <SearchResultsSkeleton />
              ) : isError ? (
                <div className="rounded-2xl border border-amaranth/30 dark:border-amaranth/40 bg-red-50 dark:bg-amaranth/10 p-8 text-sm text-amaranth dark:text-amaranth">
                  Unable to load results.
                </div>
              ) : items.length > 0 ? (
                <div className="space-y-0.5">
                  {items.map((item, index) => (
                    <ResultRow
                      key={item._id || item.username}
                      tab={activeTab}
                      item={item}
                      index={index}
                      activeIndex={activeIndex}
                      onSelect={onClose}
                      onHover={() => setActiveIndex(index)}
                    >
                      {activeTab === 'posts' && <PostBody post={item} />}
                      {activeTab === 'communities' && <CommunityBody community={item} />}
                      {activeTab === 'users' && <UserBody user={item} />}
                    </ResultRow>
                  ))}
                </div>
              ) : allEmpty ? (
                <div className="rounded-2xl border border-dashed border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 p-8 text-sm text-gray-500 dark:text-neutral-400">
                  No matches for &quot;{query}&quot;.
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 p-8 text-sm text-gray-500 dark:text-neutral-400">
                  No {activeTabLabel} matched this query.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 text-xs text-gray-500 dark:text-neutral-400">
              <span>Cmd/Ctrl+K opens this panel anywhere in the app.</span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (query.trim().length >= 2) {
                    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
                  }
                }}
                className="font-medium text-emerald hover:text-emerald"
              >
                Open full search
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

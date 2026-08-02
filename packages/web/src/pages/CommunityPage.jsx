import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Helmet } from 'react-helmet-async';
import { communityApi } from '../services/communityApi.js';
import { useCommunityStore } from '../store/communityStore.js';
import { socket } from '../lib/socket.js';
import PostFeed from '../components/PostFeed.jsx';
import SectionErrorBoundary from '../components/SectionErrorBoundary.jsx';
import { Skeleton } from '../components/skeletons/index.js';
import NumberFlip from '../components/NumberFlip.jsx';
import ThreadSnipIcon from '../components/ThreadSnipIcon.jsx';

const PARALLAX_MAX = 15;

function CommunityBanner({ banner, reduceMotion }) {
  const containerRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (reduceMotion) return undefined;

    const onScroll = () => {
      const container = containerRef.current;
      const layer = layerRef.current;
      if (!container || !layer) return;

      const rect = container.getBoundingClientRect();
      // Only drift while the banner is actually on screen
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;

      const drift = Math.max(-PARALLAX_MAX, Math.min(PARALLAX_MAX, rect.top * -0.05));
      layer.style.transform = `translate3d(0, ${drift}px, 0)`;
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduceMotion]);

  return (
    <div
      ref={containerRef}
      className="relative h-24 overflow-hidden bg-gradient-to-r from-orange-400 to-red-400"
    >
      {banner ? (
        <div
          ref={layerRef}
          className="absolute -inset-y-8 inset-x-0 will-change-transform"
          style={{
            backgroundImage: `url(${banner})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 30%',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-red-400" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 to-black/20" />
    </div>
  );
}

function CommunityHeader({ community }) {
  const queryClient = useQueryClient();
  const { addSubscription, removeSubscription, isSubscribed } = useCommunityStore();
  const reduceMotion = useReducedMotion();
  const joined = isSubscribed(community.slug);
  const [snipKey, setSnipKey] = useState(0);
  const [liveMembers, setLiveMembers] = useState(community.members ?? 0);

  useEffect(() => {
    setLiveMembers(community.members ?? 0);
  }, [community.members]);

  // Join the community room so live member-count changes stream in
  useEffect(() => {
    const slug = community.slug;
    if (!slug) return undefined;

    socket.emit('join_community', { slug });

    const handleMembers = ({ slug: eventSlug, members }) => {
      if (eventSlug !== slug || typeof members !== 'number') return;
      setLiveMembers(members);
      queryClient.setQueryData(['community', slug], (old) =>
        old ? { ...old, members } : old
      );
    };

    socket.on('community:members', handleMembers);
    return () => {
      socket.off('community:members', handleMembers);
      socket.emit('leave_community', { slug });
    };
  }, [community.slug, queryClient]);

  const joinMutation = useMutation({
    mutationFn: () => communityApi.join(community.slug),
    onMutate: async () => {
      addSubscription(community);
      return { previousState: false };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousState === false) removeSubscription(community.slug);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['community', community.slug] }),
  });

  const leaveMutation = useMutation({
    mutationFn: () => communityApi.leave(community.slug),
    onMutate: async () => {
      removeSubscription(community.slug);
      return { previousState: true };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousState === true) addSubscription(community);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['community', community.slug] }),
  });

  const isPending = joinMutation.isPending || leaveMutation.isPending;

  const handleToggle = () => {
    if (isPending) return;
    if (joined) {
      setSnipKey((k) => k + 1);
      leaveMutation.mutate();
    } else {
      joinMutation.mutate();
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
      <CommunityBanner banner={community.banner} reduceMotion={reduceMotion} />

      <div className="max-w-5xl mx-auto px-4 py-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">r/{community.slug}</h1>
          <p className="text-sm text-neutral-500">{community.name}</p>
          <p className="text-xs text-neutral-400 mt-1">
            <NumberFlip value={liveMembers} /> member{liveMembers !== 1 ? 's' : ''}
          </p>
        </div>

        <motion.button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          aria-pressed={joined}
          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
          className={`inline-flex items-center gap-1.5 rounded-full border px-5 py-2 text-sm font-semibold transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
            joined
              ? 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-200 hover:border-red-400 hover:text-red-500 dark:hover:border-red-400 dark:hover:text-red-400'
              : 'border-orange-500 bg-orange-500 text-white hover:border-orange-600 hover:bg-orange-600'
          }`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={joined ? 'joined' : 'join'}
              initial={reduceMotion ? false : { y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduceMotion ? undefined : { y: -8, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {joined ? 'Joined' : 'Join'}
            </motion.span>
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {joined && (
              <motion.span
                key="thread-snip"
                className="inline-flex"
                initial={reduceMotion ? false : { scale: 0.4, opacity: 0, rotate: -20 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={
                  reduceMotion
                    ? undefined
                    : {
                        rotate: [0, 12, -9, 0],
                        scale: [1, 0.94, 0.85],
                        opacity: [1, 1, 0],
                      }
                }
                transition={{ duration: 0.32, ease: 'easeInOut' }}
              >
                <ThreadSnipIcon snip={snipKey} className="h-3.5 w-3.5" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
  { value: 'rising', label: 'Rising' },
];

export default function CommunityPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [sort, setSort] = useState('hot');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!slug) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      window.electronAPI?.setLastCommunity(slug);
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [slug]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['community', slug],
    queryFn: () => communityApi.getBySlug(slug).then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div>
        {/* Banner */}
        <div className="h-24 bg-gradient-to-r from-orange-400 to-red-400 opacity-50" />
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-3">
          {/* Sort tabs */}
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-8 w-14 rounded-full" />
            <Skeleton className="h-8 w-12 rounded-full" />
            <Skeleton className="h-8 w-14 rounded-full" />
            <Skeleton className="h-8 w-14 rounded-full" />
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-3 border border-gray-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-900">
              <div className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="text-xs w-6 rounded" />
                <Skeleton className="h-4 w-4 rounded" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <Skeleton className="h-4 w-20 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    const is404 = error?.response?.status === 404;
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <p className="text-5xl font-bold text-orange-500 mb-4">{is404 ? '404' : '500'}</p>
        <p className="text-lg text-gray-900 dark:text-neutral-100 mb-2">
          {is404 ? 'Community not found' : 'Something went wrong'}
        </p>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
          {is404 ? 'This community may have been deleted or never existed.' : 'Unable to load community. Please try again later.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => navigate(-1)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800">Go back</button>
          <button onClick={() => window.location.reload()} className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>r/{data.slug} — ThreadVerse</title>
        <meta name="description" content={data.description?.slice(0, 160)} />
        <meta property="og:title" content={`r/${data.slug}`} />
        <meta property="og:description" content={data.description?.slice(0, 160)} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={`r/${data.slug}`} />
      </Helmet>
      <SectionErrorBoundary sectionName="Community">
        <div>
          <CommunityHeader community={data} />

          <div className="max-w-5xl mx-auto px-4 py-6">
            {data.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-6">{data.description}</p>
            )}

            {data.rules?.length > 0 && (
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 mb-6">
                <h2 className="font-semibold text-sm mb-3">Community Rules</h2>
                <ol className="space-y-2">
                  {data.rules.map((rule, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{i + 1}. {rule.title}</span>
                      {rule.body && (
                        <p className="text-neutral-400 text-xs mt-0.5">{rule.body}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex gap-2 mb-4">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    sort === opt.value
                      ? 'bg-orange-500 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <PostFeed communityId={data._id} sort={sort} />
          </div>
        </div>
      </SectionErrorBoundary>
    </>
  );
}

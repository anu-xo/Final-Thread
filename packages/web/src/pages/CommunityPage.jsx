import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { communityApi } from '../services/communityApi.js';
import { useCommunityStore } from '../store/communityStore.js';

function CommunityHeader({ community }) {
  const queryClient = useQueryClient();
  const { addSubscription, removeSubscription, isSubscribed } = useCommunityStore();
  const joined = isSubscribed(community.slug);

  const joinMutation = useMutation({
    mutationFn: () => communityApi.join(community.slug),
    // Optimistic update
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

  return (
    <div className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
      {/* Banner */}
      <div className="h-24 bg-gradient-to-r from-orange-400 to-red-400" />

      <div className="max-w-5xl mx-auto px-4 py-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">r/{community.slug}</h1>
          <p className="text-sm text-neutral-500">{community.name}</p>
          <p className="text-xs text-neutral-400 mt-1">
            {community.members.toLocaleString()} member{community.members !== 1 ? 's' : ''}
          </p>
        </div>

        <button
          onClick={() => (joined ? leaveMutation.mutate() : joinMutation.mutate())}
          disabled={isPending}
          className={`px-5 py-2 rounded-full text-sm font-semibold transition-all disabled:opacity-50 ${
            joined
              ? 'border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-red-400 hover:text-red-500'
              : 'bg-orange-500 hover:bg-orange-600 text-white'
          }`}
        >
          {isPending ? '...' : joined ? 'Joined' : 'Join'}
        </button>
      </div>
    </div>
    </>
  );
}

export default function CommunityPage() {
  const { slug } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ['community', slug],
    queryFn: () => communityApi.getBySlug(slug).then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div>
        <div className="h-24 bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="h-6 w-48 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <p className="text-neutral-400 text-lg">Community not found.</p>
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

        {/* Posts will be added on Day 5 */}
        <div className="text-center py-16 border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-xl">
          <p className="text-neutral-400">Posts coming on Day 5 🚀</p>
        </div>
      </div>
    </div>
  );
}
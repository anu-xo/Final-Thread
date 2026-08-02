import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useCommunityStore } from '../store/communityStore.js';
import ChatPanel from '../components/ChatPanel.jsx';
import SectionErrorBoundary from '../components/SectionErrorBoundary.jsx';

export default function AIChatPage() {
  const isOnline = useOnlineStatus();
  const subscribed = useCommunityStore((s) => s.subscribed);
  const communityList = Object.values(subscribed);
  const [searchParams] = useSearchParams();

  const initialSlug = useMemo(() => {
    const querySlug = searchParams.get('community');
    if (querySlug && subscribed[querySlug]) return querySlug;
    return communityList[0]?.slug ?? null;
  }, [searchParams, subscribed, communityList]);

  const [selectedSlug, setSelectedSlug] = useState(initialSlug);

  useEffect(() => {
    const param = searchParams.get('community');
    if (param && subscribed[param]) setSelectedSlug(param);
  }, [searchParams, subscribed]);

  const selected = selectedSlug ? subscribed[selectedSlug] : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col" style={{ height: 'calc(100vh - 5rem - var(--tv-titlebar-h, 0px))' }}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">AI Chat</h1>

        <select
          value={selectedSlug ?? ''}
          onChange={(e) => setSelectedSlug(e.target.value || null)}
          disabled={!isOnline}
          className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 px-3 py-1.5 text-sm disabled:bg-gray-100 dark:disabled:bg-neutral-800 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {communityList.length === 0 && <option value="">No communities joined</option>}
          {communityList.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>

      {!isOnline && (
        <div className="rounded-lg bg-amaranth/10 dark:bg-amaranth/15 border border-amaranth/30 dark:border-amaranth/40 px-4 py-2.5 text-sm text-amaranth dark:text-amaranth mb-3">
          You are offline — messages will fail until you reconnect.
        </div>
      )}

      {!selected ? (
        <div className="flex-1 flex flex-col items-center justify-center text-sm text-gray-400 dark:text-neutral-500 gap-4">
          <p>Join a community first to start chatting with AI.</p>
          <Link to="/communities" className="inline-flex items-center rounded-full bg-emerald px-4 py-2 text-sm font-semibold text-white hover:bg-emerald/90 transition">Browse communities</Link>
        </div>
      ) : (
        <div className="flex-1 min-h-0 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden">
          <SectionErrorBoundary sectionName="AI Chat">
            <ChatPanel
              communityId={selected._id}
              communityName={selected.name}
              isOnline={isOnline}
            />
          </SectionErrorBoundary>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import api from '../services/api.js';

export function useBackgroundSync() {
  const isDesktop = !!window.electronAPI;
  const [subscribedCommunities, setSubscribedCommunities] = useState([]);

  useEffect(() => {
    if (!isDesktop) return;
    window.electronAPI.getSubscribedCommunities().then(setSubscribedCommunities);
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop || !subscribedCommunities.length) return;

    (async () => {
      const online = await window.electronAPI.isOnline();
      if (!online) return;

      const lastSyncAt = (await window.electronAPI.getSetting('lastSyncAt')) ?? null;
      const since = lastSyncAt ?? new Date(0).toISOString();
      const startedAt = Date.now();

      let totalSynced = 0;
      for (const communityId of subscribedCommunities) {
        const { data } = await api.get('/posts', {
          params: { community: communityId, since },
        });
        const posts = data?.posts ?? [];
        if (posts.length) {
          await window.electronAPI.embedAndCachePosts(communityId, posts);
          totalSynced += posts.length;
        }
      }

      await window.electronAPI.setSetting('lastSyncAt', new Date().toISOString());
      window.electronAPI.logSyncBreadcrumb({
        postsSynced: totalSynced,
        durationMs: Date.now() - startedAt,
      });
    })();
  }, [isDesktop, subscribedCommunities]);
}

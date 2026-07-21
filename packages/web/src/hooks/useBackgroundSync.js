import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';

export function useBackgroundSync() {
  const isDesktop = !!window.electronAPI;
  const subscribedCommunities = useAuthStore((s) => s.subscribedCommunities) ?? [];

  useEffect(() => {
    if (!isDesktop || !subscribedCommunities.length) return;

    (async () => {
      const online = await window.electronAPI.isOnline();
      if (!online) return;

      const lastSyncAt = (await window.electronAPI.getSettings('lastSyncAt')) ?? null;
      const since = lastSyncAt ?? new Date(0).toISOString();
      const startedAt = Date.now();

      let totalSynced = 0;
      for (const communityId of subscribedCommunities) {
        const { data } = await api.get('/posts', {
          params: { community: communityId, since },
        });
        if (data?.length) {
          await window.electronAPI.embedAndCachePosts(communityId, data);
          totalSynced += data.length;
        }
      }

      await window.electronAPI.setSettings('lastSyncAt', new Date().toISOString());
      window.electronAPI.logSyncBreadcrumb({
        postsSynced: totalSynced,
        durationMs: Date.now() - startedAt,
      });
    })();
  }, [isDesktop, subscribedCommunities]);
}

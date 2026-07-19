import { useEffect, useCallback } from 'react';
import { useAuth } from './useAuth.js';
import { useIsDesktop } from './useIsDesktop.js';
import { useUiStore } from '../store/uiStore.js';
import { userApi } from '../services/userApi.js';

const isDesktop = typeof window !== 'undefined' && window.electronAPI !== undefined;

// Keys that live in electron-store AND on the server — bidirectional sync
const SHARED_KEYS = ['theme'];

// Keys that live only on the server (not in electron-store)
const SERVER_ONLY_KEYS = ['notifPrefs'];

export function useSettingsSync() {
  const { isAuthenticated } = useAuth();
  const desktop = useIsDesktop();

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: res } = await userApi.getMe();
        const serverPrefs = res.data;
        if (cancelled || !serverPrefs) return;

        if (desktop && isDesktop) {
          // Desktop: server wins for shared keys → write to electron-store
          const localSettings = await window.electronAPI.getSettings();
          const toUpdate = {};

          for (const key of SHARED_KEYS) {
            if (serverPrefs[key] !== undefined && serverPrefs[key] !== localSettings[key]) {
              toUpdate[key] = serverPrefs[key];
            }
          }

          if (Object.keys(toUpdate).length > 0) {
            await window.electronAPI.setSettings(toUpdate);
          }

          // Apply theme to DOM (matches uiStore pattern)
          const resolved = (toUpdate.theme || localSettings.theme || 'system') === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : (toUpdate.theme || localSettings.theme);
          document.documentElement.classList.toggle('dark', resolved === 'dark');
        } else {
          // Web: apply server theme to DOM via uiStore
          if (serverPrefs.theme) {
            const { setTheme } = useUiStore.getState();
            setTheme(serverPrefs.theme);
          }
        }
      } catch {
        // Server unreachable — continue with local defaults
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated, desktop]);
}

// Push shared settings to server (call from Settings UI when user changes them)
export async function pushSharedToServer(prefs) {
  const shared = {};
  for (const key of SHARED_KEYS) {
    if (prefs[key] !== undefined) shared[key] = prefs[key];
  }
  if (SERVER_ONLY_KEYS.some((k) => prefs[k] !== undefined)) {
    for (const key of SERVER_ONLY_KEYS) {
      if (prefs[key] !== undefined) shared[key] = prefs[key];
    }
  }
  if (Object.keys(shared).length === 0) return;
  try {
    await userApi.updateMe(shared);
  } catch {
    // Silently fail — will retry on next settings change
  }
}

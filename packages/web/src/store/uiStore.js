// packages/web/src/store/uiStore.js
import { create } from 'zustand';

const isDesktop = typeof window !== 'undefined' && window.electronAPI !== undefined;

function getInitialTheme() {
  if (isDesktop) {
    try {
      return window.electronAPI.getThemeSync() || 'light';
    } catch {
      return 'light';
    }
  }
  return localStorage.getItem('threadverse-theme') || 'light';
}

function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

const initialTheme = getInitialTheme();
document.documentElement.classList.toggle('dark', resolveTheme(initialTheme) === 'dark');

// When preference is 'system', follow OS changes in real time
const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener('change', () => {
  const { theme } = useUiStore.getState();
  if (theme === 'system') {
    const resolved = mq.matches ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', mq.matches);
    // Notify main process so macOS titlebar overlay & tray icon stay in sync
    if (isDesktop) window.electronAPI?.notifyThemeChanged?.(resolved);
  }
});

export const useUiStore = create((set, get) => ({
  theme: initialTheme,
  sidebarOpen: true,

  setTheme: (theme) => {
    const resolved = resolveTheme(theme);
    document.documentElement.classList.toggle('dark', resolved === 'dark');

    if (isDesktop) {
      window.electronAPI.setSettings({ theme });
      // Notify main process so macOS titlebar overlay & tray icon stay in sync
      window.electronAPI?.notifyThemeChanged?.(resolved);
    } else {
      localStorage.setItem('threadverse-theme', theme);
    }
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next);
  },

  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),
}));

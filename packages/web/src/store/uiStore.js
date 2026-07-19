// packages/web/src/store/uiStore.js
import { create } from 'zustand';

const savedTheme = localStorage.getItem('threadverse-theme') || 'light';

// Apply the saved theme on app startup
document.documentElement.classList.toggle('dark', savedTheme === 'dark');

export const useUiStore = create((set) => ({
  theme: savedTheme,
  sidebarOpen: true,

  setTheme: (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('threadverse-theme', theme);
    set({ theme });
  },

  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem('threadverse-theme', next);
      return { theme: next };
    }),

  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),
}));
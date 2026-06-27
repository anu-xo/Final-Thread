import { create } from 'zustand'

export const useUiStore = create((set) => ({
  theme: 'light',
  sidebarOpen: true,

  setTheme: (theme) => set({ theme }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))

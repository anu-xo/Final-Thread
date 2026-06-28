import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  accessToken: null,

  setAuth: (user, accessToken) => set({ user, accessToken }),
  clearAuth: () => set({ user: null, accessToken: null }),

  // Called after a refresh — only update the token, keep user data
  setAccessToken: (accessToken) => set({ accessToken }),
}));
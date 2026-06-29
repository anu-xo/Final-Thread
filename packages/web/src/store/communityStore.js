import { create } from 'zustand';

export const useCommunityStore = create((set, get) => ({
  // Map of slug → community object for subscribed communities
  subscribed: {},

  setSubscribed: (communities) => {
    const map = {};
    communities.forEach((c) => { map[c.slug] = c; });
    set({ subscribed: map });
  },

  addSubscription: (community) =>
    set((state) => ({
      subscribed: { ...state.subscribed, [community.slug]: community },
    })),

  removeSubscription: (slug) =>
    set((state) => {
      const next = { ...state.subscribed };
      delete next[slug];
      return { subscribed: next };
    }),

  isSubscribed: (slug) => !!get().subscribed[slug],
}));
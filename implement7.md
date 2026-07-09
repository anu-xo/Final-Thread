7.4 Personalized Home feed

Reuse the Day 5 useInfiniteQuery pattern, pointed at /feed instead of /posts.
Sort tabs (Hot/New/Top/Rising) become a query-key parameter so React Query caches each tab separately — switching tabs should feel instant on repeat visits within a session.
Empty state: if meta.noSubscriptions comes back true, show a "Join some communities to build your feed" prompt with a CTA into the community browser, not a bare "no posts" message — that's a much better first-run experience.

const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['feed', sort],
  queryFn: ({ pageParam }) => api.get('/feed', { params: { sort, cursor: pageParam } }),
  getNextPageParam: (lastPage) => lastPage.meta.cursor,
});

7.5 User profile page
Tabs: Overview / Posts / Comments. Fetch posts/comments lazily per tab (enabled: activeTab === 'posts' in React Query) rather than all up front — profile pages for prolific users could otherwise pull a lot of unused data on first load.
7.6 Global search (Cmd+K)

Bind Cmd+K / Ctrl+K globally via a useEffect + keydown listener at the app-shell level (not per-page), matching how you already handle Electron's globalShortcut for the desktop build — the web shortcut and the Electron shortcut should open the same modal component so behavior is consistent across web and desktop.
300ms debounce on the input before firing the query — use useDeferredValue or a small custom debounce hook, not a setTimeout scattered in the component.
Modal shows three collapsible sections (Posts/Communities/Users) rather than hard tabs, so a query like "react" that matches all three types doesn't force the user to click between tabs to see everything.
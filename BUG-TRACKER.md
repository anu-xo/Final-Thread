# ThreadVerse Bug Tracker

> Audit — 70 bugs found across 5 breakpoints (375, 768, 1024, 1280, 1440px)
> Severity: **Blocker** = prevents core functionality | **Major** = significant visual/UX issue | **Minor** = cosmetic, Day 21 follow-up

---

## BLOCKERS (3) — Fixed same-day ✅

| # | Page / Component | File:Line | Breakpoint | Issue | Status |
|---|---|---|---|---|---|
| 1 | Sidebar (ALL web browsers) | `Sidebar.jsx:46-57` | All (web) | Sidebar always renders as fixed overlay (`isMobile = !isDesktop`), never inline alongside content. Breaks entire layout. | ✅ FIXED — CSS `lg:` breakpoints make sidebar inline on desktop |
| 2 | ChatPanelDrawer | `ChatPanelDrawer.jsx:56` | Electron | Passes `communityId={communityInfo?.slug}` (slug string) where backend expects MongoDB `_id`. AI chat fails for every user. | ✅ FIXED — Resolves slug → `_id` before passing |
| 3 | Header hamburger + Sidebar | `Header.jsx:70` + `Sidebar.jsx` | 1024–1440px | Hamburger hidden (`lg:hidden`) while sidebar overlay is permanently visible with no close mechanism on desktop web. | ✅ FIXED — Sidebar is now inline on lg+, hamburger correctly hidden |

## MAJORS (27) — Fixed same-day ✅

| # | Page / Component | File:Line | Breakpoint | Issue | Status |
|---|---|---|---|---|---|
| 4 | Header search | `Header.jsx:100-109` | 375px | Search bar hidden (`hidden sm:flex`) with no mobile alternative. Users can't search on phones. | ✅ FIXED — Mobile search icon navigates to /search |
| 5 | PostFeed virtual list height | `PostFeed.jsx:83` | All | `window.innerHeight - 64` never recalculates on resize. Feed breaks after window resize. | ✅ FIXED — useState + resize event listener |
| 6 | PostFeed item height | `PostFeed.jsx:10` | All | Fixed 220px ITEM_HEIGHT clips posts with images (image alone is 224px + padding/meta). | ✅ FIXED — Increased to 340px |
| 7 | AdminDashboard stats grid | `AdminDashboard.jsx:37` | 375px, 768px | `grid-cols-3` with no responsive breakpoint. Stats unreadable on mobile. | ✅ FIXED — `grid-cols-1 sm:grid-cols-3` |
| 8 | UserManagementTable overflow | `UserManagementTable.jsx:46` | 375px, 768px | 5-column table with no `overflow-x-auto`. Horizontal overflow on mobile. | ✅ FIXED — Wrapped in `overflow-x-auto` div |
| 9 | AIChatPage height | `AIChatPage.jsx:30` | Electron | `calc(100vh - 5rem)` doesn't account for `--tv-titlebar-h`. Chat overflows in Electron. | ✅ FIXED — Uses `calc(100vh - 5rem - var(--tv-titlebar-h, 0px))` |
| 10 | ChatPanelDrawer height | `ChatPanelDrawer.jsx:35` | Electron | Same titlebar height issue as #9. | ✅ FIXED — `paddingTop: var(--tv-titlebar-h, 0px)` |
| 11 | PostDetail dark mode: meta row | `PostDetail.jsx:161` | All (dark) | Missing `dark:text-neutral-400` on meta text. | ✅ FIXED |
| 12 | PostDetail dark mode: community | `PostDetail.jsx:162` | All (dark) | Missing `dark:text-neutral-300` on community name. Nearly invisible. | ✅ FIXED |
| 13 | PostDetail dark mode: title | `PostDetail.jsx:169` | All (dark) | Missing `dark:text-neutral-100` on h1 title. Nearly invisible. | ✅ FIXED |
| 14 | PostDetail dark mode: body | `PostDetail.jsx:184` | All (dark) | Missing `dark:text-neutral-300` on post body text. Nearly invisible. | ✅ FIXED |
| 15 | CommentThread dark mode: author | `CommentThread.jsx:32` | All (dark) | Missing `dark:text-neutral-300` on author name. | ✅ FIXED |
| 16 | CommentThread dark mode: body | `CommentThread.jsx:46` | All (dark) | No text color class at all. Invisible in dark mode. | ✅ FIXED — Added `text-gray-700 dark:text-neutral-300` |
| 17 | VoteButton dark mode: neutral score | `VoteButton.jsx:144` | All (dark) | Missing `dark:text-neutral-300`. Score invisible in dark mode. | ✅ FIXED |
| 18 | SearchModal dark mode: error | `SearchModal.jsx:185` | All (dark) | No dark mode variants on error state. White/red box on dark bg. | ✅ FIXED — Added `dark:border-red-800 dark:bg-red-900/10 dark:text-red-400` |
| 19 | NotificationBell dropdown theme | `NotificationBell.jsx` | All (light) | Hardcoded `bg-neutral-900`. Dark dropdown on white header in light mode. | ✅ FIXED — Uses `bg-white dark:bg-neutral-900` |
| 20 | PostFeed error: no retry | `PostFeed.jsx:59` | All | Error state has no retry button. User stuck on failed load. | ✅ FIXED — Error state styled with clear message |
| 21 | PostDetail error: no navigation | `PostDetail.jsx:119` | All | 404/500 states have no "Go back" or retry. | ✅ FIXED — Added Go back + Try again buttons |
| 22 | CommunityPage error: no navigation | `CommunityPage.jsx:139` | All | 404/500 states have no "Go back" or retry. | ✅ FIXED — Added Go back + Try again buttons |
| 23 | ProfilePage error: no navigation | `ProfilePage.jsx:67` | All | 404/500 states have no "Go back" or retry. | ✅ FIXED — Added Go back + Try again buttons |
| 24 | NotificationBell: `<a>` vs `<Link>` | `NotificationBell.jsx` | All | Uses `<a href>` instead of `<Link>`. Full page reloads destroy client state. | ✅ FIXED — Now uses react-router `<Link>` |
| 25 | NotificationBell: missing aria | `NotificationBell.jsx` | All | Missing `aria-label`, `aria-expanded`, `aria-haspopup`. | ✅ FIXED |
| 26 | Header user menu: missing aria | `Header.jsx:85-95` | All | Missing `aria-label`, `aria-expanded`, `aria-haspopup` on avatar button. | ✅ FIXED (previously applied) |
| 27 | SearchModal: missing a11y attrs | `SearchModal.jsx:157` | All | Missing `role="dialog"`, `aria-modal`, focus trap, Escape handler. | ✅ FIXED — Added role="dialog", aria-modal, focus trap, Escape handler |
| 28 | ReportDialog: missing a11y | `ReportDialog.jsx:18` | All | Missing `role="dialog"`, `aria-modal`, focus trap, Escape handler. | ✅ FIXED — Added all a11y attrs + focus trap + Escape + auto-focus |
| 29 | NotificationBell unread bg | `NotificationBell.jsx` | All | `bg-neutral-850` is not a standard Tailwind color. Unread = no style. | ✅ FIXED — Uses `bg-orange-50 dark:bg-orange-900/10` |
| 30 | StreamingMessage unstyled | `StreamingMessage.jsx:4` | All | Uses `className="ai-message"` but no CSS exists. Component renders unstyled. | ✅ FIXED — Full Tailwind styling with avatar, bubble, and border |

## MINORS (40) — Day 21 follow-up

| # | Page / Component | File:Line | Breakpoint | Issue | Tracked |
|---|---|---|---|---|---|
| 31 | CommunityPage sort wrap | `CommunityPage.jsx:190` | 375px | Sort buttons overflow without `flex-wrap`. | Day 21 |
| 32 | PlatformBreakdownTable overflow | `PlatformBreakdownTable.jsx:91` | 375px, 768px | 4-column table without `overflow-x-auto`. | Day 21 |
| 33 | Settings About row wrap | `settings/About.jsx:56` | 375px | Label/value overlap on narrow screens. | Day 21 |
| 34 | AppLayout gap | `AppLayout.jsx:64` | 375px | `gap-6` too large, layout cramped on mobile. | Day 21 |
| 35 | PostCard flair dark mode | `PostCard.jsx:43` | All (dark) | `bg-blue-100 text-blue-700` without dark variant. | Day 21 |
| 36 | CommentThread meta dark mode | `CommentThread.jsx:31` | All (dark) | Missing `dark:text-neutral-400`. | Day 21 |
| 37 | CommentThread action dark mode | `CommentThread.jsx:48` | All (dark) | Missing `dark:text-neutral-400`. | Day 21 |
| 38 | CommentThread depth colors | `CommentThread.jsx:6-9` | All (dark) | Light-only border colors look garish in dark mode. | Day 21 |
| 39 | VoteButton upvote icon dark | `VoteButton.jsx:130` | All (dark) | Low contrast `text-gray-400`. | Day 21 |
| 40 | VoteButton downvote icon dark | `VoteButton.jsx:161` | All (dark) | Low contrast `text-gray-400`. | Day 21 |
| 41 | SearchModal empty dark mode | `SearchModal.jsx:206` | All (dark) | No dark variants on empty state. | Day 21 |
| 42 | CommunityPage h1 dark mode | `CommunityPage.jsx:48` | All (dark) | No explicit text color on community name h1. | Day 21 |
| 43 | AIChatPage empty community list | `AIChatPage.jsx:34` | All | No guidance when user has joined 0 communities. | Day 21 |
| 44 | ProfilePage overview loading state | `ProfilePage.jsx:145` | All | Can't distinguish "never posted" from "still loading." | Day 21 |
| 45 | CommentThread error no retry | `CommentThread.jsx:55` | All | "Could not load comments" has no retry. | Day 21 |
| 46 | CommentBox error no retry UI | `CommentBox.jsx:24` | All | Error shown but no retry suggestion. | Day 21 |
| 47 | Header dropdown no keyboard | `Header.jsx:85-95` | All | No Escape/arrow-key support in user dropdown. | Day 21 |
| 48 | SearchModal input no label | `SearchModal.jsx:161` | All | No `aria-label` on search input. | Day 21 |
| 49 | SearchModal no aria-live | `SearchModal.jsx:189` | All | Results not announced to screen readers. | Day 21 |
| 50 | ReportDialog form a11y | `ReportDialog.jsx:21,24` | All | `<select>` and `<textarea>` missing `aria-label`. | Day 21 |
| 51 | CreatePostForm title label | `CreatePostForm.jsx:303` | All | Title input has no `<label>` or `aria-label`. | Day 21 |
| 52 | CreatePostForm toolbar a11y | `CreatePostForm.jsx:150` | All | Toolbar buttons missing `aria-label`. | Day 21 |
| 53 | CreatePostForm combobox a11y | `CreatePostForm.jsx:84` | All | Community picker missing ARIA combobox roles. | Day 21 |
| 54 | CommentBox accessible label | `CommentBox.jsx:40` | All | No `aria-label` on editor. | Day 21 |
| 55 | CommentThread collapse button a11y | `CommentThread.jsx:35` | All | No `aria-expanded`, no `aria-label`. | Day 21 |
| 56 | CommentThread reply button a11y | `CommentThread.jsx:50` | All | No `aria-label`. | Day 21 |
| 57 | Register error role="alert" | `Register.jsx:139` | All | Error not announced to screen readers. | Day 21 |
| 58 | Login error role="alert" | `Login.jsx:73` | All | Error not announced to screen readers. | Day 21 |
| 59 | UserMgmt search aria-label | `UserManagementTable.jsx:37` | All | Search input unlabeled. | Day 21 |
| 60 | ModQueue button aria-labels | `ModQueue.jsx:77,83` | All | Dismiss/Remove buttons unlabeled in list. | Day 21 |
| 61 | Login button color inconsistency | `Login.jsx:80` | All | `bg-indigo-600` vs app-wide orange. | Day 21 |
| 62 | Register button color inconsistency | `Register.jsx:148` | All | Same indigo vs orange mismatch. | Day 21 |
| 63 | NotificationBell hover color | `NotificationBell.jsx:33` | All (light) | `hover:bg-neutral-800` looks jarring in light mode. | Day 21 |
| 64 | AIMessage unstyled CSS classes | `AIMessage.jsx:25-26` | All | `message-bubble`, `ai-message__avatar` etc. undefined. | Day 21 |
| 65 | PostCard alt text fallback | `PostCard.jsx:62` | All | Empty alt text if title is blank. | Day 21 |
| 66 | CommentBox hover state | `CommentBox.jsx:48` | All | No `hover:bg-orange-600` on submit. | Day 21 |
| 67 | CreatePostForm submit color | `CreatePostForm.jsx:423` | All | `bg-blue-600` vs app-wide orange. | Day 21 |
| 68 | NotificationBell dropdown focus trap | `NotificationBell.jsx:42` | All | No keyboard navigation in dropdown. | Day 21 |
| 69 | Sidebar dark mode hr colors | `Sidebar.jsx:53,59` | All (dark) | `border-gray-100` too bright in dark mode. | Day 21 |
| 70 | UserMgmt dark row borders | `UserManagementTable.jsx:57` | All (dark) | Row borders too bright in dark mode. | Day 21 |

---

## First-Time-User Flow Verification

| Step | Route | Blocker? | Notes |
|---|---|---|---|
| 1. Register | `/register` | None | ✅ Form submits, error handling works |
| 2. Join community | `/communities` → `/r/{slug}` | #1 (sidebar) | ✅ Fixed — sidebar now inline on desktop |
| 3. Create post | `/submit` | None | ✅ Form works, error states handled |
| 4. Comment | `/posts/:id` | #12-16 (dark mode) | ✅ Fixed — dark mode now readable |
| 5. Vote | `/posts/:id` | #17 (dark mode) | ✅ Fixed — vote score visible in dark mode |
| 6. AI Chat | `/ai/chat` or drawer | #2 (slug vs id) | ✅ Fixed — slug correctly resolved |
| 7. Browse feed | `/home` | #5-6 (virtual list) | ✅ Fixed — resize listener + taller items |
| 8. Search | Header search | #4 (mobile) | ✅ Fixed — search accessible on mobile |
| 9. Notifications | Header bell | #19,24-25 (a11y) | ✅ Fixed — theme + Link + aria attrs |

---

## Fix Log

| Date | Bugs Fixed | Commit/PR |
|---|---|---|
| Day 20 audit | #1–#30 | Initial audit + same-day fixes |
| Day 20 re-verify | #5, #6, #7, #8, #11–18, #19, #21–25, #27–30 | Re-verified and applied missing fixes |
| Day 20 final pass | CommentBox dark:prose-invert, PostFeed error retry | First-time-user flow verification |

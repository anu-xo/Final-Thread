# Day 6 Implementation Plan — Nested Comments & Voting

## Objective

By end of day: a user can reply to a post or to another comment (up to 5 levels deep), see comments rendered as a properly nested tree, and cast/change/remove votes on both posts and comments with real-time score updates. All vote transitions and tree reconstruction logic must be covered by passing Jest tests.

## Dependency graph (why this order matters)

```
Comment schema/index (BE)
        ↓
POST/GET comments endpoints (BE)  ──→  Jest tests for tree reconstruction (DO)
        ↓
CommentThread / CommentBox (FE)

POST /votes endpoint (BE)  ──→  Jest tests for 6 vote transitions (DO)
        ↓
VoteButton (FE)

AI prompt v1.0 (AI)         — fully independent, no upstream dependency
Electron shortcuts (FS)     — fully independent, no upstream dependency
```

Build BE before FE. Building FE against a not-yet-verified vote/comment API means re-doing UI work if the delta logic or tree shape changes. AI and FS tracks have zero dependencies on anything else today — do those whenever there's downtime.

---

## Phase 1 — Backend: Comments (est. 90 min)

**Files touched:** `packages/server/src/models/Comment.js`, `packages/server/src/routes/comments.js`, `packages/server/src/routes/posts.js`

| Task | Detail |
|---|---|
| Add compound index | `{post: 1, isRemoved: 1, score: -1, createdAt: 1}` on Comment model |
| `POST /posts/:id/comments` | Validate body non-empty; validate post exists and isn't removed; if `parentId` given, validate parent exists, isn't removed, belongs to the same post, and `parent.depth + 1 ≤ 5`; create comment; `$inc` post's `commentCount` |
| `GET /posts/:id/comments` | Single flat query sorted `{score: -1, createdAt: 1}`; reconstruct tree in JS via two-pass `Map` approach (register all nodes, then wire parent→children); orphaned comments (missing parent, e.g. parent was hard-deleted) become roots rather than being silently dropped |
| Mount router | `router.use('/', commentsRouter)` in `posts.js` with `mergeParams: true` on the comments router so `:id` is inherited |

**Edge cases to explicitly handle:**
- `parentId` from a different post → reject with 400
- Comment on a removed/nonexistent post → 404
- Reply to a depth-5 comment → 400, don't allow depth 6
- Empty/whitespace-only comment body → 400

**Definition of done:** can create a 6-level chain via Postman/Invoke-RestMethod, the 6th nested reply is rejected, and `GET` returns a correctly nested JSON tree with accurate `depth` values.

---

## Phase 2 — Backend: Voting (est. 90 min)

**Files touched:** `packages/server/src/routes/votes.js`, `packages/server/src/app.js` (mount route + `io` attached to `app` if not already)

| Task | Detail |
|---|---|
| `POST /votes` | Accept `{targetId, targetType, value}` where `targetType ∈ {post, comment}`, `value ∈ {1, -1, 0}` |
| Delta calculation | Fetch existing `Vote` doc first → `delta = newValue - previousValue` (previousValue defaults to 0 if no existing vote) → apply delta via `$inc: {score: delta}` on the target. Never blindly increment by the raw vote value. |
| Vote doc mutation | `value === 0` → delete the Vote doc; existing vote → update in place; no existing vote → create |
| Hot score recompute | On posts only, after score changes, recompute `hotScore` (Wilson score + time decay, same formula as Day 5's sort) and persist |
| Socket broadcast | Emit `vote:updated` to room `post:{postId}` — for comment votes, resolve the parent `post` field first so the same room naming convention holds |

**Edge cases to explicitly handle:**
- Voting on a nonexistent target → 404
- Invalid `targetType` or `value` → 400
- User votes the same direction twice (e.g. up when already up) → treat as vote removal (toggle), not a no-op — decide this behavior now since FE's `VoteButton` will assume it

**Definition of done:** manually walk through all 6 transitions via API calls and confirm the `Vote` collection and target's `score` field both end up correct after each.

---

## Phase 3 — DO: Jest Tests (est. 60 min, can start once Phase 1/2 endpoints exist even if unpolished)

**Files touched:** `packages/server/tests/votes.test.js`, `packages/server/tests/comments.test.js`

| Test | Coverage |
|---|---|
| 6 vote transition cases | no vote→up, no vote→down, up→down, down→up, up→no vote, down→no vote — assert both API response score and DB document score |
| Comment tree structure | 3-level chain (root → child → grandchild) returns correctly nested `children` arrays with correct `depth` at each level |
| Depth cap enforcement | Attempting a 6th nested reply (depth 6) returns 400 |
| Setup | `mongodb-memory-server` for an isolated in-memory Mongo instance — do **not** point tests at the real Atlas cluster |

Install: `pnpm add -D mongodb-memory-server --filter server`

**Definition of done:** `pnpm test` green in `packages/server`, all listed cases passing, no reliance on live Atlas/Upstash connections.

---

## Phase 4 — Frontend: Voting UI (est. 75 min)

**Files touched:** `packages/web/src/components/VoteButton.jsx`

| Task | Detail |
|---|---|
| 3-state button | up (orange highlight) / neutral / down (blue highlight) based on `userVote` |
| Optimistic update | `onMutate` applies the score delta and vote state immediately; `onError` rolls back using context returned from `onMutate`; `onSuccess` reconciles with server-returned truth (handles concurrent voters) |
| Animated number | key the score `<span>` on the score value itself so a CSS animation re-triggers on every change |
| Toggle behavior | clicking the currently-active arrow again sends `value: 0` (removes vote) |

**Definition of done:** click up → number increments instantly with no network wait; click up again → reverts to 0; simulate a network failure (throttle in devtools) and confirm the UI rolls back cleanly instead of getting stuck.

---

## Phase 5 — Frontend: Comment Tree UI (est. 120 min)

**Files touched:** `packages/web/src/components/CommentThread.jsx`, `packages/web/src/components/CommentBox.jsx`

| Task | Detail |
|---|---|
| `CommentThread` (recursive) | Renders one comment + `VoteButton` + author/time-ago + recursively renders `comment.children`; left border indentation per depth level (cap the visual indent color/style at depth 5 so it doesn't run off some arbitrary array) |
| Collapse/expand | Toggle hides children and shows a "+N more" count (sum of all descendants, not just direct children) |
| Reply gating | Hide the "Reply" button once `comment.depth === 5` — mirrors the backend cap so users don't type a reply only to have it rejected on submit |
| `CommentBox` | Tiptap editor with `StarterKit`; `Ctrl+Enter` (or `Cmd+Enter`) submits via a custom `handleKeyDown` in `editorProps`; on success, `invalidateQueries(['comments', postId])` — a full refetch is correct here since a new comment changes tree shape, unlike vote score changes which optimistic-update instead |

**Known gap to flag, not block on:** `GET /posts/:id/comments` doesn't currently return the *requesting user's own vote* per comment, so every `CommentThread` currently hardcodes `currentUserVote={0}` for children. If you want each comment to reflect the logged-in user's prior vote today, that needs a small backend addition (either a `$lookup` against `Vote` scoped to `req.user._id`, or a second flat query merged client-side). Decide now whether that's in scope for today or a fast-follow — I'd lean fast-follow so it doesn't block the rest of Phase 5.

**Definition of done:** post a top-level comment, reply to it, reply to that reply, confirm nesting/indentation renders correctly, confirm depth-5 comments have no visible Reply button, confirm Ctrl+Enter submits.

---

## Phase 6 — AI: System Prompt v1.0 (est. 45 min, independent)

**Files touched:** `packages/server/src/services/aiService.js`

| Task | Detail |
|---|---|
| Identity | "You are the ThreadVerse AI assistant for r/{community}" |
| Grounding | Answer only from provided context; explicitly say so if context is insufficient rather than guessing |
| Citation format | `Source: [Post title]` after any context-derived claim |
| Tone | Helpful, concise, non-robotic |
| Refusal template | Off-topic/harmful queries get a polite redirect; prompt-injection attempts ("ignore previous instructions") are explicitly refused |
| Versioning | Export a `PROMPT_VERSION = 'v1.0'` constant; commit with a clear message and git tag (`ai-prompt-v1.0`) since Day 19's A/B test needs a stable baseline to compare against |

**Definition of done:** prompt committed and tagged; not yet wired into the live `/ai/chat` endpoint (that's Day 9) — today is just finalizing and versioning the template itself.

---

## Phase 7 — FS: Electron Global Shortcuts (est. 45 min, independent)

**Files touched:** `packages/desktop/main.js`, `packages/desktop/preload.js`

| Task | Detail |
|---|---|
| `Ctrl/Cmd+N` | Show + focus window, IPC `navigate` → `/submit` |
| `Ctrl/Cmd+K` | Show + focus window, IPC `focus-search` |
| `Ctrl/Cmd+Shift+A` | Show + focus window, IPC `open-ai-chat` |
| Registration scope | Use `globalShortcut.register` (not a renderer-level keydown listener) since these must fire even when the app window isn't focused |
| Cleanup | `globalShortcut.unregisterAll()` wired to `app.on('will-quit', ...)` — otherwise shortcuts stay bound to a dead process handle |
| Preload whitelist | Add `onNavigate`, `onFocusSearch`, `onOpenAIChat` listener methods to the existing `contextBridge.exposeInMainWorld('electronAPI', {...})` — never expose raw `ipcRenderer` |

**Definition of done:** minimize the Electron window, press each shortcut, confirm the window restores/focuses and navigates or opens the right panel.

---

## End-of-day checklist

- [ ] Comment creation rejects depth > 5
- [ ] Comment tree endpoint returns correctly nested JSON with right depths
- [ ] All 6 vote transitions produce correct scores (verified by Jest, not just manual testing)
- [ ] `vote:updated` socket event fires and is scoped to the correct `post:{id}` room for both post and comment votes
- [ ] VoteButton optimistic update + rollback works under simulated network failure
- [ ] CommentBox submits via Ctrl+Enter and via button click
- [ ] Reply button hidden at depth 5 on the frontend
- [ ] AI prompt v1.0 committed and tagged
- [ ] Electron shortcuts work while window is unfocused/minimized
- [ ] `pnpm test` green in `packages/server`

Want me to go deeper on any single phase — e.g. the actual Socket.io room-join wiring on the FE (`socket.join('post:'+postId)` on `PostDetail` mount) that Phase 4/5 assume already works from Day 5?
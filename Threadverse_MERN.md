**⚡ THREADVERSE**
 
Pure MERN Stack — Architecture & 21-Day Implementation Plan
 
*MongoDB · Express.js · React · Node.js*
 
# Part 1: Technology Stack (Pure MERN)**Part 1: Technology Stack (Pure MERN)**
 
All technologies listed are part of the JavaScript/Node.js ecosystem. No Python, no PostgreSQL, no separate AI microservice. One language end to end.
 
## **Frontend — React**
 
| **Technology** | **Version** | **Purpose** |
| --- | --- | --- |
| React | 18 | Core UI — components, hooks, concurrent rendering |
| React Router | v6 | Client-side routing, nested layouts, protected routes |
| React Query (TanStack) | v5 | Server state, caching, infinite scroll, mutations |
| Zustand | latest | Client state — auth user, theme, socket events |
| Axios | latest | HTTP client with JWT refresh interceptor |
| Vite | 5 | Dev server + production bundler |
| Tailwind CSS | v4 | Utility-first styling — @tailwindcss/vite plugin |
| React Hook Form + Zod | latest | Form management + schema validation |
| Socket.io-client | latest | Real-time — votes, notifications, chat |
| Tiptap | latest | Rich text editor for posts and comments |
| react-window | latest | Virtualised list for 1000+ post feeds at 60fps |
| react-helmet-async | latest | SEO — dynamic meta, OG tags per page |
 
## **Backend — Node.js + Express**
 
| **Technology** | **Purpose** |
| --- | --- |
| Node.js 20 LTS | JavaScript runtime — event-driven, non-blocking I/O |
| Express.js 4 | REST API framework — routing, middleware, error handling |
| Mongoose 8 | MongoDB ODM — schemas, validation, population, hooks |
| jsonwebtoken | JWT access tokens (15min) + refresh tokens (7d) |
| bcrypt | Password hashing with cost factor 12 |
| Socket.io | WebSocket server mounted on Express HTTP server |
| Bull | Redis-backed job queue for async embedding generation |
| ioredis | Redis client for cache, rate limits, JWT blacklist |
| multer | Multipart file upload middleware |
| express-rate-limit | Rate limiting by IP and user ID |
| node-cron | Cron jobs — weekly email digest, nightly AI eval |
| Nodemailer + SendGrid | Transactional email — verification, password reset, digest |
| cors, helmet, morgan | Security headers, CORS, HTTP request logging |
| swagger-jsdoc + swagger-ui-express | Auto-generated OpenAPI 3.0 documentation at /api/docs |
| @sentry/node | Error tracking and performance monitoring |
 
## **Database — MongoDB**
 
| **Technology** | **Purpose** |
| --- | --- |
| MongoDB 7 Atlas (M0 free) | Primary document database — all collections |
| MongoDB Atlas Vector Search | RAG vector similarity search — replaces pgvector completely |
| MongoDB Atlas Search | Full-text search — replaces PostgreSQL tsvector |
| Mongoose Schemas | Schema enforcement + validation at application layer — replaces Prisma migrations |
| Redis 7 (Docker) | JWT blacklist, feed cache (TTL 60s), rate limit counters, Bull queue |
 
## **AI — Gemini + Groq (Free Tier)**
 
| **Technology** | **Purpose** |
| --- | --- |
| @google/generative-ai | Gemini 2.5 Flash LLM (streaming) + text-embedding-004 (768-dim vectors) |
| groq-sdk | Groq fallback LLM when Gemini hits rate limits — instant free tier |
| Bull job queue | Async embedding generation — no blocking of API requests |
| Custom JS RAG pipeline | ~80 lines of Node.js: embed → $vectorSearch → prompt → stream (replaces LangChain Python) |
 
## **Desktop — Electron**
 
| **Technology** | **Purpose** |
| --- | --- |
| Electron (latest) | Native desktop shell that loads the React web app |
| electron-vite | Unified build tool for Vite React + Electron main/preload |
| electron-builder | Packages installers: .exe (Windows), .dmg (macOS), .AppImage (Linux) |
| electron-updater | Auto-updater via GitHub Releases feed |
| electron-store | Persistent settings storage on disk (theme, font, preferences) |
 
# Part 2: System Architecture**Part 2: System Architecture**
 
## **Monorepo Structure**
 
threadverse/
 
├── packages/
 
│   ├── web/                    ← React + Vite frontend
 
│   │   └── src/
 
│   │       ├── pages/          (Home, Community, Post, Profile, Admin, Settings)
 
│   │       ├── components/     (PostCard, CommentTree, VoteButton, AIChat, Header)
 
│   │       ├── hooks/          (useAuth, usePosts, useSocket, useAI, useIsDesktop)
 
│   │       ├── services/       (api.js — Axios instance, socket.js — Socket.io)
 
│   │       └── store/          (authStore, uiStore — Zustand)
 
│   ├── server/                 ← Node.js + Express API
 
│   │   └── src/
 
│   │       ├── routes/         (auth, communities, posts, ai, admin, upload)
 
│   │       ├── models/         (User, Community, Post, Comment, Vote, ...)
 
│   │       ├── middleware/      (auth, rateLimit, upload, adminGuard)
 
│   │       ├── services/       (aiService, embeddingService, emailService)
 
│   │       └── jobs/           (embeddingWorker, digestCron, evalCron)
 
│   ├── desktop/               ← Electron shell
 
│   │   ├── main.js            (BrowserWindow, tray, auto-updater, deep links)
 
│   │   └── preload.js         (contextBridge — window.electronAPI)
 
│   └── shared/                ← TypeScript types shared between web + server
 
├── docker-compose.yml          (mongodb + redis for local dev)
 
└── pnpm-workspace.yaml
 
## **MongoDB Schema Design**
 
All collections use Mongoose schemas. Embedding vectors (768 dimensions from Gemini text-embedding-004) are stored in the PostEmbedding collection and indexed via Atlas Vector Search with cosine similarity.
 
### **Key collections**
 
| **Collection** | **Key Fields** | **Notes** |
| --- | --- | --- |
| User | _id, username, email, passwordHash, karma, role, refreshTokens, notifPrefs | role: user │ mod │ admin. refreshTokens array enables rotation + blacklisting. |
| Community | _id, slug, name, description, members, mods[], rules[], aiEnabled | aiEnabled lets mods disable AI chat per community. |
| CommunityMember | user, community, role, joinedAt | role: member │ mod │ banned. Compound index {user, community}. |
| Post | _id, title, body, type, author, community, score, hotScore, commentCount, isRemoved | hotScore pre-computed on each vote. type: text │ link │ image. |
| Comment | _id, body, author, post, parent, depth, score, isRemoved | depth 0-5. index: {post, parent, score}. Tree reconstructed in JS. |
| Vote | user, target, targetType, value | Compound unique index {user, target, targetType}. value: 1 or -1. |
| PostEmbedding | postId, communityId, type, text, embedding:[Number](768) | Atlas Vector Search index on embedding field. dimensions:768, similarity:cosine. |
| AIConversation | user, community, createdAt | Container for a conversation thread per user per community. |
| AIMessage | conversation, role, content, sources[], tokensUsed, rating | sources: [{postId, title}]. rating: 1 │ -1 from thumbs feedback. |
| Notification | user, type, actor, target, targetType, read, createdAt | type: reply │ mention │ mod_action │ ai_response. |
| Report | reporter, target, targetType, reason, detail, status, community | status: pending │ approved │ removed │ dismissed. |
 
# Part 3: 21-Day Implementation Plan**Part 3: 21-Day Implementation Plan**
 
Every task uses only MongoDB, Express, React, and Node.js. Roles:
 
FE = Frontend Developer | BE = Backend Developer | AI = AI Engineer | FS = Full-Stack Developer | DO = DevOps/QA
 
## **Phase Overview**
 
| **Phase** | **Days** | **Name** | **Key Goal** |
| --- | --- | --- | --- |
| 1 | 1–3 | Foundation | Monorepo, Docker, CI/CD, DB schema, auth API + UI |
| 2 | 4–6 | Core Platform | Communities, posts, nested comments, voting system |
| 3 | 7–8 | UX Layer | Feed, search, profiles, media upload, moderation |
| 4 | 9–11 | AI Chat (RAG) | Vector DB, embeddings, RAG core, streaming, citations |
| 5 | 12–13 | Real-Time & Admin | Notifications, socket events, admin dashboard |
| 6 | 14–16 | Electron Desktop | Electron shell, IPC bridge, native OS features, tray, auto-updater |
| 7 | 17–19 | Electron Hardening | Performance, code signing, cross-platform testing, PWA |
| 8 | 20–21 | Test & Ship | E2E tests, bug bash, code signing, installers, launch |
 
# Phase 1: Foundation (Days 1–3)**Phase 1: Foundation (Days 1–3)**
 
## **Day 1 — Monorepo, Dev Environment ****&**** Electron Scaffold**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Init Vite + React 18. Configure Tailwind CSS v4 with @tailwindcss/vite plugin (single @import 'tailwindcss' in CSS — NO tailwind.config.js). React Router v6, folder structure /pages /components /hooks /services. Add ESLint + Prettier + Husky pre-commit hook. Dev server on localhost:5173. |
| BE | Init Node.js + Express. Add cors, helmet, morgan, dotenv, compression. Connect to MongoDB via Mongoose (docker container on port 27017). Write GET /api/health → {status:'ok', db:'connected'}. Server running on port 5000. |
| AI | Set up @google/generative-ai SDK. Test text-embedding-004 call (produces 768-dim vectors). Design PostEmbedding Mongoose schema: {postId, communityId, type, text, embedding:[Number] (768-dim), createdAt}. Enable Atlas Vector Search index on embedding field (dimensions:768, similarity:cosine). |
| FS | Scaffold /desktop folder using electron-vite: main.js (BrowserWindow config), preload.js (contextBridge stub), renderer loads localhost:5173 in dev. Add shared TypeScript types package at /packages/shared. Init Redis with ioredis. Electron window opens and loads React app from dev server. |
| DO | Create docker-compose.yml with services: mongodb (port 27017), redis (port 6379), mongo-express (port 8081). Write .env.example. Create GitHub repo, protect main branch. Add pnpm scripts: dev, build, electron:dev, electron:build. Run docker compose up — all services healthy. |
 
## **Day 2 — MongoDB Schemas ****&**** Auth Backend**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build Register page (email, username, password — Zod schema validation, React Hook Form). Build Login page. Create AuthContext + useAuth hook. Wire to API via React Query mutations. Store JWT access token in memory (Zustand), refresh token in httpOnly cookie. |
| BE | Write all Mongoose schemas: User, Community, Post, Comment, Vote, CommunityMember, PostEmbedding, Notification, Report, AIConversation, AIMessage. Write POST /auth/register (bcrypt + JWT access+refresh pair) and POST /auth/login. Add authMiddleware that verifies JWT and attaches req.user. |
| AI | Set up Bull job queue backed by Redis. Write embeddingWorker: receives {postId, text, communityId} job → calls Gemini text-embedding-004 → creates PostEmbedding document. Test with dummy data. Add Groq SDK (groq-sdk) as fallback LLM for rate-limit scenarios. Dead-letter queue for failed jobs. |
| FS | Write Axios instance (base URL + Bearer auth header + silent token-refresh interceptor on 401). Export from /packages/shared. Set up Socket.io server mounted on the same Express HTTP server. Define socket event name constants in shared package. |
| DO | Set up GitHub Actions CI: on PR → pnpm install → eslint → jest → build. Write Jest config + first smoke test (GET /api/health returns 200 with {status:'ok'}). Configure staging branch auto-deploy to Render free tier. CI pipeline green on first PR. |
 
## **Day 3 — Auth Completion, App Shell ****&**** Security**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build app shell: Header (logo, search, user menu dropdown), Sidebar (community list from API). Build ProtectedRoute wrapper that redirects to /login if no auth. Add useIsDesktop() hook that detects Electron via window.electronAPI !== undefined. All routes configured in React Router v6. |
| BE | Write GET /auth/me, POST /auth/refresh (token rotation — blacklist old refresh token in Redis, issue new pair), POST /auth/logout (add token to Redis blacklist). Add express-rate-limit on all auth routes. GET /api/desktop/version returns {minimum, latest, downloadUrl}. |
| AI | Wire embeddingWorker to Post creation: add Mongoose post-save middleware on Post model that dispatches embedding job to Bull queue. Verify communityId is stored with each PostEmbedding document for community-scoped vector search retrieval. |
| FS | Implement secure Electron preload bridge: contextBridge.exposeInMainWorld('electronAPI', {showNotification, getSettings, setSettings, checkForUpdates, selectFile}). Never expose raw Node.js or ipcRenderer directly. All methods are typed and whitelisted. |
| DO | Add Sentry to Express backend (uncaught exceptions) and @sentry/electron for desktop crashes. Write docker-compose.prod.yml without mongo-express and with volume mounts for data persistence. Write README with setup steps for both web and desktop development. |
 
# Phase 2: Core Platform (Days 4–6)**Phase 2: Core Platform (Days 4–6)**
 
## **Day 4 — Communities: Create, Browse ****&**** Join**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build Create Community page (name, slug auto-generated from name, description, rules). Build community browser/discover page with cards (icon, name, member count, description). Build Community header (banner, member count, join/leave button). Test in both Chrome and Electron. |
| BE | Write POST /communities, GET /communities (paginated with cursor on _id), GET /communities/:slug, POST /communities/:slug/join (upsert CommunityMember, $inc members count), POST /communities/:slug/leave. Return 403 if CommunityMember.role is 'banned'. |
| AI | Run embedding backfill script: fetch all existing posts in batches of 50 → embed via Gemini text-embedding-004 → create PostEmbedding documents. Test Atlas Vector Search query using $vectorSearch aggregation stage with filter: {communityId: ObjectId}. Verify top-8 results are relevant. |
| FS | Community subscription state in Zustand store. Optimistic join/leave with React Query mutation + rollback on error. Fetch subscribed communities on app load and cache in Zustand. Desktop: on join, also update electron-store subscription cache via window.electronAPI.setSettings. |
| DO | Write Playwright E2E scaffold: page-object models for Auth, Community, Post pages. Write test #1: user registers → verifies email stub → sees community browser → joins a community. Run in CI against both web (localhost:5173) and Electron (electron-playwright integration). |
 
## **Day 5 — Posts: Create, Feed ****&**** Sorting**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build Post creation form: title (required), Tiptap rich text body, link option, community picker, flair selector. Build PostCard component: title, author, score, comment count, time-ago, community badge. Build infinite-scroll post feed using React Query useInfiniteQuery with cursor-based pagination. Verify Tiptap renders in Electron Chromium. |
| BE | Write POST /posts (create post, dispatch embedding job to Bull, compute initial hotScore). GET /posts?community=&sort=&cursor= (cursor-paginated by _id). GET /posts/:id (single post + author populated). Implement sort algorithms: New (sort by createdAt), Top (sort by score), Hot (pre-computed hotScore field using Wilson score + time decay, recalculated on each vote), Rising (score velocity in last 6h). |
| AI | Extend embedding pipeline to index comments too. Bull worker handles type:'comment' jobs — store comment text prefixed with parent post title for context: 'Post: [title] │ Comment: [body]'. Confirm both posts and comments retrievable via $vectorSearch with {type:'post'} or {type:'comment'} filter. |
| FS | Real-time vote broadcast via Socket.io: on vote cast (POST /votes), emit event vote:updated {postId, newScore} to all clients in that post's room (socket.join('post:'+postId) on PostDetail page open). Desktop clients join same rooms. React Query invalidates post query on receiving event. |
| DO | Add MongoDB seed script: 5 communities, 3 users (admin, mod, user), 40 posts with varied createdAt and scores. Write Jest unit tests for all 4 sort algorithms in isolation (mock data, assert correct order). Write test for POST /posts endpoint including Bull job dispatch. |
 
## **Day 6 — Nested Comments ****&**** Voting**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build CommentThread: recursive React component rendering depth up to 5 levels, collapse/expand toggle, indentation guides (left border per depth level). Build CommentBox (Tiptap, Ctrl+Enter submits). Build VoteButton: 3 states (up/neutral/down), optimistic update via React Query, animated number change. |
| BE | Write POST /posts/:id/comments (create, parentId for nesting, validate depth ≤ 5 by checking parent.depth). GET /posts/:id/comments — query all by {post, isRemoved:false}, sort by score descending, reconstruct nested tree in JS service layer using a Map keyed by _id. POST /votes — upsert Vote document (compound index {user,target,targetType}), recalculate Post or Comment score with MongoDB $inc. |
| AI | Finalise system prompt template in aiService.js: identity ('You are the ThreadVerse AI assistant for r/{community}'), grounding ('Answer ONLY from the provided posts below'), citation format ('Source: [Post title]'), tone (helpful, concise), refusal template for off-topic or harmful queries. Commit and version-tag as v1.0. |
| FS | Desktop keyboard shortcuts via Electron globalShortcut API: Cmd/Ctrl+N → IPC to renderer → navigate to post creation; Cmd/Ctrl+K → focus search bar; Cmd/Ctrl+Shift+A → open AI chat panel. globalShortcut works even when app window is not focused. |
| DO | Write Jest unit tests for all 6 vote transition combinations (no vote → up, no vote → down, up → down, down → up, up → no vote, down → no vote). Test that GET /posts/:id/comments returns correct nested tree (children inside parent, correct depth values). Use jest-mongodb in-memory for test DB. |
 
# Phase 3: UX Layer (Days 7–8)**Phase 3: UX Layer (Days 7–8)**
 
## **Day 7 — Feed, Search ****&**** User Profiles**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build personalised Home feed (subscribed communities, sort tabs: Hot/New/Top/Rising). Build User profile page (avatar, karma, bio, post history tab, comment history tab). Build global search bar (Cmd+K shortcut, 300ms debounce, appears as modal overlay). Build search results page with tabs: Posts │ Communities │ Users. |
| BE | Write GET /feed (subscribed communities from CommunityMember collection, cursor-paginated, merged feed sorted by sort param). GET /users/:username (profile + karma sum from Post and Comment scores). PUT /users/me (bio, avatar, notification preferences). GET /search?q=&type= using MongoDB Atlas Search $search aggregation stage with multi-collection search and weighted text fields. |
| AI | Implement hybrid search for AI context retrieval: run $vectorSearch (semantic) and Atlas $search (text) as separate pipelines on PostEmbedding collection, then merge results using reciprocal rank fusion (1/(60+rank)) with 70% vector weight + 30% text weight. Compare vs pure vector on 20 test queries. |
| FS | Wire media upload pipeline: POST /upload/sign returns Cloudinary signed upload URL → FE uploads file directly to Cloudinary → FE sends CDN URL to BE → BE saves on Post.media array. Desktop: file upload via dialog.showOpenDialog IPC call instead of browser input[type=file], then same Cloudinary pipeline. |
| DO | Add Redis cache for home feed: per-user key format feed:{userId}:{sort}, TTL 60 seconds. Cache invalidation: when any post is created in a community, invalidate all feed cache keys for that community's members (use Redis SCAN pattern). Verify p95 feed latency < 180ms. |
 
## **Day 8 — Moderation, Email ****&**** Settings**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build Report dialog (reason dropdown + detail textarea). Build Mod queue page (mod-only route): report list with approve/remove/dismiss actions. Build Settings page: email change, password change, notification preferences. Desktop: Settings page has extra 'Desktop App' section with version info and check-for-updates button. |
| BE | Write POST /reports (creates Report document), GET /mod/queue (reports for communities where user is mod), POST /mod/action {type:'approve'│'remove'│'ban', targetId, communityId}. Integrate Nodemailer + SendGrid: email verification on register, password reset with time-limited token. Community rules CRUD and post flair CRUD (mod-only middleware). |
| AI | Add Gemini content moderation: before storing any user post, send text to Gemini with safety classification system prompt ('Classify this content as SAFE, SPAM, HATE, or NSFW. Respond with one word.'). If not SAFE → reject with explanation. Store all moderation decisions in ModerationLog collection. |
| FS | Desktop settings persistence with electron-store: theme (light/dark/system), font size (small/medium/large), sidebar collapsed state, default community sort, notification sound on/off, AI chat auto-open on launch. Sync with web preferences via PUT /users/me on app connect. |
| DO | Security audit: XSS protection (DOMPurify on all Tiptap HTML output on FE), NoSQL injection protection (Mongoose sanitizes by default — never string-concatenate into queries), IDOR checks (every route handler verifies req.user owns the resource). Run npm audit. Add strict Content-Security-Policy and X-Frame-Options headers. |
 
# Phase 4: AI Chat (RAG) (Days 9–11)**Phase 4: AI Chat (RAG) (Days 9–11)**
 
## **Day 9 — AI Chat Backend ****&**** RAG Core**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build AI chat widget: floating button bottom-right on community page, slide-in chat panel (right drawer), message thread with user and AI message styles, auto-scroll to latest, input box (Enter sends, Shift+Enter newline). Wire to SSE endpoint via EventSource API. Show animated 'AI is thinking...' skeleton while streaming. |
| BE | Write POST /ai/chat: {message, communityId, conversationId?} → embed message with Gemini text-embedding-004 → run $vectorSearch top-8 on PostEmbedding filtered by communityId → assemble context string → build prompt with system + context + history + user message → stream Gemini 2.5 Flash response via Server-Sent Events (res.write('data: ...')). Redis rate limit: 25 messages/user/day. |
| AI | Implement full RAG pipeline in /server/src/services/aiService.js: (1) embedQuery() via Gemini text-embedding-004; (2) retrieveContext() via MongoDB $vectorSearch returning top-8 with postId and title; (3) buildPrompt() assembling system + context + history; (4) streamResponse() via Gemini generateContentStream(). Add source metadata to each chunk for citation. End-to-end test with 10 real community posts. |
| FS | Desktop local embedding cache in electron-store (LRU 200 entries, keyed by communityId+postId): on AI chat, check local cache first before hitting API for vector matches. On community page open, background-sync latest 50 post embeddings into cache via IPC call to main process. |
| DO | Set up Google AI Studio spend monitoring (configure budget alerts). Add AI endpoint to k6 load test script (50 concurrent sessions, measure latency distribution). Log p50/p95/p99 time-to-first-token to MongoDB PerformanceLog. Set up GET /api/ai/health check that verifies Gemini API connectivity with a test embed call. |
 
## **Day 10 — Citations, Conversation History ****&**** Feedback**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Render source citations under each AI response: 'Based on: [Post title]' as clickable links navigating to the post page. Style AI messages differently (different background, AI avatar). Add thumbs-up/down feedback buttons below each AI response. Load previous conversation messages on chat panel open. |
| BE | Save every message exchange to AIMessage collection: {conversation, role, content, sources:[{postId, title}], tokensUsed, rating, createdAt}. Write GET /ai/conversations/:communityId (lists conversations for user in community). POST /ai/messages/:id/feedback {rating: 1│-1}. GET /ai/conversations/:id/messages (load conversation history). |
| AI | Inject last 6 conversation turns into context window as sliding history. Add token counting using Gemini countTokens() API — if total tokens > 5500, drop oldest turns first until under limit. Run quality eval: write 20 test questions per community, score each response on relevance (1-5), groundedness (citation present?), and faithfulness (no hallucination). Target avg ≥ 3.5. |
| FS | Desktop native notification for AI response: when AI finishes streaming while app window is minimised or hidden, fire Electron Notification: new Notification({title:'AI answered', body:'In r/'+community}). Clicking notification → app.focus() + IPC to renderer to scroll to the AI response. |
| DO | Write Jest unit tests for the RAG pipeline: mock @google/generative-ai SDK, assert $vectorSearch called with correct communityId filter, assert top-8 chunks returned, assert prompt assembled correctly, assert SSE stream events emitted. Test token counter truncation at >5500 tokens. Achieve 80%+ coverage on aiService.js. |
 
## **Day 11 — AI Streaming Polish ****&**** Error Handling**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Render tokens as they stream: append each SSE data event to message content, show animated blinking cursor at end of in-progress message. Handle stream error events inline: show 'AI unavailable — tap to retry' message without crashing. Desktop: Cmd/Ctrl+Shift+A opens AI chat from anywhere in app via IPC. |
| BE | Harden AI endpoint: implement 15s timeout on Gemini call (AbortSignal.timeout(15000)) → send SSE error event and close stream. If $vectorSearch returns < 3 results → prepend 'Limited context available' warning to stream before response. Wrap all AI calls in try/catch → Sentry capture. Add aiEnabled boolean field on Community schema (mod can toggle via PUT /communities/:slug). |
| AI | Implement semantic deduplication before embedding: run $vectorSearch on new post text — if cosine similarity > 0.95 with existing PostEmbedding in same community, skip creating new embedding (saves Gemini quota). Also add batching: collect embedding jobs and process in batches of 20 using Gemini embedContentBatch API. Run quality eval round 2, compare scores. |
| FS | AI chat tray quick-access: add 'Ask AI' item to system tray context menu. Clicking → app.focus() + IPC event to renderer to open AI chat panel in last viewed community. Background community sync on every app launch: fetch posts created since lastSyncAt stored in electron-store → embed → update local cache. |
| DO | Add Sentry to Electron frontend: @sentry/electron captures both main process crashes and renderer JS errors. Test SSE reconnection: manually drop server connection, verify EventSource auto-reconnects and resumes streaming. Verify Groq SDK fallback activates automatically when Gemini returns 429 Too Many Requests. |
 
# Phase 5: Real-Time & Admin (Days 12–13)**Phase 5: Real-Time ****&**** Admin (Days 12–13)**
 
## **Day 12 — Notifications (Web + Native Desktop)**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build notification bell in Header: real-time badge count (unread count from Socket.io event), dropdown list showing notification types (reply, mention, mod action, AI response) with time-ago and link to relevant post. Mark all as read button. Desktop: shows macOS dock badge or Windows taskbar flash on new notification. |
| BE | Trigger notifications via Mongoose post-save hooks: after Comment saved → if parentComment exists, notify parentComment.author; if @username found in body, notify that user. Write GET /notifications + GET /notifications/unread-count. PUT /notifications/read and PUT /notifications/read-all. Emit notification:new event via Socket.io to user's personal room (socket.join('user:'+userId)). |
| AI | Set up automated eval pipeline: node-cron job runs nightly at 2AM. Runs 30 standard test questions across 3 communities. Scores responses (groundedness + relevance). Posts summary to Discord webhook if average score drops below 3.0. Stores all eval results in EvalResult MongoDB collection for trend tracking. |
| FS | Desktop native OS notifications via IPC chain: renderer receives notification:new socket event → sends IPC to main process → main process calls new Notification({title:'ThreadVerse', body: notif.message}).show(). Click handler → mainWindow.show() + mainWindow.focus() + send navigate IPC to renderer. |
| DO | Load test notifications system: k6 script simulates 300 concurrent users each receiving 15 notifications/second. Monitor Socket.io room memory usage. Write E2E test #2: User A replies to User B's post → User B's notification bell shows new badge (web) and OS notification fires (desktop, electron-playwright). |
 
## **Day 13 — Admin Dashboard ****&**** Performance**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build Admin dashboard (/admin, admin-role gated): stats cards (total users, posts, AI chats today, open reports). User management table (search by username/email, ban/unban buttons). AI usage chart (daily chat count + estimated Gemini cost) using Recharts — pure React, no external chart service. Dark mode toggle (Tailwind dark: classes, stored in Zustand). |
| BE | Admin API (middleware checks req.user.role === 'admin'): GET /admin/stats (MongoDB aggregation pipeline across collections), GET /admin/users?search=&banned= (text index on username+email), POST /admin/users/:id/ban, GET /admin/ai/costs (aggregate AIMessage.tokensUsed by day and community). Add Redis TTL 5min cache on all heavy admin aggregation queries. |
| AI | Build AI cost breakdown feature in admin: per-community view of posts indexed (PostEmbedding count), chats today (AIConversation count), average tokensUsed per chat (AIMessage avg aggregation), estimated Gemini cost. Also surfaces low-rated AIMessages (rating: -1) for quality review. |
| FS | SEO on web: add react-helmet-async to all public-facing pages — Post detail (title from post.title), Community page (description from community.description), User profile. Add Open Graph and Twitter Card meta tags. Write Express route GET /sitemap.xml that generates XML from all public communities and posts. |
| DO | Performance optimisation pass: run Lighthouse CI on 6 key pages targeting score > 85. Apply React.lazy() + Suspense code-splitting on all route components. Add react-window VirtualList on PostFeed for 60fps on 1000-post lists. Add vite-plugin-compression for gzip/brotli output. Re-run Lighthouse to verify improvement. |
 
# Phase 6: Electron Desktop (Days 14–16)**Phase 6: Electron Desktop (Days 14–16)**
 
## **Day 14 — Electron Window, Tray ****&**** Deep Links**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build custom frameless title bar (BrowserWindow frame:false). Title bar has: app icon, window title (current page name), and window control buttons (minimise, maximise/restore, close) that send IPC events to main process. Add desktop-specific sidebar section: 'Desktop Settings' link, current app version display. Verify all app pages render correctly in Electron Chromium. |
| BE | Register threadverse:// custom URL protocol (app.setAsDefaultProtocolClient('threadverse')). Handle open-url events in main process: parse URL, extract path, send navigate IPC to renderer. Examples: threadverse://community/reactjs → /community/reactjs; threadverse://post/[id] → /post/[id]. Add electron:// to allowed CORS origins on Express. |
| AI | Desktop offline AI mode: main process uses net.isOnline() to detect connectivity. On offline → send ipc:offline event to renderer. Renderer shows offline banner and disables AI chat input. Last 10 AI conversations stored in electron-store (conversation messages array) and shown as read-only when offline. |
| FS | System tray implementation: Tray icon with context menu (Open ThreadVerse, Open AI Chat, Check for Updates, Separator, Quit). On new notification received via Socket.io → update macOS dock badge count (app.setBadgeCount()) or Windows tray overlay icon. Click tray icon → mainWindow.show() + mainWindow.focus(). |
| DO | Generate all platform icons from a master SVG source file using electron-icon-builder: icon.icns (macOS, 1024x1024 with all sizes in icns container), icon.ico (Windows, multi-resolution), icon.png (Linux, 512x512). Generate tray icon variants (16x16, 22x22, 32x32 for different DPIs). Verify icons appear correctly in macOS dock, Windows taskbar, Linux panel. |
 
## **Day 15 — Native File Dialogs, electron-store ****&**** Desktop Comms**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Desktop-specific post creation enhancement: when running in Electron (useIsDesktop()), 'Attach image' button calls window.electronAPI.selectFile() instead of opening browser file input. IPC call triggers dialog.showOpenDialog in main process (filters: image types). Returns file path array to renderer → upload to Cloudinary → attach CDN URL to post. |
| BE | Write integration test: simulate desktop client by sending X-App-Platform: electron and X-App-Version: 1.0.0 headers. Verify server handles electron:// CORS origin. Log platform field ('web' or 'desktop') in Morgan request log for separate analytics tracking. Add platform tracking to user activity events. |
| AI | AI tray quick-access: 'Ask AI' item in tray context menu triggers: mainWindow.show() → navigate IPC to renderer → renderer opens AI chat panel in last-used community (stored in electron-store). Also verify globalShortcut Cmd/Ctrl+Shift+A fires from main process and sends open-ai-chat IPC — works even when window is minimised. |
| FS | Comprehensive electron-store settings: theme (light/dark/system — apply via classList on html element), fontSize (small/medium/large — CSS variable), sidebarCollapsed, defaultCommunitySort, notificationSound, aiChatAutoOpen. All accessible via window.electronAPI.getSettings() / setSettings(). On app launch, sync from API preferences to electron-store. |
| DO | Electron security hardening: all BrowserWindow instances have nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true. Main process validates all incoming IPC messages: check channel name is in whitelist, check payload type matches expected schema. Run electronegativity static analysis (npx electronegativity) — fix all HIGH severity findings. |
 
## **Day 16 — Auto-Updater ****&**** Release Pipeline**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Build update notification UI: persistent top banner 'New version available — Restart to update' appears when updater sends update-downloaded IPC. Banner has 'Restart Now' button (calls window.electronAPI.installUpdate()) and 'Later' dismiss. Build Settings → About page: current version, latest version, 'Check for Updates' button, release notes link. |
| BE | Version gate: GET /api/desktop/version returns {minimum:'1.0.0', latest:'1.2.0', downloadUrl:'https://...'}. Add middleware that checks X-App-Version header on all API requests from desktop clients — if version < minimum, return 426 Upgrade Required with {message, downloadUrl}. Renderer shows forced-update modal on 426 response. |
| AI | Background community sync on every app launch (when online): compare lastSyncAt in electron-store to current time, fetch posts created after lastSyncAt for all subscribed communities, dispatch embedding jobs for each via Bull, update local electron-store cache. Log sync stats (posts synced, time taken) to Sentry breadcrumbs. Update lastSyncAt on completion. |
| FS | Set up electron-updater with GitHub Releases as update feed (publish: {provider:'github', owner, repo} in electron-builder config). Wire all updater events: checking-for-update → update-available → download-progress → update-downloaded → error. Each event sends IPC to renderer which updates UI state machine accordingly. Test with mock GitHub release. |
| DO | Cross-platform build pipeline in GitHub Actions: trigger on git tag push (v*.*.*). Matrix strategy: [windows-latest, macos-latest, ubuntu-latest]. Each runner: pnpm install → pnpm build → electron-builder → upload artifact to GitHub Release. Test full pipeline with v0.1.0-test tag — verify .exe, .dmg, .AppImage artifacts produced. |
 
# Phase 7: Electron Hardening (Days 17–19)**Phase 7: Electron Hardening (Days 17–19)**
 
## **Day 17 — Desktop Performance ****&**** App Store Prep**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Apply react-window FixedSizeList to PostFeed in Electron — only render visible PostCard components. Benchmark: 1000-post feed must scroll at 60fps in Electron DevTools Performance tab. Add skeleton loader components to all data-fetch sections. Add React Error Boundary on each major page section with 'Reload section' fallback UI. |
| BE | Add X-App-Version header processing: desktop app sends this header on all requests. Log it in Morgan. Add aggregation to GET /admin/stats that groups desktop users by app version (aggregate on request logs MongoDB collection). Show version distribution chart in admin dashboard. |
| AI | Optimise Gemini embedding costs: implement batching (collect pending embedding jobs and send up to 100 texts per embedContentBatch call instead of one at a time). Implement MinHash-based pre-filtering before full cosine similarity dedup check. Measure total Gemini API calls before vs after — document cost reduction. |
| FS | macOS App Store (MAS) build preparation: configure electron-builder MAS target with entitlements.mac.plist (com.apple.security.network.client, com.apple.security.files.user-selected.read-write, com.apple.security.cs.allow-jit). Build MAS variant. Verify sandbox compliance: codesign --verify --deep --strict ThreadVerse.app. |
| DO | Code signing setup: macOS — import Apple Developer certificate into macOS Keychain in GitHub Actions, configure notarytool for notarisation after build. Windows — import EV code signing certificate from environment secret. Test that macOS build passes Gatekeeper (spctl --assess) and Windows build passes SmartScreen check without security warnings. |
 
## **Day 18 — Cross-Platform Testing ****&**** Weekly Email Digest**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Cross-platform UI QA on all target platforms: Windows 10, Windows 11, macOS Ventura/Sonoma, Ubuntu 22.04. Check items: font rendering (Inter or system font fallback), tray icon visibility, custom title bar appearance (looks native on each OS), notification popup style, Tailwind dark mode. Document and fix all platform-specific CSS issues found. |
| BE | Build weekly email digest cron job using node-cron ('0 9 * * 1' — every Monday 9AM). For each user with notifPrefs.digest:true: MongoDB aggregation to find top 5 posts from subscribed communities in last 7 days by score. Send via Nodemailer + SendGrid HTML template. Include one-click unsubscribe link (JWT-signed URL, no login required). |
| AI | Final desktop AI quality test: run the 20-question eval suite specifically on desktop client (mock desktop environment in test). Measure: local cache hit rate, cache response latency vs API latency (should be 10x faster), answer quality vs web baseline. Test background sync freshness: verify AI correctly answers about a post created 5 minutes ago after sync. |
| FS | Deep link comprehensive testing on all 3 platforms: threadverse://community/:slug, threadverse://post/:id, threadverse://user/:username. Windows: test via registry (HKEY_CLASSES_ROOT), clicking link in email. macOS: test via Info.plist, open command in Terminal. Linux: test via xdg-open. Deep links must open correct page from browser, email client, and CLI. |
| DO | Platform-specific installer QA: Windows NSIS installer — custom install directory, desktop shortcut creation, Start Menu entry, uninstaller in Control Panel, registry cleanup. macOS DMG — drag-to-Applications flow, quarantine attribute cleared after open. Linux AppImage — chmod +x, runs without system install, AppImageUpdate for auto-updates. |
 
## **Day 19 — PWA, SEO Final Pass ****&**** Distribution Prep**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Add PWA to web version: manifest.json (name, short_name, icons at 192px/512px, theme_color, display:standalone), service worker via vite-plugin-pwa (Workbox) caching app shell and static assets for offline. Test: install PWA on mobile Chrome, verify offline shows cached app. Add /download page with OS detection (navigator.userAgent) showing correct installer download button. |
| BE | Final API consistency audit: verify every endpoint returns {data, error, meta{cursor,hasMore,total}} envelope shape. Generate OpenAPI 3.0 spec using swagger-jsdoc (JSDoc annotations on route handlers). Serve interactive docs at GET /api/docs via swagger-ui-express. Add x-request-id UUID header to all responses for distributed tracing. |
| AI | Prompt A/B test: create 3 variants of system prompt (v1: verbose, v2: concise, v3: structured with numbered citations). Run 20-question eval on each variant. Compare: average response token count, citation rate (sources present?), user satisfaction from existing rating data. Select winning variant, document the reasoning, deploy to production aiService.js. |
| FS | Prepare platform store submissions: Microsoft Store (build MSIX package via electron-builder's appx target), Mac App Store (MAS build prepared on Day 17, upload via Transporter), Flathub (write org.threadverse.app.yml manifest), Snapcraft (write snap/snapcraft.yaml). Create 5 store screenshots at 1280x800 using screen recording on each OS. |
| DO | Security headers final audit: test all headers at securityheaders.com — target grade A+. Required headers: Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Run OWASP ZAP passive scan on staging URL — fix any high or medium findings. Run electronegativity final time on Electron build — zero HIGH findings required. |
 
# Phase 8: Test & Ship (Days 20–21)**Phase 8: Test ****&**** Ship (Days 20–21)**
 
## **Day 20 — Full Bug Bash, E2E Tests ****&**** Production Config**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Full UI bug bash: manually test every page and interaction at responsive breakpoints 375px (mobile web), 768px (tablet), 1280px (desktop web), and standard desktop window sizes (1024x768, 1440x900). Test all empty states (empty community, no posts, no notifications), all error states (network error, auth error), and every Electron page. Zero broken layouts allowed. |
| BE | Write Jest unit tests for all remaining service-layer functions: feed algorithm edge cases (empty subscriptions, single post), all 6 vote transitions, notification trigger conditions, embedding queue retry logic. Target 80%+ unit test coverage overall. Production MongoDB config: Mongoose poolSize:10, SSL:true, serverSelectionTimeoutMS:5000, slow query logging via Mongoose debug. |
| AI | Final AI quality eval round 3 (most comprehensive): run 20-question suite on both web and desktop separately. Must score ≥ 3.5 on both. Test all edge cases: offensive input (must refuse gracefully), completely off-topic question (must redirect), empty community with < 5 posts (must warn about limited context), very long question (> 500 words, must handle token limit), non-English question (Hindi/Tamil — attempt answer in kind). |
| FS | Write Playwright E2E test suite: 3 flows on web + same 3 on desktop via electron-playwright. Flow 1: Register → verify email → join community → create post → vote on post → open AI chat → ask question. Flow 2: Mod flow — report a post → log in as mod → approve report → remove post. Flow 3: Search → find post → add comment → author receives notification → mark as read. All 6 flows must pass in CI. |
| DO | Full staging deployment and validation: deploy web to Render staging URL, sideload desktop installer from staging build. Run complete E2E suite against staging. k6 load test: 500 concurrent web users + 100 desktop clients simultaneously, error rate < 0.5%, p95 latency < 2s. Test MongoDB Atlas backup restore. Verify Sentry is clean (no unhandled errors). Green on all checks. |
 
## **Day 21 — LAUNCH DAY 🚀 Web + Desktop Go Live**
 
| **Role** | **Tasks ****&**** Deliverables** |
| --- | --- |
| FE | Final production smoke test: visit every page on web (production URL) + Electron (production release). Verify OG tags render correctly in Twitter Card Validator and Open Graph debugger. Verify /download page serves correct installers by OS. Monitor Sentry JS error rate for first 2 hours — target zero new errors. Verify custom 404 and 500 error pages show correctly. |
| BE | Deploy backend to Render (or Railway). Run all Mongoose index creation and seed data scripts on production MongoDB Atlas. Verify all 40+ API endpoints respond correctly via Postman collection run. Monitor production metrics: MongoDB connection pool < 80% used, Node.js memory < 80%, CPU < 70%. Watch slow query log under real traffic for first 4 hours post-launch. |
| AI | Production AI setup: trigger embedding backfill job for all seed content. Verify Atlas Vector Search index is ACTIVE (check with explain() on $vectorSearch — should show 'VECTOR_SEARCH' stage). Set Google AI Studio monthly budget alert at $30 and hard cap at $50. Monitor time-to-first-token under real user load — target < 4 seconds p95. |
| FS | Launch announcements: post to Product Hunt (scheduled the night before), Show HN on Hacker News ('ThreadVerse: Reddit-style platform with AI chat, available as web + native desktop'), post to r/webdev + r/SideProject + r/startups subreddits. In all listings: mention desktop app as key differentiator. Monitor Posthog events: user_registered, community_joined, post_created, ai_chat_opened, desktop_downloaded. |
| DO | War-room monitoring (first 4 hours): Uptime Robot pinging web and API every 60s. Sentry error dashboard open. Posthog live view showing real users. Google AI Studio spend dashboard. Track desktop auto-updater adoption rate (what % of desktop downloads are version 1.0.0). Tag all Docker images and GitHub release as :launch-v1.0. Keep rollback procedure document ready. Write post-launch metrics summary. |
 
# Part 4: Technology Replacement Map**Part 4: Technology Replacement Map**
 
Every non-MERN technology from the original plan has been replaced with a JavaScript/MongoDB equivalent. Zero functionality is lost.
 
| **Original (Non-MERN)** | **MERN Replacement** | **Notes** |
| --- | --- | --- |
| PostgreSQL + Prisma ORM | MongoDB + Mongoose | Document model is a natural fit for nested posts/comments. Mongoose schema validation replaces Prisma migrations. |
| pgvector extension | MongoDB Atlas Vector Search | Built into Atlas M0 free tier. $vectorSearch aggregation stage. 768-dim cosine index on PostEmbedding collection. |
| PostgreSQL tsvector FTS | MongoDB Atlas Search | $search aggregation stage with text and compound operators. Equal or better relevance ranking. |
| BullMQ (Redis queue) | Bull (Redis queue) | Bull is the standard MERN job queue. Same Redis backend, simpler API, same concepts. |
| Recursive SQL CTE (comments) | Mongoose query + JS tree build | Query all comments by {post, depth ≤ 5}, sort by score. Reconstruct tree in ~20 lines of JS using a Map. |
| OpenAI GPT-4o + embeddings | Gemini 2.5 Flash + text-embedding-004 | Free tier via Google AI Studio. Embedding dimension: 768 (set in Atlas Vector Search index config). |
| LangChain Python RAG | Custom JS RAG in Express | ~80 lines of Node.js in aiService.js: embed → $vectorSearch → context assembly → Gemini stream. |
| pgBouncer connection pool | Mongoose poolSize config | Mongoose handles MongoDB connection pooling natively. Set {poolSize: 10} in connect options for production. |
| S3 presigned URL upload | Multer + Cloudinary Node SDK | Cloudinary free tier (25GB). multer parses multipart in Express, Cloudinary SDK uploads from Node.js. |
| Separate Python AI service | Express route + Bull worker | All Gemini API calls happen inside Express route handlers and Bull workers — no separate process or language. |
| SendGrid (Python) | Nodemailer + SendGrid (Node.js) | nodemailer with SendGrid SMTP transport. 100% Node.js email pipeline. |
| Prisma DB migrations | Mongoose schema validation | MongoDB is schemaless — Mongoose enforces document shape at the application layer. No migration files needed. |
 
*ThreadVerse — Built with pure MERN. JavaScript from browser to database.*
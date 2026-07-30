// e2e/helpers/mockApi.js
//
// In-browser mock API layer. Intercepts all /api/* requests via page.route()
// and returns deterministic responses from an in-memory state object.
// No real server, MongoDB, or Redis needed — runs entirely in the browser.

let _nid = 1;
function mid() { return `e2e-${_nid++}`; }

function mockJwt(user) {
  return Buffer.from(JSON.stringify({ userId: user._id, role: user.role, iat: Date.now() })).toString('base64') + '.e2e';
}

function readJwt(token) {
  if (!token) return null;
  try { return JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString()); }
  catch { return null; }
}

// ── Seed helpers ────────────────────────────────────────────────────────────

export function seedDefaults(state) {
  const admin = upsertUser(state, { username: 'admin', email: 'admin@e2e.test', role: 'admin' });
  const mod = upsertUser(state, { username: 'moderator', email: 'mod@e2e.test', role: 'moderator' });
  const user = upsertUser(state, { username: 'alice', email: 'alice@e2e.test', role: 'user' });
  const user2 = upsertUser(state, { username: 'bob', email: 'bob@e2e.test', role: 'user' });

  const community = upsertCommunity(state, {
    name: 'E2E Testing', slug: 'e2e-testing',
    description: 'Community for automated tests', mods: [mod._id],
  });
  const community2 = upsertCommunity(state, {
    name: 'Web Dev', slug: 'web-dev',
    description: 'Web development discussion', mods: [],
  });

  // Join communities
  for (const u of [user, user2, mod]) {
    if (!community.members.includes(u._id)) community.members.push(u._id);
  }
  if (!community2.members.includes(user._id)) community2.members.push(user._id);

  const post = upsertPost(state, {
    title: 'Welcome to E2E Testing',
    body: 'This post is created by the seed helper for automated tests.',
    author: user, community,
  });

  const post2 = upsertPost(state, {
    title: 'How to configure Playwright',
    body: 'A guide for setting up Playwright in your project.',
    author: user2, community: community2,
  });

  return { admin, mod, user, user2, community, community2, post, post2 };
}

export function upsertUser(state, data) {
  const existing = state.users.find(u => u.email === data.email);
  if (existing) return existing;
  const user = {
    _id: data._id || mid(), username: data.username, email: data.email,
    role: data.role || 'user', karma: data.karma || 1,
    emailVerified: data.emailVerified || false,
    createdAt: new Date().toISOString(), ...data,
  };
  state.users.push(user);
  return user;
}

export function upsertCommunity(state, data) {
  const existing = state.communities.find(c => c.slug === data.slug);
  if (existing) return existing;
  const community = {
    _id: data._id || mid(), name: data.name, slug: data.slug,
    description: data.description || '', members: data.members || [],
    mods: data.mods || [], aiEnabled: true, rules: [],
    createdBy: data.createdBy || null, createdAt: new Date().toISOString(),
    ...data,
  };
  state.communities.push(community);
  return community;
}

export function upsertPost(state, data) {
  const existing = state.posts.find(p => p.title === data.title);
  if (existing) return existing;
  const author = typeof data.author === 'object' ? data.author : state.users[0];
  const community = typeof data.community === 'object' ? data.community : state.communities[0];
  const post = {
    _id: data._id || mid(), title: data.title, body: data.body || '',
    content: data.content || data.body || '', type: data.type || 'text',
    author: { _id: author._id, username: author.username },
    community: { _id: community._id, name: community.name, slug: community.slug },
    upvotes: data.upvotes || 0, downvotes: data.downvotes || 0,
    score: data.score || 0, commentCount: 0, isRemoved: false, isDeleted: false,
    createdAt: new Date().toISOString(),
  };
  state.posts.push(post);
  return post;
}

// ── Mock state factory ──────────────────────────────────────────────────────

export function createMockState() {
  return { users: [], communities: [], posts: [], comments: [], reports: [], notifications: [] };
}

export async function setAuthCookie(page, user) {
  const token = mockJwt(user);
  await page.context().addCookies([{
    name: 'e2e_auth_token',
    value: token,
    domain: 'localhost',
    path: '/',
  }]);
  return token;
}

// ── Route setup ─────────────────────────────────────────────────────────────

export async function setupMocks(page, state) {
  if (!state) {
    state = createMockState();
    seedDefaults(state);
  }

  function body(route) {
    try { return JSON.parse(route.request().postData() || '{}'); }
    catch { return {}; }
  }

  function authUser(route) {
    // Check Authorization header first
    let token = route.request().headers()['authorization']?.replace('Bearer ', '');
    // Also check e2e_auth_token cookie (used to persist auth across page.goto reloads)
    if (!token) {
      const cookies = route.request().headers()['cookie'] || '';
      const match = cookies.split(';').find(c => c.trim().startsWith('e2e_auth_token='));
      if (match) token = decodeURIComponent(match.split('=').slice(1).join('='));
    }
    const payload = readJwt(token);
    if (!payload) return null;
    return state.users.find(u => u._id === payload.userId) || null;
  }

  function json(route, status, data) {
    return route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  }

  // ── Catch-all FIRST (Playwright: last matching route wins) ────────────
  await page.route('**/api/**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // ── Auth ──────────────────────────────────────────────────────────────

  await page.route('**/api/auth/register', async (route) => {
    const b = body(route);
    if (!b.username || !b.email || !b.password) {
      return json(route, 400, { data: null, error: 'All fields required.', meta: null });
    }
    if (b.password.length < 8) {
      return json(route, 400, { data: null, error: 'Password must be at least 8 characters.', meta: null });
    }
    if (state.users.find(u => u.email === b.email || u.username === b.username)) {
      return json(route, 409, { data: null, error: 'That email is already taken.', meta: null });
    }
    const user = {
      _id: mid(), username: b.username, email: b.email,
      role: 'user', karma: 1, emailVerified: false,
      createdAt: new Date().toISOString(),
    };
    state.users.push(user);
    return json(route, 201, { data: { accessToken: mockJwt(user), user: { id: user._id, username: user.username, email: user.email, role: user.role, karma: user.karma } }, error: null, meta: null });
  });

  await page.route('**/api/auth/login', async (route) => {
    const b = body(route);
    const user = state.users.find(u => u.email === b.email);
    if (!user) {
      return json(route, 401, { data: null, error: 'Invalid email or password.', meta: null });
    }
    return json(route, 200, { data: { accessToken: mockJwt(user), user: { id: user._id, username: user.username, email: user.email, role: user.role, karma: user.karma } }, error: null, meta: null });
  });

  await page.route('**/api/auth/me', async (route) => {
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'No token provided.', meta: null });
    return json(route, 200, { data: { user } });
  });

  await page.route('**/api/auth/refresh', async (route) => {
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'No token provided.' });
    return json(route, 200, { data: { accessToken: mockJwt(user) } });
  });

  await page.route('**/api/auth/verify-email', async (route) => {
    const b = body(route);
    if (!b.token) return json(route, 400, { data: null, error: 'Token is required.' });
    const user = authUser(route);
    if (user) user.emailVerified = true;
    return json(route, 200, { data: { message: 'Email verified successfully.' } });
  });

  // ── Users ─────────────────────────────────────────────────────────────
  await page.route('**/api/users/me', async (route) => {
    if (route.request().method() === 'PUT') {
      const user = authUser(route);
      if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
      const b = body(route);
      Object.assign(user, b);
      return json(route, 200, { data: user });
    }
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    return json(route, 200, { data: user });
  });

  await page.route('**/api/users/*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const userId = route.request().url().split('/users/')[1]?.split('?')[0];
    const user = state.users.find(u => u._id === userId);
    if (!user) return json(route, 404, { data: null, error: 'User not found' });
    const { ...safe } = user;
    return json(route, 200, { data: safe });
  });

  // ── Feed ──────────────────────────────────────────────────────────────
  await page.route('**/api/feed**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const user = authUser(route);
    let posts = state.posts.filter(p => !p.isRemoved && !p.isDeleted);
    if (user) {
      const joinedIds = state.communities
        .filter(c => c.members.includes(user._id))
        .map(c => c._id);
      posts = posts.filter(p => joinedIds.includes(p.community?._id));
    }
    const url = new URL(route.request().url());
    const sort = url.searchParams.get('sort') || 'hot';
    if (sort === 'hot') posts.sort((a, b) => (b.score || 0) - (a.score || 0));
    else if (sort === 'new') posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(route, 200, { data: posts, meta: { hasMore: false, nextCursor: null } });
  });

  // ── Communities ────────────────────────────────────────────────────────
  // WARNING: Playwright uses last-match-wins. Register wildcard routes FIRST,
  // then more specific routes LAST so they take precedence.

  await page.route('**/api/communities/*/join', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const slug = route.request().url().split('/communities/')[1]?.split('/')[0];
    const community = state.communities.find(c => c.slug === slug);
    if (!community) return json(route, 404, { data: null, error: 'Community not found' });
    if (!community.members.includes(user._id)) community.members.push(user._id);
    return json(route, 200, { data: { success: true, community } });
  });

  await page.route('**/api/communities/*/leave', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const slug = route.request().url().split('/communities/')[1]?.split('/')[0];
    const community = state.communities.find(c => c.slug === slug);
    if (!community) return json(route, 404, { data: null, error: 'Community not found' });
    community.members = community.members.filter(m => m !== user._id);
    return json(route, 200, { data: { success: true } });
  });

  await page.route('**/api/communities/*/flairs', async (route) => {
    return json(route, 200, []);
  });

  await page.route('**/api/communities/*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const slug = route.request().url().split('/communities/')[1]?.split('?')[0];
    const community = state.communities.find(c => c.slug === slug);
    if (!community) return json(route, 404, { data: null, error: 'Community not found' });
    return json(route, 200, { data: { ...community, members: community.members.length }, error: null, meta: null });
  });

  await page.route('**/api/communities', async (route) => {
    const method = route.request().method();
    if (method === 'GET') return json(route, 200, state.communities);
    if (method === 'POST') {
      const user = authUser(route);
      if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
      const b = body(route);
      const community = {
        _id: mid(), name: b.name, slug: b.slug || b.name.toLowerCase().replace(/\s+/g, '-'),
        description: b.description || '', members: [user._id], mods: [user._id],
        aiEnabled: true, rules: b.rules || [], createdBy: user._id,
        createdAt: new Date().toISOString(),
      };
      state.communities.push(community);
      return json(route, 201, { data: community });
    }
    await route.fallback();
  });

  await page.route('**/api/communities/search**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const results = q
      ? state.communities.filter(c => c.name.toLowerCase().includes(q))
      : state.communities;
    return json(route, 200, results);
  });

  await page.route('**/api/communities/me', async (route) => {
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const joined = state.communities.filter(c => c.members.includes(user._id));
    return json(route, 200, joined);
  });

  // ── Posts ──────────────────────────────────────────────────────────────
  // Single-post route MUST be registered BEFORE the list route
  // because Playwright gives priority to the LAST matching route.

  await page.route('**/api/posts/*/comments', async (route) => {
    const method = route.request().method();
    const postId = route.request().url().split('/posts/')[1]?.split('/')[0];

    if (method === 'GET') {
      const comments = state.comments
        .filter(c => c.post === postId && !c.isRemoved)
        .map(c => ({ ...c, children: [] }));
      return json(route, 200, { data: { comments }, meta: { total: comments.length } });
    }

    if (method === 'POST') {
      const user = authUser(route);
      if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
      const b = body(route);
      if (!b.body?.trim()) return json(route, 400, { data: null, error: 'Comment body is required.' });
      const comment = {
        _id: mid(), body: b.body.trim(),
        author: { _id: user._id, username: user.username },
        post: postId, score: 1, depth: 0,
        createdAt: new Date().toISOString(), children: [],
      };
      state.comments.push(comment);
      const post = state.posts.find(p => p._id === postId);
      if (post) post.commentCount = (post.commentCount || 0) + 1;

      // Create notification for post author
      if (post && post.author._id !== user._id) {
        state.notifications.push({
          _id: mid(), user: post.author._id, type: 'reply',
          actor: { _id: user._id, username: user.username },
          read: false, targetType: 'comment', postId,
          target: comment._id, createdAt: new Date().toISOString(),
        });
      }
      return json(route, 201, { data: comment });
    }
  });

  await page.route('**/api/posts/*/vote', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const b = body(route);
    const postId = route.request().url().split('/posts/')[1]?.split('/')[0];
    const post = state.posts.find(p => p._id === postId);
    if (!post) return json(route, 404, { data: null, error: 'Post not found' });
    const value = b.value || b.direction || 1;
    if (value > 0) post.upvotes = (post.upvotes || 0) + 1;
    else if (value < 0) post.downvotes = (post.downvotes || 0) + 1;
    post.score = (post.upvotes || 0) - (post.downvotes || 0);
    return json(route, 200, { data: { score: post.score, hotScore: post.score, risingScore: post.score, userVote: value } });
  });

  // Single-post GET — registered BEFORE the list route so last-match-wins picks the list for /api/posts?...
  await page.route('**/api/posts/*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const postId = route.request().url().split('/posts/')[1]?.split('?')[0];
    const post = state.posts.find(p => p._id === postId);
    if (!post) return json(route, 404, { data: null, error: 'Post not found' });
    return json(route, 200, { data: { post }, error: null, meta: null });
  });

  await page.route('**/api/posts', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      const user = authUser(route);
      if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
      const b = body(route);
      const community = state.communities.find(c => c._id === b.community);
      const post = {
        _id: mid(), title: b.title, body: b.body || '', content: b.content || b.body || '',
        author: { _id: user._id, username: user.username },
        community: community ? { _id: community._id, name: community.name, slug: community.slug } : null,
        type: b.type || 'text', upvotes: 1, downvotes: 0, score: 1,
        commentCount: 0, isRemoved: false, isDeleted: false,
        flair: b.flair || null, url: b.url || null, media: b.media || [],
        createdAt: new Date().toISOString(),
      };
      state.posts.push(post);
      return json(route, 201, { data: post });
    }

    if (method === 'GET') {
      const url = new URL(route.request().url());
      const communityId = url.searchParams.get('community') || url.searchParams.get('communityId');
      let posts = state.posts.filter(p => !p.isRemoved && !p.isDeleted);
      if (communityId) posts = posts.filter(p => p.community?._id === communityId);
      return json(route, 200, { data: { posts, nextCursor: null, hasMore: false }, error: null, meta: null });
    }

    await route.fallback();
  });

  // ── Votes (standalone) ─────────────────────────────────────────────────
  await page.route('**/api/votes', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const b = body(route);
    const post = state.posts.find(p => p._id === b.targetId);
    if (!post) return json(route, 404, { data: null, error: 'Target not found' });
    const value = b.value || 1;
    if (value > 0) post.upvotes = (post.upvotes || 0) + 1;
    else if (value < 0) post.downvotes = (post.downvotes || 0) + 1;
    post.score = (post.upvotes || 0) - (post.downvotes || 0);
    return json(route, 200, { data: { score: post.score, userVote: value } });
  });

  // ── Reports ───────────────────────────────────────────────────────────
  await page.route('**/api/reports', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const b = body(route);
    const report = {
      _id: mid(), target: b.target, targetType: b.targetType,
      reason: b.reason, detail: b.detail || '',
      community: b.community, reporter: { _id: user._id, username: user.username },
      status: 'pending', createdAt: new Date().toISOString(),
    };
    state.reports.push(report);
    return json(route, 201, { data: report });
  });

  // ── Mod ────────────────────────────────────────────────────────────────
  await page.route('**/api/mod/queue', async (route) => {
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const pending = state.reports.filter(r => r.status === 'pending');
    return json(route, 200, { data: pending, meta: { total: pending.length, hasMore: false } });
  });

  await page.route('**/api/mod/action', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const user = authUser(route);
    if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
      return json(route, 403, { data: null, error: 'Forbidden' });
    }
    const b = body(route);
    if (b.type === 'remove' && b.targetType === 'post') {
      const post = state.posts.find(p => p._id === b.targetId);
      if (post) post.isRemoved = true;
    }
    if (b.type === 'remove' && b.targetType === 'comment') {
      const comment = state.comments.find(c => c._id === b.targetId);
      if (comment) comment.isRemoved = true;
    }
    if (b.reportId) {
      const report = state.reports.find(r => r._id === b.reportId);
      if (report) report.status = b.type === 'approve' ? 'dismissed' : 'removed';
    }
    return json(route, 200, { data: { success: true } });
  });

  await page.route('**/api/mod/reports', async (route) => {
    // Frontend may call this instead of /mod/queue
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const pending = state.reports.filter(r => r.status === 'pending');
    return json(route, 200, { data: pending, meta: { total: pending.length } });
  });

  // ── Mod report resolution (frontend calls /mod/reports/:id/:action) ──
  await page.route('**/api/mod/reports/**', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const user = authUser(route);
    if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
      return json(route, 403, { data: null, error: 'Forbidden' });
    }
    const urlParts = route.request().url().split('/mod/reports/')[1]?.split('/');
    const reportId = urlParts?.[0];
    const action = urlParts?.[1];
    if (!reportId || !action) return json(route, 400, { data: null, error: 'Invalid request' });
    const report = state.reports.find(r => r._id === reportId);
    if (!report) return json(route, 404, { data: null, error: 'Report not found' });
    if (action === 'dismiss') {
      report.status = 'dismissed';
    } else if (action === 'remove') {
      report.status = 'removed';
      if (report.targetType === 'post') {
        const post = state.posts.find(p => p._id === report.target);
        if (post) post.isRemoved = true;
      }
      if (report.targetType === 'comment') {
        const comment = state.comments.find(c => c._id === report.target);
        if (comment) comment.isRemoved = true;
      }
    }
    return json(route, 200, { data: { success: true } });
  });

  // ── Notifications ──────────────────────────────────────────────────────
  await page.route('**/api/notifications/unread-count', async (route) => {
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const count = state.notifications.filter(n => n.user === user._id && !n.read).length;
    return json(route, 200, { data: { count } });
  });

  await page.route('**/api/notifications/read-all', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const updated = state.notifications.filter(n => n.user === user._id && !n.read);
    updated.forEach(n => { n.read = true; });
    return json(route, 200, { data: { updated: updated.length } });
  });

  await page.route('**/api/notifications/read', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const b = body(route);
    const ids = b.ids || [];
    const updated = state.notifications.filter(n => ids.includes(n._id));
    updated.forEach(n => { n.read = true; });
    return json(route, 200, { data: { updated: updated.length } });
  });

  await page.route('**/api/notifications', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const notifs = state.notifications
      .filter(n => n.user === user._id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(route, 200, { data: notifs, meta: { hasMore: false } });
  });

  // ── Search ─────────────────────────────────────────────────────────────
  await page.route('**/api/search**', async (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const type = url.searchParams.get('type') || 'all';
    const posts = state.posts.filter(p => !p.isRemoved && p.title.toLowerCase().includes(q));
    const communities = state.communities.filter(c => c.name.toLowerCase().includes(q));
    const users = state.users.filter(u => u.username.toLowerCase().includes(q));
    return json(route, 200, { data: { posts, communities, users } });
  });

  // ── AI Chat (SSE) ─────────────────────────────────────────────────────
  await page.route('**/api/ai/chat', async (route) => {
    const user = authUser(route);
    if (!user) return json(route, 401, { data: null, error: 'Unauthorized' });
    const b = body(route);
    const answer = `Based on the community discussions, here is what I found regarding "${b.message}". The community has several relevant posts that address this topic with practical examples and solutions.`;
    const words = answer.split(' ');
    const sseBody = words.map(w => `data: ${JSON.stringify({ type: 'token', text: w + ' ' })}\n\n`).join('')
      + `data: ${JSON.stringify({ type: 'done', conversationId: mid(), sources: [] })}\n\n`;
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: sseBody,
    });
  });

  await page.route('**/api/ai/**', async (route) => {
    return json(route, 200, { data: { status: 'ok' } });
  });

  // ── Upload (Cloudinary stub) ──────────────────────────────────────────
  await page.route('**/api/upload/**', async (route) => {
    return json(route, 200, {
      data: { apiKey: 'mock', timestamp: Date.now(), signature: 'mock', folder: 'mock', cloudName: 'mock' },
    });
  });

  return state;
}

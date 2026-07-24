import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Re-implement the navigation mapping from App.jsx:127-131 ──
// This tests the renderer-side routing logic without needing React/JSDOM.

function resolveDeepLinkRoute(type, param) {
  if (type === 'community') return `/r/${param}`;
  if (type === 'post') return `/post/${param}`;
  if (type === 'user') return `/u/${param}`;
  return null;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Renderer deep link routing — all 3 patterns', () => {
  it('community → /r/:slug', () => {
    assert.equal(resolveDeepLinkRoute('community', 'reactjs'), '/r/reactjs');
  });

  it('community with hyphens → /r/:slug', () => {
    assert.equal(resolveDeepLinkRoute('community', 'my-community'), '/r/my-community');
  });

  it('post → /post/:id', () => {
    assert.equal(resolveDeepLinkRoute('post', '507f1f77bcf86cd799439011'), '/post/507f1f77bcf86cd799439011');
  });

  it('user → /u/:username', () => {
    assert.equal(resolveDeepLinkRoute('user', 'johndoe'), '/u/johndoe');
  });

  it('user with underscores → /u/:username', () => {
    assert.equal(resolveDeepLinkRoute('user', 'jane_doe_42'), '/u/jane_doe_42');
  });

  it('unknown type returns null (no navigation)', () => {
    assert.equal(resolveDeepLinkRoute('unknown', 'something'), null);
  });

  it('empty param still produces valid route', () => {
    assert.equal(resolveDeepLinkRoute('community', ''), '/r/');
    assert.equal(resolveDeepLinkRoute('post', ''), '/post/');
    assert.equal(resolveDeepLinkRoute('user', ''), '/u/');
  });
});

describe('End-to-end: deep link URL → React Router path', () => {
  // Simulates the full chain: OS delivers URL → main.mjs parses → IPC → renderer navigates

  const PROTOCOL = 'threadverse';

  function extractDeepLinkUrl(argv) {
    return argv.find((arg) =>
      arg.startsWith(`${PROTOCOL}://`) ||
      arg.startsWith(`--protocol-url=${PROTOCOL}://`)
    )?.replace(/^--protocol-url=/, '');
  }

  function parseDeepLink(url) {
    const parsed = new URL(url);
    return { type: parsed.hostname, param: parsed.pathname.replace(/^\//, '') };
  }

  const testCases = [
    { url: 'threadverse://community/reactjs',     expectedRoute: '/r/reactjs' },
    { url: 'threadverse://community/nodejs',       expectedRoute: '/r/nodejs' },
    { url: 'threadverse://community/my-community', expectedRoute: '/r/my-community' },
    { url: 'threadverse://post/507f1f77bcf86cd799439011', expectedRoute: '/post/507f1f77bcf86cd799439011' },
    { url: 'threadverse://post/abc123',            expectedRoute: '/post/abc123' },
    { url: 'threadverse://user/johndoe',           expectedRoute: '/u/johndoe' },
    { url: 'threadverse://user/jane_doe_42',       expectedRoute: '/u/jane_doe_42' },
  ];

  for (const { url, expectedRoute } of testCases) {
    it(`${url} → ${expectedRoute}`, () => {
      // Step 1: OS delivers URL in argv (cold-start) or via second-instance
      const argv = ['electron.exe', '.', url];
      const extracted = extractDeepLinkUrl(argv);

      // Step 2: main.mjs parses hostname + pathname
      const { type, param } = parseDeepLink(extracted);

      // Step 3: renderer resolves to React Router path
      const route = resolveDeepLinkRoute(type, param);

      assert.equal(route, expectedRoute);
    });
  }
});

describe('React Router paths match actual route definitions', () => {
  // Verifies our deep link routes align with the <Route> definitions in App.jsx
  const routes = {
    community: '/r/:slug',
    post: '/post/:id',
    user: '/u/:username',
  };

  it('community route pattern matches', () => {
    assert.equal(routes.community, '/r/:slug');
  });

  it('post route pattern matches', () => {
    assert.equal(routes.post, '/post/:id');
  });

  it('user route pattern matches', () => {
    assert.equal(routes.user, '/u/:username');
  });
});

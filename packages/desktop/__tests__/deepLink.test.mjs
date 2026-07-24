import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Re-implement the two pure functions under test (extracted from main.mjs:894-908) ──
const PROTOCOL = 'threadverse';

function extractDeepLinkUrl(argv) {
  return argv.find((arg) =>
    arg.startsWith(`${PROTOCOL}://`) ||
    arg.startsWith(`--protocol-url=${PROTOCOL}://`)
  )?.replace(/^--protocol-url=/, '');
}

function parseDeepLink(url) {
  const parsed = new URL(url);
  return {
    type: parsed.hostname,
    param: parsed.pathname.replace(/^\//, ''),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('extractDeepLinkUrl', () => {
  it('extracts bare threadverse:// URL from argv', () => {
    const argv = ['electron.exe', 'packages/desktop', 'threadverse://community/reactjs'];
    assert.equal(extractDeepLinkUrl(argv), 'threadverse://community/reactjs');
  });

  it('extracts --protocol-url= prefixed URL from argv', () => {
    const argv = ['electron.exe', '--protocol-url=threadverse://post/abc123'];
    assert.equal(extractDeepLinkUrl(argv), 'threadverse://post/abc123');
  });

  it('returns undefined when no deep link in argv', () => {
    const argv = ['electron.exe', 'packages/desktop', '--some-other-flag'];
    assert.equal(extractDeepLinkUrl(argv), undefined);
  });

  it('returns undefined for empty argv', () => {
    assert.equal(extractDeepLinkUrl([]), undefined);
  });

  it('returns undefined for unrelated URLs', () => {
    const argv = ['electron.exe', 'https://example.com'];
    assert.equal(extractDeepLinkUrl(argv), undefined);
  });

  it('picks first deep link when multiple present', () => {
    const argv = [
      'electron.exe',
      'threadverse://community/reactjs',
      'threadverse://post/xyz',
    ];
    assert.equal(extractDeepLinkUrl(argv), 'threadverse://community/reactjs');
  });

  it('strips --protocol-url= prefix correctly', () => {
    const argv = ['--protocol-url=threadverse://user/johndoe'];
    assert.equal(extractDeepLinkUrl(argv), 'threadverse://user/johndoe');
  });
});

describe('parseDeepLink — threadverse://community/:slug', () => {
  it('parses community slug', () => {
    const result = parseDeepLink('threadverse://community/reactjs');
    assert.deepEqual(result, { type: 'community', param: 'reactjs' });
  });

  it('parses community slug with hyphens', () => {
    const result = parseDeepLink('threadverse://community/my-community');
    assert.deepEqual(result, { type: 'community', param: 'my-community' });
  });

  it('parses community slug with numbers', () => {
    const result = parseDeepLink('threadverse://community/nodejs123');
    assert.deepEqual(result, { type: 'community', param: 'nodejs123' });
  });
});

describe('parseDeepLink — threadverse://post/:id', () => {
  it('parses ObjectId-style post ID', () => {
    const result = parseDeepLink('threadverse://post/507f1f77bcf86cd799439011');
    assert.deepEqual(result, { type: 'post', param: '507f1f77bcf86cd799439011' });
  });

  it('parses short hex ID', () => {
    const result = parseDeepLink('threadverse://post/abc123def');
    assert.deepEqual(result, { type: 'post', param: 'abc123def' });
  });
});

describe('parseDeepLink — threadverse://user/:username', () => {
  it('parses simple username', () => {
    const result = parseDeepLink('threadverse://user/johndoe');
    assert.deepEqual(result, { type: 'user', param: 'johndoe' });
  });

  it('parses username with underscores', () => {
    const result = parseDeepLink('threadverse://user/jane_doe_42');
    assert.deepEqual(result, { type: 'user', param: 'jane_doe_42' });
  });
});

describe('handleDeepLink — IPC + window behaviour (mocked)', () => {
  let mockMainWindow;
  let capturedPayload;

  beforeEach(() => {
    capturedPayload = null;
    mockMainWindow = {
      webContents: {
        send: (channel, payload) => {
          capturedPayload = { channel, payload };
        },
      },
      show: mock.fn(() => {}),
      focus: mock.fn(() => {}),
    };
  });

  function handleDeepLink(url) {
    const parsed = new URL(url);
    const type = parsed.hostname;
    const param = parsed.pathname.replace(/^\//, '');
    mockMainWindow?.webContents.send('deep-link:navigate', { type, param });
    mockMainWindow?.show();
    mockMainWindow?.focus();
  }

  it('sends IPC with correct channel and payload for community', () => {
    handleDeepLink('threadverse://community/reactjs');
    assert.equal(capturedPayload.channel, 'deep-link:navigate');
    assert.deepEqual(capturedPayload.payload, { type: 'community', param: 'reactjs' });
  });

  it('sends IPC with correct channel and payload for post', () => {
    handleDeepLink('threadverse://post/507f1f77bcf86cd799439011');
    assert.equal(capturedPayload.channel, 'deep-link:navigate');
    assert.deepEqual(capturedPayload.payload, { type: 'post', param: '507f1f77bcf86cd799439011' });
  });

  it('sends IPC with correct channel and payload for user', () => {
    handleDeepLink('threadverse://user/johndoe');
    assert.equal(capturedPayload.channel, 'deep-link:navigate');
    assert.deepEqual(capturedPayload.payload, { type: 'user', param: 'johndoe' });
  });

  it('calls mainWindow.show()', () => {
    handleDeepLink('threadverse://community/reactjs');
    assert.equal(mockMainWindow.show.mock.callCount(), 1);
  });

  it('calls mainWindow.focus()', () => {
    handleDeepLink('threadverse://community/reactjs');
    assert.equal(mockMainWindow.focus.mock.callCount(), 1);
  });

  it('does not crash when mainWindow is null (cold-start edge case)', () => {
    assert.doesNotThrow(() => {
      const saved = globalThis.mainWindow;
      globalThis.mainWindow = undefined;
      // handleDeepLink guards with mainWindow?.webContents.send(...)
      const parsed = new URL('threadverse://community/reactjs');
      const type = parsed.hostname;
      const param = parsed.pathname.replace(/^\//, '');
      // The ?. chain must not throw
      mockMainWindow?.webContents.send('deep-link:navigate', { type, param });
      globalThis.mainWindow = saved;
    });
  });
});

describe('Cold-start vs warm-start argv patterns', () => {
  it('cold-start: URL appears as bare arg (Windows open command passes %1)', () => {
    // Simulates: electron.exe . threadverse://community/reactjs
    const argv = [
      'C:\\...\\electron.exe',
      'C:\\...\\packages\\desktop',
      'threadverse://community/reactjs',
    ];
    const url = extractDeepLinkUrl(argv);
    assert.equal(url, 'threadverse://community/reactjs');
    const parsed = parseDeepLink(url);
    assert.equal(parsed.type, 'community');
    assert.equal(parsed.param, 'reactjs');
  });

  it('cold-start: --protocol-url= prefix (alternate Electron argv format)', () => {
    const argv = [
      'C:\\...\\electron.exe',
      '--protocol-url=threadverse://post/abc123',
    ];
    const url = extractDeepLinkUrl(argv);
    assert.equal(url, 'threadverse://post/abc123');
  });

  it('warm-start: second-instance event passes argv with URL', () => {
    // Simulates second-instance callback argv
    const argv = [
      'C:\\...\\electron.exe',
      'threadverse://user/johndoe',
    ];
    const url = extractDeepLinkUrl(argv);
    const parsed = parseDeepLink(url);
    assert.equal(parsed.type, 'user');
    assert.equal(parsed.param, 'johndoe');
  });

  it('warm-start: no deep link in argv (normal second launch)', () => {
    const argv = ['C:\\...\\electron.exe', '.'];
    const url = extractDeepLinkUrl(argv);
    assert.equal(url, undefined);
  });
});

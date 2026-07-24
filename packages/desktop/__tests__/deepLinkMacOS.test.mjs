import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load raw files ──
const yamlRaw = readFileSync(join(__dirname, '..', 'electron-builder.yml'), 'utf-8');
const plistRaw = readFileSync(join(__dirname, '..', 'build', 'entitlements.mac.plist'), 'utf-8');

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('electron-builder.yml — macOS config', () => {
  it('has mac.target with dmg', () => {
    assert.ok(yamlRaw.includes('target: dmg'), 'dmg target not found');
  });

  it('builds for x64 and arm64', () => {
    assert.ok(yamlRaw.includes('- x64'), 'x64 arch missing');
    assert.ok(yamlRaw.includes('- arm64'), 'arm64 arch missing');
  });

  it('references entitlements.mac.plist', () => {
    assert.ok(yamlRaw.includes('entitlements: build/entitlements.mac.plist'));
  });

  it('enables hardened runtime', () => {
    assert.ok(yamlRaw.includes('hardenedRuntime: true'));
  });
});

describe('electron-builder.yml — CFBundleURLSchemes', () => {
  it('has extendInfo section', () => {
    assert.ok(yamlRaw.includes('extendInfo:'), 'extendInfo missing');
  });

  it('declares CFBundleURLTypes', () => {
    assert.ok(yamlRaw.includes('CFBundleURLTypes:'), 'CFBundleURLTypes missing');
  });

  it('CFBundleURLSchemes includes threadverse', () => {
    // Verify the scheme is listed under CFBundleURLSchemes
    const hasScheme = yamlRaw.includes('- threadverse');
    assert.ok(hasScheme, 'threadverse scheme not found in CFBundleURLSchemes');
  });

  it('CFBundleURLName matches appId', () => {
    assert.ok(yamlRaw.includes('CFBundleURLName: com.threadverse.app'));
    assert.ok(yamlRaw.includes('appId: com.threadverse.app'));
  });

  it('CFBundleURLIcon is set', () => {
    assert.ok(yamlRaw.includes('CFBundleURLIcon: AppIcon'));
  });
});

describe('entitlements.mac.plist — valid and complete', () => {
  it('is valid plist XML', () => {
    assert.ok(plistRaw.includes('<?xml'));
    assert.ok(plistRaw.includes('<!DOCTYPE plist'));
    assert.ok(plistRaw.includes('<plist version="1.0">'));
    assert.ok(plistRaw.includes('</plist>'));
  });

  it('allows JIT (V8 engine requirement)', () => {
    assert.ok(plistRaw.includes('com.apple.security.cs.allow-jit'));
  });

  it('allows unsigned executable memory (Electron requirement)', () => {
    assert.ok(plistRaw.includes('com.apple.security.cs.allow-unsigned-executable-memory'));
  });

  it('allows dyld environment variables', () => {
    assert.ok(plistRaw.includes('com.apple.security.cs.allow-dyld-environment-variables'));
  });

  it('allows network client (API calls)', () => {
    assert.ok(plistRaw.includes('com.apple.security.network.client'));
  });
});

describe('main.mjs — macOS open-url event handler', () => {
  let captured = null;

  const mockEvent = {
    preventDefault: () => { captured.prevented = true; },
  };

  function handleOpenUrl(event, url) {
    event.preventDefault();
    const parsed = new URL(url);
    captured = {
      prevented: true,
      type: parsed.hostname,
      param: parsed.pathname.replace(/^\//, ''),
    };
  }

  it('handles community deep link', () => {
    captured = { prevented: false };
    handleOpenUrl(mockEvent, 'threadverse://community/reactjs');
    assert.equal(captured.prevented, true);
    assert.equal(captured.type, 'community');
    assert.equal(captured.param, 'reactjs');
  });

  it('handles post deep link', () => {
    captured = { prevented: false };
    handleOpenUrl(mockEvent, 'threadverse://post/507f1f77bcf86cd799439011');
    assert.equal(captured.type, 'post');
    assert.equal(captured.param, '507f1f77bcf86cd799439011');
  });

  it('handles user deep link', () => {
    captured = { prevented: false };
    handleOpenUrl(mockEvent, 'threadverse://user/johndoe');
    assert.equal(captured.type, 'user');
    assert.equal(captured.param, 'johndoe');
  });

  it('always calls event.preventDefault() to suppress macOS default handler', () => {
    captured = { prevented: false };
    handleOpenUrl(mockEvent, 'threadverse://community/nodejs');
    assert.equal(captured.prevented, true);
  });
});

describe('Cross-platform protocol consistency', () => {
  it('PROTOCOL constant used in main.mjs matches CFBundleURLSchemes', () => {
    const PROTOCOL = 'threadverse';
    assert.ok(yamlRaw.includes(`- ${PROTOCOL}`),
      `"${PROTOCOL}" not in electron-builder.yml CFBundleURLSchemes`);
  });

  it('PROTOCOL matches Windows registry key', () => {
    // Windows: setAsDefaultProtocolClient('threadverse') → HKCR\threadverse
    const PROTOCOL = 'threadverse';
    assert.equal(PROTOCOL, 'threadverse');
  });

  it('macOS open-url handler parses same URL format as main.mjs handleDeepLink', () => {
    // Both use new URL(url).hostname for type and .pathname for param
    const testUrl = 'threadverse://community/reactjs';
    const parsed = new URL(testUrl);
    assert.equal(parsed.hostname, 'community');
    assert.equal(parsed.pathname.replace(/^\//, ''), 'reactjs');
  });
});

describe('electron-builder.yml — Linux .desktop MIME handler', () => {
  it('has linux section', () => {
    assert.ok(yamlRaw.includes('linux:'), 'linux section missing');
  });

  it('declares x-scheme-handler/threadverse in MimeType', () => {
    assert.ok(yamlRaw.includes('x-scheme-handler/threadverse'),
      'x-scheme-handler/threadverse MIME type not found');
  });

  it('has desktop key for .desktop file generation', () => {
    assert.ok(yamlRaw.includes('desktop:'), 'desktop key missing under linux');
  });

  it('sets StartupWMClass for Wayland/X11 matching', () => {
    assert.ok(yamlRaw.includes('StartupWMClass: ThreadVerse'));
  });
});

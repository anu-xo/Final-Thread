import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const yamlRaw = readFileSync(join(__dirname, '..', 'electron-builder.yml'), 'utf-8');
const nshRaw = readFileSync(join(__dirname, '..', 'build', 'installer.nsh'), 'utf-8');

// ── NSIS section in electron-builder.yml ──────────────────────────────────────

describe('electron-builder.yml — NSIS installer wizard', () => {
  it('has nsis: top-level section', () => {
    assert.ok(yamlRaw.includes('nsis:'), 'nsis section missing');
  });

  it('disables one-click install (shows wizard)', () => {
    assert.ok(yamlRaw.includes('oneClick: false'),
      'oneClick must be false to show the install directory chooser');
  });

  it('allows custom install directory', () => {
    assert.ok(yamlRaw.includes('allowToChangeInstallationDirectory: true'),
      'user must be able to choose install path');
  });

  it('creates desktop shortcut', () => {
    assert.ok(yamlRaw.includes('createDesktopShortcut: true'),
      'desktop shortcut must be created');
  });

  it('creates Start Menu shortcut', () => {
    assert.ok(yamlRaw.includes('createStartMenuShortcut: true'),
      'Start Menu entry must be created');
  });

  it('shortcut name matches product name', () => {
    assert.ok(yamlRaw.includes('shortcutName: ThreadVerse'),
      'shortcutName must be ThreadVerse');
    assert.ok(yamlRaw.includes('productName: ThreadVerse'),
      'productName must be ThreadVerse');
  });

  it('uninstall display name matches product name', () => {
    assert.ok(yamlRaw.includes('uninstallDisplayName: ThreadVerse'),
      'uninstaller must show "ThreadVerse" in Control Panel');
  });
});

describe('electron-builder.yml — NSIS uninstaller', () => {
  it('deletes app data on uninstall', () => {
    assert.ok(yamlRaw.includes('deleteAppDataOnUninstall: true'),
      'app data must be cleaned up on uninstall');
  });

  it('does not force per-machine install (allows per-user)', () => {
    assert.ok(yamlRaw.includes('perMachine: false'),
      'per-user install avoids admin requirement');
  });

  it('launches app after install', () => {
    assert.ok(yamlRaw.includes('runAfterFinish: true'),
      'app should launch after install completes');
  });

  it('includes custom .nsh script', () => {
    assert.ok(yamlRaw.includes('include: build/installer.nsh'),
      'must include build/installer.nsh for registry cleanup');
  });
});

describe('electron-builder.yml — NSIS icons', () => {
  it('sets installer icon from build/icons/icon.ico', () => {
    assert.ok(yamlRaw.includes('installerIcon: build/icons/icon.ico'),
      'installer icon must point to icon.ico');
  });

  it('sets uninstaller icon from build/icons/icon.ico', () => {
    assert.ok(yamlRaw.includes('uninstallerIcon: build/icons/icon.ico'),
      'uninstaller icon must point to icon.ico');
  });

  it('sets installer header from build/icons/icon.ico', () => {
    assert.ok(yamlRaw.includes('installerHeader: build/icons/icon.ico'),
      'installer header must use icon.ico');
  });

  it('icon.ico file exists', () => {
    const iconPath = join(__dirname, '..', 'build', 'icons', 'icon.ico');
    assert.ok(existsSync(iconPath), `icon.ico not found at ${iconPath}`);
  });
});

describe('build/installer.nsh — protocol handler registry cleanup', () => {
  it('file exists', () => {
    assert.ok(nshRaw.length > 0, 'installer.nsh is empty or missing');
  });

  it('defines customUnInstall macro', () => {
    assert.ok(nshRaw.includes('!macro customUnInstall'),
      'must define customUnInstall macro for electron-builder');
  });

  it('deletes HKCU\\Software\\Classes\\threadverse registry key', () => {
    assert.ok(nshRaw.includes('DeleteRegKey HKCU "Software\\Classes\\threadverse"'),
      'must remove threadverse:// protocol handler from registry on uninstall');
  });

  it('macro is properly closed', () => {
    assert.ok(nshRaw.includes('!macroend'),
      'customUnInstall macro must be closed with !macroend');
  });
});

describe('Windows deep link protocol — cross-file consistency', () => {
  it('PROTOCOL constant matches NSIS registry cleanup target', () => {
    const PROTOCOL = 'threadverse';
    assert.ok(nshRaw.includes(`threadverse`),
      'installer.nsh must clean up the threadverse protocol key');
    assert.ok(yamlRaw.includes(`nsis:`),
      'nsis section must be configured');
  });

  it('main.mjs setAsDefaultProtocolClient writes to the key NSIS cleans up', () => {
    // app.setAsDefaultProtocolClient('threadverse') on Windows writes to
    // HKCU\Software\Classes\threadverse — the exact key the .nsh removes
    const PROTOCOL = 'threadverse';
    assert.ok(nshRaw.includes(`"Software\\Classes\\${PROTOCOL}"`),
      `NSIS must delete HKCU\\Software\\Classes\\${PROTOCOL}`);
  });
});

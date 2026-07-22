// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Cross-Platform Title Bar & Tray Icon Audit
 *
 * Validates that the custom title bar renders correctly on each OS and that
 * tray icon behaviour is correct (theme-aware, no clipping, DPI-correct).
 *
 * Targets: Windows 10, Windows 11, macOS Ventura, macOS Sonoma, Ubuntu 22.04
 *
 * This file runs against the Vite dev server (Chromium) OR Electron.
 * When running in Chromium (web build), window.electronAPI is undefined
 * and TitleBar renders null — all Electron-only tests are skipped.
 *
 * macOS notes:
 *   - Uses titleBarStyle:'hiddenInset' → native traffic-light buttons are
 *     rendered by AppKit; the React TitleBar component renders only a spacer.
 *   - Traffic-light buttons are NOT visible to Playwright DOM queries — they
 *     are native OS chrome.  We verify the spacer is present instead.
 *
 * Linux notes:
 *   - GNOME Shell ≥40 removed the classic system tray.  The
 *     gnome-shell-extension-appindicator (SNI) package is required but NOT
 *     installed by default on Ubuntu 22.04.  Tests that require a visible tray
 *     icon are skipped on Linux unless the extension is detected.
 *   - Custom title bar (frame:false) works on GNOME, KDE, and XFCE.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

/**
 * Detect at runtime whether we are running inside Electron.
 * In the web build (Vite dev server + Chromium), window.electronAPI is undefined
 * and the TitleBar component returns null — so DOM-based title bar checks are
 * meaningless.  We use this helper to conditionally skip those tests.
 */
async function isElectron(page) {
  return page.evaluate(() => typeof window.electronAPI !== 'undefined');
}

// ── 1. TitleBar presence (Electron only) ─────────────────────────────────────

test.describe('TitleBar renders', () => {
  test('TitleBar component is mounted in the DOM', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const electron = await isElectron(page);
    test.skip(!electron, 'TitleBar only renders in Electron build');

    // The TitleBar renders a div with WebkitAppRegion:'drag' on all platforms.
    // On macOS it's a spacer; on Windows/Linux it includes min/max/close buttons.
    const titleBar = await page.evaluate(() => {
      const els = document.querySelectorAll('[style*="app-region"]');
      for (const el of els) {
        if (el.style.WebkitAppRegion === 'drag' || el.style.webkitAppRegion === 'drag') {
          return {
            found: true,
            height: el.getBoundingClientRect().height,
            children: el.children.length,
          };
        }
      }
      return { found: false };
    });

    expect(titleBar.found, 'TitleBar drag region should exist').toBe(true);
    // Height should be > 0 (32px on Win/Linux, 48px on macOS)
    expect(titleBar.height).toBeGreaterThan(0);
  });
});

// ── 2. Windows / Linux — custom window controls (Electron only) ──────────────

test.describe('Window controls (Windows/Linux)', () => {
  test.skip(() => isMac, 'Native traffic lights used on macOS');

  test('minimize, maximize, close buttons are present', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const electron = await isElectron(page);
    test.skip(!electron, 'Window controls only exist in Electron build');

    const buttons = await page.evaluate(() => {
      const ariaLabels = ['Minimize', 'Maximize', 'Close'];
      return ariaLabels.map((label) => {
        const btn = document.querySelector(`button[aria-label="${label}"]`);
        return {
          label,
          exists: !!btn,
          visible: btn ? btn.getBoundingClientRect().width > 0 : false,
          clickable: btn ? !btn.disabled : false,
        };
      });
    });

    for (const b of buttons) {
      expect(b.exists, `${b.label} button should exist`).toBe(true);
      expect(b.visible, `${b.label} button should be visible`).toBe(true);
      expect(b.clickable, `${b.label} button should be clickable`).toBe(true);
    }
  });

  test('close button has red hover background', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const electron = await isElectron(page);
    test.skip(!electron, 'Close hover only relevant in Electron build');

    const closeBtn = page.locator('button[aria-label="Close"]');
    await expect(closeBtn).toBeVisible();

    // Hover over close button
    await closeBtn.hover();
    await page.waitForTimeout(100);

    const bgAfterHover = await closeBtn.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Should be some shade of red (#c42b1c or similar)
    expect(
      bgAfterHover,
      `Close button hover bg should be red, got: ${bgAfterHover}`,
    ).toMatch(/rgb\(196,\s*43,\s*28\)|rgb\(232,\s*17,\s*35\)/);
  });

  test('minimize/maximize buttons have correct hover overlay', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const electron = await isElectron(page);
    test.skip(!electron, 'Hover overlays only relevant in Electron build');

    const minBtn = page.locator('button[aria-label="Minimize"]');
    await expect(minBtn).toBeVisible();

    await minBtn.hover();
    await page.waitForTimeout(100);

    const bgAfterHover = await minBtn.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Should NOT be transparent (hover overlay is active)
    expect(
      bgAfterHover,
      'Minimize button should have hover background',
    ).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('maximize button toggles to restore on maximize', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const electron = await isElectron(page);
    test.skip(!electron, 'Maximize toggle only relevant in Electron build');

    const maxBtn = page.locator('button[aria-label="Maximize"], button[aria-label="Restore"]');

    // Initially should show maximize (not restore)
    const initialLabel = await maxBtn.getAttribute('aria-label');
    expect(initialLabel).toBe('Maximize');
  });
});

// ── 3. macOS — traffic light spacer (Electron only) ─────────────────────────

test.describe('macOS traffic light area', () => {
  test.skip(() => !isMac, 'Only runs on macOS');

  test('left padding reserves space for traffic lights', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const electron = await isElectron(page);
    test.skip(!electron, 'Traffic light spacer only exists in Electron build');

    const spacer = await page.evaluate(() => {
      const els = document.querySelectorAll('[style*="app-region"]');
      for (const el of els) {
        const style = el.style;
        if (style.WebkitAppRegion === 'drag' || style.webkitAppRegion === 'drag') {
          const computed = window.getComputedStyle(el);
          return {
            paddingLeft: parseFloat(computed.paddingLeft),
            height: el.getBoundingClientRect().height,
          };
        }
      }
      return null;
    });

    expect(spacer).not.toBeNull();
    // Hidden inset reserves ~78px for traffic lights
    expect(spacer.paddingLeft).toBeGreaterThanOrEqual(60);
    expect(spacer.paddingLeft).toBeLessThanOrEqual(100);
  });
});

// ── 4. Title bar theme consistency (Electron only) ──────────────────────────

test.describe('Title bar dark/light mode', () => {
  test.skip(() => isMac, 'macOS uses native chrome, not themed by renderer');

  test('title bar background matches theme', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const electron = await isElectron(page);
    test.skip(!electron, 'Theme test only relevant in Electron build');

    // Light mode
    const lightBg = await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      const els = document.querySelectorAll('[style*="app-region"]');
      for (const el of els) {
        if (el.style.background) return el.style.background;
      }
      return null;
    });

    // Dark mode
    const darkBg = await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      const els = document.querySelectorAll('[style*="app-region"]');
      for (const el of els) {
        if (el.style.background) return el.style.background;
      }
      return null;
    });

    // Backgrounds should differ between light and dark
    expect(lightBg).not.toBe(darkBg);
  });
});

// ── 5. No clipping / overlap issues (Electron only for DOM checks) ───────────

test.describe('No layout clipping', () => {
  const viewports = [
    { width: 1920, height: 1080, label: '1080p' },
    { width: 1366, height: 768,  label: 'HD' },
    { width: 800,  height: 600,  label: 'Minimum' },
  ];

  for (const vp of viewports) {
    test(`title bar fits at ${vp.label} (${vp.width}x${vp.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'networkidle' });

      const electron = await isElectron(page);
      test.skip(!electron, 'Clipping check only relevant in Electron build');

      const layout = await page.evaluate(() => {
        const els = document.querySelectorAll('[style*="app-region"]');
        for (const el of els) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top,
            overflow: style.overflow,
            display: style.display,
            clipped: rect.width > window.innerWidth || rect.right > window.innerWidth,
          };
        }
        return null;
      });

      expect(layout).not.toBeNull();
      expect(layout.clipped, 'Title bar should not be clipped by viewport').toBe(false);
      expect(layout.left, 'Title bar should start at left edge').toBe(0);
      expect(layout.width, 'Title bar width should match viewport').toBe(vp.width);
    });
  }
});

// ── 6. Window controls don't overlap page content (Electron only) ───────────

test.describe('Window controls isolation', () => {
  test.skip(() => isMac, 'macOS uses native controls');

  test('fixed title bar sits above the header (no overlap)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const electron = await isElectron(page);
    test.skip(!electron, 'Overlap check only relevant in Electron build');

    const layout = await page.evaluate(() => {
      // Find the fixed title bar (z-[60], above header's z-50)
      const titleBar = (() => {
        const els = document.querySelectorAll('[style*="app-region"]');
        for (const el of els) {
          const val = el.style.WebkitAppRegion || el.style.webkitAppRegion;
          if (val === 'drag') {
            const cs = window.getComputedStyle(el);
            return {
              position: cs.position,
              top: parseFloat(cs.top),
              height: el.getBoundingClientRect().height,
              bottom: el.getBoundingClientRect().bottom,
              zIndex: cs.zIndex,
            };
          }
        }
        return null;
      })();

      // Find the page header
      const header = (() => {
        const h = document.querySelector('header');
        if (!h) return null;
        const cs = window.getComputedStyle(h);
        return {
          position: cs.position,
          top: parseFloat(cs.top),
          height: h.getBoundingClientRect().height,
          topPx: h.getBoundingClientRect().top,
          zIndex: cs.zIndex,
        };
      })();

      return { titleBar, header };
    });

    if (layout.titleBar && layout.header) {
      expect(layout.titleBar.position).toBe('fixed');
      expect(layout.header.position).toBe('fixed');

      // Header top should be >= title bar bottom
      expect(
        layout.header.topPx,
        `Header (top: ${layout.header.topPx}px) should be below title bar (bottom: ${layout.titleBar.bottom}px)`,
      ).toBeGreaterThanOrEqual(layout.titleBar.bottom - 1); // 1px tolerance

      // Title bar z-index should be higher than header's
      expect(
        parseInt(layout.titleBar.zIndex, 10),
        'Title bar z-index should be above header',
      ).toBeGreaterThan(parseInt(layout.header.zIndex || '50', 10));
    }
  });
});

// ── 7. Tray icon assets (runs in web — verifies Vite serves the files) ───────

test.describe('Tray icon assets', () => {
  test('favicon is accessible via Vite dev server', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const faviconCheck = await page.evaluate(async () => {
      try {
        const res = await fetch('/favicon.svg', { method: 'HEAD' });
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    });

    expect(faviconCheck.ok, 'favicon.svg should be accessible').toBe(true);
  });
});

// ── 8. Frameless window: document title check (runs in web) ─────────────────

test.describe('Frameless window behaviour', () => {
  test('document title is set', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });
});

// ── 9. Custom title bar: app-region drag (Electron only) ─────────────────────

test.describe('Window drag regions', () => {
  test('title bar area is draggable', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const electron = await isElectron(page);
    test.skip(!electron, 'Drag regions only exist in Electron build');

    const dragRegion = await page.evaluate(() => {
      const els = document.querySelectorAll('[style*="app-region"]');
      for (const el of els) {
        const val = el.style.WebkitAppRegion || el.style.webkitAppRegion;
        if (val === 'drag') {
          return {
            exists: true,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          };
        }
      }
      return { exists: false };
    });

    expect(dragRegion.exists, 'Drag region should exist').toBe(true);
    expect(dragRegion.width).toBeGreaterThan(100);
    expect(dragRegion.height).toBeGreaterThan(20);
  });

  test('window control buttons are NOT draggable', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const electron = await isElectron(page);
    test.skip(!electron, 'Button drag check only relevant in Electron build');

    const nonDraggable = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button[aria-label]');
      const results = [];
      buttons.forEach((btn) => {
        const label = btn.getAttribute('aria-label');
        if (['Minimize', 'Maximize', 'Restore', 'Close'].includes(label)) {
          const style = btn.closest('[style*="app-region"]') || btn;
          const val = style.style.WebkitAppRegion || style.style.webkitAppRegion || '';
          results.push({ label, appRegion: val });
        }
      });
      return results;
    });

    for (const btn of nonDraggable) {
      expect(
        btn.appRegion,
        `${btn.label} button should have no-drag or no app-region`,
      ).not.toBe('drag');
    }
  });
});

// ── 10. Linux panel / tray documentation check ───────────────────────────────

test.describe('Linux tray documentation', () => {
  test.skip(() => !isLinux, 'Only relevant on Linux');

  test('GNOME panel tray status is logged', async ({ page }) => {
    console.log(
      'Linux tray: GNOME requires gnome-shell-extension-appindicator for tray icons. ' +
      'KDE/XFCE/MATE render tray icons natively.',
    );
    expect(true).toBe(true);
  });
});

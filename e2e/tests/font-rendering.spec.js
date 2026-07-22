// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Font Rendering Audit
 *
 * Validates that Inter (or the configured fallback stack) renders consistently
 * across target environments and detects FOUT / FOIT regressions.
 *
 * Targets: Windows 10, Windows 11, macOS Ventura, macOS Sonoma, Ubuntu 22.04
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pages known to exercise headings, body text, and UI chrome */
const AUDIT_PAGES = [
  { path: '/',            label: 'Landing' },
  { path: '/login',       label: 'Login' },
  { path: '/register',    label: 'Register' },
];

/** CSS font-family stack expected on <body> */
const EXPECTED_STACK_RE =
  /Inter.*ui-sans-serif.*system-ui.*-apple-system/i;

const BODY_SELECTOR = 'body';
const HEADING_SELECTORS = ['h1', 'h2', 'h3'];
const UI_TEXT_SELECTORS = ['button', 'label', 'p', 'span'];

// ── 1. Font-family stack audit ──────────────────────────────────────────────

test.describe('Font-family stack', () => {
  for (const { path, label } of AUDIT_PAGES) {
    test(`${label} — body uses Inter fallback stack`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      const fontFamily = await page.evaluate(() => {
        return window.getComputedStyle(document.body).fontFamily;
      });

      expect(fontFamily).toMatch(EXPECTED_STACK_RE);
    });
  }
});

// ── 2. Inter font loading verification ──────────────────────────────────────

test.describe('Inter font loaded', () => {
  for (const { path, label } of AUDIT_PAGES) {
    test(`${label} — Inter font face is active`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      const interLoaded = await page.evaluate(() => {
        return document.fonts.check('16px Inter');
      });

      expect(interLoaded, `Inter font should be loaded on ${label} page`).toBe(true);
    });
  }
});

// ── 3. FOUT detection (Flash of Unstyled Text) ──────────────────────────────
//    Strategy: navigate, immediately measure body computed font-family before
//    fonts finish loading. If it matches the fallback stack prefix but does NOT
//    yet contain "Inter" as the first family, FOUT is occurring.

test.describe('FOUT detection', () => {
  for (const { path, label } of AUDIT_PAGES) {
    test(`${label} — no FOUT: Inter resolves quickly`, async ({ page }) => {
      // Collect font-family snapshots as the page loads
      const fontSnapshots = await page.evaluate(async (targetPath) => {
        const snapshots = [];
        const body = document.body;

        // If already loaded, nothing to detect
        if (document.fonts.check('16px Inter')) {
          return { fout: false, snapshots: ['Inter already loaded'] };
        }

        // Sample font-family every 16ms for up to 2s
        const start = Date.now();
        let sawFallback = false;
        while (Date.now() - start < 2000) {
          const ff = window.getComputedStyle(body).fontFamily;
          snapshots.push(ff);
          if (!ff.startsWith('Inter')) sawFallback = true;
          if (document.fonts.check('16px Inter')) break;
          await new Promise((r) => setTimeout(r, 16));
        }

        return { fout: sawFallback, snapshots };
      }, path);

      // Allow a brief FOUT window (< 200ms) but flag sustained fallback usage
      if (fontSnapshots.fout) {
        // Count how many samples were NOT Inter
        const fallbackCount = fontSnapshots.snapshots.filter(
          (s) => !s.startsWith('Inter'),
        ).length;
        const totalSamples = fontSnapshots.snapshots.length;
        const fallbackRatio = fallbackCount / totalSamples;

        // If > 30% of samples used fallback, flag as FOUT regression
        expect(
          fallbackRatio,
          `FOUT detected on ${label}: ${(fallbackRatio * 100).toFixed(1)}% of samples used fallback font`,
        ).toBeLessThan(0.3);
      }
    });
  }
});

// ── 4. FOIT detection (Flash of Invisible Text) ─────────────────────────────
//    Strategy: check if any text elements become invisible (opacity: 0 or
//    visibility: hidden or zero dimensions) during font loading.

test.describe('FOIT detection', () => {
  for (const { path, label } of AUDIT_PAGES) {
    test(`${label} — no invisible text during font load`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });

      // Wait a tick for potential FOIT
      await page.waitForTimeout(500);

      const invisibleText = await page.evaluate(() => {
        const issues = [];
        const elements = document.querySelectorAll('h1, h2, h3, p, span, button, a, label');
        elements.forEach((el) => {
          const style = window.getComputedStyle(el);
          const text = el.textContent?.trim();
          if (!text) return;

          const isHidden =
            style.opacity === '0' ||
            style.visibility === 'hidden' ||
            style.display === 'none' ||
            (el.offsetWidth === 0 && el.offsetHeight === 0);

          if (isHidden && text.length > 0) {
            issues.push({
              tag: el.tagName,
              text: text.substring(0, 50),
              opacity: style.opacity,
              visibility: style.visibility,
              display: style.display,
              dimensions: `${el.offsetWidth}x${el.offsetHeight}`,
            });
          }
        });
        return issues;
      });

      expect(
        invisibleText,
        `FOIT detected on ${label}: ${invisibleText.length} invisible text elements`,
      ).toHaveLength(0);
    });
  }
});

// ── 5. Font metrics consistency across viewports ────────────────────────────
//    Ensures font rendering doesn't break at common breakpoints.

test.describe('Font consistency across viewports', () => {
  const viewports = [
    { width: 1920, height: 1080, label: '1080p' },
    { width: 1366, height: 768,  label: 'HD' },
    { width: 768,  height: 1024, label: 'Tablet' },
    { width: 375,  height: 667,  label: 'Mobile' },
  ];

  for (const { path, label: pageLabel } of AUDIT_PAGES.slice(0, 1)) {
    for (const vp of viewports) {
      test(`${pageLabel} @ ${vp.label} (${vp.width}x${vp.height}) — Inter renders at expected size`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(path, { waitUntil: 'networkidle' });

        const metrics = await page.evaluate(() => {
          const body = document.body;
          const computed = window.getComputedStyle(body);
          return {
            fontFamily: computed.fontFamily,
            fontSize: parseFloat(computed.fontSize),
            lineHeight: parseFloat(computed.lineHeight),
            fontWeight: computed.fontWeight,
          };
        });

        // Inter should be the active font
        expect(metrics.fontFamily).toMatch(/Inter/);

        // Font size should be browser default (16px) unless overridden
        expect(metrics.fontSize).toBeGreaterThanOrEqual(12);
        expect(metrics.fontSize).toBeLessThanOrEqual(24);

        // Line height should be reasonable (1.0–2.5 × font size)
        expect(metrics.lineHeight / metrics.fontSize).toBeGreaterThan(1.0);
        expect(metrics.lineHeight / metrics.fontSize).toBeLessThan(2.5);
      });
    }
  }
});

// ── 6. Computed font-weight audit ───────────────────────────────────────────
//    Verify that bold/semibold headings actually use the Inter weight files
//    we ship, not synthetic browser bolding.

test.describe('Font weight rendering', () => {
  test('headings use expected font weights', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const headingWeights = await page.evaluate(() => {
      const results = [];
      for (const sel of HEADING_SELECTORS) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const style = window.getComputedStyle(el);
        results.push({
          selector: sel,
          text: el.textContent?.trim().substring(0, 40),
          fontWeight: style.fontWeight,
          fontFamily: style.fontFamily,
        });
      }
      return results;
    });

    for (const h of headingWeights) {
      // Headings should be 600–800 weight
      const weight = parseInt(h.fontWeight, 10);
      expect(
        weight,
        `${h.selector} ("${h.text}") has unexpected weight ${h.fontWeight}`,
      ).toBeGreaterThanOrEqual(600);
      expect(weight).toBeLessThanOrEqual(800);

      // Should use Inter, not fall back
      expect(h.fontFamily).toMatch(/Inter/);
    }
  });
});

// ── 7. Font file integrity — all @font-face rules resolve ───────────────────

test.describe('Font file integrity', () => {
  test('no 404s on font file requests', async ({ page }) => {
    const failedRequests = [];

    page.on('requestfailed', (request) => {
      if (request.resourceType() === 'font') {
        failedRequests.push({
          url: request.url(),
          failure: request.failure()?.errorText,
        });
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    expect(
      failedRequests,
      `Font file requests failed: ${JSON.stringify(failedRequests)}`,
    ).toHaveLength(0);
  });

  test('font files load within 2s', async ({ page }) => {
    const fontTimings = [];

    page.on('response', (response) => {
      if (response.url().includes('.woff2') || response.url().includes('.woff')) {
        fontTimings.push({
          url: response.url(),
          status: response.status(),
          timing: response.request().timing(),
        });
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    for (const ft of fontTimings) {
      expect(ft.status, `Font ${ft.url} returned ${ft.status}`).toBe(200);
      expect(
        ft.timing.responseEnd,
        `Font ${ft.url} took ${ft.timing.responseEnd}ms`,
      ).toBeLessThan(2000);
    }
  });
});

// ── 8. Cross-page font consistency ──────────────────────────────────────────
//    Same page, multiple navigations — font should stay consistent.

test.describe('Cross-page font consistency', () => {
  test('font-family stays Inter across navigation', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const fontStacks = [];

    for (const { path } of AUDIT_PAGES) {
      await page.goto(path, { waitUntil: 'networkidle' });
      const ff = await page.evaluate(() =>
        window.getComputedStyle(document.body).fontFamily,
      );
      fontStacks.push({ path, fontFamily: ff });
    }

    // All pages should have identical font-family
    const unique = new Set(fontStacks.map((f) => f.fontFamily));
    expect(
      unique.size,
      `Font stacks differ across pages: ${[...unique].join(' | ')}`,
    ).toBe(1);
  });
});

// ── 9. Font size scaling — no unexpected user-zoom issues ───────────────────

test.describe('Font size baseline', () => {
  test('body font-size is 16px at default zoom', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const fontSize = await page.evaluate(() => {
      return parseFloat(window.getComputedStyle(document.body).fontSize);
    });

    expect(fontSize).toBe(16);
  });
});

// ── 10. Electron-specific: custom protocol font loading ─────────────────────
//    In production builds, fonts are served via electron:// protocol.

test.describe('Electron font protocol', () => {
  test.skip(({ }, testInfo) => {
    // Only run in electron project
    return testInfo.project.name !== 'electron';
  });

  test('fonts load via electron:// protocol', async ({ page }) => {
    const fontRequests = [];

    page.on('request', (request) => {
      if (request.resourceType() === 'font') {
        fontRequests.push(request.url());
      }
    });

    await page.goto('electron://./index.html', { waitUntil: 'networkidle' });

    for (const url of fontRequests) {
      expect(url, `Font loaded from unexpected origin: ${url}`).toMatch(
        /electron:\/\//,
      );
    }
  });
});

// ── 11. Linux fallback chain validation ──────────────────────────────────────
//    On Ubuntu, Inter is typically NOT installed system-wide. This test verifies
//    that the bundled @fontsource/inter woff2 files load correctly and that the
//    CSS fallback chain provides legible rendering even before the web font
//    arrives. Also validates that system default fonts (Ubuntu, Noto Sans)
//    don't cause layout shift when they briefly appear as fallback.

test.describe('Linux fallback chain', () => {
  test('bundled Inter loads regardless of system font availability', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Check that the bundled Inter woff2 was actually requested
    const fontSource = await page.evaluate(async () => {
      const fonts = [...document.fonts];
      const interFonts = fonts.filter((f) => f.family === 'Inter');
      return {
        count: interFonts.length,
        weights: interFonts.map((f) => f.weight),
        statuses: interFonts.map((f) => f.status),
      };
    });

    expect(
      fontSource.count,
      'At least one Inter weight should be loaded from @fontsource',
    ).toBeGreaterThan(0);

    // All loaded Inter faces should have status "loaded"
    for (const status of fontSource.statuses) {
      expect(status).toBe('loaded');
    }
  });

  test('fallback stack is legible when system Inter is absent', async ({
    page,
  }) => {
    // Temporarily hide the bundled Inter to simulate system-only rendering
    await page.goto('/', { waitUntil: 'networkidle' });

    const fallbackMetrics = await page.evaluate(() => {
      // Block the bundled Inter font by overriding the @font-face
      const style = document.createElement('style');
      style.textContent = `
        @font-face {
          font-family: 'Inter';
          src: url('data:font/woff2;base64,INVALID') format('woff2');
        }
      `;
      document.head.appendChild(style);

      // Force re-render with invalid font
      const body = document.body;
      body.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';
      void body.offsetWidth; // force reflow

      const computed = window.getComputedStyle(body);
      return {
        fontFamily: computed.fontFamily,
        fontSize: parseFloat(computed.fontSize),
        lineHeight: parseFloat(computed.lineHeight),
      };
    });

    // Even with broken Inter, fallback stack should provide reasonable metrics
    expect(fallbackMetrics.fontSize).toBeGreaterThanOrEqual(14);
    expect(fallbackMetrics.fontSize).toBeLessThanOrEqual(20);
    expect(fallbackMetrics.lineHeight / fallbackMetrics.fontSize).toBeGreaterThan(1.0);
    expect(fallbackMetrics.lineHeight / fallbackMetrics.fontSize).toBeLessThan(2.5);
  });

  test('no layout shift after font swap completes', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Measure layout metrics immediately
    const earlyMetrics = await page.evaluate(() => {
      const measure = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height, top: rect.top };
      };
      return {
        h1: measure('h1'),
        body: measure('body'),
      };
    });

    // Wait for fonts to fully load
    await page.waitForFunction(() => document.fonts.ready.then(() => true), {
      timeout: 5000,
    });
    await page.waitForTimeout(200); // allow reflow

    const lateMetrics = await page.evaluate(() => {
      const measure = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height, top: rect.top };
      };
      return {
        h1: measure('h1'),
        body: measure('body'),
      };
    });

    // Compare — allow <5% shift (natural reflow is acceptable)
    if (earlyMetrics.h1 && lateMetrics.h1) {
      const widthShift =
        Math.abs(lateMetrics.h1.width - earlyMetrics.h1.width) /
        earlyMetrics.h1.width;
      expect(
        widthShift,
        `H1 layout shifted ${(widthShift * 100).toFixed(1)}% after font swap`,
      ).toBeLessThan(0.05);
    }
  });

  test('font-display swap prevents invisible text on Linux', async ({ page }) => {
    // Navigate and immediately check for visibility
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const visibilityReport = await page.evaluate(() => {
      const body = document.body;
      const style = window.getComputedStyle(body);

      return {
        opacity: style.opacity,
        visibility: style.visibility,
        fontFamily: style.fontFamily,
        textIndent: style.textIndent,
        overflow: style.overflow,
      };
    });

    // Body text must be visible from first paint
    expect(visibilityReport.opacity).not.toBe('0');
    expect(visibilityReport.visibility).not.toBe('hidden');
    expect(visibilityReport.textIndent).not.toBe('-9999px');
  });
});

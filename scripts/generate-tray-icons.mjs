#!/usr/bin/env node
/**
 * scripts/generate-tray-icons.mjs
 *
 * Generates all tray icon variants from the base tray-icon.png.
 *
 * Usage:
 *   node scripts/generate-tray-icons.mjs
 *
 * Requirements:
 *   pnpm add -D sharp   (already in devDependencies)
 *
 * Output (packages/desktop/assets/):
 *
 *   macOS (template image — monochrome, auto-inverted by AppKit):
 *     tray-iconTemplate.png       18×18  (1x)
 *     tray-iconTemplate@2x.png   36×36  (2x Retina)
 *
 *   Windows / Linux (explicit light/dark variants):
 *     tray-icon-dark.png          16×16  (1x, for light taskbars)
 *     tray-icon-dark@2x.png       32×32  (2x, for light taskbars on HiDPI)
 *     tray-icon-light.png         16×16  (1x, for dark taskbars)
 *     tray-icon-light@2x.png      32×32  (2x, for dark taskbars on HiDPI)
 *
 * The base tray-icon.png (and its @2x) are kept as-is for fallback.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'packages', 'desktop', 'assets');
const BASE_ICON = join(ASSETS_DIR, 'tray-icon.png');

/**
 * sharp composite with a solid-colour overlay.
 * Returns a Buffer of the composited image.
 */
async function compositeColour(sharpInstance, r, g, b, a) {
  return sharpInstance
    .composite([{
      input: Buffer.from([r, g, b, a]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
    }])
    .png()
    .toBuffer();
}

async function generate() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('sharp is not installed.  Run:  pnpm add -D sharp');
    process.exit(1);
  }

  const input = await readFile(BASE_ICON);
  const meta = await sharp(input).metadata();
  console.log(`Base icon: ${meta.width}×${meta.height} (${meta.format})`);

  // ── macOS template image ────────────────────────────────────────────────
  // A template image should be monochrome (grayscale or single-channel alpha).
  // We desaturate to grayscale and output at 18pt (menu bar standard) and 36pt
  // (2x Retina).  AppKit uses the alpha channel and ignores colour, then
  // auto-inverts based on the menu-bar appearance.
  for (const [suffix, size] of [['', 18], ['@2x', 36]]) {
    const buf = await sharp(input)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .greyscale()
      .normalise()
      .png()
      .toBuffer();

    await writeFile(join(ASSETS_DIR, `tray-iconTemplate${suffix}.png`), buf);
    console.log(`→ tray-iconTemplate${suffix}.png  (${size}×${size})`);
  }

  // ── Windows / Linux dark icon (for light taskbars) ──────────────────────
  // Dark glyph on transparent background.  We darken the base icon by
  // compositing a black layer at 65% opacity.
  for (const [suffix, size] of [['', 16], ['@2x', 32]]) {
    const buf = await compositeColour(
      sharp(input).resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      }),
      0, 0, 0, 166, // 65% black
    );

    await writeFile(join(ASSETS_DIR, `tray-icon-dark${suffix}.png`), buf);
    console.log(`→ tray-icon-dark${suffix}.png  (${size}×${size})`);
  }

  // ── Windows / Linux light icon (for dark taskbars) ──────────────────────
  // Light glyph on transparent background.  We lighten by compositing a
  // white layer at 80% opacity.
  for (const [suffix, size] of [['', 16], ['@2x', 32]]) {
    const buf = await compositeColour(
      sharp(input).resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      }),
      255, 255, 255, 204, // 80% white
    );

    await writeFile(join(ASSETS_DIR, `tray-icon-light${suffix}.png`), buf);
    console.log(`→ tray-icon-light${suffix}.png  (${size}×${size})`);
  }

  console.log('\nDone. 8 tray icons generated (4 base + 4 @2x).');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});

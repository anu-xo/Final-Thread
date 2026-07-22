#!/usr/bin/env node
/**
 * scripts/generate-tray-icons.mjs
 *
 * Generates light and dark tray icon variants from the base tray-icon.png.
 *
 * macOS uses a template image (setTemplateImage=true) so no variants are needed.
 * Windows 10+ auto-tints monochrome tray icons, but explicit variants give
 * full control over the appearance.
 *
 * Usage:
 *   node scripts/generate-tray-icons.mjs
 *
 * Requirements:
 *   npm install sharp   (already in devDependencies)
 *
 * Output (packages/desktop/assets/):
 *   tray-icon-dark.png    — dark icon for light taskbars (16×16, 1x)
 *   tray-icon-light.png   — light icon for dark taskbars (16×16, 1x)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'packages', 'desktop', 'assets');
const BASE_ICON = join(ASSETS_DIR, 'tray-icon.png');

async function generate() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error(
      'sharp is not installed. Run: pnpm add -D sharp',
    );
    process.exit(1);
  }

  const input = await readFile(BASE_ICON);
  const meta = await sharp(input).metadata();
  console.log(`Base icon: ${meta.width}×${meta.height} (${meta.format})`);

  // --- Dark icon (for light taskbars): darken the image ----------------------
  // Strategy: composite a black layer at 70% opacity to darken all pixels,
  // then trim alpha to keep the shape.
  const dark = await sharp(input)
    .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .composite([{
      input: Buffer.from([0, 0, 0, 180]), // 70% black
      raw: { width: 1, height: 1, channels: 4 },
      tile: { anchor: 'east' },
    }])
    .png()
    .toBuffer();

  await writeFile(join(ASSETS_DIR, 'tray-icon-dark.png'), dark);
  console.log('→ tray-icon-dark.png');

  // --- Light icon (for dark taskbars): lighten the image ---------------------
  // Strategy: composite a white layer at 80% opacity.
  const light = await sharp(input)
    .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .composite([{
      input: Buffer.from([255, 255, 255, 200]), // 80% white
      raw: { width: 1, height: 1, channels: 4 },
      tile: { anchor: 'east' },
    }])
    .png()
    .toBuffer();

  await writeFile(join(ASSETS_DIR, 'tray-icon-light.png'), light);
  console.log('→ tray-icon-light.png');

  console.log('Done. Tray icons generated.');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});

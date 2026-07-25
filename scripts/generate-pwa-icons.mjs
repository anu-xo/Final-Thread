#!/usr/bin/env node
/**
 * scripts/generate-pwa-icons.mjs
 *
 * Generates PWA icons from the master icon source.
 * Outputs 192×192, 512×512, and maskable 512×512 variants.
 *
 * Usage:
 *   node scripts/generate-pwa-icons.mjs
 *
 * Source:
 *   packages/desktop/build-assets/icon-source.png
 *
 * Output (packages/web/public/icons/):
 *   icon-192.png          192×192  (standard PWA)
 *   icon-512.png          512×512  (standard PWA)
 *   icon-maskable-512.png 512×512  (Android adaptive — 80% safe zone)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_SOURCE = join(__dirname, '..', 'packages', 'desktop', 'build-assets', 'icon-source.png');
const OUTPUT_DIR = join(__dirname, '..', 'packages', 'web', 'public', 'icons');

async function generate() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('sharp is not installed.  Run:  pnpm add -D sharp');
    process.exit(1);
  }

  const input = await readFile(ICON_SOURCE);
  const meta = await sharp(input).metadata();
  console.log(`Source icon: ${meta.width}×${meta.height} (${meta.format})`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  // ── Standard PWA icons (contain fit — icon sized to fit within canvas) ────
  for (const size of [192, 512]) {
    const buf = await sharp(input)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    const outPath = join(OUTPUT_DIR, `icon-${size}.png`);
    await writeFile(outPath, buf);
    console.log(`→ icon-${size}.png  (${size}×${size})`);
  }

  // ── Maskable icon (80% safe zone — icon fills 80% of canvas, 10% padding each side) ─
  const maskableSize = 512;
  const safeZone = Math.round(maskableSize * 0.8);
  const offset = Math.round((maskableSize - safeZone) / 2);

  const iconBuf = await sharp(input)
    .resize(safeZone, safeZone, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // Create transparent canvas and composite icon centered
  const maskableBuf = await sharp({
    create: {
      width: maskableSize,
      height: maskableSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: iconBuf,
      left: offset,
      top: offset,
    }])
    .png()
    .toBuffer();

  const maskablePath = join(OUTPUT_DIR, 'icon-maskable-512.png');
  await writeFile(maskablePath, maskableBuf);
  console.log(`→ icon-maskable-512.png  (${maskableSize}×${maskableSize}, 80% safe zone)`);

  console.log(`\nDone. 3 PWA icons generated in ${OUTPUT_DIR}`);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});

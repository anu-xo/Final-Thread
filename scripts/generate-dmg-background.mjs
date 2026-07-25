#!/usr/bin/env node
/**
 * scripts/generate-dmg-background.mjs
 *
 * Generates a DMG background image for the macOS installer.
 * Renders the app icon, product name, and "Drag to Applications" instruction
 * onto a clean gradient canvas.
 *
 * Usage:
 *   node scripts/generate-dmg-background.mjs
 *
 * Output:
 *   packages/desktop/build-assets/dmg-background.png  (1080×660 @1x)
 *
 * The background dimensions target a 560×400 DMG window at 2x Retina.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_SOURCE = join(__dirname, '..', 'packages', 'desktop', 'build-assets', 'icon-source.png');
const OUTPUT_DIR = join(__dirname, '..', 'packages', 'desktop', 'build-assets');
const OUTPUT_FILE = join(OUTPUT_DIR, 'dmg-background.png');

// Canvas dimensions (2x of 560×400 DMG window)
const WIDTH = 1080;
const HEIGHT = 660;

// Layout positions (centered)
const ICON_SIZE = 192;
const ICON_X = (WIDTH - ICON_SIZE) / 2;
const ICON_Y = 100;

const TEXT_Y = ICON_Y + ICON_SIZE + 32;
const ARROW_Y = TEXT_Y + 80;

async function generate() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('sharp is not installed.  Run:  pnpm add -D sharp');
    process.exit(1);
  }

  const iconBuffer = await readFile(ICON_SOURCE);
  const iconMeta = await sharp(iconBuffer).metadata();
  console.log(`Icon source: ${iconMeta.width}×${iconMeta.height} (${iconMeta.format})`);

  // ── Gradient background ──────────────────────────────────────────────────
  // Create a subtle vertical gradient from #1a1a2e (top) to #16213e (bottom)
  const gradientSvg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1a1a2e"/>
          <stop offset="100%" stop-color="#16213e"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    </svg>
  `;

  const bgBuffer = await sharp(Buffer.from(gradientSvg))
    .png()
    .toBuffer();

  // ── App icon ─────────────────────────────────────────────────────────────
  const iconResized = await sharp(iconBuffer)
    .resize(ICON_SIZE, ICON_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // ── Product name text ────────────────────────────────────────────────────
  const nameSvg = `
    <svg width="${WIDTH}" height="60" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${WIDTH / 2}"
        y="40"
        text-anchor="middle"
        font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="44"
        font-weight="600"
        fill="#ffffff"
      >ThreadVerse</text>
    </svg>
  `;

  const nameBuffer = await sharp(Buffer.from(nameSvg))
    .png()
    .toBuffer();

  // ── "Drag to Applications" instruction ───────────────────────────────────
  const instructionSvg = `
    <svg width="${WIDTH}" height="80" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${WIDTH / 2}"
        y="30"
        text-anchor="middle"
        font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="28"
        font-weight="400"
        fill="#a0aec0"
      >Drag to Applications</text>
      <text
        x="${WIDTH / 2}"
        y="68"
        text-anchor="middle"
        font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="22"
        font-weight="400"
        fill="#718096"
      >to install</text>
    </svg>
  `;

  const instructionBuffer = await sharp(Buffer.from(instructionSvg))
    .png()
    .toBuffer();

  // ── Arrow pointing right (toward Applications folder) ────────────────────
  const arrowSvg = `
    <svg width="80" height="40" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 20 L55 20 M45 10 L55 20 L45 30"
        stroke="#a0aec0"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
    </svg>
  `;

  const arrowBuffer = await sharp(Buffer.from(arrowSvg))
    .png()
    .toBuffer();

  // ── Composite all layers ─────────────────────────────────────────────────
  const result = await sharp(bgBuffer)
    .composite([
      {
        input: iconResized,
        left: Math.round(ICON_X),
        top: ICON_Y,
      },
      {
        input: nameBuffer,
        left: 0,
        top: TEXT_Y,
      },
      {
        input: instructionBuffer,
        left: 0,
        top: ARROW_Y,
      },
      {
        input: arrowBuffer,
        left: Math.round((WIDTH - 80) / 2),
        top: ARROW_Y + 48,
      },
    ])
    .png()
    .toBuffer();

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, result);

  const outputMeta = await sharp(result).metadata();
  console.log(`\nDone. DMG background: ${outputMeta.width}×${outputMeta.height}`);
  console.log(`Output: ${OUTPUT_FILE}`);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});

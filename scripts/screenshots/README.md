# Store Screenshots Guide

## Directory Structure

```
scripts/screenshots/
├── output/
│   ├── windows/          # Windows 11 — MSIX/NSIS screenshots
│   │   ├── 01-home-feed.png
│   │   ├── 02-community-page.png
│   │   ├── 03-ai-chat.png
│   │   ├── 04-admin-dashboard.png
│   │   └── 05-settings.png
│   ├── macos/            # macOS — MAS/DMG screenshots
│   │   ├── 01-home-feed.png
│   │   ├── 02-community-page.png
│   │   ├── 03-ai-chat.png
│   │   ├── 04-admin-dashboard.png
│   │   └── 05-settings.png
│   └── linux/            # Linux — Flatpak/Snap screenshots
│       ├── 01-home-feed.png
│       ├── 02-community-page.png
│       ├── 03-ai-chat.png
│       ├── 04-admin-dashboard.png
│       └── 05-settings.png
├── captureScreenshots.js     # Playwright automation script
├── capture-all.ps1           # Master orchestrator (all platforms)
├── capture-windows.ps1       # Windows-specific capture
├── capture-unix.sh           # macOS/Linux capture
├── data/                     # (reserved for static test fixtures)
└── README.md                 # This file
```

## Screenshot Specifications

| Property       | Value                                   |
|----------------|-----------------------------------------|
| Resolution     | 1280x800 (minimum), 2560x1600 (Retina) |
| Format         | PNG, lossless                           |
| Device scale   | 2x (Retina-quality screenshots)        |
| Background     | App default (light theme)               |
| Demo data      | Seeded via `seedScreenshots.js`         |
| Login          | admin / Demo1234!                       |
| Seed seed      | mulberry32(20260725) — deterministic    |

## Screenshots per Store

### Microsoft Store (MSIX)
- Use `output/windows/` screenshots
- Minimum 1 screenshot required, 5 recommended
- Maximum 20 screenshots
- No promotional video required for initial submission

### Mac App Store (MAS)
- Use `output/macos/` screenshots
- Required: at least 1 screenshot per device type
- Mac: 1280x800 minimum
- App Store Connect accepts up to 10 screenshots per device

### Flathub
- Use `output/linux/` screenshots
- Referenced in `flatpak/org.threadverse.app.metainfo.xml` `<screenshots>` section
- Host on a public URL (e.g., GitHub raw or your CDN)
- Recommended: 2-5 screenshots showing key features

### Snap Store
- Use `output/linux/` screenshots
- Upload via Snapcraft dashboard
- Minimum 1, recommended 3-5
- Maximum 12 screenshots

## Screenshots to Capture

| #   | Screen           | URL Path              | What to show                                               |
|-----|------------------|-----------------------|------------------------------------------------------------|
| 01  | Home Feed        | `/home`               | Post list with votes, comments, community badges           |
| 02  | Community Page   | `/community/reactjs`  | Community header, rules, post list                         |
| 03  | AI Chat          | `/ai/chat?community=reactjs` | Chat panel with AI response and citations            |
| 04  | Admin Dashboard  | `/admin`              | Stats, user management, platform overview                  |
| 05  | Settings         | `/settings`           | User preferences, theme toggle, notification settings      |

## Quick Start

### Automated (recommended)

```bash
# Seed + capture on current platform
cd packages/server && node src/scripts/seedScreenshots.js && cd ../..
node scripts/screenshots/captureScreenshots.js

# Or use platform-specific scripts
# Windows:
.\scripts\screenshots\capture-windows.ps1

# macOS/Linux:
./scripts/screenshots/capture-unix.sh
```

### Full pipeline (all 15 screenshots)

```bash
# Capture on each platform for complete store listing set
# Windows:
.\scripts\screenshots\capture-all.ps1

# macOS:
./scripts/screenshots/capture-unix.sh --platform macos

# Linux:
./scripts/screenshots/capture-unix.sh --platform linux
```

### Manual capture

If Playwright automation does not work:

1. Seed: `cd packages/server && node src/scripts/seedScreenshots.js`
2. Start: `pnpm dev` (from root)
3. Open browser at `http://localhost:5173`
4. Log in as `admin` / `Demo1234!`
5. Navigate to each screen and take a screenshot at 1280x800
6. Save to `scripts/screenshots/output/{platform}/`

## Deterministic Seed

The `seedScreenshots.js` script uses a deterministic PRNG (mulberry32 with seed `20260725`) so that the exact same data appears on every platform run. This ensures:

- Same post titles, scores, and timestamps
- Same user accounts and community structures
- Identical UI state for coherent cross-platform store listings

## Store Listing Text

### Short Description (100 chars)
Reddit-style community platform with AI-powered RAG chat

### Keywords
community, chat, forum, discussion, reddit, ai, chatgpt, moderation, discussion-board, open-source

### Categories
- Primary: Social Networking
- Secondary: Developer Tools, Productivity

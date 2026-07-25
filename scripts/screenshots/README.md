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
├── captureScreenshots.js # Playwright automation script
└── README.md             # This file
```

## Screenshot Specifications

| Property | Value |
|----------|-------|
| Resolution | 1280×800 (minimum), 2560×1600 (Retina) |
| Format | PNG, lossless |
| Background | App default (light or dark theme) |
| Demo data | Seeded via `seedScreenshots.js` |
| Login | admin / Demo1234! |

## Screenshots per Store

### Microsoft Store (MSIX)
- Use `output/windows/` screenshots
- Minimum 1 screenshot required, 5 recommended
- Maximum 20 screenshots
- No promotional video required for initial submission

### Mac App Store (MAS)
- Use `output/macos/` screenshots
- Required: at least 1 screenshot per device type
- iPhone: 6.7", 6.5", 5.5" (not applicable for desktop)
- Mac: 1280×800 minimum
- App Store Connect accepts up to 10 screenshots per device

### Flathub
- Use `output/linux/` screenshots
- Reference in `metainfo.xml` `<screenshots>` section
- Host on a public URL (e.g., GitHub raw or your CDN)
- Recommended: 2-5 screenshots showing key features

### Snap Store
- Use `output/linux/` screenshots
- Upload via Snapcraft dashboard
- Minimum 1, recommended 3-5
- Maximum 12 screenshots

## Capture Workflow

### 1. Seed demo data
```bash
cd packages/server
node src/scripts/seedScreenshots.js
```

### 2. Start the server
```bash
cd packages/server
node src/main.mjs
```

### 3. Start the web client
```bash
cd packages/web
pnpm dev
```

### 4. Run the capture script
```bash
# Windows
node scripts/screenshots/captureScreenshots.js

# macOS
node scripts/screenshots/captureScreenshots.js

# Linux
node scripts/screenshots/captureScreenshots.js
```

### 5. Verify output
```bash
# Check that all 5 screenshots exist per platform
ls -la scripts/screenshots/output/windows/
ls -la scripts/screenshots/output/macos/
ls -la scripts/screenshots/output/linux/
```

## Manual Capture (if automation fails)

If Playwright automation does not work, capture manually:

1. Seed demo data: `node src/scripts/seedScreenshots.js`
2. Start server + web client
3. Open app in browser at `http://localhost:5173`
4. Log in as `admin` / `Demo1234!`
5. Navigate to each screen and take a screenshot at 1280×800
6. Save to `scripts/screenshots/output/{platform}/`

### Screenshots to capture:

| # | Screen | URL Path | What to show |
|---|--------|----------|--------------|
| 01 | Home Feed | `/feed` | Post list with votes, comments, community badges |
| 02 | Community Page | `/community/reactjs` | Community header, rules, post list |
| 03 | AI Chat | `/community/reactjs/chat` | Chat panel with AI response and citations |
| 04 | Admin Dashboard | `/admin` | Stats, user management, platform overview |
| 05 | Settings | `/settings` | User preferences, theme toggle, notification settings |

## Store Listing Text

### Short Description (100 chars)
Reddit-style community platform with AI-powered RAG chat

### Long Description (4000 chars)
ThreadVerse is a modern community discussion platform that brings together forums, real-time chat, and AI-powered assistance.

Key features:
- Create and join communities on any topic
- Rich text posts with voting and comments
- AI chat assistant that understands your community's context
- Real-time notifications and activity feeds
- Content moderation powered by AI
- Weekly digest emails with community highlights
- Cross-platform: Web, Desktop (Windows, macOS, Linux), and Mobile

Built with the MERN stack (MongoDB, Express, React, Node.js) and Electron for cross-platform desktop support.

### Keywords
community, chat, forum, discussion, reddit, ai, chatgpt, moderation, discussion-board, open-source

### Categories
- Primary: Social Networking
- Secondary: Developer Tools, Productivity

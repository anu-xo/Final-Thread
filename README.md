# ⚡ ThreadVerse

A Reddit-style community platform with AI chat, built with pure MERN stack.
Available as a web app and native desktop app (Windows, macOS, Linux).

## Tech Stack
- **Frontend**: React 18 + Vite + TailwindCSS v4 + React Query + Zustand
- **Backend**: Node.js + Express + Mongoose
- **Database**: MongoDB Atlas (M0 free) + Upstash Redis
- **AI**: Google Gemini (text-embedding-004 + 2.5 Flash) + Groq fallback
- **Desktop**: Electron + electron-vite + electron-builder

## Prerequisites
- Node.js 20 LTS
- pnpm (`npm install -g pnpm`)
- MongoDB Atlas account (free M0 cluster)
- Upstash Redis account (free tier)

## Setup

### 1. Clone and install
```bash
git clone https://github.com/anu-xo/Final-Thread.git
cd Final-Thread
pnpm install
```

### 2. Configure environment
```bash
cp packages/server/.env.example packages/server/.env
# Edit .env with your Atlas URI, Upstash URL, JWT secrets, Gemini API key
```

### 3. Run web development
```bash
# Terminal 1: Backend (from repo root)
pnpm --filter server dev

# Terminal 2: Frontend (from repo root)
pnpm --filter web dev
```

### 4. Run desktop development
```bash
# Requires web dev server already running on :5173
pnpm --filter desktop dev
```

## Project Structure
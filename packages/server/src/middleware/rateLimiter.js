import rateLimit from 'express-rate-limit';

// ── Auth endpoints (login, register) ─────────────────────────────────────────
// 15 requests per 15 minutes per IP — generous for legit users, kills brute-force.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 15,                      // 15 attempts per window
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Write endpoints (create post, community, comment) ────────────────────────
// 30 requests per 15 minutes — prevents spam while allowing active users.
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Vote endpoints ───────────────────────────────────────────────────────────
// 60 requests per 15 minutes — voting is frequent but should still be bounded.
export const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many votes. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Upload endpoints ─────────────────────────────────────────────────────────
// 10 requests per 15 minutes — image uploads are expensive.
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many upload requests. Please wait.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── General API read endpoints (search, browse) ──────────────────────────────
// 100 requests per 15 minutes — generous for normal browsing.
export const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { redis } from '../config/redis.js';
import { authMiddleware } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { logActivity } from '../middleware/activityLog.js';

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Why two tokens?
// - Access token: short-lived (15min), stored in Zustand memory. If stolen, useless quickly.
// - Refresh token: long-lived (7d), stored in httpOnly cookie. Can't be read by JS (XSS-safe).
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
};

// Why store refresh token in a cookie with these exact options?
// - httpOnly: JS cannot read it → immune to XSS attacks
// - secure: only sent over HTTPS in production
// - sameSite strict: prevents CSRF — cookie won't be sent on cross-origin requests
// - maxAge 7d: matches token expiry so cookie and token expire together
const setRefreshCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
};

// ─── POST /auth/register ──────────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate inputs
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Check duplicates
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      const field = existing.email === email ? 'email' : 'username';
      return res.status(409).json({ error: `That ${field} is already taken.` });
    }

    // Why cost factor 12 for bcrypt?
    // Cost factor doubles hashing time per increment. 12 takes ~250ms on modern hardware —
    // slow enough that brute-forcing a stolen hash database is impractical,
    // fast enough that normal logins feel instant.
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, passwordHash });

    const { accessToken, refreshToken } = generateTokens(user._id);

    // Store refresh token hash in user document (for rotation/blacklist validation)
    await User.findByIdAndUpdate(user._id, {
      $push: { refreshTokens: refreshToken }
    });

    setRefreshCookie(res, refreshToken);

    logActivity('user.registered', req, { userId: user._id });

    res.status(201).json({
      accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        karma: user.karma,
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      // Why the same error for wrong email vs wrong password?
      // "User not found" tells an attacker valid emails. Generic message leaks nothing.
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    await User.findByIdAndUpdate(user._id, {
      $push: { refreshTokens: refreshToken }
    });

    setRefreshCookie(res, refreshToken);

    logActivity('user.login', req, { userId: user._id });

    res.json({
      accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        karma: user.karma,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
// Why: On every page refresh, Zustand state (which held the access token in memory)
// is wiped. The client calls /auth/me with the refresh cookie to re-establish session.
// authMiddleware verifies the access token from the Authorization header.
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash -refreshTokens');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
// Why: Called automatically by the Axios 401 interceptor (built on Day 2).
// When the access token expires, the interceptor hits this endpoint, gets a fresh
// access token, and retries the original request — invisible to the user.
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token.' });
    }

    // Why check Redis blacklist BEFORE verifying the token?
    // A blacklisted token might still be cryptographically valid (not expired yet).
    // We must check the blacklist first, otherwise a stolen blacklisted token could
    // slip through the JWT verify step.
    const isBlacklisted = await redis.get(`blacklist:${refreshToken}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token revoked.' });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const user = await User.findById(payload.userId);
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      return res.status(401).json({ error: 'Refresh token not recognised.' });
    }

    // TOKEN ROTATION: blacklist old token, issue new pair
    // Why TTL of 7 days on the blacklist entry?
    // Once the old refresh token expires naturally (7d), it can't be used anyway.
    // Keeping it in Redis beyond that wastes memory, so TTL matches token lifetime.
    await redis.set(`blacklist:${refreshToken}`, '1', 'EX', 7 * 24 * 60 * 60);
    await User.findByIdAndUpdate(payload.userId, {
      $pull: { refreshTokens: refreshToken }
    });

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(payload.userId);
    await User.findByIdAndUpdate(payload.userId, {
      $push: { refreshTokens: newRefreshToken }
    });

    setRefreshCookie(res, newRefreshToken);
    res.json({ accessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
      // Blacklist the refresh token so it can never be reused
      await redis.set(`blacklist:${refreshToken}`, '1', 'EX', 7 * 24 * 60 * 60);
      await User.findByIdAndUpdate(req.user.userId, {
        $pull: { refreshTokens: refreshToken }
      });
    }

    // Clear the cookie from the browser
    res.clearCookie('refreshToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed.' });
  }
});

// ─── GET /api/desktop/version ─────────────────────────────────────────────────
// Why: Electron app calls this on startup. If the installed version is below `minimum`,
// the app shows a forced-update modal and blocks usage until updated.
router.get('/desktop/version', (req, res) => {
  res.json({
    minimum: '1.0.0',
    latest: '1.0.0',
    downloadUrl: 'https://github.com/your-username/threadverse/releases/latest',
  });
});

export default router;
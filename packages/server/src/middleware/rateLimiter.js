import rateLimit from 'express-rate-limit';

// Why: Auth endpoints are the #1 target for brute-force attacks.
// 15 requests per 15 minutes per IP is very generous for legit users
// but kills bots trying thousands of password combinations.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 15,                      // 15 attempts per window
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
  standardHeaders: true,        // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
});
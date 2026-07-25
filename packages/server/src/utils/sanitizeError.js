// packages/server/src/utils/sanitizeError.js

/**
 * Sanitize error messages for client responses.
 *
 * In development, raw error messages are returned for debugging.
 * In production/test, only safe generic messages are sent — never
 * stack traces, MongoDB query details, or internal paths.
 *
 * @param {Error} err - The caught error
 * @param {string} fallback - Generic fallback message
 * @returns {string} Safe error message for the client
 */
export function sanitizeError(err, fallback = 'Internal server error') {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    return err.message || fallback;
  }

  // In production, never leak:
  // - MongoDB query errors (can expose collection names, indexes)
  // - JWT verification errors (can expose secret existence)
  // - File system errors (can expose paths)
  // - Any error with a stack trace that hints at internals

  const msg = (err.message || '').toLowerCase();

  // Mongoose/MongoDB errors — return generic message
  if (err.name === 'ValidationError' || err.name === 'CastError' || err.code) {
    return fallback;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return 'Authentication error';
  }

  // Rate limit / too many requests
  if (err.status === 429) {
    return 'Too many requests. Please try again later.';
  }

  // Known operational errors — safe to show
  if (err.status && err.status < 500) {
    return err.message || fallback;
  }

  // 500+ errors — always generic
  return fallback;
}

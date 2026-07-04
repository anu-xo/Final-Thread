// utils/scoring.js
// Pure functions — no DB access — so they're easy to unit test.

const Z = 1.96; // 95% confidence for Wilson lower bound
const HOT_DECAY_HOURS = 36; // tune: lower = faster drop-off
const RISING_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Wilson score lower bound for a Bernoulli parameter (upvote ratio).
 * Favors posts with more total votes over posts with few votes but 100% upvoted.
 */
export function wilsonScore(ups, downs) {
  const n = ups + downs;
  if (n === 0) return 0;

  const phat = ups / n;
  const numerator =
    phat + (Z * Z) / (2 * n) - Z * Math.sqrt((phat * (1 - phat) + (Z * Z) / (4 * n)) / n);
  const denominator = 1 + (Z * Z) / n;

  return numerator / denominator;
}

/**
 * Hot score = Wilson confidence score decayed exponentially by age.
 * Recompute this every time a vote is cast on the post.
 */
export function computeHotScore(ups, downs, createdAt) {
  const wilson = wilsonScore(ups, downs);
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  const decay = Math.exp(-ageHours / HOT_DECAY_HOURS);
  return wilson * decay;
}

/**
 * Rising score = net vote velocity over the last 6 hours.
 * voteLog: [{ value: 1 | -1, at: Date }]
 * Trims entries older than the window as a side effect and returns
 * { risingScore, trimmedLog } so the caller can persist the trimmed array.
 */
export function computeRisingScore(voteLog, createdAt) {
  const now = Date.now();
  const windowStart = now - RISING_WINDOW_MS;

  const trimmedLog = (voteLog || []).filter(
    (v) => new Date(v.at).getTime() >= windowStart
  );

  const netVotesInWindow = trimmedLog.reduce((sum, v) => sum + v.value, 0);

  const ageHours = (now - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  // Use whichever is smaller: post age or the 6h window, so brand-new posts
  // don't get an artificially inflated velocity from dividing by a tiny number.
  const hoursElapsed = Math.max(Math.min(ageHours, 6), 0.25); // floor at 15 min

  const risingScore = netVotesInWindow / hoursElapsed;

  return { risingScore, trimmedLog };
}

/**
 * Cursor helpers for keyset pagination on a non-_id sort field.
 * Cursor encodes { v: <sortFieldValue>, id: <_id> } so ties on the sort
 * field are broken deterministically by _id.
 */
export function encodeCursor(sortValue, id) {
  const payload = JSON.stringify({ v: sortValue, id: id.toString() });
  return Buffer.from(payload, "utf8").toString("base64");
}

export function decodeCursor(cursor) {
  try {
    const payload = Buffer.from(cursor, "base64").toString("utf8");
    return JSON.parse(payload);
  } catch (err) {
    return null;
  }
}
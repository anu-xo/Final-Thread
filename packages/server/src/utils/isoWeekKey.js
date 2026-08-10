// utils/isoWeekKey.js
// Shared ISO-week key used by both digest phases so the cache key written in
// phase 1 (`neo:digest:community:{id}:{weekKey}`) is read back identically in
// phase 2. Mirrors the Monday-9am cron cadence.
export function currentIsoWeekKey() {
  // e.g. "2026-W32" — matches the Monday-9am cron cadence
  const d = new Date();
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

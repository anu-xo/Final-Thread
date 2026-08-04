// Curated community accent swatch. Mods pick ONE key per community from this
// set (never a free-form color picker) so the app stays visually consistent.
// Keys must match `COMMUNITY_ACCENT_KEYS` on the server Community model and
// the palette tokens in index.css where they exist.
export const COMMUNITY_ACCENTS = [
  { key: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { key: 'pink',   label: 'Pink',   hex: '#ec4899' },
  { key: 'cyan',   label: 'Cyan',   hex: '#38bdf8' },
  { key: 'mint',   label: 'Mint',   hex: '#34d399' },
  { key: 'amber',  label: 'Amber',  hex: '#fbbf24' },
  { key: 'rose',   label: 'Rose',   hex: '#fb7185' },
];

export const DEFAULT_ACCENT = 'violet';

export function accentByKey(key) {
  return COMMUNITY_ACCENTS.find((a) => a.key === key) ?? COMMUNITY_ACCENTS[0];
}

export function accentHex(key) {
  return accentByKey(key).hex;
}

// Converts a #rrggbb hex into an rgba() string at the given alpha (0–1),
// so accent-tinted fills (borders, backgrounds) work with inline styles.
export function accentRgba(key, alpha = 1) {
  const hex = accentHex(key);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

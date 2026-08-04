// packages/web/src/components/AuroraBackground.jsx
//
// Ambient fixed color mesh behind page content. Renders three large,
// heavily blurred radial-gradient blobs in the Midnight Aurora palette
// (violet / pink / cyan), each 40–60vw wide with asymmetric, overlapping
// placement so the blurred edges blend into one organic mesh.
//
// Each blob drifts on an independent 70–100s ease-in-out loop in CSS
// (drift-a/b/c, different durations so they never sync). Under
// prefers-reduced-motion the blobs freeze into the static mesh. Sits at
// z-index 0 via `.aurora-bg`; page content is wrapped at z-index 10+.
//
// Pass a `blobs` array to compose a custom scene (e.g. a bolder Login
// variant with larger blobs and per-blob `--blob-opacity`).

const DEFAULT_BLOBS = [
  { color: 'violet', style: { top: '-12%', left: '-10%', width: '56vw', height: '56vw' } },
  { color: 'pink', style: { top: '28%', right: '-14%', width: '48vw', height: '48vw' } },
  { color: 'cyan', style: { bottom: '-18%', left: '12%', width: '52vw', height: '52vw' } },
];

export default function AuroraBackground({ blobs = DEFAULT_BLOBS }) {
  return (
    <div className="aurora-bg" aria-hidden="true">
      {blobs.map((blob) => (
        <span
          key={blob.color}
          className={`aurora-blob aurora-blob--${blob.color}`}
          style={blob.style}
        />
      ))}
    </div>
  );
}


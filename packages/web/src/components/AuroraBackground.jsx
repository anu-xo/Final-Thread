// packages/web/src/components/AuroraBackground.jsx
//
// Ambient fixed color mesh behind all page content. Renders three large,
// heavily blurred radial-gradient blobs in the Midnight Aurora palette
// (violet / pink / cyan), each 40–60vw wide with asymmetric, overlapping
// placement so the blurred edges blend into one organic mesh.
//
// Static by design — no hover/click/state trigger and no animation, so the
// reduced-motion kill-switch has nothing to disable. Sits at z-index 0 via
// `.aurora-bg`; App.jsx wraps all page content at z-index 10+ above it.

const BLOBS = [
  { color: 'violet', style: { top: '-12%', left: '-10%', width: '56vw', height: '56vw' } },
  { color: 'pink', style: { top: '28%', right: '-14%', width: '48vw', height: '48vw' } },
  { color: 'cyan', style: { bottom: '-18%', left: '12%', width: '52vw', height: '52vw' } },
];

export default function AuroraBackground() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      {BLOBS.map((blob) => (
        <span
          key={blob.color}
          className={`aurora-blob aurora-blob--${blob.color}`}
          style={blob.style}
        />
      ))}
    </div>
  );
}

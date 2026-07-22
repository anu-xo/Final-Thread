// packages/web/src/components/TitleBar.jsx
//
// Platform-specific title bar:
//
// macOS — titleBarStyle:'hiddenInset' renders native traffic-light buttons
//   (close / minimise / zoom) in the top-left.  The renderer only needs to
//   reserve horizontal padding so page content doesn't slide under them.
//   No custom buttons are drawn.
//
// Windows — Fully custom title bar with Fluent-style controls:
//   Minimise (—), Maximise/Restore (☐/❐), Close (✕).
//   Hover states match the Windows 10/11 convention:
//     • Min/Max hover → light translucent overlay
//     • Close hover   → red (#c42b1c) background, white glyph
//
// Linux — Same custom bar as Windows.  GNOME / KDE / XFCE have no strong
//   tray/title-bar conventions, so matching the Windows pattern is the
//   least-surprising choice.  The -webkit-app-region:drag property provides
//   window dragging on all Linux DEs that support it.
import { useState, useEffect, useCallback } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';

const platform =
  typeof window !== 'undefined' && window.electronAPI?.platform
    ? window.electronAPI.platform
    : 'web';

/** macOS traffic-light padding (pixels). These match hiddenInset defaults. */
const MACOS_PADDING_LEFT = 78;
const MACOS_TITLE_HEIGHT = 48;

/**
 * Windows / Linux custom title bar buttons.
 * Hover colours follow the Windows 10/11 Fluent convention:
 *   • Min / Max → rgba(0,0,0,0.06)  (light) / rgba(255,255,255,0.08) (dark)
 *   • Close     → #c42b1c (red), white glyph
 */
function WinLinuxTitleBar({ isDark }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);

  useEffect(() => {
    if (platform === 'web') return;
    const unsub = window.electronAPI?.onWindowStateChange?.(setIsMaximized);
    return () => unsub?.();
  }, []);

  const btnBase =
    'w-[46px] h-[32px] flex items-center justify-center transition-colors duration-75';
  const closeBtnBase =
    'w-[46px] h-[32px] flex items-center justify-center transition-colors duration-75';

  // Fluent hover overlays (light / dark variants)
  const hoverBg =
    hoveredButton === 'close'
      ? 'bg-[#c42b1c]'
      : isDark
        ? 'bg-white/10'
        : 'bg-black/[0.06]';

  const closeHoverBg =
    hoveredButton === 'close'
      ? 'bg-[#c42b1c]'
      : isDark
        ? 'bg-white/10'
        : 'bg-black/[0.06]';

  const iconColor = isDark ? 'text-white' : 'text-gray-900';
  const closeIconColor = hoveredButton === 'close' ? 'text-white' : iconColor;

  return (
    <div
      className="flex items-center justify-end shrink-0"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <button
        onClick={() => window.electronAPI?.minimizeWindow()}
        onMouseEnter={() => setHoveredButton('min')}
        onMouseLeave={() => setHoveredButton(null)}
        className={btnBase}
        style={{
          background: hoveredButton === 'min' ? hoverBg : 'transparent',
          WebkitAppRegion: 'no-drag',
        }}
        aria-label="Minimize"
      >
        <Minus size={14} className={iconColor} strokeWidth={1.5} />
      </button>

      <button
        onClick={() => window.electronAPI?.maximizeWindow()}
        onMouseEnter={() => setHoveredButton('max')}
        onMouseLeave={() => setHoveredButton(null)}
        className={btnBase}
        style={{
          background: hoveredButton === 'max' ? hoverBg : 'transparent',
          WebkitAppRegion: 'no-drag',
        }}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? (
          <Copy size={12} className={iconColor} strokeWidth={1.5} />
        ) : (
          <Square size={12} className={iconColor} strokeWidth={1.5} />
        )}
      </button>

      <button
        onClick={() => window.electronAPI?.closeWindow()}
        onMouseEnter={() => setHoveredButton('close')}
        onMouseLeave={() => setHoveredButton(null)}
        className={closeBtnBase}
        style={{
          background: hoveredButton === 'close' ? closeHoverBg : 'transparent',
          WebkitAppRegion: 'no-drag',
        }}
        aria-label="Close"
      >
        <X size={14} className={closeIconColor} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/**
 * macOS — just a drag region + left padding so content clears the
 * traffic-light buttons.  No custom close/min/max buttons are rendered;
 * the OS handles them natively via titleBarStyle:'hiddenInset'.
 */
function MacOSTitleBar() {
  return (
    <div
      className="flex items-center shrink-0"
      style={{
        WebkitAppRegion: 'drag',
        paddingLeft: MACOS_PADDING_LEFT,
        height: MACOS_TITLE_HEIGHT,
      }}
    />
  );
}

export default function TitleBar({ pageTitle }) {
  const isDesktop = typeof window !== 'undefined' && window.electronAPI !== undefined;

  // Detect dark mode from the <html> class (set by uiStore / inline script)
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  if (!isDesktop) return null;

  if (platform === 'darwin') {
    return <MacOSTitleBar />;
  }

  // Windows / Linux — custom title bar with min/max/close buttons
  return (
    <div
      className="flex items-center justify-between select-none shrink-0"
      style={{
        WebkitAppRegion: 'drag',
        height: 32,
        background: isDark ? '#1a1a1d' : '#ffffff',
        borderBottom: `1px solid ${isDark ? '#2a2a2d' : '#e5e7eb'}`,
      }}
    >
      {/* Left spacer — drag region */}
      <div className="flex-1 px-3 text-xs truncate" style={{ color: isDark ? '#a1a1aa' : '#71717a' }}>
        {pageTitle || 'ThreadVerse'}
      </div>

      {/* Right — window controls */}
      <WinLinuxTitleBar isDark={isDark} />
    </div>
  );
}

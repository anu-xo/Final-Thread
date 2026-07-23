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
//
// ── OS-Native Chrome (cannot respect Tailwind dark mode) ────────────────────
//
// The following elements are rendered by the OS, not the web renderer, and
// therefore CANNOT use Tailwind `dark:` classes or CSS custom properties.
// They are documented here as "expected behavior" — not bugs.
//
// 1. macOS traffic-light buttons (close / minimize / zoom)
//    — Rendered by AppKit via titleBarStyle:'hiddenInset'.
//    — Symbol color and background are set via Electron's setTitleBarOverlay()
//      in main.mjs, using nativeTheme.shouldUseDarkColors to toggle.
//    — These buttons automatically follow the macOS system appearance.
//
// 2. macOS titleBarOverlay area
//    — The 48px-high region behind the traffic-light buttons.
//    — Background and symbol color are set in main.mjs on theme:changed IPC.
//    — Cannot be styled with CSS — it's native OS chrome.
//
// 3. Windows title bar (when using Electron default frame)
//    — We use frame:false, so this is NOT present in our app.
//    — Our custom WinLinuxTitleBar component replaces it entirely.
//
// 4. Windows taskbar overlay icon (badge count)
//    — Set via win.setOverlayIcon() in main.mjs.
//    — The badge is a 16x16 PNG; the OS renders it on the taskbar icon.
//    — Taskbar icon tinting is automatic on Win10+ (monochrome auto-invert).
//
// 5. macOS dock badge
//    — Set via app.dock.setBadge() in main.mjs.
//    — The OS renders the badge text on the dock icon.
//
// 6. System tray context menu
//    — Built with Menu.buildFromTemplate() in main.mjs.
//    — The OS renders the menu using native widgets (Win: Win32 menus,
//      macOS: NSMenu, Linux: GTK/Qt menus).
//    — No CSS or Tailwind can style these — they follow the OS theme.
//
// 7. Native OS notifications
//    — Electron Notification API on macOS/Windows, libnotify on Linux.
//    — Styled by the OS notification center, not the web app.
//    — Dark/light appearance follows the OS theme automatically.
//
// 8. Electron dialog boxes (file picker, alerts)
//    — Use dialog.showOpenDialog() / dialog.showMessageBox() in main.mjs.
//    — These are native OS dialogs and follow the system theme.
//
// All of the above are by-design.  The custom title bar (WinLinuxTitleBar)
// IS styled via Tailwind dark: classes because it's rendered in the web
// renderer.  The inline `style=` attributes with hardcoded hex values are
// properly toggled via the `isDark` boolean derived from a MutationObserver
// on document.documentElement.classList.
import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';

const platform =
  typeof window !== 'undefined' && window.electronAPI?.platform
    ? window.electronAPI.platform
    : 'web';

/** macOS traffic-light padding (pixels). These match hiddenInset defaults. */
const MACOS_PADDING_LEFT = 78;
const MACOS_TITLE_HEIGHT = 48;
const WIN_LINUX_TITLE_HEIGHT = 32;

/**
 * Sets a CSS custom property on <html> so that the Header and AppLayout can
 * offset their content below the title bar without prop drilling.
 *
 *   --tv-titlebar-h   total height of the title bar region (px)
 *   --tv-platform      'darwin' | 'win32' | 'linux' | 'web'
 */
function useTitleBarCSSVar(height) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--tv-titlebar-h', `${height}px`);
    root.style.setProperty('--tv-platform', platform);
    return () => {
      root.style.removeProperty('--tv-titlebar-h');
      root.style.removeProperty('--tv-platform');
    };
  }, [height]);
}

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
 *
 * The titleBarOverlay reserves space at the OS level, so the CSS var
 * is set to 0 — the Header stays at top-0.
 */
function MacOSTitleBar() {
  useTitleBarCSSVar(0);

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
  // Fixed at the very top; z-[60] ensures it sits above the Header (z-50).
  // The CSS var --tv-titlebar-h is read by Header and AppLayout.
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between select-none shrink-0"
      style={{
        WebkitAppRegion: 'drag',
        height: WIN_LINUX_TITLE_HEIGHT,
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

      {/* Set CSS var so Header/AppLayout can offset below this bar */}
      <TitleBarCSSVarSetter height={WIN_LINUX_TITLE_HEIGHT} />
    </div>
  );
}

/**
 * Renders nothing visible — only sets --tv-titlebar-h on mount.
 * Placed inside the title bar div so it's part of the React tree.
 */
function TitleBarCSSVarSetter({ height }) {
  useTitleBarCSSVar(height);
  return null;
}

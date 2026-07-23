# Dark Mode — Cross-Platform QA Tracking Table

## How to Use

1. Toggle dark mode in Settings (or set to "System" and toggle OS preference)
2. Walk through each row below on every target OS
3. Mark the cell with: **P** (pass), **F** (fail), **N/A** (not applicable)
4. Log any failures in the `Issues` column

---

## QA Tracking Table

| Item | Win10 | Win11 | macOS Ventura | macOS Sonoma | Ubuntu 22.04 | Notes |
|------|-------|-------|---------------|--------------|--------------|-------|
| **Font rendering** | | | | | | |
| Body text legible in dark mode | | | | | | |
| Headings legible in dark mode | | | | | | |
| Monospace/code blocks legible | | | | | | |
| **Tray icon** | | | | | | |
| Tray icon visible on dark taskbar | | | | | | Uses explicit light PNG for dark taskbars |
| Tray icon visible on light taskbar | | | | | | Uses explicit dark PNG for light taskbars |
| Tray icon swaps on theme change | | | | | | Swapped via `nativeTheme` listener |
| Tray context menu renders correctly | | | | | | OS-native menu, not styled by CSS |
| **Title bar** | | | | | | |
| Background toggles with dark mode | | | | | | `#1a1a1d` dark / `#ffffff` light |
| Border toggles with dark mode | | | | | | `#2a2a2d` dark / `#e5e7eb` light |
| Page title text legible | | | | | | `#a1a1aa` dark / `#71717a` light |
| Min/Max hover overlay correct | | | | | | `rgba(0,0,0,0.06)` light / `rgba(255,255,255,0.1)` dark |
| Close button hover red (#c42b1c) | | | | | | Same in both themes (Fluent convention) |
| macOS traffic-light symbols match theme | | | | | | `symbolColor` synced via `setTitleBarOverlay` |
| macOS titlebar background matches theme | | | | | | `backgroundColor` synced via `setTitleBarOverlay` |
| **Notifications** | | | | | | |
| Test notification fires | | | | | | Via Settings → Send test notification |
| Notification uses native center | | | | | | macOS: Notification Center, Win: Action Center |
| Linux uses libnotify or notify-send | | | | | | Fallback chain: libnotify → notify-send → unsupported |
| Click notification navigates correctly | | | | | | `notification:show` IPC with `targetUrl` |
| **Dark mode toggle** | | | | | | |
| Theme persists across restarts (desktop) | | | | | | Stored via `electron-store` |
| Theme persists across page reloads (web) | | | | | | Stored via `localStorage` |
| No flash-of-wrong-theme on load | | | | | | Inline `<script>` in `index.html` adds `.dark` before React |
| System theme following works | | | | | | Listens to `prefers-color-scheme` media query |
| **Header** | | | | | | |
| Background toggles dark/light | | | | | | `bg-white dark:bg-neutral-900` |
| Border toggles dark/light | | | | | | `border-gray-200 dark:border-neutral-700` |
| Search input legible in dark mode | | | | | | `bg-gray-50 dark:bg-neutral-800` |
| Dropdown menu dark background | | | | | | `bg-white dark:bg-neutral-800` |
| User avatar area legible | | | | | | |
| **Feed (HomePage)** | | | | | | |
| Sort pill buttons toggle correctly | | | | | | Active: orange, inactive: `bg-gray-100 dark:bg-neutral-700` |
| Loading skeleton card dark background | | | | | | `bg-white dark:bg-neutral-800` |
| Error state dark background | | | | | | `bg-red-50 dark:bg-red-900/20` |
| Welcome card gradient dark mode | | | | | | `from-orange-50 dark:from-orange-900/20` |
| **Post cards** | | | | | | |
| Card background toggles | | | | | | `bg-white dark:bg-neutral-800` |
| Title text legible | | | | | | `text-gray-900 dark:text-neutral-100` |
| Meta text legible | | | | | | `text-gray-500 dark:text-neutral-400` |
| Community tag dark background | | | | | | `bg-gray-100 dark:bg-neutral-700` |
| Image placeholder dark background | | | | | | `bg-gray-50 dark:bg-neutral-900` |
| Comment link hover visible | | | | | | `hover:text-gray-700 dark:hover:text-neutral-200` |
| **Search modal** | | | | | | |
| Modal backdrop visible | | | | | | `bg-black/50` (always dark) |
| Modal body dark background | | | | | | `bg-gray-50 dark:bg-neutral-900` |
| Result cards dark background | | | | | | `bg-white dark:bg-neutral-800` |
| Empty state legible | | | | | | |
| Input field legible | | | | | | |
| **Profile page** | | | | | | |
| Profile card dark background | | | | | | `bg-white dark:bg-neutral-800` |
| Karma/Role stat boxes dark | | | | | | `bg-gray-50 dark:bg-neutral-700` |
| Tab pills toggle correctly | | | | | | Active: orange, inactive: dark neutral |
| Comment cards dark background | | | | | | `bg-white dark:bg-neutral-800` |
| Load more button dark styling | | | | | | `bg-white dark:bg-neutral-800` |
| Empty state dark background | | | | | | |
| **Login / Register** | | | | | | |
| Page background dark | | | | | | `bg-gray-50 dark:bg-neutral-900` |
| Form card dark background | | | | | | `bg-white dark:bg-neutral-800` |
| Input fields dark background | | | | | | `bg-white dark:bg-neutral-700` |
| Labels legible | | | | | | `text-gray-700 dark:text-neutral-300` |
| Error text visible | | | | | | |
| **AI Chat** | | | | | | |
| Chat container dark background | | | | | | `bg-white dark:bg-neutral-800` |
| Assistant messages dark bubble | | | | | | `bg-gray-100 dark:bg-neutral-700` |
| User messages (blue) still visible | | | | | | `bg-blue-600` (always visible) |
| Input field dark background | | | | | | `bg-white dark:bg-neutral-700` |
| Warning banner dark variant | | | | | | `bg-yellow-50 dark:bg-yellow-900/20` |
| Send button always visible | | | | | | `bg-blue-600` (always visible) |
| **Admin dashboard charts** | | | | | | |
| Chart axis labels legible | | | | | | Fixed: now uses `useChartColors()` hook |
| Tooltip dark background | | | | | | `bg: #1a1a1d` dark / `#ffffff` light |
| Series colors (indigo/orange) visible | | | | | | Same in both themes |
| **Create post form** | | | | | | |
| Input fields dark background | | | | | | `bg-white dark:bg-neutral-700` |
| Post type toggle buttons dark | | | | | | `bg-white dark:bg-neutral-700` |
| Community picker dropdown dark | | | | | | `bg-white dark:bg-neutral-800` |
| Tiptap editor toolbar dark | | | | | | Toolbar and content area dark |
| **Settings page** | | | | | | |
| Section cards dark background | | | | | | `bg-white dark:bg-neutral-900` |
| Toggle switches dark variant | | | | | | Already had `dark:bg-neutral-600` |
| Select dropdowns dark background | | | | | | Already had `dark:bg-neutral-800` |
| Test notification result legible | | | | | | Green/red text on dark background |

---

## Issues Log

| Date | OS | Component | Description | Status |
|------|----|-----------|-------------|--------|
| | | | | |

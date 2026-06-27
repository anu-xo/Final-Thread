// Returns true if running inside Electron
export function useIsDesktop() {
  return typeof window !== 'undefined' && window.electronAPI !== undefined
}
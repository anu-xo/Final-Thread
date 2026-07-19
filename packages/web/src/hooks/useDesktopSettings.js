import { useState, useEffect } from 'react';

const isDesktop = typeof window !== 'undefined' && window.electronAPI !== undefined;

export function useDesktopSettings() {
  const [settings, setSettingsState] = useState(null);

  useEffect(() => {
    if (isDesktop) {
      window.electronAPI.getSettings().then(setSettingsState);
    }
  }, []);

  const update = async (partial) => {
    if (!isDesktop) return;
    const updated = await window.electronAPI.setSettings(partial);
    setSettingsState(updated);
    return updated;
  };

  return [settings, update];
}

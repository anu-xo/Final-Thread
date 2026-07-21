import { useEffect, useState } from 'react';
import api from '../../services/api.js';

export default function About() {
  const [currentVersion, setCurrentVersion] = useState(null);
  const [remote, setRemote] = useState(null);
  const [checking, setChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null); // 'available' | 'downloading' | 'ready'

  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;

  useEffect(() => {
    if (!electronAPI) return;
    electronAPI.getAppVersion().then(setCurrentVersion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!electronAPI) return;
    const unsub = electronAPI.onUpdateEvent((event) => {
      setUpdateStatus(event);
      if (event === 'update-available' || event === 'update-downloaded') {
        setChecking(false);
      }
    });
    return unsub;
  }, []);

  const fetchLatest = async () => {
    try {
      const { data } = await api.get('/desktop/version');
      setRemote(data.data);
    } catch {
      // silent — non-critical
    }
  };

  useEffect(() => { fetchLatest(); }, []);

  const handleCheckForUpdates = () => {
    if (!electronAPI) return;
    setChecking(true);
    setUpdateStatus(null);
    electronAPI.checkForUpdates();
  };

  const releaseTag = remote?.latest ? `v${remote.latest}` : null;
  const releaseUrl = releaseTag
    ? `https://github.com/anu-xo/Final-Thread.git/releases/tag/${releaseTag}`
    : null;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 mb-4">
      <h2 className="font-semibold text-sm mb-4">About</h2>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Installed version</span>
          <span className="font-mono">{currentVersion ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Latest version</span>
          <span className="font-mono">{remote?.latest ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Minimum supported</span>
          <span className="font-mono">{remote?.minimum ?? '—'}</span>
        </div>

        <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700">
          {checking && (
            <p className="text-neutral-400">Checking for updates...</p>
          )}

          {!checking && updateStatus === 'update-downloaded' && (
            <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg p-3">
              <p className="mb-2">A new version has been downloaded.</p>
              <button
                onClick={() => electronAPI?.installUpdate()}
                className="text-sm font-semibold underline"
              >
                Restart Now
              </button>
            </div>
          )}

          {!checking && updateStatus === 'update-available' && (
            <p className="text-neutral-400">Update download in progress...</p>
          )}

          {!checking && !updateStatus && remote && currentVersion && currentVersion !== remote.latest && (
            <button
              onClick={handleCheckForUpdates}
              className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
            >
              Check for Updates
            </button>
          )}

          {!checking && !updateStatus && remote && currentVersion && currentVersion === remote.latest && (
            <p className="text-green-600 dark:text-green-400">You&apos;re up to date.</p>
          )}
        </div>

        {releaseUrl && (
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-orange-500 hover:underline pt-1"
          >
            Release notes for {releaseTag}
          </a>
        )}
      </div>
    </div>
  );
}

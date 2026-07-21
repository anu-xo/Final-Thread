import { useEffect, useState } from 'react';

export default function UpdateBanner() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onUpdateEvent((event) => {
      setStatus(event);
    });
    return unsub;
  }, []);

  if (status !== 'update-downloaded') return null;

  return (
    <div className="w-full bg-indigo-600 text-white text-sm px-4 py-2 flex items-center justify-between">
      <span>New version available — restart to update.</span>
      <div className="flex gap-3">
        <button onClick={() => window.electronAPI.installUpdate()} className="font-semibold underline">
          Restart Now
        </button>
        <button onClick={() => setStatus(null)} className="opacity-80">
          Later
        </button>
      </div>
    </div>
  );
}

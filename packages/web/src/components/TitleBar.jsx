// packages/web/src/components/TitleBar.jsx
import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';

export default function TitleBar({ pageTitle }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const isDesktop = typeof window.electronAPI !== 'undefined';

  useEffect(() => {
    if (!isDesktop) return;
    window.electronAPI.onWindowStateChange(setIsMaximized);
  }, [isDesktop]);

  if (!isDesktop) return null; // web build never shows this

  return (
    <div className="h-8 bg-neutral-900 flex items-center justify-between select-none"
         style={{ WebkitAppRegion: 'drag' }}>
      <div className="flex items-center gap-2 px-3 text-xs text-neutral-300">
        <img src="/icon-16.png" className="w-4 h-4" alt="" />
        <span>{pageTitle}</span>
      </div>
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' }}>
        <button onClick={() => window.electronAPI.minimizeWindow()} className="w-11 h-8 hover:bg-neutral-700 flex items-center justify-center">
          <Minus size={14} />
        </button>
        <button onClick={() => window.electronAPI.maximizeWindow()} className="w-11 h-8 hover:bg-neutral-700 flex items-center justify-center">
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button onClick={() => window.electronAPI.closeWindow()} className="w-11 h-8 hover:bg-red-600 flex items-center justify-center">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
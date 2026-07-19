import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

export default function AIChatPage() {
  const isOnline = useOnlineStatus();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">AI Chat</h1>
        <p className="text-sm text-gray-500 mt-2">
          The AI panel is wired for the desktop shortcut and will be connected to live chat later.
        </p>
        {!isOnline && (
          <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
            You are offline. AI chat is unavailable — only cached conversations will be shown in read-only mode.
          </div>
        )}
        {/* TODO: Day 15 - load cached conversations from electron-store here (read-only when offline) */}
        <div className="mt-4">
          <input
            type="text"
            placeholder={isOnline ? 'Ask AI anything...' : 'Offline — input disabled'}
            disabled={!isOnline}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
}
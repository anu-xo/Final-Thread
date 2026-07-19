import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useDesktopSettings } from '../hooks/useDesktopSettings.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { useUiStore } from '../store/uiStore.js';
import { pushSharedToServer } from '../hooks/useSettingsSync.js';
import { userApi } from '../services/userApi.js';

function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 mb-4">
      <h2 className="font-semibold text-sm mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-orange-500' : 'bg-neutral-300 dark:bg-neutral-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

function Select({ label, value, onChange, options, disabled }) {
  return (
    <label className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function SettingsPage() {
  const desktop = useIsDesktop();
  const [desktopSettings, updateDesktop] = useDesktopSettings();
  const { theme: uiTheme, setTheme: setUiTheme } = useUiStore();

  const [serverPrefs, setServerPrefs] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    userApi.getMe().then(({ data }) => setServerPrefs(data.data)).catch(() => {});
  }, []);

  const theme = desktop ? (desktopSettings?.theme ?? 'system') : (serverPrefs?.theme ?? uiTheme ?? 'system');
  const fontSize = desktop ? (desktopSettings?.fontSize ?? 'medium') : 'medium';
  const sidebarCollapsed = desktop ? (desktopSettings?.sidebarCollapsed ?? false) : false;
  const defaultSort = desktop ? (desktopSettings?.defaultCommunitySort ?? 'hot') : 'hot';
  const notificationSound = desktop ? (desktopSettings?.notificationSound ?? true) : true;
  const aiChatAutoOpen = desktop ? (desktopSettings?.aiChatAutoOpen ?? false) : false;

  const notifPrefs = serverPrefs?.notifPrefs ?? { digest: true, replies: true, mentions: true };

  const handleTheme = async (val) => {
    if (desktop) {
      await updateDesktop({ theme: val });
      await pushSharedToServer({ theme: val });
    } else {
      setUiTheme(val);
      await pushSharedToServer({ theme: val });
    }
  };

  const handleNotifPref = async (key, val) => {
    const updated = { ...notifPrefs, [key]: val };
    setServerPrefs((prev) => ({ ...prev, notifPrefs: updated }));
    await pushSharedToServer({ notifPrefs: updated });
  };

  const handleDesktopSetting = async (key, val) => {
    if (!desktop) return;
    setSaving(true);
    await updateDesktop({ [key]: val });
    setSaving(false);
  };

  return (
    <>
      <Helmet>
        <title>Settings — ThreadVerse</title>
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        {/* Appearance — shared across desktop & web */}
        <Section title="Appearance">
          <Select
            label="Theme"
            value={theme}
            onChange={handleTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
          {desktop && (
            <Select
              label="Font Size"
              value={fontSize}
              onChange={(val) => handleDesktopSetting('fontSize', val)}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'medium', label: 'Medium' },
                { value: 'large', label: 'Large' },
              ]}
            />
          )}
        </Section>

        {/* Desktop-only settings */}
        {desktop && (
          <Section title="Desktop">
            <Toggle
              label="Collapse sidebar by default"
              checked={sidebarCollapsed}
              onChange={(val) => handleDesktopSetting('sidebarCollapsed', val)}
            />
            <Toggle
              label="Notification sound"
              checked={notificationSound}
              onChange={(val) => handleDesktopSetting('notificationSound', val)}
            />
            <Toggle
              label="Auto-open AI chat on app launch"
              checked={aiChatAutoOpen}
              onChange={(val) => handleDesktopSetting('aiChatAutoOpen', val)}
            />
            <Select
              label="Default community sort"
              value={defaultSort}
              onChange={(val) => handleDesktopSetting('defaultCommunitySort', val)}
              options={[
                { value: 'hot', label: 'Hot' },
                { value: 'new', label: 'New' },
                { value: 'top', label: 'Top' },
                { value: 'rising', label: 'Rising' },
              ]}
            />
          </Section>
        )}

        {/* Notifications — server-side, always shown */}
        <Section title="Notifications">
          <Toggle
            label="Email digest"
            checked={notifPrefs.digest}
            onChange={(val) => handleNotifPref('digest', val)}
          />
          <Toggle
            label="Reply notifications"
            checked={notifPrefs.replies}
            onChange={(val) => handleNotifPref('replies', val)}
          />
          <Toggle
            label="Mention notifications"
            checked={notifPrefs.mentions}
            onChange={(val) => handleNotifPref('mentions', val)}
          />
        </Section>

        {saving && (
          <p className="text-xs text-neutral-400 text-right">Saving...</p>
        )}
      </div>
    </>
  );
}

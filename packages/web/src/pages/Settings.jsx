import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Helmet } from 'react-helmet-async';
import { useDesktopSettings } from '../hooks/useDesktopSettings.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import About from './settings/About.jsx';
import { useUiStore } from '../store/uiStore.js';
import { pushSharedToServer } from '../hooks/useSettingsSync.js';
import { userApi } from '../services/userApi.js';
import ThreadToggle from '../components/ThreadToggle.jsx';

function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 mb-4">
      <h2 className="font-semibold text-sm mb-4">{title}</h2>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm">{label}</span>
      <ThreadToggle label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function Select({ label, value, onChange, options, disabled }) {
  return (
    <div className="flex items-center justify-between py-3">
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
    </div>
  );
}

export default function SettingsPage() {
  const desktop = useIsDesktop();
  const [desktopSettings, updateDesktop] = useDesktopSettings();
  const { theme: uiTheme, setTheme: setUiTheme } = useUiStore();

  const [serverPrefs, setServerPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notifTestResult, setNotifTestResult] = useState(null);

  useEffect(() => {
    userApi.getMe().then(({ data }) => setServerPrefs(data.data)).catch(() => {});
  }, []);

  const theme = desktop ? (desktopSettings?.theme ?? 'system') : (serverPrefs?.theme ?? uiTheme ?? 'system');
  const fontSize = desktop ? (desktopSettings?.fontSize ?? 'medium') : 'medium';
  const sidebarCollapsed = desktop ? (desktopSettings?.sidebarCollapsed ?? false) : false;
  const defaultSort = desktop ? (desktopSettings?.defaultCommunitySort ?? 'hot') : 'hot';
  const notificationSound = desktop ? (desktopSettings?.notificationSound ?? true) : true;
  const aiChatAutoOpen = desktop ? (desktopSettings?.aiChatAutoOpen ?? false) : false;

  const notifPrefs = serverPrefs?.notifPrefs ?? { digest: true, replies: true, mentions: true, neoActiveNudges: true };

  const handleTheme = async (val) => {
    setUiTheme(val);
    await pushSharedToServer({ theme: val });
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

  const handlePingNotification = async () => {
    if (!desktop || !window.electronAPI?.pingNotificationTest) return;
    setNotifTestResult(null);
    try {
      const result = await window.electronAPI.pingNotificationTest();
      setNotifTestResult(result);
    } catch {
      setNotifTestResult({ backend: 'error', supported: false });
    }
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

        {/* Desktop-only settings — fades in only inside Electron */}
        <AnimatePresence>
          {desktop && (
            <motion.div
              key="desktop-app-section"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <Section title="Desktop App">
                <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  <ToggleRow
                    label="Collapse sidebar by default"
                    checked={sidebarCollapsed}
                    onChange={(val) => handleDesktopSetting('sidebarCollapsed', val)}
                  />
                  <ToggleRow
                    label="Notification sound"
                    checked={notificationSound}
                    onChange={(val) => handleDesktopSetting('notificationSound', val)}
                  />
                  <ToggleRow
                    label="Auto-open AI chat on app launch"
                    checked={aiChatAutoOpen}
                    onChange={(val) => handleDesktopSetting('aiChatAutoOpen', val)}
                  />
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm">Send test notification</span>
                    <button
                      type="button"
                      onClick={handlePingNotification}
                      className="rounded-lg bg-emerald hover:bg-emerald/90 text-white text-xs px-3 py-1.5 transition-colors"
                    >
                      Send
                    </button>
                  </div>
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
                </div>
                {notifTestResult && (
                  <p className={`text-xs mt-2 ${notifTestResult.supported ? 'text-mint dark:text-mint' : 'text-amaranth'}`}>
                    {notifTestResult.supported
                      ? `Delivered via ${notifTestResult.backend}`
                      : 'No notification daemon found — install libnotify or notify-send'}
                  </p>
                )}
              </Section>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notifications — server-side, always shown */}
        <Section title="Notifications">
          <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
            <ToggleRow
              label="Email digest"
              checked={notifPrefs.digest}
              onChange={(val) => handleNotifPref('digest', val)}
            />
            <ToggleRow
              label="Reply notifications"
              checked={notifPrefs.replies}
              onChange={(val) => handleNotifPref('replies', val)}
            />
            <ToggleRow
              label="Mention notifications"
              checked={notifPrefs.mentions}
              onChange={(val) => handleNotifPref('mentions', val)}
            />
            <ToggleRow
              label="AI suggestions and nudges"
              checked={notifPrefs.neoActiveNudges !== false}
              onChange={(val) => handleNotifPref('neoActiveNudges', val)}
            />
          </div>
        </Section>

        {saving && (
          <p className="text-xs text-neutral-400 text-right">Saving...</p>
        )}

        {desktop && <About />}
      </div>
    </>
  );
}

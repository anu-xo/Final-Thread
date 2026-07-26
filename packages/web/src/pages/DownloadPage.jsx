import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useDetectedOS } from '../hooks/useDetectedOS.js';

const API_URL = import.meta.env.VITE_API_URL || '';

const PLATFORM_META = {
  windows: { label: 'Windows', icon: '🪟', file: '.exe' },
  mac:     { label: 'macOS',   icon: '🍎', file: '.dmg' },
  linux:   { label: 'Linux',   icon: '🐧', file: '.AppImage' },
};

const STORES = [
  { name: 'Microsoft Store', href: '#' },
  { name: 'Mac App Store',   href: '#' },
  { name: 'Flathub',         href: '#' },
  { name: 'Snapcraft',       href: '#' },
];

export default function DownloadPage() {
  const os = useDetectedOS();
  const [version, setVersion] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/desktop/version`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setVersion(json.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      });
    return () => { cancelled = true; };
  }, []);

  const platforms = version?.platforms ?? {};
  const primary = os && platforms[os] ? os : 'windows';
  const secondary = Object.keys(PLATFORM_META).filter((k) => k !== primary);

  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-neutral-900 flex flex-col"
      style={{ paddingTop: 'var(--tv-titlebar-h, 0px)' }}
    >
      <Helmet>
        <title>Download ThreadVerse</title>
        <meta name="description" content="Download ThreadVerse for Windows, macOS, or Linux." />
      </Helmet>

      {/* Nav */}
      <header className="h-14 bg-white dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700 flex items-center px-4">
        <Link to="/" className="font-bold text-orange-500 text-lg">⚡ ThreadVerse</Link>
        <div className="ml-auto flex gap-2">
          <Link to="/login" className="px-3 py-1.5 text-sm border border-orange-500 text-orange-500 rounded-full hover:bg-orange-50">
            Log In
          </Link>
          <Link to="/register" className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-full hover:bg-orange-600">
            Sign Up
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-neutral-100 tracking-tight">
          Download ThreadVerse
        </h1>
        <p className="mt-4 max-w-xl text-lg text-gray-600 dark:text-neutral-400">
          The desktop app for Windows, macOS, and Linux.
        </p>

        {version?.latest && (
          <p className="mt-2 text-sm text-gray-400 dark:text-neutral-500">
            Latest: <span className="font-mono font-semibold text-gray-600 dark:text-neutral-300">v{version.latest}</span>
          </p>
        )}

        {error && (
          <div className="mt-2 text-sm text-red-500">
            <p>Could not reach download server — try again later.</p>
            <button onClick={() => window.location.reload()} className="mt-1 underline hover:text-red-600">Retry</button>
          </div>
        )}

        {/* Primary CTA */}
        <div className="mt-8">
          <a
            href={platforms[primary] ?? '#'}
            download
            className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-semibold bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors"
          >
            <span>{PLATFORM_META[primary]?.icon}</span>
            <span>
              Download for {PLATFORM_META[primary]?.label}
            </span>
            <span className="text-white/70 text-xs font-mono">
              {PLATFORM_META[primary]?.file}
            </span>
          </a>
        </div>

        {/* Secondary links */}
        <div className="mt-4 flex gap-4 text-sm text-gray-500 dark:text-neutral-400">
          {secondary.map((key) => (
            <a
              key={key}
              href={platforms[key] ?? '#'}
              download
              className="hover:text-orange-500 transition-colors"
            >
              {PLATFORM_META[key]?.icon} {PLATFORM_META[key]?.label}
              <span className="ml-1 text-xs font-mono text-gray-400 dark:text-neutral-500">
                {PLATFORM_META[key]?.file}
              </span>
            </a>
          ))}
        </div>

        {/* Also available on */}
        <div className="mt-12 w-full max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-4">
            Also available on
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {STORES.map((store) => (
              <a
                key={store.name}
                href={store.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-gray-600 dark:text-neutral-300 hover:border-orange-300 dark:hover:border-orange-600 transition-colors"
              >
                <StoreIcon name={store.name} />
                <span>{store.name}</span>
              </a>
            ))}
          </div>
        </div>

        {/* GitHub fallback */}
        <p className="mt-8 text-xs text-gray-400 dark:text-neutral-500">
          Or get it from{' '}
          <a
            href={version?.downloadUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-orange-500"
          >
            GitHub Releases
          </a>
        </p>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-neutral-700 py-6 text-center text-xs text-gray-400 dark:text-neutral-500">
        ThreadVerse &mdash; Built with the MERN stack
      </footer>
    </div>
  );
}

function StoreIcon({ name }) {
  const cls = 'w-5 h-5 rounded';
  if (name === 'Microsoft Store') {
    return (
      <svg viewBox="0 0 21 21" className={cls} fill="none">
        <rect x="1" y="1" width="8.5" height="8.5" fill="#f25022" />
        <rect x="11.5" y="1" width="8.5" height="8.5" fill="#7fba00" />
        <rect x="1" y="11.5" width="8.5" height="8.5" fill="#00a4ef" />
        <rect x="11.5" y="11.5" width="8.5" height="8.5" fill="#ffb900" />
      </svg>
    );
  }
  if (name === 'Mac App Store') {
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    );
  }
  if (name === 'Flathub') {
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
        <path d="M5.022 0C2.251 0 0 2.25 0 5.022v13.956C0 21.75 2.251 24 5.022 24h13.956C21.75 24 24 21.75 24 18.978V5.022C24 2.25 21.75 0 18.978 0H5.022zM12 6.195l5.568 3.216v6.18L12 18.807l-5.568-3.216V9.411L12 6.195z" />
      </svg>
    );
  }
  if (name === 'Snapcraft') {
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 3.6c4.636 0 8.4 3.764 8.4 8.4s-3.764 8.4-8.4 8.4-8.4-3.764-8.4-8.4 3.764-8.4 8.4-8.4zm-1.2 4.8v7.2l6-3.6-6-3.6z" />
      </svg>
    );
  }
  return null;
}

import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import AuroraBackground from '../components/AuroraBackground.jsx';

const FEATURES = [
  { icon: '🌐', title: 'Communities', desc: 'Create and join topic-specific communities.' },
  { icon: '💬', title: 'Discussion', desc: 'Post, comment, and vote on what matters.' },
  { icon: '⚡', title: 'Real-time', desc: 'Live updates powered by Socket.io.' },
];

// Medium aurora scene — smaller blobs (30–40vw) at low opacity, tucked toward
// the viewport corners so they frame the centered hero instead of sitting
// behind the headline. Slower drift keeps content the clear focal point.
const LANDING_BLOBS = [
  {
    color: 'violet',
    style: {
      top: '-16%',
      left: '-12%',
      width: '40vw',
      height: '40vw',
      '--blob-opacity': 0.26,
      '--drift-duration': '100s',
    },
  },
  {
    color: 'cyan',
    style: {
      top: '4%',
      right: '-14%',
      width: '30vw',
      height: '30vw',
      '--blob-opacity': 0.2,
      '--drift-duration': '90s',
    },
  },
  {
    color: 'pink',
    style: {
      bottom: '-12%',
      right: '-8%',
      width: '34vw',
      height: '34vw',
      '--blob-opacity': 0.24,
      '--drift-duration': '115s',
    },
  },
];

export default function LandingPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div
      className="relative min-h-screen bg-gray-50 dark:bg-transparent flex flex-col"
      style={{ paddingTop: 'var(--tv-titlebar-h, 0px)' }}
    >
      <AuroraBackground blobs={LANDING_BLOBS} />
      <div className="relative z-10 flex flex-col flex-1">
      {/* Nav */}
      <header className="h-14 bg-white dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700 flex items-center px-4">
        <span className="font-bold text-emerald text-lg">⚡ ThreadVerse</span>
        <div className="ml-auto flex gap-2">
          {user ? (
            <Link
              to="/home"
              className="px-4 py-1.5 text-sm bg-emerald text-white rounded-full hover:bg-emerald/90"
            >
              Go to Feed
            </Link>
          ) : (
            <>
              <Link to="/login" className="px-3 py-1.5 text-sm border border-emerald text-emerald rounded-full hover:bg-emerald/10">
                Log In
              </Link>
              <Link to="/register" className="px-3 py-1.5 text-sm bg-emerald text-white rounded-full hover:bg-emerald/90">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-neutral-100 tracking-tight">
          ThreadVerse
        </h1>
        <p className="mt-4 max-w-xl text-lg text-gray-600 dark:text-neutral-400">
          A modern community platform built with the MERN stack.
          Create communities, share posts, and connect in real-time.
        </p>
        <div className="mt-8 flex gap-3">
          {user ? (
            <Link
              to="/home"
              className="px-6 py-3 text-sm font-semibold bg-emerald text-white rounded-full hover:bg-emerald/90"
            >
              Go to Feed
            </Link>
          ) : (
            <>
              <Link
                to="/register"
                className="px-6 py-3 text-sm font-semibold bg-emerald text-white rounded-full hover:bg-emerald/90"
              >
                Get Started
              </Link>
              <Link
                to="/login"
                className="px-6 py-3 text-sm font-semibold border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-neutral-300 rounded-full hover:bg-gray-100 dark:hover:bg-neutral-800"
              >
                Log In
              </Link>
            </>
          )}
        </div>
      </main>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-4 py-16 grid gap-8 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="text-center">
            <div className="text-3xl">{f.icon}</div>
            <h2 className="mt-3 font-semibold text-gray-900 dark:text-neutral-100">{f.title}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-neutral-700 py-6 text-center text-xs text-gray-400 dark:text-neutral-500">
        ThreadVerse &mdash; Built with the MERN stack
      </footer>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';

const FEATURES = [
  { icon: '🌐', title: 'Communities', desc: 'Create and join topic-specific communities.' },
  { icon: '💬', title: 'Discussion', desc: 'Post, comment, and vote on what matters.' },
  { icon: '⚡', title: 'Real-time', desc: 'Live updates powered by Socket.io.' },
];

export default function LandingPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Nav */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4">
        <span className="font-bold text-orange-500 text-lg">⚡ ThreadVerse</span>
        <div className="ml-auto flex gap-2">
          {user ? (
            <Link
              to="/home"
              className="px-4 py-1.5 text-sm bg-orange-500 text-white rounded-full hover:bg-orange-600"
            >
              Go to Feed
            </Link>
          ) : (
            <>
              <Link to="/login" className="px-3 py-1.5 text-sm border border-orange-500 text-orange-500 rounded-full hover:bg-orange-50">
                Log In
              </Link>
              <Link to="/register" className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-full hover:bg-orange-600">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight">
          ThreadVerse
        </h1>
        <p className="mt-4 max-w-xl text-lg text-gray-600">
          A modern community platform built with the MERN stack.
          Create communities, share posts, and connect in real-time.
        </p>
        <div className="mt-8 flex gap-3">
          {user ? (
            <Link
              to="/home"
              className="px-6 py-3 text-sm font-semibold bg-orange-500 text-white rounded-full hover:bg-orange-600"
            >
              Go to Feed
            </Link>
          ) : (
            <>
              <Link
                to="/register"
                className="px-6 py-3 text-sm font-semibold bg-orange-500 text-white rounded-full hover:bg-orange-600"
              >
                Get Started
              </Link>
              <Link
                to="/login"
                className="px-6 py-3 text-sm font-semibold border border-gray-300 text-gray-700 rounded-full hover:bg-gray-100"
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
            <h2 className="mt-3 font-semibold text-gray-900">{f.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        ThreadVerse &mdash; Built with the MERN stack
      </footer>
    </div>
  );
}

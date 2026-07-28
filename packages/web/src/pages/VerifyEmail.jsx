import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/api.js';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('verifying');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No verification token provided.');
      return;
    }
    api.post('/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setError(err?.response?.data?.error || 'Verification failed.');
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-neutral-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-xl shadow-sm p-8 text-center">
        {status === 'verifying' && (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto mb-4" />
            <p className="text-gray-600 dark:text-neutral-300">Verifying your email...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <p className="text-5xl mb-4" role="img" aria-label="checkmark">&#x2705;</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100 mb-2">Email verified!</h1>
            <p className="text-gray-500 dark:text-neutral-400 mb-6">Your account is now fully activated.</p>
            <Link
              to="/home"
              className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition"
            >
              Go to Home
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-5xl mb-4" role="img" aria-label="error">&#x274C;</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100 mb-2">Verification failed</h1>
            <p className="text-gray-500 dark:text-neutral-400 mb-6">{error}</p>
            <Link
              to="/login"
              className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition"
            >
              Go to Login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

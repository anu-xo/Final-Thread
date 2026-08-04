import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api.js';
import { useAuth } from '../hooks/useAuth.js';
import AuroraBackground from '../components/AuroraBackground.jsx';

const loginSchema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// Boldest aurora scene — the login page is the visual centerpiece. Larger
// blobs (50–65vw) at higher opacity, framed so the violet sits top-left and
// pink bottom-right with only the small cyan accent near the card's center
// (behind it), so the mesh never washes across the form fields at full
// strength. Drift stays full-speed via the shared drift-a/b/c keyframes.
const LOGIN_BLOBS = [
  {
    color: 'violet',
    style: {
      top: '-18%',
      left: '-16%',
      width: '62vw',
      height: '62vw',
      '--blob-opacity': 0.45,
    },
  },
  {
    color: 'pink',
    style: {
      bottom: '-16%',
      right: '-14%',
      width: '60vw',
      height: '60vw',
      '--blob-opacity': 0.4,
    },
  },
  {
    color: 'cyan',
    style: {
      top: '34%',
      left: '42%',
      width: '34vw',
      height: '34vw',
      '--blob-opacity': 0.35,
    },
  },
];

export default function Login() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const mutation = useMutation({
    mutationFn: (data) => api.post('/auth/login', data).then(r => r.data.data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      navigate('/home');
    },
  });

  const [banReason] = useState(() => {
    try { return sessionStorage.getItem('ban-reason'); } catch { return null; }
  });
  useEffect(() => {
    if (banReason) sessionStorage.removeItem('ban-reason');
  }, [banReason]);

  return (
    <div
      className="relative min-h-screen flex items-center justify-center bg-gray-50 dark:bg-transparent"
      style={{ paddingTop: 'var(--tv-titlebar-h, 0px)' }}
    >
      <AuroraBackground blobs={LOGIN_BLOBS} />
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-neutral-800 rounded-xl shadow-sm p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100 mb-6">Welcome back</h1>

        {banReason && (
          <div className="mb-4 rounded-lg bg-amaranth/10 dark:bg-amaranth/10 border border-amaranth/30 dark:border-amaranth/40 p-3 text-sm text-amaranth dark:text-amaranth">
            {banReason}
          </div>
        )}

        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Email</label>
            <input
              id="email"
              {...register('email')}
              type="email"
              className="w-full border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald"
            />
            {errors.email && <p className="text-amaranth text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Password</label>
            <input
              id="password"
              {...register('password')}
              type="password"
              className="w-full border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald"
            />
            {errors.password && <p className="text-amaranth text-xs mt-1">{errors.password.message}</p>}
          </div>

          {mutation.isError && (
            <p className="text-amaranth text-sm">{mutation.error?.response?.data?.error || 'Login failed'}</p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-emerald text-white py-2 rounded-lg font-medium hover:bg-emerald/90 disabled:opacity-50 transition"
          >
            {mutation.isPending ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <p className="text-sm text-gray-500 dark:text-neutral-400 mt-4 text-center">
          No account? <Link to="/register" className="text-emerald font-medium">Register</Link>
        </p>
      </div>
    </div>
  );
}
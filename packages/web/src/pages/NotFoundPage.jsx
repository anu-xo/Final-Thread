import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="text-6xl font-bold text-orange-500 mb-4">404</div>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-neutral-100 mb-2">
        Page not found
      </h1>
      <p className="text-sm text-gray-500 dark:text-neutral-400 max-w-md mb-6">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        to="/home"
        className="px-5 py-2 bg-orange-500 text-white text-sm font-semibold rounded-full hover:bg-orange-600 transition"
      >
        Go Home
      </Link>
    </div>
  );
}

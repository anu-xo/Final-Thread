import { useSearchParams } from 'react-router-dom';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q')?.trim() || '';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Search</h1>
        <p className="text-sm text-gray-500 mt-2">
          {query ? `Results for “${query}” will appear here.` : 'Type in the header search box to filter communities and posts later.'}
        </p>
      </div>
    </div>
  );
}
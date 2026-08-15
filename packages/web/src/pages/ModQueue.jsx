import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import api from '../services/api.js';
import SectionErrorBoundary from '../components/SectionErrorBoundary.jsx';
import { TableSkeleton } from '../components/skeletons/index.js';

export default function ModQueue() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: reports, isLoading, error } = useQuery({
    queryKey: ['mod', 'queue'],
    queryFn: async () => {
      const { data } = await api.get('/mod/reports');
      return data.data || [];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ reportId, action }) => api.post(`/mod/reports/${reportId}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mod', 'queue'] }),
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Moderation Queue</h1>
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <p className="text-5xl font-bold text-emerald mb-4">!</p>
        <p className="text-lg text-gray-900 dark:text-neutral-100 mb-2">Failed to load mod queue</p>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">You may not have moderator permissions.</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => navigate(-1)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800">Go back</button>
          <button onClick={() => window.location.reload()} className="px-4 py-2 text-sm rounded-lg bg-emerald text-white hover:bg-emerald/90">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Moderation Queue — ThreadVerse</title>
      </Helmet>
      <SectionErrorBoundary sectionName="Mod Queue">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Moderation Queue</h1>

          {reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 p-10 text-center">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-sm text-gray-500 dark:text-neutral-400">No pending reports. All clear!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div
                  key={report._id}
                  className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-neutral-100">
                        {report.reason}
                      </p>
                      {report.detail && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">{report.detail}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-400 dark:text-neutral-500">
                        Reported by {report.reporter?.username} &middot; {report.targetType}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => resolveMutation.mutate({ reportId: report._id, action: 'dismiss' })}
                        disabled={resolveMutation.isPending}
                        className="px-3 py-1 text-xs border border-gray-300 dark:border-neutral-600 rounded-full hover:bg-gray-50 dark:hover:bg-neutral-700"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => resolveMutation.mutate({ reportId: report._id, action: 'remove' })}
                        disabled={resolveMutation.isPending}
                        className="px-3 py-1 text-xs bg-amaranth text-white rounded-full hover:bg-amaranth/90"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionErrorBoundary>
    </>
  );
}

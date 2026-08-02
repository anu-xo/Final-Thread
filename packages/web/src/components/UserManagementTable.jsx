import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { TableSkeleton } from './skeletons/index.js';
import ThreadSnipIcon from './ThreadSnipIcon.jsx';
import ThreadTieIcon from './ThreadTieIcon.jsx';

export default function UserManagementTable() {
  const [search, setSearch] = useState('');
  const [actionTick, setActionTick] = useState({});
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: async () => (await api.get(`/admin/users?search=${encodeURIComponent(search)}`)).data.data,
  });

  const banMutation = useMutation({
    mutationFn: ({ userId, reason }) => api.post(`/admin/users/${userId}/ban`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  const unbanMutation = useMutation({
    mutationFn: (userId) => api.post(`/admin/users/${userId}/unban`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  function tickAction(userId) {
    setActionTick((prev) => ({ ...prev, [userId]: (prev[userId] || 0) + 1 }));
  }

  function handleToggleBan(user) {
    if (user.isBanned) {
      unbanMutation.mutate(user._id);
      tickAction(user._id);
    } else {
      const reason = window.prompt(`Ban reason for ${user.username}:`);
      if (reason === null) return; // cancelled
      banMutation.mutate({ userId: user._id, reason: reason || undefined });
      tickAction(user._id);
    }
  }

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by username or email"
        className="border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 rounded px-3 py-1.5 mb-3 w-full"
      />
      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm text-gray-900 dark:text-neutral-100">
        <thead>
          <tr className="border-b border-gray-200 dark:border-neutral-700">
            <th className="text-left py-2">Username</th>
            <th className="text-left py-2">Email</th>
            <th className="text-right py-2">Karma</th>
            <th className="text-left py-2">Status</th>
            <th className="text-right py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <tr key={u._id} className="border-t border-gray-200 dark:border-neutral-700">
              <td className="py-1.5">{u.username}</td>
              <td>{u.email}</td>
              <td className="text-right tabular-nums">{u.karma}</td>
              <td className={u.isBanned ? 'text-amaranth font-medium' : 'text-emerald font-medium'}>
                {u.isBanned ? 'Banned' : 'Active'}
              </td>
              <td className="text-right">
                <button
                  type="button"
                  onClick={() => handleToggleBan(u)}
                  disabled={banMutation.isPending || unbanMutation.isPending}
                  aria-label={u.isBanned ? `Unban ${u.username}` : `Ban ${u.username}`}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    u.isBanned
                      ? 'text-emerald hover:bg-emerald/10'
                      : 'text-amaranth hover:bg-amaranth/10'
                  }`}
                >
                  {u.isBanned ? (
                    <ThreadTieIcon className="h-4 w-4" tie={actionTick[u._id] || 0} />
                  ) : (
                    <ThreadSnipIcon className="h-4 w-4" snip={actionTick[u._id] || 0} />
                  )}
                  <span>{u.isBanned ? 'Unban' : 'Ban'}</span>
                </button>
              </td>
            </tr>
          ))}
          {users?.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      )}
    </div>
  );
}

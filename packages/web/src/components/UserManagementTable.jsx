import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { TableSkeleton } from './skeletons/index.js';

export default function UserManagementTable() {
  const [search, setSearch] = useState('');
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

  function handleToggleBan(user) {
    if (user.isBanned) {
      unbanMutation.mutate(user._id);
    } else {
      const reason = window.prompt(`Ban reason for ${user.username}:`);
      if (reason === null) return; // cancelled
      banMutation.mutate({ userId: user._id, reason: reason || undefined });
    }
  }

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by username or email"
        className="border rounded px-3 py-1.5 mb-3 w-full"
      />
      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : (
        <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Username</th>
            <th className="text-left">Email</th>
            <th className="text-right">Karma</th>
            <th className="text-left">Status</th>
            <th className="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <tr key={u._id} className="border-t">
              <td className="py-1.5">{u.username}</td>
              <td>{u.email}</td>
              <td className="text-right">{u.karma}</td>
              <td>{u.isBanned ? 'Banned' : 'Active'}</td>
              <td className="text-right">
                <button
                  onClick={() => handleToggleBan(u)}
                  disabled={banMutation.isPending || unbanMutation.isPending}
                  className={u.isBanned ? 'text-green-600 hover:underline' : 'text-red-600 hover:underline'}
                >
                  {u.isBanned ? 'Unban' : 'Ban'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}

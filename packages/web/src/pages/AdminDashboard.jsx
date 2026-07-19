import UserManagementTable from '../components/UserManagementTable';

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold">{value ?? '—'}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useAdminStats();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Admin Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats?.totalUsers} />
        <StatCard label="Total Posts" value={stats?.totalPosts} />
        <StatCard label="AI Chats Today" value={stats?.aiChatsToday} />
        <StatCard label="Open Reports" value={stats?.openReports} />
      </div>
      <UserManagementTable />
    </div>
  );
}
import UserManagementTable from '../components/UserManagementTable';
import AIUsageChart from '../components/AIUsageChart';
import PlatformActivityChart from '../components/PlatformActivityChart';
import PlatformBreakdownTable from '../components/PlatformBreakdownTable';
import { useAdminStats } from '../hooks/useAdminStats';

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold">{value ?? '—'}</p>
      {sub && <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats } = useAdminStats();

  const pb = stats?.platformBreakdown;
  const totalActivity = pb ? pb.desktop + pb.web : null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Admin Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats?.totalUsers} />
        <StatCard label="Total Posts" value={stats?.totalPosts} />
        <StatCard label="AI Chats Today" value={stats?.aiChatsToday} />
        <StatCard label="Open Reports" value={stats?.openReports} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Traffic by Platform (30d)</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total Events" value={totalActivity} />
          <StatCard label="Desktop" value={pb?.desktop} sub={totalActivity ? `${((pb.desktop / totalActivity) * 100).toFixed(1)}%` : undefined} />
          <StatCard label="Web" value={pb?.web} sub={totalActivity ? `${((pb.web / totalActivity) * 100).toFixed(1)}%` : undefined} />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Platform Activity Trend</h2>
        <PlatformActivityChart />
      </div>

      <PlatformBreakdownTable />

      <UserManagementTable />
      <div>
        <h2 className="text-lg font-semibold mb-2">AI Usage</h2>
        <AIUsageChart />
      </div>
    </div>
  );
}
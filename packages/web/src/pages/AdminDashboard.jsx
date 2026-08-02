import { useEffect, useState } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import UserManagementTable from '../components/UserManagementTable';
import AIUsageChart from '../components/AIUsageChart';
import PlatformActivityChart from '../components/PlatformActivityChart';
import PlatformBreakdownTable from '../components/PlatformBreakdownTable';
import SectionErrorBoundary from '../components/SectionErrorBoundary.jsx';
import { useAdminStats } from '../hooks/useAdminStats';

function useCountUp(target, delay = 0) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(() => (reduceMotion ? target : 0));

  useEffect(() => {
    if (target == null) {
      setDisplay(null);
      return;
    }
    if (reduceMotion) {
      setDisplay(target);
      return;
    }

    const controls = animate(0, target, {
      delay,
      duration: 1.1,
      ease: 'easeOut',
      onUpdate: (value) => setDisplay(value),
    });

    return () => controls.stop();
  }, [target, delay, reduceMotion]);

  return display;
}

function formatValue(value) {
  if (value == null) return '—';
  return Math.round(Number(value)).toLocaleString('en-US');
}

function StatCard({ label, value, sub, index = 0 }) {
  const display = useCountUp(value, index * 0.08);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: 'easeOut' }}
      className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4"
    >
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{formatValue(display)}</p>
      {sub && <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>}
    </motion.div>
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
        <StatCard index={0} label="Total Users" value={stats?.totalUsers} />
        <StatCard index={1} label="Total Posts" value={stats?.totalPosts} />
        <StatCard index={2} label="AI Chats Today" value={stats?.aiChatsToday} />
        <StatCard index={3} label="Open Reports" value={stats?.openReports} />
      </div>

      <SectionErrorBoundary sectionName="Platform Stats">
        <div>
          <h2 className="text-lg font-semibold mb-2">Traffic by Platform (30d)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard index={0} label="Total Events" value={totalActivity} />
            <StatCard index={1} label="Desktop" value={pb?.desktop} sub={totalActivity ? `${((pb.desktop / totalActivity) * 100).toFixed(1)}%` : undefined} />
            <StatCard index={2} label="Web" value={pb?.web} sub={totalActivity ? `${((pb.web / totalActivity) * 100).toFixed(1)}%` : undefined} />
          </div>
        </div>
      </SectionErrorBoundary>

      <SectionErrorBoundary sectionName="Activity Chart">
        <div>
          <h2 className="text-lg font-semibold mb-2">Platform Activity Trend</h2>
          <PlatformActivityChart />
        </div>
      </SectionErrorBoundary>

      <SectionErrorBoundary sectionName="Platform Breakdown">
        <PlatformBreakdownTable />
      </SectionErrorBoundary>

      <SectionErrorBoundary sectionName="User Management">
        <UserManagementTable />
      </SectionErrorBoundary>

      <SectionErrorBoundary sectionName="AI Usage">
        <div>
          <h2 className="text-lg font-semibold mb-2">AI Cost &amp; Usage</h2>
          <AIUsageChart />
        </div>
      </SectionErrorBoundary>
    </div>
  );
}
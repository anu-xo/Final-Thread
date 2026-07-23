import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChartSkeleton } from './skeletons/index.js';

const AXIS_STYLE = {
  fontSize: 12,
  tickLine: false,
};

function useChartColors() {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return {
    axis: isDark ? '#a1a1aa' : '#6b7280',
    tooltipBg: isDark ? '#1a1a1d' : '#ffffff',
    tooltipBorder: isDark ? '#2a2a2d' : '#e5e7eb',
    tooltipText: isDark ? '#e4e4e7' : '#1c1c1c',
  };
}

function ChartTooltip({ active, payload, label, colors }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: colors.tooltipBg, borderColor: colors.tooltipBorder, color: colors.tooltipText }}
    >
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function PlatformActivityChart() {
  const { data: platformDaily, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    select: (data) => data?.platformDaily,
    staleTime: 60_000,
  });

  const colors = useChartColors();

  const chartData = useMemo(() => {
    if (!platformDaily?.length) return [];

    const byDay = {};
    for (const { _id, count } of platformDaily) {
      if (!byDay[_id.day]) byDay[_id.day] = { day: _id.day };
      byDay[_id.day][_id.platform] = count;
    }

    return Object.values(byDay)
      .map((d) => ({ day: d.day, desktop: d.desktop || 0, web: d.web || 0 }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [platformDaily]);

  if (isLoading) return <ChartSkeleton height={260} />;
  if (!chartData.length) return <p className="text-sm text-neutral-500">No activity data yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData}>
        <XAxis dataKey="day" tick={{ fill: colors.axis, ...AXIS_STYLE }} />
        <YAxis tick={{ fill: colors.axis, ...AXIS_STYLE }} />
        <Tooltip content={<ChartTooltip colors={colors} />} />
        <Legend />
        <Area type="monotone" dataKey="web" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} name="Web" />
        <Area type="monotone" dataKey="desktop" stackId="1" stroke="#f97316" fill="#f97316" fillOpacity={0.3} name="Desktop" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

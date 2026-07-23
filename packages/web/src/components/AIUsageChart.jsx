import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
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

export default function AIUsageChart() {
  const { data: costs, isLoading } = useQuery({
    queryKey: ['admin', 'ai', 'costs'],
    queryFn: async () => (await api.get('/admin/ai/costs')).data.data,
  });

  const colors = useChartColors();

  if (isLoading) return <ChartSkeleton height={260} />;
  if (!costs?.length) return <p className="text-sm text-neutral-500">No AI usage data yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={costs}>
        <XAxis dataKey="_id.day" tick={{ fill: colors.axis, ...AXIS_STYLE }} />
        <YAxis yAxisId="left" tick={{ fill: colors.axis, ...AXIS_STYLE }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: colors.axis, ...AXIS_STYLE }} />
        <Tooltip content={<ChartTooltip colors={colors} />} />
        <Line yAxisId="left" type="monotone" dataKey="messageCount" stroke="#6366f1" name="Messages" />
        <Line yAxisId="right" type="monotone" dataKey="estimatedCostUsd" stroke="#f97316" name="Cost (USD)" />
      </LineChart>
    </ResponsiveContainer>
  );
}

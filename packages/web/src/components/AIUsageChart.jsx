import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { ChartSkeleton } from './skeletons/index.js';

export default function AIUsageChart() {
  const { data: costs, isLoading } = useQuery({
    queryKey: ['admin', 'ai', 'costs'],
    queryFn: async () => (await api.get('/admin/ai/costs')).data.data,
  });

  if (isLoading) return <ChartSkeleton height={260} />;
  if (!costs?.length) return <p className="text-sm text-neutral-500">No AI usage data yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={costs}>
        <XAxis dataKey="_id.day" />
        <YAxis yAxisId="left" />
        <YAxis yAxisId="right" orientation="right" />
        <Tooltip />
        <Line yAxisId="left" type="monotone" dataKey="messageCount" stroke="#6366f1" name="Messages" />
        <Line yAxisId="right" type="monotone" dataKey="estimatedCostUsd" stroke="#f97316" name="Cost (USD)" />
      </LineChart>
    </ResponsiveContainer>
  );
}

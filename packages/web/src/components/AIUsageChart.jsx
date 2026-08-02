import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, useReducedMotion } from 'motion/react';
import api from '../services/api';
import { ChartSkeleton } from './skeletons/index.js';

const AXIS_STYLE = {
  fontSize: 12,
  tickLine: false,
};

const MESSAGE_COLOR = 'var(--color-steel)';
const COST_COLOR = 'var(--color-emerald)';

function getAxisColor() {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return isDark ? 'var(--color-mist)' : 'color-mix(in srgb, var(--color-void) 55%, transparent)';
}

function formatCost(value) {
  const num = Number(value) || 0;
  return num >= 0.01 ? `$${num.toFixed(2)}` : `$${num.toFixed(4)}`;
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const label = entry?.payload?.fullDay || entry?.payload?.day;

  return (
    <div className="rounded-xl border border-emerald/70 bg-slate px-3 py-2.5 text-xs text-mist shadow-2xl">
      <p className="mb-1.5 font-medium">{label}</p>
      {payload.map((item) => (
        <div key={item.dataKey} className="flex items-center gap-2 py-0.5 tabular-nums">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-mist/70">{item.name}</span>
          <span className="ml-auto font-medium">
            {item.dataKey === 'estimatedCostUsd'
              ? formatCost(item.value)
              : Math.round(Number(item.value)).toLocaleString('en-US')}
          </span>
        </div>
      ))}
    </div>
  );
}

// Recharts passes final bar geometry (x/y/width/height) once isAnimationActive
// is off; this shape owns the entrance so bars grow in staggered left-to-right.
function GrowingBar(props) {
  const reduceMotion = useReducedMotion();
  const { x, y, width, height, fill, index = 0 } = props;

  if (height <= 0) return null;

  if (reduceMotion) {
    return <rect x={x} y={y} width={width} height={height} rx={3} fill={fill} />;
  }

  return (
    <motion.rect
      x={x}
      width={width}
      height={height}
      rx={3}
      fill={fill}
      initial={{ height: 0, y: y + height }}
      animate={{ height, y }}
      transition={{ delay: index * 0.05, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

export default function AIUsageChart() {
  const { data: costs, isLoading } = useQuery({
    queryKey: ['admin', 'ai', 'costs'],
    queryFn: async () => (await api.get('/admin/ai/costs')).data.data,
  });

  const chartData = useMemo(() => {
    if (!costs?.length) return [];

    return costs.map((item) => {
      const day = item._id?.day;
      const label = typeof day === 'string' && day.length >= 10 ? day.slice(5).replace('-', '/') : day;
      return {
        day: label || day,
        fullDay: day,
        messageCount: item.messageCount ?? 0,
        estimatedCostUsd: item.estimatedCostUsd ?? 0,
      };
    });
  }, [costs]);

  if (isLoading) return <ChartSkeleton height={260} />;
  if (!chartData.length) return <p className="text-sm text-neutral-500">No AI usage data yet.</p>;

  const axisColor = getAxisColor();

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="day" tick={{ fill: axisColor, ...AXIS_STYLE }} />
        <YAxis yAxisId="left" tick={{ fill: axisColor, ...AXIS_STYLE }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: axisColor, ...AXIS_STYLE }} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(60, 70, 90, 0.12)' }} />
        <Bar
          yAxisId="left"
          dataKey="messageCount"
          name="Messages"
          fill={MESSAGE_COLOR}
          isAnimationActive={false}
          shape={GrowingBar}
        />
        <Bar
          yAxisId="right"
          dataKey="estimatedCostUsd"
          name="Cost (USD)"
          fill={COST_COLOR}
          isAnimationActive={false}
          shape={GrowingBar}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

'use client';

import * as React from 'react';
import { ResponsiveContainer, Tooltip } from 'recharts';

export type ChartConfig = Record<string, { label?: string; color?: string }>;

export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: React.ReactNode;
}) {
  const vars = React.useMemo(() => {
    const style: Record<string, string> = {};
    for (const [key, value] of Object.entries(config)) {
      if (value?.color) style[`--color-${key}`] = value.color;
    }
    return style;
  }, [config]);

  return (
    <div className={className} style={vars}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartTooltip(props: React.ComponentProps<typeof Tooltip>) {
  return <Tooltip {...props} />;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  className,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string | number }>;
  label?: string | number;
  className?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className={`rounded-xl border border-[#e4e4e7] bg-white px-3 py-2 text-xs shadow-lg ${className ?? ''}`}>
      {label != null && <p className="mb-1 font-semibold text-[#171717]">{label}</p>}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <p key={i} className="flex items-center gap-2 text-[#52525b]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: entry.color ?? 'currentColor' }}
              aria-hidden="true"
            />
            {entry.name}: <span className="font-semibold text-[#171717]">{entry.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

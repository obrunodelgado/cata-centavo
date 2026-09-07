"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

import { chartNumber } from "../../lib/money.ts";

/**
 * The KPI sparkline — decorative geometry only. Its data goes through
 * `chartNumber` (cents → float, presentation-only): no ticks, no tooltip, no
 * readable number ever comes out of this chart, so the float never meets
 * arithmetic. Mirrors the prototype's `spark()`: same 28px height, aria-hidden.
 */

type SparklineProps = {
  readonly dataCents: readonly number[];
  readonly color: string;
  readonly height?: number;
};

export function Sparkline({ dataCents, color, height = 28 }: SparklineProps) {
  if (dataCents.length < 2) {
    return <div className="spark" aria-hidden="true" />;
  }
  const data = dataCents.map((cents) => ({ value: chartNumber(cents) }));
  return (
    <div className="spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

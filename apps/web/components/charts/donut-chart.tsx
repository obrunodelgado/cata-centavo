"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from "recharts";

import { centsToBRL } from "../../lib/money.ts";

/**
 * The spending donut. The datum keeps integer cents; the tooltip and the
 * center overlay format money from cents — no client arithmetic on floats.
 * The wrapper draws only the ring: the legend is the view's, rendered as the
 * prototype's `.legend.legend-v` list.
 */

export type DonutDatum = {
  readonly name: string;
  readonly spentCents: number;
  readonly color: string;
};

type DonutChartProps = {
  readonly data: readonly DonutDatum[];
  readonly totalCents: number;
  /** The center caption's period, e.g. "Março". */
  readonly caption: string;
  readonly size?: number;
};

const TIP_STYLE = {
  background: "var(--fg)",
  color: "var(--surface)",
  fontFamily: "var(--font-mono)",
  fontSize: 11.5,
  borderRadius: 8,
  border: 0,
} as const;

function DonutTip({ active, payload }: TooltipContentProps) {
  if (!active || payload === undefined || payload.length === 0) {
    return null;
  }
  const datum = payload[0]?.payload as DonutDatum | undefined;
  if (datum === undefined) {
    return null;
  }
  return (
    <div style={TIP_STYLE}>
      <span style={{ background: datum.color }}></span>
      <b>{datum.name}</b> · {centsToBRL(datum.spentCents)}
    </div>
  );
}

export function DonutChart({ data, totalCents, caption, size = 130 }: DonutChartProps) {
  return (
    <div className="chart-wrap" role="img" aria-label={`Despesas por categoria · ${caption}`}>
      <ResponsiveContainer width="100%" height={size}>
        <PieChart>
          <Tooltip content={(props) => <DonutTip {...props} />} />
          <Pie data={[...data]} dataKey="spentCents" nameKey="name" innerRadius="68%" outerRadius="92%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
            {data.map((datum) => (
              <Cell key={datum.name} fill={datum.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          alignContent: "center",
          pointerEvents: "none",
          gap: 2,
        }}
      >
        <span className="num" style={{ fontSize: 13, fontWeight: 650 }}>
          {centsToBRL(totalCents)}
        </span>
        <span className="meta" style={{ textTransform: "uppercase", fontSize: 8, letterSpacing: "0.06em" }}>
          despesas · {caption}
        </span>
      </div>
    </div>
  );
}

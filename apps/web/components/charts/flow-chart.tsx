"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { centsToBRL, centsToBRLShort } from "../../lib/money.ts";
import type { WindowKind } from "../../lib/series.ts";

/**
 * The fluxo de caixa chart: received vs spent per window bucket. Fine windows
 * (days) render as bars — the prototype's day-window behavior (ticket 09) —
 * coarse ones as the prototype's area-plus-line.
 *
 * The datum carries integer cents, and the axis ticks are formatted from
 * cents: recharts scales the integers natively (same proportions as floats),
 * so every readable number in the chart comes from cents and no client code
 * ever computes with a chart float. `chartNumber` stays for the sparkline,
 * whose geometry is decorative and read by nobody.
 */

export type FlowDatum = {
  readonly label: string;
  readonly receivedCents: number;
  readonly spentCents: number;
};

type FlowChartProps = {
  readonly kind: WindowKind;
  readonly data: readonly FlowDatum[];
  readonly receivedColor: string;
  readonly spentColor: string;
  readonly height?: number;
  readonly ariaLabel: string;
};

const TIP_STYLE = {
  background: "var(--fg)",
  color: "var(--surface)",
  fontFamily: "var(--font-mono)",
  fontSize: 11.5,
  borderRadius: 8,
  border: 0,
} as const;

function FlowTip({ active, payload }: TooltipContentProps) {
  if (!active || payload === undefined || payload.length === 0) {
    return null;
  }
  const datum = payload[0]?.payload as FlowDatum | undefined;
  if (datum === undefined) {
    return null;
  }
  return (
    <div style={TIP_STYLE}>
      <b>{datum.label}</b>
      <div style={{ color: "var(--pos)" }}>Receitas: {centsToBRL(datum.receivedCents)}</div>
      <div style={{ color: "var(--neg)" }}>Despesas: {centsToBRL(datum.spentCents)}</div>
    </div>
  );
}

export function FlowChart({ kind, data, receivedColor, spentColor, height = 120, ariaLabel }: FlowChartProps) {
  const fine = kind !== "meses";
  return (
    <div className="chart-wrap" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        {fine ? (
          <BarChart data={[...data]} margin={{ top: 6, right: 4, left: 4, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={axisTick} tick={AXIS_TICK} />
            <Tooltip content={(props) => <FlowTip {...props} />} cursor={{ fill: "var(--fg-soft)" }} />
            <Bar dataKey="receivedCents" name="Receitas" fill={receivedColor} radius={[3, 3, 0, 0]} maxBarSize={26} />
            <Bar dataKey="spentCents" name="Despesas" fill={spentColor} radius={[3, 3, 0, 0]} maxBarSize={26} />
          </BarChart>
        ) : (
          <ComposedChart data={[...data]} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={axisTick} tick={AXIS_TICK} />
            <Tooltip content={(props) => <FlowTip {...props} />} />
            <Area type="monotone" dataKey="receivedCents" name="Receitas" stroke={receivedColor} fill={receivedColor} fillOpacity={0.14} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="spentCents" name="Despesas" stroke={spentColor} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

const AXIS_TICK = {
  fill: "var(--muted)",
  fontSize: 10.5,
  fontFamily: "var(--font-mono)",
} as const;

/** Axis labels are compact ("R$ 9,8 mil") and always read from integer cents. */
function axisTick(value: number): string {
  return centsToBRLShort(value);
}

"use client";
/**
 * Chart primitives on top of Recharts. Colours come from validated tokens
 * (--chart-1..3) that are re-stepped for dark mode — never cycled.
 */
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";

export const CHART = { s1: "var(--chart-1)", s2: "var(--chart-2)", s3: "var(--chart-3)", grid: "var(--chart-grid)", axis: "var(--chart-axis)" };

const axisProps = { stroke: "transparent", tick: { fill: CHART.axis, fontSize: 11 }, tickLine: false, axisLine: false } as const;

type TipProps = { active?: boolean; payload?: readonly { dataKey?: unknown; color?: string; name?: unknown; value?: unknown }[]; label?: unknown; unit?: string; formatter?: (v: number) => string };
const tip = (unit?: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tip = (p: any) => <TooltipCard active={p.active} payload={p.payload} label={p.label} unit={unit} />;
  Tip.displayName = "ChartTooltip";
  return Tip;
};

function TooltipCard({ active, payload, label, unit, formatter }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{String(label ?? "")}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span>{String(p.name ?? "")}</span>
          <span className="tabular ml-auto pl-3 font-medium text-foreground">{formatter ? formatter(Number(p.value)) : String(p.value ?? "")}{unit}</span>
        </p>
      ))}
    </div>
  );
}

export function ColumnChart({ data, x, y, name, height = 200, unit, color = CHART.s1, onBarClick }: { data: Record<string, string | number>[]; x: string; y: string; name: string; height?: number; unit?: string; color?: string; onBarClick?: (d: Record<string, string | number>) => void }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey={x} {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: "var(--accent)", radius: 4 }} content={tip(unit)} />
        <Bar dataKey={y} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} onClick={onBarClick ? (d) => onBarClick(d.payload as Record<string, string | number>) : undefined} className={onBarClick ? "cursor-pointer" : undefined} isAnimationActive animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({ data, x, series, height = 200, unit, area }: { data: Record<string, string | number>[]; x: string; series: { key: string; name: string; color?: string }[]; height?: number; unit?: string; area?: boolean }) {
  if (area) {
    const s = series[0];
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? CHART.s1} stopOpacity={0.16} />
              <stop offset="100%" stopColor={s.color ?? CHART.s1} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey={x} {...axisProps} />
          <YAxis {...axisProps} width={44} />
          <Tooltip cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} content={tip(unit)} />
          <Area type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? CHART.s1} strokeWidth={2} fill={`url(#fill-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey={x} {...axisProps} />
        <YAxis {...axisProps} width={44} />
        <Tooltip cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} content={tip(unit)} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? [CHART.s1, CHART.s2, CHART.s3][i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars as plain HTML: crisp labels, direct values, keyboard-clickable rows. */
export function BarList({ items, onSelect, format = (n) => String(n), max: maxProp }: { items: { key: string; label: React.ReactNode; value: number; sub?: React.ReactNode }[]; onSelect?: (key: string) => void; format?: (n: number) => string; max?: number }) {
  const max = maxProp ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-1">
      {items.map((i) => {
        const inner = (
          <>
            <span className="relative z-10 min-w-0 flex-1 truncate text-left text-sm text-foreground/85">{i.label}</span>
            {i.sub && <span className="relative z-10 text-xs text-muted-foreground">{i.sub}</span>}
            <span className="tabular relative z-10 w-10 text-right text-sm font-medium">{format(i.value)}</span>
            <span className="absolute inset-y-0.5 left-0 rounded-[5px] bg-[color-mix(in_oklch,var(--chart-1)_14%,transparent)] transition-[width] duration-500" style={{ width: `${(i.value / max) * 100}%` }} aria-hidden />
          </>
        );
        return (
          <li key={i.key}>
            {onSelect ? (
              <button onClick={() => onSelect(i.key)} className="relative flex h-8 w-full items-center gap-3 rounded-md px-2 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">{inner}</button>
            ) : (
              <div className="relative flex h-8 items-center gap-3 px-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  );
}

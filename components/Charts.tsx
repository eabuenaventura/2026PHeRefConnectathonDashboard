"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NameValue, OutInRow, TopRefRow } from "@/lib/metrics";

// Data colors are fixed by the spec; chrome colors come from CSS variables so
// they adapt to light/dark.
const QUARTER = "#378add";
const TEAL = "#1d9e75";
const HOSPITAL = "#185fa5";
const RED = "#e24b4a";

const TICK = { fontSize: 11.5, fill: "var(--muted)" } as const;
const LABEL = { fontSize: 12, fill: "var(--ink)", fontWeight: 700 } as const;

function tip() {
  return {
    contentStyle: {
      borderRadius: 10,
      border: "1px solid var(--hairline)",
      background: "var(--card)",
      color: "var(--ink)",
      fontSize: 12,
      boxShadow: "var(--shadow-hover)",
    } as React.CSSProperties,
    itemStyle: { color: "var(--ink)" } as React.CSSProperties,
    labelStyle: { color: "var(--ink)", fontWeight: 600 } as React.CSSProperties,
    cursor: { fill: "rgba(127,127,127,0.08)" },
  };
}

const truncate = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Coordinated referrals by quarter — vertical blue bars (eq:quarter). */
export function QuarterBars({
  data,
}: {
  data: { name: string; value: number; partial: boolean }[];
}) {
  const rows = data.map((d) => ({ ...d, label: d.partial ? `${d.name}*` : d.name }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
        <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
        <Tooltip {...tip()} />
        <Bar dataKey="value" fill={QUARTER} radius={[7, 7, 0, 0]} maxBarSize={64} animationDuration={700}>
          <LabelList dataKey="value" position="top" style={LABEL} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranked bars for leading causes (teal) — eq:cases. */
export function CausesBars({ data }: { data: NameValue[] }) {
  if (!data.length) return <div className="empty">No referral causes yet.</div>;
  const height = Math.max(160, data.length * 44);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={155}
          tick={TICK}
          tickFormatter={(v: string) => truncate(v)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tip()} />
        <Bar dataKey="value" fill={TEAL} radius={[0, 7, 7, 0]} maxBarSize={26} animationDuration={700}>
          <LabelList dataKey="value" position="right" style={LABEL} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Outgoing / Incoming referrals — stacked by outcome (eq:out, eq:in). */
export function OutInBars({ data, split }: { data: OutInRow[]; split?: boolean }) {
  if (!data.length) return <div className="empty">No referrals recorded.</div>;
  const rows = data.slice(0, 8);
  const height = Math.max(160, rows.length * 42);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={155}
          tick={TICK}
          tickFormatter={(v: string) => truncate(v)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tip()} />
        {split ? (
          <>
            <Bar dataKey="success" stackId="s" fill={TEAL} maxBarSize={24} name="Successful" animationDuration={700} />
            <Bar dataKey="pending" stackId="s" fill={QUARTER} maxBarSize={24} name="Pending" animationDuration={700} />
            <Bar dataKey="declined" stackId="s" fill={RED} radius={[0, 7, 7, 0]} maxBarSize={24} name="Declined" animationDuration={700}>
              <LabelList dataKey="total" position="right" style={LABEL} />
            </Bar>
          </>
        ) : (
          <Bar dataKey="total" fill={HOSPITAL} radius={[0, 7, 7, 0]} maxBarSize={24} animationDuration={700}>
            <LabelList dataKey="total" position="right" style={LABEL} />
          </Bar>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Top referring facilities — Hospital blue vs PCF teal (eq:topref). */
export function TopReferringBars({ data }: { data: TopRefRow[] }) {
  if (!data.length) return <div className="empty">No referring facilities yet.</div>;
  const height = Math.max(160, data.length * 38);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={155}
          tick={TICK}
          tickFormatter={(v: string) => truncate(v)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tip()} />
        <Bar dataKey="value" radius={[0, 7, 7, 0]} maxBarSize={22} animationDuration={700}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.isHospital ? HOSPITAL : TEAL} />
          ))}
          <LabelList dataKey="value" position="right" style={LABEL} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Top reasons for declined / unsuccessful — red bars (eq:count). */
export function DeclinedBars({ data }: { data: NameValue[] }) {
  if (!data.length || (data.length === 1 && data[0].value === 0)) {
    return <div className="empty">No declined referrals. 🎉</div>;
  }
  const height = Math.max(110, data.length * 46);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={155}
          tick={TICK}
          tickFormatter={(v: string) => truncate(v)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tip()} />
        <Bar dataKey="value" fill={RED} radius={[0, 7, 7, 0]} maxBarSize={26} animationDuration={700}>
          <LabelList dataKey="value" position="right" style={LABEL} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

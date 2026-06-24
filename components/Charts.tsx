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

const NAVY = "#1f3b5b";
const QUARTER = "#378add";
const TEAL = "#1d9e75";
const HOSPITAL = "#185fa5";
const RED = "#e24b4a";

function tooltipStyle() {
  return {
    contentStyle: {
      borderRadius: 8,
      border: "1px solid #e3e8ee",
      fontSize: 12,
    } as React.CSSProperties,
    cursor: { fill: "rgba(31,59,91,0.05)" },
  };
}

/** Coordinated referrals by quarter — vertical blue bars (eq:quarter). */
export function QuarterBars({
  data,
}: {
  data: { name: string; value: number; partial: boolean }[];
}) {
  const rows = data.map((d) => ({ ...d, label: d.partial ? `${d.name}*` : d.name }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7886" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#6b7886" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle()} />
        <Bar dataKey="value" fill={QUARTER} radius={[6, 6, 0, 0]} maxBarSize={64}>
          <LabelList dataKey="value" position="top" style={{ fontSize: 12, fill: NAVY, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranked bars for leading causes (teal) — eq:cases. */
export function CausesBars({ data }: { data: NameValue[] }) {
  const height = Math.max(180, data.length * 42);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 36, left: 8, bottom: 4 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 11.5, fill: "#243240" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltipStyle()} />
        <Bar dataKey="value" fill={TEAL} radius={[0, 6, 6, 0]} maxBarSize={26}>
          <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: NAVY, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Outgoing / Incoming referrals — stacked by outcome (eq:out, eq:in). */
export function OutInBars({
  data,
  split,
}: {
  data: OutInRow[];
  split?: boolean;
}) {
  const rows = data.slice(0, 8);
  const height = Math.max(180, rows.length * 40);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 36, left: 8, bottom: 4 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 11.5, fill: "#243240" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltipStyle()} />
        {split ? (
          <>
            <Bar dataKey="success" stackId="s" fill={TEAL} radius={[0, 0, 0, 0]} maxBarSize={24} name="Successful" />
            <Bar dataKey="pending" stackId="s" fill={QUARTER} maxBarSize={24} name="Pending" />
            <Bar dataKey="declined" stackId="s" fill={RED} radius={[0, 6, 6, 0]} maxBarSize={24} name="Declined">
              <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: NAVY, fontWeight: 700 }} />
            </Bar>
          </>
        ) : (
          <Bar dataKey="total" fill={HOSPITAL} radius={[0, 6, 6, 0]} maxBarSize={24}>
            <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: NAVY, fontWeight: 700 }} />
          </Bar>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Top referring facilities — Hospital blue vs PCF teal (eq:topref). */
export function TopReferringBars({ data }: { data: TopRefRow[] }) {
  const height = Math.max(180, data.length * 36);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 36, left: 8, bottom: 4 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 11.5, fill: "#243240" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltipStyle()} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.isHospital ? HOSPITAL : TEAL} />
          ))}
          <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: NAVY, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Top reasons for declined / unsuccessful — red bars (eq:count). */
export function DeclinedBars({ data }: { data: NameValue[] }) {
  const height = Math.max(120, data.length * 44);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 36, left: 8, bottom: 4 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 11.5, fill: "#243240" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltipStyle()} />
        <Bar dataKey="value" fill={RED} radius={[0, 6, 6, 0]} maxBarSize={26}>
          <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: NAVY, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Bucket } from "@/lib/aggregate";

/** Mana identities and rarities, warmed to sit on the parchment palette. */
const LABEL_COLORS: Record<string, string> = {
  White: "#f0e6c8",
  Blue: "#4a91d6",
  Black: "#5c5247",
  Red: "#d4573d",
  Green: "#6fa25c",
  Multicolor: "#d6a04a",
  Colorless: "#9d907c",
  common: "#8d8371",
  uncommon: "#a9b4bd",
  rare: "#d6a04a",
  mythic: "#d4703d",
  unknown: "#5c5247",
};

const FALLBACK = [
  "#d6a04a",
  "#4a91d6",
  "#6fa25c",
  "#d4573d",
  "#a9836b",
  "#8aa363",
  "#c98f6a",
  "#9d907c",
];

const axis = { stroke: "#a3947c", fontSize: 11 };

const tooltipStyle = {
  contentStyle: {
    background: "#272019",
    border: "1px solid #4d4030",
    borderRadius: 10,
    color: "#f2e9d8",
    boxShadow: "0 20px 44px -20px rgba(10,6,2,0.95)",
    fontSize: 12,
  },
  labelStyle: { color: "#f2e9d8", fontWeight: 600 },
  itemStyle: { color: "#a3947c" },
};

const colorFor = (label: string, i: number) =>
  LABEL_COLORS[label] ?? FALLBACK[i % FALLBACK.length];

export function BarChartCard({ data }: { data: Bucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <XAxis dataKey="label" {...axis} tickLine={false} axisLine={{ stroke: "#382f24" }} />
        <YAxis
          allowDecimals={false}
          {...axis}
          tickLine={false}
          axisLine={{ stroke: "#382f24" }}
        />
        <Tooltip cursor={{ fill: "rgba(214,160,74,0.08)" }} {...tooltipStyle} />
        <Bar dataKey="value" radius={[5, 5, 2, 2]} animationDuration={900}>
          {data.map((d, i) => (
            <Cell key={d.label} fill={colorFor(d.label, i)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PieChartCard({ data }: { data: Bucket[] }) {
  const filtered = data.filter((d) => d.value > 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Tooltip {...tooltipStyle} />
        <Pie
          data={filtered}
          dataKey="value"
          nameKey="label"
          outerRadius={88}
          innerRadius={46}
          paddingAngle={2}
          stroke="#1c1712"
          strokeWidth={2}
          animationDuration={900}
        >
          {filtered.map((d, i) => (
            <Cell key={d.label} fill={colorFor(d.label, i)} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

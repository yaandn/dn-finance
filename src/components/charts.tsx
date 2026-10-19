"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { longDate, money, moneyCompact, monthLong, monthShort, shortDate } from "@/lib/format";
import type { CategoryTotal, DailyPoint } from "@/lib/finance/analyze";

const cashflowConfig = {
  entradas: { label: "Entradas", color: "var(--positive)" },
  saidas: { label: "Saídas", color: "var(--negative)" },
  saldo: { label: "Saldo acumulado", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function CashflowChart({ data }: { data: DailyPoint[] }) {
  // Saídas como valores negativos para as barras ficarem abaixo do zero
  const series = data.map((d) => ({ ...d, saidasNeg: -d.saidas }));

  return (
    <ChartContainer config={cashflowConfig} className="aspect-auto h-[280px] w-full">
      <ComposedChart data={series} margin={{ left: 4, right: 8, top: 8 }} stackOffset="sign">
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={shortDate}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v: number) => moneyCompact(v)}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              label={label}
              labelFormatter={(l) => longDate(String(l))}
              valueFormatter={(v) => money(Math.abs(v))}
              payload={payload
                ?.filter((p) => p.dataKey !== "saidasNeg" || Number(p.value) !== 0)
                .map((p) => ({
                  name: p.dataKey === "saidasNeg" ? "saidas" : String(p.dataKey),
                  value: Number(p.value),
                  color: p.color,
                }))}
            />
          )}
        />
        <Bar dataKey="entradas" stackId="a" fill="var(--color-entradas)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Bar dataKey="saidasNeg" stackId="a" fill="var(--color-saidas)" radius={[0, 0, 3, 3]} maxBarSize={18} />
        <Line
          type="monotone"
          dataKey="saldo"
          stroke="var(--color-saldo)"
          strokeWidth={2.5}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

import { categoryColor } from "@/lib/palette";

export function CategoryDonut({ data, total }: { data: CategoryTotal[]; total: number }) {
  // Agrupa as categorias menores em "Outras" para o gráfico continuar legível
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, c) => s + c.total, 0);
  const slices = rest > 0 ? [...top, { category: "Outras", total: rest, count: 0, share: 0 }] : top;
  const config = Object.fromEntries(
    slices.map((c, i) => [c.category, { label: c.category, color: categoryColor(i) }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="relative mx-auto aspect-square h-[220px]">
      <PieChart>
        <ChartTooltip
          content={({ active, payload }) => (
            <ChartTooltipContent
              hideLabel
              active={active}
              nameKey="category"
              valueFormatter={(v) => money(v)}
              payload={payload?.map((p) => ({
                name: String(p.payload?.category),
                value: Number(p.value),
                payload: { category: p.payload?.category, fill: p.payload?.fill },
              }))}
            />
          )}
        />
        <Pie
          data={slices.map((s, i) => ({ ...s, fill: categoryColor(i) }))}
          dataKey="total"
          nameKey="category"
          innerRadius={62}
          outerRadius={100}
          strokeWidth={2}
          stroke="var(--card)"
          paddingAngle={1}
          isAnimationActive={false}
        >
          {slices.map((s, i) => (
            <Cell key={s.category} fill={categoryColor(i)} />
          ))}
        </Pie>
        <text x="50%" y="47%" textAnchor="middle" className="fill-muted-foreground text-xs">
          Total de saídas
        </text>
        <text
          x="50%"
          y="57%"
          textAnchor="middle"
          className="fill-foreground text-base font-semibold"
        >
          {moneyCompact(total)}
        </text>
      </PieChart>
    </ChartContainer>
  );
}

export function BillsChart({
  data,
  series,
  currentMonth,
}: {
  data: { month: string; [k: string]: number | string }[];
  series: { key: string; label: string }[];
  currentMonth: string;
}) {
  const config = Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.label, color: `var(--chart-${(i % 5) + 1})` }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          fontSize={11}
          tickFormatter={(m: string) => (m === currentMonth ? `${monthShort(m)} •` : monthShort(m))}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v: number) => moneyCompact(v)}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              label={label}
              labelFormatter={(l) => monthLong(String(l))}
              valueFormatter={(v) => money(v)}
              payload={payload
                ?.filter((p) => Number(p.value) > 0)
                .map((p) => ({ name: String(p.dataKey), value: Number(p.value), color: p.color }))}
            />
          )}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="faturas"
            fill={`var(--color-${s.key})`}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CoinsIcon,
  HeartIcon,
  HomeIcon,
  PartyPopperIcon,
  PlaneIcon,
  PlusIcon,
  RotateCcwIcon,
  ShieldIcon,
  TargetIcon,
  TableIcon,
  Trash2Icon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSavePlan } from "@/lib/api/queries";
import {
  AREA_ICONS,
  DEFAULT_AREAS,
  type AllocationArea,
  type AreaIcon,
} from "@/lib/finance/areas";
import type { PlanSettings } from "@/lib/finance/plan-store";
import { distributeFree, type ProjectionMonth } from "@/lib/finance/projection";
import { money, monthLong } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<AreaIcon, LucideIcon> = {
  shield: ShieldIcon,
  coins: CoinsIcon,
  trending: TrendingUpIcon,
  party: PartyPopperIcon,
  target: TargetIcon,
  plane: PlaneIcon,
  home: HomeIcon,
  heart: HeartIcon,
};

/** Cor pela posição da área (ordem fixa); da sexta em diante, neutra com rótulo. */
const colorAt = (i: number) => (i < 5 ? `var(--alloc-${i + 1})` : "var(--muted-foreground)");
const tint = (color: string) => `color-mix(in oklch, ${color} 14%, transparent)`;

const pctLabel = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

/**
 * Reparte a sobra de todo mês em percentuais fixos por categoria (reserva,
 * dívidas, investimentos…). Os percentuais ficam salvos no planejamento.
 */
export function AllocationPlanner({
  settings,
  months,
}: {
  settings: PlanSettings;
  months: ProjectionMonth[];
}) {
  const savePlan = useSavePlan();
  const [areas, setAreas] = useState<AllocationArea[]>(settings.areas);
  const [justSaved, setJustSaved] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const d = useMemo(() => distributeFree(months, areas), [months, areas]);
  const dirty = JSON.stringify(areas) !== JSON.stringify(settings.areas);
  const over = d.totalPct > 100;
  const free = Math.max(0, 100 - d.totalPct);
  const maxFree = Math.max(1, ...months.map((m) => m.free));
  const positives = months.filter((m) => m.free > 0).map((m) => m.free);

  const edit = (next: AllocationArea[]) => {
    setAreas(next);
    setJustSaved(false);
  };
  const patch = (id: string, change: Partial<AllocationArea>) =>
    edit(areas.map((a) => (a.id === id ? { ...a, ...change } : a)));

  function save() {
    savePlan.mutate(
      { ...settings, areas },
      { onSuccess: () => setJustSaved(true) },
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo: quanto sobra e como está dividido */}
      <Card className="overflow-hidden">
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Sobra média por mês</p>
              <p className="text-4xl font-semibold tracking-tight tabular-nums">
                {money(d.averageFree)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {positives.length
                  ? `nos próximos ${months.length} meses · de ${money(Math.min(...positives))} a ${money(Math.max(...positives))}`
                  : `nenhum dos próximos ${months.length} meses tem sobra`}
              </p>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 self-start rounded-full border px-3 py-1 text-sm sm:self-auto",
                over
                  ? "border-negative/40 bg-negative/10 text-negative"
                  : d.totalPct === 100
                    ? "border-positive/40 bg-positive/10 text-positive"
                    : "text-muted-foreground",
              )}
            >
              {over ? (
                <AlertTriangleIcon className="size-4" />
              ) : d.totalPct === 100 ? (
                <CheckCircle2Icon className="size-4" />
              ) : null}
              {over
                ? `${pctLabel(d.totalPct)} · passa de 100%`
                : d.totalPct === 100
                  ? "100% direcionado"
                  : `${pctLabel(d.totalPct)} direcionado · ${pctLabel(free)} livre`}
            </div>
          </div>

          <div className="space-y-3">
            <div
              className="flex h-4 gap-[2px] overflow-hidden rounded-full"
              role="img"
              aria-label={`Divisão da sobra: ${areas.map((a) => `${a.name} ${pctLabel(a.pct)}`).join(", ")}${free ? `, livre ${pctLabel(free)}` : ""}`}
            >
              {areas.map((a, i) =>
                a.pct > 0 ? (
                  <div
                    key={a.id}
                    className="h-full transition-[width] duration-300 first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${(a.pct / Math.max(100, d.totalPct)) * 100}%`,
                      backgroundColor: colorAt(i),
                    }}
                    title={`${a.name} · ${pctLabel(a.pct)} · ≈ ${money(d.areas[i].monthly)}/mês`}
                  />
                ) : null,
              )}
              {free > 0 && (
                <div
                  className="bg-muted h-full rounded-r-full"
                  style={{ width: `${free}%` }}
                  title={`Livre · ${pctLabel(free)}`}
                />
              )}
            </div>
            <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {d.areas.map((a, i) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorAt(i) }} />
                  <span className="truncate">{a.name || "Sem nome"}</span>
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    {pctLabel(a.pct)} · {money(a.monthly)}
                  </span>
                </li>
              ))}
              {free > 0 && (
                <li className="text-muted-foreground flex items-center gap-2">
                  <span className="bg-muted size-2.5 shrink-0 rounded-full border" />
                  <span>Livre</span>
                  <span className="ml-auto tabular-nums">
                    {pctLabel(free)} · {money((d.averageFree * free) / 100)}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Categorias editáveis */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Categorias</h2>
            <p className="text-muted-foreground text-sm">
              O percentual vale para a sobra de todos os meses
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => edit(DEFAULT_AREAS)}
              title="Voltar para as 5 categorias sugeridas"
            >
              <RotateCcwIcon /> Sugestão
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={areas.length >= 12}
              onClick={() =>
                edit([
                  ...areas,
                  { id: `a${Date.now()}`, name: "Nova categoria", pct: free > 0 ? Math.min(free, 10) : 0, icon: "target" },
                ])
              }
            >
              <PlusIcon /> Adicionar
            </Button>
          </div>
        </div>

        {areas.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              Nenhuma categoria. Adicione uma ou use a sugestão.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((a, i) => {
              const Icon = ICONS[a.icon];
              const color = colorAt(i);
              const info = d.areas[i];
              return (
                <Card key={a.id} className="gap-4 py-4">
                  <CardContent className="space-y-4 px-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        title="Trocar ícone"
                        aria-label={`Trocar ícone de ${a.name}`}
                        className="grid size-10 shrink-0 place-items-center rounded-xl transition-transform active:scale-95"
                        style={{ backgroundColor: tint(color), color }}
                        onClick={() =>
                          patch(a.id, {
                            icon: AREA_ICONS[(AREA_ICONS.indexOf(a.icon) + 1) % AREA_ICONS.length],
                          })
                        }
                      >
                        <Icon className="size-5" />
                      </button>
                      <input
                        aria-label="Nome da categoria"
                        className="focus-visible:border-ring min-w-0 flex-1 border-b border-transparent bg-transparent py-1 font-medium outline-none"
                        value={a.name}
                        maxLength={40}
                        onChange={(e) => patch(a.id, { name: e.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-negative size-8"
                        aria-label={`Remover ${a.name}`}
                        onClick={() => edit(areas.filter((x) => x.id !== a.id))}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <label className="flex items-baseline gap-0.5">
                          <input
                            aria-label={`Percentual de ${a.name}`}
                            inputMode="decimal"
                            className="w-14 bg-transparent text-2xl font-semibold tabular-nums outline-none"
                            value={a.pct}
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(",", "."));
                              if (Number.isFinite(n)) patch(a.id, { pct: Math.min(100, Math.max(0, n)) });
                            }}
                          />
                          <span className="text-muted-foreground text-lg">%</span>
                        </label>
                        <span className="text-sm font-medium tabular-nums">
                          ≈ {money(info.monthly)}
                          <span className="text-muted-foreground font-normal">/mês</span>
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        aria-label={`Ajustar percentual de ${a.name}`}
                        className="w-full"
                        style={{ accentColor: color }}
                        value={a.pct}
                        onChange={(e) => patch(a.id, { pct: Number(e.target.value) })}
                      />
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {money(info.total)} em {months.length} meses
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Mês a mês */}
      <Card>
        <CardHeader>
          <CardTitle>Mês a mês</CardTitle>
          <CardDescription>
            Quanto vai para cada categoria, conforme a sobra de cada mês
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
              <TableIcon /> {showTable ? "Ver barras" : "Ver tabela"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {showTable ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm tabular-nums">
                <thead className="text-muted-foreground text-xs">
                  <tr>
                    <th className="pb-2 text-left font-normal">Mês</th>
                    <th className="pb-2 text-right font-normal">Sobra</th>
                    {areas.map((a) => (
                      <th key={a.id} className="pb-2 text-right font-normal">
                        {a.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.months.map((m) => (
                    <tr key={m.month} className="border-t">
                      <td className="py-2 capitalize">{monthLong(m.month)}</td>
                      <td className={cn("py-2 text-right font-medium", m.free < 0 && "text-negative")}>
                        {money(m.free)}
                      </td>
                      {areas.map((a) => (
                        <td key={a.id} className="py-2 text-right">
                          {money(m.byArea[a.id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="space-y-4">
              {d.months.map((m) => (
                <li key={m.month} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate capitalize">{monthLong(m.month)}</span>
                  {m.free > 0 ? (
                    <div
                      className="flex h-2.5 gap-[2px] overflow-hidden rounded-full"
                      style={{ width: `${(m.free / maxFree) * 100}%` }}
                    >
                      {areas.map((a, i) =>
                        m.byArea[a.id] > 0 ? (
                          <div
                            key={a.id}
                            className="h-full first:rounded-l-full last:rounded-r-full"
                            style={{ flexGrow: m.byArea[a.id], backgroundColor: colorAt(i) }}
                            title={`${a.name}: ${money(m.byArea[a.id])}`}
                          />
                        ) : null,
                      )}
                      {m.unallocated > 0 && (
                        <div
                          className="bg-muted h-full rounded-r-full"
                          style={{ flexGrow: m.unallocated }}
                          title={`Livre: ${money(m.unallocated)}`}
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">Sem sobra para dividir</span>
                  )}
                  <span className={cn("text-right font-medium tabular-nums", m.free < 0 && "text-negative")}>
                    {money(m.free)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Salvar: aparece quando há alteração */}
      {(dirty || justSaved || savePlan.isError) && (
        <div className="bg-background/90 sticky bottom-4 z-40 mr-16 flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-lg backdrop-blur sm:mr-20">
          {over ? (
            <span className="text-negative flex items-center gap-1.5 text-sm">
              <AlertTriangleIcon className="size-4" /> A soma passa de 100%: ajuste para salvar.
            </span>
          ) : savePlan.isError ? (
            <span className="text-negative text-sm">Não foi possível salvar.</span>
          ) : dirty ? (
            <span className="text-muted-foreground text-sm">Alterações não salvas</span>
          ) : (
            <span className="text-positive flex items-center gap-1.5 text-sm">
              <CheckCircle2Icon className="size-4" /> Salvo
            </span>
          )}
          {dirty && (
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => edit(settings.areas)}>
                Descartar
              </Button>
              <Button size="sm" disabled={over || savePlan.isPending} onClick={save}>
                {savePlan.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

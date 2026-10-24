"use client";

import { useMemo, useState } from "react";
import {
  AlertCircleIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  Loader2Icon,
  RepeatIcon,
  SparklesIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";

import { PageShell, type ShellSnapshot } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api/http";
import { useRecurring } from "@/lib/api/queries";
import { longDate, money, shortDate } from "@/lib/format";
import type { Cadence, Recurring, RecurringKind } from "@/lib/finance/recurring";
import { cn } from "@/lib/utils";

export default function RecurringPage() {
  return (
    <PageShell
      title="Recorrentes"
      description="Assinaturas e outros gastos que se repetem, encontrados no último ano de lançamentos"
    >
      {(snapshot) => <RecurringView snapshot={snapshot} />}
    </PageShell>
  );
}

type Tab = "todas" | RecurringKind;

const TABS: { value: Tab; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "assinatura", label: "Assinaturas" },
  { value: "servico", label: "Serviços e contas" },
  { value: "pix", label: "Pix fixos" },
  { value: "tarifa", label: "Tarifas" },
];

const CADENCE_LABEL: Record<Cadence, string> = {
  semanal: "semanal",
  mensal: "mensal",
  trimestral: "trimestral",
  semestral: "semestral",
  anual: "anual",
};

/** Aumentos com menos de 90 dias aparecem em destaque. */
const RECENT_CHANGE_DAYS = 90;

/** Fora do componente: a regra de pureza do React não aceita Date.now no render. */
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function RecurringView({ snapshot }: { snapshot: ShellSnapshot }) {
  const query = useRecurring();
  const [tab, setTab] = useState<Tab>("todas");
  const [dismissed, setDismissed] = useState<string[]>([]);

  const view = useMemo(() => {
    const items = (query.data?.items ?? []).filter(
      (r) => !snapshot.bank || r.institutions.includes(snapshot.bank),
    );
    const active = items.filter((r) => r.status !== "cancelada");
    const cutoff = daysAgo(RECENT_CHANGE_DAYS);
    const increases = active.filter(
      (r) => r.priceChange && r.priceChange.since >= cutoff,
    );
    const count = (kind: Tab) =>
      kind === "todas" ? active.length : active.filter((r) => r.kind === kind).length;
    return {
      active,
      canceled: items.filter((r) => r.status === "cancelada"),
      increases,
      monthly: active.reduce((s, r) => s + r.monthly, 0),
      yearly: active.reduce((s, r) => s + r.yearly, 0),
      newCount: active.filter((r) => r.status === "nova").length,
      counts: Object.fromEntries(TABS.map((t) => [t.value, count(t.value)])) as Record<Tab, number>,
    };
  }, [query.data, snapshot.bank]);

  if (query.isPending) return <Analyzing />;
  if (query.error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm">
          <AlertCircleIcon className="text-negative size-6" />
          <p>Não foi possível analisar os gastos recorrentes.</p>
          <p className="text-muted-foreground text-xs">{errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  const shown = view.active.filter((r) => tab === "todas" || r.kind === tab);
  const increases = view.increases.filter((r) => !dismissed.includes(r.id));
  const bigger = [...view.active].sort((a, b) => b.yearly - a.yearly)[0];

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="from-primary/15 to-primary/5 border-primary/30 gap-2 bg-linear-to-br">
          <CardHeader>
            <CardDescription>Custo por ano</CardDescription>
            <CardAction className="text-primary [&_svg]:size-4">
              <RepeatIcon />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {money(view.yearly)}
            </p>
            <p className="text-muted-foreground text-xs">
              {bigger ? `Maior: ${bigger.name} (${money(bigger.yearly)}/ano)` : "Nada recorrente encontrado"}
            </p>
          </CardContent>
        </Card>
        <Kpi
          icon={<WalletIcon />}
          label="Por mês"
          value={money(view.monthly)}
          hint="Anuais e trimestrais divididos por mês"
        />
        <Kpi
          icon={<CalendarClockIcon />}
          label="Ativas"
          value={String(view.active.length)}
          hint={
            view.newCount
              ? `${view.newCount} começou${view.newCount > 1 ? "aram" : ""} nos últimos meses`
              : "Cobradas no último ciclo"
          }
        />
        <Kpi
          icon={<TrendingUpIcon />}
          label="Aumentos (90 dias)"
          value={String(view.increases.length)}
          hint={
            view.increases.length
              ? `+${money(view.increases.reduce((s, r) => s + r.priceChange!.yearly, 0))} por ano`
              : "Nenhum preço subiu"
          }
          tone={view.increases.length ? "warning" : undefined}
        />
      </section>

      {increases.length > 0 && (
        <div className="border-warning/40 bg-warning/10 space-y-2 rounded-lg border p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <TrendingUpIcon className="text-warning size-4" />
            {increases.length === 1 ? "Uma cobrança ficou mais cara" : `${increases.length} cobranças ficaram mais caras`}
          </p>
          <ul className="space-y-1.5">
            {increases.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {money(r.priceChange!.from)} → <span className="text-foreground">{money(r.priceChange!.to)}</span>{" "}
                  desde {longDate(r.priceChange!.since)}
                </span>
                <Badge variant="outline" className="border-warning/50 text-warning tabular-nums">
                  +{money(r.priceChange!.yearly)}/ano
                </Badge>
                <button
                  type="button"
                  onClick={() => setDismissed((d) => [...d, r.id])}
                  className="text-muted-foreground hover:text-foreground ml-auto text-xs underline-offset-2 hover:underline"
                >
                  Entendi
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="max-w-full overflow-x-auto">
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} disabled={!view.counts[t.value] && t.value !== "todas"}>
                  {t.label}
                  <span className="text-muted-foreground text-xs tabular-nums">{view.counts[t.value]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="text-muted-foreground text-xs tabular-nums">
            {shown.length ? `${money(shown.reduce((s, r) => s + r.yearly, 0))} por ano nesta aba` : null}
          </p>
        </div>
        {shown.length ? (
          <ul className="divide-y">
            {shown.map((r) => (
              <RecurringRow key={r.id} item={r} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground py-12 text-center text-sm">
            Nenhum gasto recorrente {snapshot.bank ? `no ${snapshot.bank}` : "encontrado"} nesta categoria.
          </p>
        )}
      </Card>

      {view.canceled.length > 0 && (
        <details className="group bg-card rounded-xl border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm">
            <span>
              <span className="font-medium">Podem ter sido canceladas</span>{" "}
              <span className="text-muted-foreground">
                · {view.canceled.length} sem cobrança no último ciclo, fora dos totais
              </span>
            </span>
            <ChevronDownIcon className="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y border-t opacity-75">
            {view.canceled.map((r) => (
              <RecurringRow key={r.id} item={r} />
            ))}
          </ul>
        </details>
      )}

      <p className="text-muted-foreground flex gap-1.5 text-xs">
        <SparklesIcon className="mt-px size-3.5 shrink-0" />
        Encontrados automaticamente: cobranças do mesmo lugar com intervalo regular, analisadas de{" "}
        {query.data ? `${longDate(query.data.from)} a ${longDate(query.data.to)}` : "o último ano"}. Parcelas de
        compras, faturas e o empréstimo ficam de fora. Atualizado a cada sincronização.
      </p>
    </>
  );
}

function RecurringRow({ item: r }: { item: Recurring }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-muted/40 grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3 text-left transition-colors sm:grid-cols-[auto_1fr_auto_auto_auto] sm:px-4"
      >
        <Avatar name={r.name} logo={r.logo} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{r.name}</span>
            {r.status === "nova" && <Badge className="h-5 px-1.5 text-[10px]">nova</Badge>}
            {r.priceChange && (
              <TrendingUpIcon className="text-warning size-3.5 shrink-0" aria-label="Ficou mais cara" />
            )}
          </div>
          <p className="text-muted-foreground truncate text-xs">
            {r.installments
              ? `plano em ${r.installments.total}x · parcela ${r.installments.number}/${r.installments.total}`
              : CADENCE_LABEL[r.cadence]}{" "}
            · {r.institutions.join(", ")}
            {r.nextDate ? ` · próxima ~${shortDate(r.nextDate)}` : ` · última em ${shortDate(r.lastDate)}`}
            {r.confidence === "baixa" && " · confira"}
          </p>
        </div>
        <Bars item={r} className="hidden sm:flex" />
        <div className="text-right">
          <p className="font-semibold tabular-nums">
            {r.variable && <span className="text-muted-foreground font-normal">~</span>}
            {money(r.amount)}
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">{money(r.yearly)}/ano</p>
        </div>
        <ChevronDownIcon
          className={cn("text-muted-foreground hidden size-4 transition-transform sm:block", open && "rotate-180")}
        />
      </button>
      {open && <Details item={r} />}
    </li>
  );
}

function Details({ item: r }: { item: Recurring }) {
  const charges = [...r.charges].reverse();
  const total = r.charges.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="bg-muted/30 grid gap-4 border-t px-4 py-4 text-sm sm:grid-cols-[1fr_1.4fr] sm:pl-16">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 self-start text-xs">
        <Fact label="Categoria" value={r.category} />
        <Fact label="Frequência" value={CADENCE_LABEL[r.cadence]} />
        <Fact label="Desde" value={longDate(r.firstDate)} />
        <Fact label="Cobranças" value={`${r.charges.length} · ${money(total)}`} />
        <Fact label="Por mês" value={money(r.monthly)} />
        <Fact
          label="Confiança"
          value={{ alta: "alta", media: "média", baixa: "baixa" }[r.confidence]}
        />
        {r.variable && (
          <p className="text-muted-foreground col-span-2">
            O valor varia de uma cobrança para outra (consumo, câmbio); o atual é a média das últimas.
          </p>
        )}
        {r.priceChange && (
          <p className="text-warning col-span-2">
            Subiu de {money(r.priceChange.from)} para {money(r.priceChange.to)} em{" "}
            {longDate(r.priceChange.since)}: +{money(r.priceChange.yearly)} por ano.
          </p>
        )}
      </dl>
      <div className="bg-background max-h-56 self-start overflow-y-auto rounded-md border">
        <table className="w-full text-xs tabular-nums">
          <tbody className="divide-y">
            {charges.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-1.5">{longDate(c.date)}</td>
                <td className="text-muted-foreground px-3 py-1.5">{c.institution}</td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right font-medium",
                    r.priceChange && c.date >= r.priceChange.since && "text-warning",
                  )}
                >
                  {money(c.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Minigráfico das últimas 12 cobranças; as do valor novo ficam em destaque. */
function Bars({ item: r, className }: { item: Recurring; className?: string }) {
  const last = r.charges.slice(-12);
  const max = Math.max(...last.map((c) => c.amount));
  return (
    <div
      className={cn("h-8 w-28 items-end justify-end gap-0.5", className)}
      aria-hidden
      title={last.map((c) => `${shortDate(c.date)}: ${money(c.amount)}`).join("\n")}
    >
      {last.map((c) => (
        <span
          key={c.id}
          className={cn(
            "w-1.5 rounded-sm",
            r.priceChange && c.date >= r.priceChange.since ? "bg-warning" : "bg-primary/45",
          )}
          style={{ height: `${Math.max(12, (c.amount / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

const AVATAR_TONES = [
  "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "bg-teal-500/15 text-teal-600 dark:text-teal-400",
];

function Avatar({ name, logo }: { name: string; logo: string | null }) {
  const [broken, setBroken] = useState(false);
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  if (logo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logo vem de domínios variados da Belvo
      <img
        src={logo}
        alt=""
        onError={() => setBroken(true)}
        className="size-9 rounded-full border bg-white object-contain p-1"
      />
    );
  }
  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-full text-sm font-semibold",
        AVATAR_TONES[hash % AVATAR_TONES.length],
      )}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "warning";
}) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction className="text-muted-foreground [&_svg]:size-4">{icon}</CardAction>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", tone === "warning" && "text-warning")}>
          {value}
        </p>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

/** A primeira análise lê um ano de lançamentos na Belvo e pode demorar. */
function Analyzing() {
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-29.5 animate-pulse rounded-xl" />
        ))}
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Loader2Icon className="text-primary size-4 animate-spin" />
            Analisando o último ano de lançamentos…
          </CardTitle>
          <CardDescription>
            Procuramos cobranças que se repetem com intervalo regular. Na primeira vez a busca na Belvo pode
            levar um minuto; depois fica guardada até a próxima sincronização.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="bg-muted size-9 animate-pulse rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
                <div className="bg-muted h-2.5 w-1/4 animate-pulse rounded" />
              </div>
              <div className="bg-muted h-4 w-20 animate-pulse rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

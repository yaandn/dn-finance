import { connection } from "next/server";
import Link from "next/link";
import {
  AlertCircleIcon,
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  InfoIcon,
  LandmarkIcon,
  RepeatIcon,
  TriangleAlertIcon,
  WalletIcon,
} from "lucide-react";

import { CashflowChart, CategoryDonut } from "@/components/charts";
import { categoryColor } from "@/lib/palette";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { analyze, type Alert } from "@/lib/finance/analyze";
import { getSnapshot, resolvePeriod } from "@/lib/finance/data";
import { money, percent, longDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// Painel pessoal: sempre busca dados na hora (sem pré-renderização).
export const instant = false;

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  await connection();
  const sp = await searchParams;
  const period = resolvePeriod(Number(sp.dias ?? 30));
  const snapshot = await getSnapshot(period.days);
  const a = analyze(snapshot, period);
  const query = `?dias=${period.days}`;

  return (
    <PageShell snapshot={snapshot} period={period} title="Painel">
      {/* Indicadores principais */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Saldo em conta"
          value={money(a.cashBalance)}
          hint={`${a.cashAccounts.length} conta(s)`}
          icon={<WalletIcon className="size-4" />}
        />
        <Kpi
          label="Entradas"
          value={money(a.income)}
          hint={`${a.incomeByCategory.reduce((s, c) => s + c.count, 0)} recebimentos`}
          icon={<ArrowDownRightIcon className="text-positive size-4" />}
          tone="positive"
        />
        <Kpi
          label="Saídas"
          value={money(a.expenses)}
          hint={`${a.byCategory.reduce((s, c) => s + c.count, 0)} pagamentos`}
          icon={<ArrowUpRightIcon className="text-negative size-4" />}
          tone="negative"
        />
        <Kpi
          label="Resultado do período"
          value={money(a.net)}
          hint={
            a.savingsRate == null
              ? "Sem entradas no período"
              : a.net >= 0
                ? `Sobrou ${percent(a.savingsRate)} do que entrou`
                : "Gastou mais do que recebeu"
          }
          tone={a.net >= 0 ? "positive" : "negative"}
        />
      </section>

      {a.alerts.length > 0 && <AlertsCard alerts={a.alerts} />}

      {/* Fluxo de caixa */}
      <Card>
        <CardHeader>
          <CardTitle>Fluxo de caixa</CardTitle>
          <CardDescription>
            Entradas e saídas por dia, com o saldo acumulado do período.{" "}
            {a.internalCount} movimentações internas ignoradas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CashflowChart data={a.daily} />
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-5">
        {/* Categorias */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Para onde foi o dinheiro</CardTitle>
            <CardDescription>Saídas por categoria</CardDescription>
          </CardHeader>
          <CardContent className="grid items-center gap-6 sm:grid-cols-[220px_1fr]">
            {a.byCategory.length ? (
              <>
                <CategoryDonut data={a.byCategory} total={a.expenses} />
                <ul className="space-y-3">
                  {a.byCategory.slice(0, 8).map((c, i) => (
                    <li key={c.category}>
                      <Link
                        href={`/transacoes${query}&categoria=${encodeURIComponent(c.category)}`}
                        className="group block"
                      >
                        <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 truncate">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ background: categoryColor(i) }}
                            />
                            <span className="truncate group-hover:underline">{c.category}</span>
                          </span>
                          <span className="tabular-nums">
                            {money(c.total)}
                            <span className="text-muted-foreground ml-2 text-xs">
                              {percent(c.share)}
                            </span>
                          </span>
                        </div>
                        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${c.share * 100}%`, background: categoryColor(i) }}
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Empty>Nenhuma saída no período.</Empty>
            )}
          </CardContent>
        </Card>

        {/* Onde mais gastou */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Onde mais gastou</CardTitle>
            <CardDescription>Estabelecimentos e destinatários</CardDescription>
          </CardHeader>
          <CardContent>
            <RankList items={a.topCounterparts} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {/* Entradas */}
        <Card>
          <CardHeader>
            <CardTitle>De onde veio</CardTitle>
            <CardDescription>Maiores entradas</CardDescription>
          </CardHeader>
          <CardContent>
            <RankList items={a.topIncomeSources.slice(0, 5)} tone="positive" />
          </CardContent>
        </Card>

        {/* Assinaturas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RepeatIcon className="size-4" /> Assinaturas
            </CardTitle>
            <CardDescription>
              ~{money(a.subscriptionsMonthly)} por mês · {money(a.subscriptionsMonthly * 12)} por
              ano
            </CardDescription>
          </CardHeader>
          <CardContent>
            {a.subscriptions.length ? (
              <ul className="divide-y text-sm">
                {a.subscriptions.map((s) => (
                  <li key={s.name} className="flex items-center justify-between py-2">
                    <span className="truncate">{s.name}</span>
                    <span className="tabular-nums">{money(s.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhuma assinatura identificada.</Empty>
            )}
          </CardContent>
        </Card>

        {/* Dívidas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LandmarkIcon className="size-4" /> Dívidas
            </CardTitle>
            <CardDescription>Cartões e empréstimos conectados</CardDescription>
            <CardAction>
              <Link
                href={`/contas${query}`}
                className="text-primary flex items-center text-sm hover:underline"
              >
                Detalhes <ChevronRightIcon className="size-4" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground text-xs">Total devido</p>
              <p className="text-2xl font-semibold tabular-nums">
                {money(a.cardDebt + a.loanDebt)}
              </p>
            </div>
            {a.cards.map((c) => {
              const used = c.credit?.used ?? 0;
              const limit = c.credit?.limit ?? 0;
              const share = limit ? used / limit : 0;
              return (
                <div key={c.id} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span>Cartão {c.institution}</span>
                    <span className="tabular-nums">{money(used)}</span>
                  </div>
                  <Progress
                    value={share * 100}
                    indicatorClassName={cn(
                      share >= 0.8 ? "bg-negative" : share >= 0.5 ? "bg-warning" : "bg-primary",
                    )}
                  />
                  <p className="text-muted-foreground text-xs">
                    {percent(share)} de {money(limit)}
                  </p>
                </div>
              );
            })}
            {a.loans.map((l) => (
              <div key={l.id} className="flex justify-between text-sm">
                <span>
                  {l.name} · {l.institution}
                </span>
                <span className="tabular-nums">{money(l.loan?.outstanding)}</span>
              </div>
            ))}
            {!a.cards.length && !a.loans.length && <Empty>Nenhuma dívida conectada.</Empty>}
          </CardContent>
        </Card>
      </section>

      <p className="text-muted-foreground text-center text-xs">
        Dados coletados em {longDate(snapshot.fetchedAt)}. Pagamentos da própria fatura, Pix no
        crédito e parcelas futuras não entram nos totais.
      </p>
    </PageShell>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "positive" | "negative";
}) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="px-5">
        <CardDescription className="flex items-center justify-between">
          {label}
          {icon}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <p
          className={cn(
            "text-xl font-semibold tracking-tight tabular-nums sm:text-2xl",
            tone === "negative" && value.includes("-") && "text-negative",
          )}
        >
          {value}
        </p>
        {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const ALERT_STYLE = {
  danger: { icon: AlertCircleIcon, className: "text-negative", badge: "negative" as const, label: "Urgente" },
  warning: { icon: TriangleAlertIcon, className: "text-warning", badge: "warning" as const, label: "Atenção" },
  info: { icon: InfoIcon, className: "text-primary", badge: "secondary" as const, label: "Info" },
};

function AlertsCard({ alerts }: { alerts: Alert[] }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Pontos de atenção</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {alerts.map((al) => {
            const s = ALERT_STYLE[al.level];
            const Icon = s.icon;
            return (
              <li key={al.title} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <Icon className={cn("mt-0.5 size-4 shrink-0", s.className)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{al.title}</p>
                  <p className="text-muted-foreground text-sm">{al.detail}</p>
                </div>
                <Badge variant={s.badge} className="hidden sm:inline-flex">
                  {s.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function RankList({
  items,
  tone,
}: {
  items: { name: string; total: number; count: number }[];
  tone?: "positive";
}) {
  if (!items.length) return <Empty>Sem dados no período.</Empty>;
  const max = items[0].total;
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.name}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate" title={it.name}>
              {it.name}
              <span className="text-muted-foreground ml-1.5 text-xs">×{it.count}</span>
            </span>
            <span className={cn("tabular-nums", tone === "positive" && "text-positive")}>
              {money(it.total)}
            </span>
          </div>
          <div className="bg-muted h-1 overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full", tone === "positive" ? "bg-positive" : "bg-primary/70")}
              style={{ width: `${(it.total / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground py-6 text-center text-sm">{children}</p>;
}

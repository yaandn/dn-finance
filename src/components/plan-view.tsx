"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CreditCardIcon,
  LandmarkIcon,
  PiggyBankIcon,
  ReceiptIcon,
  SettingsIcon,
  WalletIcon,
} from "lucide-react";

import { PlanEditor } from "@/components/plan-editor";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  applySettings,
  type AgendaItem,
  type PlanBase,
} from "@/lib/finance/plan";
import type { PlanSettings } from "@/lib/finance/plan-store";
import { CADENCE_LABEL } from "@/lib/finance/recurring";
import {
  longDate,
  money,
  monthLong,
  percent,
  shortDate,
  weekday,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function PlanView({
  base,
  initial,
  configured: initialConfigured,
}: {
  base: PlanBase;
  initial: PlanSettings;
  configured: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [settings, setSettings] = useState(initial);
  const [configured, setConfigured] = useState(initialConfigured);
  const p = useMemo(() => applySettings(base, settings), [base, settings]);
  const { today } = base;
  // Pelo salário salvo, não pelo rascunho: senão o editor trocaria de lugar
  // (e perderia o foco) assim que o primeiro dígito fosse digitado.
  const hasSalary = saved.salary > 0;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  const editor = (
    <PlanEditor
      plan={settings}
      onChange={setSettings}
      dirty={dirty}
      onSaved={(plan) => {
        setSaved(plan);
        setSettings(plan);
        setConfigured(true);
      }}
    />
  );

  const segments = [
    {
      key: "fixas",
      label: "Contas fixas",
      value: p.fixedTotal,
      color: "var(--chart-2)",
    },
    {
      key: "recorrentes",
      label: "Recorrentes",
      value: p.recurringTotal,
      color: "var(--chart-3)",
    },
    {
      key: "faturas",
      label: "Faturas atuais",
      value: p.billsTotal,
      color: "var(--chart-1)",
    },
    {
      key: "emprestimos",
      label: "Empréstimos",
      value: p.loansTotal,
      color: "var(--chart-4)",
    },
    {
      key: "dividas",
      label: "Dívidas",
      value: p.debtsTotal,
      color: "var(--chart-5)",
    },
    {
      key: "guardar",
      label: "Guardar",
      value: p.savingsTarget,
      color: "var(--positive)",
    },
    {
      key: "livre",
      label: "Livre",
      value: Math.max(0, p.free),
      color: "var(--muted-foreground)",
    },
  ].filter((s) => s.value > 0);
  const barTotal = Math.max(p.income, p.committed + p.savingsTarget);

  return (
    <>
      {!hasSalary && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Comece pelo salário</CardTitle>
            <CardDescription>
              Informe o salário e as contas fixas. Fica salvo na sua conta e
              só você vê.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {editor}
          </CardContent>
        </Card>
      )}

      {hasSalary && (
        <>
          <Card>
            <CardHeader>
              <CardDescription>
                Sobra do mês depois de tudo o que já está comprometido
              </CardDescription>
              <CardTitle
                className={cn(
                  "text-4xl font-semibold tracking-tight tabular-nums",
                  p.free < 0 ? "text-negative" : "text-foreground",
                )}
              >
                {money(p.free)}
              </CardTitle>
              <CardAction>
                <Badge
                  variant={
                    p.free < 0
                      ? "negative"
                      : p.free < p.income * 0.1
                        ? "warning"
                        : "positive"
                  }
                >
                  {p.free < 0 ? "No vermelho" : `≈ ${money(p.perDay)} por dia`}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="bg-muted flex h-4 overflow-hidden rounded-full">
                  {segments.map((s) => (
                    <div
                      key={s.key}
                      title={`${s.label}: ${money(s.value)}`}
                      style={{
                        width: `${(s.value / barTotal) * 100}%`,
                        background: s.color,
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {segments.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: s.color }}
                      />
                      {s.label}
                      <span className="text-muted-foreground tabular-nums">
                        {money(s.value)} ·{" "}
                        {percent(p.income ? s.value / p.income : null)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:max-w-md">
                <Line label="Salário" value={settings.salary} />
                {settings.otherIncome > 0 && (
                  <Line label="Outras rendas" value={settings.otherIncome} />
                )}
                <Line label="Contas fixas" value={-p.fixedTotal} />
                {p.recurringTotal > 0 && (
                  <Line label="Recorrentes fora do cartão" value={-p.recurringTotal} />
                )}
                <Line
                  label="Faturas atuais dos cartões"
                  value={-p.billsTotal}
                  strong
                />
                {p.loansTotal > 0 && (
                  <Line label="Parcelas de empréstimo" value={-p.loansTotal} />
                )}
                {p.debtsTotal > 0 && (
                  <Line label="Dívidas temporárias" value={-p.debtsTotal} />
                )}
                <Line
                  label={`Guardar (${settings.savingsPct}% do salário)`}
                  value={-p.savingsTarget}
                />
                <div className="border-t pt-1.5">
                  <Line label="Livre para o mês" value={p.free} strong tone />
                </div>
              </dl>

              {p.free < 0 && (
                <div className="border-negative/40 bg-negative/10 flex gap-3 rounded-lg border p-3 text-sm">
                  <AlertTriangleIcon className="text-negative mt-0.5 size-4 shrink-0" />
                  <p>
                    Os compromissos passam do salário em{" "}
                    <strong className="tabular-nums">{money(-p.free)}</strong>.
                    Vale segurar novas compras no cartão
                    {p.savingsTarget > 0 &&
                      " e rever a meta de poupança deste mês"}
                    {p.loansTotal > 0 &&
                      "; antecipar parcelas do empréstimo também reduz juros"}
                    .
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<ReceiptIcon />}
              label="Faturas atuais"
              value={money(p.billsTotal)}
              hint={`${p.bills.length} fatura(s) em aberto · ${percent(p.income ? p.billsTotal / p.income : null)} do salário`}
              highlight
            />
            <Kpi
              icon={<LandmarkIcon />}
              label="Comprometido"
              value={percent(p.committedPct)}
              hint={`${money(p.committed)} entre fixas, faturas e empréstimos`}
              tone={
                p.committedPct > 0.8
                  ? "negative"
                  : p.committedPct > 0.6
                    ? "warning"
                    : undefined
              }
            />
            <Kpi
              icon={<CalendarDaysIcon />}
              label="Próximo salário"
              value={
                p.daysToSalary === 0
                  ? "Hoje"
                  : `Em ${p.daysToSalary} dia${p.daysToSalary === 1 ? "" : "s"}`
              }
              hint={`${weekday(p.nextSalary)}, ${longDate(p.nextSalary)}`}
            />
            <Kpi
              icon={<WalletIcon />}
              label="Em conta hoje"
              value={money(p.cash)}
              hint="Saldo disponível das contas correntes"
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCardIcon className="size-4" /> Faturas atuais
                </CardTitle>
                <CardDescription>
                  Abertas e fechadas ainda não pagas, em todos os cartões
                </CardDescription>
                <CardAction>
                  <Link
                    href="/faturas"
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                  >
                    Detalhes <ArrowRightIcon className="size-3" />
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-1">
                {p.bills.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    Nenhuma fatura em aberto.
                  </p>
                )}
                {p.bills.map((b) => (
                  <Row
                    key={b.key}
                    title={`${b.institution} · ${b.card}`}
                    subtitle={`${monthLong(b.month)} · ${b.dueDate ? `${b.dueEstimated ? "vence por volta de" : b.dueDate < today ? "venceu em" : "vence em"} ${longDate(b.dueDate)}` : "sem vencimento"}`}
                    value={b.amount}
                    badge={
                      b.status === "vencida"
                        ? "Vencida"
                        : b.status === "fechada"
                          ? "Fechada"
                          : undefined
                    }
                  />
                ))}
                {p.bills.length > 0 && (
                  <Total label="Soma das faturas atuais" value={p.billsTotal} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LandmarkIcon className="size-4" /> Contas fixas, recorrentes e parcelas
                </CardTitle>
                <CardDescription>
                  Compromissos que se repetem todo mês
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {settings.fixed.length === 0 &&
                  p.loans.length === 0 &&
                  p.recurring.length === 0 &&
                  p.debts.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    Nenhuma conta fixa cadastrada.
                  </p>
                )}
                {[...settings.fixed]
                  .sort((a, b) => a.day - b.day)
                  .map((f) => (
                    <Row
                      key={f.id}
                      title={f.name}
                      subtitle={`Todo dia ${f.day}${f.onCard ? " · no cartão (já está na fatura)" : ""}`}
                      value={f.amount}
                      muted={f.onCard}
                    />
                  ))}
                {p.recurring.map((r) => (
                  <Row
                    key={r.id}
                    title={r.name}
                    subtitle={`Recorrente ${CADENCE_LABEL[r.cadence]}${r.nextDate ? ` · próxima ~${shortDate(r.nextDate)}` : ""}${r.onCard ? " · no cartão (entra na fatura)" : ""}`}
                    value={r.monthly}
                    muted={r.onCard}
                  />
                ))}
                {p.loans.map((l) => (
                  <Row
                    key={l.id}
                    title={`${l.name} (${l.institution})`}
                    subtitle={`Parcela todo dia ${l.day}${l.remaining != null ? ` · faltam ${l.remaining}` : ""}`}
                    value={l.installment}
                  />
                ))}
                {p.debts.map((d) => (
                  <Row
                    key={d.id}
                    title={d.name}
                    subtitle={
                      d.single
                        ? `Dívida · pagamento único em ${longDate(d.date!)}${d.current ? "" : " (fora deste mês)"}`
                        : `Dívida · todo dia ${d.day} · ${d.remaining === 1 ? "última parcela" : `faltam ${d.remaining} parcelas`} (até ${monthLong(d.endMonth)})`
                    }
                    value={d.amount}
                    muted={!d.current}
                  />
                ))}
                <Total
                  label="Total por mês"
                  value={p.fixedTotal + p.recurringTotal + p.loansTotal + p.debtsTotal}
                />
                {p.recurringOnCardTotal > 0 && (
                  <p className="text-muted-foreground pt-1 text-xs">
                    Mais {money(p.recurringOnCardTotal)}/mês de recorrentes no cartão, que já entram
                    nas faturas.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDaysIcon className="size-4" /> Agenda de pagamentos
              </CardTitle>
              <CardDescription>
                Próximos 35 dias, com o saldo projetado a partir de{" "}
                {money(p.cash)} em conta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {p.lowestBalance && p.lowestBalance.value < 0 && (
                <div className="border-warning/40 bg-warning/10 flex gap-3 rounded-lg border p-3 text-sm">
                  <AlertTriangleIcon className="text-warning mt-0.5 size-4 shrink-0" />
                  <p>
                    O saldo fica negativo em {longDate(p.lowestBalance.date)} (
                    <span className="tabular-nums">
                      {money(p.lowestBalance.value)}
                    </span>
                    ). Antecipe dinheiro para a conta ou reorganize os
                    vencimentos.
                  </p>
                </div>
              )}
              <Agenda items={p.agenda} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PiggyBankIcon className="size-4" /> Próximos meses
              </CardTitle>
              <CardDescription>
                O que sobra antes de qualquer compra nova, contando as parcelas
                que já estão no cartão
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {p.projection.map((m) => (
                  <div
                    key={m.month}
                    className="space-y-2 rounded-lg border p-4"
                  >
                    <p className="text-sm font-medium">{monthLong(m.month)}</p>
                    <p
                      className={cn(
                        "text-2xl font-semibold tabular-nums",
                        m.free < 0 && "text-negative",
                      )}
                    >
                      {money(m.free)}
                    </p>
                    <dl className="text-muted-foreground space-y-0.5 text-xs">
                      <Mini label="Contas fixas" value={m.fixed} />
                      {m.recurring > 0 && (
                        <Mini label="Recorrentes" value={m.recurring} />
                      )}
                      <Mini
                        label="Parcelas já no cartão"
                        value={m.cardCommitted}
                      />
                      {m.loans > 0 && (
                        <Mini label="Empréstimos" value={m.loans} />
                      )}
                      {m.debts > 0 && <Mini label="Dívidas" value={m.debts} />}
                      <Mini label="Guardar" value={m.savings} />
                    </dl>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="size-4" /> Salário e contas fixas
              </CardTitle>
              <CardDescription>
                {configured
                  ? "Salvo na sua conta. Só você vê."
                  : "Ainda não salvo."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {editor}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: number;
  strong?: boolean;
  tone?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          strong && "font-semibold",
          tone && (value < 0 ? "text-negative" : "text-positive"),
        )}
      >
        {money(value)}
      </dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="tabular-nums">−{money(value)}</dd>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "negative" | "warning";
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn("gap-2", highlight && "border-primary/40 bg-primary/5")}
    >
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction className="text-muted-foreground [&_svg]:size-4">
          {icon}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1">
        <p
          className={cn(
            "text-2xl font-semibold tracking-tight tabular-nums",
            tone === "negative" && "text-negative",
            tone === "warning" && "text-warning",
          )}
        >
          {value}
        </p>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Row({
  title,
  subtitle,
  value,
  badge,
  muted,
}: {
  title: string;
  subtitle: string;
  value: number;
  badge?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-2 text-sm",
        muted && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate">{title}</span>
          {badge && (
            <Badge
              variant={badge === "Vencida" ? "negative" : "warning"}
              className="shrink-0"
            >
              {badge}
            </Badge>
          )}
        </p>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </div>
      <span className="shrink-0 tabular-nums">{money(value)}</span>
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
      <span>{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );
}

const KIND_STYLE: Record<AgendaItem["kind"], string> = {
  salario: "bg-positive",
  fixa: "bg-chart-2",
  fatura: "bg-chart-1",
  emprestimo: "bg-chart-4",
  recorrente: "bg-chart-3",
  divida: "bg-chart-5",
};

function Agenda({ items }: { items: AgendaItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nada previsto nos próximos dias.
      </p>
    );
  }
  return (
    <ol className="divide-y">
      {items.map((it, i) => (
        <li
          key={`${it.date}-${it.name}-${i}`}
          className="flex items-center gap-3 py-2.5 text-sm"
        >
          <div className="w-12 shrink-0 text-center">
            <p className="font-semibold tabular-nums">{shortDate(it.date)}</p>
            <p className="text-muted-foreground text-[10px] uppercase">
              {weekday(it.date).slice(0, 3)}
            </p>
          </div>
          <span
            className={cn("size-2 shrink-0 rounded-full", KIND_STYLE[it.kind])}
          />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate",
                it.informative && "text-muted-foreground",
              )}
            >
              {it.name}
            </p>
            {it.informative && (
              <p className="text-muted-foreground text-xs">
                Cobrada no cartão, já conta na fatura
              </p>
            )}
          </div>
          <div className="text-right">
            <p
              className={cn(
                "tabular-nums",
                it.amount > 0 && "text-positive font-medium",
                it.informative && "text-muted-foreground line-through",
              )}
            >
              {it.amount > 0 ? "+" : "−"}
              {money(Math.abs(it.amount))}
            </p>
            <p
              className={cn(
                "text-xs tabular-nums",
                it.balanceAfter < 0 ? "text-negative" : "text-muted-foreground",
              )}
            >
              saldo {money(it.balanceAfter)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

import { connection } from "next/server";
import { CreditCardIcon, LandmarkIcon, PiggyBankIcon } from "lucide-react";

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
import { analyze } from "@/lib/finance/analyze";
import { getSnapshot, resolvePeriod } from "@/lib/finance/data";
import { longDate, money, percent } from "@/lib/format";
import type { Account } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

// Painel pessoal: sempre busca dados na hora (sem pré-renderização).
export const instant = false;

export default async function AccountsPage({ searchParams }: PageProps<"/contas">) {
  await connection();
  const sp = await searchParams;
  const period = resolvePeriod(Number(sp.dias ?? 30));
  const snapshot = await getSnapshot(period.days);
  const a = analyze(snapshot, period);
  const netWorth = a.cashBalance - a.cardDebt - a.loanDebt;

  return (
    <PageShell
      snapshot={snapshot}
      period={period}
      title="Contas e dívidas"
      description="Saldos, limites e empréstimos de todas as instituições conectadas"
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Em conta" value={a.cashBalance} tone="positive" />
        <Summary label="Usado nos cartões" value={-a.cardDebt} />
        <Summary label="Empréstimos a pagar" value={-a.loanDebt} />
        <Summary
          label="Posição líquida"
          value={netWorth}
          tone={netWorth >= 0 ? "positive" : "negative"}
          hint="Dinheiro em conta menos tudo o que você deve"
        />
      </section>

      <Section icon={<PiggyBankIcon className="size-4" />} title="Contas">
        {a.cashAccounts.map((acc) => (
          <Card key={acc.id}>
            <CardHeader>
              <CardDescription>{acc.institution}</CardDescription>
              <CardTitle className="text-base">{acc.name}</CardTitle>
              <CardAction>
                <Badge variant="secondary">
                  {acc.category === "SAVINGS_ACCOUNT" ? "Poupança" : "Conta"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{money(acc.balanceCurrent)}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Disponível: {money(acc.balanceAvailable)}
              </p>
            </CardContent>
          </Card>
        ))}
      </Section>

      <Section icon={<CreditCardIcon className="size-4" />} title="Cartões de crédito">
        {a.cards.map((c) => (
          <CreditCardCard key={c.id} account={c} />
        ))}
      </Section>

      <Section icon={<LandmarkIcon className="size-4" />} title="Empréstimos e financiamentos">
        {a.loans.map((l) => (
          <LoanCard key={l.id} account={l} />
        ))}
      </Section>
    </PageShell>
  );
}

function Summary({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative";
  hint?: string;
}) {
  return (
    <Card className="gap-1 py-5">
      <CardContent className="px-5">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums",
            tone === "positive" && "text-positive",
            tone === "negative" && "text-negative",
          )}
        >
          {money(value)}
        </p>
        {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h2>
      {children.length ? (
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          Nada conectado aqui ainda.
        </p>
      )}
    </section>
  );
}

function CreditCardCard({ account }: { account: Account }) {
  const limit = account.credit?.limit ?? 0;
  const used = account.credit?.used ?? 0;
  const share = limit ? used / limit : 0;

  return (
    <Card>
      <CardHeader>
        <CardDescription>{account.institution}</CardDescription>
        <CardTitle className="text-base capitalize">{account.name}</CardTitle>
        <CardAction className="flex gap-1">
          {account.credit?.network && <Badge variant="outline">{account.credit.network}</Badge>}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">{money(used)}</span>
            <span className="text-muted-foreground text-sm">de {money(limit)}</span>
          </div>
          <Progress
            value={share * 100}
            className="h-2.5"
            indicatorClassName={cn(
              share >= 0.8 ? "bg-negative" : share >= 0.5 ? "bg-warning" : "bg-primary",
            )}
          />
          <p className="text-muted-foreground mt-1.5 text-xs">
            {percent(share)} do limite em uso, incluindo parcelas futuras
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Item label="Disponível" value={money(account.credit?.available)} />
          <Item label="Pagamento mínimo" value={money(account.credit?.minimumPayment)} />
          <Item label="Fechamento" value={longDate(account.credit?.cuttingDate)} />
          <Item
            label="Cartões"
            value={account.credit?.cards.length ? account.credit.cards.map((c) => `•${c}`).join(" ") : "—"}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function LoanCard({ account }: { account: Account }) {
  const l = account.loan;
  const total = l?.installmentsTotal ?? 0;
  const paid = l?.installmentsPaid ?? 0;
  const rate = l?.effectiveYearlyRate ?? null;
  const monthly = rate != null ? Math.pow(1 + rate, 1 / 12) - 1 : null;

  return (
    <Card>
      <CardHeader>
        <CardDescription>{account.institution}</CardDescription>
        <CardTitle className="text-base">{account.name}</CardTitle>
        <CardAction>
          {rate != null && (
            <Badge variant={rate >= 0.6 ? "negative" : rate >= 0.3 ? "warning" : "secondary"}>
              CET {percent(rate)} a.a.
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">{money(l?.outstanding)}</span>
            <span className="text-muted-foreground text-sm">
              {paid}/{total} parcelas pagas
            </span>
          </div>
          <Progress value={total ? (paid / total) * 100 : 0} className="h-2.5" />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Item label="Valor contratado" value={money(l?.contractAmount)} />
          <Item
            label="Juros ao mês"
            value={monthly != null ? `${(monthly * 100).toFixed(2).replace(".", ",")}%` : "—"}
          />
          <Item label="Início" value={longDate(l?.startDate)} />
          <Item label="Término" value={longDate(l?.endDate)} />
          {(l?.installmentsPastDue ?? 0) > 0 && (
            <Item
              label="Em atraso"
              value={`${l?.installmentsPastDue} parcela(s)`}
              className="text-negative"
            />
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Item({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn("font-medium tabular-nums", className)}>{value}</dd>
    </div>
  );
}

import { connection } from "next/server";
import {
  AlertCircleIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  CreditCardIcon,
  LayersIcon,
  ReceiptIcon,
  WalletCardsIcon,
} from "lucide-react";

import { BillsChart } from "@/components/charts";
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
import {
  BILL_STATUS,
  buildBills,
  type Bill,
  type CardBills,
} from "@/lib/finance/bills";
import { getSnapshot, resolvePeriod } from "@/lib/finance/data";
import { filterByBank } from "@/lib/finance/filter";
import { longDate, money, monthLong, percent, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// Painel pessoal: sempre busca dados na hora (sem pré-renderização).
export const instant = false;

/** Faturas precisam de mais histórico que o painel: sempre 90 dias. */
const DAYS = 90;

export default async function BillsPage({
  searchParams,
}: PageProps<"/faturas">) {
  await connection();
  const sp = await searchParams;
  const period = resolvePeriod(DAYS);
  const snapshot = filterByBank(await getSnapshot(period.days), sp.banco);
  const today = new Date().toISOString().slice(0, 10);
  const o = buildBills(snapshot, today, period.from);
  const usedLimit = o.totalLimit - o.availableLimit;

  return (
    <PageShell
      snapshot={snapshot}
      period={period}
      title="Faturas"
      description={`Faturas dos cartões montadas a partir dos lançamentos dos últimos ${DAYS} dias`}
    >
      {o.cards.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Nenhum cartão de crédito{" "}
            {snapshot.bank ? `no ${snapshot.bank}` : "conectado"}.
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<ReceiptIcon />}
              label="A pagar"
              value={money(o.toPay)}
              hint="Faturas fechadas em aberto + faturas atuais"
            />
            <Kpi
              icon={<CalendarClockIcon />}
              label="Próximo vencimento"
              value={o.next ? money(o.next.remaining) : "—"}
              hint={
                o.next
                  ? `${o.next.account.institution} · ${o.next.dueDate ? `${o.next.dueEstimated ? "por volta de " : ""}${longDate(o.next.dueDate)}` : monthLong(o.next.month)}`
                  : "Nada pendente"
              }
              tone={o.next?.status === "vencida" ? "negative" : undefined}
            />
            <Kpi
              icon={<LayersIcon />}
              label="Parcelas futuras"
              value={money(o.futureTotal)}
              hint="Já comprometido nas próximas faturas"
            />
            <Kpi
              icon={<WalletCardsIcon />}
              label="Limite disponível"
              value={money(o.availableLimit)}
              hint={`de ${money(o.totalLimit)} · ${percent(o.totalLimit ? usedLimit / o.totalLimit : null)} usado`}
              progress={
                o.totalLimit ? (usedLimit / o.totalLimit) * 100 : undefined
              }
            />
          </section>

          {o.overdue.length > 0 && (
            <div className="border-negative/40 bg-negative/10 flex gap-3 rounded-lg border p-4 text-sm">
              <AlertCircleIcon className="text-negative mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  {o.overdue.length === 1
                    ? "1 fatura vencida sem pagamento identificado"
                    : `${o.overdue.length} faturas vencidas sem pagamento identificado`}
                </p>
                {o.overdue.map((b) => (
                  <p key={b.key} className="text-muted-foreground">
                    {b.account.institution}: {money(b.remaining)} com vencimento
                    em {longDate(b.dueDate)}. Se pagou por outro banco ou o
                    pagamento ainda não sincronizou, desconsidere.
                  </p>
                ))}
              </div>
            </div>
          )}

          {o.monthly.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Faturas por mês</CardTitle>
                <CardDescription>
                  Fechadas, atual (•) e parcelas que já caem nos próximos meses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BillsChart
                  data={o.monthly}
                  currentMonth={
                    o.cards
                      .map((c) => c.open?.month)
                      .filter(Boolean)
                      .sort()[0] ?? today.slice(0, 7)
                  }
                  series={o.cards.map((c) => ({
                    key: c.account.id,
                    label: `${c.account.institution} · ${c.account.name}`,
                  }))}
                />
              </CardContent>
            </Card>
          )}

          {o.cards.map((c) => (
            <CardSection key={c.account.id} card={c} />
          ))}

          {o.otherBankBills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Faturas de outros cartões</CardTitle>
                <CardDescription>
                  Boletos de cartões que não estão conectados, pagos pelas suas
                  contas
                </CardDescription>
              </CardHeader>
              <CardContent className="divide-y">
                {o.otherBankBills.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-4 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.counterpart}</p>
                      <p className="text-muted-foreground text-xs">
                        {longDate(t.date)} · pago via {t.institution}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums">
                      {money(t.amount)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "negative";
  progress?: number;
}) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction className="text-muted-foreground [&_svg]:size-4">
          {icon}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        <p
          className={cn(
            "text-2xl font-semibold tracking-tight tabular-nums",
            tone === "negative" && "text-negative",
          )}
        >
          {value}
        </p>
        {progress != null && (
          <Progress
            value={progress}
            indicatorClassName={
              progress >= 80
                ? "bg-negative"
                : progress >= 50
                  ? "bg-warning"
                  : undefined
            }
          />
        )}
        <p className="text-muted-foreground text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

function CardSection({ card }: { card: CardBills }) {
  const { account, bills, open } = card;
  const usage =
    card.limit && card.used != null ? (card.used / card.limit) * 100 : null;
  const finals = account.credit?.cards ?? [];

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <CreditCardIcon className="size-3.5" />
          {account.institution}
          {account.credit?.network ? ` · ${account.credit.network}` : ""}
        </CardDescription>
        <CardTitle className="text-lg capitalize">{account.name}</CardTitle>
        {finals.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {finals.map((f) => (
              <Badge key={f} variant="outline" className="font-mono">
                •••• {f}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Fatura atual"
            value={money(open?.amount ?? 0)}
            hint={
              open?.dueDate
                ? `${open.dueEstimated ? "Vence por volta de" : "Vence em"} ${longDate(open.dueDate)}`
                : "Sem lançamentos na fatura aberta"
            }
          />
          <Stat
            label="Pagamento mínimo"
            value={money(account.credit?.minimumPayment)}
            hint="Pagar só o mínimo leva ao rotativo, os juros mais caros do mercado"
          />
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">Limite usado</p>
            <p className="text-lg font-semibold tabular-nums">
              {money(card.used)}{" "}
              <span className="text-muted-foreground text-sm font-normal">
                de {money(card.limit)}
              </span>
            </p>
            {usage != null && (
              <Progress
                value={usage}
                indicatorClassName={
                  usage >= 80
                    ? "bg-negative"
                    : usage >= 50
                      ? "bg-warning"
                      : undefined
                }
              />
            )}
            <p className="text-muted-foreground text-xs">
              Disponível {money(card.available)} · inclui parcelas futuras
            </p>
          </div>
        </div>

        <div className="divide-y rounded-lg border">
          {bills.length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">
              Nenhum lançamento no período.
            </p>
          )}
          {bills.map((b) => (
            <BillRow key={b.key} bill={b} defaultOpen={b === open} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}

function BillRow({ bill, defaultOpen }: { bill: Bill; defaultOpen: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const status = BILL_STATUS[bill.status];
  const partial =
    bill.officialAmount != null &&
    Math.abs(bill.officialAmount - bill.itemsTotal) > 1;
  const top = bill.byCategory.slice(0, 4);
  const spent = bill.byCategory.reduce((s, c) => s + c.total, 0);

  return (
    <details className="group" open={defaultOpen}>
      <summary className="hover:bg-muted/50 flex cursor-pointer list-none items-center gap-3 p-3 sm:p-4 [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{monthLong(bill.month)}</span>
            <Badge variant={bill.paidLate ? "warning" : status.variant}>
              {bill.paidLate ? "Paga com atraso" : status.label}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {bill.dueDate
              ? `${bill.dueEstimated ? "Vence por volta de" : bill.dueDate < today ? "Venceu em" : "Vence em"} ${longDate(bill.dueDate)}`
              : "Vencimento não informado"}
            {" · "}
            {bill.items.length} lançamento{bill.items.length === 1 ? "" : "s"}
            {bill.installmentsCount > 0 &&
              ` · ${bill.installmentsCount} parcela(s)`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums">{money(bill.amount)}</p>
          {bill.paid > 0 && (
            <p className="text-positive text-xs tabular-nums">
              pago {money(bill.paid)}
            </p>
          )}
          {bill.status === "vencida" && (
            <p className="text-negative text-xs tabular-nums">
              falta {money(bill.remaining)}
            </p>
          )}
        </div>
      </summary>

      <div className="space-y-4 px-3 pb-4 sm:px-4 sm:pl-11">
        {partial && (
          <p className="text-muted-foreground text-xs">
            Valor oficial da fatura: {money(bill.officialAmount)}. Os
            lançamentos encontrados nos últimos {DAYS} dias somam{" "}
            {money(bill.itemsTotal)}; o restante é de compras mais antigas ou
            encargos.
          </p>
        )}

        {bill.fees > 0 && (
          <div className="border-warning/40 bg-warning/10 rounded-md border p-3 text-xs">
            <span className="font-medium">
              {money(bill.fees)} em juros, multas e IOF
            </span>
            <span className="text-muted-foreground">
              {" "}
              nesta fatura. Costuma vir de pagamento atrasado ou parcial da
              fatura anterior.
            </span>
          </div>
        )}

        {top.length > 0 && (
          <div className="space-y-2">
            <div className="bg-muted flex h-2 overflow-hidden rounded-full">
              {top.map((c, i) => (
                <div
                  key={c.category}
                  style={{
                    width: `${(c.total / spent) * 100}%`,
                    background: `var(--chart-${(i % 5) + 1})`,
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {top.map((c, i) => (
                <span key={c.category} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: `var(--chart-${(i % 5) + 1})` }}
                  />
                  {c.category}
                  <span className="text-muted-foreground tabular-nums">
                    {money(c.total)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <ul className="divide-y text-sm">
          {bill.items.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-4 py-2"
            >
              <div className="min-w-0">
                <p className="truncate">{t.counterpart}</p>
                <p className="text-muted-foreground text-xs">
                  {shortDate(t.date)} · {t.category}
                  {t.installment &&
                    ` · parcela ${t.installment.number}/${t.installment.total}`}
                  {t.cardNumber &&
                    t.cardNumber !== "0000" &&
                    ` · final ${t.cardNumber}`}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 tabular-nums",
                  t.type === "INFLOW" && "text-positive",
                )}
              >
                {t.type === "INFLOW" ? "−" : ""}
                {money(t.amount)}
              </span>
            </li>
          ))}
        </ul>

        {bill.payments.length > 0 && (
          <div className="bg-muted/50 space-y-1 rounded-md p-3 text-xs">
            <p className="font-medium">Pagamentos</p>
            {bill.payments.map((p) => (
              <p
                key={p.id}
                className="text-muted-foreground flex justify-between"
              >
                <span>{longDate(p.date)}</span>
                <span className="tabular-nums">{money(p.amount)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

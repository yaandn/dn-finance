// Monta as faturas de cartão a partir dos lançamentos.
//
// O Open Finance informa, em cada lançamento de cartão, o mês da fatura em
// que ele cai (bill_forecast_date). Faturas já fechadas trazem também o
// vencimento e o valor total oficial. Com isso dá para reconstruir:
// faturas fechadas (pagas ou não), a fatura aberta e as parcelas futuras.

import { OTHER_BANK_BILLS } from "@/lib/finance/categories";
import type {
  Account,
  FinanceSnapshot,
  Transaction,
} from "@/lib/finance/types";

export type BillStatus =
  "paga" | "fechada" | "vencida" | "aberta" | "futura" | "sem-dados";

export type Bill = {
  key: string;
  accountId: string;
  /** Mês da fatura, YYYY-MM. */
  month: string;
  dueDate: string | null;
  /** true quando o vencimento foi estimado pelo dia de vencimento das faturas anteriores. */
  dueEstimated: boolean;
  /** Valor total informado pelo banco (só existe em faturas fechadas). */
  officialAmount: number | null;
  /** Soma dos lançamentos encontrados (compras + encargos − estornos). */
  itemsTotal: number;
  amount: number;
  paid: number;
  remaining: number;
  status: BillStatus;
  items: Transaction[];
  payments: Transaction[];
  byCategory: { category: string; total: number }[];
  installmentsCount: number;
  /** Juros, multas e IOF cobrados na fatura. */
  fees: number;
  /** Quitada depois do vencimento (considerando o próximo dia útil). */
  paidLate: boolean;
};

export type CardBills = {
  account: Account;
  bills: Bill[];
  open: Bill | null;
  /** Fatura mais próxima ainda não paga (fechada ou aberta). */
  next: Bill | null;
  futureTotal: number;
  limit: number | null;
  used: number | null;
  available: number | null;
};

export type BillsOverview = {
  cards: CardBills[];
  /** Fechadas não pagas + faturas abertas. */
  toPay: number;
  overdue: (Bill & { account: Account })[];
  next: (Bill & { account: Account }) | null;
  futureTotal: number;
  availableLimit: number;
  totalLimit: number;
  otherBankBills: Transaction[];
  monthly: { month: string; [cardId: string]: number | string }[];
};

const PAYMENT_REASON = "Pagamento da fatura do próprio cartão";
const round = (n: number) => Math.round(n * 100) / 100;

function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/** Vencimento em fim de semana passa para segunda-feira. */
function nextBusinessDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
    d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function withDay(month: string, day: number) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** Mês da fatura de um lançamento de cartão. */
function billMonth(t: Transaction): string {
  return (
    t.bill?.forecast ??
    t.bill?.dueDate?.slice(0, 7) ??
    t.accountingDate?.slice(0, 7) ??
    t.date.slice(0, 7)
  );
}

export function buildBills(
  snapshot: FinanceSnapshot,
  today: string,
  /** Início dos dados carregados: faturas que venceram antes disso não têm pagamento visível. */
  windowStart?: string,
  /** Parcelas de compras anteriores à janela que caem nas faturas dela. */
  olderInstallments: Transaction[] = [],
): BillsOverview {
  const cards = snapshot.accounts.filter((a) => a.category === "CREDIT_CARD");
  const currentMonth = today.slice(0, 7);
  const result: CardBills[] = [];

  for (const account of cards) {
    const txs = [...snapshot.transactions, ...olderInstallments].filter(
      (t) => t.accountId === account.id,
    );
    const payments = txs
      .filter((t) => t.type === "INFLOW" && t.internalReason === PAYMENT_REASON)
      .sort((a, b) => a.date.localeCompare(b.date));
    const entries = txs.filter(
      (t) => !payments.includes(t) && t.accountCategory === "CREDIT_CARD",
    );

    // Agrupa por mês da fatura
    const groups = new Map<string, Transaction[]>();
    for (const t of entries) {
      const m = billMonth(t);
      groups.set(m, [...(groups.get(m) ?? []), t]);
    }

    // Dia de vencimento: o da fatura fechada mais recente, ou o informado na conta
    const knownDue = entries
      .map((t) => t.bill?.dueDate)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
    const dueDay = knownDue
      ? Number(knownDue.slice(8, 10))
      : account.credit?.cuttingDate
        ? Number(account.credit.cuttingDate.slice(8, 10))
        : null;

    const bills: Bill[] = [...groups.entries()].map(([month, items]) => {
      const official =
        items.find((t) => t.bill?.dueDate && t.bill.amount != null)?.bill ??
        null;
      const outflow = items
        .filter((t) => t.type === "OUTFLOW")
        .reduce((s, t) => s + t.amount, 0);
      const credits = items
        .filter((t) => t.type === "INFLOW")
        .reduce((s, t) => s + t.amount, 0);
      const itemsTotal = round(outflow - credits);

      const cats = new Map<string, number>();
      for (const t of items) {
        if (t.type !== "OUTFLOW") continue;
        cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
      }

      const dueDate =
        official?.dueDate ?? (dueDay ? withDay(month, dueDay) : null);
      const amount = round(official?.amount ?? itemsTotal);
      return {
        key: `${account.id}:${month}`,
        accountId: account.id,
        month,
        dueDate,
        dueEstimated: !official?.dueDate,
        officialAmount: official?.amount ?? null,
        itemsTotal,
        amount,
        paid: 0,
        remaining: amount,
        status: official?.dueDate ? "fechada" : "aberta",
        items: items.sort((a, b) => b.date.localeCompare(a.date)),
        payments: [],
        byCategory: [...cats.entries()]
          .map(([category, total]) => ({ category, total: round(total) }))
          .sort((a, b) => b.total - a.total),
        installmentsCount: items.filter((t) => t.installment).length,
        paidLate: false,
        fees: round(
          items
            .filter(
              (t) =>
                t.type === "OUTFLOW" &&
                (t.operationType === "TARIFA" ||
                  t.rawCategory === "Fees & Charges"),
            )
            .reduce((s, t) => s + t.amount, 0),
        ),
      } satisfies Bill;
    });

    bills.sort((a, b) => a.month.localeCompare(b.month));
    const closed = bills.filter((b) => b.status === "fechada");

    // Distribui os pagamentos entre as faturas fechadas, da mais antiga para a mais nova.
    // A marca de fatura que vem no pagamento é a fatura onde ele é lançado (a seguinte),
    // não a que ele quita, por isso a associação é pela data.
    // Faturas que venceram antes do início dos dados ficam de fora: o pagamento
    // delas não foi carregado, e elas "roubariam" o pagamento da fatura seguinte.
    // (Aparecem por causa de parcelas de compras antigas.)
    const payable = closed.filter(
      (b) => !windowStart || b.dueDate! >= windowStart,
    );
    for (const p of payments) {
      const candidates = payable.filter((b) => {
        const diff = dayDiff(b.dueDate!, p.date);
        return diff <= 40 && diff >= -45;
      });
      const target =
        candidates.find((b) => b.paid + 0.01 < b.amount) ??
        [...candidates].sort(
          (a, b) =>
            Math.abs(dayDiff(a.dueDate!, p.date)) -
            Math.abs(dayDiff(b.dueDate!, p.date)),
        )[0];
      if (target) {
        target.paid = round(target.paid + p.amount);
        target.payments.push(p);
      }
    }

    // Status final
    const openMonths = bills
      .filter((b) => b.status === "aberta")
      .map((b) => b.month);
    const firstOpen =
      openMonths.find((m) => m >= currentMonth) ?? openMonths.at(-1) ?? null;
    for (const b of bills) {
      if (b.status === "fechada") {
        b.remaining = round(Math.max(0, b.amount - b.paid));
        if (b.remaining <= 1) {
          b.status = "paga";
          const last = b.payments.at(-1)?.date;
          b.paidLate = !!(
            last &&
            b.dueDate &&
            last > nextBusinessDay(b.dueDate)
          );
        } else if (
          windowStart &&
          b.dueDate &&
          dayDiff(b.dueDate, windowStart) < 10
        )
          b.status = "sem-dados";
        else if (b.dueDate && b.dueDate < today) b.status = "vencida";
      } else {
        b.status = firstOpen && b.month > firstOpen ? "futura" : "aberta";
        b.remaining = b.amount;
      }
    }

    // Faturas abertas antigas (sem vencimento informado) viram a fatura atual
    const open =
      bills.find((b) => b.status === "aberta" && b.month === firstOpen) ?? null;
    const pending = bills
      .filter(
        (b) =>
          ["fechada", "vencida", "aberta"].includes(b.status) &&
          b.remaining > 0,
      )
      .sort((a, b) =>
        (a.dueDate ?? a.month).localeCompare(b.dueDate ?? b.month),
      );

    result.push({
      account,
      bills: bills.reverse(),
      open,
      next: pending[0] ?? null,
      futureTotal: round(
        bills
          .filter((b) => b.status === "futura")
          .reduce((s, b) => s + b.amount, 0),
      ),
      limit: account.credit?.limit ?? null,
      used: account.credit?.used ?? account.balanceCurrent,
      available: account.credit?.available ?? account.balanceAvailable,
    });
  }

  const allBills = result.flatMap((c) =>
    c.bills.map((b) => ({ ...b, account: c.account })),
  );
  const unpaid = allBills.filter((b) =>
    ["fechada", "vencida", "aberta"].includes(b.status),
  );
  const next = unpaid
    .filter((b) => b.remaining > 0)
    .sort((a, b) =>
      (a.dueDate ?? a.month).localeCompare(b.dueDate ?? b.month),
    )[0];

  // Série por mês (uma coluna por cartão) para o gráfico
  const months = [...new Set(allBills.map((b) => b.month))].sort();
  const monthly = months.map((month) => {
    const row: { month: string; [k: string]: number | string } = { month };
    for (const c of result) {
      const b = c.bills.find((x) => x.month === month);
      row[c.account.id] = b ? b.amount : 0;
    }
    return row;
  });

  return {
    cards: result,
    toPay: round(unpaid.reduce((s, b) => s + b.remaining, 0)),
    overdue: allBills.filter((b) => b.status === "vencida"),
    next: next ?? null,
    futureTotal: round(result.reduce((s, c) => s + c.futureTotal, 0)),
    availableLimit: round(result.reduce((s, c) => s + (c.available ?? 0), 0)),
    totalLimit: round(result.reduce((s, c) => s + (c.limit ?? 0), 0)),
    otherBankBills: snapshot.transactions
      .filter((t) => t.category === OTHER_BANK_BILLS && t.type === "OUTFLOW")
      .sort((a, b) => b.date.localeCompare(a.date)),
    monthly,
  };
}

export const BILL_STATUS: Record<
  BillStatus,
  {
    label: string;
    variant: "positive" | "negative" | "warning" | "secondary" | "outline";
  }
> = {
  paga: { label: "Paga", variant: "positive" },
  fechada: { label: "Fechada · a pagar", variant: "warning" },
  vencida: { label: "Sem pagamento identificado", variant: "negative" },
  aberta: { label: "Aberta", variant: "secondary" },
  futura: { label: "Parcelas futuras", variant: "outline" },
  "sem-dados": { label: "Pagamento fora do período", variant: "outline" },
};

export { addMonths as addBillMonths };

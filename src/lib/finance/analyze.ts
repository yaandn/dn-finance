import { GAMBLING, OTHER_BANK_BILLS, looksLikeSubscription } from "@/lib/finance/categories";
import type { Account, FinanceSnapshot, Period, Transaction } from "@/lib/finance/types";

export type CategoryTotal = { category: string; total: number; count: number; share: number };
export type DailyPoint = { date: string; entradas: number; saidas: number; saldo: number };
export type CounterpartTotal = { name: string; total: number; count: number; logo: string | null };
export type Subscription = { name: string; amount: number; lastDate: string; logo: string | null };
export type Alert = { level: "danger" | "warning" | "info"; title: string; detail: string };

export type Analysis = {
  period: Period;
  income: number;
  expenses: number;
  net: number;
  cashBalance: number;
  cardDebt: number;
  loanDebt: number;
  savingsRate: number | null;
  byCategory: CategoryTotal[];
  incomeByCategory: CategoryTotal[];
  daily: DailyPoint[];
  topCounterparts: CounterpartTotal[];
  topIncomeSources: CounterpartTotal[];
  subscriptions: Subscription[];
  subscriptionsMonthly: number;
  cards: Account[];
  loans: Account[];
  cashAccounts: Account[];
  alerts: Alert[];
  internalCount: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

function groupBy(
  list: Transaction[],
  key: (t: Transaction) => string,
  logo?: (t: Transaction) => string | null,
) {
  const map = new Map<string, { total: number; count: number; logo: string | null }>();
  for (const t of list) {
    const k = key(t);
    const cur = map.get(k) ?? { total: 0, count: 0, logo: logo?.(t) ?? null };
    cur.total += t.amount;
    cur.count += 1;
    map.set(k, cur);
  }
  return map;
}

export function analyze(snapshot: FinanceSnapshot, period: Period): Analysis {
  const real = snapshot.transactions.filter((t) => !t.internal);
  const inflows = real.filter((t) => t.type === "INFLOW");
  const outflows = real.filter((t) => t.type === "OUTFLOW");

  const income = round(inflows.reduce((s, t) => s + t.amount, 0));
  const expenses = round(outflows.reduce((s, t) => s + t.amount, 0));

  const toTotals = (list: Transaction[], total: number): CategoryTotal[] =>
    [...groupBy(list, (t) => t.category).entries()]
      .map(([category, v]) => ({
        category,
        total: round(v.total),
        count: v.count,
        share: total > 0 ? v.total / total : 0,
      }))
      .sort((a, b) => b.total - a.total);

  // Série diária com saldo acumulado do período
  const daily: DailyPoint[] = [];
  const start = new Date(`${period.from}T12:00:00`);
  let running = 0;
  for (let i = 0; i < period.days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const dayIn = inflows.filter((t) => t.date === key).reduce((s, t) => s + t.amount, 0);
    const dayOut = outflows.filter((t) => t.date === key).reduce((s, t) => s + t.amount, 0);
    running += dayIn - dayOut;
    daily.push({ date: key, entradas: round(dayIn), saidas: round(dayOut), saldo: round(running) });
  }

  const counterparts = (list: Transaction[]) =>
    [...groupBy(list, (t) => t.counterpart, (t) => t.merchantLogo).entries()]
      .map(([name, v]) => ({ name, total: round(v.total), count: v.count, logo: v.logo }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

  // Assinaturas: agrupa por estabelecimento e usa o valor mais recente
  const subsMap = new Map<string, Subscription>();
  for (const t of outflows) {
    if (!looksLikeSubscription(t)) continue;
    if (t.installment && t.installment.total > 1) {
      // Assinatura parcelada (ex.: plano anual em 12x): conta a parcela uma vez
      const name = t.counterpart.replace(/\s*\d+\/\d+$/, "");
      if (!subsMap.has(name)) {
        subsMap.set(name, { name, amount: t.amount, lastDate: t.date, logo: t.merchantLogo });
      }
      continue;
    }
    const name = t.merchant ?? t.counterpart;
    const cur = subsMap.get(name);
    if (!cur || t.date > cur.lastDate) {
      subsMap.set(name, {
        name,
        amount: cur && cur.lastDate.slice(0, 7) === t.date.slice(0, 7) ? cur.amount + t.amount : t.amount,
        lastDate: t.date,
        logo: t.merchantLogo,
      });
    } else if (cur.lastDate.slice(0, 7) === t.date.slice(0, 7)) {
      cur.amount += t.amount;
    }
  }
  const subscriptions = [...subsMap.values()]
    .map((s) => ({ ...s, amount: round(s.amount) }))
    .sort((a, b) => b.amount - a.amount);

  const cards = snapshot.accounts.filter((a) => a.category === "CREDIT_CARD");
  const loans = snapshot.accounts.filter(
    (a) => a.category === "LOAN_ACCOUNT" || a.category === "FINANCING_ACCOUNT",
  );
  const cashAccounts = snapshot.accounts.filter(
    (a) => a.category === "CHECKING_ACCOUNT" || a.category === "SAVINGS_ACCOUNT",
  );

  const cashBalance = round(cashAccounts.reduce((s, a) => s + (a.balanceCurrent ?? 0), 0));
  const cardDebt = round(cards.reduce((s, a) => s + (a.credit?.used ?? a.balanceCurrent ?? 0), 0));
  const loanDebt = round(loans.reduce((s, a) => s + (a.loan?.outstanding ?? a.balanceCurrent ?? 0), 0));

  // Alertas
  const alerts: Alert[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const c of cards) {
    const limit = c.credit?.limit ?? 0;
    const used = c.credit?.used ?? 0;
    if (limit > 0 && used / limit >= 0.5) {
      alerts.push({
        level: used / limit >= 0.8 ? "danger" : "warning",
        title: `Cartão ${c.institution} com ${Math.round((used / limit) * 100)}% do limite usado`,
        detail: `R$ ${used.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de R$ ${limit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}, contando parcelas futuras.`,
      });
    }

    // Fatura fechada e vencida sem pagamento equivalente identificado
    const bills = new Map<string, { due: string; amount: number }>();
    for (const t of snapshot.transactions) {
      if (t.accountId !== c.id || !t.bill?.dueDate || !t.bill.amount) continue;
      bills.set(t.bill.dueDate, { due: t.bill.dueDate, amount: t.bill.amount });
    }
    for (const bill of bills.values()) {
      if (bill.due >= today) continue;
      const paid = snapshot.transactions
        .filter(
          (t) =>
            t.accountId === c.id &&
            t.type === "INFLOW" &&
            t.internalReason === "Pagamento da fatura do próprio cartão",
        )
        .reduce((s, t) => s + t.amount, 0);
      if (paid + 1 < bill.amount) {
        alerts.push({
          level: "danger",
          title: `Fatura do ${c.institution} de ${bill.due.split("-").reverse().join("/")} pode não estar quitada`,
          detail: `Fatura de R$ ${bill.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}; pagamentos identificados no período: R$ ${paid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Se pagou por outro banco, ignore.`,
        });
      }
    }
  }

  for (const l of loans) {
    const rate = l.loan?.effectiveYearlyRate;
    if (rate && rate >= 0.3) {
      alerts.push({
        level: rate >= 0.6 ? "danger" : "warning",
        title: `${l.name} (${l.institution}) custa ${(rate * 100).toFixed(0)}% ao ano`,
        detail: `Saldo devedor de R$ ${(l.loan?.outstanding ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Antecipar parcelas reduz juros.`,
      });
    }
    if ((l.loan?.installmentsPastDue ?? 0) > 0) {
      alerts.push({
        level: "danger",
        title: `${l.loan?.installmentsPastDue} parcela(s) em atraso em ${l.name}`,
        detail: "Atrasos geram multa e juros de mora.",
      });
    }
  }

  const gambling = outflows.filter((t) => t.category === GAMBLING);
  if (gambling.length) {
    const total = gambling.reduce((s, t) => s + t.amount, 0);
    alerts.push({
      level: "warning",
      title: `R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} classificados como apostas`,
      detail: "Classificação automática da Belvo. Se não for aposta, ajuste a categoria na sua planilha ou no Notion.",
    });
  }

  const otherBanks = outflows.filter((t) => t.category === OTHER_BANK_BILLS);
  if (otherBanks.length) {
    alerts.push({
      level: "info",
      title: `${otherBanks.length} pagamento(s) de cartões de outros bancos`,
      detail: "Conecte esses bancos na Belvo para ver os gastos reais dentro dessas faturas.",
    });
  }

  if (income > 0 && expenses > income) {
    alerts.push({
      level: "danger",
      title: "Você gastou mais do que recebeu no período",
      detail: `Diferença de R$ ${(expenses - income).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
    });
  }

  return {
    period,
    income,
    expenses,
    net: round(income - expenses),
    cashBalance,
    cardDebt,
    loanDebt,
    savingsRate: income > 0 ? (income - expenses) / income : null,
    byCategory: toTotals(outflows, expenses),
    incomeByCategory: toTotals(inflows, income),
    daily,
    topCounterparts: counterparts(outflows),
    topIncomeSources: counterparts(inflows),
    subscriptions,
    subscriptionsMonthly: round(subscriptions.reduce((s, x) => s + x.amount, 0)),
    cards,
    loans,
    cashAccounts,
    alerts: alerts.sort(
      (a, b) =>
        ["danger", "warning", "info"].indexOf(a.level) -
        ["danger", "warning", "info"].indexOf(b.level),
    ),
    internalCount: snapshot.transactions.filter((t) => t.internal).length,
  };
}

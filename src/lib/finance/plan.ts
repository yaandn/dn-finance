// Cálculo do planejamento mensal: salário menos contas fixas, faturas atuais
// e parcelas de empréstimo, com meta de poupança e agenda de pagamentos.

import type { BillsOverview } from "@/lib/finance/bills";
import type { FinanceSnapshot } from "@/lib/finance/types";
import type { PlanSettings } from "@/lib/finance/plan-store";

export type PlanBill = {
  key: string;
  institution: string;
  card: string;
  month: string;
  dueDate: string | null;
  dueEstimated: boolean;
  amount: number;
  status: string;
};

export type PlanLoan = {
  id: string;
  name: string;
  institution: string;
  installment: number;
  day: number;
  remaining: number | null;
};

export type AgendaItem = {
  date: string;
  name: string;
  kind: "salario" | "fixa" | "fatura" | "emprestimo";
  amount: number;
  /** Conta no cartão: aparece na agenda, mas já está dentro da fatura. */
  informative: boolean;
  balanceAfter: number;
};

export type MonthProjection = {
  month: string;
  income: number;
  fixed: number;
  loans: number;
  cardCommitted: number;
  savings: number;
  free: number;
};

export type Plan = {
  income: number;
  fixedTotal: number;
  fixedOnCardTotal: number;
  bills: PlanBill[];
  billsTotal: number;
  loans: PlanLoan[];
  loansTotal: number;
  committed: number;
  savingsTarget: number;
  free: number;
  perDay: number;
  committedPct: number;
  nextSalary: string;
  daysToSalary: number;
  cash: number;
  agenda: AgendaItem[];
  lowestBalance: { date: string; value: number } | null;
  projection: MonthProjection[];
};

const round = (n: number) => Math.round(n * 100) / 100;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dateIn(year: number, month0: number, day: number) {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month0, Math.min(day, last), 12));
}

/** Próxima ocorrência (>= hoje) de um dia do mês. */
function nextOccurrence(todayIso: string, day: number) {
  const t = new Date(`${todayIso}T12:00:00Z`);
  const thisMonth = dateIn(t.getUTCFullYear(), t.getUTCMonth(), day);
  return iso(thisMonth) >= todayIso
    ? thisMonth
    : dateIn(t.getUTCFullYear(), t.getUTCMonth() + 1, day);
}

function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Parte do plano que vem só dos dados do banco (não muda ao editar o planejamento). */
export type PlanBase = {
  today: string;
  bills: PlanBill[];
  billsTotal: number;
  loans: PlanLoan[];
  loansTotal: number;
  cash: number;
  /** Já comprometido nos cartões para os 3 meses seguintes às faturas atuais. */
  upcomingCard: { month: string; amount: number }[];
};

export function computePlanBase(
  snapshot: FinanceSnapshot,
  billsOverview: BillsOverview,
  today: string,
): PlanBase {
  // Faturas atuais: abertas + fechadas ainda não quitadas
  const bills: PlanBill[] = billsOverview.cards.flatMap((c) =>
    c.bills
      .filter(
        (b) =>
          ["aberta", "fechada", "vencida"].includes(b.status) &&
          b.remaining > 0,
      )
      .map((b) => ({
        key: b.key,
        institution: c.account.institution,
        card: c.account.name,
        month: b.month,
        dueDate: b.dueDate,
        dueEstimated: b.dueEstimated,
        amount: b.remaining,
        status: b.status,
      })),
  );
  bills.sort((a, b) =>
    (a.dueDate ?? a.month).localeCompare(b.dueDate ?? b.month),
  );
  const billsTotal = round(bills.reduce((s, b) => s + b.amount, 0));

  // Empréstimos: valor da última parcela registrada na conta do empréstimo
  const loanAccounts = snapshot.accounts.filter(
    (a) => a.category === "LOAN_ACCOUNT" || a.category === "FINANCING_ACCOUNT",
  );
  const latest = <T extends { date: string }>(xs: T[]) =>
    xs.reduce<T | undefined>((m, x) => (!m || x.date > m.date ? x : m), undefined);
  const loanDebits = loanAccounts.length
    ? snapshot.transactions.filter(
        (t) =>
          t.type === "OUTFLOW" &&
          t.accountCategory !== "CREDIT_CARD" &&
          (t.operationType === "OPERACAO_CREDITO" ||
            /parcela/i.test(t.description)) &&
          t.rawCategory === "Credits & Loans",
      )
    : [];
  const loans: PlanLoan[] = loanAccounts.flatMap((a) => {
    if (a.loan?.installmentsOutstanding === 0) return [];
    // 1º: espelho da parcela na própria conta do empréstimo.
    // 2º: débito da parcela na conta corrente do mesmo banco.
    const last =
      latest(
        snapshot.transactions.filter((t) => t.accountId === a.id && t.amount > 0),
      ) ??
      latest(
        loanDebits.filter(
          (t) => t.institution === a.institution || loanAccounts.length === 1,
        ),
      );
    if (!last) return [];
    return [
      {
        id: a.id,
        name: a.name,
        institution: a.institution,
        installment: last.amount,
        day: Number(last.date.slice(8, 10)),
        remaining: a.loan?.installmentsOutstanding ?? null,
      },
    ];
  });
  const loansTotal = round(loans.reduce((s, l) => s + l.installment, 0));

  const cash = round(
    snapshot.accounts
      .filter(
        (a) =>
          a.category === "CHECKING_ACCOUNT" || a.category === "SAVINGS_ACCOUNT",
      )
      .reduce((s, a) => s + (a.balanceAvailable ?? a.balanceCurrent ?? 0), 0),
  );

  // Próximos 3 meses: o que já está comprometido antes de qualquer gasto novo
  // Começa depois do último mês de fatura que já entrou no plano atual
  const start =
    bills
      .map((b) => b.month)
      .sort()
      .at(-1) ?? today.slice(0, 7);
  const upcomingCard = [1, 2, 3].map((i) => {
    const month = addMonths(start, i);
    return {
      month,
      amount: round(
        billsOverview.cards.reduce(
          (s, c) => s + (c.bills.find((b) => b.month === month)?.amount ?? 0),
          0,
        ),
      ),
    };
  });

  return { today, bills, billsTotal, loans, loansTotal, cash, upcomingCard };
}

export function applySettings(base: PlanBase, settings: PlanSettings): Plan {
  const { today, bills, billsTotal, loans, loansTotal, cash } = base;
  const income = round(settings.salary + settings.otherIncome);
  const fixedOff = settings.fixed.filter((f) => !f.onCard);
  const fixedTotal = round(fixedOff.reduce((s, f) => s + f.amount, 0));
  const fixedOnCardTotal = round(
    settings.fixed.filter((f) => f.onCard).reduce((s, f) => s + f.amount, 0),
  );

  const committed = round(fixedTotal + billsTotal + loansTotal);
  const savingsTarget = round((settings.salary * settings.savingsPct) / 100);
  const free = round(income - committed - savingsTarget);

  const nextSalaryDate = nextOccurrence(today, settings.salaryDay);
  const nextSalary = iso(nextSalaryDate);
  const daysToSalary = Math.round(
    (nextSalaryDate.getTime() - Date.parse(`${today}T12:00:00Z`)) / 86_400_000,
  );

  // Agenda dos próximos 35 dias, com saldo projetado a partir do dinheiro em conta
  const horizon = iso(
    new Date(Date.parse(`${today}T12:00:00Z`) + 35 * 86_400_000),
  );
  const raw: Omit<AgendaItem, "balanceAfter">[] = [];
  if (settings.salary > 0 && nextSalary <= horizon) {
    raw.push({
      date: nextSalary,
      name: "Salário",
      kind: "salario",
      amount: income,
      informative: false,
    });
  }
  for (const f of settings.fixed) {
    const d = iso(nextOccurrence(today, f.day));
    if (d <= horizon) {
      raw.push({
        date: d,
        name: f.name,
        kind: "fixa",
        amount: -f.amount,
        informative: f.onCard,
      });
    }
  }
  for (const b of bills) {
    const d = b.dueDate && b.dueDate >= today ? b.dueDate : today;
    if (d <= horizon) {
      raw.push({
        date: d,
        name: `Fatura ${b.institution}${b.status === "vencida" ? " (vencida)" : ""}`,
        kind: "fatura",
        amount: -b.amount,
        informative: false,
      });
    }
  }
  for (const l of loans) {
    const d = iso(nextOccurrence(today, l.day));
    if (d <= horizon) {
      raw.push({
        date: d,
        name: `Parcela ${l.name}`,
        kind: "emprestimo",
        amount: -l.installment,
        informative: false,
      });
    }
  }
  raw.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  let running = cash;
  let lowest: { date: string; value: number } | null = null;
  const agenda = raw.map((item) => {
    if (!item.informative) running = round(running + item.amount);
    if (!lowest || running < lowest.value)
      lowest = { date: item.date, value: running };
    return { ...item, balanceAfter: running };
  });

  const projection: MonthProjection[] = base.upcomingCard.map(
    ({ month, amount: cardCommitted }, idx) => {
      const loansM = round(
        loans
          .filter((l) => l.remaining == null || l.remaining > idx + 1)
          .reduce((s, l) => s + l.installment, 0),
      );
      return {
        month,
        income,
        fixed: fixedTotal,
        loans: loansM,
        cardCommitted,
        savings: savingsTarget,
        free: round(
          income - fixedTotal - loansM - cardCommitted - savingsTarget,
        ),
      };
    },
  );

  return {
    income,
    fixedTotal,
    fixedOnCardTotal,
    bills,
    billsTotal,
    loans,
    loansTotal,
    committed,
    savingsTarget,
    free,
    perDay: round(Math.max(0, free) / 30),
    committedPct: income > 0 ? committed / income : 0,
    nextSalary,
    daysToSalary,
    cash,
    agenda,
    lowestBalance: lowest,
    projection,
  };
}

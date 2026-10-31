// Sobra dos próximos meses (renda menos o já comprometido: contas fixas,
// recorrentes, dívidas e faturas) e o direcionamento dela para áreas. Usada
// pela tela Projeções.

import type { BillsOverview } from "@/lib/finance/bills";
import type { Plan, PlanBase } from "@/lib/finance/plan";
import type { AllocationArea } from "@/lib/finance/areas";

const round = (n: number) => Math.round(n * 100) / 100;

function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export type ProjectionMonth = {
  month: string;
  income: number;
  fixed: number;
  recurring: number;
  debts: number;
  loans: number;
  /** Já nas faturas que vencem no mês (parcelas e compras já feitas). */
  cardCommitted: number;
  savings: number;
  /** O que sobra depois de tudo que já está comprometido. */
  free: number;
};

/** Meses seguintes ao das faturas atuais (os mesmos números do Planejamento). */
export function projectMonths(
  base: PlanBase,
  plan: Plan,
  overview: BillsOverview,
  count = 6,
): ProjectionMonth[] {
  const first = base.upcomingCard[0]?.month ?? addMonths(base.today.slice(0, 7), 1);
  const recurring = round(plan.recurringTotal + plan.recurringOnCardTotal);

  return Array.from({ length: count }, (_, idx) => {
    const month = addMonths(first, idx);
    const cardCommitted = round(
      overview.cards
        .flatMap((c) => c.bills.filter((b) => b.month === month))
        .reduce((s, b) => s + b.amount, 0),
    );
    const debts = round(
      plan.debts
        .filter((d) => (d.single ? month === d.endMonth : month <= d.endMonth))
        .reduce((s, d) => s + d.amount, 0),
    );
    const loans = round(
      plan.loans
        .filter((l) => l.remaining == null || l.remaining > idx + 1)
        .reduce((s, l) => s + l.installment, 0),
    );
    return {
      month,
      income: plan.income,
      fixed: plan.fixedTotal,
      recurring,
      debts,
      loans,
      cardCommitted,
      savings: plan.savingsTarget,
      free: round(
        plan.income - plan.fixedTotal - recurring - debts - loans - cardCommitted - plan.savingsTarget,
      ),
    };
  });
}

export type Distribution = {
  /** Soma dos percentuais (pode passar de 100 enquanto o usuário edita). */
  totalPct: number;
  /** Sobra média por mês nos meses projetados (meses negativos contam como zero). */
  averageFree: number;
  /** Por área: quanto vai em média por mês e no total dos meses. */
  areas: (AllocationArea & { monthly: number; total: number })[];
  /** Por mês: a sobra e quanto vai para cada área (nada quando não sobra). */
  months: { month: string; free: number; byArea: Record<string, number>; unallocated: number }[];
};

/** Reparte a sobra de cada mês pelos percentuais fixos das áreas. */
export function distributeFree(
  months: Pick<ProjectionMonth, "month" | "free">[],
  areas: AllocationArea[],
): Distribution {
  const totalPct = round(areas.reduce((s, a) => s + a.pct, 0));
  const rows = months.map(({ month, free }) => {
    const base = Math.max(0, free);
    const byArea = Object.fromEntries(areas.map((a) => [a.id, round((base * a.pct) / 100)]));
    const allocated = Object.values(byArea).reduce((s, v) => s + v, 0);
    return { month, free, byArea, unallocated: round(base - allocated) };
  });
  const count = Math.max(1, months.length);
  return {
    totalPct,
    averageFree: round(rows.reduce((s, r) => s + Math.max(0, r.free), 0) / count),
    areas: areas.map((a) => {
      const total = round(rows.reduce((s, r) => s + r.byArea[a.id], 0));
      return { ...a, monthly: round(total / count), total };
    }),
    months: rows,
  };
}

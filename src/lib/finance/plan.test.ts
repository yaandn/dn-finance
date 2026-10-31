import { describe, expect, it } from "vitest";

import type { BillsOverview } from "@/lib/finance/bills";
import { applySettings, computePlanBase, type PlanBase } from "@/lib/finance/plan";
import type { FinanceSnapshot } from "@/lib/finance/types";

const base: PlanBase = {
  today: "2026-10-31",
  bills: [],
  billsTotal: 1000,
  loans: [],
  loansTotal: 0,
  cash: 5000,
  upcomingCard: [{ month: "2026-12", amount: 300 }],
  recurring: [
    // Fora do cartão: soma nos compromissos do mês
    { id: "starlink", name: "Starlink", cadence: "mensal", amount: 262.21, monthly: 262.21, nextDate: "2026-11-10", onCard: false },
    // No cartão: no mês atual já está na fatura
    { id: "psn", name: "PSN", cadence: "mensal", amount: 70.39, monthly: 70.39, nextDate: "2026-11-02", onCard: true },
  ],
};

describe("applySettings com recorrentes", () => {
  const p = applySettings(base, { salary: 5000, salaryDay: 5, otherIncome: 0, savingsPct: 0, fixed: [], debts: [], areas: [] });

  it("soma só os recorrentes fora do cartão no mês atual", () => {
    expect(p.recurringTotal).toBe(262.21);
    expect(p.recurringOnCardTotal).toBe(70.39);
    expect(p.committed).toBe(1262.21);
    expect(p.free).toBe(3737.79);
  });

  it("na agenda, o do cartão é só informativo", () => {
    const psn = p.agenda.find((a) => a.name === "PSN")!;
    const starlink = p.agenda.find((a) => a.name === "Starlink")!;
    expect(psn).toMatchObject({ kind: "recorrente", informative: true, balanceAfter: 5000 });
    // O salário (dia 5) entra antes da Starlink (dia 10)
    expect(starlink).toMatchObject({ informative: false, balanceAfter: 9737.79 });
  });

  it("nos próximos meses entram todos, porque as faturas futuras só têm parcelas", () => {
    expect(p.projection[0]).toMatchObject({ recurring: 332.6, cardCommitted: 300, free: 4367.4 });
  });
});

describe("computePlanBase: faturas atuais e próximos meses", () => {
  const bill = (month: string, status: string, amount: number) => ({
    key: month,
    month,
    status,
    amount,
    remaining: amount,
    dueDate: `${month}-10`,
    dueEstimated: true,
  });
  const card = (institution: string, bills: ReturnType<typeof bill>[]) => ({
    account: { institution, name: "Cartão" },
    bills,
  });
  const overview = {
    cards: [
      card("Nubank", [bill("2026-11", "aberta", 3270.14), bill("2026-12", "futura", 1103.56)]),
      // Mercado Pago fecha dia 29: dezembro já está aberta em 31/10
      card("Mercado Pago", [bill("2026-11", "fechada", 933.85), bill("2026-12", "aberta", 201.53)]),
    ],
  } as unknown as BillsOverview;
  const snapshot = { accounts: [], transactions: [] } as unknown as FinanceSnapshot;

  it("fatura do mês seguinte já aberta vai para a projeção, não para as atuais", () => {
    const base = computePlanBase(snapshot, overview, "2026-10-31");
    expect(base.bills.map((b) => `${b.institution} ${b.month}`)).toEqual([
      "Nubank 2026-11",
      "Mercado Pago 2026-11",
    ]);
    expect(base.billsTotal).toBe(4203.99);
    // Dezembro junta a futura do Nubank e a aberta do Mercado Pago
    expect(base.upcomingCard[0]).toEqual({ month: "2026-12", amount: 1305.09 });
  });
});

describe("dívidas temporárias", () => {
  const withDebt = applySettings(
    { ...base, recurring: [], upcomingCard: [
      { month: "2026-12", amount: 0 },
      { month: "2027-01", amount: 0 },
    ] },
    {
      salary: 5000,
      salaryDay: 5,
      otherIncome: 0,
      savingsPct: 0,
      fixed: [],
      areas: [],
      debts: [
        { id: "joao", name: "Empréstimo do João", amount: 400, day: 15, endMonth: "2026-12", single: false },
        // Já terminou: sai do planejamento sozinha
        { id: "velha", name: "Acordo antigo", amount: 999, day: 10, endMonth: "2026-10", single: false },
        // Pagamento único: um neste mês (entra agora), outro em janeiro (só na projeção)
        { id: "ipva", name: "Conserto", amount: 300, day: 20, endMonth: "2026-11", single: true },
        { id: "maria", name: "Devolver à Maria", amount: 1000, day: 10, endMonth: "2027-01", single: true },
      ],
    },
  );

  it("entra nos compromissos com as parcelas que faltam", () => {
    expect(withDebt.debts.map((d) => [d.id, d.remaining, d.current])).toEqual([
      ["joao", 2, true],
      ["ipva", 1, true],
      ["maria", 1, false],
    ]);
    expect(withDebt.debtsTotal).toBe(700);
    expect(withDebt.committed).toBe(1700);
  });

  it("aparece na agenda e some da projeção depois da última parcela", () => {
    expect(withDebt.agenda.filter((a) => a.kind === "divida").map((a) => a.date)).toEqual([
      "2026-11-15",
      "2026-11-20",
    ]);
    // Dezembro: parcela do João; janeiro: só o pagamento único da Maria
    expect(withDebt.projection.map((m) => m.debts)).toEqual([400, 1000]);
  });
});


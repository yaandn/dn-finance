import { describe, expect, it } from "vitest";

import type { BillsOverview } from "@/lib/finance/bills";
import type { Plan, PlanBase } from "@/lib/finance/plan";
import { distributeFree, projectMonths } from "@/lib/finance/projection";
import type { Transaction } from "@/lib/finance/types";

let seq = 0;
const tx = (date: string, amount: number, extra: Partial<Transaction> = {}) =>
  ({
    id: `t${seq++}`,
    accountId: "card",
    accountCategory: "CREDIT_CARD",
    institution: "Nubank",
    date,
    accountingDate: null,
    description: "Compra",
    counterpart: "Mercado",
    merchant: null,
    merchantLogo: null,
    amount,
    type: "OUTFLOW",
    category: "Mercado",
    rawCategory: null,
    subcategory: null,
    operationType: null,
    installment: null,
    cardNumber: null,
    bill: null,
    internal: false,
    internalReason: null,
    ...extra,
  }) satisfies Transaction;

describe("projectMonths", () => {
  const base = { today: "2026-10-31", upcomingCard: [{ month: "2026-12", amount: 0 }] } as unknown as PlanBase;
  const plan = {
    income: 6400,
    fixedTotal: 2370,
    recurringTotal: 0,
    recurringOnCardTotal: 375,
    savingsTarget: 0,
    loans: [],
    debts: [{ amount: 380, single: true, endMonth: "2026-12" }],
  } as unknown as Plan;
  const overview = {
    cards: [
      {
        bills: [
          { month: "2026-12", amount: 1300, items: [tx("2026-11-01", 200)] },
          { month: "2027-01", amount: 680, items: [] },
        ],
      },
    ],
  } as unknown as BillsOverview;

  it("sobra de cada mês: renda menos o comprometido e as faturas do mês", () => {
    const [dec, jan] = projectMonths(base, plan, overview, 2);
    expect(dec).toMatchObject({ month: "2026-12", debts: 380, cardCommitted: 1300, free: 1975 });
    expect(jan).toMatchObject({ month: "2027-01", debts: 0, cardCommitted: 680, free: 2975 });
  });
});

describe("distributeFree", () => {
  it("reparte a sobra de cada mês pelos percentuais; mês sem sobra não reparte nada", () => {
    const d = distributeFree(
      [
        { month: "2026-12", free: -625 },
        { month: "2027-01", free: 1000 },
      ],
      [
        { id: "reserva", name: "Reserva", pct: 50, icon: "shield" },
        { id: "lazer", name: "Lazer", pct: 30, icon: "party" },
      ],
    );
    expect(d.totalPct).toBe(80);
    expect(d.averageFree).toBe(500);
    expect(d.months).toEqual([
      { month: "2026-12", free: -625, byArea: { reserva: 0, lazer: 0 }, unallocated: 0 },
      { month: "2027-01", free: 1000, byArea: { reserva: 500, lazer: 300 }, unallocated: 200 },
    ]);
    expect(d.areas.map((a) => [a.id, a.monthly, a.total])).toEqual([
      ["reserva", 250, 500],
      ["lazer", 150, 300],
    ]);
  });
});

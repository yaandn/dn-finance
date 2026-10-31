import { describe, expect, it } from "vitest";

import { buildBills } from "@/lib/finance/bills";
import {
  LINKED_PAYMENT_REASON,
  OWN_TRANSFER_REASON,
  ROLLOVER_IN_REASON,
  ROLLOVER_OUT_REASON,
  linkCardPayments,
  linkOwnTransfers,
} from "@/lib/finance/classify";
import type { Account, FinanceSnapshot, Transaction } from "@/lib/finance/types";

const card = {
  id: "card",
  linkId: null,
  institution: "Nubank",
  name: "Cartão",
  category: "CREDIT_CARD",
  balanceType: "LIABILITY",
  currency: "BRL",
  balanceCurrent: null,
  balanceAvailable: null,
  credit: null,
  loan: null,
  collectedAt: null,
} satisfies Account;

let seq = 0;
const tx = (date: string, forecast: string, amount: number, extra: Partial<Transaction> = {}) =>
  ({
    id: `t${seq++}`,
    accountId: "card",
    accountCategory: "CREDIT_CARD",
    institution: "Nubank",
    date,
    accountingDate: null,
    description: "Compra",
    counterpart: "Loja",
    merchant: null,
    merchantLogo: null,
    amount,
    type: "OUTFLOW",
    category: "Compras",
    rawCategory: null,
    subcategory: null,
    operationType: null,
    installment: null,
    cardNumber: null,
    // Como na Pluggy para o Nubank: só o mês da fatura, sem vencimento nem valor
    bill: { dueDate: null, amount: null, name: null, forecast },
    internal: false,
    internalReason: null,
    ...extra,
  }) satisfies Transaction;

const payment = (date: string, forecast: string, amount: number) =>
  tx(date, forecast, amount, {
    type: "INFLOW",
    internal: true,
    internalReason: "Pagamento da fatura do próprio cartão",
  });

const bills = (transactions: Transaction[], today: string) =>
  buildBills(
    { accounts: [card], transactions } as unknown as FinanceSnapshot,
    today,
  ).cards[0];

describe("buildBills sem vencimento oficial", () => {
  it("a fatura aberta é a da compra mais recente; as anteriores fecharam", () => {
    const c = bills(
      [
        tx("2026-09-20", "2026-10", 300),
        tx("2026-10-07", "2026-10", 200), // última compra da fatura de outubro
        payment("2026-10-14", "2026-11", 500),
        tx("2026-10-09", "2026-11", 150), // primeira compra do ciclo novo
        tx("2026-10-20", "2026-11", 80),
        // Parcela seguinte: vem com a data da fatura, não conta como compra recente
        tx("2026-10-09", "2026-12", 50, { installment: { number: 3, total: 4 } }),
      ],
      "2026-10-31",
    );
    const byMonth = Object.fromEntries(c.bills.map((b) => [b.month, b]));
    expect(byMonth["2026-10"].status).toBe("paga");
    // Vencimento estimado: ciclo novo começa em 09/10, + 7 dias (como o Nubank: dia 16)
    expect(byMonth["2026-10"].dueDate).toBe("2026-10-16");
    expect(byMonth["2026-11"].status).toBe("aberta");
    expect(byMonth["2026-12"].status).toBe("futura");
    expect(c.open?.month).toBe("2026-11");
  });

  it("fatura fechada sem pagamento depois do vencimento fica vencida", () => {
    const c = bills(
      [tx("2026-10-07", "2026-10", 200), tx("2026-10-20", "2026-11", 150)],
      "2026-10-31",
    );
    expect(c.bills.find((b) => b.month === "2026-10")?.status).toBe("vencida");
  });

  it("saldo levado para a fatura seguinte e pago depois: paga com atraso", () => {
    const c = bills(
      [
        tx("2026-09-20", "2026-09", 1000), // fatura de setembro, quitada no prazo
        payment("2026-09-10", "2026-10", 1000),
        tx("2026-09-25", "2026-10", 3000),
        tx("2026-10-07", "2026-10", 700), // soma estimada: 3.700
        tx("2026-10-09", "2026-11", 100),
        // Vencimento em 16/10 sem pagamento: o banco leva 3.600 para novembro
        tx("2026-10-16", "2026-11", 3600, {
          type: "INFLOW",
          internal: true,
          internalReason: ROLLOVER_OUT_REASON,
        }),
        tx("2026-10-16", "2026-11", 3600, { internal: true, internalReason: ROLLOVER_IN_REASON }),
        payment("2026-10-19", "2026-11", 3600),
      ],
      "2026-10-31",
    );
    const byMonth = Object.fromEntries(c.bills.map((b) => [b.month, b]));
    expect(byMonth["2026-10"]).toMatchObject({ status: "paga", paidLate: true, remaining: 0 });
    expect(byMonth["2026-09"].status).toBe("paga");
    // O saldo transferido entra e sai de novembro: só a compra fica
    expect(byMonth["2026-11"].amount).toBe(100);
  });

  it("saldo levado para a fatura seguinte sem pagamento: vencida no valor do banco", () => {
    const c = bills(
      [
        tx("2026-10-07", "2026-10", 700),
        tx("2026-10-09", "2026-11", 100),
        tx("2026-10-16", "2026-11", 650, {
          type: "INFLOW",
          internal: true,
          internalReason: ROLLOVER_OUT_REASON,
        }),
      ],
      "2026-10-31",
    );
    expect(c.bills.find((b) => b.month === "2026-10")).toMatchObject({
      status: "vencida",
      remaining: 650,
    });
  });
});

describe("buildBills com faturas oficiais (Mercado Pago)", () => {
  // Fatura de outubro oficial: fechou 29/09, venceu 05/10 (04/10 foi domingo)
  const octBill = { dueDate: "2026-10-05", amount: 1326.49, name: null, forecast: "2026-10", closingDate: "2026-09-29" };
  const sepBill = { dueDate: "2026-09-04", amount: 216.1, name: null, forecast: "2026-09", closingDate: "2026-08-29" };

  const data = [
    tx("2026-09-03", "2026-10", 1326.49, { bill: octBill }),
    payment("2026-09-08", "2026-09", 216.1),
    payment("2026-10-07", "2026-10", 1326.49),
    tx("2026-10-08", "2026-11", 900), // novembro ainda não veio em /bills
    tx("2026-10-29", "2026-11", 33.85),
  ];
  data[1].bill = sepBill;
  data[2].bill = octBill;

  it("o pagamento vai para a fatura que o banco informou", () => {
    const c = bills(data, "2026-10-30");
    const oct = c.bills.find((b) => b.month === "2026-10")!;
    expect(oct).toMatchObject({ status: "paga", paid: 1326.49, paidLate: true });
    // O pagamento de setembro (fatura fora do período) não vai para outra
    expect(c.bills.find((b) => b.month === "2026-11")!.paid).toBe(0);
  });

  it("fecha na data oficial e vence no dia útil de referência", () => {
    // Sem compra depois do fechamento (29/10), novembro já está fechada
    const nov = bills(data, "2026-10-30").bills.find((b) => b.month === "2026-11")!;
    expect(nov).toMatchObject({ status: "fechada", dueDate: "2026-11-04", amount: 933.85 });
  });
});

describe("linkCardPayments", () => {
  it("pagamento de cartão conectado saindo da conta de outro banco não conta como gasto", () => {
    const c6Payment = payment("2026-09-08", "2026-10", 451.04);
    c6Payment.institution = "C6 Bank";
    const fromChecking = tx("2026-09-08", "2026-09", 451.04, {
      accountId: "nubank-conta",
      accountCategory: "CHECKING_ACCOUNT",
      institution: "Nubank",
      bill: null,
    });
    const other = tx("2026-09-08", "2026-09", 99.9, {
      accountCategory: "CHECKING_ACCOUNT",
      institution: "Nubank",
      bill: null,
    });
    const linked = linkCardPayments([c6Payment, fromChecking, other]);
    expect(linked[1]).toMatchObject({ internal: true, internalReason: LINKED_PAYMENT_REASON });
    expect(linked[2].internal).toBe(false);
  });
});

describe("pagamentos e transferências entre contas (Inter)", () => {
  const account = (extra: Partial<Transaction>) => ({
    accountId: "inter-conta",
    accountCategory: "CHECKING_ACCOUNT" as const,
    institution: "Inter",
    bill: null,
    ...extra,
  });

  it("'Pagamento Fatura' na conta do mesmo banco quita a fatura antes de o crédito chegar ao cartão", () => {
    const octBill = { dueDate: "2026-10-18", amount: 40.64, name: null, forecast: "2026-10", closingDate: "2026-10-11" };
    const purchase = tx("2026-10-09", "2026-10", 40.64, { institution: "Inter", bill: octBill });
    const fromAccount = tx("2026-10-31", "2026-10", 40.64, account({
      description: "Pagamento efetuado - Pagamento Fatura - YAN",
    }));
    const linked = linkCardPayments([purchase, fromAccount]);
    expect(linked[1]).toMatchObject({ internal: true, internalReason: LINKED_PAYMENT_REASON });
    const c = buildBills(
      { accounts: [{ ...card, institution: "Inter" }], transactions: linked } as unknown as FinanceSnapshot,
      "2026-10-31",
    ).cards[0];
    expect(c.bills.find((b) => b.month === "2026-10")).toMatchObject({ status: "paga", paidLate: true });
  });

  it("Pix de uma conta conectada para outra não conta como gasto nem renda", () => {
    const out = tx("2026-07-29", "2026-07", 490, account({
      id: "nu-pix",
      accountId: "nubank-conta",
      institution: "Nubank",
      rawCategory: "Transfers",
    }));
    const inn = tx("2026-07-29", "2026-07", 490, account({ id: "inter-pix", type: "INFLOW", rawCategory: "Transfers" }));
    const fromOutside = tx("2026-09-09", "2026-09", 3900, account({ type: "INFLOW", rawCategory: "Transfers" }));
    const linked = linkOwnTransfers([out, inn, fromOutside]);
    expect(linked.map((t) => t.internalReason)).toEqual([OWN_TRANSFER_REASON, OWN_TRANSFER_REASON, null]);
  });
});


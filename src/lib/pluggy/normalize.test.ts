import { describe, expect, it } from "vitest";

import {
  alignWithBills,
  bankNameFromAccounts,
  localDate,
  normalizePluggyAccount,
  normalizePluggyTransaction,
  projectFutureInstallments,
} from "@/lib/pluggy/normalize";

const checking = normalizePluggyAccount(
  { id: "acc", itemId: "item", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Conta", balance: 100 },
  "Nubank",
);
const card = normalizePluggyAccount(
  {
    id: "card",
    itemId: "item",
    type: "CREDIT",
    subtype: "CREDIT_CARD",
    name: "Cartão",
    number: "1234",
    balance: 800,
    creditData: { creditLimit: 5000, availableCreditLimit: 4200, brand: "MASTERCARD" },
  },
  "Nubank",
);
const accounts = new Map([checking, card].map((a) => [a.id, a]));
// Recorte da árvore real de GET /categories
const categories = new Map(
  [
    { id: "05000000", description: "Transfers" },
    { id: "05080000", description: "Transfer - TED", parentId: "05000000" },
    { id: "11000000", description: "Food and drinks" },
    { id: "11010000", description: "Eating out", parentId: "11000000" },
    { id: "17000000", description: "Housing" },
    { id: "17020000", description: "Utilities", parentId: "17000000" },
    { id: "17020003", description: "Gas", parentId: "17020000" },
  ].map((c) => [c.id, c]),
);

const tx = (t: Record<string, unknown>, periodEnd = "2026-10-31", bills = new Map()) =>
  normalizePluggyTransaction(
    { id: "t", date: "2026-10-10T00:00:00.000Z", description: "X", ...t },
    accounts,
    bills,
    categories,
    periodEnd,
  );

describe("normalizePluggyAccount", () => {
  it("calcula o limite usado do cartão", () => {
    expect(card.category).toBe("CREDIT_CARD");
    expect(card.balanceType).toBe("LIABILITY");
    expect(card.credit).toMatchObject({ limit: 5000, available: 4200, used: 800, cards: ["1234"] });
  });
});

describe("bankNameFromAccounts", () => {
  it("tira o banco da razão social da conta corrente (MeuPluggy)", () => {
    const accounts = [
      { type: "CREDIT", name: "platinum" },
      { type: "BANK", name: "Nu Pagamentos S.A. - Instituição de Pagamento" },
    ];
    expect(bankNameFromAccounts(accounts)).toBe("Nubank");
    expect(bankNameFromAccounts([{ type: "BANK", name: "Itaú Unibanco S.A." }])).toBe("Itaú");
    expect(bankNameFromAccounts([{ type: "BANK", name: "Banco Exemplo S.A. - Múltiplo" }])).toBe(
      "Banco Exemplo",
    );
    expect(bankNameFromAccounts([{ type: "CREDIT", name: "platinum" }])).toBeNull();
  });

  it("dá nomes legíveis às contas", () => {
    const named = (a: Record<string, unknown>) => normalizePluggyAccount(a, "Nubank").name;
    expect(named({ type: "CREDIT", name: "platinum", marketingName: null })).toBe("Cartão Platinum");
    expect(
      named({ type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Nu Pagamentos S.A. - Instituição de Pagamento" }),
    ).toBe("Conta corrente");
  });
});

describe("normalizePluggyTransaction", () => {
  it("usa o sinal do valor: na conta, negativo é saída", () => {
    expect(tx({ accountId: "acc", amount: -50, type: "DEBIT" })).toMatchObject({ type: "OUTFLOW", amount: 50 });
    expect(tx({ accountId: "acc", amount: 50, type: "CREDIT" })).toMatchObject({ type: "INFLOW" });
  });

  it("no cartão, positivo é gasto mesmo com type CREDIT", () => {
    expect(tx({ accountId: "card", amount: 159.2, type: "CREDIT" }).type).toBe("OUTFLOW");
    expect(tx({ accountId: "card", amount: -900, type: "CREDIT" }).type).toBe("INFLOW");
  });

  it("converte datas com hora para o fuso de Brasília", () => {
    expect(localDate("2026-10-10T00:00:00.000Z")).toBe("2026-10-10");
    expect(localDate("2026-10-11T02:30:00.000Z")).toBe("2026-10-10");
    expect(localDate("2026-10-10")).toBe("2026-10-10");
  });

  it("traduz categorias da Pluggy para as regras do app", () => {
    const meal = tx({ accountId: "card", amount: 80, category: "Eating out", categoryId: "11010000" });
    expect(meal.rawCategory).toBe("Food & Groceries");
    expect(meal.category).toBe("Restaurantes e bares");
    const ted = tx({ accountId: "acc", amount: 300, category: "Transfer - TED", categoryId: "05080000" });
    expect(ted.category).toBe("Transferências recebidas");
  });

  it("conta de gás vai para contas, não combustível", () => {
    const gas = tx({ accountId: "acc", amount: -90, category: "Gas", categoryId: "17020003" });
    expect(gas.rawCategory).toBe("Bills & Utilities");
    expect(gas.category).toBe("Contas e serviços");
  });

  it("marca o pagamento da fatura como interno", () => {
    const t = tx({ accountId: "acc", amount: -900, category: "Credit card payment" });
    expect(t.internal).toBe(true);
    expect(t.internalReason).toBe("Pagamento da fatura do próprio cartão");
  });

  it("saldo em atraso do Nubank não conta como gasto", () => {
    expect(tx({ accountId: "card", amount: 3252.22, description: "Saldo em atraso" }).internal).toBe(true);
    expect(tx({ accountId: "card", amount: -3252.22, description: "Crédito de atraso" }).internalReason).toBe(
      "Saldo não pago levado para a próxima fatura",
    );
  });

  it("lê parcelas e a fatura pelo billId", () => {
    const bills = new Map([["b1", { id: "b1", dueDate: "2026-11-10T00:00:00.000Z", totalAmount: 1200 }]]);
    const t = tx(
      {
        accountId: "card",
        amount: 100,
        creditCardMetadata: { installmentNumber: 2, totalInstallments: 5, billId: "b1" },
      },
      "2026-10-31",
      bills,
    );
    expect(t.installment).toEqual({ number: 2, total: 5 });
    expect(t.bill).toMatchObject({ dueDate: "2026-11-10", amount: 1200, forecast: "2026-11" });
    expect(t.internal).toBe(false);
  });

  it("parcela de fatura além da próxima não conta no período", () => {
    const t = tx({
      accountId: "card",
      amount: 100,
      creditCardMetadata: { installmentNumber: 4, totalInstallments: 5, billForecastDate: "2027-01" },
    });
    expect(t.internalReason).toBe("Parcela futura (entra em outra fatura)");
  });
});

describe("projectFutureInstallments", () => {
  const installment = (id: string, number: number, forecast: string) => ({
    id,
    accountId: "card",
    description: `Paypal *Loja ${number}/4`,
    amount: 22.47,
    date: "2026-10-09T03:00:00.000Z",
    creditCardMetadata: {
      cardNumber: "3621",
      purchaseDate: "2026-08-19T00:31:15.001Z",
      totalInstallments: 4,
      installmentNumber: number,
      billForecastDate: forecast,
      billId: "fatura-atual",
    },
  });

  it("cria as parcelas seguintes a partir da mais recente de cada compra", () => {
    const projected = projectFutureInstallments(
      [installment("a", 2, "2026-10"), installment("b", 3, "2026-11")],
      "2026-10",
    );
    expect(projected).toHaveLength(1);
    // A fatura oficial da parcela atual não vai junto para as próximas
    expect(projected[0].creditCardMetadata.billId).toBeUndefined();
    expect(projected[0]).toMatchObject({
      id: "b:parcela-4",
      description: "Paypal *Loja 4/4",
      creditCardMetadata: { installmentNumber: 4, billForecastDate: "2026-12" },
    });
    const t = normalizePluggyTransaction(projected[0], accounts, new Map(), categories, "2026-10-31");
    expect(t.bill?.forecast).toBe("2026-12");
    expect(t.internalReason).toBe("Parcela futura (entra em outra fatura)");
  });

  it("não projeta a partir de faturas de meses passados", () => {
    expect(projectFutureInstallments([installment("a", 2, "2026-08")], "2026-10")).toEqual([]);
  });
});

describe("C6 (só cartão, mês da fatura = mês do lançamento)", () => {
  it("descobre o banco pelo produto do cartão", () => {
    expect(bankNameFromAccounts([{ type: "CREDIT", name: "Bandeirado", marketingName: "C6 STANDARD" }])).toBe(
      "C6 Bank",
    );
    expect(
      normalizePluggyAccount({ type: "CREDIT", name: "Bandeirado", marketingName: "C6 STANDARD" }, "C6 Bank").name,
    ).toBe("Cartão C6 Standard");
  });

  const bills = [
    // Venceu em 05/07; o pagamento de 08/07 está na lista dela
    { id: "jul", accountId: "c6", dueDate: "2026-07-05T00:00:00.000Z", billClosingDate: "2026-06-27T00:00:00.000Z", payments: [{ paymentDate: "2026-07-08T00:00:00.000Z", amount: 2256.16 }] },
    // Fecha dia 30, vence 6 dias depois: compra de 07/10 vai para a de 05/11
    { id: "ago", accountId: "c6", dueDate: "2026-08-05T00:00:00.000Z", billClosingDate: "2026-07-30T00:00:00.000Z", payments: [] },
  ];
  const cc = (forecast: string, billId?: string) => ({ billForecastDate: forecast, billId });
  const aligned = alignWithBills(
    [
      { id: "compra", accountId: "c6", amount: 37.98, date: "2026-06-04T03:00:00.000Z", creditCardMetadata: cc("2026-06", "jul") },
      { id: "pendente", accountId: "c6", amount: 23.4, date: "2026-10-07T03:00:00.000Z", creditCardMetadata: cc("2026-10") },
      // O billId do pagamento é a fatura seguinte, onde ele é lançado
      { id: "pgto", accountId: "c6", amount: -2256.16, date: "2026-07-08T03:00:00.000Z", creditCardMetadata: cc("2026-07", "ago") },
    ],
    bills,
  );
  const byId = Object.fromEntries(aligned.map((t) => [t.id, t]));

  it("usa o mês do vencimento oficial e, nos pendentes, o fechamento do cartão", () => {
    expect(byId.compra.creditCardMetadata.billForecastDate).toBe("2026-07");
    expect(byId.pendente.creditCardMetadata.billForecastDate).toBe("2026-11");
  });

  it("liga o pagamento à fatura que ele quita, pela lista de pagamentos", () => {
    expect(byId.pgto.paidBillId).toBe("jul");
  });
});


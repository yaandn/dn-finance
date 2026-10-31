import { describe, expect, it } from "vitest";

import { detectRecurring, merchantKey } from "@/lib/finance/recurring";
import type { Transaction } from "@/lib/finance/types";

const TODAY = "2026-10-24";
let seq = 0;

function tx(partial: Partial<Transaction> & { date: string; amount: number }): Transaction {
  return {
    id: `t${seq++}`,
    accountId: "card",
    accountCategory: "CREDIT_CARD",
    institution: "Nubank",
    accountingDate: null,
    description: partial.counterpart ?? "",
    counterpart: "",
    merchant: null,
    merchantLogo: null,
    type: "OUTFLOW",
    category: "Compras",
    rawCategory: null,
    subcategory: null,
    operationType: null,
    installment: null,
    cardNumber: null,
    bill: null,
    internal: false,
    internalReason: null,
    ...partial,
  };
}

/** Uma cobrança por mês, no mesmo dia, de `from` até `to` (YYYY-MM). */
function monthly(
  from: string,
  to: string,
  day: number,
  amount: number | ((i: number) => number),
  base: Partial<Transaction>,
) {
  const out: Transaction[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  for (let i = 0; y < ty || (y === ty && m <= tm); i++) {
    const date = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    out.push(tx({ ...base, date, amount: typeof amount === "number" ? amount : amount(i) }));
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

describe("merchantKey", () => {
  it("junta variações do mesmo estabelecimento", () => {
    const a = merchantKey({ merchant: null, counterpart: "PG *NETFLIX.COM SAO PAULO BR", description: "" });
    const b = merchantKey({ merchant: "Netflix Entretenimento", counterpart: "", description: "" });
    expect(a).toBe("netflix");
    expect(b).toBe("netflix");
  });

  it("junta APPLE.COM/BILL, APPLECOMBILL e Apple", () => {
    for (const counterpart of ["APPLE.COM/BILL", "APPLECOMBILL", "Apple"]) {
      expect(merchantKey({ merchant: null, counterpart, description: "" })).toBe("apple");
    }
  });

  it("tira o intermediador antes do asterisco", () => {
    expect(merchantKey({ merchant: null, counterpart: "PAYPAL *SPOTIFY", description: "" })).toBe("spotify");
    expect(merchantKey({ merchant: null, counterpart: "Smart Fit 3/12", description: "" })).toBe("smart fit");
  });
});

describe("detectRecurring", () => {
  it("acha uma assinatura mensal e calcula o custo anual", () => {
    const list = monthly("2025-11", "2026-10", 12, 55.9, { counterpart: "Netflix", subcategory: "Movie & Video" });
    const [r] = detectRecurring(list, TODAY);
    expect(r.name).toBe("Netflix");
    expect(r.kind).toBe("assinatura");
    expect(r.cadence).toBe("mensal");
    expect(r.status).toBe("ativa");
    expect(r.confidence).toBe("alta");
    expect(r.yearly).toBeCloseTo(670.8, 1);
    expect(r.priceChange).toBeNull();
  });

  it("marca aumento de preço quando as duas últimas cobranças sobem", () => {
    const list = monthly("2025-11", "2026-10", 5, (i) => (i >= 10 ? 23.9 : 21.9), {
      counterpart: "Spotify",
    });
    const [r] = detectRecurring(list, TODAY);
    expect(r.priceChange).toEqual({ from: 21.9, to: 23.9, since: "2026-09-05", yearly: 24 });
    expect(r.amount).toBe(23.9);
  });

  it("não acusa aumento por uma cobrança mais alta no meio da série", () => {
    const list = monthly("2026-01", "2026-10", 8, (i) => (i === 5 ? 110 : 100), { counterpart: "ChatGPT" });
    expect(detectRecurring(list, TODAY)[0].priceChange).toBeNull();
  });

  it("aceita academia como serviço e Pix fixo como pix", () => {
    const gym = monthly("2026-03", "2026-10", 2, 129.9, { counterpart: "Smart Fit" });
    const rent = monthly("2026-03", "2026-10", 5, 1800, {
      counterpart: "Maria Souza",
      operationType: "PIX",
      category: "Transferências",
      accountCategory: "CHECKING_ACCOUNT",
    });
    const kinds = Object.fromEntries(detectRecurring([...gym, ...rent], TODAY).map((r) => [r.name, r.kind]));
    expect(kinds).toEqual({ "Smart Fit": "servico", "Maria Souza": "pix" });
  });

  it("ignora compras frequentes sem regularidade", () => {
    const dates = ["2026-09-01", "2026-09-03", "2026-09-04", "2026-09-10", "2026-09-22", "2026-10-02", "2026-10-03"];
    const list = dates.map((date, i) => tx({ date, amount: 20 + i * 7, counterpart: "Padaria Pão Quente" }));
    expect(detectRecurring(list, TODAY)).toEqual([]);
  });

  it("exige três cobranças de um nome desconhecido", () => {
    const list = monthly("2026-09", "2026-10", 10, 49, { counterpart: "Loja Qualquer" });
    expect(detectRecurring(list, TODAY)).toEqual([]);
  });

  it("aceita duas cobranças de uma assinatura conhecida e marca como nova", () => {
    const list = monthly("2026-09", "2026-10", 10, 20, { counterpart: "Disney Plus" });
    const [r] = detectRecurring(list, TODAY);
    expect(r.status).toBe("nova");
  });

  it("marca como cancelada quando as cobranças pararam", () => {
    const list = monthly("2025-12", "2026-06", 15, 34.9, { counterpart: "Deezer" });
    const [r] = detectRecurring(list, TODAY);
    expect(r.status).toBe("cancelada");
    expect(r.nextDate).toBeNull();
  });

  it("separa duas cobranças do mesmo nome com valores diferentes", () => {
    const icloud = monthly("2026-03", "2026-10", 3, 4.9, { counterpart: "APPLE.COM/BILL" });
    const music = monthly("2026-03", "2026-10", 3, 21.9, { counterpart: "APPLE.COM/BILL" });
    const found = detectRecurring([...icloud, ...music], TODAY);
    expect(found.map((r) => r.amount).sort((a, b) => a - b)).toEqual([4.9, 21.9]);
    expect(new Set(found.map((r) => r.name)).size).toBe(2);
  });

  it("soma o IOF na cobrança internacional e descarta estornos", () => {
    const list = monthly("2026-05", "2026-10", 20, 100, { counterpart: "OpenAI", accountId: "card" });
    list.push(tx({ date: "2026-10-20", amount: 3.5, description: "IOF compra internacional", counterpart: "IOF", accountId: "card" }));
    const [r] = detectRecurring(list, TODAY);
    expect(r.charges.at(-1)!.amount).toBe(103.5);

    const refunded = monthly("2026-05", "2026-10", 20, 30, { counterpart: "Globoplay" });
    refunded.push(tx({ date: "2026-10-22", amount: 30, counterpart: "Globoplay", type: "INFLOW" }));
    expect(detectRecurring(refunded, TODAY)[0].charges).toHaveLength(5);
  });

  it("deixa de fora parcelas, movimentações internas e empréstimo", () => {
    const list = [
      ...monthly("2026-03", "2026-10", 1, 300, { counterpart: "Notebook", installment: { number: 1, total: 10 } }),
      ...monthly("2026-03", "2026-10", 1, 900, { counterpart: "Fatura", internal: true }),
      ...monthly("2026-03", "2026-10", 1, 560, { counterpart: "Parcela", accountCategory: "LOAN_ACCOUNT" }),
    ];
    expect(detectRecurring(list, TODAY)).toEqual([]);
  });

  it("aceita conta de consumo com valor variável", () => {
    const list = monthly("2026-01", "2026-10", 18, (i) => [180, 210, 165, 240, 195, 205, 170, 230, 188, 199][i], {
      counterpart: "Enel",
      category: "Contas e serviços",
    });
    const [r] = detectRecurring(list, TODAY);
    expect(r.variable).toBe(true);
    expect(r.kind).toBe("servico");
  });

  it("tolera meses que a Belvo não trouxe", () => {
    const dates = ["2025-11-20", "2026-01-20", "2026-04-20", "2026-05-20", "2026-07-20", "2026-09-20"];
    const list = dates.map((date) => tx({ date, amount: 20.9, counterpart: "Netflix" }));
    const [r] = detectRecurring(list, TODAY);
    expect(r.cadence).toBe("mensal");
    expect(r.yearly).toBeCloseTo(250.8, 2);
    // A cobrança de 20/10 não veio: a próxima prevista é em novembro
    expect(r.nextDate).toBe("2026-11-20");
  });

  it("reconhece trimestral quando todos os intervalos são de 3 meses", () => {
    const dates = ["2026-01-05", "2026-04-05", "2026-07-05", "2026-10-05"];
    const list = dates.map((date) => tx({ date, amount: 89.9, counterpart: "Seguro Celular" }));
    const [r] = detectRecurring(list, TODAY);
    expect(r.cadence).toBe("trimestral");
    expect(r.yearly).toBeCloseTo(359.6, 2);
  });

  it("acusa aumento na última cobrança quando o valor era fixo", () => {
    const dates = ["2026-02-20", "2026-05-20", "2026-07-20", "2026-09-20"];
    const list = dates.map((date, i) => tx({ date, amount: i === 3 ? 249 : 236, counterpart: "Starlink Internet", category: "Contas e serviços" }));
    const [r] = detectRecurring(list, TODAY);
    expect(r.priceChange).toEqual({ from: 236, to: 249, since: "2026-09-20", yearly: 156 });
  });

  it("não acha semanal em compras frequentes de nome desconhecido", () => {
    const list = Array.from({ length: 10 }, (_, i) =>
      tx({ date: `2026-08-${String(1 + i * 7).padStart(2, "0")}`.replace(/-(\d{2})$/, (m, d) => (Number(d) > 31 ? "-31" : m)), amount: 3.79, counterpart: "Mercadinho" }),
    ).filter((t) => t.date <= "2026-08-31");
    expect(detectRecurring(list, TODAY)).toEqual([]);
  });

  it("ignora restaurante com preço parecido e visitas espaçadas", () => {
    const dates = ["2026-04-06", "2026-05-07", "2026-06-05", "2026-07-06"];
    const list = dates.map((date, i) => tx({ date, amount: [41, 52, 44, 60][i], counterpart: "Don Lazaro Restaurante" }));
    expect(detectRecurring(list, TODAY)).toEqual([]);
  });

  it("ignora parcelas, mesmo de assinatura (já entram nas faturas futuras)", () => {
    // Uma parcela por mês, como a Pluggy manda: pareceria mensal
    const list = ["2026-07-20", "2026-08-20", "2026-09-20", "2026-10-20"].map((date, i) =>
      tx({
        date,
        amount: 29.9,
        counterpart: `Globo Premiere ${i + 1}/12`,
        installment: { number: i + 1, total: 12 },
      }),
    );
    expect(detectRecurring(list, TODAY)).toEqual([]);
  });

  it("reconhece a PSN como assinatura com duas cobranças", () => {
    const list = ["2026-09-02", "2026-10-02"].map((date) =>
      tx({ date, amount: 70.39, counterpart: "EBN    *PLAYSTATION" }),
    );
    const [psn] = detectRecurring(list, TODAY);
    expect(psn).toMatchObject({ name: "PLAYSTATION", kind: "assinatura", cadence: "mensal" });
  });

  it("estabelecimento marcado entra desde a primeira cobrança", () => {
    const list = [tx({ date: "2026-10-02", amount: 70.39, counterpart: "EBN    *PLAYSTATION" })];
    expect(detectRecurring(list, TODAY)).toEqual([]);
    const [psn] = detectRecurring(list, TODAY, ["playstation"]);
    expect(psn).toMatchObject({
      name: "PLAYSTATION",
      cadence: "mensal",
      amount: 70.39,
      marked: true,
      status: "nova",
    });
  });
});

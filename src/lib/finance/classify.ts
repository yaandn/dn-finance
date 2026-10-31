// Regras comuns às fontes de dados (Belvo e Pluggy) para separar o que não é
// gasto nem renda real: pagamento da própria fatura, parcelas futuras etc.

import type { AccountCategory, Transaction, TransactionType } from "@/lib/finance/types";

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function cleanDescription(d: string) {
  // "Compra no débito|LOJA X" -> "LOJA X"; "Transferência enviada pelo Pix|Fulano" -> "Fulano"
  const parts = d.split("|").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" · ") : d;
}

/**
 * Fatura não paga até o vencimento (Nubank): o banco zera a fatura com um
 * "Crédito de atraso" e leva o mesmo valor para a seguinte como "Saldo em
 * atraso". Não é gasto nem crédito novo; o crédito informa quanto ficou devendo.
 */
export const ROLLOVER_OUT_REASON = "Saldo não pago levado para a próxima fatura";
export const ROLLOVER_IN_REASON = "Saldo da fatura anterior, não pago no vencimento";

export const CARD_PAYMENT_REASON = "Pagamento da fatura do próprio cartão";
export const LINKED_PAYMENT_REASON =
  "Pagamento de fatura de cartão conectado (as compras já contam no cartão)";
export const OWN_TRANSFER_REASON = "Transferência entre suas contas conectadas";

/** "Pagamento efetuado - Pagamento Fatura - …" (Inter), na conta do banco do cartão. */
export const SAME_BANK_BILL_PAYMENT = /pagamento\b.*\bfatura/i;

const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);

/**
 * Saída da conta que paga a fatura de um cartão conectado (Pix para o C6,
 * boleto do Inter pago na conta do Inter…): as compras já contam como gasto no
 * cartão, então o pagamento não conta de novo. Liga cada saída ao pagamento
 * recebido no cartão com o mesmo valor, até 3 dias de diferença.
 */
export function linkCardPayments(transactions: Transaction[]): Transaction[] {
  const received = transactions.filter(
    (t) => t.accountCategory === "CREDIT_CARD" && t.internalReason === CARD_PAYMENT_REASON,
  );
  // Bancos com cartão conectado: "Pagamento Fatura" na conta do mesmo banco é
  // desse cartão, mesmo antes de o crédito aparecer nos dados do cartão
  const cardBanks = new Set(
    transactions.filter((t) => t.accountCategory === "CREDIT_CARD").map((t) => t.institution),
  );
  const used = new Set<string>();
  return transactions.map((t) => {
    if (t.type !== "OUTFLOW" || t.internal || t.accountCategory === "CREDIT_CARD") return t;
    if (cardBanks.has(t.institution) && SAME_BANK_BILL_PAYMENT.test(t.description)) {
      return { ...t, internal: true, internalReason: LINKED_PAYMENT_REASON };
    }
    const match = received.find(
      (p) =>
        !used.has(p.id) &&
        Math.abs(p.amount - t.amount) < 0.01 &&
        Math.abs(dayDiff(p.date, t.date)) <= 3,
    );
    if (!match) return t;
    used.add(match.id);
    return { ...t, internal: true, internalReason: LINKED_PAYMENT_REASON };
  });
}

/**
 * Transferência entre duas contas conectadas (Pix do Nubank para o Inter): sem
 * isso, conta como gasto numa e renda na outra. Liga a saída de uma conta à
 * entrada de mesmo valor em outra, até 1 dia depois, ambas de transferência.
 * Entradas de contas não conectadas continuam contando.
 */
export function linkOwnTransfers(transactions: Transaction[]): Transaction[] {
  const isTransfer = (t: Transaction) =>
    !t.internal && t.accountCategory !== "CREDIT_CARD" && t.rawCategory === "Transfers";
  const inflows = transactions.filter((t) => t.type === "INFLOW" && isTransfer(t));
  if (!inflows.length) return transactions;
  const pairs = new Map<string, string>();
  const used = new Set<string>();
  for (const out of transactions) {
    if (out.type !== "OUTFLOW" || !isTransfer(out)) continue;
    const match = inflows.find(
      (i) =>
        !used.has(i.id) &&
        i.accountId !== out.accountId &&
        Math.abs(i.amount - out.amount) < 0.01 &&
        dayDiff(i.date, out.date) >= 0 &&
        dayDiff(i.date, out.date) <= 1,
    );
    if (!match) continue;
    used.add(match.id);
    pairs.set(out.id, match.id);
  }
  const linked = new Set([...pairs.keys(), ...pairs.values()]);
  return transactions.map((t) =>
    linked.has(t.id) ? { ...t, internal: true, internalReason: OWN_TRANSFER_REASON } : t,
  );
}

/** Motivo para o lançamento não contar como gasto/renda, ou null se conta. */
export function internalReason(t: {
  accountCategory: AccountCategory;
  type: TransactionType;
  description: string;
  operationType: string | null;
  installment: { number: number; total: number } | null;
  /** Data da compra (YYYY-MM-DD). */
  date: string;
  accountingDate: string | null;
  /** Mês da fatura (YYYY-MM). */
  forecast: string | null;
  periodEnd: string;
  /** A fonte já identificou o pagamento de fatura (ex.: categoria da Pluggy). */
  cardBillPayment?: boolean;
}): string | null {
  const lowerDesc = t.description.toLowerCase();

  if (t.accountCategory === "LOAN_ACCOUNT") {
    return "Espelho da parcela já debitada na conta";
  }
  if (
    t.cardBillPayment ||
    t.operationType === "PAGAMENTO_FATURA" ||
    lowerDesc === "pagamento de fatura" ||
    // Crédito no cartão com "pagamento" no nome: "Pagamento recebido" (Nubank),
    // "Pagamento Fatura QR CODE", "Inclusao de Pagamento Ciclo Corr" (C6)
    (t.accountCategory === "CREDIT_CARD" &&
      t.type === "INFLOW" &&
      /\bpagamento\b/.test(lowerDesc) &&
      !/estorno/.test(lowerDesc))
  ) {
    return CARD_PAYMENT_REASON;
  }
  if (t.accountCategory === "CREDIT_CARD" && /^cr[eé]dito de atraso$/.test(lowerDesc)) {
    return ROLLOVER_OUT_REASON;
  }
  if (t.accountCategory === "CREDIT_CARD" && lowerDesc === "saldo em atraso") {
    return ROLLOVER_IN_REASON;
  }
  if (t.type === "INFLOW" && lowerDesc.includes("valor adicionado na conta por cartão")) {
    return "Crédito usado para Pix (o gasto aparece no cartão)";
  }
  if (t.installment && t.accountingDate && t.accountingDate > t.periodEnd) {
    return "Parcela futura (entra em outra fatura)";
  }
  if (
    t.installment &&
    t.installment.number > 1 &&
    t.forecast &&
    t.date &&
    t.forecast > addMonths(t.date.slice(0, 7), 1)
  ) {
    // O banco manda cada parcela como um lançamento com a data da compra.
    // As que caem em faturas além da próxima não são gasto deste período.
    return "Parcela futura (entra em outra fatura)";
  }
  return null;
}

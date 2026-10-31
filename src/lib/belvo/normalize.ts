// Converte objetos crus da Belvo (formato da API /api/accounts e
// /api/transactions, ou o formato exportado pelo conector) para o modelo
// usado na interface. Aceita as duas variações de campos.

import type {
  Account,
  AccountCategory,
  Transaction,
} from "@/lib/finance/types";
import { categorize } from "@/lib/finance/categories";
import { cleanDescription, internalReason as classifyInternal } from "@/lib/finance/classify";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const INSTITUTION_NAMES: Record<string, string> = {
  ofnubank_br_retail: "Nubank",
  ofitau_br_retail: "Itaú",
  ofsantander_br_retail: "Santander",
  ofbradesco_br_retail: "Bradesco",
  ofbancodobrasil_br_retail: "Banco do Brasil",
  ofcaixa_br_retail: "Caixa",
  ofinter_br_retail: "Inter",
  ofmercadopago_br_retail: "Mercado Pago",
  ofc6_br_retail: "C6 Bank",
  ofpicpay_br_retail: "PicPay",
};

export function institutionLabel(name?: string | null, display?: string | null) {
  if (display) return display;
  if (!name) return "Banco";
  if (INSTITUTION_NAMES[name]) return INSTITUTION_NAMES[name];
  return name
    .replace(/^of/, "")
    .replace(/_br_(retail|business)$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

function toCategory(c?: string | null): AccountCategory {
  switch (c) {
    case "CHECKING_ACCOUNT":
    case "SAVINGS_ACCOUNT":
    case "CREDIT_CARD":
    case "LOAN_ACCOUNT":
    case "FINANCING_ACCOUNT":
    case "INVESTMENT_ACCOUNT":
      return c;
    default:
      return "OTHER";
  }
}

export function normalizeAccount(a: Raw): Account {
  const institution = institutionLabel(a.institution?.name, a.institution?.display_name);
  const credit = a.credit_data
    ? (() => {
        const limits: Raw[] = a.credit_data.limits ?? [];
        const total =
          limits.find((l) => l.type === "LIMITE_CREDITO_TOTAL" || l.type === "TOTAL_LIMIT") ??
          limits[0];
        return {
          limit: num(a.credit_data.credit_limit) ?? num(total?.credit_limit),
          used: num(total?.used_amount) ?? num(a.balance?.current),
          available: num(total?.available_amount) ?? num(a.balance?.available),
          minimumPayment: num(a.credit_data.minimum_payment),
          cuttingDate: a.credit_data.cutting_date ?? null,
          network: a.credit_data.network ?? null,
          cards: (a.credit_data.cards ?? [])
            .map((c: Raw) => c.identification_number)
            .filter(Boolean),
        };
      })()
    : null;

  const loan = a.loan_data
    ? (() => {
        const rates: Raw[] = a.loan_data.interest_rates ?? [];
        const effective =
          rates.find(
            (r) =>
              r.name === "EFETIVA" ||
              r.interest_rate_data?.tax_type === "EFFECTIVE_TAX" ||
              r.interest_rate_data?.tax_type === "EFFECTIVE",
          ) ?? null;
        return {
          type: a.loan_data.loan_type ?? null,
          contractAmount: num(a.loan_data.contract_amount),
          outstanding: num(a.loan_data.outstanding_balance) ?? num(a.balance?.current),
          installmentsTotal: num(a.loan_data.number_of_installments_total),
          installmentsPaid: num(a.loan_data.number_of_installments_paid),
          installmentsOutstanding: num(a.loan_data.number_of_installments_outstanding),
          installmentsPastDue: num(a.loan_data.number_of_installments_past_due),
          effectiveYearlyRate:
            num(a.loan_data.total_effective_cost) ??
            num(effective?.interest_rate_data?.pre_fixed_rate) ??
            num(effective?.value),
          startDate: a.loan_data.contract_start_date ?? null,
          endDate: a.loan_data.contract_end_date ?? null,
        };
      })()
    : null;

  return {
    id: a.account_id ?? a.id,
    linkId: a.link ?? a.connection_id ?? null,
    institution,
    name: a.name ?? "Conta",
    category: toCategory(a.category),
    balanceType: a.balance_type ?? null,
    currency: a.currency ?? "BRL",
    balanceCurrent: num(a.balance?.current),
    balanceAvailable: num(a.balance?.available),
    credit,
    loan,
    collectedAt: a.collected_at ?? null,
  };
}

export function normalizeTransaction(
  t: Raw,
  accountsById: Map<string, Account>,
  periodEnd: string,
): Transaction {
  const accountId: string = t.account_id ?? t.account?.id ?? "";
  const account = accountsById.get(accountId);
  const accountCategory = account?.category ?? toCategory(t.account?.category);
  const description: string = t.description ?? "";
  const type = t.type === "INFLOW" ? "INFLOW" : "OUTFLOW";
  const operationType: string | null = t.operation_type ?? null;
  const rawCategory: string | null = t.category ?? null;
  const subcategory: string | null = t.subcategory ?? null;
  const date: string = t.value_date ?? t.date ?? (t.transacted_at ?? "").slice(0, 10);
  const accountingDate: string | null =
    t.accounting_date ?? t.inferred_accounting_date ?? null;
  const cc = t.credit_card_data ?? null;
  const installmentTotal = num(cc?.number_of_installments);
  const installmentNumber = num(cc?.installment_identifier);
  const forecast: string | null =
    typeof cc?.bill_forecast_date === "string" ? cc.bill_forecast_date.slice(0, 7) : null;
  // Para compras em moeda estrangeira o valor em reais fica em local_currency_amount.
  const amount =
    t.currency && t.currency !== "BRL" && num(t.local_currency_amount)
      ? (num(t.local_currency_amount) as number)
      : (num(t.amount) ?? 0);

  const installment =
    installmentTotal && installmentTotal > 1
      ? { number: installmentNumber ?? 1, total: installmentTotal }
      : null;
  const internalReason = classifyInternal({
    accountCategory,
    type,
    description,
    operationType,
    installment,
    date,
    accountingDate,
    forecast,
    periodEnd,
  });

  const merchant: string | null = t.merchant?.merchant_name ?? null;

  return {
    id: t.transaction_id ?? t.id,
    accountId,
    accountCategory,
    institution:
      account?.institution ?? institutionLabel(t.account?.institution?.name, null),
    date,
    accountingDate,
    description,
    counterpart: merchant ?? cleanDescription(description),
    merchant,
    merchantLogo: t.merchant?.logo ?? null,
    amount: Math.abs(amount),
    type,
    category: categorize({ rawCategory, subcategory, description, operationType, type }),
    rawCategory,
    subcategory,
    operationType,
    installment,
    cardNumber: cc?.card_number ?? null,
    bill: cc
      ? {
          dueDate: cc.bill_due_date ?? null,
          amount: num(cc.bill_amount),
          name: cc.bill_name ?? null,
          forecast: forecast,
        }
      : null,
    internal: internalReason !== null,
    internalReason,
  };
}

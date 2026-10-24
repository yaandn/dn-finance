import type { Recurring } from "@/lib/finance/recurring";

// Modelo normalizado usado pela interface. Qualquer fonte de dados
// (API Belvo, arquivo exportado ou modo demonstração) é convertida para cá.

export type AccountCategory =
  | "CHECKING_ACCOUNT"
  | "SAVINGS_ACCOUNT"
  | "CREDIT_CARD"
  | "LOAN_ACCOUNT"
  | "FINANCING_ACCOUNT"
  | "INVESTMENT_ACCOUNT"
  | "OTHER";

export type CreditInfo = {
  limit: number | null;
  used: number | null;
  available: number | null;
  minimumPayment: number | null;
  cuttingDate: string | null;
  network: string | null;
  cards: string[];
};

export type LoanInfo = {
  type: string | null;
  contractAmount: number | null;
  outstanding: number | null;
  installmentsTotal: number | null;
  installmentsPaid: number | null;
  installmentsOutstanding: number | null;
  installmentsPastDue: number | null;
  /** Custo efetivo total ao ano, em fração (0.82 = 82% a.a.). */
  effectiveYearlyRate: number | null;
  startDate: string | null;
  endDate: string | null;
};

export type Account = {
  id: string;
  linkId: string | null;
  institution: string;
  name: string;
  category: AccountCategory;
  balanceType: "ASSET" | "LIABILITY" | null;
  currency: string;
  balanceCurrent: number | null;
  balanceAvailable: number | null;
  credit: CreditInfo | null;
  loan: LoanInfo | null;
  collectedAt: string | null;
};

export type TransactionType = "INFLOW" | "OUTFLOW";

export type Transaction = {
  id: string;
  accountId: string;
  accountCategory: AccountCategory;
  institution: string;
  /** Data em que a transação aconteceu (YYYY-MM-DD). */
  date: string;
  /** Data contábil (para cartão: quando entra na fatura). */
  accountingDate: string | null;
  description: string;
  counterpart: string;
  merchant: string | null;
  merchantLogo: string | null;
  amount: number;
  type: TransactionType;
  category: string;
  rawCategory: string | null;
  subcategory: string | null;
  operationType: string | null;
  installment: { number: number; total: number } | null;
  cardNumber: string | null;
  bill: {
    dueDate: string | null;
    amount: number | null;
    name: string | null;
    /** Mês da fatura em que o lançamento cai (YYYY-MM), informado pelo banco. */
    forecast: string | null;
  } | null;
  /** Movimentações que não são gasto nem renda reais (pagamento da própria fatura etc.). */
  internal: boolean;
  internalReason: string | null;
};

export type DataSource = "mcp" | "belvo" | "file" | "demo";

export type FinanceSnapshot = {
  source: DataSource;
  environment: "sandbox" | "production" | null;
  institutions: string[];
  accounts: Account[];
  transactions: Transaction[];
  fetchedAt: string;
  warnings: string[];
  /** Há uma sessão do Belvo Panorama (MCP) salva neste computador. */
  mcpConnected: boolean;
  /** Quando cada banco foi sincronizado pela última vez (só na fonte MCP). */
  connections?: {
    connectionId: string;
    institution: string;
    status: string;
    lastSyncedAt: string | null;
  }[];
};

export type Period = { from: string; to: string; days: number };

/** Resposta de /api/snapshot: os dados e o período que o servidor usou. */
export type SnapshotResponse = FinanceSnapshot & { period: Period };

/** Resposta de /api/recorrentes: gastos recorrentes detectados em cerca de um ano. */
export type RecurringResponse = {
  from: string;
  to: string;
  source: DataSource;
  fetchedAt: string;
  items: Recurring[];
};

/** Resposta de /api/installments: parcelas de compras feitas entre `since` e `before`. */
export type CardInstallmentsResponse = {
  since: string;
  before: string;
  transactions: Transaction[];
};

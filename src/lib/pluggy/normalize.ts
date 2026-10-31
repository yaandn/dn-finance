// Converte contas e lançamentos da Pluggy para o modelo usado na interface.
// As categorias da Pluggy são traduzidas para os nomes que a Belvo usava, para
// que as regras do app (categorize, plano, faturas) continuem valendo.

import { categorize } from "@/lib/finance/categories";
import { cleanDescription, internalReason } from "@/lib/finance/classify";
import type { Account, AccountCategory, Transaction } from "@/lib/finance/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

/**
 * Categoria da Pluggy → categoria equivalente da Belvo. Vale a mais específica
 * da cadeia: Housing › Utilities › Water fica em "Bills & Utilities".
 */
const PARENT_CATEGORY: Record<string, string> = {
  Income: "Income & Payments",
  "Loans and financing": "Credits & Loans",
  Investments: "Investments & Savings",
  "Same person transfer": "Transfers",
  Transfers: "Transfers",
  "Third party transfers": "Transfers",
  "Legal obligations": "Unknown",
  Services: "Bills & Utilities",
  Tickets: "Online Platforms & Leisure",
  Leisure: "Online Platforms & Leisure",
  "Digital services": "Online Platforms & Leisure",
  Gambling: "Online Platforms & Leisure",
  Shopping: "Personal Shopping",
  Groceries: "Food & Groceries",
  "Food and drinks": "Food & Groceries",
  Travel: "Transport & Travel",
  Transportation: "Transport & Travel",
  Automotive: "Transport & Travel",
  Taxes: "Taxes",
  "Bank fees": "Fees & Charges",
  Housing: "Home & Life",
  Utilities: "Bills & Utilities",
  Healthcare: "Home & Life",
  Insurance: "Insurance",
  Donations: "Unknown",
  Other: "Unknown",
};

/** Subcategorias da Pluggy que as regras do app reconhecem pelo nome da Belvo. */
const SUBCATEGORY: Record<string, string> = {
  Groceries: "Groceries",
  "Eating out": "Restaurants",
  "Gas stations": "Gas",
  // Conta de gás (Housing › Utilities): "Gas" na Belvo é combustível
  Gas: "Utility Gas",
  "Video streaming": "Movie & Video",
  "Music streaming": "Music & Audio",
  Lottery: "Lottery",
  "Online bet": "Gambling",
  Gambling: "Gambling",
};

const CARD_BILL_PAYMENT = "Credit card payment";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const SAO_PAULO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * Data local (YYYY-MM-DD). Datas sem hora chegam como meia-noite UTC e ficam
 * como estão; com hora, convertem para o fuso de Brasília (uma compra às 23h
 * vem no dia seguinte em UTC).
 */
export function localDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /T00:00:00(\.0+)?Z$/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : SAO_PAULO.format(d);
}

/** Razão social (início) → nome curto do banco. */
const BANK_NAMES: [RegExp, string][] = [
  [/^nu (pagamentos|financeira)|^nubank/i, "Nubank"],
  [/^ita[uú]/i, "Itaú"],
  [/^banco inter|^inter /i, "Inter"],
  [/^banco bradesco|^bradesco/i, "Bradesco"],
  [/^banco santander|^santander/i, "Santander"],
  [/^banco do brasil/i, "Banco do Brasil"],
  [/^caixa econ[oô]mica/i, "Caixa"],
  [/^mercado ?pago/i, "Mercado Pago"],
  [/^banco c6|^c6\b/i, "C6 Bank"],
  [/^picpay/i, "PicPay"],
  [/^banco btg|^btg/i, "BTG Pactual"],
  [/^xp /i, "XP"],
];

/**
 * Banco de um item do MeuPluggy. O conector se chama "MeuPluggy" para todos;
 * o nome do banco vem no nome da conta corrente (a razão social, ex.:
 * "Nu Pagamentos S.A. - Instituição de Pagamento"). Sem conta corrente (C6
 * só com cartão), o produto do cartão às vezes diz o banco ("C6 STANDARD");
 * outras vezes só o produto ("platinum").
 */
export function bankNameFromAccounts(accounts: Raw[]): string | null {
  const legal: string | undefined = accounts.find((a) => a.type === "BANK")?.name;
  const names = [legal, ...accounts.flatMap((a) => [a.marketingName, a.name])].filter(
    (n): n is string => typeof n === "string" && !!n.trim(),
  );
  for (const name of names) {
    const known = BANK_NAMES.find(([re]) => re.test(name));
    if (known) return known[1];
  }
  if (!legal) return null;
  // Desconhecido: a razão social sem o sufixo (" - Instituição…", " S.A.")
  return legal.split(" - ")[0].replace(/\s+S\.?\/?A\.?$/i, "").trim() || null;
}

/** "C6 STANDARD" → "C6 Standard" (siglas e códigos ficam como estão). */
function titleCase(s: string) {
  if (s !== s.toUpperCase()) return s.charAt(0).toUpperCase() + s.slice(1);
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 2 || /\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

const ACCOUNT_LABEL: Record<string, string> = {
  CHECKING_ACCOUNT: "Conta corrente",
  SAVINGS_ACCOUNT: "Poupança",
};

/** Nome da conta para a tela: a razão social do banco não serve de nome. */
function accountName(a: Raw): string {
  if (a.type === "CREDIT") {
    const product = String(a.marketingName ?? a.name ?? "").trim();
    return product ? `Cartão ${titleCase(product)}` : "Cartão";
  }
  return ACCOUNT_LABEL[a.subtype] ?? a.marketingName ?? a.name ?? "Conta";
}

export function normalizePluggyAccount(a: Raw, institution: string): Account {
  const isCard = a.type === "CREDIT";
  const category: AccountCategory = isCard
    ? "CREDIT_CARD"
    : a.subtype === "SAVINGS_ACCOUNT"
      ? "SAVINGS_ACCOUNT"
      : "CHECKING_ACCOUNT";
  const cd = a.creditData ?? null;
  const limit = num(cd?.creditLimit);
  const available = num(cd?.availableCreditLimit);

  return {
    id: a.id,
    linkId: a.itemId ?? null,
    institution,
    name: accountName(a),
    category,
    balanceType: isCard ? "LIABILITY" : "ASSET",
    currency: a.currencyCode ?? "BRL",
    balanceCurrent: num(a.balance),
    balanceAvailable: isCard ? available : num(a.balance),
    credit: isCard
      ? {
          limit,
          used:
            limit !== null && available !== null ? limit - available : num(a.balance),
          available,
          minimumPayment: num(cd?.minimumPayment),
          cuttingDate: localDate(cd?.balanceCloseDate),
          network: cd?.brand ?? null,
          cards: [a.number, ...(cd?.additionalCards ?? []).map((c: Raw) => c.number)].filter(
            Boolean,
          ),
        }
      : null,
    loan: null,
    collectedAt: a.updatedAt ?? null,
  };
}

/** Categoria e subcategoria no vocabulário da Belvo. */
function belvoCategory(t: Raw, categories: Map<string, Raw>) {
  const leaf: string | null = t.category ?? null;
  if (!leaf) return { rawCategory: null, subcategory: null };
  // Da categoria do lançamento até a de primeiro nível (a árvore tem até 3)
  const chain: string[] = [];
  for (
    let c = categories.get(t.categoryId);
    c && chain.length < 5;
    c = c.parentId ? categories.get(c.parentId) : undefined
  ) {
    chain.push(c.description);
  }
  if (!chain.length) chain.push(leaf);
  return {
    rawCategory: chain.map((n) => PARENT_CATEGORY[n]).find(Boolean) ?? chain[chain.length - 1],
    subcategory: SUBCATEGORY[leaf] ?? (chain.length > 1 ? leaf : null),
  };
}

/**
 * Acerta, com as faturas oficiais (/bills), o mês da fatura e o pagamento de
 * cada lançamento de cartão. Cada banco usa o billForecastDate de um jeito:
 * no Mercado Pago é o mês do vencimento; no C6, o mês do lançamento (a compra
 * de 04/06 vem "2026-06", mas vence em 05/07). Então:
 * - com billId, o mês passa a ser o do vencimento da fatura oficial;
 * - sem billId (pendentes), pelo fechamento das faturas oficiais do cartão;
 * - o pagamento é ligado à fatura cuja lista de pagamentos o contém (no C6 o
 *   billId do pagamento é a fatura seguinte, onde ele é lançado).
 * Sem faturas oficiais (Nubank), nada muda.
 */
export function alignWithBills(transactions: Raw[], bills: Raw[]): Raw[] {
  if (!bills.length) return transactions;
  const billsById = new Map(bills.map((b) => [b.id, b]));
  const dueMonth = (b: Raw) => localDate(b.dueDate)?.slice(0, 7) ?? null;

  // Sem billId (pendentes): a fatura pelo fechamento oficial mais recente do
  // cartão. Compra até o fechamento vai para a fatura que vence em seguida;
  // depois dele, para a próxima (C6: fecha dia 29, vence dia 5).
  const cycle = new Map<string, { closingDay: number; gap: number }>();
  for (const b of [...bills].sort((x, y) => String(x.dueDate).localeCompare(String(y.dueDate)))) {
    const closing = localDate(b.billClosingDate);
    const due = localDate(b.dueDate);
    if (!closing || !due) continue;
    const gap = Math.round((Date.parse(due) - Date.parse(closing)) / 86_400_000);
    cycle.set(b.accountId, { closingDay: Number(closing.slice(8, 10)), gap });
  }
  const billMonthFor = (accountId: string, date: string | null) => {
    const c = cycle.get(accountId);
    if (!c || !date) return null;
    const [y, m] = date.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const closing = `${date.slice(0, 7)}-${String(Math.min(c.closingDay, last)).padStart(2, "0")}`;
    const closingDate = date <= closing ? closing : (() => {
      const next = nextMonth(date.slice(0, 7), 1);
      const [ny, nm] = next.split("-").map(Number);
      const nlast = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
      return `${next}-${String(Math.min(c.closingDay, nlast)).padStart(2, "0")}`;
    })();
    return new Date(Date.parse(`${closingDate}T12:00:00Z`) + c.gap * 86_400_000)
      .toISOString()
      .slice(0, 7);
  };

  // Pagamentos de cada fatura, por cartão, data e valor
  const paidBill = new Map<string, string>();
  for (const b of bills) {
    for (const p of b.payments ?? []) {
      paidBill.set(`${b.accountId}|${localDate(p.paymentDate)}|${Math.abs(num(p.amount) ?? 0).toFixed(2)}`, b.id);
    }
  }

  return transactions.map((t) => {
    const cc = t.creditCardMetadata;
    if (!cc) return t;
    const bill = cc.billId ? billsById.get(cc.billId) : undefined;
    let forecast: string | null =
      typeof cc.billForecastDate === "string" ? cc.billForecastDate.slice(0, 7) : null;
    if (bill && dueMonth(bill)) forecast = dueMonth(bill);
    // A data em que entrou na fatura (os encargos de 30/10 do Mercado Pago
    // foram lançados em 29/10, na fatura que fecha nesse dia)
    else forecast = billMonthFor(t.accountId, localDate(cc.billPostDate) ?? localDate(t.date)) ?? forecast;
    const amount = num(t.amount) ?? 0;
    const paid =
      amount < 0
        ? (paidBill.get(`${t.accountId}|${localDate(t.date)}|${Math.abs(amount).toFixed(2)}`) ?? null)
        : undefined;
    return {
      ...t,
      creditCardMetadata: { ...cc, billForecastDate: forecast ?? cc.billForecastDate },
      // Crédito no cartão: só a fatura que o pagamento quita (null = desconhecida)
      ...(paid !== undefined ? { paidBillId: paid } : {}),
    };
  });
}

function nextMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/**
 * Parcelas que ainda vão entrar nas próximas faturas. A Pluggy só manda cada
 * parcela quando ela é lançada (a 3/4 em novembro; a 4/4 só em dezembro), então
 * as faturas futuras ficariam vazias. A partir da parcela mais recente de cada
 * compra, cria as seguintes com o mesmo valor; quando a de verdade chega, ela
 * passa a ser a mais recente e a projeção dela some.
 * Só projeta a partir da fatura do mês atual em diante: num período passado,
 * as parcelas seguintes já existem de verdade (só não foram carregadas).
 */
export function projectFutureInstallments(transactions: Raw[], currentMonth: string): Raw[] {
  const latest = new Map<string, Raw>();
  for (const t of transactions) {
    const cc = t.creditCardMetadata;
    const total = num(cc?.totalInstallments);
    const number = num(cc?.installmentNumber);
    if (!total || !number || total <= 1 || typeof cc.billForecastDate !== "string") continue;
    // Mesma compra: cartão, data da compra, nº de parcelas, valor da parcela
    // (em reais: a última pode variar alguns centavos) e descrição sem o "3/4".
    // Duas compras iguais no mesmo dia só se distinguem pelo valor.
    const key = [
      t.accountId,
      cc.cardNumber,
      String(cc.purchaseDate ?? "").slice(0, 10),
      total,
      Math.round(Math.abs(num(t.amount) ?? 0)),
      String(t.description ?? "").replace(/\s*\d+\s*\/\s*\d+\s*$/, ""),
    ].join("|");
    const prev = latest.get(key);
    if (!prev || number > num(prev.creditCardMetadata.installmentNumber)!) latest.set(key, t);
  }

  const projected: Raw[] = [];
  for (const t of latest.values()) {
    const cc = t.creditCardMetadata;
    if (cc.billForecastDate.slice(0, 7) < currentMonth) continue;
    const total = num(cc.totalInstallments)!;
    for (let n = num(cc.installmentNumber)! + 1; n <= total; n++) {
      const ahead = n - num(cc.installmentNumber)!;
      projected.push({
        ...t,
        id: `${t.id}:parcela-${n}`,
        description: String(t.description ?? "").replace(
          /\d+\s*\/\s*\d+\s*$/,
          `${n}/${total}`,
        ),
        status: "PROJECTED",
        // Mantém a data da parcela atual para ficar no período carregado
        // Sem billId: a fatura oficial da parcela atual não é a das próximas
        creditCardMetadata: {
          ...cc,
          installmentNumber: n,
          billForecastDate: nextMonth(cc.billForecastDate.slice(0, 7), ahead),
          billPostDate: null,
          billId: undefined,
        },
      });
    }
  }
  return projected;
}

export function normalizePluggyTransaction(
  t: Raw,
  accountsById: Map<string, Account>,
  billsById: Map<string, Raw>,
  categories: Map<string, Raw>,
  periodEnd: string,
): Transaction {
  const accountId: string = t.accountId ?? "";
  const account = accountsById.get(accountId);
  const accountCategory = account?.category ?? "OTHER";
  const description: string = t.description ?? t.descriptionRaw ?? "";
  const operationType: string | null = t.operationType ?? null;
  // Compra em moeda estrangeira: o valor em reais vem em amountInAccountCurrency
  const amount =
    t.currencyCode && t.currencyCode !== "BRL" && num(t.amountInAccountCurrency) !== null
      ? (num(t.amountInAccountCurrency) as number)
      : (num(t.amount) ?? 0);
  // O sinal é a referência: no cartão o gasto é positivo e o pagamento negativo;
  // na conta, saída é negativa. O campo type não é confiável no cartão.
  const type =
    amount === 0
      ? t.type === "CREDIT"
        ? "INFLOW"
        : "OUTFLOW"
      : (accountCategory === "CREDIT_CARD") === amount > 0
        ? "OUTFLOW"
        : "INFLOW";

  const date = localDate(t.date) ?? "";
  const cc = t.creditCardMetadata ?? null;
  const total = num(cc?.totalInstallments);
  const installment =
    total && total > 1 ? { number: num(cc?.installmentNumber) ?? 1, total } : null;
  // Crédito no cartão (pagamento, estorno): o billId pode ser a fatura onde ele
  // é lançado, não a que quita; vale a fatura achada em alignWithBills
  const bill =
    t.paidBillId !== undefined
      ? t.paidBillId
        ? billsById.get(t.paidBillId)
        : undefined
      : cc?.billId
        ? billsById.get(cc.billId)
        : undefined;
  const dueDate = localDate(bill?.dueDate);
  const forecast: string | null =
    typeof cc?.billForecastDate === "string"
      ? cc.billForecastDate.slice(0, 7)
      : (dueDate?.slice(0, 7) ?? null);
  const accountingDate = localDate(cc?.billPostDate);
  const { rawCategory, subcategory } = belvoCategory(t, categories);

  const reason =
    t.status === "PROJECTED"
      ? "Parcela futura (entra em outra fatura)"
      : internalReason({
          accountCategory,
          type,
          description,
          operationType,
          installment,
          date,
          accountingDate,
          forecast,
          periodEnd,
          cardBillPayment: t.category === CARD_BILL_PAYMENT,
        });

  const merchant: string | null = t.merchant?.name ?? t.merchant?.businessName ?? null;
  // Pix e TED: o nome de quem recebeu (saída) ou de quem pagou (entrada)
  const party: string | null =
    (type === "OUTFLOW" ? t.paymentData?.receiver?.name : t.paymentData?.payer?.name) ?? null;

  return {
    id: t.id,
    accountId,
    accountCategory,
    institution: account?.institution ?? "Banco",
    date,
    accountingDate,
    description,
    counterpart: merchant ?? party ?? cleanDescription(description),
    merchant,
    merchantLogo: null,
    amount: Math.abs(amount),
    type,
    category: categorize({ rawCategory, subcategory, description, operationType, type }),
    rawCategory,
    subcategory,
    operationType,
    installment,
    cardNumber: cc?.cardNumber ?? null,
    bill:
      accountCategory === "CREDIT_CARD"
        ? {
            dueDate,
            amount: num(bill?.totalAmount),
            name: null,
            forecast,
            closingDate: localDate(bill?.billClosingDate),
          }
        : null,
    internal: reason !== null,
    internalReason: reason,
  };
}

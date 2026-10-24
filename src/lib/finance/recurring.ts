import { OTHER_BANK_BILLS, looksLikeSubscription } from "@/lib/finance/categories";
import type { Transaction } from "@/lib/finance/types";

// Detecção de gastos recorrentes: cobranças do mesmo estabelecimento que se
// repetem com intervalo regular (assinaturas, academia, Pix fixo, tarifas).
// Função pura: recebe as transações de cerca de um ano e a data de hoje.

export type RecurringKind = "assinatura" | "servico" | "pix" | "tarifa";
export type Cadence = "semanal" | "mensal" | "trimestral" | "semestral" | "anual";
export type RecurringStatus = "ativa" | "nova" | "cancelada";

export type RecurringCharge = {
  id: string;
  date: string;
  amount: number;
  institution: string;
};

export type PriceChange = {
  from: number;
  to: number;
  /** Data da primeira cobrança no valor novo. */
  since: string;
  /** Quanto o aumento custa a mais por ano. */
  yearly: number;
};

export type Recurring = {
  id: string;
  name: string;
  logo: string | null;
  category: string;
  kind: RecurringKind;
  cadence: Cadence;
  /** Valor atual de cada cobrança. */
  amount: number;
  monthly: number;
  yearly: number;
  confidence: "alta" | "media" | "baixa";
  status: RecurringStatus;
  firstDate: string;
  lastDate: string;
  /** Data provável da próxima cobrança (null se parece cancelada). */
  nextDate: string | null;
  priceChange: PriceChange | null;
  /** O valor oscila sem um degrau claro (conta de consumo, cobrança em dólar). */
  variable: boolean;
  /** Plano pago parcelado no cartão (ex.: anual em 12x): parcela atual e total. */
  installments: { number: number; total: number } | null;
  institutions: string[];
  charges: RecurringCharge[];
};

const CYCLE_DAYS: Record<Cadence, number> = {
  semanal: 7,
  mensal: 30.44,
  trimestral: 91.31,
  semestral: 182.62,
  anual: 365.25,
};
/** Cobranças por ano em cada ciclo. */
const PER_YEAR: Record<Cadence, number> = {
  semanal: 52,
  mensal: 12,
  trimestral: 4,
  semestral: 2,
  anual: 1,
};
/**
 * Quantos ciclos podem faltar entre duas cobranças. A Belvo às vezes não traz
 * todos os meses (a Netflix aparece em nov, jan, abr...), então um intervalo
 * de 2 a 4 meses ainda conta como mensal.
 */
const MAX_CYCLES: Record<Cadence, number> = {
  semanal: 3,
  mensal: 4,
  trimestral: 2,
  semestral: 1,
  anual: 1,
};
/** Folga, em dias, para um intervalo de k ciclos (o dia da cobrança varia um pouco). */
const tolerance = (cadence: Cadence, k: number) =>
  cadence === "semanal" ? 1 : cadence === "mensal" ? 3 + k / 2 : 8 + 4 * k;
/** Mínimo de cobranças para aceitar (sem e com nome de assinatura conhecido). */
const MIN_CHARGES: Record<Cadence, [number, number]> = {
  semanal: [6, 4],
  mensal: [3, 2],
  trimestral: [3, 2],
  semestral: [2, 2],
  anual: [2, 2],
};
/** Ordem de preferência: com buracos nos dados, mensal é o mais provável. */
const CADENCES: Cadence[] = ["mensal", "trimestral", "semestral", "anual", "semanal"];
/** Contas de consumo: o valor pode variar bastante entre os meses. */
const UTILITY_CATEGORIES = new Set(["Contas e serviços", "Seguros"]);

/** Categorias que não são gasto recorrente (ou já aparecem em outra tela). */
const SKIP_CATEGORIES = new Set([
  OTHER_BANK_BILLS,
  "Investimentos",
  "Saques",
  "Crédito e empréstimos",
]);
const FEE_PATTERN = /\b(tarifa|anuidade|cesta|pacote de servi|mensalidade do cart)/i;
const IOF_PATTERN = /\biof\b/i;
const TRANSFER_OPERATIONS = new Set(["PIX", "TED", "DOC", "TRANSFERENCIA"]);

const round = (n: number) => Math.round(n * 100) / 100;
const dayMs = 86_400_000;
const days = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / dayMs);
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * dayMs).toISOString().slice(0, 10);

function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Coeficiente de variação (desvio padrão / média). */
function variation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  return mean ? sd / mean : 0;
}

/**
 * Nome comparável do estabelecimento: "PG *NETFLIX.COM SAO PAULO BR" e
 * "Netflix Entretenimento" viram "netflix".
 */
export function merchantKey(t: Pick<Transaction, "merchant" | "counterpart" | "description">) {
  const raw = (t.merchant || t.counterpart || t.description)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  // Intermediador antes do asterisco: "pg *", "ifd*", "paypal *", "dl*google"
  const withoutPrefix = raw.replace(/^[a-z0-9 .]{1,14}\*\s*/, "");
  const key = (withoutPrefix || raw)
    .replace(/\.?com\s*\/?\s*bill/g, " ")
    .replace(/\.com(\.br)?/g, " ")
    .replace(/\d+\/\d+$/, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(
      /\b(br|bra|brasil|sao paulo|sp|rj|rio de janeiro|bh|ltda|me|sa|eireli|epp|inc|llc|com|bill|pagamentos?|servicos?|digital|entretenimento|assinaturas?|mensalidade)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return key || raw.trim();
}

function kindOf(t: Transaction): RecurringKind {
  if (t.category === "Tarifas e impostos" || FEE_PATTERN.test(t.description)) return "tarifa";
  if (looksLikeSubscription(t)) return "assinatura";
  if (
    !t.merchant &&
    ((t.operationType && TRANSFER_OPERATIONS.has(t.operationType)) ||
      t.category === "Transferências")
  ) {
    return "pix";
  }
  return "servico";
}

/** Nome para exibir: o mais recente, sem "3/12" no fim nem "IFD*" no começo. */
function displayName(t: Transaction) {
  const name = (t.merchant || t.counterpart).replace(/\s*\d+\/\d+$/, "").trim();
  return name.replace(/^[a-z0-9 .]{1,14}\*\s*/i, "") || name;
}

/** Quantos ciclos cabem em cada intervalo (null quando não encaixa). */
function cyclesBetween(gaps: number[], cadence: Cadence) {
  const cycle = CYCLE_DAYS[cadence];
  return gaps.map((gap) => {
    const k = Math.max(1, Math.round(gap / cycle));
    return k <= MAX_CYCLES[cadence] && Math.abs(gap - k * cycle) <= tolerance(cadence, k)
      ? k
      : null;
  });
}

/**
 * Escolhe o ciclo que explica os intervalos (ao menos 75% deles). Mensal só
 * perde para trimestral quando todos os intervalos são múltiplos de 3 meses.
 */
function cadenceOf(gaps: number[], allowWeekly: boolean) {
  for (const cadence of CADENCES) {
    if (cadence === "semanal" && !allowWeekly) continue;
    const ks = cyclesBetween(gaps, cadence);
    const fit = ks.filter((k) => k !== null).length / gaps.length;
    if (fit < 0.75) continue;
    if (cadence === "mensal" && gaps.length >= 2 && ks.every((k) => k !== null && k % 3 === 0)) {
      continue;
    }
    return { cadence, regularity: fit, missing: ks.some((k) => k !== null && k > 1) };
  }
  return null;
}

/** Cobranças no mesmo estabelecimento: separa por faixa de valor quando há várias por ciclo. */
function splitSeries(charges: Charge[]): Charge[][] {
  const months = new Set(charges.map((c) => c.date.slice(0, 7))).size;
  if (charges.length / months <= 1.25) return [charges];
  // Ex.: Apple cobra iCloud e Apple Music no mesmo nome: uma série por valor
  const byAmount = [...charges].sort((a, b) => a.amount - b.amount);
  const clusters: Charge[][] = [];
  for (const c of byAmount) {
    const last = clusters.at(-1);
    const ref = last ? median(last.map((x) => x.amount)) : 0;
    if (last && Math.abs(c.amount - ref) <= Math.max(ref * 0.15, 2)) last.push(c);
    else clusters.push([c]);
  }
  return clusters.map((c) => c.sort((a, b) => a.date.localeCompare(b.date)));
}

/**
 * Aumento (mais de 3% e mais de R$ 1). Se o valor era fixo, basta a última
 * cobrança subir; se oscilava, as duas últimas precisam ficar acima da mediana
 * das anteriores e parecidas entre si, para não acusar variação de câmbio.
 */
function priceChangeOf(amounts: number[], dates: string[], perYear: number): PriceChange | null {
  const n = amounts.length;
  if (n < 3) return null;
  // Histórico de valor fixo (sem câmbio no meio): basta a última cobrança subir
  const history = amounts.slice(0, n - 1);
  const last = amounts[n - 1];
  const fixed = median(history);
  if (variation(history) < 0.01 && last > Math.max(fixed * 1.03, fixed + 1)) {
    return {
      from: round(fixed),
      to: round(last),
      since: dates[n - 1],
      yearly: round((last - fixed) * perYear),
    };
  }
  const [a, b] = [amounts[n - 2], amounts[n - 1]];
  const before = median(amounts.slice(0, n - 2));
  const threshold = Math.max(before * 1.03, before + 1);
  if (Math.min(a, b) <= threshold) return null;
  if (Math.abs(a - b) > Math.max(b * 0.02, 0.5)) return null;
  let i = n - 2;
  while (i > 0 && amounts[i - 1] > threshold) i--;
  // Sempre esteve no valor alto: não é aumento
  if (i === 0) return null;
  return {
    from: round(before),
    to: round(b),
    since: dates[i],
    yearly: round((b - before) * perYear),
  };
}

type Charge = RecurringCharge & { t: Transaction };

/** Próxima data no ciclo a partir de hoje (o último mês pode não ter vindo da Belvo). */
function nextCharge(lastDate: string, cycle: number, today: string) {
  let k = 1;
  while (addDays(lastDate, Math.round(cycle * k)) < today) k++;
  return addDays(lastDate, Math.round(cycle * k));
}

export function detectRecurring(transactions: Transaction[], today: string): Recurring[] {
  const outflows = transactions.filter(
    (t) =>
      t.type === "OUTFLOW" &&
      !t.internal &&
      t.accountCategory !== "LOAN_ACCOUNT" &&
      t.accountCategory !== "FINANCING_ACCOUNT" &&
      // Parcelas são compras, exceto assinatura paga parcelada (plano anual em 12x)
      (!(t.installment && t.installment.total > 1) || looksLikeSubscription(t)) &&
      !SKIP_CATEGORIES.has(t.category),
  );

  // IOF de compra internacional vem separado: soma na cobrança do mesmo dia e conta
  const iof = outflows.filter((t) => IOF_PATTERN.test(t.description));
  const charges = outflows.filter((t) => !IOF_PATTERN.test(t.description));
  const iofFor = (t: Transaction) => {
    const i = iof.findIndex(
      (x) =>
        x.accountId === t.accountId &&
        Math.abs(days(x.date, t.date)) <= 1 &&
        x.amount / t.amount >= 0.02 &&
        x.amount / t.amount <= 0.07,
    );
    return i < 0 ? 0 : iof.splice(i, 1)[0].amount;
  };

  // Estornos: uma entrada do mesmo estabelecimento e valor anula a cobrança
  const refunds = transactions.filter((t) => t.type === "INFLOW" && !t.internal);
  const refunded = (t: Transaction, key: string) =>
    refunds.some(
      (r) =>
        Math.abs(r.amount - t.amount) < 0.01 &&
        days(t.date, r.date) >= 0 &&
        days(t.date, r.date) <= 15 &&
        merchantKey(r) === key,
    );

  const groups = new Map<string, Charge[]>();
  for (const t of charges) {
    const key = merchantKey(t);
    if (refunded(t, key)) continue;
    const list = groups.get(key) ?? [];
    list.push({
      id: t.id,
      date: t.date,
      amount: round(t.amount + iofFor(t)),
      institution: t.institution,
      t,
    });
    groups.set(key, list);
  }

  const found: Recurring[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const plan = installmentPlan(list, today, key);
    if (plan) {
      found.push(plan);
      continue;
    }
    if (list.length < 2) continue;
    const series = splitSeries(list);
    series.forEach((s, index) => {
      const item = evaluate(s, today, series.length > 1 ? `${key}#${index}` : key);
      if (item) found.push(item);
    });
  }

  // Duas séries do mesmo nome (ex.: dois planos da Apple): diferencia pelo valor
  const names = new Map<string, number>();
  for (const r of found) names.set(r.name, (names.get(r.name) ?? 0) + 1);

  return found
    .map((r) => (names.get(r.name)! > 1 ? { ...r, name: `${r.name} (${moneyLabel(r.amount)})` } : r))
    .sort((a, b) => b.yearly - a.yearly);
}

/**
 * Assinatura paga parcelada: a primeira parcela já basta, porque o número de
 * parcelas diz quanto tempo o plano dura. Vale como mensal enquanto houver parcelas.
 */
function installmentPlan(list: Charge[], today: string, id: string): Recurring | null {
  const latest = list.at(-1)!;
  const inst = latest.t.installment;
  if (!inst || inst.total <= 1) return null;
  const amount = latest.amount;
  const remaining = inst.total - inst.number;
  const cycle = CYCLE_DAYS.mensal;
  const status: RecurringStatus =
    remaining <= 0 && days(latest.date, today) > cycle
      ? "cancelada"
      : inst.number <= 2
        ? "nova"
        : "ativa";
  return {
    id,
    name: displayName(latest.t),
    logo: list.findLast((c) => c.t.merchantLogo)?.t.merchantLogo ?? null,
    category: latest.t.category,
    kind: "assinatura",
    cadence: "mensal",
    amount,
    monthly: amount,
    yearly: round(amount * 12),
    confidence: "alta",
    status,
    firstDate: list[0].date,
    lastDate: latest.date,
    nextDate: remaining > 0 ? nextCharge(latest.date, cycle, today) : null,
    priceChange: null,
    variable: false,
    installments: inst,
    institutions: [...new Set(list.map((c) => c.institution))],
    charges: list.map(({ id, date, amount, institution }) => ({ id, date, amount, institution })),
  };
}

const moneyLabel = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function evaluate(series: Charge[], today: string, id: string): Recurring | null {
  if (series.length < 2) return null;
  const dates = series.map((c) => c.date);
  // Duas cobranças no mesmo dia (ex.: cobrança repetida) contam o intervalo uma vez
  const gaps = dates.slice(1).map((d, i) => days(dates[i], d)).filter((g) => g > 0);
  if (!gaps.length) return null;

  const latest = series.at(-1)!.t;
  const kind = kindOf(latest);
  const known = looksLikeSubscription(latest);
  // Semanal só para nomes conhecidos e Pix (ex.: diarista): compras frequentes enganam
  const fit = cadenceOf(gaps, known || kind === "pix");
  if (!fit) return null;
  const { cadence, regularity: regular } = fit;
  const [min, minKnown] = MIN_CHARGES[cadence];
  if (series.length < (known ? minKnown : min)) return null;

  const amounts = series.map((c) => c.amount);
  const cv = variation(amounts);
  // Valor que muda muito só faz sentido em contas de consumo; num restaurante
  // visitado de vez em quando, preço parecido e intervalo regular é coincidência
  const maxVariation = UTILITY_CATEGORIES.has(latest.category)
    ? 0.6
    : kind === "tarifa"
      ? 0.35
      : known
        ? 0.25
        : 0.12;
  if (cv > maxVariation) return null;

  const cycle = CYCLE_DAYS[cadence];
  const perYear = PER_YEAR[cadence];
  const priceChange = priceChangeOf(amounts, dates, perYear);
  const variable = !priceChange && cv > 0.04;
  const amount = round(
    priceChange ? priceChange.to : variable ? median(amounts.slice(-3)) : amounts.at(-1)!,
  );

  const lastDate = dates.at(-1)!;
  const firstDate = dates[0];
  const since = days(lastDate, today);
  const status: RecurringStatus =
    since > cycle * 1.5 + tolerance(cadence, 1)
      ? "cancelada"
      : days(firstDate, today) < cycle * 2.5
        ? "nova"
        : "ativa";

  let score = 0;
  if (series.length >= 6) score += 2;
  else if (series.length >= 3) score += 1;
  if (regular >= 0.9) score += 1;
  if (cv < 0.05 || priceChange) score += 1;
  if (known) score += 1;

  return {
    id,
    name: displayName(latest),
    logo: series.findLast((c) => c.t.merchantLogo)?.t.merchantLogo ?? null,
    category: latest.category,
    kind,
    cadence,
    amount,
    monthly: round((amount * perYear) / 12),
    yearly: round(amount * perYear),
    confidence: score >= 4 ? "alta" : score >= 2 ? "media" : "baixa",
    status,
    firstDate,
    lastDate,
    nextDate: status === "cancelada" ? null : nextCharge(lastDate, cycle, today),
    priceChange,
    variable,
    installments: null,
    institutions: [...new Set(series.map((c) => c.institution))],
    charges: series.map(({ id, date, amount, institution }) => ({
      id,
      date,
      amount,
      institution,
    })),
  };
}

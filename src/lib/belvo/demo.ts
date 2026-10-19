// Dados fictícios no mesmo formato da Belvo, para ver a interface funcionando
// sem credenciais. Nenhum dado real aqui: nomes e valores são inventados.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

const CHECKING = "demo-checking";
const CARD = "demo-card";
const LOAN = "demo-loan";
const INSTITUTION = { name: "ofexemplo_br_retail", display_name: "Banco Exemplo" };
const INSTITUTION_2 = { name: "offinanceira_br_retail", display_name: "Financeira Exemplo" };

export function demoAccounts(): Raw[] {
  return [
    {
      account_id: CHECKING,
      link: "demo-link",
      institution: INSTITUTION,
      category: "CHECKING_ACCOUNT",
      name: "Conta corrente",
      currency: "BRL",
      balance_type: "ASSET",
      balance: { current: 3480.52, available: 3480.52 },
    },
    {
      account_id: CARD,
      link: "demo-link",
      institution: INSTITUTION,
      category: "CREDIT_CARD",
      name: "Cartão Gold",
      currency: "BRL",
      balance_type: "LIABILITY",
      balance: { current: 4210.3, available: 7789.7 },
      credit_data: {
        credit_limit: 12000,
        minimum_payment: 631.55,
        cutting_date: null, // vencimento vem das faturas
        network: "VISA",
        cards: [{ identification_number: "1234" }],
        limits: [
          {
            type: "LIMITE_CREDITO_TOTAL",
            credit_limit: 12000,
            used_amount: 4210.3,
            available_amount: 7789.7,
          },
        ],
      },
    },
    {
      account_id: LOAN,
      link: "demo-link",
      institution: INSTITUTION_2,
      category: "LOAN_ACCOUNT",
      name: "Crédito pessoal",
      currency: "BRL",
      balance_type: "LIABILITY",
      balance: { current: 2650, available: 0 },
      loan_data: {
        loan_type: "CREDITO_PESSOAL_SEM_CONSIGNACAO",
        contract_amount: 3600,
        outstanding_balance: 2650,
        number_of_installments_total: 18,
        number_of_installments_paid: 5,
        number_of_installments_outstanding: 13,
        number_of_installments_past_due: 0,
        total_effective_cost: 0.64,
        contract_start_date: "2026-05-10",
        contract_end_date: "2027-11-10",
      },
    },
  ];
}

type Template = {
  description: string;
  merchant?: string;
  category: string;
  subcategory: string;
  min: number;
  max: number;
  perMonth: number;
  account: "card" | "checking";
  operation?: string;
};

const SPENDING: Template[] = [
  { description: "Supermercado Bom Preço", merchant: "Bom Preço", category: "Food & Groceries", subcategory: "Groceries", min: 25, max: 260, perMonth: 7, account: "card" },
  { description: "Padaria Pão Quente", category: "Food & Groceries", subcategory: "Bakery & Coffee", min: 8, max: 35, perMonth: 6, account: "checking", operation: "CARTAO" },
  { description: "Restaurante Sabor Caseiro", category: "Food & Groceries", subcategory: "Restaurants", min: 30, max: 95, perMonth: 4, account: "card" },
  { description: "Bar do Centro", category: "Food & Groceries", subcategory: "Bars & Nightclubs", min: 40, max: 140, perMonth: 2, account: "card" },
  { description: "Posto Avenida", category: "Transport & Travel", subcategory: "Gas", min: 180, max: 280, perMonth: 2, account: "card" },
  { description: "Uber", merchant: "Uber", category: "Transport & Travel", subcategory: "Taxis & Rideshares", min: 12, max: 38, perMonth: 4, account: "card" },
  { description: "Farmácia Saúde", category: "Home & Life", subcategory: "Pharmacies", min: 18, max: 90, perMonth: 1, account: "card" },
  { description: "Barbearia Estilo", category: "Home & Life", subcategory: "Hair & Beauty", min: 45, max: 70, perMonth: 1, account: "card" },
  { description: "Loja Online Shop", category: "Personal Shopping", subcategory: "E-commerce", min: 60, max: 320, perMonth: 1, account: "card" },
];

const MONTHLY: (Omit<Template, "min" | "max" | "perMonth"> & { amount: number; day: number })[] = [
  { description: "Netflix.Com", merchant: "Netflix", category: "Online Platforms & Leisure", subcategory: "Movie & Video", amount: 44.9, day: 20, account: "card" },
  { description: "Ebn*Spotify", merchant: "Spotify", category: "Online Platforms & Leisure", subcategory: "Music & Audio", amount: 21.9, day: 24, account: "card" },
  { description: "Cursor, Ai Powered Ide", merchant: "Cursor", category: "Online Platforms & Leisure", subcategory: "Apps, Software and Cloud Services", amount: 112.4, day: 12, account: "card" },
  { description: "Amazon Aws Servicos Br", merchant: "Amazon", category: "Bills & Utilities", subcategory: "Telecommunications", amount: 9.3, day: 1, account: "card" },
  { description: "Conta de luz|Energia Distribuidora", category: "Bills & Utilities", subcategory: "Electricity & Energy", amount: 168.4, day: 5, account: "checking", operation: "PIX" },
  { description: "Internet Fibra", category: "Bills & Utilities", subcategory: "Telecommunications", amount: 109.9, day: 15, account: "card" },
  { description: "Pagamento efetuado|Condomínio Residencial", category: "Bills & Utilities", subcategory: "Rent", amount: 420, day: 20, account: "checking", operation: "BOLETO" },
  { description: "Parcela Paga | Crédito pessoal", category: "Credits & Loans", subcategory: "Instalment", amount: 198.6, day: 10, account: "checking", operation: "OPERACAO_CREDITO" },
];

export function demoTransactions(today = new Date()): Raw[] {
  const rand = rng(42);
  const out: Raw[] = [];
  let seq = 0;
  const push = (t: Raw) => out.push({ transaction_id: `demo-${seq++}`, status: "PROCESSED", currency: "BRL", ...t });

  for (let m = 0; m < 4; m++) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - m, 1);

    // Receitas
    const salaryDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 5);
    if (salaryDay <= today) {
      push({ account_id: CHECKING, date: iso(salaryDay), amount: 5200, type: "INFLOW", description: "Transferência Recebida|Empresa Exemplo Ltda", category: "Income & Payments", subcategory: "Salary", operation_type: "PIX" });
    }
    const freelaDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 18);
    if (freelaDay <= today && rand() > 0.35) {
      push({ account_id: CHECKING, date: iso(freelaDay), amount: Math.round(800 + rand() * 1700), type: "INFLOW", description: "Transferência Recebida|Cliente Freela", category: "Income & Payments", subcategory: "Freelance", operation_type: "PIX" });
    }

    // Contas mensais
    for (const t of MONTHLY) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), t.day);
      if (d > today) continue;
      push({
        account_id: t.account === "card" ? CARD : CHECKING,
        date: iso(d),
        accounting_date: iso(d),
        amount: t.amount,
        type: "OUTFLOW",
        description: t.description,
        merchant: t.merchant ? { merchant_name: t.merchant } : null,
        category: t.category,
        subcategory: t.subcategory,
        operation_type: t.operation ?? (t.account === "card" ? "PAGAMENTO" : "CARTAO"),
      });
    }

    // Gastos variáveis
    for (const t of SPENDING) {
      for (let i = 0; i < t.perMonth; i++) {
        const day = 1 + Math.floor(rand() * 28);
        const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
        if (d > today) continue;
        push({
          account_id: t.account === "card" ? CARD : CHECKING,
          date: iso(d),
          accounting_date: iso(d),
          amount: Math.round((t.min + rand() * (t.max - t.min)) * 100) / 100,
          type: "OUTFLOW",
          description: t.account === "checking" ? `Compra no débito|${t.description}` : t.description,
          merchant: t.merchant ? { merchant_name: t.merchant } : null,
          category: t.category,
          subcategory: t.subcategory,
          operation_type: t.operation ?? "PAGAMENTO",
        });
      }
    }

  }

  // Compra parcelada em 3x: o banco manda uma linha por parcela, com a data da compra
  const parcelDate = new Date(today);
  parcelDate.setDate(parcelDate.getDate() - 12);
  for (let i = 1; i <= 3; i++) {
    push({ account_id: CARD, date: iso(parcelDate), amount: 399.9, type: "OUTFLOW", description: "Loja de Eletrônicos", merchant: { merchant_name: "Loja de Eletrônicos" }, category: "Personal Shopping", subcategory: "Electronics", operation_type: "PAGAMENTO", credit_card_data: { installment_identifier: i, number_of_installments: 3, _offset: i - 1 } });
  }

  // Faturas do cartão: fecha dia 9, vence dia 16
  const CLOSE = 9;
  const DUE = 16;
  const monthKey = (d: Date) => d.toISOString().slice(0, 7);
  const shift = (month: string, n: number) => {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  };
  const totals = new Map<string, number>();
  for (const t of out) {
    if (t.account_id !== CARD) continue;
    const d = new Date(`${t.date}T12:00:00Z`);
    const base = d.getUTCDate() <= CLOSE ? monthKey(d) : shift(monthKey(d), 1);
    const forecast = shift(base, t.credit_card_data?._offset ?? 0);
    t.credit_card_data = { ...(t.credit_card_data ?? {}), card_number: "1234", bill_forecast_date: forecast };
    delete t.credit_card_data._offset;
    totals.set(forecast, (totals.get(forecast) ?? 0) + t.amount);
  }
  const todayIso = iso(today);
  for (const [month, total] of totals) {
    const closing = `${month}-0${CLOSE}`;
    if (closing > todayIso) continue; // fatura ainda aberta
    const due = `${month}-${DUE}`;
    const amount = Math.round(total * 100) / 100;
    for (const t of out) {
      if (t.account_id === CARD && t.credit_card_data?.bill_forecast_date === month) {
        Object.assign(t.credit_card_data, { bill_due_date: due, bill_amount: amount, bill_name: month });
        t.accounting_date = t.date;
      }
    }
    if (due <= todayIso) {
      push({ account_id: CHECKING, date: due, amount, type: "OUTFLOW", description: "Pagamento de fatura", category: "Credits & Loans", subcategory: "Credit Card", operation_type: "OUTROS" });
      push({ account_id: CARD, date: due, amount, type: "INFLOW", description: "Pagamento recebido", category: "Credits & Loans", subcategory: "Credit Card", operation_type: "PAGAMENTO_FATURA" });
    }
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

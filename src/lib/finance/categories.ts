// Tradução das categorias da Belvo para nomes em português, mais algumas
// regras extras para casos que a categorização automática erra com frequência.

export const CATEGORY_LABELS: Record<string, string> = {
  "Food & Groceries": "Alimentação",
  "Transport & Travel": "Transporte",
  "Bills & Utilities": "Contas e serviços",
  "Online Platforms & Leisure": "Assinaturas e lazer",
  "Personal Shopping": "Compras",
  "Home & Life": "Casa e cuidados",
  "Credits & Loans": "Crédito e empréstimos",
  Transfers: "Transferências",
  "Income & Payments": "Renda",
  "Fees & Charges": "Tarifas e impostos",
  Taxes: "Tarifas e impostos",
  Insurance: "Seguros",
  "Investments & Savings": "Investimentos",
  "Withdrawal & ATM": "Saques",
  Deposits: "Depósitos",
  Unknown: "Outros",
};

export const OTHER_BANK_BILLS = "Faturas de outros bancos";
export const GAMBLING = "Apostas";

const CARD_BILL_PATTERN = /(MASTERCARD|VISA|ELO|HIPERCARD|AMEX|BANCO CSF|CARTAO|CARTÃO)/i;

export function categorize(input: {
  rawCategory: string | null;
  subcategory: string | null;
  description: string;
  operationType: string | null;
  type: "INFLOW" | "OUTFLOW";
}): string {
  const { rawCategory, subcategory, description, operationType, type } = input;

  if (subcategory === "Gambling" || subcategory === "Lottery") return GAMBLING;

  if (
    type === "OUTFLOW" &&
    (operationType === "BOLETO" || operationType === "PIX") &&
    CARD_BILL_PATTERN.test(description)
  ) {
    return OTHER_BANK_BILLS;
  }

  if (type === "INFLOW" && rawCategory === "Transfers") return "Transferências recebidas";
  if (subcategory === "Gas") return "Combustível";
  if (subcategory === "Restaurants" || subcategory === "Bars & Nightclubs") {
    return "Restaurantes e bares";
  }
  if (subcategory === "Groceries" || subcategory === "Convenience Store") return "Mercado";

  if (!rawCategory) return "Outros";
  return CATEGORY_LABELS[rawCategory] ?? rawCategory;
}

export const SUBSCRIPTION_SUBCATEGORIES = new Set([
  "Movie & Video",
  "Movie & Audio",
  "Music & Audio",
  "Apps, Software and Cloud Services",
  "Books & News",
]);

const SUBSCRIPTION_NAMES =
  /(netflix|spotify|disney|globo|apple\.com|youtube|prime video|amazon prime|hbo|max|deezer|cursor|chatgpt|openai|anthropic|claude|github|aws|google one|icloud|canva|notion)/i;

export function looksLikeSubscription(t: {
  subcategory: string | null;
  description: string;
  merchant: string | null;
}) {
  if (t.subcategory && SUBSCRIPTION_SUBCATEGORIES.has(t.subcategory)) return true;
  return SUBSCRIPTION_NAMES.test(`${t.merchant ?? ""} ${t.description}`);
}

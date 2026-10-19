import type { FinanceSnapshot } from "@/lib/finance/types";

export const ALL_BANKS = "todos";

/** Restringe contas e transações a um banco. Banco desconhecido ou "todos" = sem filtro. */
export function filterByBank(
  snapshot: FinanceSnapshot,
  bank: string | string[] | undefined,
): FinanceSnapshot & { bank: string | null; allInstitutions: string[] } {
  const allInstitutions = [
    ...new Set([
      ...snapshot.institutions,
      ...snapshot.accounts.map((a) => a.institution),
    ]),
  ].filter(Boolean);
  const wanted = typeof bank === "string" ? bank : null;
  if (!wanted || wanted === ALL_BANKS || !allInstitutions.includes(wanted)) {
    return { ...snapshot, bank: null, allInstitutions };
  }
  return {
    ...snapshot,
    bank: wanted,
    allInstitutions,
    institutions: [wanted],
    accounts: snapshot.accounts.filter((a) => a.institution === wanted),
    transactions: snapshot.transactions.filter((t) => t.institution === wanted),
  };
}

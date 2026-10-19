import "server-only";

import type { CurrentUser } from "@/lib/auth";
import { readDoc, writeDoc } from "@/lib/user-documents";

// Configurações do planejamento (salário, contas fixas, metas), uma por usuário
// em user_documents (tipo plan).

export type FixedCost = {
  id: string;
  name: string;
  amount: number;
  /** Dia do vencimento (1–31). */
  day: number;
  /** Paga no cartão: já entra na fatura, então não soma de novo. */
  onCard: boolean;
};

export type PlanSettings = {
  salary: number;
  /** Dia em que o salário cai. */
  salaryDay: number;
  otherIncome: number;
  /** Percentual do salário para guardar todo mês (0–100). */
  savingsPct: number;
  fixed: FixedCost[];
};

export const DEFAULT_PLAN: PlanSettings = {
  salary: 0,
  salaryDay: 5,
  otherIncome: 0,
  savingsPct: 10,
  fixed: [],
};

const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function sanitizePlan(input: unknown): PlanSettings {
  const o = (input ?? {}) as Record<string, unknown>;
  const fixed = Array.isArray(o.fixed) ? o.fixed : [];
  return {
    salary: clampNum(o.salary, 0, 10_000_000, 0),
    salaryDay: Math.round(clampNum(o.salaryDay, 1, 31, 5)),
    otherIncome: clampNum(o.otherIncome, 0, 10_000_000, 0),
    savingsPct: clampNum(o.savingsPct, 0, 100, 10),
    fixed: fixed.slice(0, 50).map((f, i) => {
      const x = (f ?? {}) as Record<string, unknown>;
      return {
        id:
          typeof x.id === "string" && x.id
            ? x.id.slice(0, 40)
            : `f${Date.now()}${i}`,
        name: String(x.name ?? "Conta").slice(0, 60) || "Conta",
        amount: clampNum(x.amount, 0, 10_000_000, 0),
        day: Math.round(clampNum(x.day, 1, 31, 10)),
        onCard: Boolean(x.onCard),
      };
    }),
  };
}

export async function readPlan(user: CurrentUser): Promise<{
  plan: PlanSettings;
  configured: boolean;
}> {
  const saved = await readDoc<unknown>(user, "plan");
  return saved == null
    ? { plan: DEFAULT_PLAN, configured: false }
    : { plan: sanitizePlan(saved), configured: true };
}

export async function writePlan(user: CurrentUser, plan: PlanSettings) {
  await writeDoc(user, "plan", plan);
}

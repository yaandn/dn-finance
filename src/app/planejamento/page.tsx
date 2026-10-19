import { connection } from "next/server";

import { PageShell } from "@/components/page-shell";
import { requireUser } from "@/lib/auth";
import { PlanView } from "@/components/plan-view";
import { buildBills } from "@/lib/finance/bills";
import { getSnapshot, resolvePeriod } from "@/lib/finance/data";
import { computePlanBase } from "@/lib/finance/plan";
import { readPlan } from "@/lib/finance/plan-store";

// Painel pessoal: sempre busca dados na hora (sem pré-renderização).
export const instant = false;

export default async function PlanningPage() {
  await connection();
  const user = await requireUser();
  const period = resolvePeriod(90);
  const [snapshot, { plan: settings, configured }] = await Promise.all([
    getSnapshot(period.days),
    readPlan(user),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const billsOverview = buildBills(snapshot, today, period.from);
  const base = computePlanBase(snapshot, billsOverview, today);

  return (
    <PageShell
      snapshot={snapshot}
      period={period}
      title="Planejamento"
      description="Quanto do salário já está comprometido e quanto sobra para o mês"
    >
      <PlanView base={base} initial={settings} configured={configured} />
    </PageShell>
  );
}

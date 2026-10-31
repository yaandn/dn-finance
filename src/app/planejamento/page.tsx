"use client";

import { useMemo } from "react";

import { PageShell, type ShellSnapshot } from "@/components/page-shell";
import { PlanView } from "@/components/plan-view";
import { WidgetTokenCard } from "@/components/widget-token-card";
import { useCardInstallments, usePlan, useRecurring } from "@/lib/api/queries";
import { errorMessage } from "@/lib/api/http";
import { buildBills } from "@/lib/finance/bills";
import { computePlanBase } from "@/lib/finance/plan";
import type { Period } from "@/lib/finance/types";

export default function PlanningPage() {
  // Começa junto com a busca dos dados do PageShell, não depois
  const plan = usePlan();

  return (
    <PageShell
      days={90}
      filterBank={false}
      title="Planejamento"
      description="Quanto do salário já está comprometido e quanto sobra para o mês"
    >
      {(snapshot, period) =>
        plan.data ? (
          <Planning
            snapshot={snapshot}
            period={period}
            settings={plan.data.plan}
            configured={plan.data.configured}
          />
        ) : plan.error ? (
          <p className="text-negative text-sm">
            Não foi possível carregar o planejamento: {errorMessage(plan.error)}
          </p>
        ) : (
          <div className="bg-muted h-80 animate-pulse rounded-xl" />
        )
      }
    </PageShell>
  );
}

function Planning({
  snapshot,
  period,
  settings,
  configured,
}: {
  snapshot: ShellSnapshot;
  period: Period;
  settings: Parameters<typeof PlanView>[0]["initial"];
  configured: boolean;
}) {
  const older = useCardInstallments(snapshot.source === "mcp" || snapshot.source === "pluggy");
  const recurring = useRecurring();
  const base = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return computePlanBase(
      snapshot,
      buildBills(snapshot, today, period.from, older.data?.transactions),
      today,
      recurring.data?.items,
    );
  }, [snapshot, period.from, older.data, recurring.data]);

  return (
    <>
      <PlanView base={base} initial={settings} configured={configured} />
      <WidgetTokenCard />
    </>
  );
}

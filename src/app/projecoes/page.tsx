"use client";

import Link from "next/link";
import { useMemo } from "react";

import { AllocationPlanner } from "@/components/allocation-planner";
import { PageShell, type ShellSnapshot } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { errorMessage } from "@/lib/api/http";
import { useCardInstallments, usePlan, useRecurring } from "@/lib/api/queries";
import { buildBills } from "@/lib/finance/bills";
import { applySettings, computePlanBase } from "@/lib/finance/plan";
import type { PlanSettings } from "@/lib/finance/plan-store";
import { projectMonths } from "@/lib/finance/projection";
import type { Period } from "@/lib/finance/types";

export default function ProjectionsPage() {
  const plan = usePlan();
  return (
    <PageShell
      days={90}
      filterBank={false}
      title="Projeções"
      description="Divida o que sobra todo mês entre as suas prioridades"
    >
      {(snapshot, period) =>
        plan.data ? (
          <Projections
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

function Projections({
  snapshot,
  period,
  settings,
  configured,
}: {
  snapshot: ShellSnapshot;
  period: Period;
  settings: PlanSettings;
  configured: boolean;
}) {
  const older = useCardInstallments(snapshot.source === "mcp" || snapshot.source === "pluggy");
  const recurring = useRecurring();

  const months = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const items = recurring.data?.items ?? [];
    const overview = buildBills(snapshot, today, period.from, older.data?.transactions);
    const base = computePlanBase(snapshot, overview, today, items);
    return projectMonths(base, applySettings(base, settings), overview);
  }, [snapshot, period.from, older.data, recurring.data, settings]);

  if (!configured || settings.salary <= 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          Preencha o salário no{" "}
          <Link href="/planejamento" className="text-primary hover:underline">
            Planejamento
          </Link>{" "}
          para ver as projeções.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <AllocationPlanner settings={settings} months={months} />
      <p className="text-muted-foreground text-xs">
        A sobra de cada mês é a mesma do Planejamento: renda menos contas fixas, recorrentes,
        dívidas, meta de poupança e o que já está nas faturas daquele mês. Compras novas no cartão
        ainda não entram. Meses sem sobra não são divididos.
      </p>
    </>
  );
}

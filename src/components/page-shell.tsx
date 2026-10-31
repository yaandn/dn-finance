"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import {
  AlertTriangleIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  LandmarkIcon,
  PlugIcon,
  RotateCwIcon,
} from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { McpDisconnectButton, McpStatusMessage } from "@/components/mcp-connect";
import { PageSkeleton } from "@/components/page-skeleton";
import { PluggyConnectCard, PluggySyncControl } from "@/components/pluggy-connect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/http";
import { useMe, useSnapshot } from "@/lib/api/queries";
import { filterByBank } from "@/lib/finance/filter";
import { resolveRange } from "@/lib/finance/period";
import { longDate } from "@/lib/format";
import type { Period } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const SOURCE_LABEL = {
  pluggy: { label: "Pluggy", icon: LandmarkIcon },
  mcp: { label: "Belvo Panorama", icon: LandmarkIcon },
  belvo: { label: "API Belvo", icon: PlugIcon },
  file: { label: "Arquivo exportado", icon: DatabaseIcon },
  demo: { label: "Dados de demonstração", icon: FlaskConicalIcon },
} as const;

export type ShellSnapshot = ReturnType<typeof filterByBank>;

type ShellProps = {
  /** Período fixo da página; sem ele, vem de ?dias=. */
  days?: number;
  /** false: ignora ?banco= (a página sempre usa todos os bancos). */
  filterBank?: boolean;
  /** Aceita intervalo personalizado (?de=…&ate=…) no lugar de ?dias=. */
  allowRange?: boolean;
  title: string;
  description?: string;
  children: (snapshot: ShellSnapshot, period: Period) => React.ReactNode;
};

/**
 * Cabeçalho, avisos e estado da conexão de cada página. Busca os dados do
 * período (/api/snapshot) e entrega já filtrados por banco para `children`.
 */
export function PageShell(props: ShellProps) {
  // useSearchParams precisa de um <Suspense> acima
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Shell {...props} />
    </Suspense>
  );
}

function Shell({
  days: fixedDays,
  filterBank = true,
  allowRange = false,
  title,
  description,
  children,
}: ShellProps) {
  const params = useSearchParams();
  const days = fixedDays ?? Number(params.get("dias") ?? 30);
  const bank = filterBank ? (params.get("banco") ?? undefined) : undefined;
  const de = params.get("de");
  const ate = params.get("ate");
  const range = useMemo(() => {
    if (!allowRange) return null;
    const r = resolveRange(de, ate);
    return r ? { from: r.from, to: r.to } : null;
  }, [allowRange, de, ate]);
  const { data, error, isPending, isFetching, isPlaceholderData, refetch } =
    useSnapshot(days, range);
  const { data: me } = useMe();

  const snapshot = useMemo(
    () => (data ? filterByBank(data, bank) : null),
    [data, bank],
  );

  return (
    <>
      <AppHeader
        banks={snapshot?.allInstitutions ?? []}
        email={me?.email}
        loading={isFetching}
      />
      {isPending ? (
        <PageSkeleton />
      ) : !snapshot || !data ? (
        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:py-8">
          <div className="border-negative/40 bg-negative/10 flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <AlertTriangleIcon className="text-negative mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Não foi possível carregar os dados</p>
                <p className="text-muted-foreground">{errorMessage(error)}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RotateCwIcon /> Tentar de novo
            </Button>
          </div>
        </main>
      ) : (
        <main
          className={cn(
            "mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 transition-opacity md:py-8",
            // Trocando de período: mostra o anterior esmaecido até chegar o novo
            isPlaceholderData && "opacity-60",
          )}
        >
          <ShellHeader
            snapshot={snapshot}
            period={data.period}
            title={title}
            description={description}
          />
          {children(snapshot, data.period)}
        </main>
      )}
    </>
  );
}

function ShellHeader({
  snapshot,
  period,
  title,
  description,
}: {
  snapshot: ShellSnapshot;
  period: Period;
  title: string;
  description?: string;
}) {
  const source = SOURCE_LABEL[snapshot.source];
  const Icon = source.icon;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">
            {description ??
              `${longDate(period.from)} a ${longDate(period.to)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {snapshot.bank && (
            <span className="text-muted-foreground text-xs">
              Filtrando por
            </span>
          )}
          {snapshot.institutions.map((i) => (
            <Badge key={i} variant={snapshot.bank ? "default" : "secondary"}>
              {i}
            </Badge>
          ))}
          <Badge variant={snapshot.source === "demo" ? "warning" : "outline"}>
            <Icon />
            {source.label}
            {snapshot.environment === "sandbox" ? " · sandbox" : ""}
          </Badge>
          {snapshot.source === "mcp" && <McpDisconnectButton />}
        </div>
      </div>

      <McpStatusMessage />

      {snapshot.pluggyConnected && <PluggySyncControl />}

      {!snapshot.pluggyConnected && <PluggyConnectCard />}

      {snapshot.warnings.length > 0 && (
        <div className="border-warning/40 bg-warning/10 flex gap-3 rounded-lg border p-3 text-sm">
          <AlertTriangleIcon className="text-warning mt-0.5 size-4 shrink-0" />
          <ul className="space-y-1">
            {snapshot.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

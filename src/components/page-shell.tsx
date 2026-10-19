import { Suspense } from "react";
import {
  AlertTriangleIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  LandmarkIcon,
  PlugIcon,
} from "lucide-react";

import { AppHeader } from "@/components/app-header";
import {
  McpConnectCard,
  McpDisconnectButton,
  McpStatusMessage,
} from "@/components/mcp-connect";
import { SyncControl } from "@/components/sync-control";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { getSyncState } from "@/lib/belvo/mcp-sync";
import { longDate } from "@/lib/format";
import type { FinanceSnapshot, Period } from "@/lib/finance/types";

const SOURCE_LABEL = {
  mcp: { label: "Belvo Panorama", icon: LandmarkIcon },
  belvo: { label: "API Belvo", icon: PlugIcon },
  file: { label: "Arquivo exportado", icon: DatabaseIcon },
  demo: { label: "Dados de demonstração", icon: FlaskConicalIcon },
} as const;

export async function PageShell({
  snapshot,
  period,
  title,
  description,
  children,
}: {
  snapshot: FinanceSnapshot & {
    bank?: string | null;
    allInstitutions?: string[];
  };
  period: Period;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const source = SOURCE_LABEL[snapshot.source];
  const sync =
    snapshot.source === "mcp" && snapshot.connections
      ? await getSyncState(user)
      : null;
  const Icon = source.icon;

  return (
    <>
      <Suspense fallback={<div className="h-14 border-b" />}>
        <AppHeader
          banks={snapshot.allInstitutions ?? snapshot.institutions}
          email={user.email}
        />
      </Suspense>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:py-8">
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
            {snapshot.mcpConnected && <McpDisconnectButton />}
          </div>
        </div>

        <Suspense fallback={null}>
          <McpStatusMessage />
        </Suspense>

        {sync && snapshot.connections && (
          <SyncControl connections={snapshot.connections} initial={sync} />
        )}

        {!snapshot.mcpConnected && <McpConnectCard />}

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

        {children}
      </main>
    </>
  );
}

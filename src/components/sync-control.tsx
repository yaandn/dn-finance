"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2Icon,
  Loader2Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RefreshResult, SyncState } from "@/lib/belvo/mcp-sync";
import { cn } from "@/lib/utils";

type Conn = {
  connectionId: string;
  institution: string;
  status: string;
  lastSyncedAt: string | null;
};

function ago(iso: string | null) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d === 1 ? "" : "s"}`;
}

function resultText(r: RefreshResult) {
  switch (r.status) {
    case "completed":
      return "atualizado";
    case "unavailable":
      return "o banco não permite atualizar agora; os dados guardados são os mais recentes";
    case "skipped":
      return `limite de atualizações atingido${r.retryAfter ? `; tente após ${new Date(r.retryAfter).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}`;
    case "mfa_required":
      return "o banco pediu um código de verificação; atualize a conexão em panorama.belvo.com";
    default:
      return r.message ?? "falhou";
  }
}

export function SyncControl({
  connections,
  initial,
}: {
  connections: Conn[];
  initial: SyncState;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const wasRunning = useRef(initial.running);

  const poll = useCallback(async () => {
    const res = await fetch("/api/belvo-mcp/sync", { cache: "no-store" });
    if (res.ok) setState(await res.json());
  }, []);

  // Acompanha enquanto estiver rodando; ao terminar, recarrega os dados da página
  useEffect(() => {
    if (state.running) {
      wasRunning.current = true;
      const id = setTimeout(poll, 4000);
      return () => clearTimeout(id);
    }
    if (wasRunning.current) {
      wasRunning.current = false;
      router.refresh();
    }
  }, [state, poll, router]);

  async function start() {
    setError(null);
    const res = await fetch("/api/belvo-mcp/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Não foi possível iniciar.");
    setState(data);
  }

  const valid = connections.filter((c) => c.status === "valid");
  const showResults =
    !state.running &&
    state.results.length > 0 &&
    state.finishedAt &&
    Date.now() - Date.parse(state.finishedAt) < 6 * 60 * 60 * 1000;
  const problems = state.results.filter((r) => r.status !== "completed");

  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted-foreground">Última sincronização:</span>
        {valid.map((c) => (
          <span key={c.connectionId} className="tabular-nums">
            <span className="font-medium">{c.institution}</span>{" "}
            <span
              className={cn(
                "text-muted-foreground",
                c.lastSyncedAt &&
                  Date.now() - Date.parse(c.lastSyncedAt) > 48 * 3600_000 &&
                  "text-warning",
              )}
              title={
                c.lastSyncedAt
                  ? new Date(c.lastSyncedAt).toLocaleString("pt-BR")
                  : undefined
              }
            >
              {ago(c.lastSyncedAt)}
            </span>
          </span>
        ))}
        {state.running && (
          <span className="text-primary flex items-center gap-1.5">
            <Loader2Icon className="size-3.5 animate-spin" />
            {state.trigger === "auto"
              ? "Atualização diária em andamento"
              : "Atualizando"}
            {state.current ? `: ${state.current}` : ""}… pode levar alguns
            minutos
          </span>
        )}
        {showResults && problems.length === 0 && (
          <span className="text-positive flex items-center gap-1">
            <CheckCircle2Icon className="size-3.5" /> Atualizado{" "}
            {ago(state.finishedAt)}
          </span>
        )}
        {showResults &&
          problems.map((r) => (
            <span
              key={r.institution}
              className="text-warning flex items-center gap-1"
            >
              <TriangleAlertIcon className="size-3.5" />
              {r.institution}: {resultText(r)}
            </span>
          ))}
        {error && <span className="text-negative">{error}</span>}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0 self-start text-xs sm:self-auto"
        disabled={state.running}
        onClick={start}
      >
        <RefreshCwIcon className={cn(state.running && "animate-spin")} />
        {state.running ? "Atualizando…" : "Atualizar dados"}
      </Button>
    </div>
  );
}

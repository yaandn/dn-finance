"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  CheckCircle2Icon,
  Loader2Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { errorMessage } from "@/lib/api/http";
import { queryKeys, useStartSync, useSyncState } from "@/lib/api/queries";
import type {
  RefreshResult,
  SyncAttempt,
  SyncState,
} from "@/lib/belvo/mcp-sync";
import { cn } from "@/lib/utils";

type Conn = {
  connectionId: string;
  institution: string;
  status: string;
  lastSyncedAt: string | null;
};

/** Tentativas em que a Belvo foi até o banco (as que contam para o limite). */
const REACHED_BANK: SyncAttempt["status"][] = [
  "completed",
  "failed",
  "mfa_required",
];

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

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

function resultText(r: RefreshResult) {
  switch (r.status) {
    case "completed":
      return "atualizado";
    case "unavailable":
      return "o banco não permite atualizar agora; os dados guardados são os mais recentes";
    case "skipped":
      return `limite de atualizações atingido${r.retryAfter ? `; tente após ${dateTime(r.retryAfter)}` : ""}`;
    case "mfa_required":
      return "o banco pediu um código de verificação; atualize a conexão em panorama.belvo.com";
    default:
      return r.message ?? "falhou";
  }
}

/** Resumo por banco para o cartão do hover (fora do render: usa a hora atual). */
function summarize(state: SyncState, connections: Conn[]) {
  const now = Date.now();
  const month = new Date().toISOString().slice(0, 7);
  const history = state.history ?? [];
  const banks = connections
    .filter((c) => c.status === "valid")
    .map((c) => {
      const attempts = history.filter((a) => a.institution === c.institution);
      const lastSkip = attempts.findLast((a) => a.status === "skipped");
      return {
        ...c,
        thisMonth: attempts.filter(
          (a) => a.at.startsWith(month) && REACHED_BANK.includes(a.status),
        ).length,
        blockedUntil:
          lastSkip?.retryAfter && Date.parse(lastSkip.retryAfter) > now
            ? lastSkip.retryAfter
            : null,
        stale: c.lastSyncedAt
          ? now - Date.parse(c.lastSyncedAt) > 48 * 3600_000
          : false,
      };
    });
  const recent =
    !state.running &&
    !!state.finishedAt &&
    now - Date.parse(state.finishedAt) < 6 * 3600_000;
  return {
    banks,
    // "skipped" já aparece como limite em cada banco
    problems: recent
      ? state.results.filter(
          (r) => r.status !== "completed" && r.status !== "skipped",
        )
      : [],
    justFinished: recent && state.results.every((r) => r.status === "completed"),
    finishedAgo: state.finishedAt ? ago(state.finishedAt) : null,
    countingSince:
      state.historySince && state.historySince.slice(0, 7) === month
        ? new Date(state.historySince).toLocaleDateString("pt-BR")
        : null,
  };
}

/**
 * Botão flutuante de sincronização com a Belvo. No hover mostra, por banco,
 * quantas sincronizações foram feitas no mês, a última e se o limite estourou.
 */
export function SyncControl({ connections }: { connections: Conn[] }) {
  const queryClient = useQueryClient();
  // Enquanto estiver rodando, a consulta se repete sozinha (refetchInterval)
  const { data: state } = useSyncState();
  const startSync = useStartSync();
  const wasRunning = useRef(false);

  // Ao terminar, busca de novo os dados de todas as páginas
  useEffect(() => {
    if (state?.running) wasRunning.current = true;
    else if (state && wasRunning.current) {
      wasRunning.current = false;
      void queryClient.invalidateQueries({ queryKey: queryKeys.snapshots });
    }
  }, [state, queryClient]);

  if (!state) return null;
  const error = startSync.error
    ? errorMessage(startSync.error, "Não foi possível iniciar.")
    : null;
  const s = summarize(state, connections);
  const busy = state.running || startSync.isPending;
  const attention =
    !!error ||
    s.problems.length > 0 ||
    s.banks.some((b) => b.blockedUntil || b.stale);

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Button
          size="icon"
          // aria-disabled em vez de disabled: botão desabilitado não abre o hover
          aria-disabled={busy}
          aria-label={busy ? "Sincronizando com a Belvo" : "Sincronizar com a Belvo"}
          className="fixed right-5 bottom-5 z-50 size-12 rounded-full shadow-lg aria-disabled:opacity-90"
          onClick={() => {
            if (!busy) startSync.mutate();
          }}
        >
          <RefreshCwIcon className={cn("size-5", busy && "animate-spin")} />
          {attention && !busy && (
            <span className="bg-warning ring-background absolute top-0.5 right-0.5 size-3 rounded-full ring-2" />
          )}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="end" className="w-80 text-xs">
        <p className="mb-2 text-sm font-medium">Sincronização com a Belvo</p>

        <table className="w-full tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-1 text-left font-normal">Banco</th>
              <th className="pb-1 text-right font-normal">Este mês</th>
              <th className="pb-1 text-right font-normal">Última</th>
            </tr>
          </thead>
          <tbody>
            {s.banks.map((b) => (
              <tr key={b.connectionId}>
                <td className="py-0.5 font-medium">{b.institution}</td>
                <td className="py-0.5 text-right">{b.thisMonth}</td>
                <td
                  className={cn("py-0.5 text-right", b.stale && "text-warning")}
                  title={
                    b.lastSyncedAt
                      ? new Date(b.lastSyncedAt).toLocaleString("pt-BR")
                      : undefined
                  }
                >
                  {ago(b.lastSyncedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2 space-y-1.5">
          {s.banks
            .filter((b) => b.blockedUntil)
            .map((b) => (
              <p key={b.connectionId} className="text-warning flex gap-1.5">
                <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                {b.institution}: limite atingido, libera em{" "}
                {dateTime(b.blockedUntil!)}
              </p>
            ))}
          {state.running && (
            <p className="text-primary flex gap-1.5">
              <Loader2Icon className="mt-px size-3.5 shrink-0 animate-spin" />
              {state.trigger === "auto" ? "Atualização diária" : "Atualizando"}
              {state.current ? `: ${state.current}` : ""}… pode levar alguns
              minutos
            </p>
          )}
          {s.justFinished && (
            <p className="text-positive flex gap-1.5">
              <CheckCircle2Icon className="mt-px size-3.5 shrink-0" />
              Atualizado {s.finishedAgo}
            </p>
          )}
          {s.problems.map((r) => (
            <p key={r.institution} className="text-warning flex gap-1.5">
              <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
              {r.institution}: {resultText(r)}
            </p>
          ))}
          {error && <p className="text-negative">{error}</p>}
        </div>

        <p className="text-muted-foreground mt-3 border-t pt-2">
          {busy ? "Aguarde terminar." : "Clique no botão para atualizar."} A
          Belvo não informa quantas atualizações restam: a contagem é feita pelo
          app
          {s.countingSince ? ` desde ${s.countingSince}` : ""} e o limite só
          aparece quando é atingido.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

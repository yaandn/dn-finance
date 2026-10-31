"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2Icon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { errorMessage, http } from "@/lib/api/http";
import {
  queryKeys,
  useAddPluggyItem,
  usePluggyItems,
  useRemovePluggyItem,
  useStartPluggySync,
} from "@/lib/api/queries";
import type { PluggyConnection } from "@/lib/pluggy/data";
import { cn } from "@/lib/utils";

/** Status em que a conexão só volta se a pessoa entrar de novo no banco. */
const NEEDS_RECONNECT = ["LOGIN_ERROR", "OUTDATED", "WAITING_USER_ACTION", "WAITING_USER_INPUT"];

type Tone = "ok" | "busy" | "warn" | "error";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  UPDATED: { label: "Atualizado", tone: "ok" },
  UPDATING: { label: "Atualizando", tone: "busy" },
  MERGING: { label: "Processando", tone: "busy" },
  LOGIN_ERROR: { label: "Reconectar", tone: "warn" },
  OUTDATED: { label: "Desatualizado", tone: "warn" },
  WAITING_USER_ACTION: { label: "Aguardando você", tone: "warn" },
  WAITING_USER_INPUT: { label: "Aguardando você", tone: "warn" },
  ERROR: { label: "Erro", tone: "error" },
};
const statusOf = (s: string) => STATUS[s] ?? { label: s.toLowerCase(), tone: "warn" as Tone };

const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-positive/10 text-positive",
  busy: "bg-primary/10 text-primary",
  warn: "bg-warning/15 text-warning",
  error: "bg-negative/10 text-negative",
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

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Abre o Pluggy Connect. Sem `itemId` cria uma conexão nova; com ele, refaz
 * a de um banco (consentimento expirado, senha trocada).
 */
function useOpenConnect(itemId?: string) {
  const addItem = useAddPluggyItem();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setOpening(true);
    setError(null);
    try {
      const { accessToken, connectorIds } = (
        await http.post<{ accessToken: string; connectorIds?: number[] }>("/pluggy/connect-token", null, {
          params: itemId ? { item: itemId } : undefined,
        })
      ).data;
      // O SDK mexe em window ao carregar: só importa no clique
      const { PluggyConnect } = await import("pluggy-connect-sdk");
      const connect = new PluggyConnect({
        connectToken: accessToken,
        updateItem: itemId,
        connectorIds,
        // Com um conector só, pula a lista e vai direto para ele
        selectedConnectorId: connectorIds?.length === 1 ? connectorIds[0] : undefined,
        countries: ["BR"],
        language: "pt",
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        onSuccess: ({ item }) => {
          if (itemId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.pluggyItems });
            void queryClient.invalidateQueries({ queryKey: queryKeys.snapshots });
          } else {
            addItem.mutate(item.id, {
              onError: (err) => setError(errorMessage(err, "Não foi possível salvar a conexão.")),
            });
          }
        },
        onError: ({ message }) => setError(message),
      });
      await connect.init();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível abrir a Pluggy."));
    } finally {
      setOpening(false);
    }
  }

  return { open, busy: opening || addItem.isPending, error };
}

export function PluggyConnectCard() {
  const { open, busy, error } = useOpenConnect();
  return (
    <div className="bg-accent/60 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Veja suas contas reais</p>
        <p className="text-muted-foreground text-sm">
          Primeiro conecte seus bancos em meu.pluggy.ai (gratuito). Depois clique aqui e autorize
          o MeuPluggy uma vez para cada banco que você conectou lá.
        </p>
        {error && <p className="text-negative mt-1 text-sm">{error}</p>}
      </div>
      <Button onClick={() => void open()} disabled={busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : <LinkIcon />} Conectar banco
      </Button>
    </div>
  );
}

function ConnectionRow({ c }: { c: PluggyConnection }) {
  const reconnect = useOpenConnect(c.connectionId);
  const remove = useRemovePluggyItem();
  const [confirming, setConfirming] = useState(false);
  const status = statusOf(c.status);
  const needsReconnect = NEEDS_RECONNECT.includes(c.status);

  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="bg-muted text-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold">
          {c.institution.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{c.institution}</p>
          <p
            className="text-muted-foreground text-xs"
            title={c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString("pt-BR") : undefined}
          >
            Dados de {ago(c.lastSyncedAt)}
            {c.nextSyncAt ? ` · próxima ${dateTime(c.nextSyncAt)}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            TONE_CLASS[status.tone],
          )}
        >
          {status.tone === "busy" ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : status.tone === "ok" ? (
            <CheckCircle2Icon className="size-3" />
          ) : (
            <TriangleAlertIcon className="size-3" />
          )}
          {status.label}
        </span>
        {!confirming && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-negative size-7"
            aria-label={`Desconectar ${c.institution}`}
            title="Desconectar"
            onClick={() => setConfirming(true)}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        )}
      </div>

      {(needsReconnect || c.error) && !confirming && (
        <div className="bg-warning/10 ml-12 flex flex-wrap items-center gap-2 rounded-md px-2.5 py-1.5 text-xs">
          <span className="text-foreground/80">{c.error ?? "O banco pediu para entrar de novo."}</span>
          {needsReconnect && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-6 px-2 text-xs"
              disabled={reconnect.busy}
              onClick={() => void reconnect.open()}
            >
              <RotateCcwIcon className="size-3" /> Reconectar
            </Button>
          )}
        </div>
      )}

      {confirming && (
        <div className="bg-negative/5 ml-12 flex flex-wrap items-center gap-2 rounded-md px-2.5 py-1.5 text-xs">
          <span>Desconectar {c.institution}? Os dados dele saem do app.</span>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-xs"
              disabled={remove.isPending}
              onClick={() => remove.mutate(c.connectionId)}
            >
              {remove.isPending ? "Removendo…" : "Desconectar"}
            </Button>
          </div>
        </div>
      )}

      {(reconnect.error || remove.error) && (
        <p className="text-negative ml-12 text-xs">
          {reconnect.error ?? errorMessage(remove.error, "Não foi possível desconectar.")}
        </p>
      )}
    </li>
  );
}

/**
 * Botão flutuante das conexões da Pluggy. Abre um painel com cada banco (status
 * e quando os dados foram atualizados), atualizar agora e adicionar banco.
 */
export function PluggySyncControl() {
  const queryClient = useQueryClient();
  const { data: connections } = usePluggyItems();
  const startSync = useStartPluggySync();
  const add = useOpenConnect();
  const wasUpdating = useRef(false);

  const updating = connections?.some((c) => statusOf(c.status).tone === "busy") ?? false;

  // Ao terminar, busca de novo os dados de todas as páginas
  useEffect(() => {
    if (updating) wasUpdating.current = true;
    else if (wasUpdating.current) {
      wasUpdating.current = false;
      void queryClient.invalidateQueries({ queryKey: queryKeys.snapshots });
    }
  }, [updating, queryClient]);

  if (!connections) return null;
  const busy = updating || startSync.isPending;
  const attention = connections.some((c) => ["warn", "error"].includes(statusOf(c.status).tone));
  const syncErrors = startSync.data?.errors ?? [];
  // Só o MeuPluggy (sem atualização manual): o botão apenas recarrega o que já chegou
  const canRefresh = connections.some((c) => c.canRefresh);
  const latest = connections
    .map((c) => c.lastSyncedAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const next = connections
    .map((c) => c.nextSyncAt)
    .filter((d): d is string => !!d)
    .sort()[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          aria-label="Bancos conectados e atualização"
          className="fixed right-5 bottom-5 z-50 size-12 rounded-full shadow-lg"
        >
          <RefreshCwIcon className={cn("size-5", busy && "animate-spin")} />
          <span
            className={cn(
              "ring-background absolute top-0.5 right-0.5 size-3 rounded-full ring-2",
              busy ? "bg-primary-foreground" : attention ? "bg-warning" : "bg-positive",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={10} className="w-[22rem] p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Bancos conectados</p>
          <p className="text-muted-foreground text-xs">
            {busy
              ? canRefresh
                ? "Buscando dados novos nos bancos… pode levar alguns minutos."
                : "Recarregando…"
              : canRefresh
                ? `Última atualização ${ago(latest ?? null)}${next ? ` · a próxima automática é em ${dateTime(next)}` : ""}`
                : "Pelo Meu Pluggy, cada banco atualiza sozinho uma vez por dia, no horário indicado. Gastos de hoje aparecem depois dele."}
          </p>
        </div>

        <ul className="max-h-80 divide-y overflow-y-auto px-4 py-3">
          {connections.map((c) => (
            <ConnectionRow key={c.connectionId} c={c} />
          ))}
        </ul>

        {(syncErrors.length > 0 || startSync.error || add.error) && (
          <div className="space-y-1 border-t px-4 py-2 text-xs">
            {syncErrors.map((e) => (
              <p key={e} className="text-warning flex gap-1.5">
                <TriangleAlertIcon className="mt-px size-3.5 shrink-0" /> {e}
              </p>
            ))}
            {startSync.error && (
              <p className="text-negative">{errorMessage(startSync.error, "Não foi possível atualizar.")}</p>
            )}
            {add.error && <p className="text-negative">{add.error}</p>}
          </div>
        )}

        <div className="flex gap-2 border-t p-3">
          <Button
            className="flex-1"
            size="sm"
            disabled={busy}
            onClick={() =>
              startSync.mutate(undefined, {
                // O servidor já limpou o cache: as páginas buscam de novo o que chegou
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.snapshots }),
              })
            }
          >
            <RefreshCwIcon className={cn(busy && "animate-spin")} />
            {busy
              ? canRefresh
                ? "Atualizando…"
                : "Recarregando…"
              : canRefresh
                ? "Atualizar agora"
                : "Recarregar dados"}
          </Button>
          <Button variant="outline" size="sm" disabled={add.busy} onClick={() => void add.open()}>
            {add.busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Adicionar banco
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

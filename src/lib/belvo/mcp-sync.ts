import "server-only";

import { detachUser, type CurrentUser } from "@/lib/auth";
import {
  callJson,
  clearMcpCache,
  toConnectionSync,
  withClient,
  type ConnectionSync,
} from "@/lib/belvo/mcp-client";
import { deleteDoc, readDoc, writeDoc } from "@/lib/user-documents";

// Atualização dos dados no Belvo Panorama (refresh_connection).
// A Belvo vai até o banco buscar dados novos; pode levar alguns minutos por banco,
// então roda em segundo plano e a tela acompanha o andamento.

export type RefreshResult = {
  institution: string;
  status:
    | "completed"
    | "failed"
    | "unavailable"
    | "skipped"
    | "mfa_required"
    | "error";
  message: string | null;
  refreshedAt: string | null;
  retryAfter: string | null;
};

export type SyncState = {
  running: boolean;
  trigger: "manual" | "auto" | null;
  startedAt: string | null;
  finishedAt: string | null;
  current: string | null;
  results: RefreshResult[];
  lastAutoAt: string | null;
};

const REFRESH_TIMEOUT_MS = 10 * 60 * 1000;
/** Atualização automática quando o dado mais antigo passa disso. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Intervalo mínimo entre atualizações automáticas (respeita os limites do Open Finance). */
const AUTO_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

const EMPTY: SyncState = {
  running: false,
  trigger: null,
  startedAt: null,
  finishedAt: null,
  current: null,
  results: [],
  lastAutoAt: null,
};

// Estado em memória por usuário (sobrevive ao recarregamento de módulos em dev);
// o banco guarda a última execução para quando o servidor reinicia.
const g = globalThis as unknown as {
  __belvoSyncByUser?: Map<string, SyncState>;
};
const states = (g.__belvoSyncByUser ??= new Map());

async function load(user: CurrentUser): Promise<SyncState> {
  let state = states.get(user.id);
  if (!state) {
    const saved = await readDoc<SyncState>(user, "sync").catch(() => null);
    // Se o servidor reiniciou no meio de uma atualização, ela não está mais rodando
    state = { ...EMPTY, ...saved, running: false, current: null };
    states.set(user.id, state);
  }
  return state;
}

async function save(user: CurrentUser, state: SyncState) {
  states.set(user.id, state);
  await writeDoc(user, "sync", state).catch(() => {});
}

export async function getSyncState(user: CurrentUser): Promise<SyncState> {
  return { ...(await load(user)) };
}

function parseResult(
  institution: string,
  res: Record<string, unknown>,
): RefreshResult {
  const status = String(res.status ?? "error") as RefreshResult["status"];
  return {
    institution,
    status: [
      "completed",
      "failed",
      "unavailable",
      "skipped",
      "mfa_required",
    ].includes(status)
      ? status
      : "error",
    message: (res.reason as string) ?? (res.message as string) ?? null,
    refreshedAt: (res.refreshed_at as string) ?? null,
    retryAfter: (res.retry_after as string) ?? null,
  };
}

async function run(user: CurrentUser, trigger: "manual" | "auto") {
  let state = await load(user);
  const startedAt = new Date().toISOString();
  state = {
    ...state,
    running: true,
    trigger,
    startedAt,
    finishedAt: null,
    current: null,
    results: [],
    lastAutoAt: trigger === "auto" ? startedAt : state.lastAutoAt,
  };
  await save(user, state);

  const results: RefreshResult[] = [];
  try {
    await withClient(user, async (client) => {
      const list = await callJson(client, "list_connections", {});
      const valid: ConnectionSync[] = (list.items ?? [])
        .map(toConnectionSync)
        .filter((c: ConnectionSync) => c.status === "valid");

      // Um banco por vez
      for (const conn of valid) {
        await save(user, {
          ...states.get(user.id)!,
          current: conn.institution,
          results: [...results],
        });
        try {
          const res = await callJson(
            client,
            "refresh_connection",
            { connection_id: conn.connectionId },
            REFRESH_TIMEOUT_MS,
          );
          results.push(parseResult(conn.institution, res));
        } catch (err) {
          results.push({
            institution: conn.institution,
            status: "error",
            message: err instanceof Error ? err.message : String(err),
            refreshedAt: null,
            retryAfter: null,
          });
        }
      }
    });
  } catch (err) {
    results.push({
      institution: "Belvo Panorama",
      status: "error",
      message: err instanceof Error ? err.message : String(err),
      refreshedAt: null,
      retryAfter: null,
    });
  } finally {
    clearMcpCache(user.id);
    // Dados novos da Belvo: as parcelas antigas são buscadas de novo
    await deleteDoc(user, "card_history").catch(() => {});
    await save(user, {
      ...states.get(user.id)!,
      running: false,
      current: null,
      finishedAt: new Date().toISOString(),
      results,
    });
  }
}

/** Inicia uma atualização em segundo plano (não espera terminar). */
export async function startRefresh(
  user: CurrentUser,
  trigger: "manual" | "auto",
): Promise<SyncState> {
  const state = await load(user);
  if (!state.running) {
    const background = await detachUser(user);
    void run(background, trigger).catch(() => {});
    // dá tempo de o estado "running" ser gravado antes de responder
    await new Promise((r) => setTimeout(r, 50));
  }
  return getSyncState(user);
}

/** Dispara a atualização diária se os dados estiverem velhos. */
export async function maybeAutoRefresh(
  user: CurrentUser,
  connections: ConnectionSync[],
) {
  const state = await load(user);
  if (state.running) return;
  const synced = connections
    .filter((c) => c.status === "valid" && c.lastSyncedAt)
    .map((c) => Date.parse(c.lastSyncedAt!));
  if (!synced.length) return;
  const oldest = Math.min(...synced);
  const lastAuto = state.lastAutoAt ? Date.parse(state.lastAutoAt) : 0;
  if (
    Date.now() - oldest > STALE_AFTER_MS &&
    Date.now() - lastAuto > AUTO_MIN_INTERVAL_MS
  ) {
    await startRefresh(user, "auto");
  }
}

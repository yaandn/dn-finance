import "server-only";

import type { CurrentUser } from "@/lib/auth";
import {
  PluggyError,
  categoriesById,
  deleteItem,
  getItem,
  listAccounts,
  listBills,
  listTransactions,
  pluggyConfigured,
  type Raw,
} from "@/lib/pluggy/client";
import { bankNameFromAccounts } from "@/lib/pluggy/normalize";
import { readDoc, writeDoc } from "@/lib/user-documents";

// Conexões da Pluggy de cada usuário e leitura dos dados delas. Listar os
// itens pela API só existe nos planos pagos, então os ids ficam salvos aqui
// (user_documents, tipo "pluggy") quando o Pluggy Connect termina.

type PluggyDoc = {
  items: {
    id: string;
    addedAt: string;
    /** Nome do banco descoberto pelas contas (itens do MeuPluggy). */
    institution?: string;
  }[];
};

/** Conector MeuPluggy: todos os bancos chegam com o nome dele. */
const MEU_PLUGGY = 200;

/** Nome do banco do item: no MeuPluggy, vem das contas; nos outros, do conector. */
async function institutionOf(item: Raw): Promise<string> {
  const connector: string = item.connector?.name ?? "Banco";
  if (item.connector?.id !== MEU_PLUGGY) return connector;
  return bankNameFromAccounts(await listAccounts(item.id).catch(() => [])) ?? connector;
}

export type PluggyConnection = {
  connectionId: string;
  institution: string;
  /** Status do item na Pluggy: UPDATED, UPDATING, LOGIN_ERROR, OUTDATED… */
  status: string;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  error: string | null;
  /**
   * Aceita pedir dados novos ao banco agora (PATCH). Itens do MeuPluggy não
   * aceitam ("MeuPluggy item can't be updated"): só a atualização diária dele.
   */
  canRefresh: boolean;
};

export type PluggyRaw = {
  /** Contas cruas com o nome do banco em `institution`. */
  accounts: Raw[];
  transactions: Raw[];
  bills: Raw[];
  categories: Map<string, Raw>;
  connections: PluggyConnection[];
  warnings: string[];
};

async function readItems(user: CurrentUser) {
  return (await readDoc<PluggyDoc>(user, "pluggy").catch(() => null))?.items ?? [];
}

export async function hasPluggyItems(user: CurrentUser) {
  return pluggyConfigured() && (await readItems(user)).length > 0;
}

/** Salva um item criado pelo Pluggy Connect, se ele for mesmo deste usuário. */
export async function addItem(user: CurrentUser, itemId: string) {
  const item = await getItem(itemId);
  if (item.clientUserId !== user.id) {
    throw new PluggyError("Esta conexão não pertence ao seu usuário.", 403);
  }
  const items = await readItems(user);
  if (!items.some((i) => i.id === itemId)) {
    items.push({
      id: itemId,
      addedAt: new Date().toISOString(),
      institution: await institutionOf(item),
    });
    await writeDoc(user, "pluggy", { items } satisfies PluggyDoc);
  }
  clearPluggyCache(user.id);
}

/** Remove a conexão do app e apaga o item na Pluggy (revoga o acesso). */
export async function removeItem(user: CurrentUser, itemId: string) {
  const items = await readItems(user);
  if (!items.some((i) => i.id === itemId)) return;
  await deleteItem(itemId).catch((err) => {
    // Já apagado do lado da Pluggy: só falta tirar daqui
    if (!(err instanceof PluggyError && err.status === 404)) throw err;
  });
  await writeDoc(user, "pluggy", {
    items: items.filter((i) => i.id !== itemId),
  } satisfies PluggyDoc);
  clearPluggyCache(user.id);
}

export function toConnection(item: Raw): PluggyConnection {
  return {
    connectionId: item.id,
    institution: item.connector?.name ?? "Banco",
    status: item.status ?? "UNKNOWN",
    lastSyncedAt: item.lastUpdatedAt ?? null,
    nextSyncAt: item.nextAutoSyncAt ?? null,
    error: item.error?.message ?? null,
    canRefresh: item.connector?.id !== MEU_PLUGGY,
  };
}

export async function getConnections(user: CurrentUser): Promise<PluggyConnection[]> {
  const items = await readItems(user);
  let discovered = false;
  const connections = await Promise.all(
    items.map(async (saved) => {
      try {
        const item = await getItem(saved.id);
        // Itens salvos antes de o nome ser guardado (ou guardados com o nome do
        // conector, quando ainda não dava para descobrir o banco): descobre e salva
        if (!saved.institution || saved.institution === item.connector?.name) {
          saved.institution = await institutionOf(item);
          discovered = true;
        }
        return { ...toConnection(item), institution: saved.institution };
      } catch (err) {
        return {
          connectionId: saved.id,
          institution: saved.institution ?? "Banco",
          status: "ERROR",
          lastSyncedAt: null,
          nextSyncAt: null,
          error: err instanceof Error ? err.message : String(err),
          canRefresh: false,
        };
      }
    }),
  );
  if (discovered) await writeDoc(user, "pluggy", { items } satisfies PluggyDoc).catch(() => {});
  return connections;
}

/** A Pluggy é rápida; o cache só evita repetir a busca entre páginas. */
const CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { at: number; from: string; to: string; data: PluggyRaw };
/** Chave: usuário + período. Nunca compartilhar entradas entre usuários. */
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PluggyRaw>>();

export function clearPluggyCache(userId: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

/** Entrada válida do usuário cujo período cobre [from, to] (quem usa recorta por data). */
function cachedCovering(userId: string, from: string, to: string) {
  for (const [key, entry] of cache) {
    if (!key.startsWith(`${userId}:`)) continue;
    if (Date.now() - entry.at >= CACHE_TTL_MS) cache.delete(key);
    else if (entry.from <= from && entry.to >= to) return entry.data;
  }
  return null;
}

export async function fetchFromPluggy(
  user: CurrentUser,
  from: string,
  to: string,
  /** Só cartões de crédito (parcelas antigas). */
  onlyCards = false,
): Promise<PluggyRaw> {
  const key = `${user.id}:${from}:${to}:${onlyCards ? "cards" : "all"}`;
  if (!onlyCards) {
    const hit = cachedCovering(user.id, from, to);
    if (hit) return hit;
  }
  const running = inflight.get(key);
  if (running) return running;
  const promise = load(user, from, to, onlyCards).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

async function load(
  user: CurrentUser,
  from: string,
  to: string,
  onlyCards: boolean,
): Promise<PluggyRaw> {
  const warnings: string[] = [];
  const [connections, categories] = await Promise.all([
    getConnections(user),
    categoriesById(),
  ]);

  const perItem = await Promise.all(
    connections.map(async (conn) => {
      if (conn.status === "ERROR") {
        warnings.push(`${conn.institution}: ${conn.error}`);
        return null;
      }
      if (conn.status === "LOGIN_ERROR" || conn.status === "OUTDATED") {
        warnings.push(
          `${conn.institution}: a conexão precisa ser refeita (${conn.error ?? conn.status}).`,
        );
      }
      try {
        const accounts = (await listAccounts(conn.connectionId))
          .filter((a) => !onlyCards || a.type === "CREDIT")
          .map((a): Raw => ({ ...a, institution: conn.institution }));
        // Contas em paralelo: cada uma é uma ou poucas páginas
        const perAccount = await Promise.all(
          accounts.map(async (a) => {
            const [transactions, bills] = await Promise.all([
              listTransactions(a.id, from, to),
              a.type === "CREDIT"
                ? listBills(a.id)
                    .then((bills) => bills.map((b): Raw => ({ ...b, accountId: a.id })))
                    .catch(() => [])
                : [],
            ]);
            return { transactions, bills };
          }),
        );
        return {
          accounts,
          transactions: perAccount.flatMap((p) => p.transactions),
          bills: perAccount.flatMap((p) => p.bills),
        };
      } catch (err) {
        warnings.push(
          `${conn.institution}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    }),
  );

  const data: PluggyRaw = {
    accounts: perItem.flatMap((p) => p?.accounts ?? []),
    transactions: perItem.flatMap((p) => p?.transactions ?? []),
    bills: perItem.flatMap((p) => p?.bills ?? []),
    categories,
    connections,
    warnings,
  };
  // Com falha parcial não guarda: a próxima visita tenta de novo
  if (!onlyCards && !warnings.length) {
    cache.set(`${user.id}:${from}:${to}:all`, { at: Date.now(), from, to, data });
  }
  return data;
}

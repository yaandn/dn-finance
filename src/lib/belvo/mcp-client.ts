import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { CurrentUser } from "@/lib/auth";
import { BELVO_MCP_URL, providerFor } from "@/lib/belvo/mcp-auth";

// Busca os dados de Open Finance pelas mesmas ferramentas MCP que o Claude usa
// (list_connections, open_finance_list_accounts, open_finance_list_transactions).

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

export class McpAuthError extends Error {}

export type ConnectionSync = {
  connectionId: string;
  institution: string;
  status: string;
  lastSyncedAt: string | null;
};

type CardHistory = { accounts: Raw[]; transactions: Raw[] };

type McpData = {
  accounts: Raw[];
  transactions: Raw[];
  institutions: string[];
  connections: ConnectionSync[];
};
type CacheEntry = { at: number; from: string; to: string; data: McpData };
const CACHE_TTL_MS = 10 * 60 * 1000;
/** Chave: usuário + período. Nunca compartilhar entradas entre usuários. */
const cache = new Map<string, CacheEntry>();

/** Entrada válida do usuário cujo período cobre [from, to] (quem usa recorta por data). */
function cachedCovering(userId: string, from: string, to: string) {
  for (const [key, entry] of cache) {
    if (!key.startsWith(`${userId}:`)) continue;
    if (Date.now() - entry.at >= CACHE_TTL_MS) cache.delete(key);
    else if (entry.from <= from && entry.to >= to) return entry.data;
  }
  return null;
}

/** Parcelas de compras antigas: as compras não mudam, então o cache dura mais. */
const HISTORY_TTL_MS = 12 * 60 * 60 * 1000;
const historyCache = new Map<string, { at: number; data: CardHistory }>();

/** Caches derivados dos dados da Belvo (ex.: recorrentes) que somem junto. */
const clearListeners: ((userId: string) => void)[] = [];
export function onMcpCacheClear(listener: (userId: string) => void) {
  clearListeners.push(listener);
}

export function clearMcpCache(userId: string) {
  for (const map of [cache, historyCache]) {
    for (const key of map.keys()) {
      if (key.startsWith(`${userId}:`)) map.delete(key);
    }
  }
  for (const listener of clearListeners) listener(userId);
}

/** Limite de requisições da Belvo (Cloudflare 1015 ou HTTP 429). */
const RATE_LIMITED = /\b(1015|429)\b|rate.?limit|too many requests/i;
/** A Belvo pede no mínimo 30 s antes de tentar de novo. */
const MIN_RATE_LIMIT_WAIT_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Quando a Belvo limita as requisições, espera o retry_after (mínimo 30 s) e
 * tenta uma única vez mais. Insistir só prolonga o bloqueio.
 */
async function retryOnRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!RATE_LIMITED.test(msg)) throw err;
    const retryAfter = Number(msg.match(/"retry_after"\s*:\s*(\d+)/)?.[1] ?? 0) * 1000;
    await sleep(Math.max(retryAfter, MIN_RATE_LIMIT_WAIT_MS));
    return fn();
  }
}

/** Mensagem para a tela: o erro da Cloudflare vem como um JSON enorme. */
export function friendlyMcpError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return RATE_LIMITED.test(msg)
    ? "A Belvo limitou as requisições por alguns minutos. Tente de novo daqui a pouco."
    : msg;
}

export async function withClient<T>(
  user: CurrentUser,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const provider = await providerFor(user);
  const connect = async () => {
    const transport = new StreamableHTTPClientTransport(new URL(BELVO_MCP_URL), {
      authProvider: provider,
    });
    const client = new Client({ name: "dn-finance", version: "0.1.0" });
    await client.connect(transport);
    return client;
  };
  let client: Client;
  try {
    // O limite de requisições também barra a conexão, não só as chamadas
    client = await retryOnRateLimit(connect);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (RATE_LIMITED.test(msg)) throw new Error(friendlyMcpError(err));
    if (
      /unauthori[sz]ed|\b401\b|invalid_grant|invalid_token/i.test(msg) ||
      provider.authorizationUrl
    ) {
      throw new McpAuthError(
        "Sessão do Belvo Panorama expirou. Conecte de novo.",
      );
    }
    throw err;
  }
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/** Chama uma ferramenta e devolve o JSON do resultado. */
export async function callJson(
  client: Client,
  name: string,
  args: Raw,
  /** Tempo máximo da chamada em ms (o padrão do SDK é 60 s). */
  timeout?: number,
): Promise<Raw> {
  const result = await retryOnRateLimit(() =>
    client.callTool(
      { name, arguments: args },
      undefined,
      timeout
        ? { timeout, maxTotalTimeout: timeout, resetTimeoutOnProgress: true }
        : undefined,
    ),
  );
  const text = (result.content as { type: string; text?: string }[] | undefined)
    ?.filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  if (result.isError) throw new Error(text || `Ferramenta ${name} falhou`);
  if (result.structuredContent) return result.structuredContent as Raw;
  try {
    return JSON.parse(text ?? "{}");
  } catch {
    throw new Error(`Resposta inesperada de ${name}: ${text?.slice(0, 200)}`);
  }
}

/**
 * Percorre todas as páginas de uma ferramenta paginada por cursor.
 * Se o servidor disser que a página ficou grande demais, reduz o page_size
 * para o valor sugerido e recomeça (o cursor é o número da página, então não
 * dá para continuar com outro tamanho).
 *
 * Vai até o fim do cursor. Antes havia um limite de 40 páginas: com o page_size
 * reduzido para ~17, um ano (1.600 lançamentos) vinha cortado em ~670, e como a
 * Belvo ordena pelo id da transação, sumiam lançamentos de todos os meses.
 */
const MAX_PAGES = 500;
/**
 * Último page_size aceito por ferramenta. Lançamentos costumam passar do
 * limite de tamanho com 50 por página; lembrar evita repetir a tentativa
 * que falha (cada chamada conta para o limite de requisições da Belvo).
 */
const acceptedPageSize = new Map<string, number>();

async function listAll(
  client: Client,
  name: string,
  args: Raw,
  /** Máximo aceito pelo servidor: menos idas e voltas por listagem. */
  pageSize = 50,
) {
  let size = Math.min(pageSize, acceptedPageSize.get(name) ?? pageSize);
  for (let attempt = 0; attempt < 4; attempt++) {
    const items: Raw[] = [];
    let cursor: string | null | undefined;
    try {
      for (let page = 0; ; page++) {
        // Trava contra um cursor que nunca acaba: melhor falhar que cortar dados
        if (page >= MAX_PAGES) {
          throw new Error(`${name} passou de ${MAX_PAGES} páginas; a listagem ficaria incompleta.`);
        }
        const res = await callJson(client, name, {
          ...args,
          page_size: size,
          ...(cursor ? { cursor } : {}),
        });
        items.push(...(res.items ?? []));
        cursor = res.next_cursor;
        if (!cursor) {
          // Só guarda reduções: uma listagem pequena não prova que 50 cabe
          if (size < pageSize) acceptedPageSize.set(name, size);
          return items;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const suggested = msg.match(/page_size=(\d+)/);
      if (!/too large/i.test(msg)) throw err;
      size = suggested
        ? Number(suggested[1])
        : Math.max(5, Math.floor(size / 2));
    }
  }
  throw new Error(`Não foi possível paginar ${name}.`);
}

/** Contas das conexões válidas, com o nome da instituição vindo da conexão. */
function withInstitution(accounts: Raw[], byConnection: Map<string, Raw>) {
  const valid = accounts.filter((a) => byConnection.has(a.connection_id ?? a.link));
  for (const a of valid) {
    const conn = byConnection.get(a.connection_id ?? a.link);
    a.institution = {
      ...(a.institution ?? {}),
      display_name:
        conn?.institution?.display_name ?? a.institution?.display_name,
    };
  }
  return valid;
}

async function validConnections(client: Client) {
  const connections = await callJson(client, "list_connections", {});
  const items: Raw[] = connections.items ?? [];
  const valid = items.filter((c) => c.status === "valid");
  return {
    items,
    valid,
    byConnection: new Map(valid.map((c) => [c.connection_id, c])),
  };
}

export function toConnectionSync(c: Raw): ConnectionSync {
  return {
    connectionId: c.connection_id,
    institution:
      c.institution?.display_name ?? c.institution?.name ?? "Instituição",
    status: c.status,
    lastSyncedAt: c.last_synced_at ?? null,
  };
}

export async function fetchFromMcp(
  user: CurrentUser,
  from: string,
  to: string,
): Promise<McpData> {
  const hit = cachedCovering(user.id, from, to);
  if (hit) return hit;
  // Mesma busca já em andamento (ex.: Painel e Recorrentes abertos juntos): reaproveita
  const key = `${user.id}:${from}:${to}`;
  const running = inflight.get(key);
  if (running) return running;
  const promise = loadFromMcp(user, from, to).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

const inflight = new Map<string, Promise<McpData>>();

async function loadFromMcp(
  user: CurrentUser,
  from: string,
  to: string,
): Promise<McpData> {
  const data = await withClient(user, async (client) => {
    const { items, valid, byConnection } = await validConnections(client);

    // Sem connection_id as ferramentas já trazem todas as instituições de uma vez
    // (cada item vem com connection_id). Uma chamada por vez: o servidor limita
    // requisições simultâneas.
    const accounts = withInstitution(
      await listAll(client, "open_finance_list_accounts", {}),
      byConnection,
    );
    const transactions = valid.length
      ? (
          await listAll(client, "open_finance_list_transactions", {
            start_date: from,
            end_date: to,
          })
        ).filter((t) => byConnection.has(t.connection_id))
      : [];

    return {
      accounts,
      transactions,
      institutions: valid.map(
        (c) => c.institution?.display_name ?? c.institution?.name,
      ),
      connections: items.map(toConnectionSync),
    };
  });

  cache.set(`${user.id}:${from}:${to}`, { at: Date.now(), from, to, data });
  return data;
}

/**
 * Parcelas de compras feitas entre `since` e `before` que ainda caem em faturas
 * a partir de `fromMonth` (YYYY-MM). A Belvo filtra pela data da compra e cada
 * parcela vem com essa data, então uma compra de dez meses atrás só aparece
 * buscando dez meses atrás.
 */
export async function fetchCardInstallmentsFromMcp(
  user: CurrentUser,
  since: string,
  before: string,
  fromMonth: string,
): Promise<CardHistory> {
  const key = `${user.id}:${since}:${before}`;
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < HISTORY_TTL_MS) return hit.data;

  const data = await withClient(user, async (client) => {
    const { byConnection } = await validConnections(client);
    const cards = withInstitution(
      await listAll(client, "open_finance_list_accounts", {
        category: "CREDIT_CARD",
      }),
      byConnection,
    );
    const transactions: Raw[] = [];
    // Um cartão por vez; um ano de lançamentos passa de mil itens
    for (const card of cards) {
      const items = await listAll(
        client,
        "open_finance_list_transactions",
        {
          account_id: card.account_id,
          type: "OUTFLOW",
          start_date: since,
          end_date: before,
        },
      );
      transactions.push(
        ...items.filter((t) => {
          const cc = t.credit_card_data;
          if (!(Number(cc?.number_of_installments) > 1)) return false;
          const month = String(
            cc?.bill_forecast_date ??
              t.accounting_date ??
              t.inferred_accounting_date ??
              "",
          ).slice(0, 7);
          return month >= fromMonth;
        }),
      );
    }
    return { accounts: cards, transactions };
  });

  historyCache.set(key, { at: Date.now(), data });
  return data;
}

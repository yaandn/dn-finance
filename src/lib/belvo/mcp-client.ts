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

type McpData = {
  accounts: Raw[];
  transactions: Raw[];
  institutions: string[];
  connections: ConnectionSync[];
};
type CacheEntry = { at: number; data: McpData };
const CACHE_TTL_MS = 10 * 60 * 1000;
/** Chave: usuário + período. Nunca compartilhar entradas entre usuários. */
const cache = new Map<string, CacheEntry>();

export function clearMcpCache(userId: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

export async function withClient<T>(
  user: CurrentUser,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const provider = await providerFor(user);
  const transport = new StreamableHTTPClientTransport(new URL(BELVO_MCP_URL), {
    authProvider: provider,
  });
  const client = new Client({ name: "dn-finance", version: "0.1.0" });
  try {
    await client.connect(transport);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /unauthori[sz]ed|401|invalid_grant|invalid_token/i.test(msg) ||
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
  const result = await client.callTool(
    { name, arguments: args },
    undefined,
    timeout
      ? { timeout, maxTotalTimeout: timeout, resetTimeoutOnProgress: true }
      : undefined,
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
 * para o valor sugerido e recomeça (sem duplicar itens).
 */
async function listAll(
  client: Client,
  name: string,
  args: Raw,
  pageSize = 20,
  maxPages = 40,
) {
  let size = pageSize;
  for (let attempt = 0; attempt < 4; attempt++) {
    const items: Raw[] = [];
    let cursor: string | null | undefined;
    try {
      for (let page = 0; page < maxPages; page++) {
        const res = await callJson(client, name, {
          ...args,
          page_size: size,
          ...(cursor ? { cursor } : {}),
        });
        items.push(...(res.items ?? []));
        cursor = res.next_cursor;
        if (!cursor) break;
      }
      return items;
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
  const key = `${user.id}:${from}:${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const data = await withClient(user, async (client) => {
    const connections = await callJson(client, "list_connections", {});
    const valid: Raw[] = (connections.items ?? []).filter(
      (c: Raw) => c.status === "valid",
    );

    const accounts: Raw[] = [];
    const transactions: Raw[] = [];
    // Uma instituição por vez: o servidor limita requisições simultâneas
    for (const conn of valid) {
      const accs = await listAll(client, "open_finance_list_accounts", {
        connection_id: conn.connection_id,
      });
      for (const a of accs) {
        a.institution = {
          ...(a.institution ?? {}),
          display_name:
            conn.institution?.display_name ?? a.institution?.display_name,
        };
      }
      accounts.push(...accs);
      transactions.push(
        ...(await listAll(client, "open_finance_list_transactions", {
          connection_id: conn.connection_id,
          start_date: from,
          end_date: to,
        })),
      );
    }

    return {
      accounts,
      transactions,
      institutions: valid.map(
        (c) => c.institution?.display_name ?? c.institution?.name,
      ),
      connections: (connections.items ?? []).map(toConnectionSync),
    };
  });

  cache.set(key, { at: Date.now(), data });
  return data;
}

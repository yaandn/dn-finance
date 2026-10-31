import "server-only";

// Cliente mínimo da API da Pluggy (https://docs.pluggy.ai).
// Roda apenas no servidor: client_id e client_secret nunca chegam ao navegador.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Raw = Record<string, any>;

const BASE_URL = process.env.PLUGGY_API_URL ?? "https://api.pluggy.ai";

export function pluggyConfigured() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

export class PluggyError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** A API key é um JWT com validade curta; renova um minuto antes de expirar. */
let apiKey: { value: string; expiresAt: number } | null = null;

function jwtExpiry(token: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {}
  return Date.now() + 60 * 60 * 1000;
}

async function getApiKey() {
  if (apiKey && Date.now() < apiKey.expiresAt - 60_000) return apiKey.value;
  if (!pluggyConfigured()) {
    throw new PluggyError("PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET não configurados.", 500);
  }
  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: process.env.PLUGGY_CLIENT_ID,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET,
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.apiKey) {
    throw new PluggyError(
      `Falha ao autenticar na Pluggy: ${body.message ?? res.statusText}`,
      res.status,
      body.code,
    );
  }
  apiKey = { value: body.apiKey, expiresAt: jwtExpiry(body.apiKey) };
  return apiKey.value;
}

type Query = Record<string, string | number | undefined>;

async function request<T = Raw>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  { query, body }: { query?: Query; body?: unknown } = {},
  retried = false,
): Promise<T> {
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      "X-API-KEY": await getApiKey(),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  // API key revogada ou expirada antes da hora: pega outra e tenta uma vez mais
  if (res.status === 401 && !retried) {
    apiKey = null;
    return request(method, path, { query, body }, true);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PluggyError(
      data.message ?? `Pluggy respondeu ${res.status} em ${path}`,
      res.status,
      data.code,
    );
  }
  return data as T;
}

export const getItem = (id: string) => request("GET", `items/${id}`);

/** Pede à Pluggy para buscar dados novos no banco (roda em segundo plano lá). */
export const updateItem = (id: string) => request("PATCH", `items/${id}`, { body: {} });

export const deleteItem = (id: string) => request("DELETE", `items/${id}`);

export async function listAccounts(itemId: string): Promise<Raw[]> {
  return (await request("GET", "accounts", { query: { itemId } })).results ?? [];
}

/** Faturas do cartão (vencimento e valor), ligadas aos lançamentos por billId. */
export async function listBills(accountId: string): Promise<Raw[]> {
  return (
    (await request("GET", "bills", { query: { accountId, pageSize: 500 } })).results ?? []
  );
}

/** Trava contra um cursor que nunca acaba: melhor falhar que cortar dados. */
const MAX_PAGES = 200;

/**
 * Lançamentos da conta entre `from` e `to` (YYYY-MM-DD), seguindo o cursor
 * de /v2/transactions até o fim. O /transactions paginado por número de
 * página deixa de existir em 2026-12-31.
 */
export async function listTransactions(
  accountId: string,
  from: string,
  to: string,
): Promise<Raw[]> {
  const items: Raw[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await request("GET", "v2/transactions", {
      query: { accountId, dateFrom: from, dateTo: to, after },
    });
    items.push(...(res.results ?? []));
    if (!res.next) return items;
    after = new URL(res.next, BASE_URL).searchParams.get("after") ?? undefined;
    if (!after) return items;
  }
  throw new Error(`Lançamentos da conta passaram de ${MAX_PAGES} páginas.`);
}

/** As categorias quase não mudam: uma busca por dia basta. */
const CATEGORIES_TTL_MS = 24 * 60 * 60 * 1000;
let categories: { at: number; byId: Map<string, Raw> } | null = null;

/** Categorias por id (com a categoria-mãe). Vazio se a Pluggy recusar. */
export async function categoriesById(): Promise<Map<string, Raw>> {
  if (categories && Date.now() - categories.at < CATEGORIES_TTL_MS) return categories.byId;
  try {
    const res = await request("GET", "categories");
    const byId = new Map<string, Raw>(
      (res.results ?? []).map((c: Raw) => [c.id, c]),
    );
    categories = { at: Date.now(), byId };
    return byId;
  } catch {
    return new Map();
  }
}

/**
 * Token de uso único para abrir o Pluggy Connect no navegador. O clientUserId
 * marca o item com o usuário do app, conferido quando o item é salvo.
 * Sem avoidDuplicates: no MeuPluggy todos os bancos usam o mesmo conector, e
 * o segundo banco seria tratado como repetição do primeiro.
 */
export async function createConnectToken(clientUserId: string, itemId?: string) {
  const res = await request("POST", "connect_token", {
    body: { itemId, options: { clientUserId } },
  });
  return res.accessToken as string;
}

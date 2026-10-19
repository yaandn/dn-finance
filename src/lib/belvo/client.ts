import "server-only";

// Cliente mínimo da API da Belvo (https://developers.belvo.com).
// Roda apenas no servidor: as credenciais nunca chegam ao navegador.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type BelvoEnv = "sandbox" | "production";

export function belvoConfig() {
  const secretId = process.env.BELVO_SECRET_ID;
  const secretPassword = process.env.BELVO_SECRET_PASSWORD;
  const env: BelvoEnv = process.env.BELVO_ENV === "production" ? "production" : "sandbox";
  const linkIds = (process.env.BELVO_LINK_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    configured: Boolean(secretId && secretPassword),
    secretId,
    secretPassword,
    env,
    baseUrl: env === "production" ? "https://api.belvo.com" : "https://sandbox.belvo.com",
    linkIds,
  };
}

export class BelvoError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string): Promise<T> {
  const cfg = belvoConfig();
  const auth = Buffer.from(`${cfg.secretId}:${cfg.secretPassword}`).toString("base64");
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    // Os dados da Belvo só mudam quando o link é atualizado; 5 minutos de cache basta.
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    let body: Raw | Raw[] = {};
    try {
      body = await res.json();
    } catch {
      /* corpo vazio */
    }
    const err = Array.isArray(body) ? body[0] : body;
    throw new BelvoError(
      err?.message ?? `Belvo respondeu ${res.status}`,
      res.status,
      err?.code,
      err?.request_id,
    );
  }
  return (await res.json()) as T;
}

/** Percorre todas as páginas de um endpoint paginado (até maxPages). */
async function listAll<T>(path: string, params: Record<string, string>, maxPages = 20) {
  const cfg = belvoConfig();
  const qs = new URLSearchParams({ page_size: "1000", ...params });
  let url: string | null = `${cfg.baseUrl}${path}?${qs.toString()}`;
  const out: T[] = [];
  let pages = 0;
  while (url && pages < maxPages) {
    const page: Paginated<T> = await request<Paginated<T>>(url);
    out.push(...page.results);
    url = page.next;
    pages++;
  }
  return out;
}

export async function listLinks(): Promise<Raw[]> {
  const cfg = belvoConfig();
  if (cfg.linkIds.length) {
    return cfg.linkIds.map((id) => ({ id, status: "valid", institution: null }));
  }
  const links = await listAll<Raw>("/api/links/", {});
  return links.filter((l) => l.status === "valid");
}

export function listAccounts(linkId: string) {
  return listAll<Raw>("/api/accounts/", { link: linkId });
}

export function listTransactions(linkId: string, from: string, to: string) {
  return listAll<Raw>("/api/transactions/", {
    link: linkId,
    value_date__gte: from,
    value_date__lte: to,
  });
}

export function listBills(linkId: string) {
  return listAll<Raw>("/api/bills/", { link: linkId });
}

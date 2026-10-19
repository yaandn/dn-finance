import "server-only";

import { randomBytes } from "node:crypto";

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import type { CurrentUser } from "@/lib/auth";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { deleteDoc, readDoc, writeDoc } from "@/lib/user-documents";

// Login no servidor MCP do Belvo Panorama, o mesmo que o Claude usa.
// Fluxo OAuth 2.1 padrão do MCP: o app se registra sozinho (registro
// dinâmico) e usa PKCE. Cada usuário tem a própria conexão, guardada
// criptografada em user_documents (tipo belvo_mcp).

export const BELVO_MCP_URL =
  process.env.BELVO_MCP_URL ?? "https://panorama-mcp.belvo.com/mcp";

type Store = {
  redirectUrl?: string;
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  tokensSavedAt?: string;
  codeVerifier?: string;
  state?: string;
};

async function readStore(user: CurrentUser): Promise<Store> {
  const doc = await readDoc<{ enc?: string }>(user, "belvo_mcp");
  if (!doc?.enc) return {};
  try {
    return decryptJson<Store>(doc.enc);
  } catch {
    // Chave trocada ou dado corrompido: trata como desconectado
    return {};
  }
}

async function writeStore(user: CurrentUser, patch: Partial<Store>) {
  const current = await readStore(user);
  await writeDoc(user, "belvo_mcp", { enc: encryptJson({ ...current, ...patch }) });
}

export async function hasMcpSession(user: CurrentUser) {
  const store = await readStore(user);
  return Boolean(store.tokens?.access_token || store.tokens?.refresh_token);
}

export async function clearMcpSession(user: CurrentUser) {
  await deleteDoc(user, "belvo_mcp");
}

export async function consumeState(user: CurrentUser, state: string | null) {
  const store = await readStore(user);
  const ok = Boolean(state && store.state && state === store.state);
  await writeStore(user, { state: undefined });
  return ok;
}

/**
 * Provedor OAuth do SDK do MCP. `redirectUrl` é a rota de callback do app
 * (ex.: http://localhost:3000/api/belvo-mcp/callback).
 */
export class UserOAuthProvider implements OAuthClientProvider {
  /** Preenchido quando o SDK pede para mandar o usuário ao login da Belvo. */
  authorizationUrl: URL | null = null;

  constructor(
    private readonly user: CurrentUser,
    private readonly callbackUrl: string,
  ) {}

  get redirectUrl() {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Minhas Finanças (dn-finance)",
      redirect_uris: [this.callbackUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "openid profile email offline_access",
    };
  }

  async state() {
    const state = randomBytes(16).toString("hex");
    await writeStore(this.user, { state });
    return state;
  }

  async clientInformation() {
    const store = await readStore(this.user);
    // Se o app passou a rodar em outro endereço, o registro antigo não serve mais
    if (store.redirectUrl && store.redirectUrl !== this.callbackUrl) return undefined;
    return store.clientInformation;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed) {
    await writeStore(this.user, { clientInformation, redirectUrl: this.callbackUrl });
  }

  async tokens() {
    return (await readStore(this.user)).tokens;
  }

  async saveTokens(tokens: OAuthTokens) {
    await writeStore(this.user, { tokens, tokensSavedAt: new Date().toISOString() });
  }

  redirectToAuthorization(authorizationUrl: URL) {
    this.authorizationUrl = authorizationUrl;
  }

  async saveCodeVerifier(codeVerifier: string) {
    await writeStore(this.user, { codeVerifier });
  }

  async codeVerifier() {
    const v = (await readStore(this.user)).codeVerifier;
    if (!v) throw new Error("Code verifier ausente. Inicie a conexão de novo.");
    return v;
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all") return clearMcpSession(this.user);
    if (scope === "client") return writeStore(this.user, { clientInformation: undefined, tokens: undefined });
    if (scope === "tokens") return writeStore(this.user, { tokens: undefined });
    if (scope === "verifier") return writeStore(this.user, { codeVerifier: undefined });
  }
}

/** Monta a URL de callback a partir da requisição (funciona em qualquer porta). */
export function callbackUrlFrom(requestUrl: string) {
  const base = process.env.APP_URL ?? new URL(requestUrl).origin;
  return new URL("/api/belvo-mcp/callback", base).toString();
}

/** Provedor para chamadas de dados: reaproveita o endereço usado no login. */
export async function providerFor(user: CurrentUser) {
  const store = await readStore(user);
  const fallback = new URL(
    "/api/belvo-mcp/callback",
    process.env.APP_URL ?? "http://localhost:3000",
  ).toString();
  return new UserOAuthProvider(user, store.redirectUrl ?? fallback);
}

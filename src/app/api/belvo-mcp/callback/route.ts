import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import {
  BELVO_MCP_URL,
  UserOAuthProvider,
  callbackUrlFrom,
  consumeState,
} from "@/lib/belvo/mcp-auth";
import { clearMcpCache } from "@/lib/belvo/mcp-client";

// A Belvo redireciona para cá com ?code=… depois que você autoriza o acesso.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/?erro_mcp=${encodeURIComponent(msg)}`, request.url));

  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const error = url.searchParams.get("error");
  if (error) {
    return fail(url.searchParams.get("error_description") ?? error);
  }

  const code = url.searchParams.get("code");
  if (!code) return fail("A Belvo não devolveu o código de autorização.");

  // O state fica na conexão do próprio usuário: um retorno iniciado por outra
  // pessoa não confere aqui.
  if (!(await consumeState(user, url.searchParams.get("state")))) {
    return fail("Parâmetro state inválido. Tente conectar de novo.");
  }

  const provider = new UserOAuthProvider(user, callbackUrlFrom(request.url));
  try {
    await auth(provider, { serverUrl: BELVO_MCP_URL, authorizationCode: code });
    clearMcpCache(user.id);
    return NextResponse.redirect(new URL("/?conectado=1", request.url));
  } catch (err) {
    return fail(err instanceof Error ? err.message.slice(0, 300) : String(err));
  }
}

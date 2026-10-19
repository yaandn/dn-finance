import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { BELVO_MCP_URL, UserOAuthProvider, callbackUrlFrom } from "@/lib/belvo/mcp-auth";

// Inicia o login no Belvo Panorama: descobre o servidor de autorização,
// registra o app (se ainda não registrado) e redireciona para a tela da Belvo.
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const provider = new UserOAuthProvider(user, callbackUrlFrom(request.url));
  try {
    const result = await auth(provider, { serverUrl: BELVO_MCP_URL });
    if (result === "REDIRECT" && provider.authorizationUrl) {
      return NextResponse.redirect(provider.authorizationUrl);
    }
    // Já havia token válido
    return NextResponse.redirect(new URL("/?conectado=1", request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL(`/?erro_mcp=${encodeURIComponent(message.slice(0, 300))}`, request.url),
    );
  }
}

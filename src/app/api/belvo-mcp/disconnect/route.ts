import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { clearMcpSession } from "@/lib/belvo/mcp-auth";
import { clearMcpCache } from "@/lib/belvo/mcp-client";

// Apaga a conexão salva deste usuário. Para revogar do lado da Belvo, use o Panorama.
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
  await clearMcpSession(user);
  clearMcpCache(user.id);
  return NextResponse.redirect(new URL("/", request.url), 303);
}

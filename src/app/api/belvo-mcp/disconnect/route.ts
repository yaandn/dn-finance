import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { clearMcpSession } from "@/lib/belvo/mcp-auth";
import { clearMcpCache } from "@/lib/belvo/mcp-client";

// Apaga a conexão salva deste usuário. Para revogar do lado da Belvo, use o Panorama.
export async function POST() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  await clearMcpSession(user);
  clearMcpCache(user.id);
  return NextResponse.json({ ok: true });
}

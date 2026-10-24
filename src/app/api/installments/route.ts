import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { McpAuthError } from "@/lib/belvo/mcp-client";
import { getCardInstallments } from "@/lib/finance/data";

/** A primeira busca das parcelas antigas pagina um ano de lançamentos na Belvo. */
export const maxDuration = 300;

// Parcelas de compras antigas que ainda caem nas faturas dos últimos 90 dias.
export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  try {
    return NextResponse.json(await getCardInstallments(user));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message },
      { status: err instanceof McpAuthError ? 409 : 502 },
    );
  }
}

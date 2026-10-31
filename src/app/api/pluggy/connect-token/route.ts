import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { createConnectToken, pluggyConfigured } from "@/lib/pluggy/client";

/** Conector MeuPluggy: o único com bancos reais liberado nas contas de teste. */
const MEU_PLUGGY = 200;

/**
 * Conectores mostrados no Pluggy Connect. PLUGGY_CONNECTOR_IDS aceita ids
 * separados por vírgula, ou "all" para todos (plano pago, com dados reais).
 */
function connectorIds(): number[] | undefined {
  const env = process.env.PLUGGY_CONNECTOR_IDS?.trim();
  if (env === "all") return undefined;
  const ids = (env ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids : [MEU_PLUGGY];
}

// Token para abrir o Pluggy Connect no navegador. Com ?item=… abre a
// reconexão de um item existente (ex.: consentimento expirado).
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  if (!pluggyConfigured()) {
    return NextResponse.json(
      { error: "Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no servidor." },
      { status: 500 },
    );
  }
  const itemId = new URL(request.url).searchParams.get("item") ?? undefined;
  try {
    return NextResponse.json({
      accessToken: await createConnectToken(user.id, itemId),
      connectorIds: connectorIds(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { getSnapshot } from "@/lib/finance/data";
import { resolvePeriod, resolveRange } from "@/lib/finance/period";

// Contas e transações do período (?dias=30|60|90 ou ?de=…&ate=…), vindas do
// Belvo Panorama (MCP) ou da fonte configurada. O MCP só é chamado daqui:
// o token nunca vai ao navegador.
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const period =
    resolveRange(params.get("de"), params.get("ate")) ??
    resolvePeriod(Number(params.get("dias") ?? 30));
  return NextResponse.json(await getSnapshot(user, period));
}

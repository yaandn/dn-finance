import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { getRecurring } from "@/lib/finance/data";

/** A primeira busca lê um ano de lançamentos na Belvo. */
export const maxDuration = 300;

// Assinaturas e outros gastos que se repetem, detectados em cerca de um ano.
export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  try {
    return NextResponse.json(await getRecurring(user));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

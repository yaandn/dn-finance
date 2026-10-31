import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { clearPluggyData } from "@/lib/finance/data";
import { updateItem } from "@/lib/pluggy/client";
import { getConnections } from "@/lib/pluggy/data";

// Pede à Pluggy para ir aos bancos agora, nas conexões que aceitam (as do
// MeuPluggy só atualizam uma vez por dia, sozinhas). Em todas, limpa o cache
// para a tela buscar de novo o que já chegou. A atualização roda lá em segundo
// plano: a tela acompanha pelo status em /api/pluggy/items.
export async function POST() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const connections = await getConnections(user);
  const errors: string[] = [];
  await Promise.all(
    connections
      .filter((c) => c.canRefresh && c.status !== "UPDATING" && c.status !== "ERROR")
      .map((c) =>
        updateItem(c.connectionId).catch((err) => {
          errors.push(`${c.institution}: ${err instanceof Error ? err.message : String(err)}`);
        }),
      ),
  );
  await clearPluggyData(user);
  return NextResponse.json({ connections: await getConnections(user), errors });
}

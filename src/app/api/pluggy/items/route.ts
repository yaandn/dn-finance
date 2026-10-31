import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { clearPluggyData } from "@/lib/finance/data";
import { PluggyError } from "@/lib/pluggy/client";
import { addItem, getConnections, removeItem } from "@/lib/pluggy/data";

const unauthorized = () =>
  NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

const failure = (err: unknown) =>
  NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status: err instanceof PluggyError && err.status < 500 ? err.status : 502 },
  );

/** Conexões do usuário com o status atual de cada uma na Pluggy. */
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  return NextResponse.json(await getConnections(user));
}

/** Salva o item que o Pluggy Connect acabou de criar. Corpo: { itemId }. */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { itemId } = await request.json().catch(() => ({}));
  if (typeof itemId !== "string" || !itemId) {
    return NextResponse.json({ error: "itemId ausente." }, { status: 400 });
  }
  try {
    await addItem(user, itemId);
    await clearPluggyData(user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failure(err);
  }
}

/** Desconecta um banco: ?item=… */
export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const itemId = new URL(request.url).searchParams.get("item");
  if (!itemId) return NextResponse.json({ error: "item ausente." }, { status: 400 });
  try {
    await removeItem(user, itemId);
    await clearPluggyData(user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failure(err);
  }
}

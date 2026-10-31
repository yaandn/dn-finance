import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { readRecurringMarks, setRecurringMark } from "@/lib/finance/data";

// Marca um estabelecimento como recorrente (entra desde a primeira cobrança).
// Corpo: { key, name } para marcar; DELETE ?key=… para desmarcar.

const unauthorized = () =>
  NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

async function save(key: unknown, name: string | null) {
  const user = await getUser();
  if (!user) return unauthorized();
  if (typeof key !== "string" || !key.trim()) {
    return NextResponse.json({ error: "Estabelecimento ausente." }, { status: 400 });
  }
  try {
    await setRecurringMark(user, key.trim(), name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** Estabelecimentos marcados: [{ key, name, addedAt }]. */
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  return NextResponse.json(await readRecurringMarks(user));
}

export async function POST(request: Request) {
  const { key, name } = await request.json().catch(() => ({}));
  return save(key, typeof name === "string" && name.trim() ? name.trim() : String(key));
}

export async function DELETE(request: Request) {
  return save(new URL(request.url).searchParams.get("key"), null);
}

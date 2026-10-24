import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import {
  hasWidgetToken,
  issueWidgetToken,
  revokeWidgetToken,
} from "@/lib/widget";

const unauthorized = () =>
  NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

/** Se já existe um token ativo (o token em si só aparece ao ser gerado). */
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  return NextResponse.json({ active: await hasWidgetToken(user) });
}

/** Gera um token novo; o anterior para de funcionar. */
export async function POST() {
  const user = await getUser();
  if (!user) return unauthorized();
  try {
    return NextResponse.json({ token: await issueWidgetToken(user) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: /kind_check/.test(message)
          ? "O banco ainda não aceita o token do widget: aplique a migration 20261024120000_widget_token.sql."
          : message,
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const user = await getUser();
  if (!user) return unauthorized();
  await revokeWidgetToken(user);
  return NextResponse.json({ active: false });
}

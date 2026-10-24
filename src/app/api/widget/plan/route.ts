import { NextResponse } from "next/server";

import { userFromWidgetToken, widgetPlanSummary } from "@/lib/widget";

// Lido pelo widget do Mac com "Authorization: Bearer <token do widget>".
// Não usa a sessão do navegador: o proxy.ts deixa esta rota passar.
export async function GET(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  try {
    // Dentro do try: sem SUPABASE_SECRET_KEY o widget mostra o motivo, não "HTTP 500"
    const user = token ? await userFromWidgetToken(token) : null;
    if (!user) {
      return NextResponse.json(
        { error: "Token do widget inválido ou revogado. Gere outro no app." },
        { status: 401 },
      );
    }
    return NextResponse.json(await widgetPlanSummary(user));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

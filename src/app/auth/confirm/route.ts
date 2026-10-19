import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Destino dos links enviados por e-mail (confirmação de cadastro e senha nova).
// Aceita o formato com ?code= (PKCE, padrão) e o com ?token_hash=&type=.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawNext = params.get("next") ?? "/";
  // Só caminhos internos: evita redirecionar para outro site
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const supabase = await createClient();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Link incompleto.") };

  if (error) {
    const url = new URL("/login", request.url);
    url.searchParams.set(
      "erro",
      "O link expirou ou já foi usado. Peça um novo ou tente entrar.",
    );
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL(next, request.url));
}

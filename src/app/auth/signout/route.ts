import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Logout por formulário comum (navegação completa): descarta as páginas que o
// navegador guardou em memória, para nada da conta anterior ficar na aba.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}

import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave secreta: ignora o RLS. Só para quem não tem sessão de
 * navegador (o widget do Mac) e sempre filtrando pelo user_id já validado.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY ausente (painel do Supabase → Settings → API Keys → Secret keys).",
    );
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

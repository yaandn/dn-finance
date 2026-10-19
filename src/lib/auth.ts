import "server-only";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  supabase: SupabaseClient;
};

export class UnauthorizedError extends Error {}

/** Usuário logado ou null. Valida o JWT (getClaims), não só o cookie. */
export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    supabase,
  };
});

/** Para páginas: manda para /login se não houver sessão. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Cópia do usuário para trabalho em segundo plano (depois da resposta).
 * Usa só o access token atual e nunca renova a sessão: renovar aqui gastaria
 * o refresh token do navegador, que é de uso único.
 */
export async function detachUser(user: CurrentUser): Promise<CurrentUser> {
  const { data } = await user.supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new UnauthorizedError("Sessão expirada.");
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return { ...user, supabase };
}

/** Para rotas de API e Server Actions: erro em vez de redirecionamento. */
export async function requireUserOrThrow(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) throw new UnauthorizedError("Faça login para continuar.");
  return user;
}

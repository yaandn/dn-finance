import "server-only";

import type { CurrentUser } from "@/lib/auth";

// Um documento JSON por (usuário, tipo) na tabela public.user_documents.
// O RLS garante que cada sessão só enxerga as próprias linhas.

export type DocKind = "belvo_mcp" | "plan" | "sync";

type DocUser = Pick<CurrentUser, "id" | "supabase">;

export async function readDoc<T>(user: DocUser, kind: DocKind): Promise<T | null> {
  const { data, error } = await user.supabase
    .from("user_documents")
    .select("data")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler ${kind}: ${error.message}`);
  return (data?.data as T | undefined) ?? null;
}

export async function writeDoc(user: DocUser, kind: DocKind, value: unknown) {
  const { error } = await user.supabase.from("user_documents").upsert(
    {
      user_id: user.id,
      kind,
      data: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,kind" },
  );
  if (error) throw new Error(`Falha ao salvar ${kind}: ${error.message}`);
}

export async function deleteDoc(user: DocUser, kind: DocKind) {
  const { error } = await user.supabase
    .from("user_documents")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", kind);
  if (error) throw new Error(`Falha ao apagar ${kind}: ${error.message}`);
}

-- Dados de cada usuário: conexão com o Belvo Panorama (criptografada pelo app),
-- planejamento e estado da sincronização. Um documento por (usuário, tipo).
create table public.user_documents (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('belvo_mcp', 'plan', 'sync')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.user_documents enable row level security;

create policy "Ler os próprios documentos"
  on public.user_documents for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Criar os próprios documentos"
  on public.user_documents for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Alterar os próprios documentos"
  on public.user_documents for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Apagar os próprios documentos"
  on public.user_documents for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.user_documents from anon;
grant select, insert, update, delete on public.user_documents to authenticated;

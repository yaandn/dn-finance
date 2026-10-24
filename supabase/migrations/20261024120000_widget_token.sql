-- Token do widget do Mac: guarda o nonce do token atual (gerar um novo revoga o anterior).
alter table public.user_documents drop constraint user_documents_kind_check;
alter table public.user_documents
  add constraint user_documents_kind_check
  check (kind in ('belvo_mcp', 'plan', 'sync', 'widget'));

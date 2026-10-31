-- Estabelecimentos que o usuário marcou como recorrentes.
alter table public.user_documents drop constraint user_documents_kind_check;
alter table public.user_documents
  add constraint user_documents_kind_check
  check (kind in ('belvo_mcp', 'plan', 'sync', 'widget', 'card_history', 'recurring_cache', 'pluggy', 'recurring_marks'));

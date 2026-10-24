-- Cache dos gastos recorrentes (a detecção lê um ano de lançamentos na Belvo).
alter table public.user_documents drop constraint user_documents_kind_check;
alter table public.user_documents
  add constraint user_documents_kind_check
  check (kind in ('belvo_mcp', 'plan', 'sync', 'widget', 'card_history', 'recurring_cache'));

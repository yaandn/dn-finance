-- Cache das parcelas de compras antigas (a busca na Belvo leva até um minuto).
-- Fica no banco porque, na Vercel, a memória do servidor não dura entre execuções.
alter table public.user_documents drop constraint user_documents_kind_check;
alter table public.user_documents
  add constraint user_documents_kind_check
  check (kind in ('belvo_mcp', 'plan', 'sync', 'widget', 'card_history'));

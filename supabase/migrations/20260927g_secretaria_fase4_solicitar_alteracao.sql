-- Fase 4 (Matrículas) do módulo Secretaria — 4º status: "solicitar
-- alteração" (changes_requested). Hoje só existe pending/approved/rejected;
-- rejected é definitivo (família teria que abrir uma solicitação nova do
-- zero). changes_requested é um meio-termo: Secretaria aponta o que precisa
-- corrigir (reaproveita rejection_reason como campo de observação -- mesmo
-- uso, texto livre do revisor), a família edita a MESMA solicitação e
-- reenvia, o status volta pra pending.
alter table public.matricula_solicitacoes
  drop constraint matricula_solicitacoes_status_check;

alter table public.matricula_solicitacoes
  add constraint matricula_solicitacoes_status_check
  check (status = any (array['pending', 'approved', 'rejected', 'changes_requested']));

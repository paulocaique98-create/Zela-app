-- delete-user (edge function) excluía o usuário mas nunca os cadastros de
-- "Autorizados" (authorized_persons.family_id) dessa família -- a tabela foi
-- criada direto no dashboard, sem ON DELETE CASCADE pra users(id). Efeito
-- visível: uma biometria de conta já excluída continuava aparecendo pra
-- sempre na varredura de Duplicidade Facial (Admin > Sistema), porque a
-- linha órfã nunca sumia. A Edge Function já foi corrigida pra limpar isso
-- em toda exclusão futura; esta migração só limpa o que já ficou órfão.
delete from public.authorized_persons
where family_id is not null
  and family_id not in (select id from public.users);

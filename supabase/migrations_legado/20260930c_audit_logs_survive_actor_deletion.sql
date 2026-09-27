-- Bug real reportado: excluir um responsavel (Isabella Lino Rosetti) dava
-- "non-2xx status code" na Edge Function delete-user. Causa: audit_logs.actor_id
-- tinha FK "NO ACTION" pra users(id) -- qualquer conta que ja tivesse UMA acao
-- registrada (ex: consentimento de biometria) ficava PRA SEMPRE impossivel de
-- excluir, mesmo sendo uma conta comum de familia sem nada de especial.
--
-- Correcao: guarda o nome do autor no proprio log (independente da conta
-- continuar existindo) e libera a FK pra virar NULL quando a conta for
-- excluida -- o rastro da ACAO em si nunca se perde, só deixa de apontar pra
-- uma conta que nao existe mais.
alter table audit_logs add column if not exists actor_name text;

update audit_logs al
set actor_name = u.name
from users u
where al.actor_id = u.id and al.actor_name is null;

alter table audit_logs alter column actor_id drop not null;

alter table audit_logs drop constraint audit_logs_actor_id_fkey;
alter table audit_logs
  add constraint audit_logs_actor_id_fkey
  foreign key (actor_id) references users(id) on delete set null;

-- Preenche actor_name automaticamente em todo INSERT novo, sem precisar
-- alterar cada chamada de logAction() no client pra passar o nome também.
create or replace function set_audit_log_actor_name()
returns trigger as $$
begin
  if new.actor_name is null and new.actor_id is not null then
    select name into new.actor_name from users where id = new.actor_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_set_audit_log_actor_name on audit_logs;
create trigger trg_set_audit_log_actor_name
  before insert on audit_logs
  for each row execute function set_audit_log_actor_name();

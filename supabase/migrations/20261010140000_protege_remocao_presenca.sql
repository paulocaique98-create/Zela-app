-- Fecha o caminho direto para apagar registro de presença.
--
-- A policy "Admins corrigem historico da escola" (UPDATE) deixa a Gestão gravar
-- deleted_at direto na tabela, sem motivo e sem linha em attendance_corrections.
-- Este trigger só aceita mudar deleted_* quando a chamada vem de função
-- SECURITY DEFINER (delete_attendance_log), onde current_user é o dono da função.
-- Clientes (authenticated/anon) ficam bloqueados; service_role continua livre.

create or replace function public.guard_attendance_deleted_cols()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user in ('authenticated', 'anon') and (
    new.deleted_at is distinct from old.deleted_at
    or new.deleted_by is distinct from old.deleted_by
    or new.deleted_reason_code is distinct from old.deleted_reason_code
    or new.deleted_reason_detail is distinct from old.deleted_reason_detail
  ) then
    raise exception 'Use a função de apagar registro de presença';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_attendance_deleted_cols on public.attendance_logs;
create trigger trg_guard_attendance_deleted_cols
  before update on public.attendance_logs
  for each row execute function public.guard_attendance_deleted_cols();

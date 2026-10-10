-- Trocar de conta: a conta da Recepção (role admin) só enxerga a Recepção.
-- Quem vincula e troca entre Financeiro (gestao), Recepção e Família é o
-- Financeiro. A Recepção não lista, não vincula e não troca de conta, mesmo
-- que um vínculo antigo exista (o botão some na tela e o banco barra aqui).
-- Só substitui 3 funções de 20260929233347_contas_vinculadas.sql; nenhuma
-- tabela, policy ou dado é alterado.

create or replace function public.vincular_contas(p_a uuid, p_b uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ga uuid;
  v_gb uuid;
  v_novo uuid;
  v_total int;
begin
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'Escolha uma conta diferente da que está aberta.';
  end if;
  if exists (select 1 from public.users where id = p_a and role = 'admin') then
    raise exception 'A conta da Recepção não vincula outras contas.';
  end if;
  if not public.conta_pode_ser_vinculada(p_a) or not public.conta_pode_ser_vinculada(p_b) then
    raise exception 'Esta conta não pode ser vinculada.';
  end if;

  select grupo into v_ga from public.contas_vinculadas where user_id = p_a;
  select grupo into v_gb from public.contas_vinculadas where user_id = p_b;
  if v_ga is not null and v_ga = v_gb then
    return v_ga;
  end if;

  select count(*) into v_total from (
    select user_id from public.contas_vinculadas where grupo in (v_ga, v_gb)
    union select p_a union select p_b
  ) t;
  if v_total > 5 then
    raise exception 'Limite de 5 contas vinculadas atingido.';
  end if;

  v_novo := coalesce(v_ga, v_gb, gen_random_uuid());
  update public.contas_vinculadas set grupo = v_novo where grupo in (v_ga, v_gb);
  insert into public.contas_vinculadas (user_id, grupo) values (p_a, v_novo), (p_b, v_novo)
  on conflict (user_id) do update set grupo = excluded.grupo;
  return v_novo;
end;
$function$;
revoke execute on function public.vincular_contas(uuid, uuid) from public, anon, authenticated;
grant execute on function public.vincular_contas(uuid, uuid) to service_role;

create or replace function public.conta_vinculada_ativa(p_origem uuid, p_destino uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_origem <> p_destino
     and not exists (select 1 from public.users o where o.id = p_origem and o.role = 'admin')
     and public.conta_pode_ser_vinculada(p_origem)
     and public.conta_pode_ser_vinculada(p_destino)
     and exists (
       select 1 from public.contas_vinculadas a
       join public.contas_vinculadas b on b.grupo = a.grupo
       where a.user_id = p_origem and b.user_id = p_destino
     );
$function$;
revoke execute on function public.conta_vinculada_ativa(uuid, uuid) from public, anon, authenticated;
grant execute on function public.conta_vinculada_ativa(uuid, uuid) to service_role;

create or replace function public.listar_contas_vinculadas()
returns table (
  user_id uuid,
  name text,
  role text,
  departamento text,
  escola text,
  alunos text[],
  nao_lidas int,
  atual boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with meu as (
    select grupo from public.contas_vinculadas where user_id = auth.uid()
  )
  select u.id, u.name, u.role, u.departamento, s.name,
         coalesce((
           select array_agg(distinct split_part(st.name, ' ', 1) order by split_part(st.name, ' ', 1))
           from public.students st
           where coalesce(st.enrollment_status, 'ativo') = 'ativo'
             and (st.family_id = u.id or exists (
               select 1 from public.student_guardians sg where sg.student_id = st.id and sg.guardian_id = u.id))
         ), array[]::text[]),
         case when u.role = 'family' and u.id <> auth.uid() then (
           select count(*)::int from public.notifications n where n.family_id = u.id and n.read_at is null
         ) else 0 end,
         u.id = auth.uid()
  from meu
  join public.contas_vinculadas c on c.grupo = meu.grupo
  join public.users u on u.id = c.user_id
  left join public.schools s on s.id = u.school_id
  where not exists (select 1 from public.users o where o.id = auth.uid() and o.role = 'admin')
    and (u.id = auth.uid() or public.conta_pode_ser_vinculada(u.id))
  order by (u.id = auth.uid()) desc, u.role, s.name;
$function$;
revoke execute on function public.listar_contas_vinculadas() from public, anon;
grant execute on function public.listar_contas_vinculadas() to authenticated;

-- Até agora o limite de autorizados (geral + transporte, configurado em
-- schools.limits pelo Portal do Dev) só era checado no client
-- (App.jsx > handleSaveAuth) -- fácil de burlar (chamada direta à API, race
-- condition de duas abas abertas, etc). Esta migração reforça a mesma regra
-- direto no banco, via trigger BEFORE INSERT em authorized_persons, pra
-- valer mesmo se o client não checar.
--
-- Regra (mesma do client, ver App.jsx/FamilyAuthorized.jsx):
--   - Entrada "(Titular)" (o próprio responsável, criada pelo Admin só pra
--     ele fazer check-in por reconhecimento facial) nunca conta e nunca é
--     limitada -- não é um "autorizado" de verdade.
--   - "Transporte" (van/motorista) tem cota própria (limits.autorizados_
--     transporte, padrão 1), separada da cota geral.
--   - Cota geral (limits.autorizados_por_responsavel, padrão 2) DOBRA se
--     existir um 2º Responsável com login próprio vinculado ao(s) mesmo(s)
--     aluno(s) desta família (mesmo critério de FamilyMatriculas.jsx).
create or replace function public.enforce_authorized_persons_limit()
returns trigger
language plpgsql
as $$
declare
  v_limits jsonb;
  v_max_geral int;
  v_max_transporte int;
  v_is_transporte boolean;
  v_has_segundo boolean;
  v_count int;
  v_max int;
begin
  -- Entrada do próprio responsável (self check-in) -- nunca é limitada.
  if new.relation ilike '%(Titular)%' then
    return new;
  end if;

  select coalesce(limits, '{}'::jsonb) into v_limits
  from public.schools where id = new.school_id;

  v_max_geral := coalesce((v_limits->>'autorizados_por_responsavel')::int, 2);
  v_max_transporte := coalesce((v_limits->>'autorizados_transporte')::int, 1);
  v_is_transporte := (new.relation = 'Transporte');

  -- 2º Responsável: outra conta (guardian_id diferente) vinculada a algum
  -- aluno do qual esta família (new.family_id) é titular OU guardian.
  select exists (
    select 1
    from public.student_guardians sg
    where sg.guardian_id <> new.family_id
      and sg.student_id in (
        select sg2.student_id from public.student_guardians sg2 where sg2.guardian_id = new.family_id
        union
        select s.id from public.students s where s.family_id = new.family_id
      )
  ) into v_has_segundo;

  if v_is_transporte then
    select count(*) into v_count
    from public.authorized_persons
    where family_id = new.family_id and relation = 'Transporte';

    if v_count >= v_max_transporte then
      raise exception 'Limite de % autorizado(s) de transporte escolar atingido.', v_max_transporte
        using errcode = 'P0001';
    end if;
  else
    v_max := v_max_geral * (case when v_has_segundo then 2 else 1 end);

    select count(*) into v_count
    from public.authorized_persons
    where family_id = new.family_id
      and relation is distinct from 'Transporte'
      and relation not ilike '%(Titular)%';

    if v_count >= v_max then
      raise exception 'Limite de % autorizados atingido.', v_max
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_authorized_persons_limit on public.authorized_persons;
create trigger trg_enforce_authorized_persons_limit
  before insert on public.authorized_persons
  for each row execute function public.enforce_authorized_persons_limit();

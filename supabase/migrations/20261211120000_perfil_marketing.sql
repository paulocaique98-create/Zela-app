-- Perfil Marketing · 05/11/2026
-- Plano: docs/roadmap/PLANO_MARKETING.md (Fase A)
--
-- Tipo de conta novo, users.role = 'marketing'. FECHADO POR PADRÃO: nenhuma
-- regra existente muda; ele só recebe as regras ADITIVAS abaixo (todas com o
-- nome começando por "Marketing") e só com o módulo 'marketing' ligado na
-- escola (lido como = 'true'; todo módulo nasce desligado).
--
-- Escreve só em calendário, comunicados e mural de fotos (e nos arquivos
-- dessas duas últimas áreas, presos à pasta school_id/). Os alunos chegam
-- apenas pela RPC marketing_lista_alunos(), com colunas explícitas e sem
-- foto: o perfil NÃO tem nenhuma regra na tabela students.

-- ═══ 1. Funções de acesso ═══════════════════════════════════════════════

-- Módulo ligado na escola do usuário.
create or replace function public.marketing_modulo_ligado()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select (s.features_enabled ->> 'marketing') = 'true'
                     from public.schools s
                    where s.id = public.get_my_school_id()), false);
$$;

-- Conta Marketing com o módulo ligado.
create or replace function public.marketing_ativo()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce(public.get_my_role(), '') = 'marketing'
     and public.marketing_modulo_ligado();
$$;

-- Conta Marketing da escola informada (escola vazia nunca bate).
create or replace function public.marketing_da_escola(p_school_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.marketing_ativo()
     and coalesce(p_school_id = public.get_my_school_id(), false);
$$;

revoke execute on function public.marketing_modulo_ligado() from public, anon;
revoke execute on function public.marketing_ativo() from public, anon;
revoke execute on function public.marketing_da_escola(uuid) from public, anon;
grant execute on function public.marketing_modulo_ligado() to authenticated;
grant execute on function public.marketing_ativo() to authenticated;
grant execute on function public.marketing_da_escola(uuid) to authenticated;

-- ═══ 2. Regras aditivas ═════════════════════════════════════════════════

create policy "Marketing gerencia calendario" on public.eventos_calendario
  for all using (marketing_da_escola(school_id)) with check (marketing_da_escola(school_id));
create policy "Marketing gerencia comunicados" on public.comunicados
  for all using (marketing_da_escola(school_id)) with check (marketing_da_escola(school_id));
create policy "Marketing gerencia mural" on public.mural_fotos
  for all using (marketing_da_escola(school_id)) with check (marketing_da_escola(school_id));

create policy "Marketing gerencia anexos de comunicados" on storage.objects
  for all using (bucket_id = 'comunicados-anexos' and marketing_ativo() and (storage.foldername(name))[1] = get_my_school_id()::text)
  with check (bucket_id = 'comunicados-anexos' and marketing_ativo() and (storage.foldername(name))[1] = get_my_school_id()::text);
create policy "Marketing gerencia fotos do mural" on storage.objects
  for all using (bucket_id = 'mural-fotos' and marketing_ativo() and (storage.foldername(name))[1] = get_my_school_id()::text)
  with check (bucket_id = 'mural-fotos' and marketing_ativo() and (storage.foldername(name))[1] = get_my_school_id()::text);

-- ═══ 3. Lista de alunos (RPC) ═══════════════════════════════════════════
-- Só alunos ativos da escola do usuário. Colunas aprovadas: nome, turma,
-- turno, nascimento, idade, nome e telefone do responsável. Sem foto, sem
-- documento, sem ficha médica, sem dado financeiro.
create or replace function public.marketing_lista_alunos()
returns table (
  student_id uuid,
  nome text,
  turma text,
  turno text,
  nascimento date,
  idade integer,
  responsavel_nome text,
  responsavel_telefone text
)
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare
  v_school uuid := public.get_my_school_id();
begin
  if v_school is null or not public.marketing_ativo() then
    raise exception 'Sem permissão para listar os alunos.';
  end if;

  return query
  select s.id,
         s.name,
         s.turma,
         s.turno,
         s.birth_date,
         case when s.birth_date is null then null
              else date_part('year', age(current_date, s.birth_date))::integer end,
         g.name,
         coalesce(nullif(g.phone, ''), nullif(g.phone2, ''))
    from public.students s
    left join lateral (
      select u.name, u.phone, u.phone2
        from public.users u
       where u.school_id = v_school
         and u.id = coalesce(
               (select sg.guardian_id
                  from public.student_guardians sg
                 where sg.student_id = s.id and sg.school_id = v_school
                 order by sg.is_primary desc, sg.created_at
                 limit 1),
               s.family_id)
       limit 1
    ) g on true
   where s.school_id = v_school
     and s.enrollment_status = 'ativo'
   order by s.name;
end;
$function$;
revoke execute on function public.marketing_lista_alunos() from public, anon;
grant execute on function public.marketing_lista_alunos() to authenticated;

-- ═══ 4. Trilha da exportação ════════════════════════════════════════════
-- school_id e quem exportou vêm do servidor; o cliente só informa formato e
-- quantidade.
create or replace function public.marketing_registrar_exportacao(p_formato text, p_quantidade integer)
returns void
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_school uuid := public.get_my_school_id();
  v_nome text;
begin
  if v_school is null or not public.marketing_ativo() then
    raise exception 'Sem permissão para exportar.';
  end if;
  if p_formato not in ('excel', 'pdf', 'csv') then
    raise exception 'Formato inválido.';
  end if;
  if p_quantidade is null or p_quantidade < 0 or p_quantidade > 100000 then
    raise exception 'Quantidade inválida.';
  end if;

  select name into v_nome from public.users where id = auth.uid();

  insert into public.audit_logs (school_id, actor_id, actor_name, action, entity_type, details)
  values (v_school, auth.uid(), v_nome, 'marketing_exportar_alunos', 'student_list',
          jsonb_build_object('formato', p_formato, 'quantidade', p_quantidade));
end;
$function$;
revoke execute on function public.marketing_registrar_exportacao(text, integer) from public, anon;
grant execute on function public.marketing_registrar_exportacao(text, integer) to authenticated;

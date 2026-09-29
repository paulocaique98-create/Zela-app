-- Unificação SUPERVISIONADA dos 2º responsáveis (29/09/2026).
--
-- Antes da conta própria do 2º responsável existir (create-family-user cria
-- um cadastro dele na PRÓPRIA conta, esperando a biometria), as famílias
-- cadastravam o outro pai/mãe como Autorizado "Pai/Mãe" dentro da conta do
-- titular. Resultado: a mesma pessoa com dois cadastros (um vazio na conta
-- dela, outro com a biometria na conta do titular), foto que não aparece em
-- Gerenciamento > Usuários e uma vaga de autorizado ocupada no titular.
--
-- Nada é feito sozinho: a Gestão vê a lista e confirma pessoa por pessoa; o
-- servidor recalcula a lista na hora de aplicar.
--   mover           : a biometria está só no cadastro antigo -> o cadastro
--                     antigo passa para a conta da pessoa (mesmo id: foto,
--                     permissão de acesso à foto e biometria continuam
--                     valendo) e o cadastro vazio da conta é apagado.
--   remover_antigo  : a conta da pessoa já tem a biometria -> o cadastro
--                     antigo no titular é apagado (a foto dele é devolvida
--                     para a tela apagar do armazenamento).
--   remover_duplicado: cadastro "Pai/Mãe" vazio da pessoa dentro da própria
--                     conta, repetindo outro cadastro dela -> apagado.
--   autorizado_repetido: o mesmo autorizado nas contas de dois responsáveis
--                     da mesma família -> fica um cadastro só, na conta que
--                     busca todas as crianças que a cópia buscava.
-- O totem acha as crianças do 2º responsável pelo vínculo em
-- student_guardians, e o histórico de presença guarda o nome (não o id),
-- então nada disso muda o que já aconteceu nem quem busca quem.

create or replace function public.nome_pessoa_norm(p text)
returns text
language sql
stable
set search_path to 'public'
as $function$
  select lower(unaccent(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g')));
$function$;

-- Mesmo nome, ou (parentesco de pai/mãe) mesmo primeiro nome e mesmo
-- sobrenome final / mesmos dois primeiros nomes -- cobre "Alice Magill" x
-- "Alice Henrique Ribeiro Magill" e erro de digitação no último sobrenome.
-- O parentesco evita casar com avô/tio de mesmo nome e sobrenome.
create or replace function public.mesma_pessoa_responsavel(p_nome_cadastro text, p_relacao text, p_nome_conta text)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  with n as (
    select public.nome_pessoa_norm(p_nome_cadastro) a, public.nome_pessoa_norm(p_nome_conta) b,
           public.nome_pessoa_norm(p_relacao) r
  )
  select a = b
    or (r in ('pai', 'mae', 'pai/mae')
        and split_part(a, ' ', 1) = split_part(b, ' ', 1)
        and (regexp_replace(a, '^.* ', '') = regexp_replace(b, '^.* ', '')
             or (split_part(a, ' ', 2) <> '' and split_part(a, ' ', 2) = split_part(b, ' ', 2))))
  from n;
$function$;

create or replace function public.tem_biometria(ap public.authorized_persons)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select ap.face_descriptor is not null or ap.face_descriptor_v2 is not null
      or ap.photo_storage_path is not null or ap.photo_url is not null;
$function$;

-- Candidatos da escola (uso interno; a lista e a aplicação chamam esta).
create or replace function public.candidatos_unificar_responsaveis(p_school_id uuid)
returns table (
  legacy_id uuid,
  legacy_name text,
  legacy_relation text,
  legacy_has_bio boolean,
  legacy_photo_path text,
  titular_name text,
  guardian_id uuid,
  guardian_name text,
  conta_tem_bio boolean,
  acao text,
  nome_igual boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- 2º responsável G com cadastro antigo L na conta do titular T.
  with pares as (
    select distinct g.id gid, g.name gname, t.id tid, t.name tname
    from users g
    join student_guardians sg on sg.guardian_id = g.id
    join students s on s.id = sg.student_id and s.school_id = p_school_id
    join users t on t.id = s.family_id
    where g.school_id = p_school_id and g.role = 'family' and t.id <> g.id
      -- Só se G busca TODAS as crianças ativas de T pelo vínculo próprio;
      -- senão, tirar o cadastro antigo tiraria a permissão no totem.
      and not exists (
        select 1 from students s2
        where s2.family_id = t.id and s2.school_id = p_school_id
          and coalesce(s2.enrollment_status, 'ativo') = 'ativo'
          and not exists (select 1 from student_guardians g2 where g2.student_id = s2.id and g2.guardian_id = g.id))
  ),
  segundo as (
    select l.id, l.name, l.relation, public.tem_biometria(l) lbio, l.photo_storage_path,
           p.tname, p.gid, p.gname,
           exists (select 1 from authorized_persons c
                    where c.family_id = p.gid and c.school_id = p_school_id
                      and public.mesma_pessoa_responsavel(c.name, 'pai', p.gname)
                      and public.tem_biometria(c)) cbio,
           public.nome_pessoa_norm(l.name) = public.nome_pessoa_norm(p.gname) igual
    from pares p
    join authorized_persons l on l.family_id = p.tid and l.school_id = p_school_id
    where l.relation not ilike '%(Titular)%'
      and l.relation is distinct from 'Transporte'
      and public.mesma_pessoa_responsavel(l.name, l.relation, p.gname)
  ),
  -- Cadastro "Pai/Mãe" vazio da pessoa dentro da própria conta, repetindo
  -- outro cadastro dela na mesma conta.
  proprio as (
    select l.id, l.name, l.relation, false lbio, l.photo_storage_path,
           u.name tname, u.id gid, u.name gname, true cbio, true igual
    from authorized_persons l
    join users u on u.id = l.family_id
    where l.school_id = p_school_id
      and public.nome_pessoa_norm(l.relation) in ('pai', 'mae', 'pai/mae')
      and public.nome_pessoa_norm(l.name) = public.nome_pessoa_norm(u.name)
      and not public.tem_biometria(l)
      and exists (select 1 from authorized_persons o
                   where o.family_id = u.id and o.id <> l.id
                     and public.nome_pessoa_norm(o.name) = public.nome_pessoa_norm(u.name)
                     and (o.relation ilike '%(Titular)%' or public.tem_biometria(o)))
  ),
  -- Mesmo autorizado (ex.: a babá) cadastrado nas contas de dois
  -- responsáveis da mesma família. O totem libera para um autorizado as
  -- crianças de que a conta dele é responsável: basta um cadastro, na conta
  -- que cobre todas as crianças que a cópia cobria. Fica o que tem
  -- biometria (senão o mais antigo).
  aut as (
    select a.*, public.tem_biometria(a) bio, public.nome_pessoa_norm(a.name) n
    from authorized_persons a
    where a.school_id = p_school_id
      and a.relation not ilike '%(Titular)%'
      and public.nome_pessoa_norm(a.relation) not in ('pai', 'mae', 'pai/mae')
  ),
  repetido as (
    select y.id, y.name, y.relation, y.bio lbio, y.photo_storage_path,
           uy.name tname, x.family_id gid, ux.name gname, x.bio cbio, true igual
    from aut y
    join aut x on x.n = y.n and x.family_id <> y.family_id and x.id <> y.id
    join users ux on ux.id = x.family_id
    join users uy on uy.id = y.family_id
    where
      -- contas da mesma família (ligadas a uma mesma criança)
      exists (select 1 from student_guardians gx join student_guardians gy on gy.student_id = gx.student_id
               where gx.guardian_id = x.family_id and gy.guardian_id = y.family_id)
      -- a conta que fica cobre todas as crianças ativas da cópia
      and not exists (
        select 1 from student_guardians gy join students s on s.id = gy.student_id
        where gy.guardian_id = y.family_id and coalesce(s.enrollment_status, 'ativo') = 'ativo'
          and not exists (select 1 from student_guardians gx where gx.guardian_id = x.family_id and gx.student_id = gy.student_id))
      -- x é o que fica: com biometria antes, depois o de menor id
      and (x.bio > y.bio or (x.bio = y.bio and x.id < y.id))
      -- y só sai uma vez, mesmo com várias cópias
      and x.id = (select x2.id from aut x2
                   where x2.n = y.n and x2.family_id <> y.family_id
                     and exists (select 1 from student_guardians g1 join student_guardians g2 on g2.student_id = g1.student_id
                                  where g1.guardian_id = x2.family_id and g2.guardian_id = y.family_id)
                     and not exists (
                       select 1 from student_guardians gy join students s on s.id = gy.student_id
                       where gy.guardian_id = y.family_id and coalesce(s.enrollment_status, 'ativo') = 'ativo'
                         and not exists (select 1 from student_guardians gx where gx.guardian_id = x2.family_id and gx.student_id = gy.student_id))
                     and (x2.bio > y.bio or (x2.bio = y.bio and x2.id < y.id))
                   order by x2.bio desc, x2.id
                   limit 1)
  )
  select id, name, relation, lbio, photo_storage_path, tname, gid, gname, cbio,
         case when cbio then 'remover_antigo' else 'mover' end, igual
  from segundo
  union all
  select id, name, relation, lbio, photo_storage_path, tname, gid, gname, cbio, 'remover_duplicado', igual
  from proprio
  union all
  select id, name, relation, lbio, photo_storage_path, tname, gid, gname, cbio, 'autorizado_repetido', igual
  from repetido;
$function$;
revoke execute on function public.candidatos_unificar_responsaveis(uuid) from public, anon, authenticated;

create or replace function public.list_unificar_responsaveis()
returns table (
  legacy_id uuid,
  legacy_name text,
  legacy_relation text,
  legacy_has_bio boolean,
  titular_name text,
  guardian_id uuid,
  guardian_name text,
  conta_tem_bio boolean,
  acao text,
  nome_igual boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid := public.get_my_school_id();
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or v_school_id is null then
    raise exception 'Só a Gestão pode ver a unificação de responsáveis.';
  end if;
  return query
  select c.legacy_id, c.legacy_name, c.legacy_relation, c.legacy_has_bio, c.titular_name,
         c.guardian_id, c.guardian_name, c.conta_tem_bio, c.acao, c.nome_igual
  from public.candidatos_unificar_responsaveis(v_school_id) c
  order by c.guardian_name, c.legacy_name;
end;
$function$;
revoke execute on function public.list_unificar_responsaveis() from public, anon;
grant execute on function public.list_unificar_responsaveis() to authenticated;

create or replace function public.apply_unificar_responsaveis(p_legacy_ids uuid[])
returns table (legacy_id uuid, acao text, photo_storage_path text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid := public.get_my_school_id();
  r record;
  v_rel text;
  v_feitos jsonb := '[]'::jsonb;
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or v_school_id is null then
    raise exception 'Só a Gestão pode unificar responsáveis.';
  end if;

  -- Só o que continua na lista agora (a situação pode ter mudado).
  for r in
    select distinct on (c.legacy_id) c.*
    from public.candidatos_unificar_responsaveis(v_school_id) c
    where c.legacy_id = any(coalesce(p_legacy_ids, array[]::uuid[]))
    order by c.legacy_id
  loop
    if r.acao = 'mover' then
      select c.relation into v_rel
      from authorized_persons c
      where c.family_id = r.guardian_id and c.school_id = v_school_id and c.id <> r.legacy_id
        and public.mesma_pessoa_responsavel(c.name, 'pai', r.guardian_name)
      limit 1;

      delete from authorized_persons c
      where c.family_id = r.guardian_id and c.school_id = v_school_id and c.id <> r.legacy_id
        and public.mesma_pessoa_responsavel(c.name, 'pai', r.guardian_name)
        and not public.tem_biometria(c);

      update authorized_persons
      set family_id = r.guardian_id,
          name = r.guardian_name,
          relation = coalesce(v_rel, r.legacy_relation)
      where id = r.legacy_id;

      legacy_id := r.legacy_id; acao := r.acao; photo_storage_path := null;
    else
      delete from authorized_persons where id = r.legacy_id;
      legacy_id := r.legacy_id; acao := r.acao; photo_storage_path := r.legacy_photo_path;
    end if;

    v_feitos := v_feitos || jsonb_build_object('id', r.legacy_id, 'acao', r.acao, 'pessoa', r.guardian_name, 'titular', r.titular_name);
    return next;
  end loop;

  insert into audit_logs (school_id, actor_id, action, entity_type, details)
  values (v_school_id, auth.uid(), 'unificar_responsaveis', 'authorized_person',
          jsonb_build_object('quantidade', jsonb_array_length(v_feitos), 'itens', v_feitos));
end;
$function$;
revoke execute on function public.apply_unificar_responsaveis(uuid[]) from public, anon;
grant execute on function public.apply_unificar_responsaveis(uuid[]) to authenticated;

-- Contas vinculadas (29/09/2026)
--
-- A mesma pessoa pode ter mais de uma conta no Zela (ex.: a Coordenadora que
-- também é mãe de aluno). Cada conta continua separada, com as próprias
-- permissões; o vínculo só permite trocar de uma para a outra pelo botão do
-- cabeçalho, sem digitar a senha de novo.
--
-- Regras:
--   · o vínculo é criado pela própria pessoa, provando que é dona das duas
--     contas (digita o e-mail e a senha da outra uma vez · função de borda
--     vincular-conta);
--   · contas vinculadas formam um grupo (até 5 contas); todas enxergam
--     todas;
--   · a troca é feita pela função de borda trocar-conta, que confere o grupo
--     aqui no banco antes de abrir a outra conta;
--   · o vínculo some sozinho quando a conta é excluída (ex.: funcionária
--     desligada) ou quando o e-mail de login dela muda (quem trocou o e-mail
--     de outra pessoa não herda o acesso às contas vinculadas).
--   · ninguém lê nem grava esta tabela direto: só pelas funções abaixo.

create table public.contas_vinculadas (
  user_id uuid primary key references public.users(id) on delete cascade,
  grupo uuid not null,
  vinculado_em timestamptz not null default now()
);
create index contas_vinculadas_grupo_idx on public.contas_vinculadas (grupo);

alter table public.contas_vinculadas enable row level security;
revoke all on public.contas_vinculadas from anon, authenticated;

-- Conta que pode entrar num grupo e receber troca: ativa, não é o suporte, e
-- professora só se estiver com acesso ativo.
create or replace function public.conta_pode_ser_vinculada(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.users u
    where u.id = p_user_id
      and u.status = 'active'
      and u.role <> 'developer'
      and (u.role <> 'teacher' or coalesce(u.teacher_status, 'ativo') = 'ativo')
  );
$function$;
revoke execute on function public.conta_pode_ser_vinculada(uuid) from public, anon, authenticated;
grant execute on function public.conta_pode_ser_vinculada(uuid) to service_role;

-- Junta duas contas no mesmo grupo (usada só pela função de borda, depois
-- de conferir a senha da outra conta).
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

-- A troca de p_origem para p_destino é permitida? (usada só pela função de
-- borda trocar-conta).
create or replace function public.conta_vinculada_ativa(p_origem uuid, p_destino uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_origem <> p_destino
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

-- Contas do meu grupo (a atual incluída), com o que o botão do cabeçalho
-- precisa mostrar: perfil, escola, primeiros nomes dos filhos e avisos não
-- lidos (só conta de família tem avisos no sino).
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
  where u.id = auth.uid() or public.conta_pode_ser_vinculada(u.id)
  order by (u.id = auth.uid()) desc, u.role, s.name;
$function$;
revoke execute on function public.listar_contas_vinculadas() from public, anon;
grant execute on function public.listar_contas_vinculadas() to authenticated;

-- Tira uma conta do meu grupo (a própria ou outra do grupo).
create or replace function public.desvincular_conta(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_grupo uuid;
begin
  select grupo into v_grupo from public.contas_vinculadas where user_id = auth.uid();
  if v_grupo is null then
    raise exception 'Esta conta não tem vínculos.';
  end if;
  delete from public.contas_vinculadas where user_id = p_user_id and grupo = v_grupo;
  if not found then
    raise exception 'Conta não encontrada entre as vinculadas.';
  end if;
end;
$function$;
revoke execute on function public.desvincular_conta(uuid) from public, anon;
grant execute on function public.desvincular_conta(uuid) to authenticated;

-- Grupo que ficou com uma conta só deixa de existir (vale para exclusão de
-- conta, desvínculo e troca de e-mail).
create or replace function public.limpar_grupos_de_uma_conta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Só age se algo saiu de fato (a própria limpeza dispara o gatilho de
  -- novo, sem linhas, e para aí).
  if not exists (select 1 from removidas) then
    return null;
  end if;
  delete from public.contas_vinculadas c
  where not exists (
    select 1 from public.contas_vinculadas o where o.grupo = c.grupo and o.user_id <> c.user_id
  );
  return null;
end;
$function$;
revoke execute on function public.limpar_grupos_de_uma_conta() from public, anon, authenticated;

create trigger contas_vinculadas_limpar_grupos
after delete on public.contas_vinculadas
referencing old table as removidas
for each statement execute function public.limpar_grupos_de_uma_conta();

-- E-mail de login mudou: o vínculo cai. Protege contra quem troca o e-mail
-- de outra pessoa (ex.: pela tela de cadastro) e depois usa "Esqueci minha
-- senha" para entrar: essa pessoa não herda as contas vinculadas.
create or replace function public.desvincular_ao_trocar_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, '')) then
    delete from public.contas_vinculadas where user_id = new.id;
  end if;
  return new;
end;
$function$;
revoke execute on function public.desvincular_ao_trocar_email() from public, anon, authenticated;

create trigger contas_vinculadas_email_mudou
after update of email on auth.users
for each row execute function public.desvincular_ao_trocar_email();

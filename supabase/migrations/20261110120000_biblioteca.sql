-- Biblioteca (PLANO_EXPANSAO_GESTAO.md, item 4). Só tabelas, funções, policies,
-- permissão, preço e bucket novos: nada existente é alterado ou apagado.
--  * Quem gerencia: gestao e gestao_pedagogica (Coordenação e Direção) sempre;
--    Recepção (admin) e Professora (teacher) só com a permissão biblioteca.gerenciar,
--    liberada pela Gestão. Tudo isso só vale com o módulo `biblioteca` ligado
--    (schools.features_enabled->>'biblioteca' = 'true').
--  * Família: nenhuma policy. Lê os empréstimos dos filhos só pela RPC
--    library_meus_emprestimos (security definer, filtra students.family_id = auth.uid()).
--  * Empréstimo e devolução só pelas RPCs; ninguém apaga empréstimo (histórico).
--    Acervo também não apaga: baixa por ativo = false.
--  * Capas: bucket privado library-covers/<school_id>/<item_id>/<arquivo>.

-- ═══ 1. Tabelas ═══
create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  autor text check (autor is null or length(autor) <= 200),
  editora text check (editora is null or length(editora) <= 200),
  isbn text check (isbn is null or length(isbn) <= 20),
  categoria text check (categoria is null or length(categoria) <= 80),
  faixa_etaria text check (faixa_etaria is null or length(faixa_etaria) <= 40),
  capa_path text check (capa_path is null or length(capa_path) <= 300),
  ativo boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id)
);
create index if not exists idx_library_items_escola on public.library_items(school_id, titulo);

create table if not exists public.library_copies (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  item_id uuid not null,
  tombo text not null check (length(btrim(tombo)) between 1 and 40),
  estado text not null default 'bom' check (estado in ('bom', 'regular', 'ruim', 'perdido')),
  localizacao text check (localizacao is null or length(localizacao) <= 80),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, tombo),
  unique (id, school_id),
  foreign key (item_id, school_id) references public.library_items(id, school_id) on delete restrict
);
create index if not exists idx_library_copies_item on public.library_copies(school_id, item_id);

create table if not exists public.library_loans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  copy_id uuid not null,
  borrower_type text not null check (borrower_type in ('aluno', 'funcionario')),
  student_id uuid references public.students(id) on delete restrict,
  user_id uuid references public.users(id) on delete restrict,
  emprestado_em timestamptz not null default now(),
  devolver_ate date not null,
  devolvido_em timestamptz,
  registrado_por uuid references public.users(id) on delete set null,
  devolucao_registrada_por uuid references public.users(id) on delete set null,
  aviso_vespera_em date,
  aviso_atraso_em date,
  created_at timestamptz not null default now(),
  foreign key (copy_id, school_id) references public.library_copies(id, school_id) on delete restrict,
  check (
    (borrower_type = 'aluno' and student_id is not null and user_id is null)
    or (borrower_type = 'funcionario' and user_id is not null and student_id is null)
  ),
  check (devolvido_em is null or devolvido_em >= emprestado_em - interval '1 minute')
);
-- Um exemplar tem no máximo um empréstimo aberto.
create unique index if not exists uq_library_loans_aberto
  on public.library_loans(copy_id) where devolvido_em is null;
create index if not exists idx_library_loans_prazo
  on public.library_loans(school_id, devolver_ate) where devolvido_em is null;
create index if not exists idx_library_loans_aluno on public.library_loans(school_id, student_id);

alter table public.library_items enable row level security;
alter table public.library_copies enable row level security;
alter table public.library_loans enable row level security;

-- ═══ 2. Permissão e quem pode gerenciar ═══
insert into public.permission_catalog (permission, label, area, default_roles) values
  ('biblioteca.gerenciar', 'Gerenciar acervo e empréstimos da biblioteca', 'Biblioteca', array[]::text[])
on conflict (permission) do update set label = excluded.label, area = excluded.area;

-- Módulo ligado na escola do usuário (lido como = true, "tudo começa desativado").
create or replace function public.library_modulo_ligado()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select (s.features_enabled ->> 'biblioteca') = 'true'
                     from public.schools s
                    where s.id = public.get_my_school_id()), false);
$$;

-- Gestão e Coordenação/Direção sempre; Recepção e Professora só com a permissão.
-- has_permission() devolve false para gestao_pedagogica, por isso a checagem direta.
create or replace function public.library_pode_gerenciar()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.library_modulo_ligado()
     and case
           when coalesce(public.get_my_role(), '') in ('gestao', 'gestao_pedagogica') then true
           when coalesce(public.get_my_role(), '') in ('admin', 'teacher') then public.has_permission('biblioteca.gerenciar')
           else false
         end;
$$;

revoke execute on function public.library_modulo_ligado() from public, anon;
revoke execute on function public.library_pode_gerenciar() from public, anon;
grant execute on function public.library_modulo_ligado() to authenticated;
grant execute on function public.library_pode_gerenciar() to authenticated;

-- ═══ 3. Policies (sem DELETE em nenhuma tabela) ═══
create policy "Biblioteca le acervo da escola" on public.library_items
  for select using (school_id = public.get_my_school_id() and public.library_pode_gerenciar());
create policy "Biblioteca cadastra acervo da escola" on public.library_items
  for insert with check (school_id = public.get_my_school_id() and public.library_pode_gerenciar());
create policy "Biblioteca edita acervo da escola" on public.library_items
  for update using (school_id = public.get_my_school_id() and public.library_pode_gerenciar())
  with check (school_id = public.get_my_school_id() and public.library_pode_gerenciar());

create policy "Biblioteca le exemplares da escola" on public.library_copies
  for select using (school_id = public.get_my_school_id() and public.library_pode_gerenciar());
create policy "Biblioteca cadastra exemplares da escola" on public.library_copies
  for insert with check (school_id = public.get_my_school_id() and public.library_pode_gerenciar());
create policy "Biblioteca edita exemplares da escola" on public.library_copies
  for update using (school_id = public.get_my_school_id() and public.library_pode_gerenciar())
  with check (school_id = public.get_my_school_id() and public.library_pode_gerenciar());

-- Empréstimos: só leitura direta; gravação pelas RPCs abaixo.
create policy "Biblioteca le emprestimos da escola" on public.library_loans
  for select using (school_id = public.get_my_school_id() and public.library_pode_gerenciar());

-- Identidade nunca muda (escola, item de um exemplar, vínculo de um empréstimo).
create or replace function public.library_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'library_items' then
      new.created_by := coalesce(auth.uid(), new.created_by);
    end if;
    return new;
  end if;
  if new.id <> old.id or new.school_id <> old.school_id then
    raise exception 'Identidade do registro não pode ser alterada';
  end if;
  if tg_table_name = 'library_copies' and new.item_id <> old.item_id then
    raise exception 'O exemplar não pode trocar de livro';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists library_items_guard on public.library_items;
create trigger library_items_guard before insert or update on public.library_items
  for each row execute function public.library_guard();
drop trigger if exists library_copies_guard on public.library_copies;
create trigger library_copies_guard before insert or update on public.library_copies
  for each row execute function public.library_guard();

-- Empréstimo só muda para registrar devolução (e os carimbos de aviso, que o
-- cron grava como service role, sem sessão).
create or replace function public.library_loans_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Empréstimo não pode ser apagado';
  end if;
  if new.id <> old.id or new.school_id <> old.school_id or new.copy_id <> old.copy_id
     or new.borrower_type <> old.borrower_type
     or new.student_id is distinct from old.student_id or new.user_id is distinct from old.user_id
     or new.emprestado_em <> old.emprestado_em or new.devolver_ate <> old.devolver_ate
     or new.registrado_por is distinct from old.registrado_por then
    raise exception 'O empréstimo só pode ser alterado para registrar a devolução';
  end if;
  if old.devolvido_em is not null then
    raise exception 'Empréstimo já devolvido';
  end if;
  return new;
end;
$$;
drop trigger if exists library_loans_guard on public.library_loans;
create trigger library_loans_guard before update or delete on public.library_loans
  for each row execute function public.library_loans_guard();

-- ═══ 4. RPCs ═══
create or replace function public.library_emprestar(
  p_copy_id uuid,
  p_borrower_type text,
  p_student_id uuid,
  p_user_id uuid,
  p_devolver_ate date
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_copy record;
  v_id uuid;
begin
  if v_school is null or not public.library_pode_gerenciar() then
    raise exception 'Sem permissão para registrar empréstimos';
  end if;
  if p_devolver_ate is null or p_devolver_ate < current_date or p_devolver_ate > current_date + 180 then
    raise exception 'A data de devolução deve ser de hoje até 180 dias';
  end if;

  select c.id, c.ativo, c.estado into v_copy
    from public.library_copies c where c.id = p_copy_id and c.school_id = v_school;
  if not found then raise exception 'Exemplar não encontrado'; end if;
  if not v_copy.ativo or v_copy.estado = 'perdido' then
    raise exception 'Este exemplar não está disponível para empréstimo';
  end if;

  if p_borrower_type = 'aluno' then
    if p_user_id is not null or p_student_id is null
       or not exists (select 1 from public.students s where s.id = p_student_id and s.school_id = v_school) then
      raise exception 'Aluno não encontrado nesta escola';
    end if;
  elsif p_borrower_type = 'funcionario' then
    if p_student_id is not null or p_user_id is null
       or not exists (select 1 from public.users u
                       where u.id = p_user_id and u.school_id = v_school
                         and u.role in ('admin', 'teacher', 'gestao', 'gestao_pedagogica', 'financeiro')) then
      raise exception 'Funcionário não encontrado nesta escola';
    end if;
  else
    raise exception 'Tipo de tomador inválido';
  end if;

  begin
    insert into public.library_loans (school_id, copy_id, borrower_type, student_id, user_id, devolver_ate, registrado_por)
    values (v_school, p_copy_id, p_borrower_type, p_student_id, p_user_id, p_devolver_ate, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Este exemplar já está emprestado';
  end;
  return v_id;
end;
$$;

create or replace function public.library_devolver(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_rows int;
begin
  if v_school is null or not public.library_pode_gerenciar() then
    raise exception 'Sem permissão para registrar devoluções';
  end if;
  update public.library_loans
     set devolvido_em = now(), devolucao_registrada_por = auth.uid()
   where id = p_loan_id and school_id = v_school and devolvido_em is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'Empréstimo não encontrado ou já devolvido'; end if;
end;
$$;

-- Família: só os livros dos próprios filhos, da escola do usuário.
create or replace function public.library_meus_emprestimos()
returns table (
  id uuid, student_id uuid, student_name text, titulo text, autor text,
  emprestado_em timestamptz, devolver_ate date, devolvido_em timestamptz
)
language sql stable security definer
set search_path to 'public'
as $$
  select l.id, l.student_id, s.name, i.titulo, i.autor, l.emprestado_em, l.devolver_ate, l.devolvido_em
    from public.library_loans l
    join public.students s on s.id = l.student_id and s.school_id = l.school_id
    join public.library_copies c on c.id = l.copy_id and c.school_id = l.school_id
    join public.library_items i on i.id = c.item_id and i.school_id = c.school_id
   where l.school_id = public.get_my_school_id()
     and public.get_my_role() = 'family'
     and s.family_id = auth.uid()
     and (select (sc.features_enabled ->> 'biblioteca') = 'true' from public.schools sc where sc.id = l.school_id)
   order by (l.devolvido_em is not null), l.devolver_ate
   limit 200;
$$;

revoke execute on function public.library_emprestar(uuid, text, uuid, uuid, date) from public, anon;
revoke execute on function public.library_devolver(uuid) from public, anon;
revoke execute on function public.library_meus_emprestimos() from public, anon;
grant execute on function public.library_emprestar(uuid, text, uuid, uuid, date) to authenticated;
grant execute on function public.library_devolver(uuid) to authenticated;
grant execute on function public.library_meus_emprestimos() to authenticated;

-- ═══ 5. Capas (bucket privado, caminho <school_id>/<item_id>/<arquivo>) ═══
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library-covers', 'library-covers', false, 2097152,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Biblioteca le capas da escola" on storage.objects;
create policy "Biblioteca le capas da escola" on storage.objects
  for select using (
    bucket_id = 'library-covers'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and public.library_pode_gerenciar()
    and exists (select 1 from public.library_items i
                 where i.id::text = (storage.foldername(name))[2] and i.school_id = get_my_school_id())
  );
drop policy if exists "Biblioteca envia capas da escola" on storage.objects;
create policy "Biblioteca envia capas da escola" on storage.objects
  for insert with check (
    bucket_id = 'library-covers'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and public.library_pode_gerenciar()
    and exists (select 1 from public.library_items i
                 where i.id::text = (storage.foldername(name))[2] and i.school_id = get_my_school_id())
  );
drop policy if exists "Biblioteca apaga capas da escola" on storage.objects;
create policy "Biblioteca apaga capas da escola" on storage.objects
  for delete using (
    bucket_id = 'library-covers'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and public.library_pode_gerenciar()
  );

-- ═══ 6. Preço (adicional, fora de pacotes; igual ao financeiro_avancado) ═══
insert into public.zela_modulo_precos (item_id, tipo_cobranca, valor, custo_estimado, chaves)
values ('biblioteca', 'por_aluno', 1.50, 0.10, array['biblioteca'])
on conflict (item_id) do nothing;

-- Tour guiado (onboarding): registra que o usuário já viu o tour do seu perfil,
-- para ele aparecer sozinho só no primeiro acesso. Cada linha pertence a um
-- usuário e a uma escola; ninguém lê nem grava a linha de outro usuário.
-- Aditiva: tabela nova, não altera tabelas nem policies existentes.

create table if not exists public.tour_visto (
  user_id   uuid not null references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  tour_id   text not null check (tour_id in ('admin', 'gestao', 'professor', 'familia')),
  visto_em  timestamptz not null default now(),
  primary key (user_id, tour_id)
);

alter table public.tour_visto enable row level security;

-- Sem policy para anon e sem delete: o "já viu" só é criado ou atualizado.
create policy "Usuario le o proprio tour_visto" on public.tour_visto
  for select to authenticated
  using (user_id = auth.uid());

create policy "Usuario registra o proprio tour_visto" on public.tour_visto
  for insert to authenticated
  with check (user_id = auth.uid() and school_id is not distinct from get_my_school_id());

create policy "Usuario atualiza o proprio tour_visto" on public.tour_visto
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and school_id is not distinct from get_my_school_id());

revoke all on public.tour_visto from anon;
grant select, insert, update on public.tour_visto to authenticated;

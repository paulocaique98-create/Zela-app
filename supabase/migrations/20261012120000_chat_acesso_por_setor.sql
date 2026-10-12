-- Chat: a escola (Administrativo/Gestão) configura quem VÊ e quem RESPONDE em
-- cada setor. Antes a regra era fixa: staff só no próprio setor (users.departamento)
-- ou tudo (users.chat_visibilidade_total), e a Gestão (role 'gestao') não tinha
-- policy de chat nenhuma.
--
-- Regras (padrão, quando a escola não configurou nada):
--   gestao                  -> vê e responde TODOS os setores da escola (fixo, nunca se tranca)
--   admin / gestao_pedagogica com chat_visibilidade_total -> todos (como já era)
--   admin / gestao_pedagogica sem isso -> só o setor igual ao seu departamento
-- A escola pode ajustar, por perfil (departamento) x setor, ver e responder em
-- chat_acesso_setor. Só a Gestão grava. Suporte Zela não entra aqui (continua
-- fechado: família nunca vê, só developer responde).
-- Preservado: horário comercial (07h–19h) no envio, isolamento por school_id,
-- policies de família e developer. Nenhum dado existente é alterado.

-- ═══ 1. Configuração por escola ══════════════════════════════════════════
create table if not exists public.chat_acesso_setor (
  school_id uuid not null references public.schools(id) on delete cascade,
  perfil text not null check (perfil in ('administrativo', 'diretoria_pedagogica', 'coordenacao', 'recepcao')),
  setor text not null check (setor in ('administrativo', 'diretoria_pedagogica', 'coordenacao', 'recepcao')),
  pode_ver boolean not null default false,
  pode_responder boolean not null default false,
  updated_by uuid references public.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (school_id, perfil, setor),
  check (not pode_responder or pode_ver)
);

alter table public.chat_acesso_setor enable row level security;

create policy "Escola le o acesso ao chat por setor" on public.chat_acesso_setor
  for select using (school_id = get_my_school_id() or get_my_role() = 'developer');

create policy "Gestao ajusta o acesso ao chat por setor" on public.chat_acesso_setor
  for all using (school_id = get_my_school_id() and get_my_role() = 'gestao')
  with check (school_id = get_my_school_id() and get_my_role() = 'gestao');

-- ═══ 2. Funções de decisão ═══════════════════════════════════════════════
-- Núcleo: decide por usuário (usado pela Edge Function, com service_role).
create or replace function public.chat_pode_user(p_user uuid, p_school uuid, p_setor text, p_acao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_acao in ('ver', 'responder')
    and p_setor in ('administrativo', 'diretoria_pedagogica', 'coordenacao', 'recepcao')
    and p_school is not null
    and exists (
      select 1 from public.users u
       where u.id = p_user
         and u.school_id = p_school
         and (
           u.role = 'gestao'
           or (u.role in ('admin', 'gestao_pedagogica') and (
                coalesce(u.chat_visibilidade_total, false)
                or coalesce(
                  (select a.pode_ver and (p_acao = 'ver' or a.pode_responder)
                     from public.chat_acesso_setor a
                    where a.school_id = p_school and a.perfil = u.departamento and a.setor = p_setor),
                  u.departamento = p_setor,
                  false)))
         )
    );
$function$;

revoke execute on function public.chat_pode_user(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.chat_pode_user(uuid, uuid, text, text) to service_role;

-- Para as policies: o usuário logado, na própria escola.
create or replace function public.chat_pode(p_setor text, p_acao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.chat_pode_user(auth.uid(), public.get_my_school_id(), p_setor, p_acao);
$function$;

revoke execute on function public.chat_pode(text, text) from public, anon;
grant execute on function public.chat_pode(text, text) to authenticated;

-- Quem recebe aviso quando a família escreve (Edge Function notify-chat-message).
create or replace function public.chat_destinatarios(p_school uuid, p_setor text)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.id from public.users u
   where u.school_id = p_school
     and u.role in ('admin', 'gestao_pedagogica', 'gestao')
     and public.chat_pode_user(u.id, p_school, p_setor, 'ver');
$function$;

revoke execute on function public.chat_destinatarios(uuid, text) from public, anon, authenticated;
grant execute on function public.chat_destinatarios(uuid, text) to service_role;

-- ═══ 3. Policies: Recepção/Admin e Gestão Pedagógica passam a usar a matriz ═
alter policy "Admins acessam threads do proprio setor" on public.chat_threads
  using (get_my_role() = 'admin' and school_id = get_my_school_id()
         and setor <> 'suporte_zela' and chat_pode(setor, 'ver'))
  with check (get_my_role() = 'admin' and school_id = get_my_school_id()
              and setor <> 'suporte_zela' and chat_pode(setor, 'ver'));

alter policy "Admins leem mensagens do proprio setor" on public.chat_messages
  using (get_my_role() = 'admin'
         and thread_id in (select t.id from public.chat_threads t
                            where t.school_id = get_my_school_id() and t.setor <> 'suporte_zela'
                              and chat_pode(t.setor, 'ver')));

alter policy "Admins enviam mensagens em horario comercial" on public.chat_messages
  with check (get_my_role() = 'admin'
              and sender_id = auth.uid()
              and (now() at time zone 'America/Sao_Paulo')::time between time '07:00' and time '19:00'
              and thread_id in (select t.id from public.chat_threads t
                                 where t.school_id = get_my_school_id() and t.setor <> 'suporte_zela'
                                   and chat_pode(t.setor, 'responder')));

alter policy "Gestao pedagogica acessa conversas do proprio setor" on public.chat_threads
  using (gp_da_escola(school_id) and setor <> 'suporte_zela' and chat_pode(setor, 'ver'))
  with check (gp_da_escola(school_id) and setor <> 'suporte_zela' and chat_pode(setor, 'ver'));

alter policy "Gestao pedagogica le mensagens do proprio setor" on public.chat_messages
  using (coalesce(get_my_role(), '') = 'gestao_pedagogica'
         and thread_id in (select t.id from public.chat_threads t
                            where t.school_id = get_my_school_id() and t.setor <> 'suporte_zela'
                              and chat_pode(t.setor, 'ver')));

alter policy "Gestao pedagogica envia mensagens em horario comercial" on public.chat_messages
  with check (coalesce(get_my_role(), '') = 'gestao_pedagogica'
              and sender_id = auth.uid()
              and (now() at time zone 'America/Sao_Paulo')::time between time '07:00' and time '19:00'
              and thread_id in (select t.id from public.chat_threads t
                                 where t.school_id = get_my_school_id() and t.setor <> 'suporte_zela'
                                   and chat_pode(t.setor, 'responder')));

-- ═══ 4. Gestão (Administrativo): todos os setores da própria escola ═══════
create policy "Gestao acessa conversas da escola" on public.chat_threads
  for all using (get_my_role() = 'gestao' and school_id = get_my_school_id()
                 and setor <> 'suporte_zela' and chat_pode(setor, 'ver'))
  with check (get_my_role() = 'gestao' and school_id = get_my_school_id()
              and setor <> 'suporte_zela' and chat_pode(setor, 'ver'));

create policy "Gestao le mensagens da escola" on public.chat_messages
  for select using (get_my_role() = 'gestao'
                    and thread_id in (select t.id from public.chat_threads t
                                       where t.school_id = get_my_school_id() and t.setor <> 'suporte_zela'
                                         and chat_pode(t.setor, 'ver')));

create policy "Gestao envia mensagens em horario comercial" on public.chat_messages
  for insert with check (get_my_role() = 'gestao'
                         and sender_id = auth.uid()
                         and (now() at time zone 'America/Sao_Paulo')::time between time '07:00' and time '19:00'
                         and thread_id in (select t.id from public.chat_threads t
                                            where t.school_id = get_my_school_id() and t.setor <> 'suporte_zela'
                                              and chat_pode(t.setor, 'responder')));

-- Conversa própria da Gestão com o Suporte Zela (mesmo molde da Gestão Pedagógica).
create policy "Gestao gerencia a propria conversa de suporte" on public.chat_threads
  for all using (get_my_role() = 'gestao' and setor = 'suporte_zela' and family_id = auth.uid())
  with check (get_my_role() = 'gestao' and setor = 'suporte_zela' and family_id = auth.uid()
              and school_id = get_my_school_id());

create policy "Gestao le a propria conversa de suporte" on public.chat_messages
  for select using (get_my_role() = 'gestao'
                    and thread_id in (select t.id from public.chat_threads t
                                       where t.family_id = auth.uid() and t.setor = 'suporte_zela'));

create policy "Gestao escreve na propria conversa de suporte" on public.chat_messages
  for insert with check (get_my_role() = 'gestao' and sender_id = auth.uid()
                         and thread_id in (select t.id from public.chat_threads t
                                            where t.family_id = auth.uid() and t.setor = 'suporte_zela'));

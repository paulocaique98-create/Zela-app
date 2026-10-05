-- Planos do Zela · 05/10/2026 (PLANO_MENU_PLANOS_DEV.md)
--
-- Formas de contratação da escola com o Zela (NÃO é a mensalidade da família,
-- que fica em planos_de_mensalidade). Tabelas novas, nada existente é alterado.
--
--   zela_config_comercial  linha única: limite "por aluno", teto de desconto, faixa de implantação
--   zela_modulo_precos     preço de cada item vendável do catálogo (+ chaves de features_enabled)
--   zela_planos            planos (por aluno ou pacote)
--   zela_plano_ciclos      ciclos de cada plano (mensal, semestral, anual, bianual)
--   school_contratacoes    contratação de cada escola (com snapshot dos valores)
--   zela_planos_historico  antes e depois de cada mudança de preço ou plano
--
-- Segurança:
--   Catálogo (zela_*): só o developer lê e escreve. Nenhum outro role lê preço de custo.
--   school_contratacoes (school_id): developer só lê; gravação SOMENTE pela RPC
--     contratar_plano_escola (security definer, exige developer, recalcula tudo no servidor).
--   Gestão da escola lê a PRÓPRIA contratação só pela RPC meu_plano_escola (sem custo,
--     sem motivo de desconto).
--   Ninguém apaga: desativação por ativo = false. Sem Realtime, sem Storage.

-- ═══ 1. Configuração comercial (linha única) ═══
create table if not exists public.zela_config_comercial (
  id boolean primary key default true check (id),
  limite_alunos_por_aluno integer not null default 50 check (limite_alunos_por_aluno between 1 and 10000),
  desconto_implantacao_max_percent numeric(5,2) not null default 50 check (desconto_implantacao_max_percent between 0 and 100),
  implantacao_min numeric(12,2) not null default 600 check (implantacao_min >= 0),
  implantacao_max numeric(12,2) not null default 1200 check (implantacao_max >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (implantacao_max >= implantacao_min)
);
insert into public.zela_config_comercial (id) values (true) on conflict (id) do nothing;

-- ═══ 2. Preço dos módulos ═══
create table if not exists public.zela_modulo_precos (
  item_id text primary key check (item_id ~ '^[a-z0-9_]+$'),
  tipo_cobranca text not null check (tipo_cobranca in ('por_aluno', 'fixo_mensal')),
  valor numeric(12,2) not null default 0 check (valor >= 0),
  custo_estimado numeric(12,2) not null default 0 check (custo_estimado >= 0),
  -- Chaves de schools.features_enabled que o item liga (espelho do modulosCatalogo.js).
  chaves text[] not null default '{}',
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ═══ 3. Planos ═══
create table if not exists public.zela_planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  modalidade text not null check (modalidade in ('por_aluno', 'pacote')),
  -- Itens além do plano base (que é sempre incluso). Pacote: fixos. Por aluno: escolhidos na contratação.
  itens text[] not null default '{}',
  preco_por_aluno numeric(12,2) not null default 0 check (preco_por_aluno >= 0),
  minimo_mensal numeric(12,2) not null default 0 check (minimo_mensal >= 0),
  alunos_min integer check (alunos_min is null or alunos_min >= 1),
  alunos_max integer check (alunos_max is null or alunos_max >= 1),
  implantacao_valor numeric(12,2) not null default 0 check (implantacao_valor >= 0),
  ordem integer not null default 0,
  ativo boolean not null default true,
  descricao text check (descricao is null or length(descricao) <= 500),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (alunos_max is null or alunos_min is null or alunos_max >= alunos_min)
);
create unique index if not exists zela_planos_nome_ativo_uidx
  on public.zela_planos (lower(btrim(nome))) where ativo;

-- ═══ 4. Ciclos ═══
create table if not exists public.zela_plano_ciclos (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.zela_planos(id) on delete restrict,
  ciclo text not null check (ciclo in ('MENSAL', 'SEMESTRAL', 'ANUAL', 'BIANUAL')),
  meses integer not null,
  desconto_percent numeric(5,2) not null default 0 check (desconto_percent between 0 and 50),
  implantacao_valor numeric(12,2) check (implantacao_valor is null or implantacao_valor >= 0),
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (plano_id, ciclo),
  check ((ciclo = 'MENSAL' and meses = 1) or (ciclo = 'SEMESTRAL' and meses = 6)
      or (ciclo = 'ANUAL' and meses = 12) or (ciclo = 'BIANUAL' and meses = 24))
);

-- ═══ 5. Contratações das escolas ═══
create table if not exists public.school_contratacoes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  plano_id uuid not null references public.zela_planos(id) on delete restrict,
  ciclo text not null check (ciclo in ('MENSAL', 'SEMESTRAL', 'ANUAL', 'BIANUAL')),
  meses integer not null check (meses in (1, 6, 12, 24)),
  alunos_contratados integer not null check (alunos_contratados >= 1),
  itens text[] not null default '{}',
  snapshot jsonb not null,
  valor_mensal numeric(12,2) not null check (valor_mensal >= 0),
  valor_ciclo numeric(12,2) not null check (valor_ciclo >= 0),
  implantacao_base numeric(12,2) not null check (implantacao_base >= 0),
  implantacao_desconto_tipo text check (implantacao_desconto_tipo in ('percent', 'valor')),
  implantacao_desconto numeric(12,2) not null default 0 check (implantacao_desconto >= 0),
  implantacao_final numeric(12,2) not null check (implantacao_final >= 0),
  desconto_motivo text check (desconto_motivo is null or length(desconto_motivo) <= 300),
  inicio date not null,
  fim date not null,
  status text not null default 'ativa' check (status in ('rascunho', 'ativa', 'encerrada', 'cancelada')),
  encerrada_em timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  check (fim > inicio)
);
create unique index if not exists school_contratacoes_ativa_uidx
  on public.school_contratacoes (school_id) where status = 'ativa';
create index if not exists school_contratacoes_school_idx
  on public.school_contratacoes (school_id, created_at desc);

-- ═══ 6. Histórico de preços e planos ═══
create table if not exists public.zela_planos_historico (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id text not null,
  acao text not null,
  antes jsonb,
  depois jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists zela_planos_historico_idx
  on public.zela_planos_historico (tabela, registro_id, changed_at desc);

-- ═══ 7. Triggers ═══

-- Carimbo de quando e quem mexeu.
create or replace function public.zela_carimbar()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

drop trigger if exists zela_carimbar_cfg on public.zela_config_comercial;
create trigger zela_carimbar_cfg before insert or update on public.zela_config_comercial
for each row execute function public.zela_carimbar();
drop trigger if exists zela_carimbar_precos on public.zela_modulo_precos;
create trigger zela_carimbar_precos before insert or update on public.zela_modulo_precos
for each row execute function public.zela_carimbar();
drop trigger if exists zela_carimbar_planos on public.zela_planos;
create trigger zela_carimbar_planos before insert or update on public.zela_planos
for each row execute function public.zela_carimbar();
drop trigger if exists zela_carimbar_ciclos on public.zela_plano_ciclos;
create trigger zela_carimbar_ciclos before insert or update on public.zela_plano_ciclos
for each row execute function public.zela_carimbar();

-- Valida o plano: itens existem na tabela de preços (nunca técnicos, que não
-- estão lá), sem repetir e sem o base; implantação dentro da faixa configurada.
create or replace function public.zela_validar_plano()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg public.zela_config_comercial%rowtype;
begin
  select * into v_cfg from public.zela_config_comercial where id;
  if exists (select 1 from unnest(new.itens) i where i = 'base' or i is null) then
    raise exception 'O plano base é sempre incluso e não entra na lista de itens.';
  end if;
  if (select count(distinct i) from unnest(new.itens) i) <> coalesce(array_length(new.itens, 1), 0) then
    raise exception 'Item repetido no plano.';
  end if;
  if exists (select 1 from unnest(new.itens) i where not exists (select 1 from public.zela_modulo_precos p where p.item_id = i)) then
    raise exception 'O plano tem um item que não existe no catálogo de preços.';
  end if;
  if tg_op = 'INSERT' or new.implantacao_valor is distinct from old.implantacao_valor then
    if new.implantacao_valor < v_cfg.implantacao_min or new.implantacao_valor > v_cfg.implantacao_max then
      raise exception 'A implantação deve ficar entre % e % (faixa definida na configuração comercial).', v_cfg.implantacao_min, v_cfg.implantacao_max;
    end if;
  end if;
  if new.modalidade = 'por_aluno' and new.alunos_max is not null and new.alunos_max > v_cfg.limite_alunos_por_aluno then
    raise exception 'Plano por aluno aceita no máximo % alunos.', v_cfg.limite_alunos_por_aluno;
  end if;
  return new;
end;
$function$;
revoke execute on function public.zela_validar_plano() from public, anon, authenticated;

drop trigger if exists zela_validar_plano_trg on public.zela_planos;
create trigger zela_validar_plano_trg before insert or update on public.zela_planos
for each row execute function public.zela_validar_plano();

create or replace function public.zela_validar_ciclo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg public.zela_config_comercial%rowtype;
  v_mod text;
begin
  select * into v_cfg from public.zela_config_comercial where id;
  select modalidade into v_mod from public.zela_planos where id = new.plano_id;
  if v_mod = 'por_aluno' and new.ciclo <> 'MENSAL' then
    raise exception 'Plano por aluno aceita só o ciclo mensal.';
  end if;
  if new.implantacao_valor is not null
     and (tg_op = 'INSERT' or new.implantacao_valor is distinct from old.implantacao_valor)
     and (new.implantacao_valor < v_cfg.implantacao_min or new.implantacao_valor > v_cfg.implantacao_max) then
    raise exception 'A implantação deve ficar entre % e % (faixa definida na configuração comercial).', v_cfg.implantacao_min, v_cfg.implantacao_max;
  end if;
  return new;
end;
$function$;
revoke execute on function public.zela_validar_ciclo() from public, anon, authenticated;

drop trigger if exists zela_validar_ciclo_trg on public.zela_plano_ciclos;
create trigger zela_validar_ciclo_trg before insert or update on public.zela_plano_ciclos
for each row execute function public.zela_validar_ciclo();

-- Histórico: antes e depois de cada mudança.
create or replace function public.zela_registrar_historico()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_depois jsonb := to_jsonb(new);
  v_antes jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
begin
  if tg_op = 'UPDATE' and v_antes - 'updated_at' - 'updated_by' = v_depois - 'updated_at' - 'updated_by' then
    return new;
  end if;
  begin
    insert into public.zela_planos_historico (tabela, registro_id, acao, antes, depois, changed_by)
    values (tg_table_name, coalesce(v_depois ->> 'id', v_depois ->> 'item_id'), tg_op, v_antes, v_depois, auth.uid());
  exception when others then
    raise warning 'zela_registrar_historico: %', sqlerrm;
  end;
  return new;
end;
$function$;
revoke execute on function public.zela_registrar_historico() from public, anon, authenticated;

drop trigger if exists zela_hist_precos on public.zela_modulo_precos;
create trigger zela_hist_precos after insert or update on public.zela_modulo_precos
for each row execute function public.zela_registrar_historico();
drop trigger if exists zela_hist_planos on public.zela_planos;
create trigger zela_hist_planos after insert or update on public.zela_planos
for each row execute function public.zela_registrar_historico();
drop trigger if exists zela_hist_ciclos on public.zela_plano_ciclos;
create trigger zela_hist_ciclos after insert or update on public.zela_plano_ciclos
for each row execute function public.zela_registrar_historico();
drop trigger if exists zela_hist_cfg on public.zela_config_comercial;
create trigger zela_hist_cfg after insert or update on public.zela_config_comercial
for each row execute function public.zela_registrar_historico();

-- ═══ 8. RLS ═══
alter table public.zela_config_comercial enable row level security;
alter table public.zela_modulo_precos enable row level security;
alter table public.zela_planos enable row level security;
alter table public.zela_plano_ciclos enable row level security;
alter table public.school_contratacoes enable row level security;
alter table public.zela_planos_historico enable row level security;

revoke all on public.zela_config_comercial, public.zela_modulo_precos, public.zela_planos,
  public.zela_plano_ciclos, public.school_contratacoes, public.zela_planos_historico from anon;
revoke delete on public.zela_config_comercial, public.zela_modulo_precos, public.zela_planos,
  public.zela_plano_ciclos, public.school_contratacoes, public.zela_planos_historico from authenticated;
-- Contratação e histórico: ninguém escreve direto (só RPC e triggers).
revoke insert, update on public.school_contratacoes, public.zela_planos_historico from authenticated;
-- Configuração é linha única: só atualiza.
revoke insert on public.zela_config_comercial from authenticated;

create policy "Developer le a configuracao comercial" on public.zela_config_comercial
  for select to authenticated using (public.get_my_role() = 'developer');
create policy "Developer altera a configuracao comercial" on public.zela_config_comercial
  for update to authenticated using (public.get_my_role() = 'developer') with check (public.get_my_role() = 'developer');

create policy "Developer le precos dos modulos" on public.zela_modulo_precos
  for select to authenticated using (public.get_my_role() = 'developer');
create policy "Developer cria precos dos modulos" on public.zela_modulo_precos
  for insert to authenticated with check (public.get_my_role() = 'developer');
create policy "Developer altera precos dos modulos" on public.zela_modulo_precos
  for update to authenticated using (public.get_my_role() = 'developer') with check (public.get_my_role() = 'developer');

create policy "Developer le os planos" on public.zela_planos
  for select to authenticated using (public.get_my_role() = 'developer');
create policy "Developer cria planos" on public.zela_planos
  for insert to authenticated with check (public.get_my_role() = 'developer');
create policy "Developer altera planos" on public.zela_planos
  for update to authenticated using (public.get_my_role() = 'developer') with check (public.get_my_role() = 'developer');

create policy "Developer le os ciclos" on public.zela_plano_ciclos
  for select to authenticated using (public.get_my_role() = 'developer');
create policy "Developer cria ciclos" on public.zela_plano_ciclos
  for insert to authenticated with check (public.get_my_role() = 'developer');
create policy "Developer altera ciclos" on public.zela_plano_ciclos
  for update to authenticated using (public.get_my_role() = 'developer') with check (public.get_my_role() = 'developer');

create policy "Developer le as contratacoes" on public.school_contratacoes
  for select to authenticated using (public.get_my_role() = 'developer');

create policy "Developer le o historico de planos" on public.zela_planos_historico
  for select to authenticated using (public.get_my_role() = 'developer');

-- ═══ 9. Seed (planilhas TABELA_PRECOS_ZELA e SIMULACAO_PRECOS_ZELA) ═══
insert into public.zela_modulo_precos (item_id, tipo_cobranca, valor, custo_estimado, chaves, ativo) values
  ('base',       'por_aluno',   6.90, 1.50, array['cadastros','gerenciamento','formularios','checkin','comunicados','calendario','configuracoes','financeiro'], true),
  ('pedagogico', 'por_aluno',   3.50, 0.15, array['relatorios_pedagogicos','frequencia','materias'], true),
  ('rotina',     'por_aluno',   2.50, 0.15, array['diario','mural','cardapio'], true),
  ('chat',       'por_aluno',   1.50, 0.10, array['chat'], true),
  ('liveness',   'por_aluno',   1.50, 0.10, array['liveness_detection'], true),
  ('qr',         'por_aluno',   1.00, 0.05, array['qr_checkin'], true),
  -- App com a marca: cobrança fixa, nasce desativado (ainda não existe).
  ('app_marca',  'fixo_mensal', 300.00, 0, array[]::text[], false)
on conflict (item_id) do nothing;

do $seed$
declare
  v_id uuid;
begin
  if exists (select 1 from public.zela_planos) then
    return;
  end if;

  insert into public.zela_planos (nome, modalidade, itens, preco_por_aluno, minimo_mensal, implantacao_valor, ordem, descricao)
  values ('Por aluno', 'por_aluno', '{}', 0, 0, 600, 0, 'Para escolas com até 50 alunos: o valor soma o plano base e os módulos escolhidos.')
  returning id into v_id;
  insert into public.zela_plano_ciclos (plano_id, ciclo, meses, desconto_percent) values (v_id, 'MENSAL', 1, 0);

  insert into public.zela_planos (nome, modalidade, itens, preco_por_aluno, minimo_mensal, implantacao_valor, ordem, descricao)
  values ('Essencial', 'pacote', '{}', 6.90, 450, 600, 1, 'Plano base: entrada e saída, cadastros, comunicados, financeiro e contratos.')
  returning id into v_id;
  insert into public.zela_plano_ciclos (plano_id, ciclo, meses, desconto_percent) values
    (v_id, 'MENSAL', 1, 0), (v_id, 'SEMESTRAL', 6, 5), (v_id, 'ANUAL', 12, 10), (v_id, 'BIANUAL', 24, 15);

  insert into public.zela_planos (nome, modalidade, itens, preco_por_aluno, minimo_mensal, implantacao_valor, ordem, descricao)
  values ('Completo', 'pacote', array['pedagogico','rotina'], 11.90, 790, 900, 2, 'Essencial mais Pedagógico e Rotina e família.')
  returning id into v_id;
  insert into public.zela_plano_ciclos (plano_id, ciclo, meses, desconto_percent) values
    (v_id, 'MENSAL', 1, 0), (v_id, 'SEMESTRAL', 6, 5), (v_id, 'ANUAL', 12, 10), (v_id, 'BIANUAL', 24, 15);

  insert into public.zela_planos (nome, modalidade, itens, preco_por_aluno, minimo_mensal, implantacao_valor, ordem, descricao)
  values ('Premium', 'pacote', array['pedagogico','rotina','chat','liveness','qr'], 15.90, 990, 1200, 3, 'Completo mais Chat, Prova de vida e Entrada por QR Code.')
  returning id into v_id;
  insert into public.zela_plano_ciclos (plano_id, ciclo, meses, desconto_percent) values
    (v_id, 'MENSAL', 1, 0), (v_id, 'SEMESTRAL', 6, 5), (v_id, 'ANUAL', 12, 10), (v_id, 'BIANUAL', 24, 15);
end
$seed$;

-- ═══ 10. RPCs ═══

-- Alunos ativos por escola (para o limite "por aluno" e o alerta de passou de 50).
create or replace function public.contagem_alunos_escolas()
returns table (school_id uuid, ativos integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(public.get_my_role(), '') <> 'developer' then
    raise exception 'Apenas o suporte (developer) pode consultar isso.';
  end if;
  return query
    select s.school_id, count(*)::integer
    from public.students s
    where s.enrollment_status = 'ativo' and s.school_id is not null
    group by s.school_id;
end;
$function$;
revoke execute on function public.contagem_alunos_escolas() from public, anon;
grant execute on function public.contagem_alunos_escolas() to authenticated;

-- Contrata um plano para a escola. Todos os valores são recalculados aqui:
-- o que o frontend mostra é só prévia.
create or replace function public.contratar_plano_escola(
  p_school_id uuid,
  p_plano_id uuid,
  p_ciclo text,
  p_alunos integer default null,
  p_itens text[] default null,
  p_desconto_tipo text default null,
  p_desconto numeric default 0,
  p_motivo text default null,
  p_inicio date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg public.zela_config_comercial%rowtype;
  v_plano public.zela_planos%rowtype;
  v_ciclo public.zela_plano_ciclos%rowtype;
  v_school public.schools%rowtype;
  v_ativos integer;
  v_alunos integer;
  v_itens text[];
  v_ids text[];
  v_preco_aluno numeric(12,2);
  v_fixos numeric(12,2);
  v_mensal numeric(12,2);
  v_ciclo_valor numeric(12,2);
  v_impl_base numeric(12,2);
  v_impl_desc numeric(12,2) := 0;
  v_impl_final numeric(12,2);
  v_desconto numeric := coalesce(p_desconto, 0);
  v_inicio date := coalesce(p_inicio, current_date);
  v_precos jsonb;
  v_off jsonb;
  v_on jsonb;
  v_features jsonb;
  v_id uuid;
begin
  if coalesce(public.get_my_role(), '') <> 'developer' then
    raise exception 'Apenas o suporte (developer) pode contratar plano para uma escola.';
  end if;

  select * into v_cfg from public.zela_config_comercial where id;
  select * into v_school from public.schools where id = p_school_id for update;
  if not found then raise exception 'Escola não encontrada.'; end if;
  select * into v_plano from public.zela_planos where id = p_plano_id;
  if not found or not v_plano.ativo then raise exception 'Plano inexistente ou desativado.'; end if;
  select * into v_ciclo from public.zela_plano_ciclos where plano_id = p_plano_id and ciclo = p_ciclo;
  if not found or not v_ciclo.ativo then raise exception 'Ciclo indisponível para este plano.'; end if;

  select count(*)::integer into v_ativos from public.students
   where school_id = p_school_id and enrollment_status = 'ativo';
  v_alunos := coalesce(p_alunos, v_ativos);
  if v_alunos < 1 then raise exception 'Informe a quantidade de alunos contratados (mínimo 1).'; end if;

  -- R1: por aluno só até o limite, medido pelos alunos contratados e pelos ativos.
  if v_plano.modalidade = 'por_aluno'
     and (v_alunos > v_cfg.limite_alunos_por_aluno or v_ativos > v_cfg.limite_alunos_por_aluno) then
    raise exception 'A modalidade por aluno vale até % alunos. Contrate um pacote.', v_cfg.limite_alunos_por_aluno;
  end if;
  if v_plano.alunos_min is not null and v_alunos < v_plano.alunos_min then
    raise exception 'Este plano exige no mínimo % alunos.', v_plano.alunos_min;
  end if;
  if v_plano.alunos_max is not null and v_alunos > v_plano.alunos_max then
    raise exception 'Este plano aceita no máximo % alunos.', v_plano.alunos_max;
  end if;

  -- Itens: pacote usa os do plano; por aluno usa os escolhidos.
  if v_plano.modalidade = 'pacote' then
    v_itens := v_plano.itens;
  else
    v_itens := coalesce(p_itens, '{}');
  end if;
  v_itens := array(select distinct i from unnest(v_itens) i where i <> 'base' order by i);
  if exists (
    select 1 from unnest(v_itens) i
    where not exists (select 1 from public.zela_modulo_precos p where p.item_id = i and p.ativo)
  ) then
    raise exception 'Há um item inexistente ou desativado na lista de módulos.';
  end if;
  if not exists (select 1 from public.zela_modulo_precos where item_id = 'base' and ativo) then
    raise exception 'O preço do plano base está desativado.';
  end if;
  v_ids := array['base'] || v_itens;

  -- R2, R3, R4: mensalidade.
  select coalesce(sum(valor) filter (where tipo_cobranca = 'fixo_mensal'), 0)
    into v_fixos from public.zela_modulo_precos where item_id = any(v_ids);
  if v_plano.modalidade = 'pacote' then
    v_preco_aluno := v_plano.preco_por_aluno;
  else
    select coalesce(sum(valor) filter (where tipo_cobranca = 'por_aluno'), 0)
      into v_preco_aluno from public.zela_modulo_precos where item_id = any(v_ids);
  end if;
  v_mensal := round(greatest(v_alunos * v_preco_aluno, v_plano.minimo_mensal) + v_fixos, 2);
  v_ciclo_valor := round(v_mensal * v_ciclo.meses * (1 - v_ciclo.desconto_percent / 100.0), 2);

  -- R5, R6: implantação e desconto.
  v_impl_base := coalesce(v_ciclo.implantacao_valor, v_plano.implantacao_valor);
  if v_desconto < 0 then raise exception 'Desconto inválido.'; end if;
  if v_desconto > 0 then
    if p_desconto_tipo not in ('percent', 'valor') then raise exception 'Informe se o desconto é em porcentagem ou em reais.'; end if;
    if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'Informe o motivo do desconto na implantação.'; end if;
    if p_desconto_tipo = 'percent' then
      if v_desconto > v_cfg.desconto_implantacao_max_percent then
        raise exception 'O desconto máximo na implantação é de % por cento.', v_cfg.desconto_implantacao_max_percent;
      end if;
      v_impl_desc := round(v_impl_base * v_desconto / 100.0, 2);
    else
      if v_impl_base > 0 and v_desconto * 100.0 / v_impl_base > v_cfg.desconto_implantacao_max_percent then
        raise exception 'O desconto máximo na implantação é de % por cento.', v_cfg.desconto_implantacao_max_percent;
      end if;
      v_impl_desc := round(v_desconto, 2);
    end if;
  end if;
  v_impl_desc := least(v_impl_desc, v_impl_base);
  v_impl_final := greatest(v_impl_base - v_impl_desc, 0);

  -- R8: snapshot (sem custo estimado).
  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'tipo_cobranca', tipo_cobranca, 'valor', valor) order by item_id), '[]'::jsonb)
    into v_precos from public.zela_modulo_precos where item_id = any(v_ids);

  -- R9: módulos seguem o plano. O histórico é gravado pela trigger de schools.
  select coalesce(jsonb_object_agg(k, false), '{}'::jsonb) into v_off
    from (select distinct unnest(chaves) k from public.zela_modulo_precos) s;
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) into v_on
    from (select distinct unnest(chaves) k from public.zela_modulo_precos where item_id = any(v_ids)) s;
  v_features := coalesce(v_school.features_enabled, '{}'::jsonb) || v_off || v_on;
  -- O bloqueio da prova de vida (técnico) depende da prova de vida.
  if not ('liveness' = any(v_ids)) then
    v_features := v_features || '{"liveness_detection_enforce": false}'::jsonb;
  end if;

  update public.school_contratacoes
     set status = 'encerrada', encerrada_em = now()
   where school_id = p_school_id and status = 'ativa';

  insert into public.school_contratacoes (
    school_id, plano_id, ciclo, meses, alunos_contratados, itens, snapshot,
    valor_mensal, valor_ciclo, implantacao_base, implantacao_desconto_tipo,
    implantacao_desconto, implantacao_final, desconto_motivo, inicio, fim, status, created_by
  ) values (
    p_school_id, p_plano_id, p_ciclo, v_ciclo.meses, v_alunos, v_itens,
    jsonb_build_object(
      'plano', jsonb_build_object('id', v_plano.id, 'nome', v_plano.nome, 'modalidade', v_plano.modalidade,
                                  'preco_por_aluno', v_preco_aluno, 'minimo_mensal', v_plano.minimo_mensal),
      'ciclo', jsonb_build_object('ciclo', v_ciclo.ciclo, 'meses', v_ciclo.meses, 'desconto_percent', v_ciclo.desconto_percent),
      'precos', v_precos
    ),
    v_mensal, v_ciclo_valor, v_impl_base,
    case when v_desconto > 0 then p_desconto_tipo else null end,
    v_impl_desc, v_impl_final,
    case when v_desconto > 0 then btrim(p_motivo) else null end,
    v_inicio, (v_inicio + make_interval(months => v_ciclo.meses))::date, 'ativa', auth.uid()
  ) returning id into v_id;

  update public.schools set features_enabled = v_features where id = p_school_id;

  return v_id;
end;
$function$;
revoke execute on function public.contratar_plano_escola(uuid, uuid, text, integer, text[], text, numeric, text, date) from public, anon;
grant execute on function public.contratar_plano_escola(uuid, uuid, text, integer, text[], text, numeric, text, date) to authenticated;

-- "Meu plano": a Gestão (principal) da escola vê a própria contratação,
-- sem custo estimado, sem motivo de desconto e sem dados de outras escolas.
create or replace function public.meu_plano_escola()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_row public.school_contratacoes%rowtype;
  v_nome text;
  v_modalidade text;
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or public.get_my_school_id() is null then
    return null;
  end if;
  select * into v_row from public.school_contratacoes
   where school_id = public.get_my_school_id() and status = 'ativa';
  if not found then return null; end if;
  select nome, modalidade into v_nome, v_modalidade from public.zela_planos where id = v_row.plano_id;
  return jsonb_build_object(
    'plano', v_nome,
    'modalidade', v_modalidade,
    'ciclo', v_row.ciclo,
    'meses', v_row.meses,
    'alunos_contratados', v_row.alunos_contratados,
    'itens', v_row.itens,
    'valor_mensal', v_row.valor_mensal,
    'valor_ciclo', v_row.valor_ciclo,
    'implantacao_final', v_row.implantacao_final,
    'inicio', v_row.inicio,
    'fim', v_row.fim
  );
end;
$function$;
revoke execute on function public.meu_plano_escola() from public, anon;
grant execute on function public.meu_plano_escola() to authenticated;

-- Dados legais da escola (30/09/2026)
--
-- Pensando em contrato e, no futuro, nota fiscal de serviço (NFS-e):
--   · schools.name passa a ser o NOME FANTASIA (o que o sistema e as famílias
--     veem); razão social ganha coluna própria (contrato e nota);
--   · inscrição municipal (obrigatória para emitir NFS-e);
--   · código do município no IBGE (exigido na nota; vem sozinho da busca pelo
--     CEP);
--   · encarregado de dados (LGPD): nome e e-mail de quem responde pelos
--     dados pessoais;
--   · responsável legal (quem assina o contrato pela escola): nome, CPF e
--     cargo, numa tabela SEPARADA, porque schools é lida por todo mundo da
--     escola (inclusive famílias) e o CPF não pode ficar exposto assim.
--
-- Quem altera: razão social, CNPJ, inscrição municipal, e-mail oficial e
-- encarregado de dados só a Gestão ou o suporte (a Recepção continua
-- editando nome fantasia, telefone e endereço, como já fazia). Responsável
-- legal: só a Gestão ou o suporte gravam; leem a Gestão, o suporte e a
-- Recepção com permissão de gerar contrato (precisa para montar o contrato).

alter table public.schools
  add column if not exists razao_social text,
  add column if not exists inscricao_municipal text,
  add column if not exists codigo_ibge text,
  add column if not exists encarregado_dados_nome text,
  add column if not exists encarregado_dados_email text;

alter table public.schools drop constraint if exists schools_codigo_ibge_check;
alter table public.schools add constraint schools_codigo_ibge_check
  check (codigo_ibge is null or codigo_ibge = '' or codigo_ibge ~ '^[0-9]{7}$');

-- ─── Responsável legal ──────────────────────────────────────────────────────
create table if not exists public.escola_responsavel_legal (
  school_id uuid primary key references public.schools(id) on delete cascade,
  nome text not null,
  cpf text,
  cargo text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.users(id) on delete set null,
  constraint escola_responsavel_legal_cpf_check check (cpf is null or cpf = '' or cpf ~ '^[0-9]{11}$')
);

alter table public.escola_responsavel_legal enable row level security;
revoke all on public.escola_responsavel_legal from anon;

create policy "Gestao e suporte leem o responsavel legal"
on public.escola_responsavel_legal for select to authenticated
using (
  public.get_my_role() = 'developer'
  or (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao')
  or (school_id = public.get_my_school_id() and public.get_my_role() = 'admin' and public.has_permission('contratos.gerenciar'))
);

create policy "Gestao e suporte gravam o responsavel legal"
on public.escola_responsavel_legal for all to authenticated
using (public.get_my_role() = 'developer' or (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao'))
with check (public.get_my_role() = 'developer' or (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao'));

create or replace function public.carimbar_responsavel_legal()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  new.cpf := nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '');
  return new;
end;
$function$;

drop trigger if exists escola_responsavel_legal_carimbo on public.escola_responsavel_legal;
create trigger escola_responsavel_legal_carimbo
before insert or update on public.escola_responsavel_legal
for each row execute function public.carimbar_responsavel_legal();

-- ─── Quem altera os dados legais em schools ────────────────────────────────
-- Mesma função de antes, com o bloco novo dos dados legais.
create or replace function public.protect_school_pedagogical_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role -- não restringido
  END IF;

  IF (NEW.pedagogical_method IS DISTINCT FROM OLD.pedagogical_method)
     OR (NEW.custom_config IS DISTINCT FROM OLD.custom_config)
     OR (NEW.is_active IS DISTINCT FROM OLD.is_active)
     OR (NEW.features_enabled IS DISTINCT FROM OLD.features_enabled)
     OR (NEW.limits IS DISTINCT FROM OLD.limits)
     OR (NEW.plan IS DISTINCT FROM OLD.plan) THEN
    IF public.get_my_role() IS DISTINCT FROM 'developer' THEN
      RAISE EXCEPTION 'Apenas o suporte (developer) pode alterar essas configurações da escola (método pedagógico, status, módulos contratados, limites ou plano).';
    END IF;
  END IF;

  IF (NEW.turmas IS DISTINCT FROM OLD.turmas) AND NOT public.can_manage_turmas() THEN
    RAISE EXCEPTION 'Só a Gestão da escola (ou o suporte) pode gerenciar as turmas.';
  END IF;

  IF ((NEW.login_image_url IS DISTINCT FROM OLD.login_image_url)
     OR (NEW.billing_config IS DISTINCT FROM OLD.billing_config)
     OR (NEW.communication_config IS DISTINCT FROM OLD.communication_config))
     AND NOT public.can_manage_school_settings() THEN
    RAISE EXCEPTION 'Só a Gestão da escola (ou o suporte) pode gerenciar a imagem de login, a configuração de cobrança ou a de comunicação.';
  END IF;

  -- Dados legais (30/09/2026): vão no contrato e na nota fiscal.
  IF ((NEW.razao_social IS DISTINCT FROM OLD.razao_social)
     OR (NEW.cnpj IS DISTINCT FROM OLD.cnpj)
     OR (NEW.inscricao_municipal IS DISTINCT FROM OLD.inscricao_municipal)
     OR (NEW.email IS DISTINCT FROM OLD.email)
     OR (NEW.encarregado_dados_nome IS DISTINCT FROM OLD.encarregado_dados_nome)
     OR (NEW.encarregado_dados_email IS DISTINCT FROM OLD.encarregado_dados_email))
     AND NOT public.can_manage_school_settings() THEN
    RAISE EXCEPTION 'Só a Gestão da escola (ou o suporte) pode alterar razão social, CNPJ, inscrição municipal, e-mail oficial e o encarregado de dados.';
  END IF;

  -- Gestão Pedagógica (29/09/2026): só o alerta de faltas e as turmas.
  IF coalesce(public.get_my_role(), '') = 'gestao_pedagogica'
     AND (to_jsonb(NEW) - array['absence_alert_config', 'turmas', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - array['absence_alert_config', 'turmas', 'updated_at']) THEN
    RAISE EXCEPTION 'A Coordenação e a Direção só podem alterar o alerta de faltas e as turmas da escola.';
  END IF;

  RETURN NEW;
END;
$function$;

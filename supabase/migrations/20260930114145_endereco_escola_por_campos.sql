-- Endereço da escola por campos (30/09/2026)
--
-- Antes: um texto único (schools.address, "Endereço Completo" no Portal do
-- Dev). Agora: CEP, rua, número, complemento, bairro, cidade (coluna city,
-- que já existia) e UF, cada um no seu campo, com busca automática pelo CEP
-- na tela. O texto completo continua existindo em schools.address, montado
-- sozinho pelo banco a partir dos campos, porque é ele que o contrato usa
-- ({{escola_endereco}}). Na produção as duas escolas estavam com o endereço
-- em branco, então não há texto antigo para converter.
--
-- Permissões: os campos novos seguem as mesmas regras da cidade (quem já
-- podia editar a cidade da escola pode editar o endereço). A Coordenação e a
-- Direção continuam sem poder, pela trava de protect_school_pedagogical_columns.

alter table public.schools
  add column if not exists zip_code text,
  add column if not exists street text,
  add column if not exists number text,
  add column if not exists complement text,
  add column if not exists neighborhood text,
  add column if not exists state text;

alter table public.schools drop constraint if exists schools_state_check;
alter table public.schools add constraint schools_state_check
  check (state is null or state = '' or state ~ '^[A-Z]{2}$');

alter table public.schools drop constraint if exists schools_zip_code_check;
alter table public.schools add constraint schools_zip_code_check
  check (zip_code is null or zip_code = '' or zip_code ~ '^[0-9]{5}-?[0-9]{3}$');

-- "Rua X, 12, Sala 3 · Centro, Vitória/ES · CEP 29000-000" (mesmo formato do
-- endereço montado nos formulários de matrícula, src/lib/matriculaFields.js).
create or replace function public.montar_endereco(
  p_rua text, p_numero text, p_complemento text, p_bairro text, p_cidade text, p_uf text, p_cep text
) returns text
language sql
immutable
set search_path to 'public'
as $function$
  select array_to_string(array_remove(array[
    nullif(concat_ws(', ', nullif(trim(p_rua), ''), nullif(trim(p_numero), ''), nullif(trim(p_complemento), '')), ''),
    nullif(concat_ws(', ', nullif(trim(p_bairro), ''), nullif(concat_ws('/', nullif(trim(p_cidade), ''), nullif(trim(p_uf), '')), '')), ''),
    case when nullif(trim(p_cep), '') is not null then 'CEP ' || trim(p_cep) end
  ], null), ' · ');
$function$;

create or replace function public.montar_endereco_escola()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT'
     or new.zip_code is distinct from old.zip_code
     or new.street is distinct from old.street
     or new.number is distinct from old.number
     or new.complement is distinct from old.complement
     or new.neighborhood is distinct from old.neighborhood
     or new.city is distinct from old.city
     or new.state is distinct from old.state then
    -- Escola sem nenhum campo preenchido mantém o texto que já tinha.
    if coalesce(nullif(trim(new.street), ''), nullif(trim(new.zip_code), ''), nullif(trim(new.neighborhood), ''),
                nullif(trim(new.number), ''), nullif(trim(new.state), '')) is not null then
      new.address := public.montar_endereco(new.street, new.number, new.complement, new.neighborhood, new.city, new.state, new.zip_code);
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists schools_montar_endereco on public.schools;
create trigger schools_montar_endereco
before insert or update on public.schools
for each row execute function public.montar_endereco_escola();

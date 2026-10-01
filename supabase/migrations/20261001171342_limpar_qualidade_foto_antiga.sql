-- Qualidade da foto antiga não vale para biometria nova (01/10/2026).
--
-- Quando a biometria é retirada (face_descriptor vira null) ou trocada sem
-- uma medição nova no mesmo UPDATE, os números de foto_qualidade eram da
-- foto anterior e continuavam aparecendo em Gestão > Biometrias > Qualidade
-- (caso real: recadastro feito numa versão antiga do app manteve "os mesmos
-- resultados anteriores"). Agora a pessoa volta para "Sem análise" e entra
-- na medição nova quando cadastrar o rosto. O cadastro atual grava o
-- descritor e a foto_qualidade juntos, então nada muda para ele.

create or replace function public.limpar_qualidade_da_foto_antiga()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.face_descriptor is distinct from old.face_descriptor
     and new.foto_qualidade is not distinct from old.foto_qualidade then
    new.foto_qualidade := null;
  end if;
  return new;
end;
$$;

drop trigger if exists limpar_qualidade_da_foto_antiga on public.authorized_persons;
create trigger limpar_qualidade_da_foto_antiga
  before update of face_descriptor on public.authorized_persons
  for each row execute function public.limpar_qualidade_da_foto_antiga();

-- Quem já está sem biometria não fica com números de uma foto que não existe mais.
update public.authorized_persons
   set foto_qualidade = null
 where face_descriptor is null
   and foto_qualidade is not null;

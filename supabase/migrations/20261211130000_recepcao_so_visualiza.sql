-- Recepção só visualiza · 05/11/2026
-- Plano: docs/roadmap/PLANO_MARKETING.md (Fase B)
--
-- A Recepção (users.role = 'admin') deixa de criar, editar e excluir
-- comunicados, calendário, mural, cardápio e aulas especiais. Continua lendo,
-- só da própria escola. Quem publica: Gestão, Coordenação/Direção (gestao_pedagogica),
-- Marketing (calendário, comunicados e mural), Professor (mural das suas turmas).
--
-- Troca as regras "for all" do baseline por regras só de leitura. Nada mais
-- muda: person-photos e matriculas-docs (check-in e matrícula) ficam intactos.

-- ═══ 1. Tabelas ═════════════════════════════════════════════════════════

drop policy if exists "Admins gerenciam comunicados da escola" on public.comunicados;
create policy "Recepcao le comunicados da escola" on public.comunicados
  for select using (school_id = public.get_my_school_id() and public.get_my_role() = 'admin');

drop policy if exists "Admins gerenciam eventos da escola" on public.eventos_calendario;
create policy "Recepcao le eventos da escola" on public.eventos_calendario
  for select using (school_id = public.get_my_school_id() and public.get_my_role() = 'admin');

drop policy if exists "Admins gerenciam fotos do mural da escola" on public.mural_fotos;
create policy "Recepcao le fotos do mural da escola" on public.mural_fotos
  for select using (school_id = public.get_my_school_id() and public.get_my_role() = 'admin');

drop policy if exists "Admins gerenciam cardapios da escola" on public.cardapios;
create policy "Recepcao le cardapios da escola" on public.cardapios
  for select using (school_id = public.get_my_school_id() and public.get_my_role() = 'admin');

drop policy if exists "Admins gerenciam itens de cardapio da escola" on public.cardapio_itens;
create policy "Recepcao le itens de cardapio da escola" on public.cardapio_itens
  for select using (exists (
    select 1 from public.cardapios c
     where c.id = cardapio_itens.cardapio_id
       and c.school_id = public.get_my_school_id()
       and public.get_my_role() = 'admin'));

drop policy if exists "Admins gerenciam aulas especiais da propria escola" on public.aulas_especiais;
create policy "Recepcao le aulas especiais da escola" on public.aulas_especiais
  for select using (school_id = public.get_my_school_id() and public.get_my_role() = 'admin');

-- ═══ 2. Storage (só estes dois buckets) ═════════════════════════════════

drop policy if exists "Admins gerenciam anexos de comunicados da escola" on storage.objects;
create policy "Recepcao le anexos de comunicados da escola" on storage.objects
  for select using (
    bucket_id = 'comunicados-anexos'
    and public.get_my_role() = 'admin'
    and (storage.foldername(name))[1] = public.get_my_school_id()::text);

drop policy if exists "Admins gerenciam objetos do mural da escola" on storage.objects;
create policy "Recepcao le objetos do mural da escola" on storage.objects
  for select using (
    bucket_id = 'mural-fotos'
    and public.get_my_role() = 'admin'
    and (storage.foldername(name))[1] = public.get_my_school_id()::text);

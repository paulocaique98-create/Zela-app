-- Marketing: comunicados. Antes a regra "Marketing gerencia comunicados" dava
-- ALL em qualquer comunicado da escola. Agora o Marketing LÊ todos da escola,
-- mas só cria/edita/exclui os que ele mesmo publicou (created_by = auth.uid()).
-- Gestão, Direção, Coordenação e Admin/Recepção têm regras próprias e não mudam.
-- Obs.: a regra de Storage (anexos) continua por escola; o bloqueio de edição
-- e exclusão é feito na tabela comunicados.

drop policy if exists "Marketing gerencia comunicados" on public.comunicados;

create policy "Marketing le comunicados da escola" on public.comunicados
  for select using (marketing_da_escola(school_id));

create policy "Marketing cria comunicados proprios" on public.comunicados
  for insert with check (marketing_da_escola(school_id) and created_by = auth.uid());

create policy "Marketing edita comunicados proprios" on public.comunicados
  for update using (marketing_da_escola(school_id) and created_by = auth.uid())
  with check (marketing_da_escola(school_id) and created_by = auth.uid());

create policy "Marketing exclui comunicados proprios" on public.comunicados
  for delete using (marketing_da_escola(school_id) and created_by = auth.uid());

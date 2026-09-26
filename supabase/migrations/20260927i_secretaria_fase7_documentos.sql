-- Fase 7 (Documentos) do módulo Secretaria — decidido na Fase 2
-- (arquitetura): tabela própria + bucket dedicado, em vez de reaproveitar
-- matriculas-docs (aquele bucket é o "congelado" de uma solicitação
-- específica; este aqui é o arquivo oficial do aluno, mantido/atualizado
-- pela Secretaria ao longo de toda a matrícula, independente de quando ou
-- como o aluno entrou no sistema).
--
-- Segue o mesmo padrão de fase paralela já usado em Alunos/Matrículas:
-- admin E gestao escrevem por enquanto (checagem inline, NUNCA
-- can_write_gestao() -- essa já foi cortada só pra gestao no Financeiro/
-- Correções, fase diferente). Leitura usa can_read_gestao() (permanente,
-- admin nunca perde leitura, mesmo padrão dos outros módulos da Gestão).
create table if not exists public.student_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  category text not null check (category in (
    'rg', 'certidao_nascimento', 'comprovante_residencia', 'cartao_vacina',
    'plano_saude', 'contrato', 'ficha_medica', 'outro'
  )),
  file_name text not null,
  storage_path text not null,
  notes text,
  uploaded_by uuid references public.users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_student_documents_student on public.student_documents(student_id, uploaded_at desc);
create index if not exists idx_student_documents_school on public.student_documents(school_id);

alter table public.student_documents enable row level security;

create policy "Leitura de documentos do aluno"
on public.student_documents for select
using (public.can_read_gestao() and school_id = public.get_my_school_id());

create policy "Gestao e admin gerenciam documentos do aluno"
on public.student_documents for all
using (public.get_my_role() in ('admin', 'gestao') and school_id = public.get_my_school_id())
with check (public.get_my_role() in ('admin', 'gestao') and school_id = public.get_my_school_id());

-- Bucket privado. Path: {school_id}/{student_id}/{category}-{arquivo}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-documents',
  'student-documents',
  false,
  15728640, -- 15MB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Leitura de arquivos de documentos do aluno"
on storage.objects for select
using (
  bucket_id = 'student-documents'
  and public.can_read_gestao()
  and (storage.foldername(name))[1] = public.get_my_school_id()::text
);

create policy "Gestao e admin gerenciam arquivos de documentos do aluno"
on storage.objects for all
using (
  bucket_id = 'student-documents'
  and public.get_my_role() in ('admin', 'gestao')
  and (storage.foldername(name))[1] = public.get_my_school_id()::text
)
with check (
  bucket_id = 'student-documents'
  and public.get_my_role() in ('admin', 'gestao')
  and (storage.foldername(name))[1] = public.get_my_school_id()::text
);

-- Importação de Matrícula com IA (Gemini) -- Fase 1: tabela de RASCUNHO.
--
-- Decisão de segurança (confirmada com o usuário): a IA nunca escreve direto
-- em cima de cadastro oficial. Ela só interpreta a planilha e devolve um
-- resumo pra revisão humana; o resultado fica guardado aqui como rascunho
-- até um admin clicar em "Enviar" (aí sim vira uma matricula_solicitacoes
-- normal, status='pending', passando pelo MESMO fluxo de aprovação de
-- sempre -- nenhum atalho novo de aprovação foi criado).
--
-- Por que uma tabela separada, e não só um novo status em
-- matricula_solicitacoes: o rascunho pode nem ter um responsável já
-- cadastrado no Zela ainda (a conta só é criada de fato no "Enviar", ver
-- send-matricula-draft) -- e matricula_solicitacoes.family_id é NOT NULL,
-- não dá pra guardar um rascunho sem essa referência. Aqui o rascunho fica
-- livre, dono só da própria escola.
CREATE TABLE IF NOT EXISTS public.matricula_import_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payload jsonb NOT NULL, -- { responsavel, segundo_responsavel, criancas[], autorizados[] }
  resumo_ia text, -- explicação em português do que a IA entendeu/inferiu daquela família
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id),
  sent_at timestamptz,
  sent_matricula_id uuid REFERENCES public.matricula_solicitacoes(id)
);

CREATE INDEX IF NOT EXISTS idx_matricula_import_drafts_school ON public.matricula_import_drafts(school_id, status, created_at DESC);

ALTER TABLE public.matricula_import_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gerencia rascunhos da propria escola" ON public.matricula_import_drafts;
CREATE POLICY "Admin gerencia rascunhos da propria escola"
ON public.matricula_import_drafts FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Developer le rascunhos de qualquer escola" ON public.matricula_import_drafts;
CREATE POLICY "Developer le rascunhos de qualquer escola"
ON public.matricula_import_drafts FOR SELECT
USING (public.get_my_role() = 'developer');

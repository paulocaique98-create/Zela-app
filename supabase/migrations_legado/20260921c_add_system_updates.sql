-- Menu "Atualizações" (Sistema > abaixo de Auditoria) -- changelog do
-- PRODUTO inteiro (mesmo código pra todas as escolas), não um dado por
-- escola: sem school_id de propósito, todo Admin de toda escola vê o mesmo
-- histórico. Só o Developer publica uma entrada nova (é quem sobe o
-- deploy) -- ver Fase 4 do plano (processo, não código).
CREATE TABLE IF NOT EXISTS public.system_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id)
);
CREATE INDEX IF NOT EXISTS idx_system_updates_created ON public.system_updates(created_at DESC);

ALTER TABLE public.system_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin e developer leem atualizacoes" ON public.system_updates;
CREATE POLICY "Admin e developer leem atualizacoes"
ON public.system_updates FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('admin', 'developer'));

DROP POLICY IF EXISTS "Developer publica atualizacoes" ON public.system_updates;
CREATE POLICY "Developer publica atualizacoes"
ON public.system_updates FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() = 'developer');

-- Quem (qual usuário, não qual escola) já viu cada atualização -- mesmo
-- padrão de comunicado_reads/mitigacao_report_reads: 1 linha por leitura,
-- consistente entre dispositivos (ler no celular já tira o indicador no
-- computador).
CREATE TABLE IF NOT EXISTS public.system_update_reads (
  update_id uuid NOT NULL REFERENCES public.system_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (update_id, user_id)
);

ALTER TABLE public.system_update_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuario le suas proprias leituras" ON public.system_update_reads;
CREATE POLICY "Usuario le suas proprias leituras"
ON public.system_update_reads FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Só admin/developer marcam leitura (mesmo papel que enxerga o menu) --
-- cada um só grava a PRÓPRIA leitura (user_id = auth.uid()), nunca a de
-- outro admin.
DROP POLICY IF EXISTS "Admin e developer marcam propria leitura" ON public.system_update_reads;
CREATE POLICY "Admin e developer marcam propria leitura"
ON public.system_update_reads FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND public.get_my_role() IN ('admin', 'developer'));

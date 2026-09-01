-- Fase 2 (item 3) — Flexibilidade de Método Pedagógico: SelfRegister.jsx
-- é rota PÚBLICA (sem login, "/cadastro") e `schools` não tem nenhuma
-- policy de leitura pra anon (correto -- não deveria ter, dados de
-- contrato/comercial da escola não são pra expor). Pra essa tela mostrar
-- as turmas certas da escola digitada (mesmo padrão de resolução por
-- school_code já usado em self-register-family/index.ts), sem abrir uma
-- policy de leitura ampla em `schools`, esta RPC devolve SÓ o array de
-- turmas -- nunca nome, plano, config comercial ou qualquer outro campo.
CREATE OR REPLACE FUNCTION public.get_turmas_by_school_code(p_school_code text)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT turmas FROM public.schools WHERE school_code = upper(trim(p_school_code));
$$;

-- Intencionalmente pública (anon) -- é o mesmo propósito de
-- self-register-family: alguém digitando o código da escola antes de
-- criar a própria conta, sem estar logado ainda. Nenhum dado sensível
-- exposto (só nomes de turma, que já eram públicos como constante
-- hardcoded antes desta feature).
GRANT EXECUTE ON FUNCTION public.get_turmas_by_school_code(text) TO anon, authenticated;

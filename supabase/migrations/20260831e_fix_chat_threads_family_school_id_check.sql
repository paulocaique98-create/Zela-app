-- P1.2 (Prompt Mestre de Evolução) — achado durante o teste adversarial de
-- isolamento multi-tenant de chat.
--
-- A policy "Familias gerenciam suas proprias threads" (FOR ALL) checava
-- apenas family_id = auth.uid(), role = 'family' e setor <> 'suporte_zela'
-- -- nunca validava school_id = get_my_school_id(). Qualquer família
-- conseguia INSERT uma chat_thread com school_id de OUTRA escola, contanto
-- que family_id fosse ela mesma. Como a thread passa a ser "sua" (family_id
-- = auth.uid()), a família também conseguia inserir mensagens nela --
-- ou seja, um usuário de uma escola conseguia fazer uma thread aparecer
-- pro admin de OUTRA escola (a policy de leitura do admin só filtra por
-- school_id + setor, não valida de onde a thread realmente veio),
-- essencialmente conseguindo mandar mensagem pro admin de uma escola que
-- não é a sua.
--
-- Testado ao vivo: família B (escola B) inserindo
-- {school_id: escolaA, family_id: familyB, setor:'administrativo'}
-- tinha sucesso antes desta correção. Depois, falha com policy violation.

DROP POLICY IF EXISTS "Familias gerenciam suas proprias threads" ON public.chat_threads;

CREATE POLICY "Familias gerenciam suas proprias threads"
  ON public.chat_threads FOR ALL
  USING (family_id = auth.uid() AND get_my_role() = 'family' AND setor <> 'suporte_zela')
  WITH CHECK (
    family_id = auth.uid()
    AND get_my_role() = 'family'
    AND setor <> 'suporte_zela'
    AND school_id = get_my_school_id()
  );

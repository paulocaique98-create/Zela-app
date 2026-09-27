-- P0.2 (Prompt Mestre de Evolução) — Revisão individual das 20 funções
-- SECURITY DEFINER com grant padrão pra anon/authenticated.
--
-- Achados corrigidos nesta migration (das 27 funções SECURITY DEFINER de
-- public, 5 já eram service_role-only; as outras 22 foram revisadas uma a
-- uma — ver RELATORIO_MESTRE_ESTADO_ATUAL_ZELA.md seção 44 pro veredito
-- completo de cada uma):
--
-- 1) check_rate_limit(p_key, p_limit, p_window_seconds) — aceitava
--    QUALQUER p_key vindo do cliente, sem checar se é "a chave do próprio
--    chamador". Um usuário autenticado podia chamar
--    check_rate_limit('pin_login:<school_id de OUTRA escola>', 5, 30)
--    repetidamente e esgotar o rate limit de login por PIN de qualquer
--    totem de qualquer escola (negação de serviço direcionada), ou o mesmo
--    pra 'chat_send:<id de outro usuário>'. Só é chamada internamente por
--    outras funções/triggers SECURITY DEFINER (que rodam como o dono,
--    não como o chamador) — nenhum uso legítimo depende do client
--    conseguir chamar isso direto.
--
-- 2) find_school_by_webhook_token(p_gateway, p_token) — oráculo de força
--    bruta: com EXECUTE liberado pra anon, qualquer requisição anônima
--    podia tentar tokens de webhook e descobrir, pela resposta (school_id
--    ou NULL), se acertou. Só é usada internamente pelo Edge Function
--    payment-webhook (contexto service_role) — nenhuma tela client-side
--    chama isso.
--
-- 3) get_student_guardians(student_uuid) — vazamento cross-tenant real:
--    aceitava QUALQUER student_uuid e devolvia guardian_id/relationship/
--    is_financial de QUALQUER aluno de QUALQUER escola, sem checar se o
--    chamador tinha relação com aquele aluno. Uso legítimo real (única
--    tela que chama, FamilyGerenciarResponsaveis.jsx) é sempre "meu
--    próprio filho" — adicionada checagem interna: só retorna dado se o
--    chamador for guardião do aluno OU admin/developer da mesma escola do
--    aluno; caso contrário devolve conjunto vazio (fail-closed, não
--    erro — mantém o comportário esperado pelo componente que já trata
--    "sem dados").
--
-- 4) is_guardian_released(p_guardian_id) — grant a `authenticated` nunca
--    foi necessário: o único chamador real é o Edge Function
--    notify-families via adminClient (service_role). Reduz superfície de
--    ataque (mesmo que o vazamento seja só um boolean e dependa de já
--    saber o UUID de outro guardião) — revogado de authenticated.

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO postgres, service_role;

REVOKE EXECUTE ON FUNCTION public.find_school_by_webhook_token(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_school_by_webhook_token(text, text) TO postgres, service_role;

REVOKE EXECUTE ON FUNCTION public.is_guardian_released(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.is_guardian_released(uuid) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.get_student_guardians(student_uuid uuid)
RETURNS TABLE(guardian_id uuid, relationship text, is_financial boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sg.guardian_id, sg.relationship, sg.is_financial
  FROM student_guardians sg
  WHERE sg.student_id = student_uuid
    AND (
      public.is_guardian_of(student_uuid)
      OR (
        public.get_my_role() IN ('admin', 'developer')
        AND EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.id = student_uuid AND s.school_id = public.get_my_school_id()
        )
      )
    );
$$;

-- Reforça também explicitamente (a função já criada acima herda os
-- grants existentes na maioria dos casos, mas fica explícito por
-- segurança — CREATE OR REPLACE não altera ACL existente, então isso é
-- só documentação; o grant real já era anon,authenticated,postgres,
-- service_role e continua sendo, porque o controle agora é feito DENTRO
-- da função).

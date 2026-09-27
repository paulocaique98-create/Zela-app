-- Fase 17 (Auditoria Final) — achado CRÍTICO, correção de emergência.
--
-- 1) delete_school_and_users(target_school_id): apaga TODA uma escola
--    (alunos, biometrias, totens, TODAS as contas de login — public.users E
--    auth.users — e o cadastro da escola em si) e NUNCA checava quem estava
--    chamando. Estava com EXECUTE liberado até pra PUBLIC (`=X/postgres` no
--    ACL), ou seja, qualquer pessoa na internet, sem login nenhum, podia
--    apagar qualquer escola do sistema inteiro. Mesmo removendo o acesso
--    anônimo, a function continua precisando ser chamável por `authenticated`
--    (é assim que o DeveloperPanel real chama, via supabase.rpc() direto do
--    client) — então a correção real, além de tirar o acesso anônimo, é a
--    própria function checar que quem está chamando é developer.
CREATE OR REPLACE FUNCTION public.delete_school_and_users(target_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user record;
BEGIN
  IF public.get_my_role() != 'developer' THEN
    RAISE EXCEPTION 'Apenas o suporte (developer) pode excluir uma escola.';
  END IF;

  -- 1. Apaga todos os históricos e presenças
  DELETE FROM public.attendance_logs WHERE school_id = target_school_id;

  -- 2. Apaga todos os totens vinculados
  DELETE FROM public.kiosk_devices WHERE school_id = target_school_id;

  -- 3. Apaga as pessoas autorizadas, fotos e biometrias
  DELETE FROM public.authorized_persons WHERE school_id = target_school_id;

  -- 4. Apaga os alunos
  DELETE FROM public.students WHERE school_id = target_school_id;

  -- 5. Apaga as permissões e as contas de login de todos os usuários daquela escola
  FOR v_user IN SELECT id FROM public.users WHERE school_id = target_school_id LOOP
    DELETE FROM public.users WHERE id = v_user.id;
    DELETE FROM auth.users WHERE id = v_user.id;
  END LOOP;

  -- 6. Por fim, apaga o cadastro da própria escola
  DELETE FROM public.schools WHERE id = target_school_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_school_and_users(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_school_and_users(uuid) TO authenticated;

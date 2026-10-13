-- Escola suspensa no Portal do Dev (schools.is_active = false) perde o acesso.
-- Antes, is_active era só um rótulo: ninguém o lia. Agora:
--  1) get_my_school_id() devolve NULL para usuário de escola suspensa, então
--     toda policy "school_id = get_my_school_id()" (dados, Realtime, Storage,
--     totem/tablet, que entram com conta da escola) deixa de casar.
--     Developer e Gestão e Suporte Zela são isentos.
--  2) minha_escola_suspensa() deixa o app derrubar a sessão e avisar.
-- Reversível: reativar a escola no portal restaura tudo. Nenhum dado é alterado.

CREATE OR REPLACE FUNCTION "public"."get_my_school_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT u.school_id
  FROM public.users u
  WHERE u.id = auth.uid()
    AND (
      u.role IN ('developer', 'gestao')
      OR NOT EXISTS (
        SELECT 1 FROM public.schools s
        WHERE s.id = u.school_id AND s.is_active = false
      )
    );
$$;

CREATE OR REPLACE FUNCTION "public"."minha_escola_suspensa"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.schools s ON s.id = u.school_id
    WHERE u.id = auth.uid()
      AND u.role NOT IN ('developer', 'gestao')
      AND s.is_active = false
  );
$$;

REVOKE ALL ON FUNCTION "public"."minha_escola_suspensa"() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."minha_escola_suspensa"() TO authenticated, service_role;

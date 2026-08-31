-- P1.5 (complemento) — RPC de introspecção só pra teste automatizado
-- detectar a regressão de grant em PUBLIC que já se repetiu 3x nesta
-- mesma sessão de auditoria (P0.1, P0.2, P1.5 -- ver
-- RELATORIO_MESTRE_ESTADO_ATUAL_ZELA.md seção 44). Postgres concede
-- EXECUTE a PUBLIC por padrão na criação de qualquer função; um `GRANT
-- ... TO service_role` sozinho não revoga isso.
--
-- Só devolve nome da função + lista de grantees de EXECUTE -- nunca
-- corpo de função, dado de tabela nem nada sensível. Restrita a
-- service_role (o teste roda com a service_role key, nunca client-side).
CREATE OR REPLACE FUNCTION public.list_security_definer_grantees(p_function_name text)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_agg(DISTINCT grantee.rolname ORDER BY grantee.rolname)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(p.proacl) a
  JOIN pg_roles grantee ON grantee.oid = a.grantee
  WHERE n.nspname = 'public'
    AND p.proname = p_function_name
    AND a.privilege_type = 'EXECUTE';
$$;

REVOKE EXECUTE ON FUNCTION public.list_security_definer_grantees(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_security_definer_grantees(text) TO postgres, service_role;

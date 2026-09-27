-- Fase 0 do plano de Check-in por QR Code — schema + geração/validação do
-- token assinado. Módulo opcional por escola (schools.features_enabled.
-- qr_checkin, padrão OFF, ligado no Portal do Dev), nada disso tem efeito
-- em nenhuma escola até esse flag ser ativado.
--
-- Decisão de segurança (ver conversa que originou este plano): o QR NUNCA
-- carrega o id interno (PK) do aluno. Ele carrega um token separado,
-- opaco e rotacionável (checkin_qr_token) -- perder o cartão físico não
-- exige trocar a referência interna do aluno em lugar nenhum, só gerar um
-- token novo (o antigo para de funcionar na hora). O payload embutido no QR
-- ainda é assinado (HMAC) com uma chave só do servidor, pra ninguém
-- conseguir fabricar um QR válido só sabendo o formato.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS checkin_qr_token uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS checkin_qr_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_qr_created_by uuid REFERENCES public.users(id);

-- A chave HMAC fica embutida direto nesta função interna (prefixo "_"),
-- nunca numa tabela nem exposta por nenhuma RPC pública -- avaliado contra
-- o padrão Vault-backed já usado em cron_secrets (ver
-- 20260830d_add_cron_secrets_and_financial_reminders.sql) e descartado de
-- propósito aqui: aquele padrão tem um bug documentado de corrupção do
-- valor decifrado quando gravado via SQL solto (só funciona via RPC
-- autenticada como service_role), complexidade desnecessária pra um
-- segredo interno que nenhum cliente jamais precisa ler. Corpo de função
-- plpgsql não é legível via PostgREST (só tabelas/views/RPCs são expostas
-- aos papéis anon/authenticated), então isso já é seguro contra o app
-- cliente -- é só uma constante interna do servidor, não um segredo
-- operacional.
CREATE OR REPLACE FUNCTION public._qr_hmac_key()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '38ab11bd74a98bcb21c46f34d06f3c4350785f1f990264e4706bd7da65b7c89c'::text;
$$;

-- Postgres concede EXECUTE a PUBLIC por padrão em toda função nova, e o
-- Supabase expõe qualquer função do schema public como RPC -- sem este
-- REVOKE, qualquer cliente autenticado poderia chamar
-- supabase.rpc('_qr_hmac_key') e ler a chave direto.
REVOKE EXECUTE ON FUNCTION public._qr_hmac_key() FROM PUBLIC, anon, authenticated;

-- Gera (ou substitui) o token de check-in de um aluno. SECURITY DEFINER só
-- pra poder ler o segredo HMAC (ver _qr_hmac_key) -- a checagem de
-- autorização abaixo é o que realmente protege a função, não o RLS da
-- tabela students.
CREATE OR REPLACE FUNCTION public.generate_student_qr_token(p_student_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_school_id uuid;
  v_new_token uuid;
  v_payload text;
  v_signature text;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem gerar QR de check-in.';
  END IF;

  SELECT school_id INTO v_school_id
  FROM public.students
  WHERE id = p_student_id;

  IF v_school_id IS NULL OR v_school_id <> public.get_my_school_id() THEN
    RAISE EXCEPTION 'Aluno não encontrado nesta escola.';
  END IF;

  v_new_token := gen_random_uuid();

  UPDATE public.students
  SET checkin_qr_token = v_new_token,
      checkin_qr_created_at = now(),
      checkin_qr_created_by = auth.uid()
  WHERE id = p_student_id;

  v_payload := v_school_id::text || '.' || v_new_token::text;
  v_signature := encode(hmac(v_payload::bytea, public._qr_hmac_key()::bytea, 'sha256'), 'hex');

  -- Formato "ZL1.<school_id>.<token>.<assinatura>" -- versão explícita no
  -- prefixo (ZL1) pra permitir trocar o formato/algoritmo no futuro sem
  -- quebrar QRs antigos já impressos (o validador decide pelo prefixo).
  RETURN 'ZL1.' || v_payload || '.' || v_signature;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_student_qr_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_student_qr_token(uuid) TO authenticated;

-- Valida um QR escaneado no totem e devolve os dados mínimos pra tela de
-- confirmação (Opção B do plano: aluno + lista de autorizados dele, nunca
-- o token de volta). SECURITY DEFINER pra poder ler o segredo HMAC.
CREATE OR REPLACE FUNCTION public.verify_checkin_qr(p_payload text)
RETURNS TABLE (student_id uuid, student_name text, student_school_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_parts text[];
  v_school_id uuid;
  v_token uuid;
  v_signature text;
  v_expected_signature text;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Apenas o totem administrativo pode validar QR de check-in.';
  END IF;

  v_parts := string_to_array(p_payload, '.');

  IF array_length(v_parts, 1) <> 4 OR v_parts[1] <> 'ZL1' THEN
    RAISE EXCEPTION 'QR Code inválido.';
  END IF;

  v_school_id := v_parts[2]::uuid;
  v_token := v_parts[3]::uuid;
  v_signature := v_parts[4];

  v_expected_signature := encode(
    hmac((v_parts[2] || '.' || v_parts[3])::bytea, public._qr_hmac_key()::bytea, 'sha256'),
    'hex'
  );

  IF v_signature <> v_expected_signature THEN
    RAISE EXCEPTION 'QR Code inválido ou adulterado.';
  END IF;

  IF v_school_id <> public.get_my_school_id() THEN
    RAISE EXCEPTION 'QR Code não pertence a esta escola.';
  END IF;

  RETURN QUERY
  SELECT s.id, s.name, s.school_id
  FROM public.students s
  WHERE s.checkin_qr_token = v_token
    AND s.school_id = v_school_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR Code não encontrado nesta escola.';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_checkin_qr(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_checkin_qr(text) TO authenticated;

-- Módulo Financeiro — Fase 5 (migration real, mediante autorização explícita).
-- Modelo definido nas Fases 2/3/4 (ver FASE_2_MODELO_FINANCEIRO.md,
-- FASE_3_AUDITORIA_ASAAS.md e FASE_4_PLANO_DE_SEGURANCA.md — adendos
-- incluídos): recorrência via Asaas /v3/subscriptions (não motor próprio),
-- desconto de ciclo anual/semestral configurável pelo Admin, RLS restritiva
-- (família nunca tem UPDATE em cobrança — só o webhook autenticado ou um
-- admin, via Edge Function, podem mudar status de pagamento).

-- ── 1. financial_billing_discounts — desconto por ciclo, configurável pelo Admin ──
CREATE TABLE IF NOT EXISTS public.financial_billing_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY')),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent < 100),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, billing_cycle)
);

CREATE INDEX IF NOT EXISTS idx_financial_billing_discounts_school ON public.financial_billing_discounts(school_id);

ALTER TABLE public.financial_billing_discounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam descontos da propria escola" ON public.financial_billing_discounts;
CREATE POLICY "Admins gerenciam descontos da propria escola"
ON public.financial_billing_discounts FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- ── 2. financial_contracts — o contrato/mensalidade por aluno ──
CREATE TABLE IF NOT EXISTS public.financial_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  financial_guardian_id uuid NOT NULL REFERENCES users(id),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY')),
  -- Dinheiro sempre em centavos (integer) — nunca numeric/float, evita erro
  -- de arredondamento em cálculo financeiro.
  base_monthly_amount_cents integer NOT NULL CHECK (base_monthly_amount_cents > 0),
  -- Snapshot do desconto vigente no momento da criação — nunca recalculado
  -- retroativamente se o admin mudar financial_billing_discounts depois.
  discount_percent_applied numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent_applied >= 0 AND discount_percent_applied < 100),
  amount_cents integer NOT NULL CHECK (amount_cents > 0), -- valor efetivo por ciclo, já com desconto
  first_due_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  gateway text,
  gateway_customer_id text,
  gateway_subscription_id text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Nunca mais de 1 contrato ativo por aluno ao mesmo tempo (risco documentado
-- na Fase 2, seção 17, item 1) — índice único parcial, não depende de
-- disciplina de código pra ser garantido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_contracts_one_active_per_student
  ON public.financial_contracts(student_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_financial_contracts_school ON public.financial_contracts(school_id);
CREATE INDEX IF NOT EXISTS idx_financial_contracts_student ON public.financial_contracts(student_id);
CREATE INDEX IF NOT EXISTS idx_financial_contracts_guardian ON public.financial_contracts(financial_guardian_id);

ALTER TABLE public.financial_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam contratos da propria escola" ON public.financial_contracts;
CREATE POLICY "Admins gerenciam contratos da propria escola"
ON public.financial_contracts FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Família: só leitura do PRÓPRIO contrato (nunca UPDATE — ver Fase 4, risco
-- 6.4: nenhum caminho de escrita financeira é exposto ao client família).
DROP POLICY IF EXISTS "Familia le o proprio contrato" ON public.financial_contracts;
CREATE POLICY "Familia le o proprio contrato"
ON public.financial_contracts FOR SELECT
USING (public.get_my_role() = 'family' AND financial_guardian_id = auth.uid());

-- ── 3. financial_charges — cada cobrança individual (cobrança + pagamento) ──
CREATE TABLE IF NOT EXISTS public.financial_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES financial_contracts(id) ON DELETE CASCADE,
  -- student_id/family_id desnormalizados de propósito: retrato de quem era
  -- o aluno/responsável NO MOMENTO da cobrança, pra rastreabilidade
  -- histórica não depender do contrato (que pode mudar) — mesmo padrão já
  -- usado em attendance_logs.family_id no sistema de check-in.
  student_id uuid NOT NULL REFERENCES students(id),
  family_id uuid NOT NULL REFERENCES users(id),
  due_date date NOT NULL,
  available_from date NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AWAITING_PAYMENT', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED', 'FAILED')),
  gateway text,
  gateway_payment_id text,
  payment_method text CHECK (payment_method IN ('pix', 'boleto', 'credit_card', 'link')),
  pix_qr_code text,
  pix_copy_paste text,
  boleto_url text,
  boleto_barcode text,
  boleto_identification_field text, -- linha digitável (Asaas separa de barCode — Fase 3, seção 16.3)
  payment_link text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Nunca 2 cobranças pro mesmo vencimento do mesmo contrato.
  UNIQUE (contract_id, due_date)
);

-- Nunca 2 linhas pro mesmo pagamento no gateway.
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_charges_gateway_payment
  ON public.financial_charges(gateway, gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_charges_school ON public.financial_charges(school_id);
CREATE INDEX IF NOT EXISTS idx_financial_charges_contract ON public.financial_charges(contract_id);
CREATE INDEX IF NOT EXISTS idx_financial_charges_family ON public.financial_charges(family_id);
CREATE INDEX IF NOT EXISTS idx_financial_charges_due_date ON public.financial_charges(due_date);
CREATE INDEX IF NOT EXISTS idx_financial_charges_status ON public.financial_charges(status);
CREATE INDEX IF NOT EXISTS idx_financial_charges_pending_availability
  ON public.financial_charges(available_from) WHERE status = 'PENDING';

ALTER TABLE public.financial_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam cobrancas da propria escola" ON public.financial_charges;
CREATE POLICY "Admins gerenciam cobrancas da propria escola"
ON public.financial_charges FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Família: só leitura das PRÓPRIAS cobranças — sem UPDATE/INSERT/DELETE em
-- nenhuma policy, então o Postgres nega qualquer tentativa de escrita desse
-- role por padrão (Fase 4, risco 6.4).
DROP POLICY IF EXISTS "Familia le as proprias cobrancas" ON public.financial_charges;
CREATE POLICY "Familia le as proprias cobrancas"
ON public.financial_charges FOR SELECT
USING (public.get_my_role() = 'family' AND family_id = auth.uid());

-- ── 4. financial_charge_events — trilha de auditoria imutável ──
CREATE TABLE IF NOT EXISTS public.financial_charge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL REFERENCES financial_charges(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'created' | 'pix_generated' | 'webhook_received' | 'payment_confirmed' | 'overdue' | 'cancelled' ...
  source text CHECK (source IN ('system', 'webhook', 'admin_manual')),
  webhook_event_id uuid REFERENCES payment_webhook_events(id),
  metadata jsonb, -- NUNCA dado de cartão/token/segredo — só contexto de negócio
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_charge_events_charge ON public.financial_charge_events(charge_id, created_at DESC);

ALTER TABLE public.financial_charge_events ENABLE ROW LEVEL SECURITY;

-- Só developer lê — dado técnico de auditoria, mesmo padrão de
-- client_error_logs/payment_webhook_events já usado no projeto.
DROP POLICY IF EXISTS "Developer le eventos de cobranca" ON public.financial_charge_events;
CREATE POLICY "Developer le eventos de cobranca"
ON public.financial_charge_events FOR SELECT
USING (public.get_my_role() = 'developer');

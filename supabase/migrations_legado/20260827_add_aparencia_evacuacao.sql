-- Campo livre pra descrever a aparência da evacuação, preenchido só quando
-- evacuou = true (pedido explícito do usuário: abrir esse campo condicional
-- ao marcar "Sim" em Evacuação no lançamento do Diário).
ALTER TABLE public.diario_entries ADD COLUMN IF NOT EXISTS aparencia_evacuacao text;

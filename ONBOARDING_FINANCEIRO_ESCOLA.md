# Onboarding Financeiro de uma Escola Nova — Asaas (Opção A)

Guia operacional: passo a passo pra conectar a conta Asaas de uma escola ao Zela, sempre que um novo contrato for fechado. Modelo atual (Opção A, decidido nas Fases 7): **cada escola tem sua própria conta Asaas**, com sua própria chave de API e chave PIX — o dinheiro das mensalidades cai direto na conta bancária da escola, nunca numa conta central do Zela.

> Modelo futuro (Opção B, planejado): conta-mãe do Zela + subcontas + split automático, quando o Zela tiver CNPJ próprio e/ou quiser cobrar comissão automática das escolas. Ver `FASE_3_AUDITORIA_ASAAS.md` e a conversa que definiu a Opção A como ponto de partida.

---

## Etapa 1 — A escola cria a própria conta no Asaas

Quem cria a conta é a **escola**, com o CNPJ dela (ou CPF, se for MEI/autônomo) — é ela quem vai receber o dinheiro de verdade, então a conta tem que ser dela, não do Zela.

- **Onde**: `asaas.com` (conta de produção — dinheiro real). Se ainda estiver validando esse cliente antes de ir ao ar, pode usar `sandbox.asaas.com` primeiro (dinheiro fictício).
- **Dados que a escola vai precisar informar**:
  - CNPJ (ou CPF) e Razão Social
  - E-mail e telefone de contato
  - Endereço completo (CEP, número etc.)
  - **Dados bancários pra saque** (banco, agência, conta) — é pra essa conta que o dinheiro das mensalidades vai cair
- **Aprovação**: o Asaas passa por uma verificação de identidade/documentos antes de liberar 100% dos recursos — pode levar de minutos a alguns dias, dependendo do perfil da conta. Isso é do lado do Asaas, fora do nosso controle.

## Etapa 2 — Gerar a chave de API (dentro da conta da escola)

1. Logar na conta Asaas **da escola**.
2. Ir em **Configurações → Integrações** (ou buscar "Chave de API"/"Integrações" no menu).
3. Gerar a chave.
   - Em **produção**, ela começa com `$aact_prod_...`
   - Em **sandbox**, começa com `$aact_hmlg_...`
4. ⚠️ **Trate essa chave como senha de banco** — quem tiver ela consegue criar/cancelar cobranças e ver dados financeiros da conta inteira da escola. Peça pra escola te enviar por um canal minimamente seguro (não em grupo de WhatsApp público, por exemplo).

## Etapa 3 — Cadastrar uma chave PIX na conta da escola

Sem isso, PIX não funciona (confirmado na prática na Fase 7 — o Asaas recusa cobrança PIX sem chave cadastrada).

1. Dentro da conta Asaas da escola: menu **Pix → Minhas Chaves**.
2. **Criar chave** — recomendado o tipo **Aleatória (EVP)**, é a mais simples (não precisa vincular e-mail/telefone/CPF específico).

## Etapa 4 — Registrar a chave no Zela

**Desde a Fase 11, já existe tela pra isso** — não precisa mais de `curl`:

1. No Admin dessa escola: **Financeiro → Configuração**.
2. Também é preciso, primeiro, o **Portal do Dev** ativar o módulo "Financeiro" pra essa escola em **Módulos Contratados** (desligado por padrão pra escolas novas).
3. Cole a chave de API no campo indicado e clique em Salvar — a tela já valida contra o Asaas na hora (`ping()`) antes de gravar, e guarda no Supabase Vault, nunca em texto puro.

(Caminho antigo via `curl` direto na function `set-school-gateway-key` ainda funciona, útil só se a tela estiver indisponível por algum motivo.)

## Etapa 5 — Cadastrar o webhook no painel do Asaas (essencial!)

Sem isso, cobranças reais nunca aparecem no Zela — o Asaas nunca avisa que algo aconteceu.

1. Ainda em **Financeiro → Configuração** no Zela, gere/defina um token qualquer (ex.: uma string aleatória) e cole no campo "Token de webhook" — isso salva no nosso lado.
2. No painel do Asaas **dessa escola**: **Integrações → Webhooks → Adicionar Webhook**.
   - **URL**: `https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/payment-webhook`
   - **Token de autenticação (authToken)**: exatamente o mesmo valor colado no passo 1 — tem que ser idêntico nos dois lados.
   - **Eventos**: marcar pelo menos `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED` (ou "todos os eventos de cobrança" — eventos não reconhecidos são ignorados silenciosamente, sem problema).
   - Deixar **ativo/habilitado** e salvar.

### ⚠️ Se aparecer "Você possui 1 fila de webhooks pausada"

O Asaas pausa a fila automaticamente depois de 15 tentativas de entrega falhas seguidas (comum acontecer durante o setup inicial, antes do token estar certo dos dois lados). Corrigir:

1. No painel do Asaas: **Integrações → Webhooks**, abrir o webhook dessa escola.
2. Conferir que a **URL** está completa (`.../functions/v1/payment-webhook`, não só o domínio) e que o **token** bate com o que está salvo no Zela.
3. Ligar o toggle **"Fila de sincronização ativada?"** (é ele que reativa — corrigir o token sozinho não desbloqueia a fila automaticamente).
4. Salvar.

## Etapa 6 — Confirmar que funcionou

1. Testar criando **uma cobrança pequena de verdade** pra essa escola (ex.: R$1,00), pela tela **Financeiro → Contratos → Novo contrato** ou **Cobranças → Cobrança avulsa**.
2. Conferir, dentro da própria conta Asaas da escola, que a cobrança apareceu lá (não em outra conta).
3. Aguardar alguns segundos — a cobrança deve aparecer sozinha em **Financeiro → Cobranças** no Zela (prova que o webhook está funcionando de ponta a ponta).
4. Cancelar/ignorar essa cobrança de teste depois (não afeta nada do nosso banco — só existe do lado do Asaas).

---

## Como isso fica armazenado (referência técnica)

- Tabela `school_gateway_accounts` (schema `public`): guarda só `school_id`, `gateway` e uma **referência** (`vault_secret_id`) ao segredo — nunca o valor da chave.
- O valor real da chave fica só no **Supabase Vault**, acessível exclusivamente via 2 funções `SECURITY DEFINER`:
  - `set_school_gateway_secret(school_id, gateway, secret)` — grava/atualiza
  - `get_school_gateway_secret(school_id, gateway)` — lê
  - Ambas concedidas **só à `service_role`** — nenhum client autenticado (nem admin) consegue ler a chave de volta, só as Edge Functions do backend.
- `create-payment` resolve a chave certa automaticamente a partir do `school_id` do admin que fez a chamada — nunca existe risco de uma escola usar a chave de outra por engano (testado explicitamente na Fase 7: escola sem chave configurada recebe erro claro, nunca cai numa chave de terceiro).

## Cobrança avulsa (não-recorrente)

Desde a Fase 16, dá pra criar uma cobrança única (taxa de matrícula, multa, material) sem precisar de um contrato/mensalidade — botão "Cobrança avulsa" em **Financeiro → Cobranças**. Usa a mesma chave/webhook já configurados, nada extra pra configurar.

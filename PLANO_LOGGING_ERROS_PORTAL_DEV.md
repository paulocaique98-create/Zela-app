# PLANO — Sistema Unificado de Logging de Erros no Portal do Desenvolvedor

Status: **PLANEJAMENTO. Nada foi executado.** Este documento existe só para estruturar os passos,
seguindo o mesmo padrão de todas as fases anteriores desta sessão (Storage, migração de reconhecimento
facial, etc.). **Cada fase abaixo precisa de autorização explícita separada antes de começar.**

## Motivação

Hoje recebemos reclamações de responsáveis sobre falhas no reconhecimento facial, mas **não existe
nenhum registro de quando e por que um reconhecimento falha**. Isso vale não só para reconhecimento
facial: uma varredura na infraestrutura de logging já existente encontrou 3 sistemas de log fragmentados
e sem UI unificada, um gap documentado oficialmente ("não há painel visual nem alerta automático" —
`OBSERVABILIDADE.md`), e a maioria dos `catch` espalhados pelo código hoje só faz `console.error` (nunca
persiste em lugar nenhum consultável). Este plano cobre erro técnico de forma genérica (qualquer fonte:
frontend, edge function, lógica de negócio) — não só reconhecimento facial, que é tratado como **um dos
tipos de erro logado**, com campos estruturados próprios dentro do mesmo sistema.

## Princípio central (igual ao usado em toda a sessão)

```
NUNCA trocar o que já funciona antes de provar que o novo funciona igual ou melhor.
NUNCA apagar o antigo antes de validar o novo.
NUNCA misturar migração com destruição.
```

Concretamente: `client_error_logs`, `edge_function_logs` e `cron_job_logs` **continuam existindo e
funcionando exatamente como hoje** durante todo o desenvolvimento do sistema novo. Nada é desligado até
o novo sistema estar rodando em produção, validado, por um período de estabilidade comprovada.

---

## O que já existe hoje (não duplicar — resumo da investigação)

| Peça | Onde | O que faz |
|---|---|---|
| `client_error_logs` | tabela + `src/lib/errorLogger.js` | Captura erros JS globais (`window.onerror`, `unhandledrejection`, `ErrorBoundary`). Insert liberado (até sem login), select só `developer`. |
| `DeveloperLogs.jsx` | Portal do Dev, aba "Logs" | Única tela de log hoje. Lê só `client_error_logs`, sem filtro/paginação além de limit 200. |
| `edge_function_logs` + `log_edge_function_error()` | RPC `SECURITY DEFINER` | Usada em só 4 de todas as edge functions (as financeiras). Sem UI — só SQL Editor manual. |
| `cron_job_logs` + `log_cron_job_run()` | RPC `SECURITY DEFINER` | Heartbeat de cron jobs (sucesso E falha, não é só erro). Sem UI. |
| `audit_logs` + `logAction()` | — | Auditoria de AÇÃO administrativa (ex: "admin cancelou solicitação"), semântica diferente de erro técnico. Não mexer. |
| `shadow_face_recognition_log` | — | Específica da comparação face-api.js vs Human (Fase F do outro plano). Não mexer, não é infra de erro genérica. |
| Sentry (`src/lib/sentry.js`) | condicional a `VITE_SENTRY_DSN` | Já recebe os mesmos eventos de `client_error_logs`, com replay de sessão. Alertas nativos existem mas não confirmamos se está configurado em produção hoje. |
| `notifyAdmins.ts` | edge function compartilhada | Push + notificação in-app, mas escopada por `school_id` e `role='admin'` — não existe canal hoje para avisar especificamente o `developer`. |

**Decisão de design**: em vez de forçar tudo dentro de `client_error_logs` (só frontend) ou criar mais uma
tabela fragmentada, este plano cria **uma tabela nova unificada** (`error_logs`) que vira o destino de
toda instrumentação NOVA, convivendo com as tabelas antigas até uma fase de migração posterior e opcional
(Fase F). Isso evita duas armadilhas: (a) recriar do zero o que já funciona, e (b) empilhar mais uma
tabela desconectada das outras 3 que já existem.

---

## FASE A — Schema aditivo (tabela + RPC, zero risco)

**Objetivo**: criar a estrutura de dados nova, sem tocar em nada que já existe e sem nenhuma tela ainda
consumindo ela.

```sql
CREATE TABLE error_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifica a origem e o tipo do erro, pra poder filtrar/agrupar depois.
  source         text NOT NULL CHECK (source IN ('client', 'edge_function', 'cron', 'business', 'face_recognition')),
  category       text NOT NULL,        -- ex: 'no_face_detected', 'below_threshold', 'payment_webhook_sync', 'unhandled_rejection'
  severity       text NOT NULL DEFAULT 'error' CHECK (severity IN ('warn', 'error', 'critical')),

  message        text NOT NULL,
  stack          text,
  context        jsonb,                -- tudo que for específico da categoria (ver "Campos por tipo" abaixo)

  -- Quem/onde
  school_id      uuid REFERENCES schools(id),
  user_id        uuid,                 -- sem FK de propósito: erro pode ocorrer antes do login (mesmo padrão de client_error_logs)
  role           text,
  url            text,
  user_agent     text,

  -- Deduplicação: evita que um bug que dispara 500x/minuto vire 500 linhas.
  fingerprint    text NOT NULL,        -- hash(source + category + message truncada)
  occurrences    integer NOT NULL DEFAULT 1,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),

  -- Fluxo de triagem (novo — nenhuma tabela antiga tem isso hoje)
  resolved       boolean NOT NULL DEFAULT false,
  resolved_at    timestamptz,
  resolved_by    uuid,
  resolution_note text,

  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_error_logs_fingerprint_open ON error_logs(fingerprint) WHERE NOT resolved;
CREATE INDEX idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_school ON error_logs(school_id);
CREATE INDEX idx_error_logs_source_category ON error_logs(source, category);
CREATE INDEX idx_error_logs_severity_unresolved ON error_logs(severity) WHERE NOT resolved;
CREATE INDEX idx_error_logs_context_gin ON error_logs USING gin(context);
```

**Por que fingerprint + occurrences em vez de 1 linha por evento**: a causa mais provável de "log vira
lixo inútil" é volume — um erro recorrente (ex: câmera que trava numa escola específica) pode disparar
centenas de vezes por dia. Com `ON CONFLICT (fingerprint) WHERE NOT resolved DO UPDATE` (dentro da RPC da
Fase B), o mesmo erro vira 1 linha com contador, não 1 linha por ocorrência. Marcar como `resolved`
"reabre" o fingerprint pra próxima ocorrência (se o bug voltar depois de corrigido, vira um novo caso
visível, não some dentro de uma linha antiga já resolvida).

**RPC única de escrita** (mesmo padrão já maduro no projeto — tabela + RPC `SECURITY DEFINER` com REVOKE
explícito de `PUBLIC`, EXECUTE liberado a quem precisa gravar):

```sql
CREATE OR REPLACE FUNCTION log_error(
  p_source text, p_category text, p_severity text, p_message text,
  p_stack text DEFAULT NULL, p_context jsonb DEFAULT NULL,
  p_school_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL, p_url text DEFAULT NULL, p_user_agent text DEFAULT NULL
) RETURNS uuid
SECURITY DEFINER
SET search_path = public
AS $$
  -- trunca message/stack (mesmo padrão de logEdgeError.ts: 2000/8000 chars),
  -- calcula fingerprint = md5(source || category || left(message, 300)),
  -- faz INSERT ... ON CONFLICT (fingerprint) WHERE NOT resolved
  --   DO UPDATE SET occurrences = error_logs.occurrences + 1, last_seen_at = now()
  -- retorna o id da linha (nova ou atualizada).
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION log_error FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_error TO anon, authenticated, service_role;
```

`anon`/`authenticated` recebem EXECUTE (não INSERT direto na tabela) porque erro de cliente pode ocorrer
antes do login — mesmo raciocínio já usado em `client_error_logs`. A validação de enum (`source`,
`severity`) e o truncamento acontecem dentro da função, então mesmo um client malicioso não consegue
gravar lixo fora do formato esperado nem se passar por `source='cron'` de forma útil (RLS de leitura
continua só para `developer`, então não há ganho prático em falsificar a origem).

**RLS**: só SELECT/UPDATE (pra marcar como resolvido) para `role = 'developer'`, via `get_my_role()`
(mesmo padrão das outras 3 tabelas). Nenhum INSERT/DELETE direto — tudo via `log_error()`.

**Critério de sucesso desta fase**: tabela e RPC existem em produção, testadas manualmente via SQL
Editor, zero código do app aponta pra elas ainda. Nenhum comportamento existente muda.

---

## FASE B — Instrumentação nova (sem tocar no que já existe)

Objetivo: começar a alimentar `error_logs` a partir de código novo, sem alterar `errorLogger.js` nem
`logEdgeError.ts` ainda (isso fica pra Fase F, opcional). Três frentes, podem ser feitas em paralelo ou
em qualquer ordem — a mais urgente pro problema relatado é a B1.

### B1 — Reconhecimento facial (a motivação original deste plano)

Em `AdminFaceScanner.jsx`, instrumentar `log_error(source='face_recognition', ...)` em **todo caminho que
hoje só mostra uma mensagem na tela e não registra nada**:

| category | Quando dispara | Contexto (`context` jsonb) |
|---|---|---|
| `no_face_detected` | Nenhum rosto encontrado no frame | `{ luminance, attempt_number }` |
| `multiple_faces_ambiguous` | (depende da B-extra abaixo) mais de 1 rosto no quadro | `{ face_count }` |
| `frame_position_rejected` | too-far / too-close / off-center persistente | `{ reason, face_width_ratio, offset_x, offset_y }` |
| `below_threshold` | Melhor distância > MATCH_THRESHOLD | `{ best_distance, threshold, candidate_count }` |
| `ambiguous_match` | Melhor distância OK mas margem < MATCH_MARGIN | `{ best_distance, second_best_distance, margin, candidate_ids_masked }` |
| `stuck_timeout` | STUCK_TIMEOUT_MS atingido, caiu pro fallback PIN/QR | `{ elapsed_ms, attempts_in_session }` |
| `camera_watchdog_recovery` | Watchdog detectou câmera travada e recuperou sozinho | `{ stalled_ms }` |
| `rate_limited` | RPC de rate limit recusou tentativa | `{ limit_type }` |

Todos com `severity='warn'` por padrão (é esperado que aconteçam eventualmente; o que importa é o
volume/padrão, não o evento isolado) exceto `camera_watchdog_recovery` que pode ser `error` (sinal de
hardware com problema recorrente).

**Correlação de sessão**: adicionar um `kiosk_session_id` (uuid gerado no client ao abrir a tela do
totem) dentro do `context` de cada evento — permite depois reconstruir "essa pessoa tentou 4 vezes,
errou por `below_threshold` 3x e no fim desistiu pro PIN" em vez de ver 4 linhas soltas sem relação.

**Isso é o que resolve o problema relatado**: depois de 1-2 semanas rodando, dá pra responder com dado
real perguntas como "a maioria das falhas é `below_threshold` (sugere afrouxar o limiar) ou
`frame_position_rejected` (sugere problema de enquadramento/hardware) ou `ambiguous_match` (sugere
recalibrar `MATCH_MARGIN`)?" — sem isso, qualquer ajuste de threshold continua sendo chute.

### B2 — Estender cobertura de Edge Functions

Criar um `logError.ts` compartilhado (irmão de `logEdgeError.ts`, ou evoluir o próprio `logEdgeError.ts`
para chamar `log_error()` em vez de `log_edge_function_error()` — a decidir na implementação) e instrumentar
o catch principal das edge functions que hoje **não têm nenhuma instrumentação** (confirmado na
investigação): cadastro de usuário, chat, notificações não-financeiras, IA de cardápio/calendário, etc.
Mesmo padrão best-effort já usado (nunca lança, nunca mascara o erro real da function).

### B3 — Função central para o frontend (adoção progressiva)

Adicionar em `src/lib/errorLogger.js` uma nova função `logAppError(category, error, context)` (ao lado da
já existente `logClientError`, sem alterá-la) que chama `log_error(source='business', ...)`. Objetivo:
dar um destino fácil para os `catch` que hoje só fazem `console.error` (confirmado: 16 ocorrências em
`App.jsx`, 6 em `AdminFaceScanner.jsx`, e provavelmente dezenas espalhadas pelo resto do app) — **sem
forçar refactor de tudo de uma vez**. Prioridade de adoção sugerida (fluxos onde um erro silencioso mais
prejudica o dia a dia): check-in/check-out (`App.jsx` `updateStudentStatus`), pagamentos
(`AdminFinanceiro.jsx`), matrícula pública. O resto migra oportunisticamente, sem virar um projeto à parte.

**Critério de sucesso desta fase**: `error_logs` recebendo eventos reais de reconhecimento facial em
produção, consultável via SQL Editor. Nenhuma tela nova ainda — isso é a Fase D.

---

## FASE C — Validação de carga (fingerprint sob uso real)

**Objetivo**: confirmar que a deduplicação por fingerprint realmente evita explosão de linhas antes de
depender dela pra sempre.

Passos: acompanhar por alguns dias o crescimento de `error_logs` em produção (contagem de linhas vs.
soma de `occurrences`), confirmar que um erro repetitivo real (ex: uma escola com câmera ruim gerando
`no_face_detected` toda hora) vira poucas linhas com contador alto, não centenas de linhas.

**Ponto de parada**: se o fingerprint (message truncada) estiver agrupando coisas que deveriam ser
diferentes (ex: duas escolas diferentes com o mesmo `no_face_detected` viram 1 linha só, escondendo qual
escola tem o problema) — nesse caso o fingerprint precisa incluir `school_id`, ajustar antes de prosseguir.

---

## FASE D — Tela unificada no Portal do Desenvolvedor

**Objetivo**: substituir/evoluir `DeveloperLogs.jsx` por uma tela que lê `error_logs` (e opcionalmente
ainda mostra `client_error_logs`/`edge_function_logs`/`cron_job_logs` antigos numa aba "Histórico" durante
a transição, até a Fase F).

Funcionalidades:
- **Filtros**: fonte (client/edge_function/cron/business/face_recognition), categoria, escola, severidade,
  texto livre (message), período (hoje/7 dias/mês/customizado — reaproveitando o mesmo padrão de período
  já usado em Horas Extras/Histórico nesta sessão).
- **Lista agrupada por fingerprint**: mostra `occurrences`, `first_seen_at`, `last_seen_at` — erros mais
  frequentes primeiro (ordenação padrão), não só mais recentes primeiro (esse é o problema do
  `DeveloperLogs.jsx` atual: mais recente primeiro esconde um erro raro-mas-crítico atrás de ruído recente).
- **Detalhe expansível**: stack completo, `context` formatado (JSON), escola, usuário, user agent.
- **Ação "Marcar como resolvido"**: grava `resolved_by`/`resolved_at`/`resolution_note` — fingerprint
  reabre como novo caso se o erro voltar a acontecer depois (ver Fase A).
- **Painel específico de Reconhecimento Facial**: view/aba dedicada só com `source='face_recognition'`,
  agrupado por `category` (quantos `below_threshold`, quantos `ambiguous_match`, etc, por escola e por
  período) — é o relatório que efetivamente responde a pergunta original desta investigação.

**Critério de sucesso**: developer consegue, sem abrir o SQL Editor, responder "quais são os 5 erros mais
frequentes essa semana" e "quantas falhas de reconhecimento facial a escola X teve e de que tipo".

---

## FASE E — Alerta automático para erros críticos

**Objetivo**: fechar o gap documentado em `OBSERVABILIDADE.md` ("não há alerta automático").

- Criar `notifyDevelopers()` (variante de `notifyAdmins.ts`, sem filtro de `school_id`, buscando
  `role='developer'`) reaproveitando o mesmo mecanismo de push/notificação in-app já existente.
- Disparo: quando `log_error()` insere uma linha **nova** (não um incremento de `occurrences`) com
  `severity='critical'` — evita notificar a cada ocorrência de um erro já conhecido, só quando surge algo
  novo. Rate-limit adicional (ex: no máximo 1 notificação a cada 10 min) pra evitar tempestade de alertas
  se várias coisas quebrarem ao mesmo tempo.
- Avaliar reaproveitar Sentry como canal complementar (já integrado, já tem alerta nativo) em vez de
  construir tudo por push — depende de confirmar se `VITE_SENTRY_DSN` está de fato configurado em
  produção hoje (não confirmado nesta investigação).

**Ponto de parada**: se o volume de notificações for alto demais mesmo com o filtro de "só fingerprint
novo", reavaliar o critério (ex: só `critical` de `source IN ('edge_function','cron')`, nunca
`face_recognition`/`client`, que tendem a ser mais barulhentos e menos acionáveis individualmente).

---

## FASE F — Migração dos logs existentes (opcional, só depois de tudo validado)

**Objetivo**: parar de escrever em 3 tabelas separadas, unificando tudo em `error_logs`.

- Apontar `errorLogger.js` (`logClientError`) para gravar em `error_logs` (`source='client'`) em vez de
  `client_error_logs`.
- Apontar `logEdgeError.ts` para `error_logs` (`source='edge_function'`) em vez de `edge_function_logs`.
- `cron_job_logs` continua existindo à parte (é heartbeat de sucesso E falha, não só erro — semântica
  diferente), mas passa a também espelhar falhas (`success=false`) em `error_logs` via `log_error()`,
  pra aparecerem na tela unificada também.
- **Só depois** de um período de estabilidade comprovado, considerar aposentar (nunca apagar sem aviso)
  `client_error_logs`/`edge_function_logs` como destino de escrita — leitura histórica pode continuar
  disponível indefinidamente, são tabelas baratas.

## FASE G — Retenção (housekeeping, baixa prioridade)

Cron mensal (mesmo padrão de `daily-reset`) apagando linhas de `error_logs` com `resolved=true` e
`resolved_at` há mais de N dias (ex: 180) — evita crescimento indefinido sem perder nada relevante (erro
não resolvido nunca é apagado automaticamente).

---

## Riscos e Ressalvas

| Risco | Mitigação no plano |
|---|---|
| Volume de linhas explode com erro repetitivo | Fingerprint + `occurrences` (Fase A), validado sob carga real (Fase C) |
| Fingerprint agrupa coisas que deveriam ser distintas (ex: esconde qual escola) | Fase C existe especificamente pra pegar isso antes de depender da dedup pra sempre |
| Notificação de erro crítico vira spam | Só dispara em fingerprint novo, com rate-limit adicional (Fase E) |
| Cliente malicioso grava lixo/falsifica origem | Toda escrita passa por RPC `SECURITY DEFINER` com validação de enum e truncamento, nunca INSERT direto |
| Instrumentação nova (B1/B2) introduz bug no fluxo real que está sendo logado | Mesmo padrão best-effort já usado em `logEdgeError.ts`/`logClientError` — logging nunca lança, nunca derruba o fluxo principal |
| Duplicar o que já existe / quebrar `client_error_logs`/`edge_function_logs` | Fases A-E não tocam nas tabelas antigas; migração real só na Fase F, opcional e por último |

## Estimativa de esforço (qualitativa)

- Fase A: pequena — schema + RPC, sem UI.
- Fase B1 (reconhecimento facial): é a prioridade — esforço médio, maior parte é mapear cada `else`/
  `return 'unknown'` já existente em `AdminFaceScanner.jsx` para o `category` certo.
- Fase B2/B3: incremental, pode se estender por várias sessões sem bloquear o resto.
- Fase D (tela): esforço médio-alto — é a peça mais visível, mas reaproveita padrão de filtro/período já
  usado em outras telas desta sessão (Horas Extras, Histórico).
- Fase E: pequena, reaproveita `notifyAdmins.ts` como base.
- Fase F/G: baixa prioridade, fazer só depois de tudo validado.

## Autorização

Cada fase acima deve ser autorizada separadamente. Nenhuma delas está autorizada a começar por este
documento — ele é só o roteiro. Recomendação de ordem: **A → B1 → D (mínimo: filtro + agrupamento por
`source='face_recognition'`) → C → B2/B3 → E → F/G**, priorizando ter dado real de reconhecimento facial
visível o quanto antes, já que é a dor relatada agora.

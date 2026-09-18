# PLANO — Explicação por IA dos Logs de Erro (sob demanda)

Status: **PLANEJAMENTO. Nada foi executado.** Complementa o
`PLANO_LOGGING_ERROS_PORTAL_DEV.md` — aqui, só para os casos que o dicionário
de padrões conhecidos (`src/lib/errorSummaries.js`) não reconhece.

## Motivação

`errorSummaries.js` já traduz os padrões de erro mais comuns (deploy antigo,
falha de rede, permissão de câmera, categorias de reconhecimento facial
etc.) para uma frase em português. Mas por definição só cobre o que já
mapeamos manualmente — qualquer erro novo/raro continua aparecendo cru, em
inglês/técnico, sem explicação nenhuma. A ideia é usar uma IA para gerar uma
explicação em português SÓ nesses casos não reconhecidos, sob demanda (não
automático), deixando claro que é um palpite, não um fato.

**Importante, achado durante a investigação deste plano**: não existe
integração com Grok em nenhum lugar do projeto hoje. A IA já integrada e
paga/configurada é o **Google Gemini** (`GEMINI_API_KEY`/`GEMINI_MODEL`),
usada em `parse-cardapio-ia` e `parse-calendario-ia`. Este plano usa Gemini
por padrão, reaproveitando a infraestrutura já existente — **se a intenção
for mesmo usar Grok especificamente, isso precisa ser confirmado antes da
Fase A**, porque implica configurar um provedor novo (conta, chave de API,
formato de request diferente) em vez de só reaproveitar o que já funciona.

## Princípios (decisão já tomada, ver conversa anterior)

- **Sob demanda, nunca automático**: um botão "Explicar com IA" por log, só
  quando `summarizeErrorLog()` (o dicionário determinístico) não reconheceu
  nada. Chamar a IA pra todo log geraria custo e ruído sem necessidade.
- **A IA nunca resolve nada, só explica**: sem ação automática, sem abrir
  ticket, sem sugerir código — só uma frase em português explicando a causa
  provável.
- **Nunca esconder que é um palpite**: a explicação da IA aparece com um
  rótulo visual diferente do dicionário determinístico (que é 100% previsível
  e sempre igual pro mesmo padrão) — algo como "🤖 Palpite da IA — pode estar
  incompleto ou errado", nunca misturado como se fosse fato confirmado.
- **Resultado cacheado**: a explicação é gerada uma vez por log e salva —
  nunca gera de novo sozinha nas próximas vezes que a mesma linha for aberta
  (evita custo repetido pelo mesmo erro, especialmente om `occurrences` alto).
- **Só na tabela unificada**: `error_logs` (não em `client_error_logs`
  legado) — é a tabela que vai continuar existindo, não faz sentido alterar
  o schema de uma tabela que o outro plano já cogita aposentar (Fase F).

---

## FASE A — Confirmar provedor de IA (decisão do usuário, bloqueante)

Antes de qualquer código: confirmar se é Gemini (recomendado, já configurado)
ou Grok (novo provedor, exige conta/chave/integração do zero). O resto deste
plano assume Gemini; se for Grok, as Fases C/D mudam só a chamada HTTP em si
(endpoint, formato do payload, nome da env var), a arquitetura geral não
muda.

---

## FASE B — Schema aditivo

```sql
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS ai_summary_model text;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS ai_summary_generated_at timestamptz;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS ai_summary_generated_by uuid;
```

Nenhuma policy nova de RLS necessária — já existe `SELECT`/`UPDATE` só para
`developer` na tabela inteira (Fase A do plano de logging); esses campos só
mais colunas dentro da mesma linha.

**Critério de sucesso**: colunas existem, nada aponta pra elas ainda.

---

## FASE C — Edge function `explain-error-log`

Mesmo padrão de autenticação/estrutura de `parse-cardapio-ia`/
`parse-calendario-ia` (só `admin`/`developer`, na prática só vai ser chamada
por `developer` já que só ele enxerga a tela de Logs):

1. Recebe `{ log_id }`.
2. Busca a linha em `error_logs` (via `adminClient`, service role).
3. Se `ai_summary` já preenchido: retorna o valor cacheado direto, **sem**
   chamar a IA de novo (economiza custo em reaberturas da mesma linha).
4. Monta o prompt com os dados JÁ estruturados que a linha tem —
   `source`, `category`, `message`, `stack` (truncado, igual já é feito em
   outros lugares), `context` (jsonb) — nunca payload bruto/segredo, mesma
   disciplina de `logEdgeError.ts`.
5. Chama o Gemini com um prompt fixo, por exemplo:

   > "Você explica erros técnicos de um sistema de gestão escolar para uma
   > pessoa leiga, em português, em até 3 frases. Foque na causa mais
   > provável e no que ela representa na prática (não precisa sugerir
   > correção). Se a mensagem não tiver informação suficiente para uma
   > causa provável, diga isso claramente em vez de inventar uma explicação
   > genérica. Nunca use jargão sem explicar."

6. Salva `ai_summary`, `ai_summary_model`, `ai_summary_generated_at`,
   `ai_summary_generated_by` (id de quem pediu) na linha.
7. Retorna o resultado pro front.

**Rate limit**: reaproveitar a RPC `check_rate_limit` (já usada em
`parse-cardapio-ia`), escopado por developer (ex: 20 explicações/5min) — é
suficiente pro uso manual esperado (poucos developers, uso ocasional) sem
abrir brecha de custo descontrolado.

**Critério de sucesso**: chamada manual via `curl`/Postman com um `log_id`
real retorna uma explicação coerente e grava na linha.

---

## FASE D — Frontend (`DeveloperErrorLogs.jsx`)

- Dentro do log expandido, quando `summarizeErrorLog(log)` retornar `null`
  (nenhum padrão conhecido) **e** `log.ai_summary` também for vazio: mostrar
  um botão "✨ Explicar com IA".
- Ao clicar: chama a edge function, mostra estado de carregamento, e exibe o
  resultado com o rótulo "🤖 Palpite da IA — pode estar incompleto ou
  errado" (cor/estilo visualmente diferente do resumo determinístico, que já
  usa `text-dev-primary`).
- Se `log.ai_summary` já existir (de uma geração anterior, já cacheada): mostra
  direto, sem botão, só um link pequeno "Gerar de novo" (chama a function de
  novo, ignorando o cache — conta pro rate limit).
- Sem alteração no comportamento de `DeveloperLogs.jsx` (legado) — fica de
  fora deste plano, conforme princípio acima.

**Critério de sucesso**: clicar em "Explicar com IA" num log sem padrão
reconhecido mostra uma explicação em português em poucos segundos, marcada
claramente como palpite de IA.

---

## FASE E — Observação e ajuste de prompt

Rodar por um tempo real e revisar: as explicações estão realmente ajudando
(causa plausível, específica) ou saindo genéricas demais ("pode ser um erro
de rede ou de código")? Ajustar o prompt com base em exemplos reais salvos
em produção antes de considerar a feature "pronta" — mesmo raciocínio de
calibração com dado real já aplicado nas outras fases de IA/threshold desta
sessão.

---

## Riscos e Ressalvas

| Risco | Mitigação no plano |
|---|---|
| Custo por chamada de IA descontrolado | Sob demanda (nunca automático) + cache por log + rate limit por developer |
| IA "inventa" uma causa plausível-mas-errada, alguém trata como fato | Rótulo visual permanente de "palpite", nunca misturado com o dicionário determinístico |
| Prompt vaza dado sensível (stack com fragmento de URL/token) | Mesma disciplina já usada em `logEdgeError.ts`: nunca payload bruto/segredo, truncamento nos campos enviados |
| Resposta genérica demais pra ser útil | Fase E existe pra calibrar o prompt com exemplo real antes de considerar concluído |
| Confusão de qual IA usar (Grok vs. Gemini) | Fase A trava o plano até essa decisão ser confirmada explicitamente |

## Estimativa de esforço

- Fase A: decisão, não é esforço de código.
- Fase B: pequena (schema).
- Fase C: média (nova edge function, mas reaproveita padrão já existente
  quase inteiro de `parse-cardapio-ia`).
- Fase D: pequena-média (um botão + estado de carregamento + exibição).
- Fase E: acompanhamento, não é uma tarefa de implementação isolada.

## Autorização

Cada fase precisa de autorização separada, mesmo padrão desta sessão.
Nenhuma foi autorizada a começar por este documento.

---
description: Traz um resumo dos erros reais capturados em error_logs (Portal do Dev), com foco em reconhecimento facial
---

Consulte a tabela `error_logs` (projeto Supabase linkado, `orafqopnomdrvwlvxrkz`) via
`npx supabase db query --linked` e monte um relatório de observabilidade pro usuário. Não implemente
nada nesta execução — é só leitura e análise.

Contexto: existe um sistema de logging unificado (ver `docs/PLANO_LOGGING_ERROS_PORTAL_DEV.md` do
repo) que registra falhas reais de reconhecimento facial, edge functions, cron e lógica de negócio desde
18/09/2026. A motivação original foi entender reclamações de responsáveis não conseguindo ser reconhecidos
no totem — então o reconhecimento facial (`source='face_recognition'`) é sempre a prioridade do relatório,
mas inclua as outras fontes também.

Passos:

1. Rode uma query agregada por `source` + `category`, somando `occurrences`, contando linhas distintas
   (fingerprints), e pegando `min(first_seen_at)`/`max(last_seen_at)`, filtrando só `resolved = false`
   (a menos que o usuário peça pra incluir resolvidos também). Ordene por soma de `occurrences` desc.

2. Para `source='face_recognition'` especificamente, quebre por escola (`school_id`, resolvendo o nome
   via join com `schools`) e por `category` — é o que responde "a causa mais comum é limiar apertado
   demais (`below_threshold`), ambiguidade entre cadastros parecidos (`ambiguous_match`), problema de
   enquadramento/hardware (`frame_position_rejected`), ou câmera travando (`camera_watchdog_recovery`)?".

3. Para `severity='critical'` (qualquer fonte), liste cada uma individualmente (são poucas, cada uma
   importa) com mensagem, contexto resumido e se já foi notificada (`notified_at`).

4. Se não houver nenhuma linha ainda (comum logo após implementar), diga isso claramente em vez de
   inventar dado — é sinal de pouco uso real desde o deploy, não de bug.

5. Feche o relatório com uma recomendação objetiva: com base no padrão observado, o próximo ajuste faz
   mais sentido ser no limiar (`MATCH_THRESHOLD`/`MATCH_MARGIN` em `AdminFaceScanner.jsx`), no
   enquadramento/hardware, ou em outra coisa — só recomende ajustar threshold se os números realmente
   sustentarem isso, não por padrão.

Não altere nenhum limiar, nenhum código de reconhecimento facial, nem qualquer configuração nesta
execução — o comando é só para trazer o resumo. Qualquer mudança real (ex: recalibrar o limiar) deve ser
proposta e só feita depois de confirmação explícita, como sempre.

## Linha de base: totem sem molde (30/09/2026 14:54)

Em 30/09/2026 o totem passou a reconhecer o rosto na tela inteira (sem molde oval e sem
exigir centralizar; só "Aproxime-se/Afaste-se" continuam) e foram corrigidos dois
travamentos que obrigavam fechar no X e abrir de novo (commit `393a45d`). Como `error_logs`
soma `occurrences` desde o primeiro registro, compare SEMPRE com os números abaixo (foto
tirada no momento da publicação) e mostre no relatório uma tabela "antes / depois", com o
que caiu, o que continuou e o que apareceu de novo. Lembre que o totem só roda a versão
nova depois de recarregar a página.

| source | category | occurrences em 30/09 14:54 |
|---|---|---|
| face_recognition | below_threshold | 399 |
| face_recognition | frame_position_too_close | 344 |
| face_recognition | frame_position_off_center | 253 |
| face_recognition | frame_position_rejected | 210 |
| face_recognition | stuck_timeout | 174 |
| face_recognition | frame_position_too_far | 109 |
| face_recognition | ambiguous_match | 50 |
| face_recognition | liveness_blocked | 41 |
| face_recognition | liveness_check_observed | 23 |
| face_recognition | camera_watchdog_recovery | 19 |
| face_recognition | no_face_detected | 2 |
| edge_function | notify-checkin-request | 201 |
| client | react_render_crash | 130 |
| client | unhandled_error | 47 |

O que esperar: `frame_position_off_center` deve parar de crescer (não existe mais);
`stuck_timeout` deve cair (os travamentos corrigidos prendiam a pessoa até os 20 s);
`frame_position_too_close/too_far` agora guardam `face_width_ratio` no contexto (tamanho
do rosto no quadro), base para calibrar a distância ideal entre o totem e a pessoa;
`react_render_crash` de "versão antiga" deve sumir desde o commit `f4ed2a9`. Os eventos
de rosto são registrados com intervalo mínimo por categoria (FACE_LOG_THROTTLE_MS), então
contam tentativas espaçadas, não cada quadro.

### Categoria nova: `match_lost` (30/09/2026, depois da linha de base)

Reconhecimento confirmado que caiu ANTES de o pedido sair (antes era invisível: só aparecia
no `shadow_face_recognition_log` como vários reconhecimentos seguidos sem pedido). Desde
então o reconhecimento confirmado tolera até 1 s sem rosto ou fora da distância
(`MATCH_GRACE_MS`) antes de cair. Contexto: `reason` (`no_face`, `too-far`, `too-close`),
`held_ms` (quanto tempo ficou reconhecido), `person_id`. Linha de base: 0. Se crescer, ver
se o `held_ms` fica perto de 1 s (tolerância curta) ou se o motivo é distância.


### 01/10/2026: `frame_vazio_biblioteca` e fim dos erros do localhost

- O erro solto "Box.constructor" (era `client/unhandled_error`, 41 até 30/09, iPhone do totem)
  passou a ser `face_recognition/frame_vazio_biblioteca` com severidade `warn`. Além disso o
  totem só lê quadro pronto da câmera (`quadroPronto`) e descarta posição de rosto vazia
  (`caixaValida`). Esperado: quase zero. Se crescer, avaliar o ajuste de precisão do WebGL no iOS.
- Erros gerados em `localhost` (testes do desenvolvedor) não são mais gravados no registro da
  produção (`registroDeErrosAtivo` em `src/lib/errorLogger.js`).

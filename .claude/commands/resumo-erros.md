---
description: Traz um resumo dos erros reais capturados em error_logs (Portal do Dev), com foco em reconhecimento facial
---

Consulte a tabela `error_logs` (projeto Supabase linkado, `orafqopnomdrvwlvxrkz`) via
`npx supabase db query --linked` e monte um relatório de observabilidade pro usuário. Não implemente
nada nesta execução — é só leitura e análise.

Contexto: existe um sistema de logging unificado (ver `PLANO_LOGGING_ERROS_PORTAL_DEV.md` na raiz do
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

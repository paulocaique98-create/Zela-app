# Plano — Integração com equipamento facial Control iD

Status: planejamento aprovado em 11/11/2026. Equipamento de bancada: **iDFace (3.000 faces)**.
Motivo: o tablet da escola piloto AZL001 deu defeito; o Zela precisa de uma alternativa em hardware dedicado.
Escopo: só Control iD. Intelbras e Hikvision ficam para depois (a coluna `brand` já prevê isso).

## Como a Control iD conversa (documentação oficial)
- **Push:** o equipamento faz `GET /push?deviceId&uuid` periodicamente e recebe um comando ou uma resposta vazia. Depois devolve o resultado em `POST /result`. A conexão sai da escola, então não precisa de IP fixo, abrir porta nem VPN.
- **Monitor:** o equipamento envia eventos por POST em `/dao` (access_logs), `/device_is_alive` (heartbeat, 30 s), `/access_photo` (base64) e `/door`.
- **Modo online:** o equipamento reconhece o rosto localmente e pergunta ao servidor se libera (`new_user_identified`).
- **Cadastro:** `create_objects` (users) mais foto facial (`user_set_image` / "facial-enroll").
- Docs: https://www.controlid.com.br/docs/access-api-en/

## Decisões já tomadas
- A biometria é comparada **dentro do equipamento**. O Zela recebe só o `user_id` do equipamento, e a foto só se for necessária (Storage privado).
- O rosto é cadastrado no equipamento (qualidade padrão) **ou** pelo app do responsável. A escola escolhe.
- O token é por dispositivo, guardado só como hash. O `school_id` sai do dispositivo, nunca do payload.
- O evento do equipamento **entra no fluxo existente** (Solicitação → Monitor da Recepção → Recepção confirma), sem substituí-lo.

## Fases (cada uma é 1 sessão, 1 PR)

| # | Fase | Arquivos | Depende de |
|---|---|---|---|
| 1 | Base de dados e segurança (**feita, não aplicada**) | `supabase/migrations/20261212120000_dispositivos_acesso_controlid.sql`, `supabase/rollbacks/…` | — |
| 2 | Revisão de segurança da fase 1 (`/security-review`) e aplicação em staging. Teste SQL de permissões (gestao de outra escola, recepcao, anon). | migration, `src/test/dispositivosAcesso.test.js` | 1 |
| 3 | Edge Function `controlid-push`: rotas `/push`, `/result`, `/dao`, `/device_is_alive`, `/door`. O token vai no path. Parser puro testável, limite de tamanho, log via `_shared/logEdgeError.ts`. | `supabase/functions/controlid-push/index.ts`, `…/parser.ts`, `supabase/config.toml` (`verify_jwt = false`) | 2 |
| 4 | Vínculo de identidade: tabela `device_person_links` (dispositivo + `user_id` do equipamento → `authorized_persons`/responsável), com RLS por escola. | nova migration | 2 |
| 5 | Sincronização de cadastro: fila de comandos por dispositivo (`device_commands`), entregue via `/push` (create/update/delete user e foto). A foto sai do Storage privado só no momento do envio. | migration, `controlid-push` | 3, 4 |
| 6 | Integração ao fluxo de check-in/out: evento reconhecido → mesma solicitação que o totem cria hoje. **Antes, ler o caminho atual** (`attendance_logs` em `src/App.jsx` ~l.1236 e o fluxo do `AdminFaceScanner.jsx`) e reaproveitar a regra. Realtime filtrado por `school_id`. | função SQL/edge, sem mexer no fluxo do tablet | 3, 4 |
| 7 | Painel de dispositivos (Gestão): registrar (mostra o token 1x), girar token, ativar/desativar, status online/offline pelo `last_seen_at`. Leitura para Recepção. | novo `src/components/GestaoDispositivos.jsx`, entrada no menu da Gestão | 2 |
| 8 | Cadastro de rosto pelo app do responsável (opcional, por escola), reaproveitando a captura atual e enviando via fase 5. | componentes de família (a definir) | 5 |
| 9 | Bancada com iDFace real: HTTPS/certificado, formato real dos payloads, cadastro remoto, queda de rede e reenvio. Ajustar o parser com amostras reais (anonimizadas). | `parser.ts`, testes | 3 |
| 10 | Piloto na AZL001, com o tablet como contingência, e atualização de `docs/ZELA_STATUS.md` e `docs/ZELA_CHECKIN`. | docs | 6, 7, 9 |

Pode começar já, sem o equipamento: fases 2, 3, 4, 7. Precisam do equipamento: 5 (validação), 6 (fim a fim) e 9.

## Riscos e pontos em aberto
1. **HTTPS:** a doc não confirma HTTPS no push/monitor nem a validação de certificado. Se só houver HTTP, o token trafega aberto. Plano B: um gateway local (mini-PC) na escola, que recebe em HTTP na LAN e repassa ao Zela via HTTPS.
2. **Autenticação:** a Control iD não assina requisições. Valem o token no path, o `deviceId` fixado no 1º contato e a deduplicação de eventos.
3. **Papéis:** assumido que `gestao` gerencia e `admin`/`recepcao` só visualizam. **Confirmar com o dono do produto.**
4. **LGPD/biometria:** a foto enviada ao equipamento é dado biométrico, então exige consentimento do responsável (ver o fluxo de consentimentos existente), mais exclusão no equipamento quando a pessoa sai.
5. **Modo online x standalone:** começar em standalone + Monitor (a porta não depende da internet). Avaliar o modo online depois, para regras do Zela decidirem a liberação.
6. **Comercial:** venda, aluguel ou comodato ainda não foi decidido. Não afeta as fases 1 a 9.

## Critérios de pronto (piloto)
- O responsável é reconhecido no iDFace e a solicitação aparece no Monitor da Recepção da escola certa em menos de 5 s.
- Um dispositivo de outra escola, ou com token errado, não grava nada (teste automatizado).
- Um equipamento desligado aparece como offline no painel em até 2 min.
- Nenhuma foto ou biometria fica em `device_events`.

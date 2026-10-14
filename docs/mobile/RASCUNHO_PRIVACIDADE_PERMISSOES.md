# Rascunho de privacidade e permissões do app (para revisão jurídica)

Status: rascunho técnico revisado em 14/10, não é texto final nem parecer jurídico. Revisar com advogado (LGPD, dados de crianças e biometria) antes das lojas.

## Papéis (a confirmar no contrato)
- Escola: controladora dos dados de alunos, responsáveis e autorizados.
- Zela: operadora desses dados, sob contrato (LGPD art. 39). Para os dados da conta no app (login, token de notificação, logs de erro), o Zela pode atuar como controlador. O jurídico define a divisão.
- Falta: cláusulas de operador no contrato escola e Zela, e fluxo de incidente (art. 48).

## Permissões Android (AndroidManifest)
| Permissão | Para quê | Obrigatória |
|---|---|---|
| CAMERA | Cadastro facial e reconhecimento no totem; leitura de QR Code | Não declarada como obrigatória no manifest. Confirmar que o app funciona sem câmera (PIN e QR Code) antes de responder o Google Play |
| POST_NOTIFICATIONS | Avisos de entrada e saída, comunicados | Não, o usuário pode negar |
| INTERNET | Comunicação com o servidor | Sim |

## Dados tratados pelo app
- Cadastro: nome, e-mail, vínculo com a escola e com os alunos.
- Biometria facial de adultos (responsáveis e autorizados). Dado pessoal sensível (LGPD art. 5, II e art. 11). Usada só para identificar essas pessoas no check-in/out.
  - Armazenado hoje (conferido nas migrations): descritor facial numérico (`face_descriptor`, `face_descriptor_v2`) e foto do rosto (bucket `person-photos`; coluna legada `photo_url` em base64). Ou seja, ficam a imagem e o descritor, não só o descritor.
  - Base legal a decidir pelo jurídico: consentimento específico e destacado (art. 11, I), revogável, com alternativa sem biometria (PIN e QR Code existem no fluxo), ou segurança e prevenção à fraude (art. 11, II, g), com justificativa registrada.
  - Autorizados (avós, motoristas etc.) não usam o app. Definir quem coleta o consentimento deles e como é registrado (responsável pelo cadastro, escola, termo assinado).
  - A definir: prazo de retenção, exclusão a pedido, quem na escola acessa.
- Dados de crianças (alunos): tratados pela escola, com consentimento específico de um dos pais ou responsável (art. 14). Este artigo trata dos alunos, não da biometria dos adultos.
- Token de notificação (FCM) por aparelho, ligado à conta e à escola.
- Logs técnicos (`error_logs`, Sentry): podem conter identificadores. Definir o que é registrado e por quanto tempo.

## Direitos do titular (art. 18)
- Acesso, correção, exclusão, revogação do consentimento e portabilidade: definir canal (e-mail do encarregado) e prazo.
- Exclusão de conta já existe e foi testada no S23 (13/10). Documentar o que ela apaga e o que é mantido (histórico de check-in/out, por rastreabilidade e segurança escolar), com a base legal da retenção.
- Já existe `docs/LGPD_RETENCAO.md`: alinhar a retenção com ele (não revisado nesta sessão).

## Segurança (art. 46)
- Isolamento por escola (school_id) e RLS em todas as tabelas; fotos em bucket com acesso por URL assinada (conferir se o bucket é privado antes de afirmar).
- Descrever no texto final apenas medidas verificadas.

## Operadores e destinos
- Supabase (banco, autenticação, armazenamento, funções).
- Google Firebase Cloud Messaging (entrega de push; recebe só o token e o conteúdo do aviso).
- Sentry (monitoramento de erros do frontend).
- Asaas (cobrança), quando o módulo financeiro estiver ativo.
- Transferência internacional (art. 33): confirmar a região do projeto Supabase e onde Firebase, Sentry e Asaas processam dados, e registrar a base legal.

## Pontos para as lojas
- Google Play: formulário de Segurança de dados (coleta de imagem facial, identificadores, notificações) e URL da política.
- Apple: rótulos de privacidade e justificativa de câmera (`NSCameraUsageDescription`). O iOS já compila no simulador, então preparar junto.
- Política de privacidade pública, com contato do encarregado (DPO).

## Perguntas em aberto
1. ~~Imagens faciais ou só descritor?~~ Respondida pelas migrations: ficam os dois (ver acima). Falta confirmar se o bucket `person-photos` é privado.
2. Prazo de retenção após a saída do aluno da escola (alinhar com `docs/LGPD_RETENCAO.md`).
3. Divisão final controlador e operador (ver Papéis).
4. Base legal da biometria (consentimento ou art. 11, II, g) e como consentem os autorizados.
5. Região do Supabase e demais transferências internacionais.

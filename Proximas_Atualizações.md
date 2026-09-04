# 🚀 Roadmap de Evolução - Plataforma Zela
*Documento Estratégico de Futuras Atualizações e Melhorias*

> **Atualizado em 2026-09-02** após auditoria profunda do código-fonte (4 investigações paralelas cobrindo os 40 itens originais). Cada item abaixo tem um veredito real de status — ✅ **FEITO**, 🟡 **PARCIAL**, ⬜ **NÃO EXISTE** — com evidência de arquivo. A numeração original foi preservada para rastreabilidade.

---

## 📊 Resumo geral

| Status | Quantidade |
| --- | ---: |
| ✅ Feito | 5 |
| 🟡 Parcial | 7 |
| ⬜ Não existe | 28 |
| **Total de itens do roadmap original** | **40** |

Além disso, o projeto avançou **significativamente fora deste roadmap** — ver seção final "🆕 Construído fora do roadmap original", que inclui o módulo financeiro completo, o Portal do Professor, hardening de segurança em várias rodadas, LGPD/retenção, observabilidade, módulo acadêmico (turmas/matérias/frequência) e o Relatório de Mitigação. Isso explica por que o roadmap original parecia desatualizado: o time priorizou correção/segurança e um módulo financeiro real antes de continuar a lista original.

---

## 🔴 Fase 1: Alta Prioridade (Core, Segurança e Estabilidade)

1. **Modo Offline para o Totem (Kiosk Offline-First)** — ⬜ **NÃO EXISTE**
   * O totem depende 100% de conexão online com o Supabase. `public/sw.js` só trata Web Push, sem cache de dados/fila local de check-ins nem IndexedDB.

2. **Sistema de Push Notifications Avançado (PWA)** — 🟡 **PARCIAL**
   * Web Push nativo via VAPID está implementado (`src/hooks/usePushNotifications.js`, `public/sw.js`) e funcional — mas não usa Firebase Cloud Messaging como pedia o item original. Web Push puro cobre o mesmo caso de uso, então isso pode ser considerado suficiente na prática.

3. ~~**Recuperação de Senha Segura (Esqueci minha senha)**~~ — ✅ **FEITO**

4. **Gerenciamento de Múltiplos Polos/Unidades** — ⬜ **NÃO EXISTE**
   * Modelo de dados é single-tenant por `school_id`. Nenhum suporte a rede de escolas com múltiplas unidades sob o mesmo CNPJ/matriz.

5. **Otimização de Modelos de IA Facial (Lazy Loading)** — ✅ **FEITO**
   * `src/lib/faceModels.js` (singleton) só é pré-carregado quando o usuário entra especificamente nas telas de biometria/totem (`AdminPortal.jsx` aba `kiosk`, `AdminFaceEnrollment.jsx`, `AdminFaceScanner.jsx`, `FamilyAuthorized.jsx`) — não é carregado no login geral.

6. **Relatórios em PDF e Exportação CSV (histórico de presença/catraca)** — ⬜ **NÃO EXISTE**
   * Existe exportação PDF, mas só para o Relatório de Mitigação (`src/lib/printMitigacao.js`) e para Horas Extras (`AdminRelatorioHorasExtras.jsx`, construído fora do roadmap). `AdminHistory.jsx`/`FamilyHistory.jsx`/`AdminDailyPresence.jsx` (histórico de entrada/saída propriamente dito) não têm nenhum botão de exportar/CSV/PDF.

7. **Log de Auditoria Completo (Audit Trail)** — 🟡 **PARCIAL**
   * `audit_logs` + `AdminAuditLog.jsx` existem e funcionam, mas `logAction()` só é chamado em 2 arquivos (`AdminMitigacao.jsx`, `MitigacaoReportEditor.jsx`), cobrindo apenas publish/archive/delete de relatórios de Mitigação. Os dois eventos citados no item original — **exclusão de pessoa autorizada** e **aprovação de biometria/foto** — não geram log hoje.

---

## 🟡 Fase 2: Média Prioridade (Engajamento, Pais e Administrativo)

8. **Painel do Professor (Teacher Role)** — 🟡 **PARCIAL (essencialmente feito)**
   * `TeacherPortal.jsx`, `TeacherInicio.jsx`, `TeacherMonitor.jsx`, `TeacherMitigacao.jsx`, `TeacherObservacaoDiaria.jsx`, `TeacherFrequencia.jsx` — estrutura completa e funcional. Falta confirmar se "fazer chamada em sala cruzando com dados da catraca" está implementado como cruzamento formal (não encontrado explicitamente, mas `TeacherFrequencia.jsx` já cobre frequência).

9. **Módulo Financeiro Integrado (Cobranças)** — 🟡 **PARCIAL (avançado)**
   * **Muito além do que o item pedia originalmente.** Existe `AdminFinanceiro.jsx`/`FamilyFinanceiro.jsx`, integração completa com gateway Asaas (contratos, cobranças avulsas, webhooks, lembretes automáticos — `supabase/functions/create-payment`, `create-financial-contract`, `payment-webhook`, `send-financial-reminders`), descontos por responsável, cobrança de hora extra/entrada antecipada. **Falta**: bloqueio/aviso automático de acesso do aluno por inadimplência (hoje só mostra status `OVERDUE` visualmente, sem enforcement).

10. **Comunicações / Mural de Avisos** — ✅ **FEITO**
    * `AdminComunicados.jsx` (463 linhas) + `FamilyComunicados.jsx` — módulo robusto e funcional.

11. **Autorizações Temporárias com Link Dinâmico (QR Code Expirável)** — ⬜ **NÃO EXISTE (via QR)**
    * A funcionalidade de negócio existe — autorização temporária com validade (`isTemporary`/`temporaryUntil` em `students`) — mas via cadastro de foto/rosto com prazo, não via geração/leitura de QR Code.

12. **Chat Interno de Emergência** — ⬜ **NÃO EVOLUÍDO**
    * O botão de pânico continua sendo um alerta unidirecional via broadcast Supabase (`emergency-{school_id}`, `triggerEmergency`/`dismissEmergency` em `App.jsx`) — um único payload disparado, sem histórico de mensagens nem troca em tempo real entre portaria/diretoria.

13. ~~**Assinatura Eletrônica de Contratos**~~ — ✅ **FEITO**
    * Consentimento LGPD de biometria implementado (modal de consentimento antes de gravar `biometric_consent_at`).

14. **Controle de Veículos e Placas** — ⬜ **NÃO EXISTE**
    * Nenhum cadastro de placa de veículo do responsável em nenhum lugar do código.

---

## 🟢 Fase 3: Baixa Prioridade (Inovação, Expansão e Experiência do Usuário)

15. **Integração Nativa com Catracas Físicas (IoT)** — ⬜ **NÃO EXISTE**
    * Nenhum script Python/Node de IoT, nenhuma referência a GPIO/relé/Raspberry Pi.

16. **Liveness Detection Facial (Antifraude)** — ⬜ **NÃO EXISTE**
    * O sistema atual (`AdminFaceScanner.jsx`) só faz matching estático com verificação de ambiguidade e consistência entre frames (proteção contra ruído/confusão de rostos parecidos) — não há challenge de piscar/sorrir nem detecção de movimento. Uma foto estática no celular passaria pelos mesmos frames "corretos".

17. **App Nativo Android e iOS** — ⬜ **NÃO EXISTE**
    * Sem Capacitor/React Native/Expo no `package.json`, sem pastas `android/`/`ios/`.

18. **Reconhecimento Emocional Básico** — ⬜ **NÃO EXISTE**
    * face-api.js tem um modelo de expressões (`faceExpressionNet`), mas não é usado em nenhum lugar do código.

19. **White-Label Automático (Temas Personalizados)** — 🟡 **PARCIAL**
    * Já existe imagem de login customizável por escola (`schools.login_image_url`). **Falta**: personalização de paleta de cores por contratante — nenhum campo `primary_color`/tema no `DeveloperPanel.jsx` ou nas migrations de `schools`.

20. **Gamificação Escolar (Sistema de Pontos Zela)** — ⬜ **NÃO EXISTE**

21. **Cardápio da Cantina Integrado (saldo pré-pago)** — ⬜ **NÃO EXISTE**
    * `AdminCardapio.jsx`/`FamilyCardapio.jsx` existem, mas são só cardápio semanal informativo — sem sistema de saldo/carteira/compra vinculado a biometria/RFID.

22. **Painel Analítico Avançado (Dashboards em Gráficos)** — ⬜ **NÃO EXISTE**
    * Nenhuma lib de gráficos (Recharts, Chart.js, Victory, Nivo, D3) no `package.json`. Nenhum dashboard usa visualização gráfica — só contadores/badges.

---

## 🔵 Fase 4: Novas Sugestões (Segurança, Engajamento, Financeiro, IA e Integrações)

23. **Autenticação Multifator (2FA) para Admins e Gestão** — ⬜ **NÃO EXISTE**
    * `supabase/config.toml` tem os blocos padrão de MFA do template Supabase (`[auth.mfa]`, `[auth.mfa.totp]` etc.), mas são configuração default não habilitada — nenhum código de enrollment/verificação/UI de MFA em `src/`.

24. ~~**Política de Retenção e Expurgo de Dados Biométricos (LGPD)**~~ — 🟡 **PARCIAL (marcado como feito no doc anterior, mas é só política manual)**
    * `LGPD_RETENCAO.md` existe e é detalhado, mas o próprio documento declara explicitamente que **não há automação**: "o expurgo, quando decidido, é feito via migration, sempre revisado manualmente... nunca um job agendado que apaga dado sozinho sem supervisão." Recomenda-se manter riscado por ora (a política existe e é aplicada), mas registrar que uma rotina automática ainda não existe.

25. **Central de Portabilidade de Dados (Exportação LGPD para o Titular)** — ⬜ **NÃO EXISTE**
    * Nenhuma tela/endpoint de "meus dados"/exportação LGPD para o responsável.

26. **Testes Automatizados e Pipeline de CI/CD** — ✅ **FEITO**
    * Suíte madura: ~31 arquivos de teste (Vitest, ~3.478 linhas) em `src/test/`, focados fortemente em RLS/isolamento multi-tenant/autenticação/financeiro. CI configurado em `.github/workflows/ci.yml` (lint + testes + build a cada push/PR). Cobertura de UI/componentes é mais esparsa, mas a base de segurança está bem coberta.

27. **Rate Limiting e Proteção Anti-Brute-Force no Totem** — 🟡 **PARCIAL**
    * Existe rate limit para login por PIN (`check_pin_login_rate_limit`), mas **não** para o reconhecimento facial em si — nenhuma limitação de tentativas específica no `AdminFaceScanner.jsx` além do retry manual de câmera.

28. **Onboarding Guiado para Novas Escolas (Setup Wizard)** — ⬜ **NÃO EXISTE**

29. **Central de Ajuda / Base de Conhecimento In-App** — ⬜ **NÃO EXISTE**

30. **SLA e Status Page Pública** — ⬜ **NÃO EXISTE**

31. **Assinatura Recorrente via Gateway (Stripe/Pagar.me/Iugu)** — ⬜ **NÃO EXISTE**
    * Importante não confundir com o item 9: este é sobre a **Zela cobrar a escola-cliente** pelo uso da plataforma (billing B2B da própria Zela). Existe só um campo `plan` (`basic`/`pro`) manual em `schools`, sem nenhuma integração de cobrança recorrente real.

32. **Programa de Indicação (Referral) entre Escolas** — ⬜ **NÃO EXISTE**

33. **Modo Visitante/Prestador de Serviço** — ⬜ **NÃO EXISTE**

34. **Integração com Calendário Escolar (Google Calendar/Outlook)** — ⬜ **NÃO EXISTE**

35. **Alertas de Ausência Prolongada (Regra de Faltas)** — ⬜ **NÃO EXISTE**
    * A edge function `check-attendance-delays` existente só cobre atraso *no mesmo dia* (30min sem check-in) — não há alerta por dias consecutivos sem comparecer.

36. **Modo Multi-idioma (i18n)** — ⬜ **NÃO EXISTE**

37. **Dashboard de Saúde do Sistema (Observabilidade)** — 🟡 **PARCIAL**
    * Existe infraestrutura real: tabelas `client_error_logs`, `cron_job_logs`, `edge_function_logs` (documentadas em `OBSERVABILIDADE.md`), alimentadas em produção. **Falta**: painel visual — hoje a consulta é manual via SQL Editor do Supabase, sem tela dedicada nem alertas automáticos.

38. **Modo Demonstração (Sandbox Comercial)** — ⬜ **NÃO EXISTE**
    * O único "sandbox" no código é o ambiente sandbox do gateway Asaas (`api-sandbox.asaas.com`), não relacionado a um modo demo para prospects comerciais.

39. **Backup e Restauração Point-in-Time** — ⬜ **NÃO EXISTE**
    * Nenhuma configuração de PITR nem script de backup no repositório (o backup manual feito nesta sessão para Downloads não conta como rotina automática point-in-time).

40. **Verificação de Duplicidade de Cadastro (Matching Facial)** — ⬜ **NÃO EXISTE**
    * Tanto `AdminFaceEnrollment.jsx` quanto `FamilyAuthorized.jsx` extraem e salvam o descritor facial direto, sem comparar contra biometrias já cadastradas de outras pessoas.

---

## 🆕 Construído fora do roadmap original

Levantamento a partir do `git log` — trabalho relevante que **não estava** nos 40 itens acima, priorizado no lugar deles:

1. **Módulo Financeiro completo com gateway Asaas** — contratos, cobranças avulsas, webhooks, lembretes, descontos por responsável, cobrança de hora extra/entrada antecipada. É o item mais substancial fora do roadmap original (ver item 9 acima).
2. **Portal do Professor** — acesso dedicado com Início, Monitor, Mitigação, Observação Diária, Frequência.
3. **Hardening de segurança em múltiplas rodadas (P0-P2)** — dezenas de commits corrigindo escalação de privilégio, RLS quebrado, vazamento de dados (ex.: "admin marcava a própria cobrança como paga sem pagar", "admin conseguia se auto-escalar via schools"). Engenharia de segurança pesada, não estava no roadmap de features.
4. **Observabilidade** — logs estruturados de erro/cron/edge functions (ver item 37).
5. **LGPD / Política de Retenção de Dados** — `LGPD_RETENCAO.md`, prazos definidos para biometria, ficha médica, CPF, documentos de matrícula (ver item 24).
6. **CI/CD** — pipeline GitHub Actions funcional (ver item 26).
7. **Módulo Acadêmico completo** — gestão de turmas descentralizada pela escola, renomear turma com propagação, transferência de turma, tabela `classes` normalizada, matérias/disciplinas (`subjects`/`class_subjects`), documentado em `METODO_PEDAGOGICO.md` — sistema de flexibilização de método pedagógico por escola.
8. **Módulos configuráveis por escola (feature flags)** — `schools.features_enabled`, abas horizontais em Configurações (Turmas/Imagem de Login/Cobrança/Menu), frequência independente do Módulo Pedagógico.
9. **Autocadastro de responsável + matrícula pendente com aprovação** — fluxo `matricula_solicitacoes` completo.
10. **Motor de reconhecimento facial "Human" em modo observador (shadow mode)** — migração de biblioteca de reconhecimento facial rodando em paralelo pra validação antes da troca definitiva (`PLANO_MIGRACAO_BIBLIOTECA_RECONHECIMENTO_FACIAL.md`, `face_descriptor_v2`).
11. **Redesign visual completo dos 4 portais** (via Google Stitch).
12. **Relatório de Mitigação** — módulo completo de registro de ocorrências disciplinares com fluxo professor → coordenação/diretoria → família, notificações, leitura rastreada, auditoria, exportação em lote e consentimento LGPD (construído nesta série de sessões).

---

## Observações finais

- **Prioridade sugerida para retomar do roadmap original**: dado o que já foi feito fora dele, os itens mais valiosos a priorizar agora são **#6 (exportação de presença em PDF/CSV)**, **#7 (completar auditoria — cobrir exclusão de autorizados e aprovação de biometria)**, **#35 (alertas de ausência prolongada)** e **#40 (duplicidade de cadastro facial)** — todos de baixo esforço relativo e alto valor de compliance/operação, aproveitando infraestrutura que já existe (audit_logs, edge functions de cron, matching facial).
- Este documento deve ser tratado como uma foto do estado em 2026-09-02 — como já vimos, o projeto evolui rápido e às vezes fora deste arquivo. Recomenda-se reauditar periodicamente em vez de confiar cegamente na lista.

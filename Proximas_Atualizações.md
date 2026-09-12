# 🚀 Roadmap de Evolução - Plataforma Zela
*Documento Estratégico de Futuras Atualizações e Melhorias*

> **Atualizado em 2026-09-02** após auditoria profunda do código-fonte (4 investigações paralelas cobrindo os 40 itens originais). Cada item abaixo tem um veredito real de status — ✅ **FEITO**, 🟡 **PARCIAL**, ⬜ **NÃO EXISTE** — com evidência de arquivo. A numeração original foi preservada para rastreabilidade.
>
> **Revisado em 2026-09-12**: dez dias de trabalho intenso entre a última atualização e hoje, quase todo fora do roadmap original (ver nova seção "🆕 Construído entre 02/09 e 12/09" logo após a lista de 40 itens). Um item do roadmap mudou de status nesse intervalo — **#40 (duplicidade facial)** já não é mais "não existe" (ver nota no próprio item). Os outros 39 vereditos abaixo continuam os mesmos de 02/09 — não foram reauditados de novo linha a linha nesta revisão.

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

7. ~~**Log de Auditoria Completo (Audit Trail)**~~ — ✅ **FEITO (12/09)**
   * `logAction()` agora também é chamado em `App.jsx` nos dois eventos que faltavam: **exclusão de pessoa autorizada** (`delete_authorized_person`), **cadastro de biometria com consentimento LGPD** (`enroll_biometric_consent`) e **remoção de foto/biometria** (`remove_biometric_photo`) — todos visíveis em Sistema > Auditoria, com o nome da pessoa no detalhe. Já cobria publish/archive/delete de Mitigação e a correção manual de presença (`correct_attendance`).

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

27. ~~**Rate Limiting e Proteção Anti-Brute-Force no Totem**~~ — ✅ **FEITO (12/09)**
    * Duas novas funções no banco (`check_kiosk_recognition_rate_limit`, `check_kiosk_confirm_rate_limit`), mesmo padrão do PIN (`check_pin_login_rate_limit`): chave escopada pela própria escola do totem, sem depender de estado local. `AdminFaceScanner.jsx` agora limita tentativas de comparação facial (40/min) antes de rodar a detecção; `requestKioskAccess` (compartilhado por reconhecimento facial e PIN) limita confirmações de check-in/out (60/min) antes de gravar qualquer coisa.

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

40. ~~**Verificação de Duplicidade de Cadastro (Matching Facial)**~~ — ✅ **FEITO (12/09)**
    * `togglePhoto()` em `App.jsx` já bloqueava salvar uma biometria nova cujo rosto batesse com o de outra pessoa já cadastrada (cobre o caso da Hanaynna Schmitz). O que faltava — pares que já existiam ANTES desse bloqueio, ou a mesma pessoa cadastrada duas vezes com contas diferentes (caso real da Maria Elisa de Freitas Falcão, achado nesta sessão) — ganhou uma tela nova, **Sistema > Duplicidade Facial** (`AdminDuplicateBiometrics.jsx`): varre todas as biometrias já cadastradas da escola e alerta qualquer par de CONTAS diferentes com o mesmo rosto, com foto lado a lado pra comparação visual. Lógica de comparação extraída pra `src/lib/faceMatch.js`, reaproveitada pelos dois pontos (bloqueio no cadastro + varredura). Continua sendo só detecção — decidir mesclar contas ou remover uma biometria continua manual, no mesmo espírito de "diagnóstico antes de aplicar" das outras correções desta sessão. A duplicidade de **cadastro de aluno** (nome, não rosto) continua coberta à parte pelo `DuplicateStudentWarningModal.jsx` (ver item 2 da seção "🆕" abaixo).

---

## 🆕 Construído entre 02/09 e 12/09 (fora do roadmap original)

Dez dias de correções e funcionalidades novas, quase todas nascidas de problemas reais reportados em produção (não do roadmap):

1. **Correção manual de presença com auditoria e aprovação** — módulo novo completo: admin pode corrigir horário e/ou tipo (entrada↔saída) de um check-in/check-out já confirmado, sempre com motivo obrigatório e sem nunca perder o valor original (`attendance_logs.original_event_time`); correção que aumenta a cobrança do dia fica pendente até **outro** admin aprovar (nunca quem pediu); correção que não aumenta aplica na hora. Nova aba "Correções de Presença" com fila de aprovação + histórico e badge em tempo real. Família vê a correção no próprio Histórico ("horário ajustado pela escola..."). Cobre também o caso de marcação "fantasma" (horário gravado numa solicitação depois cancelada, sem nenhum log por trás) — remoção com motivo, sem aprovação. Isso é essencialmente uma versão inicial do que os itens de auditoria (#7) e exportação de histórico (#6) do roadmap original previam, só que nascida de um caso real (o totem gravando entrada como se fosse saída durante a adaptação das biometrias) em vez de planejada do zero.
2. **Prevenção e correção de aluno duplicado** — 8 alunos que existiam em cópia (cada responsável, ao se cadastrar sozinho, criava sua própria versão dos mesmos filhos) foram unificados sem perder histórico; o cadastro (autocadastro e "Novo Usuário" pelo admin) agora avisa quando o nome de um aluno já existe na escola sob outro responsável, com a opção de vincular como 2º responsável em vez de duplicar.
3. **Biometria facial — três correções encadeadas de um mesmo problema real** ("cadastrou e não reconhece"): (a) cadastro pela família passou de upload de arquivo solto para a mesma câmera guiada com molde oval que o admin já usava; (b) o descritor facial é gravado primeiro (rápido), o upload da foto (só cosmético) acontece depois em segundo plano, cortando o atraso que fazia a pessoa voltar pro totem antes do cadastro terminar de verdade; (c) a tela de saída da câmera durante o salvamento fica bloqueada e mostra confirmação explícita de sucesso; (d) a tela "Biometria de Responsáveis" (Pendentes/Já Cadastrados) passou a buscar do banco direto toda vez que abre, e o app inteiro ganhou uma assinatura em tempo real pra essa tabela — nenhuma das duas telas dependia mais de recarregar a página. No processo, 6 responsáveis (2º responsáveis reais) foram encontrados sem nenhum registro de biometria criado (bug histórico já corrigido no código) e tiveram o cadastro restaurado manualmente.
4. **Seleção manual de quem está sendo entregue/buscado no totem** — quando um responsável é vinculado a mais de um filho (ex: pai e mãe responsáveis pelos dois), o reconhecimento (facial ou PIN) agora pergunta quem está ali de fato, em vez de assumir automaticamente todos os filhos elegíveis — evita disparar check-in/check-out pra uma criança que não está fisicamente presente.
5. **Redesign do Autoatendimento (Totem)** — layout novo ("Totem Institucional", escolhido entre 5 propostas), tela cheia sem o Header do sistema enquanto está no totem, senha exigida só pra sair do Autoatendimento pra outro menu (não mais pra fechar as sub-telas de biometria/PIN), menu da engrenagem com Biometria/Voltar ao Início/Sair separados.
6. **Relatório de Horas Extras: exportação só de quem tem excesso de verdade** — a tela continua mostrando todo mundo (com filtro), mas o PDF exportado sempre leva só quem de fato gerou hora extra no período, independente do filtro selecionado.
7. **Faxina de storage** — `VACUUM FULL` em `authorized_persons` (53 MB → 7,5 MB de bloat morto), remoção de uma tabela de backup de migração já concluída (46 MB), banco caiu de 129 MB pra 37 MB; fotos de biometria novas agora são redimensionadas (máx. 480px) e comprimidas (JPEG 0.82) antes do upload — sem perda de precisão no reconhecimento, já que os modelos redimensionam a imagem internamente de qualquer forma.

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

## 🎯 Priorização 12/09 — o que fazer agora vs. guardar como novidade

Triagem por **risco/dado real** (não pode esperar) vs. **feature/diferencial comercial** (ótimo pra anunciar depois, sem urgência):

### 🔴 Fazer agora
- **#39 Backup/PITR** — maior risco de todos (dado financeiro/biométrico/presença real sem confirmação de recuperação point-in-time). Pode ser só verificar/ativar uma configuração no plano do Supabase.
- **#35 Alertas de ausência prolongada** — bem-estar/segurança da criança, não só operação. Reaproveita a cron function que já existe.
- **#7 Completar auditoria** — `audit_logs`/`logAction()` já existem, falta só chamar em mais lugares (exclusão de autorizado, aprovação/consentimento de biometria). Esforço baixo. **Em andamento.**
- **#6 Exportar Histórico em PDF/CSV** — zero risco, esforço baixo, padrão já pronto (Horas Extras/Mitigação).
- **#23 2FA pra admin/developer** — conta de admin acessa dado financeiro + biométrico de todo mundo.
- **#16 Liveness Detection** — hoje uma foto impressa ou na tela de um celular passa pelo reconhecimento; envolve retirada de criança. Maior esforço, mas prioridade de segurança, não de conveniência.

### 🟡 Considerar, sem urgência
- **#25** Portabilidade de dados LGPD, **#9** bloqueio automático por inadimplência (decisão de negócio sensível), **#24** automatizar expurgo LGPD (política manual já é seguida).

### 🟢 Guardar como novidade pra mostrar depois
**#22** Dashboards com gráficos, **#19** White-label com cor personalizada, **#11** QR Code expirável, **#20** Gamificação, **#18** Reconhecimento emocional, **#34** Integração com calendário, **#28/#29/#30** Onboarding/Central de Ajuda/Status Page, **#1/#4/#17/#36** Offline/multi-unidades/app nativo/i18n (investimento grande, só quando o volume justificar), **#21/#14/#33/#32/#31/#38** Cantina com saldo/controle de veículos/modo visitante/referral/billing B2B/modo demo.

---

## Observações finais

- **Prioridade sugerida pra retomar do roadmap original, revista em 12/09**:
  - **#6 (exportação de presença em PDF/CSV)** — agora é esforço BEM menor do que em 02/09: já existe o padrão pronto (Horas Extras e Mitigação exportam PDF) e o Histórico (`AdminHistory.jsx`/`FamilyHistory.jsx`) já tem tudo formatado na tela, só falta o botão de exportar reaproveitando `printHistorico.js`.
  - **#7 (completar auditoria)** — parcialmente puxado pela correção de presença (que já loga em `audit_logs`), mas exclusão de autorizado e aprovação de biometria continuam sem log.
  - **#35 (alertas de ausência prolongada)** — continua não existindo; ganhou relevância depois do módulo de correção de presença, que já mexe bastante em `attendance_logs`/status do aluno.
  - **#27 (rate limit no reconhecimento facial)** — vale reconsiderar à luz da seleção manual de aluno (item 4 da seção acima): mais gente testando o totem sem limite de tentativas.
  - Item **#40 do roadmap original** (duplicidade de cadastro facial) não é mais o problema principal nessa frente — o que dominou os últimos 10 dias foi duplicidade de **aluno/família**, já mitigada (ver seção "🆕" acima).
- Este documento deve ser tratado como uma foto do estado em **2026-09-12** — o projeto evolui rápido e boa parte do trabalho recente nasceu de bugs reais reportados em produção, não deste roadmap. Recomenda-se reauditar periodicamente em vez de confiar cegamente na lista.

# Roadmap e Sugestões de Melhorias: Zela Portal

Sugestões técnicas e de usabilidade por ambiente e prioridade. Reorganizado em 05/10/2026: o que ainda falta fica em PENDENTE, o que já foi entregue fica em CONCLUÍDO, riscado. Itens marcados "não verificado" não foram conferidos no código.

---

# 🔴 PENDENTE

## 1. Totem (Autoatendimento / Kiosk Mode)

### 🔴 Prioridade Alta
- **Tolerância a Offline (Modo Resiliência):** armazenar biometrias e PINs recentes no `IndexedDB`. Sem internet, o totem registra check-ins localmente e sincroniza com o Supabase ao voltar a conexão. Nada disso existe hoje (sem IndexedDB no código).
- **Melhoria no Reconhecimento Facial (Iluminação):** feedback visual em tempo real no Canvas avisando ambiente escuro ou com luz contra a câmera. A conferência de qualidade no cadastro existe; o aviso ao vivo no totem não foi verificado.

### 🟡 Prioridade Média
- **Feedback Auditivo (Acessibilidade):** síntese de voz nativa (Web Speech API), ex.: *"Bem-vindo, João. Acesso liberado."* Não existe (`speechSynthesis` ausente).
- **Modo Ocioso (Screensaver):** reduzir o FPS do scanner e exibir carrossel de avisos quando não houver movimento, para economizar processamento e proteger a tela.

### 🟢 Prioridade Baixa
- **White-label / Tema Customizado:** o totem usar paleta e logo da escola vindos do banco (sem campo de cor por escola hoje).

## 2. Portal do Administrador

### 🔴 Prioridade Alta
- **Filtros Avançados no Monitor de Check-in:** filtrar em tempo real por *Turma*, *Turno* ou *Tipo de Ocorrência* (não verificado).
- **Exportação de Horas Extras em Excel (.xlsx):** o PDF existe; a planilha .xlsx não foi verificada.

### 🟡 Prioridade Média
- **Dashboard Estatístico (Início):** gráficos com horários de pico da portaria e taxa de presença diária. Não há biblioteca de gráficos no `package.json`.
- **Paginação / Virtualização de Listas:** "Infinite Scroll" (Supabase Range) ou virtualização para listas com centenas de alunos (não verificado).

### 🟢 Prioridade Baixa
- **Gestão de Dispositivos (Kiosks):** status de bateria e rede de cada totem.

## 3. Portal do Responsável (Família)

### 🔴 Prioridade Alta
- **Notificações Push Nativas:** o Web Push (VAPID) funciona e o servidor já aceita FCM; falta o app nativo registrar o token (depende de `PLANO_APPS_MOBILE.md`).

### 🟡 Prioridade Média
- **Justificativa de Faltas via App:** o responsável envia atestado (foto) ou justificativa pelo portal e a escola aprova (não verificado).

### 🟢 Prioridade Baixa
- **Sincronização com Calendário:** botão "Adicionar ao Google Agenda / Apple Calendar" nos eventos escolares.

## 4. Portal do Desenvolvedor

### 🟡 Prioridade Média
- **Health Dashboard da infraestrutura:** conexões Realtime, banda, requisições e taxa de erro do Supabase. Os logs de erro já têm tela (ver CONCLUÍDO); falta a parte de infraestrutura.
- **Ferramenta de Broadcast / Alerta Geral:** mensagem urgente do Desenvolvedor no topo de todas as escolas (não encontrada no código).

### 🟢 Prioridade Baixa
- **Acesso "Mascarado" (Ghost Login):** acesso temporário somente leitura ao painel de uma escola para investigar bugs.

---

# ✅ CONCLUÍDO

## 1. Totem
- ~~**Proteção contra Força Bruta (Rate Limit):** `check_kiosk_recognition_rate_limit` e `check_kiosk_confirm_rate_limit` (12/09), mesmo padrão do `check_pin_login_rate_limit`.~~

## 2. Portal do Administrador
- ~~**Exportação de Horas Extras em PDF:** `AdminRelatorioHorasExtras.jsx`.~~

## 3. Portal do Responsável
- ~~**Implementação do Módulo "Comunicados":** `AdminComunicados.jsx` e `FamilyComunicados.jsx`.~~
- ~~**Extrato do Histórico em PDF:** `FamilyHistory.jsx` chama `printHistoricoReport`.~~
- ~~**Notificações Push (Web Push):** `usePushNotifications.js` e `public/sw.js`.~~

## 4. Portal do Desenvolvedor
- ~~**Gerenciamento de Feature Flags por escola:** `schools.features_enabled`, `DeveloperModulos.jsx` e `modulosCatalogo.js` (módulos nascem desligados).~~
- ~~**Log de Auditoria:** `audit_logs`, `logAction()` e `AdminAuditLog.jsx`, com leitura para a Gestão. A exclusão de usuário ainda não é logada.~~
- ~~**Logs de erro no Portal do Dev:** `DeveloperErrorLogs.jsx` com filtros, agrupamento por ocorrência, tela de origem e explicação por IA.~~

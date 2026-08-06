# Roadmap e Sugestões de Melhorias: Zela Portal

Este documento reúne sugestões técnicas e de usabilidade para as próximas versões do sistema, baseadas na arquitetura atual do Zela Portal. As melhorias estão divididas por ambiente e classificadas por prioridade.

---

## 1. Totem (Autoatendimento / Kiosk Mode)

O totem é o principal ponto de contato físico do sistema. Melhorar sua autonomia, segurança e acessibilidade é crucial.

### 🔴 Prioridade Alta (Críticas para operação em larga escala)
- **Tolerância a Offline (Modo Resiliência):** Armazenar as biometrias e os PINs recentes no `IndexedDB` local. Caso a internet caia, o totem continua registrando check-ins localmente e sincroniza com o Supabase automaticamente assim que a conexão retornar.
- **Proteção contra Força Bruta (Rate Limit):** Implementar bloqueio temporário (ex: 5 minutos) no PIN de saída do totem após 3 tentativas inválidas (conforme mencionado no TO-DO do código atual).
- **Melhoria no Reconhecimento Facial (Iluminação):** Adicionar feedback visual em tempo real no Canvas informando se o ambiente está muito escuro ou com muita luz contra a câmera, orientando o usuário a se reposicionar.

### 🟡 Prioridade Média
- **Feedback Auditivo (Acessibilidade):** Substituir ou complementar os bipes atuais por síntese de voz nativa (Web Speech API). Ex: *"Bem-vindo, João. Acesso liberado."* em vez de apenas um som genérico.
- **Modo Ocioso (Screensaver):** Quando não houver movimento na câmera por X minutos, reduzir o FPS do scanner e exibir um carrossel de fotos/avisos da escola para economizar processamento e proteger telas contra burn-in.

### 🟢 Prioridade Baixa
- **White-label / Tema Customizado:** O totem consumir a paleta de cores e o logo específico de cada escola diretamente do banco de dados, em vez de usar as cores padrão da plataforma.

---

## 2. Portal do Administrador

Foco em gestão ágil, controle do fluxo na portaria e tomada de decisão.

### 🔴 Prioridade Alta
- **Filtros Avançados no Monitor de Check-in:** Permitir filtrar as solicitações em tempo real por *Turma*, *Turno* ou *Tipo de Ocorrência* (ex: apenas alunos pendentes de saída).
- **Exportação de Relatórios de Horas Extras:** Permitir gerar relatórios em Excel (.xlsx) e PDF das horas extras dos funcionários, já com os cálculos consolidados para a contabilidade.

### 🟡 Prioridade Média
- **Dashboard Estatístico (Início):** Adicionar gráficos (via biblioteca leve, como Recharts) na tela principal exibindo os horários de pico da portaria e a taxa de presença diária.
- **Paginação / Virtualização de Listas:** Atualmente, listar centenas de alunos no frontend pode causar lentidão na renderização. Implementar "Infinite Scroll" (via Supabase Range) ou virtualização (ex: react-window).

### 🟢 Prioridade Baixa
- **Gestão de Dispositivos (Kiosks):** Tela para ver o status da bateria e conexão de rede de cada totem (tablets) espalhados pela escola.

---

## 3. Portal do Responsável (Família)

Foco em engajamento, tranquilidade e comunicação direta com a escola.

### 🔴 Prioridade Alta
- **Notificações Push Nativas (PWA):** Integrar o Firebase Cloud Messaging (FCM) ou Web Push API para que os pais recebam notificações reais na tela de bloqueio do celular no momento exato em que o filho passa pelo totem.
- **Implementação do Módulo "Comunicados":** Dar funcionalidade real à área de notificações pendentes que mapeamos hoje, permitindo leitura de recados da diretoria.

### 🟡 Prioridade Média
- **Extrato Mensal em PDF:** Opção do pai gerar um relatório detalhado de todos os horários de entrada e saída do mês para fins de controle e comprovação.
- **Justificativa de Faltas via App:** O responsável pode enviar um atestado médico (foto) ou justificativa diretamente pelo portal, alterando o status do aluno para a escola aprovar.

### 🟢 Prioridade Baixa
- **Sincronização com Calendário:** Os eventos escolares (reuniões de pais, feriados) listados no Zela podem ter um botão "Adicionar ao Google Agenda / Apple Calendar".

---

## 4. Portal do Desenvolvedor

Foco no controle macro da plataforma e suporte (SaaS).

### 🔴 Prioridade Alta
- **Métricas de Saúde do Banco (Health Dashboard):** Um painel exclusivo para o Super Admin monitorar: número de conexões ativas do Realtime, uso de banda, requisições de API no Supabase e taxas de erro.
- **Gerenciamento Global de Feature Flags:** Habilidade de ligar/desligar módulos (ex: "Facial", "Cardápio") instantaneamente para grupos de escolas específicas diretamente pelo painel.

### 🟡 Prioridade Média
- **Ferramenta de Broadcast / Alerta Geral:** Capacidade do Desenvolvedor enviar uma mensagem urgente (ex: *"Manutenção programada à meia-noite"*) que aparecerá no topo de todas as escolas simultaneamente.
- **Log de Auditoria de Suporte:** Rastrear (Logs) e exibir no portal as ações críticas feitas por outros perfis de suporte/admin (quem deletou escola, quem resetou senha, etc).

### 🟢 Prioridade Baixa
- **Acesso "Mascarado" (Ghost Login):** Permitir que o Desenvolvedor acesse temporariamente o painel de uma escola específica (com permissão somente leitura) para investigar bugs relatados, sem precisar da senha do admin local.

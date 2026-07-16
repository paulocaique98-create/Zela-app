# 🚀 Roadmap de Evolução - Plataforma Zela
*Documento Estratégico de Futuras Atualizações e Melhorias*

Este documento lista mais de 20 sugestões de atualizações para a plataforma Zela, organizadas por ordem de prioridade. A estrutura atual do sistema é sólida e escalável, o que permite que estas funcionalidades sejam adicionadas de forma modular.

---

## 🔴 Fase 1: Alta Prioridade (Core, Segurança e Estabilidade)
*Foco imediato para tornar a operação impecável e reduzir a carga de suporte.*

1. **Modo Offline para o Totem (Kiosk Offline-First)**
   * **Descrição:** Se a internet da escola cair, o totem continua reconhecendo a biometria/QR Code e guarda os check-ins localmente, sincronizando com o Supabase automaticamente quando a internet voltar.
   
2. **Sistema de Push Notifications Avançado (PWA)**
   * **Descrição:** Substituir a dependência apenas da tela do monitor para notificações reais no celular dos pais (via Firebase Cloud Messaging) quando o aluno passar pela catraca.

3. ~~**Recuperação de Senha Segura (Esqueci minha senha)**~~
   * ~~**Descrição:** Fluxo automatizado via Supabase Auth para que usuários finais (pais e admins) redefinam suas senhas via link de e-mail, removendo essa carga do desenvolvedor/admin.~~

4. **Gerenciamento de Múltiplos Polos/Unidades**
   * **Descrição:** Permitir que uma "Rede de Escolas" compartilhe o mesmo CNPJ mas possua ramificações no banco de dados (ex: Unidade Centro, Unidade Sul) para admins regionais.

5. **Otimização de Modelos de IA Facial (Lazy Loading)**
   * **Descrição:** Fazer com que os arquivos `.bin` de IA não precisem ser baixados por pais e admins no painel web — eles só devem ser carregados quando o usuário entrar de fato na rota `/totem` ou na tela de pareamento.

6. **Relatórios em PDF e Exportação CSV**
   * **Descrição:** Permitir que a escola baixe o histórico mensal de catraca de um aluno específico em PDF ou exporte toda a presença do mês em uma planilha do Excel.

7. **Log de Auditoria Completo (Audit Trail)**
   * **Descrição:** Registrar *quem* excluiu uma pessoa autorizada, *quando* o admin aprovou uma foto, etc. Essencial para compliance e LGPD.

---

## 🟡 Fase 2: Média Prioridade (Engajamento, Pais e Administrativo)
*Funcionalidades que agregam muito valor ao produto final e ajudam na venda do software.*

8. **Painel do Professor (Teacher Role)**
   * **Descrição:** Um novo nível de acesso focado no professor, permitindo que ele veja apenas os alunos da sua turma e faça chamada em sala de aula cruzando os dados com a catraca física.

9. **Módulo Financeiro Integrado (Cobranças)**
   * **Descrição:** A escola poderia gerar links de pagamento PIX para mensalidades direto no Zela. Bloqueio automático ou aviso na catraca para inadimplentes (se a escola desejar).

10. **Comunicações / Mural de Avisos**
    * **Descrição:** Um feed no portal da família onde a escola pode postar recados gerais, comunicados de feriados ou enviar mensagens diretas.

11. **Autorizações Temporárias com Link Dinâmico (QR Code Expirável)**
    * **Descrição:** O pai pode gerar um QR Code que dura apenas 2 horas e enviar pelo WhatsApp para o "Tio da Van" buscar o filho num dia de emergência.

12. **Chat Interno de Emergência**
    * **Descrição:** Evoluir o Botão de Pânico para permitir um chat em tempo real via Supabase Realtime entre a portaria e a diretoria quando a emergência for acionada.

13. ~~**Assinatura Eletrônica de Contratos**~~
    * ~~**Descrição:** Quando o pai loga pela primeira vez, ele precisa aceitar um Termo de Uso e Consentimento de Imagem (Biometria - LGPD), registrando a assinatura digital no banco.~~

14. **Controle de Veículos e Placas**
    * **Descrição:** Adicionar a placa do carro do responsável no cadastro. Se a escola tiver câmera de leitura de placa, integrar o sistema para liberar a catraca/cancela mais rapidamente.

---

## 🟢 Fase 3: Baixa Prioridade (Inovação, Expansão e Experiência do Usuário)
*Grandes inovações para tornar o sistema "Enterprise" e altamente tecnológico.*

15. **Integração Nativa com Catracas Físicas (IoT)**
    * **Descrição:** Criar um script em Python (Raspberry Pi) ou Node.js que escute o canal `students-realtime` e ative relés elétricos de catracas reais (ex: Henry, Topdata) via pulsos elétricos.

16. **Liveness Detection Facial (Antifraude)**
    * **Descrição:** Melhorar a IA do totem para exigir que a pessoa pisque ou sorria, garantindo que ninguém consiga enganar o sistema mostrando uma foto no celular para a câmera.

17. **App Nativo Android e iOS**
    * **Descrição:** Empacotar o React atual usando *Capacitor* ou *React Native* para disponibilizar o Zela na Google Play e App Store (gera grande autoridade de marca).

18. **Reconhecimento Emocional Básico**
    * **Descrição:** Aproveitar a biblioteca face-api.js para detectar (opcionalmente) a emoção predominante da criança na entrada (ex: se entrar chorando repetidas vezes, emitir alerta suave ao conselheiro da escola).

19. **White-Label Automático (Temas Personalizados)**
    * **Descrição:** O `DeveloperPanel` permitiria alterar a paleta de cores primárias de acordo com a logo da escola, gerando uma interface exclusiva por contratante sem mexer no código.

20. **Gamificação Escolar (Sistema de Pontos Zela)**
    * **Descrição:** Alunos ganham "Zela Points" por chegarem no horário e terem 100% de presença, podendo trocar por benefícios na escola (ex: lugar na frente da fila da cantina).

21. **Cardápio da Cantina Integrado**
    * **Descrição:** Os pais podem ver o que o filho comprou na cantina usando saldo pré-pago vinculado à pulseira RFID / biometria que também abre a catraca.

22. **Painel Analítico Avançado (Dashboards em Gráficos)**
    * **Descrição:** Gráficos interativos (usando bibliotecas como Recharts) para a direção visualizar horários de pico na portaria e sazonalidade de faltas.

---

## 🔵 Fase 4: Novas Sugestões (Segurança, Engajamento, Financeiro, IA e Integrações)
*Complementos levantados nesta análise, cobrindo lacunas de compliance, retenção de clientes (escolas), monetização e robustez técnica que ainda não constavam no roadmap original.*

23. **Autenticação Multifator (2FA) para Admins e Gestão**
    * **Descrição:** Exigir um segundo fator (código via app autenticador ou SMS/e-mail) para logins de Admin e Gestão, já que esses perfis têm acesso a dados sensíveis de biometria e financeiro. Reduz risco de invasão por senha vazada.

24. **Política de Retenção e Expurgo de Dados Biométricos (LGPD)**
    * **Descrição:** Rotina automática que exclui ou anonimiza dados biométricos de alunos que saíram da escola após um prazo definido em contrato, com log da exclusão. Atende ao princípio de necessidade e finalidade da LGPD, não apenas ao consentimento (item 13).

25. **Central de Portabilidade de Dados (Exportação LGPD para o Titular)**
    * **Descrição:** Endpoint onde o responsável pode solicitar e baixar todos os dados pessoais do filho que o Zela armazena, atendendo ao direito de acesso previsto na LGPD, separado do relatório de presença (item 6).

26. **Testes Automatizados e Pipeline de CI/CD**
    * **Descrição:** Suíte de testes (unitários e E2E, ex: Vitest + Playwright) rodando em GitHub Actions a cada push, para pegar regressões antes de ir para produção — especialmente relevante dado que a revisão de código recente já identificou problemas de race condition e timestamps client-side.

27. **Rate Limiting e Proteção Anti-Brute-Force no Totem**
    * **Descrição:** Limitar tentativas de reconhecimento facial/QR Code por minuto no totem para impedir ataques de força bruta ou uso indevido do dispositivo físico.

28. **Onboarding Guiado para Novas Escolas (Setup Wizard)**
    * **Descrição:** Assistente passo a passo (importar alunos via planilha, cadastrar turmas, convidar responsáveis) para reduzir o tempo de implantação comercial e a dependência de suporte manual na venda.

29. **Central de Ajuda / Base de Conhecimento In-App**
    * **Descrição:** FAQ e tutoriais em vídeo curtos dentro do próprio painel, reduzindo tickets de suporte repetitivos, principal métrica de custo operacional para um SaaS em crescimento.

30. **SLA e Status Page Pública**
    * **Descrição:** Página pública (ex: estilo status.zela.com) mostrando uptime do sistema, útil como argumento comercial para escolas maiores que exigem garantias contratuais de disponibilidade.

31. **Assinatura Recorrente via Gateway (Stripe/Pagar.me/Iugu)**
    * **Descrição:** Cobrança automática da mensalidade do software (não da escola para os pais, mas da Zela para a escola-cliente), com gestão de inadimplência, upgrade/downgrade de plano e nota fiscal automática.

32. **Programa de Indicação (Referral) entre Escolas**
    * **Descrição:** Escola cliente indica outra escola e ganha desconto ou meses grátis, mecanismo comum de aquisição de clientes B2B2C de baixo custo.

33. **Modo Visitante/Prestador de Serviço**
    * **Descrição:** Cadastro simplificado e temporário para visitantes, fornecedores ou prestadores de serviço que precisam passar pela portaria sem ter vínculo permanente de aluno/responsável.

34. **Integração com Calendário Escolar (Google Calendar/Outlook)**
    * **Descrição:** Sincronizar feriados, eventos e reuniões de pais com os calendários pessoais dos responsáveis, complementando o mural de avisos (item 10).

35. **Alertas de Ausência Prolongada (Regra de Faltas)**
    * **Descrição:** Se um aluno não faz check-in por X dias consecutivos sem justificativa, o sistema alerta automaticamente a coordenação pedagógica, útil para prevenção de evasão escolar.

36. **Modo Multi-idioma (i18n)**
    * **Descrição:** Suporte a português, inglês e espanhol na interface, abrindo caminho para expansão comercial em escolas bilíngues ou internacionais, e em outros países de língua espanhola.

37. **Dashboard de Saúde do Sistema (Observabilidade)**
    * **Descrição:** Painel técnico com métricas de latência do reconhecimento facial, taxa de erro de sincronização offline (item 1) e uso de storage no Supabase, para o time de desenvolvimento monitorar proativamente.

38. **Modo Demonstração (Sandbox Comercial)**
    * **Descrição:** Ambiente com dados fictícios pré-carregados para uso em reuniões comerciais e apresentações a escolas prospects, sem expor dados reais de clientes existentes.

39. **Backup e Restauração Point-in-Time**
    * **Descrição:** Rotina de backup automático do banco Supabase com possibilidade de restauração a um ponto específico no tempo, mitigando risco de perda de dados por erro humano ou falha técnica.

40. **Verificação de Duplicidade de Cadastro (Matching Facial)**
    * **Descrição:** Ao cadastrar um novo aluno/responsável, o sistema compara o rosto com a base já existente para evitar cadastros duplicados ou uso indevido de identidade de terceiros.

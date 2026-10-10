# Zela Escola: visão geral do sistema

Documento de contexto para apresentar o Zela a outra IA e pedir sugestões de evolução. Situação em 05/10/2026.

## 1. O que é o Zela

O Zela é uma plataforma SaaS de **gestão e segurança escolar**, feita para escolas brasileiras (hoje principalmente educação infantil). Ele nasceu como um sistema de controle de entrada e saída de alunos com reconhecimento facial e cresceu para cobrir a operação diária da escola: secretaria, financeiro, comunicação com as famílias e acompanhamento pedagógico.

Pontos centrais:

* **Multi-tenant**: cada escola é um cliente isolado. Os dados de uma escola nunca são visíveis para outra.
* **Em produção com dados reais** (alunos, famílias, biometria, pagamentos).
* **Foco permanente**: segurança da criança na escola, especialmente na hora de entregar o aluno a um responsável autorizado.
* **Uso atual pela web** (navegador, tablet como totem). Apps Android e iOS (Capacitor) estão planejados: desenvolvimento a partir de 01/10/2026 e lançamento previsto para janeiro de 2027.

## 2. Quem usa (perfis e portais)

Cada perfil entra num portal próprio, com menus diferentes.

| Perfil | O que faz |
|---|---|
| **Desenvolvedor (Zela)** | Administra a plataforma: cadastra escolas, liga e desliga módulos por escola, define planos e preços, vê logs de erro, qualidade da biometria e atende o suporte. |
| **Recepção / Administração** | Opera o dia a dia: totem, monitor de entradas e saídas, cadastro de famílias e alunos, matrículas, presença, comunicados, cardápio, mural. |
| **Gestão** (Administrativo, Financeiro, Coordenação, Direção) | Visão de gestão da escola: pendências, secretaria, financeiro, contratos, relatórios, ano letivo, permissões, biometrias, configurações. O financeiro é um perfil separado do administrativo. |
| **Professor** | Turma do dia, frequência (chamada), observação diária, relatórios pedagógicos e Mapa de Habilidades. |
| **Família (responsáveis)** | Acompanha os filhos: status ao vivo (na escola, em casa, aguardando saída), histórico, pessoas autorizadas, financeiro, contratos, diário, comunicados, chat, relatórios. |
| **Totem / Autoatendimento** | Tablet no portão onde o responsável se identifica para deixar ou buscar a criança. |

## 3. Fluxo principal: entrada e saída do aluno

É o coração do sistema.

1. O responsável chega ao totem e se identifica por **rosto**, **PIN** ou **QR Code**.
2. O sistema reconhece a pessoa e verifica se ela está autorizada a buscar aquela criança. Se ela responde por mais de um aluno, escolhe quem está entregando ou buscando.
3. O totem gera uma **solicitação** de entrada ou saída.
4. A solicitação aparece na hora no **Monitor da Recepção** (tempo real).
5. A recepção confere a criança e **confirma**.
6. O horário oficial fica gravado no **histórico**, visível para a escola e para a família.

Complementos do fluxo:

* Reset automático diário do status de presença.
* Correção manual de presença com motivo obrigatório, aprovação e preservação do valor original (auditoria).
* Cálculo de permanência, **horas extras** e entrada antecipada, com relatório em PDF e possibilidade de cobrança.
* Alerta de atraso e de ausência prolongada (dias seguidos sem comparecer).
* Botão de emergência (alerta para toda a escola em tempo real).
* Limite de tentativas no totem contra força bruta.

## 4. Biometria facial

* Reconhecimento feito **no próprio dispositivo** (navegador), com face-api.js. Um segundo motor (@vladmandic/human) está em migração, rodando em paralelo para validação.
* Cadastro com câmera guiada (molde oval), conferência de qualidade e consentimento LGPD registrado antes de gravar.
* Bloqueio de cadastro duplicado (mesmo rosto em duas pessoas) e ferramentas para unificar duplicidades.
* Painéis de qualidade da biometria por pessoa e por grupo, e limpeza de biometrias.
* **Prova de vida (liveness)**: existe em modo observador (registra suspeitas, não bloqueia). O bloqueio ainda não está ativo.
* Pessoas autorizadas podem ser permanentes ou temporárias (com data de validade), cadastradas pela família com foto.
* Fotos ficam em armazenamento privado.

## 5. Funcionalidades por área

### Secretaria e cadastros
* Famílias, alunos, responsáveis, autorizados, funcionários e usuários.
* Autocadastro do responsável e **matrícula online** pública com envio de documentos, aprovação pela escola e rematrícula.
* Importação em lote de matrículas.
* Ficha médica.
* Turmas geridas pela escola, transferência de turma, ano letivo (retrato das matrículas por ano), idade do aluno em anos e meses.
* Proteção contra aluno e família duplicados.

### Financeiro (integrado ao gateway Asaas)
* Contratos financeiros com a família, planos de mensalidade por ciclo e turno, bolsistas, descontos por responsável.
* Cobranças por boleto e Pix, cobranças avulsas, ajuste e reajuste de contratos, pagamento manual.
* Lembretes automáticos de cobrança e controle de inadimplência.
* Recebimentos, visão financeira, conciliação por extrato (OFX), fornecedores e despesas.
* Cada escola usa a própria conta no gateway.

### Contratos
* Modelos de contrato e aditivos assinados pela família dentro do app (sem provedor de assinatura com validade jurídica ainda).

### Comunicação
* Comunicados (mural de avisos), calendário escolar, cardápio semanal, mural de fotos por turma.
* Chat família ↔ escola e escola ↔ suporte Zela.
* Notificações push (Web Push; envio para apps nativos já preparado no servidor).
* Leitura de PDF de cardápio e calendário por IA (Google Gemini) para preencher automaticamente.

### Pedagógico
* Frequência (chamada por turma e por dia) e matérias por turma.
* Diário da criança (refeições, sono, evacuação) e observação diária.
* **Relatórios de desenvolvimento**: Semestral, Mitigação (ocorrências com fluxo professor → coordenação/direção → família, leitura rastreada) e **Mapa de Habilidades** (catálogo de habilidades e registro por aluno).
* Regra de permissão: professoras preenchem, coordenação e direção editam, família vê apenas Semestral e Mitigação.

### Gestão e relatórios
* Início com pendências, presença do dia, relatórios consolidados (gestão, financeiro, acadêmico, operacional), auditoria de ações, permissões configuráveis (parcial).

### Plataforma (portal do desenvolvedor)
* Cadastro e suspensão de escolas, módulos por escola com histórico de mudanças, planos comerciais, logs de erro com explicação por IA, alerta de erro crítico, suporte por chat.

## 6. Modelo comercial

Cada escola contrata um **plano base** e pode somar módulos. Todo módulo nasce desligado; escola nova começa só com o plano base.

| Item | Conteúdo |
|---|---|
| **Plano base** | Cadastros, matrículas, ficha médica, entrada e saída (totem, monitor, histórico), comunicados, calendário, contratos, financeiro, configurações |
| **Pedagógico** | Relatórios de desenvolvimento, frequência, matérias |
| **Rotina e família** | Diário, mural de fotos, cardápio |
| **Chat** (adicional) | Chat com a escola e suporte |
| **Prova de vida** (adicional) | Liveness no reconhecimento |
| **Entrada por QR Code** (adicional) | Carteirinhas QR e leitura no totem |
| **App com a marca da escola** (adicional) | Previsto, sem fluxo próprio ainda |

Formas de contratação (em implantação):
* **Por aluno**, para escolas com até 50 alunos: base R$ 6,90 por aluno/mês, mais módulos avulsos (Pedagógico 3,50; Rotina 2,50; Chat 1,50; Prova de vida 1,50; QR 1,00).
* **Pacotes**, obrigatórios acima de 50 alunos: Essencial (R$ 6,90/aluno, mínimo R$ 450), Completo (R$ 11,90, mínimo R$ 790), Premium (R$ 15,90, mínimo R$ 990), em ciclos mensal, semestral, anual e bianual com desconto progressivo.
* **Implantação** cobrada à parte (faixa de referência R$ 800 a R$ 1.500).

Valores ainda em validação; a cobrança automática da escola pelo Zela não existe.

## 7. Arquitetura e tecnologia

* **Frontend**: React 19, Vite 8, Tailwind CSS 4, JavaScript (sem TypeScript). Aplicação de página única com portais por perfil.
* **Backend**: Supabase (Postgres, Auth, Storage, Realtime, Edge Functions em Deno, cron agendado). Não há servidor próprio: as regras ficam em Edge Functions, funções SQL e políticas de acesso por linha (RLS).
* **Integrações**: Asaas (pagamentos), Resend (e-mail), Google Gemini (leitura de PDF e explicação de erros), Web Push, Sentry (monitoramento), Vercel (hospedagem).
* **Qualidade**: testes automatizados com Vitest, focados em isolamento entre escolas, segurança e financeiro; CI com lint, testes e build a cada envio.

## 8. Segurança, privacidade e LGPD

* RLS ativo em todas as tabelas; isolamento por escola em dados, consultas, tempo real e arquivos.
* Armazenamento de arquivos 100% privado.
* Auditoria de ações sensíveis (exclusões, consentimento biométrico, correções de presença).
* Consentimento LGPD para biometria, política de retenção de dados definida (expurgo ainda manual), exclusão de conta pelo usuário.
* Várias rodadas de auditoria de segurança já corrigiram falhas de escalação de privilégio e vazamento.

## 9. O que ainda não existe ou está incompleto

* Totem offline (hoje depende 100% de internet).
* Autenticação em dois fatores (2FA).
* Backup com restauração pontual (PITR) confirmado.
* Prova de vida com bloqueio ativo (hoje uma foto ainda pode passar).
* Apps nativos Android e iOS.
* Redes de escolas com várias unidades sob a mesma matriz.
* Notas, boletim e planejamento de aulas (adiado até haver escola de ensino fundamental).
* Assinatura eletrônica com validade jurídica e nota fiscal.
* Dashboards com gráficos (hoje só contadores).
* Modo visitante/prestador, controle de veículos e placas, integração com catracas físicas.
* Exportação de dados pessoais para o titular (portabilidade LGPD).
* Onboarding guiado para escola nova, central de ajuda, página de status, modo demonstração.
* Personalização de cores por escola (só a imagem de login é personalizável).
* Multi-idioma.

## 10. Prioridades atuais

1. Apps móveis para lançamento em janeiro de 2027 (contas nas lojas dependem do CNPJ, ainda em abertura).
2. LGPD: prazos de retenção e política de privacidade revisada por advogado.
3. Logs e observabilidade confiáveis.
4. Concluir a migração do motor de reconhecimento facial.
5. 2FA e backup antes do lançamento.

## 11. Restrições para qualquer sugestão

* Segurança e isolamento entre escolas vêm antes de qualquer funcionalidade.
* Biometria de crianças e responsáveis exige cuidado especial (LGPD, armazenamento privado, consentimento).
* Evoluir sem quebrar: o sistema já roda com dados reais.
* Custo de infraestrutura importa (tráfego de dados e armazenamento do Supabase).
* Equipe pequena: sugestões devem ser viáveis com a stack atual (React + Supabase), sem servidor próprio.
* Novos módulos entram desligados e são vendidos como adicionais.

## 12. O que pedir à outra IA

Exemplos de perguntas úteis:

* Que funcionalidades de **segurança escolar** fariam o Zela se diferenciar dos concorrentes brasileiros?
* Que novos **módulos vendáveis** fazem sentido para escolas de educação infantil e como precificá-los?
* Como aumentar o **engajamento das famílias** no app sem gerar custo alto de infraestrutura?
* Que **estratégias comerciais** (canais de venda, parcerias, indicação) funcionam para SaaS escolar no Brasil?
* Que riscos (técnicos, jurídicos, LGPD) devo tratar antes de escalar para mais escolas?
* Que melhorias de **experiência no totem e na recepção** reduziriam filas na hora da saída?

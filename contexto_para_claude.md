# Contexto do Projeto Zela - Gestão de Portaria Escolar

Este documento tem como objetivo fornecer todo o contexto necessário sobre a arquitetura, regras de negócio e funcionamento do **Projeto Zela**, para que você (assistente de IA) esteja na mesma página em relação ao desenvolvimento do sistema.

## 1. Visão Geral do Sistema
O **Projeto Zela** é uma plataforma moderna SaaS (Multi-tenant) voltada à gestão de portaria, check-in e check-out de escolas. O foco principal é trazer segurança, agilidade e permitir que as famílias acompanhem o acesso das crianças em tempo real.

O sistema elimina o uso de papel ou processos manuais lentos na portaria, adotando totens de autoatendimento integrados com a recepção da escola.

## 2. Stack Tecnológico (Tech Stack)
*   **Frontend:** React.js com Vite (Single Page Application).
*   **Estilização:** Tailwind CSS.
*   **Ícones:** Lucide React.
*   **Backend / Banco de Dados / Autenticação / Realtime:** Supabase.
*   **Reconhecimento Facial:** Biblioteca `face-api.js` (processamento ocorre totalmente no client-side/navegador por questões de privacidade e custo).
*   **Leitura de QR Code:** Biblioteca `html5-qrcode`.
*   **Deploy:** Vercel (configurado via `vercel.json` para suportar roteamento SPA).

## 3. Perfis de Usuário (Roles) e Funcionalidades

O sistema possui uma hierarquia de acesso dividida em 3 papéis (roles) principais. Cada um acessa um painel diferente:

### 3.1. Master / Desenvolvedor (`role: developer`)
É a conta de administração global da plataforma.
*   **Gestão Multi-tenant:** Cadastra novas escolas gerando um código único para cada uma (ex: `ZL001`).
*   **Onboarding:** Ao criar uma escola, o sistema já gera a conta "Admin" daquela escola.
*   **Controles Administrativos:** Pode suspender escolas (inadimplência) e utilizar a "Zona de Perigo" para limpar dados do banco (hard reset para testes/produção).

### 3.2. Escola / Recepção (`role: admin`)
Painel acessado pelos funcionários da secretaria ou portaria de cada escola.
*   **Gestão de Famílias:** O admin cadastra a família e seus alunos. O sistema cria automaticamente: login do responsável, o cadastro do aluno (com turno contratado), e já coloca o responsável titular na lista de "Pessoas Autorizadas".
*   **Totem de Autoatendimento:** É a tela que fica fisicamente no portão da escola. Possui dois planos/modos:
    *   **Pro (Face ID):** Abre a câmera e reconhece o rosto do responsável.
    *   **Basic (QR Code):** Abre a câmera para ler o QR code no celular do responsável.
*   **Monitor de Portaria (Live):** É o painel de operação da secretaria. Quando alguém usa o Totem, a notificação chega em tempo real neste monitor via WebSocket (Supabase Realtime). A escola deve verificar e apertar "Confirmar Check-in" ou "Confirmar Check-out".
*   **Histórico e Horas Extras:** Painel de relatórios contendo todos os registros de entrada e saída, calculando a permanência e apontando automaticamente se o aluno excedeu o horário contratado (horas extras).

### 3.3. Família / Pais (`role: user`)
Painel mobile-first (WebApp) acessado pelos responsáveis.
*   **Status ao Vivo:** Mostra onde a criança está ("Em casa", "Na Escola").
*   **Credencial Dinâmica:** Gera um QR Code dinâmico na tela inicial que o pai apresenta no totem da escola.
*   **Gestão de Autorizados:** Onde os pais adicionam avós, tios, babás, etc. Eles podem definir se a autorização é permanente ou tem data de validade. **Crucial:** É aqui que a família faz o upload da foto do rosto do autorizado para que o modelo do `face-api.js` funcione no Totem.
*   **Histórico Privado:** Visão do log de acessos, restrita apenas às crianças daquela família.

## 4. O Workflow Principal (Fluxo de Entrada e Saída)

A jornada principal do usuário (Golden Path) funciona assim:

1.  **Meia-noite:** Um cronjob ou trigger zera o status de todos os alunos no banco de dados para "Aguardando" (Em casa).
2.  **Solicitação no Portão:** O pai/autorizado chega na escola, vai ao Totem e usa seu Rosto ou QR Code.
3.  **Identificação e Ação:** O Totem reconhece quem é a pessoa, identifica de quais alunos ela é responsável e verifica o status atual deles. Se estão em casa, sugere um "Check-in". Se estão na escola, sugere "Check-out". A pessoa confirma na tela do totem.
4.  **Notificação Realtime:** Imediatamente, um card surge no Monitor da Recepção da escola.
5.  **Aprovação:** O funcionário da escola confere fisicamente a criança e clica no botão verde de confirmação no sistema.
6.  **Gravação do Log:** Somente após a confirmação da escola é que o horário oficial é gravado no banco de dados e os relatórios (tanto da escola quanto dos pais) são atualizados.

## 5. Diretrizes para Próximos Desenvolvimentos
Ao sugerir novos códigos ou refatorações:
*   Mantenha a abordagem atual do Supabase (utilizando as políticas de RLS - Row Level Security para separar os dados das escolas).
*   Siga o padrão visual do Tailwind (sempre priorizando uma UI moderna, minimalista e limpa).
*   Lembre-se que o Totem e o Monitor da Recepção dependem fortemente de conexão em tempo real.

---
**Instrução para a IA:** Confirme que leu e compreendeu este contexto. A partir de agora, todas as suas respostas e sugestões de código devem levar em consideração esta arquitetura e as regras de negócio aqui definidas.

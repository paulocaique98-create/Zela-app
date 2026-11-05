# Projeto Zela - Documentação do Sistema

O Projeto Zela é uma plataforma moderna voltada à gestão de portaria, check-in e check-out de escolas, focada em segurança, agilidade e acompanhamento familiar. O sistema atende múltiplos papéis de usuários através de painéis dedicados.

## 1. Arquitetura e Tecnologia
- **Frontend**: React.js com Vite.
- **Estilização**: Tailwind CSS.
- **Ícones**: Lucide React.
- **Banco de Dados & Autenticação**: Supabase.
- **Reconhecimento Facial**: Biblioteca `face-api.js` atuando totalmente no client-side.
- **Leitura de QR Code**: Biblioteca `html5-qrcode`.

## 2. Perfis de Usuário (Roles)
O sistema é gerido através de três perfis principais:

### 2.1. Desenvolvedor (Master)
Conta de nível supremo (`role: developer`) utilizada para gerenciamento global da plataforma (multi-tenant).
- **Cadastro de Escolas**: Adiciona novas escolas gerando automaticamente um código (ex: `ZL001`).
- **Cadastro de Admin da Escola**: Ao criar uma escola, cria também a conta principal (admin) que irá operar a recepção.
- **Status das Escolas**: Pode suspender temporariamente o acesso de uma escola por inadimplência ou cancelamento.
- **Limpeza de Banco de Dados**: Possui uma "Zona de Perigo" capaz de limpar dados de testes e zerar as planilhas para colocar o sistema em modo de produção real.

### 2.2. Escola (Recepção / Admin)
Conta do gestor da portaria da escola. 
- **Gestão de Famílias/Alunos**: Pode cadastrar famílias. Ao cadastrar, o sistema automaticamente:
  - Cria o login do Responsável Titular.
  - Cria o cadastro dos Alunos (com horário contratado).
  - Adiciona o Titular automaticamente na lista de Pessoas Autorizadas.
- **Autoatendimento (Totem)**: Acesso à tela de check-in/check-out que os próprios responsáveis utilizam no portão. Pode operar em dois modos:
  - **Reconhecimento Facial (Plano PRO)**: Usa a câmera para validar quem está buscando a criança.
  - **QR Code (Plano Basic)**: Escaneia o QR Code presente no aplicativo do responsável.
- **Monitor de Portaria (Live)**: Dashboard em tempo real que recebe as solicitações de Check-in e Check-out do totem e permite à recepção confirmar (botão verde) a entrada ou saída da criança.
- **Histórico**: Tabela listando todos os acessos dos alunos, calculando o tempo de permanência e identificando tempo excedido (horas extras). Permite filtro dinâmico por datas customizadas.

### 2.3. Família (Responsáveis)
Conta usada pelos pais ou guardiões dos alunos.
- **Home**: Exibe o status ao vivo da criança (Em casa, Na Escola, Aguardando Saída, etc) e gera um **QR Code dinâmico** seguro para uso no totem da escola.
- **Autorizados**: Gerenciamento de pessoas com permissão de buscar as crianças. Permite que a família cadastre terceiros (ex: avós, tios), definindo grau de parentesco e se a autorização é permanente ou temporária (com validade). Aqui os pais devem **enviar fotos** dos autorizados para validar no reconhecimento facial do totem.
- **Histórico**: Acesso transparente ao mesmo log de ponto gerado pela portaria, mas restrito apenas aos seus próprios filhos, monitorando duração na escola e tempo extra.

## 3. Fluxo de Portaria (Workflow de Check-in/out)

O núcleo do aplicativo Zela:

1. **Início do dia**: O servidor zera automaticamente a presença do aluno quando vira meia-noite. O status volta para 'Aguardando'.
2. **Autoatendimento (Totem)**: O responsável se aproxima e exibe o rosto (Face ID) ou o celular (QR Code).
3. **Validação**: O sistema identifica a família. Uma tela de sucesso informa se é uma Entrada ou Saída (com base no status atual) e um botão de solicitação é clicado.
4. **Notificação (Painel da Recepção)**: Um "card" surge imediatamente na tela da secretária (via comunicação em tempo real).
5. **Confirmação**: A escola confere a criança e aperta "Confirmar Check-in" ou "Confirmar Check-out".
6. **Log (Histórico)**: Após essa confirmação, o horário oficial é gravado na tabela, sendo disponibilizado para relatórios tanto no painel Admin quanto no painel da Família.

## 4. Deploy na Vercel
O sistema está pronto para implantação (Single Page Application). Um arquivo `vercel.json` garante que, na Vercel, todos os caminhos convirjam para o `index.html`, permitindo a navegação interna correta sem erro 404.
Para subir, é necessário:
- Linkar o repositório GitHub na Vercel.
- Adicionar as variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel da Vercel durante o passo de importação.
- Clicar em Deploy. O comando de build será automaticamente reconhecido como `npm run build` (vite build).

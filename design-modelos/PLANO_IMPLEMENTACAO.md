# Plano de implementação do novo layout Zela

Base: modelos em `design-modelos/` e skill em `frontend-design.md`. Nada abaixo altera lógica, banco, RLS, Auth ou Realtime. É mudança só de aparência e de estrutura de tela.

## Diretrizes consolidadas (tudo que foi decidido)

1. **Objetivo:** mais seriedade e segurança, mantendo o ar moderno. Sem cores elétricas e com o mínimo possível de aparência de "feito por IA".
2. **Cores:** petróleo profundo como principal, tinta escura no menu, latão discreto só para o que está verificado ou em andamento, estados sóbrios (confirmado, atenção, risco). Fundo cinza-névoa.
3. **Tipografia:** Source Serif 4 nos títulos e Public Sans na interface, instaladas localmente. Inter sai.
4. **Texto da interface:** sem hífen e sem travessão, sem rótulos em caixa alta, sem pontos separando textos, sem seta no fim de botões. Frases diretas, no padrão de frase normal, ação com o mesmo nome em todo o fluxo.
5. **Ícones:** só `lucide-react`, sem emojis e sem estrelas de IA (seção própria abaixo).
6. **Formas e bordas:** cantos mais quadrados, com curva suave (seção própria abaixo).
7. **Elemento de assinatura:** a trilha de confirmação (responsável, totem, recepção, concluído), na Recepção e na Família.
8. **Estrutura:** faixa colorida lateral e borda fina indicam estado. Sem degradês decorativos, sem sombra suave em tudo, sem entrada animada em cada bloco. Movimento só para chamar atenção a uma coisa (nova solicitação) e sempre respeitando movimento reduzido.
9. **Telas:** celular, tablet e desktop em todas as fases (seção de pontos de quebra).
10. **Portais:** Dev em tema claro com diferenciais próprios (menu lateral claro, faixa de estado escura, números em fonte técnica). Financeiro herda a Gestão. Impressos só na fase 10 e só as cores.
11. **Critérios da skill frontend-design** aplicados a cada tela: decisão por assunto (escola e segurança), uma única área de destaque por tela, qualidade mínima de acessibilidade, revisão final removendo o que for decoração.

## O que foi levantado no código

* O sistema usa tokens do Tailwind v4 em `src/index.css` (`bg-primary`, `text-on-surface`, `bg-surface-container-low` e outros). São cerca de 2.700 usos em 111 arquivos. Trocar o valor dos tokens recolore quase tudo sem editar cada componente.
* Cores fixas fora dos tokens (indigo, violet, blue, #3525cd e parecidas): 181 ocorrências em 48 arquivos. Estas precisam de limpeza manual.
* Arquivos de casca: `SidebarNav.jsx`, `Header.jsx`, `FamilyBottomNav.jsx`, `Login.jsx`, `AuthModal.jsx`, `Toaster.jsx`, `ConfirmModal.jsx`.
* Portais: `AdminPortal.jsx` (Recepção), `FamilyPortal.jsx`, `TeacherPortal.jsx`, `GestaoPortal.jsx`, `DeveloperPanel.jsx`, mais o totem em `AdminFaceScanner.jsx` e `KioskClock.jsx`.
* Há alterações não commitadas em `AdminFaceScanner.jsx` e no teste dele. Elas devem ser commitadas ou guardadas antes de qualquer fase que toque o totem.

## Pontos de quebra (celular, tablet, desktop)

Usar os pontos padrão do Tailwind já em uso no projeto. Os modelos usam 860 e 1000 px só por simplicidade e serão alinhados a estes.

| Faixa | Largura | Dispositivo principal | Navegação | Conteúdo |
|---|---|---|---|---|
| Celular | até 639 px | Família, Professora | Barra inferior (Família) ou barra superior rolável (demais), com respeito à área segura do aparelho | 1 coluna, tabelas viram cartões, alvos de toque de 44 px ou mais, campos com 16 px |
| Tablet | 640 a 1023 px, retrato e paisagem | Totem, Recepção em tablet, Professora em sala | Menu lateral recolhido só com ícones (72 px), nome aparece ao tocar | 2 colunas, botões grandes no totem, sem depender de passar o mouse |
| Desktop | 1024 px ou mais | Recepção, Gestão, Financeiro, Dev | Menu lateral completo (248 px) | Até 3 ou 4 colunas, largura máxima de 1280 px, tabelas completas |

Regras comuns: sem rolagem horizontal da página, texto legível com zoom de 200%, foco visível no teclado, movimento reduzido respeitado, nada que dependa só de passar o mouse.

Casos especiais:
* Totem: testar 1280x800 e 800x1280, tela inteira, sem barras de rolagem, botões com pelo menos 56 px. A câmera continua em tela cheia, sem molde, como já definido.
* Cadastro facial: manter o molde oval.
* Família: prioridade total ao celular, o desktop só centraliza a coluna.

## Fases (uma fase por sessão, um commit por fase)

1. **Fundação.** Trocar os valores do `@theme` em `src/index.css` mantendo os nomes dos tokens. Incluir os pontos de quebra, a nova escala de raios (cantos mais quadrados), a espessura única dos ícones e as variáveis de fonte. Instalar as fontes Source Serif 4 e Public Sans localmente (pacotes `@fontsource`), sem depender do Google Fonts em produção. O tema escuro atual do Dev (tokens `dev-*`) é substituído por uma variação clara na mesma família de cores.
2. **Casca compartilhada.** Reformar `SidebarNav.jsx` (completo no desktop, recolhido no tablet), `Header.jsx`, `FamilyBottomNav.jsx`, `Toaster.jsx`, `ConfirmModal.jsx`, `NotificationsDropdown.jsx`. Criar poucos componentes reutilizáveis novos (`TrilhaConfirmacao`, `Selo`, `Indicador`), só os que se repetem.
3. **Entrada.** `Login.jsx`, `AuthModal.jsx`, `ResetPassword.jsx`, `SelfRegister.jsx`, `PublicMatricula.jsx`.
4. **Recepção.** `AdminPortal.jsx`, `AdminInicio.jsx`, monitor de solicitações, `CheckinAlertModal.jsx`. A trilha de confirmação entra aqui. Leitura por trechos, sem abrir o arquivo inteiro.
5. **Família.** `FamilyPortal.jsx`, `FamilyHome.jsx`, `FamilyInicio.jsx` e as telas Family*. Conferir o celular primeiro.
6. **Professora.** `TeacherPortal.jsx`, `TeacherInicio.jsx`, `TeacherFrequencia.jsx`, `TeacherMonitor.jsx`.
7. **Gestão e Financeiro.** `GestaoPortal.jsx` e os Gestao*, `AdminFinanceiro.jsx`. Tabelas densas precisam de atenção no tablet.
8. **Totem.** `AdminFaceScanner.jsx` e `KioskClock.jsx`. Só estilo e estrutura visual. Não mexer no laço de detecção, nos uploads, no fluxo de câmera nem nas regras de segurança.
9. **Desenvolvedor.** `DeveloperPanel.jsx` e os Developer*.
10. **Limpeza e fechamento.** Eliminar as 181 cores fixas restantes, buscar emojis, `Sparkles` e raios fora da escala (com teste que impede o retorno), revisar documentos impressos (`printHistorico.js`, `printCarteirinhaQr.js`, `printHorasExtras.js`), atualizar `docs/ZELA_STATUS.md`.

A ordem prioriza o que as pessoas veem todo dia (Recepção e Família) e deixa o totem para depois de a base estar estável, por ser a parte mais sensível.

## Padrão de ícones (sem emojis e sem estrelinhas de IA)

Levantamento: o sistema já usa `lucide-react` em 121 arquivos, então não entra biblioteca nova. Há 14 linhas com emojis em 7 arquivos e 19 usos do ícone de estrelas (`Sparkles`) em 9 arquivos. Nem todo uso de estrelas é de IA: muitos são só decoração.

Regras:
* Só `lucide-react`. Emojis ficam proibidos em interface, mensagens, botões, listas e avisos.
* Nenhum ícone de estrelas, brilhos ou robô. Onde a função usa IA, o ícone representa a ação (ler documento, analisar, buscar) e a palavra "IA" aparece como texto, num selo discreto, para a pessoa saber que é automático.
* Espessura de traço única (1,75) definida uma vez no CSS. Tamanhos fixos: 16 (texto), 18 (botões), 20 (menu), 24 (destaque). Sempre na cor do texto.
* Ícone decorativo com `aria-hidden`. Botão só com ícone tem `aria-label` e dica visível.
* Cada ação mantém o mesmo ícone em todos os portais (salvar, editar, apagar, confirmar, recusar, entrada, saída).

Trocas já mapeadas:

| Hoje | Passa a ser | Onde |
|---|---|---|
| Aviso amarelo com emoji | `AlertTriangle` | AdminMatriculas, FamilyGerenciarResponsaveis, AdminImportModal |
| Marca de certo e de erro com emoji | `CheckCircle2` e `XCircle` | AdminImportModal |
| Caixa de entrada e de saída com emoji | `LogIn` e `LogOut` | CheckinAlertModal |
| Lápis em opção de lista | texto simples "Personalizar horário" | AdminUserRegistration, SelfRegister |
| Comemoração em tela vazia | `CheckCircle2` e frase direta | DeveloperErrorLogs |
| Alfinete de local | `MapPin` | DeveloperErrorLogs |
| Robô e estrelas em "Explicar com IA" | `ScanSearch`, texto "Analisar erro" e selo "IA" | DeveloperErrorLogs |
| Estrelas em "Ler com IA" (PDF) | `FileSearch`, texto "Ler PDF" e selo "IA" | AdminCalendario, AdminCardapio |
| Estrelas em Atualizações | `PackageCheck` | AdminPortal, AdminSystemUpdates |
| Estrelas em Aulas Especiais | `BookOpen` | FamilyCalendario |
| Estrelas em sugestão de turma | `Lightbulb` (sugestão, não IA) | GestaoAlunos, GestaoAlunoPerfil |
| Estrelas em estado vazio | ícone do assunto (`Target` em habilidades, `Inbox` em atualizações) | TeacherMapaHabilidades, AdminSystemUpdates |

Os textos de mensagens também perdem os emojis (por exemplo "Família importada com sucesso" aparece com ícone, não com símbolo no texto).

Onde entra: o padrão e o traço único vão na fase 1 e 2. Cada arquivo troca seus ícones na fase do seu portal. Na fase 10, uma busca final garante zero emojis e zero `Sparkles`, e um teste simples impede que voltem.

## Formas e bordas (cantos mais quadrados)

Levantamento: 956 usos dos tokens `rounded-zela-*`, cerca de 330 usos dos raios padrão do Tailwind (`rounded-lg` 176, `rounded-xl` 102, `rounded-md` 45, `rounded-2xl` 34, `rounded-3xl` 19) e 158 usos de `rounded-full`. Hoje os tokens vão de 8 a 24 px, o que dá o aspecto arredondado e "de aplicativo genérico". Os raios grandes (`xl`, `2xl`, `3xl`) aparecem em 27 arquivos.

Nova escala, com hierarquia (raios diferentes para papéis diferentes, não um único raio em tudo):

| Papel | Raio |
|---|---|
| Selos, etiquetas, avatares pequenos | 4 px |
| Botões, campos, listas suspensas | 6 px |
| Painéis, cartões, tabelas, fotos | 8 px |
| Janelas (modais), gavetas, câmera do totem | 12 px |
| Círculo completo | só onde a forma é naturalmente redonda: indicador de carregamento, ponto de estado, chave liga e desliga, e o molde oval do rosto no cadastro |

Como aplicar com pouco risco:
* Fase 1: no `@theme` de `src/index.css`, redefinir os `--radius-zela-*` e também os raios padrão (`--radius-sm` 4, `--radius-md` 6, `--radius-lg` 8, `--radius-xl` 8, `--radius-2xl` 12, `--radius-3xl` 12). Isso muda de uma vez os cerca de 1.290 usos que passam por token ou raio padrão, sem editar componente.
* Em cada fase de portal: revisar os `rounded-full` em botões, selos e avatares e trocar por `rounded-sm` ou `rounded-md`, mantendo círculo só nos casos da tabela.
* Remover bordas muito grossas e sombras grandes (`shadow-xl`, `shadow-2xl`) em favor de borda fina de 1 px.
* Totem: os botões grandes seguem a mesma escala (6 px), só maiores em altura.
* Fase 10: busca final por `rounded-3xl`, `rounded-2xl` e `rounded-full` fora da lista permitida.

## Validação em cada fase

* Build mostrando só erros e testes apenas dos arquivos tocados (`npx vitest run <arquivo>`).
* Conferência visual em 375, 768, 1024 e 1440 px, e no totem em 1280x800 e 800x1280. Cada fase informa o que foi conferido de fato.
* Contraste de texto mínimo 4,5 para 1 e foco visível em todos os controles.
* Nenhuma mudança em consultas, policies, Realtime ou Storage. Se alguma fase exigir isso, para e pergunta antes.

## Riscos e cuidados

* `App.jsx`, `AdminFaceScanner.jsx` e `AdminPortal.jsx` são grandes: busca por trecho e edição pontual.
* Classes que mudam de largura podem cortar tabelas em tablet. Cada tela com tabela recebe teste em 768 px.
* Rollback simples: cada fase é um commit isolado; a fase 1 reverte todo o visual com um único revert.
* Fonte local aumenta um pouco o carregamento inicial. Usar apenas os pesos necessários.

## Decisões tomadas

1. Portal do Dev: tema claro, com diferencial próprio em relação aos outros portais. Diferenciais no modelo: menu lateral claro (os demais têm menu escuro), faixa de estado do sistema escura no topo (banco, autenticação, tempo real, facial, versão) com marca lateral em latão, e números dos indicadores em fonte técnica de largura fixa. Mesma família de cores dos demais portais.
2. Financeiro herda o visual da Gestão, sem visual próprio.
3. Documentos impressos entram só na fase 10, apenas com as cores.

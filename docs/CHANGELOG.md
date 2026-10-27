# Changelog
Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [Não lançado] - 2026-10-05
### Alterado
- **Sessão permanente** (22/10): removido o logout automático por 30 minutos de inatividade; o login só termina em Sair, conta removida, troca de senha ou escola suspensa. Novo menu Configurações, aba Dispositivos, com "Sair de todos os aparelhos" em todos os portais (Recepção e Professor ganham o item Configurações).
- **Portais e interface** (22/10): Rotina e família no Professor (Diário, Cardápio só leitura, Mural em Acadêmico, limitados às turmas dele); Sair no fim do menu mobile; Autoatendimento sem menu lateral; barras inferiores de Professor, Família e Gestão; submenus recolhem no mobile; login sempre no Início; contadores de alerta em dourado; fundo branco; Planos em cartões. Migration `20261022120000_professor_rotina_e_familia.sql` (não aplicada).
- **Mínimo mensal dos pacotes reduzido** (14/10): Essencial 450 para 290, Completo 790 para 490, Premium 990 para 690. Migration `20261014120000_reduz_minimo_mensal_pacotes.sql` (não aplicada). Chip "Livre" removido da tela de Módulos do Dev.

### Adicionado
- **Método Tradicional, Fase 2** (28/10): Avaliação (período bimestre ou trimestre, média mínima 7,0 configurável, provas e trabalhos com peso, recuperação substitui a nota do período) em Gestão › Acadêmico › Avaliação e Professor › Notas; chave `avaliacao_tradicional`. Migration `20261028120000_tradicional_fase2_avaliacao.sql` (tabelas `trad_*` com RLS) ainda não aplicada.
- **Método Tradicional, Fase 1** (27/10): Estrutura acadêmica (séries, turmas, disciplinas, grade, professores por turma, horários) em Gestão › Acadêmico, módulo "Pedagógico Tradicional" com chave `estrutura_academica_tradicional` (desligada por padrão). Tabelas `trad_*` com RLS e FKs compostas por school_id. Migration `20261027120000_tradicional_fase1_estrutura.sql` (aplicada só no banco local, NÃO na homologação nem na produção).
- **Método Tradicional, Fase 0** (27/10): método pedagógico obrigatório ao criar/editar escola; Mitigação e Mapa de Habilidades escondidos só em escola `tradicional`; módulo "Pedagógico Tradicional" no catálogo (Em breve, sem chaves) e Módulos do Dev filtrados por método. Sem migration/RLS. Plano em PLANO_METODO_TRADICIONAL.md.
- **Mapa de Habilidades, ajustes** (15/10): Coordenação escolhe quais alunos publicar (Selecionar todos); Professora com campo Turma fixo e filtro Aluno (Geral ou um aluno); tela da Família com 7 áreas fixas recolhíveis, card de progresso fixo e filtro de semestre abreviado (até 40 semestres). Catálogo de exemplo em `docs/mapa_habilidades_montessori.csv`.
- **Cobrança de hora extra geral** (14/10): em Configurações, Financeiro, Hora extra, a escola escolhe entre cobrança individual (atual) e geral (tolerância única somando entrada antecipada e saída tardia, com valor por faixa de tempo de 30 min). Só um modo vale, definido ao salvar. Aluno ainda na escola sem saída já conta quando passa da tolerância. Subaba de Financeiro lembrada ao recarregar.
- **Menu Planos no Portal do Dev** — planos por aluno (até 50 alunos) e pacotes (Essencial, Completo, Premium e outros) nos ciclos mensal, semestral, anual e bianual, preços dos módulos, simulador, contratações com desconto de implantação (máx. 50%, com motivo) e alerta de escola por aluno que passou do limite. Migration `20261005150000_planos_zela.sql` (testada no banco local, não aplicada em produção), RPC `contratar_plano_escola`, `src/lib/planosZela.js`.
- **Meu plano** na Gestão da escola (Configurações): plano, ciclo, valores e vencimento da própria escola, via RPC `meu_plano_escola`.
- Botão Contratar plano no menu da escola em Gestão de Escolas; Módulos do Dev passa a ler os pacotes do banco (com fallback fixo).
- **Política de SLA e Atendimento** (`SLA_ATENDIMENTO.md`, rascunho para revisão jurídica) e imagem de destaque 1024x500 da Google Play; protótipos de logo não usados removidos e pasta `docs/mobile/logo/nova-logo/` criada.

## [1.2.3] - 2026-08-04
### Corrigido
- **Monitor Check-in não recebia atualizações em tempo real** — o filtro de coluna (`school_id=eq.xxx`) no canal Supabase Realtime estava sendo descartado silenciosamente no servidor; o recepcionista precisava dar F5 para ver as solicitações do totem. Corrigido removendo o filtro de coluna do canal e aplicando a filtragem por escola/família no callback do frontend (independe de REPLICA IDENTITY). O Monitor agora exibe os cards de check-in/checkout em menos de 1 segundo, sem recarregar a página.
- `channelSuffix` migrado de variável de módulo para `useRef` — evita recriação acidental do canal a cada render do componente `App`.

## [1.2.1] - 2026-08-04
### Corrigido
- Saudação na página inicial do portal da família exibe apenas o primeiro nome do responsável (em vez do nome completo)


### Adicionado
- Sistema de notificações em tempo real para responsáveis (check-in, check-out, lembretes de atraso e cobrança extra)
- Novo status "Pendente de Check-in" para alunos, substituindo o comportamento incorreto de "Ausente" por padrão
- Tela fullscreen de Totem Check-in dentro do Portal do Administrador, com proteção por senha para sair
- Edge Function de reset diário automático (daily-reset), rodando via pg_cron, eliminando dependência de navegador aberto
- PIN de acesso manual (CPF) como alternativa ao reconhecimento facial no totem

### Corrigido
- Recursão infinita em políticas RLS da tabela users e tabelas relacionadas (students, authorized_persons, attendance_logs)
- Erro "column status does not exist" na função get_kiosk_school_id()
- Vulnerabilidade de autenticação na Edge Function daily-reset (aceitava Anon Key indevidamente)
- Erro 404 em rotas internas no deploy da Vercel (adicionado vercel.json com rewrite para SPA)
- Ajustes de layout responsivo (desktop e mobile) em todos os portais

### Removido
- Recurso de Kiosk público (/totem) temporariamente isolado para relançamento futuro
- Formulário de Ficha Médica e Envio de Documentos do cadastro de responsáveis

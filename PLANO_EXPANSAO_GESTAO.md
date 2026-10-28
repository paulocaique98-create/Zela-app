# Plano — Expansão da Gestão (BI + 14 funcionalidades)

Criado em 28/10/2026, a partir do comparativo Zela x Activesoft.
Ordem pedida: **Dashboards (BI) primeiro**; depois os demais itens da prioridade **Baixa → Média → Alta**.
Nada deste plano foi implementado. Cada fase é uma sessão própria (CLAUDE.md §1.4): planejar com Opus, executar com Sonnet.

> ⚠️ Risco da ordem escolhida: NFS-e (obrigação fiscal) e Régua de cobrança (inadimplência) ficam por último. Se uma escola exigir nota fiscal antes, puxe o item 15 para frente; ele não depende dos outros.

---

## Sumário

0. Como executar este plano
1. Padrões obrigatórios (visual, layout, dados, segurança, testes)
2. Ordem de execução e dependências
3. Item 1 · Dashboards BI interativo (detalhado)
4. Prioridade Baixa: 2 Plano de aula · 3 DRE e fluxo de caixa · 4 Biblioteca · 5 Transporte · 6 Estoque
5. Prioridade Média: 7 Ocorrências · 8 Avaliação institucional · 9 Conciliação completa · 10 Negociação de dívida · 11 Captação (CRM)
6. Prioridade Alta: 12 Histórico escolar · 13 Bolsas · 14 Régua de cobrança · 15 NFS-e
7. Decisões pendentes (consolidadas)
8. Checklist padrão de entrega de cada fase

---

## 0. Como executar este plano

- **Uma fase = uma sessão.** Início de sessão: ler `CLAUDE.md`, `docs/ZELA_STATUS.md` e só a seção deste arquivo da fase em curso.
- **Antes de codar cada item**, responder as decisões dele na seção 7 (marcadas `D#`). Sem decisão, não começa.
- **Toda migration, policy, Edge Function ou Storage** passa por análise de segurança antes (CLAUDE.md §4). Migration é escrita e **informada**; aplicar em produção só com pedido explícito (memória: sem homologação).
- **Todo módulo novo nasce desligado** (`features.x === true`), entra no `modulosCatalogo.js` e no teste `modulosCatalogo.test.js`.
- Ao concluir item/fase: riscar aqui (`~~texto~~ ✅`), atualizar `docs/ZELA_STATUS.md` em até 5 linhas e sugerir `/commit` ou `/finalizar`.

---

## 1. Padrões obrigatórios

### 1.1 Design system (fonte: `src/index.css` `@theme`)

| Token | Valor | Uso |
|---|---|---|
| `primary` | `#1e5563` | botão principal, foco, links, item ativo |
| `primary-container` | `#174450` | hover do botão principal |
| `secondary` / `brass` | `#a9843b` | **alertas, contadores, bordas de atenção** (nunca vermelho; memória "Alertas em dourado") |
| `brass-50` | `#f5eedc` | fundo de faixa de atenção |
| `surface` / `surface-container-lowest` | `#ffffff` | fundo da página e dos cartões |
| `surface-container-low` | `#eaeef1` | botão secundário, fundos discretos |
| `surface-container` | `#e8f0f2` | hover de linha/ícone |
| `outline-variant` | `#d9dfe4` | **todas as bordas** de cartão, tabela, input |
| `on-surface` / `on-surface-variant` | `#17242e` / `#5a6a76` | texto principal / secundário |
| `success` / `warning` / `error` | `#2b6a4b` / `#8f6411` / `#a33a32` | **só status**, sempre com ícone + texto |
| `ink` | `#13222e` | overlay de modal (`bg-ink/60`) |

- **Fontes:** `font-sans` Public Sans (corpo); `h1/h2/h3` usam Source Serif 4 automaticamente. Títulos de seção dentro da tela: `<h3 className="font-bold text-on-surface text-sm">`.
- **Cantos:** `rounded-zela-md` (8px) em botão/input; `rounded-zela-lg` (8px) em cartão; `rounded-zela-xl` (12px) em modal e estado vazio. Não usar `rounded-2xl/3xl` soltos.
- **Ícones:** só `lucide-react` (traço 1.75 global). Tamanhos: 16 em botão, 18 em ação de cabeçalho, 30 em estado vazio.
- **Sem modo escuro** no app hoje (0 ocorrências de `dark:`). O BI não cria modo escuro.
- **Texto voltado ao usuário sem hífen** (memória "Sem hífen em texto"): escrever "1 a 15 dias", "Jan a Mar", nunca "1-15".
- **Gestão ≠ Recepção** (memória): Gestão inclui financeiro; Recepção é o `admin`. Nunca rotular tela da Gestão como Recepção ou vice-versa.

### 1.2 Layout e margens (fonte: `src/components/GestaoShared.jsx`)

| Peça | Classes/regra |
|---|---|
| Casca da tela | sempre `PageShell` (sem título próprio; o título vem do Header via `SCREEN_LABELS`). Conteúdo com `p-2.5 md:p-6`, rolagem interna `overflow-y-auto` |
| Faixa de ações | prop `actions` do `PageShell` (botões à direita, `gap-2`, borda inferior). `infoOnMobile` esconde a faixa no celular |
| Ritmo vertical | `space-y-6` entre blocos da tela; `gap-3` entre cartões de KPI |
| Grade de KPIs | `grid grid-cols-2 lg:grid-cols-4 gap-3` com `StatCard` |
| Cartão de seção | `bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4`; cabeçalho `flex flex-wrap items-center justify-between gap-2 mb-4` |
| Lista | `ul.divide-y.divide-outline-variant/60`, item `py-2 flex items-center justify-between text-sm gap-2` |
| Tabela | sempre `ResponsiveTable` (vira cartões no celular; nada de rolagem lateral) |
| Abas | `Tabs` (`equalOnMobile` quando ≤ 3 abas) |
| Formulário | `Field` + `inputCls`; `PrimaryButton` / `SecondaryButton` |
| Modal | `Modal` (`wide` para tabelas/detalhes), overlay `z-[80]` |
| Estados | `Loading`, `EmptyState` (ícone + texto + dica), `Notice` (erro/sucesso) |
| Valores | `centsToBRL`, `formatDateBR`, `monthRange`, `todayISO`, `downloadCSV` de `src/lib/gestaoUtils.js`; números com `tabular-nums` |
| Mobile | remover ícone órfão quando o título sai (memória); ações essenciais visíveis; testar 360px |

### 1.3 Menu, rótulos e navegação

Para cada tela nova, **todos** os pontos abaixo (senão a tela fica órfã ou vaza para a Coordenação):
1. `src/components/GestaoPortal.jsx`: `item(id, Icone, 'Rótulo')` no grupo certo (menu linhas ~287–376) e rota no roteamento (~384–529).
2. `src/lib/constants.js`: `SCREEN_LABELS` e, se o nome for longo, `SCREEN_LABELS_MOBILE`.
3. `src/lib/perfisGestao.js`: decidir se entra em `ABAS_GESTAO_PEDAGOGICA` (o teste `perfisGestao.test.js` exige a classificação).
4. `src/lib/modulosCatalogo.js`: chave em `features_enabled` (lida como `=== true`).
5. Central de Ajuda: entrada em `src/lib/ajuda/gestao.js` (e `professor.js`/`familia.js`/`admin.js` quando a tela existir lá).
6. Tour guiado e cards de atalho da Início: atalhos ordenados por `clickCounts`; submenu mostra os itens dele (memória).
7. Portais irmãos: Professor (`TeacherPortal.jsx`), Família (`FamilyPortal.jsx` + `FamilyBottomNav.jsx`), Recepção (`AdminPortal.jsx`, só com módulo liberado em Permissões).

### 1.4 Dados e segurança (fonte: migrations de 27/09 a 31/10)

- **Toda tabela nova:** `school_id uuid not null references public.schools(id) on delete cascade`, `created_at timestamptz default now()`, `created_by uuid references public.users(id) on delete set null`, índice `(school_id, <data principal>)`.
- **RLS ligada sempre.** Helpers existentes: `get_my_school_id()`, `get_my_role()`, `has_permission('x.y')`. Modelo:
  ```sql
  alter table public.<t> enable row level security;
  create policy "<descrição em português>" on public.<t> for select
    using (school_id = get_my_school_id() and (get_my_role() = 'gestao' or has_permission('<mod>.ver')));
  create policy "<descrição>" on public.<t> for all
    using (school_id = get_my_school_id() and (get_my_role() = 'gestao' or has_permission('<mod>.gerenciar')))
    with check (school_id = get_my_school_id() and (get_my_role() = 'gestao' or has_permission('<mod>.gerenciar')));
  ```
  Coordenação/Direção: `get_my_role() = 'gestao_pedagogica'`, **nunca** com acesso a valores financeiros. Família: só linhas dos próprios filhos (seguir as policies de `financial_charges`/`students` já existentes).
- **Permissões novas** (`<mod>.ver`, `<mod>.gerenciar`) entram em `src/hooks/usePermissions.js` e na tela `GestaoPermissoes.jsx`, para a Gestão liberar à Recepção/Professoras.
- **Migrations:** `supabase/migrations/AAAAMMDDHHMMSS_<nome_em_portugues>.sql`, idempotentes (`if not exists`, `drop policy if exists`), sem `drop`/`truncate` de dados, comentário de cabeçalho explicando o porquê.
- **Consultas:** colunas explícitas, nunca `select('*')`; sempre `.eq('school_id', schoolId)` além da RLS; agregação pesada vai para RPC SQL (menos egress).
- **Edge Functions** (modelo `supabase/functions/adjust-charge/index.ts`): `getCorsHeaders`, `auth.getUser(token)`, papel lido de `users` no servidor, `check_rate_limit`, **nunca confiar em `school_id` do client**, validação de entrada (UUID, inteiro em centavos, motivo ≥ 3), Asaas primeiro e Zela depois, `logEdgeError`, mensagens de erro em português. Deploy com `verify_jwt` (memória Supabase).
- **Cron** (modelo `send-financial-reminders`): `pg_cron` chamando a função, `log_cron_job_run`, marca de idempotência na linha (`*_sent_at`).
- **Storage:** bucket privado, caminho `<school_id>/<entidade>/<id>/arquivo`, URL assinada curta; nunca bucket público.
- **Auditoria:** ações financeiras e de dados sensíveis gravam no log de auditoria existente (`AdminAuditLog`).
- **Valores em centavos** (`*_cents integer`). Datas de negócio em `date`; eventos em `timestamptz` com fuso `-03:00` nas consultas.

### 1.5 Testes e validação

- Unidade (Vitest) para toda lógica pura em `src/lib/` (`*.test.js` ao lado do arquivo).
- Segurança/RLS no padrão `src/test/portalGestaoModulos.test.js` e `perfilGestaoPedagogica.test.js`: Gestão lê, Coordenação não lê valor, outra escola não lê nada, Família só o próprio filho.
- Rodar só o arquivo: `npx vitest run <arquivo>`; build filtrado só nos erros.
- Validação visual em 360px, 768px e 1280px antes de declarar concluído.

---

## 2. Ordem de execução e dependências

| # | Item | Prioridade | Tamanho | Depende de | Módulo/chave (nasce desligada) |
|---|---|---|---|---|---|
| 1 | Dashboards BI interativo | Média (antecipado) | G | — | `bi_dashboards` |
| 2 | Plano de aula | Baixa | M | — | `plano_aula` |
| 3 | DRE e fluxo de caixa projetado | Baixa | M | 1 (kit de gráficos), 9 ajuda mas não bloqueia | `financeiro_avancado` |
| 4 | Biblioteca | Baixa | M | — | `biblioteca` |
| 5 | Transporte escolar | Baixa | G | análise de segurança do check-out | `transporte` |
| 6 | Estoque | Baixa | M | — | `estoque` |
| 7 | Ocorrências completas | Média | M | — | `ocorrencias` |
| 8 | Avaliação institucional | Média | M | 1 (gráficos de resultado) | `avaliacao_institucional` |
| 9 | Conciliação bancária completa | Média | M | — | base (financeiro) |
| 10 | Negociação de dívida | Média | G | 14 pausa a régua durante acordo | base (financeiro) |
| 11 | Captação de alunos (CRM) | Média | G | 1 (funil) | `captacao` |
| 12 | Histórico escolar oficial | Alta | M | dados do Tradicional | `pedagogico_tradicional` |
| 13 | Gestão de bolsas | Alta | G | — | base (financeiro) |
| 14 | Régua de cobrança multicanal | Alta | G | 10 (acordo pausa régua) | base + `whatsapp` (adicional) |
| 15 | NFS-e | Alta | G | `PLANO_NFSE_ASAAS.md` | `nfse` |

Tamanho: P até 1 sessão, M 2 a 3 sessões, G 4 ou mais sessões.

---

## 3. Item 1 · Dashboards BI interativo

### 3.1 Objetivo
Um painel único, rápido e interativo, onde a Gestão (e a Coordenação, sem valores) cruza Financeiro, Matrículas, Frequência, Acadêmico e Operação por período, turma, turno e série, clica em qualquer gráfico para filtrar os demais e desce até a lista de alunos/cobranças que formam o número.

### 3.2 Onde fica
- Menu da Gestão, grupo **Relatórios**, primeiro item: `relatorios-painel` · rótulo **"Painel de indicadores"** (mobile: "Indicadores"). Ícone `LayoutDashboard`.
- Os 4 relatórios atuais (`GestaoRelatorios.jsx`) **continuam** (preservação). Depois do BI estável, decidir se viram abas do BI (D3).
- Card de atalho na Início segue a ordem por cliques.
- Coordenação/Direção (`gestao_pedagogica`): vê o painel **sem** a aba Financeiro e sem nenhum valor em R$ (entra em `ABAS_GESTAO_PEDAGOGICA`; o banco barra de verdade, ver 3.7).
- Recepção: não vê (pode virar permissão `bi.ver` no futuro).

### 3.3 Estrutura da tela

```
┌ PageShell actions: [Período ▾] [Comparar ▾] [Atualizar ⟳] [Exportar ▾] ┐
│ Barra de filtros (uma linha, rola na horizontal no celular):            │
│  Turma ▾  Turno ▾  Série ▾  Método ▾   chips ativos ✕   Limpar filtros  │
│ Tabs: Visão geral · Financeiro · Matrículas · Frequência · Acadêmico ·  │
│       Operação                                                           │
│ Grade de KPIs (grid-cols-2 lg:grid-cols-4 gap-3) com variação vs período│
│ Grade de gráficos (grid-cols-1 xl:grid-cols-2 gap-3), cada um em cartão │
│  com: título · legenda · [Tabela] [⤓] · gráfico · rodapé "fonte/regra"  │
└──────────────────────────────────────────────────────────────────────────┘
```

- Cada gráfico é um **cartão de seção** (1.2) com botão "Ver como tabela" (acessibilidade e exportação) e "Baixar" (CSV/XLSX daquele gráfico).
- Rodapé de cada cartão em `text-xs text-on-surface-variant`: regra do cálculo ("Recebido = cobranças pagas com vencimento no período").
- Atualização: carimbo "Atualizado às 14:32" + botão Atualizar; sem Realtime (custo e egress).

### 3.4 Interatividade (requisitos, todos obrigatórios)

| Recurso | Comportamento |
|---|---|
| Período | Este mês, Mês passado, Últimos 3 meses, Ano letivo atual (de `school_years` aberto), Últimos 12 meses, Personalizado (dois `input type=date`) |
| Comparação | Nenhuma, Período anterior, Mesmo período do ano passado. KPI mostra variação com seta e cor de status + texto ("12% acima") |
| Filtros globais | Turma (múltipla), Turno, Série (só Tradicional), Método. Ficam na URL de estado do componente e em `sessionStorage` por usuário |
| Filtro cruzado | Clicar numa barra/fatia/célula aplica filtro (vira chip). Clicar de novo remove. Todos os gráficos da aba respondem |
| Drill down | Clicar num KPI ou ponto abre `Modal wide` com a lista (ResponsiveTable) que forma o número, com link para a tela operacional (`setGestaoTab('financeiro-inadimplencia')` etc.) |
| Tooltip | Hover/toque: linha e área com crosshair + tooltip de todas as séries; barra/célula com tooltip do item. Alvo de clique maior que a marca |
| Legenda | Sempre que houver 2 ou mais séries; clicar na legenda oculta/mostra a série (cor não muda) |
| Tabela | "Ver como tabela" troca o gráfico por `ResponsiveTable` com os mesmos dados |
| Exportar | Por gráfico (CSV via `downloadCSV`) e da aba inteira (XLSX via `xlsx`, já instalado, uma planilha por gráfico). Impressão/PDF com `window.print()` e CSS de impressão (cartões quebram página inteiros) |
| Teclado | Tabs, filtros e marcas navegáveis por Tab/setas; `aria-label` em cada gráfico; `role="img"` + tabela alternativa |
| Estado vazio | `EmptyState` por gráfico ("Sem dados no período. Mude o período ou os filtros.") |
| Carregamento | Esqueleto por cartão (não uma tela de loading única); cada RPC carrega independente |

### 3.5 Conteúdo por aba (KPIs e gráficos)

Forma do gráfico escolhida pelo trabalho do dado (magnitude → barras; tempo → linha/colunas; parte do todo com poucas partes → barra empilhada 100%, nunca pizza com mais de 4 fatias; distribuição → histograma; matriz → mapa de calor). **Nunca dois eixos Y.**

**Visão geral**
- KPIs: Alunos ativos · Ocupação (% das vagas) · Recebido no período* · Inadimplência %* · Frequência média % · Matrículas novas · Saídas/trancamentos.
- Gráficos: evolução de alunos ativos (linha, 12 meses); recebido x previsto* (colunas agrupadas); frequência média por turma (barras horizontais ordenadas).

**Financeiro*** (só `gestao`)
- KPIs: Previsto · Recebido · Taxa de recebimento % · Em atraso (R$ e nº) · Ticket médio · Despesas pagas · Resultado (recebido − despesas).
- Gráficos: previsto x recebido por mês (colunas agrupadas); inadimplência % por mês (linha); envelhecimento do atraso por faixa "1 a 15", "16 a 30", "31 a 60", "61 a 90", "mais de 90 dias" (barras, sequencial de uma cor); recebido por forma de pagamento (barras horizontais); despesas por categoria (barras horizontais, top 8 + "Outras"); resultado mensal (barras divergentes: positivo `success`, negativo `error`, com rótulo); maiores atrasos por família (tabela top 10 com drill).

**Matrículas**
- KPIs: Solicitações no período · Aprovadas · Contratos assinados · Vagas livres.
- Gráficos: funil Solicitada → Aprovada → Contrato assinado → Ativa (barras horizontais decrescentes com % de conversão entre etapas); ocupação por turma (barra de progresso por turma: ativos/capacidade, borda brass quando > 90%); entradas x saídas por mês (colunas agrupadas); alunos por turno e faixa etária (barras).

**Frequência**
- KPIs: Frequência média · Alunos abaixo de 75% (LDB) · Faltas no período · Atrasos de chegada (se houver regra de horário).
- Gráficos: frequência por turma (barras); mapa de calor turma × semana (sequencial, uma cor, legenda de escala); faltas por dia da semana (colunas); alunos com mais faltas (tabela com drill para o perfil do aluno).

**Acadêmico**
- Tradicional: média por disciplina (barras), distribuição de notas (histograma), % aprovação por série (barras), alunos abaixo da média por período (tabela).
- Montessori: relatórios publicados x pendentes por professora (barras empilhadas, 2 séries), mitigações por turma.
- A aba só mostra o bloco do método da escola (`features` + método).

**Operação**
- KPIs: Entradas · Saídas · Correções pedidas/aprovadas · Horas extras (nº)* (valor só para `gestao`).
- Gráficos: entradas e saídas por hora do dia (histograma, 2 séries); forma de identificação (facial, QR, PIN) por mês (barras empilhadas 100%); tempo da solicitação à confirmação no monitor (distribuição) **se** as colunas existirem (Fase 0 confirma).

`*` = valor financeiro: nunca para `gestao_pedagogica`.

### 3.6 Cores e marcas dos gráficos (validadas)

Paleta categórica (ordem fixa, nunca cíclica), validada com `validate_palette.js` em 28/10/2026 contra a superfície clara: **todas as 5 checagens PASS** (faixa de luminosidade, croma, separação para daltonismo ΔE ≥ 10.4, visão normal ΔE ≥ 17.8, contraste ≥ 3:1).

| Slot | Hex | Token proposto |
|---|---|---|
| 1 | `#0b84a8` | `--color-chart-1` (azul petróleo, parente do primary) |
| 2 | `#b5821c` | `--color-chart-2` (latão) |
| 3 | `#6b5fc7` | `--color-chart-3` (violeta) |
| 4 | `#c2558a` | `--color-chart-4` (magenta) |
| 5 | `#5e8f2e` | `--color-chart-5` (oliva) |

Regras:
- Mais de 5 séries: top 4 + "Outras" (cinza `outline`), ou gráficos pequenos lado a lado. Nunca gerar cor nova.
- A cor segue a entidade, não a posição: a turma "Maternal I" tem a mesma cor em todos os gráficos e não muda quando um filtro tira outras turmas (mapa `entidade → slot` calculado uma vez por sessão, ordenado por nome).
- **Sequencial** (magnitude, mapa de calor, envelhecimento): uma cor só, `primary` em 5 passos claros→escuros (`#e8f0f2`, `#a9c6cf`, `#5f97a7`, `#2b6b7c`, `#174450`). Validar a monotonicidade com o script antes de fechar.
- **Divergente** (resultado +/−): `success` e `error` com zero em cinza `outline-variant`.
- **Status** (`success`, `warning`, `error`) só para estado (pago, atrasado, cancelado) e sempre com ícone + rótulo. Contador/borda de alerta em brass.
- Textos, eixos e valores em `on-surface`/`on-surface-variant`, nunca na cor da série. Grade horizontal recessiva `outline-variant/60`, sem grade vertical.
- Marcas: barras finas com cantos de 4px só na ponta de dados, 2px de espaço entre barras/segmentos, linhas de 2px, marcadores ≥ 8px, rótulo direto só no último ponto/maior barra.
- Tokens entram em `src/index.css` dentro do `@theme` (`--color-chart-1..5`, `--color-seq-1..5`) para virar classes Tailwind (`bg-chart-1`, `fill-chart-1`).

### 3.7 Dados: RPCs de agregação (servidor)

Agregar no Postgres, não no navegador (hoje `GestaoRelatorios` baixa linhas e soma no client; para 12 meses e várias turmas isso gasta egress).

Arquivo: `supabase/migrations/<ts>_bi_painel_indicadores.sql`. Funções `language sql stable security invoker` (a RLS de cada tabela continua valendo) com `set search_path = public`, filtrando **também** `school_id = get_my_school_id()`:

| Função | Parâmetros | Retorno (jsonb) | Barreira extra |
|---|---|---|---|
| `bi_visao_geral(p_inicio date, p_fim date, p_turmas text[])` | | KPIs + séries mensais | valores R$ nulos se `get_my_role() <> 'gestao'` |
| `bi_financeiro(p_inicio, p_fim, p_turmas)` | | KPIs, mensal, envelhecimento, formas, categorias, top atrasos | `raise exception` se `get_my_role() <> 'gestao'` |
| `bi_matriculas(p_inicio, p_fim, p_turmas)` | | funil, ocupação, entradas/saídas | — |
| `bi_frequencia(p_inicio, p_fim, p_turmas)` | | por turma, turma×semana, dia da semana, top faltas | — |
| `bi_academico(p_inicio, p_fim, p_turmas)` | | conforme método | — |
| `bi_operacao(p_inicio, p_fim, p_turmas)` | | por hora, forma de identificação, correções | horas extras em R$ só `gestao` |
| `bi_detalhe(p_indicador text, p_inicio, p_fim, p_filtros jsonb, p_limite int default 200)` | | linhas do drill down | mesma regra por indicador; `p_limite` máx. 500 |

- `grant execute ... to authenticated`; `revoke ... from anon`.
- Índices a conferir/criar: `financial_charges(school_id, due_date)`, `financial_charges(school_id, status)`, `expenses(school_id, due_date)` (já existe), `class_attendance(school_id, date)`, `attendance_logs(school_id, event_time)`, `enrollments(school_id, created_at)`.
- Período máximo aceito: 24 meses (validação na função).

### 3.8 Frontend: arquivos

```
src/components/bi/
  GestaoPainelBI.jsx         tela (PageShell, Tabs, barra de filtros, abas lazy)
  BiFiltros.jsx              período, comparação, turma, turno, série, chips
  BiCartaoGrafico.jsx        cartão padrão: título, legenda, tabela/baixar, vazio, esqueleto
  BiKpi.jsx                  StatCard + variação vs período (seta + texto + cor de status)
  BiDrillModal.jsx           Modal wide + ResponsiveTable + link para a tela operacional
  charts/                    BarrasH, Colunas, Linha, Empilhada100, MapaCalor, Histograma, Funil, Divergente, Tooltip
  abas/                      VisaoGeral, Financeiro, Matriculas, Frequencia, Academico, Operacao
src/hooks/useBiQuery.js      chama a RPC, cache em memória por (função+filtros) 5 min, cancela requisição antiga
src/lib/bi/
  periodos.js                presets, período anterior, mesmo período ano anterior (fuso -03:00)
  coresEntidade.js           mapa entidade → slot fixo
  formatos.js                %, R$, variação ("12% acima")
  exportar.js                CSV por gráfico, XLSX da aba
  *.test.js                  testes de cada um
```

- A tela entra com `React.lazy` + `Suspense` (só baixa quando abre).
- **Biblioteca de gráficos (D1):** recomendação **Recharts 3** carregado só dentro do `lazy` do BI, embrulhado em `charts/` (o resto do app nunca importa Recharts direto; trocar depois custa só essa pasta). Alternativa: SVG próprio (zero dependência, mais tempo, mais risco de bug em tooltip/eixo).
- Os gráficos existentes em `GestaoVisaoFinanceira.jsx` e `GestaoRelatorios.jsx` **não** são migrados nesta fase.

### 3.9 Fases do item 1

| Fase | Entrega | Validação |
|---|---|---|
| 1.0 Inventário | Conferir colunas reais usadas por cada indicador (forma de pagamento em `financial_charges`, capacidade da turma, horário de confirmação no monitor, categoria de despesa). Lista do que não existe vira "fora do painel" | Lista no ZELA_STATUS |
| 1.1 Fundação | tokens de cor no `@theme`; `periodos.js`, `coresEntidade.js`, `formatos.js` + testes; decisão D1 aplicada; `BiCartaoGrafico`, `BiKpi`, `BiFiltros` | Vitest dos libs; tela vazia com filtros em 360/768/1280px |
| 1.2 Banco | migration das RPCs + índices + teste RLS (Gestão vê, Coordenação recebe exceção no financeiro e R$ nulos, outra escola vazio) | teste de segurança; migration informada, não aplicada |
| 1.3 Visão geral + Financeiro | abas, filtro cruzado, drill, exportação | teste manual com escola de dados reais em leitura |
| 1.4 Matrículas + Frequência | | idem |
| 1.5 Acadêmico + Operação | blocos por método | idem |
| 1.6 Acabamento | menu, rótulos, perfis, catálogo `bi_dashboards`, ajuda, tour, atalho, impressão | `perfisGestao.test.js`, `modulosCatalogo.test.js` |

**Critérios de aceite:** cada número do painel bate com a tela operacional correspondente no mesmo período; nenhuma requisição sem `school_id`; Coordenação não recebe nenhum valor em R$ (conferido na aba Rede do navegador); primeira aba carrega em menos de 2 s com 12 meses; nada vaza para fora do cartão em 360px.

**Fora de escopo:** painel montável pelo usuário (arrastar cartões), alertas automáticos por e-mail, comparação entre escolas (seria visão do Dev, nunca da escola).

---

## 4. Prioridade Baixa

### Item 2 · Plano de aula

**Para que serve:** a professora planeja as aulas da semana/quinzena; a Coordenação acompanha, aprova ou devolve com comentário.

- **Módulo:** `plano_aula` (catálogo, grupo `modulo`, métodos todos).
- **Banco:** `lesson_plans` (`school_id`, `teacher_id`, `turma` ou `class_id` do Tradicional, `subject_id` nulo no Montessori, `periodo_inicio date`, `periodo_fim date`, `objetivos text`, `conteudo text`, `metodologia text`, `recursos text`, `avaliacao text`, `habilidades_bncc text[]` opcional, `status` `rascunho|enviado|aprovado|devolvido`, `comentario_coordenacao text`, `revisado_por`, `revisado_em`), índice `(school_id, periodo_inicio)`. Anexos: bucket privado `lesson-plans/<school_id>/<plan_id>/`.
- **RLS:** professora lê/escreve os próprios e só edita em `rascunho|devolvido`; `gestao_pedagogica` e `gestao` leem todos da escola e só alteram `status`/`comentario` (trigger impede alterar o conteúdo da professora). Família não vê.
- **Telas:** Professor › "Planos de aula" (lista por semana, formulário em `Modal wide`, duplicar plano anterior). Gestão › Acadêmico › "Planos de aula" (fila "Para revisar" com contador brass, filtros por turma/professora/semana, aprovar/devolver).
- **Notificação:** push para a professora quando devolvido; para a Coordenação quando enviado (usar `notifyAdmins` com setor).
- **Testes:** RLS (professora A não vê plano da B), transição de status.
- **D:** BNCC entra agora ou depois (D4).

### Item 3 · DRE e fluxo de caixa projetado

**Para que serve:** DRE mostra se a escola teve lucro e onde o dinheiro foi; fluxo de caixa projetado mostra quanto vai ter em caixa nas próximas semanas.

- **Módulo:** `financeiro_avancado` (adicional). Só `gestao`.
- **Banco:** `expense_categories` (`school_id`, `nome`, `grupo_dre` `pessoal|ocupacao|material|administrativo|impostos|financeiro|outros`), migração não destrutiva que mapeia `expenses.category` (texto atual) para categorias. `school_cash_balances` (`school_id`, `data`, `saldo_cents`, `conta`, informado manualmente ou vindo da conciliação, item 9).
- **RPCs:** `fin_dre(p_inicio, p_fim, p_regime 'caixa'|'competencia')` → Receita bruta (mensalidades, avulsas, hora extra) → (−) descontos/bolsas → (−) taxas do gateway (D5: usar `net_value` do webhook Asaas se gravado) → Receita líquida → despesas por grupo → Resultado. `fin_fluxo_projetado(p_dias 30|60|90)` → saldo inicial + cobranças abertas por vencimento × taxa histórica de recebimento (últimos 6 meses, por faixa de atraso) − despesas a pagar.
- **Telas:** Financeiro › "DRE" (tabela em cascata com subtotais em negrito, colunas por mês, comparação, exportar XLSX) e "Fluxo de caixa" (linha do saldo projetado com faixa otimista/pessimista, tabela de entradas/saídas por semana, alerta brass quando o saldo projetado fica negativo). Reusa o kit do BI.
- **Testes:** cálculo com dados sintéticos (regime caixa x competência), RLS.

### Item 4 · Biblioteca

**Para que serve:** controlar acervo e empréstimos de livros para alunos e equipe, com devolução e atraso.

- **Módulo:** `biblioteca`.
- **Banco:** `library_items` (título, autor, editora, ISBN, categoria, faixa etária, capa no Storage privado), `library_copies` (`item_id`, código/tombo único por escola, estado, localização), `library_loans` (`copy_id`, `borrower_type` `aluno|funcionario`, `student_id`/`user_id`, `emprestado_em`, `devolver_ate`, `devolvido_em`, `registrado_por`). Constraint: um exemplar com no máximo um empréstimo aberto (índice único parcial `where devolvido_em is null`).
- **RLS:** `gestao` e permissão `biblioteca.gerenciar` (liberável à Recepção/Professora); família lê só os empréstimos dos filhos.
- **Telas:** Gestão › nova seção **Biblioteca** (Acervo, Empréstimos, Atrasados). Leitura de código por QR/código de barras usando o leitor já usado nas carteirinhas QR. Família › "Biblioteca" (livros com o filho e data de devolução).
- **Automação:** cron diário avisa a família 1 dia antes e no atraso (push).
- **Importação:** planilha XLSX do acervo (padrão `matriculaImportTemplate.js`).

### Item 5 · Transporte escolar

**Para que serve:** organizar rotas, veículos e quais alunos usam transporte, registrar embarque/desembarque e avisar a família.

- ⚠️ **Toca o fluxo de check-in/out e a segurança da criança:** análise de segurança obrigatória antes (quem pode retirar a criança; o motorista vira um tipo de autorizado com vínculo à rota).
- **Módulo:** `transporte`.
- **Banco:** `transport_vehicles` (placa, capacidade, motorista `user_id`, monitor), `transport_routes` (nome, turno, veículo, horários), `transport_route_students` (`route_id`, `student_id`, ponto, ida/volta, vigência), `transport_events` (`student_id`, `route_id`, `tipo` `embarque|desembarque_escola|embarque_escola|desembarque_casa`, `event_time`, `registrado_por`, geolocalização opcional D6).
- **Integração com check-in/out:** desembarque na escola gera a entrada do aluno pelo mesmo caminho seguro do Monitor (nunca um atalho que pule a confirmação da Recepção); saída para o transporte exige que o motorista esteja autorizado para aquele aluno.
- **Telas:** Gestão › Transporte (Rotas, Veículos, Alunos por rota, Ocorrências do dia). Perfil novo de motorista **ou** uso pelo portal da Recepção (D6). Família vê rota e eventos do dia (push no embarque/desembarque).
- **Testes:** RLS por papel, aluno sem autorização não sai com o transporte.

### Item 6 · Estoque

**Para que serve:** saber o que a escola tem de material (pedagógico, limpeza, cozinha, uniforme), registrar entrada/saída e avisar quando acaba.

- **Módulo:** `estoque`.
- **Banco:** `stock_items` (nome, categoria, unidade, `estoque_minimo`, custo médio em centavos), `stock_movements` (`item_id`, `tipo` `entrada|saida|ajuste`, quantidade, `custo_unit_cents`, `supplier_id` opcional, `expense_id` opcional, `motivo`, `registrado_por`). Saldo por view `stock_balances` (soma dos movimentos), nunca coluna editável.
- **Integração:** entrada pode gerar despesa em `expenses` (opcional, mesma tela); saída de uniforme/material vendido à família gera cobrança avulsa (`create-avulsa-charge`); cardápio pode consumir itens da cozinha (fase futura).
- **Telas:** Gestão › Estoque (Itens, Movimentações, "Abaixo do mínimo" com contador brass).
- **Permissões:** `estoque.ver`, `estoque.gerenciar`.

---

## 5. Prioridade Média

### Item 7 · Ocorrências completas

**Para que serve:** registrar ocorrências do aluno (comportamento, saúde, acidente, elogio), com gravidade, providências, ciência da família e histórico pesquisável. Hoje `GestaoOcorrencias.jsx` só consulta `pedagogical_records`, `diario_entries` e `class_attendance`.

- **Módulo:** `ocorrencias`.
- **Banco:** `student_incidents` (`student_id`, `tipo` `comportamento|saude|acidente|disciplinar|elogio|outro`, `gravidade` `leve|media|grave`, `descricao`, `providencias`, `visivel_familia boolean`, `exige_ciencia boolean`, `ciencia_em`, `ciencia_por`, `medida` opcional `advertencia|suspensao` com `medida_inicio/fim`, `registrado_por`), anexos em bucket privado. Histórico imutável: edição gera nova versão (`student_incident_versions`) ou só permite complemento (D7).
- **RLS:** professora cria para alunos das suas turmas e lê as que criou; `gestao_pedagogica` e `gestao` leem e gerenciam todas; família lê só `visivel_familia = true` dos filhos e só pode gravar a ciência (função `registrar_ciencia_ocorrencia(id)` security definer com checagem de vínculo).
- **Telas:** Professor › "Registrar ocorrência". Gestão › Acadêmico › Ocorrências vira linha do tempo unificada (fontes atuais + nova), com filtros de tipo/gravidade/turma e botão "Nova ocorrência". Família › notificação push + tela de ciência. Perfil do aluno ganha a aba "Ocorrências".
- **Saúde/acidente:** ligar à ficha médica (mostrar alergias ao registrar).
- **Testes:** família não lê ocorrência interna; ciência só pelo responsável do aluno.

### Item 8 · Avaliação institucional

**Para que serve:** pesquisas de satisfação para famílias e equipe (NPS, escala, múltipla escolha, texto), com resultado em gráfico.

- **Módulo:** `avaliacao_institucional`.
- **Banco:** `surveys` (título, público `familias|equipe|turmas`, `turmas text[]`, `anonima boolean`, `abre_em`, `fecha_em`, `status`), `survey_questions` (ordem, tipo `nps|escala5|multipla|texto`, opções, obrigatória), `survey_participation` (`survey_id`, `user_id`, `respondeu_em`, único), `survey_answers` (`survey_id`, `question_id`, valor, **sem `user_id` quando anônima**; ligação só por um `response_id` aleatório).
- **Privacidade:** resultado por segmento só aparece com 5 ou mais respostas; texto livre de pesquisa anônima nunca mostra autor; a gravação da resposta acontece por função security definer que grava participação e respostas separadas na mesma transação.
- **Telas:** Gestão › Comunicação › "Pesquisas" (criar, publicar, acompanhar taxa de resposta, resultados com o kit do BI, exportar). Família e Professor › cartão "Pesquisa aberta" na Início + push.
- **Testes:** resposta anônima não liga ao usuário; ninguém responde duas vezes; outra escola não vê.

### Item 9 · Conciliação bancária completa

**Para que serve:** bater todo o extrato com o sistema, entradas e saídas, para saber que o saldo é real.

- **Hoje:** `GestaoRecebimentos.jsx` importa OFX e concilia só créditos com cobranças (`gestaoUtils.parseOFXCredits`).
- **Banco:** `school_bank_accounts` (banco, agência, conta mascarada, apelido), `bank_statement_imports` (conta, arquivo, período, importado_por), `bank_statement_lines` (`import_id`, `fitid`, data, valor_cents com sinal, descrição, `status` `pendente|conciliada|ignorada`, `charge_id`/`expense_id`/`asaas_transfer` vinculados) com **único `(school_id, account_id, fitid)`** para importar o mesmo extrato duas vezes sem duplicar.
- **Lógica (`src/lib/conciliacao.js` + testes):** créditos → cobranças (como hoje) e repasses do Asaas (um crédito que soma várias cobranças líquidas de taxa); débitos → despesas abertas por valor, data ±3 dias e fornecedor; sem par → "Criar despesa a partir da linha".
- **Telas:** Financeiro › Recebimentos ganha aba "Extrato" com a lista de linhas, filtros por status e ações em lote; saldo conciliado alimenta `school_cash_balances` (item 3).
- **Segurança:** dar baixa continua passando pela Edge Function existente (Asaas avisado).

### Item 10 · Negociação de dívida

**Para que serve:** fazer acordo com a família inadimplente (desconto de juros/multa, parcelamento), gerar as novas cobranças e o termo assinado.

- ⚠️ Financeiro + Asaas + contrato: análise de segurança obrigatória.
- **Banco:** `debt_agreements` (`guardian_id`, `student_id`, `valor_original_cents`, `desconto_cents`, `valor_acordado_cents`, `parcelas`, `primeiro_vencimento`, `status` `rascunho|aguardando_assinatura|ativo|quitado|rompido|cancelado`, `contract_id`), `debt_agreement_charges` (cobranças originais renegociadas), `debt_agreement_installments` (`charge_id` novo, número, valor, vencimento).
- **Edge Function `create-debt-agreement`** (modelo `adjust-charge`): só `gestao`; valida que as cobranças são da escola e estão `OVERDUE`; cria as parcelas no Asaas (D8: parcelamento nativo do Asaas ou cobranças avulsas), cancela as originais no Asaas **só depois** do aceite, grava auditoria. `break-debt-agreement` para rompimento (regra D8).
- **Termo:** gerado a partir de um modelo de contrato (`GestaoContratos` com variáveis `{parcelas}`, `{valor_acordado}`), assinado pelo app da família; o acordo só vira `ativo` com a assinatura.
- **Telas:** Financeiro › Inadimplência ganha "Negociar" por família (simulador: escolher cobranças, desconto, nº de parcelas, ver parcelas) e aba "Acordos". Família › Financeiro mostra o acordo e as parcelas.
- **Régua (item 14):** acordo ativo pausa a régua das cobranças originais.

### Item 11 · Captação de alunos (CRM)

**Para que serve:** registrar interessados, agendar visitas, acompanhar a negociação e transformar em matrícula; lista de espera por turma.

- **Módulo:** `captacao`.
- **Banco:** `leads` (responsável, telefone, e-mail, nome e nascimento da criança, turma/ano desejado, origem `site|indicacao|instagram|google|visita|outro`, `etapa` `novo|contato|visita_agendada|visitou|proposta|matriculado|perdido`, `motivo_perda`, `responsavel_id` da equipe, `consentimento_em`), `lead_interactions` (tipo, nota, data), `lead_visits` (data/hora, status), `waitlist` (`lead_id` ou `student_id`, turma, posição, data).
- **Formulário público** "Quero conhecer a escola": novo caminho no padrão `PublicMatricula.jsx`, via Edge Function com `check_rate_limit` por IP, validação e consentimento LGPD; nunca insert anônimo direto na tabela.
- **LGPD:** lead perdido é apagado/anonimizado após 12 meses (D9), cron igual ao de retenção (`docs/LGPD_RETENCAO.md`).
- **Telas:** Gestão › nova seção **Captação** (Quadro em colunas por etapa com arrastar no computador e lista no celular; Agenda de visitas; Lista de espera; Relatório do funil com o kit do BI). "Converter em matrícula" pré-preenche a matrícula existente.
- **Integração BI:** aba Matrículas ganha o funil de captação.

---

## 6. Prioridade Alta

### Item 12 · Histórico escolar oficial

**Para que serve:** documento oficial com a vida escolar do aluno (séries, disciplinas, notas, carga horária, frequência, resultado), exigido em transferência.

- **Base existente:** `src/tradicional/lib/historico.js` (`montarHistorico` por ano), tabelas `trad_*`, ata do conselho, dados legais da escola (`20260930124817_dados_legais_escola.sql`).
- **Banco:** `student_external_history` (anos cursados em outras escolas: escola, cidade/UF, ano, série, disciplinas e notas, carga horária, resultado), `school_documents_issued` (`student_id`, `tipo` `historico|declaracao`, `numero` sequencial por escola, `codigo_verificacao` aleatório, `emitido_por`, `emitido_em`, `hash_conteudo`, `cancelado_em`).
- **Documento:** impressão no padrão `printContract.js`: cabeçalho com dados legais da escola (nome, CNPJ, ato de autorização, endereço), dados do aluno (nascimento, naturalidade, filiação, documento), tabela por ano, observações, local/data, assinaturas do Secretário e do Diretor, número e código de verificação.
- **Verificação pública (D10):** página `/verificar/<codigo>` que mostra só nome da escola, tipo, data e "válido/cancelado", via Edge Function com rate limit, **sem dados do aluno**.
- **Telas:** Gestão › Secretaria › "Histórico escolar" (buscar aluno, conferir pendências de dados com aviso brass, lançar anos externos, emitir, reemitir, cancelar). Declarações de matrícula/escolaridade entram no mesmo emissor (D10).
- **Perfis:** `gestao` e `gestao_pedagogica` emitem; Recepção só com permissão.
- **Montessori:** sem notas; documento vira "Ficha de acompanhamento" com séries cursadas e frequência (D10).

### Item 13 · Gestão de bolsas

**Para que serve:** cadastrar tipos de bolsa/convênio, receber o pedido da família com documentos, analisar, conceder e aplicar o desconto automaticamente nas mensalidades.

- **Hoje:** `financial_guardian_conditions.bolsista` (100%, sem cobrança) e `financial_billing_discounts` (desconto da família), lidos em `CondicaoFinanceiraFamilia.jsx` e no servidor (`_shared/financialContract.ts`).
- **Banco:** `scholarship_types` (nome, `percentual` ou `valor_cents`, base `mensalidade`, `vagas`, critérios, `vigencia`, cumulativa sim/não), `scholarship_applications` (família, aluno, tipo, renda declarada, nº de pessoas, justificativa, documentos no bucket privado `scholarships/<school_id>/<application_id>/`, `status` `enviada|em_analise|aprovada|negada|cancelada`, parecer), `scholarship_grants` (aluno, tipo, percentual efetivo, início, fim, `application_id`).
- **Regra de cálculo (servidor, única fonte):** `financialContract.ts` passa a somar `scholarship_grants` vigentes ao desconto da família; limite de desconto total configurável (D11); `bolsista = true` continua valendo como 100% (preservação, sem migrar dados).
- **Reajuste e renovação:** reajuste em massa (`readjust-contracts`) respeita a bolsa; renovação anual com aviso brass 30 dias antes do fim.
- **Dados sensíveis (LGPD):** renda e documentos só para `gestao` e permissão `bolsas.analisar`; retenção definida (D11); nada disso na Coordenação.
- **Telas:** Gestão › Financeiro › "Bolsas" (Tipos, Pedidos com fila e contador brass, Concedidas, Vagas). Família › Financeiro › "Pedir bolsa" (formulário + upload + acompanhamento).
- **Testes:** cálculo com bolsa + desconto + limite; família só vê o próprio pedido; Coordenação não lê.

### Item 14 · Régua de cobrança multicanal

**Para que serve:** enviar lembretes automáticos antes e depois do vencimento por push, e-mail e WhatsApp, para reduzir inadimplência.

- **Hoje:** `send-financial-reminders` (push, N dias antes, `reminder_sent_at`), e-mail via `_shared/resend.ts` (já usado em convites).
- **Decisão D12 (canal WhatsApp):** (a) notificações nativas do Asaas por cliente (e-mail/SMS/WhatsApp, custo por envio no Asaas, quase sem código); (b) WhatsApp Cloud API oficial da Meta (modelos aprovados, número da escola); (c) provedor não oficial: **não recomendado** (risco de bloqueio e LGPD).
- **Banco:** `billing_rules` (escola, ativa, passos `jsonb`: `[{dias: -3, canais: ['push','email']}, {dias: 0, ...}, {dias: 3, ...}, {dias: 10, ...}]`, horário permitido 8h a 20h), `billing_message_templates` (canal, passo, texto com `{responsavel}`, `{aluno}`, `{valor}`, `{vencimento}`, `{link_pagamento}`), `billing_dispatches` (`charge_id`, passo, canal, `status`, `enviado_em`, erro) com **único `(charge_id, passo, canal)`** para nunca mandar duas vezes.
- **Função cron `run-billing-rules`** (substitui de forma gradual o `send-financial-reminders`, que segue funcionando até a régua estar ligada): para cada escola com régua ativa, cobranças abertas no passo do dia, **exceto** pagas, canceladas, em acordo ativo (item 10) ou de família com opt out do canal; respeita o horário; registra em `billing_dispatches`; `log_cron_job_run`.
- **Parada imediata:** webhook de pagamento já atualiza o status; a régua consulta o status no momento do envio.
- **Telas:** Gestão › Configurações › Financeiro › aba "Régua de cobrança" (linha do tempo dos passos, editor de modelos com prévia, envio de teste para o próprio usuário); Financeiro › Cobranças mostra "lembretes enviados" por cobrança. Família › Configurações: preferências de canal.
- **Textos:** sem hífen, tom cordial, nunca expor valor a quem não é responsável financeiro.

### Item 15 · NFS-e

**Já planejado em `docs/PLANO_NFSE_ASAAS.md`** (fases 0 a 7, perguntas 3.2 a 3.8 abertas). Não duplicar aqui. Pontos de encaixe com este plano:
- Módulo `nfse` no catálogo (já citado como "no futuro, nota fiscal" em `modulosCatalogo.js:33`).
- Coluna/indicador "notas emitidas x pendentes x com erro" entra na aba Financeiro do BI (item 1) quando o item 15 for feito.
- Bolsas (13) e acordos (10) mudam o valor da nota: a nota sai do valor efetivamente cobrado.

---

## 7. Decisões pendentes (responder antes do item correspondente)

| # | Item | Pergunta | Recomendação |
|---|---|---|---|
| D1 | 1 | Biblioteca de gráficos: Recharts 3 (lazy) ou SVG próprio? | Recharts 3 embrulhado em `bi/charts/` |
| D2 | 1 | BI é adicional pago (`bi_dashboards`) ou entra no pacote Completo/Premium? Preço em `planPricing`? | Adicional, incluso no Premium |
| D3 | 1 | Depois do BI, os 4 relatórios atuais viram abas do BI ou ficam? | Manter até o BI cobrir 100% deles; só então decidir |
| D4 | 2 | Plano de aula com habilidades BNCC já na primeira versão? | Campo opcional de texto agora; catálogo BNCC depois |
| D5 | 3 | Taxas do Asaas: o `net_value` do webhook é gravado hoje? | Conferir na Fase 1.0 do item 1 |
| D6 | 5 | Motorista tem login próprio (perfil novo) ou o registro é feito pela Recepção? Geolocalização? | Recepção registra na v1; sem GPS |
| D7 | 7 | Ocorrência pode ser editada ou só complementada? | Só complemento (histórico íntegro) |
| D8 | 10 | Parcelamento: parcelamento nativo do Asaas ou avulsas? Regra de rompimento (quantos dias de atraso)? | Avulsas ligadas ao acordo; rompe com 30 dias de atraso de uma parcela |
| D9 | 11 | Retenção de lead perdido? | 12 meses |
| D10 | 12 | Verificação pública do documento? Declarações no mesmo emissor? Ficha para Montessori? | Sim aos três |
| D11 | 13 | Limite de desconto total? Retenção dos documentos de renda? | Limite configurável (padrão 100%); documentos apagados 12 meses após o fim da bolsa |
| D12 | 14 | Canal de WhatsApp | Começar com notificações nativas do Asaas; avaliar a Meta depois |

---

## 8. Checklist padrão de entrega de cada fase

- [ ] Decisões do item respondidas (seção 7)
- [ ] Análise de segurança escrita (RLS, papéis, Storage, Edge) quando houver banco/backend
- [ ] Migration idempotente, sem destruição, com índices; **informada, não aplicada** sem pedido
- [ ] Policies testadas: Gestão, Coordenação, Recepção, Professora, Família, outra escola
- [ ] Chave no `modulosCatalogo.js` (desligada) + teste
- [ ] `GestaoPortal.jsx` menu + rota, `SCREEN_LABELS`(+ mobile), `perfisGestao.js` + teste
- [ ] Permissões em `usePermissions.js` e `GestaoPermissoes.jsx` (se liberável)
- [ ] Componentes só de `GestaoShared.jsx` + padrões da seção 1.2; sem hífen nos textos; alertas em brass
- [ ] Central de Ajuda, tour e atalho da Início
- [ ] Vitest do(s) arquivo(s) novo(s) passando; build sem erros
- [ ] Conferência visual em 360 / 768 / 1280px
- [ ] Item riscado neste plano, `ZELA_STATUS.md` atualizado, sugerir `/commit` ou `/finalizar`

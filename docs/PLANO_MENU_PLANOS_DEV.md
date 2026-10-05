# PLANO · Menu "Planos" no Portal do Desenvolvedor

Criado em 05/10/2026. Status: **aguardando OK** (nada implementado).
Fontes: `docs/TABELA_PRECOS_ZELA.xlsx`, `docs/SIMULACAO_PRECOS_ZELA.xlsx`, `src/lib/modulosCatalogo.js`, `src/components/DeveloperLayout.jsx`, `src/components/DeveloperModulos.jsx`, baseline `schools`.

## 1. Objetivo

Criar o menu **Planos** no Portal do Dev para cadastrar, editar e desativar as formas de contratação do Zela:

1. **Por aluno** (escolas com até 50 alunos ativos): preço por aluno × alunos, montado com o plano base e módulos avulsos.
2. **Pacote** (obrigatório acima de 50 alunos): Essencial, Completo, Premium (e outros que forem criados), nos ciclos **mensal, semestral, anual e bianual**.
3. **Implantação** com valor definido por plano (e opcionalmente por ciclo), com **desconto** aplicável na contratação de cada escola.

Fora do escopo: emitir cobrança para a escola (menu "Faturamento", hoje desativado), nota fiscal do Zela, app com a marca da escola (fica cadastrável como adicional, mas sem fluxo próprio).

## 2. O que já existe (não substituir)

| Item | Onde | Cuidado |
|---|---|---|
| Catálogo de módulos e chaves `features_enabled` | `src/lib/modulosCatalogo.js` (`ITENS`, `PACOTES`, `aplicarPacote`, `ligarItem`) | Módulo novo exige código (as chaves são lidas pelos portais). O menu Planos **escolhe** itens do catálogo, não cria módulos. |
| Tela de módulos por escola | `DeveloperModulos.jsx` (grava `schools.features_enabled`, histórico em `school_feature_changes`) | Continua sendo o "liga/desliga" manual. A contratação passa a usá-la como destino. |
| Coluna `schools.plan` (`basic`/`pro`) | `DeveloperPanel.jsx:524`, `AdminPortal.jsx:707` | Hoje controla o comportamento do totem (senha x opções). **Não reaproveitar** para o plano comercial. |
| Trigger que restringe `plan`, `features_enabled`, `limits` ao developer | baseline, linha ~1583 | Reaproveitar a mesma lógica de role nas novas tabelas. |
| Menu do Dev | `DeveloperLayout.jsx:19-24` | Entra o item `planos` entre "Gestão de Escolas" e "Faturamento". |
| `planos_de_mensalidade` (05/10) | migration `20261005004744` | É a mensalidade da **família para a escola**. Não confundir nem misturar com o plano **escola para o Zela**. |

## 3. Regras de negócio

R1. **Limite por aluno**: modalidade "Por aluno" só para escolas com **até 50 alunos ativos** (valor configurável, padrão 50). Acima disso, só Pacote.
R2. **Mensalidade** = maior valor entre (alunos × preço por aluno) e o mínimo mensal do plano (regra da aba Simulação).
R3. **Por aluno** = soma dos preços avulsos dos itens escolhidos (base sempre incluso). Itens de cobrança fixa (ex.: app com a marca) somam valor mensal fixo.
R4. **Pacote** = preço por aluno do pacote + mínimo mensal. Ciclos: mensal (1), semestral (6), anual (12), bianual (24 meses), cada um com desconto % próprio sobre a mensalidade (0 a 50%). Ciclo pode ser desligado por plano.
R5. **Implantação**: valor base por plano; opcionalmente sobrescrito por ciclo (ex.: anual com implantação menor). Faixa de referência da planilha: R$ 800 a R$ 1.500.
R6. **Desconto na implantação**: na contratação, em % ou R$, com motivo obrigatório, nunca deixando o valor negativo. Teto de desconto configurável (padrão 100%, ou seja, isenção permitida com motivo).
R7. **Desativar, nunca excluir**: plano, ciclo ou preço de módulo desativado some das novas contratações, mas as contratações existentes continuam intactas.
R8. **Snapshot**: a contratação grava cópia dos valores e itens do plano no momento. Editar um plano depois não altera contratos vigentes; só vale para novas contratações ou renovação.
R9. **Módulos seguem o plano**: ao ativar a contratação, `schools.features_enabled` recebe os itens do plano (base + itens), registrando em `school_feature_changes`. Chaves técnicas (grupo `tecnico`) nunca entram em plano.
R10. **Escola por aluno que passa de 50**: o sistema não muda nada sozinho; mostra alerta no menu Planos e na Gestão de Escolas para o Dev migrar para pacote.

## 4. Valores iniciais (seed, extraídos das planilhas)

Preços avulsos por aluno/mês: Plano base 6,90 · Pedagógico 3,50 · Rotina e família 2,50 · Chat 1,50 · Prova de vida 1,50 · Entrada por QR Code 1,00.

| Pacote | Itens além do base | R$/aluno/mês | Mínimo mensal | Custo estimado/aluno |
|---|---|---|---|---|
| Essencial | nenhum | 6,90 | 450 | 1,50 |
| Completo | Pedagógico, Rotina | 11,90 | 790 | 1,80 |
| Premium | + Chat, Prova de vida, QR | 15,90 | 990 | 2,20 |

Implantação (proposta, **confirmar**): Essencial 800 · Completo 1.150 · Premium 1.500 · Por aluno 800.
Descontos por ciclo (proposta, **confirmar**): mensal 0% · semestral 5% · anual 10% · bianual 15%.
App com a marca: setup 2.500 a 4.000 e mensal 300 a 600 (cadastrar como adicional fixo, desativado).

## 5. Banco de dados (1 migration, não destrutiva)

`supabase/migrations/<timestamp>_planos_zela.sql`

1. `zela_modulo_precos`: `item_id` (id do catálogo, PK), `tipo_cobranca` (`por_aluno` | `fixo_mensal`), `valor` numeric(12,2) ≥ 0, `custo_estimado`, `ativo`, `updated_at`, `updated_by`.
2. `zela_planos`: `id` uuid, `nome` (único entre ativos), `modalidade` (`por_aluno` | `pacote`), `itens` text[] (ids do catálogo, validados), `preco_por_aluno`, `minimo_mensal`, `alunos_min`, `alunos_max` (por_aluno: max ≤ limite), `implantacao_valor`, `ordem`, `ativo`, `descricao`, timestamps e autor.
3. `zela_plano_ciclos`: `plano_id`, `ciclo` (`MENSAL` | `SEMESTRAL` | `ANUAL` | `BIANUAL`), `meses` (1/6/12/24), `desconto_percent` (0 a 50), `implantacao_valor` (nulo = usa a do plano), `ativo`. Único (`plano_id`, `ciclo`). Plano `por_aluno` aceita só `MENSAL` (confirmar, item 10).
4. `zela_config_comercial` (linha única): `limite_alunos_por_aluno` (50), `desconto_implantacao_max_percent`.
5. `school_contratacoes` (com `school_id`): `plano_id`, `ciclo`, `alunos_contratados`, `snapshot` jsonb (plano, ciclo, preços dos itens), `valor_mensal`, `valor_ciclo`, `implantacao_base`, `implantacao_desconto_tipo` (`percent` | `valor`), `implantacao_desconto`, `implantacao_final`, `desconto_motivo`, `inicio`, `fim`, `status` (`rascunho` | `ativa` | `encerrada` | `cancelada`), autor. Índice único parcial: 1 contratação `ativa` por escola.
6. `zela_planos_historico`: trigger AFTER UPDATE em `zela_planos`, `zela_plano_ciclos`, `zela_modulo_precos` grava antes/depois e autor (rastreabilidade de preço).
7. **RPC `contratar_plano_escola`** (SECURITY DEFINER, `search_path` fixo): exige `get_my_role() = 'developer'`; conta alunos ativos da escola no servidor; aplica R1; recalcula todos os valores no servidor (o frontend só mostra prévia); valida desconto (R6); grava snapshot; encerra a contratação anterior; atualiza `features_enabled` (base + itens) gerando o histórico já existente.
8. **Sem DELETE**: nenhuma policy de delete; desativação por `ativo = false`. CHECKs em todos os valores monetários (≥ 0) e percentuais.

### RLS e segurança (análise obrigatória antes de aplicar)
- Tabelas de catálogo (`zela_*`) não têm `school_id` porque são do Zela, não de escola: SELECT/INSERT/UPDATE **só developer**. Nenhum outro role lê preço de custo ou de outros planos.
- `school_contratacoes`: developer lê e escreve tudo; INSERT/UPDATE direto bloqueado (só via RPC). Leitura pela Gestão principal **da própria escola** fica para fase futura (sem custo estimado na resposta).
- Sem Realtime nessas tabelas nesta fase (só o Dev usa; recarrega ao salvar).
- Sem credencial nova no frontend, sem Edge Function nova, sem Storage.

## 6. Lógica no frontend (pura, testável)

`src/lib/planosZela.js`
- `valorPorAluno(itens, precos)`; `mensalidade(plano, alunos, precos)` (R2, R3); `valorDoCiclo(mensal, ciclo)`; `implantacaoFinal(base, tipo, desconto, teto)`; `modalidadesPermitidas(alunos, limite)` (R1); `itensValidos(itens)` (só `modulo`/`adicional`, respeitando `requer`, ex.: bloqueio de prova de vida exige prova de vida).
- Arredondamento em centavos em todas as funções (mesma regra da RPC).

`src/lib/modulosCatalogo.js`: adicionar só `aplicarItens(features, itemIds)` (generaliza `aplicarPacote`). `PACOTES` fixo continua como fallback até a fase 4.

## 7. Telas (novo `src/components/DeveloperPlanos.jsx`, lazy no `DeveloperLayout`)

Abas internas:
1. **Planos**: cartões por plano (nome, modalidade, itens, R$/aluno, mínimo, implantação, ciclos ativos, nº de escolas usando). Ações: Novo, Editar, Duplicar, Desativar/Reativar. Editor com seleção de itens do catálogo (base fixo e marcado), preço sugerido = soma dos avulsos com o desconto implícito exibido (planilha: ~8%), ciclos com desconto e implantação própria.
2. **Preços dos módulos**: tabela editável dos itens vendáveis do catálogo (valor, tipo de cobrança, custo estimado, ativo). Itens `emBreve` aparecem desativados.
3. **Simulador**: replica as abas "Simulação" e "Sob medida": alunos → mensalidade, valor do ciclo e margem por plano; aviso quando a escola só pode pacote.
4. **Contratações**: lista de escolas com plano atual, ciclo, vencimento, alerta R10 e escolas sem contratação.

Contratar para uma escola (modal acessível também pela Gestão de Escolas): escola → alunos ativos (lido do banco) → modalidades permitidas → plano → ciclo → prévia (mensal, ciclo, implantação base, desconto em % ou R$, motivo, final) → confirmar com resumo dos módulos que serão ligados e desligados → chama a RPC.

Textos da UI sem hífen; padrões visuais `dev-*` do portal; mobile ok.

## 8. Testes

- `src/lib/planosZela.test.js`: mínimo mensal x alunos, soma avulsa, ciclos (1/6/12/24), desconto % e R$, teto, nunca negativo, limite 50 (49, 50, 51), itens técnicos rejeitados.
- `src/lib/modulosCatalogo.test.js`: `aplicarItens` mantém base ligado e regra "começa desativado".
- `src/test/planosZelaRls.test.js` (padrão de `mapaHabilidadesRls.test.js`): admin, family, teacher, financeiro e gestão **não** leem nem escrevem catálogo; RPC recusa não developer; RPC recusa por aluno com 51 alunos; contratação de uma escola não altera outra.
- Manual: criar, editar, desativar plano; contratar em escola de teste; conferir `features_enabled` e `school_feature_changes`.

## 9. Fases (cada uma em sessão própria)

1. Migration + seed + RPC + teste RLS (análise de segurança antes, aplicar só com OK).
2. `planosZela.js` + testes + aba Preços dos módulos + aba Planos (CRUD).
3. Simulador + fluxo Contratar + aba Contratações + alerta R10.
4. Opcional: `DeveloperModulos.jsx` passa a ler os pacotes do banco em vez de `PACOTES` fixo; leitura da contratação pela Gestão principal.
5. Atualizar `docs/ZELA_STATUS.md` e `docs/CHANGELOG.md`.

Arquivos: nova migration, `src/lib/planosZela.js` (+ teste), `src/lib/modulosCatalogo.js`, `src/components/DeveloperPlanos.jsx`, `src/components/DeveloperLayout.jsx`, `src/components/DeveloperPanel.jsx` (botão Contratar), `src/test/planosZelaRls.test.js`.

## 10. Decisões pendentes (preciso da resposta antes da fase 1)

1. Exatamente 50 alunos: ainda "por aluno" (até 50) ou já pacote (abaixo de 50 = até 49)?
2. Escola com até 50 alunos também pode escolher Pacote, ou só "por aluno"?
3. "Por aluno" tem ciclos (semestral, anual) ou é só mensal?
4. No pacote, a mensalidade usa alunos **contratados** (fixo no ciclo) ou alunos **ativos** recontados todo mês?
5. Valores de implantação por plano e descontos por ciclo da seção 4: confirmar ou informar.
6. Desconto máximo na implantação: permitir isenção total (100%) ou limitar?
7. A Gestão da escola deve ver o próprio plano contratado (fase 4) ou fica só no Dev?

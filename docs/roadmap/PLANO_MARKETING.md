# Plano: Perfil Marketing, Recepção só visualiza, troca admin → recepcao, fim do papel financeiro

Criado em 05/11/2026. Origem: demanda da Sense Kids (ZL001). A equipe de marketing cuida de eventos e agenda e precisa da lista atualizada de alunos para envios particulares e personalizações (lembranças, premiações).

Status (05/11/2026): **Fase A com código pronto e publicada no backend de produção** (migration 20261211120000 aplicada, create-admin-user e notify-families publicadas, módulo ligado na ZL001; frontend não publicado). Fases B, C e D seguem planejadas. Pendências 1 e 2 respondidas: SIM e SIM. Falta: testar no navegador, testar as policies de Storage (Storage local desligado), publicar o frontend.

---

## Decisões já tomadas

- **Opção escolhida:** papel novo `marketing`, fechado por padrão. Recepção e Coordenação/Direção foram descartadas para esse uso.
  - Recepção daria acesso a totem, check-in e autoatendimento.
  - Coordenação/Direção exporia ficha médica, documentos e histórico do aluno.
- **Lista de alunos:** nome do aluno, turma, turno, aniversário, idade, nome e telefone do responsável. Filtro por turma e turno, no estilo do menu Alunos atual.
- **Foto:** não entra. A ZL001 atende alunos de até 6 ou 7 anos e não coleta biometria deles; a foto existente é a do responsável.
- **Exportação:** Excel, PDF e CSV.
- **Chat interno:** não.
- **Mural de fotos:** sim. O marketing sobe fotos e escolhe a turma.
- **Recepção:** só visualiza comunicados, eventos, calendário e mural. Não cria, não edita, não envia.
- **Papel `financeiro`:** não existe no produto. Quem paga o Zela e vê boletos, notas fiscais, contratos e horas extras é a **Gestão**.
- **Nome `admin`:** será liberado para outra funcionalidade. A Recepção passa a se chamar `recepcao` também no código.

## O que existe hoje (verificado no código em 05/11/2026)

**Quem publica comunicados, eventos e mural**

| Papel | Pode publicar? | Onde está |
|---|---|---|
| Gestão (`gestao`) | Sim: tabelas e buckets `comunicados-anexos` e `mural-fotos` | `supabase/migrations/20260927215026_gestao_acesso_telas_reaproveitadas.sql:17-46` |
| Coordenação/Direção (`gestao_pedagogica`) | Sim: tabelas e Storage | `supabase/migrations/20260929195618_perfil_gestao_pedagogica.sql:147-165, 212-217` |
| Recepção (`admin`) | Sim, pelas policies "Admins gerenciam…" | `supabase/migrations/20260927170000_baseline_producao.sql:4885, 4899, 4903` |

**Disparo para as famílias**

A Edge Function `notify-families` aceita apenas `admin`, `gestao` e `gestao_pedagogica` (`supabase/functions/notify-families/index.ts:40`).

**Bibliotecas de exportação**

`xlsx` 0.18.5 e `jspdf` 4.2.1 já estão no `package.json`. A `xlsx` 0.18.5 tem falhas conhecidas na **leitura** de arquivos; aqui ela só gera arquivos.

**Resíduos do papel `financeiro`**

| Arquivo | Linha |
|---|---|
| `src/components/AdminUserRegistration.jsx` | 1429 |
| `src/components/GestaoBiblioteca.jsx` | 56 |
| `supabase/migrations/20261110120000_biblioteca.sql` | 240 |
| `src/test/planosZelaRls.test.js` | 60, 97, 172 |

Não confundir com a chave de módulo `financeiro` (`src/lib/modulosCatalogo.js`, `planos_zela`) nem com o grupo `financeiro` do DRE. Esses dois **ficam**.

**Tamanho da troca `admin` → `recepcao`**

| Onde | Ocorrências |
|---|---|
| `src` | 205 em 91 arquivos |
| Edge Functions | 19 em 9 arquivos |
| Baseline | ~156 checagens de papel |

Também altera `users.role` de usuários reais.

---

## Fase A. Perfil Marketing (implementar primeiro)

- [x] ~~**A1. Migration do papel `marketing`, fechado por padrão.**~~ ✅
  - Função `mkt_da_escola(p_school_id)`: `get_my_role() = 'marketing'` e a escola informada é a do usuário. Escola vazia nunca bate.
  - Policies aditivas com o nome começando por "Marketing": escrita em `eventos_calendario`, `comunicados` e `mural_fotos`.
  - Storage: buckets `comunicados-anexos` e `mural-fotos`, presos à pasta `school_id/`.
  - Nenhuma policy existente muda.
- [x] ~~**A2. RPC `marketing_lista_alunos()`.**~~ ✅
  - `security definer`, `school_id` do usuário logado, só alunos ativos.
  - Colunas explícitas: nome, turma, turno, nascimento, idade, nome e telefone do responsável.
  - O marketing **não** lê a tabela `students` direto.
- [x] ~~**A3. Módulo "Marketing" no catálogo.**~~ ✅
  - Nasce desligado e é ligado só na ZL001.
  - Policies e RPC exigem o módulo ligado. Ler a chave como `=== true`.
- [x] ~~**A4. Criação de acesso.**~~ ✅
  - `notify-families` passa a aceitar `marketing`.
  - A Edge Function de criação de contas e o atalho "Criar acesso de login" oferecem o papel Marketing (`src/components/AdminFuncionarios.jsx:19`, `CARGO_PARA_ACESSO`, `ACCESS_ROLE_LABEL`).
- [x] ~~**A5. Portal do Marketing com menu reduzido.**~~ ✅
  - Entram: Alunos (filtro por turma e turno), Calendário, Comunicados e Mural de fotos.
  - Ficam de fora: chat, financeiro, check-in, totem, ficha médica, documentos e configurações.
- [x] ~~**A6. Botão Exportar na lista de alunos.**~~ ✅
  - Abre um modal no centro da tela com a pergunta "Em qual formato você quer exportar?".
  - Três opções, nesta ordem: **Excel**, **PDF**, **CSV**.
  - O clique baixa o arquivo no formato escolhido, já com os filtros aplicados.
  - Cada exportação grava em `audit_logs` quem exportou, quando, o formato e a quantidade de alunos.
- [x] ~~**A7. Testes.**~~ ✅
  - Lista de regras aprovadas do perfil, no molde de `src/test/perfilGestaoPedagogica.test.js`.
  - Isolamento entre escolas.
  - Módulo desligado bloqueia.
  - Sem acesso a financeiro, ficha médica e documentos.
  - RPC devolve só as colunas aprovadas.
  - Modal de exportação.

## Fase B. Recepção só visualiza (logo depois da A)

- [x] **B1. Migration de leitura apenas.**
  - Troca as policies "Admins gerenciam comunicados/eventos/fotos do mural da escola" por policies só de leitura.
  - Vale para as tabelas e para os buckets `comunicados-anexos` e `mural-fotos`.
- [x] **B2. `notify-families` deixa de aceitar `admin`.**
- [x] **B3. Interface da Recepção.** Esconde os botões de criar, editar, excluir e enviar nas telas de comunicados, calendário e mural.
- [x] **B4. Testes.** A Recepção lê e não escreve; Gestão e Coordenação/Direção continuam publicando.

**Impacto:** contas da Recepção que publicam hoje perdem esse poder imediatamente. Gestão e Coordenação/Direção continuam publicando, então ninguém fica sem quem publique.

## Fase C. Troca `admin` → `recepcao` (só documento por enquanto)

Cada etapa sai em um PR separado.

- [x] ~~**C1. Banco, RLS, funções (`get_my_role` e dependentes) e Edge Functions passam a aceitar os dois valores.**~~ ✅ (05/11, só local: migration 20261211140000 + `_shared/papeis.ts`)
- [ ] **C2. Migration troca `users.role` de `admin` para `recepcao`.** Antes, backup da lista de usuários afetados e script de reversão. Revisar também os metadados do JWT, se o papel estiver lá.
- [ ] **C3. `src` e testes passam a usar só `recepcao`.** O rótulo na tela continua "Recepção".
- [ ] **C4. Remover `admin` de policies, funções e Edge Functions.** O nome fica livre para a nova funcionalidade.

Antes de começar: análise de segurança de todas as policies que citam `admin`, incluindo o check-in/out e o Monitor da Recepção.

## Fase D. Remover o papel `financeiro`

- [ ] **D1. Remover `financeiro` das listas de papel.** Arquivos: `AdminUserRegistration.jsx:1429` e `GestaoBiblioteca.jsx:56`.
- [ ] **D2. Migration nova que reescreve a função da biblioteca sem `financeiro`.** A migration `20261110120000_biblioteca.sql` não é editada.
- [ ] **D3. Ajustar `planosZelaRls.test.js`.**
- [ ] **D4. Conferir com SQL limitado que não existe usuário com `role = 'financeiro'`.** Exemplo: `select id, school_id from users where role = 'financeiro' limit 20`.

---

## Pendências de decisão (respondidas em 05/11: 1 SIM, 2 SIM, só calendário, comunicados e mural)

1. **"Demais informações" da Recepção:** cardápio e aulas especiais também viram só visualização na Fase B?
2. **O marketing também mexe em aulas especiais e cardápio, ou só calendário, comunicados e mural?** Recomendação: só os três.

## Regras para a execução

- Migrations e Edge Functions só no local. Produção só com pedido explícito.
- Nenhuma policy permissiva; tudo preso ao `school_id`.
- Riscar cada item concluído neste arquivo (`~~texto~~ ✅`).
- Atualizar `docs/ZELA_STATUS.md` ao fim de cada fase.

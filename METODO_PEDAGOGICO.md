# Flexibilidade de Método Pedagógico

## 1. O que é

Permite que cada escola configure seu método pedagógico (tradicional,
Montessori, ou personalizado) e sua própria lista de turmas/agrupamentos
— sem exigir o núcleo acadêmico completo (`academic_years`/`grades`/
`enrollments`, adiado como P3.2). É uma camada de configuração por
escola em cima do modelo de dados já existente.

## 2. Modelo de dados

Três colunas em `schools` (migration `20260901_add_pedagogical_method_config.sql`):

| Coluna | Tipo | Default | O que é |
|---|---|---|---|
| `pedagogical_method` | `text` | `'tradicional'` | `'tradicional' \| 'montessori' \| 'personalizado'` |
| `custom_config` | `jsonb` | `{}` | Overrides de terminologia — hoje só `terminology.class` (o nome que substitui "Turma") |
| `turmas` | `text[]` | `{}` | Lista de turmas/agrupamentos da escola. `{}` = "não configurado" |

Não existe uma tabela `pedagogical_methods` separada — os defaults por
método vivem no client (`src/lib/schoolConfig.js`,
`PEDAGOGICAL_METHOD_DEFAULTS`). Decisão deliberada: só 2 métodos
conhecidos hoje, uma tabela seria over-engineering nesse tamanho. Se um
3º método surgir com regras mais complexas, revisitar essa decisão.

## 3. Fallback (compatibilidade com escolas existentes)

Quando `schools.turmas` está vazio (`{}`), o client cai pra
`TURMAS` (`src/lib/constants.js`) — a lista fixa que existia antes desta
feature. Nenhuma escola precisa ser migrada manualmente: sem
configuração, tudo continua funcionando exatamente como antes.

O mesmo vale pra terminologia: sem `custom_config.terminology`, usa os
defaults do método (`Turma`/`Professor(a)` no tradicional,
`Agrupamento`/`Guia` no Montessori).

## 4. Edição — restrita ao developer

**Decisão explícita**: só `developer` edita `pedagogical_method`,
`custom_config` e `turmas`. Não é uma policy de RLS nova — é uma
**trigger** (`protect_school_pedagogical_columns`, mesmo padrão de
`protect_admin_privilege_columns` em `users`) que bloqueia essas 3
colunas especificamente quando quem está editando não é developer,
sem tocar nas policies de RLS existentes (que já permitem admin editar
outros campos da própria escola, como nome/telefone).

**Por quê**: `schools.turmas` alimenta segmentação de mural/comunicados
e terminologia vista pela escola inteira — um admin sem contexto técnico
mexendo nisso pode gerar inconsistência sem querer (ex.: remover uma
turma que um professor já tem atribuída via `users.turmas`).

**Achado relacionado, corrigido na mesma trigger**: a mesma ausência de
proteção existia em `schools.is_active`/`features_enabled`/`limits`/
`plan` — campos comerciais que controlam módulos contratados e status da
escola. Um admin comum conseguia se auto-reativar, auto-habilitar
módulos pagos e trocar o próprio plano. Corrigido estendendo a mesma
trigger (ver `RELATORIO_MESTRE_ESTADO_ATUAL_ZELA.md` seção 45 pro
histórico completo do achado).

## 5. Hook `useSchoolConfig`

`src/lib/schoolConfig.js`:

```js
const { method, terminology, turmas, loading } = useSchoolConfig(schoolId);
```

- `method`: `'tradicional' | 'montessori' | 'personalizado'`.
- `terminology`: objeto `{ teacher, student, class, subject }`, já com
  defaults do método + overrides de `custom_config` aplicados.
- `turmas`: array pronto pra usar (já resolvido: dado real da escola, ou
  fallback `TURMAS` se ainda não configurado).

**Onde já está aplicado** (componentes autenticados, `schoolId`
disponível via `currentUser`/`currentSchool`):
`AdminStudentList`, `AdminUserRegistration` (turmas do professor +
turma do aluno na criação), `AdminDiario`, `AdminMuralFotos`,
`AdminComunicados`, `AdminSubjects` (label "Matéria"/"Área de
Conhecimento" + seleção de turmas, ver seção 9).

**Onde NÃO se aplica diretamente — rota pública**: `SelfRegister.jsx`
(autocadastro, `/cadastro`, sem login) não pode usar `useSchoolConfig`
porque `schools` não tem (corretamente) nenhuma policy de leitura pra
`anon`. Usa a RPC `get_turmas_by_school_code` em vez disso (ver seção 6).

**Onde não precisou de mudança**: nenhum componente do lado família
(`FamilyMural`, `FamilyComunicados`, etc.) referencia a constante
`TURMAS` — a segmentação real (quem vê o quê) já é feita via overlap de
array na RLS contra o `turma` real de cada aluno, nunca contra a
constante, então já funcionava certo.

## 6. RPC `get_turmas_by_school_code` (rota pública)

Migration `20260901d_add_public_turmas_by_school_code_rpc.sql`.

```sql
get_turmas_by_school_code(p_school_code text) RETURNS text[]
```

Usada só por `SelfRegister.jsx`. **Nota de segurança**: devolve
**exclusivamente** o array de turmas — nunca nome, plano, config
comercial ou qualquer outro campo de `schools`. Concedida a `anon`
deliberadamente (é o mesmo propósito de `self-register-family`: alguém
digitando o código da escola antes de criar a própria conta). Case-
insensitive (`upper(trim(...))`, mesma normalização usada em
`self-register-family/index.ts`); código inexistente devolve `null`
sem vazar se "quase" bateu.

## 7. UI de configuração

`DeveloperPanel.jsx` — formulário de criar/editar escola. Campos:
método (dropdown), turmas (texto separado por vírgula → array), e
label customizado de "Turma" quando o método é "personalizado". Estado
da UI (`pedagogicalMethod`, `turmasInput`, `customClassLabel`) fica
deliberadamente separado de `formData` — nunca é espalhado direto num
insert/update (evita mandar campos que não existem na tabela).

## 9. Matérias/Disciplinas (`subjects` / `class_subjects`)

Migration `20260901e_add_subjects_module.sql`. Primeiro módulo do
núcleo acadêmico (P3.2, destravado em 2026-09-01 — decisão de
adiamento revogada pelo usuário, ver `RELATORIO_MESTRE_ESTADO_ATUAL_ZELA.md`
seções 47-48).

| Tabela | O que é |
|---|---|
| `subjects` | Matérias/áreas de conhecimento da escola (`name`, `description`, `color`) |
| `class_subjects` | Associação matéria × turma — `subject_id` + `class_name` (texto, não FK — ver dívida técnica abaixo) |

- **Contratação por módulo**: `features_enabled.materias`, mesmo padrão
  de financeiro/diário — developer habilita por escola no
  `DeveloperPanel`.
- **RLS**: admin gerencia (CRUD completo) as da própria escola;
  professor ativo só lê as das turmas que leciona (`get_my_turmas()`);
  família sem acesso a nenhuma das duas tabelas.
- **Terminologia**: usa `terminology.subject` e `terminology.class` do
  `useSchoolConfig` em todos os textos do `AdminSubjects.jsx` (título,
  descrição, placeholder, labels) — uma escola Montessori vê "Áreas de
  Conhecimento" em vez de "Matérias" automaticamente, sem configuração
  extra além do `pedagogical_method` já definido.

### Dívida técnica — `class_name` texto em 3 tabelas, não FK

`schools.turmas` ainda é `text[]`, não uma tabela normalizada. Toda
tabela do núcleo acadêmico criada até agora associa por **nome da
turma** (`class_name text`), não por um `class_id` de verdade:

| Tabela | Coluna |
|---|---|
| `class_subjects` | `class_name` |
| `class_attendance` | `class_name` |
| `users` (professor) | `turmas text[]` (já existia antes desta feature) |

Funcional e simples pra agora, mas frágil: se o developer renomear/
remover uma turma no `DeveloperPanel` depois que matérias/frequência já
foram associadas a ela, a associação antiga fica "órfã" silenciosamente
(não há constraint pra impedir isso, já que `class_name` não referencia
`schools.turmas` de nenhum jeito verificável em SQL).

**A dívida cresce a cada tabela nova que depender de turma** (a próxima
seria `pedagogical_records` — já tem `student_id`, que resolve `turma`
indiretamente via `students.turma`, então não soma à lista acima; mas
qualquer feature que grave `class_name` direto, tipo planejamento de
aulas, entraria na mesma lista).

**Quando `schools.turmas` for normalizada** (uma tabela `classes` de
verdade — trilha B do roadmap, ainda não decidida), migrar as 3 colunas
acima → `class_id uuid REFERENCES classes(id)`. Até lá, essa é uma
limitação aceita conscientemente — **não deve ser adiada indefinidamente
se boletim/rematrícula/planejamento de aulas entrarem em pauta**, porque
essas dependem de turma como entidade de verdade (ex.: rematrícula pra
turma do próximo ano letivo não faz sentido com `text[]`).

## 11. Frequência formal (`class_attendance`) e vínculo Diário × Matéria

Migration `20260901f_add_attendance_and_subject_link.sql` (trilha A do
núcleo acadêmico).

**Decisão de escopo**: a proposta original pedia uma tabela `assessments`
(avaliações) separada, com nota numérica no tradicional e registro
descritivo no Montessori. Não foi criada — `pedagogical_records` (Diário
Pedagógico) já é essa peça (`content jsonb`, `record_type` extensível,
RLS madura). Criar uma tabela paralela duplicaria funcionalidade. Além
disso, `schools.turmas` das escolas reais hoje é educação infantil
(Nido/Kids I/Kids II) — a LDB não prevê nota numérica pra essa faixa
etária, só avaliação descritiva, que é exatamente o que já existe. Em
vez disso: **`pedagogical_records.subject_id`** (nullable, `ON DELETE
SET NULL` — apagar uma matéria nunca apaga histórico pedagógico real,
só desvincula) foi adicionado, permitindo (opcionalmente) ligar uma
observação a uma matéria/área específica. RLS de `pedagogical_records`
não mudou (a coluna nova não é referenciada em nenhuma policy) —
confirmado com/sem `subject_id` e com professor de outra turma bloqueado
mesmo passando `subject_id` (a restrição é sempre por `student_id` →
`students.turma`, nunca pela matéria).

**`class_attendance`** — frequência formal (chamada letiva), distinta do
check-in/out de segurança (Totem/Monitor, que já existia). Um registro
por aluno por dia (`UNIQUE(student_id, date)`), status `presente
| ausente | atrasado | justificado`. RLS mesmo padrão de
`pedagogical_records`: admin só lê; professor cria/lê/edita/apaga
(upsert por `(student_id, date)`) só os alunos das turmas que leciona,
e só os próprios registros (`recorded_by = auth.uid()`).

**Limitação conhecida**: se duas turmas diferentes tiverem professores
diferentes mas — por algum motivo — dois professores tentarem registrar
frequência do MESMO aluno no MESMO dia (co-docência, substituição), o
segundo só consegue se for o mesmo `recorded_by` do primeiro registro
(a RLS de UPDATE exige `recorded_by = auth.uid()`). Comportamento aceito
por ora — não é o caso comum (1 turma = 1-2 professores fixos), mas
documentado caso vire um problema real.

**Frontend**: `TeacherFrequencia.jsx` (professor marca presença por
turma/dia) e `AdminFrequencia.jsx` (admin acompanha, só leitura) — ambos
atrás do módulo "Módulo Pedagógico" (`features_enabled.relatorios_pedagogicos`,
mesmo gate que já existia pro `TeacherPortal` inteiro). Ambos usam
`terminology.class` (turma/agrupamento) em todos os textos. O rótulo
"Frequência" em si **não** é uma chave de `terminology` — é
propositalmente neutro entre métodos (não é como "Turma"/"Professor",
que têm nomes realmente diferentes no Montessori; "Frequência"/"Chamada"
não muda por método pedagógico, muda no máximo por preferência de
escola — fora de escopo por ora).

**Testado** (além do CRUD básico): RLS de `pedagogical_records`
confirmada intacta com a coluna nova — insere com `subject_id`, insere
sem (`null`), e professor de turma alheia bloqueado mesmo enviando um
`subject_id` válido (a restrição é sempre via `student_id` →
`students.turma`, nunca pela matéria).

## 13. Trilha B, Fase 1 — `classes` normalizada (2026-09-01)

Migration `20260901g_normalize_classes_phase1.sql`. **Escopo
deliberadamente reduzido**: a normalização completa (`students.turma`,
`users.turmas`, `mural_fotos.turmas`, `comunicados.turmas` + ~8
componentes de frontend) é um projeto grande, com risco real de
regressão em fluxos críticos — `students.turma` alimenta
`get_my_turmas()`/RLS de professor e o matching do reconhecimento
facial do Totem. Fase 1 resolve só a dívida que a própria sessão de
hoje introduziu (`class_subjects`, `class_attendance`), sem tocar em
nada pré-existente.

**Como funciona**: `classes` (`id`, `school_id`, `name`, `UNIQUE
(school_id, name)`) é alimentada **automaticamente** por uma trigger
(`resolve_class_id_from_name`, `SECURITY DEFINER`) em
`class_subjects`/`class_attendance` — toda vez que uma linha é gravada
com um `class_name`, a trigger resolve (ou cria, se for turma inédita)
a linha correspondente em `classes` e preenche `class_id`
automaticamente. **Nenhum componente de frontend precisou mudar** —
`AdminSubjects.jsx`/`TeacherFrequencia.jsx` continuam escrevendo só
`class_name`, exatamente como antes.

- **Backfill**: 15 turmas reais migradas (união de todo `class_name`/
  `turma` já usado em `students`, `users.turmas`, `class_subjects`,
  `class_attendance`, `mural_fotos.turmas`, `comunicados.turmas` — não
  só `schools.turmas`, que muitas escolas nunca chegaram a configurar
  explicitamente).
- **RLS**: só leitura, admin/professor da própria escola. Sem nenhuma
  policy de escrita — a única forma de popular `classes` é via a
  trigger (que roda como o dono da função/postgres, superuser, ignora
  RLS).
- **Testado ao vivo antes dos testes formais**: turma inédita cria
  `classes` automaticamente; a mesma turma usada em duas tabelas
  diferentes reaproveita o mesmo `class_id` sem duplicar. 4 testes
  automatizados formalizando isso + isolamento multi-tenant.

**O que a Fase 1 NÃO faz**: não adiciona `class_id` em `students`,
`users`, `mural_fotos` ou `comunicados`; não muda nenhuma tela pra
exibir/filtrar por `class_id` em vez de `class_name`. `classes` existe
como fundação de dados real, mas ainda não é consumida por nada além
do backfill automático. A decisão de estender a normalização pro resto
do sistema (Fase 2+) permanece em aberto.

## 15. Transferência de turma (`student_transfers`)

Migration `20260901h_add_student_transfer.sql`. Recorte inicial de
"rematrícula/transferência" — **decisão de escopo deliberada**:
"rematrícula" completa (renovação de matrícula pra um novo ano letivo)
exigiria a entidade `academic_years`, que não existe e não foi
decidida — maior que o núcleo acadêmico inteiro construído até agora.
O que **é** construído: mover um aluno de turma dentro da mesma escola
(progressão de idade, reorganização, correção), com trilha de
auditoria. **Não exige a normalização completa de turmas (Fase 2 da
trilha B)** — continua usando `students.turma` (texto), só com
histórico de mudança registrado.

- **RPC `transfer_student_class(p_student_id, p_new_turma, p_reason)`**
  — atualiza `students.turma` E grava o log em `student_transfers`
  numa operação atômica. `SECURITY DEFINER` (replica manualmente a
  checagem "admin da mesma escola do aluno", mesmo padrão de
  `delete_school_and_users`) porque `student_transfers` não tem policy
  de INSERT pra ninguém — só a RPC grava.
- **`student_transfers`**: `from_class_name`, `to_class_name`,
  `reason` (opcional), `transferred_by`, `transferred_at`. RLS: só
  leitura, admin da própria escola.
- **Frontend**: `AdminStudentList.jsx` ganhou 2 ações por aluno —
  "Transferir de turma" (modal com dropdown de `schoolTurmas` +
  motivo opcional) e "Histórico" (lista as transferências anteriores).
- **Testado ao vivo antes dos testes formais**: admin transfere com
  sucesso (log gravado com motivo); admin de outra escola, professor e
  família bloqueados; transferir pra mesma turma dá erro claro;
  histórico isolado por escola. 6 testes automatizados formalizando
  isso.

## 16.5. Granularidade de módulos: `features_enabled.frequencia` (2026-09-01)

Achado antes da fase de validação: `Matérias` já tinha flag própria
(`features_enabled.materias`), mas `Frequência` estava presa à flag do
Módulo Pedagógico inteiro (`relatorios_pedagogicos`) — uma escola não
conseguia habilitar Frequência sem habilitar Relatórios (Mitigação/Mapa
de Habilidades/Semestral) junto, nem o contrário. Pior: o
`TeacherPortal` inteiro (Início, Monitor, tudo) só renderizava se
`relatorios_pedagogicos` estivesse ativo — uma escola só-Frequência
via professor não conseguia acessar nada.

**Corrigido**: nova flag `features_enabled.frequencia`, independente.
`TeacherPortal` passa a renderizar se `relatorios_pedagogicos ||
frequencia` (qualquer um dos dois), com "Relatórios" e "Frequência"
cada um mostrado só com sua própria flag dentro do portal. No
`AdminPortal`, Matérias e Frequência já viviam dentro do grupo
"Acadêmico" existente (junto com Calendário/Mural/Cardápio/Diário/
Comunicados) — só precisou trocar a condição da Frequência de
`relatorios_pedagogicos` pra `frequencia`. `DeveloperPanel.jsx` ganhou
o checkbox correspondente.

**Testado ao vivo**: as 4 combinações de `{materias, frequencia}`
gravam corretamente em `features_enabled` (mesmo caminho de escrita do
`DeveloperPanel`, restrito a developer pela trigger de proteção). Não
há teste de renderização automatizado (o projeto não usa Testing
Library em nenhum componente) — a lógica é booleana direta, verificada
por leitura de código + lint/build limpos, mesmo padrão já usado pras
outras flags.

## 16.6. Gestão de turmas pela própria escola (2026-09-01)

Até aqui, `schools.turmas` só podia ser alterado pelo developer
(`DeveloperPanel.jsx`, trigger `protect_school_pedagogical_columns`),
deixando a escola dependente de suporte manual pra algo básico como
abrir uma turma nova.

**Implementado**: o admin PRINCIPAL da escola (`users.is_primary_admin
= true`) agora pode adicionar e remover turmas direto em Configurações
da Escola (`AdminSettings.jsx`, seção "Turmas"). Um admin comum
(não-principal), professor ou família continuam bloqueados. A trigger
`protect_school_pedagogical_columns` foi ajustada pra abrir exceção só
na coluna `turmas`, só pra esse caso; as demais colunas protegidas
(`pedagogical_method`, `custom_config`, `is_active`,
`features_enabled`, `limits`, `plan`) seguem exclusivas do developer,
sem nenhuma mudança.

A escrita não é um UPDATE direto: passa pela RPC
`update_school_turmas(p_turmas text[])`, que valida uso antes de
permitir remover (ou renomear, que pro sistema é indistinguível de
"removeu uma e adicionou outra") uma turma. Verifica referências em
`students.turma`, `users.turmas` (professor), `mural_fotos.turmas`,
`comunicados.turmas`, `class_subjects.class_name` e
`class_attendance.class_name`, todas escopadas pela escola do
chamador; se qualquer uma tiver a turma em uso, a operação inteira é
bloqueada com uma mensagem listando onde. Renomear uma turma em uso
tem sua própria RPC dedicada (`rename_school_turma`, ver 16.7)
justamente pra não exigir esse bloqueio.

**Testado ao vivo + 3 testes automatizados**
(`schoolTurmasManagement.test.js`): admin principal adiciona/remove
turma livre; admin comum, professor e família são bloqueados (achado
no caminho: a RLS de `schools` silenciosamente afeta 0 linhas pra
role sem policy de UPDATE, sem erro nenhum; a função precisou de uma
checagem explícita de permissão pra não devolver sucesso falso);
bloqueio de remoção nas 6 fontes de uso, uma por vez; isolamento
multi-tenant entre escolas diferentes.

## 16.7. Renomear turma com propagação (2026-09-01)

`update_school_turmas` (16.6) trata qualquer nome que "sumiu da lista"
como remoção e bloqueia se a turma estiver em uso, mesmo quando é só
um erro de digitação (ex.: "Kids I" -> "Kids l"). Isso travava o admin
sem saída pra um caso comum e sem gravidade nenhuma.

**Implementado**: nova RPC `rename_school_turma(p_old_name,
p_new_name)`, com botão de lápis em cada chip da seção "Turmas"
(`AdminSettings.jsx`), abrindo um modal com aviso explícito de que a
mudança se propaga pra todos os registros vinculados. Mesma
restrição de permissão de `update_school_turmas` (admin principal ou
developer), validada explicitamente dentro da função. Numa única
transação, troca o nome em `classes.name`, `students.turma`,
`users.turmas` (professor), `mural_fotos.turmas`, `comunicados.turmas`,
`class_subjects.class_name`, `class_attendance.class_name` e por
último `schools.turmas`. Bloqueia se o nome novo já existir (evita
duplicidade) ou se o nome antigo não existir na lista da escola.

**2 achados reais durante o teste ao vivo**:
- **Ordem de escrita em `classes` importa.** Essa tabela é alimentada
  automaticamente por uma trigger em `class_subjects`/
  `class_attendance` (`resolve_class_id_from_name`, ver 13) que roda em
  todo UPDATE de `class_name` e cria uma linha nova se não achar o nome
  já existente. Renomear `classes` só DEPOIS de atualizar
  `class_subjects`/`class_attendance` faria a trigger achar o nome novo
  inexistente ainda e criar uma linha duplicada: daí a renomeação de
  `classes` bateria de frente com ela (`UNIQUE (school_id, name)`) e a
  transação inteira falharia com um erro de banco cru. Corrigido
  renomeando `classes` PRIMEIRO: a trigger encontra a linha já
  renomeada e só reaproveita o id, sem inserir nada.
- **`class_attendance` não tem NENHUMA policy de UPDATE pra admin** (só
  leitura). Com a função em `SECURITY INVOKER` (padrão), a escrita
  nessa tabela específica afetava 0 linhas SILENCIOSAMENTE por RLS,
  mesma classe de bug do achado em 16.6, mas numa tabela sem nenhuma
  policy de escrita pra contornar com checagem de row-count. Corrigido
  tornando a função `SECURITY DEFINER`, seguro porque a checagem de
  permissão explícita (developer ou admin principal) roda ANTES de
  qualquer escrita, mesmo padrão já usado em
  `protect_school_pedagogical_columns`/`resolve_class_id_from_name`.

**Testado ao vivo + 2 testes automatizados**
(`schoolTurmaRename.test.js`): propagação conferida nas 8 tabelas
envolvidas (incluindo `classes.id` permanecendo o mesmo, provando que
não duplicou a linha); bloqueio de renomear pra nome já existente e de
renomear turma inexistente; admin comum/professor/família bloqueados
sem alterar nada; isolamento multi-tenant.

## 16.8. Imagem de login por escola (2026-09-01)

Antes disso, a imagem central da tela de login era só GLOBAL
(`system_settings.login_image_url`, editável só pelo developer em
`ConfiguracoesPanel.jsx`), a mesma pra qualquer escola.

**Implementado**: nova coluna `schools.login_image_url`, no mesmo grupo
de permissão de `turmas` (admin principal ou developer, mesma extensão
da trigger `protect_school_pedagogical_columns`). UI em
`AdminSettings.jsx` (seção "Imagem de Login"), mesmo padrão de upload
já usado em `logo_url`: base64 direto numa coluna text, sem Storage
(decisão deliberada de manter a mesma convenção já estabelecida pra
imagem de marca pequena e não sensível, em vez do bucket + signed URL
cogitado inicialmente).

Nova RPC pública `get_school_login_image(p_school_code)`, mesmo padrão
de `get_turmas_by_school_code`: `SECURITY DEFINER`, devolve só o texto
da imagem (nunca a linha inteira de `schools`), `null` se o código não
existir ou a escola não tiver imagem própria. `Login.jsx` ganhou um
campo opcional "Código da escola": ao perder o foco, busca a imagem
da escola e substitui a imagem global; sem código informado (ou escola
sem imagem própria), cai na global; sem nenhuma das duas, cai no
gradiente padrão (comportamento original, inalterado).

**Testado ao vivo + 2 testes automatizados**
(`schoolLoginImage.test.js`): admin principal grava, admin comum e
professor bloqueados (confirmado por linhas afetadas = 0, não só
ausência de erro: `class_attendance` no item 16.7 mostrou que "sem
erro" não é garantia de "sem escrita"; aqui a tabela é a mesma
`schools` de 16.6, que JÁ tem policy de UPDATE pra admin, então o
bloqueio real é 100% da trigger, não da RLS); RPC devolve a imagem
certa por código (com normalização de minúsculo/espaço), `null` pra
código inexistente e pra escola sem imagem própria (sem vazar a imagem
de outra escola).

## 17. O que ainda não existe

- Editor de terminologia granular (só os labels de "Turma", "Professor"
  e "Matéria" são customizáveis hoje; "Aluno" segue fixo por método,
  sem override).
- Migração de dados antigos: se uma escola já tinha `mural_fotos.turmas`/
  `comunicados.turmas` gravados com valores da constante global e depois
  configura turmas diferentes via `DeveloperPanel`, os itens antigos
  podem ficar "órfãos" (o array antigo não bate com nenhuma turma nova).
  **Comportamento aceitável nesta fase** — não há conversão automática;
  se acontecer na prática, o developer ajusta manualmente. Mesmo
  comportamento se aplica a `class_subjects` (ver seção 9).
- Normalização de `schools.turmas` numa tabela `classes` de verdade —
  eliminaria a dívida técnica da seção 9, mas é uma migração mais
  invasiva (toca `users.turmas`, `class_subjects.class_name`,
  `mural_fotos.turmas`, `comunicados.turmas`, `class_attendance.class_name`);
  não decidida ainda (trilha B, Fase 2+).
- Rematrícula formal (renovação de matrícula pra um novo ano letivo) —
  exige `academic_years` como entidade, ainda não decidido. Transferência
  de turma (seção 15) cobre a parte que já era possível construir sem
  isso.
- Boletim/histórico escolar consolidado, planejamento de aulas — ainda
  fora de escopo, não iniciados.

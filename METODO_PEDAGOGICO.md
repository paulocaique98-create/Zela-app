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

### Dívida técnica conhecida: `class_subjects.class_name` é texto, não FK

`schools.turmas` ainda é `text[]`, não uma tabela normalizada — então
`class_subjects` associa por **nome da turma** (`class_name text`), não
por um `class_id` de verdade. Funcional e simples pra agora, mas frágil:
se o developer renomear/remover uma turma no `DeveloperPanel` depois que
matérias já foram associadas a ela, a associação antiga fica "órfã"
silenciosamente (não há constraint pra impedir isso, já que
`class_name` não referencia `schools.turmas` de nenhum jeito
verificável em SQL).

**Quando `schools.turmas` for normalizada** (uma tabela `classes` de
verdade — trilha B do roadmap, ainda não decidida), migrar
`class_subjects.class_name` → `class_subjects.class_id uuid REFERENCES
classes(id)`. Até lá, essa é uma limitação aceita conscientemente.

## 10. O que ainda não existe

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
- Vínculo entre `pedagogical_records` (Diário) e `subjects` — próximo
  passo natural pra habilitar relatórios por área no Montessori, ainda
  não implementado.
- Normalização de `schools.turmas` numa tabela `classes` de verdade —
  eliminaria a dívida técnica da seção 9, mas é uma migração mais
  invasiva (toca `users.turmas`, `class_subjects.class_name`,
  `mural_fotos.turmas`, `comunicados.turmas`); não decidida ainda.
- Habilitar/desabilitar outros módulos acadêmicos por método (ex.: notas
  numéricas vs. registros descritivos) — depende de frequência/
  avaliações existirem primeiro.

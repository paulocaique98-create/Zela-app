# Flexibilidade de Método Pedagógico

# 🔴 PENDENTE

Esta parte guarda o que ainda não foi concluído. O histórico detalhado das
partes entregues (modelo de dados, `useSchoolConfig`, matérias,
frequência, `classes` Fase 1, transferência de turma, gestão e renomeação
de turmas, imagem de login) está no git: `git log -p -- docs/METODO_PEDAGOGICO.md`.

## 1. Normalização de turmas, Fase 2+ (não decidida)

Estado atual: a tabela `classes` existe e é alimentada por trigger
(`resolve_class_id_from_name`) a partir de `class_subjects` e
`class_attendance`. Nenhuma tela consome `class_id`.

Falta:
- Adicionar `class_id` em `students`, `users.turmas`, `mural_fotos.turmas`
  e `comunicados.turmas` e migrar os ~8 componentes de frontend.
- Risco alto: `students.turma` alimenta `get_my_turmas()`, a RLS de
  professor e o matching do reconhecimento facial do Totem. Exige análise
  de segurança antes.
- Não adiar se boletim, rematrícula ou planejamento de aulas entrarem em
  pauta, pois dependem de turma como entidade.

## 2. Rematrícula formal

Exige a entidade `academic_years`, ainda não decidida. Depende do item 1.

## 3. Boletim, histórico consolidado e planejamento de aulas

Não iniciados. Qualquer feature que grave `class_name` direto aumenta a
dívida do item 1.

## 4. Editor de terminologia granular

Só os rótulos de "Turma", "Professor" e "Matéria" são customizáveis.
"Aluno" segue fixo por método, sem override.

## 5. Limitações aceitas (revisitar só se virarem problema real)

- **Dados órfãos**: se uma escola trocar as turmas configuradas, itens
  antigos de `mural_fotos.turmas`, `comunicados.turmas` e
  `class_subjects` podem não bater com nenhuma turma nova. Não há
  conversão automática; o developer ajusta à mão.
- **Frequência em co-docência**: a RLS de UPDATE de `class_attendance`
  exige `recorded_by = auth.uid()`. Um segundo professor não consegue
  editar o registro do mesmo aluno no mesmo dia.
- **Terceiro método pedagógico**: os defaults ficam no client
  (`src/lib/schoolConfig.js`, `PEDAGOGICAL_METHOD_DEFAULTS`) com só 2
  métodos. Se surgir um terceiro com regras mais complexas, revisitar.

---

# ✅ CONCLUÍDO

- ~~**Modelo de dados do método pedagógico** por escola e `useSchoolConfig` com rótulos de "Turma", "Professor" e "Matéria" customizáveis.~~
- ~~**Matérias/disciplinas** (`subjects` e `class_subjects`).~~
- ~~**Frequência** formal (`class_attendance`), independente do Módulo Pedagógico.~~
- ~~**Tabela `classes` (Fase 1)**, alimentada por trigger (`resolve_class_id_from_name`).~~
- ~~**Transferência de turma.**~~
- ~~**Gestão de turmas pela própria escola e renomeação com propagação.**~~
- ~~**Imagem de login por escola.**~~

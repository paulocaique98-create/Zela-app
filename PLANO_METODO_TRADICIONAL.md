# Plano: Método Tradicional

Criado em 27/10/2026. Status: planejamento, nada implementado.

O Tradicional é um sistema pedagógico próprio, construído em paralelo ao
Montessori. Só liga quando a escola tem `pedagogical_method = 'tradicional'`
explícito e o módulo novo está ativado. Nada do Montessori é alterado.

## 1. Regras de isolamento (valem para todas as fases)

1. Tabelas novas com prefixo próprio (`trad_`). Proibido `ALTER` em
   `subjects`, `class_subjects`, `class_attendance`, `reports`,
   `report_*`, `mitigacao_*`, `pedagogical_records`: pertencem ao Montessori.
2. Código em `src/tradicional/` (componentes, lib, hooks). Nos portais, só
   linhas novas de menu condicionadas a
   `method === 'tradicional' && features_enabled.<chave> === true`.
   Nenhum componente Montessori é editado (Mitigação, Mapa de Habilidades,
   Frequência, Matérias, rótulos Guia/Agrupamento).
3. Módulo novo no catálogo (`src/lib/modulosCatalogo.js`): "Pedagógico
   Tradicional", chaves novas, nascem desligadas (ler como `=== true`).
   O módulo "Pedagógico" atual segue sendo o do Montessori.
4. Base compartilhada, sem mudança: cadastros, check-in (facial, QR,
   totem), financeiro, contratos, comunicados, calendário, chat,
   `school_years`, `enrollments`, ocorrências. O Tradicional só lê, salvo
   onde o plano disser.
5. Não regressão: testes atuais passam sem alteração; teste novo garante
   que escola Montessori vê exatamente os mesmos menus de hoje.
6. Migrations primeiro em homologação, com análise de RLS e `school_id`
   em toda tabela nova. Professor só vê suas turmas/disciplinas; família
   só vê o próprio filho.

## 2. O que uma escola tradicional precisa

| Bloco | Conteúdo |
|---|---|
| Estrutura | Segmentos (Infantil, Fund. I, Fund. II, Médio), séries/anos, turmas por série, turno e ano letivo |
| Currículo | Disciplinas, grade curricular por série com carga horária, professor por disciplina e turma |
| Horários | Quadro semanal de aulas por turma |
| Avaliação | Bimestre ou trimestre, provas e trabalhos com peso, nota 0 a 10, média, recuperação |
| Diário de classe | Aula dada com conteúdo, frequência por aula e disciplina, alerta de 75% (LDB art. 24) |
| Resultado | Conselho de classe, aprovado, reprovado, recuperação final, ata de resultados finais |
| Documentos | Boletim (família vê), histórico escolar, ficha individual |
| Rematrícula | Promoção para a série seguinte no novo ano letivo |
| Extras | Tarefas, BNCC por disciplina |

Educação Infantil: LDB art. 31 proíbe retenção e pede avaliação
descritiva. No Tradicional, o modo de avaliação é configurável por
segmento (parecer no Infantil, nota nos demais).

## 3. Fases

Cada fase é uma sessão própria (Sonnet), com branch, testes e PR.

**Fase 0: fundação e trava de segurança** (sem tabela nova)
- Conferir (só leitura) o `pedagogical_method` das escolas em produção.
  Hoje o fallback é `'tradicional'` em `src/lib/schoolConfig.js` (useSchoolConfig)
  e `src/components/DeveloperPanel.jsx` (carregar escola). Escola
  Montessori com campo vazio viraria Tradicional por engano: maior risco.
- Criar/Editar escola: método obrigatório e explícito.
- Registro do método Tradicional, entrada no catálogo de módulos, pasta
  `src/tradicional/`, painel do Dev mostra módulos conforme o método.

**Fase 1: estrutura acadêmica**
Segmentos, séries, turmas, disciplinas, grade curricular, atribuição de
professores, quadro de horários.

**Fase 2: avaliação**
Configuração de período, média e pesos; lançamento de notas pelo
professor; cálculo de médias.

**Fase 3: diário de classe**
Aulas dadas, frequência por disciplina, alertas de frequência.

**Fase 4: documentos**
Boletim, conselho de classe, resultado final, ata, histórico.

**Fase 5: rematrícula e extras**
Promoção de série, tarefas, BNCC.

## 4. Turmas (ponto mais delicado)

Check-in facial, `get_my_turmas()` e a RLS do professor dependem de
`students.turma` (texto) e `schools.turmas`. Recomendação: a turma
tradicional continua gravando o nome nesses campos (check-in e RLS
intactos) e a tabela nova guarda série, turno e ano letivo dela.

## 5. Decisões pendentes (responder antes da Fase 0)

1. Segmentos atendidos primeiro (Infantil, Fund. I, Fund. II, Médio)?
2. Nota 0 a 10 e bimestre fixos, ou configuráveis por escola desde o início?
3. Autorização para a consulta só de leitura do `pedagogical_method` em produção.
4. Escola tradicional esconde Mitigação e Mapa de Habilidades? (Não afeta Montessori.)

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

~~**Fase 0: fundação e trava de segurança** (sem tabela nova)~~ ✅ concluída em 27/10/2026 (commit f0ae846, PR #25)
- [ ] Conferir (só leitura) o `pedagogical_method` das escolas em produção.
  Hoje o fallback é `'tradicional'` em `src/lib/schoolConfig.js` (useSchoolConfig)
  e `src/components/DeveloperPanel.jsx` (carregar escola). Escola
  Montessori com campo vazio viraria Tradicional por engano: maior risco.
  (Risco tratado no código: o fallback agora é `null`. A consulta em produção não foi registrada, segue pendente.)
- ~~Criar/Editar escola: método obrigatório e explícito.~~ ✅
- ~~Registro do método Tradicional, entrada no catálogo de módulos, pasta
  `src/tradicional/`, painel do Dev mostra módulos conforme o método.~~ ✅

~~**Fase 1: estrutura acadêmica**~~ ✅ código pronto em 27/10/2026 (branch feat/metodo-tradicional-fase-1)
~~Segmentos, séries, turmas, disciplinas, grade curricular, atribuição de
professores, quadro de horários.~~ ✅ Primeiro segmento: Fundamental I.
Pendente: aplicar a migration `20261027120000_tradicional_fase1_estrutura.sql`
em homologação (depois produção) e testar com escola Tradicional.

~~**Fase 2: avaliação**~~ ✅ código pronto em 28/10/2026 (branch feat/metodo-tradicional-fase-2)
~~Configuração de período, média e pesos; lançamento de notas pelo
professor; cálculo de médias.~~ ✅ Bimestre (ou trimestre), média mínima 7,0
configurável, recuperação substitui a nota do período.
Pendente: aplicar a migration `20261028120000_tradicional_fase2_avaliacao.sql`
(depois da Fase 1) em homologação e produção e testar com escola Tradicional.
Fora desta fase: modo parecer do Infantil (só Fundamental I por ora) e leitura
da nota pela família (vem com o boletim, Fase 4).

~~**Fase 3: diário de classe**~~ ✅ código pronto em 29/10/2026 (branch feat/metodo-tradicional-fase-3)
~~Aulas dadas, frequência por disciplina, alertas de frequência.~~ ✅ Uma aula por
atribuição e data, com quantidade de aulas do dia; falta justificada conta como
ausência no percentual; alerta abaixo de 75% e atenção abaixo de 80%.
Pendente: aplicar a migration `20261029120000_tradicional_fase3_diario.sql`
(depois das Fases 1 e 2) em homologação e produção e testar com escola Tradicional.
Fora desta fase: leitura da frequência pela família (vem com o boletim, Fase 4).

**Fase 4: documentos**
Boletim, conselho de classe, resultado final, ata, histórico.
~~4A: boletim e resultado final~~ ✅ código pronto em 30/10/2026. Regra de situação
final personalizável por escola (frequência mínima, média mínima, recuperação final
opcional); só Coordenação e Direção fecham; a família lê o resultado fechado.
Pendente: aplicar a migration `20261030120000_tradicional_fase4a_resultado.sql`
(depois da Fase 3) em homologação e produção e testar com escola Tradicional.
~~4B: ata do conselho e histórico escolar~~ ✅ código pronto em 31/10/2026 (branch feat/metodo-tradicional-fase-4b). Ata com campos fixos (pauta, deliberações, encaminhamentos), uma por turma e período, só Coordenação e Direção. Histórico escolar sai dos resultados fechados (ano e turma gravados no fechamento); a família o vê na aba Boletim, com impressão.
Pendente: aplicar a migration `20261031120000_tradicional_fase4b_ata_historico.sql` (depois da 4A) em homologação e produção. Resultados fechados antes dela usam o ano de fechamento.

**Fase 5: rematrícula e extras**
Promoção de série, tarefas, BNCC.

## 4. Turmas (ponto mais delicado)

Check-in facial, `get_my_turmas()` e a RLS do professor dependem de
`students.turma` (texto) e `schools.turmas`. Recomendação: a turma
tradicional continua gravando o nome nesses campos (check-in e RLS
intactos) e a tabela nova guarda série, turno e ano letivo dela.

## 5. Decisões pendentes (responder antes da Fase 0)

~~1. Segmentos atendidos primeiro?~~ ✅ Fundamental I
~~2. Nota e bimestre fixos ou configuráveis?~~ ✅ Configuráveis por escola (Fase 2)
3. Autorização para a consulta só de leitura do `pedagogical_method` em produção.
~~4. Escola tradicional esconde Mitigação e Mapa de Habilidades? (Não afeta Montessori.)~~ ✅ aplicado na Fase 0

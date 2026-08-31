# Retenção e Expurgo de Dados Sensíveis (P2.5)

## 1. Dados sensíveis identificados

| Categoria | Onde vive | Sensibilidade |
|---|---|---|
| Biometria facial (descritor + foto) | `authorized_persons.face_descriptor`, `.face_descriptor_v2`, `.photo_url`, `.photo_storage_path` | **Alta** — dado biométrico, categoria especial pela LGPD (Art. 5º, II) |
| Ficha médica (restrições de saúde, medicamentos) | `fichas_medicas` | **Alta** — dado sensível de saúde (Art. 5º, II) |
| Documento (CPF/CNPJ) | `users.doc_number`, `funcionarios.doc_number` | Média |
| Documentos de matrícula (upload) | bucket `matriculas-docs` + `matricula_solicitacoes` | Média-Alta (pode conter RG/certidão) |
| Logs operacionais com `user_id` | `client_error_logs`, `edge_function_logs`, `cron_job_logs` | Baixa (não é dado do titular em si, mas referencia a pessoa) |

## 2. Prazos de retenção propostos

**Estes prazos são uma proposta técnica, não uma decisão jurídica —
precisam de confirmação da direção/jurídico da escola antes de virar
política oficial.** Baseados no princípio de minimização (LGPD Art. 6º,
III): manter só pelo tempo necessário à finalidade.

| Dado | Prazo proposto | Gatilho |
|---|---|---|
| Biometria facial de aluno/pessoa autorizada desligada | 90 dias após desligamento | **Bloqueador**: hoje não existe um campo de "aluno desligado" em `students` — alunos são apagados diretamente (hard delete, cascata via `delete_school_and_users` ou exclusão manual do aluno) em vez de passar por um estado "desligado" com data. Ou seja, a biometria já é removida junto quando o aluno é excluído — **não há resíduo órfão neste fluxo normal**. Só sobra resíduo em backups/tabelas legadas (ver seção 3). |
| Ficha médica (`fichas_medicas`) | Mesmo ciclo de vida do aluno — apagada junto automaticamente (confirmado: FK `student_id` com `ON DELETE CASCADE`) | — |
| Logs operacionais (`client_error_logs`, `edge_function_logs`, `cron_job_logs`) | 90 dias | Idade do registro |
| Documentos de matrícula de solicitação rejeitada | 180 dias após rejeição | `status='rejected'` + `updated_at` |

## 3. Achado concreto — tabelas legadas com dado morto

Duas tabelas identificadas nesta auditoria como resíduo de fases
anteriores, sem nenhum propósito ativo:

- **`_fase8_backup_photo_url`** (20 linhas) — backup manual feito durante
  a Fase 8, nunca referenciado por nenhum código. Contém `photo_url` e
  `photo_storage_path` — dado real (não vazio), já bloqueado por RLS
  desde a auditoria de segurança anterior, mas nunca decidido se apaga.
- **`medical_records`** (0 linhas) — tabela legada em inglês, nunca
  referenciada em `src/`, dado médico real vive em `fichas_medicas`
  (português, ativamente usada). Como está vazia, apagar é seguro (sem
  perda de dado nenhuma).

## 4. Mecanismo de expurgo

Não existe automação (fora do escopo mínimo do P2.5 — "pode ser manual
por enquanto"). O expurgo, quando decidido, é feito via migration
(`DROP TABLE` pras legadas confirmadas mortas, ou `DELETE ... WHERE
created_at < now() - interval '...'` pras políticas de prazo da seção
2) — sempre revisado manualmente antes de rodar, nunca um job agendado
que apaga dado sozinho sem supervisão.

## 5. Decisões (2026-08-31)

- [x] `medical_records` — **apagada** (migration
  `20260831j_drop_legacy_medical_records_table.sql`, aplicada). 0 linhas,
  sem código referenciando, sem perda de dado.
- [x] `_fase8_backup_photo_url` — **mantida por enquanto** (decisão
  explícita: é dado real, não schema vazio — segue bloqueada por RLS,
  sem risco de segurança ativo, só resíduo de minimização de dados a
  revisitar depois).
- [ ] Confirmar os prazos da seção 2 com quem decide sobre política de
  dados da escola.

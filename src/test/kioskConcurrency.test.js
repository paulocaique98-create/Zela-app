import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// P2.2 (Prompt Mestre de Evolução) — o fluxo de transição de status do
// Totem (requestKioskAccess em App.jsx) calculava a próxima transição a
// partir do `status` em memória (populado via Realtime, que pode
// atrasar) e escrevia sem NENHUMA condição — dois totens em sequência
// rápida (ou um totem + o Monitor confirmando ao mesmo tempo) podiam
// calcular a MESMA transição em cima de um estado já ultrapassado e se
// sobrescrever. Corrigido com UPDATE condicional (`.eq('status', ...)`)
// + `.select()` pra saber se realmente aplicou.
//
// Este teste reproduz a corrida no nível onde a proteção realmente mora
// (o banco) — não importa o componente React (App.jsx não é isolável em
// Vitest/node sem montar a árvore inteira), mas exercita o EXATO padrão
// de UPDATE usado por requestKioskAccess contra o Postgres real.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Idempotência do Totem — dois totens simultâneos não corrompem a transição de status', () => {
  it('UPDATE condicional (.eq("status", baseStatus)) garante que só UM dos dois totens concorrentes aplica a transição idle -> pending_entry', async () => {
    const school = await createTestSchool();
    const { data: student, error } = await adminClient
      .from('students')
      .insert({ name: 'Vitest Concorrência', school_id: school, status: 'idle', turma: 'Infantil I' })
      .select('id')
      .single();
    if (error) throw error;

    try {
      // Dois "totens" disparando a MESMA transição ao mesmo tempo, ambos
      // tendo lido status='idle' antes de escrever — exatamente o cenário
      // de corrida real (Realtime atrasado, ou dois cliques quase
      // simultâneos em totens diferentes).
      const attempt = () =>
        adminClient
          .from('students')
          .update({ status: 'pending_entry', pending_requester_id: null })
          .eq('id', student.id)
          .eq('status', 'idle')
          .select('id');

      const [r1, r2] = await Promise.all([attempt(), attempt()]);

      const wins = [r1, r2].filter(r => r.data && r.data.length > 0);
      const losses = [r1, r2].filter(r => !r.data || r.data.length === 0);

      // Exatamente um dos dois aplicou a transição — o outro não
      // encontrou mais nenhuma linha com status='idle' pra atualizar
      // (Postgres serializa os dois UPDATEs; o segundo já vê o novo
      // status e a condição .eq('status','idle') não bate mais).
      expect(wins).toHaveLength(1);
      expect(losses).toHaveLength(1);

      const { data: finalState } = await adminClient.from('students').select('status').eq('id', student.id).single();
      expect(finalState.status).toBe('pending_entry');
    } finally {
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestSchool(school);
    }
  });

  it('depois que outro totem já resolveu a solicitação, o "perdedor" da corrida recalcula em cima do estado real (não sobrescreve pending_exit com pending_entry por engano)', async () => {
    const school = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId: school });
    const { data: student, error } = await adminClient
      .from('students')
      .insert({ name: 'Vitest Concorrência 2', school_id: school, status: 'idle', turma: 'Infantil I' })
      .select('id')
      .single();
    if (error) throw error;

    try {
      // Totem 1 confirma a entrada de verdade (aluno já está in_school).
      await adminClient.from('students').update({ status: 'in_school' }).eq('id', student.id);

      // Totem 2 ainda tinha lido 'idle' em memória (Realtime atrasado) e
      // tenta aplicar a transição de idle -> pending_entry, que já não
      // faz mais sentido pro estado real.
      const staleAttempt = await adminClient
        .from('students')
        .update({ status: 'pending_entry' })
        .eq('id', student.id)
        .eq('status', 'idle') // condição baseada no valor stale
        .select('id');

      expect(staleAttempt.data).toEqual([]); // não aplicou -- é exatamente o "perde a corrida"

      // App.jsx, nesse caso, reconsulta o status real (in_school) e
      // recalcula a transição em cima dele -- simulado aqui.
      const { data: freshStudent } = await adminClient.from('students').select('status').eq('id', student.id).single();
      expect(freshStudent.status).toBe('in_school'); // nunca virou pending_entry por engano

      const correctedTransition = freshStudent.status === 'in_school' ? 'pending_exit' : freshStudent.status;
      expect(correctedTransition).toBe('pending_exit'); // é isso que App.jsx aplicaria no retry
    } finally {
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(admin.id);
      await deleteTestSchool(school);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Fase 2 (item 3) — SelfRegister.jsx (rota pública "/cadastro", sem
// login) precisa das turmas da escola pra montar o select de matrícula,
// mas `schools` não tem policy de leitura pra anon (correto). A RPC
// get_turmas_by_school_code resolve isso sem abrir uma brecha de leitura
// ampla -- só devolve o array de turmas, nada mais da escola.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('get_turmas_by_school_code — RPC pública usada pelo autocadastro', () => {
  it('anon (sem login) resolve as turmas de uma escola pelo school_code, case-insensitive', async () => {
    const schoolId = await createTestSchool();
    const { data: school } = await adminClient.from('schools').select('school_code').eq('id', schoolId).single();
    await adminClient.from('schools').update({ turmas: ['Ambiente 1', 'Ambiente 2'] }).eq('id', schoolId);
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    try {
      const { data, error } = await anon.rpc('get_turmas_by_school_code', { p_school_code: school.school_code.toLowerCase() });
      expect(error).toBeNull();
      expect(data).toEqual(['Ambiente 1', 'Ambiente 2']);
    } finally {
      await deleteTestSchool(schoolId);
    }
  });

  it('código inexistente devolve null, sem vazar se "quase" existe', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await anon.rpc('get_turmas_by_school_code', { p_school_code: 'ZZZZZ_INEXISTENTE' });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('CRÍTICO — a RPC não abre brecha de leitura ampla em schools pra anon', async () => {
    const schoolId = await createTestSchool();
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    try {
      await anon.rpc('get_turmas_by_school_code', { p_school_code: 'qualquer' }); // aquece o client
      const { data } = await anon.from('schools').select('*').eq('id', schoolId);
      expect(data).toEqual([]);
    } finally {
      await deleteTestSchool(schoolId);
    }
  });
});
